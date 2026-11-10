"""Public-browser solve and captures; authored-answer regression, not a cold human playtest."""
import pathlib,json,sys,time
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'screenshots'/'v5';out.mkdir(parents=True,exist_ok=True)
report={'questionVersion':5,'kind':'authored-answer browser regression','questions':[],'errors':[]}
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
 def answer(id):
  settle();page.locator('[data-answer="'+id+'"]').click();settle()
 try:
  before(1);move('plus','port-1');assert state()['q']==1;click('21 + 1');done(1)
  before(2);click('Inspect running service');shot('02-inspected');answer('2.0');done(2)
  before(3);click('Inspect password D markup');shot('03-markup');click('Close evidence');click('Toggle house styling');shot('03-styles-off');answer('d');done(3)
  before(4);click('Open drive C volume');page.get_by_label('TOOLS start block',exact=True).fill('10');click('MOVE TOOLS');page.get_by_label('Drive C size in GB',exact=True).fill('8');click('RESIZE C:');shot('04-expanded');click('APPLY');done(4)
  before(5);page.get_by_role('checkbox',name='Allow account NOBODY').click();settle();shot('05-empty');click('APPLY ACCESS');done(5)
  before(6);answer('both-routes');done(6)
  before(7);page.get_by_label('Exam password',exact=True).fill(' ');shot('07-entered');click('SIGN IN');done(7)
  before(8)
  for source,target in [('PC','S1'),('S1','S2'),('S2','S3'),('S3','SERVER')]:
   click('Inspect '+source);click('Route '+source+' to '+target)
  click('Inspect R1');shot('08-routed');click('LAUNCH PACKET');done(8)
  before(9);click('Lift black rectangle');click('Open document comments');click('Remove comment text');click('Remove employee identifier');shot('09-redacted');click('PUBLISH');done(9)
  before(10);click('Select approved file');click('Inspect selected file properties');retained_hash=page.get_by_label('File SHA-256',exact=True).input_value();assert len(retained_hash)==64;shot('10-properties');click('Close evidence');click('Open evidence notebook');page.get_by_label('Your notes',exact=True).fill(retained_hash);click('Close dialog');click('COPY');click('Select destination device 09');click('PASTE');shot('10-backup');click('⏏ EJECT 09');done(10)
  before(11);click('Open outer door');click('Walk C-701 to vestibule');click('Close outer door');click('Close maintenance hatch');shot('11-prepared');click('Admit to secure');done(11)
  before(12);click('Next document page');page.get_by_label('Print page',exact=True).select_option('2');settle();click('Cancel PC queue');click('Cancel printer buffer');shot('12-prepared');click('PRINT');done(12)
  before(13);click('LOAD APPROVED');shot('13-difference');click('Answer badge C');done(13)
  before(14);click('Inspect queued samples');shot('14-spool');click('Close evidence');click('Inspect recorded tape');shot('14-tape');click('Close evidence');click('AUX');shot('14-rerouted');answer('d');done(14)
  before(15)
  for label in ['Move intern rule up','Move staff443 rule up','Move deny rule up','Move deny rule up']:click(label)
  shot('15-policy');click('APPLY');done(15)
  before(16);page.get_by_label('Revised two-digit count').fill('06');shot('16-collision');click('REPLACE FILE');done(16)
  before(17);assert page.get_by_role('button',name='Inspect USB backup').count()==0;assert not any(n['id']=='approved-release' for n in state()['notebook']);click('Open evidence notebook');retained_hash=page.get_by_label('Your notes',exact=True).input_value();click('Close dialog');page.get_by_label('Deployment reference',exact=True).fill(retained_hash);shot('17-reference');click('DEPLOY →');done(17)
  before(18);answer('neither');done(18)
  before(19)
  records=state()['draft']['records'];cursor=next(r for r in records if r['anchor']);last=cursor
  while (next_records:=[r for r in records if r['previousHash']==cursor['sha256']]):
   assert len(next_records)==1;cursor=next_records[0]
   if cursor['action']=='DENY':last=cursor
  click('Next journal page');shot('19-page-two');click('Inspect log EV-R7M');shot('19-chain-detail');click('Close evidence');click('Previous journal page');click('Archive log '+last['id']);done(19)
  before(20)
  for i in range(1,4):click(f'Show token {i} reverse');click(f'Add token {i} layer')
  shot('20-reconstructed');click('Magnify combined token pixels');page.keyboard.press('Tab');assert page.get_by_role('button',name='Close evidence').evaluate('(e)=>e===document.activeElement');page.keyboard.press('Escape');assert page.get_by_role('button',name='Magnify combined token pixels').evaluate('(e)=>e===document.activeElement')
  page.get_by_label('Certificate PIN').fill('604827');click('UNLOCK');page.get_by_role('heading',name='CERTIFIED!',exact=True).wait_for();shot('21-certificate')
  assert state()['status']=='won' and state()['skips']==0
  reward=page.request.get('http://localhost:18115/api/reward').json();assert reward['flag']=='RCC{certified_to_question_everything}'
  report['questions'].append({'question':20,'result':'certificate and reward passed'});page.reload();click('RESUME');page.get_by_text(reward['flag'],exact=True).wait_for();report['rewardReload']='passed'
  page.set_viewport_size({'width':1920,'height':1080});shot('22-certificate-1920');report['passed']=True
 except Exception as error:
  report['failure']=str(error);report['state']=state();shot('failure');raise
 finally:
  (root/'organizer/v5-browser-results.json').write_text(json.dumps(report,indent=2));browser.close()