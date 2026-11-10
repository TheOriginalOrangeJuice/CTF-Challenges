"""Public-browser solve and captures; authored-answer regression, not a cold human playtest."""
import pathlib,json,sys,time
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'screenshots'/'v2';out.mkdir(parents=True,exist_ok=True)
report={'kind':'authored-answer browser regression','questions':[],'errors':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
 page=browser.new_page(viewport={'width':1366,'height':768},device_scale_factor=1)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.goto('http://localhost:18115');page.wait_for_function("document.querySelector('.menu-grid button') && !document.querySelector('.menu-grid button').disabled")
 page.screenshot(path=str(out/'00-title.png'))
 page.get_by_role('button',name='START',exact=True).click()
 def state():return page.request.get('http://localhost:18115/api/state').json()['state']
 def settle():
  page.wait_for_function("!document.querySelector('section[aria-busy=true]')",timeout=10000)
 def click(label,exact=True):
  settle();page.get_by_role('button',name=label,exact=exact).click();settle()
 def move(piece,target,keyboard=False,network=True):
  settle();source=page.locator('[data-piece="'+piece+'"]');dest=page.locator('[data-drop="'+target+'"]')
  if keyboard:source.focus();page.keyboard.press('Space');dest.focus();page.keyboard.press('Enter')
  else:source.drag_to(dest)
  if network:settle()
 def shot(name):page.screenshot(path=str(out/(name+'.png')))
 def before(q):
  page.wait_for_function('(q)=>document.querySelector(".question-number")?.textContent===q+"."',arg=q)
  assert state()['q']==q
  shot(f'{q:02}-start')
 def done(q):
  page.wait_for_function('(q)=>document.querySelector(".question-number")?.textContent===(q+1)+"."',arg=q)
  assert state()['lives']==3,(q,state())
  report['questions'].append({'question':q,'result':'passed with three lives'})
 try:
  before(1);move('plus','port-1');click('21 + 1');done(1)
  before(2);click('Inspect running service');shot('02-inspected');click('Restart service');done(2)
  before(3);click('PASSWORD');click('Touch your FIDO2 key');done(3)
  before(4);move('K7','key-shredder',True);shot('04-prepared');click('PULL LEVER');done(4)
  before(5);move('intern','visitor-rail');shot('05-prepared');click('READ');done(5)
  before(6);move('gate','gate-junction',True);shot('06-prepared');click('OPEN SIGN-IN');done(6)
  before(7);page.locator('.ethernet').click();settle();click('◔ Wi-Fi ON');done(7)
  before(8);click('Fold memo into envelope');move('bob-key','memo-envelope');shot('08-encrypted');click('SEND →');done(8)
  before(9);click('Lift black rectangle');click('Remove employee identifier');click('Open document comments');click('Remove comment text');shot('09-prepared');click('PUBLISH');done(9)
  before(10);move('file-approved','drive09');page.wait_for_function("!document.querySelector('section[aria-busy=true]') && document.querySelector('.external-drive small')?.textContent==='1 ITEM'");shot('10-backup');click('⏏ EJECT');done(10)
  before(11);click('Open outer door');move('candidate','vestibule',True);click('Close outer door');click('Move floor trim');click('Close maintenance hatch');shot('11-prepared');click('Open inner door');done(11)
  before(12)
  for label in ['DESK','PHONE','TABLET','REMOTE']:click(label,False)
  click('Select current workplace session');shot('12-selected');click('REVOKE SELECTED');done(12)
  before(13);move('approved-frame','comparison',True,False);shot('13-difference');click('C');done(13)
  before(14);click('Type sample input');shot('14-recording');click('Pull input recording tab');done(14)
  before(15)
  for label in ['Move intern rule up','Move staff443 rule up','Move deny rule up','Move deny rule up']:click(label)
  shot('15-policy');click('APPLY');done(15)
  before(16);click('Turn question sheet over');shot('16-back');click('DISABLE DEBUG');done(16)
  before(17);click('⌖ DEVICE 09',False);shot('17-receipt');click('⌖ DEVICE 09',False);click('Inspect release-410');shot('17-details');click('Inspect release-410');move('deploy-arrow','release-410');shot('17-bound');click('DEPLOY →');done(17)
  before(18);move('cert-serial','revocation-tray',True);shot('18-prepared');click('PUBLISH');done(18)
  before(19);click('✂ TEAR OFF COPY');move('denial-copy','evidence-envelope');done(19)
  before(20)
  for i in range(1,4):
   click(f'Turn token {i} over');move(f'share-skip-{i}','final-viewer',True,False)
  shot('20-reconstructed');page.get_by_label('Certificate PIN').fill('604827');click('UNLOCK')
  page.get_by_role('heading',name='CERTIFIED!',exact=True).wait_for();shot('21-certificate')
  assert state()['status']=='won' and state()['skips']==0
  reward=page.request.get('http://localhost:18115/api/reward').json();assert reward['flag']=='RCC{certified_to_question_everything}'
  report['questions'].append({'question':20,'result':'certificate and reward passed'})
  page.reload();click('RESUME');page.get_by_text(reward['flag'],exact=True).wait_for();report['rewardReload']='passed'
  page.set_viewport_size({'width':1920,'height':1080});shot('22-certificate-1920')
  report['passed']=True
 except Exception as e:
  report['failure']=str(e);report['state']=state();shot('failure');raise
 finally:
  (root/'organizer/v2-browser-results.json').write_text(json.dumps(report,indent=2));browser.close()


