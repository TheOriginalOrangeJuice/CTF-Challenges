"""Focused actual-browser audio checks; production timer observed once at 45 seconds."""
import json,sys,time,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=True)
URL='http://host.docker.internal:18113'
report={'checks':{},'audio':{},'console_errors':[],
        'scope':'Ambient audio, saved preferences and existing correct-answer cheer; no cipher revalidation.',
        'visibility_limit':'Headless Chromium kept its native visibilityState visible for background tabs, minimized windows and frozen/active lifecycle. Visibility checks below explicitly simulate document.hidden and visibilitychange; an actual human tab switch was not tested.',
        'human_listening':'not performed','independent_human_playtesting':'not performed'}
INSTRUMENT=r'''(() => {
  const play=HTMLMediaElement.prototype.play,timeout=window.setTimeout,clear=window.clearTimeout;
  const nodes=new WeakMap();window.observed={events:[],frames:[],waits:[],timers:new Map()};
  Math.random=()=>0;
  window.setTimeout=(callback,delay,...args)=>{
    if(delay<45000||delay>100000)return timeout(callback,delay,...args);
    let timer;const record={delay,scheduledAt:performance.now(),firedAt:null,cancelledAt:null};observed.waits.push(record);
    timer=timeout(()=>{record.firedAt=performance.now();observed.timers.delete(timer);callback(...args)},window.accelerateAmbient?700:delay);
    observed.timers.set(timer,record);return timer;
  };
  window.clearTimeout=timer=>{const record=observed.timers.get(timer);if(record){record.cancelledAt=performance.now();observed.timers.delete(timer)}return clear(timer)};
  HTMLMediaElement.prototype.play=function(){
    if(!nodes.has(this)){
      const ctx=new AudioContext(),source=ctx.createMediaElementSource(this),meter=ctx.createAnalyser();meter.fftSize=1024;
      source.connect(meter);meter.connect(ctx.destination);nodes.set(this,{ctx,meter});
      for(const event of ['playing','ended','pause','error'])this.addEventListener(event,()=>observed.events.push({event,cue:this.dataset.cue,at:performance.now(),currentTime:this.currentTime}));
      setInterval(()=>{if(this.paused)return;const s=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(s);const peak=Math.max(...s.map(Math.abs));
        observed.frames.push({cue:this.dataset.cue,at:performance.now(),peak,volume:this.volume,samples:peak>.001?Array.from(s.slice(0,24)):[]});},20);
    }
    nodes.get(this).ctx.resume();observed.events.push({event:'play',cue:this.dataset.cue,at:performance.now(),volume:this.volume});
    return play.call(this);
  };
})()'''

def check(name,ok,detail=None):
    report['checks'][name]={'passed':bool(ok),'detail':detail}
    if not ok:raise AssertionError(name+': '+str(detail))
def until(page,condition,timeout=12):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        if page.evaluate(condition):return
        page.wait_for_timeout(25)
    raise AssertionError('Timed out: '+condition)
def count(page,cue):return page.evaluate('(cue)=>observed.events.filter(e=>e.event==="play"&&e.cue===cue).length',cue)
def record(page,name):
    data=page.evaluate('({events:observed.events,frames:observed.frames,waits:observed.waits})')
    (OUT/(name+'-waveform.json')).write_text(json.dumps(data,indent=2)+'\n')
    peaks={cue:max([f['peak'] for f in data['frames']if f['cue']==cue]or[0])for cue in ['hello','yay']}
    report['audio'][name]={'peak':peaks,'events':len(data['events']),'waits':data['waits']}
    return data,peaks
