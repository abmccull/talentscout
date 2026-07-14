# TalentScout production-readiness audit

**Audit date:** July 13, 2026

**Product scope:** Youth Scout Early Access
**Decision:** Strong source-level release candidate; commercial certification still blocked by exact-candidate, human, hardware, and cross-platform evidence.

## Executive finding

TalentScout's current build has one coherent product loop:

1. Find an uncertain youth prospect through a place, contact, brief, or opportunity.
2. Spend limited weekly attention to observe the player in useful contexts.
3. Preserve claims, contradictions, unknowns, and hypotheses in the dossier.
4. Write a professional report for a real audience, role, need, price, risk, and deadline.
5. Choose conviction and how to present the case.
6. Receive delayed club, marketplace, rival, relationship, financial, and career consequences.
7. Follow the player through placement, development, loans, transfers, release, retirement, and archival callbacks.

That loop is materially different from managing a football team. Its strongest systems are uncertainty, interpretation, persuasion, access, professional reputation, and living with a judgment over multiple seasons.

No confirmed game-breaking defect remains in the current source after the integrated unit, browser, accessibility, replayability, architecture, persistence, security, package, and ten-season checks described in `design-audit-report.md`.

## Major integrity work completed

- Report artifacts now form immutable case histories. A revision can improve a judgment without manufacturing volume, reputation, table-pound uses, recovery credit, awards, narrative eligibility, or leadership credit.
- A signing reputation reward is attached to the dated club decision, not a sliding report-date window, so it resolves once.
- Season review and awards attribute volume to cases opened that season; revising an old case is not new work.
- Loan charges, placement rewards, report validation, narrative choices, achievements, and movement history have single-application or ledger-backed invariants.
- Simulated match events can only affect actual participants.
- Manual and batch weekly advancement are equivalent under the tested policy.
- Unsigned youth age out after four completed unsigned seasons while durable scout-linked history remains resolvable.
- Resolved, acknowledged, skipped, and orphaned narrative decisions clear their action-required pins.
- Saves use unified migrations, bounded retention, atomic native writes, strict UTF-8 validation, chunked large-transfer IPC, recovery copies, and explicit backend conflict behavior.
- Ghost-country travel and assignments are rejected by the canonical country registry.

## UI and system connectivity

The permanent interface is intentionally limited to Desk, Planner, Prospects, Reports, World, and Career. Current detail screens are reachable from those hubs and return to their owning workspace.

- Desk owns current pressure, briefs, opportunity radar, itinerary, inbox, and prospect priorities.
- Planner owns weekly intent, delegation policy, scheduling, travel, evidence depth, relationship work, and recovery.
- Prospects owns discovery, dossiers, evidence boards, development environments, loans, and follow-up.
- Reports owns report writing, presentation, marketplace accountability, history, and comparison.
- World owns the geographic map, country dossiers, knowledge tiers, travel, regional presence, offices, assignments, deliverables, and the archive.
- Career owns development, employment, finances, leadership, politics, recovery, relationships, alumni, performance, achievements, judgment calibration, legacy, and retirement.

The Career hub now contains durable routes to Network, Alumni, Performance, Achievements, and the full finance workbench. These were previously too dependent on transient hints and notifications.

## Removed, retained, and quarantined code

### Removed as proven dead

- The unreachable 14-file landing/marketing component tree. The application entry route redirects to `/play`; none of these components had a runtime path.
- The unused `paper-card` component.
- The obsolete placeholder-audio generator, which wrote WAV bytes under MP3 extensions and contradicted the owned, validated MP3 library.
- Other previously proven duplicate balance/tutorial surfaces removed during the broader tranche remain covered by architecture and import checks.

### Retained because it has distinct current value

