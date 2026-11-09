"""Focused recovery/accessibility checks. Organizer informed; not a blind solve."""
import asyncio,ast,json,pathlib
from playwright.async_api import async_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parents[1]
tree=ast.parse((ROOT/'organizer/capture_walkthrough.py').read_text())
ANS=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='ANS' for t in n.targets))
async def main():
 checks=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1366,'height':768},reduced_motion='reduce')
  page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:18115',wait_until='domcontentloaded')
  await expect(page.locator('.start-warning')).to_be_visible()
  await page.get_by_role('button',name='START',exact=True).click()
  async def resume():
   await page.reload(wait_until='domcontentloaded');await page.get_by_role('button',name='RESUME',exact=True).click();await page.locator('.question-header').wait_for()
  async def state():return (await(await context.request.get('http://localhost:18115/api/state')).json())['state']
  async def action(kind,draft=None):
   s=await state();r=await context.request.post('http://localhost:18115/api/action',data={'attempt':s['attempt'],'revision':s['revision'],'requestId':__import__('uuid').uuid4().hex,'kind':kind,**({'draft':draft} if draft else {})});assert r.ok,await r.text();return await r.json()
  await page.get_by_role('button',name='THE ANSWER',exact=True).focus();await page.keyboard.press('Enter')
  await resume();await expect(page.get_by_role('button',name='THE ANSWER',exact=True)).to_have_class('heading-target ink-selected')
  checks.append('keyboard answer and immediate reload retain unsent draft')
  await page.get_by_role('button',name='Open evidence notebook').click();await page.locator('textarea').fill('The goose cannot confiscate this unsent note.')
  await resume();await page.get_by_role('button',name='Open evidence notebook').click();await expect(page.locator('textarea')).to_have_value('The goose cannot confiscate this unsent note.')
  await page.keyboard.press('Escape');await page.wait_for_timeout(500)
  assert (await state())['notes']=='The goose cannot confiscate this unsent note.'
  checks.append('unblurred notes recover on reload and Escape saves the current value')
  dropped=False
  async def drop_response(route):
   nonlocal dropped
   data=route.request.post_data_json
   if data.get('kind')=='submit' and not dropped:
    dropped=True;await route.fetch();await route.abort('failed')
   else:await route.continue_()
  await page.route('**/api/action',drop_response)
  await page.get_by_role('button',name='ANSWER',exact=True).click();await expect(page.get_by_role('status')).to_contain_text('Connection lost')
  await page.get_by_role('button',name='ANSWER',exact=True).click();await expect(page.locator('.question-number')).to_have_text('2.')
  assert (await state())['lives']==3
  await page.unroute('**/api/action',drop_response)
  checks.append('lost acknowledged response and stale retry do not spend a second life or resubmit into next question')
  for q in range(2,18):
   assert (await state())['q']==q
   if q==8:
    await resume();bag=page.locator('.bag').nth(2);await bag.focus();await bag.press('Enter');await expect(bag).to_have_attribute('aria-pressed','true')
    checks.append('keyboard inspection selects bag with explicit pressed state')
   if q==17:
    await resume()
    for label in ['Round, striped','Round, plain','Square, striped','Square, plain']:await expect(page.get_by_role('img',name=label,exact=True)).to_be_visible()
    checks.append('all NOT puzzle object properties have equivalent accessibility labels')
   await action('submit',ANS[q])
  for q in range(18,21):await action('submit',ANS[q])
  s=await state();assert s['status']=='won' and s['skips']==0
  await action('restart')
  for _ in range(3):await action('submit',{'target':'option0'})
  await page.reload(wait_until='domcontentloaded');await page.get_by_role('button',name='RESUME',exact=True).click();await expect(page.get_by_role('heading',name='GAME OVER',exact=True)).to_be_attached()
  checks.append('game-over announcement is present in accessibility tree')
  assert not errors,errors
  report={'status':'passed','checks':checks,'pageErrors':errors,'method':'Focused informed browser checks; no human playtesting claim'}
  (ROOT/'organizer/focused-browser-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':len(checks)}))
  await browser.close()
asyncio.run(main())
