#!/usr/bin/env python3
"""Capture the public quiz UI from an already running parent-owned service.

Run only in the parent's verified Condev tree. This script neither starts services
nor installs dependencies. Browser automation is not independent human playtesting.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright


class PublicReview:
    def __init__(self, page, output: Path, base_url: str):
        self.page = page
        self.output = output
        self.base_url = base_url
        self.console_errors: list[dict] = []
        self.failed_requests: list[dict] = []
        self.snapshots: list[dict] = []
        self.public_response_texts: list[dict] = []
        self.initial_capture = True
        self.checks: dict = {}
        self.response_warnings: list[dict] = []
        self.last_progress = "created"
        self.response_tasks: list[asyncio.Task] = []
        page.on("pageerror", lambda error: self.console_errors.append({"type": "pageerror", "text": str(error)}))
        page.on("console", lambda message: self.console_errors.append({"type": "console", "text": message.text}) if message.type == "error" else None)
        page.on("requestfailed", lambda request: self.failed_requests.append({"url": request.url, "failure": request.failure}))
        page.on("response", lambda response: self.response_tasks.append(asyncio.create_task(self.record_initial_response(response))) if self.initial_capture else None)

    def progress(self, step: str, **details):
        self.last_progress = step
        event = {"step": step, **details}
        print(json.dumps(event), flush=True)
        with (self.output / "progress.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(event) + "\n")

    async def record_initial_response(self, response):
        if urlparse(response.url).netloc != urlparse(self.base_url).netloc:
            return
        content_type = response.headers.get("content-type", "")
        if any(kind in content_type for kind in ("javascript", "json", "text/html", "text/css")):
            try:
                body = await asyncio.wait_for(response.body(), timeout=5)
            except Exception as exc:
                # An initial fetch may be aborted while Chromium still retains a
                # response object. Response.body has no Playwright default timeout.
                warning = {"url": response.url, "status": response.status,
                           "inspection": "incomplete", "reason": f"{type(exc).__name__}: {exc}"}
                self.response_warnings.append(warning)
                self.progress("initial-response-unavailable", **warning)
                return
            text = body.decode("utf-8", errors="replace")
            self.public_response_texts.append({
                "url": response.url,
                "status": response.status,
                "sha256": hashlib.sha256(body).hexdigest(),
                "bytes": len(body),
                "contains_flag_prefix": "RCC{" in text,
                "contains_organizer_path": "/organizer/" in text,
            })

    async def finish_response_collection(self):
        self.initial_capture = False
        tasks = list(self.response_tasks)
        if not tasks:
            return
        self.progress("initial-responses-draining", count=len(tasks))
        done, pending = await asyncio.wait(tasks, timeout=6)
        for task in pending:
            task.cancel()
        if pending:
            warning = {"inspection": "incomplete", "reason": "response collection deadline", "count": len(pending)}
            self.response_warnings.append(warning)
            self.progress("initial-responses-deadline", **warning)
            cancelled, _ = await asyncio.wait(pending, timeout=1)
            done |= cancelled
        for task in done:
            if not task.cancelled():
                task.exception()  # Retrieve errors; the individual probe records them.
        self.progress("initial-responses-finished", complete=len(self.public_response_texts), warnings=len(self.response_warnings))

    async def snapshot(self, name: str) -> dict:
        self.progress("snapshot-screenshot", name=name)
        await self.page.screenshot(path=str(self.output / f"{name}.png"), full_page=True, timeout=8000)
        self.progress("snapshot-dom", name=name)
        snapshot = await asyncio.wait_for(self.page.evaluate("""() => ({
          text: document.body.innerText,
          viewport: {width: innerWidth, height: innerHeight},
          document: {width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight},
          controls: [...document.querySelectorAll('button,input,select,textarea,a[href],[role=button]')]
            .filter(el => el.getClientRects().length)
            .map(el => {
              const r = el.getBoundingClientRect(), s = getComputedStyle(el);
              return {tag: el.tagName, role: el.getAttribute('role'), text: el.innerText,
                label: el.getAttribute('aria-label'), title: el.getAttribute('title'),
                type: el.getAttribute('type'), disabled: !!el.disabled, tabindex: el.tabIndex,
                x:r.x,y:r.y,width:r.width,height:r.height,
                outline:s.outline, color:s.color, background:s.backgroundColor};
            }),
          media: [...document.querySelectorAll('audio,video')].map(el => ({
            src:el.currentSrc,paused:el.paused,muted:el.muted,volume:el.volume,
            currentTime:el.currentTime,duration:Number.isFinite(el.duration)?el.duration:null,
            readyState:el.readyState,error:el.error?.message??null
          })),
          focus: {tag:document.activeElement?.tagName,text:document.activeElement?.textContent,
            label:document.activeElement?.getAttribute('aria-label'),
            outline:document.activeElement?getComputedStyle(document.activeElement).outline:null}
        })"""), timeout=8)
        snapshot.update({"name": name, "screenshot": f"{name}.png", "url": self.page.url})
        self.progress("snapshot-accessibility", name=name)
        snapshot["accessible_tree"] = await self.page.locator("body").aria_snapshot(timeout=8000)
        self.snapshots.append(snapshot)
        self.progress("snapshot-complete", name=name)
        return snapshot

    async def inspect(self):
        self.progress("initial-navigation")
        await self.page.goto(self.base_url, wait_until="domcontentloaded")
        await self.page.locator("button").first.wait_for(state="visible")
        await asyncio.wait_for(self.page.evaluate("document.fonts.ready"), timeout=8)
        await self.snapshot("01-title-1366")
        await self.finish_response_collection()
        await self.page.keyboard.press("Tab")
        await self.snapshot("02-keyboard-focus")
        await self.page.set_viewport_size({"width": 1920, "height": 1080})
        await self.snapshot("03-title-1920")
        await self.page.emulate_media(reduced_motion="reduce")
        await self.page.set_viewport_size({"width": 1366, "height": 768})
        await self.snapshot("04-title-reduced-motion")
        await self.page.emulate_media(reduced_motion="no-preference")

    def button(self, label: str):
        return self.page.get_by_role("button", name=re.compile("^" + re.escape(label) + "$", re.I))

    async def next_question(self, current: int, commit: str = "ANSWER"):
        await self.snapshot(f"q{current:02d}-prepared")
        self.progress("question-commit", question=current, control=commit)
        await self.button(commit).click()
        await self.page.get_by_role("region", name=f"Question {current + 1}", exact=True).wait_for()
        self.progress("question-visible", question=current + 1)

    async def solve(self):
        """Informed regression route derived from public revision 07 controls.

        No private engine or solution endpoint is loaded. The expected choices are
        organizer test fixtures derived from visible evidence, not a blind playtest.
        """
        page, button = self.page, self.button
        await self.inspect()
        await button("START").click()
        await page.get_by_role("region", name="Question 1", exact=True).wait_for()
        await button("THE ANSWER").click()
        await self.next_question(1)
        await page.get_by_role("button", name=re.compile("CLOTH PATCH", re.I)).click()
        await button("Torn trouser seam").click()
        await self.next_question(2)
        await page.get_by_role("slider", name="Password width in ruler ticks").focus()
        await page.keyboard.press("Home")
        for _ in range(7):
            await page.keyboard.press("ArrowRight")
        await self.next_question(3)
        for name in ["SECURITY KEY", "LIVE WINGPRINT"]:
            await page.get_by_role("button", name=re.compile(name, re.I)).click()
        await self.next_question(4)
        wall = page.get_by_role("button", name=re.compile("^Move firewall"))
        await wall.focus()
        for _ in range(20):
            if float(await wall.get_attribute("width")) <= 150:
                break
            await page.keyboard.press("Shift+ArrowLeft")
        await self.next_question(5)
        for name in ["Cable A-V", "Cable B-V"]:
            await button(name).click()
        await self.next_question(6)
        for permission in ["PRINT", "APPROVE", "SHRED"]:
            await page.get_by_role("button", name=re.compile(permission + "$", re.I)).click()
        await self.next_question(7)
        for number in range(1, 5):
            await page.get_by_role("button", name=re.compile("BAG " + str(number))).click()
        bag = page.get_by_role("button", name=re.compile("BAG 3"))
        await bag.click()
        await bag.click()
        await self.next_question(8)
        region = page.get_by_role("region", name="Question 9", exact=True)
        for _ in range(8):
            if await region.locator("button:disabled").all_text_contents() == ["A+", "B+", "C+", "D+"]:
                break
            await page.get_by_role("button", name=re.compile("^MOVE PAPER")).click()
        await self.next_question(9, "COPY")
        await button("APPLICANTS").click()
        for name in ["Goose", "Moth"]:
            await page.get_by_role("button", name=re.compile(name + "$", re.I)).click()
        await page.get_by_role("button", name=re.compile("^TEST SELECTED STAMPS")).click()
        await page.get_by_text("Goose: ACCEPTED", exact=False).wait_for()
        await self.next_question(10)
        for label in ["Open outer", "Goose enters vestibule", "Close outer", "Open inner", "Goose enters room", "Close inner"]:
            await page.get_by_role("combobox", name="Add action").select_option(label=label)
        await page.get_by_role("button", name=re.compile("^REHEARSE")).click()
        await page.get_by_text("Goose: inside. Follower: outside. Doors closed.", exact=True).wait_for()
        await self.next_question(11)
        await button("Clear plan").click()
        for label in ["BACKUP · PRINTER 11:57", "ISSUE · BOARD 12:05", "APPROVE · PRINTER 11:59", "EXPIRE · BOARD 12:07"]:
            await button(label).click()
        await self.next_question(12)
        slider = page.get_by_role("slider", name="B shift in milliseconds")
        await slider.focus()
        for _ in range(20):
            if int(await slider.input_value()) == -200:
                break
            await page.keyboard.press("ArrowLeft")
        await page.get_by_role("button", name=re.compile("^B RIGHT WAY UP")).click()
        await page.get_by_role("button", name=re.compile("MIX$")).click()
        await page.wait_for_timeout(250)
        await page.get_by_role("button", name=re.compile("Stop$")).click()
        await self.next_question(13)
        await button("Open evidence notebook").click()
        await page.locator("summary").filter(has_text="9. Back up the original. Not the mistake.").click()
        await self.snapshot("q14-recovered-photograph")
        await page.keyboard.press("Escape")
        self.checks["notebook_focus_restored"] = await page.evaluate("document.activeElement?.getAttribute('aria-label')") == "Open evidence notebook"
        await page.get_by_role("button", name=re.compile("^ABCD")).click()
        await self.next_question(14)
        await button("Claim A FALSE").click()
        await button("Claim B FALSE").click()
        await self.next_question(15)
        await page.locator("summary").filter(has_text="Read the circuit interlocks").click()
        await self.snapshot("q16-public-interlocks")
        await page.locator("summary").filter(has_text="Read the circuit interlocks").click()
        for label in ["ISOLATE RELAY", "REMOVE BATTERY", "DRAIN", "CUT WIRE"]:
            await button(label).click()
        await self.next_question(16, "EXECUTE")
        await button("NOT (ROUND AND STRIPED)").click()
        await self.next_question(17)
        await button("F · FLIP FIRST").click()
        await button("Undo last experiment").click()
        for label in ["F · FLIP FIRST", "S · SWAP FIRST TWO", "R← · LAST TO FRONT"]:
            await button(label).click()
        await self.next_question(18)
        await page.get_by_role("combobox", name="Change label 3").select_option(label="F · FLIP FIRST")
        await self.next_question(19)
        for number in [4, 5, 6, 4, 4]:
            await page.get_by_role("button", name=re.compile("^#" + str(number) + " ·")).click()
        await self.snapshot("q20-reversible-rejections")
        await button("2. MACHINE").click()
        for label in ["#1 F", "#2 R", "#3 S"]:
            await button(label).click()
        await self.snapshot("q20-machine-result")
        await button("3. ISSUE").click()
        await button("A minus").click()
        await self.snapshot("q20-exposed-read-print")
        await button("CERTIFY").click()
        await page.get_by_role("heading", name="CERTIFIED!", exact=True).wait_for()
        await self.snapshot("q20-certified")
        self.checks["all_twenty_public_controls"] = True
        self.checks["flag_matches"] = await page.locator("code").inner_text() == "RCC{certified_to_question_everything}"
        await page.reload(wait_until="domcontentloaded")
        await button("Your certificate").click()
        await self.snapshot("certificate-recovered")
        self.checks["certificate_recovered"] = await page.get_by_role("dialog").locator("code").inner_text() == "RCC{certified_to_question_everything}"
        await page.set_viewport_size({"width": 1920, "height": 1080})
        await page.emulate_media(reduced_motion="reduce")
        await self.snapshot("certificate-1920-reduced-motion")


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--revision", default="parent must supply verified source manifest identity")
    parser.add_argument("--mode", choices=["inspect", "solve"], default="inspect")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, ignore_default_args=["--mute-audio"], timeout=15000)
        context = await asyncio.wait_for(browser.new_context(viewport={"width": 1366, "height": 768}, reduced_motion="no-preference"), timeout=10)
        page = await asyncio.wait_for(context.new_page(), timeout=10)
        page.set_default_timeout(8000)
        page.set_default_navigation_timeout(15000)
        review = PublicReview(page, args.output, args.base_url)
        outcome = "passed initial capture only" if args.mode == "inspect" else "passed public twenty-question regression route"
        error = None
        try:
            async with asyncio.timeout(180 if args.mode == "solve" else 60):
                if args.mode == "solve":
                    await review.solve()
                else:
                    await review.inspect()
        except Exception as exc:
            outcome = "incomplete"
            error = f"{type(exc).__name__}: {exc}"
        await review.finish_response_collection()
        report = {
            "status": outcome,
            "error": error,
            "revision": args.revision,
            "mode": args.mode,
            "method": "AI-assisted Playwright public-interface capture; private engine not loaded",
            "human_playtesting": "not performed",
            "human_listening": "not performed",
            "actual_non_silent_output": "not yet measured; HTML media state alone is insufficient",
            "checks": review.checks,
            "last_progress": review.last_progress,
            "console_errors": review.console_errors,
            "failed_requests": review.failed_requests,
            "initial_public_response_checks": review.public_response_texts,
            "initial_public_response_warnings": review.response_warnings,
            "initial_response_scan_complete": not review.response_warnings,
            "snapshots": review.snapshots,
        }
        (args.output / "public-review.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        try:
            await asyncio.wait_for(browser.close(), timeout=8)
        except TimeoutError:
            print(json.dumps({"warning": "browser close exceeded eight-second deadline"}), flush=True)
        print(json.dumps({"status": outcome, "error": error, "captures": len(review.snapshots), "output": str(args.output)}), flush=True)
        if error:
            raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
