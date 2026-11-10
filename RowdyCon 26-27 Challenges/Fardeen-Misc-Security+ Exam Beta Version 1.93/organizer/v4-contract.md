# Question version 4 integration contract

Private organizer material. This contract supersedes v3 where specified below; other question actions and facts remain unchanged. It is not a validation report.

## State and commitment

`questionVersion` is **4**. Older sessions migrate once to a fresh attempt, retaining personal notes and discarding old progress, rewards, automatic artifacts and deduplication responses. Browser preferences remain client-owned. Within v4, ordinary restart preserves personal notes, earned notebook artifacts and an earned certificate, while resetting progress, inventory and the private Q10 copy.

Request IDs and attempt/revision/question guards, SQLite transactions, exact retry responses and conflicting-request rejection remain unchanged. Ordinary wrong graded answers cost one life. An incorrect Q17 **Deploy** costs two lives, clamped at zero. Free binding, inspection and malformed/stale requests do not grade. The client displays the two-life stake before deployment and gives the goose a distinct upset response afterward.

The persisted server state includes private `approvedCopy: {bytes,sha256} | null`. Only successful Q10 Eject sets it. Public `view()` does not serialize this field. It is never an acquired notebook artifact. The client receives no Q17 approval identifier, original-copy label, original digest or retained USB contents.

## Changed question contracts

| Q | Facts and behavior | Actions |
|---|---|---|
| 4 | Prompt: **MAKE THE ARCHIVE UNREADABLE. KEEP EVERY DISK BYTE.** The sole K7 key remains a real private archive-key record. Choices are `format`, `overwrite`, `destroy-key`, `rename`; the correct label is **DESTROY K7**. Wrong choices preserve recoverable state. | `answer {id}`; destroying K7 removes its record and verifies intact ciphertext and no modeled recovery copy. |
| 10 | Existing source files, clipboard, destination copies and device behavior remain. Properties can expose full SHA-256 from `facts.files`. Successful Eject retains actual approved bytes privately and awards token II; no `approved-release` notebook entry is acquired. | Existing `select-source`, `copy-file`, `select-device`, `paste-file`, `eject`. No save-hash instruction or automatic personal note. |
| 13 | `facts.badges` remains four 24×24 approved/current bitmaps. Every image contains 284 ink pixels: a common border and balanced deterministic mosaic. Only C differs, in twenty balanced pixels outlining a 6×6 hollow square. Raw size, density and silhouette do not identify C; actual XOR reveals its delta. | Existing `answer {id:'A'|'B'|'C'|'D'}`. Viewer modes remain local UI operations on real supplied pixels. |
| 16 | Checksum and all accepted counts remain unchanged; presentation explains the original/edited count and arithmetic. | Existing `set-count {value}`, `submit-count {}`. |
| 17 | Facts contain only `releases`, `aliases`, `latest`. Initial draft remains `{binding:'LATEST',deployed:null}`. Release filenames, versions and byte lengths match. Opaque IDs and fixed shuffled display order avoid ordinal shortcuts. Actual deployment must use an immutable binding and match the private Q10 bytes and verified digest. | `bind {reference}` is free. Accept immutable ID, complete SHA-256 or `sha256:<digest>`. `deploy {}` grades; wrong deployment costs two lives. |
| 19 | Eight fixed-shuffled records retain `{id,timestamp,action,previousHash,bytes,sha256,anchor}`. All use `09:41:12`; a visible notice explains that the journal clock is frozen. Every successor's PREV is the SHA-256 of the preceding exact record. Full bytes/hashes stay accessible across the client's two pages of four cards. | Existing `archive-event {id}` grades the latest causal DENY while logging continues. `recording {on:false}` costs one life; resuming is free. |
| 20 | Original shares, PIN, server eligibility and reward remain unchanged. The client explains selection, movement, 180-degree rotation and XOR preview without supplying the PIN. | Existing `unlock {pin}`. |

## Fixed fixtures

Q17 public release order is **rel-v3p9, rel-k7m2, rel-c8r4**. `LATEST` points to **rel-v3p9**. The approved release is **rel-k7m2**, selected by explicit `APPROVED_RELEASE` lookup rather than array position. Its original bytes are unchanged. Other releases pad their rounding fields with spaces so all three have the same byte length; digest calculations include those real spaces and the final LF. Build numbers remain inside inspectable contents, not release handles or the Q10 Properties presentation. Equivalent external comparison of actual evidence remains valid.

The Q15 denial artifact now includes `timestamp=09:41:12`. Q19 uses those acquired bytes as its checkpoint, then builds this actual chain:

`Q15-CHECKPOINT (DENY) → EV-R7M (DENY) → EV-C2P (DENY) → EV-V8H (ALLOW) → EV-N6K (DENY) → EV-D9T (DENY) → EV-B4Q (DENY) → EV-H3F (ALLOW)`.

The correct latest denial is **EV-B4Q**; the final record is an ALLOW. Display order is **EV-V8H, EV-D9T, Q15-CHECKPOINT, EV-B4Q, EV-H3F, EV-R7M, EV-N6K, EV-C2P**. Every non-checkpoint record has the same generic subject and action-appropriate note. Clock value, greatest ID and last card do not identify the answer.

Q1 is unchanged. Token bitmap dimensions, seed strings, XOR relationship, PIN, original private flag, archive key material and issuer key material are unchanged. No new anti-agent restriction or alternate fake reward is introduced.

## Validation ownership

Server tests cover balanced badge counts and actual differences, private Q10 proof, equivalent immutable deployment references, two-life clamping and recovery, state/API non-disclosure, migration, persisted proof after service restart, duplicate/stale requests and eight-record chain order/bytes. Root owns fresh verified Condev staging, execution, client integration, captures, ordinary controls, audio, document synchronization and final parity. No host project execution or service lifecycle work is performed by the server-editing agent.
