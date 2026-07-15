# TalentScout game-mode programme

## Purpose

This directory is the implementation plan for the three future TalentScout career modes beyond Youth Scout plus the player-facing Challenge Careers play format.

The goal is not to expose specialization labels over the same weekly engine. Each career mode must become a complete scouting game with its own professional fantasy, evidence, pressures, decisions, progression, failure states, politics, interactivity, stories, and endgame while remaining inside one coherent football world. Challenge Careers must then reshape those complete host modes through a different `RunKind`, not imitate them with checklists.

Mode plans:

- [First Team Scout](./first-team-scout.md)
- [Regional Expert](./regional-expert.md)
- [Data Scout](./data-scout.md)
- [Challenge Careers](./challenge-careers.md)

Youth Scout remains the reference implementation and quality floor. It is not a template that every other mode must copy screen for screen.

Club employment, independent consulting, department leadership, and agency ownership are career paths inside compatible host modes, not additional `GameModeId` values. Their responsibilities and endgames are specified in each mode plan so the architecture does not fragment into overlapping products.

## Product rule

> A new career mode or play format ships only when it changes what the player notices, what the player worries about, what the player does each week, who can block them, how quickly consequences arrive, and what success means.

If a mode merely adds passive bonuses, renamed activities, or specialization-flavored notifications, it is a build-time scaffold—not a playable mode.

## Current repository truth

The source already declares four specializations in `src/engine/core/types.ts` and contains substantial pre-production logic for First Team, Regional, and Data careers. It also contains a scenario browser and engine. These are valuable foundations, but they are not evidence that the modes are complete.

### What exists

- `Specialization` supports `youth`, `firstTeam`, `regional`, and `data`.
- `src/engine/firstTeam/` contains tactical fit, board, directive, negotiation, transfer, loan, and related systems.
- `src/engine/specializations/regionalKnowledge.ts`, `src/engine/world/regionalPresence.ts`, international assignments, travel, offices, contacts, and map systems provide a regional foundation.
- `src/engine/data/` contains queries, profiles, video analysis, predictions, analyst management, and visualization preparation.
- `src/engine/scenarios/` contains ten scenario definitions, objective evaluation, setup, and exactly-once outcome authority.
- `src/engine/run/` provides deterministic run manifests, fingerprints, world traits, named RNG streams, and stable IDs.
- `src/engine/world/worldConditions.ts` provides seeded, persisted seasonal world modifiers.
- shared scouting, observation, reports, consequences, rivals, relationships, finance, career, world history, saves, and migrations are materially developed.

### What does not yet exist

- A central mode definition or capability registry.
- A versioned, discriminated mode-state boundary.
- A mode-owned workspace/action registry.
- A stable domain-event contract between the weekly simulation and modes.
- Complete onboarding, progression, endgame, and release evidence for the non-Youth modes.
- Proof that every specialization perk, activity, upgrade, report field, screen, and consequence changes authoritative outcomes.
- A production-safe way to enforce arbitrary scenario constraints.

### Present architectural risk

Mode behavior is spread across `gameStore.ts`, the very large `weeklyActions.ts`, separate store-action modules, components, finance tables, event weights, contact bonuses, progression rules, and engine folders. Direct checks such as `primarySpecialization === "firstTeam"` are common. Extending this pattern will create four subtly different simulation pipelines and make manual/batch equivalence, save migration, fast-forward, and balancing increasingly fragile.

The first delivery step is therefore a mode platform extraction, not a fourth layer of conditional branches.

## Youth Scout parity bar

Every mode must reach parity in breadth and production confidence, but not mechanical sameness.

### Complete career shape

- First five minutes establish the fantasy and create a meaningful action.
- First hour completes one end-to-end mode-specific case and produces an “aha” moment.
- Minute, weekly, seasonal, and multi-season loops are coherent.
- Early, middle, late, failure/recovery, retirement, and legacy stages feel different.
- Club and independent paths materially alter stakeholders, income, autonomy, and risk.
- Promotion adds responsibility and delegation rather than only larger numbers.
- The mode has a compelling endgame and historical archive.

### Complete scouting practice

