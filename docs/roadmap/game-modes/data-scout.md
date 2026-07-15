# Data Scout Game Mode

## Implementation plan and product specification

**Status:** Planned full game mode. The repository contains a legacy `data` specialization and several partial analytics systems, but it does not yet contain a coherent, release-ready Data Scout career.

**Mode promise:** Find real football signal in incomplete, delayed, biased, and sometimes contradictory data; turn that signal into a defensible recruitment opinion; persuade football people to act before the market catches up; and remain accountable when the recommendation succeeds or fails.

**Target quality:** The same systemic depth, consequence, career continuity, and first-hour clarity as Youth Scout, with a different verb set and a different source of uncertainty. Data Scout is not Youth Scout with charts and it is not a spreadsheet sandbox. It is a football judgment game about building evidence systems, spotting exceptions, translating analysis into football language, and knowing when a model is wrong.

---

## 1. Executive decision

Data Scout should become a separate game mode, not remain a specialization modifier inside the Youth Scout campaign.

The existing implementation is useful scaffolding, but its apparent breadth overstates its actual gameplay depth:

- Seven data-themed calendar activities exist, but most resolve through the same three generic choices and random profile or anomaly mutations.
- Statistical profiles exist, but their inputs are generated from hidden player truth rather than a player-visible match-data supply chain.
- Predictions exist, but they are frequently created automatically, resolved from current-state proxies or fresh randomness, and scored only by hit rate.
- Analysts exist as a type and passive report generator, but there is no complete hire, assign, develop, review, or dismiss loop.
- Infrastructure subscriptions charge money, but the advertised data-quality bonus is not used by the analysis calculations.
- The analytics screen renders useful summaries, but it is intentionally hidden in the current Youth Early Access release and primarily displays information rather than creating decisions.
- Model building, backtesting, competition adjustment, sample management, and calibration are described in copy but do not exist as persistent simulation systems.

The correct implementation is a mode-specific vertical slice built on the shared football world, observation evidence, report accountability, relationship memory, career, finance, and save foundations. The unique domain layer should introduce observable data feeds, provider economics, model versions, experiments, anomalies, uncertainty, live verification, stakeholder translation, and forecast accountability.

### Product thesis

The mode becomes compelling when the player repeatedly faces this dilemma:

> The model has found something the market has not. The sample is imperfect. The football context may invalidate the signal. A rival is looking at the same player. Do I spend scarce time validating the lead, change the model, lower my confidence, or stake my reputation now?

Every major system must sharpen that dilemma.

### Non-goals

Data Scout must not become:

- A real-world coding IDE or a requirement to understand statistics terminology.
- A sequence of passive dashboards in which the optimal action is to accept the highest number.
- A hidden-ability detector dressed up as analytics.
- A football-manager tactics mode with the scout role pushed to the side.
- A model in which better equipment changes history or turns an incorrect forecast into a correct one.
- A second independent football simulation competing with the shared TalentScout world engine.

---

## 2. Verified current state

This section distinguishes implemented behavior from screen copy, type scaffolding, and future intent.

### 2.1 Product and mode architecture

- `src/data/productRoadmap.ts:139-149` describes Data Scout as a future mode focused on models, samples, uncertainty, competition adjustment, analysts, evidence conflict, and accountable interpretation.
- The current domain identity is only `Specialization = "youth" | "firstTeam" | "regional" | "data"` in `src/engine/core/types.ts:666`. There is no separate `GameMode` discriminant.
- `RunManifest` in `src/engine/core/types.ts:1923-1942` stores a specialization but not a mode. This cannot safely distinguish a future Data Scout run from a Youth run whose scout selected a data specialization.
- `src/stores/gameScreenScope.ts:27-34` marks analytics as a future screen in Youth Early Access and redirects it to Career. The code is compiled, but the mode is not exposed as a current product path.
- `src/components/game/GameLayout.tsx:88-139` contains the broader legacy navigation, while the shipped Youth experience is deliberately organized around six workspaces.
- `src/lib/demo.ts:15-16` still uses `IS_YOUTH_EARLY_ACCESS` as a global product switch. Additional modes should not create a proliferation of mode-specific booleans.

**Classification:** Architecture scaffold; not a playable Data Scout mode.

### 2.2 Data-themed calendar activities

`src/engine/core/calendar.ts` defines:

- Database Query
- Deep Video Analysis
- Stats Briefing
- Data Conference
- Algorithm Calibration
- Market Inefficiency Scan
- Analytics Team Meeting

These activities have slot, fatigue, and XP costs and therefore provide a useful calendar foundation. Their execution lives in the large weekly action module:

- Database Query: `src/stores/actions/weeklyActions.ts:3313-3444`
- Deep Video Analysis: `src/stores/actions/weeklyActions.ts:3446-3545`
- Stats Briefing: `src/stores/actions/weeklyActions.ts:3547-3613`
- Data Conference: `src/stores/actions/weeklyActions.ts:3615-3674`
- Algorithm Calibration: `src/stores/actions/weeklyActions.ts:3676-3747`
- Market Inefficiency: `src/stores/actions/weeklyActions.ts:3749-3814`
- Analytics Team Meeting: `src/stores/actions/weeklyActions.ts:3816-3936`

The database query selects a league for the player and passes empty filters. Algorithm calibration modifies random flags instead of versioning or testing a model. The market inefficiency scan compares market value directly with hidden `currentAbility`, making it a truth leak rather than a credible player-facing process.

`src/engine/core/activityInteractions.ts:46-61` gives all data activities the same three generic post-activity options: Broad Scan, Deep Dive, and Cross-Check. The data-specific effects at `src/engine/core/activityInteractions.ts:473-542` mostly collapse to profile, anomaly, relationship, and report-quality counters.

**Classification:** Functional shell, repetitive and partially connected.

### 2.3 Statistical profiles and query engine

`executeDatabaseQuery` in `src/engine/data/dataActivities.ts:345-420` creates profiles, and `PlayerProfile.tsx:414-554` can render per-90 data, percentiles, trends, anomalies, and source confidence for a data specialist.

However:

- The raw per-90 values are synthesized from hidden attributes in `deriveRawPer90` at `src/engine/data/dataActivities.ts:87-150` rather than being derived from observable fixture and match events.
- The `minCA` query filter at `src/engine/data/dataActivities.ts:379-381` directly reads hidden current ability.
- Query candidates are shuffled, not meaningfully ranked by player-selected criteria.
- The engine has no persistent data source, minutes threshold, sample size, match coverage, missingness, freshness, competition strength, positional role, or provenance model.
- Deep-video percentiles are effectively computed against an undersized peer context and repeated analysis blends toward underlying truth rather than exposing genuinely new evidence.
- Stats briefing anomaly generation uses coarse z-scores and random flags without controlling for sample size, role, league, or multiple comparisons.
- `validateAnomalyFromObservation` at `src/engine/data/dataActivities.ts:677-707` validates a positive or negative flag from a generic average perceived attribute. It does not test the meaning of the metric that created the anomaly.

The world already stores a stronger observable foundation. `PlayerMatchRating` in `src/engine/core/types.ts:509-548` includes fixture participation, minutes, rating, and match statistics. Those event facts should become the source of a player-visible data warehouse before seasonal compaction.

**Classification:** UI and output scaffold ahead of a credible data engine.

### 2.4 Predictions and accountability

`src/engine/data/predictionTracker.ts` provides prediction creation, resolution, suggestions, and a basic accuracy summary.

Verified limitations:

- Predictions may be generated automatically from a strong report in `src/stores/actions/reportActions.ts:417-445`; the player does not define the target, horizon, confidence, evidence, model, or stake.
- Breakout, decline, transfer, top-scorer, and relegation predictions are resolved from current-state proxies rather than immutable event snapshots.
- Injury resolution introduces fresh randomness at the time the prediction is judged.
- Top-scorer and injury suggestions can inspect hidden player attributes.
- Equipment prediction accuracy can convert a false result into a correct one at `src/engine/data/predictionTracker.ts:202-205`. This invalidates accountability.
- `calculatePredictionAccuracy` at `src/engine/data/predictionTracker.ts:241-272` reports only hit rate and streak. It does not account for base rate, probability confidence, calibration, abstention, forecast coverage, or difficulty.

The mature Youth accountability infrastructure is substantially stronger. `src/engine/reports/reportAccountability.ts`, `src/engine/reports/scoutingCases.ts`, and `src/engine/reports/scoutingCaseTimeline.ts` already preserve evidence, revisions, delivery decisions, downstream outcomes, and player-safe historical callbacks. Data Scout should extend those systems rather than create a disconnected prediction ledger.

**Classification:** Functional but integrity-broken and too shallow for release.

### 2.5 Analysts and delegation

The repository currently has two overlapping employee concepts:

1. `DataAnalyst` in `src/engine/core/types.ts:3965-3980`, with a skill, focus, assigned league, salary, tenure, and morale.
2. The more complete `AgencyEmployee` system in `src/engine/core/types.ts:2725-2782`, which already supports analyst roles, skills, assignments, development, and employment state.

`generateAnalystReport` in `src/engine/data/analyticsTeam.ts:152-288` selects players using hidden current/potential ability and produces simple findings. `updateAnalystMorale` exists but has no meaningful use flow. A season-end candidate is generated at `src/stores/actions/weeklyActions.ts:7354-7400`, mentioned in an inbox item, and discarded rather than added to a recruitment pool. No complete hire, assign, contract, develop, performance-review, conflict, or dismissal workflow was found for `DataAnalyst`.

The generic analyst employee path in `src/engine/finance/employeeWork.ts:191-221` currently produces a notification that a quality boost is available without applying a durable data-domain result.

**Classification:** Duplicate scaffold; normal-play team loop is effectively unreachable.

### 2.6 Infrastructure and finances

`src/engine/finance/scoutingInvestment.ts` defines data subscriptions from none through elite, charges recurring costs, and calculates a `dataQualityBonus`. The UI exposes these choices through the infrastructure tab.

The calculated data-quality bonus is not consumed by the profile, anomaly, query, or prediction calculations. The player therefore pays for an advertised capability that does not materially change the core data loop.

`src/engine/finance/specializationIncome.ts` provides generic consulting bonuses and flat income for data specialists, but there are no client briefs, deliverables, renewal decisions, performance clauses, data-license margins, or consulting reputation consequences.

**Classification:** Economy connected to costs; benefits and professional obligations are mostly cosmetic.

### 2.7 Analytics interface

`src/components/game/AnalyticsScreen.tsx` contains:

- Scout performance overview
- Market scatter
- League comparison
- Coverage heat map
- Development trends
- Player radar
- Anomaly spotlight

The screen now uses player-safe presentation helpers for several visualizations in `src/engine/scout/playerFacingIntel.ts`, which is protected by `tests/invariants/playerFacingTruthBoundary.test.ts`. Legacy functions in `src/engine/data/visualizationData.ts` still read hidden ability and attributes, appear to have no active callers beyond barrel exports, and should not be reactivated.

The current analytics page is primarily a display surface. It does not let the player build a cohort, choose a question, configure a model, triage an anomaly, compare model versions, schedule verification, or present a recommendation.

**Classification:** Engine-aware display scaffold; future screen in the current release.

### 2.8 Persistence and automated coverage

Data state fields are initialized in `src/stores/gameStore.ts:1133-1137` and defaulted during persistence in `src/lib/db.ts:1664-1668`. The current save-envelope schema version is 4 in `src/lib/saveEnvelope.ts:21`.

There are no dedicated unit suites for:

- `dataActivities.ts`
- `predictionTracker.ts`
- `analyticsTeam.ts`
- data-provider or model lifecycle
- forecast calibration
- data-specific save migration
- long-save data archive compaction

Generic E2E and invariant tests cover quick-interaction persistence and rendering, but not the truth boundary, causal integrity, model reproducibility, analyst lifecycle, forecast resolution, or manual/batch equivalence of a Data Scout career.

**Classification:** Default-value persistence only; critical behavior is untested.

