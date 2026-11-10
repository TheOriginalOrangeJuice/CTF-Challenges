"""Capture actual browser states, with errors retained for review."""
import asyncio
import json
from pathlib import Path
import sys
from playwright.async_api import async_playwright

async def main():
    out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
    errors=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path="/home/fbhimani/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",headless=True,args=["--no-sandbox"])
        page=await browser.new_page(viewport={"width":1366,"height":768},device_scale_factor=1)
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.on("console",lambda msg:errors.append("console: "+msg.text) if msg.type=="error" else None)
        await page.goto("http://127.0.0.1:18116")
        await page.locator("#loading").wait_for(state="hidden",timeout=45000)
        await page.wait_for_timeout(7000)
        await page.screenshot(path=str(out/"landing-1366.png"))
        await page.locator("#target-pip").click()
        await page.screenshot(path=str(out/"care-1366.png"))
        await page.get_by_role("button",name="Close puffle card").click()
        await page.locator("#decorate").click()
        await page.get_by_role("button",name="Wooden chair",exact=True).click()
        await page.screenshot(path=str(out/"decorate-1366.png"))
        await page.locator("#cancel-room").click()
        await page.set_viewport_size({"width":1920,"height":1080})
        await page.screenshot(path=str(out/"landing-1920.png"))
        (out/"browser-errors.json").write_text(json.dumps(errors,indent=2)+"\n")
        await browser.close()
    print(json.dumps({"errors":errors,"out":str(out)}))

asyncio.run(main())
