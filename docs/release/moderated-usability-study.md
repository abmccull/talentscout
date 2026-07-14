# Moderated release usability study

Status: **Unverified** until the full study is run against the exact packaged candidate.

## Participants and controls

- 12 participants minimum: 6 experienced management-simulation players and 6 genre newcomers.
- No repository contributors, close friends coached on the design, or repeated participants from formative sessions.
- Use seeded careers balanced across participants while preserving each seed's uncertainty and consequences.
- Record screen, audio, task time, assistance, errors, confidence, and verbatim explanation. Obtain consent and minimize personal data.

## Session structure

1. Five-second expectation test from the title/new-game screen.
2. First five minutes with no moderator instruction beyond “begin a career.”
3. Opening discovery and first report.
4. Contradictory evidence in a second context; ask the participant to revise or defend the hypothesis.
5. Weekly planning under a forced opportunity conflict.
6. Relationship dilemma with two named stakeholders and incompatible obligations.
7. Delayed outcome/career-story callback; ask “why did this happen?”
8. Multi-season archive comparison and a recommendation of whom to follow next.
9. Career setback/recovery choice.
10. Save/load and return-to-task check.
11. Standard System Usability Scale plus discovery, suspense, pride, risk, attachment, and clarity questions.

Do not explain UI vocabulary until the participant has attempted the task. Assistance is counted even if the task later succeeds.

## Release thresholds

| Measure | Gate |
|---|---:|
| Evidence-to-report journey completed unaided | at least 90% |
| Correct explanation of one club response | at least 85% |
| Correct explanation of one delayed consequence | at least 85% |
| Participants who experience and can recount the “I found someone” moment | at least 10 of 12 |
| Median SUS | at least 85 |
| Repeated P0 usability failures | 0 |
| Repeated P1 failures on the same task | 0 after retest |

## Observation rubric

Code each issue by task, participant segment, cause, severity, recovery, and whether the system or the copy taught the correct mental model. Separate:

- could not find the action;
- found it but did not understand the tradeoff;
- understood it but lacked decision information;
- expected a consequence that never occurred;
- received a consequence but could not explain it;
- completed the task but felt no ownership or emotional payoff.

Store the anonymized session sheet, SUS calculations, issue log, and candidate SHA under `artifacts/release/usability/<candidate-sha>/`. A plan or rehearsal does not count as Passed evidence.

## Machine-readable controls

The study attestation must mark every `requiredControls` ID in
`release-evidence-status.json` exactly `Passed`. The contract covers participant
count and segmentation; every session stage; every numerical release threshold;
the P0/P1 retest rules; and the complete anonymized evidence bundle. Omitting a
session or threshold is not equivalent to passing it, and `Unverified` always
blocks promotion.