### 2.9 Current completeness matrix

| System | Current classification | Verified reality | Required disposition |
| --- | --- | --- | --- |
| Mode selection and run identity | Placeholder | `data` is a specialization, not a mode | Add `GameModeId`, `RunKind`, and a versioned mode registry |
| Data activities | Functional but shallow | Seven activities, mostly generic random outcomes | Replace with persistent lab and evidence decisions |
| Query builder | UI fiction | The weekly action passes empty filters | Build an actual cohort/query workflow |
| Observable data supply | Missing | Profiles derive from hidden attributes | Build a player-safe event warehouse and providers |
| Statistical profiles | Partially connected | Profiles persist and render | Rebuild inputs, sample logic, context, and provenance |
| League/role adjustment | Placeholder | Mentioned in prose, absent as a persistent calculation | Implement transparent normalization and uncertainty |
| Model building | Placeholder | No model entity, version, training set, or backtest | Add deterministic model lab |
| Algorithm calibration | Misleading | Random anomaly mutation | Replace with versioned backtests and calibration decisions |
| Predictions | Integrity-broken | Automatic creation, proxy resolution, outcome flipping | Replace with immutable forecasts resolved from facts |
| Anomalies | Functional but shallow | Random/coarse flags, generic validation | Add triage, false-positive risk, expiry, and verification |
| Observation conflict | Partially connected | Generic quick interactions and observation evidence exist | Integrate model claims with live and contact evidence |
| Analysts | Broken/unreachable | No full hire/assignment lifecycle | Consolidate onto canonical employee system |
| Data subscriptions | UI/economy ahead of engine | Costs apply; quality bonus does not | Convert to provider licenses with real coverage effects |
| Analytics UI | Engine/UI scaffold | Rendered but future-scoped, mostly passive | Replace with a decision-first Lab workspace |
| Stakeholder persuasion | Functional but shallow | Data/eye alignment helper exists | Add persistent stakeholder beliefs and presentation choices |
| Report accountability | Engine available elsewhere | Youth case infrastructure is stronger | Generalize it for data/model evidence |
| Career progression | Functional but generic | Titles and income modifiers exist | Add data-specific responsibility, failure, recovery, leadership |
| Rivals and events | Generic scaffold | Analytics-themed names/content exist | Add data-market competition and systemic events |
| Persistence | Partial | Empty collections migrate by default | Add mode-state migrations, immutable artifacts, compaction |
| Tests | Critical gap | Rendering and generic interaction tests only | Add unit, property, integration, E2E, and soak coverage |

---

## 3. Player fantasy and design pillars

### 3.1 Primary fantasy

The player is a football scout whose edge is analytical thinking, not a detached statistician. They collect imperfect football data, build an interpretation, identify a player before consensus forms, verify what the numbers cannot explain, and persuade a specific football decision-maker to act.

### 3.2 Signature verbs

The mode's verbs are:

- Source
- Clean
- Compare
- Model
- Test
- Triage
- Verify
- Interpret
- Present
- Revise
- Defend
- Audit

At least one of these verbs must be present in every scheduled activity and every major screen.

### 3.3 Design pillars

#### Evidence, not omniscience

The player sees observations generated from football events and data providers. They never see hidden ability, potential, true personality, or a hidden definitive rating.

#### Models are opinions with memory

A model is a saved football hypothesis: what matters, for whom, in which competition, over what time window, and at what risk threshold. Versions, assumptions, mistakes, and downstream recommendations remain historically visible.

#### Context can overturn the ranking

League, role, team style, minutes, score state, age, data quality, tactical responsibilities, injuries, and adaptation all affect interpretation. Live observation and trusted contacts can confirm, refine, or refute the model.

#### Translation wins decisions

The highest model score is not automatically the best recommendation. The player must explain fit, price, timing, risk, and uncertainty to a manager, sporting director, owner, coach, or client with their own beliefs and incentives.

#### Speed competes with certainty

More data and verification reduce uncertainty, but time costs money and opportunity. A player may transfer, a rival may publish, a club may fill the role, or the price may rise.

#### Accountability is permanent

Forecasts and recommendations freeze the information, model version, confidence, and decision context used at the time. Results are judged against what the player actually claimed—not only against whether the footballer eventually became good.

#### Failure creates a new story

Bad models, provider failures, public false positives, budget cuts, analyst departures, and job loss create recovery paths. They must not produce a dead career or a simple reload incentive.

---

## 4. Core gameplay loops

## 4.1 Minute-to-minute loop

1. Open a brief, lead, alert, stakeholder request, or model-health warning.
2. Inspect the available sample, coverage, missingness, role context, and evidence conflicts.
3. Choose an action: change a cohort, run a comparison, test a feature family, ask an analyst, schedule live verification, contact a source, or defer.
4. Receive an interpretable outcome: a ranking change, wider uncertainty, new anomaly, contradiction, analyst concern, cost, or time pressure.
5. Record or revise a hypothesis.
6. Decide whether the case is ready to advance, needs another source, should be rejected, or should be presented.

The loop should resolve in 30 to 120 seconds for a small decision and 3 to 8 minutes for an important model or presentation decision.

## 4.2 Weekly loop

At the start of each week, the player selects strategic intents rather than filling a calendar with interchangeable tasks.

Example intents:

- Fulfil the club's urgent left-back brief.
- Protect model reliability after a league drift warning.
- Scan an under-covered region for value.
- Follow three existing anomalies before the transfer window closes.
- Maintain a skeptical manager relationship.
- Renew or replace a data provider.
- Coach an analyst through a weak assignment.
- Develop a speculative model outside the club brief.

The planner converts intents into capacity commitments across:

- Data acquisition and cleaning
- Query and cohort work
- Model experimentation
- Anomaly triage
- Video/live verification
- Contact work
- Report and presentation preparation
- Team review and delegation
- Recovery and professional development

The weekly tradeoffs are:

- Breadth versus depth
- Fast public data versus expensive specialist data
- Model improvement versus immediate case delivery
- Existing leads versus speculative discovery
- Personal review versus delegated work
- Live context versus larger statistical sample
- Club priority versus personal analytical thesis
- Short-term fee versus long-term proprietary advantage
- Transparency versus persuasive simplicity

At week end, the player receives a causal digest: what changed, why it changed, which action produced it, what remains uncertain, and what deadline moved closer.

## 4.3 Seasonal loop

Each season includes:

1. Define or inherit recruitment objectives and budget.
2. Choose provider contracts, league coverage, and data retention priorities.
3. Establish champion models and experimental challengers.
4. Process briefs, discoveries, presentations, and club decisions throughout the season.
5. Track whether model behavior changes as competitions and tactics evolve.
6. Conduct mid-season validation and stakeholder reviews.
7. Audit finished forecasts and recommendation cases.
8. Renew, retire, or rebuild models.
9. Review analysts, subscriptions, consulting clients, and club employment.
10. Preserve a season archive with model cards, best discoveries, costly misses, and unresolved cases.

Season rollover must use actual world events and retained snapshots. It must never recompute past model outputs from a newer dataset.

## 4.4 Multi-season career loop

Over multiple seasons, the player develops:

- A documented analytical doctrine
- Reputation by role, region, competition, player age, forecast type, and risk profile
- A library of model families and historical versions
- Trusted analysts and contacts
- Stakeholder-specific credibility
- Proprietary datasets and coverage advantages
- Rivalries over methods, leagues, and discoveries
- A visible record of false positives, missed stars, revisions, and successful convictions
- Career options with different politics, resources, and risk

The late game changes from personally investigating every lead to choosing research direction, setting standards, allocating scarce analyst and provider capacity, defending the department, and deciding which high-stakes recommendation deserves the player's name.

---

## 5. The first five minutes and first hour

Data Scout needs an immediate discovery story, not a tutorial about menu navigation.

### 5.1 One-time, randomized prologue

The tutorial is tracked per game mode and can be skipped by experienced players. It uses the same learning objectives but selects from several seeded opening cases so a new career does not always begin with the same player, competition, metric, conflict, or outcome.

Possible prologue frames:

- **The misclassified winger:** A provider lists a wide forward as a fullback after a formation change. A role-aware query surfaces value the public ranking misses.
- **The small-sample striker:** A spectacular scoring rate hides very low minutes and unsustainable shot conversion. The player decides whether to reject, verify, or cautiously monitor.
- **The pressing midfielder:** Conventional outputs look ordinary, but possession-adjusted recoveries and video context reveal an unusual defensive role.
- **The relegated creator:** League quality and weak teammates suppress headline numbers, while chance involvement remains strong.
- **The provider disagreement:** Two feeds disagree on minutes and key actions, forcing the player to choose a source or request verification.

### 5.2 Five-minute sequence

1. A client brief arrives with a football need, budget, deadline, and stakeholder preference.
2. The player chooses one of three meaningful cohort definitions, each with an explicit blind spot.
3. A visual comparison surfaces one unexpected lead and one obvious favorite.
4. The player sets a threshold: safe shortlist, balanced, or aggressive discovery.
5. A context warning appears: poor coverage, unusual role, or conflicting source.
6. The player opens a short interactive film/data overlay and makes a football interpretation.
7. They record a hypothesis and choose whether to put the player's name forward.

The aha moment is: **the player found a credible target because they asked a better question, not because the game revealed the highest hidden rating.**

### 5.3 First-hour arc

The first hour should contain:

- One query the player configures
- One model or scoring rule they alter
- One anomaly they reject as noise
- One anomaly they escalate to live verification
- One contact or analyst claim that conflicts with the data
- One structured report with an explicit confidence level and deadline
- One stakeholder presentation choice
- One rival or market-pressure event
- One early downstream callback
- One visible entry in the player's permanent track record

The first outcome must not be guaranteed. The tutorial teaches that a disciplined rejection can be as valuable as a successful recommendation.

### 5.4 Tutorial safeguards

- Never reveal hidden truth to prove that the player made the “correct” tutorial choice.
- Explain sample size, coverage, and calibration in football language first; technical labels are optional tooltips.
- Preserve the prologue as a normal career case rather than deleting tutorial state.
- Let veterans skip the guidance while retaining the randomized opening brief.
- Do not repeat tutorial overlays after the mode-specific completion flag is set.

---

## 6. Unique Data Scout systems

## 6.1 Observable football data warehouse

### Purpose

Create a credible boundary between world truth, public football events, provider observations, and the scout's interpretation.

### Source of facts

The canonical world simulation remains authoritative. The player-facing warehouse is derived only from observable events such as:

- Fixture and participation records
- Minutes and position/role tags
- Match ratings and recorded actions
- Goals, assists, shots, key passes, crosses, dribbles, defensive actions, aerials, saves, and errors
- Injuries that became public
- Transfers, loans, contracts, releases, and registration state
- Team and competition context
- Public age, nationality, height, foot, and position information where appropriate
- Contact or analyst claims, clearly labeled as claims rather than facts

`PlayerMatchRating` in `src/engine/core/types.ts:509-548` is the first usable source, but the event record needs provider-grade metadata and retention before it is consolidated away.

### Data observation model

Each provider observation includes:

```ts
interface MetricObservation {
  id: string;
  providerId: string;
  playerId: string;
  fixtureId: string;
  metricKey: MetricKey;
  observedValue: number | null;
  observedAtWeek: number;
  sourceEventWeek: number;
  coverageConfidence: number;
  roleConfidence: number;
  provenance: "event" | "providerDerived" | "manualTag" | "contactClaim";
  revisionOf?: string;
  missingReason?: "notCovered" | "notRecorded" | "ambiguous" | "delayed";
}
```

World truth is never embedded in this object.

### Requirements

- Facts are append-only; corrections create revisions.
- Queries have an “as of” week to prevent look-ahead leakage.
- Provider observations may be delayed, incomplete, or revised.
- Seasonal compaction creates immutable aggregates but preserves observations cited by a model, forecast, or report.
- Manual and batch week advancement emit equivalent warehouse facts.
- Save/load does not reroll provider error or delayed arrivals.

