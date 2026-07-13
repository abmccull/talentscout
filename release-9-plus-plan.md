# TalentScout final 9+ implementation plan

**Plan date:** July 12, 2026

**Scope:** Youth Scout release candidate

**Release rule:** Every product category and rendered-design dimension must score at least 9.0 from verified normal play on the exact shipping candidate.

**Current decision:** **HOLD.** Four product categories and multiple design dimensions remain below 9.0, and human, assistive-technology, low-end performance, and packaged-runtime proof remain open.

## Exact-candidate baseline

### Product

| Category | Score | Remaining gap to 9+ |
|---|---:|---|
| World credibility | 9.0 | Core gate passed; expand archive stories and identity content without unbounded saves. |
| Scouting depth | 9.0 | Core gate passed; expand longitudinal calibration across specializations. |
| Decision quality | 9.0 | Core gate passed; preserve consequence parity between manual and deadline-default paths. |
| Career progression | 8.9 | More late-career leadership, delegation, political, financial, and recovery pressure in normal play. |
| Relationships and politics | 8.9 | Broader persistent goals and cross-stakeholder conflict for agents, families, journalists, employees, and named rivals. |
| Information design and usability | 8.9 | Moderated comprehension proof, manual AT proof, and low-end runtime profiling. |
| Replayability | 9.2 | Core gate passed; expand content while preserving schema-2 balance thresholds. |
| Emotional engagement | 8.9 | More distinctive long-term callbacks and decision-bearing presentations for secondary outcomes. |

### Rendered design

| Dimension | Score | Dimension | Score |
|---|---:|---|---:|
| Visual hierarchy | 8.9 | Layout and spacing | 8.9 |
| Typography | 8.8 | Color and contrast | 9.1 |
| Components and states | 9.0 | Interaction and feedback | 8.9 |
| Information architecture | 9.1 | Task-flow design | 9.0 |
| Accessibility | 8.9 provisional | Imagery and iconography | 8.7 |
| Brand visual system | 9.1 | Emotional trust and polish | 8.8 |
| **System Cohesion** | **9.2** | **Gameplay interactivity** | **8.9** |

## Verification baseline

- TypeScript, lint with zero warnings, and scoped diff-whitespace verification pass.
- 56 unit/invariant files and 382/382 tests pass.
- Youth browser suite passes 45/45 on the first attempt with retries disabled in 5.3 minutes.
- Accessibility passes 5/5 with zero serious or critical Axe violations; cross-screen smoke passes 4/4.
- Core visual/interactivity passes 2/2, with additional rendered desktop/mobile audits for Academy Placement and World Archive.
- Shipping `/play` first-load JavaScript is 614 kB against the 650 kB gate.
- The ten-season every-week browser soak passes in 3.7 minutes.
- The accelerated isolated integrity harness passes 20 seeds x 30 seasons deterministically: 1,200 authoritative ticks, 27,600 calendar weeks spanned, and 30 archive seasons in all runs.
- Accelerated-harness maxima are 55.09 MiB serialized save, 4.63 save-growth ratio, 725.70 MiB heap, and 927.24 MiB RSS; tick latency is p50 809.06 ms, p95 1,681.18 ms, maximum 1,874.86 ms.
- The accelerated harness processes two authoritative ticks per season. It complements, but does not replace, the every-week browser soak.
- Replayability schema 2 passes: release distance 95.22%, overlap 4.78%, special-trajectory uniqueness 82%, semantic adjacent repetition 0%, long tension 0%; nightly distance 96.12%, overlap 3.88%, special-trajectory uniqueness 99.9%, semantic adjacent repetition 0%, long tension 2.9%, dead state 0.03%, dead run 0.3%, runaway 0%.

## Completed core blockers

### Compact living-world history — complete

- `src/engine/world/worldHistory.ts` records a bounded 30-season archive of final standings, movement, champions, club context, managers, and public player outcomes.
- Season rollover owns archive creation, including final-week promotion/relegation results.
- `src/components/game/WorldHistoryDrawer.tsx` adds responsive season browsing, player drill-through, dialog focus behavior, and accessible mobile season selection.
- Serialization tests protect ownership, round-trip equality, bounded retention, and hidden-ability exclusion.

Residual expansion belongs after the gate: richer awards, more linked career-story views, and archival presentation variety. It is no longer a core missing-system blocker.

