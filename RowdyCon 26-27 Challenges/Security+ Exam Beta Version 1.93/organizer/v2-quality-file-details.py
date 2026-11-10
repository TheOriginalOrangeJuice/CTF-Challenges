"""Focused Q10 file-inspector review; execute only after root confirms new live stage.

Condev only. Root owns staging, dependencies and service lifecycle. Public actions
are used solely to reach Q10; no broad solve or prior checks are repeated.
"""
import argparse
import hashlib
import json
from pathlib import Path
import traceback
import uuid
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--tree',required=True,help='Root-confirmed fresh verified Condev challenge tree')
parser.add_argument('--output',required=True,help='Fresh isolated Condev evidence directory')
parser.add_argument('--base',default='http://localhost:18115')
args=parser.parse_args()
tree=Path(args.tree);out=Path(args.output);out.mkdir(exist_ok=False)
report={'stage':str(tree),'scope':'Q10 FILE DETAILS visibility, complete content, scrolling, mouse and keyboard close, Escape/focus restoration, folders afterward.',
        'navigation':'Ordinary public action requests reach Q10; this is not another full UI solve.',
        'human_playtest':False,'source_sha256':{},'viewports':[],'errors':[]}
for relative in ['challenge/client/src/questions.tsx','challenge/client/src/redesign.css']:
 report['source_sha256'][relative]=hashlib.sha256((tree/relative).read_bytes()).hexdigest()

with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True)
 ctx=browser.new_context(viewport={'width':1366,'height':768})
 ctx.request.post(args.base+'/api/session',headers={'Origin':args.base})
 def state():return ctx.request.get(args.base+'/api/state').json()['state']
 def op(name,**payload):
  s=state();r=ctx.request.post(args.base+'/api/action',headers={'Origin':args.base},data={
   'attempt':s['attempt'],'revision':s['revision'],'q':s['q'],'questionVersion':2,'requestId':str(uuid.uuid4()),'kind':'play','op':name,'args':payload})
  assert r.ok,(r.status,r.text())
 page=ctx.new_page();page.set_default_timeout(5000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
 def focus():return page.evaluate("({tag:document.activeElement.tagName,text:document.activeElement.textContent,label:document.activeElement.getAttribute('aria-label')})")
 def screenshot(name):page.screenshot(path=str(out/(name+'.png')),full_page=True)
 def closed():page.get_by_role('region',name='Device 04 file details',exact=True).wait_for(state='detached')
 try:
  op('place-plus',index=1);op('answer',index=1);op('restart-service')
  op('select-factor',id='password');op('select-factor',id='key');op('move-key',to='shredder');op('shred')
  op('move-intern',inside=False);op('grant',permission='READ');op('move-gate',to='junction');op('activate')
  op('toggle',target='ethernet',on=False);op('toggle',target='wifi',on=False)
  op('fold',folded=True);op('encrypt',recipient='Bob');op('send')
  op('overlay',visible=False);op('edit',field='employeeId',value='');op('edit',field='comment',value='');op('publish')
  assert state()['q']==10
  page.goto(args.base,wait_until='networkidle');page.get_by_role('button',name='RESUME',exact=True).click();page.locator('.q10').wait_for()
  original=state();facts=original['facts'];expected=facts.get('releases') or facts.get('folders')
  for width,height in [(1366,768),(1920,1080)]:
   page.set_viewport_size({'width':width,'height':height})
   page.wait_for_function("Math.abs(parseFloat(document.querySelector('.scaled-frame').style.width)-550*Math.max(.55,Math.min((innerWidth-30)/550,(innerHeight-30)/400,2)))<.1")
   checks={'viewport':[width,height]}
   toggle=page.get_by_role('button',name='FILE DETAILS',exact=True)
   toggle.click();region=page.get_by_role('region',name='Device 04 file details',exact=True);region.wait_for()
   button=page.get_by_role('button',name='CLOSE FILE DETAILS ×',exact=True)
   checks['initial_focus']=focus()
   checks['close_button_geometry']=button.evaluate(r'''e=>{const r=e.getBoundingClientRect(),s=document.querySelector('.stage').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {insideStage:r.left>=s.left&&r.right<=s.right&&r.top>=s.top&&r.bottom<=s.bottom,centerReachable:e.contains(hit),width:r.width,height:r.height};}''')
   pre=page.get_by_label('Release file contents',exact=True)
   checks['complete_json_matches_public_evidence']=json.loads(pre.inner_text())==expected
   checks['before_scroll']=pre.evaluate('(e)=>({top:e.scrollTop,height:e.clientHeight,content:e.scrollHeight})')
   pre.focus();page.keyboard.press('PageDown')
   page.wait_for_function("document.querySelector('.file-details pre').scrollTop>0")
   checks['after_keyboard_scroll']=pre.evaluate('(e)=>({top:e.scrollTop,height:e.clientHeight,content:e.scrollHeight})')
   pre.hover();page.mouse.wheel(0,1200)
   checks['after_wheel_scroll']=pre.evaluate('(e)=>({top:e.scrollTop,height:e.clientHeight,content:e.scrollHeight})')
   screenshot(f'q10-details-scrolled-{width}')
   button.click();closed();checks['mouse_close_focus']=focus()
   checks['folders_accessible']=page.locator('.folder-object').evaluate_all(r'''es=>es.map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {label:e.getAttribute('aria-label'),enabled:!e.disabled,centerReachable:e.contains(hit)};})''')
   screenshot(f'q10-after-mouse-close-{width}')
   toggle.click();region.wait_for();pre.focus();page.keyboard.press('Escape');closed();checks['escape_focus']=focus()
   toggle.focus();page.keyboard.press('Enter');region.wait_for();checks['keyboard_open_focus']=focus()
   page.keyboard.press('Enter');closed();checks['keyboard_close_focus']=focus()
   page.locator('[data-piece="file-approved"]').focus();page.keyboard.press('Space')
   checks['folder_keyboard_pickup']=page.locator('[data-piece="file-approved"]').get_attribute('aria-pressed')
   page.keyboard.press('Escape');checks['folder_keyboard_cancel']=page.locator('[data-piece="file-approved"]').get_attribute('aria-pressed')
   checks['passed']=checks['complete_json_matches_public_evidence'] and checks['close_button_geometry']['insideStage'] and checks['close_button_geometry']['centerReachable'] and all(x['enabled'] and x['centerReachable'] for x in checks['folders_accessible']) and all(checks[k]['text']=='FILE DETAILS' for k in ['mouse_close_focus','escape_focus','keyboard_close_focus']) and checks['keyboard_open_focus']['text']=='CLOSE FILE DETAILS ×' and checks['folder_keyboard_pickup']=='true' and checks['folder_keyboard_cancel']=='false'
   report['viewports'].append(checks)
  final=state();report['question_state_unchanged']=final['q']==10 and final['lives']==original['lives'] and final['draft']==original['draft']
  report['status']='passed' if all(v['passed'] for v in report['viewports']) and report['question_state_unchanged'] and not report['errors'] else 'failed'
 except Exception as exc:
  report['status']='interrupted';report['exception']=str(exc);report['traceback']=traceback.format_exc()
  try:screenshot('failure')
  except:pass
 finally:
  (out/'v2-quality-file-details.json').write_text(json.dumps(report,indent=2),encoding='utf8')
  print(json.dumps(report),flush=True);browser.close()
