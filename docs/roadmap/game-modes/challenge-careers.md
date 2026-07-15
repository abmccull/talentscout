# Challenge Careers — implementation plan

## Document status

- Product status: exploring; not release-ready.
- Player-facing product category: a full replayable play format marketed as Challenge Careers, not a menu of achievement checklists.
- Engineering identity: `runKind: "challenge"` composed over one of the four host `GameModeId` career simulations; never a fifth mode ID.
- Depends on: the shared mode platform and production-complete host capabilities.
- Recommended delivery: platform contracts and an internal vertical slice may begin after shared APIs plus First Team/Regional capability boundaries stabilize; the first public pack requires at least two complete host modes; author Data-hosted challenges only after Data Scout reaches feature complete.
- Estimated programme size: XL, approximately 5–8 engineer-months plus design, narrative, UX, audio, QA, and balancing.

## Mode promise

Challenge Careers asks the player to solve a specific scouting crisis inside a deterministic but unpredictable football world. Every run has an authored premise, enforceable constraints, branching pressure, a limited time horizon, and a legible score. The player should be able to compare two attempts and explain how different evidence, relationships, risks, and world events produced different stories.

This play format is TalentScout's roguelike expression. It does not replace the long-form career or create a fifth simulation mode. It compresses the strongest decisions from its host `GameModeId` into runs that last from eight in-game weeks to three seasons, then turns success and failure into a memorable debrief and optional meta-progression.

The signature question is:

> Can I make defensible scouting decisions when the world, the brief, and the people around me refuse to cooperate?

## What makes this a distinct way to play

Challenge Careers must not be a normal career with a progress checklist attached. As a distinct play format over a host career mode, it changes the structure of play in five ways:

1. **A hard premise:** the run begins with a concrete crisis, opportunity, or professional wager.
2. **Enforced constraints:** budgets, access, evidence standards, regions, staff, deadlines, politics, and risk limits materially alter the simulation.
3. **Escalating acts:** objectives branch as the player succeeds, stalls, or creates new obligations.
4. **Run drafting:** the player chooses a starting advantage and accepts a complication, producing strategic variation before week one.
5. **A scored debrief:** the game evaluates process, judgment, efficiency, consequences, and integrity—not report volume alone.

The format's emotional arc should be pressure → improvisation → commitment → consequence → reflection → “one more run.”

## Current repository assessment

The codebase has a credible foundation, but the current scenario feature is not yet this production Challenge Careers format.

| Area | Current implementation | Classification | Required change |
| --- | --- | --- | --- |
| Scenario catalogue | Ten entries in `src/engine/scenarios/scenarioDefinitions.ts` with setup text and predicate-based objectives | Functional but shallow | Replace function predicates and arbitrary constraint objects with versioned, data-driven rule and objective definitions |
| Initial setup | `applyScenarioSetup` applies the starting country; `applyScenarioOverrides` applies week, season, reputation, tier, and active ID | Partially connected | Apply and validate the entire challenge loadout, world patch, stakeholder cast, resources, mode, and rules |
| Constraint enforcement | Definitions include values such as `specialization`, `scoutAge`, `rivalIntensity`, and target-country counts | UI/design ahead of engine | Implement registered constraint modules; unknown or incompatible rules must fail closed before a run starts |
| Objective evaluation | `scenarioEngine.ts` evaluates pure predicates and two special failure cases | Functional but shallow | Add an objective graph, event-sourced progress, branch conditions, recovery states, scoring, and explanations |
| Outcome authority | `scenarioAuthority.ts` safely reconciles removed IDs and grants completion once | Strong foundation | Generalize to versioned run outcomes, medals, score records, archived definitions, and integrity classes |
| Selection UI | `ScenarioSelect.tsx` shows category, difficulty, duration, objectives, locks, and confirmation | Functional but shallow | Add mode compatibility, seed policy, rule preview, draft choices, expected pressure, accessibility, and previous-best comparison |
| Run identity | `src/engine/run/runManifest.ts` fingerprints seed, specialization, difficulty, countries, traits, mutators, and content | Strong foundation | Upgrade the one manifest to V2 and embed immutable challenge definition/rule fingerprints without making mutable progress part of identity |
| World variation | `src/engine/world/worldConditions.ts` creates deterministic global/regional conditions with persisted resolved modifiers | Strong foundation | Let challenges weight or forbid condition tags through explicit rules; never reroll a save on load |
| Weekly resolution | `weeklyActions.ts` derives progress and resolves victory/failure | Connected but too centralized | Move challenge processing into a bounded engine phase with exactly-once event consumption |
| Legacy | `src/engine/career/legacy.ts` unlocks advanced scenarios and records completed IDs | Functional but shallow | Store best score by definition/version/integrity; make unlocks sidegrades and content access, not dominant power |
| Testing | `tests/invariants/scenarioAuthority.test.ts` covers objective boundaries, deadlines, exactly-once rewards, and removed content | Useful authority coverage | Add rule-module contracts, deterministic seed tests, manual/batch equivalence, branch coverage, score invariants, migration fixtures, and long-run soak |

### Verified structural gap

`ScenarioDef.setup.constraints` is a `Record<string, unknown>`, but `applyScenarioSetup` and `applyScenarioOverrides` do not generally interpret those values. A scenario can advertise a data specialization, older scout, high rival intensity, or country target without actually creating that run. This is release-blocking for Challenge Careers because the premise and the simulation can disagree.

## Design pillars

### 1. Known rules, uncertain world

The player sees the constraints, scoring model, deadlines, and known stakeholders before committing. Player ability, hidden traits, event timing, rival choices, and future outcomes remain uncertain. Difficulty comes from making judgments under uncertainty, not from withholding the rules.

### 2. Process matters as much as result

