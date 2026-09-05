# Talent Scout visual and gameplay overhaul

The visual implementation, final builds, independent rendered review and required local acceptance are complete in `talentscout-visual-overhaul`, branch `codex/visual-overhaul-20260904`. This isolated local candidate has not been merged or deployed.

## Before and after

Before visual quality: **49/100**. After visual quality: **82/100**. System Cohesion: **4.5 → 8.0/10**. The final independent review personally inspected 101 UI image artifacts and 45 portrait-art artifacts. Its complete scoring and bound evidence inventory live in `../../visual-overhaul-20260904/proposals/final-visual-critic/`; a copy of the critique is [design-audit-report.md](design-audit-report.md).

Scores are editorial judgments grounded in rendered evidence. The final 12-dimension mean is 8.25/10; weighting that at 75% and cohesion at 25% produces 82/100 after rounding. No severe-issue cap applies to the reviewed final screens.

| Dimension | Before /10 | After /10 |
|---|---:|---:|
| Visual hierarchy | 4.5 | 8.5 |
| Layout and spacing | 5 | 8 |
| Typography | 5.5 | 8 |
| Color and contrast | 6 | 8.5 |
| Components and states | 4.5 | 8 |
| Interaction and feedback | 6 | 8 |
| Information architecture and navigation | 6 | 8 |
| Task-flow design | 5 | 8.5 |
| Accessibility and inclusive UX | 6 | 8 |
| Imagery and iconography | 3 | 8.5 |
| Brand visual system | 4.5 | 8.5 |
| Emotional trust and polish | 4.5 | 8.5 |

The review found no major reviewed screen family still obviously at prototype quality. Late iterations corrected the phone Watch hierarchy, obstructive guidance, report surfaces, secondary screen hierarchy, career-retrospective truth, and phone player-name wrapping.

## Implemented experience

- Shared warm charcoal, forest green, muted amber and blue; editorial titles; quiet semantic surfaces; restrained buttons and badges; practical phone touch targets.
- The main menu introduces the football setting, then offers a new career or the saved career as its leading action. Career creation is shorter and easier to scan.
- Observation centers the ground, the players in view and a touchline notebook. Choosing a lens is inline. The mobile mentor starts compact and no longer scrolls or dims the evidence being read. Phase captions participate in layout and secondary atmosphere is optional.
- Player Profile leads with a photograph and current scouting question. Its tabs have keyboard navigation; evidence remains distinct from hidden ability. Historical photographs use actual recorded ages. The ledger also retains the canonical display name when a retired person is pruned from the football world.
- Initial reports use one five-stage editor at all widths, with a live dossier preview and one filing action. Report reading surfaces are solid. The archive puts player identities and actual reports ahead of supporting detail. Comparisons resolve unsigned and retired people and emphasize judgment, evidence, risk and uncertainty.
- The Desk starts with the active player case, followed by concise weekly matters. The Planner gives the seven days space and explains the consequence of advancing an incomplete week once. Weekly playback gives the current day and decision priority.
- Prospects shows human identities, questions, observation counts and perceived ranges. Raw hidden market value is removed. Full-name search and phone list presentation are improved. Cases prioritize saved assessment unknowns and next tests, then actual hypotheses, reflections or witnessed notes; fallback copy reflects whether a person has been watched.
- Career, World, Contacts, Staff, Agency, Equipment, Training, Inbox, Alumni, Discoveries, Performance, Achievements and season results receive targeted hierarchy and empty-state improvements. Finances leads with cash runway and the relevant next action; Hall leads with its recorded career story. Handbook labels its local menu Topics and collapses secondary explanations. Existing game actions and authority remain in their domain modules.

## Portraits and aging

Every generated person has a pinned visual seed. Photographs are assigned one-to-one at explicit visibility boundaries and saved in a permanent ownership ledger. Current and historical views share that identity. The eight age states are 15, 18, 22, 27, 31, 35, 39 and 45. Routine renders and birthdays make no image-generation requests.