def volume(page,n):page.locator('#volume').evaluate('(el,n)=>{el.value=n;el.dispatchEvent(new Event("input",{bubbles:true}))}',n)
def pin(page,phrase,pos):
    page.locator('#phrase').fill(phrase);page.locator('#position').fill(str(pos));page.get_by_role('button',name='Pin',exact=True).click()

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox'])
    def open_page(accelerated=False):
        context=browser.new_context(viewport={'width':1366,'height':768});context.add_init_script(INSTRUMENT)
        if accelerated:context.add_init_script('window.accelerateAmbient=true')
        page=context.new_page();page.on('pageerror',lambda e:report['console_errors'].append(str(e)));page.goto(URL,wait_until='networkidle');return context,page
    context,page=open_page()
    check('fresh_page_waits_for_browser_activation',count(page,'hello')==0 and page.evaluate('observed.waits.length')==0)
    page.locator('#help-button').click();until(page,'observed.frames.some(f=>f.cue==="hello"&&f.peak>.001)');page.locator('#reader-done').click()
    until(page,'document.querySelector("#game-audio").paused')
    check('first_greeting_is_single_before_timer',count(page,'hello')==1)
    print('Observed first Hello waveform; waiting for the unaccelerated 45-second ambient timer.',flush=True)
    until(page,'observed.events.filter(e=>e.event==="play"&&e.cue==="hello").length===2',timeout=50)
    until(page,'observed.events.filter(e=>e.event==="ended"&&e.cue==="hello").length===2')
    data,peaks=record(page,'real-interval')
    first_wait=data['waits'][0];gap=first_wait['firedAt']-first_wait['scheduledAt']
    check('real_45_second_timer_fires_and_audio_is_non_silent',45000<=gap<47000 and peaks['hello']>.001,{'observed_interval_ms':gap,'hello_peak':peaks['hello']})
    check('ambient_hello_does_not_change_working_puzzle',page.locator('#progress').inner_text()=='0 / 256 letters filled')
    context.close()

    context,page=open_page(accelerated=True)
    page.locator('#help-button').click();page.locator('#reader-done').click();until(page,'document.querySelector("#game-audio").paused')
    page.locator('#sound').click();before=count(page,'hello');page.wait_for_timeout(1600)
    check('mute_cancels_timer_and_stays_silent',count(page,'hello')==before and page.evaluate('observed.timers.size')==0 and page.locator('#game-audio').evaluate('e=>e.paused'))
    page.locator('#sound').click();page.wait_for_timeout(150)
    check('unmute_starts_fresh_wait',count(page,'hello')==before and page.evaluate('observed.timers.size')==1)
    until(page,'observed.events.filter(e=>e.event==="play"&&e.cue==="hello").length>'+str(before))
    volume(page,0);before=count(page,'hello');page.wait_for_timeout(1600)
    check('zero_volume_stops_ambient_and_cancels_timer',count(page,'hello')==before and page.evaluate('observed.timers.size')==0 and page.locator('#game-audio').evaluate('e=>e.paused'))
    page.reload(wait_until='networkidle');page.locator('#wheel-next').click();page.wait_for_timeout(900)
    check('saved_zero_has_no_timer_or_sound',page.locator('#volume').input_value()=='0' and page.evaluate('observed.events.length===0&&observed.timers.size===0'))
    volume(page,35);page.wait_for_timeout(150);check('restore_volume_waits_before_ambient',count(page,'hello')==0)
    until(page,'observed.frames.some(f=>f.cue==="hello"&&f.peak>.001)')
    # Headless Chromium does not hide background tabs; exercise the browser handler explicitly.
    page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"))')
    check('simulated_document_hidden',page.evaluate('document.hidden'))
    before=count(page,'hello');page.wait_for_timeout(1600)
    check('simulated_hidden_document_stops_ambient_and_cancels_timer',count(page,'hello')==before and page.evaluate('observed.timers.size')==0 and page.locator('#game-audio').evaluate('e=>e.paused'))
    page.evaluate('delete document.hidden;document.dispatchEvent(new Event("visibilitychange"))');check('document_visible_after_simulated_return',not page.evaluate('document.hidden'))
    page.wait_for_timeout(150);check('visible_again_has_fresh_wait',count(page,'hello')==before and page.evaluate('observed.timers.size')==1)
    until(page,'observed.events.filter(e=>e.event==="play"&&e.cue==="hello").length>'+str(before))
    page.locator('#sound').click();page.reload(wait_until='networkidle');page.locator('#wheel-next').click();page.wait_for_timeout(900)
    check('saved_mute_has_no_timer_or_sound',page.locator('#sound').get_attribute('aria-pressed')=='false' and page.evaluate('observed.events.length===0&&observed.timers.size===0'))
    page.locator('#sound').click()
    # A wrong full worksheet must still be quiet, then recover via the public writing habits.
    page.locator('#link-source').select_option('text');page.locator('#starter').fill('AAAAAAAAAAAAAAAA');page.locator('#starter').press('Tab');page.wait_for_timeout(200)
    check('wrong_filled_sheet_has_no_yay',page.locator('#progress').inner_text()=='256 / 256 letters filled' and count(page,'yay')==0 and 'Message recovered'not in page.locator('#sheet-status').inner_text())
    page.locator('#reset').click();page.locator('#reset-confirm').click();page.locator('#link-source').select_option('text');pin(page,'HELLOHELLO',1);pin(page,'GOODNIGHT',248)
    until(page,'observed.events.some(e=>e.event==="playing"&&e.cue==="yay")');until(page,'observed.events.some(e=>e.event==="ended"&&e.cue==="yay")')
    data,peaks=record(page,'controls-and-celebration');events=data['events'];start=next(e['at']for e in events if e['event']=='playing'and e['cue']=='yay');end=next(e['at']for e in events if e['event']=='ended'and e['cue']=='yay')
    check('correct_recovery_plays_non_silent_yay_once',count(page,'yay')==1 and peaks['yay']>.001 and 'Message recovered'in page.locator('#sheet-status').inner_text(),peaks)
    attempts=sum(start<w['firedAt']<end for w in data['waits']if w['firedAt']is not None)
    check('ambient_never_interrupts_yay',attempts>0 and not any(start<e['at']<end and e['event']=='play'for e in events),{'yay_duration_ms':end-start,'timer_attempts_during_cheer':attempts})
    page.locator('#sound').click();context.close()

    # Deployed public files must be exactly the staged sources, including fixed evidence.
    public=[];client=browser.new_context()
    for file in sorted((ROOT/'challenge/public').rglob('*')):
        if file.is_file():
            path=file.relative_to(ROOT/'challenge/public').as_posix();body=client.request.get(URL+'/'+path).body()
            public.append({'path':path,'sha256':hashlib.sha256(body).hexdigest(),'matches_stage':body==file.read_bytes()})
    check('deployed_public_files_match_stage',all(x['matches_stage']for x in public),public)
    check('no_browser_console_errors',not report['console_errors'])
    browser.close()
report['passed']=True
(OUT/'ambient-browser-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':True,'checks':len(report['checks']),'audio':report['audio']},indent=2))
