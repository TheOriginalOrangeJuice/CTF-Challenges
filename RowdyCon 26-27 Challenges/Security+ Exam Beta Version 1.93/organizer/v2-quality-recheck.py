"""Focused stage05 polish review. Public actions navigate to reviewed scenes.

This is not a repeat blind solve or human listening/playtesting. Root owns service.
"""
from pathlib import Path
import hashlib
import json
import traceback
import uuid
from playwright.sync_api import sync_playwright

TREE=Path('/tmp/iq-v2-stage05/The Impossible Security+ Quiz')
OUT=Path('/tmp/iq-v2-quality-stage05b');OUT.mkdir(exist_ok=True)
report={'stage':str(TREE),'method':'Focused UI review; ordinary public action requests used only to navigate between reviewed questions.',
        'human_playtest':False,'human_listening':False,'checks':{},'captures':[],'errors':[]}
report['source_sha256']={str(p.relative_to(TREE)):hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in (TREE/'challenge/client/src').iterdir() if p.is_file()}
plan=json.loads((TREE/'organizer/v2-quality-plan.json').read_text())
report['checks']['preserved_assets']={name:hashlib.sha256((TREE/'challenge/public/assets'/name).read_bytes()).hexdigest()==sha
                                     for name,sha in plan['baseline_asset_sha256'].items()}

INSTRUMENT=r'''(() => {
 window.__audio=[];window.__outputs=[];window.__plays=[];
 const AudioOriginal=window.Audio;
 window.Audio=function(...args){const a=new AudioOriginal(...args);window.__audio.push(a);return a;};window.Audio.prototype=AudioOriginal.prototype;
 const play=HTMLMediaElement.prototype.play;
 HTMLMediaElement.prototype.play=function(...args){const row={src:this.src,status:'attempted'};window.__plays.push(row);const p=play.apply(this,args);p.then(()=>row.status='playing',e=>row.status=e.name);return p;};
 const connect=AudioNode.prototype.connect;
 AudioNode.prototype.connect=function(destination,...args){
  if(destination instanceof AudioDestinationNode){const analyser=this.context.createAnalyser();connect.call(this,analyser);connect.call(analyser,destination,...args);window.__outputs.push({analyser,context:this.context});return destination;}
  return connect.call(this,destination,...args);
 };
 window.__measure=async(ms=1000)=>{let peak=0,sum=0,n=0;const until=performance.now()+ms;
  while(performance.now()<until){for(const out of window.__outputs){const a=new Float32Array(out.analyser.fftSize);out.analyser.getFloatTimeDomainData(a);for(const v of a){peak=Math.max(peak,Math.abs(v));sum+=v*v;n++;}}await new Promise(r=>setTimeout(r,25));}
  return {peak,rms:n?Math.sqrt(sum/n):0,samples:n,contexts:window.__outputs.map(x=>x.context.state)};
 };
})()'''