Finding a future star is valuable, but a challenge can also reward correct role fit, price discipline, calibrated confidence, useful risk identification, stakeholder handling, speed, and recovery from an early mistake.

### 3. Pressure creates different decisions

Every constraint must change at least one weekly choice. “No live data feed” changes evidence gathering. “One trusted contact” changes relationship strategy. “Six-week window” changes certainty thresholds. A numerical penalty with no decision impact is not a valid challenge rule.

### 4. Failure remains playable

Most setbacks open a costly recovery route instead of ending the run immediately. Missing a board milestone might reduce authority, create an ultimatum, or force the sale of an asset. Terminal failure is reserved for explicit hard conditions.

### 5. Comparable without becoming competitive-service dependent

Every official run has a fingerprint, definition version, content version, integrity class, and score breakdown. Local comparisons and shareable run codes work offline. Online leaderboards are optional future infrastructure, not a dependency for the mode's value.

### 6. Systemic stories over scripted answers

Authored acts create pressure and context; the football world supplies the targets and outcomes. The same challenge should accept many valid solutions, and a repeat attempt should not reveal a single correct player or route.

## Player audience

Challenge Careers serves four needs:

- New players who want a directed, shorter experience after the first-hour tutorial.
- Experienced players who want a difficult, focused scouting puzzle.
- Returning players who want a two-session run instead of resuming a long career.
- Expert players who want seeded comparisons, self-imposed constraints, and mastery goals.

Starter challenges teach one system with forgiving recovery. Advanced challenges combine several systems. Expert challenges demand mastery but must never rely on hidden rule changes or excessive random punishment.

## Challenge families

Each family changes the shape of the run rather than merely its objective count.

### Rescue and turnaround

- Premise: a club is in crisis and needs evidence-backed targets before a short deadline.
- Unique pressure: weekly board confidence, limited decision authority, volatile manager relationship, immediate fit.
- Example: fill two role-critical gaps during a winter window while the manager and sporting director demand different profiles.
- Best host modes: First Team Scout, Data Scout.

### Discovery race

- Premise: identify and secure access to emerging talent before rivals establish a claim.
- Unique pressure: lead heat, rival routes, exclusivity, opportunity decay, uncertain upside.
- Example: build a credible three-player regional shortlist across two countries before a rival network controls the showcase circuit.
- Best host modes: Youth Scout, Regional Expert.

### Market constraint

- Premise: solve a recruitment brief under unusual financial, registration, data, or geographic limits.
- Unique pressure: value, alternatives, eligibility, agent leverage, cost of evidence.
- Example: replace an outgoing starter without transfer fees, using loans and expiring contracts only.
- Best host modes: First Team Scout, Data Scout.

### Political wager

- Premise: the player's method or position is contested inside an organization.
- Unique pressure: stakeholder coalitions, meeting commitments, conflicting evidence standards, career risk.
- Example: prove a data-led recruitment programme while an influential manager rewards eye-test consensus.
- Best host modes: all modes.

### Survival and recovery

- Premise: begin with damaged reputation, debt, failed relationships, or a flawed inherited pipeline.
- Unique pressure: fewer safe options, explicit recovery milestones, tempting high-risk shortcuts.
- Example: rebuild a consultancy after a public recommendation failure without making another overconfident call.
- Best host modes: all modes, especially late-career paths.

### Legacy sprint

- Premise: complete a final professional objective before retirement, contract expiry, or succession.
- Unique pressure: long-term callbacks, delegation, successor development, selective use of reputation.
- Example: leave a sustainable regional network and one validated successor rather than chasing raw report volume.
- Best host modes: Regional Expert, agency/leadership careers.

### Expedition

- Premise: enter an unfamiliar football ecosystem with a deliberately incomplete support network.
- Unique pressure: travel route, language/culture, local intermediaries, legitimacy, uncertain data quality.
- Example: establish trusted presence in a new region and deliver one defensible recommendation in twelve weeks.
- Best host modes: Regional Expert, Youth Scout.

## Core loops

### Pre-run draft

1. Choose an authored challenge.
2. Review host mode, duration, known rules, fail conditions, score categories, and prior best.
3. Select a seed policy: fresh private seed, entered run code, or official rotating seed.
4. Draft one edge from three compatible options.
5. Accept one complication from two visible options; some expert challenges fix both.
6. Review the generated starting cast and disclosed world context.
7. Sign the brief and begin.

Decisions: method, acceptable weakness, seed policy, and risk appetite.

Resources spent: none before start; the draft creates opportunity costs rather than purchases.

Immediate feedback: a concise “contract” summarizes what changed and why.

Long-term consequence: draft choices are immutable run identity and appear in the final debrief.

### Minute-to-minute loop

1. Read a pressure update, lead, report conflict, or stakeholder request.
2. Inspect its source, certainty, deadline, and effect on the active objective graph.
3. Compare targets or possible responses.
4. take a bounded interactive action: ask a follow-up, test evidence, negotiate access, defend a recommendation, delegate, or change the weekly intent.
5. See the immediate cost, relationship response, and next decision window.

The mode should favor short consequential interactions over passive dashboards. Challenge-specific scenes reuse the game's interview, observation, map, report-room, and meeting surfaces with different stakes.

### Weekly loop

1. Review remaining time, pressure meters, objective branches, stakeholder promises, and active risks.
2. Set strategic intents for evidence, access, persuasion, follow-up, and contingency.
3. Allocate personal attention, travel, money, and delegated capacity.
4. Resolve scheduled work using the same canonical weekly pipeline as the host career mode.
5. Consume new challenge triggers exactly once.
6. Choose responses to critical escalations; if the player has explicitly enabled delegation, record who chose and why.
7. Update progress, score projections, and visible failure/recovery routes.

Scarce resources:

- remaining weeks and deadline windows;
- scout attention and fatigue;
- cash and travel capacity;
- evidence diversity and access;
- stakeholder confidence and political capital;
- opportunity ownership and lead temperature;
- delegated staff capacity;
- conviction exposure.

