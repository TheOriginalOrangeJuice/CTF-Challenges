"""Focused soundtrack replacement checks and current walkthrough captures, in Condev."""
import argparse, hashlib, json, pathlib, subprocess, sys, urllib.request, wave, zipfile
import numpy as np
from playwright.sync_api import sync_playwright

root=pathlib.Path(__file__).resolve().parents[2]
pub=root/'challenge/public'
parser=argparse.ArgumentParser();parser.add_argument('output');args=parser.parse_args()
out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True)
shots=out/'screenshots';shots.mkdir(exist_ok=True)
base='http://host.docker.internal:18114/'
report={'checks':{},'tested_files':{},'limits':['Human listening and independent acoustic fingerprinting not performed','Chromium tested; Firefox not rechecked','Unchanged puzzle solve suite not rerun; original evidence, project, transforms, decoder and flag master checked byte-for-byte','Canonical captures use already accepted organizer coordinates; not a new independent solve','Rights provenance recorded; no redistribution license established']}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def check(name,condition,details=None):
    report['checks'][name]={'pass':bool(condition),'details':details}
    print(name,bool(condition),details if details is not None else '',flush=True)
def save_report():
    (out/'soundtrack-review.json').write_text(json.dumps(report,indent=2)+'\n')

baseline=json.loads((root/'organizer/review/soundtrack-protected-baseline.json').read_text(encoding='utf-8-sig'))
changed=[p for p,h in baseline.items() if sha(root/p)!=h]
check('puzzle_evidence_and_logic_unchanged',not changed,{'files':len(baseline),'changed':changed})
manifest=json.loads((root/'organizer/asset-hashes.json').read_text())
check('asset_hashes_match',all(sha(root/p)==h for p,h in manifest.items()))
before={p:sha(pub/'media'/p) for p in ['holdin_on_mlg_excerpt.wav','recovered-project.zip']}
subprocess.run([sys.executable,str(root/'organizer/generate.py'),'--audio-only'],check=True)
check('frozen_audio_and_archive_repeatability',before=={p:sha(pub/'media'/p) for p in before},before)
check('audio_only_did_not_change_protected_evidence',all(sha(root/p)==h for p,h in baseline.items()))
with zipfile.ZipFile(pub/'media/recovered-project.zip') as z:
    check('recovery_archive_uses_new_audio','media/holdin_on_mlg_excerpt.wav' in z.namelist() and not any('airhorns_and_bad_decisions' in p for p in z.namelist()))
    check('archive_bytes_and_stable_metadata',all(z.read(i.filename)==(pub/i.filename).read_bytes() and i.date_time==(2013,7,12,16,20,0) for i in z.infolist()) and z.namelist()==sorted(z.namelist()))
for p in sorted(pub.rglob('*')):
    if p.is_file():
        rel=p.relative_to(pub).as_posix();expected=sha(p);actual=hashlib.sha256(urllib.request.urlopen(base+rel).read()).hexdigest()
        report['tested_files'][rel]=expected
        if actual!=expected:raise AssertionError('Served file differs: '+rel)
check('served_files_match_staged_source',True,len(report['tested_files']))
with wave.open(str(pub/'media/holdin_on_mlg_excerpt.wav'),'rb') as w:
    params={'channels':w.getnchannels(),'sample_width':w.getsampwidth(),'sample_rate':w.getframerate(),'frames':w.getnframes()}
    pcm=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,2)/32768
