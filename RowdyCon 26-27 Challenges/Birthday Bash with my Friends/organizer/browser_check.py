"""Focused interaction checks against a running public site; screenshots are unaltered."""
import asyncio,json,sys
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
URL=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:18113'
async def main():
    results={'url':URL,'checks':[],'console_errors':[],'human_listening':'not performed','independent_playtesting':'separate reviewer'}
    shots=ROOT/'screenshots';shots.mkdir(exist_ok=True)
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox'])
        context=await browser.new_context(viewport={'width':1366,'height':768},reduced_motion='reduce',accept_downloads=True)
        page=await context.new_page();page.on('pageerror',lambda e:results['console_errors'].append(str(e)))
        await page.goto(URL);await page.wait_for_function("document.querySelector('#saved-state').textContent === 'Working copy saved'")
        await page.screenshot(path=str(shots/'01-workstation.png'))
        assert await page.locator('#progress').inner_text()=='0 / 256 letters filled'
        await page.get_by_role('button',name='04 - do not call').click();assert 'Hello, hello.' in await page.locator('#reader-content').inner_text()
        await page.screenshot(path=str(shots/'02-guard-note.png'));await page.locator('#reader-done').click()
        await page.locator('[data-mode=sample]').click();await page.locator('#section-select').select_option('16')
        await page.screenshot(path=str(shots/'03-postcard-ribbon.png'))
        assert await page.locator('#starter').is_disabled();results['checks'].append('saved sample and sixteen-letter ribbon inspection')
        await page.locator('[data-mode=target]').click()
        await page.locator('#wheel-guess').fill('H');await page.locator('#pin-wheel').focus();await page.keyboard.press('Enter')
        assert await page.locator('#progress').inner_text()=='1 / 256 letters filled';await page.locator('#undo').click()
        await page.locator('#phrase').fill('HELLO HELLO');await page.locator('#position').fill('1');await page.locator('#guess-form button').click()
        assert await page.locator('#progress').inner_text()=='10 / 256 letters filled'
        await page.locator('#link-source').select_option('text')
        assert await page.locator('#progress').inner_text()=='160 / 256 letters filled';await page.screenshot(path=str(shots/'04-opening-recovered.png'))
        await page.locator('#phrase').fill('Z');await page.locator('#position').fill('17');await page.locator('#guess-form button').click();assert await page.locator('#conflict').is_visible()
        await page.locator('#undo').click();assert not await page.locator('#conflict').is_visible();results['checks'].append('wrong hypothesis conflict and undo recovery')
        await page.locator('#phrase').fill('GOOD NIGHT');await page.locator('#position').fill('248');await page.locator('#guess-form button').click()
        assert await page.locator('#progress').inner_text()=='256 / 256 letters filled'
        text=await page.locator('#message').inner_text();assert 'RCC{STAY_QUIET_VJQZKXMPYBNDFLRAS}' in text
        await page.locator('#open-message').click();await page.screenshot(path=str(shots/'05-recovered-memo.png'));await page.locator('#reader-done').click()
        await page.locator('#link-offset').fill('15');await page.locator('#link-offset').press('Tab');assert await page.locator('#conflict').is_visible();await page.locator('#undo').click()
        await page.reload();await page.wait_for_function("document.querySelector('#progress').textContent === '256 / 256 letters filled'")
        async with page.expect_download() as download_info:await page.locator('#download-message').click()
        download=await download_info.value;assert download.suggested_filename=='05-working-message.txt'
        assert 'RCC{' in Path(await download.path()).read_text()
        results['checks'].append('browser crib solve, persistence and exact downloadable plaintext')
        async with page.expect_download() as work_info:await page.locator('#save-work').click()
        work=await work_info.value;work_path=await work.path()
        await page.locator('#reset').click();await page.locator('#reset-cancel').click();assert await page.locator('#progress').inner_text()=='256 / 256 letters filled'
        await page.locator('#reset').click();await page.locator('#reset-confirm').click();assert await page.locator('#progress').inner_text()=='0 / 256 letters filled'
        await page.locator('#undo').click();assert await page.locator('#progress').inner_text()=='256 / 256 letters filled'
        await page.locator('#reset').click();await page.locator('#reset-confirm').click()
        await page.locator('#work-file').set_input_files(work_path);await page.wait_for_function("document.querySelector('#progress').textContent === '256 / 256 letters filled'")
        await page.locator('#work-file').set_input_files({'name':'wrong.json','mimeType':'application/json','buffer':b'{"version":"other"}'})
        assert await page.locator('#progress').inner_text()=='256 / 256 letters filled'
        await page.locator('#volume').focus();await page.keyboard.press('Home');await page.reload();await page.wait_for_function("document.querySelector('#saved-state').textContent === 'Working copy saved'");assert await page.locator('#volume').input_value()=='0';await page.locator('#volume').focus();await page.keyboard.press('End')
        results['checks'].append('working-copy export/import, malformed import preservation, zero-volume preference')
        await page.locator('#minimize').click();assert await page.locator('#app-window').is_hidden();await page.locator('.task-button[data-open=club]').click();assert await page.locator('#app-window').is_visible()
        await page.locator('#maximize').click();assert 'maximized' in await page.locator('#app-window').get_attribute('class');await page.locator('#maximize').click()
        await page.locator('#help-button').click();await page.keyboard.press('Escape');assert not await page.locator('#reader').is_visible()
        results['checks'].append('reset cancellation, undo reset, window controls and Escape dialog close')
        results['checks'].append('authentic cue playback and server completion covered separately by audio_check.py')
        await page.set_viewport_size({'width':1920,'height':1080});await page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await page.screenshot(path=str(shots/'06-workstation-large.png'))
        taskbar=await page.locator('.taskbar').bounding_box();assert taskbar and taskbar['y']>=0 and taskbar['y']+taskbar['height']<=1080
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        results['checks'].append('1366×768 and 1920×1080 captures; reduced motion')
        for path in ['/organizer/generate.py','/Description.md','/.dockerignore']:
            response=await page.request.get(URL+path);assert response.status in (403,404)
        for path in ['/evidence/05-last-note.enc.txt','/evidence/birthday-postcard.txt']:
            response=await page.request.get(URL+path);assert response.status==200 and len(await response.body())>200
        results['checks'].append('public downloads and private-file boundary')
        assert not results['console_errors'];results['pass']=True
        await browser.close()
    (ROOT/'organizer'/'browser-results.json').write_text(json.dumps(results,indent=2)+'\n')
    print(json.dumps(results))
asyncio.run(main())