### Act loop

Every challenge contains two to five acts. An act is a stateful objective node, not a scripted chapter.

Example rescue structure:

1. **Triage:** understand club needs and identify a credible longlist.
2. **Conflict:** manager and director split over priority; the player commits to a route.
3. **Window:** shortlisted players attract rivals, agents, injuries, and price movement.
4. **Decision:** present the recommendation and alternatives under deadline.
5. **Aftermath:** evaluate whether the process, fit, cost, and confidence were justified.

Acts advance through recorded domain events. A player can enter alternate acts based on missed milestones, stakeholder trust, or chosen compromises.

### Run consequence loop

Short challenges should simulate enough future time to judge the decision responsibly. The debrief can resolve immediate criteria at the deadline, then run a bounded epilogue for later consequences:

- signing or placement outcome;
- role and tactical fit;
- fee, wage, and opportunity cost;
- adaptation and availability;
- development trajectory;
- stakeholder memory;
- rival claim and media narrative;
- calibration of confidence versus evidence;
- career or legacy effect.

The epilogue uses the same downstream systems as career play; it must not invent a disconnected “correct answer.”

### Multi-run loop

1. Finish or abandon a run with a recorded outcome.
2. Review a causality-first debrief.
3. Compare to the player's previous attempt or the same seed.
4. Unlock a new challenge, draft sidegrade, cosmetic distinction, or analytical lens.
5. Retry the same seed with another strategy or start a different world.

Unlocks must broaden choices. They must not make future scored challenges easier through permanent numerical power.

## Objective graph

Replace flat predicate arrays with a versioned graph.

### Node types

- `milestone`: complete when auditable facts satisfy a rule.
- `decision`: requires an explicit player choice before a deadline.
- `sustain`: maintain a condition across a defined interval.
- `avoid`: remains valid unless a prohibited event occurs.
- `recovery`: activates after a failure or breach.
- `optionalRisk`: offers bonus score for accepting greater exposure.
- `epilogue`: evaluates downstream outcomes after the active clock.

### Node states

`locked | available | active | satisfied | breached | recovered | failed | waived`

### Required behavior

- Prerequisites and activation reasons are visible.
- Progress derives from a challenge event ledger, not mutable UI counters.
- A satisfied node cannot resolve twice.
- A breached node either activates a named recovery route or contributes to terminal failure.
- Optional nodes cannot silently become required.
- Definition changes never rewrite a completed run; the run stores the definition version and resolved copy needed for its archive.

## Constraint and mutator engine

### Rule contract

Every enforceable rule is a registered module with:

- stable ID and semantic version;
- compatible host modes and required capabilities;
- configuration schema and validation;
- new-game transformation;
- allowed/blocked actions;
- weekly hooks at named phases;
- domain-event subscriptions;
- player-facing explanation;
- save migration policy;
- deterministic test fixture;
- scoring and integrity implications.

Examples:

- `deadline.transfer-window.v1`
- `budget.net-spend-cap.v1`
- `evidence.live-only.v1`
- `evidence.no-premium-data.v1`
- `geography.region-lock.v1`
- `staff.solo-practitioner.v1`
- `stakeholder.split-authority.v1`
- `rival.head-start.v1`
- `recruitment.loan-only.v1`
- `reputation.one-table-pound.v1`

### Action policy

Rules should not patch buttons ad hoc. The mode platform asks an action-policy service whether an action is:

- allowed;
- allowed with a disclosed consequence;
- blocked with a reason and recovery route;
- incompatible with the active challenge and therefore a definition error.

All engine actions validate again at mutation time. UI disabling alone is not enforcement.

### Challenge draft modifiers

Edges should create playstyle options:

- a trusted local fixer but no analyst;
- one free emergency trip but higher fatigue;
- stronger manager trust but weaker board confidence;
- a better initial data sample but a noisier unseen league adjustment;
- a veteran assistant whose relationships are strong but methods are biased.

Complications should create visible tradeoffs:

- public deadline;
- rival head start;
- fragmented data rights;
- agent exclusivity;
- travel disruption;
- inherited bad recommendation;
- board faction conflict;
- compressed observation schedule.

Draft pools are filtered by capability and incompatibility tags, then selected through a named RNG stream. Options persist before the player selects; reopening the screen cannot reroll them.

## Pressure system

Use several explainable pressures rather than one generic difficulty bar.

| Pressure | Increases from | Player responses | Consequences |
| --- | --- | --- | --- |
| Deadline | passing weeks, missed act milestones | narrow scope, delegate, accept uncertainty | lost options, terminal deadline |
| Stakeholder confidence | broken promises, weak fit, poor communication | meeting, evidence, concession, alternate target | authority, access, employment |
| Opportunity heat | rival interest, media exposure, agent action | secure access, accelerate report, create alternative | exclusivity, price, target loss |
| Financial exposure | travel, subscriptions, staff, fees | cheaper evidence, negotiate, sell insight | liquidity, score, recovery constraints |
| Personal strain | travel, overtime, crisis responses | rest, delegate, drop work | observation quality, mistakes, health |

Every pressure change records cause, amount, source event, and expiry. The UI links a pressure change back to the decision or world event that caused it.

## Scoring and medals

### Score categories

- **Outcome:** did recommendations or placements achieve the intended football purpose?
- **Judgment:** were strengths, risks, role, potential, and uncertainty assessed accurately?
- **Fit:** did the recommendation match the brief, club, tactical context, and development environment?
- **Value:** were fee, wage, alternatives, timing, and opportunity cost sensible?
- **Calibration:** did conviction match the evidence available at the time?
- **Adaptation:** did the player update a belief when contradictory evidence arrived?
- **Relationships:** were promises, conflicts, and access managed responsibly?
- **Efficiency:** what did the result cost in weeks, attention, money, and delegated capacity?
- **Optional courage:** which disclosed risks did the player accept and survive?
- **Integrity:** did the run remain in the selected integrity class?

