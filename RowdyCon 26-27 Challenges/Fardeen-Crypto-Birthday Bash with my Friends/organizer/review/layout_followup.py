import hashlib,json,pathlib,sys
from playwright.sync_api import sync_playwright
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
results={}
with sync_playwright()as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox'])
    for label,size in [('fresh1920',{'width':1920,'height':1080}),('resized1920',{'width':1366,'height':768})]:
        page=browser.new_page(viewport=size);page.goto('http://host.docker.internal:18113',wait_until='networkidle')
        served_css=page.request.get('http://host.docker.internal:18113/style.css').body()
        local_css=(pathlib.Path(__file__).resolve().parents[2]/'challenge/public/style.css').read_bytes()
        results['css']={'matches_stage':served_css==local_css,'sha256':hashlib.sha256(served_css).hexdigest()}
        if label=='resized1920':page.set_viewport_size({'width':1920,'height':1080})
        page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');page.wait_for_timeout(300)
        results[label]=page.evaluate('''() => {const t=document.querySelector('.taskbar'),s=document.querySelector('#sound'),r=t.getBoundingClientRect();return {taskbar:{x:r.x,y:r.y,width:r.width,height:r.height},display:getComputedStyle(t).display,visibility:getComputedStyle(t).visibility,hit:document.elementFromPoint(innerWidth-150,innerHeight-20)?.outerHTML,scrollY,innerHeight,bodyHeight:document.body.getBoundingClientRect().height}}''')
        page.screenshot(path=str(out/(label+'.png')))
        page.locator('#start-button').click();results[label]['start_menu_works']=page.locator('#start-menu').is_visible();page.keyboard.press('Escape')
        page.locator('#link-source').select_option('text')
        for text,position in [('HELLOHELLO',1),('GOODNIGHT',248)]:
            page.locator('#phrase').fill(text);page.locator('#position').fill(str(position));page.get_by_role('button',name='Pin',exact=True).click()
        for attempt in range(30):
            if page.evaluate('document.querySelector("#sheet-status").textContent.includes("Message recovered")'):break
            page.wait_for_timeout(100)
        results[label]['verified_recovery']=page.evaluate('document.querySelector("#sheet-status").textContent.includes("Message recovered")')
        page.screenshot(path=str(out/(label+'-recovered.png')))
        page.close()
    browser.close()
(out/'layout-results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2))
