# Moderated paired-career replayability study

This gate exists to answer a narrower question than general first-hour
usability: does the exact candidate produce two meaningfully different ordinary
careers for the same human player without coaching, fabricated drama, or
developer narration?

## Scope

- Use the exact candidate package from the bound manifest.
- Use the same package for both careers.
- Do not patch saves, swap branches, or hotfix copy between participants.
- Record the paired-career evidence independently of the candidate commit, then
  bind it back through the attestation hash model.

## Minimum study shape

- Minimum participants: 6.
- Segment mix: at least 3 genre-familiar players and 3 new or low-familiarity
  players.
- Order: counterbalance the paired-career order across participants.
- Session shape:
  - Career A: new run, first 45-60 minutes or until the first report / first
    clear weekly conflict resolves.
  - Career B: second fresh run on the same package, same moderator, same time
    budget, different seed.
- The moderator may clarify controls, but may not explain strategy, optimal
  choices, or hidden systems.

## Required prompts

Capture short, direct participant answers after both runs:

1. What felt different between the two careers?
2. Did either run contain too many quiet weeks in a row? If so, when?
3. Did either run feel like it stopped giving you meaningful weekly decisions?
4. Did club recruitment expression, football-culture context, and recurring
   relationship-conflict fronts feel materially different between the two runs?
5. If you started a third career, would you expect it to feel different again?

## Pass criteria

- `replayabilityDifferenceThreshold`
  - At least 5 of 6 participants must describe concrete differences between the
    paired runs without being prompted with candidate answers.
- `quietStreakPerceptionCaptured`
  - Every participant record must include whether quiet stretches felt too long.
- `meaningfulWeekDensityPerceptionCaptured`
  - Every participant record must include whether weekly choices stayed
    meaningful across both careers.
- `clubRecruitmentExpressionSurfaceReviewed`
  - The facilitator must ask specifically about visible club recruitment
    expression and club-side pressure.
- `footballCulturePlaybookSurfaceReviewed`
  - The facilitator must ask specifically about football-culture context and
    authored observation windows.
- `relationshipConflictFrontSurfaceReviewed`
  - The facilitator must ask specifically about recurring relationship-conflict
    fronts involving contacts, managers, directors, families, journalists, or
    rivals.
- `noRepeatedP0`
  - No blocking replayability or comprehension failure may repeat across
    participants.
- `noRepeatedP1AfterRetest`
  - Any serious issue found in early sessions must be retested and shown absent
    in later sessions before certifying this gate.

## Evidence bundle

- One attestation JSON bound to the exact manifest and package hash.
- One anonymized notes file or transcript summary.
- One seed-order file showing the paired career order per participant.
- Optional recordings may live outside Git, but the local evidence bundle must
  still hash the retained notes/transcripts.

Use the template in
`docs/release/templates/moderated-paired-career-replayability.template.json`.