### Guardrails

- Raw report count is never a primary score.
- The game scores only information knowable at the decision point plus later outcomes when explicitly marked as hindsight.
- Random player outcomes influence outcome score but cannot erase high-quality process score.
- A lucky weak report and an unlucky excellent report should be distinguishable.
- No score uses hidden true attributes in a player-facing explanation. Internal truth comparisons are converted into category-level calibration statements.
- Scores are capped per category to prevent grind exploits.
- The score breakdown is deterministic after all relevant events are fixed.

### Medals

- Bronze: solved the essential professional brief.
- Silver: solved it with credible process and limited breaches.
- Gold: strong process, outcome, and efficiency across required categories.
- Black book: optional mastery distinction for expert constraints, never required for content access.

## Randomness and replayability

### Named streams

Use `createNamedRNG` with isolated domains so adding narrative variation does not change player generation or objective outcomes. Suggested scopes:

- `challenge/draft`
- `challenge/cast`
- `challenge/act-event`
- `challenge/recovery-offer`
- `challenge/epilogue`
- `challenge/copy-variant`

Every draw includes challenge ID, definition version, season/week or act, and stable entity IDs where applicable.

### What varies between runs

- world seed and world traits;
- active global and regional conditions;
- stakeholder personalities and conflicts;
- target pool and career trajectories;
- rival organization, routes, and risk tolerance;
- draft edges and complications;
- act event candidates;
- recovery offers;
- market and travel conditions;
- authored copy variants and audiovisual treatment.

### What does not vary invisibly

- scoring weights;
- deadlines;
- terminal failure rules;
- constraint semantics;
- integrity policy;
- the effect of a player-selected draft option.

Random events are candidates, not commands. Eligibility, cooldowns, diversity budgets, and consequence history prevent repetition and incoherent event chains.

## Stakeholders and recurring identities

Each run needs a small, memorable cast rather than disposable notification senders.

Minimum cast:

- commissioning stakeholder;
- operational ally;
- internal skeptic or rival authority;
- external gatekeeper such as agent, family member, organizer, journalist, or local fixer;
- named rival scout or organization;
- at least one player/prospect whose story can recur through the epilogue.

Stakeholders have:

- goals and red lines;
- preferred evidence and communication style;
- promises owed and received;
- memory of specific decisions;
- relationship with other cast members;
- capacity to grant access or impose costs;
- reaction cooldowns and escalation rules;
- authored voice variants.

Helping one stakeholder should sometimes damage another relationship. The mode should never reduce these people to interchangeable trust meters.

## Content architecture

### Data-only definition

Definitions must be serializable. Do not persist closures.

```ts
interface ChallengeDefinitionV1 {
  id: string;
  version: number;
  title: string;
  family: ChallengeFamily;
  compatibleGameModeIds: GameModeId[];
  duration: ChallengeDuration;
  difficulty: ChallengeDifficulty;
  requiredCapabilities: ModeCapabilityId[];
  setupPatch: ChallengeSetupPatch;
  ruleConfigs: ChallengeRuleConfig[];
  draftPoolIds: string[];
  castTemplateId: string;
  objectiveGraph: ChallengeObjectiveGraph;
  scoringProfileId: string;
  epiloguePolicyId: string;
  contentTags: string[];
}
```

Validation occurs during build, scenario browser load, and run creation. Invalid official definitions are excluded with diagnostics; invalid saved definitions fail closed into an archived, viewable run without granting rewards.

### Runtime state

```ts
interface ChallengeRunStateV1 {
  challengeStateSchemaVersion: 1;
  selectedEdgeId?: string;
  selectedComplicationId?: string;
  objectiveStates: Record<string, ChallengeObjectiveState>;
  pressure: ChallengePressureState;
  eventLedger: ChallengeEventRecord[];
  appliedEventIds: string[];
  scorePreview: ChallengeScoreBreakdown;
  terminalOutcome?: ChallengeOutcome;
  resolvedAt?: GameDate;
}
```

Store this as optional `GameState.challengeState`, a sibling of the host `modeState`, and only when `runManifest.runKind === "challenge"`. Challenge definition ID/version/fingerprint, host `gameModeId`, and integrity policy are read exclusively from `RunManifestV2`; they are never mirrored into runtime state. Do not copy the entire GameState or host-mode data into challenge state. Store stable references, rule progress, resolved authored content, and exactly-once markers. Loading enforces the bidirectional invariant that challenge state exists if and only if the manifest declares a challenge run; a mismatch fails closed into the recoverable archived-run flow.

### Archive record

The cross-career profile stores:

- challenge ID and definition version;
- run fingerprint and integrity;
- host mode and seed policy;
- final medal and score breakdown;
- selected draft options;
- terminal outcome and reason;
- start/end game dates;
- decisive recommendation/case IDs;
- optional share code;
- compact debrief highlights.

It does not retain the whole retired world inside local storage.

## Engine architecture

Add a bounded `src/engine/challenges/` domain:

- `definitions/`: serializable challenge content.
- `catalog.ts`: lookup, versioning, visibility, unlocks, compatibility.
- `schema.ts`: runtime validation and migration-safe parsers.
- `manifest.ts`: pure helpers that produce the challenge identity/fingerprint fields embedded in the one shared `RunManifestV2`; it is not a second persisted manifest.
- `setup.ts`: validated new-world setup patch application.
- `capabilities.ts`: host-mode compatibility checks.
- `rules/`: registered constraint modules.
- `actionPolicy.ts`: authoritative allowed/blocked/consequential action checks.
- `objectiveGraph.ts`: graph activation and state transitions.
- `eventAdapter.ts`: converts canonical domain events into challenge events.
- `pressure.ts`: explainable pressure calculations.
- `scoring.ts`: profile-based score breakdown and medal thresholds.
- `epilogue.ts`: bounded downstream evaluation.
- `authority.ts`: exactly-once terminal resolution and removed-content reconciliation.
- `archive.ts`: compact cross-career records.
- `migration.ts`: upgrade or archive older challenge state.
- `selectors.ts`: player-facing derived data without state mutation.