## 6.2 Data providers and licenses

Replace the abstract subscription ladder with a provider market.

Each provider has:

- Geographic and competition coverage
- Historical depth
- Update delay
- Metric granularity
- Role-tag quality
- Missingness profile
- Known bias or error tendencies
- Reliability history
- Licensing cost
- Contract duration
- Usage limits
- Resale or client-presentation restrictions
- Relationship and renewal terms

Example provider archetypes:

- Low-cost public feed with broad but delayed coverage
- Video-tagging cooperative with strong role context and patchy leagues
- Premium event feed with fast, granular data and restrictive licensing
- Regional specialist with unique lower-league access
- Club internal feed with tactical context but organizational bias
- Community dataset that improves with contributor relationships

The current infrastructure purchase UI can be reused, but `dataQualityBonus` must be replaced by concrete effects. A license changes which observations arrive, when they arrive, which fields are missing, and what the player may legally share.

Provider choices create replayability because coverage, pricing, ownership, and reliability can shift between runs and seasons. Provider organizations and their authoritative coverage, ownership, price offers, reliability events, and outage state belong to the shared world/data market so rivals and clubs encounter the same reality. Data mode state stores only the scout's licenses, relationships, observed service history, fallible intelligence, and artifacts received from those providers.

## 6.3 Query and cohort builder

The query builder is a decision tool, not a free search box.

### Player choices

- Recruitment question
- Eligible leagues and regions
- Age and contract bands
- Role archetype, not only nominal position
- Minimum minutes/sample threshold
- Time window
- Team-strength and possession context
- Metrics or model score
- Data coverage requirement
- Risk tolerance
- Exclusions and comparison cohort

### Tradeoffs

- A high minutes threshold reduces noise but excludes emerging players.
- Broad league coverage finds more candidates but weakens comparison quality.
- Strict role matching improves fit but misses unconventional conversions.
- Recent windows react quickly but overvalue form.
- Historical windows stabilize estimates but react slowly to development.

Queries persist with a name, purpose, owner, last-run week, filters, data cutoff, and resulting candidate snapshots. Re-running an unchanged query on unchanged data must not create new independent evidence or free XP.

### Output

The output is a ranked, uncertainty-aware candidate set with:

- Why each candidate appeared
- Which metrics drove the result
- Confidence and data coverage
- Comparability warnings
- Role/league context
- Price and contract context
- Changes since the previous run
- Suggested next evidence, never an automatic verdict

## 6.4 Model Lab

The player builds football decision models through understandable configuration, not code.

### Supported model questions

- Role fit for a specific club
- Breakout likelihood over a defined horizon
- Adaptation risk
- Availability and injury exposure
- Future transfer value
- Immediate contribution
- Development environment fit
- Replacement similarity
- Market undervaluation

### Model definition

```ts
interface DataModel {
  id: string;
  name: string;
  question: ModelQuestion;
  ownerEmployeeId?: string;
  status: "draft" | "challenger" | "champion" | "retired";
  activeVersionId: string;
  tags: string[];
  createdWeek: number;
}

interface DataModelVersion {
  id: string;
  modelId: string;
  version: number;
  createdWeek: number;
  dataCutoffWeek: number;
  cohortDefinition: CohortDefinition;
  featureFamilies: FeatureFamilyWeight[];
  competitionAdjustment: CompetitionAdjustmentConfig;
  roleAdjustment: RoleAdjustmentConfig;
  complexity: "simple" | "balanced" | "complex";
  thresholdPolicy: ThresholdPolicy;
  validationStrategy: ValidationStrategy;
  trainingSnapshotId: string;
  backtestResultId?: string;
  parentVersionId?: string;
  changeReason: string;
  immutableAfterUse: boolean;
}
```

### Player controls

- Choose the football question.
- Choose a relevant comparison cohort.
- Weight feature families such as involvement, progression, chance creation, finishing, disruption, retention, aerial play, availability, and age curve.
- Decide how aggressively to adjust across leagues and roles.
- Select simple, balanced, or complex model structure.
- Set a decision threshold and risk posture.
- Choose a historical training window and holdout strategy.
- Decide whether a challenger should replace the champion.

### Simulation method

The game does not need a live machine-learning runtime. It needs a deterministic, honest simulation:

1. Build features from observable warehouse data available at the cutoff.
2. Apply transparent role and competition adjustments.
3. Apply seeded estimation error based on sample, provider quality, complexity, and staff competence.
4. Fit or score the selected feature families.
5. Evaluate on an unseen historical holdout.
6. Produce calibration, ranking quality, false-positive/negative patterns, coverage, stability, and drift indicators.

The same seed, data snapshot, and configuration must always produce the same result. A changed configuration should meaningfully alter rankings and error patterns.

### Model health

Expose technical measures in plain language:

| Internal measure | Player-facing explanation |
| --- | --- |
| Calibration / Brier score | “When this model says 70%, does it happen about seven times in ten?” |
| Discrimination | “Does it rank stronger future outcomes above weaker ones?” |
| False positives | “How often does it send you after players who do not fit?” |
| False negatives | “How often does it miss players who later fit?” |
| Coverage | “How much of this market can the model judge responsibly?” |
| Stability | “Would small data changes radically reorder the list?” |
| Drift | “Has the competition changed since the model learned its patterns?” |

### Champion-challenger loop

Only one version per question/brief may be the active champion. Experimental challengers can be tested without changing live recommendations. Promoting a challenger freezes the prior champion for historical accountability and permits rollback.

## 6.5 League, team, and role adjustment

Context adjustment must be a visible football judgment rather than a magic multiplier.

### Inputs

- Competition strength and style
- Team possession share and territorial control
- Team quality relative to league
- Player role and nominal position confidence
- Match state and opponent level where recorded
- Age and development stage
- Minutes and substitution patterns
- Tactical or managerial changes
- Provider coverage quality

### Player decision

The player chooses whether to use:

- Conservative adjustment: trusts raw production and widens uncertainty across contexts.
- Balanced adjustment: applies validated league and role translations.
- Aggressive adjustment: searches harder for suppressed production but accepts larger model risk.

The model card shows which adjustment helped or hurt a candidate and what evidence could invalidate it.

### Dynamic drift

Competition adjustments evolve from the simulated world. Promotion/relegation, tactical fashions, manager changes, financial shocks, and changes in player movement alter translation reliability. A model can become stale even when its implementation has not changed.

## 6.6 Sample quality and uncertainty

Uncertainty is a core resource, not a hidden penalty.

Every profile and model score shows:

- Minutes and match count
- Time span
- Coverage completeness
- Role consistency
- Opponent/competition comparability
- Provider agreement
- Recency
- Confidence interval or clear low/medium/high range
- Main reason uncertainty remains

Repeated analysis has diminishing returns when no new matches, context, or source has arrived. A different context—new role, stronger opponent, live observation, medical source, or second provider—can add independent evidence.

## 6.7 Anomaly and lead triage

An anomaly is a question, not proof of quality.

### Lifecycle

```ts
type AnomalyStatus =
  | "new"
  | "triaged"
  | "needsContext"
  | "verificationScheduled"
  | "confirmed"
  | "refuted"
  | "expired"
  | "escalated";
```

Each lead records:

- Metric or pattern that triggered it
- Relevant model and version
- Expected versus observed range
- Sample and coverage warnings
- Plausible football explanations
- False-positive risk
- Opportunity deadline
- Rival awareness
- Evidence and hypothesis links
- Assigned owner
- Current decision

### Triage decisions

- Reject as probable noise
- Watch for more data
- Ask an analyst to review
- Request provider correction
- Compare film or live context
- Contact a source
- Add to a recruitment case
- Escalate immediately with stated risk

Rejecting noise should build skill and track record when done for defensible reasons. The system must not reward indiscriminate escalation.

## 6.8 Live verification and evidence conflict

Data Scout remains a scouting game. Model leads must reconnect to football observation.

Reuse and extend:

- Source perspectives and stable bias in `src/engine/scout/sourcePerspectives.ts`
- Evidence independence and hypotheses in `src/engine/observation/evidence.ts`
- Hypothesis formation/revision in `src/engine/observation/hypothesis.ts`
- Evidence-board relations in `src/components/game/evidence/evidenceBoardModel.ts`

### Evidence types

- Model claim
- Provider metric
- Analyst interpretation
- Live observation
- Video observation
- Coach/contact claim
- Medical or availability claim
- Market or contract fact
- Stakeholder belief

### Conflict examples

- The model likes a midfielder's progression, but video shows set-piece inflation.
- Live observation looks poor, but the player was used in an unfamiliar role.
- An agent claims adaptability, while a former coach reports difficulty with instruction changes.
- Two providers disagree because one counts pressure events differently.
- The model predicts value, but the selling club's new contract removes the price advantage.

The player can preserve competing hypotheses. The game records whether they sought evidence capable of distinguishing them, not merely whether they accumulated observations.

## 6.9 Forecasts

Forecasts replace the current automatic prediction system.

### Forecast structure

```ts
interface DataForecast {
  id: string;
  caseId?: string;
  playerId?: string;
  clubId?: string;
  question: ForecastQuestion;
  outcomeDefinition: ForecastOutcomeDefinition;
  horizonWeek: number;
  probability: number;
  confidenceBand: "low" | "medium" | "high";
  modelVersionId?: string;
  evidenceSnapshotId: string;
  dataCutoffWeek: number;
  rationale: string[];
  caveats: string[];
  stake: "private" | "client" | "department" | "public";
  status: "open" | "resolved" | "void";
  resolutionEventIds: string[];
  resolvedOutcome?: boolean;
  score?: ForecastScore;
}
```

### Resolution rules

- The outcome definition is frozen when the forecast is submitted.
- Resolution uses append-only world events or audited season facts.
- A forecast resolves once.
- Equipment and later skill gains cannot alter the historical outcome.
- New information may create a revised forecast, but the original remains scored.
- A void result requires an explicit pre-defined invalidation condition.

### Scoring

Use probability-aware scoring, difficulty/base-rate context, and coverage:

- Calibration
- Brier or log score
- Ranking usefulness
- Correctly identified risks
- Appropriate abstention
- Timeliness
- Revision discipline
- Stake level

The player-facing summary remains understandable: “well calibrated,” “too confident,” “too cautious,” “good at ranking but weak at absolute probability,” or “small sample.”

## 6.10 Reports and stakeholder presentations

Data Scout reports are professional artifacts, not exported charts.

### Required report fields

- Intended audience
- Recruitment brief and decision deadline
- Role and club context
- Data coverage and cutoff
- Model/version used
- Key football signals
- League and role adjustments
- Live/contact evidence
- Conflicts and unresolved questions
- Price, wage, contract, and availability context
- Alternatives and comparison players
- Main risks
- Confidence by category
- Recommended next action
- Forecasts
- Conviction and reputation stake

### Presentation interaction

The player chooses how to translate the evidence:

- Lead with football fit
- Lead with value and timing
- Lead with comparative evidence
- Lead with uncertainty and a staged next step
- Challenge the stakeholder's existing favorite
- Withhold an immature conclusion

Stakeholders have persistent preferences, incentives, risk tolerances, and memories. `src/engine/analytics/dataTension.ts` already models data/eye philosophy alignment and can seed this system, but reactions must reference the actual case and prior interactions.

Examples:

- A traditional manager distrusts a complex model but respects accurate role-specific video translation.
- A sporting director values resale upside but becomes frustrated by false-positive travel costs.
- An owner wants a headline discovery and pressures the player to overstate certainty.
- A coach protects an incumbent and opposes a model-backed replacement.

The player can win a decision with a cautious staged recommendation even if the club does not immediately sign the player.

## 6.11 Recommendation accountability

Generalize the Youth case system rather than building a parallel evaluation path.

Evaluation dimensions:

- Was the player suitable for the intended role and club?
- Was the price reasonable at the recommendation date?
- Was the opportunity identified before market consensus?
- Did the report use information available at the time?
- Were uncertainty and data limitations communicated accurately?
- Did live evidence appropriately modify the model output?
- Were identified strengths and risks borne out?
- Was confidence calibrated?
- Did the player revise responsibly when new evidence arrived?
- Did the recommendation create sporting or financial value?
- Did the player avoid a costly false positive?

Track record splits by model, league, role, age, brief type, stakeholder, analyst, and conviction. It must surface systematic bias without revealing hidden truth.

## 6.12 Analysts and research team

Consolidate `DataAnalyst` into the canonical `AgencyEmployee` system. Do not maintain two employee populations.

### Analyst identity

Each analyst has:

- Football-domain strengths
- Data-method strengths
- Preferred model complexity
- Risk tolerance
- Communication style
- League/role expertise
- Provider familiarity
- Known biases
- Reliability and error history
- Ambition, loyalty, morale, and relationships
- Workload and fatigue
- Contract, salary, and career goals
- Authorship and model ownership

### Delegable work

- Clean a feed
- Build a cohort
- Review a model version
- Triage anomalies
- Tag video context
- Validate a competition adjustment
- Draft a report section
- Monitor drift
- Prepare a stakeholder presentation

Delegation is explicit. If the player skips a critical choice, they select a delegation policy and accept the analyst's identifiable judgment. The case history records who made the call.

### Team conflict and growth

- Analysts can disagree over methodology.
- A talented analyst may resist simplistic stakeholder demands.
- A model author may become defensive after failure.
- Rivals can poach staff or buy a provider relationship.
- Mentoring improves judgment but consumes senior capacity.
- Ethical conflicts can arise over leaked, restricted, or player-sensitive data.

## 6.13 Career progression

Progression changes the player's work rather than only raising modifiers.

### Stage 1: Public-data freelance scout

- Low-cost public sources
- One region and limited historical depth
- Small consulting briefs
- Personal query, observation, and presentation work
- High financial pressure
- Reputation built through transparent case studies

### Stage 2: Club recruitment analyst

- Internal briefs and club data access
- Manager and sporting-director politics
- Limited permission to pursue speculative leads
- Responsibility for shortlist quality and deadline delivery
- First analyst collaboration

### Stage 3: Senior data scout

- Multiple briefs and competitions
- Champion/challenger model portfolio
- Provider budget choices
- Presentation responsibility
- Mentoring and performance review
- Increased reputation risk for department-backed recommendations

### Stage 4: Head of recruitment analytics

- Department strategy
- Hiring, contracts, workload, and quality standards
- Club-wide model governance
- Conflict with coaching, medical, and finance stakeholders
- Board expectations and budget defense
- Recovery responsibility after major misses

### Stage 5: Director, independent consultant, or lab founder

- Multiple clients or global club mandate
- Proprietary data and provider negotiations
- Ethical and commercial licensing decisions
- High-stakes public methods and rival competition
- Delegated operations with selective personal conviction cases
- Succession, legacy, and institutional reputation

### Failure and recovery

Career setbacks include:

- A heavily backed model fails after tactical drift.
- A public recommendation becomes a high-profile false positive.
- A provider outage invalidates a transfer-window workflow.
- An analyst is poached with proprietary knowledge.
- The board cuts the department after poor returns.
- A data-license breach damages trust.
- The player loses a job after refusing political pressure or after overstating certainty.

Recovery routes include:

- Publish or present an honest audit.
- Rebuild a simpler model with transparent limitations.
- Take a lower-profile regional or consulting role.
- Specialize in a neglected role or competition.
- Repair a stakeholder relationship through conservative delivery.
- Mentor a young analyst and restore the department's standards.

No setback should permanently eliminate meaningful actions.

## 6.14 Economy and contracts

Data Scout finances center on information advantage and professional delivery.

Costs:

- Provider licenses
- Video access
- Compute/research infrastructure abstraction
- Travel and live verification
- Analyst salaries and training
- Legal/compliance review
- Conference and network access
- Data retention and archive capacity

Income:

- Club salary
- Consulting briefs
- Retainers
- Performance bonuses tied to agreed outcomes
- Model audits
- Regional market reports
- Independent research subscriptions, at late-career tiers

Every payment must enter the existing ledger with source, reason, week, contract, and related case. Consulting income cannot be a flat unexplained specialization bonus.

## 6.15 Rivals and the data market

Rivals compete through methods and access rather than only trying to sign the same player.

Rival capabilities:

- Acquire exclusive provider coverage
- Publish a metric or ranking that shifts market attention
- Poach an analyst
- Copy or challenge a model thesis
- Undercut a consulting proposal
- Leak an immature shortlist
- Buy access to a regional tagging network
- Present a competing interpretation to the same stakeholder

Rivals have doctrines—simple and robust, high-risk discovery, proprietary access, video-led data, financial value, or tactical fit—and leave a historical record. Rival success changes prices, stakeholder beliefs, and available opportunities.

## 6.16 Dynamic events and roguelike replayability

World conditions create rule-changing seasons, not one-off text notifications.

Event families:

- Provider outage or delayed feed
- Vendor acquisition and price increase
- Metric-definition change
- Data correction that alters a shortlist
- New privacy or licensing restriction
- Tactical shift that causes model drift
- Competition format change
- Club budget shock
- Public analytics fashion that makes one profile expensive
- Leaked internal ranking
- Rival research breakthrough
- Analyst resignation or ethical objection
- Unexpected regional data partnership
- Board demand for a simplistic headline metric
- Transfer window shortened by regulation

Each event has:

- Seeded eligibility and rarity
- Preconditions
- Immediate player choices
- Visible and hidden consequences that remain causally explainable
- Stakeholders affected
- Follow-up event chain
- Expiry and cooldown
- Save-stable resolution

### Run identity

At career creation, combine:

- **Origin:** public-data tinkerer, video tagger, academy analyst, finance convert, regional statistics journalist.
- **Doctrine:** conservative calibration, value arbitrage, role translation, injury/availability focus, development forecasting.
- **Flaw:** metric tunnel vision, excessive complexity, provider loyalty, slow conviction, stakeholder bluntness.
- **Starting market:** seeded provider availability, regional coverage, rival ecology, economic condition, tactical fashion, and club demand.

Origins alter the opening tools and relationships. Doctrines grant an edge and create blind spots. Flaws create recoverable complications rather than permanent punishment.

---

## 7. Workspace and interaction design

Data Scout should use the same stable six-workspace shell as Youth Scout, with mode-specific content and verbs.

## 7.1 Desk

Purpose: decisions requiring attention now.

Contains:

- Active briefs and deadlines
- Stakeholder messages
- Model-health warnings
- Provider notices
- Analyst decisions
- Rival pressure
- Presentation requests
- Consequence callbacks

Every card has a clear decision, deadline, downstream entity, and reason it matters. Informational notifications are batched into a digest.

## 7.2 Planner

Purpose: allocate weekly intent and capacity.

Contains:

- Strategic priorities
- Personal and team capacity
- Provider and travel constraints
- Delegation policies
- Deadline conflicts
- Expected evidence or deliverable from each commitment

Keyboard scheduling and mobile agenda behavior should reuse the Youth planner interaction contract. Data activities must have distinct consequences, not shared Broad Scan/Deep Dive/Cross-Check outcomes.

## 7.3 Lab

Purpose: turn raw observations into testable football judgments.

Nested views:

- Queries
- Cohorts
- Models
- Backtests
- Anomalies
- Providers
- Model health

Key interactive components:

- Filter chips and cohort bands
- Feature-family weighting with immediate comparison impact
- Train/holdout timeline
- Champion/challenger comparison
- Distribution and uncertainty views
- Model-change diff
- Anomaly triage cards
- Provider coverage and disagreement map

Charts must support a decision. Each visual needs a related action such as compare, test, exclude, verify, assign, or cite.

## 7.4 Reports

Purpose: convert evidence into accountable action.

Contains:

- Recruitment cases
- Structured report writer
- Presentation rehearsal and delivery
- Frozen forecasts
- Alternatives
- Review schedule
- Case timeline
- Recommendation outcomes

Reuse the Youth dossier/report/case timeline foundations, expanded for model provenance, data cutoff, and forecast scoring.

## 7.5 World

Purpose: understand how football and the data market are changing.

Contains:

- Competitions, clubs, transfers, and player histories
- Regional coverage and provider availability
- Tactical and league drift
- Rival organizations and publications
- Manager/club timelines
- Historical model performance by context
- Global search and expert comparisons

The map should show actual coverage, cost, delay, knowledge, rival presence, and travel access—not decorative pins.

## 7.6 Career

Purpose: manage professional identity, team, finances, and legacy.

Contains:

- Employment and consulting contracts
- Reputation by domain
- Analyst team and development
- Provider budget
- Track record and calibration
- Best discoveries and worst misses
- Bias patterns
- Recovery objectives
- Historical model library
- Legacy and retirement choices

## 7.7 Expert comparison tools

Required comparisons:

- Up to four players across seasons and roles
- A player's pre-recommendation evidence versus later outcomes
- Clubs across recruitment philosophy, environment, finances, and decision history
- Managers across tactical context and data receptiveness
- Model versions across cohort, features, calibration, errors, and resulting shortlist
- Analysts across domain skill, bias, workload, and authored outcomes

Comparisons preserve the “as of” date to prevent future information leaking into historical review.

## 7.8 Interactivity and presentation

Data Scout can be visually rich without pretending to simulate a televised match.

Interactive moments include:

- Animated but skippable query narrowing that reveals candidate movement
- Film-strip overlays linking a metric claim to observed football actions
- Backtest replay showing where a model gained and lost trust over a season
- Boardroom presentation choices with persistent stakeholder reaction
- Model drift visualized as a changing competition profile
- Rival publication or provider-event cards with authored visual variation
- Audio cues for a major discovery, deadline, provider failure, and consequence callback, respecting settings and reduced-motion preferences

Accessibility requirements:

- Every chart has a table and concise text summary.
- Color is never the sole encoding.
- All query, model, triage, planner, and presentation actions are keyboard accessible.
- Screen-reader announcements describe result changes without flooding the live region.
- Focus returns predictably after dialogs.
- Touch targets meet the established mobile size standard.
- Reduced motion disables animated ranking transitions.

---

## 8. Shared systems to reuse and systems to replace

### 8.1 Reuse directly

- World simulation, fixtures, transfers, loans, injuries, development, standings, and history
- Six-workspace shell and responsive navigation
- Weekly strategic-intent planner
- Observation sessions and context variants
- Evidence claims, independence, conflict, and hypothesis state
- Contact perspectives and persistent bias
- Report writer foundations
- Scouting cases, revisions, timelines, and accountability
- Relationship memory and stakeholder identities
- Finance ledger and contract primitives
- Agency employee lifecycle, assignment, training, and delegation
- Regional presence and travel foundations
- World-condition/event deck
- Rival organizations
- Achievements, scenarios, legacy, and run manifest
- Save envelope, migration, cloud, recovery, and archive systems

### 8.2 Extend

- `src/engine/scout/playerFacingIntel.ts` for player-safe cohort and model visualizations
- `src/engine/analytics/dataTension.ts` for persistent stakeholder data/eye philosophies
- `src/engine/reports/reportAccountability.ts` for model-version and forecast evidence snapshots
- `src/engine/reports/scoutingCaseTimeline.ts` for analytical case callbacks
- `src/engine/scout/sourcePerspectives.ts` for provider and analyst disagreement
- `src/engine/world/saveRetention.ts` to retain cited datasets, model versions, and forecast facts
- `src/engine/finance/scoutingInvestment.ts` into concrete provider and research contracts
- `src/engine/finance/employeeWork.ts` into actual analyst deliverables

### 8.3 Replace or retire