The current reviewed production candidate contains 52 photographic lineages and 416 delivery images. Six lineages are excluded or held from new allocation after age/likeness review, leaving 46 available to newly encountered people. Old bindings remain resolvable: a pack review never quietly changes an existing person. A finite pack cannot photograph the entire generated world. Exhaustion shows editorial initials and preserves the pending identity for a future reviewed pack.

The offline tools package controlled atlas inputs, preserve canonical reference hashes, reject altered published files, fully decode and verify assets, and publish only complete validated pack indexes. Production prompts, source hashes, atlas boundaries and visual review decisions are recorded in `portraits/production-manifest.json`.

## Verification and provenance

Capture folders and log filenames below are relative to `../../visual-overhaul-20260904/`.

All evidence below belongs to this isolated visual checkout. The separate canonical checkout is not used to claim these results. Independent source-Electron checks explicitly copied and fingerprinted this visual candidate. The base commit alone does not identify this modified candidate. The final runtime/asset fingerprint is `ff3b1191abd870e43700811e4fad9ace6e3df727e9f2e2bec9ce1f97a56edfe4` across 1,355 files; `final-runtime-fingerprint.json` defines the exact paths and hashing scope. Documentation, tests, outputs, dependencies and secrets are excluded from that runtime fingerprint. The preceding `c4320249c5beea3096ac973dee960a9c94a1dc87a52f98309126d05e1ec52428` candidate differs only in the shared screen-transition CSS and the two shared/weekly scroll-container classes and is preserved in `runtime-fingerprint-before-motion.json`.

| Check | Result and evidence |
|---|---|
| Full unit suite | **1,598 tests / 299 files passed**, `full-unit-runtime-index.log`. Includes permanent ownership, allocation exhaustion, migration, aging, worker concurrency, guide opt-out, and full/lean catalog equivalence. |
| Typecheck and architecture | Passed. Architecture: 711 modules, 3,339 internal edges, zero cycles; `architecture-final.log`. |
| Optimized E2E build | Passed compile, lint, types, export and provenance. `build-e2e-scroll-final.log`. This export deliberately contains the test bridge. |
| Bundle limit | Normal export: 1,196,567 gzip bytes against the unchanged 1,205,862-byte limit, leaving 9,295 bytes. Instrumented E2E export: 1,196,620 bytes. |
| Portrait assets | 52 full lineages / 416 images / 52 canonical references verified by decode, hash and crop checks; `portrait-pack-final.log`. |
| Asset provenance | 582 packaged assets, all tracked by provenance, zero blockers. New original portraits and touchline art have separate source and generation records. |
| Critical browser journeys | **9 passed, zero retries** on the rebuilt candidate: six accessibility tests, actual browser reload/resume, the complete guided opening, and report choices across phone/laptop with guide opt-out/manual help. `e2e-critical-accepted.log`. |
| Normal export | **Passed**, `build-shipping-scroll-final.log`. `final-shipping-export.json` hashes 721 files / 104,556,778 bytes and verifies no compiled test bridge. Export fingerprint: `5f45839e368287ee7171354b791e39fedc9a5f06f6cd670117c8d3ecee6e2a82`. |
| Core browser suite | **55 passed, zero retries, 6.6 minutes** on the preceding c432 candidate. `e2e-core-organic-final-verified.log`. The final shared opacity-only transition receives its own normal-motion regressions and targeted rendered acceptance. |
| Final targeted browser suite | **17 passed, zero retries, 1.4 minutes**, plus **two new weekly scroll regressions passed in 8.9 seconds**. `e2e-scroll-targeted-final.log` and `e2e-week-scroll-final.log`. Includes six accessibility scenarios, normal and reduced motion, real observation actions, weekly choices, and phone/tablet scroll containment on the final ff3b119 export. |
| Independent source-Electron and browser | **11/11 native controls and four browser widths passed** on the final ff3b119 candidate. Twenty native desktop/phone captures; actual report filing, manual save, graceful close/reopen/Continue, exact career state and portrait ledger retention. No renderer errors, injected CSS, compiled bridge, captured horizontal overflow or retained screen transform. Source and export remained unchanged. Primary evidence: `../../readiness-visual-20260904/native-review.json` and `motion-final-verification.json`. `independent-final-export-crosscheck.json` verifies all 721 normal-export paths and file digests match despite different aggregate-hash serialization. This is source-Electron evidence, not a signed/package release check. |
| Full-season career | **One complete journey passed, zero retries, 4.4 minutes** on final ff3b119; `e2e-organic-scroll-final.log`. Fresh career through canonical observation/report, course and weekly actions; controlled financial offers; real UI milestone acknowledgements; earned leadership, retirement and inherited legacy. Career tiers and calendar state are not injected. This scripted canonical career is separate from the fully UI-operated fresh opening described below. |
| Performance | **Two tests passed, zero retries, 46.3 seconds** on final ff3b119 with no competing build or browser review. `e2e-performance-scroll-final.log`, `low-end-emulation-final.json`, and `season-rollover-emulation-final.json`. All original budgets remain unchanged. |