Integration points:

- `src/engine/run/runManifest.ts`: include the immutable challenge fingerprint and selected draft IDs in run identity.
- `RunManifest` V2 must also persist `gameModeId` and `runKind: "challenge"`; Challenge Careers composes that host mode and never replaces it with a fifth mode ID.
- canonical weekly simulation pipeline: invoke one `processChallengePhase` after domain events have been finalized.
- decision ledger and consequence engine: emit decisions and consume callbacks rather than duplicating them.
- save migration: invoke challenge migration exactly once through the canonical migration boundary.
- long-save compaction: compact the event ledger after terminal resolution while preserving audit totals and highlight references.

### Store boundary

Expose a small action surface:

- `previewChallengeRun`
- `startChallengeRun`
- `selectChallengeDraftOption`
- `acknowledgeChallengeBrief`
- `resolveChallengeDecision`
- `abandonChallengeRun`
- `archiveChallengeOutcome`

Do not put objective logic in Zustand actions or React components. Store actions validate input, call pure engines, persist returned state, and enqueue UI feedback.

## User experience

### Challenge browser

Required information:

- fantasy and professional brief;
- host mode and required experience;
- expected real/in-game duration;
- known rules, score weights, hard failures, and recovery policy;
- starter/advanced/expert classification;
- previous best, recent attempt, and unlock path;
- seed choices and offline availability;
- accessibility-friendly difficulty explanation;
- warning when a challenge uses a mode the player has not completed onboarding for.

Filters:

- host mode;
- duration;
- family;
- difficulty;
- completed/uncompleted;
- integrity class;
- new or recently updated content.

### Run briefing

Use a signed-brief presentation rather than a settings form. The player reviews the cast, constraints, starting resources, objective graph, known calendar, and score. Draft choices have side-by-side tradeoffs. A final confirmation repeats hard failures and immutable selections.

### In-run HUD

The normal workspace shell remains primary. A compact challenge strip shows:

- current act and next deadline;
- top two pressures;
- active objective decision;
- projected medal range, clearly labeled as a projection;
- route to the full challenge room.

It must not cover normal scouting information or turn every screen into a quest UI.

### Challenge room

One screen combines:

- objective graph and act history;
- pressure explanations;
- rule contract;
- promises and obligations;
- score projection and category evidence;
- run identity/fingerprint;
- previous-best comparison;
- abandon-run control with consequence disclosure.

### Decision scenes

Critical challenge choices use interactive scenes with distinct presentation:

- board or manager meeting;
- agent negotiation;
- rival confrontation;
- field observation fork;
- evidence-room conflict;
- media response;
- recovery ultimatum.

Each choice shows known costs, uncertainty, affected stakeholders, and timing. Options must not be cosmetically equivalent.

### Debrief

The final screen answers:

1. What did I choose?
2. What did I know at the time?
3. What happened immediately?
4. What happened later?
5. Which systems caused that outcome?
6. Where was my judgment calibrated or biased?
7. What changed versus my previous attempt?

Include a timeline, score waterfall, decisive cases, stakeholder callbacks, alternate routes that were genuinely available, and a compact run code. Never expose hidden attribute truth directly.

## Interactivity, visuals, and audio

Challenge Careers should be the most dramatically presented mode, but presentation follows state.

- Briefings use location, club, map, or evidence-board art selected from authored source groups.
- Pressure changes use restrained motion and color; never communicate state by color alone.
- Act transitions use short stingers and environmental layers, with independent music/SFX controls.
- Recurring stakeholders use consistent portrait treatment, voice style in copy, and relationship motifs.
- Deadline scenes use spatial calendars, transfer-window clocks, and route maps rather than spreadsheet-only counters.
- Debriefs animate the causal timeline and score categories with reduced-motion alternatives.
- Every audiovisual asset must be provenance-inventoried and covered by the project's commercial-rights attestation.

No unskippable animation may delay weekly play. Screen-reader announcements summarize act changes, pressure, and results without reading decorative prose first.

## Onboarding

Challenge Careers does not replay the Youth tutorial.

- First entry: a two-minute mode briefing with one starter recommendation based on completed onboarding.
- First run: contextual teaching attached to the challenge contract, draft, first pressure change, and debrief.
- Repeat runs: teaching is suppressed unless the player re-enables it.
- New host mode: the player is directed to that mode's onboarding or a challenge-specific assisted start.
- Expert rules: optional glossary links explain exact semantics without forcing popups.

The first starter challenge should produce an “aha” within ten minutes: contradictory evidence forces the player to change or defend a hypothesis, and that choice visibly changes access, stakeholder confidence, and the target race.

## Career and legacy integration

Challenge progress is cross-career but must not undermine career integrity.

Good unlocks:

- new challenge families;
- new draft edges with equal power and different strategy;
- alternate cast templates;
- cosmetic dossier treatments;
- advanced debrief lenses;
- custom challenge builder options;
- titles and archive distinctions.

Avoid:

- permanent accuracy boosts in official scored runs;
- starting cash that makes leaderboard comparisons meaningless;
- hiding basic challenge content behind excessive grind;
- using legacy score as a substitute for challenge performance.

Long-form career consequences may unlock challenge premises (“the recommendation that haunted you”), but challenge runs are separate saves and never mutate the originating career.

## Persistence and migration

### Save requirements