- Discovery is specific to the mode's evidence advantage.
- Observations reveal contextual, incomplete, and sometimes contradictory information.
- Repeated work has diminishing returns unless context or method changes.
- The player can form, preserve, test, and revise hypotheses.
- Reports are professional artifacts written for a real audience and brief.
- Conviction creates exposure.
- Accountability tracks fit, price/timing, evidence, risks, calibration, revision, and downstream outcome.

### Complete living world

- The football world evolves without the player.
- Clubs, managers, players, staff, contacts, rivals, and organizations have persistent identities.
- World conditions and events alter real calculations.
- Geography, competition quality, economics, development environment, contracts, injuries, form, and transfers interact with the mode.
- The archive explains important change and preserves multi-season continuity.

### Complete product experience

- Six or fewer coherent primary workspaces with decision-first entry points.
- Fast comparison, filtering, search, drill-down, and historical context.
- Critical actions are interactive rather than reduced to spreadsheet maintenance.
- Desktop and supported mobile/responsive layouts are usable.
- Keyboard, focus, semantics, contrast, reduced motion, NVDA, and VoiceOver are validated.
- Saves, migration, recovery, offline play, cloud conflict, packaged builds, long-run memory, and minimum hardware pass release gates.

### Complete replayability

- World seed changes more than names.
- Each mode supports several viable scouting philosophies.
- Randomness is deterministic, domain-isolated, disclosed where rules require it, and causally explained.
- Events create choices and future state, not temporary flavor.
- Recurring people remember decisions.
- No single weekly routine or progression build dominates all worlds.

## Career-mode and challenge-format differentiation matrix

| Dimension | Youth Scout | First Team Scout | Regional Expert | Data Scout | Challenge Careers |
| --- | --- | --- | --- | --- | --- |
| Core fantasy | Discover potential before certainty | Solve immediate squad needs | Turn local embedded knowledge into advantage | Find signal and challenge models | Solve a scouting crisis under explicit constraints |
| Primary unit of work | Prospect development case | Recruitment brief and target slate | Territory portfolio and opportunity route | Research question, model, and validation case | Authored run contract and branching objective graph |
| Primary evidence | Development projection, live contexts, family/academy intel | Current performance, role/system fit, availability, market terms | Local competition context, cultural/relationship evidence, access | Samples, adjusted metrics, video/data conflict, model error | Host-mode evidence constrained by the challenge |
| Clock | Months and seasons | Transfer windows and selection urgency | Travel seasons, competitions, relationship time | Data cycles, sample growth, market adoption | Fixed acts, hard deadlines, and recovery windows |
| Scarce resources | Attention, access, certainty, prospect opportunity | Window time, budget fit, decision authority, conviction | Presence, travel capacity, legitimacy, local trust | Data access, analyst time, model confidence, validation slots | Time, pressure capacity, draft tradeoffs, host-mode resources |
| Main uncertainty | Future development | Immediate adaptation and fit | Whether local context transfers elsewhere | Whether a signal is real, portable, and actionable | Which valid solution survives the run's world and pressure |
| Signature conflict | Patience versus losing the prospect | Manager versus director; fit versus price; speed versus certainty | Local obligations versus employer needs; depth versus coverage | Model versus eye; novelty versus reliability; access versus bias | Goal versus constraint; safe process versus optional risk |
| Feedback horizon | Slow, multi-season | Fast immediate feedback plus medium-term value | Network and territory compounding over seasons | Model backtests plus transfer/development outcomes | Immediate act feedback plus bounded epilogue |
| Main stakeholders | Families, academies, coaches, agents, clubs | Manager, sporting director, board, agents, coaches, dressing room | Fixers, organizers, local clubs, federations, journalists, families | Analysts, data vendors, skeptical scouts, managers, executives | Small recurring cast selected by premise |
| Rival expression | Poach access and early claims | Compete for targets and influence decision-makers | Contest routes, contacts, offices, and local legitimacy | Copy models, contest anomalies, manipulate narratives | Head starts, rule-aware pressure, and branching interference |
| Career apex | Elite youth recruitment leader/agency | Director of recruitment or elite consultant | Global network chief or territorial intelligence firm | Head of recruitment intelligence or analytics consultancy | Mastery archive, authored rescue legend, challenge designer |
| Failure texture | Missed potential, broken trust, failed placements | Bad fit, wasted fee/wage, window failure, political dismissal | Lost legitimacy, overextended network, inaccessible market | False positives, biased model, vendor failure, organizational rejection | Contract breach, recovery, scored failure, retry hypothesis |

