"""Independent checks for authentic sound and exact-flag recovery revision."""
import hashlib,json,pathlib,re,sys
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=pathlib.Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=True)
BASE='http://host.docker.internal:18113';FLAG='RCC{STAY_QUIET_VJQZKXMPYBNDFLRAS}'
report={'checks':{},'issues':[],'page_errors':[],'audio':{},'human_listening':'not performed','human_playtesting':'not performed'}
def check(name,ok,detail=None):
    report['checks'][name]={'passed':bool(ok),'detail':detail}
    if not ok:report['issues'].append(name)
def pin(page,text,pos):
    page.locator('#phrase').fill(text);page.locator('#position').fill(str(pos));page.get_by_role('button',name='Pin',exact=True).click()
def solve(page):
    page.locator('#link-source').select_option('text');pin(page,'HELLOHELLO',1);pin(page,'GOODNIGHT',248)
def reset(page):page.locator('#reset').click();page.locator('#reset-confirm').click()
def events(page):return page.evaluate('reviewAudio.events')
def clear_audio(page):page.evaluate('reviewAudio.frames=[];reviewAudio.events=[]')
def wait_for(page,expression):
    for attempt in range(100):
        if page.evaluate(expression):return
        page.wait_for_timeout(100)
    raise AssertionError('Timed out: '+expression)
def finish_audio(page):wait_for(page,'!document.querySelector("#game-audio").src || document.querySelector("#game-audio").ended || document.querySelector("#game-audio").paused')
def volume(page,n):page.locator('#volume').evaluate('(e,n)=>{e.value=n;e.dispatchEvent(new Event("input",{bubbles:true}))}',n)
def capture_audio(page,name):
    frames=page.evaluate('reviewAudio.frames');ee=events(page)
    report['audio'][name]={'peak':max([f['peak'] for f in frames]or[0]),'events':ee,'sources':sorted(set(f['src'] for f in frames if f['peak']>.0001))}
    (OUT/(name+'-waveform.json')).write_text(json.dumps({'frames':frames,'events':ee}))
    return report['audio'][name]['peak']
