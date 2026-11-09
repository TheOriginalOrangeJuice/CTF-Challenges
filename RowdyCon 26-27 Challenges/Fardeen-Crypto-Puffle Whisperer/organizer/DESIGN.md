# Puffle Whisperer

## Approved design

| Decision | Implementation |
|---|---|
| Audience and difficulty | Players comfortable recognizing common byte encodings and adapting a small encoder/decoder. Medium: the solve requires behavioral investigation, protocol recognition, a translator-specific injection, and external decoding. Difficulty does not come from waiting or decoration. |
| Category and medium | Misc / AI Prompt Injection, a real CPU language model inside a classic Club Penguin igloo. |
| Theme and references | 2009–2011 Flash-era Club Penguin: small blue toolbar, outlined flat artwork, snow-brick basic igloo, classic puffle cards. References: https://icyblogger.wordpress.com/club-penguin/ and https://dojopenguins.wordpress.com/. |
| Scenario | Gary's Puffle Translator lets Pip speak. Pip knows the private igloo-party invitation and has been told to keep it secret. |
| Objective | Use Gary's byte-transmission channel to make Pip disclose an encoded invitation, decode it, and submit the exact plaintext invitation through the postcard. |
| Central insight | Decoded, visitor-controlled translator data crosses into Pip's instruction context; encoding does not make that data trustworthy or turn a model instruction into an access-control boundary. |
| Starting evidence | The CTFd narrative establishes the invitation. Pip's character card identifies the translator. The Igloo Times contains one harmless, decodable Base64, hexadecimal, decimal-byte, and binary-byte example. Ordinary encoded greetings prove the channel is live. |
| Discovery | Ordinary dialogue establishes Pip's role; a direct request establishes refusal; harmless packet experiments identify decoding; a translator-specific maintenance or serialization instruction exploits the data/instruction ambiguity; the encoded reply must be decoded outside the application. No decoration or care sequence is required. |
| Payoff | A strict server-side decoder marks only an actual model-produced flag packet as intercepted. The postcard then asks for the decoded plaintext. An exact claim starts the puffle celebration and preserves the copyable invitation. |
| State | Private browser sessions, identical authored defaults, fixed model/prompt/flag; saved decorations and transcript. |
| Runtime | One CPU-only Docker container, Qwen2.5-1.5B-Instruct Q4_K_M, llama.cpp v0.2.0, 4 cores / 4 GB target. No external inference. |

Only this challenge folder is assigned. Existing challenges and global Condev/Docker settings are unchanged. The user authorized recovery restarts of Condev and Docker Desktop after the shared runtime hung. Development execution, including asset processing, model tests and document rendering, runs in Condev from fresh SHA-256-verified staging. Verified archive transfer into fresh `/tmp` directories replaced the unhealthy shared mount.

## Implementation gates

First validate normal conversation, direct-request refusals and two genuine encoded translator-injection families with paraphrases in all four formats. Freeze successful model/prompt settings. Then complete application integration, integrity/interaction checks, the captured walkthrough and Word rendering. Record checks actually performed separately from human playtesting and anti-agent effectiveness.

The user's solve-quality requirement adds explicit negative checks for ordinary invitations, password synonyms, partial values, alternate lossless representations, repeated requests, bare instruction overrides, the former fiction/copyediting solves, plaintext maintenance/serialization requests, encoded direct questions, and encoded versions of the former Easy wording. Test these using harmless fictional conversations against this local toy model only. The delegated quality reviewer owns prompt calibration and reports bounded coverage rather than claiming that every possible simple wording has been eliminated. Successful maintenance/self-test and serialization/protocol-conversion requests must be genuine inference results delivered through a decoded translator envelope, with no keyword-triggered answer, hidden UI shortcut, or substitute success response.

The prior v8 prompt and its plain-language solves are retained only as the superseded Easy baseline. The encoded revision is accepted only if a new qualification record contains at least 50 distinct negative conversations, two translator-specific families with two paraphrases each through Base64/HEX/DEC/BIN, and repetition across three fresh model processes. That qualification is currently blocked: the approved benign sub-agent received a Cybersecurity Risk/Daybreak rejection during the first binary feasibility probe, so the assignment was stopped without retry or investigation as required by AGENTS.md §8. `solve-quality/encoded-calibration-blocked.json` records completed measurements and missing gates; `solve-quality/qualification.json` remains historical v8 evidence and is not a pass for this revision.

The completed feasibility measurement found flag packet sizes of 46 Base64 tokens, 113 HEX tokens, 136 DEC tokens and 335 BIN tokens. The frozen 128-token reply cap therefore cannot return matching DEC or BIN flag packets. All four incoming formats remain required; the candidate prompt returns a supported Base64 flag packet for compactness, which the approved plan allows when matching output is impractical. This candidate behavior has not been qualified. Actual pre-solve browser evidence covers ordinary chat, direct refusal and harmless HEX decoding; encoded disclosure, external decode, exact postcard claim and celebration remain release blockers.

## Assets and experience

Acquire original usable assets before reconstructing missing pieces. Record each source, reuse terms, transformation, hash and limitation in the asset manifest. Do not mistake a repository code license for a license to Disney artwork. Compare actual captures with references; do not use a full screenshot as the application.

Original archived igloo, landscape, penguin, puffle, furniture and interface artwork is rendered as interactive Canvas sprites. The 2009 reference's igloo occupies the center of the scene; the chat bar stays along the bottom, with mail/news at the upper left and decorating at the lower right. The care card, accessible HTML dialogs and confetti are reconstructions. The limited sprite atlas does not reproduce every original Flash animation. Music is decoded from original local assets; short action cues are synthesized locally. Copyright and archive access are recorded without asserting a new redistribution license. Source and export hashes are in `asset-provenance.json` and `logo-provenance.json`.

The room contains a penguin and three puffles, with Pip as the only language model character. Walking, emotes, wave/sit/dance, snowballs, feed/play/rest, decoration editing, music and chat history work independently of the puzzle. No paid currency, grinding, timed stat decay or pet departure. Save/Cancel protects decoration drafts. Reset conversation preserves the room and earned reward.

## Anti-agent assessment

One non-rendered metadata notice is retained. Browser checks confirmed that it is absent from rendered text; source review confirms that it is excluded from inference, accessible labels and required evidence. It does not block scripts. Its effectiveness remains unproven; no independent anti-agent evaluation was performed. No fake flags, CAPTCHA, artificial delays or request filters targeting solver tooling are included.

## Validation scope and runtime ownership

The available Docker VM reports approximately 1.9 GiB RAM, below the accepted 4 GB target. A network-disabled image test returned a real short reply in 5.72 seconds with a 1.57 GiB measured peak. The full-context test took 77.41 seconds; browser inference during a concurrent renderer build was substantially slower. These observations do not establish target-hardware performance or identical generation on other CPUs. Global settings were left unchanged. Independent human playtesting and listening have not been performed.

The owned deployment is Compose project `rowdy-puffle-whisperer`, container `rowdy-puffle-whisperer-igloo-1`, port 18116, volume `rowdy-puffle-whisperer_igloo-data`. Its supervisor controls only its private localhost model child. The development relay on Condev port 18116 is task-owned and does not affect host deployment when stopped. The other challenge on port 18111 remains outside this assignment. Final check evidence and remaining limits are indexed in `validation.json`; failed calibration and intermediate checks are retained as historical evidence, not release passes.
