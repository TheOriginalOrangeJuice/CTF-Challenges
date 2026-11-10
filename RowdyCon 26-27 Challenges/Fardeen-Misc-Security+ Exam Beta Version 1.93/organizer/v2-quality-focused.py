"""Focused public-browser checks; execute in Condev, root owns preview service."""
from pathlib import Path
import json
import traceback
from playwright.sync_api import sync_playwright

OUT=Path('/tmp/iq-v2-quality-focused04b'); OUT.mkdir(exist_ok=True)
result={'runtime':'Condev; localhost:18115; stage04','human_listening':False,'checks':{},'errors':[]}
INSTRUMENT=r'''(() => {
 window.__audio=[];window.__outputs=[];
 const AudioOriginal=window.Audio;
 window.Audio=function(...args){const a=new AudioOriginal(...args);window.__audio.push(a);return a;};window.Audio.prototype=AudioOriginal.prototype;
 const connect=AudioNode.prototype.connect;
 AudioNode.prototype.connect=function(destination,...args){
  if(destination instanceof AudioDestinationNode){
   const analyser=this.context.createAnalyser();connect.call(this,analyser);connect.call(analyser,destination,...args);
   window.__outputs.push({analyser,context:this.context});return destination;
  }
  return connect.call(this,destination,...args);
 };
 window.__measure=async(ms=1000)=>{
   let peak=0,sum=0,n=0,active=0;
   const until=performance.now()+ms;
   while(performance.now()<until){
    for(const out of window.__outputs){const a=new Float32Array(out.analyser.fftSize);out.analyser.getFloatTimeDomainData(a);
     for(const v of a){peak=Math.max(peak,Math.abs(v));sum+=v*v;n++;if(v)active++;}}
    await new Promise(r=>setTimeout(r,25));
   }
   return {peak,rms:n?Math.sqrt(sum/n):0,nonzero:active,samples:n,contexts:window.__outputs.map(x=>x.context.state)};
 };
})()'''

with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 ctx=b.new_context(viewport={'width':1366,'height':768});ctx.add_init_script(INSTRUMENT)
 page=ctx.new_page();page.set_default_timeout(6000)
 page.on('pageerror',lambda e:result['errors'].append(str(e)))
 def state():return ctx.request.get('http://localhost:18115/api/state').json()['state']
 def idle():page.wait_for_function("!document.querySelector('.question-body')||document.querySelector('.question-body').getAttribute('aria-busy')==='false'")
 def click(name):page.get_by_role('button',name=name,exact=True).click();idle()
 def shot(name):page.screenshot(path=str(OUT/(name+'.png')),full_page=True)
 try:
  page.goto('http://localhost:18115',wait_until='networkidle')
  click('CREDITS');page.keyboard.press('Tab')
  focus=[]
  for _ in range(5):
   focus.append(page.evaluate("({tag:document.activeElement.tagName,text:document.activeElement.textContent})"));page.keyboard.press('Tab')
  result['checks']['credits_tab_order']=focus;shot('credits-focus')
  page.keyboard.press('Escape');click('START')
  page.evaluate(r'''async()=>{const a=window.__audio.findLast(a=>a.src.endsWith('/quiz.mp3'));const c=new AudioContext();await c.resume();const source=c.createMediaElementSource(a);source.connect(c.destination);window.__musicProbe={a,c};}''')
  result['checks']['live_music_2s']=page.evaluate('window.__measure(2000)')
  result['checks']['live_music_next_2s']=page.evaluate('window.__measure(2000)')
  click('Sound settings');click('SOUND ON · MUTE')
  page.wait_for_timeout(150)
  result['checks']['muted_output_after_buffer_settle']=page.evaluate('window.__measure(500)')
  click('SOUND OFF · TURN ON')
  page.get_by_role('slider').nth(0).fill('0')
  result['checks']['music_zero_output']=page.evaluate('window.__measure(500)')
  page.evaluate('() => {window.__effectCapture=window.__measure(1200);}')
  click('TEST EFFECT')
  result['checks']['live_effect_output']=page.evaluate('window.__effectCapture')
  page.get_by_role('slider').nth(0).fill('0.45');page.get_by_role('slider').nth(1).fill('0.35');click('SOUND ON · MUTE')
  page.keyboard.press('Escape');page.reload(wait_until='networkidle');click('START');click('Sound settings')
  result['checks']['saved_sound_preferences']={'button':page.locator('.dialog-body .answer').inner_text(),'sliders':page.get_by_role('slider').evaluate_all('(es)=>es.map(e=>e.value)')}
  page.keyboard.press('Escape');click('Open evidence notebook')
  result['checks']['initial_notebook']=page.locator('.notebook-pages').inner_text()
  page.get_by_role('textbox').fill('Independent review note: preserve this exact text.');page.keyboard.press('Escape')
  page.reload(wait_until='networkidle');click('START')
  result['checks']['notes_receipt_pending_after_immediate_reload']=page.get_by_role('button',name='RETRY',exact=True).is_visible()
  if result['checks']['notes_receipt_pending_after_immediate_reload']:click('RETRY')
  click('Open evidence notebook')
  result['checks']['notes_after_reload']=page.get_by_role('textbox').input_value();page.keyboard.press('Escape')
  # Send an ordinary wrong answer but drop only its returned receipt.
  def lose_receipt(route):
   route.fetch();route.abort('failed')
  page.route('**/api/action',lose_receipt,times=1)
  page.locator('[data-drop="port-0"] button').click()
  page.get_by_role('button',name='RETRY',exact=True).wait_for();shot('interrupted-action')
  result['checks']['interrupted_acknowledged_state']={'q':state()['q'],'lives':state()['lives']}
  page.reload(wait_until='networkidle');click('START');click('RETRY')
  result['checks']['retry_state']={'q':state()['q'],'lives':state()['lives'],'pending':page.evaluate("sessionStorage.getItem('iq-v2-outbox')")}
  # Two more ordinary wrong answers must exhaust three lives, preserving notes.
  page.locator('[data-drop="port-0"] button').click();idle()
  page.locator('[data-drop="port-0"] button').click();idle()
  page.get_by_role('heading',name='GAME OVER',exact=True).wait_for();shot('gameover')
  click('TRY AGAIN?')
  result['checks']['reset']={k:state()[k] for k in ['q','lives','skips','notes','draft']}
  click('Open evidence notebook');result['checks']['notes_after_reset']=page.get_by_role('textbox').input_value();shot('notes-after-reset')
  result['status']='completed'
 except Exception as e:
  result['status']='interrupted';result['exception']=str(e);result['traceback']=traceback.format_exc()
  try:shot('failure')
  except:pass
  print(traceback.format_exc(),flush=True)
 finally:
  (OUT/'v2-quality-focused.json').write_text(json.dumps(result,indent=2),encoding='utf8')
  print(json.dumps(result),flush=True);b.close()
