"""Final served/source parity, targeted fixes and handoff checks."""
import hashlib, io, json, pathlib, re, sys, urllib.parse, urllib.request, zipfile
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[2];out=pathlib.Path(sys.argv[1]);base='http://host.docker.internal:18114/'
data={'served_sha256':{},'checks':{},'limits':['Human playtesting/listening unperformed','Anti-agent effectiveness unestablished','Custom PNG inspector and recovery format; native Vegas compatibility not claimed']}
def check(k,v,details=None):data['checks'][k]={'pass':bool(v),'details':details};print(k,v,details or '',flush=True)
parity=[]
for p in sorted((root/'challenge/public').rglob('*')):
 if p.is_file():
    rel=p.relative_to(root/'challenge/public').as_posix();served=urllib.request.urlopen(base+rel).read();digest=hashlib.sha256(served).hexdigest();data['served_sha256'][rel]=digest
    if digest!=hashlib.sha256(p.read_bytes()).hexdigest():parity.append(rel)
check('served_source_parity',not parity,parity)
assets=json.loads((root/'organizer/asset-hashes.json').read_text());bad=[k for k,v in assets.items() if hashlib.sha256((root/k).read_bytes()).hexdigest()!=v];check('asset_manifest_current',not bad,bad)
archive=zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(base+'media/recovered-project.zip').read()));project=json.loads(archive.read('media/Final_Final_REAL.recovery.json'))
missing=[s[k] for s in project['sources'] for k in ['file','thumb'] if s[k] not in archive.namelist()];check('archive_references_complete',not missing,missing)
for s in project['sources']:check('carrier_hash_'+s['id'],hashlib.sha256(archive.read(s['file'])).hexdigest()==s['sha256'])
md=(root/'Description.md').read_text();links=re.findall(r'\]\(([^)]+)\)',md);missing=[x for x in links if not x.startswith(('http:','https:','#')) and not (root/urllib.parse.unquote(x)).exists()];check('markdown_local_links',not missing,missing)
check('canonical_sections',re.findall(r'^## (.+)$',md,re.M)==['Description','Files','Hint(s)','Walkthrough','Flag'])
data['word_present']=(root/'Description.docx').exists()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':1366,'height':768},reduced_motion='reduce')
 page.goto(base);page.locator('#loading').wait_for(state='hidden');check('initial_active_event',page.locator('#event-source').input_value()=='intro-0')
 check('no_automatic_audio_playback',page.evaluate("document.querySelector('#soundtrack').paused"))
 page.screenshot(path=str(out/'final-initial-1366.png'),full_page=True)
 if page.locator('#details-tab').count():page.locator('#details-tab').click()
 page.locator('[data-source="doritos"]').focus();page.keyboard.press('Enter');check('media_keyboard_focus_fixed',page.evaluate("document.activeElement.dataset.source")=='doritos')
 page.locator('[data-event="intro-4"]').focus();page.keyboard.press('Enter');check('timeline_keyboard_focus_fixed',page.evaluate("document.activeElement.dataset.event")=='intro-4')
 page.locator('[data-track-mute="4"]').focus();page.keyboard.press('Enter');check('track_keyboard_focus_fixed',page.evaluate("document.activeElement.dataset.trackMute")=='4')
 page.locator('[data-menu="file-menu"]').click();page.keyboard.press('Escape');focused=page.evaluate("({tag:document.activeElement.tagName,action:document.activeElement.dataset.action||null,menu:document.activeElement.dataset.menu||null,visible:!!document.activeElement.getClientRects().length})");check('escape_menu_focus_restored',focused['menu']=='file-menu' and focused['visible'],focused)
 event=page.locator('#event-source').input_value();page.locator('#place-x').fill('83')
 with page.expect_download() as d:page.keyboard.press('Control+s')
 d.value.save_as(out/'shortcut-save-draft.json');draft=json.loads((out/'shortcut-save-draft.json').read_text());draftx=next(e['placement']['x'] for e in draft['events'] if e['id']==event)
 check('save_shortcut_includes_current_numeric_draft',draftx==83,{'displayed':83,'saved':draftx})
 downloads=[];page.on('download',lambda d:downloads.append(d.suggested_filename));page.locator('#place-w').fill('0');page.keyboard.press('Control+s');page.wait_for_timeout(100)
 check('invalid_numeric_draft_blocks_save',page.locator('#modal').is_visible() and not downloads,{'downloads':downloads,'dialog':page.locator('#dialog-title').inner_text()})
 if page.locator('#modal').is_visible():page.keyboard.press('Escape')
 for w,h in [(1366,768),(1920,1080)]:
    page.set_viewport_size({'width':w,'height':h});sizes=page.evaluate("({inner:innerHeight,doc:document.documentElement.scrollHeight,body:document.body.scrollHeight})");check(f'viewport_height_{w}',sizes['doc']==h,sizes)
 page.locator('#project-file').set_input_files(str(out/'saved-project.json'));page.locator('button[data-action="large-preview"]:visible').first.click();page.screenshot(path=str(out/'final-reward-1920.png'),full_page=True)
 page.keyboard.press('Escape');page.locator('button[data-action="start"]:visible').first.click();page.locator('#play').click();page.wait_for_timeout(600)
 meters=lambda:page.evaluate("[...document.querySelectorAll('#meter-left,#meter-right')].map(x=>parseFloat(x.style.height)||0)")
 playing=meters();check('stereo_meters_respond',len(playing)==2 and all(v>0 for v in playing),playing)
 page.locator('#play').click();page.wait_for_timeout(100);paused=meters();check('stereo_meters_clear_on_pause',len(paused)==2 and all(v==0 for v in paused),paused)
 page.locator('#play').click();page.wait_for_timeout(200);page.locator('#mute').click();page.wait_for_timeout(100);muted=meters();check('stereo_meters_clear_on_mute',len(muted)==2 and all(v==0 for v in muted),muted)
 page.locator('#mute').click();page.wait_for_timeout(200);page.locator('button[data-action="inspect"]:visible').first.click();paused=meters();check('stereo_meters_clear_on_dialog',len(paused)==2 and all(v==0 for v in paused),paused)
 b.close()
(out/'final-review.json').write_text(json.dumps(data,indent=2));print(json.dumps(data,indent=2),flush=True)