- Replace hidden-attribute profile synthesis in `src/engine/data/dataActivities.ts`.
- Delete or quarantine hidden-truth visualization functions in `src/engine/data/visualizationData.ts` once callers are proven absent.
- Replace `predictionTracker.ts` outcome logic with immutable fact-based forecasts.
- Remove equipment-based outcome flipping.
- Replace random “algorithm calibration” mutations with model versions and backtests.
- Remove hidden-ability market inefficiency calculations.
- Consolidate the shallow `DataAnalyst` type into `AgencyEmployee` migrations.
- Replace generic Data activity choices with domain-specific interactions.
- Remove prose in `src/engine/observation/analysis.ts` that claims filters, multipliers, sliders, or backtests the engine does not actually perform until those mechanics exist.
- Remove flat consulting bonuses that have no contract or ledger cause.

---

## 9. Technical architecture

## 9.1 Mode registry

Register a first-class mode separate from specialization through the one canonical `ModeDefinition` contract in `README.md`; do not define a callback-oriented parallel registry.

```ts
const dataScoutModeDefinition: ModeDefinition = {
  id: "data-scout",
  modeDefinitionVersion: 1,
  status: "internal",
  defaultPrimarySpecialization: "data",
  requiredCapabilities: DATA_SCOUT_CAPABILITIES,
  workspaceIds: DATA_SCOUT_WORKSPACE_IDS,
  activityIds: DATA_SCOUT_ACTIVITY_IDS,
  reportSchemaId: "data-scout-report-v1",
  progressionProfileId: "data-scout-career-v1",
  accountabilityProfileId: "data-scout-accountability-v1",
  onboardingSequenceId: "data-scout-first-hour-v1",
  contentDefinitionIds: DATA_SCOUT_CONTENT_IDS,
};
```

Upgrade the one shared `RunManifest` to `RunManifestV2` with `gameModeId`, `runKind`, `modeDefinitionVersion`, `modeContentFingerprint`, and optional challenge definition identity, alongside the existing origin, doctrine, flaw, world modifiers, and content versions. A challenge composes a host mode; it is not a peer game mode. Preserve specialization as a scout skill identity only where shared systems need it.

Do not add `IS_DATA_SCOUT` conditionals throughout components. Route workspaces, onboarding, activities, and career rules through the registry.

## 9.2 Mode state

```ts
interface DataScoutState {
  licenses: Record<string, DataLicense>;
  providerRelationships: Record<string, ProviderRelationshipState>;
  providerIntelligence: Record<string, ProviderIntelligenceSnapshot>;
  observations: DataObservationArchive;
  savedQueries: Record<string, SavedQuery>;
  queryRuns: Record<string, QueryRunSnapshot>;
  models: Record<string, DataModel>;
  modelVersions: Record<string, DataModelVersion>;
  experiments: Record<string, ModelExperiment>;
  backtests: Record<string, BacktestResult>;
  anomalyLeads: Record<string, AnomalyLead>;
  forecasts: Record<string, DataForecast>;
  analystAssignments: Record<string, AnalystAssignment>;
  consultingBriefs: Record<string, ConsultingBrief>;
  presentationRecords: Record<string, PresentationRecord>;
  trackRecord: DataScoutTrackRecord;
  archive: DataScoutArchiveIndex;
  onboarding: DataScoutOnboardingState;
}
```

Store this data inside the shared `ModeState` discriminated envelope with `gameModeId: "data-scout"` and `modeStateSchemaVersion`. `RunManifestV2` remains the only run identity, and optional `challengeState` remains a sibling. Shared world state owns `DataProvider` identities, coverage capabilities, market offers, ownership changes, reliability incidents, outages, and rival contracts. The mode branch owns player-specific licenses and relationships, immutable received observations, and time-stamped fallible provider intelligence; UI may not read future or unobserved provider truth through those references. Do not continue adding optional top-level arrays to `GameState` or add Data-owned copies of shared world entities.

## 9.3 Proposed module boundaries

```text
src/engine/world/dataMarket/
  providers.ts
  providerMarkets.ts
  providerEvents.ts
  providerRivalContracts.ts

src/engine/modes/data/
  index.ts
  types.ts
  initialization.ts
  observableFacts.ts
  providerAccess.ts
  providerIntelligence.ts
  warehouse.ts
  cohorts.ts
  queries.ts
  normalization.ts
  features.ts
  models.ts
  backtests.ts
  calibration.ts
  drift.ts
  anomalies.ts
  verification.ts
  forecasts.ts
  accountability.ts
  analysts.ts
  briefs.ts
  presentations.ts
  progression.ts
  economy.ts
  rivals.ts
  events.ts
  seasonRollover.ts
  archive.ts
  migrations.ts
```

UI:

```text
src/components/game/modes/data/
  DataDeskWorkspace.tsx
  DataPlannerWorkspace.tsx
  DataLabWorkspace.tsx
  DataReportsWorkspace.tsx
  DataWorldWorkspace.tsx
  DataCareerWorkspace.tsx
  query/
  model/
  anomaly/
  forecast/
  presentation/
  comparison/
```

Store actions:

```text
src/stores/actions/dataScout/
  queryActions.ts
  modelActions.ts
  anomalyActions.ts
  forecastActions.ts
  analystActions.ts
  presentationActions.ts
  weeklyDataScoutActions.ts
```

This work also removes Data Scout logic from the 8,000-plus-line weekly action module.

## 9.4 Determinism and random streams

Use named seeded streams:

- Provider observation error
- Provider delay and correction
- Model estimation error
- Analyst interpretation
- Rival action
- Dynamic event
- Stakeholder reaction
- World outcome, owned by the shared world engine

Randomness is generated once and persisted when it becomes an event or observation. Rendering, save/load, and opening a screen never consume simulation randomness.

## 9.5 Truth boundary

Add a lint/test boundary preventing player-facing Data Scout modules from importing hidden player-truth selectors or reading:

- `currentAbility`
- `potentialAbility`
- hidden raw attributes
- hidden personality
- future world outcomes

The engine may compare historical recommendations with audited observable outcomes, but it may never write hidden truth into a player-facing profile, query, model result, forecast, tooltip, or save artifact intended for UI consumption.

## 9.6 Weekly processing order

One canonical weekly processor must serve manual and batch advancement:

1. Advance shared world events.
2. Emit observable public facts.
3. Process provider coverage, delays, corrections, and license state.
4. Complete scheduled analyst/player work.
5. Run saved monitors and drift checks.
6. Update anomaly deadlines and rival pressure.
7. Resolve forecasts whose horizons or event conditions are complete.
8. Apply stakeholder, career, and financial consequences.
9. Build a causal weekly digest.
10. Persist the checkpoint.

`weekSimulationActions.ts` must not precompute decorative random data outcomes that are later processed a second time by `weeklyActions.ts`.

## 9.7 Save migration

Required migration sequence:

1. Invoke the canonical legacy-mode classifier in `README.md`, then write its result into `RunManifestV2`. Known Youth EA provenance remains `youth-scout`; a Data mode is selected only by a complete versioned legacy Data signature or explicit legacy-scenario host mapping. `primarySpecialization: "data"` alone never classifies the save. Ambiguous saves remain preserved and use the recorded `legacy-import` compatibility choice/recovery flow.
2. Introduce the Data branch of the shared `modeState` envelope and its `modeStateSchemaVersion`; do not store a second schema version inside `DataScoutState`.
3. Convert legacy `statisticalProfiles` into read-only archived legacy profiles, clearly labeled as pre-mode estimates, or discard them if no active Data run can exist in production.
4. Convert valid predictions to archived legacy forecasts without retroactively inventing model provenance.
5. Map legacy `DataAnalyst` records into `AgencyEmployee` analyst records with conservative default skills and preserved salary/morale where possible.
6. Convert subscription tier into a temporary provider license of equivalent cost, with an explicit one-season review.
7. Remove duplicated top-level data arrays only after compatibility readers and migration tests pass.
8. Increment save-envelope schema and add fixture tests for every prior supported version.

Never silently classify a Youth data-specialization save as the new Data Scout mode. Golden fixtures must cover Youth-with-data-secondary, specialization-only, complete legacy Data, contradictory signatures, legacy Data scenario, unknown scenario, cloud/import/recovery, and idempotent reload.

## 9.8 Archive and long-save compaction

Retain in full:

- Data and evidence snapshots cited by an active report or forecast
- Every model version used for a delivered recommendation
- Forecast definitions and resolution facts
- Presentation and stakeholder reaction records
- Career-defining cases

Compact:

- Uncited raw observations older than the retention window into seasonal aggregates
- Abandoned query runs with no case or model reference
- Superseded provider corrections after preserving revision history summary
- Detailed backtest rows into histograms and error summaries when no active investigation cites them

Add long-save budgets and telemetry for observation count, archive size, migration time, load time, and retained-reference graph integrity.

---

## 10. Progression and balance

### 10.1 Skills

Replace passive percentage ladders with capabilities:

- Data literacy: understand uncertainty and build broader cohorts
- Football translation: connect metrics to roles and communicate with coaches
- Model judgment: design and compare stronger hypotheses
- Source evaluation: detect provider and contact bias
- Visual analysis: extract contextual evidence from film
- Leadership: delegate, review, and govern analysts
- Persuasion: tailor evidence without misrepresenting it
- Professional ethics: protect trust and licensing access

### 10.2 Unlock philosophy

Early unlocks simplify choices; later unlocks add responsibility, not automatic superiority.

Examples:

- Early: one model question, public provider, two feature families, simple validation.
- Mid: multiple providers, league adjustments, challenger models, analysts, client presentations.
- Late: department governance, proprietary coverage, multiple clients, ethical obligations, rival research, model portfolio allocation.

### 10.3 Anti-dominant-strategy safeguards

- Complex models overfit small or drifting samples.
- Premium providers are expensive and may not cover the relevant market.
- Conservative thresholds miss early opportunities.
- Aggressive thresholds create travel cost, stakeholder fatigue, and false positives.
- More analysts create coordination and review overhead.
- Repeated scans without new data add no evidence.
- Stakeholders punish confident misses more than honest uncertainty.
- Public forecasts build reputation faster but carry greater downside.
- A single successful model decays if left unreviewed.

### 10.4 Difficulty

Difficulty changes pressure and assistance, not hidden outcome cheating.

- Tutorial support and explanation depth
- Budget and deadline pressure
- Provider market harshness
- Rival activity
- Stakeholder patience
- Model drift frequency
- Recovery generosity

Do not improve AI rivals by giving them hidden truth. They receive their own provider coverage, models, analysts, and decision errors.

---

## 11. Implementation roadmap

The order below is mandatory because the current truth and forecast integrity defects invalidate higher-level content.

## Phase 0: Integrity, mode identity, and test harness

**Effort:** XL

### Phase 0 deliverables

- Add `GameModeId`, `RunKind`, mode registry, and `RunManifest` v2.
- Add discriminated `DataScoutState` and migration skeleton.
- Establish player-facing truth-boundary rules and tests.
- Remove or quarantine hidden-ability query, visualization, anomaly, market-value, suggestion, and analyst selection paths.
- Remove equipment outcome flipping.
- Define observable fact snapshots and named random streams.
- Consolidate Data analysts onto the canonical employee direction in schema.
- Extract Data weekly processing entry point from the monolithic weekly action file.

### Phase 0 acceptance criteria

- A Data Scout save is distinguishable from every Youth specialization save.
- No active player-facing data artifact contains hidden ability or raw hidden attributes.
- Same seed plus same actions produces identical Data Scout state after save/load.
- Manual and batch advancement call the same Data Scout processor.
- Legacy save fixtures migrate or fail with a recoverable, explicit message.
- Existing Youth saves and tests remain unchanged.

### Phase 0 required tests

- Mode identity migration matrix
- Player-facing truth-boundary property tests
- Forecast resolution cannot be modified by equipment
- Named RNG stream determinism
- Manual/batch equivalence skeleton
- Employee migration fixtures

## Phase 1: Observable warehouse and first-hour vertical slice

**Effort:** XL

### Phase 1 deliverables