check('audio_format_and_duration',params=={'channels':2,'sample_width':2,'sample_rate':22050,'frames':441000},params)
check('non_silent_excerpt_and_quiet_endcard',float(np.sqrt(np.mean(pcm[:330750]**2)))>.03 and np.all(pcm[352800:]==0),{'peak':float(np.max(np.abs(pcm))),'rms':float(np.sqrt(np.mean(pcm**2)))})
project=json.loads((pub/'media/Final_Final_REAL.recovery.json').read_text());solution=json.loads((root/'organizer/solution.json').read_text())
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1366,'height':768},reduced_motion='reduce');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base,wait_until='networkidle');page.locator('#loading').wait_for(state='hidden')
    def act(name):page.locator('button[data-action="'+name+'"]:visible').first.click()
    def shot(name):page.screenshot(path=str(shots/name))
    check('default_no_autoplay',page.locator('#soundtrack').evaluate('(a)=>a.paused'))
    check('fresh_project_starts_at_excerpt_beginning',page.locator('#seek').input_value()=='0' and page.locator('#event-source').input_value()=='intro-0')
    check('correct_media_reference',page.locator('#soundtrack').get_attribute('src')=='media/holdin_on_mlg_excerpt.wav')
    check('correct_visible_track_title','Skrillex' in page.locator('.audio-event').inner_text() and 'My Hope Will Never Die' in page.locator('#tracks').inner_text())
    waveform=page.locator('#soundtrack-waveform').evaluate('''c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let active=0,tail=0;for(let x=0;x<c.width;x++){let ink=false;for(let y=0;y<c.height;y++)if(a[(y*c.width+x)*4+3])ink=true;if(ink){if(x<915)active++;else tail++}}return {active,tail}}''')
    check('actual_sample_waveform_and_quiet_tail',waveform['active']>800 and waveform['tail']<=1,waveform)
    shot('01-editor-1366.png')
    page.evaluate('''()=>{window.probe=new AudioContext();const source=probe.createMediaElementSource(document.querySelector('#soundtrack'));window.analyser=probe.createAnalyser();analyser.fftSize=2048;source.connect(analyser);analyser.connect(probe.destination)}''')
    def rms():return page.evaluate('''async()=>{let a=new Float32Array(2048),sum=0,count=0;for(let j=0;j<12;j++){await new Promise(r=>setTimeout(r,30));analyser.getFloatTimeDomainData(a);for(let v of a){sum+=v*v;count++}}return Math.sqrt(sum/count)}''')
    def meters():return page.evaluate("[...document.querySelectorAll('#meter-left,#meter-right')].map(x=>parseFloat(x.style.height)||0)")
    act('start');page.locator('#play').click();page.evaluate('probe.resume()');page.wait_for_timeout(300)
    signal=rms();check('actual_browser_output',signal>.001,signal);check('meters_follow_playback',all(x>0 for x in meters()),meters())
    page.locator('#mute').click();page.wait_for_timeout(100);muted=rms();check('mute_silences_output',muted<1e-7,muted);check('mute_clears_meters',all(x==0 for x in meters()))
    page.locator('#mute').click();page.locator('#volume').fill('0');page.wait_for_timeout(100);zero=rms();check('zero_volume_silences_output',zero<1e-7,zero)
    page.locator('#volume').fill('25');restored=rms();check('volume_restores_output',restored>.001,restored)
    page.locator('#play').click();page.wait_for_timeout(100);paused=rms();check('pause_silences_output_and_meters',paused<1e-7 and all(x==0 for x in meters()),paused)
    at=page.locator('#soundtrack').evaluate('(a)=>a.currentTime');page.wait_for_timeout(200);check('pause_stops_audio_clock',abs(page.locator('#soundtrack').evaluate('(a)=>a.currentTime')-at)<.01)
    page.locator('#seek').evaluate("e=>{e.value='10';e.dispatchEvent(new Event('input',{bubbles:true}))}");page.wait_for_timeout(100);check('seek_sets_recording_position',abs(page.locator('#soundtrack').evaluate('(a)=>a.currentTime')-10)<.05)
    page.locator('#play').click();check('seeked_excerpt_produces_output',rms()>.001)
    act('large-preview');check('preview_pauses_both_media',page.evaluate("document.querySelector('#soundtrack').paused&&document.querySelector('#footage').paused"));page.locator('#close-modal').click();check('preview_close_keeps_audio_stopped',rms()<1e-7)
    page.locator('#seek').evaluate("e=>{e.value='17';e.dispatchEvent(new Event('input',{bubbles:true}))}");page.locator('#play').click();check('quiet_endcard_is_real_pcm_silence',rms()<1e-7);page.locator('#play').click()
    page.locator('#mute').click();page.reload(wait_until='networkidle');page.locator('#loading').wait_for(state='hidden')
    check('audio_preferences_persist',page.locator('#volume').input_value()=='25' and page.locator('#mute').get_attribute('aria-pressed')=='true')
    page.locator('#mute').click();page.locator('#volume').fill('45')
    # Re-capture existing walkthrough states with unchanged accepted coordinates.
    page.locator('#details-tab').click()
    for i in range(6):page.locator('#event-source').select_option('end-'+str(i));page.locator('#alpha-mode').select_option('none')
    shot('02-alpha-only.png');page.locator('#event-source').select_option('end-0');act('inspect');page.locator('#inspect-mode').select_option('none')
    page.locator('#sample-x').fill('606');page.locator('#sample-y').fill('382');shot('03-rgb-inspector.png');page.locator('#close-modal').click()
    for i,spec in enumerate(solution['events']):
        page.locator('#event-source').select_option(spec['event']);act('crop')
        for key in ['x','y','w','h']:page.locator('#crop-'+key).fill(str(spec['crop'][key]))
        if i==0:shot('04-source-crop.png')
        page.locator('#apply-crop').click();page.locator('#flip-x').set_checked(spec['flipX']);page.locator('#flip-y').set_checked(spec['flipY'])
        for key in ['x','y','w','h']:
            field=page.locator('#place-'+key);field.fill(str(spec['placement'][key]));field.press('Tab')
        if i==2:shot('05-partial-assembly.png')
    page.locator('#guides').click();shot('06-restored-1366.png')
    page.set_viewport_size({'width':1920,'height':1080});shot('07-restored-1920.png');act('large-preview');shot('08-endcard-preview.png')
    check('no_browser_errors',not errors,errors);browser.close()
save_report()
if not all(c['pass'] for c in report['checks'].values()):raise SystemExit(1)