AUDIO='''(() => {
 const original=HTMLMediaElement.prototype.play;
 window.reviewAudio={events:[],frames:[],ctx:null,nodes:new Map()};
 HTMLMediaElement.prototype.play=function(){const a=window.reviewAudio;
   if(!a.ctx)a.ctx=new AudioContext();
   if(!a.nodes.has(this)){const source=a.ctx.createMediaElementSource(this),node=a.ctx.createAnalyser();node.fftSize=1024;source.connect(node);node.connect(a.ctx.destination);a.nodes.set(this,node);
     for(const event of ['playing','ended','pause','error'])this.addEventListener(event,()=>a.events.push({event,cue:this.dataset.cue,src:this.currentSrc,time:this.currentTime,duration:this.duration,at:performance.now()}));}
   a.ctx.resume();a.events.push({event:'play',cue:this.dataset.cue,src:this.src,volume:this.volume,at:performance.now()});return original.call(this);
 };
 setInterval(()=>{const a=window.reviewAudio;for(const [el,node]of a.nodes){const s=new Float32Array(node.fftSize);node.getFloatTimeDomainData(s);const peak=Math.max(...s.map(Math.abs));
 a.frames.push({src:el.currentSrc,cue:el.dataset.cue,peak,volume:el.volume,paused:el.paused,samples:peak>.0001?Array.from(s.slice(0,128)):[]});}},10);
})()'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox'])
    client=browser.new_context();req=client.request
    corpus=req.get(BASE+'/evidence.json').json();version=corpus['version']
    plaintext=json.loads((ROOT/'organizer/review/public-solve.json').read_text())['recovered'];normalized=re.sub('[^A-Z]','',plaintext)
    def context_page(settings=None,storage_disabled=False,slow_hello=False):
        c=browser.new_context(viewport={'width':1366,'height':768},reduced_motion='reduce');c.add_init_script(AUDIO)
        if settings is not None:
            state={'state':{'anchors':{},'starter':'','link':'none','offset':16},'history':[],'future':[],'muted':False,'volume':.35,'helloDone':False,'celebrationDone':False}|settings
            c.add_init_script('if(!localStorage.getItem('+json.dumps(version)+'))localStorage.setItem('+json.dumps(version)+','+json.dumps(json.dumps(state))+');')
        if storage_disabled:c.add_init_script('Storage.prototype.setItem=function(){throw Error("disabled storage")};')
        if slow_hello:c.add_init_script('const nativePlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){this.playbackRate=this.dataset.cue==="hello"?.25:1;return nativePlay.call(this)};')
        page=c.new_page();page.on('pageerror',lambda e:report['page_errors'].append(str(e)));page.goto(BASE,wait_until='networkidle');return c,page
    public=[]
    for file in sorted((ROOT/'challenge/public').rglob('*')):
        if not file.is_file():continue
        path=file.relative_to(ROOT/'challenge/public').as_posix();r=req.get(BASE+'/'+path);body=r.body()
        public.append({'path':path,'sha256':hashlib.sha256(body).hexdigest(),'matches_stage':body==file.read_bytes(),'status':r.status})
    check('current_public_tree_parity',all(x['matches_stage']and x['status']==200 for x in public),public)
    source=b'\n'.join(x.read_bytes() for x in(ROOT/'challenge/public').rglob('*') if x.suffix in {'.js','.json','.html','.txt','.css'})
    digest=(ROOT/'challenge/completion.sha256').read_bytes().strip();check('public_has_neither_flag_nor_private_digest',FLAG.encode()not in source and digest not in source)
    denied={path:req.get(BASE+path).status for path in ['/server.py','/completion.sha256','/organizer/generate.py','/Description.md','/Description.docx','/.dockerignore','/audio/','/api/completion']}
    check('private_and_directory_boundaries',all(x in(403,404)for x in denied.values()),denied)
    for i,(candidate,expected)in enumerate([(FLAG,True),(FLAG.lower(),False),(FLAG+' ',False),(FLAG.replace('RAS','RAA'),False)]):
        r=req.post(BASE+'/api/completion',data={'flag':candidate});check('completion_'+str(i),r.status==200 and r.json()=={'valid':expected})
    for i,payload in enumerate([{},[],{'flag':None},{'flag':123}]):
        r=req.post(BASE+'/api/completion',data=payload);check('completion_invalid_schema_'+str(i),r.status==400)
    c,page=context_page()
    check('first_entry_ready_without_autoplay_failure',not events(page)and page.locator('#sound').get_attribute('aria-pressed')=='true')
    page.get_by_role('button',name=re.compile('01 - welcome')).click()
    wait_for(page,'reviewAudio.events.some(e=>e.event==="playing"&&e.cue==="hello")');finish_audio(page)
    ee=events(page);check('first_gesture_preserves_whole_hello',any(e['event']=='ended'and e['cue']=='hello'for e in ee)and[e['cue']for e in ee if e['event']=='play']==['hello'],ee)
    check('hello_actual_non_silent',capture_audio(page,'first-hello')>.001)
    clear_audio(page);page.locator('#reader-done').click();finish_audio(page);check('document_close_authentic_cue',capture_audio(page,'document-close')>.001 and any(e.get('cue')=='window'for e in events(page)))
    clear_audio(page);page.locator('#help-button').click();finish_audio(page);check('document_open_authentic_cue',capture_audio(page,'document-open')>.001 and any(e.get('cue')=='page'for e in events(page)));page.locator('#reader-done').click();finish_audio(page)
    page.reload(wait_until='networkidle');page.locator('#wheel-next').click();finish_audio(page);check('hello_once_across_reload',not any(e.get('cue')=='hello'for e in events(page)))
    for setting in[100,20,0]:
        volume(page,setting);clear_audio(page);page.locator('#minimize').click();finish_audio(page);capture_audio(page,'window-volume'+str(setting));page.locator('.task-button[data-open=club]').click();finish_audio(page);page.wait_for_timeout(180)
    ratio=report['audio']['window-volume20']['peak']/report['audio']['window-volume100']['peak'];check('volume_scales_real_waveform',.10<ratio<.30,ratio);check('zero_volume_silent',report['audio']['window-volume0']['peak']==0)
    volume(page,35);page.locator('#sound').click();clear_audio(page);page.locator('#wheel-next').click();page.wait_for_timeout(100);check('mute_silent_without_play',capture_audio(page,'muted')==0 and not events(page))
    page.get_by_role('button',name='Code letter 2: B',exact=True).focus();page.keyboard.press('Enter');check('ribbon_keyboard_focus_fixed',page.evaluate('document.activeElement.getAttribute("aria-label")')=='Code letter 2: B');c.close()
    c,page=context_page(storage_disabled=True);check('storage_failure_visible','Storage unavailable' in page.locator('#saved-state').inner_text());pin(page,'HELLOHELLO',1);check('storage_failure_still_usable',page.locator('#progress').inner_text()=='10 / 256 letters filled');c.close()
    c,page=context_page();page.keyboard.press('Tab');wait_for(page,'reviewAudio.events.some(e=>e.event==="playing"&&e.cue==="hello")');finish_audio(page);check('keyboard_first_entry_hello',capture_audio(page,'keyboard-hello')>.001);c.close()
    for label,setting in [('saved-muted',{'muted':True}),('saved-zero',{'volume':0})]:
        c,page=context_page(setting);page.get_by_role('button',name=re.compile('01 - welcome')).click();page.wait_for_timeout(150);check(label+'_no_play',not events(page));page.locator('#reader-done').click()
        if label=='saved-muted':page.locator('#sound').click()
        else:volume(page,35)
        wait_for(page,'reviewAudio.events.some(e=>e.event==="playing"&&e.cue==="hello")');finish_audio(page);check(label+'_explicit_enable_hello',capture_audio(page,label)>.001);c.close()
    c,page=context_page({'helloDone':True});page.locator('#help-button').click();finish_audio(page);page.locator('#reader-done').click();finish_audio(page)
    page.locator('#link-source').select_option('text');page.locator('#starter').fill('AAAAAAAAAAAAAAAA');page.locator('#starter').press('Tab');page.wait_for_timeout(250)
    check('full_gibberish_has_no_yay',page.locator('#progress').inner_text()=='256 / 256 letters filled'and not any(e.get('cue')=='yay'for e in events(page))and 'Message recovered'not in page.locator('#sheet-status').inner_text())
    wrong=normalized.replace('VJQZKXMPYBNDFLRAS','VJQZKXMPYBNDFLRAA');work={'version':version,'anchors':{str(i):v for i,v in enumerate(wrong)},'starter':'','link':'none','offset':16}
    page.locator('#work-file').set_input_files({'name':'wrong-working-copy.json','mimeType':'application/json','buffer':json.dumps(work).encode()});page.wait_for_timeout(300)
    check('wrong_flag_complete_sheet_no_yay',page.locator('#progress').inner_text()=='256 / 256 letters filled'and not any(e.get('cue')=='yay'for e in events(page))and 'Message recovered'not in page.locator('#sheet-status').inner_text())
    reset(page);clear_audio(page);solve(page);wait_for(page,'document.querySelector("#sheet-status").textContent.includes("Message recovered")');wait_for(page,'reviewAudio.events.some(e=>e.event==="playing"&&e.cue==="yay")');finish_audio(page)
    check('correct_flag_yay_non_silent',capture_audio(page,'correct-yay')>.001 and any(e.get('cue')=='yay'and e['event']=='ended'for e in events(page)));check('ordinary_solve_preserved',FLAG in page.locator('#message').inner_text())
    for size in[{'width':1366,'height':768},{'width':1920,'height':1080}]:
        page.set_viewport_size(size);page.wait_for_timeout(50);page.screenshot(path=str(OUT/('final-workstation-'+str(size['width'])+'.png')))
        page.locator('#open-message').click();page.screenshot(path=str(OUT/('final-memo-'+str(size['width'])+'.png')));page.locator('#reader-done').click()
        box=page.locator('.taskbar').bounding_box();check('final_layout_'+str(size['width']),page.evaluate('document.documentElement.scrollWidth<=innerWidth')and box['y']+box['height']<=size['height'])
    page.reload(wait_until='networkidle');page.locator('#wheel-next').click();page.wait_for_timeout(200);check('no_replayed_yay_after_reload',not any(e.get('cue')=='yay'for e in events(page)));c.close()
    c,page=context_page({'muted':True});solve(page);wait_for(page,'document.querySelector("#sheet-status").textContent.includes("Message recovered")');check('muted_correct_flag_visual_success',not events(page)and FLAG in page.locator('#message').inner_text())
    page.locator('#sound').click();finish_audio(page);check('unmute_has_no_old_yay',not any(e.get('cue')=='yay'for e in events(page)));c.close()
    c,page=context_page(slow_hello=True);page.locator('#help-button').click();wait_for(page,'reviewAudio.events.some(e=>e.event==="playing"&&e.cue==="hello")');page.keyboard.press('Escape')
    work={'version':version,'anchors':{str(i):v for i,v in enumerate(normalized)},'starter':'','link':'none','offset':16}
    page.locator('#work-file').set_input_files({'name':'recovered-working-copy.json','mimeType':'application/json','buffer':json.dumps(work).encode()});wait_for(page,'document.querySelector("#sheet-status").textContent.includes("Message recovered")')
    volume(page,0);page.wait_for_timeout(150);clear_audio(page);volume(page,35);page.wait_for_timeout(300);check('zero_clears_queued_yay',not any(e.get('cue')=='yay'for e in events(page)));c.close()
    c,page=context_page({'muted':True});page.route('**/api/completion',lambda route:route.fulfill(status=503,body='unavailable'));solve(page);wait_for(page,'document.querySelector("#status").textContent.includes("celebration check is unavailable")');check('checker_failure_preserves_decoded_flag',FLAG in page.locator('#message').inner_text());c.close()
    check('no_page_errors',not report['page_errors'],report['page_errors']);browser.close()
(OUT/'final-results.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'checks':len(report['checks']),'issues':report['issues'],'audio':{k:v['peak']for k,v in report['audio'].items()},'page_errors':report['page_errors']},indent=2))