### Active club and regional recruitment identities — complete

- `src/engine/world/recruitmentIdentity.ts` deterministically composes club and regional priorities from the world seed.
- Academy placement scoring uses authored evidence and recruitment fit without reading hidden current or potential ability.
- Desk briefs and `src/components/game/ReportWriter.tsx` make the identity visible before the player commits.
- Tests prove contrasting clubs can reach different, explainable decisions from the same case.

Residual expansion should add authored identity breadth and regional texture after balance invariants are locked. The core strategic divergence blocker is complete.

### Event-director balance and consequential defaults — complete

- `src/engine/events/eventDirector.ts` prevents immediate semantic repetition where alternatives exist, bounds special-event cadence, releases pressure, and promotes mature confidentiality obligations into dilemmas.
- Deadline defaults in `src/stores/actions/weeklyActions.ts` now run the same authoritative consequence projection as manual choices exactly once.
- Actor-specific special-event memories and canonical confidentiality obligations create delayed relationship consequences.
- Schema-2 telemetry distinguishes semantic repetition from broad linked-chain categories: semantic adjacent repetition is 0% and long maximum-tension runs remain below 5% in both release and nightly gates.

Residual content expansion remains desirable, but event balance is no longer an open release blocker.

## Final implementation roadmap

### P0 — Release integrity and platform proof

| Item | Problem and proposed solution | Relevant modules | Technical approach | Dependencies and risks | Effort | Acceptance criteria and required tests | Save migration |
|---|---|---|---|---|---:|---|---|
| Packaged runtime matrix | Browser verification does not prove release packages, offline/online transitions, Steam fallback, cloud conflicts, or write recovery. | `electron/`, `electron-builder.yml`, `src/lib/saveProvider.ts`, `src/lib/saveEnvelope.ts`, `src/lib/supabaseCloudSave.ts`, Steam adapters | Build release-equivalent Windows, macOS, and Linux artifacts. Run new career, save/load, upgrade, offline, reconnect, simultaneous local/cloud edits, corrupt-envelope recovery, and interrupted-write fault injection. | Signing credentials, Steam SDK availability, platform file permissions, CI runtime. | XL | Every supported artifact completes the critical journey with no silent data loss. Steam unavailable mode is playable. Conflict choice is explicit. Interrupted writes recover from the last valid envelope. | Golden saves for each supported schema; backup before migration; migrations idempotent. |
| Every-week long-horizon equivalence | The 20 x 30 accelerated harness is deterministic, but processes two ticks per season. The every-week browser proof currently covers ten seasons. | `src/engine/core/gameLoop.ts`, `src/stores/actions/weeklyActions.ts`, season processors, long-career E2E | Add a larger every-week full-state run, or property-test each authoritative subsystem so manual weekly advancement and accelerated advancement converge from the same precommitted inputs. | Wall-clock cost; expected UI-only state may differ and must be excluded explicitly. | L | No transfer, obligation, finance, injury, development, relationship, history, reward, or rollover processes twice or disappears. Save/reload at sampled boundaries is identical. | None unless the audit finds stale legacy derived state. |
| Save and memory budget | A 55.09 MiB save, 725.70 MiB heap, and 927.24 MiB RSS pass the current harness but are not yet a world-class low-end budget. | world/event histories, save envelope/provider, Zustand store, entity indexes | Attribute serialized bytes and retained heap by subsystem. Compact duplicative snapshots, bound histories, normalize repeated strings, narrow selectors, and add season-over-season budget assertions. | Compression can obscure migration defects; over-pruning can damage career history. | L | Define supported-device budgets; p95 save/load and weekly latency pass; 30-season save and heap growth are bounded; no lost causal/history links; deterministic replay preserved. | Likely additive compaction version plus idempotent conversion of older archive records. |
| Exact tagged-candidate gate | All evidence must describe the same artifact that ships. | `package.json`, CI workflows, `e2e/`, `tests/`, verification scripts | One release command runs static checks, units, Youth E2E with retries disabled, accessibility, visual, smoke, replay telemetry, every-week soak, shipping build, bridge scan, and packaged smokes. Emit SHA-bound JSON. | Long runtime and mutable build-output collisions. | M | Every required suite passes against one SHA. Production chunks contain no E2E bridge. Evidence includes bundle and platform tables plus known limitations. | None. |