- Observable event warehouse derived from fixture facts.
- Three provider archetypes with coverage, delay, missingness, and cost.
- Real query/cohort builder.
- One model question: role fit or breakout likelihood.
- Simple model versions and holdout backtest.
- Anomaly lead lifecycle.
- One video/live verification interaction.
- Structured report and immutable forecast.
- Stakeholder presentation.
- Three randomized prologue cases and mode-specific tutorial persistence.
- Desk, Planner, Lab, Reports, World, and Career workspace skeletons.

### Phase 1 acceptance criteria

- A new player reaches a defensible discovery decision within five minutes.
- The opening lead is generated from observable data and differs across seeds.
- The player rejects at least one false-looking lead and can advance one ambiguous lead.
- Changing cohort, threshold, or feature weighting changes the candidate ranking for an explainable reason.
- A report cites the exact query, model version, evidence, and data cutoff.
- A forecast resolves only from an actual future world fact.
- Skipping the tutorial never skips the opening career case.

### Phase 1 required tests

- Provider coverage and delay tests
- Query cutoff and no-lookahead properties
- Model determinism and configuration sensitivity
- Anomaly state-machine tests
- End-to-end first-five-minute variants
- Save/reload in every prologue step
- Keyboard and automated accessibility coverage

## Phase 2: Core weekly game and professional economy

**Effort:** XL

### Phase 2 deliverables

- Full weekly strategic-intent loop.
- Multiple query and model questions.
- League, team, and role adjustment.
- Uncertainty, sample, provider disagreement, and diminishing returns.
- Provider contract and renewal market.
- Consulting/client briefs and ledger-backed payment.
- Analyst hiring, assignment, authorship, growth, conflict, and review.
- Persistent manager, sporting-director, coach, owner, agent, and journalist reactions.
- Champion/challenger model management.
- Full presentation choices and staged recommendations.

### Phase 2 acceptance criteria

- Every planned activity has a unique input, decision, output, and downstream consequence.
- Provider and analyst investments materially affect coverage, timing, uncertainty, or capacity.
- At least three viable weekly strategies exist at every early/mid-career tier.
- Delegated work records the analyst, method, uncertainty, and consequence.
- No income or cost occurs without a ledger entry and source contract.
- Reports can succeed as decisions even when a player is not immediately signed.

### Phase 2 required tests

- Weekly capacity and delegation invariants
- License expiry and historical-data retention
- Provider disagreement and correction tests
- League/role normalization properties
- Contract and ledger conservation tests
- Stakeholder memory integration tests
- Manual/batch equivalence across a full season

## Phase 3: Accountability, world depth, and replayability

**Effort:** XL

### Phase 3 deliverables

- Probability-aware forecast scoring and calibration profile.
- Multi-year recommendation accountability.
- Dynamic competition/model drift.
- Rival data organizations and research competition.
- Data-market world-condition deck and authored event chains.
- Origins, doctrines, flaws, and seeded starting markets.
- Region/provider presence and international expansion.
- Model/analyst/stakeholder historical timelines.
- Bias-pattern and missed-opportunity review.

### Phase 3 acceptance criteria

- Two careers with different seeds, origins, and doctrines create materially different providers, briefs, rivals, events, and strategic pressures.
- The player can explain why a model deteriorated or a forecast missed.
- Rivals act through simulated access and methods rather than hidden truth.
- A recommendation can create consequences for at least five seasons.
- Every major event changes a rule, resource, relationship, deadline, or evidence state.
- Track record distinguishes calibrated judgment from lucky hit rate.

### Phase 3 required tests

- Forecast resolves once invariant
- Calibration and base-rate formula tests
- Drift event determinism
- Rival knowledge-boundary tests
- Case consequence timelines over five seasons
- 20-seed career-divergence metrics
- Ten- and thirty-season archive/reference integrity tests

## Phase 4: Late career, failure, and recovery

**Effort:** L to XL

### Phase 4 deliverables

- Head of Analytics and director/consultant leadership loops.
- Department budget, governance, hiring, and standards.
- Multiple-client conflicts and licensing obligations.
- Major model failure, job loss, analyst poaching, and ethical incident chains.
- Recovery careers and transparent-audit actions.
- Legacy, succession, retirement, and historical methods archive.

### Phase 4 acceptance criteria

- Late career spends less time on routine queries and more on direction, review, persuasion, and accountability.
- At least four major failure states have multiple viable recovery routes.
- Success increases stakes and coordination complexity instead of removing tension.
- Retirement summarizes discoveries, misses, calibration, relationships, models, departments, and influence on the football world.

### Phase 4 required tests

- Career tier qualification tests specific to Data Scout
- Job-loss and recovery reachability
- Multi-client conflict consequences
- Leadership delegation and attribution
- Retirement archive completeness

## Phase 5: Expert UX, authored variation, and release proof

**Effort:** L to XL

### Phase 5 deliverables

- Multi-season player, club, manager, analyst, and model comparisons.
- Advanced query presets and reusable views.
- Full responsive and keyboard workflows.
- Text/table alternatives for every visualization.
- Visual/audio variation for discovery, rivalry, failure, and callbacks.
- Content expansion for briefs, stakeholders, providers, events, and prologues.
- Performance budgets and archive compaction.
- Packaged-platform save, offline, recovery, and cloud-conflict verification.

### Phase 5 acceptance criteria

- Expert players can compare, filter, and reopen historical evidence without excessive navigation.
- All six workspaces pass automated Axe checks at desktop and mobile sizes.
- Manual NVDA and VoiceOver workflows are completed and documented.
- Minimum-spec physical hardware meets frame, interaction, memory, save, and load budgets.
- Windows, macOS, and Linux packages pass install, offline, interrupted-write, recovery, and cloud-conflict tests.
- A moderated first-hour study demonstrates that players understand discovery, uncertainty, verification, and accountability.

## 11.1 Executable work-package backlog

This matrix is the delivery contract. “Current problem” refers to verified repository behavior in Section 2; “solution” and all acceptance criteria refer to proposed work.