## Shared mode platform

### 1. Mode definition registry

Create `src/engine/modes/` with one data-oriented registry entry per career mode.

```ts
type GameModeId =
  | "youth-scout"
  | "first-team-scout"
  | "regional-expert"
  | "data-scout";

type RunKind = "career" | "challenge";

interface ModeDefinition {
  id: GameModeId;
  modeDefinitionVersion: number;
  status: "available" | "internal" | "planned";
  defaultPrimarySpecialization: Specialization;
  requiredCapabilities: ModeCapabilityId[];
  workspaceIds: ModeWorkspaceId[];
  activityIds: ActivityType[];
  reportSchemaId: string;
  progressionProfileId: string;
  accountabilityProfileId: string;
  onboardingSequenceId: string;
  contentDefinitionIds: string[];
}

interface RunManifestV2 extends Omit<RunManifest, "manifestVersion"> {
  manifestVersion: 2;
  gameModeId: GameModeId;
  runKind: RunKind;
  modeDefinitionVersion: number;
  modeContentFingerprint: string;
  challengeDefinitionId?: string;
  challengeDefinitionVersion?: number;
  challengeFingerprint?: string;
  parentChallengeRunId?: string;
}
```

`GameModeId` is deliberately separate from `Specialization`. The mode is the immutable career ruleset and workspace/progression identity. A specialization is the scout's professional lens and can later be gained secondarily without converting the entire save into another mode. `RunKind` distinguishes a normal career from a Challenge Career that composes one host mode.

In engineering language, the four `GameModeId` values are the career simulation modes and `RunKind` is the play format. “Challenge Careers” may remain the player-facing product name, but it is not a fifth `GameModeId`. It creates a separate save whose immutable manifest identifies both `runKind: "challenge"` and its host `gameModeId`.

`RunManifestV2` is the only run-identity authority. Do not add parallel `runIdentity`, `ModeRunIdentity`, or mode-owned manifest objects. Existing seed, rules/content, origin, doctrine, integrity, country, and fingerprint fields remain part of the manifest even where this abbreviated interface does not repeat them. `parentChallengeRunId` is provenance for a normal career forked from a completed challenge: it is valid only when `runKind === "career"`, must reference an immutable archived challenge, and never changes mode or challenge content fingerprints. It is included in the save journal/checksum and archive metadata so lineage cannot be silently rewritten.

The registry is authoritative for:

- new-game availability;
- workspace navigation;
- allowed activities;
- mode capabilities;
- report/accountability policy;
- progression policy;
- tutorial sequence;
- content fingerprint inputs;
- save compatibility;
- challenge compatibility.

React components must not infer mode completeness from the union type.

### 2. Capability model

Use capabilities for composable behavior instead of scattering specialization checks.

Candidate capability IDs:

- `scouting.development-projection`
- `scouting.first-team-fit`
- `scouting.territory-intelligence`
- `scouting.statistical-modeling`
- `world.transfer-window-briefs`
- `world.regional-presence`
- `world.data-coverage`
- `organization.club-politics`
- `organization.local-network`
- `organization.analytics-team`
- `report.placement`
- `report.recruitment-brief`
- `report.territory-dossier`
- `report.model-validation`
- `career.department-leadership`

Capability checks belong in a pure service used by engine, store, UI, scenario validation, and tests. They are not only feature flags. A capability defines a contract and its required state, actions, and processing hooks.

### 3. Discriminated mode state

Do not keep adding unrelated optional fields to the root `GameState`.

```ts
type ModeState =
  | { gameModeId: "youth-scout"; modeStateSchemaVersion: number; state: YouthModeState }
  | { gameModeId: "first-team-scout"; modeStateSchemaVersion: number; state: FirstTeamModeStateV1 }
  | { gameModeId: "regional-expert"; modeStateSchemaVersion: number; state: RegionalModeState }
  | { gameModeId: "data-scout"; modeStateSchemaVersion: number; state: DataScoutState };

type ModeAwareGameState = Omit<GameState, "runManifest"> & {
  runManifest: RunManifestV2;
  modeState: ModeState;
  challengeState?: ChallengeRunStateV1;
};
```

