"""Actual app captures and browser audio signal checks via public interfaces."""
import asyncio,json,pathlib,sys,uuid
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1];OUT=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'screenshots';OUT.mkdir(parents=True,exist_ok=True)
ANS={1:{'target':'unboxed'},2:{'patched':True},3:{'width':8},4:{'cards':['password','key']},5:{'box':{'x':.1,'y':.1,'w':.3,'h':.8}},6:{'cuts':['A-V','B-V']},7:{'permissions':['READ']},8:{'bag':2},9:{'position':0,'direction':-1},10:{'subjects':['Goose','Moth']},11:{'actions':['OPEN_OUTER','GOOSE_IN','CLOSE_OUTER','OPEN_INNER','GOOSE_OUT','CLOSE_INNER']},12:{'order':['BACKUP','ISSUE','APPROVE','EXPIRE']},13:{'shiftMs':-200,'invert':True},14:{'strip':'ABCD'},15:{'truths':[True,True,False,False]},16:{'actions':['ISOLATE','REMOVE','DRAIN','CUT']},17:{'scope':'ALL'},18:{'operations':['F','S','R_INV']},19:{'labels':['R','S','F']},20:{'rejected':[4,5,6],'order':[1,2,3],'badge':3}}
NAMES={1:'02-authorize.png',2:'03-patch.png',5:'04-firewall.png',10:'05-stamps.png',12:'06-clocks.png',13:'07-mixer.png',15:'08-auditor.png',16:'09-bomb.png',18:'10-rollback.png',20:'11-tickets.png'}
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,args=['--autoplay-policy=no-user-gesture-required'])
  context=await browser.new_context(viewport={'width':1366,'height':768},reduced_motion='reduce')
  await context.add_init_script('''window.__audioSignal={maxRms:0,frames:0}; const oldConnect=AudioNode.prototype.connect; AudioNode.prototype.connect=function(dest,...rest){if(dest instanceof AudioDestinationNode){const analyzer=this.context.createAnalyser();analyzer.fftSize=2048;oldConnect.call(this,analyzer);const data=new Float32Array(2048);const timer=setInterval(()=>{analyzer.getFloatTimeDomainData(data);let sum=0;for(const x of data)sum+=x*x;window.__audioSignal.maxRms=Math.max(window.__audioSignal.maxRms,Math.sqrt(sum/data.length));window.__audioSignal.frames++;},20);setTimeout(()=>clearInterval(timer),7000);}return oldConnect.call(this,dest,...rest);};''')
  page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:18115',wait_until='domcontentloaded');await page.get_by_role('button',name='START',exact=True).wait_for();await page.evaluate('document.fonts.ready');await page.locator('.stage').screenshot(path=str(OUT/'01-menu.png'))
  await page.get_by_role('button',name='SOUND',exact=True).click();await page.get_by_role('button',name='TEST EFFECT').click();await page.wait_for_timeout(1400);audio=await page.evaluate('window.__audioSignal');assert audio['maxRms']>0.001,audio
  await page.get_by_role('button',name='Close dialog').click();await page.get_by_role('button',name='START',exact=True).click();await page.locator('.question-header h1').wait_for()
  async def act(kind,draft=None):
   return await page.evaluate('''async ({kind,draft})=>{const {state}=await(await fetch('/api/state')).json();const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({attempt:state.attempt,revision:state.revision,requestId:crypto.randomUUID(),kind,...(draft?{draft}:{})})});return {code:r.status,...await r.json()};}''',{'kind':kind,'draft':draft})
  async def refresh():
   await page.reload(wait_until='domcontentloaded');await page.get_by_role('button',name='RESUME',exact=True).wait_for();await page.get_by_role('button',name='RESUME',exact=True).click();await page.locator('.question-header h1,.victory').wait_for();await page.evaluate('document.fonts.ready')
  for q in range(1,21):
   draft=await act('draft',ANS[q]);assert draft['code']==200,(q,draft)
   await refresh()
   if q==13:await page.locator('.wave').first.wait_for()
   if q in NAMES:await page.locator('.stage').screenshot(path=str(OUT/NAMES[q]))
   if q==20:
    await page.get_by_role('button',name='2. MACHINE',exact=True).click();await page.locator('.stage').screenshot(path=str(OUT/'12-final-machine.png'))
    await page.get_by_role('button',name='3. ISSUE',exact=True).click();await page.locator('.stage').screenshot(path=str(OUT/'13-final-badge.png'))
   outcome=await act('submit',ANS[q]);assert outcome['event'] in ['correct','won'],(q,outcome)
  await refresh();await page.locator('.certificate code').filter(has_text='RCC{').wait_for();await page.locator('.stage').screenshot(path=str(OUT/'14-certificate.png'))
  await page.set_viewport_size({'width':1920,'height':1080});await page.screenshot(path=str(OUT/'16-certificate-1920.png'))
  await act('restart')
  for _ in range(3):await act('submit',{'target':'option0'})
  await page.reload(wait_until='domcontentloaded');await page.get_by_role('button',name='RESUME',exact=True).click();await page.get_by_role('button',name='TRY AGAIN?',exact=True).wait_for();await page.locator('.stage').screenshot(path=str(OUT/'15-gameover.png'))
  (OUT.parent/'organizer'/'browser-capture-results.json').write_text(json.dumps({'status':'passed','screenshots':len(list(OUT.glob('*.png'))),'pageErrors':errors,'actualAudioSignal':audio,'method':'Actual running UI; organizer-authored public API actions arranged capture states. Not independent blind or human playtesting.'},indent=2))
  assert not errors,errors
  await browser.close()
asyncio.run(main())