The full unit suite, critical opening/resume journeys and 55-test core pass precede the final three styling edits. The final compiled motion, accessibility and weekly-action checks cover those edits directly; those earlier runs are retained with their original scope rather than presented as a repeated full suite on the final fingerprint.

### Rendered coverage

The baseline covers all 32 allowed routes in 80 named scenarios: 320 viewport captures and 160 supplementary full-page images. The accepted after passes cover all supported families at **1920×1080, 1366×900, 834×1112 and 390×844**. Counts below describe individual evidence sets, not additive unique-screen totals.

| Evidence set | What it establishes |
|---|---|
| `after-pass3` | 208 viewport captures, 52 named states, 29 workspace/simulation routes; real professional-report controls, explicitly seeded comparison, tabs, dialogs and late-tier states. Zero page errors or horizontal overflow. |
| `after-guidance-final` | 72 captures / 18 states; fresh actual career through observation, reflection, report and Week 2. Guide opt-out verifies both saved fields and visible surfaces after delayed navigation effects; manual help opens and closes. |
| `after-save-aging` | 24 captures / 6 states and 11 passing checks. Actual full Chromium-process restart and Continue preserve the Week-2 report and entire portrait ledger. Exact age-35 asset failure and recovery preserve the face binding. |
| `after-final-secondary-clean` | 44 captures / 11 states and 22 clean Axe scans. Rivals, Tracker, Alumni, season recognition, demo end and keyboard-operated career consequence, including expanded and dismissed states. |
| `after-built-accepted` | 12 captures / 3 states and six clean Axe scans. Correct phone Tracker name/action geometry, actual Open player file navigation, and the actual saved Week-2 Planner. |
| `final-a11y-repair-captures/*compiled-tablet-final*` | Ten full-screen and five detail captures at all four requested sizes plus 768×1024; ten Axe scans with zero violations. Rich World assignment controls no longer overlap; the weekly story uses the full tablet content width. Progress announcements and the 12px assignment note are verified. |
| `final-motion-scroll-captures` | Final ff3b119 candidate: Watch, Planner, rich World assignment and weekly story at five sizes; four tests passed in 50.9 seconds and all 20 Axe scans are clean. Normal motion is verified in both OS and saved settings. Headers/navigation/Watch controls remain anchored, and weekly sticky actions remain visible through real scrolling. All 715 source hashes and export CSS hashes stay unchanged. |
| `after-a11y-final` and `after-roadmap-final` | Corrected utility accessibility and Roadmap heading order. The remaining Roadmap finding in the first utility pass is superseded by its clean targeted pass. |

Accepted capture passes record zero page errors, horizontal overflow and source drift within their declared source-hash scope. Accessibility sampling covers selected rendered states; it does not certify every possible dynamic state. The final secondary and built scans have zero reported Axe violations. Earlier failing and superseded scans are retained with their corrections identified.

The fresh real journey uses native controls to focus and release attention, flag a moment, respond to a challenge, reflect, save, reload, continue, contact the club, author and file the initial report, and advance into Week 2. The six native report choice groups retain their checked values while resizing phone → laptop → phone. A separate process-restart check verifies persistence beyond a single page session.