Shared world state stays shared. Mode state contains only the player's practice: active briefs/cases, mode resources, unique progression responsibilities, player-authored artifacts, references to shared entities, and exactly-once markers. Clubs, staff careers, world markets, rival organizations, people, locations, player careers, transfers, and contracts remain shared truth even when one mode contributes richer views of them.

`modeDefinitionVersion`, `modeStateSchemaVersion`, `modeContentFingerprint`, and `manifestVersion` have different jobs and must never be collapsed into one generic `version` field. `challengeState` is a sibling composition and is present only when `runManifest.runKind === "challenge"`.

Migration must initially derive the relevant mode state from current fields without deleting them. Remove duplicated legacy fields only after at least one save-version compatibility window and golden migration coverage.

### 4. Canonical domain events

Modes and Challenge Careers should consume finalized domain events instead of re-reading mutable global counters.

Examples:

- `ObservationCompleted`
- `EvidenceAdded`
- `HypothesisRevised`
- `ReportSubmitted`
- `RecommendationPresented`
- `ClubDecisionMade`
- `TransferResolved`
- `LoanResolved`
- `PlayerDevelopmentTurned`
- `RelationshipMemoryRecorded`
- `TravelCompleted`
- `PresenceChanged`
- `ModelRunCompleted`
- `PredictionResolved`
- `CareerRoleChanged`

Event IDs are deterministic and consumed exactly once. Events are compacted into aggregate/history records according to retention policy after all subscribers have processed them.

### 5. Weekly processing phases

Refactor mode processing out of `weeklyActions.ts` into explicit phases:

1. validate calendar and action policy;
2. reserve costs and travel capacity;
3. resolve scheduled actions;
4. finalize evidence and reports;
5. advance independent world systems;
6. resolve recruitment, relationships, rivals, finance, and consequences;
7. process the active mode from canonical events;
8. process an optional challenge layer;
9. derive notifications and required choices;
10. assert invariants, compact history, and persist.

Manual one-week advancement and batched advancement call the same pipeline. Fast-forward pauses at explicit player-required decisions unless a recorded delegation policy applies.

### 6. Action policy and decision authority

Every action must be validated in the engine, not only hidden in the UI.

The policy result should state:

- allowed/blocked;
- mode capability and career-tier requirement;
- cost and reservation;
- required location/presence/access;
- affected brief/case;
- known risk and opportunity cost;
- whether a critical outcome can be delegated;
- player-facing reason.

This unifies current eligibility rules and gives Challenge Careers a safe constraint surface.

### 7. Case and accountability framework

Reuse the scouting-case causality foundation, but let each mode supply a case profile.

Shared lifecycle:

`lead → question/brief → evidence → hypotheses → recommendation → stakeholder decision → football outcome → retrospective`

Mode-specific case types:

- Youth: prospect development/placement case.
- First Team: recruitment brief with target slate and alternatives.
- Regional: territory opportunity or market-entry dossier.
- Data: research/model prediction and live-validation case.

Every case owns stable links to observations, sources, reports, stakeholders, decisions, transfers/placements, outcomes, and retrospectives. No report can receive outcome credit from an unrelated player event.

### 8. Workspace registry

Retain the six-workspace discipline, but allow mode-specific semantics and labels.

| Stable workspace ID | Shared intent | Youth label | First Team label | Regional label | Data label |
| --- | --- | --- | --- | --- | --- |
| `desk` | Incoming decisions | Desk | Desk | Desk | Desk |
| `planner` | Time/resource planning | Planner | Planner | Planner | Planner |
| `core` | Mode's working set | Prospects | Targets | Prospects | Lab |
| `artifacts` | Professional artifacts | Reports | Reports | Reports | Reports |
| `world` | Living football context | World | World | World | World |
| `career` | Progression, organization, and history | Career | Career | Career | Career |

