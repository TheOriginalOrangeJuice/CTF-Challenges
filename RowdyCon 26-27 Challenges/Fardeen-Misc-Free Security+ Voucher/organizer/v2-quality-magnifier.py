"""Stage06 magnifier keyboard recheck only; run in root-owned Condev preview."""
from pathlib import Path
import hashlib
import json
import traceback
import uuid
from playwright.sync_api import sync_playwright

TREE=Path('/tmp/iq-v2-stage06/The Impossible Security+ Quiz')
OUT=Path('/tmp/iq-v2-quality-magnifier06');OUT.mkdir(exist_ok=True)
source=TREE/'challenge/client/src/questions.tsx'
report={'stage':str(TREE),'scope':'Magnifier Tab, Shift+Tab, Escape, close-button, focus restoration only; normal public actions navigate to Q20.',
        'source_file':'challenge/client/src/questions.tsx','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'human_playtest':False,'checks':{},'errors':[]}
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True)
 ctx=browser.new_context(viewport={'width':1366,'height':768})
 headers={'Origin':'http://localhost:18115'}
 ctx.request.post('http://localhost:18115/api/session',headers=headers)
 def state():return ctx.request.get('http://localhost:18115/api/state').json()['state']
 def op(name,**args):
  s=state();r=ctx.request.post('http://localhost:18115/api/action',headers=headers,data={
   'attempt':s['attempt'],'revision':s['revision'],'q':s['q'],'questionVersion':2,'requestId':str(uuid.uuid4()),'kind':'play','op':name,'args':args})
  assert r.ok,(r.status,r.text())
 page=ctx.new_page();page.set_default_timeout(5000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 def focus():return page.evaluate("({tag:document.activeElement.tagName,text:document.activeElement.textContent,label:document.activeElement.getAttribute('aria-label')})")
 try:
  # Reach the final public scene without repeating the broad UI review.
  op('place-plus',index=1);op('answer',index=1);op('restart-service')
  op('select-factor',id='password');op('select-factor',id='key');op('move-key',to='shredder');op('shred')
  op('move-intern',inside=False);op('grant',permission='READ');op('move-gate',to='junction');op('activate')
  op('toggle',target='ethernet',on=False);op('toggle',target='wifi',on=False);op('fold',folded=True);op('encrypt',recipient='Bob');op('send')
  op('overlay',visible=False);op('edit',field='employeeId',value='');op('edit',field='comment',value='');op('publish')
  op('select-device',id='09');op('copy',folder='approved',mode='bytes');op('eject')
  op('outer',open=True);op('move-person',person='candidate',to='vestibule');op('outer',open=False);op('footer',open=True);op('hatch',open=False);op('open-inner')
  for sid in ['desk','phone','tablet','remote','header']:op('select-session',id=sid,selected=True)
  op('revoke');op('answer',id='C');op('pull-tab');op('reorder',order=['intern','staff443','deny','header','any']);op('apply');op('flip',side='back');op('disable-debug')
  s=state();approved=next(n for n in s['notebook'] if n['id']=='approved-release');release=next(r for r in s['facts']['releases'] if r['sha256']==approved['sha256'])
  op('bind',id=release['id']);op('deploy');op('add-revocation',serial='CT-2048');op('publish');op('tear-copy');op('preserve')
  page.goto('http://localhost:18115',wait_until='networkidle');page.get_by_role('button',name='RESUME',exact=True).click();page.locator('.q20').wait_for()
  for i,t in enumerate(state()['tokens'],1):
   page.get_by_role('button',name=f'Turn token {i} over',exact=True).click()
   page.locator('[data-piece="share-'+t['id']+'"]').focus();page.keyboard.press('Space')
   page.locator('[data-drop="final-viewer"]').focus();page.keyboard.press('Enter')
  page.get_by_role('button',name='MAGNIFY',exact=True).focus();page.keyboard.press('Enter')
  page.get_by_role('dialog',name='Magnified difference viewer',exact=True).wait_for()
  report['checks']['initial_focus']=focus()
  tabs=[]
  for key in ['Tab','Tab','Shift+Tab','Shift+Tab']:
   page.keyboard.press(key);tabs.append({'key':key,'focus':focus()})
  report['checks']['tab_cycles']=tabs
  page.screenshot(path=str(OUT/'magnifier-trapped-focus.png'),full_page=True)
  report['checks']['dialog_aria']=page.get_by_role('dialog').aria_snapshot()
  page.keyboard.press('Escape');page.get_by_role('dialog').wait_for(state='detached')
  report['checks']['escape_restores']=focus();page.screenshot(path=str(OUT/'escape-restored.png'),full_page=True)
  page.keyboard.press('Enter');page.get_by_role('dialog').wait_for();page.get_by_role('button',name='CLOSE',exact=True).click();page.get_by_role('dialog').wait_for(state='detached')
  report['checks']['close_restores']=focus()
  report['checks']['passed']=all(x['focus']['text']=='CLOSE' for x in tabs) and report['checks']['initial_focus']['text']=='CLOSE' and report['checks']['escape_restores']['text']=='MAGNIFY' and report['checks']['close_restores']['text']=='MAGNIFY'
  report['status']='passed' if report['checks']['passed'] else 'failed'
 except Exception as e:
  report['status']='interrupted';report['exception']=str(e);report['traceback']=traceback.format_exc()
 finally:
  (OUT/'v2-quality-magnifier.json').write_text(json.dumps(report,indent=2),encoding='utf8')
  print(json.dumps(report),flush=True);browser.close()