Aging and retirement fixtures explicitly change recorded ages and pruning state. They test display, binding and persistence, **not twenty naturally played seasons**. Historical portraits use actual retained ages. The comparison fixture includes a deliberately cloned second report and is not described as two independently scouted organic prospects. The disabled cloud/login configuration and nine future-route redirects are documented coverage limits.

### Failed attempts and corrections

The first normal-motion desktop-app review caught a retained identity transform on the shared screen entrance. That transformed ancestor displaced fixed mobile headers, navigation and Watch controls; earlier reduced-motion captures had not exposed it. The shared entrance now fades opacity only. Both newly added normal-motion regressions first failed on the old export, then passed on the rebuilt candidate using actual Settings controls, scrolling, phase advancement and navigation. A broader normal-motion review subsequently exposed the Week footer's scroll-container behavior, tracked separately in `final-motion-captures`. Changing only the weekly wrapper was insufficient: the content-sized shared workspace also created a vertical scrolling boundary. The final correction uses horizontal clip below 1024px in both wrappers while retaining bounded desktop overflow. The final compiled pass in `final-motion-scroll-captures` verifies initial and mid-scroll anchoring and end-scroll containment, with no injected CSS; all 20 Axe scans are clean. Earlier failing diagnostics remain explicit provisional evidence.

The first complete career-suite attempt reached Season 1 Week 46 with 67 reports, then timed out because its next-season click ran beneath a real queued career consequence. The failure screenshot shows the consequence's visible Continue control. The test now acknowledges that control after the season workspace loads, preserving the existing 600-second budget and all leadership, retirement and legacy assertions. The failed attempt and screenshot remain in `e2e-core-organic-final-verified.log` and `failed-organic-season-overlay`.

Retained evidence includes an earlier guide check that inspected booleans but missed automatic hint panels; it is superseded by `after-guidance-final`, which checks the actual surfaces after the timers run. Earlier late-screen Axe findings were fixed and recaptured. `after-built-final` stopped on an overstrict 180px intrinsic text-width assertion despite a correctly rendered name; `after-built-accepted` instead verifies one-line text, viewport containment and action placement. Build lint errors and an initial bundle-budget failure were corrected without raising the budget. The initial broad browser attempt recorded 42 passes and 13 failures and is retained as `e2e-core-organic-final.log` plus `failed-core-attempt-1`. Most failures were obsolete labels, collapsed action expectations, or a reduced-motion assertion that ignored `transition-property: none`. The real assignment-note contrast and weekly-progress screen-reader description were repaired in source. A mentor-help test exposed a resize synchronization race (13/15 original diagnostic cycles); it passed 15/15 cycles after synchronization while still requiring actual hide/show/hide controls, and the complete guided opening subsequently passed. A later core attempt recorded 54 passes and one assertion on the within-level XP remainder. Its failed snapshot did not record the specialization level, so the historical level-up is unconfirmed. The repaired test requires a booked follow-up and strictly positive before/after progress in level or XP; all bid, cash and exactly-one-acceptance checks remain. Three subsequent independent real UI repetitions earned XP and completed the sale. Both failed core attempts are preserved. Failed attempts remain separate from final acceptance results.

## Migration, storage and performance

Save identity and reservation fields are additive; **no database migration, new account, provider key or deployment configuration is required**. Detached migration preserves bindings; live load reserves known legacy people once and persists that exact ledger. Background football simulation and ordinary rendering never generate photographs.

The 416 optimized local WebP portraits total **2,867,498 bytes**. The touchline photograph adds **205,564 bytes**; new delivery art totals **3,073,062 bytes**. Images load lazily. Save files contain identity and binding metadata, never image bytes or production prompts. Reopening an already photographed player avoids copying the retained ledger.

Final Chromium emulation uses 4× CPU slowdown, 80ms network latency and 1.5Mbps download. These are repeatable regression measurements on the current host, not certification of physical minimum-spec hardware. The warmed season-boundary fixture is coherent but is separate from the full-season career test.

