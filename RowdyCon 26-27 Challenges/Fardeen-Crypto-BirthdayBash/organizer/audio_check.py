"""Actual browser waveform, semantic cue, completion and keyboard-focus checks."""
import asyncio,json,re,sys,time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
URL=sys.argv[1] if len(sys.argv)>1 else 'http://host.docker.internal:18113'
INSTRUMENT='''(() => {
 window.cues=[];window.peaks={};window.audioVolumes=[];
 const nodes=new WeakMap(),original=HTMLMediaElement.prototype.play;
 HTMLMediaElement.prototype.play=function(){
   if(!nodes.has(this)){const context=new AudioContext();const source=context.createMediaElementSource(this);const analyser=context.createAnalyser();source.connect(analyser);analyser.connect(context.destination);nodes.set(this,{context,analyser});
     this.addEventListener('playing',()=>{window.cues.push(this.dataset.cue);window.audioVolumes.push({cue:this.dataset.cue,volume:this.volume});});
     setInterval(()=>{if(this.paused)return;const {analyser}=nodes.get(this),samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);const peak=Math.max(...samples.map(Math.abs));window.peaks[this.dataset.cue]=Math.max(window.peaks[this.dataset.cue]||0,peak)},10);
   }nodes.get(this).context.resume();return original.call(this);
 };
})()'''
async def eventually(page,expression,timeout=10):
    deadline=time.monotonic()+timeout
    while time.monotonic()<deadline:
        if await page.evaluate('() => ('+expression+')'): return
        await asyncio.sleep(.025)
    raise AssertionError('Timed out: '+expression)
async def ready(page):
    await page.goto(URL);await eventually(page, "document.querySelector('#saved-state').textContent==='Working copy saved'")
async def settle(page):
    await eventually(page, "document.querySelector('#game-audio').paused",timeout=10)
    await page.wait_for_timeout(180)
async def main():
    result={'checks':[],'human_listening':'not claimed','console_errors':[]}
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox'])
        context=await browser.new_context(viewport={'width':1366,'height':768});await context.add_init_script(INSTRUMENT)
        page=await context.new_page();page.on('pageerror',lambda e:result['console_errors'].append(str(e)));await ready(page)
        assert await page.locator('#sound').get_attribute('aria-pressed')=='true'
        assert await page.locator('#volume').input_value()=='35'
        assert await page.evaluate('cues.length')==0
        cell=page.get_by_role('button',name='Code letter 2: B',exact=True);await cell.focus();await page.keyboard.press('Enter')
        assert await page.evaluate("document.activeElement.getAttribute('aria-label')")=='Code letter 2: B'
        await eventually(page, "cues.includes('hello') && peaks.hello>0.001");await settle(page)
        assert await page.evaluate("cues.filter(c=>c==='hello').length")==1
        await page.get_by_role('button',name='04 - do not call').click();await eventually(page, "peaks.page>0.001");await settle(page);await page.locator('#reader-done').click();await settle(page)
        await page.locator('#link-source').focus();await page.locator('#link-source').select_option('text');assert await page.evaluate("document.activeElement.id")=='link-source';await settle(page)
        await page.locator('#starter').fill('AAAAAAAAAAAAAAAA');await page.locator('#starter').press('Tab');await settle(page)
        assert await page.locator('#progress').inner_text()=='256 / 256 letters filled'
        assert await page.evaluate("cues.filter(c=>c==='yay').length")==0
        assert 'Message recovered' not in await page.locator('#sheet-status').inner_text()
        result['checks'].append('first allowed interaction plays Hello once; default comfortable level; wrong full worksheet has no Yay; keyboard focus survives ribbon rebuild')
        await page.locator('#reset').click();await page.locator('#reset-confirm').click();await settle(page)
        await page.locator('#link-source').select_option('text');await settle(page)
        await page.locator('#phrase').fill('HELLOHELLO');await page.locator('#position').fill('1');await page.locator('#guess-form button').click();await settle(page)
        await page.locator('#phrase').fill('Z');await page.locator('#position').fill('17');await page.locator('#guess-form button').click();await eventually(page, "peaks.error>0.001");await settle(page);await page.locator('#undo').click()
        await page.locator('#phrase').fill('GOODNIGHT');await page.locator('#position').fill('248');await page.locator('#guess-form button').click()
        await eventually(page, "document.querySelector('#sheet-status').textContent.includes('Message recovered') && peaks.yay>0.001");await settle(page)
        assert await page.evaluate("cues.filter(c=>c==='yay').length")==1
        flag=re.search(r'RCC\{[A-Z_]+\}',await page.locator('#message').inner_text()).group()
        for candidate,expected in [(flag,True),(flag.lower(),False),(flag[:-2]+'Z}',False)]:
            response=await page.request.post(URL+'/api/completion',data={'flag':candidate});assert await response.json()=={'valid':expected}
        assert (await page.request.post(URL+'/api/completion',data={'flag':123})).status==400
        for path in ['/completion.sha256','/server.py','/organizer/generate.py']:
            assert (await page.request.get(URL+path)).status==404
        result['checks'].append('exact flag verified server-side; wrong/case-changed claims fail; correct decode produces one children Yay; private digest is not served')
        result['first_session_cues']=await page.evaluate('cues');result['measured_peaks']=await page.evaluate('peaks');result['cue_volumes']=await page.evaluate('audioVolumes')
        await ready(page);await page.get_by_role('button',name='01 - welcome').click();await settle(page)
        assert await page.evaluate("!cues.includes('hello')&&!cues.includes('yay')")
        await page.locator('#reader-done').click();await settle(page);await page.locator('#sound').click();await ready(page)
        assert await page.locator('#sound').get_attribute('aria-pressed')=='false'
        await page.get_by_role('button',name='01 - welcome').click();assert await page.evaluate('cues.length')==0;await page.locator('#reader-done').click()
        await page.locator('#sound').click();await page.locator('#volume').focus();await page.keyboard.press('Home');await ready(page)
        assert await page.locator('#volume').input_value()=='0';await page.get_by_role('button',name='01 - welcome').click();assert await page.evaluate('cues.length')==0
        result['checks'].append('reload repeats neither greeting nor celebration; saved mute and zero volume stay silent')
        silent=await browser.new_context();await silent.add_init_script(INSTRUMENT);other=await silent.new_page();await ready(other)
        await other.locator('#sound').click();assert await other.evaluate('cues.length')==0;await ready(other)
        await other.locator('#sound').click();await eventually(other, "cues.includes('hello') && peaks.hello>0.001");await settle(other)
        assert await other.evaluate("cues.filter(c=>c==='hello').length")==1
        result['checks'].append('mute before the first gesture preserves pending Hello until explicit unmute')
        assert not result['console_errors'];result['pass']=True
        await browser.close()
    (ROOT/'organizer'/'audio-results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
asyncio.run(main())
