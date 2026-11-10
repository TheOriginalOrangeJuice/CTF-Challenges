"""Informed UI review; public API navigation; root owns live service. Condev only."""
from pathlib import Path
import argparse, hashlib, json, traceback, uuid
from playwright.sync_api import sync_playwright

p=argparse.ArgumentParser();p.add_argument('--output',default='/tmp/iq-v3-quality01-output');p.add_argument('--live-stage',default='/tmp/iq-v3-stage02/The Impossible Security+ Quiz');p.add_argument('--only',default='');args=p.parse_args()
OUT=Path(args.output);OUT.mkdir(parents=True,exist_ok=True);BASE='http://localhost:18115'
R={'method':'Informed UI review with public API navigation','live_stage':args.live_stage,'human_playtesting':False,'human_listening':False,'checks':{},'screenshots':[],'errors':[]}
STEPS={1:[('place-plus',{'index':1}),('answer',{'index':1})],2:[('inspect',{}),('answer',{'id':'2.0'})],3:[('answer',{'id':'c'})],4:[('answer',{'id':'forget'})],5:[('toggle-account',{'id':'NOBODY','allowed':False}),('apply',{})],6:[('answer',{'id':'both-routes'})],7:[('submit-password',{'value':' '})],8:[('answer',{'id':'c'})],9:[('overlay',{'visible':False}),('edit',{'field':'employeeId','value':''}),('edit',{'field':'comment','value':''}),('publish',{})],10:[('select-source',{'id':'approved'}),('copy-file',{}),('select-device',{'id':'09'}),('paste-file',{}),('eject',{})],11:[('outer',{'open':True}),('move-person',{'person':'candidate','to':'vestibule'}),('outer',{'open':False}),('hatch',{'open':False}),('open-inner',{})],12:[('select-session',{'id':i,'selected':True}) for i in ['desk','phone','tablet','remote','header']]+[('revoke',{})],13:[('answer',{'id':'C'})],14:[('recording',{'on':False}),('answer',{'id':'a'})],15:[('reorder',{'order':['intern','staff443','deny','header','any']}),('apply',{})],16:[('set-count',{'value':'06'}),('submit-count',{})],17:[('bind',{'reference':'release-410'}),('deploy',{})],18:[('answer',{'id':'neither'})]}
AUDIO=r'''(()=>{window.__audio=[];window.__outputs=[];window.__decodes=[];const A=window.Audio;window.Audio=function(...args){const a=new A(...args);window.__audio.push(a);return a;};window.Audio.prototype=A.prototype;const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(d,...args){if(d instanceof AudioDestinationNode){const a=this.context.createAnalyser();a.fftSize=2048;connect.call(this,a);connect.call(a,d,...args);window.__outputs.push({a,c:this.context,kind:this.constructor.name});return d;}return connect.call(this,d,...args);};const decode=AudioContext.prototype.decodeAudioData;AudioContext.prototype.decodeAudioData=async function(...args){const b=await decode.apply(this,args);window.__decodes.push({duration:b.duration,rate:b.sampleRate,channels:b.numberOfChannels});return b;};window.__measure=async(ms=1000,kind=null)=>{let peak=0,sum=0,n=0,nonzero=0;const until=performance.now()+ms;while(performance.now()<until){for(const o of window.__outputs.filter(x=>!kind||x.kind===kind)){const a=new Float32Array(o.a.fftSize);o.a.getFloatTimeDomainData(a);for(const v of a){peak=Math.max(peak,Math.abs(v));sum+=v*v;n++;if(v)nonzero++;}}await new Promise(r=>setTimeout(r,5));}return {peak,rms:n?Math.sqrt(sum/n):0,nonzero,samples:n,outputs:window.__outputs.map(x=>({kind:x.kind,state:x.c.state}))};};})()'''
def write(): (OUT/'v3-quality-report.json').write_text(json.dumps(R,indent=2),encoding='utf8')
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True);ctx=b.new_context(viewport={'width':1366,'height':768});ctx.add_init_script(AUDIO);page=ctx.new_page();page.set_default_timeout(6000)
 page.on('pageerror',lambda e:R['errors'].append(str(e)))
 page.on('console',lambda m:R['errors'].append(m.text) if m.type=='error' else None)
 def state():return ctx.request.get(BASE+'/api/state').json()['state']
 def idle():page.wait_for_function("!document.querySelector('.question-body')||document.querySelector('.question-body').getAttribute('aria-busy')==='false'")
 def click(name):page.get_by_role('button',name=name,exact=True).click();idle()
 def key(name):page.get_by_role('button',name=name,exact=True).focus();page.keyboard.press('Enter');idle()
 def refresh():page.reload(wait_until='networkidle');click('RESUME' if state()['q']>1 else 'START')
 def api(op,fields):
  s=state();r=ctx.request.post(BASE+'/api/action',data={'requestId':str(uuid.uuid4()),'questionVersion':3,'attempt':s['attempt'],'revision':s['revision'],'q':s['q'],'kind':'play','op':op,'args':fields});d=r.json()
  assert r.ok and d.get('event') not in ['wrong','gameover'],d
 def nav(q):
  while state()['q']<q:
   for op,fields in STEPS[state()['q']]:api(op,fields)
  assert state()['q']==q;refresh()
 def shot(name):
  idle();page.screenshot(path=str(OUT/(name+'.png')),full_page=True)
  d=page.evaluate(r'''()=>{const s=document.querySelector('.stage').getBoundingClientRect();return {text:document.body.innerText,viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],controls:[...document.querySelectorAll('.question-body button,.question-body input,.question-body textarea')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect(),c=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {name:e.getAttribute('aria-label')||e.innerText,disabled:!!e.disabled,rect:{x:r.x,y:r.y,w:r.width,h:r.height},covered:!!c&&!e.contains(c)&&!c.contains(e),outside:r.left<s.left-1||r.right>s.right+1||r.top<s.top-1||r.bottom>s.bottom+1};})};}''');d['name']=name;R['screenshots'].append(d);write();print(name,flush=True)
 def sizes(name):
  if args.only and not any(name.startswith(prefix) for prefix in ['q10','q17','q19']):return
  for w,h in [(1366,768),(1920,1080)]:page.set_viewport_size({'width':w,'height':h});shot(name+'-'+str(w))
  page.set_viewport_size({'width':1366,'height':768})
 def check(name,fn):
  if args.only and name not in args.only.split(','):return
  try:R['checks'][name]=fn()
  except Exception as e:
   R['checks'][name]={'failed':str(e),'traceback':traceback.format_exc()}
   try:shot('failure-'+name)
   except Exception:pass
  write()
 try:
  page.goto(BASE,wait_until='networkidle')
  def audio_check():
   page.evaluate('() => {window.__capture=window.__measure(1400,"GainNode");}');key('START');start=page.evaluate('window.__capture');assert start['peak']>0,start
   page.evaluate('''async()=>{const a=window.__audio.findLast(a=>a.src.endsWith('/quiz.mp3'));const c=new AudioContext();await c.resume();c.createMediaElementSource(a).connect(c.destination);}''');music=page.evaluate('window.__measure(500,"MediaElementAudioSourceNode")');assert music['peak']>0,music
   click('Sound settings');page.get_by_role('slider').nth(0).fill('0.45');page.get_by_role('slider').nth(1).fill('0.35');click('SOUND ON · MUTE');page.wait_for_timeout(200);muted=page.evaluate('window.__measure(400)');assert muted['peak']==0,muted
   page.keyboard.press('Escape');refresh();prefs=page.evaluate("JSON.parse(localStorage.getItem('iq-sound'))");assert prefs=={'muted':True,'music':0.45,'effects':0.35},prefs
   muted_start=page.evaluate('window.__measure(250,"GainNode")');click('Sound settings');sliders=page.get_by_role('slider').evaluate_all('(es)=>es.map(e=>e.value)');assert sliders==['0.45','0.35'],sliders
   click('SOUND OFF · TURN ON');page.evaluate('() => {window.__capture=window.__measure(1000,"GainNode");}');click('TEST EFFECT');effect=page.evaluate('window.__capture');assert effect['peak']>0,effect
   click('SOUND ON · MUTE');page.keyboard.press('Escape')
   return {'start_output':start,'music_output':music,'muted_output':muted,'saved_preferences':prefs,'displayed_sliders':sliders,'muted_start_output':muted_start,'test_effect_output':effect,'decoded_buffers':page.evaluate('window.__decodes'),'human_listening':False}
  check('audio',audio_check)
  for q,name in [(3,'typography'),(5,'nobody'),(6,'expression'),(7,'empty')]:nav(q);sizes(f'q{q:02d}-{name}')
  def space_check():
   v=page.get_by_label('Bracketed password').inner_text();assert v=='[ ]',repr(v)
   page.get_by_label('Exam password').focus();page.keyboard.press('Space');assert page.get_by_label('Exam password').input_value()==' ';sizes('q07-one-space');refresh();assert page.get_by_label('Exam password').input_value()==' '
   page.get_by_label('Exam password').focus();page.keyboard.press('Enter');idle();assert state()['q']==8,page.locator('body').inner_text()
   return {'bracketed':v,'draft_survived_reload':True,'keyboard_submit_advanced':True}
  check('whitespace',space_check);nav(8)
  def links_check():
   values=[]
   for el in page.get_by_role('link').all():el.focus();values.append(page.locator('#link-destination').inner_text())
   sizes('q08-focused-destination');return {'focus_destinations':values}
  check('links',links_check);nav(10);sizes('q10-empty')
  def backup_check():
   assert page.get_by_role('button',name='COPY',exact=True).is_disabled();assert page.get_by_role('button',name='PASTE',exact=True).is_disabled()
   key('Select shortcut');key('COPY');page.locator('.destination-picks button').nth(1).click();idle();key('PASTE');shortcut=state()['draft']['copied'];assert shortcut['kind']=='shortcut',shortcut;sizes('q10-shortcut')
   key('Select approved file');key('COPY');page.locator('.destination-picks button').nth(0).click();idle();key('PASTE');same=state()['draft']['copied'];assert same['device']=='04',same;assert page.get_by_role('button',name='⏏ EJECT 09',exact=True).is_disabled()
   page.locator('.destination-picks button').nth(1).click();idle();key('PASTE');copy=state()['draft']['copied'];assert copy['kind']=='bytes' and copy['device']=='09',copy;sizes('q10-real-usb-file');key('⏏ EJECT 09');assert state()['q']==11
   return {'shortcut':shortcut,'same_disk':same,'usb_file':copy,'keyboard_commit_advanced':True}
  check('backup',backup_check);nav(11);sizes('q11-start')
  def vestibule_check():
   assert page.get_by_role('button',name='Walk C-701 to vestibule',exact=True).is_disabled();key('Open outer door');key('Walk VISITOR to vestibule');assert state()['draft']['visitor']=='vestibule';key('Walk VISITOR to public');assert state()['draft']['visitor']=='outside'
   key('Walk C-701 to vestibule');key('Close outer door');assert page.get_by_role('button',name='Walk C-701 to public',exact=True).is_disabled();key('Close maintenance hatch');sizes('q11-ready');key('Admit to secure');assert state()['q']==12
   return {'closed_door_blocks_walk':True,'visitor_movement_reversible':True,'keyboard_admission_advanced':True}
  check('vestibule',vestibule_check);nav(14);sizes('q14-start')
  def recorder_check():
   lives=state()['lives'];page.locator('[data-answer="a"]').click();idle();s=state();assert s['lives']==lives-1 and s['q']==14;saved=s['draft']['tape']
   if page.get_by_role('button',name='Dismiss message',exact=True).count():click('Dismiss message')
   key('Stop recorder');sizes('q14-recovery');page.locator('[data-answer="d"]').focus();page.keyboard.press('Enter');idle();assert state()['q']==15
   return {'captured_after_wrong':saved,'recovered_with_old_tape_retained':True}
  check('recorder_recovery',recorder_check);nav(16);sizes('q16-checksum');nav(17)
  def retained_check():
   page.locator('.usb-receipt').click();idle();digest=page.get_by_label('Artifact digest').input_value();assert len(digest)==64;sizes('q17-full-evidence');page.keyboard.press('Escape');focus=page.evaluate('document.activeElement.innerText');assert 'USB BACKUP' in focus,focus
   return {'digest_length':len(digest),'focus_restored':focus}
  check('retained_evidence',retained_check);nav(18);sizes('q18-neither');nav(19);sizes('q19-chain')
  def log_check():
   records=state()['draft']['records']
   for r in records:assert hashlib.sha256(r['bytes'].encode()).hexdigest()==r['sha256']
   chain=[next(r for r in records if r['anchor'])]
   while True:
    found=[r for r in records if r['previousHash']==chain[-1]['sha256']]
    if not found:break
    assert len(found)==1;chain.append(found[0]);assert len(chain)<=len(records)
   assert len(chain)==len(records);target=[r for r in chain if r['action']=='DENY'][-1];key('Inspect log '+target['id']);assert page.get_by_label('Record fingerprint',exact=True).input_value()==target['sha256'];assert page.get_by_label('Previous fingerprint',exact=True).input_value()==target['previousHash']
   for w,h in [(1366,768),(1920,1080)]:
    page.set_viewport_size({'width':w,'height':h});page.get_by_label('Record fingerprint',exact=True).focus();page.keyboard.press('Control+A');shot('q19-full-record-'+str(w));focus=[]
    for _ in range(7):page.keyboard.press('Tab');focus.append(page.evaluate("({name:document.activeElement.getAttribute('aria-label')||document.activeElement.tagName,inDialog:!!document.activeElement.closest('.evidence-overlay')})"))
    assert all(x['inDialog'] for x in focus),focus
    page.locator('.evidence-body pre').focus();page.keyboard.press('Control+End');scroll=page.locator('.evidence-body').evaluate('(e)=>({top:e.scrollTop,height:e.clientHeight,total:e.scrollHeight})');assert scroll['top']>0,scroll;shot('q19-record-scrolled-'+str(w))
   page.keyboard.press('Escape');restored=page.evaluate("document.activeElement.getAttribute('aria-label')");assert restored=='Inspect log '+target['id'],restored;page.set_viewport_size({'width':1366,'height':768});key('Archive log '+target['id']);assert state()['q']==20
   return {'all_hashes_match_bytes':True,'chain':[r['id'] for r in chain],'latest_deny':target['id'],'focus_restored':restored,'focus_cycle':focus,'archive_advanced':True}
  check('log_chain',log_check);R['status']='review completed; individual failures retained'
 except Exception as exc:R['status']='interrupted';R['exception']=str(exc);R['traceback']=traceback.format_exc()
 finally:write();print(json.dumps({'status':R.get('status'),'checks':{k:('failed' if 'failed' in v else 'passed') for k,v in R['checks'].items()}}),flush=True);b.close()