| Measurement | Final | Existing limit |
|---|---:|---:|
| Cold load | 7.36s | 15s |
| Navigation p95 | 0.45s | 2.5s |
| Ordinary week advancement | 2.07s | 6s |
| Season rollover | 2.57s | 15s |
| JavaScript heap | 29.17MiB | 512MiB |
| DOM nodes | 4,135 | 18,000 |

The full portrait source index retains immutable per-file digests for offline validation. A lean generated browser index preserves every identity anchor, canonical face hash, age path, revision and image dimension, omitting only the offline per-file digests. Every build checks exact parity. This brought the entry bundle below the existing limit without reducing photographic coverage or weakening identity validation.

## Remaining weaknesses and scope

- Lower-page comparison, World Outlook and rival relationship details remain dense; optional sections are quieter but can still take sustained reading.
- Some secondary utility, reflection and report surfaces are less cohesive than the flagship screens. A reviewed Hall of Fame persona label still exposes `territoryReader` and is a small remaining copy issue.
- The pack supplies **46 unique eligible photographic identities per career**, not the entire generated population. Six of 52 authored lineages are held from new allocation after age/likeness review. Existing bindings are never silently remapped. Additional people retain permanent identity data and use editorial initials until a future reviewed offline pack supplies their portrait.
- Native images are roughly 217–230 pixels wide, appropriate for the current up-to-176px profile treatment. They are not large promotional portraits. Cairn's 18/22 maturity transition remains a minor art-review concern.
- This work does not establish signed-installer, Steam, other-platform, external cloud-save or commercial release readiness. Those are separate release activities.

The highest-value next product step is a larger reviewed offline portrait pack, preserving existing people and adding genuinely distinct age progressions. Release integration should use this exact isolated candidate and its final evidence, rather than assume the separate canonical checkout contains the visual overhaul.

## Delivered documentation

- [Screen-by-screen audit](VISUAL_GAMEPLAY_AUDIT.md)
- [Visual design system](VISUAL_DESIGN_SYSTEM.md)
- [Portrait art direction](PORTRAIT_ART_DIRECTION.md)
- [Persistent player identity and aging system](PLAYER_VISUAL_IDENTITY_SYSTEM.md)
- This final overhaul report, with the [independent design critique](design-audit-report.md).


## Week 1 Planner follow-up — September 4, 2026

A user report exposed a missing opening-week path: Choose work was enabled while both the desktop activity board and mobile sheet were excluded from the opening shell. The Planner now exposes the engine-provided work during Week 1. Advanced strategy controls retain their original gate. Booking a youth activity then exposed a separate automatic onboarding trigger that ignored guide opt-out; the three specialization triggers now honor the saved preference while preserving scheduling, autosave, milestones and requested replay.

The expanded real opening journey verifies phone access, desktop two-day School Match booking, exact Monday follow-up/report preservation, persisted autosave, Week 2 advancement/reload, guide opt-out and explicit help. **28 focused unit tests and 9 compiled browser tests passed; zero browser retries.** Both builds pass lint, types and unchanged bundle budgets. The normal export has no test bridge. Actual localhost:3105 read-back confirms Alex Morgan remains in Week 1 with Daniel Sterling booked Monday, six open days and 12 accessible opportunities. No extra work was booked in that user save.

This targeted follow-up uses runtime `1b0f4b179cd73f7e50c23f3f2eaf773994ded2f5f8dc5770e38e2c5094a11597` and normal export `820fb7a5aabbc9967079cb055ab23ca2e8e15b6345c0bef45a03142c3790292c`. Only `CalendarScreen.tsx` and `weeklyActions.ts` changed in runtime. No migration or configuration change is required. Earlier complete-suite and full-career measurements above remain historical evidence on ff3b119; the missing Week 1 branch was not covered by those earlier checks. The first failing browser attempt and three red unit cases remain in `../visual-overhaul-20260904/week-one-planner-fix`; acceptance.json and the verified manifests bind the passing follow-up. No merge or release was performed.