Stable IDs drive routing, persistence, shortcuts, analytics, and tests. Player-facing labels can change after usability testing. The detailed mode plan is authoritative for each workspace's contents: Regional's Prospects workspace is its pipeline and its World workspace is the territory command map; Data's Lab combines cohorts, signals, models, and validation. The invariant is that every workspace has a dominant decision and links directly to the relevant evidence and consequences.

Routes and navigation should come from the active `ModeDefinition`, not component-level conditionals. Unsupported screens remain unreachable and are not bundled as if playable.

### 9. Shared systems versus mode ownership

Shared systems own objective football truth and platform integrity:

- players, clubs, leagues, fixtures, transfers, contracts, loans, injuries, form, development, retirements;
- calendar and canonical advancement;
- world conditions and seeded identity;
- observations, evidence provenance, uncertainty, and report versioning;
- contacts, stakeholder memory, rivals, narrative consequences;
- club recruitment identities, staff careers, regional market conditions, authoritative rival reach, and canonical scout location/travel state;
- finance ledger and employment contracts;
- saves, migrations, journal/recovery, cloud conflict, archive retention;
- accessibility primitives and shell;
- analytics/telemetry policy.

Mode domains own player practice:

- mode-specific questions and cases;
- evidence interpretation;
- unique activities and interactions;
- report schema and evaluation weights;
- progression responsibilities;
- stakeholders and political pressures;
- workspace composition;
- mode-specific content/event eligibility;
- failure/recovery and endgame.

The host world never asks a mode to calculate the underlying truth differently. A Data model and a Regional contact may interpret the same player differently, but the player's actual career remains one world record.

## Shared information design principles

### Decision first

Every primary screen must answer:

- What needs my decision?
- Why now?
- What do I know and how reliable is it?
- What do I give up by acting?
- What happens if I wait or delegate?
- Where will I see the consequence later?

Dashboards aggregate context only when they lead to an action, comparison, or explanation.

### Evidence provenance

Every material claim should retain:

- source;
- method/context;
- game date;
- sample size or exposure;
- relevant competition/role;
- confidence and disagreement;
- any known bias;
- which hypothesis or report it affected.

The UI never exposes hidden true attributes. Retrospectives explain categories and causal factors without turning the simulation into an answer key.

### Comparison as a core interaction

All modes need reusable comparison infrastructure:

- two to five entities side by side;
- selectable evidence date (“what we knew then” versus current knowledge);
- role, club, competition, age, cost, and confidence normalization;
- multi-season sparklines and timeline drill-down;
- saved comparison sets attached to a case;
- missing/incomparable data called out explicitly;
- keyboard-operable tables and nonvisual summaries.

### Historical causality

Entity pages link to a unified timeline for:

- observations and evidence;
- hypotheses and revisions;
- reports and audiences;
- promises and stakeholder reactions;
- club decisions and negotiations;
- transfers, loans, development, injuries, form, and awards;
- recommendation reviews;
- career consequences.

The archive must answer why the player remembers an entity, not only list events.

## Shared career framework

Career tiers remain common scaffolding, but responsibilities are mode-owned.

### Early career

- The player performs most work personally.
- Access and information are narrow.
- Financial pressure and employment insecurity matter.
- Mistakes are survivable, but recovery requires visible work.
- The core practice is taught through a complete case, not disconnected tutorials.

### Mid career

- Several simultaneous cases create prioritization pressure.
- Stakeholders conflict and remember commitments.
- The player chooses a doctrine and a network/team shape.
- Club and independent paths diverge.
- Delegation becomes useful but introduces attribution and quality risk.

### Late career

- The player shapes a department, regional network, consultancy, or agency.
- Direct observation remains valuable but no longer scales to all work.
- Hiring, mentoring, quality control, politics, succession, and institutional identity matter.
- Failure can mean demotion, lost mandate, client churn, or restructuring—not only game over.
- Recovery routes include lower-pressure roles, specialist consulting, rebuilding trust, and launching an independent practice.

### Endgame

Each mode needs at least three valid apex fantasies and one intentional retirement path. The career archive evaluates professional identity, best and worst calls, bias patterns, people developed, organizations influenced, financial record, and durable player/world consequences.

## Shared relationships and politics

Recurring identities must include managers, sporting directors, executives, scouts, analysts, agents, coaches, players, families, journalists, organizers, academy staff, employees, and rivals where relevant.

