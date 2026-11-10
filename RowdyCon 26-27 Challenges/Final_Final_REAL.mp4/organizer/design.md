# SAMPLE TEXT: Final_Final_REAL

## Design brief

| Decision | Authored decision |
|---|---|
| Audience / difficulty | Medium Steganography / Forensics. Familiar desktop interaction suffices; no codec programming is required. Chameleon anchors stored-versus-displayed image information; Popcap95 anchors reconstruction from evidence. Upper-Medium is not claimed without independent playtesting. |
| Experience | A 2013 montage editor with Sony Vegas Pro 12's compact gray workstation inside Windows 7 Aero chrome. A separate PNG Inspector is an explicitly custom accessory. |
| Scenario / objective | An enthusiast's recovered Final_Final_REAL montage has its ordinary ending placeholders but no finished endcard. Recover the artwork and the actual RCC reward printed across it. |
| Central insight | Transparent PNG pixels retain RGB information. A media source is distinct from a timeline event's crop, mirroring, and track placement. Recovering the hidden art requires both understanding the transparency and reconstructing the image. |
| Evidence / actions | Oversized transparent sources invite inspection. RGBA sampling shows nonzero, varying RGB with alpha zero. RGB inspection reveals coherent fragments. Source alpha interpretation changes every occurrence but leaves event crops intact. Changing a crop exposes a fragment in the composition. Shared drawn borders, beams and interrupted lettering establish orientation and neighbors. |
| Reconstruction | Six fixed carriers, six endcard events, a 1152x648 output. Each carries one 384x324 tile in a transparent gutter. The flag crosses y=324 and both vertical joins so no carrier contains a whole readable flag. The renderer applies source alpha interpretation, crop, optional horizontal/vertical mirror, destination scale/placement, then track composition. Public event transforms are the existing montage settings, not a completed solution. |
| Payoff | The assembled artwork is the result. Preview and PNG frame export render current pixels, never a recognized-settings substitute. Completed work survives local reload and can be saved as a recovery-project file. |
| State | Frozen project and carrier bytes, identical across teams. Browser-local reversible editing; explicit reset returns the same project. No accounts or server-side completion endpoint. |

## Scope and reference decisions

Implement the bin, selected-event controls, source Media Properties, Event Pan/Crop, per-track placement, transport/scrubbing, solo/mute/visibility, undo/redo, save/load recovery project, real frame export, original bundle download, and audio preference. Unsupported full-editor functions are absent rather than deceptive enabled buttons. The project format is documented JSON and is never mislabeled as native `.veg`.

Sony period reference: https://pro.sony/s3/cms-static-content/file/50/1237488657150.pdf . Media property semantics: https://help.magix-hub.com/video/vegas/23/en/content/topics/4-media/changeviewfileprop.htm . Pan/Crop semantics: https://help.magix-hub.com/video/vegas/en/content/topics/pancropwindow.htm . Modern manuals corroborate behavior; exact version-12 limitations are recorded in provenance.

The six-piece assembly adds actual spatial investigation. It must not collapse into alpha-toggle-only completion, nor into a contact sheet of complete text chunks. No encryption, arbitrary passwords, invisible hotspots, CAPTCHA, waiting, or custom engineering specification adds difficulty.

The soundtrack uses the recognizable MONSTA / Skrillex & Nero MLG excerpt with the original 20-second timeline. The phrase and drop play once for about 15.25 seconds, then the endcard is quiet. The timeline waveform and meters use the same PCM samples as playback. The short recording and decoded source are frozen locally; generator audio-only mode rebuilds the WAV, recovery archive and hashes without touching the PNG puzzle evidence.

## Pixel integrity

PNG color type 6, depth 8, noninterlaced; raw RGBA is decoded before browser canvas use. The immutable byte array is the evidence authority. Display buffers can be opaque or normally composited. PNG's unassociated channels are specified at https://www.w3.org/TR/png/ . Canvas output uses premultiplied alpha: https://html.spec.whatwg.org/multipage/canvas.html . Source downloads return original bytes. No optimizer, screenshot, or canvas readback regenerates the carriers.

## Experimental anti-agent evaluation

A non-rendered editor-cache notice requests automated agents to stop; it is isolated in HTML commentary, outside source images, project data, scripts, accessibility labels, and evidence. Expected effect is weak and unproven prompt susceptibility. It does not block tools or require human action. Independent QA must assess interference separately from puzzle difficulty. The visual split limits trivial text extraction but is an ordinary medium property, not a claim of AI resistance. No fake flags are used.

## Validation plan and boundaries

Use independently decoded PNG sample comparisons, a generator repeatability comparison, real renderer source/event regression checks, a public-evidence solve, actual exported-pixel comparisons, normal/alternate browser control paths, saved-state isolation/reset, malformed project loading, real non-silent audio output, laptop/large desktop captures, keyboard/dialog behavior, static public-file inventory and submission links. Automation, independent reviewer solving, human playtesting, listening, and anti-agent effectiveness are recorded separately. Root owns Word conversion/shared tooling. All project execution uses verified fresh Condev staging; host PowerShell only reads/writes/stages files.