| ID / priority | Current problem | Proposed solution | Player value | Existing touchpoints | New or extracted modules | Dependencies and risks | Effort | Acceptance criteria | Required tests | Save-migration impact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DS-001 / P0 | `data` is only a specialization; runs cannot distinguish a Data career from a Youth data-specialist career | Upgrade the one `RunManifest` to V2, register Data through the shared `ModeDefinition`, add its discriminated mode-state branch, and compose challenges as a sibling over the host mode | A real, independently balanced career that cannot corrupt another mode | `core/types.ts`, `runManifest.ts`, `productRoadmap.ts`, `gameScreenScope.ts`, `GameLayout.tsx`, `demo.ts` | `engine/modes/registry.ts`, `engine/modes/data/initialization.ts`, shared legacy classifier | Must preserve Youth behavior; avoid a new global boolean, parallel identity, or treating challenges as modes | L | New career creates `gameModeId: "data-scout"` and `runKind: "career"`; Youth data specialization remains `youth-scout`; challenge runs retain a host mode and sibling challenge state | Manifest/mode-state composition, canonical classifier matrix, registry capability, old-save fixtures, Youth regression | Envelope migration uses the shared classifier; specialization alone never chooses Data, Youth, or challenge semantics |
| DS-002 / P0 | Profiles, query filters, inefficiency scans, suggestions, and analyst selection read hidden truth | Establish a player-safe observable-fact boundary; delete/quarantine hidden-truth paths; add restricted-import checks | Uncertainty remains credible and discoveries feel earned | `dataActivities.ts`, `predictionTracker.ts`, `analyticsTeam.ts`, `visualizationData.ts`, `playerFacingIntel.ts` | `observableFacts.ts`, truth-boundary test helpers | May change legacy results; must not accidentally serialize truth in caches | XL | No active Data UI/store artifact reads CA, PA, hidden attributes, hidden personality, or future state | Static boundary test, generated-state property test, UI payload scan, regression tests | Archive legacy profiles as explicitly non-authoritative or discard for modes that were never production-accessible |
| DS-003 / P0 | Weekly data outcomes are split across a huge action module and decorative precomputed counters, risking double or divergent processing | Extract one canonical deterministic Data weekly processor with named random streams | Fast-forward, manual play, reload, and recovery all tell the same story | `weeklyActions.ts`, `weekSimulationActions.ts`, calendar/activity definitions | `weeklyDataScoutActions.ts`, `randomStreams.ts` | Extraction can expose hidden ordering dependencies | XL | Same seed/actions yield byte-equivalent domain state under manual and batch advancement; screens consume no RNG | Manual/batch property, save/reload equivalence, order test, one-season integration | Add persisted RNG stream/version metadata; migrate old RNG state conservatively |
| DS-004 / P0 | Current predictions use mutable current-state proxies, fresh resolution randomness, and equipment outcome flipping | Introduce explicit immutable forecasts with cutoff, definition, probability, stake, evidence snapshot, and event-fact resolution | The player can trust that wins and misses are judged honestly | `predictionTracker.ts`, `reportActions.ts`, world events/history, equipment effects | `forecasts.ts`, `forecastResolution.ts`, `forecastScoring.ts` | Historical world facts must be retained; ambiguous outcome definitions need void rules | XL | Forecast freezes its claim, resolves once from recorded facts, and cannot be changed by later gear, skill, or model edits | Resolve-once invariant, no-outcome-flip test, cutoff test, event-resolution fixtures | Convert valid legacy predictions to read-only “legacy forecasts”; do not invent probabilities or provenance |
| DS-005 / P0 | Two analyst types exist and the Data-specific population is unreachable through a complete employment loop | Consolidate Data analysts onto `AgencyEmployee`, preserving domain methods, authorship, workload, bias, contracts, and morale | Teammates become people whose judgment and careers matter | `analyticsTeam.ts`, `employeeWork.ts`, `core/types.ts`, agency employee actions | `modes/data/analysts.ts`, analyst assignment records | Cross-mode employee migrations; avoid losing existing agency staff | L | One canonical employee ID owns every assignment/report/model; hire, review, train, conflict, poach, and dismiss flows work | Employee migration, assignment capacity, authorship, payroll, poaching integration | Map legacy analysts to agency employees; preserve salary/morale/tenure; add conservative defaults |
| DS-006 / P0 | Persistence only adds empty arrays; cited models/data have no retention contract | Add versioned Data mode migration, immutable artifact references, interrupted-write safety, and citation-aware compaction | Long careers remain stable, auditable, and recoverable | `saveEnvelope.ts`, `db.ts`, `saveRetention.ts`, cloud/recovery providers | `modes/data/migrations.ts`, `archive.ts`, retention graph helpers | Large archives and dangling references; cloud conflict semantics | XL | All supported fixtures load; cited artifacts survive compaction; interrupted writes recover; conflicts preserve both model histories for reconciliation | Version matrix, reference-graph property, compaction soak, cloud-conflict, interrupted-write | Increment envelope schema; migrate each legacy collection explicitly and idempotently |
| DS-007 / P1 | Match profiles are synthesized from hidden attributes and have no provider/source supply chain | Emit append-only observable match facts and provider observations with coverage, delay, missingness, corrections, and provenance | The player can reason about where numbers came from and what they may be missing | `PlayerMatchRating`, fixtures, season ratings, transfers/injuries/history | `warehouse.ts`, `providers.ts`, `types.ts` | Current seasonal compaction may delete needed event detail; storage growth | XL | Every visible metric traces to an event/provider; corrections revise rather than overwrite; unavailable data stays unavailable | Fact emission, delay/missingness, revision, provenance, season-rollover, memory-budget tests | Initialize warehouse empty for old Youth saves; Data legacy archives remain separate from new facts |
| DS-008 / P1 | Database Query selects a league and passes empty filters; the player does not formulate the search | Build persistent query/cohort builder with role, sample, window, league, context, risk, cutoff, and saved runs | Discoveries come from asking better football questions | `executeDatabaseQuery`, Data calendar activity, regional presence | `cohorts.ts`, `queries.ts`, Lab query UI/store actions | Must remain usable on mobile; broad queries can be computationally expensive | L | Player choices alter eligibility/ranking; result explains inclusion, uncertainty, and changes; unchanged rerun adds no evidence | Query filter unit tests, cutoff/no-lookahead, unchanged-rerun property, E2E query variants | Legacy profiles do not become query runs; optionally link read-only archive records |
| DS-009 / P1 | “Algorithm calibration” is random flag mutation; no model entity, version, holdout, or rollback exists | Build deterministic no-code Model Lab with football question, feature families, cohort, complexity, threshold, train/holdout, champion/challenger, and immutable versions | The player develops a recognizable method and can learn why it succeeds or fails | Data activity copy, perks, analytics UI | `features.ts`, `models.ts`, `backtests.ts`, `calibration.ts`, model UI/actions | Avoid false statistical precision and dominant configurations; prevent look-ahead | XL | Same snapshot/config is deterministic; changed choices can reorder candidates; delivered version is immutable; prior champion can be restored | Config sensitivity, determinism, leakage, version immutability, backtest fixture, E2E promotion/rollback | No honest conversion for legacy “calibration”; archive the old activity outcome and start with a tutorial model |
| DS-010 / P1 | No real league/role/sample adjustment; profile certainty ignores minutes, coverage, role consistency, and comparability | Add transparent role, team, competition, time-window, and sample adjustments with uncertainty ranges | A lower-league or unusual-role player can be valued intelligently without magic multipliers | Match ratings, standings, team context, regional confidence | `normalization.ts`, `sampleQuality.ts`, `drift.ts` | Requires reliable role/context facts; numbers must remain explainable | XL | Every adjusted score exposes raw signal, adjustment, uncertainty, and main caveat; low samples widen uncertainty rather than silently failing | Formula tests, monotonicity/property tests, role/league fixtures, UI explanation tests | Recompute only new model results; never rewrite archived legacy profiles |
| DS-011 / P1 | Anomalies are coarse/random flags and generic perceived-attribute averages decide validation | Implement anomaly state machine with model trigger, expected range, false-positive causes, deadline, evidence links, assignment, expiry, and stat-specific verification | Leads become suspenseful investigations instead of free “prospect” markers | `anomalyFlags`, `validateAnomalyFromObservation`, evidence/hypothesis systems | `anomalies.ts`, `verification.ts`, anomaly Lab UI | Content breadth; must reward disciplined rejection and avoid notification spam | L | Each lead can be rejected, watched, delegated, verified, confirmed/refuted, escalated, or expired with a causal history | State-machine, expiry, stat-specific verification, delegation, E2E triage | Convert legacy flags to low-confidence archived leads only when their provenance is valid; otherwise discard |
| DS-012 / P1 | Data findings and live/contact evidence exist in separate loops; repeated analysis trends toward truth | Represent model, provider, analyst, observation, and contact outputs as evidence claims with independence/conflict and hypothesis revision | The player learns when numbers are wrong for a football reason | `sourcePerspectives.ts`, `evidence.ts`, `hypothesis.ts`, evidence-board model, observation sessions | Data evidence adapters and verification actions | Avoid double-counting the same underlying feed; UI complexity | L | Evidence graph identifies common sources, contradiction, recency, and which hypothesis an action tests; repeated same-source work has diminishing returns | Source-independence, duplicate-evidence, hypothesis-revision, observation-context E2E | Migrate only evidence with stable source/provenance IDs; legacy random profiles remain archive-only |
| DS-013 / P1 | Strong reports automatically create predictions; analytics lacks a professional, player-authored case artifact | Extend shared case/report accountability with audience, brief, club/role/price, model version, cutoff, evidence, conflict, alternatives, next step, confidence, and forecast | Recommendations feel like consequential professional work | `reportAccountability.ts`, `scoutingCases.ts`, `scoutingCaseTimeline.ts`, report writer | Data report schema, model citation adapter, presentation actions | Must not fork Youth case logic; historical “as of” views required | XL | Delivered report is immutable, cites exact artifacts, supports revision, and is evaluated on fit/timing/value/risk/calibration—not only player quality | Report schema, revision, citation retention, audience reaction, multi-year review E2E | Extend shared report schema with optional versioned Data evidence; old reports remain readable |
| DS-014 / P1 | Analytics screen is future-scoped and mostly passive; data activities use three repetitive choices | Deliver six decision-first workspaces: Desk, Planner, Lab, Reports, World, Career, with domain-specific interactions | The mode feels like a game, not a spreadsheet or disconnected dashboard | `AnalyticsScreen.tsx`, `PlayerProfile.tsx`, `GameLayout.tsx`, shared Youth workspaces | `components/game/modes/data/**` | Bundle size, broad Zustand subscriptions, mobile chart usability | XL | Every primary screen exposes a state-changing decision or linked drill-down; no dead-end card; first-load mode bundle is lazy | Route/scope, cross-screen smoke, keyboard, responsive, Axe, selector/render performance | UI reads migrated mode state and displays explicit legacy archive badges where needed |
| DS-015 / P1 | Weekly planning schedules themed tasks but does not force strategic analytical tradeoffs | Add intent-led planning across acquisition, model work, triage, verification, relationships, delivery, delegation, and recovery | Every week asks what evidence and opportunity the player will sacrifice | Shared planner, calendar slots, Data activities, weekly strategy/delegation | Data intent definitions, capacity resolver, causal digest | Capacity/balance tuning; avoid busywork at high tiers | L | At least three viable weekly plans exist; each commitment names output, cost, deadline, opportunity cost, and delegation owner | Capacity invariants, skipped-choice delegation, plan resolution, full-season equivalence | Map scheduled legacy activities to nearest intent only for resumable weeks; otherwise finish them under legacy resolver |
| DS-016 / P2 | Subscription costs apply while `dataQualityBonus` does not; consulting income is a flat modifier | Replace tiers with concrete provider licenses and deliverable-based employment/consulting contracts using the ledger | Money choices alter access, speed, legal use, pressure, and career direction | `scoutingInvestment.ts`, `specializationIncome.ts`, ledger/contracts, regional presence | `economy.ts`, provider/consulting contract types | Economy can become pay-to-win; legal restrictions must be understandable | L | Every cost/income has contract and ledger cause; licenses alter actual observations; public-data path remains viable | Ledger conservation, contract lifecycle, license expiry, affordability/balance soak | Convert subscription tier to a temporary equivalent license; remove flat income after honoring already-recorded entries |
| DS-017 / P2 | Data/eye alignment is a pure modifier; recurring football people do not remember case-specific analytical conflicts | Add persistent manager, director, coach, owner, agent, journalist, player, and analyst beliefs, obligations, case memories, and presentation reactions | Persuasion and politics become as important as model quality | `dataTension.ts`, relationship memory, contacts, consequence engine | Data stakeholder profiles, presentation/reaction engine | Authored content volume; avoid opaque attitude meters | XL | Reactions cite the case, evidence, presentation choice, and prior memory; helping one stakeholder can harm another | Memory persistence, conflict graph, audience strategy, callback-chain E2E | Add mode-specific memory events without rewriting existing relationship values |
| DS-018 / P2 | Data career has titles and numerical perks but no mode-specific promotion criteria, leadership, failure, or recovery | Implement five career stages, department governance, client conflicts, public misses, job loss, audits, rebuilding, consulting/lab paths, retirement | The game changes across decades and setbacks become memorable stories | `career/progression.ts`, perks/mastery, employment, agency, scenarios, legacy | `progression.ts`, recovery chains, leadership objectives | Needs enough late-game decisions; avoid irreversible dead careers | XL | Each tier adds responsibility and automation; four major failures have multiple reachable recovery paths; retirement records methods and consequences | Tier qualification, failure/recovery reachability, leadership delegation, retirement archive, long-career E2E | Infer safe career stage from current tier; do not award Data-specific achievements from legacy generic counters |
| DS-019 / P2 | Rival/event content is analytics-themed text over generic youth pressures | Add provider bidding, analyst poaching, rival publications/models, leaks, metric fashions, tactical drift, outages, regulation, and multi-step consequences | No two careers share the same information market or pressure pattern | Rival organizations, world-condition deck, narrative chains, regional presence | `rivals.ts`, `events.ts`, Data event content | Randomness must remain seeded and causally legible; content combinations can become implausible | XL | Events change rule/resource/relationship/deadline/evidence; rivals use only simulated knowledge; run seeds materially diverge | Eligibility/cooldown, deterministic event, rival knowledge boundary, 20-seed divergence, consequence-chain E2E | New decks activate only for Data mode; persist event schema/content version in run manifest |
| DS-020 / P2 | Run identity lacks Data origins, doctrines, flaws, provider markets, and distinct scenarios | Add five origins, five doctrines, five recoverable flaws, seeded provider/rival/economic setup, and six scenarios | Careers begin with meaningful strengths, blind spots, and world conditions | Run manifest, scenario definitions, prologue/event deck | Data run setup and scenario rules | Combinatorial balance; flaws must not be traps | L | At least three strategic doctrines can finish a career; same setup is deterministic; different seeds alter substantive pressures | Manifest determinism, scenario objectives, reachability, seed divergence, balance matrix | Existing runs receive a neutral “legacy practice” origin and no retroactive flaw |
| DS-021 / P3 | The first hour has no production Data path; current prose claims mechanics that do not exist | Ship six randomized, one-time, mode-specific prologues that teach query, threshold, anomaly, context, report, presentation, and accountability | Players experience “I found something the market missed” before learning every screen | Onboarding, opening case, quick interaction, observation session, tutorial flags | Data prologue definitions and tutorial state | Must not guarantee the star or repeat for veterans; authored variation workload | L | A new player makes a defensible discovery decision within five minutes; tutorial is skippable and completion is per mode; case remains in history | All prologue branches, skip/resume, save/load each step, first-hour moderated script | Add per-mode tutorial flags; never overwrite the existing Youth tutorial completion |
| DS-022 / P3 | Expert analytics cannot compare players, clubs, managers, analysts, or model versions across historical “as of” states | Add sortable/filterable four-entity comparisons, version diffs, season timelines, archive search, and table alternatives | Experts can test judgment and understand causality without external spreadsheets | Analytics visualizations, World history, case timelines, search/filter components | Data comparison models/components | Performance on long saves; historical leakage | L | Comparisons preserve cutoff, expose source/uncertainty, link to cases, and remain usable by keyboard/mobile | Cutoff leak, long-save query performance, keyboard/table parity, visual regression | Build indexes during migration; no need to rewrite immutable historical artifacts |
| DS-023 / P4 | Emotional callbacks are largely notifications and Data lacks its own visual/audio identity | Add authored discovery, rivalry, presentation, failure, recovery, and vindication scenes with skippable motion/audio variation | Analytical judgment produces pride, suspense, embarrassment, and vindication | Consequence engine, notification batching, audio/settings, narrative events | Data presentation variants and media manifest | Asset rights, repetition, reduced motion/audio settings | M | Major milestones use varied presentation; no repeated variant inside cooldown; all effects obey accessibility/settings | Content eligibility, asset manifest/rights, reduced-motion, mute, screenshot review | Content-only IDs default safely in old saves; persist used-variant/cooldown state |
| DS-024 / P4 | Critical Data behavior and packaged-platform proof do not exist | Complete dedicated unit/property/E2E/soak, manual accessibility, usability, minimum-hardware, package/offline/recovery/cloud gates | Players can trust a long, paid Early Access career | Vitest, Playwright, release soak, Electron/package scripts, audit tools | Data test factories, 20x30 soak config, release evidence templates | Time and hardware/platform availability; emulation cannot substitute for physical proof | XL | All definition-of-done gates pass on a clean commit/tag-bound package; no severe Axe issue; physical and packaged evidence is recorded honestly | Entire Section 13 plus NVDA, VoiceOver, moderated first hour, physical minimum hardware, Windows/macOS/Linux packages | Test every supported migration path and divergent cloud histories before release |

---

## 12. File-level implementation map

