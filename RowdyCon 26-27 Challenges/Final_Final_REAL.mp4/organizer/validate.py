"""Regression checks with private expected data; independent QA must public-solve.
Run inside verified Condev against the assigned challenge HTTP origin.
"""
from pathlib import Path
import argparse,base64,hashlib,io,json,time,urllib.request,wave,zipfile,zlib
import numpy as np
from PIL import Image,ImageOps
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];PUB=ROOT/'challenge'/'public'
def digest(b):return hashlib.sha256(b).hexdigest()
def require(condition,message):
    if not condition:raise AssertionError(message)

def artifacts():
    project=json.loads((PUB/'media'/'Final_Final_REAL.recovery.json').read_text())
    solution=json.loads((ROOT/'organizer'/'solution.json').read_text())
    rebuilt=Image.new('RGB',(1152,648));samples={}
    for spec in solution['events']:
        source=next(s for s in project['sources'] if s['id']==spec['source']);path=PUB/source['file'];im=Image.open(path).convert('RGBA');a=np.asarray(im)
        require(digest(path.read_bytes())==source['sha256'],'Carrier digest mismatch')
        c=spec['crop'];tile=a[c['y']:c['y']+c['h'],c['x']:c['x']+c['w']]
        require(np.all(tile[:,:,3]==0),'Hidden piece is not entirely transparent')
        require(len(np.unique(tile[:,:,:3].reshape(-1,3),axis=0))>1000,'Hidden RGB was flattened')
        piece=Image.fromarray(tile[:,:,:3])
        if spec['flipX']:piece=ImageOps.mirror(piece)
        if spec['flipY']:piece=ImageOps.flip(piece)
        rebuilt.paste(piece,(spec['placement']['x'],spec['placement']['y']))
        samples[source['id']]={'hash':zlib.crc32(a.tobytes()),'sample':a[c['y']+30,c['x']+30].tolist(),'x':c['x']+30,'y':c['y']+30}
    master=Image.open(ROOT/'organizer'/'endcard-master.png').convert('RGB')
    require(np.array_equal(np.asarray(rebuilt),np.asarray(master)),'Independent Pillow reconstruction differs from master')
    flag=solution['flag'].encode()
    for p in PUB.rglob('*'):
        if p.is_file() and p.suffix in {'.js','.html','.json','.txt','.css','.svg'}:require(flag not in p.read_bytes(),'Plaintext answer in public file: '+str(p))
    with zipfile.ZipFile(PUB/'media'/'recovered-project.zip') as z:
        require(z.namelist()==sorted(z.namelist()),'ZIP order is unstable')
        for info in z.infolist():
            require(info.date_time==(2013,7,12,16,20,0),'ZIP timestamp varies');require(z.read(info.filename)==(PUB/info.filename).read_bytes(),'ZIP bytes do not match public evidence')
    with wave.open(str(PUB/'media'/'holdin_on_mlg_excerpt.wav'),'rb') as wav:
        pcm=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2')/32767
        require(.01<float(np.sqrt(np.mean(pcm**2)))<.3,'Audio is silent or unexpectedly loud')
    return project,solution,samples