People need:

- goals, preferences, risk tolerance, and red lines;
- memory of specific events rather than generic trust deltas;
- relationships with each other;
- access, information, and obligations they can exchange;
- promises with deadlines and breach consequences;
- career movement between organizations;
- authored voice and response variation;
- capacity to reconcile, retaliate, leave, or return.

A relationship choice is meaningful when helping one person can close a route with another, or when an old act creates a later opportunity.

## Shared randomness and replayability

### Seeded identity

Extend the current `RunManifest` rather than introducing ad hoc random state. The manifest fingerprints mode definition version, content catalogue, countries, world traits, mutators, starting identity, doctrine, legacy sidegrades, integrity, and optional challenge identity.

### Named RNG ownership

Every domain owns named streams. Adding a copy variant must not change transfer outcomes. Reloading or opening a UI must consume no gameplay RNG. Stable entity IDs and season/week scopes make event reproduction diagnosable.

### Divergence requirements

Two seeds should diverge in:

- club strategies and briefs;
- regional conditions and opportunity geography;
- data coverage and competition comparability;
- stakeholder cast and conflicts;
- rivals and organizational behavior;
- player development and career opportunities;
- event chains and relationship callbacks;
- economic and transfer conditions;
- viable scouting doctrines.

Names and cosmetic copy do not count as divergence.

### Event standard

Every special event requires:

- eligibility based on current state;
- two or more materially distinct responses, including wait/delegate when valid;
- disclosed known costs and uncertainty;
- deterministic resolution;
- state mutation and downstream callback;
- cooldown and repetition budget;
- accessibility and audiovisual treatment;
- tests proving choices diverge.

## Persistence, compatibility, and migration

### Schema strategy

- Add `modeState` behind a save-version migration.
- Upgrade the existing run manifest to `RunManifestV2`; do not introduce a parallel run identity.
- Store `modeDefinitionVersion` and `modeContentFingerprint` in immutable run identity.
- Parse saved mode state through a mode-specific schema and migrator.
- Preserve unknown future fields only where safe; fail closed on unknown rules that affect authority.
- Keep one canonical migration entry point for local, cloud, recovery, import, and test fixtures.
- Never infer historical outcomes that were not recorded.

### Existing saves

The migration order should be:

1. migrate the shared save envelope and world;
2. reconcile canonical identifiers and scenario authority;
3. repair/validate run manifest and mark imported integrity where necessary;
4. derive the correct mode-state version from legacy fields;
5. reconcile mode references against existing world entities;
6. migrate optional challenge state;
7. assert finance, calendar, contract, reference, and exactly-once invariants;
8. compact bounded history only after successful reconciliation.

Youth saves must remain mechanically neutral. Never backfill benefits, penalties, evidence, or stakeholder history merely because a new mode field exists.

#### Canonical legacy-mode classifier

Every local, cloud, import, conflict, journal-recovery, and packaged load path calls one pure classifier before constructing `modeState`.

| Priority | Legacy evidence | Classification rule |
| --- | --- | --- |
| 1 | Valid `RunManifestV2` | Trust its fingerprinted `gameModeId` and `runKind`; reject or repair through normal manifest integrity rules |
| 2 | Known Youth Early Access build/rules provenance such as a shipped `youth-ea.*` creation rules version | Classify as `youth-scout` / `career` regardless of secondary or malformed specialization fields |
| 3 | Valid shipped legacy scenario with an explicit compatibility mapping | Use the mapping's host `gameModeId`, set `runKind: "challenge"`, and adapt only mechanics proven to have existed; unknown scenarios archive safely |
| 4 | Known pre-EA/full-game build provenance plus a complete, internally consistent mode-specific state signature | Classify through a versioned signature table; mode-specific fields must be sufficient and reference-valid |
| 5 | `primarySpecialization` alone, partial/contradictory signatures, or unknown provenance | Do not infer a mode. Preserve the original save, open a one-time compatibility choice or read-only recovery flow, mark any accepted conversion `legacy-import`, and record the decision |

Required tests include one golden fixture for every supported legacy shape, contradictory signatures, specialization-only saves, each persistence provider, idempotent reload, and a proof that all load paths produce deep-equivalent normalized state. Mode-specific plans may define how their records convert after classification; they may not redefine classification policy.

