# Manual assistive-technology release protocol

Status: **Unverified** until both signed journeys below are complete on the exact packaged candidate.

Automation such as Axe and keyboard E2E is supporting evidence only. It cannot pass this gate.

## Required environments

| Journey | Required setup | Evidence |
|---|---|---|
| NVDA | Current supported Windows build, release package, NVDA stable, Firefox or packaged Chromium path as shipped | Version strings, operator, date, candidate SHA, notes, video or timestamped transcript |
| VoiceOver | Current supported macOS build, signed/notarized release package, VoiceOver with default verbosity | Version strings, operator, date, candidate SHA, notes, video or timestamped transcript |

Run with sighted assistance disabled after launch. Record every workaround.

## Critical journey

For each step record `Passed`, `Failed`, or `Unverified`, plus the exact announcement and focus destination.

1. Start a new Youth Scout career and understand the non-repeating tutorial choice.
2. Complete the opening discovery hook, including evidence selection and the first meaningful uncertainty.
3. Navigate all six workspaces and identify the active workspace and unread/action-required state.
4. Set a weekly strategy, schedule by keyboard, inspect an activity, and resolve or delegate its interaction.
5. Complete a live observation: change lens, flag evidence, form or revise a hypothesis, and finish reflection.
6. Open the player dossier and distinguish observed information, confidence, contradiction, and unavailable knowledge.
7. Write and file an evidence-backed report; understand conviction, risk, audience, next step, and revision rules.
8. Resolve a relationship conflict and identify both obligations and affected recurring people.
9. Review a delayed consequence in Career Story Reel and follow its player/report links.
10. Open World Archive comparison; compare two players, two clubs, and two managers across seasons.
11. Book eligible travel, understand regional presence effects, and reject an unavailable destination without lost context.
12. Trigger save, load, corrupt-save recovery prompt, and local/cloud conflict choice.
13. Complete a career setback/recovery choice and understand progress, deadline, failure cost, and comeback route.
14. Change audio, motion, text, and contrast settings; confirm no critical meaning is audio-, color-, or motion-only.

## Machine-readable controls

The attestation must include every control ID declared for the journey in
`release-evidence-status.json`, each with `status: "Passed"`. They map to the
14 critical-journey steps in order, followed by the blocking-defect exit rule:

`tutorialChoiceUnderstood`, `openingDiscoveryCompleted`,
`sixWorkspacesNavigated`, `weeklyStrategyKeyboardScheduled`,
`liveObservationCompleted`, `dossierEvidenceUnderstood`,
`evidenceBackedReportFiled`, `relationshipConflictResolved`,
`delayedConsequenceReviewed`, `worldArchiveCompared`,
`travelPresenceUnderstood`, `saveRecoveryConflictCompleted`,
`careerRecoveryUnderstood`, `accessibilitySettingsConfirmed`, and
`noSeriousAccessibilityBlocker`.

An omitted or `Unverified` control blocks release even when every supplied
control passed.

## Blocking defects

Any of the following fails the release gate:

- focus loss, keyboard trap, or unexpected context switch;
- unlabeled control, state, chart, map alternative, dialog, toast, or validation error;
- live region that interrupts repeatedly, omits the consequence, or reads stale content;
- graphical evidence without equivalent structured text;
- a modal that does not announce its name, restore focus, or close predictably;
- drag-only scheduling or comparison;
- inaccessible timeout/deadline/default-choice information;
- a journey step requiring sighted assistance.

## Exit rule

Both journeys must complete without a serious blocker. Each defect must link to a fixed build and retest record. Store evidence under `artifacts/release/assistive-technology/<candidate-sha>/`; do not mark the machine-readable gate Passed from code review alone.