- The detailed Financial Dashboard. It owns contracts, loans, credit, forecasts, revenue actions, and transaction history beyond the Career summary.
- Network, Alumni, Performance, Rivals, Agency, Training, Equipment, Hall of Fame, report comparison, season awards, and leadership screens. These are current detail routes rather than permanent workspaces.
- Historical report revisions and archival data. They are intentionally preserved as evidence, while reward calculations collapse to case-level semantics.

### Explicitly quarantined for a future full-game build

Match control, match summary, the senior player database, leaderboard, analytics workspace, fixture browser, scenarios, negotiations, and free agents remain compiled as lazy future modules. The canonical screen-scope contract prevents a Youth EA save, stale route, hint, achievement, or direct store mutation from entering them; each route has an in-scope fallback.

This is intentional product containment, not an assertion that those future modules are release-ready. They should move into a separately built full-game package later, but deleting them now would discard useful engine work without reducing the Youth first-load bundle.

## Replayability and interactivity finding

The current replayability gate produced 100 unique world manifests and 100 unique event trajectories across 100 three-season seeds. Average trajectory distance was 95.25%, all origins, flaws, doctrines, rival organizations, and world-condition combinations appeared, and the sample produced 4,725 explicit choice opportunities plus 3,593 rival opportunities without dead or runaway director states.

Rendered play confirms the game is not limited to passive dashboards:

- A selectable live pitch allocates attention to players and tactical moments.
- Evidence classification and hypotheses are persistent player actions.
- Weekly intent and delegation change resolution priorities and opportunity costs.
- Report presentation changes what the stakeholder room values.
- Rival operations expose odds and resolve once.
- World travel consumes funds/time and assignments require work completed in the destination.
- Consequence Cinema, newspaper archives, career recovery, political meetings, and story reels turn state changes into authored-feeling callbacks.

The remaining proof gap is human, not conceptual: only moderated players can establish whether the first hour is consistently understandable, exciting, and habit-forming.

## Remaining source risks

1. `src/stores/actions/weeklyActions.ts` remains a 7,965-line orchestration module. It is cycle-free and heavily tested, but future work should continue extracting bounded processors behind the architecture ratchet.
2. Some lower-traffic detail and future screens still use whole-store Zustand subscriptions. Current performance budgets pass; narrow these incrementally rather than destabilizing the release candidate.
3. `next lint` is deprecated. Move to the ESLint CLI before upgrading to Next 16.
4. No in-app updater exists for non-Steam manual installations. Steam is the intended Early Access update channel; document that clearly if GitHub installers are distributed.
5. Online feedback, Supabase cloud saves, and a global leaderboard are deliberately disabled. Do not expose them until production RLS, rate limits, retention, conflict handling, and server authority are tested.
6. Platform-specific Steam native loading must be proven in signed/notarized macOS and Linux packages, not inferred from Windows.

## Release blockers that remain open

- Freeze these local changes into a clean commit/tag and generate a hash-bound candidate manifest.
- Run the configured 20-seed x 30-season isolated soak on that exact candidate.
- Complete the packaged Windows clean-account/offline/save/recovery/interrupted-write/install/uninstall matrix.
- Build, sign/notarize, install, and execute the macOS and Linux matrices.
- Complete manual NVDA and VoiceOver journeys.
- Complete the moderated 12-person first-hour usability study.
- Profile the declared minimum physical Windows, macOS, and Linux hardware.
- If cloud features are enabled, complete real cross-device conflict, stale-copy, recovery, and production-policy tests.

## Fastest safe route to Early Access

1. Stop broad feature work and freeze a release-candidate commit.
2. Run the exact 20 x 30 soak overnight while Windows packaged journeys are performed.
3. Produce signed/notarized platform packages in CI and execute their platform matrices.
4. Run accessibility and moderated first-hour sessions in parallel; fix only release-blocking comprehension, accessibility, crash, corruption, or progression defects.
5. Rebuild from the final clean commit, generate the package manifest, rerun the strict evidence checker, and publish only when it passes.

The game is ready for that release-candidate process. It is not honest to call it fully production-certified until those external gates are attached to one exact build.
