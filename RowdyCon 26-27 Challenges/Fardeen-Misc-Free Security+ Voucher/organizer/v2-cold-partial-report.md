# Partial blind agent cold playtest

The fresh first attempt solved questions 1–14 and reached question 15 with **2 lives**, **no skips spent**, and **no restart**. Question 15 was displayed but not manipulated or submitted. The certificate was not reached. The assignment stopped when the root reported **“Fatal error: application network permission was revoked.”** Browser/network play was not resumed, and the revocation was not investigated.

These are **agent impressions, not independent human playtesting**. This is a partial cold solve, not a completed-cold-solve pass.

## Scope and evidence

- Played the existing root-owned `http://localhost:18115` service from Condev, using actual Playwright mouse/keyboard interactions at 1440 × 1050.
- No application source, tests, private puzzle material, walkthroughs, other reports, answer APIs, or server fixtures were read. No PIN or answer brute force was attempted. No public state API was used.
- Read only the runtime skill, staging helper/configuration, and the public interface. The browser helper observed page text, accessible labels, visible-control bounding boxes, and screenshots. This provides assistive-technology advantages over a screenshot-only human: `inner_text()` can include text behind a visual cover. For Q11, I inspected the actual screenshot and moved the floor trim before acting on the concealed hatch.
- The helper's complete-tree stage reported 482 files and zero hash differences on both host and container. The live root-owned stage06 service remained untouched.
- [Action trace](v2-cold-actions.jsonl) records each successful UI operation, its pre-action reasoning, observed text, controls, and screenshot path. Screenshots [001](v2-cold-001.png) through [054](v2-cold-054.png) are actual unaltered browser captures. All 54 PNGs and the trace were copied back after stopping. Screenshot paths inside the trace retain their original Condev location; matching basenames are now beside this report.
- Failed locator operations were printed to the tool transcript rather than added to the JSONL; they are described below. The control-key reload attempt did not visibly reload the headless page and is not evidence of reload persistence.

## First-attempt reasoning

| Question | Evidence and first intended action | Observed outcome |
|---|---|---|
| 1 | SSH is port 22; offered 21 plus loose extra-credit `+1`. Dragged +1 onto 21, then submitted `21 + 1`. | Advanced without losing life. |
| 2 | Installed 2.1 may differ from running code. Opened PROCESS DETAILS; loaded image showed 2.0. Used restart icon. | Advanced. |
| 3 | Four large choices are knowledge factors; physical FIDO2 key supplies possession. Selected PASSWORD then touched key. | Advanced. |
| 4 | AES archive, K7, one retained key copy, and key shredder. Dragged K7 into shredder and pulled lever. | Advanced. |
| 5 | Intern inherits ADMIN from group. Moved badge to DIRECT GRANTS, then chose READ. | Advanced. |
| 6 | Three memorized-secret routes visibly converge. Moved possession gate to JUNCTION and opened sign-in. | Advanced; [diagram](v2-cold-014.png). |
| 7 | Air gap must remove wired and wireless networking while retaining USB-only printer. Clicked Ethernet, then Wi-Fi OFF. | Advanced. |
| 8 | Private memo, folding control, Bob's public key, envelope seal. Folded memo, dragged key to seal, then SEND. | Advanced. |
| 9 | Visual black cover may not remove text; comment count indicates another surface. Lifted cover and opened comments; comment repeated employee ID. Intended to remove both copies, then publish. | One life lost due to queued harness action after obstructed click; see below. Closed comments, removed body ID, verified dash, then published successfully. |
| 10 | Independent device needed for disk-loss survival. Opened FILE DETAILS, then intended to copy APPROVED folder to Device 09 and eject. | Inspector trapped pointer interaction until narrow-edge recovery. Copied folder; device showed 1 ITEM; EJECT advanced. |
| 11 | Diagram shows single-occupant vestibule, authorized C-701, visitor, and yellow route beneath trim. Moved trim, closed maintenance hatch, left visitor in public area, opened outer door, placed C-701 inside, closed outer, opened inner. | Advanced. Attempt to move already-public visitor onto waiting rail caused no visible change and no penalty. |
| 12 | EVERY session includes separately displayed current session. Selected current plus desk, phone, tablet, and remote; count reached 5. Revoked selected. | Advanced. Four exact-text selectors timed out; ordinary coordinate clicks worked. |
| 13 | Difference viewer says matching marks cancel. Registered APPROVED frame in viewer. Only C retained a black mark. Selected C. | Advanced; [actual difference result](v2-cold-051.png). |
| 14 | Password-strength choices do not stop input logging. Used sample input and observed plaintext `demo-a: goose`, then pulled INPUT RECORDING tab. | Advanced. |
| 15 | Displayed FIRST MATCH policy with compatibility ALLOW ANY before DENY INTERNS, ALLOW STAFF TCP 443, ALLOW ANY, DENY ANY. | **No interaction or answer attempted.** Stop boundary; [last capture](v2-cold-054.png). |