def browser_checks(url,output,project,solution,samples):
    output.mkdir(parents=True,exist_ok=True);console=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        context=browser.new_context(viewport={'width':1366,'height':768},accept_downloads=True)
        page=context.new_page();page.on('pageerror',lambda err:console.append(str(err)))
        page.goto(url,wait_until='networkidle');page.locator('#loading').wait_for(state='hidden',timeout=30000)
        page.screenshot(path=str(output/'01-editor-1366.png'))
        page.locator('#details-tab').click()
        # Browser decoder bytes must agree with an independent decoder, not canvas.
        hashes=page.evaluate('''async()=>{const {decodePNG,crc32}=await import('./pixels.js');const p=await fetch('media/Final_Final_REAL.recovery.json').then(r=>r.json());const result={};for(const s of p.sources){const decoded=await decodePNG(await fetch(s.file).then(r=>r.arrayBuffer()));result[s.id]=crc32(decoded.rgba);}return result;}''')
        for sid,record in samples.items():require(hashes[sid]==record['hash'],'Browser raw decode changed samples: '+sid)
        # Alpha-only edits leave the existing event crops in force.
        for i in range(6):page.locator('#event-source').select_option('end-'+str(i));page.locator('#alpha-mode').select_option('none')
        alpha_image=page.locator('#preview').evaluate('(c)=>c.toDataURL()')
        page.screenshot(path=str(output/'02-alpha-only.png'))
        page.locator('#event-source').select_option('end-0');page.locator('.toolbar [data-action="inspect"]').click();page.locator('#inspect-mode').select_option('none')
        record=samples['sample_text'];page.locator('#sample-x').fill(str(record['x']));page.locator('#sample-y').fill(str(record['y']))
        require('A    0' in page.locator('#rgba-values').inner_text(),'Inspector did not report zero alpha')
        page.screenshot(path=str(output/'03-rgb-inspector.png'));page.locator('#close-modal').click()
        # Solve through the real controls; private coordinates are the test oracle.
        for i,spec in enumerate(solution['events']):
            page.locator('#event-source').select_option(spec['event']);page.locator('.event-content [data-action="crop"]').click()
            for key in ['x','y','w','h']:page.locator('#crop-'+key).fill(str(spec['crop'][key]))
            if i==0:page.screenshot(path=str(output/'04-source-crop.png'))
            page.locator('#apply-crop').click();page.locator('#flip-x').set_checked(spec['flipX']);page.locator('#flip-y').set_checked(spec['flipY'])
            for key in ['x','y','w','h']:
                field=page.locator('#place-'+key);field.fill(str(spec['placement'][key]));field.press('Tab')
            if i==2:page.screenshot(path=str(output/'05-partial-assembly.png'))
        page.locator('#guides').click()
        with page.expect_download() as dl:page.locator('.preview-tools [data-action="export"]').click()
        exported=output/'recovered-endcard.png';dl.value.save_as(str(exported))
        expected=np.asarray(Image.open(ROOT/'organizer'/'endcard-master.png').convert('RGB'))
        require(np.array_equal(np.asarray(Image.open(exported).convert('RGB')),expected),'Browser export did not match the actual reconstructed source pixels')
        require(alpha_image!=page.locator('#preview').evaluate('(c)=>c.toDataURL()'),'Alpha-only state was already complete')
        page.screenshot(path=str(output/'06-restored-1366.png'))
        page.set_viewport_size({'width':1920,'height':1080});page.screenshot(path=str(output/'07-restored-1920.png'))
        page.locator('.preview-tools [data-action="large-preview"]').click();page.screenshot(path=str(output/'08-endcard-preview.png'));page.locator('#close-modal').click()
        # An arbitrary edit changes actual pixels; Undo restores them.
        page.locator('#place-x').fill('16');page.locator('#place-x').press('Tab')
        altered=page.locator('#preview').evaluate('(c)=>c.toDataURL()');page.keyboard.press('Control+z')
        require(altered!=page.locator('#preview').evaluate('(c)=>c.toDataURL()'),'Arbitrary edit did not alter the image')
        # Save/load/reload maintain authored edits and malformed data is rejected.
        before=page.evaluate("localStorage.getItem('sample-text-1-project')")
        page.reload(wait_until='networkidle');page.locator('#loading').wait_for(state='hidden')
        page.locator('#details-tab').click()
        require(page.evaluate("localStorage.getItem('sample-text-1-project')")==before,'Reload changed saved edit state')
        page.locator('#project-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"format":"montage-recovery-v1"}'})
        page.locator('#modal').wait_for(state='visible');require('unchanged' in page.locator('#dialog-body').inner_text(),'Bad import did not explain state preservation');page.locator('#close-modal').click()
        require(page.evaluate("localStorage.getItem('sample-text-1-project')")==before,'Malformed project changed edits')
        # Measure the actual browser audio signal; no claim of human listening.
        page.evaluate('''async()=>{window.audioProbe=new AudioContext();await audioProbe.resume();const s=audioProbe.createMediaElementSource(document.querySelector('#soundtrack'));window.audioAnalyser=audioProbe.createAnalyser();audioAnalyser.fftSize=2048;s.connect(audioAnalyser);audioAnalyser.connect(audioProbe.destination);}''')
        page.locator('[data-action="start"]').click();page.locator('#play').click();page.wait_for_timeout(1200)
        rms=page.evaluate('''()=>{const a=new Float32Array(2048);audioAnalyser.getFloatTimeDomainData(a);return Math.sqrt(a.reduce((n,x)=>n+x*x,0)/a.length);}''')
        require(rms>.001,'Browser audio output was silent')
        page.locator('#mute').click();page.wait_for_timeout(200)
        muted=page.evaluate('''()=>{const a=new Float32Array(2048);audioAnalyser.getFloatTimeDomainData(a);return Math.sqrt(a.reduce((n,x)=>n+x*x,0)/a.length);}''')
        require(muted<.0001,'Mute did not silence browser audio');page.locator('#play').click()
        require(not console,'Browser errors: '+repr(console))
        record={'raw_decoder':'passed','pillow_reconstruction':'passed','browser_control_reconstruction':'passed','export_pixel_equality':'passed','alpha_only_not_complete':'passed','arbitrary_edit_undo':'passed','reload_persistence':'passed','malformed_import_preserves_state':'passed','audio_rms':rms,'muted_audio_rms':muted,'browser_errors':console,'independent_public_solve':'not performed by developer regression','human_listening':'not performed','anti_agent_effectiveness':'not established'}
        record['public_sha256']={f.relative_to(PUB).as_posix():digest(f.read_bytes()) for f in sorted(PUB.rglob('*')) if f.is_file()}
        (ROOT/'organizer'/'validation.json').write_text(json.dumps(record,indent=2)+'\n');browser.close()
        return record

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:18114/');parser.add_argument('--output',type=Path,default=ROOT/'screenshots');args=parser.parse_args()
    project,solution,samples=artifacts();print(json.dumps(browser_checks(args.url,args.output,project,solution,samples),indent=2))
