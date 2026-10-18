# Formative quality pilot — W11

Status: prepared, not executed. This pilot cannot substitute for the independent exact-package study in `moderated-usability-study.md` or close W15.

## Session setup

Recruit 10 first-time players and 5 returning players. These are the plan's formative targets, not release certification minima. Keep these participants separate from the final study. Record an anonymous participant ID, segment, source commit/tree, build hash, device, viewport, input method and starting save/seed. Obtain consent before recording; keep contact details outside the observation bundle.

Tell the participant: “Please play as you normally would. Tell us what you expect to happen and anything that feels unclear.” Do not teach the UI or name the next button. Record every hint and recovery, even if the participant subsequently completes the task.

## First-time session

1. Start a career and pursue the first player you find interesting. Observe discovery, evidence gathering and first filing without prompts.
2. Ask: “What would you do next, and why?” Record their answer before further interaction.
3. Present a saved case with contradictory evidence. Ask them to revise or defend their assessment; record which evidence they use.
4. Present a diary with two competing opportunities. Ask them to choose and explain what they give up.
5. Present a setback. Observe whether they find a recovery action and can explain the consequence.

## Returning session

1. Restore the participant's prior case after a break. Start the timer as the Desk appears.
2. Ask them to identify their unfinished work and explain one past consequence. Record accuracy and time, stopping the two-minute measure at 120 seconds while allowing play to continue.
3. Compare two career cases with different earlier choices. Ask what changed, why, and which person or relationship they would pursue next. Preserve uncertainty rather than coaching an intended story.

## Observation sheet

Use one row for each attempted task. Never infer success from silence or an eventual assisted completion.

| Participant | Segment | Task | Start / end | Unaided completion | Hints given verbatim | Error and recovery | Participant explanation verbatim | Severity | Evidence reference |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Not run | | | | | | | | | |

Keep an issue log with reproducible state, affected task, comprehension/consequence/interaction cause, frequency, proposed fix and retest result. Include contrary feedback and incomplete sessions in the denominator; document withdrawals separately.

## Review criteria

- Proposed target: at least 9 of 10 first-time players complete the opening and identify the next action unaided.
- Proposed target: at least 4 of 5 returning players recover their case and correctly explain a past consequence within two minutes.
- Report each task's raw success count, assistance count and failure reasons; do not combine them into an invented quality score.
- Prioritize repeated blockers and misunderstandings, implement scoped corrections, then retest affected tasks before freezing the final candidate.

Store anonymized observations and the exact build manifest outside the source tree under `quality-implementation-20260904/formative-pilot/<build-hash>/`. Until actual sessions exist, W11 remains open.
