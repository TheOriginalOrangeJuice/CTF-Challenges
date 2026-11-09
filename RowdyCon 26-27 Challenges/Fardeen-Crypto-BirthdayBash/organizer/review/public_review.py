"""Independent review: initial evidence is obtained only through the public site."""
import json
import pathlib
import re
import sys
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium-browser", headless=True, args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1366, "height": 768}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("http://host.docker.internal:18113", wait_until="networkidle")
    page.screenshot(path=str(OUT / "01-initial-1366.png"), full_page=True)
    body = page.locator("body").inner_text()
    (OUT / "initial.txt").write_text(body)
    details = page.evaluate("""() => ({
      controls: [...document.querySelectorAll('button,input,select,a,textarea')].map(e => ({tag:e.tagName,id:e.id,text:e.innerText,value:e.value,href:e.getAttribute('href'),title:e.title,aria:e.getAttribute('aria-label')})),
      scripts:[...document.scripts].map(e=>e.src)
    })""")
    (OUT / "initial-controls.json").write_text(json.dumps(details, indent=2))
    for filename in ["05-last-note.enc.txt", "birthday-postcard.txt"]:
        response = page.request.get("http://host.docker.internal:18113/evidence/" + filename)
        content = response.text()
        (OUT / filename).write_text(content)
        print("PUBLIC DOWNLOAD", filename, content)
    for name in ["01 - welcome", "03 - about the phone", "04 - do not call", "How to use the workshop", "About"]:
        page.get_by_role("button", name=re.compile(re.escape(name))).first.click()
        print("DOCUMENT", name, page.locator("dialog[open]").inner_text())
        (OUT / (name.replace(" ", "_") + ".txt")).write_text(page.locator("dialog[open]").inner_text())
        page.keyboard.press("Escape")
    page.get_by_role("button", name=re.compile("Birthday postcard")).click()
    page.screenshot(path=str(OUT / "02-postcard-1366.png"), full_page=True)
    print("POSTCARD", page.locator("body").inner_text())
    print("PAGE ERRORS", errors)
    browser.close()
