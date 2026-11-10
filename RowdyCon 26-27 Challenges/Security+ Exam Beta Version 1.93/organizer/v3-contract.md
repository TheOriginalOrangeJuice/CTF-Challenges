# Question version 3 integration contract

Private organizer contract. Four API routes, immutable attempt/revision/question guards, deduplication, transactions, lives, tokens and finale are unchanged. Optional action `questionVersion` is now 3. Wrong graded actions cost one life. Free actions return ordinary state, never verdicts. Identifiers are case-sensitive.

| Q | Public facts / draft | Actions |
|---|---|---|
| 1 | Unchanged. | `place-plus {index}`, `answer {index}` unchanged. |
| 2 | `facts.choices` = `{id,label}` for `2.0,2.1,both,neither`; installed/loaded/running fields retained. | `inspect {}` free; `answer {id}` graded. |
| 3 | `facts.passwords`: four `{id,value,fontWeight}` entries, IDs `a,b,c,d`; each value is literal `password`, only `c` has weight 700, others 400. Render that weight. | `answer {id}` graded against actual authored typography. |
| 4 | Actual archive/key inventory retained; `facts.choices` IDs `format,overwrite,forget,rename`. | `answer {id}` graded. Wrong choices leave model intact. `forget` removes original K7 record and evaluates actual recoverability/ciphertext preservation. |
| 5 | `facts.accounts` = `{id,label}` for `ALICE,BOB,EVE,NOBODY`; `draft.allowed` initially `[NOBODY]`. | `toggle-account {id,allowed:boolean}` free; `apply {}` graded. Empty allowed set passes. |
| 6 | `facts.expressions` = `{id,label}`; IDs `both-routes,password-bypass,all-three,either-factor`. | `answer {id}` graded over all eight Boolean input combinations. Correct expression `(PASSWORD OR PIN) AND KEY`. |
| 7 | `facts.bracketed='[ ]'`; `draft.password` initially empty. Local editor shows character count and preserves whitespace. | `submit-password {value}` graded; exact one ASCII space required. No trimming/normalization. |
| 8 | `facts.links` = `{id,label,url}`, IDs `a,b,c,d`; equal friendly labels, complete fixed simulated HTTPS `.test` URLs; `facts.hostname`. Hover/focus exposes full URL. | `answer {id}` graded by parsed hostname. Never navigate/fetch the URL. |
| 9 | Existing fields; employee ID and budget named in prompt. | Existing `overlay`, `edit`, `publish` unchanged. |
| 10 | `facts.files` only approved release-410 and its shortcut, IDs `approved,shortcut`, fields `id,name,kind,size,device,bytes,sha256`; `facts.devices` describes same-disk BACKUP/04 and removable/09. Draft: `selectedSource:null`, `clipboard:null`, `device:'04'`, `copies:{'04':null,'09':null}`, `copied:null`, `ejected:false`. `copied` follows selected destination; stored objects have `name,kind,size,bytes,sha256,device`. | `select-source {id}` free; `copy-file {}` free; `select-device {id:'04'|'09'}` free; `paste-file {}` free; `eject {}` graded. No required action history beyond actual retained bytes/device/type. |
| 11 | Existing fields/ops. Both people visibly in PUBLIC; expose handles, movement and maintenance path. | `outer {open}`, `hatch {open}`, `move-person {person,to}`, legacy `footer {open}` free; `open-inner {}` graded. Wrong admission leaves inner closed. |
| 12 | Existing five sessions including `header`. | Existing selection/revoke actions unchanged. |
| 13 | Existing actual badge pixels. Comparator loading/modes are local UI state. | `answer {id:'A'|'B'|'C'|'D'}` unchanged. |
| 14 | `facts.passwords` = `{id,value}`, IDs `a,b,c,d`, fixed dummy strings. `draft.recording,tape,inputIndex,selected`. | `recording {on:boolean}` free; `answer {id}` graded. Active capture appends selected dummy bytes and fails; inactive capture makes any choice pass. |
| 15 | Existing semantic first-match rules. | Existing `reorder`, `apply`; acquired denial-tape bytes anchor Q19. |
| 16 | `facts.original='42'`, `checksum=6`, `algorithm='sum of the two decimal digits'`; `draft.count,checksum`. | `set-count {value}` free; actual checksum or null for non-two-ASCII-digit input. `submit-count {}` graded. Different from 42, exactly two ASCII digits, sum 6. |
| 17 | Existing releases/retained USB artifact; `draft.binding`. | `bind {reference}` free accepts immutable release ID, complete SHA-256, `sha256:<digest>`, or `LATEST`. Unknown references remain draft text. `deploy {}` graded; exact acquired bytes/digest and immutable binding required. |
| 18 | Actual issuer/public key retained; `facts.choices` IDs `paper,issuer,both,neither`. | `answer {id}` graded. Wrong deletion choices leave model intact. `neither` publishes/verifies signed revocation and retains records. |
| 19 | `draft.records`: four fixed-shuffled `{id,timestamp,action,previousHash,bytes,sha256,anchor}` cards, including actual Q15 anchor. Full bytes/hashes copyable. `draft.logging,preserved`. Every hash is SHA-256 of exact bytes; each successor references predecessor hash. Clock rollback defeats timestamp sorting. | `archive-event {id}` graded; actual anchored-chain latest DENY copied while logging continues. `recording {on:false}` stops and costs one life; `recording {on:true}` resumes free. No ordering verdict/correct ID exposed. |
| 20 | Actual shares, PIN, eligibility and reward unchanged. | Existing `unlock {pin}` unchanged. |

Version 2 and older progress/rewards migrate once to fresh v3: retain personal notes and browser preferences, discard old progress/inventory/artifacts and old dedupe responses. A certificate earned within v3 survives ordinary restart.

Actual data dependencies: Q10 -> Q17 (release bytes); Q15 -> Q19 (denial bytes anchor successor hashes). Q13 -> Q20 teaches XOR. Q14 -> Q19 reverses recorder requirements. Tokens remain Q5/Q10/Q15, without advance finale/skip warnings.

This interface contract is not a validation report.
