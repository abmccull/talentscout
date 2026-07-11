# TalentScout Principal Review — 11 July 2026

## Bottom line

TalentScout has a distinctive, promising observation-and-reflection prototype inside a broad but non-authoritative career simulation. Its next milestone should not be more feature breadth. It should make one causal chain trustworthy across several seasons: **evidence → opinion → report → stakeholder decision → player/club outcome → remembered reputation and relationship consequences**.

Current world-class readiness is assessed at **3.6/10**. The rendered design scores **5.4/10 overall**, with a stronger brand/first impression than interaction, accessibility or journey cohesion.

## Deliverables

1. [Principal product and simulation review](principal-review.md) — Phases 1, 2, 5, 6 and 8: executive verdict, architecture, current loops, category scores, Football Manager principle comparison, redesigned loops, consolidation and release recommendation.
2. [System-completeness matrix](system-completeness-matrix.md) — Phase 3: UI→store→engine→state→persistence→cadence→downstream→test trace for every required system.
3. [Major-screen decision audit](screen-decision-audit.md) — Phase 2C supplement: decision, information, uncertainty, opportunity cost, feedback and verdict for every major screen.
4. [Verified defects and structural risks](verified-defects.md) — Phase 4: reproduction, files/functions, root cause, impact, fix and regression test for each confirmed defect.
5. [P0–P4 roadmap](roadmap.md) — Phase 7: product value, modules, approach, dependencies, risks, effort, acceptance, tests and migration requirements.
6. [Testing strategy](testing-strategy.md) — Phase 9: unit, property, state-machine, differential, E2E, migration, soak, accessibility, performance, platform and CI plan.
7. [Rendered design audit](design-audit-report.md) — 12 dimensions plus System Cohesion, screenshots, axe evidence, redesign direction and UI acceptance criteria.
8. [Machine-readable design summary](design-audit-summary.json).
9. [Capture evidence](capture-live/) — 16 desktop/mobile screenshots and structured DOM/axe output.

## Final verification snapshot

- `npm run test:unit`: **20/20 passed**.
- `npm run lint`: **passed**.
- `npm run typecheck`: **passed** in the final observed worktree.
- `npm run build`: **passed**; static `/play` export generated.
- Playwright inventory: **235 tests in 48 files**.
- Full Playwright attempt: **did not pass/complete**. Eleven distinct tests passed before the stopped run; the mobile dashboard/calendar accessibility flow timed out twice, and the freelance career-screen exact-text assertion failed twice. Direct rerun confirmed the career test is stale against the current combined label. The remainder-shard attempt exited abnormally without results.
- Targeted long-career invariant E2E: **passed**, but it uses the non-equivalent batch simulation path and therefore does not validate manual-world fidelity.
- Connected GitHub open issues: **none returned**.

## Highest-priority integrity failures

1. Manual and batch advancement create different careers.
2. Season rollover duplicates fixtures and contaminates standings.
3. Promotion/relegation does not change league membership.
4. Observation sample counts grow exponentially.
5. Reports can overwrite/reward duplicates and preview different values from committed state.
6. Rival counter-bids do not move money or players.
7. Employment transitions can erase history or leave impossible state.
8. Every fit senior player participates in every match and form has two sources.
9. Finance lacks a complete source ledger.
10. Saves are versionless full-state blobs and Steam behavior is not a complete provider lifecycle.