| Area | Existing files | Action |
| --- | --- | --- |
| Mode identity | `src/engine/core/types.ts`, `src/data/productRoadmap.ts`, `src/stores/gameScreenScope.ts`, `src/components/game/GameLayout.tsx` | Add `GameModeId`/`RunKind` registry and `gameModeId`; compose challenges through a host mode; replace release booleans with capabilities |
| Calendar | `src/engine/core/calendar.ts`, `src/engine/core/activityInteractions.ts` | Keep capacity metadata; replace generic Data choices with domain decisions |
| Weekly execution | `src/stores/actions/weeklyActions.ts`, `src/stores/actions/weekSimulationActions.ts` | Extract canonical Data processor; remove duplicated/decorative random outcomes |
| Data activities | `src/engine/data/dataActivities.ts` | Replace hidden-truth synthesis with warehouse/query/model services |
| Predictions | `src/engine/data/predictionTracker.ts`, `src/stores/actions/reportActions.ts` | Migrate to explicit immutable forecasts and fact-based resolution |
| Analysts | `src/engine/data/analyticsTeam.ts`, `src/engine/finance/employeeWork.ts`, `src/engine/core/types.ts` | Consolidate employee model and connect assignments to durable artifacts |
| Visualizations | `src/engine/data/visualizationData.ts`, `src/engine/scout/playerFacingIntel.ts` | Retire truth-leaking legacy functions; expand player-safe comparison models |
| Analytics UI | `src/components/game/AnalyticsScreen.tsx`, `src/components/game/PlayerProfile.tsx` | Replace passive screen with Data Lab workspace and contextual profile evidence |
| Stakeholders | `src/engine/analytics/dataTension.ts` | Extend philosophy alignment into persistent person/case reactions |
| Evidence | `src/engine/observation/evidence.ts`, `src/engine/observation/hypothesis.ts`, `src/engine/scout/sourcePerspectives.ts` | Reuse for model claims, provider disagreement, and verification |
| Accountability | `src/engine/reports/reportAccountability.ts`, `src/engine/reports/scoutingCases.ts`, `src/engine/reports/scoutingCaseTimeline.ts` | Generalize for model provenance, forecast scoring, and analytical review |
| Infrastructure | `src/engine/finance/scoutingInvestment.ts` | Convert abstract subscriptions into concrete provider contracts |
| Finance | `src/engine/finance/specializationIncome.ts` | Replace flat bonuses with contracts, deliverables, and ledger causes |
| Career | `src/engine/career/progression.ts`, `src/engine/specializations/perks.ts` | Add mode-specific responsibilities, criteria, failures, and recovery |
| Regional presence | `src/engine/world/regionalPresence.ts` | Make presence affect providers, contacts, live verification, and analyst coverage |
| Rivals | `src/engine/rivals/organizations.ts` | Add provider, analyst, publication, and competing-model actions |
| Persistence | `src/lib/saveEnvelope.ts`, `src/lib/db.ts`, `src/engine/world/saveRetention.ts` | Add mode-state migration, immutable artifact retention, and compaction |
| Tests | `tests/invariants/`, `e2e/` | Add dedicated Data Scout unit, property, integration, E2E, and soak suites |

---

## 13. Testing strategy

## 13.1 Unit tests

- Provider coverage, delay, missingness, correction, and cost
- Per-90 and possession/team context calculations
- Cohort eligibility and cutoff
- Role and league normalization
- Sample uncertainty
- Feature construction
- Model scoring and version diff
- Holdout evaluation
- Calibration, Brier/log score, coverage, and drift
- Anomaly thresholds and expiry
- Forecast resolution definitions
- Analyst capacity, skill, error, and morale
- Provider/consulting contract and ledger formulas
- Career qualification and recovery rules
- Save migrations and archive compaction

## 13.2 Property and invariant tests

- No player-facing artifact contains hidden ability, potential, hidden attributes, or future events.
- Training and query snapshots contain no facts after their cutoff.
- A forecast resolves no more than once.
- A delivered report's model version is immutable.
- Equipment cannot change a frozen forecast outcome.
- Same seed, data, and actions produce the same result.
- Save/reload produces the same result as uninterrupted play.
- Manual and batch advancement are equivalent.
- Re-running an unchanged query on unchanged data creates no independent evidence.
- Different model configurations can produce different rankings.
- Expired licenses stop new observations while preserving legally retained history.
- Money cannot be created without a recorded source.
- An employee cannot exceed assignment capacity.
- A provider correction does not delete evidence cited by a historical decision.
- Archive compaction preserves every referenced model, forecast, report, and resolution fact.
- A rival cannot act on information outside its simulated knowledge.

## 13.3 Integration tests

- Fixture event to provider observation to query result
- Query result to anomaly to observation verification
- Analyst assignment to model version to report authorship
- Report to presentation to club decision to multi-year review
- Provider outage to incomplete query to stakeholder consequence
- Model drift to warning to retrain/ignore decision to outcome
- Job loss to recovery contract to restored career progression
- Season rollover with open cases and forecasts
- Cloud conflict involving divergent model histories

## 13.4 E2E journeys

- Each randomized prologue
- Tutorial skip and veteran flow
- Public-data freelancer first season
- Club analyst first season
- Provider purchase, expiry, renewal, and replacement
- Build, backtest, promote, and roll back a model
- Triage, verify, reject, and escalate anomalies
- Deliver cautious and high-conviction presentations
- Hire, assign, develop, conflict with, and lose an analyst
- Recover from a major public miss
- Reach every career path and retirement
- Desktop/mobile, keyboard-only, NVDA, and VoiceOver critical paths

## 13.5 Soak and simulation tests

- Exact 20 seeds by 30 seasons for release proof
- Empty/overfull candidate pool checks
- Provider-market health
- Forecast resolution backlog
- Model/archive growth
- Employee labor market health
- Consulting contract availability
- Career dead-end reachability
- Financial runaway/negative loops
- Rival dominance and player catch-up paths
- Long-save memory, load, save, migration, and compaction budgets

## 13.6 Balance telemetry

Track without exposing hidden truth:

- Query-to-lead conversion
- Lead rejection/escalation ratio
- Independent evidence per delivered case
- Average certainty at decision
- Time and money per recommendation
- Model usage diversity
- Champion model age and drift
- Forecast calibration by confidence band
- Stakeholder acceptance by presentation strategy
- False-positive travel cost
- Analyst utilization and rework
- Provider concentration
- Career path and recovery completion
- Seed-to-seed divergence

Telemetry should identify dominant routines and confusing systems; it must not become a hidden live-service balance dependency for single-player play.

---

## 14. Content requirements

Minimum launch content for the mode:

- 5 origins
- 5 doctrines
- 5 recoverable flaws
- 12 provider archetypes with regional variants
- 8 model questions
- 10 role archetypes per broad position family
- 30 stakeholder identity templates with persistent preferences and conflicts
- 20 analyst identity templates with methods, ambitions, and biases
- 40 core briefs with club/role/budget variants
- 60 data-market and football-context events
- 12 multi-step crisis/recovery chains
- 10 rival data organizations
- 6 randomized prologues
- 40 authored discovery/failure/callback presentation variants
- 25 mode-specific achievements
- 6 scenario careers
- 3 distinct late-career endpoints

Procedural combination increases variation, but authored components need compatibility rules so combinations remain plausible.

---

## 15. Scenario careers

### Open Source Unknown

Build a reputation using only public or community data for three seasons. Strong transparency bonus; severe coverage constraints.

### The Relegation Model

Join a financially distressed club and find affordable players suited to a lower-possession survival system. Every false-positive trip matters.

### Broken Feed

A premium provider fails during the transfer window. Audit the damage, rebuild from secondary sources, and preserve stakeholder trust.

### The Skeptical Manager

Work under a successful manager who distrusts analytics. Influence decisions through football translation without overstating evidence.

### Challenger Lab

Lead a small independent team competing against a wealthy analytics syndicate for emerging-market coverage.

### After the Miss

Begin after a public high-conviction recommendation failed. Restore credibility through calibration, transparency, and a new niche.

Scenarios use the same core engine and do not replace the open career.

---

## 16. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Charts replace gameplay | Mode feels like work | Require every visual to support a state-changing decision |
| Hidden truth leaks return | Scouting uncertainty collapses | Architectural import boundary plus invariant tests |
| Statistical language overwhelms players | First-hour abandonment | Football-first explanations, progressive disclosure, tutorial cases |
| One model dominates | Low replayability | Drift, context-specific performance, cost, uncertainty, rival adaptation |
| Randomness feels arbitrary | Lost trust | Named streams, persistent causes, visible uncertainty, causal timelines |
| Premium provider is mandatory | Economy becomes linear | Coverage-specific strengths, budget tradeoffs, public-data viable paths |
| Late game becomes passive management | Loss of discovery fantasy | Reserve high-stakes personal cases and conviction decisions |
| Analyst system duplicates agency code | Maintenance and state defects | Consolidate on `AgencyEmployee` before adding content |
| Save size grows without bound | Long-career instability | Citation-aware retention and seasonal aggregate compaction |
| Backtests leak future data | Invalid model credibility | Immutable cutoff snapshots and no-lookahead property tests |
| Forecast scoring rewards easy claims | Exploitable reputation | Base-rate, probability, coverage, timeliness, and stake-aware scoring |
| Data mode eclipses live scouting | Loses TalentScout identity | Require contextual verification and football translation for high stakes |

---

## 17. Definition of done

Data Scout is release-ready only when all of the following are true:

### Product

- It is a separate selectable game mode with a distinct run identity.
- Its first five minutes produce an understandable, seed-variable discovery decision.
- Its early, middle, and late careers require meaningfully different work.
- At least three viable strategic doctrines can complete a career.
- Failure creates consequential recovery stories.
- Two runs differ in more than names and random rewards.

### Simulation

- All player-facing data originates from observable, cutoff-safe facts.
- Models, providers, analysts, observations, and stakeholders interact causally.
- Forecasts and reports remain accountable for years.
- Manual, batch, save/reload, and cloud-recovered simulations preserve outcomes.
- A 20-seed by 30-season soak has no dead careers, runaway archives, unresolved backlogs, or invalid references.

### Interaction and UX

- Every major workspace contains decisions, not only summaries.
- Query, model, anomaly, verification, report, and presentation loops work on desktop and mobile.
- Expert comparisons preserve historical “as of” context.
- All critical flows pass keyboard, automated accessibility, manual NVDA, and manual VoiceOver review.
- Moderated first-hour testing confirms players understand signal, uncertainty, context, conviction, and accountability.

### Technical quality

- No hidden-truth leak is possible through active Data Scout code.
- No duplicate analyst population remains.
- No flat subscription benefit or narrative claim is disconnected from calculation.
- All financial changes have ledger causes.
- All model versions used in decisions are immutable and retained.
- Migrations cover every supported save version.
- Packaged Windows, macOS, and Linux builds pass install, offline, interrupted-write, save recovery, and cloud-conflict tests.
- Minimum-spec physical hardware meets documented memory, interaction, save, and load budgets.

---

## 18. Recommended team and sequencing

This is an estimated **30 to 44 engineer-weeks**, plus dedicated game design, UX, content, audio/visual, accessibility, and QA work. A focused cross-functional team can overlap content and interface work after Phase 0 establishes the truth and persistence boundaries.

Recommended sequence:

1. One simulation/backend engineer owns observable facts, deterministic models, and forecast integrity.
2. One gameplay engineer owns mode state, weekly processing, analysts, progression, and migrations.
3. One product/front-end engineer owns the six workspaces, query/model interactions, comparisons, and accessibility.
4. A game designer owns model questions, balance, events, briefs, stakeholders, and failure/recovery.
5. QA begins property and soak harnesses during Phase 0 rather than after feature completion.

The first ship decision should be based on the Phase 1 vertical slice. If configuring a cohort, spotting an anomaly, checking football context, and making an accountable recommendation is not compelling in that slice, adding more metrics or screens will not solve the mode.

The standard is simple: the player should remember not merely that a chart was high, but that they discovered why the market was wrong, decided how much uncertainty they could tolerate, convinced a particular football person to act, and lived with the result.