### P1 — Product and interaction work required to cross 9

| Item | Problem and proposed solution | Relevant modules | Technical approach | Dependencies and risks | Effort | Acceptance criteria and required tests | Save migration |
|---|---|---|---|---|---:|---|---|
| Late-career pressure and recovery breadth | Promotion still needs to change the player's work, political exposure, delegation risk, and financial responsibility more consistently. | career progression, employment, agency, employee and board engines; `src/components/game/CareerScreen.tsx` | Define stage-specific responsibility budgets, executive demands, delegation portfolios, hiring tradeoffs, failure states, recovery offers, and career objectives. Automate low-value work at senior tiers while raising decision stakes. | Avoid success becoming pure workload or a dominant delegation strategy. | L | Early, middle, and late careers have distinct weekly decision profiles. Leadership failures remain survivable but costly. At least three viable career shapes emerge across seeded normal-play suites. | Add stage responsibility and portfolio state with neutral legacy defaults. |
| Full stakeholder ecology | Existing actor memories are consequential but not yet broad enough to make every stakeholder feel persistent. | relationship/contact engines, `src/engine/career/politicalMeetings.ts`, `src/engine/rivals/`, `src/engine/finance/employeeEvents.ts`, special events | Use a shared actor-memory schema with subject, event, goal, valence, salience, obligation, visibility, decay, and policy modifiers. Let one action help one actor while harming another. | Combinatorial conflict and opaque modifiers; every effect needs a player-readable cause. | XL | Agents, families, journalists, employees, and named rivals remember specific actions that alter access, trust, leaks, price, support, or poaching. Decay is bounded; save/reload and manual/default paths match. | Convert aggregate legacy trust to neutral baseline memory without inventing past events. |
| Longitudinal scout calibration expansion | Core calibration is credible, but more scouting contexts and specializations need category-level feedback without hindsight leakage. | `src/engine/scout/sourceCalibration.ts`, observation, report, transfer review, Evidence Board | Persist prediction, available evidence, category confidence, later observable outcome, context shift, and revision timing. Score suitability, price, timing, fit, risk identification, and revision separately. | Bad luck must not punish good process; personality and potential remain unresolved until valid evidence exists. | L | Two lenses calibrate differently from the same case. No hidden truth leaks. Unsupported categories remain `insufficientHistoricalEvidence`. Exactly-once and reload-stable. | Legacy reports begin uncalibrated with an explicit reason. |
| Outcome explanations and emotional callbacks | Some secondary consequences still arrive as generic cards or numbers and lack a durable “why now?” trail. | world/event/relationship/career engines, archive, `src/components/game/consequence-cinema/` | Generate bounded causal traces in authoritative engines, then project them into linked press, phone, boardroom, venue, and scrapbook treatments. Preserve uncertainty and never expose random rolls or hidden ability. | Logic/copy drift if explanations are rebuilt in UI. Presentation must be skippable and reduced-motion safe. | L | Every major outcome links to its originating case and decisive visible factors. Discovery, deadline, signing, failure, rivalry, loss, vindication, and retirement each have at least three deterministic presentation variants. | Add bounded trace and presentation IDs; legacy entries state detail unavailable. |
| Interactive decision-surface polish | Interactivity is 8.9 because several secondary states still read like dashboards rather than places where the player acts. | Desk, World, Career, archive, reports, consequence dialogs | Convert selected dashboards into contextual actions: archive player comparison, relationship obligation response, delegation review, press stance, and follow-up hypothesis. Keep compact toast feedback and accessible dialog/focus behavior. | Avoid novelty interactions that do not mutate future state. | M | Every new interaction spends a resource, changes uncertainty, creates a commitment, or alters a future opportunity. Keyboard/mobile/Axe/overflow and exact-state mutation tests pass. | Additive action records only. |

### P2 — Human proof and design dimensions

