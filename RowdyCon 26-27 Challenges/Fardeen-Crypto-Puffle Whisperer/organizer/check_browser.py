"""Exercise real browser controls and audio; never replace model replies."""
import asyncio
import json
from pathlib import Path
import sys
from playwright.async_api import async_playwright

OUT=Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=True)
BASE=sys.argv[2] if len(sys.argv)>2 else "http://127.0.0.1:18116"
report={"checks":[],"errors":[],"independent_human_listening":False}

def check(name,condition,detail=None):
    report["checks"].append({"name":name,"passed":bool(condition),"detail":detail})
    (OUT/"browser-checks.json").write_text(json.dumps(report,indent=2)+"\n")
    if not condition:raise AssertionError(name+": "+str(detail))
    print(name,"PASS",flush=True)

async def state(page):
    return await page.evaluate("async()=>await (await fetch('/api/state')).json()")

async def close(page):
    await page.keyboard.press("Escape")

async def main():
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path="/home/fbhimani/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",headless=True,args=["--no-sandbox","--renderer-process-limit=1"])
        context=await browser.new_context(viewport={"width":1366,"height":768},device_scale_factor=1)
        # Tap actual audio graph output for a non-silence check. No player data is modified.
        await context.add_init_script("""(() => {
          const Native=window.AudioContext;window.__audioMeters=[];window.__audioContexts=[];window.__effectPeak=0;
          setInterval(()=>{for(const meter of window.__audioMeters){const values=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(values);window.__effectPeak=Math.max(window.__effectPeak,Math.sqrt(values.reduce((s,x)=>s+x*x,0)/values.length));}},5);
          window.AudioContext=class extends Native {
            constructor(...args){super(...args);window.__audioContexts.push(this);}
            createGain(){const node=super.createGain(),original=node.connect.bind(node),context=this;
              node.connect=function(destination,...args){if(destination===context.destination){const meter=context.createAnalyser();meter.fftSize=2048;original(meter);meter.connect(destination);window.__audioMeters.push(meter);return destination;}return original(destination,...args);};return node;}
          };
        })();""")
        page=await context.new_page()
        page.on("pageerror",lambda error:report["errors"].append(str(error)))
        page.on("console",lambda msg:report["errors"].append({"message":msg.text,"location":msg.location}) if msg.type=="error" else None)
        page.on("response",lambda response:report["errors"].append({"url":response.url,"status":response.status}) if response.status>=400 else None)
        await page.goto(BASE)
        await page.locator("#loading").wait_for(state="hidden",timeout=45000)
        await page.wait_for_timeout(6600)
        await page.screenshot(path=str(OUT/"landing-1366.png"))
        check("no-horizontal-overflow",await page.evaluate("document.documentElement.scrollWidth<=innerWidth"))
        initial=await state(page)
        check("new-igloo-no-secret",not initial["disclosed"] and not initial["solved"] and "RCC{" not in await page.locator("body").inner_text())
        await page.get_by_role("button",name="Igloo News",exact=True).click()
        news=await page.locator("#news-dialog").inner_text()
        check("four-harmless-translator-samples",all(prefix in news for prefix in ["b64:","hex:","dec:","bin:"]) and all(word in news for word in ["Hi Pip!","dance","snow","wave"]))
        await close(page)
        await page.locator("#message").fill("hex: 4")
        await page.locator("#send").click()
        for _ in range(100):
            if "byte pairs" in (await page.locator("#toast").inner_text()).lower():break
            await page.wait_for_timeout(50)
        draft=await page.locator("#message").input_value();feedback=await page.locator("#toast").inner_text()
        check("invalid-packet-keeps-draft",draft=="hex: 4" and "byte pairs" in feedback.lower(),{"draft":draft,"feedback":feedback})
        report["errors"]=[error for error in report["errors"] if not (
            isinstance(error,dict) and error.get("status")==422 and error.get("url","").endswith("/api/chat")
            or isinstance(error,dict) and "422" in error.get("message","") and error.get("location",{}).get("url","").endswith("/api/chat")
        )]
        await page.locator("#message").fill("An unfinished chat message")
        await page.reload();await page.locator("#loading").wait_for(state="hidden")
        check("chat-draft-survives-refresh",await page.locator("#message").input_value()=="An unfinished chat message")
        await page.locator("#message").fill("")
        await page.locator("#decorate").click()
        await page.get_by_role("button",name="Wooden chair",exact=True).click()
        await page.keyboard.press("Enter");await page.keyboard.press("ArrowRight")
        await page.locator("#rotate-item").click()
        await page.screenshot(path=str(OUT/"decorate-1366.png"))
        await page.locator("#save-room").click()
        await page.locator("#editor").wait_for(state="hidden")
        chair=next(f for f in (await state(page))["room"]["furniture"] if f["kind"]=="chair")
        check("keyboard-placement-movement-rotation-save",chair["x"]==385 and chair["rotation"]==1,chair)
        await page.locator("#decorate").click();await page.get_by_role("button",name="Wooden chair",exact=True).click();await page.keyboard.press("ArrowDown")
        await page.locator("#cancel-room").click()
        check("decorating-cancel",chair==next(f for f in (await state(page))["room"]["furniture"] if f["kind"]=="chair"))
        await page.locator("#decorate").click();await page.get_by_role("button",name="Wooden chair",exact=True).click();await page.keyboard.press("ArrowLeft")
        await page.reload();await page.locator("#loading").wait_for(state="hidden");await page.locator("#decorate").click()
        check("decorating-draft-survives-refresh",await page.evaluate("JSON.parse(localStorage.getItem('puffle-room-draft')).furniture.find(f=>f.kind==='chair').x") ==380)
        await page.get_by_role("button",name="Wooden chair",exact=True).click();await page.locator("#remove-item").click();await page.locator("#save-room").click()
        await page.locator("#editor").wait_for(state="hidden")
        check("furniture-put-away",not any(f["kind"]=="chair" for f in (await state(page))["room"]["furniture"]))
        await page.get_by_role("button",name="Your penguin",exact=True).click()
        await page.get_by_role("button",name="Colour: red",exact=True).click()
        await page.wait_for_timeout(200)
        check("penguin-colour-and-portrait",(await state(page))["room"]["color"]=="red" and (await page.locator("#player-portrait").get_attribute("src")).endswith("player-card-red.png"))
        await close(page)
        before=await page.locator("#penguin-bubble").evaluate("e=>parseFloat(e.style.left)")
        await page.locator("#world").focus();await page.keyboard.down("ArrowLeft");await page.wait_for_timeout(300);await page.keyboard.up("ArrowLeft")
        after=await page.locator("#penguin-bubble").evaluate("e=>parseFloat(e.style.left)")
        check("keyboard-actually-moves-penguin",after<before-1,{"before":before,"after":after})
        box=await page.locator("#world").bounding_box()
        await page.locator("#world").click(position={"x":box["width"]*355/760,"y":box["height"]*395/480})
        await page.wait_for_timeout(900)
        after=await page.locator("#penguin-bubble").evaluate("e=>parseFloat(e.style.left)")
        check("click-to-walk-destination",abs(after-355/7.6)<.2,{"left_percent":after})
        for pet in ["pip","bubbles","pebble"]:
            for action in ["feed","play","rest"]:
                await page.locator("#target-"+pet).focus();await page.keyboard.press("Enter")
                if pet=="pip" and action=="feed":await page.screenshot(path=str(OUT/"care-1366.png"))
                await page.locator(f'[data-care="{action}"]').click()
                await page.locator("#care-dialog").wait_for(state="hidden")
        pets=(await state(page))["pets"]
        check("all-puffle-care-controls",all(p["food"]==95 and p["energy"]==100 and p["play"]==85 for p in pets.values()),pets)
        await page.locator("#actions").click();await page.get_by_role("button",name="Dance",exact=True).click()
        await page.locator("#emotes").click();await page.get_by_role("button",name="Heart",exact=False).click()
        await page.screenshot(path=str(OUT/"actions-1366.png"))
        await page.locator("#snowball").click();await page.keyboard.press("Space")
        check("keyboard-snowball",await page.locator("#snowball").get_attribute("aria-pressed")=="false")
        await page.locator("#world").focus();await page.keyboard.press("ArrowLeft");await page.keyboard.press("Enter")
        check("keyboard-chat-focus",await page.locator("#message").evaluate("e=>e===document.activeElement"))
        await page.get_by_role("button",name="Settings",exact=True).first.click()
        await page.locator("#music").select_option("2")
        await page.locator("#volume").focus();await page.keyboard.press("Home")
        for _ in range(48):await page.keyboard.press("ArrowRight")
        await page.locator("#reduce-motion").check()
        await page.wait_for_timeout(500)
        music=await page.evaluate("""async()=>{const el=document.getElementById('music-player');const ac=new AudioContext();await ac.resume();const source=ac.createMediaElementSource(el),meter=ac.createAnalyser();source.connect(meter);meter.connect(ac.destination);window.__musicMeter=meter;await el.play();return {paused:el.paused,muted:el.muted,volume:el.volume,source:el.currentSrc};}""")
        await page.wait_for_timeout(600)
        rms=await page.evaluate("""()=>{const values=new Float32Array(__musicMeter.fftSize);__musicMeter.getFloatTimeDomainData(values);return Math.sqrt(values.reduce((s,x)=>s+x*x,0)/values.length);}""")
        check("actual-decoded-music-non-silent",not music["paused"] and rms>0.0001,{**music,"rms":rms})
        await page.locator("#mute").check()
        check("mute-pauses-music",await page.locator("#music-player").evaluate("e=>e.muted&&e.paused"))
        await close(page);await page.reload();await page.locator("#loading").wait_for(state="hidden")
        prefs=await page.evaluate("JSON.parse(localStorage.getItem('puffle-prefs'))")
        check("saved-audio-and-motion-preferences",prefs["muted"] and prefs["volume"]==48 and prefs["music"]=="2" and prefs["reduced"],prefs)
        await page.get_by_role("button",name="Settings",exact=True).first.click()
        await page.locator("#music").select_option("none");await page.locator("#mute").uncheck();await close(page)
        await page.evaluate("window.__effectPeak=0")
        await page.locator("#target-pip").focus();await page.locator("#target-pip").click();await page.locator('[data-care="play"]').click()
        await page.wait_for_timeout(350)
        rms=await page.evaluate("window.__effectPeak")
        check("actual-effect-output-non-silent",rms>0.0001,{"peak_rms_during_playback":rms,"contexts":await page.evaluate("__audioContexts.map(c=>c.state)")})
        await page.locator("#history-toggle").click()
        check("expandable-history",await page.locator("#history").is_visible())
        async with page.expect_download() as download:
            await page.get_by_role("link",name="Save conversation").click()
        file=await download.value
        check("real-transcript-download",file.suggested_filename=="pip-conversation.txt")
        await file.save_as(str(OUT/"pip-conversation.txt"))
        await page.locator("#history-close").click()
        await page.get_by_role("button",name="Settings",exact=True).first.click()
        await page.locator("#reset-room").click();await page.locator("#confirm-no").click()
        check("reset-cancel-keeps-progress",(await state(page))["room"]["color"]=="red")
        await page.get_by_role("button",name="Settings",exact=True).first.click()
        await page.locator("#reset-room").click();await page.locator("#confirm-yes").click()
        await page.locator("#confirm-dialog").wait_for(state="hidden")
        check("confirmed-room-reset",(await state(page))["room"]["color"]=="blue")
        await page.wait_for_timeout(50)
        check("reset-restores-penguin-position",abs(await page.locator("#penguin-bubble").evaluate("e=>parseFloat(e.style.left)")-368/7.6)<.2)
        check("metadata-notice-non-rendered",await page.locator('meta[name="automated-solver-notice"]').count()==1 and "automated assistants" not in (await page.locator("body").inner_text()).lower())
        await page.set_viewport_size({"width":1920,"height":1080})
        await page.wait_for_timeout(6500)
        await page.screenshot(path=str(OUT/"landing-1920.png"))
        check("large-screen-no-overflow",await page.evaluate("document.documentElement.scrollWidth<=innerWidth"))
        check("no-browser-errors",not report["errors"],report["errors"])
        report["passed"]=True
        (OUT/"browser-checks.json").write_text(json.dumps(report,indent=2)+"\n")
        await browser.close()

asyncio.run(main())