### Cross-mode careers

Initial release recommendation: a career has one primary mode for its full run. Secondary specializations provide bounded capabilities, not a mid-save conversion into another complete mode.

Later career transitions may be added only with an explicit transition engine that:

- closes or transfers active cases;
- maps employment and responsibilities;
- initializes destination mode state without free rewards;
- preserves history and accountability;
- explains lost and retained capabilities;
- creates migration and rollback tests.

## Testing programme

### Unit tests

- mode registry and capability contracts;
- action eligibility and costs;
- case state machines;
- evidence/confidence formulas;
- report evaluation;
- progression, employment, finance, and recovery rules;
- mode-state migration;
- selectors and historical comparisons.

### Invariant/property tests

- A mode case has one authoritative lifecycle.
- A report/outcome can credit only linked cases.
- Rewards and costs resolve exactly once.
- No blocked action mutates state.
- No hidden truth appears in player-facing state.
- Manual and batch advancement are equivalent.
- Save/reload does not change outcomes or consume RNG.
- No incompatible contract, transfer, loan, employment, travel, or assignment state can coexist.
- Every ledger movement has a source.
- Mode histories stay within retention policy.
- Independent world simulation is identical regardless of active screen.

### Content contract tests

- every activity belongs to at least one available mode capability;
- every screen action maps to a store action and engine mutation;
- every perk/upgrade changes an authoritative calculation or is hidden;
- every report field contributes to audience decision or retrospective;
- every player-facing outcome links to causal history;
- every mode event has a stateful callback and repetition policy;
- every mode can generate valid content across supported countries and career tiers.

### E2E journeys per mode

- first five minutes and first complete case;
- onboarding suppression for experienced players;
- early club and independent careers;
- report submission and stakeholder decision;
- consequence and retrospective;
- promotion, delegation, failure, recovery, late career, retirement;
- save/load, offline, interrupted write, cloud conflict;
- keyboard, screen reader, reduced motion, responsive layout;
- manual and batch season play;
- ten-season and thirty-season controlled saves.

### Simulation gates

- exact multi-seed long-run soak;
- nonempty and age-valid player pools;
- club/market/world coherence;
- career viability and recovery-rate bands;
- economy and organization growth bounds;
- event and stakeholder diversity;
- strategy/build win-rate diversity;
- save size, load time, memory, and archive compaction;
- deterministic replay diagnostics from run fingerprint and decision log.

### Release evidence

Automated emulation is supporting evidence only. Each mode needs:

- moderated first-hour usability study;
- manual NVDA and VoiceOver testing;
- physical minimum-spec hardware profiling;
- packaged Windows, macOS, and Linux installation/offline/save/recovery/conflict testing;
- asset provenance and commercial-rights sign-off for added media;
- localization and text-expansion review if localized;
- clean commit/tag/package manifest and reproducible release build.

## Recommended delivery order

### Stage 0 — platform extraction and Youth regression protection

Effort: XL.

Deliver:

- mode registry and capability service;
- discriminated mode state and migration scaffolding;
- canonical mode event adapter;
- workspace/action policy registry;
- weekly phase extraction from the monolithic action flow;
- shared case/accountability interfaces;
- content contract tests;
- Youth adapter with no intended balance change.

Why first: all future modes otherwise add more coupling and make save/simulation proof harder.

Exit gate: the complete Youth test ladder and rendered journeys pass; a migrated Youth save is mechanically equivalent; the mode platform can load one internal vertical-slice mode without hard-coded navigation.

### Stage 1 — First Team Scout

Effort: XL.

Why next:

- it reuses the largest existing non-Youth engine surface;
- it forces universal recommendation accountability, real club briefs, transfer/loan causality, and stakeholder politics;
- it exposes whether the shared world can support faster, financially consequential feedback.

Exit gate: all criteria in `first-team-scout.md` are met; two-window and ten-season careers remain coherent.

### Stage 2 — Regional Expert

Effort: XL.

Why next:

- it turns map, travel, offices, local staff, contacts, assignments, and knowledge into a strategic spatial game;
- it improves the shared world for every other mode;
- it supplies strong expedition and discovery-race foundations for Challenge Careers.

