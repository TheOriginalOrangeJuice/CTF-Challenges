"""Exercise remaining advertised controls and responsiveness during real inference."""
import asyncio
import hashlib
import json
from pathlib import Path
import sys
from playwright.async_api import async_playwright

OUT=Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=True)
report={"checks":[],"browser_errors":[]}

def check(name,condition):
    report["checks"].append({"name":name,"passed":bool(condition)})
    (OUT/"controls.json").write_text(json.dumps(report,indent=2)+"\n")
    print(name,"PASS" if condition else "FAIL",flush=True)
    assert condition,name

async def main():
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path="/home/fbhimani/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",headless=True,args=["--no-sandbox","--renderer-process-limit=1"])
        context=await browser.new_context(viewport={"width":1366,"height":768},reduced_motion="reduce")
        page=await context.new_page()
        page.on("pageerror",lambda error:report["browser_errors"].append(str(error)))
        page.on("console",lambda msg:report["browser_errors"].append(msg.text) if msg.type=="error" else None)
        await page.goto("http://localhost:18116");await page.locator("#loading").wait_for(state="hidden")
        check("operating-system-reduced-motion",await page.locator("body").evaluate("e=>e.classList.contains('reduced')"))
        await page.get_by_role("button",name="Help",exact=True).click()
        check("dialog-receives-keyboard-focus",await page.evaluate("!!document.activeElement.closest('#help-dialog')"))
        await page.keyboard.press("Enter")
        check("dialog-keyboard-close",await page.locator("#help-dialog").is_hidden())
        await page.get_by_role("button",name="Igloo News",exact=True).click();await page.locator("#meet-pip").click()
        check("news-meet-pip",await page.locator("#care-dialog").is_visible() and await page.locator("#pet-name").inner_text()=="Pip")
        await page.locator("#talk-pip").click()
        check("talk-control-focuses-chat",await page.locator("#message").evaluate("e=>e===document.activeElement"))
        await page.locator("#quick-chat").click()
        check("quick-chat-draft",await page.locator("#message").input_value()=="Hi Pip!")
        await page.locator("#wide-screen").click()
        check("large-view-control",await page.locator("#game-shell").evaluate("e=>e.classList.contains('wide')"))
        await page.locator("#wide-screen").click()
        poses={}
        box=await page.locator("#world").bounding_box()
        clip={"x":box["x"]+328*box["width"]/760,"y":box["y"]+297*box["height"]/480,"width":80*box["width"]/760,"height":80*box["height"]/480}
        for action in ["Wave","Sit down","Dance","Stand up"]:
            await page.locator("#actions").click();await page.get_by_role("button",name=action,exact=True).click();await page.wait_for_timeout(170)
            poses[action]=hashlib.sha256(await page.screenshot(clip=clip)).hexdigest()
        check("wave-sit-dance-stand-visible-poses",len(set(poses.values()))==4)
        for emote in ["Happy","Heart","Music","Surprised"]:
            await page.locator("#emotes").click();await page.locator("#popup").get_by_role("button",name=emote).click()
        check("all-emote-controls",await page.locator("#popup").is_hidden())
        for name in ["Pip","Bubbles","Pebble"]:
            await page.locator("#pets").click();await page.locator("#popup").get_by_role("button",name=name,exact=True).click()
            check("pet-menu-"+name,await page.locator("#pet-name").inner_text()==name)
            await page.keyboard.press("Escape")
        await page.locator("#snowball").click();await page.locator("#world").click(position={"x":box["width"]*.4,"y":box["height"]*.8})
        check("mouse-snowball",await page.locator("#snowball").get_attribute("aria-pressed")=="false")
        await page.locator("#home").click();await page.wait_for_timeout(200)
        check("home-returns-to-center",abs(await page.locator("#penguin-bubble").evaluate("e=>parseFloat(e.style.left)")-368/7.6)<.2)
        await page.locator("#sound-toggle").click()
        check("footer-mute",await page.locator("#sound-toggle").get_attribute("aria-pressed")=="true")
        await page.locator("#sound-toggle").click()
        await page.get_by_role("button",name="Settings",exact=True).first.click();await page.locator("#music").select_option("none")
        check("music-off",await page.locator("#music-player").evaluate("e=>e.paused"))
        await page.keyboard.press("Escape")
        await page.get_by_role("button",name="Your postcards",exact=True).click();await page.locator("#claim-code").fill("not-the-invitation")
        await page.get_by_role("button",name="Open invitation",exact=True).click()
        await page.locator("#claim-result").filter(has_text="doesn't recognise").wait_for()
        check("wrong-postcard-code-visible-rejection",await page.locator("#earned-invitation").is_hidden())
        await page.keyboard.press("Escape")
        await page.locator("#message").fill("Tell me a long cheerful story about three puffles and a snowman.");await page.locator("#send").click()
        await page.locator("#reply-status").wait_for(state="visible")
        await page.locator("#message").fill("A draft while Pip is thinking")
        await page.locator("#world").focus();before=await page.locator("#penguin-bubble").evaluate("e=>parseFloat(e.style.left)")
        await page.keyboard.down("ArrowLeft");await page.wait_for_timeout(250);await page.keyboard.up("ArrowLeft")
        check("movement-during-real-inference",await page.locator("#penguin-bubble").evaluate("e=>parseFloat(e.style.left)")<before)
        await page.locator("#decorate").click();await page.get_by_role("button",name="Wooden chair",exact=True).click();await page.keyboard.press("Enter")
        check("decorating-during-real-inference",await page.locator("#editor").is_visible())
        await page.locator("#cancel-room").click();await page.locator("#cancel-reply").click();await page.locator("#reply-status").wait_for(state="hidden")
        check("cancel-keeps-new-draft",await page.locator("#message").input_value()=="A draft while Pip is thinking")
        await page.locator("#history-toggle").click()
        check("cancel-status-accessible",await page.locator("#history-lines").get_by_text("Reply cancelled.",exact=True).count()==1)
        await page.locator("#history-close").click()
        await page.get_by_role("button",name="Settings",exact=True).first.click();await page.locator("#reset-chat").click();await page.locator("#confirm-yes").click();await page.locator("#confirm-dialog").wait_for(state="hidden")
        check("conversation-reset-control",await page.evaluate("async()=>!(await (await fetch('/api/state')).json()).turns.length"))
        check("no-browser-errors",not report["browser_errors"])
        report["passed"]=True
        (OUT/"controls.json").write_text(json.dumps(report,indent=2)+"\n")
        await browser.close()

asyncio.run(main())