## Interaction defects and harness limitations

**Q10 FILE DETAILS is a significant pointer-interaction defect.** Opening it overlays the folders and its own toggle. A drag intended for APPROVED selected inspector text instead, leaving Device 09 EMPTY. The normal FILE DETAILS click timed out because the inspector intercepted pointer events. Escape and Enter had no effect. I recovered by clicking the few exposed pixels at the toggle's left edge, x222/y714, and then completed the intended copy. [Trapped inspector](v2-cold-031.png); [recovered view](v2-cold-035.png). This is unrelated to security reasoning and merits repair. The root acknowledged it and said a repair would be verified separately; no repaired build was played here.

**Q9's life loss must not be scored as a puzzle-reasoning error.** I had already identified both ID copies correctly. My helper queued remove-body, remove-comment, and PUBLISH. The open comment slip covered the body scissors, so the body click timed out; the helper nevertheless continued with the remaining commands. PUBLISH then correctly rejected a document still containing the body ID. I dismissed feedback, toggled comments closed, removed the body ID, and published. [Open comment slip](v2-cold-023.png), [rejected publication](v2-cold-025.png), [body ID removed](v2-cold-028.png). The overlap creates a small interaction burden, but the unwanted submission was a harness sequencing mistake. Do not count it as a spontaneous player error.

**Q12 exact-name selector failures were harness issues.** The four device-card names were not matched by the supplied newline-containing exact locators. Clicking their displayed centers selected them normally, and the selected count confirmed all five. No life was lost.

## Agent impressions

**Discovery and strengths.** Q1 immediately establishes that the page itself supplies tools beyond the four boxes. Q2 gives a useful confirmation before committing a fix. Q5–Q7 connect spatial manipulation to inheritance, complete mediation, and physical connectivity. Q9 rewards checking a second evidence surface. Q11's yellow route motivates inspecting the floor trim. Q13's cancellation result is an especially clear visual confirmation. The repeated separate commit controls make many experiments feel safe. The original quiz style is recognizable in the landing capture.

**Wording and friction.** Short directives were generally understandable to an agent with Security+ knowledge; no wording alone blocked progress through Q14. Q10's inspector added confusion: it exposes a raw JSON list where all three release payloads say APPROVED, while the visible folders include APPROVED, NEWEST, and ARCHIVE, with no obvious mapping in that panel. It was unnecessary for the successful backup action and felt less like an authored exam object than the other interfaces. Q14 was particularly direct once the recording tab was visible. After the first several questions, many answers follow the repeated pattern “find the auxiliary object, move or activate it, then commit”; later questions should be judged with human players for whether that remains satisfying.

**Replay burden.** Not directly tested: this attempt never reached zero lives and never restarted. The instructions state that zero lives returns to Q1 and notes/evidence survive. Repeating the accumulated multi-action questions could become tedious, but that is an expectation, not an observed result. No claim about actual reset behavior or note recovery is made.

**Skips.** Three arrow slots were present in the DOM throughout. They are not three starting tokens. Actual captures show one gold arrow and two gray slots at Q6/Q10, and two gold arrows plus one gray slot at Q13. No arrow was activated. The exact award thresholds and skip behavior were not tested; do not infer them from placeholder count.

**Enjoyment.** As agent impressions, the strongest moments are the small security-consistent reinterpretations and visible confirmations. The Q10 overlay was the only major non-puzzle obstruction encountered. A complete enjoyment assessment, final payoff assessment, and later difficulty assessment remain unavailable because play stopped at Q15. No human listening, independent human playtesting, or anti-agent-effectiveness assessment occurred.

## Remaining boundary

Q15–Q20, any PIN puzzle, certificate payoff, failure/replay loop, sound output, reload persistence, and independent human usability remain unassessed by this cold session. The helper process was left waiting for input in the already-created execution session (5588); it was not used again after the stop instruction. The root owns service lifecycle and any cleanup/repair verification.
