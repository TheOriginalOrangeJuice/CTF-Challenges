"""Independent informed browser review, run only in verified Condev.

Root owns the preview service and source staging. This script uses only public UI
and read-only public state requests. It neither starts services nor installs tools.
"""
from pathlib import Path
import json
import traceback
from playwright.sync_api import sync_playwright

OUT = Path('/tmp/iq-v2-quality-stage04')
OUT.mkdir(exist_ok=True)
report = {'stage': '/tmp/iq-v2-stage04/The Impossible Security+ Quiz',
          'method': 'Informed browser control review; public state used to observe actions.',
          'human_playtest': False, 'human_listening': False,
          'snapshots': [], 'checks': {}, 'errors': [], 'failed_requests': []}

AUDIO = r'''(() => {
  window.__audio = []; window.__plays = [];
  const AudioOriginal = window.Audio;
  window.Audio = function(...args) { const a = new AudioOriginal(...args); window.__audio.push(a); return a; };
  window.Audio.prototype = AudioOriginal.prototype;
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function(...args) {
    const row = {src:this.src, time:performance.now(), status:'called'}; window.__plays.push(row);
    const p = originalPlay.apply(this,args);
    p.then(() => row.status='playing', e => row.status=e.name); return p;
  };
})()'''

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width':1366,'height':768}, accept_downloads=True)
    context.add_init_script(AUDIO)
    page = context.new_page()
    page.set_default_timeout(6000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    page.on('requestfailed',lambda r:report['failed_requests'].append({'url':r.url,'error':r.failure}))

    def write():
        (OUT/'v2-quality-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')

    def state():
        return context.request.get('http://localhost:18115/api/state').json()['state']

    def waitq(q):
        page.locator(f'.question-body.q{q}').wait_for()
        page.wait_for_function("document.querySelector('.question-body')?.getAttribute('aria-busy')==='false'")

    def idle():
        page.wait_for_function("!document.querySelector('.question-body') || document.querySelector('.question-body').getAttribute('aria-busy')==='false'")

    def click(name, exact=True):
        page.get_by_role('button',name=name,exact=exact).click()
        idle()

    def put(piece, target, mouse=False):
        src=page.locator(f'[data-piece="{piece}"]')
        dst=page.locator(f'[data-drop="{target}"]')
        if mouse: src.drag_to(dst)
        else:
            src.focus(); page.keyboard.press('Space'); dst.focus(); page.keyboard.press('Enter')
        idle()

    def snap(name):
        idle()
        page.screenshot(path=str(OUT/(name+'.png')),full_page=True)
        info=page.evaluate(r'''() => {
          const stage=document.querySelector('.stage').getBoundingClientRect();
          const controls=[...document.querySelectorAll('button,input,[data-drop],summary,textarea')]
            .filter(el=>el.getClientRects().length).map(el=>{
              const r=el.getBoundingClientRect(); const center=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
              return {text:el.innerText,label:el.getAttribute('aria-label'),tag:el.tagName,
                x:r.x,y:r.y,w:r.width,h:r.height,disabled:!!el.disabled,
                outside:r.left<stage.left-1||r.right>stage.right+1||r.top<stage.top-1||r.bottom>stage.bottom+1,
                centerCovered:!!center && !el.contains(center) && !center.contains(el)};
            });
          return {text:document.body.innerText,controls, viewport:[innerWidth,innerHeight],
            scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight]};
        }''')
        info['name']=name
        info['aria']=page.locator('body').aria_snapshot()
        if page.locator('.question-body').count():
            s=state(); info['q']=s['q']; info['lives']=s['lives']; info['draft']=s['draft']
        report['snapshots'].append(info); write()
        print(json.dumps({'snapshot':name,'q':info.get('q'),'outside':[x.get('label') or x['text'] for x in info['controls'] if x['outside']]}),flush=True)

    try:
        page.goto('http://localhost:18115',wait_until='networkidle')
        report['checks']['autoplay_attempts']=page.evaluate('window.__plays')
        snap('01-title-1366')
        page.set_viewport_size({'width':1920,'height':1080}); snap('02-title-1920')
        page.set_viewport_size({'width':1366,'height':768})
        page.keyboard.press('Tab')
        report['checks']['initial_focus']=page.evaluate("({text:document.activeElement.textContent,outline:getComputedStyle(document.activeElement).outline})")
        page.keyboard.press('Enter')
        waitq(1)
        report['checks']['audio_first_keyboard']=page.evaluate("({plays:window.__plays,media:window.__audio.map(a=>({src:a.src,paused:a.paused,time:a.currentTime,volume:a.volume,muted:a.muted}))})")
        report['checks']['audio_measurement']=page.evaluate(r'''async () => {
          const a=window.__audio.findLast(a=>a.src.endsWith('/quiz.mp3'));
          const ctx=new AudioContext(); await ctx.resume(); const src=ctx.createMediaElementSource(a);
          const analyser=ctx.createAnalyser(); src.connect(analyser).connect(ctx.destination);
          await new Promise(r=>setTimeout(r,350)); const samples=new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
          return {context:ctx.state,src:a.currentSrc,paused:a.paused,time:a.currentTime,
            rms:Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length),peak:Math.max(...samples.map(Math.abs)),
            method:'Live MediaElementAudioSource through analyser and destination; not human listening'};
        }''')
        snap('03-q01-start')
        put('plus','port-1',mouse=True)
        s=state(); report['checks']['q1_drag_no_commit']={'q':s['q'],'lives':s['lives'],'draft':s['draft']}
        page.locator('[data-drop="port-1"] button').dblclick()
        waitq(2); report['checks']['q1_doubleclick']={'q':state()['q'],'lives':state()['lives']}
        snap('04-q02-start'); click('Inspect running service'); snap('05-q02-inspected'); click('Restart service'); waitq(3)
        snap('06-q03-start'); click('PASSWORD'); click('Touch your FIDO2 key'); waitq(4)
        snap('07-q04-start'); put('K7','key-shredder'); click('PULL LEVER'); waitq(5)
        snap('08-q05-start'); put('intern','visitor-rail'); click('READ'); waitq(6)
        snap('09-q06-start'); put('gate','gate-junction'); snap('10-q06-positioned'); click('OPEN SIGN-IN'); waitq(7)
        snap('11-q07-start'); page.locator('.ethernet').click(); idle(); page.locator('.wifi-chip').click(); waitq(8)
        snap('12-q08-start'); click('Fold memo into envelope'); put('bob-key','memo-envelope'); snap('13-q08-sealed'); click('SEND →'); waitq(9)
        snap('14-q09-start'); click('Lift black rectangle'); click('Remove employee identifier'); click('Open document comments'); snap('15-q09-comment'); click('Remove comment text'); click('Open document comments'); click('PUBLISH'); waitq(10)
        snap('16-q10-start'); put('file-approved','drive09'); snap('17-q10-copied'); click('⏏ EJECT'); waitq(11)
        snap('18-q11-start'); click('Open outer door'); put('candidate','vestibule'); click('Close outer door'); click('Move floor trim'); snap('19-q11-hatch'); click('Close maintenance hatch'); click('Open inner door'); waitq(12)
        snap('20-q12-start')
        for i in range(4):
            page.locator('.session-card').nth(i).click(); idle()
        click('Select current workplace session'); click('REVOKE SELECTED'); waitq(13)
        snap('21-q13-start'); put('approved-frame','comparison'); snap('22-q13-difference'); click('C'); waitq(14)
        snap('23-q14-start'); click('Type sample input'); snap('24-q14-sample'); click('Pull input recording tab'); waitq(15)
        snap('25-q15-start')
        for rule in ['intern','staff443','deny']:
            while state()['draft']['order'].index(rule)>['intern','staff443','deny'].index(rule):
                click(f'Move {rule} rule up')
        snap('26-q15-ordered'); click('APPLY'); waitq(16)
        snap('27-q16-start'); click('Turn question sheet over'); snap('28-q16-back'); click('DISABLE DEBUG'); waitq(17)
        snap('29-q17-start'); page.locator('.approval-receipt').click(); snap('30-q17-receipt')
        s=state(); approved=next(n for n in s['notebook'] if n['id']=='approved-release')
        release=next(r for r in s['facts']['releases'] if r.get('sha256')==approved.get('sha256'))
        page.locator('.approval-receipt').click(); put('deploy-arrow',release['id']); click('DEPLOY →'); waitq(18)
        snap('31-q18-start'); put('cert-serial','revocation-tray'); click('PUBLISH'); waitq(19)
        snap('32-q19-start'); click('✂ TEAR OFF COPY'); snap('33-q19-copy'); put('denial-copy','evidence-envelope'); waitq(20)
        snap('34-q20-start')
        s=state()
        for i,t in enumerate(s['tokens'],1):
            click(f'Turn token {i} over'); put('share-'+t['id'],'final-viewer'); snap(f'35-q20-{i}-shares')
        page.set_viewport_size({'width':1920,'height':1080}); snap('36-q20-1920')
        page.emulate_media(reduced_motion='reduce'); snap('37-q20-reduced-motion')
        report['checks']['reduced_motion']=page.evaluate("[...document.querySelectorAll('.v2 *')].filter(e=>getComputedStyle(e).animationName!=='none').map(e=>e.className)")
        page.get_by_label('Certificate PIN').fill('604827'); click('UNLOCK')
        page.get_by_role('heading',name='CERTIFIED!',exact=True).wait_for(); snap('38-certified')
        report['checks']['certificate']=page.locator('.certificate code').inner_text()
        page.reload(wait_until='networkidle'); click('RESUME'); snap('39-certificate-recovered')
        report['status']='completed all twenty questions through UI'
    except Exception as exc:
        report['status']='interrupted';report['exception']=str(exc);report['traceback']=traceback.format_exc()
        try: snap('failure-current')
        except Exception as other: report['snapshot_error']=str(other)
        print(traceback.format_exc(),flush=True)
    finally:
        write(); browser.close()