Exit gate: all criteria in `regional-expert.md` are met; geography materially changes opportunity, evidence, cost, access, and rival behavior.

### Stage 3 — Data Scout

Effort: XL.

Why after regional/first-team:

- model value depends on credible competition, role, transfer, and regional contexts;
- it needs a robust comparison layer and accountable downstream recruitment outcomes;
- it should challenge and complement human scouting, not replace it with a sortable database.

Exit gate: all criteria in `data-scout.md` are met; model choices, data coverage, samples, validation, and organizational persuasion create distinct careers.

### Stage 4 — Challenge Careers

Effort: XL.

Why last among the modes:

- challenges compose host-mode capabilities and cannot create depth the host modes do not have;
- the existing scenario feature must be replaced with enforceable rules and branching objectives;
- two or more complete host modes are necessary for real breadth.

Challenge platform contracts, validators, and the first internal vertical slice may begin once Stage 0 APIs and the First Team/Regional capability boundaries stabilize. The first public challenge pack still requires at least two production-complete host modes. Data-hosted challenges wait until Data Scout is feature complete, and the full cross-mode challenge portfolio remains the final programme stage.

Exit gate: all criteria in `challenge-careers.md` are met; at least eight complete challenges span two host modes before public release.

## Parallel workstreams

Some work should progress alongside mode implementation:

- shared comparison and timeline UI;
- stakeholder identity/memory and relationship conflicts;
- club identities and explainable world history;
- career failure/recovery and late-career leadership;
- special-event authoring tools and audiovisual variants;
- long-save retention and archive compaction;
- performance profiling and bundle boundaries;
- accessibility and packaged-platform evidence;
- deterministic content validators and simulation harnesses.

These are platform workstreams with mode-specific acceptance tests, not reasons to ship a shallow mode early.

## Effort model

The labels below are programme-level planning sizes used by this index and by any mode document that does not declare a local convention. A mode document may use a finer work-package scale when it states that convention at the top; compare modes by their overall calendar/team estimate and dependency chain, not by summing unlike row labels.

- S: up to one focused engineer-week, narrow and low-coupling.
- M: two to four engineer-weeks, one bounded system plus tests/UI.
- L: one to two engineer-months or several connected systems.
- XL: multi-month programme spanning engine, UI, content, migration, balancing, and release proof.

Individual plan estimates assume the shared platform is already delivered. Treating the three career-mode expansions and Challenge Careers as one programme is multiple XL releases, not one feature tranche.

## Cross-mode definition of done

A game mode is release-ready only when all of the following are true:

1. Its first five minutes establish its unique fantasy and first consequential choice.
2. Its first hour completes a mode-specific end-to-end case with visible downstream effect.
3. Its weekly loop produces hard, recurring tradeoffs that no other mode resolves in the same way.
4. Its reports and recommendations are evaluated by the correct professional brief.
5. Its unique systems mutate authoritative state and future outcomes.
6. Its stakeholders remember decisions and create conflicting obligations.
7. Early, middle, late, failure/recovery, and retirement play differ materially.
8. Different seeds and doctrines produce strategically distinct careers.
9. Every primary screen creates a decision, comparison, action, or causal explanation.
10. No misleading scaffold, inert perk, dead button, or unenforced promise is player-facing.
11. Manual/batch advancement, save/reload, migration, recovery, cloud conflict, season rollover, and long-run stability pass.
12. Unit, invariant, content-contract, E2E, soak, accessibility, performance, and packaged-runtime gates pass.
13. The mode reaches the Youth quality floor without becoming a reskin of Youth Scout.

## Programme acceptance criteria

The complete game-mode programme is successful when:

- a player can identify a run's mode from the decisions and evidence without seeing its label;
- the same world event creates different, credible problems for each mode;
- all modes share one coherent football truth and historical archive;
- adding a mode or challenge does not require new conditionals throughout the store and UI;
- every mode can support ten-plus seasons without collapsing into automation or spreadsheet maintenance;
- the player can build a distinct professional identity and explain the consequences of their judgment;
- the four implementation documents remain executable backlogs with source locations, dependencies, tests, migrations, risks, and measurable release gates.
