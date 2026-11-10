"""Independent interface/audio checks following public-evidence recovery."""
import hashlib, io, json, pathlib, re, sys, wave
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=pathlib.Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=True)
BASE='http://host.docker.internal:18113';FLAG='RCC{STAY_QUIET_VJQZKXMPYBNDFLRAS}'
report={'checks':{},'issues':[],'page_errors':[],'human_listening':'not performed','human_playtesting':'not performed'}
def check(name,passed,detail=None):
    report['checks'][name]={'passed':bool(passed),'detail':detail}
    if not passed:report['issues'].append(name)
def pin(page,text,pos):
    page.locator('#phrase').fill(text);page.locator('#position').fill(str(pos));page.get_by_role('button',name='Pin',exact=True).click()
def progress(page):return page.locator('#progress').inner_text()
AUDIO='''(() => {
 const original=HTMLMediaElement.prototype.play;
 window.reviewAudio={events:[],frames:[],ctx:null,nodes:new Map()};
 HTMLMediaElement.prototype.play=function(){
   const a=window.reviewAudio;if(!a.ctx)a.ctx=new AudioContext();
   if(!a.nodes.has(this)){const source=a.ctx.createMediaElementSource(this),node=a.ctx.createAnalyser();
     node.fftSize=1024;source.connect(node);node.connect(a.ctx.destination);a.nodes.set(this,node);}
   a.ctx.resume();a.events.push({src:this.src,volume:this.volume});return original.call(this);
 };
 setInterval(()=>{const a=window.reviewAudio;for(const [el,node] of a.nodes){
   const s=new Float32Array(node.fftSize);node.getFloatTimeDomainData(s);
   const peak=Math.max(...s.map(Math.abs)),rms=Math.sqrt(s.reduce((sum,v)=>sum+v*v,0)/s.length);
   a.frames.push({src:el.src,peak,rms,volume:el.volume,paused:el.paused,samples:peak>.0001?Array.from(s.slice(0,128)):[]});
 }},10);
})()'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1366,'height':768},reduced_motion='reduce');context.add_init_script(AUDIO)
    page=context.new_page();page.on('pageerror',lambda e:report['page_errors'].append(str(e)));page.goto(BASE,wait_until='networkidle')
    public=[]
    for local in sorted((ROOT/'challenge/public').rglob('*')):
        if not local.is_file():continue
        path=local.relative_to(ROOT/'challenge/public').as_posix();response=page.request.get(BASE+'/'+path);served=response.body()
        public.append({'path':path,'sha256':hashlib.sha256(served).hexdigest(),'matches_staged':served==local.read_bytes(),'status':response.status})
    check('served_public_tree_matches_fresh_stage',all(x['matches_staged'] and x['status']==200 for x in public),public)
    text_public=b'\n'.join(x.read_bytes() for x in (ROOT/'challenge/public').rglob('*') if x.suffix in {'.js','.json','.txt','.html','.css'})
    check('literal_recovered_flag_absent_from_public_source',FLAG.encode() not in text_public)
    boundary={path:page.request.get(BASE+path).status for path in ['/organizer/generate.py','/Description.md','/Description.docx','/.dockerignore','/app.js.map']}
    check('private_files_not_published',all(n in (403,404) for n in boundary.values()),boundary)
    evidence_before=page.request.get(BASE+'/evidence.json').body();check('new_context_empty',progress(page)=='0 / 256 letters filled')
    pin(page,'',1);check('empty_phrase_error','at least one' in page.locator('#status').inner_text())
    pin(page,'XX',256);check('overflow_phrase_error','outside the message' in page.locator('#status').inner_text())
    page.locator('#wheel-prev').click();check('wheel_wraps_back',page.locator('#wheel-guess').input_value()=='Z')
    page.locator('#wheel-next').click();check('wheel_wraps_forward',page.locator('#wheel-guess').input_value()=='A')
    page.locator('#wheel-guess').fill('H');page.locator('#pin-wheel').focus();page.keyboard.press('Enter');check('keyboard_wheel_pin',progress(page)=='1 / 256 letters filled');page.locator('#undo').click()
    page.get_by_role('button',name='Code letter 2: B',exact=True).focus();page.keyboard.press('Enter')
    focused=page.evaluate("({tag:document.activeElement.tagName,aria:document.activeElement.getAttribute('aria-label'),id:document.activeElement.id})")
    check('ribbon_keyboard_focus_survives_selection',focused.get('aria')=='Code letter 2: B',focused)
    page.locator('#section-select').select_option('16');check('section_moves_selection','Letter 17 selected'==page.locator('#selected-label').inner_text())
    page.locator('#link-offset').fill('0');page.locator('#link-offset').press('Tab');check('invalid_offset_preserves_valid',page.locator('#link-offset').input_value()=='16')
    page.locator('#starter').fill('ABC!');page.locator('#starter').press('Tab');check('invalid_starter_rejected',page.locator('#starter').input_value()=='')
    pin(page,'HELLOHELLO',1);check('pins_require_feedback_choice',progress(page)=='10 / 256 letters filled')
    page.locator('#link-source').select_option('text');check('greeting_partial',progress(page)=='160 / 256 letters filled')
    partial=page.locator('#message').inner_text();check('greeting_cannot_read_entire_flag',FLAG not in partial and '·' in re.search(r'RCC\{[^}]+\}',partial).group())
    pin(page,'Z',17);check('conflict_visible',page.locator('#conflict').is_visible());page.locator('#undo').click();check('undo_conflict',not page.locator('#conflict').is_visible())
    page.locator('#redo').click();check('redo_conflict',page.locator('#conflict').is_visible());page.locator('#undo').click()
    pin(page,'GOODNIGHT',248);check('two_crib_complete',FLAG in page.locator('#message').inner_text())
    page.locator('#link-offset').fill('15');page.locator('#link-offset').press('Tab');check('wrong_offset_conflicts',page.locator('#conflict').is_visible());page.locator('#undo').click()
    page.locator('[data-mode=sample]').click();check('sample_read_only',page.locator('#phrase').is_disabled() and page.locator('#link-source').is_disabled())
    page.locator('[data-mode=target]').click();check('switch_preserves_pins',FLAG in page.locator('#message').inner_text())
    page.reload(wait_until='networkidle');check('reload_preserves_pins',FLAG in page.locator('#message').inner_text())
    with page.expect_download() as d:page.locator('#save-work').click()
    work=d.value;work.save_as(str(OUT/'saved-work.json'));check('working_copy_filename',work.suggested_filename=='secret-club-working-copy.json')
    with page.expect_download() as d:page.locator('#download-message').click()
    memo=d.value;memo.save_as(str(OUT/'saved-message.txt'));check('message_download_exact',memo.suggested_filename=='05-working-message.txt' and (OUT/'saved-message.txt').read_text().strip()==page.locator('#message').inner_text().strip())
    page.locator('#reset').click();check('reset_initial_focus_safe',page.evaluate('document.activeElement.id')=='reset-cancel');page.keyboard.press('Escape');check('reset_escape_preserves_work',FLAG in page.locator('#message').inner_text())
    page.locator('#reset').click();page.locator('#reset-confirm').click();check('clear_empty',progress(page)=='0 / 256 letters filled');page.locator('#undo').click();check('clear_is_undoable',FLAG in page.locator('#message').inner_text())
    page.locator('#reset').click();page.locator('#reset-confirm').click();page.locator('#work-file').set_input_files(str(OUT/'saved-work.json'));check('working_copy_roundtrip',FLAG in page.locator('#message').inner_text())
    for payload in [b'{',b'{"version":"other"}',b'x'*100001]:
        page.locator('#work-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':payload});page.wait_for_timeout(30)
        check('invalid_work_preserves_'+str(len(payload)),FLAG in page.locator('#message').inner_text() and 'Current work was kept' in page.locator('#status').inner_text())
    page.locator('#help-button').click();page.keyboard.press('Escape');check('reader_restores_focus',page.evaluate('document.activeElement.id')=='help-button')
    page.locator('#copy-message').click();page.wait_for_timeout(30);copy_status=page.locator('#status').inner_text()
    check('copy_or_complete_fallback','Message copied.'==copy_status or (page.locator('#reader').is_visible() and FLAG in page.locator('#reader-content').inner_text()));page.keyboard.press('Escape')
    for control in ['minimize','close-app','show-desktop']:
        page.locator('#'+control).click();check(control+'_hides',page.locator('#app-window').is_hidden());page.locator('.task-button[data-open=club]').click();check(control+'_restores_work',FLAG in page.locator('#message').inner_text())
    page.locator('#maximize').click();check('maximize','maximized' in page.locator('#app-window').get_attribute('class'));page.locator('#maximize').click()
    page.locator('#start-button').click();check('start_menu_opens',page.locator('#start-menu').is_visible());page.keyboard.press('Escape');check('start_escape',page.locator('#start-menu').is_hidden())
    check('evidence_immutable_after_work',evidence_before==page.request.get(BASE+'/evidence.json').body())
    for size in [{'width':1366,'height':768},{'width':1920,'height':1080}]:
        page.set_viewport_size(size);page.wait_for_timeout(50);box=page.locator('.taskbar').bounding_box()
        check('layout_'+str(size['width']),page.evaluate('document.documentElement.scrollWidth<=innerWidth') and box['y']+box['height']<=size['height'],box)
        page.screenshot(path=str(OUT/('workstation-'+str(size['width'])+'.png')));page.locator('#open-message').click();page.screenshot(path=str(OUT/('memo-'+str(size['width'])+'.png')));page.keyboard.press('Escape')
    audio={}
    def capture(label):
        frames=page.evaluate('reviewAudio.frames');audio[label]={'peak':max([f['peak'] for f in frames] or [0]),'max_rms':max([f['rms'] for f in frames] or [0]),'events':page.evaluate('reviewAudio.events'),'frames':frames}
    def volume(n):page.locator('#volume').evaluate('(e,n)=>{e.value=n;e.dispatchEvent(new Event("input",{bubbles:true}))}',n)
    volume(100);page.evaluate('reviewAudio.frames=[];reviewAudio.events=[]');page.locator('#sound').click();page.wait_for_timeout(300);capture('volume100')
    for value in [20,0]:
        volume(value);page.evaluate('reviewAudio.frames=[];reviewAudio.events=[]');page.locator('#help-button').click();page.wait_for_timeout(300);capture('volume'+str(value));page.keyboard.press('Escape')
    volume(100);page.locator('#help-button').click();page.keyboard.press('Escape');page.locator('#sound').click();page.wait_for_timeout(50)
    page.evaluate('reviewAudio.frames=[];reviewAudio.events=[]');page.locator('#wheel-next').click();page.wait_for_timeout(150);capture('muted')
    check('audio_actual_non_silent',audio['volume100']['peak']>.001)
    check('audio_volume_scales',.10<audio['volume20']['peak']/audio['volume100']['peak']<.30)
    check('audio_zero_volume_silent',audio['volume0']['peak']<.00001)
    check('audio_mute_silent_no_play',audio['muted']['peak']<.00001 and not audio['muted']['events'])
    volume(0);page.reload(wait_until='networkidle');check('sound_preferences_persist',page.locator('#sound').get_attribute('aria-pressed')=='false' and page.locator('#volume').input_value()=='0')
    wavs={}
    for name in ['click','page','finish']:
        raw=page.request.get(BASE+'/audio/'+name+'.wav').body()
        with wave.open(io.BytesIO(raw)) as wav:wavs[name]={'channels':wav.getnchannels(),'rate':wav.getframerate(),'duration':wav.getnframes()/wav.getframerate()}
    report['wav_files']=wavs;(OUT/'audio-waveforms.json').write_text(json.dumps(audio))
    report['audio_summary']={k:{x:v[x] for x in ['peak','max_rms','events']} for k,v in audio.items()}
    errorpage=context.new_page();errorpage.route('**/evidence.json',lambda route:route.fulfill(status=503,body='unavailable'));errorpage.goto(BASE,wait_until='networkidle')
    check('load_error_explained','Could not open saved files' in errorpage.locator('#status').inner_text() and errorpage.locator('#phrase').is_disabled());errorpage.close()
    blocked=context.new_page();blocked.add_init_script('Storage.prototype.setItem=function(){throw new Error("disabled storage")}');blocked.goto(BASE,wait_until='networkidle')
    check('unavailable_storage_explained','Storage unavailable' in blocked.locator('#saved-state').inner_text());pin(blocked,'HELLOHELLO',1);check('unavailable_storage_work_still_usable',progress(blocked)=='10 / 256 letters filled');blocked.close()
    check('no_page_errors',not report['page_errors'],report['page_errors']);browser.close()
(OUT/'interaction-results.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'checks':len(report['checks']),'issues':report['issues'],'audio':report['audio_summary'],'page_errors':report['page_errors']},indent=2))
