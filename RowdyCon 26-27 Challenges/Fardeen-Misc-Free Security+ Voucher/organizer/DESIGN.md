# The Impossible Security+ Quiz — question version 5

Misc / Logic · approved Hard–Very Hard. The current authored v5 questions and this brief reflect focused user revisions to Q3, Q4, Q8, Q12 and Q14; unrelated mechanics and approved presentation are preserved. The rating remains the user's approved label; independent human calibration has not been performed.

| Decision | Current intent |
|---|---|
| Audience and difficulty | College students comfortable with Security+ vocabulary, precise reading, state changes, and actual data. Short tricks alternate with layered investigations, including new hardware/storage and packet-forwarding puzzles. [Approved difficulty anchors](../../CHALLENGE_REFERENCES.md#difficulty-anchors) concern reasoning and dependencies, not lives, replay, hidden controls or question count. |
| Category and medium | Misc / Logic in a compact browser quiz. Discoveries include literal typography, empty sets, whitespace, scope, condition changes and causal evidence. Fixed fictional security models make technical behavior observable. |
| Theme and references | The original 2007 Impossible Quiz: a 550×400 white stage, handwritten lettering, pink/blue answers, three lives, skips, abrupt failure and a final token reveal. SY0-NOPE and the goose preserve the approved art/audio. The [original release](https://www.newgrounds.com/portal/view/365143) remains the presentation reference. |
| Scenario and objective | Complete twenty absurd security questions and obtain the certificate. Apparent strength, an account named NOBODY, a blank-looking password and a recent-looking timestamp can differ from the relevant property. |
| Central insight | Determine what the words, controls and data actually refer to. Short questions test distinct assumptions; layered questions reconstruct actual relationships. Q4 uses the two meanings of volume; Q8 challenges visual hop-count assumptions; Q12 separates page labels, document position and independent queues. Auxiliary object transport is not a universal answer pattern. |
| Payoff and validation | Correct commits advance immediately. Q5/Q10/Q15 award actual token-back XOR shares. Q20 verifies the PIN, nineteen completions and three unspent tokens, atomically consuming inventory into a recoverable certificate. |

## State, accessibility, and commitment

Question version is 5. Ordinary wrong graded answers cost one of three lives; Q17 wrong deployment costs two, clamped at zero, with its cost stated on that question. Inspections, checkboxes, clipboard operations, neutral state changes and checksum observations return ordinary state only. There is no free validity check, correctness preview, universal ANSWER control, early finale warning or advance skip warning. Graded controls use appropriate labels: Publish, Eject, Admit, Revoke, Apply, Submit, Deploy, Archive, Unlock, or the answer itself.

Every action retains its attempt/revision/question guard and request ID. Exact retries reuse their response; conflicting reuse fails. State and deduplication persistence remain one SQLite transaction. Version 4 and older sessions migrate once to a fresh v5 attempt, retaining personal notes and browser preferences while discarding old progress, artifacts, rewards and deduplication responses. Within v5, full restart preserves personal notes, acquired artifacts and an earned certificate, but resets Q1, lives, completions and inventory.

Keyboard users receive equivalent evidence and controls. HTML markup and rendered style derive from the same authored tree. Device rules, stored samples, queues and actual bytes are inspectable without a verdict. Filenames, bytes, URLs and hashes remain readable and copyable. Q7 preserves whitespace; Q16 preserves leading zeroes. Q10 uses familiar Copy/Paste controls with honest empty/selection/clipboard states. Q11 visibly starts both people in PUBLIC, with movement arrows, door states and a continuous maintenance route. Failed admission leaves the inner door closed.

Only current fixtures and acquired artifacts are public. Answer predicates, plaintext final PIN and original flag remain server-side. Scripts and external analysis remain valid. Q13 pixels and Q20 token backs are intentional evidence.

## Discovery sequence

| Q | Evidence → inference → action → confirming result |
|---|---|
| 1 | SSH default port, 20/21/23/25, movable +1 → 21 needs one more → place +1 on 21 and select → actual arithmetic is 22. Preserved exactly. |
| 2 | Installed 2.1 versus inspectable loaded 2.0 → installed differs from running → answer 2.0 → evaluate the actual loaded image. |
| 3 | Four equally bold HTML proofs → visual weight differs from semantic ancestry → inspect complete fragments, toggle house style, choose the word wholly inside strong → every actual text character has strong ancestry. A partial strong span, b tag, and class named strong are distinct decoys. |
| 4 | GB in the objective, speaker percentage, C: size and a disk map → storage volume requires adjacent unallocated blocks → move TOOLS intact to start8–10, resize C: to8, Apply → real block contents retained and C: capacity8. Speaker settings are a simulated decoy independent of actual sound preferences. |
| 5 | ALICE/BOB/EVE/NOBODY accounts, NOBODY allowed; AUTHORIZED ACCOUNTS: 0 → the account named NOBODY still grants access → clear all and Apply → allowed set is empty. |
| 6 | Password or PIN, key for either; four expressions → scope controls factor requirements → choose (PASSWORD OR PIN) AND KEY → evaluate all eight Boolean input combinations. |
| 7 | Bracketed password is one ASCII space; input starts at zero characters → blank-looking differs from empty → one space, Submit → exact bytes equal 0x20. Dummy exam input only. |
| 8 | TTL1 packet, inspectable router/switch forwarding rules, selected directional wires → forwarding through a router expires the packet, but Layer2 devices preserve TTL → configure PC→S1→S2→S3→SERVER and Launch → actual transitions deliver unchanged payload. Both unused R1 output settings pass; loops fail with a trace. |
| 9 | EMP-4107 beneath cover and in comment, public $48,000 budget → concealment retains actual and duplicate text → remove both copies, retain budget/title, Publish → resulting bytes contain no EMP-4107. Redaction markers and nonsensitive comment wording are valid equivalents. |
| 10 | Same Copy/Paste/Eject task. Ordinary file Properties exposes name, type, size and full selectable SHA-256. No retention hint, automatic notebook artifact, or later USB receipt. Player-written notes remain available. Successful copy establishes private server evidence for Q17. |
| 11 | Authorized C-701, visitor, door states, open maintenance path → admission requires candidate alone and all other entrances closed → operate outer door, candidate movement and hatch, Admit → actual boundary state admits candidate. No inspection-order requirement. |
| 12 | Viewer ordinal differs from printed page heading; PC queue and printer memory each contain work → second page means document position, and cancelling one queue does not recall the other → select ordinal2/onecopy, clear both queues, Print → actual output is exactly that page once. Reset restores an identical trial without refunding lives. |
| 13 | Every badge has the same dimensions, border and total ink count, with different balanced binary patterns. Only C has an ink-preserving alteration. Comparing approved/current actual pixels exposes a hollow square; raw density does not identify C. |
| 14 | Final-tape requirement, existing sample C, queued samples A/B, independent monitor and live source → pausing display cannot prevent capture and queued data still drains → route source to unused AUX and choose sample D → actual final bytes omit the selected password. Reload Demo repairs a failed trial without refunding lives. |
| 15 | First-match policy, overlapping groups, operative rule 0 ALLOW ANY → early broad rules dominate → reorder, Apply → actual evaluator allows staff non-intern TCP 443 only. Acquire actual denial event and token III. |
| 16 | Original COUNT42 and stored checksum6 are fixed. Only replacement COUNT is editable. A separately labeled read-only calculation shows first digit + second digit. Submit a different two-digit count whose actual sum remains6; valid alternatives stay06,15,24,33,51,60. |
| 17 | Three equal-size, same-version artifacts have opaque handles. The player must recall or personally record Q10 content identity; no automatic receipt is supplied. Deploy an immutable matching hash/reference. Actual bytes are checked against private earlier copy. Wrong deployment costs2lives; urgent goose supplies pressure without a timer. |
| 18 | CT-2048 paper and issuer record; which copy must be destroyed → revocation changes status, not deletion → NEITHER → actual signed issuer revocation retains records. Wrong choices leave recoverable state. |
| 19 | Eight actual hash-linked records include the checkpoint, five later DENY events and two ALLOW events. All clocks read09:41:12; IDs/display order are nonchronological. Follow PREV from Q15 through the complete chain and archive the last DENY while logging remains on. Two free pages preserve readable evidence; complete hashes/bytes stay inspectable. |
| 20 | Same fixed three-of-three shares and604827PIN. Explicit face, ADD/REMOVE LAYER, selected input, x/y, MOVE1px, ROTATE180deg and magnify controls clarify the tool. A visible XOR legend explains pixel toggling. No prepared reveal, correctness preview or advance token-purpose hint. All transformed input pixels still drive the output. |

Q10 -> Q17 carries actual bytes privately and requires player-retained identity evidence. Q15 -> Q19 carries an acquired checkpoint artifact. Q13 -> Q20 teaches real XOR. Q14 -> Q19 reverses recorder requirements. Q5/Q10/Q15 -> Q20 retains earned images and inventory. No per-player puzzle variants.

## Actual-data models and limits

Q3 renders the same authored HTML tree that its verifier walks. Q4 relocates actual stored block strings, rejects overlap or data-losing shrink operations, and checks both files remain byte-identical after extending C:. The speaker slider affects only the fictional mixer. Q8 simulates fixed forwarding, TTL decrement and loop termination; it does not contact real networks. Q12 emits actual supplied page bytes from independent queues and the current job. Q14 transforms fixed sample bytes through source, pending spool and tape; no real credentials, browser keystrokes or notes are collected.

Q10 snapshots actual source bytes into the clipboard and chosen modeled device. Both destination copies remain distinct. A shortcut retains link bytes. Q17 accepts immutable IDs or full SHA-256 and compares actual deployed bytes with the private successful copy; it does not simply check a preset release ID. The successful Q10 copy is private verifier state; only player-written notes can retain its fingerprint in the player notebook.

Q18 retains the fixed Ed25519 issuer and verifies an actual signed CT-2048 revocation publication. Records remain. This bounded model makes no claim of immediate client propagation or full X.509/OCSP implementation.

Q19 derives successors from the SHA-256 of the genuinely acquired Q15 checkpoint. Each exact record contains its predecessor hash. Validation checks hashes, fields, one complete anchored chain and the selected latest causal denial. All record timestamps are identical, so only the hash chain establishes relative order. Hash linking establishes this supplied sequence, not trust in arbitrary external logs.

Q20 preserves the fixed 144×40 PIN image and actual shares S1, S2, S3 with S3 = image XOR S1 XOR S2. Seed strings, shares, PIN and event flag remain unchanged. Q13 retains real 24×24 bitmap comparisons.

## Deterrents and validation boundaries

Passive metadata may remain only when separated from puzzle inputs, accessibility labels and organizer instructions. Literal reading, state changes and dependencies may frustrate shallow automation but are puzzle content, not proven anti-agent measures. No CAPTCHA, speed restriction, tool ban, fake reward or mandatory extra step. Independent anti-agent effectiveness is untested.

Authored v5 tests cover real strong ancestry, all disk positions/capacities, all32 forwarding settings, all48 page/copy/queue combinations, all16 source/monitor/sample settings, recovery, and the unchanged callbacks. State/API checks cover full runs, migration from2/3/4, deduplication, concurrent guards, restarts, isolation, eligibility and atomic reward consumption.

Revision5 built successfully and passed51 regression tests on final iq-v5-stage03. The full20-question public browser solve passed with3lives on that tree. Independent focused review and final delivery records are recorded in validation.json; automation does not establish human enjoyment or independent solve difficulty.

The root owns final staging/parity, service lifecycle, browser captures, ordinary controls, desktop layouts, listening, canonical Description.md/Description.docx and delivery records. Technical correctness, visual review, independent human playtesting/listening and anti-agent effectiveness remain separate. Historical v2/v3/v4 passes do not validate v5, and passing automation does not establish human enjoyment or independent solve difficulty.

The current schema is [v5-contract.md](v5-contract.md). Earlier contracts and validation reports are historical.