| Item | Problem and proposed solution | Technical approach | Effort | Acceptance criteria | Save migration |
|---|---|---|---:|---|---|
| Moderated usability | Automation cannot establish comprehension, pacing, or delight. | Test 12 players split between management-sim experts and newcomers. Observe onboarding, first case, contradiction, report defense, weekly tradeoff, archive callback, and delayed consequence. | M | At least 90% complete evidence-to-report unaided; median SUS at least 85; at least 85% correctly explain one club response and one delayed consequence; no repeated P0/P1 usability failure. | None. |
| Manual assistive technology | Axe and keyboard automation do not prove screen-reader completion. | Complete the critical journey with NVDA on Windows and VoiceOver on macOS, including graphical/list equivalence, live regions, dialogs, archive drill-through, focus return, and save/load. | M | Both journeys complete without sighted assistance; no focus trap, unlabeled state, lost context, inaccessible graphical-only evidence, or motion-only cue. | None. |
| Below-9 visual dimensions | Typography, imagery, emotional polish, hierarchy, spacing, and feedback remain below the strict bar. | Run a fresh rendered audit after P1 surfaces. Improve density rhythm, type scale, visual identity, consequence staging, icon semantics, and mobile hierarchy using representative populated/error/empty states. | M | Every one of the 12 rendered dimensions plus gameplay interactivity is independently rescored at 9.0+ without accessibility or mobile caps. | None. |
| Low-end runtime profile | Passing bundle size does not prove smooth interaction on supported low-end hardware. | Profile React commits, selector invalidation, observation graphics, weekly advance, archive opening, route transitions, save/load, network waterfalls, and memory. | M | Published p95 budgets pass; observation graphics meet the supported frame-rate floor; unrelated weekly state does not rerender whole workspaces; no redundant cloud/save request. | None. |

### P3 — Post-gate expansion

| Item | Purpose | Effort | Gate before implementation |
|---|---|---:|---|
| Archive and identity content breadth | Add awards, manager arcs, regional calendars, more recruitment doctrines, and richer career-story presentation on the completed bounded systems. | XL | Save/memory budgets and identity viability invariants pass. |
| Event and stakeholder content scale | Add more actor x pressure x opportunity x region combinations without reintroducing semantic repetition or dominant options. | L | Schema-2 release/nightly thresholds and content validation remain green. |
| Additional specializations | Apply the verified Youth observation, report, calibration, politics, identity, and consequence standard to senior, data, international, and leadership paths. | XL | Each path changes evidence strategy, stakeholders, risk, and career play rather than reskinning Youth content. |
| Career museum and exports | Turn best/worst calls, source calibration, rival claims, and club outcomes into nostalgia and shareable career artifacts. | L | Archive causal links, privacy rules, and bounded retention are stable. |

## Required release evidence

TalentScout may be called a strict 9+ release only when all conditions are true:

1. Every product category and each rendered-design dimension is independently rescored at 9.0 or higher from the exact release candidate.
2. No open P0 or P1 save, progression, integrity, accessibility, misleading-action, or platform defect remains.
3. The ten-season every-week browser soak and 20 x 30 accelerated integrity harness remain green, and every authoritative subsystem has proven manual/accelerated equivalence or a larger every-week long-horizon test.
4. Save and memory growth meet published supported-hardware budgets; the current 55.09 MiB save and 725.70 MiB peak heap are measured baselines, not automatic approvals.
5. Save/reload at every major state-machine boundary preserves precommitted outcomes and exact-once effects.
6. Release-equivalent Windows, macOS, and Linux packages pass Steam-unavailable, offline, cloud-conflict, migration, interrupted-write, and recovery tests.
7. Twelve-player moderated usability reaches median SUS 85 and the defined completion/comprehension thresholds.
8. NVDA and VoiceOver complete the critical journey without a serious barrier.
9. Replayability schema 2 retains semantic adjacent repetition at or below 8%, long maximum-tension runs below 5%, bounded dead/runaway states, and strong semantic divergence.
10. The scorecard, limitations, migrations, screenshots, suites, bundles, and packages reference the exact tagged commit.

## Recommended execution order

1. Attribute the measured save and memory costs, define supported-device budgets, and compact only the proven hotspots.
2. Build the release-equivalent packaged matrix and exact SHA-bound candidate command.
3. Prove every-week/accelerated equivalence across the remaining seasonal subsystems.
4. Implement late-career pressure and the shared stakeholder-memory ecology.
5. Extend calibration, causal explanations, emotional callbacks, and decision-bearing interaction surfaces together.
6. Run low-end profiling and the fresh 12-dimension rendered audit; fix every remaining below-9 dimension.
7. Complete moderated usability and manual NVDA/VoiceOver journeys.
8. Re-run the full tagged-candidate matrix and release only if every categorical gate passes.
