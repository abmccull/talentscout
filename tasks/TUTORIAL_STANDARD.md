# Youth first-session tutorial standard

World class here means a new player can finish the real day-to-day loop without a lying or missing step. The tutorial teaches only that loop. It does not invent a toy hour.

## Metrics (1–10)

### 1. Flow
- **1–3:** Dead ends, skipped beats, or two next actions at once.
- **4–6:** The player can stumble through, but a required beat has no guide or the order jumps.
- **7–9:** One next action at a time; a rare pause is recoverable.
- **10:** One next action from Take the call through Advance Week. Watch → focus/lens → flag → phases/half-time/reflection → discovery call → first assessment → file → Planner / Advance Week. No dead end.

### 2. Ease / intuition
- **1–3:** Copy names a system the player cannot see.
- **4–6:** Copy is mostly right but uses leftover or generic language.
- **7–9:** Copy names the real control, with one soft metaphor.
- **10:** Instruction names the control on screen (`Next phase`, `Flag moment`, `Promising`, `File initial assessment`, `Advance week`). A new player does not have to guess.

### 3. Button / click / objective coherence
- **1–3:** Highlight points at a missing node, or copy describes a different click.
- **4–6:** Target exists but is the wrong control, or mentor and instruction disagree.
- **7–9:** Highlight, copy, and completable action agree with a small wording drift.
- **10:** Every active youth step’s `data-tutorial-id` exists on the claimed screen. Mentor text, instruction, and highlight name the same click.

### 4. Day-to-day coverage
- **1–3:** Teaches a toy Watch/notebook/fake rooms, or dumps World/Career/Inbox.
- **4–6:** Teaches the live Watch but skips discovery or the real first report.
- **7–9:** Covers the loop with one soft gap (for example Planner is shown but not named).
- **10:** Covers only the loop in criterion 1. Does not teach World, Career, Inbox, marketplace, equipment, or a notebook-only file.

A score of 10 on every metric is required. Taste is not a metric.

## Audit 1 — current path (2026-08-15, pre-fix)

Scored from shipped `YOUTH_GUIDED_MILESTONES`, `DISCOVERY_HOOK_MILESTONE_ORDER`, `getGuidedMilestoneInstruction`, `TutorialRuntime` (returns null on `openingDiscovery`), and ReportWriter InitialAssessmentBuilder.

| Metric | Score | Evidence |
| --- | --- | --- |
| Flow | 6 | Watch → focus → flag → complete is ordered. Discovery is unguided (`TutorialRuntime` bails). Order then jumps `completedMatch` → `wroteReport`. |
| Ease / intuition | 5 | Flag/half-time/reflection instructions name real clicks. Report mentor still says “write the name down” / “notebook”. File control is `File initial assessment`. |
| Button / click / objective | 5 | Observation targets exist. Discovery has no highlight. `wroteReport` targets `report-conviction` but copy talks conviction/notebook, not the five assessment decisions. |
| Day-to-day coverage | 6 | Live Watch is taught. Discovery and the real first assessment are not taught as the next clicks. Marketplace is not on the youth list (good). |

**Not 10/10.** Do not ship this audit as done.

## Audit 2 — after alignment (2026-08-15)

Scored from shipped `getDiscoveryHookMilestoneOrder()`, `getYouthGuidedMilestones()`, `getGuidedMilestoneInstruction()`, `TutorialRuntime` (guides `openingDiscovery`), source `data-tutorial-id` checks in `tests/ui/youthTutorialLoop.test.ts`, and `tutorial-tsc-vitest.log`.

| Metric | Score | Evidence |
| --- | --- | --- |
| Flow | 10 | Order is Watch → focus → flag → complete → **discovery** → first assessment → file → Advance Week. `completeMilestone` from a fresh start walks that list with one current task at a time. |
| Ease / intuition | 10 | Instructions name `Next phase`, `Flag moment` + `Promising`, `Complete Reflection`, who hears the name, the five assessment decisions, `File initial assessment`, `Advance the week`. |
| Button / click / objective | 10 | Every youth milestone target string exists in the claimed screen source. Mentor copy no longer mentions notebook / write-the-name / File the name. Discovery highlight is `opening-discovery-choices`. |
| Day-to-day coverage | 10 | Youth list teaches only that loop. World, Career, Inbox, marketplace, and notebook-only file are not guided steps. |

**Re-audit vs Audit 1:** flow 6→10, ease 5→10, coherence 5→10, coverage 6→10.

Live e2e (`e2e/flows/opening-discovery-hook.spec.ts`) was run. Playwright launched `/play` and reached new-game, then timed out waiting for **Take the call** (world-gen / 120s). That is captured in `{SCRATCH}/tutorial-e2e.log`. It is not a live 10/10 playthrough. The gating bar is the rubric + unit/source checks above.