- Challenge progress resides in the normal versioned save envelope.
- Every run stores the challenge definition ID, definition version, challenge fingerprint, rule configurations, selected draft options, and resolved authored copy needed for recovery.
- Save/reload cannot reroll drafts, events, stakeholder cast, score, or epilogue.
- Manual and batch advancement produce equivalent challenge state.
- Interrupted writes recover to the last authoritative journal head.
- Cloud conflicts display run identity and progress; merging two divergent challenge heads is prohibited.
- Ironman/official integrity uses the same journal but restricts manual slots according to declared policy.
- “Continue as career” never mutates `runKind` or the challenge fingerprint; it forks a new career save with a new manifest and `parentChallengeRunId`, then archives the original challenge unchanged.

### Migration policy

1. Invoke the canonical legacy-mode classifier in `README.md`. Only a shipped explicit scenario-to-host mapping can set `runKind: "challenge"`; specialization or an arbitrary constraint object cannot choose the host mode.
2. Convert supported `activeScenarioId` saves into a `legacyScenarioV0` challenge-state adapter under that host mode.
3. Preserve current objective completion markers and exactly-once rewards.
4. Do not pretend unsupported constraint values were historically enforced.
5. Let the player finish a compatible legacy scenario under its original semantics, or archive it without penalty.
6. New Challenge Careers definitions start at V1 and never backfill a score onto old scenarios.
7. Removed or invalid definitions remain viewable in the archive and cannot grant new rewards.

## Initial content target

Do not launch the mode with ten shallow checklists. Minimum Early Access quality target:

- 8 production-complete challenges;
- at least 2 host modes represented;
- at least 4 challenge families;
- 3 difficulty bands with explicit recovery policy;
- 2–5 acts per challenge;
- at least 3 valid strategic solution routes per challenge;
- at least 6 edge and 6 complication definitions in compatible draft pools;
- 5+ recurring cast roles with multiple personality templates;
- 3+ authored brief/debrief variants per challenge family;
- no objective whose main success criterion is report volume.

Full-release target after all career modes ship:

- 16–20 curated challenges;
- 3+ mode-specific challenges per mode;
- 4 cross-mode challenges;
- a deterministic custom challenge builder labeled unranked;
- offline daily/weekly seed rotation generated from a shipped schedule or deterministic date policy;
- robust archive and same-seed comparison.

## Example production challenge

### The Divided Window

- Host mode: First Team Scout.
- Duration: 10 weeks.
- Premise: a relegation-threatened club has one loan slot and one permanent-signing budget.
- Conflict: the manager wants an experienced striker; the sporting director wants a versatile younger forward with resale value.
- Known rules: two roster gaps, net-spend cap, three non-negotiable deadline gates, at least two evidence contexts for a table-pound recommendation.
- Draft edge examples: trusted agent route, analyst loan, or manager confidence.
- Complication examples: rival head start, data-rights outage, or dressing-room resistance.
- Branch: back one stakeholder, broker a hybrid brief, or risk presenting two parallel plans.
- Recovery: if the first target is lost, accept a shorter evaluation window and lower ceiling on efficiency score.
- Epilogue: role contribution, availability, fee/wage value, team fit, and stakeholder memory over the next season.
- Gold requires a credible solution and calibrated process; it does not require the signed player to become a star.

## Delivery plan

### Phase 0 — foundation and truthfulness (L)

- Hide or relabel the current scenario browser anywhere its constraints are not enforced.
- Add a build-time audit that lists every current arbitrary constraint and proves whether a rule module owns it.
- Define ChallengeDefinition V1, runtime schemas, compatibility validation, and migration policy.
- Add challenge fingerprint fields to the run identity design.
- Preserve current scenario authority tests while separating legacy scenarios from new Challenge Careers.

Acceptance:

- No player-facing challenge claims an unenforced rule.
- Invalid definitions cannot start.
- Legacy saves load without invented history or duplicate rewards.

### Phase 1 — vertical slice (XL)

- Implement the `RunManifestV2` challenge identity fields, rule registry, action policy, objective graph, event adapter, pressure, score, and archive.
- Produce one complete First Team rescue challenge with two draft choices per category and at least one recovery branch.
- Build browser, briefing, compact HUD, challenge room, and debrief.
- Integrate deterministic seed/run-code behavior and save migration.

Acceptance:

- The vertical slice can be played start to finish through normal UI.
- At least three strategies can win.
- Same seed plus same decisions yields the same domain outcome.
- Different seeds produce measurable divergence without changing rule semantics.

### Phase 2 — systemic breadth (XL)

- Add discovery race, market constraint, political wager, and expedition families.
- Add mode capability filtering and a Youth/Regional challenge.
- Expand draft, cast, pressure event, and recovery catalogues.
- Add same-seed comparison and compact run archive.

Acceptance:

- Eight production-complete challenges meet the content target.
- Two runs differ through world, cast, target, and event systems—not names alone.
- No dominant draft option exceeds its expected selection/win-rate tuning band without a documented tradeoff.

### Phase 3 — mastery and longevity (L)

- Add expert integrity, official rotating seeds, legacy sprint, and recovery challenges.
- Add custom unranked builder with compatibility validation.
- Add audiovisual variation and debrief comparison lenses.
- Add challenge authoring validation and simulation tooling.

Acceptance:

- Expert challenges are difficult because of interacting constraints, not opaque penalties.
- Custom invalid combinations explain why they fail.
- Official run records are comparable by definition version and integrity.

### Phase 4 — release proof (L)

- Balance through automated cohorts and moderated player studies.
- Complete manual keyboard, NVDA, VoiceOver, controller if supported, and reduced-motion testing.
- Complete packaged Windows/macOS/Linux save, offline, recovery, and cloud-conflict testing.
- Run minimum-hardware profiling and long-session memory checks.
- Complete localization layout and content QA.

Acceptance:

- Starter players understand the contract and first major choice without facilitator help.
- Expert players can explain a loss from the debrief.
- No release-blocking migration, integrity, accessibility, or performance defect remains.

## Implementation work packages

| ID | Problem and player value | Proposed solution and technical approach | Primary files/modules | Dependencies and risks | Effort | Acceptance and required tests | Save migration |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CH-01 | Current scenario copy can promise constraints that do not affect play, destroying trust | Introduce serializable V1 definitions, runtime schemas, rule IDs, build-time catalogue validation, and fail-closed browser eligibility | Existing `src/engine/scenarios/*`; new `src/engine/challenges/schema.ts`, `catalog.ts`, `definitions/` | Depends on mode capabilities; risk of treating legacy closures as V1 content | L | Every displayed rule maps to a registered module; invalid definitions cannot start; content contract tests cover every definition | Adapt existing active scenarios as explicitly labeled V0; do not invent enforcement history |
| CH-02 | A challenge is not part of immutable run identity, so comparisons and compatibility are weak | Upgrade the single manifest to V2 with `gameModeId`, `runKind: "challenge"`, embedded challenge definition/content fingerprints, seed policy, draft IDs, and integrity; keep mutable progress only in sibling `challengeState` | `src/engine/run/runManifest.ts`; new pure helpers in `src/engine/challenges/manifest.ts`; `tests/invariants/runManifest.test.ts` | Must preserve imported-run integrity semantics; fingerprint version changes require care; no parallel manifest may emerge | M | Same host mode and challenge inputs produce the same run ID; any immutable rule/draft change changes fingerprint; repair marks imports correctly; Challenge Careers never becomes a fifth `GameModeId` | Existing saves receive no challenge identity fields unless an active V0 scenario is explicitly adapted |
| CH-03 | Arbitrary constraints are neither enforceable nor composable | Build registered rule modules plus an engine-authoritative action policy and named weekly hooks | New `src/engine/challenges/rules/`, `actionPolicy.ts`; shared mode action policy | Depends on weekly phase extraction; rules can create impossible combinations | XL | Direct store calls cannot bypass blocked actions; all combinations validate; property tests prove costs/rewards exactly once | V1 only; V0 constraints remain under legacy semantics |
| CH-04 | Flat predicates reward counters and cannot support acts, branches, or recovery | Implement a data-driven objective graph consuming canonical domain events with explicit node states | New `objectiveGraph.ts`, `eventAdapter.ts`; shared decision/consequence ledger | Depends on domain-event contract; graph errors could make a run unwinnable | L | Reachability validator, simulated win/fail paths, exactly-once node transitions, manual/batch equivalence | Convert only completion state that can be proven; otherwise preserve V0 progress view |
| CH-05 | Current difficulty is mostly a label and generic deadline | Add explainable pressures, deadline windows, promises, recovery routes, and capability-aware draft pools | New `pressure.ts`, `draft.ts`, rule configs; stakeholder memory/consequence engines | Balancing risk and UI overload | L | Every pressure delta has a cause; reload cannot reroll draft; complications alter decisions; recovery never duplicates rewards | Initialize only for new V1 runs |
| CH-06 | Report volume can dominate success and lucky outcomes obscure decision quality | Add capped scoring profiles for outcome, process, fit, value, calibration, adaptation, relationships, and efficiency | New `scoring.ts`, `epilogue.ts`; scouting cases, report evaluation, transfer/placement outcomes | Requires universal accountability links and bounded epilogue | XL | Score deterministic; grind cannot raise capped categories; lucky/weak and unlucky/strong processes remain distinguishable | Do not backscore V0 runs; archive them as legacy completions |
| CH-07 | Current weekly scenario logic increases the monolithic action module's coupling | Add one challenge phase after canonical domain events finalize; store actions become thin adapters | `src/stores/actions/weeklyActions.ts`; new challenge processor; mode weekly pipeline | Depends on shared weekly refactor; incorrect ordering risks stale events | L | One-week and batch paths match; fast-forward stops at required decisions; no screen-dependent processing | Migrated state enters the same phase only after successful V1 parsing |
| CH-08 | The selector does not communicate compatibility, seed, draft, hard failures, or prior performance | Replace it with challenge browser, signed briefing, draft, compact HUD, challenge room, and causal debrief | `src/components/game/ScenarioSelect.tsx`; new `components/game/challenges/*`; navigation registry | Large information-design and accessibility surface | XL | Complete keyboard/screen-reader E2E; player can state rules before start; debrief explains failure; responsive layouts pass | V0 runs open a compatibility progress/archive surface, not the V1 draft |
| CH-09 | Scenario senders and events lack a small persistent cast and conflicting obligations | Generate a named cast with goals, red lines, relationships, promises, memory, movement, and authored variation | Stakeholder memory, contacts, rivals, narrative events; new challenge cast templates | Content volume and repetition risk | L | Every launch challenge has required cast roles; at least one conflict and one callback; choice branches mutate future access/reaction | Persist resolved cast identities and promise state for V1 runs |
| CH-10 | Legacy records only completed IDs and can create power creep | Add compact versioned run archives, medals, best scores, compare/retry, and sidegrade-only unlocks | `src/engine/career/legacy.ts`; new `archive.ts`; `HallOfFame.tsx`; Challenge UI | Cross-career local-storage size and official-run fairness | L | Duplicate completion is idempotent; archives are bounded; official mechanics ignore power perks; comparisons match definition/integrity | Migrate V0 completed IDs into unscored legacy archive entries |
| CH-11 | New content can silently reference missing rules, assets, nodes, or impossible setups | Add authoring CLI/CI validation and deterministic solvability cohorts | New scripts under `scripts/`; challenge content tests and Vitest config | Simulation can prove sampled paths, not all possible worlds | M | CI blocks broken references/unreachable nodes; each challenge has sampled wins/fails; no known no-solution seed ships | None |
| CH-12 | The mode could be mechanically complete but fail real players/platforms | Run usability, accessibility, minimum-hardware, packaged-runtime, save/recovery, localization, and asset-rights certification | `docs/release/*`, E2E suites, packaging scripts, asset inventory | Requires hardware, human participants, and all target OSes | L | All release-proof gates are signed with evidence; automated emulation is labeled accurately | Exercise fresh, V0-adapted, V1 mid-run, terminal, and cloud-conflict saves |