with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True)
 ctx=browser.new_context(viewport={'width':1366,'height':768});ctx.add_init_script(INSTRUMENT)
 page=ctx.new_page();page.set_default_timeout(6000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def state():return ctx.request.get('http://localhost:18115/api/state').json()['state']
 def op(name,**args):
  s=state();r=ctx.request.post('http://localhost:18115/api/action',headers={'Origin':'http://localhost:18115'},data={
   'attempt':s['attempt'],'revision':s['revision'],'q':s['q'],'questionVersion':2,'requestId':str(uuid.uuid4()),'kind':'play','op':name,'args':args})
  assert r.ok,(r.status,r.text())
  data=r.json();assert data['state']['lives']==3,data
  return data
 def idle():page.wait_for_function("!document.querySelector('.question-body')||document.querySelector('.question-body').getAttribute('aria-busy')==='false'")
 def click(name):page.get_by_role('button',name=name,exact=True).click();idle()
 def refresh(q):
  page.reload(wait_until='networkidle');page.get_by_role('button',name='RESUME' if q>1 else 'START',exact=True).click();page.locator(f'.question-body.q{q}').wait_for();idle()
 def capture(name):
  page.wait_for_function("Math.abs(parseFloat(document.querySelector('.scaled-frame').style.width)-550*Math.max(.55,Math.min((innerWidth-30)/550,(innerHeight-30)/400,2)))<.1")
  page.evaluate('() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  page.screenshot(path=str(OUT/(name+'.png')),full_page=True)
  d=page.evaluate(r'''()=>{const s=document.querySelector('.stage').getBoundingClientRect();return {
   text:document.body.innerText,viewport:[innerWidth,innerHeight],
   controls:[...document.querySelectorAll('button,input,[data-drop]')].filter(e=>e.getClientRects().length).map(e=>{
    const r=e.getBoundingClientRect(),c=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {text:e.innerText,label:e.getAttribute('aria-label'),outside:r.left<s.left-1||r.right>s.right+1||r.top<s.top-1||r.bottom>s.bottom+1,
     covered:!!c&&!e.contains(c)&&!c.contains(e)};
   })};}''')
  d['name']=name;d['aria']=page.locator('body').aria_snapshot();report['captures'].append(d)
 def sizes(name):
  for w,h in [(1366,768),(1920,1080),(580,430)]:
   page.set_viewport_size({'width':w,'height':h});capture(f'{name}-{w}')
  page.set_viewport_size({'width':1366,'height':768})
 def put(piece,target):
  page.locator(f'[data-piece="{piece}"]').focus();page.keyboard.press('Space');page.locator(f'[data-drop="{target}"]').focus();page.keyboard.press('Enter');idle()
 try:
  page.goto('http://localhost:18115',wait_until='networkidle')
  report['checks']['load_audio_attempts']=page.evaluate('window.__plays')
  click('CREDITS');page.keyboard.press('Tab');focus=[]
  for _ in range(5):
   focus.append(page.evaluate("({tag:document.activeElement.tagName,text:document.activeElement.textContent})"));page.keyboard.press('Tab')
  report['checks']['credits_focus_order']=focus;sizes('credits')
  page.keyboard.press('Escape');report['checks']['credits_focus_return']=page.evaluate('document.activeElement.textContent')
  page.keyboard.press('Tab');page.keyboard.press('Tab');click('START')
  report['checks']['keyboard_audio_retry']=page.evaluate('window.__plays')
  page.evaluate("async()=>{const a=window.__audio.findLast(a=>a.src.endsWith('/quiz.mp3'));const c=new AudioContext();await c.resume();c.createMediaElementSource(a).connect(c.destination);}")
  report['checks']['live_music']=page.evaluate('window.__measure(2000)')
  click('Sound settings');click('SOUND ON · MUTE');page.wait_for_timeout(150)
  report['checks']['muted_live_output']=page.evaluate('window.__measure(500)')
  click('SOUND OFF · TURN ON');page.get_by_role('slider').nth(0).fill('0');page.wait_for_timeout(150)
  report['checks']['zero_music_live_output']=page.evaluate('window.__measure(500)')
  page.evaluate('()=>{window.__effectCapture=window.__measure(1000);}');click('TEST EFFECT');report['checks']['effect_output']=page.evaluate('window.__effectCapture')
  page.get_by_role('slider').nth(0).fill('0.25');page.keyboard.press('Escape')
  op('place-plus',index=1);op('answer',index=1);op('restart-service');refresh(3);sizes('q03-key')
  op('select-factor',id='password');op('select-factor',id='key');op('move-key',to='shredder');op('shred');op('move-intern',inside=False);op('grant',permission='READ')
  op('move-gate',to='junction');op('activate');op('toggle',target='ethernet',on=False);op('toggle',target='wifi',on=False)
  op('fold',folded=True);op('encrypt',recipient='Bob');op('send');refresh(9);sizes('q09-comments')
  click('Open document comments');sizes('q09-open-comment')
  op('overlay',visible=False);op('edit',field='employeeId',value='');op('edit',field='comment',value='');op('publish')
  op('select-device',id='09');op('copy',folder='approved',mode='bytes');op('eject')
  op('outer',open=True);op('move-person',person='candidate',to='vestibule');op('outer',open=False);op('footer',open=True);refresh(11);sizes('q11-lifted-trim')
  click('Close maintenance hatch');click('Open inner door')
  for sid in ['desk','phone','tablet','remote','header']:op('select-session',id=sid,selected=True)
  op('revoke');op('answer',id='C');refresh(14);sizes('q14-recording-tab')
  click('Pull input recording tab');op('reorder',order=['intern','staff443','deny','header','any']);op('apply');op('flip',side='back');refresh(16);sizes('q16-debug')
  click('DISABLE DEBUG')
  s=state();approved=next(n for n in s['notebook'] if n['id']=='approved-release');release=next(r for r in s['facts']['releases'] if r['sha256']==approved['sha256'])
  op('bind',id=release['id']);op('deploy');op('add-revocation',serial='CT-2048');op('publish');op('tear-copy');op('preserve');refresh(20)
  for i,t in enumerate(state()['tokens'],1):click(f'Turn token {i} over');put('share-'+t['id'],'final-viewer')
  sizes('q20-image');click('MAGNIFY');sizes('q20-magnified')
  report['checks']['magnify_focus']=page.evaluate('document.activeElement.textContent')
  page.keyboard.press('Tab');report['checks']['magnify_tab_target']=page.evaluate("({text:document.activeElement.textContent,label:document.activeElement.getAttribute('aria-label')})")
  page.keyboard.press('Escape');report['checks']['magnify_escape_closes']=page.locator('.pixel-magnifier').count()==0
  capture('q20-magnify-keyboard')
  click('CLOSE');report['checks']['magnify_closed']=page.locator('.pixel-magnifier').count()==0
  page.emulate_media(reduced_motion='reduce');sizes('q20-reduced-motion')
  report['checks']['reduced_motion_animations']=page.evaluate("[...document.querySelectorAll('.v2 *')].filter(e=>getComputedStyle(e).animationName!=='none').map(e=>e.className)")
  report['status']='completed focused recheck'
 except Exception as e:
  report['status']='interrupted';report['exception']=str(e);report['traceback']=traceback.format_exc()
  try:capture('failure')
  except:pass
  print(traceback.format_exc(),flush=True)
 finally:
  (OUT/'v2-quality-recheck.json').write_text(json.dumps(report,indent=2),encoding='utf8')
  print(json.dumps({'status':report['status'],'checks':report['checks'],'errors':report['errors']}),flush=True);browser.close()