## Automated test strategy

### Unit tests

- definition schema and compatibility;
- rule configuration parsing;
- action policy decisions;
- graph activation and recovery transitions;
- pressure deltas and expiry;
- score category caps and medal boundaries;
- run fingerprinting and run-code parsing;
- legacy scenario adapter;
- archive compaction.

### Property and invariant tests

- A challenge terminal outcome resolves only once.
- An objective node resolves only once per activation.
- A blocked action cannot mutate game state through a direct store call.
- Unknown rule IDs fail closed.
- Optional objectives never become required through migration.
- Recovery cannot coexist with terminal success unless the graph explicitly permits recovered success.
- Same manifest plus same decisions produces identical challenge state.
- Save/reload does not consume RNG or change score.
- Manual and batch week advancement are equivalent.
- Score cannot increase by repeating a capped action with no new evidence.
- No medal can be granted to an invalid or abandoned run.
- Cross-career unlocks cannot change official scored mechanics.
- Event ledgers remain bounded after archive compaction.

### Content contract tests

- Every definition references existing modes, capabilities, rules, scoring profiles, cast templates, and authored assets.
- Every required node is reachable from the start graph.
- Every nonterminal breach has a reachable recovery or explicit terminal failure.
- Every challenge has at least one simulated winning path and one valid failure path.
- Every player-facing constraint maps to an enforced rule.
- Every challenge can start across its declared country/world configuration.

### Integration and E2E

- browser → briefing → draft → start → act transition → recovery → debrief → archive;
- seed entry and share-code replay;
- offline start and completion;
- cloud conflict between divergent heads;
- interrupted save during act transition;
- screen-reader path through briefing and debrief;
- mobile/responsive view where supported;
- reduced-motion act transitions;
- legacy active scenario load and safe archive.

### Simulation and balancing

- multi-seed completion-rate cohorts by challenge/difficulty;
- strategy diversity and draft pick/win rates;
- score distributions and category correlations;
- event repetition and cast diversity;
- terminal failure reasons;
- average real and in-game completion time;
- no-solution seed detection;
- 20-seed × 30-season host-world soak where applicable;
- memory/save-size profiling for repeated archived runs.

## Telemetry and research questions

Telemetry must be optional, privacy-safe, and aggregate-oriented.

Track:

- challenge selection and abandonment stage;
- first major decision time;
- objective branch distribution;
- recovery acceptance;
- draft selection;
- score category distribution;
- repeated attempts and same-seed retries;
- debrief drill-down usage;
- confusion exits from rules or objective screens.

Moderated research should answer:

- Can players state the professional brief and hard failure before starting?
- Do draft choices feel like strategy rather than difficulty selection?
- Can players explain why an option became unavailable?
- Does failure create a retry hypothesis?
- Does the debrief distinguish bad luck from poor judgment?
- Do repeated runs feel structurally different?

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Challenge logic duplicates host-mode engines | Divergence and integrity bugs | Consume canonical domain events and action policies; never reimplement scouting outcomes |
| Too much authored scripting | One-solution puzzles and weak replayability | Author pressure and branches; generate targets and consequences from the world |
| Randomness feels unfair | Loss of trust | Disclose rules, isolate named RNG, offer recovery, explain causal events |
| Scores encourage grinding | Core fantasy collapses into optimization | Category caps, evidence novelty, efficiency costs, process/outcome separation |
| Legacy perks dominate | Comparisons become meaningless | Sidegrade/content unlocks only in official scored runs |
| Rule combinations produce unwinnable seeds | Broken runs | Capability validation plus automated solvability cohorts and seed quarantine |
| Definition updates corrupt active runs | Save loss or changed rules | Version and fingerprint definitions; preserve resolved mechanics |
| Weekly module becomes more coupled | Slower delivery and regressions | Dedicated challenge phase and event adapter; no new challenge branches inside the monolith |
| UI becomes quest clutter | Loss of simulation identity | Compact HUD, dedicated challenge room, normal workspaces remain authoritative |
| Challenge mode ships before host modes are credible | Thin reskins | Gate content on production-complete host capabilities |

## Definition of done

Challenge Careers is production-ready only when:

- it contains at least eight fully enforceable challenges across two complete host modes;
- each challenge changes weekly decisions through rules, pressure, branching, and recovery;
- all player-facing constraints are engine-authoritative;
- objective progress is event-sourced, explainable, deterministic, and exactly once;
- scores evaluate professional judgment, fit, value, calibration, and consequences rather than volume;
- the browser, briefing, challenge room, critical scenes, debrief, and archive are complete and accessible;
- repeat runs vary in cast, world, targets, rivals, events, and valid strategies;
- same-seed runs remain reproducible and shareable offline;
- save/reload, migration, manual/batch advancement, cloud conflict, and interrupted-write behavior pass release gates;
- starter onboarding creates a scouting “aha” without repeating the Youth tutorial;
- no unresolved P0/P1 issue can invalidate a run, reward, score, or saved outcome.

## Explicit non-goals

- No match management or tactical control.
- No pay-to-win or permanent numerical meta-progression.
- No mandatory online service or live leaderboard.
- No challenge that is only “submit N reports.”
- No hidden difficulty multipliers that contradict the brief.
- No separate fake football world for challenge outcomes.
- No custom rule scripting exposed until the validated rule registry is mature.
