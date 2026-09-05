# Gameplay systems audit

Baseline: clean `5f141698b87f5964c71723f9f32381cda24df587`. Date: 2026-09-05. Full system inventory and ownership are in GAME_SYSTEM_MAP.md; removal classifications are in DEAD_CODE_AND_ABANDONED_SYSTEMS.md. This is an execution ledger, not a claim that every test or human gate has passed.

## Baseline evidence and score

Four bounded source reviews; 39 focused tests passed. A canonical one-season diagnostic passed with 46 ticks, 342 driver-classified decisions and a 33,468,507-byte final save. Persistence was mocked. No decades-long or enjoyment conclusion follows.

Existing local export played through the school observation, focus, flagged positive/negative evidence, reflection, private lead decision, provisional report, and booked second look. Mobile Planner had no serious/critical Axe violations. Reload reached a menu with Continue/Load available; full restored-case provider verification remained pending. The export had historical build identity and is not final-source acceptance.

Original systems score: **58/100, provisional design judgment**. Core loop 14/20, scouting 8/20, world/development 11/20, consequences/career 10/15, integrity 9/15, balance/replayability 6/10. The uncertainty/birthdate/stale-lock defects and absent long-career/human evidence prevent readiness. This systems rubric is distinct from prior visual/release ratings.

## Findings

| ID | Priority | Current behavior / problem | Purpose and gameplay impact | Change / status |
|---|---|---|---|---|
| SYS-01 | P1 | generation.ts uses 2024 for every cohort birthday; reproduced at seasons 1/10/30 | Trustworthy ages and history | Shared chronology and migration; integrated; focused regressions and combined unit suite pass |
| SYS-02 | P1 | weekly playerSimulation skips age >35 including decline | Living world and believable veterans | Continue active decline; integrated; focused regressions and combined unit suite pass |
| SYS-03 | P1 | Attribute boosts can outlive CA headroom; injury setbacks omit CA | Coherent performances and world valuation | Ordered realized development; integrated; focused regressions and combined unit suite pass |
| SYS-04 | P2 | Late-bloomer positive growth decreases toward peak | Varied career shapes | Segmented maturation and goalkeeper decline; integrated; focused regressions and combined unit suite pass |
| SYS-05 | P1 | Interactive batch gives every participant truth-centered readings irrespective of noticed cues | Attention must cost missed information | Cue-derived updates; integrated; focused regressions and combined unit suite pass |
| SYS-06 | P1 | Negative pressure cue creates supported positive claim and full fit credit; reproduced in engine and UI | Reports must represent the evidence | Polarity and evidence-fit repair; integrated; focused regressions and combined unit suite pass |
| SYS-07 | P2 | General matches every specialist bonus; positive performance increases clarity | Distinct lenses and useful negative evidence | Separate visibility/polarity and specialist depth; integrated; focused regressions and combined unit suite pass |
| SYS-08 | P2 | Opponent/fatigue/consistency alter narration or event selection but not execution quality | Plausible observation context | Contextual session performance; integrated; focused regressions and combined unit suite pass |
| SYS-09 | P1 | Two personality authorities; fixed counts reveal all traits and hidden bins | Character should be inferred from behavior | Context-supported authority and profile; integrated; focused regressions and combined unit suite pass |
| SYS-10 | P1 | Same-career mutation rejects a week result and leaves advancing true with no error; reproduced | Recoverable canonical progression | Invocation ownership; integrated; focused regressions and combined unit suite pass |
| SYS-11 | P1 | Durable finance/career changes can wait for later lifecycle save | Decisions must survive interruption | Commit-boundary queue; integrated; focused regressions and combined unit suite pass |
| SYS-12 | P2 | Async load results lack request ownership | Prevent obsolete loads overwriting a career | Request ownership; integrated; focused regressions and combined unit suite pass |
| SYS-13 | P2 | Liquidation preview/execution differ in inventory and rounding | Honest economic decisions | Shared quote; integrated; focused regressions and combined unit suite pass |
| SYS-14 | P2 | Lifestyle salary benefit is advertised but unused | Resources should buy actual capability | Remove unsupported promise; integrated; focused regressions and combined unit suite pass |
| SYS-15 | P1 | Opening chooses highest hidden-PA pool and forces quality 6/9/4 moments | Discovery must emerge from the real simulation | Generated lead/evidence with teaching cues; integrated; focused regressions and combined unit suite pass |
| SYS-16 | P2 | Explicit pass and later feedback for overlooked players are incomplete | Judgment includes deciding against a prospect | Pass and observable retrospective; integrated; focused regressions and combined unit suite pass |
| SYS-17 | P2 | True-state/fabricated-history visualization exports and orphan observation wrapper | Reduce misleading duplicate mechanisms | Trace and delete narrowly; integrated; focused regressions and combined unit suite pass |
| SYS-18 | P1 evidence gap | No current 5/10/20/30-season acceptance or real-provider endurance | Stable long careers | Extend/run diagnostics; pending |
| SYS-19 | P1 evidence gap | Repeatability/attachment/enjoyment not independently tested | One more week through football stories | Human formative and paired-career validation; pending |

## Integration findings

- **SYS-20 / P1:** Compressed opening phases could alias an original and fallback moment ID. Independent generated seed `opening-identity-7` reproduced the collision. All retained moments now have a stable session/phase/slot/full-player identity; 20 generated openings verify uniqueness and complete report filing.
- **SYS-21 / P1:** Hidden wonderkid flags and generational tiers could immediately unlock discovery achievements. Rewards now require an authored backing followed by dated playing outcomes; historical unlocked awards stay unchanged. Focused award/scenario regressions pass.
- **SYS-22 / P2:** A private pass could still produce recruitment prompts in Desk/Profile/Reports. Those projections now honor the recorded decision and fresh evidence; the Prospects case list and season review now apply the same correction.
- **SYS-23 / P2:** A nullish-coalescing precedence error applied the transfer wage premium to any nonzero willingness. Corrected with threshold regression coverage.
- **SYS-24 / P1:** A focused glimpse was dropped as though the scout never attended; reproduced opening seed `opening-identity-0` could reach an unfileable report. Sparse visits now retain empty readings, no ability/personality reveal, and permit an honest private pass. Wholly missed/unfocused outings route to planning. The regression also checks zero pass rewards and duplicate filing.
- **SYS-25 / P1:** First-bid pricing trusted the asking price. The same report produced a £214 bid at a £152 ask but £14,050 at a £10,000 ask, plus an inflated welcome bonus. Real store payment/buyer debit reproduced the issue. Integrated independent buyer valuation bounds ordinary bids, first counteroffers and exclusivity upgrades; exaggerated asks cannot inflate actual payments or welcome bonuses. Targeted tests pass. Prior long runs were stopped and retained as intermediate evidence.
- **SYS-26 / P1:** Four-option truncation could drop `noConclusion` from reflection; unclear cards could retain a technical classification. Withholding is now always available, and missed/glimpse cards remain inconclusive even with a legacy classification.
- **SYS-27 / P1:** Live play showed short-pass prose paired with finishing/heading evidence and contradictory pressure labels. A shared action catalog now chooses the football action before execution, derives its tested attributes and pressure, and supplies outcome-matched prose. Passing affects short-pass quality; finishing and heading do not. Targeted causal and generated-opening regressions pass.
- **SYS-28 / P1:** Live reflection praised repeated clean execution after two concerning actions, claimed one-player focus was spread thin, and invented a referee episode. Reflections now use actual focus distribution, recorded reactions, cue direction and interpretations. Unsupported episodes and false historical claims were removed; targeted regressions pass.
- **SYS-29 / P2:** Generic uncertainty prompts could claim a late-game test had never happened while quoting a 90th-minute cue. Prompts now describe what this passage alone cannot establish and request corroboration. Weather tokens and duplicated support labels were also made readable.
- **SYS-30 / P1:** The initial assessment's chosen next test always booked a one-day follow-up, even for a tournament or parent/coach meeting. Booking now respects activity availability, duration, question and required context without overwriting commitments. Calendar launch also strips the completion-day suffix when resolving authored question metadata. Targeted proposal tests pass; final integrated browser verification pending.
- **SYS-31 / P2:** The week screen disclosed seeded activity-outcome narration before the approach decision. A follow-up quality template also invented player performance from a scout/session roll. Pending days now conceal the narrative with the same resolution predicate as the metrics. Ten follow-up templates describe scouting opportunities. Five rendered-component/engine regressions pass; final browser verification pending.
- **SYS-32 / P1:** The same unsupported certainty existed across the shared activity-quality template bank: a scout-skill/fatigue roll could declare wonderkid performances, personality traits, weather, relationships or transfer facts. Shared activity summaries now describe session opportunity only. Specific stories remain with actual observation, relationship and world-event producers. All 40 activities retain the same mechanical outputs and subsequent RNG state across 2,400 seeded comparisons; continuation exports retain compatibility without unsupported outcome claims.
- **SYS-33 / P2 development tooling:** The canonical soak's legacy no-op provider serialized the complete world on every save before discarding it. A modern structured mock preserves the production persistence helper and lifecycle. An isolated before/after season had identical final digest, 46 ticks and 93 resolved persistence calls; it removed 93 discarded serializations totalling 5.39 billion string code units. Explicit round-trip checks and separate real-provider gates remain intact.
- **SYS-34 / P1:** Strict frozen `f0e3309` seed 3 failed at season 2→3: Maxwel Diatta's proposed four-year renewal at £3,397/week was rejected after financial settlement, leaving owned expiry 2 in season 3. The same failure was independently reproduced after 92 canonical ticks. Season-end settlement now rechecks unresolved agreed renewals after movement arbitration, releases remaining expired ownership through the lifecycle resolver, and creates pool rows/counters/messages only for committed releases. Returning loans, transfer/retirement precedence and replay are covered by regressions; isolated three-seed five-season plus reference replay passed; combined final acceptance remains pending. New season-end free agents become discoverable on the following tick.
- **SYS-35 / P1:** Actual play found a supporting run labeled pre-receive decision and an unhurried decision labeled pressure response. Question alignment changed the event's semantic classification, and permissive options suggested claims the action did not support. Integrated catalog-backed classifications now keep event identity independent of questions; additive decision-making/physical-execution categories avoid inventing pre-reception timing or repeatability. Legacy live evidence uses conservative contributor/context inference; filed reports retain authored text. Focused combined regressions pass; final rendered acceptance pending.
- **SYS-36 / P1:** Pending tournament focus selection exposed precomputed numeric attribute outcomes, even while its main result was correctly concealed. The picker now displays public player identity/position/age only. Changing those future readings cannot change its rendered content; regression passes. Completed-day result presentation remains separate.
- **SYS-37 / P2:** Non-opening `End early` discarded unfiled watch evidence and returned to an unresolved day without explaining the loss. All three controls now say Leave watch/session, explain discarded evidence, and offer a cancel-first confirmation when work exists. Stale confirmation cannot discard another watch. Complete-only rewards remain unchanged; integrated regressions pass, rendered dialog acceptance pending.
- **SYS-38 / P1:** Main fixtures omitted academy cover; abstract fixtures could reinstate injured seniors when fewer than eleven were fit. Direct probes reproduced nine-player core teams with six healthy academy registrations and injured abstract participants. Both paths now share valid registered availability, including loan registrations and suspension context, with academy cover for a thin available squad or missing natural goalkeeper. Existing ranking, tactics and loan promises remain. Joint registered/available/keeper counts and per-club payroll diagnostics distinguish a senior shortage from a genuinely unavailable XI. Thirty focused roster/health tests pass; combined acceptance pending.
- **SYS-39 / P1:** Annual wage reapproval derived capacity from surviving payroll, destroying replacement headroom after departures. In original seed 3's season 2→3 transition, 266 of 282 caps fell; 248 falls had unchanged reputation. Crawley Wasps fell from 22 to 12 seniors and £15,400 to £6,600 capacity with reputation 13 unchanged. Valid approved capacity now persists exactly; explicit promotion/relegation funding multipliers change it once through the existing league-transition guard. Missing legacy capacity still derives normally. This avoids both a vacancy-driven cut and a new annual spending ratchet; no cash is injected.
- **SYS-40 / P1:** Generation priced wages by ability and club reputation, but renewals, free agents, youth intake and transfer defaults used unrelated global linear ability floors. A CA35/reputation13 player generated at £1,000 could face a £2,100 renewal baseline and £2,800 free-agent demand. A shared wage curve now preserves generation values and aligns destination/previous-club contract context; existing wages, age, role, personality, term, bonus and acceptance factors retain their intended roles. Affordability remains authoritative. Existing £100 contract and £200 free-agent minima remain. Long-horizon distribution validation is pending.
- **SYS-41 / P2 development tooling:** The autonomous driver scheduled youth pitches without selecting a destination, so the product correctly rejected them and the soak silently lacked that consequence coverage. Already selected pitches now complete the same legal club shortlist using public needs and authored audiences. A separate opt-in bounded scenario follows a genuine private pass and up to three earned pitches through actual weekly decisions, signings and both review horizons. It cannot manufacture acceptance or substitute for the normal cohort; integrated tests/typecheck pass, multi-season execution pending.

- **SYS-42 / P1:** Loan maturity could leave an active loan stranded when an otherwise successful buy option lost affordability during movement arbitration. Expired loans now retry through the normal processor; a failed mature purchase returns the player, while an unaffordable early purchase remains rejected. Feedback, reputation and XP settle only after the actual movement and matching closed history. Prepared message IDs preserve RNG continuation. A retirement closes the old recommendation as terminated without inventing a purchase reward or failed new agreement. Competing purchases, overdue recovery, precedence and duplicate settlement have executed regressions.
- **SYS-43 / P1:** In the Morgan Reed/Jesse Rowe playthrough, three inconclusive glimpses and three authored Needs More Data flags correctly produced no usable trait evidence, but the reflection prompt still said the notes raised concerns. It read hidden execution direction from the glimpses. Direction now contributes only when the cue was clear enough to interpret; swapping hidden positive/negative direction leaves the entire inconclusive reflection unchanged.
- **SYS-44 / P2:** Static phase/venue text claimed bright afternoon conditions during generated heavy rain and declared talent, character or clarity without supporting observations. One hundred phase and twelve venue strings now describe context and questions without these claims. A 440-session comparison preserved 16,931 moments, 996 events, all non-copy fields and the next eight RNG draws. Actual event prose remains evidence-owned.
- **SYS-45 / P2 deferred optimization:** A proposed main-thread transport shortcut reduced a five-tick probe from 9.75 to 7.00 seconds but changed rival opportunity key ordering and failed the exact final digest. It was rejected and is not integrated. Both bounded comparisons and the failing order regression are retained. Production transaction normalization and acceptance limits remain intact.

- **SYS-46 / P2:** A Character Reader could choose Mental focus for a danger-reading question without being told that the question uses Tactical Understanding and matches Tactical focus. The existing setup allowed changing the question, but displayed neither association. A bounded 16-career/four-style diagnostic produced 47 readable focused passages out of 48 with matching questions/lenses; no global clarity buff was justified. Setup and attention now show the actual canonical question skill/lens association, including a mismatch explanation. Question ranking, seeded performances and visibility thresholds remain unchanged.
- **SYS-47 / P1:** The planner's searchable target picker received only five observed unsigned youth. A sixth prospect was unavailable for follow-up, parent/coach meetings and pitching; profile shortcuts could not bypass that pool. Regressions reproduced the omission with seven known prospects. The picker now receives the complete observed, active, unplaced youth pool in the existing observation-priority order.
- **SYS-48 / P1:** Planner pitch availability accepted any historical authored report, including a latest private pass that weekly delivery would reject after consuming time. Planner and delivery now share the latest-player-report index: immutable revisions resolve within their case, calendar date resolves between cases, and passes remain authoritative. Other scouts' reports, retired/placed youth and unobserved players cannot create a pitch. Career-credit selectors continue preserving earlier public stakes separately.
- **SYS-49 / P2 development tooling:** The first bounded consequence scenario completed 122 real ticks and both private-pass reviews, but attempted zero placements. It did not retain the failed eligibility predicates, so no exact cause can be claimed from that run. The artifact is failed, not placement coverage. A targeted, public-action discovery/follow-up policy and per-week eligibility diagnostics are integrated for another bounded execution; the normal career profiles remain separate. Targeted tests protect chosen-case authoring, earned evidence and the pass-inclusive destination policy; runtime coverage remains pending.

- **SYS-50 / P1:** Frozen `48315c3` failed football health at S5: seed 1 had 16/282 clubs below 11 jointly registered players; seed 2 had 21/282, including a three-player Salford squad. Most affected clubs had very little recruitment cash despite spare wage capacity and hundreds of free agents. There was no ordinary annual renewal of the recruitment cash envelope. Integrated fixed annual board allocations, bounded 20% carryover, explicit returned funds and season idempotency; debts, player acceptance and affordability remain. Five baseline funding failures reproduced; six funding regressions pass. Combined long-career health remains unverified.
- **SYS-51 / P1:** Contract offer probability used absolute ability thresholds plus a low-reputation penalty. Equivalent regulars at three club levels received 42%, 92% and 95% offers before independent player acceptance. The sporting base now measures ability relative to the club. Usage, role, form, age, morale, affordability, squad cap and separate player refusal remain; equal-role offers are 92% in the controlled fixture, with no guaranteed renewal. Focused regressions pass.
- **SYS-52 / P1:** AI transfers chose a weighted destination before checking its actual fee, bonus and wage package. An impossible destination could suppress a viable move; retained lower-league probes demonstrate both in the same pool. Selection now makes one weighted choice among genuinely viable packages, caching actual proposals and reserving cash, wages and roster capacity across the tick. No fee/wage formula or willingness threshold changed. Focused regression tests and pure retained-state probe pass; settlement/world effects require the new career run.
- **SYS-53 / P1:** Initial squad generation shuffled and trimmed a fixed 25-slot template, sometimes removing every keeper and silently capping requested 26–28-player squads. Generation now honors requested size and preserves at least one keeper without rerolling talent. Seeded regressions pass. This fixes creation, not later injuries or roster attrition.
- **SYS-54 / P1:** Native S1 hydration rewound four active report pointers when replaying older placements. Historical deliveries now link their records without replacing a later authored judgment or private pass; legacy reconstruction orders actual dates and numeric revisions. Historical decision times cannot backdate a case. Seven dedicated hydration regressions pass; native restart remains pending.
- **SYS-55 / P1:** Save migration initialized absent injury histories as fully healthy and repaired current agency-dilemma retainers lacking briefs. Both can change gameplay after reload. Source/retained-state classification distinguishes these defects from metadata defaults. New players now initialize injury tracking at creation; legacy unknown histories remain unknown. Agency-dilemma retainers now create valid club briefs and calendar dates at the action boundary. Forty integrated producer regressions pass; no broad digest ignore is accepted.
- **SYS-56 / P2 verification:** Native build verification incorrectly required HTTP 200 for the deliberately served `404.html`. Exact expected status is now 404 for that document, 200 elsewhere, retaining every byte/hash check. A subsequent long Windows profile path failed to open IndexedDB; a short-path rerun committed a row and exposed SYS-54/55 before restart. No native checkpoint is certified yet.
- **SYS-57 / P2:** Rendered evidence strength could read as player quality, authored reaction badges lacked attribution, a training introduction contradicted a present contact, and unresolved reviews printed `unresolved/100`. Integrated explicit evidence-strength/reaction wording, neutral training context and an honest unscored outcome sentence. Final render remains required.

- **SYS-58 / P1:** Independent review reproduced a negative cash balance being reduced by relegation and recurring funding losing 8% per promotion/relegation round trip. Negative balances now remain owed; recurring annual/wage capacity uses reciprocal division factors (1.25/0.8), while authored one-off positive cash changes remain. `lastLeagueTransitionSeason` blocks stale movement replay after a later return to the same league. Focused transition/finance regressions pass; full combined acceptance is pending.

- **SYS-59 / P1 integration:** The first club-relative retention proposal used CA = 2 × reputation, but that transfer scale does not describe generated squads. In the retained S1 adult-senior cohort at unchanged reputation-75+ clubs, it classified 112/161 as far below club level. The generation midpoint classified 32/161 that way and agreed closely with actual squad medians. Generation and renewal now share the authored club ability midpoint; 24 squads, 592 complete player records and subsequent RNG draws remained identical when extracting this reference. Twenty-seven focused regressions pass; the initial equal-value fixture was insufficient to establish whole-world balance. The superseded review remains retained.

- **SYS-60 / P1:** Alumni debut/first goal/call-up/wonderkid/captaincy/Team-of-Week announcements could be manufactured from ability, potential and random rolls. New tracked senior appearances and goals now require dated post-placement match minutes/goals. Young-player recognition requires 20 rated post-placement appearances averaging at least 7.5 in a season, not hidden potential. Unsupported selection/appointment announcements stop; historical milestones/unlocks remain. First-team status follows recorded participation. Ten focused regressions include a canonical weekly tick; combined endurance remains pending.
- **SYS-61 / P1:** `weeklyPostTickSystems.ts` duplicated alumni milestone messages already emitted by the canonical engine. Removed the redundant reconstruction and verified one emission and replay behavior. Legacy score, review counts and contact promotion are live; the unused reputation helper is not represented as an immediate payout.
- **SYS-62 / P2:** Seasonal UI advertises six modifier families with no gameplay consumer and an international-break league suspension absent from fixtures. Actual fatigue effects also use points while the UI prints percentages. A shared supported-effect and Pareto choice policy now governs timeline, inbox, resolver, migration and autonomous driver. All ten current pairs are duplicated or dominated on their real outcomes, so none are offered and no winner is auto-selected. The 21 calendar events, actual base reputation/fatigue effects and resolved historical choices remain. Fifty-seven focused tests and typecheck pass; current authored seasonal choices are deprecated, not claimed as a meaningful decision loop.

- **SYS-63 / P1 integration:** Independent review reproduced rejected latest reports reopening from closed to delivered, trial reports changing from reported to delivered, and an unlinked historical placement overwriting a later private pass in the same canonical case. An earlier regression used a different case ID and did not cover that branch. The native sorted-state digest also accepted a players-map reorder that changed injury RNG allocation from one player to another. Four failing regressions are retained. Integrated dated-decision reconciliation preserves latest outcomes, authored passes, accepted placements and original decision identity/date. An additive players/unsignedYouth order check supplements the unchanged semantic digest and complete comparisons. Seventy-eight focused tests and isolated typecheck pass; the combined 1,993-test suite, full typecheck and architecture checks also pass. Actual native execution remains required.

## Preserved foundations

Real fixtures and match ratings; deterministic world generation; lifecycle arbitration for moves, loans and retirement; contextual development environments; observed-safe analytics; fresh-evidence report revisions; canonical academy placement links and 1/2-season reviews; career transitions, skills that alter perception, agency capacity; save cloning/migrations, previous-generation journals and worker fallback.

Future-mode and optional online gates are deliberate dormancy, not deletion evidence. A current code path is Active only when its consequences and presentation are traced; passing compilation alone establishes neither gameplay value nor readiness.

## Complete subsystem assessment

The following 62 grouped assessments record baseline behavior and purpose. Confirmed defect status is updated in the issue tables above; the final report owns executed gameplay and endurance results. Where no concrete defect is listed, this source trace found no additional defect, not proof of perfect balance or fun. Future modes retain their explicit gates.

## A01. Run identity: `run/`, `rng/`, `content/`

- **Current behavior/status:** Creation and event streams / D+S / Active; non-youth content Partially Active.
- **Intended purpose and inputs/outputs:** Seed, mode, identity and versioned definitions → run manifest, named RNG streams and modifiers.
- **Gameplay value and surface:** New Game choices and opening context.
- **Gameplay/technical/balance assessment:** P2 evidence gap: different seeds and backgrounds are supported; their practical career diversity is unmeasured.
- **Integration and ownership:** Generation, deterministic IDs, scenario and content lookup; changes opportunity distribution across careers. State: GS `seed`, `runManifest`; static registry.
- **Recommended change:** Preserve versioned manifests; compare opportunities and recurring strategies across seeded careers.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A02. World initialization: `world/init.ts`, `countryAvailability.ts`, `mapCountryRegistry.ts`; country data in `src/data/`

- **Current behavior/status:** Creation / S / Active.
- **Intended purpose and inputs/outputs:** Selected countries and seed → clubs, leagues, rosters, fixtures, available geography.
- **Gameplay value and surface:** New Game, World map, Planner opportunities.
- **Gameplay/technical/balance assessment:** P1 verified SYS01: generated birth years use a fixed calendar origin, including later intakes.
- **Integration and ownership:** Player generation, club templates, travel eligibility; country presence must represent generated content. State: GS `countries`, `clubs`, `leagues`, `players`, `fixtures`.
- **Recommended change:** Make generation season-aware and verify intake ages against dates.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A03. Player identity, attributes and potential: `players/generation.ts`, `core/types/player.ts`

- **Current behavior/status:** Intake/creation / S / Active.
- **Intended purpose and inputs/outputs:** Position, age, club level, country and RNG → canonical player, attributes, current/potential ability, development profile.
- **Gameplay value and surface:** Public identity and observed estimates in Prospects/Profile; hidden ability must stay behind selectors.
- **Gameplay/technical/balance assessment:** P1 cross-system defect SYS01/03: canonical identity exists, but birthday and attribute-budget rules are inconsistent. A numeric ceiling alone does not guarantee growth.
- **Integration and ownership:** Truth drives performances/development; IDs join reports, rosters and history. State: GS `players`, embedded `unsignedYouth.player`, later `retiredPlayers`.
- **Recommended change:** Retain hidden truth and development profiles; repair generation and bounded growth instead of replacing the player model.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A04. Personality and mentality: `players/personality.ts`, `personalityEffects.ts`, `personalityReveal.ts`, `behavioralTraits.ts`, `traitReveal.ts`

- **Current behavior/status:** Creation, observation, match / S / Broken at baseline: count-based full reveal needs evidence-bound authority.
- **Intended purpose and inputs/outputs:** Generated traits and hidden modifiers plus observed contexts → match/development effects and learned traits.
- **Gameplay value and surface:** Character/evidence panel, report claims, match clues.
- **Gameplay/technical/balance assessment:** P1 verified SYS09: overlapping personality-reveal authorities allow count-driven certainty without varied behavioral evidence.
- **Integration and ownership:** Professionalism, consistency, pressure and conduct affect different systems; baseline contains two overlapping reveal authorities. State: Player truth plus `personalityRevealed`, profile reveal fields and observations.
- **Recommended change:** Make trait disclosure evidence-bound and separate event/development effects from learned trait claims.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A05. Development and regression: `players/development.ts`, `core/weekly/playerSimulation.ts`, `world/developmentEnvironment.ts`

- **Current behavior/status:** Week and seasonal lifecycle / D+S / Active; calibration and decades require harness evidence.
- **Intended purpose and inputs/outputs:** Age, capacity, profile, playing opportunities, club environment, traits and injury → attribute/ability deltas and environment history.
- **Gameplay value and surface:** Profile Development, future observations, alumni and reviews.
- **Gameplay/technical/balance assessment:** P1 verified SYS02/03 and P2 SYS04: older-player decline is skipped, attribute changes can outrun ability changes, and late-bloomer timing needs correction.
- **Integration and ownership:** Player roles, manager context, ratings and difficulty; alters future opportunities and club value. State: Player attributes/ability/history; GS match/loan/world context.
- **Recommended change:** Enforce coherent attribute budgets and varied age curves; use cohort and multi-decade diagnostics before asserting realistic careers.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A06. Injury, fatigue, form and momentum: `core/weekly/playerSimulation.ts`, `match/ratings.ts`

- **Current behavior/status:** Week/match / S / Active.
- **Intended purpose and inputs/outputs:** Age, proneness, fitness, match appearances and ratings → injuries, recovery, setbacks, form.
- **Gameplay value and surface:** Profile injury log and visible risk; match/World feedback.
- **Gameplay/technical/balance assessment:** P1 SYS03: injury-related attribute setbacks can disagree with ability. P2 SYS08: event execution underuses form/fatigue context.
- **Integration and ownership:** Availability changes XI, observations, development and transfer decisions. State: Player injury/form fields, injury history, `matchRatings`.
- **Recommended change:** Align setbacks with development accounting and connect contextual performance variation to observations.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A07. Position and role: `players/roles.ts`, `match/tactics.ts`, `firstTeam/systemFit.ts`, `world/developmentEnvironment.ts`

- **Current behavior/status:** Observation, transfer, lineup, week / D+S / Active shared; first-team UI Partially Active.
- **Intended purpose and inputs/outputs:** Position, attributes, team style, promised role and opportunities → role fit, selection and environment assessments.
- **Gameplay value and surface:** Profile fit, report assessment; first-team tactics surfaces are future scope.
- **Gameplay/technical/balance assessment:** P2 evidence gap: role fit exists; emergent position changes and their frequency have not been established by this trace.
- **Integration and ownership:** Development and recruitment use different fit questions; pure quality is insufficient. State: Player position/roles; manager profiles; `systemFitCache` report/session knowledge.
- **Recommended change:** Preserve role/context coupling; do not advertise systemic position changes until a live producer and history are verified.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A08. Fixture calendar: `world/fixtures.ts`, `core/gameDate.ts`, `core/standings.ts`

- **Current behavior/status:** Creation, match, season / D+S / Active.
- **Intended purpose and inputs/outputs:** League clubs, season and results → fixture list, game dates and standings.
- **Gameplay value and surface:** World tables, Planner; Fixture Browser future-gated.
- **Gameplay/technical/balance assessment:** P1 validation gap SYS18: fixture-derived chronology is implemented, but long-run rollover correctness needs candidate-bound execution.
- **Integration and ownership:** Defines authoritative season length and completion; financial annualization depends on it. State: GS fixtures/leagues/current week/season.
- **Recommended change:** Use the authoritative season calendar in all age, contract, deadline and finance calculations.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A09. Competition simulation: `match/phases.ts`, `ratings.ts`, `discipline.ts`, `world/abstractCompetition.ts`, `core/gameLoop.ts`

- **Current behavior/status:** Fixture/week / S / Active simulation; first-team interaction Partially Active.
- **Intended purpose and inputs/outputs:** XI, attributes, context and RNG → meaningful phases, scores, ratings, card events and participation.
- **Gameplay value and surface:** Youth observational events; World results; interactive first-team match UI gated.
- **Gameplay/technical/balance assessment:** P2 verified SYS08: relevant contextual factors have more presence in narration than sampled observational execution. Distribution realism is unverified.
- **Integration and ownership:** Playing time, form, injuries, reputation and recruitment; abstract leagues intentionally have reduced detail. State: Fixtures, ratings, disciplinary records, appearance histories.
- **Recommended change:** Wire causal context into event quality and inspect seeded match samples for roles, opponent levels and variance.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A10. Scouting match attention: `match/focus.ts`, `observation/fullObservation.ts`, `moments.ts`, `momentReading.ts`

- **Current behavior/status:** Phase/session / S / Active youth session; first-team focus mode Partially Active.
- **Intended purpose and inputs/outputs:** Underlying performance/moments, scout skill, focus and lens → contextual readings and missed information.
- **Gameplay value and surface:** Observation pitch, focus/lens controls, evidence cards.
- **Gameplay/technical/balance assessment:** P1 SYS05: baseline observation batch leaks truth-centered samples to unfocused players. P2 SYS07: general lens gains specialist-like coverage.
- **Integration and ownership:** Attention selection affects which claims can be earned; a performance is not a player truth dump. State: `activeObservationSession`, committed observations.
- **Recommended change:** Reward only earned attention and give questions distinct attribute coverage and information costs.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A11. Promotion/relegation and manager changes: `world/relegation.ts`, `managerTurnover.ts`, `clubPhilosophyTransitions.ts`

- **Current behavior/status:** Season/weekly checks / S / Active.
- **Intended purpose and inputs/outputs:** Standings, manager/club context → division movements, philosophy and directive changes.
- **Gameplay value and surface:** World archive, Inbox and brief context.
- **Gameplay/technical/balance assessment:** P1 validation gap SYS18: movement and manager changes are live; decades of division/roster and philosophy stability are unverified.
- **Integration and ownership:** Changes opponent level, finances, academy needs and development environments. State: Clubs/leagues/managers, philosophy transitions, history.
- **Recommended change:** Check promotion/relegation membership and changes in club need through repeated season transitions.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A12. Club economics and recruitment identity: `finance/clubEconomics.ts`, `world/recruitmentIdentity.ts`, `recruitmentDoctrineCatalog.ts`, `clubRecruitmentEcosystem.ts`

- **Current behavior/status:** Action/week/season / D+S / Active.
- **Intended purpose and inputs/outputs:** Budget, commitments, roster/age needs, philosophy and report → affordability and differentiated demand.
- **Gameplay value and surface:** Briefs, eligible clubs, placement decision reasons, World dossiers.
- **Gameplay/technical/balance assessment:** P2 evidence gap: differentiated doctrine and economic constraints exist; dominant club valuation strategies remain unmeasured.
- **Integration and ownership:** Restricts signings and obligations; doctrine weights evidence, risk, age and regional reach. State: Clubs and derived doctrine; report/decision ledgers.
- **Recommended change:** Compare clubs of different means and doctrine with the same recommendation, preserving explicit decision reasons.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A13. Transfers and contracts: `recruitment/recruitmentOpportunities.ts`, `transfers/transferAgreement.ts`, `world/transfers.ts`, `transferMotivation.ts`

- **Current behavior/status:** Week/windows/action / D+S / Active world; direct negotiation Partially Active.
- **Intended purpose and inputs/outputs:** Report-driven interest, roster need, price, role, contract and willingness → proposals and movement intents.
- **Gameplay value and surface:** Report/club response and movement history; Negotiation screen future-gated.
- **Gameplay/technical/balance assessment:** P2 verified: transferAgreement.ts willingness modifier has nullish-coalescing/conditional precedence error; nonzero willingness can receive a premium.
- **Integration and ownership:** Budget/wage obligations, registration fit and competition; case attribution links intelligence to transfers. State: Player contract/club, club economics, transfer/decision records.
- **Recommended change:** Parent/consequences proposal corrects grouping and tests low/high willingness; validate ledgers and affordability in integration.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A14. Loans: `world/loans.ts`, `firstTeam/loanIntegration.ts`, `transfers/appearanceLedger.ts`

- **Current behavior/status:** Week/end date / D+S / Active world; first-team controls Partially Active.
- **Intended purpose and inputs/outputs:** Player role, temporary destination and agreement → loan deal, participation, return and outcome.
- **Gameplay value and surface:** Player journey, placement/accountability; first-team loan recommendation controls gated.
- **Gameplay/technical/balance assessment:** P1 validation gap SYS18: loan returns and participation affect development, but long-career ownership integrity needs simulation.
- **Integration and ownership:** Development environment and wage contributions; returns must restore one authoritative roster. State: `activeLoans`, `loanHistory`, movement/appearance ledgers.
- **Recommended change:** Keep one movement authority; test return/expiry/retirement conflicts and preserve observed appearance facts.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A15. Free agents: `freeAgents/`

- **Current behavior/status:** Week/expiry/action / S / Partially Active.
- **Intended purpose and inputs/outputs:** Contract expiry, discovery eligibility, clubs and player context → pool, visible candidates and negotiation state.
- **Gameplay value and surface:** World consequences; dedicated Free Agents screen is future-gated.
- **Gameplay/technical/balance assessment:** P2 scope gap: dedicated Free Agents UI is future-gated. Presence of the engine does not imply a usable Youth negotiation loop.
- **Integration and ownership:** Must not duplicate player identity; free agency and retirement share lifecycle authority. State: `freeAgentPool`, `freeAgentNegotiations`, players.
- **Recommended change:** KEEP shared lifecycle logic; certify or intentionally retain the separate mode gate before exposing controls.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A16. Retirement, aging and roster movement: `world/playerLifecycle.ts`, `transfers/retirementPlanning.ts`, `youth/generation.ts`

- **Current behavior/status:** Week/season/action / D+S / Active; long-run population health separately tested.
- **Intended purpose and inputs/outputs:** Age, career context, eligibility and movement intent → retirements, releases, signings, archive references.
- **Gameplay value and surface:** Player history, alumni, changing prospect pool.
- **Gameplay/technical/balance assessment:** P1 SYS02/18: aging and retired-player effects cross several systems; post-35 development skip and population stability require repair/verification.
- **Integration and ownership:** Roster/player/pool consistency is resolved centrally; population is replenished through intake, not a literal cloned regen. State: Live/retired players, youth pool, retired IDs, `playerMovementHistory`.
- **Recommended change:** Validate one identity across player pools, contracts, rosters, retirement archive and replacement intake.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A17. Youth generation and academy intake: `youth/generation.ts`, `tournaments.ts`, `venues.ts`

- **Current behavior/status:** Creation/season/event / S / Active.
- **Intended purpose and inputs/outputs:** Countries/subregions, season, club capacity, age profile and RNG → unsigned prospects, intake and events.
- **Gameplay value and surface:** Prospects, Planner, youth trials/festivals/tournaments.
- **Gameplay/technical/balance assessment:** P1 SYS01/18: fixed birth origin affects later cohorts; population and potential inflation are unmeasured.
- **Integration and ownership:** Discovery availability, competition environments and roster replacement. State: `unsignedYouth`, `subRegions`, `youthTournaments`, club rosters.
- **Recommended change:** Repair dates and inspect intake/retirement distributions over 1/5/10/20/30 seasons.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A18. Geography, knowledge and travel: `world/travel.ts`, `regions.ts`, `regionalPresence.ts`, `territoryIdentity.ts`, `hiddenLeagues.ts`

- **Current behavior/status:** Action/week / D+S / Active; standalone Regional career Partially Active.
- **Intended purpose and inputs/outputs:** Home base, contacts, travel posture, office/staff and earned knowledge → access, costs, penalties and local opportunities.
- **Gameplay value and surface:** World, country dossier, Planner and career offices.
- **Gameplay/technical/balance assessment:** P2 evidence gap: travel and familiarity affect opportunities; whether one geography dominates returns is unmeasured.
- **Integration and ownership:** Presence is derived from existing facts; modifies observation interpretation and discovery access. State: Scout travel/knowledge, countries, territories, infrastructure/contacts.
- **Recommended change:** Compare access and information gains against time/cost across regions without adding arbitrary travel grind.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A19. Football culture and world conditions: `footballCulture*.ts`, `culturalCalendarState.ts`, `worldConditions.ts`, `worldConditionArcs.ts`, `worldConditionStakeholders.ts`

- **Current behavior/status:** Season/week/session / D+S / Active.
- **Intended purpose and inputs/outputs:** Seeded seasonal state, cultural learning and calendar → interpretation modifiers, windows and stakeholder pressure.
- **Gameplay value and surface:** World dossier, session context, story choices and calendar.
- **Gameplay/technical/balance assessment:** P2 evidence gap: culture/context modifiers are wired; player comprehension and causal salience require play evidence.
- **Integration and ownership:** Effects alter recruitment/access/development context; culture does not alter player truth merely when learned. State: World-condition/culture states; consequence facts.
- **Recommended change:** Expose the relevant context at the decision, then evaluate whether it changes choices rather than adding repeated prose.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A20. International assignments and mobility: `world/international.ts`, `internationalDeliverables.ts`, `youth/youthMobility.ts`

- **Current behavior/status:** Period/action/week / D+S / Active.
- **Intended purpose and inputs/outputs:** Career access, country coverage, deliverables and age/geography → assignment, assessment and completion.
- **Gameplay value and surface:** World, Planner, report/case delivery.
- **Gameplay/technical/balance assessment:** P2 evidence gap: international work is scouting assignment delivery, not national team management or real-world regulatory modeling.
- **Integration and ownership:** Travel/registration friction is a bounded game abstraction, not actual legal modeling. State: International assignments/history; derived mobility assessment.
- **Recommended change:** Keep geography/access consequences intelligible and verify deliverable completion through the canonical action.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A21. International football selection

- **Current behavior/status:** Week / S / Partially Active abstraction; do not claim national-team simulation.
- **Intended purpose and inputs/outputs:** Baseline alumni milestone checks ability/age and a seeded chance → international-call-up message.
- **Gameplay value and surface:** Alumni/Inbox can imply more simulation than exists.
- **Gameplay/technical/balance assessment:** P2 verified abstraction: youth/alumni.ts:360-381 creates an international-call-up milestone from ability/age/chance without a national roster authority.
- **Integration and ownership:** No national-team selection, international fixtures or authoritative call-up roster was found. State: Alumni milestones only (`youth/alumni.ts:360`).
- **Recommended change:** Label as a limited milestone abstraction or back it with a minimal dated selection record; a full international engine is not required.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A22. Historical world record: `world/worldHistory.ts`, `historyComparison.ts`, `worldHistoryTypes.ts`, `saveRetention.ts`

- **Current behavior/status:** Season/retention / D / Active.
- **Intended purpose and inputs/outputs:** Completed fixtures, participation, movement and table outcomes → compact season archive.
- **Gameplay value and surface:** World history, player journey, career retrospectives.
- **Gameplay/technical/balance assessment:** P1 SYS18 validation gap: archives and retention are active, but multi-decade identity/history/save-size stability need fresh results.
- **Integration and ownership:** Retains authoritative facts without reconstructing fictional past scores; bounded compaction protects saves. State: `worldHistory`, movement ledger and archived players.
- **Recommended change:** Keep archive values tied to played results and movement ledgers; never synthesize missing past performance.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A23. Scout creation and progression: `scout/creation.ts`, `progression.ts`, `specializations/`, `tools/`

- **Current behavior/status:** Action/week/promotion / D+S / Active youth; other specs Partially Active.
- **Intended purpose and inputs/outputs:** Background, allocations, work, performance and prerequisites → skills, specialization perks and tools.
- **Gameplay value and surface:** New Game, Career, Training, Equipment; unavailable secondary specs gated.
- **Gameplay/technical/balance assessment:** P2 evidence gap: skills and tools have mechanical consumers; progression pacing and specialization dominance remain unmeasured.
- **Integration and ownership:** Skills change confidence, discovery and judgments; unlock checks and bonuses must have real consumers. State: GS scout, unlocked tools, finances equipment.
- **Recommended change:** Compare information quality and access at different skill levels; judge progression by new work/influence rather than XP alone.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A24. Evidence and uncertainty: `scout/perception.ts`, `perceivedAbility.ts`, `evidenceModel.ts`, `observationTrend.ts`, `starRating.ts`

- **Current behavior/status:** Observation/report / S and D aggregation / Active; personality exception noted above.
- **Intended purpose and inputs/outputs:** True event/player state, skill, lens, context and prior observations → noisy readings, estimates, confidence and claims.
- **Gameplay value and surface:** Profile, Report Writer, reflection and Prospects.
- **Gameplay/technical/balance assessment:** P1 SYS05/06 and P2 SYS07: unfocused samples, positive pressure interpretation and general-lens breadth weaken uncertainty.
- **Integration and ownership:** Separates truth from learned knowledge; repeated correlated evidence should not grant certainty by itself. State: `observations`, reports, claims and session evidence.
- **Recommended change:** Use attention-earned contextual evidence, signed/ambiguous readings and nonredundant lens coverage.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A25. Player-safe information projections: `scout/playerFacingIntel.ts`, `career/playerFacingDiscovery.ts`, `reports/recommendationReviewDisplay.ts`

- **Current behavior/status:** Render/query / D / Active.
- **Intended purpose and inputs/outputs:** Earned observations, reports, visible injury and historical facts → charts, discovery and review views.
- **Gameplay value and surface:** Profile, Discoveries, Analytics (future-gated), reports.
- **Gameplay/technical/balance assessment:** P1 verified cross-surface gap: safe profile selectors coexist with hidden-potential award predicates. Source-safe views do not prove universal safety.
- **Integration and ownership:** No new truth or invented development history; prevents raw CA/PA from leaking through secondary views. State: Derived only; source records remain in GS.
- **Recommended change:** Audit reward and scenario projections too; award only dated observed outcomes and keep internal truth diagnostic.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A26. Session lifecycle and focus: `observation/session.ts`, `types.ts`, `fullObservation.ts`, `informationGain.ts`, `questions.ts`, `objectives.ts`

- **Current behavior/status:** Action/phase/session / D+S / Active.
- **Intended purpose and inputs/outputs:** Activity, question, phase, attention tokens and prior choices → locked focus/flags and completion.
- **Gameplay value and surface:** Observation, halftime, Reflection.
- **Gameplay/technical/balance assessment:** P2 UX02: guided standout/promising gates can conflict with truthful opening evidence; session/journal durability remains cross-owner work.
- **Integration and ownership:** Limited attention, session completeness and repeat-work effects determine evidence earned. State: `activeObservationSession`, completed activity IDs, reflection journal.
- **Recommended change:** Allow evidence-consistent flags and resume committed choices; parent reports tutorial fixes, evidence owner handles journal/action gates.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A27. Context and situations: `observation/contextResolution.ts`, `situationCatalog.ts`, `situations.ts`, `backgroundSituation.ts`, `atmosphere.ts`

- **Current behavior/status:** Session/phase / S / Active.
- **Intended purpose and inputs/outputs:** Venue, opposition, role, timing, conditions and chosen posture → contextual opportunities/readings.
- **Gameplay value and surface:** Observation pitch, context cues, event text.
- **Gameplay/technical/balance assessment:** P2 SYS06/08: narration can outrun causal influence and negative pressure cues can be read positively.
- **Integration and ownership:** Distinguishes an action under pressure from an uncontested action; attention can miss simultaneous evidence. State: Session phases/situations; observation provenance.
- **Recommended change:** Make context affect generated evidence and preserve uncertain/conflicting interpretations.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A28. Inquiry, analysis and quick interaction: `observation/investigation.ts`, `analysis.ts`, `quickInteraction.ts`, `interactionSelection.ts`, `inquiryConsequences.ts`

- **Current behavior/status:** Action/phase / D+S / Active; data-specific activities Partially Active.
- **Intended purpose and inputs/outputs:** Dialogue/data/strategic choice, relationships and source context → evidence, effects and locked response.
- **Gameplay value and surface:** ObservationScreen imports three live children from ObservationPhase.tsx.
- **Gameplay/technical/balance assessment:** P2 evidence gap: three interaction children are live; obsolete ObservationPhase wrapper has no production caller.
- **Integration and ownership:** Contacts can bias evidence; choices change follow-on phase or relationship, not only text. State: Session choices/resolutions, observations, relationships.
- **Recommended change:** DELETE only traced wrapper; retain the investigation/analysis/quick-interaction components imported by ObservationScreen.
- **Implementation status:** Inventory proposal implemented; focused tests and typecheck passed; integrated read-back remains root responsibility.

## A29. Reflection and authored assessment: `observation/reflection.ts`, `evidence.ts`, `reports/structuredYouthReport.ts`

- **Current behavior/status:** Session/report / D+S / Active; obsolete auto-hypothesis helper Deprecated.
- **Intended purpose and inputs/outputs:** Flagged moments and user classifications → journal, explicit claims, unknowns, risks and next tests.
- **Gameplay value and surface:** Reflection, Initial Assessment, Report Writer.
- **Gameplay/technical/balance assessment:** P2 SYS16/UX02: authored pass and ambiguous observations need valid progression and saved feedback, not forced optimism.
- **Integration and ownership:** Prevents report work from silently making the scout's judgment; private notes are not scored text parsing. State: Journal, reports/work items/cases.
- **Recommended change:** Preserve user judgment and flag provenance; keep pass separate from a recommendation or a forced new visit.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A30. Insight and gut feelings: `insight/`, `youth/gutFeeling.ts`

- **Current behavior/status:** Action/observation / D+S / Active.
- **Intended purpose and inputs/outputs:** Earned insight, activity scope, cooldowns and observed signals → bounded special reads and attention hooks.
- **Gameplay value and surface:** Insight overlay, session actions, opening/prospect hooks.
- **Gameplay/technical/balance assessment:** P2 evidence gap: insight consumers exist, but reliability, clues and opportunity cost require scenario comparison.
- **Integration and ownership:** Costs and availability constrain enhanced information; must not guarantee potential. State: Scout/session insight state, gut feelings, observations.
- **Recommended change:** Treat gut feelings as leads with uncertainty; keep any hidden-tier hint behind earned interpretation, never certainty.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A31. Recruitment briefs and openings: `youth/recruitmentBriefs.ts`, `openingCase*.ts`, `openingMode.ts`, `openingFollowUp.ts`, `veteranPrologue*.ts`, `evergreenCases.ts`, `professionalCaseOpportunities.ts`

- **Current behavior/status:** Creation/season/week/action / D+S / Active.
- **Intended purpose and inputs/outputs:** Career start/era, club needs, generated opportunity and past work → bounded cases and follow-ups.
- **Gameplay value and surface:** New Game, opening discovery, Desk, Planner.
- **Gameplay/technical/balance assessment:** P1 SYS15: opening target uses highest hidden potential and forced quality values. P2 UX02: guidance still prescribes favorable flag at inspected revision.
- **Integration and ownership:** Gives purpose to a visit; cases expose stakes, alternatives and due work. State: Opening case/prologue, youth briefs, scouting cases.
- **Recommended change:** Select an age/venue-suitable authored opening without guaranteeing talent; allow truthful unfavorable or uncertain reads.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A32. Reports, conviction and comparison: `reports/reporting.ts`, `conviction.ts`, `presentationStrategy.ts`, `comparison.ts`, `caseQuestions.ts`

- **Current behavior/status:** Submit/revise/deliver / D+S / Active.
- **Intended purpose and inputs/outputs:** Authored estimates, evidence, audience, conviction and comparisons → quality/risk/exposure and deliverable.
- **Gameplay value and surface:** Report Writer, History, Comparison.
- **Gameplay/technical/balance assessment:** P2 SYS16/UX01: report actions are being extended for pass, while some profile/desk projections continue prescribing placement.
- **Integration and ownership:** Club fit, quality, delivery context and report revisions affect consequences. State: Reports, work items and deliveries.
- **Recommended change:** Use latest case/action in follow-up copy; closed pass should be revisited deliberately or after new evidence.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A33. Case authority and accountability: `reports/scoutingCases.ts`, `caseAccountability.ts`, `reportAccountability.ts`, `scoutingCaseTimeline.ts`

- **Current behavior/status:** Action/week/season / D / Active; duplicate/reload invariants required.
- **Intended purpose and inputs/outputs:** Case state, report revision, delivery and club outcome → valid transitions, review basis and timeline.
- **Gameplay value and surface:** Desk case boards, Reports, Profile.
- **Gameplay/technical/balance assessment:** P2 SYS16: case status must remain authoritative as pass/revision/delivery/placement transitions diverge.
- **Integration and ownership:** Connects intelligence to outcome, prevents treating each revision as an independent success. State: Cases, deliveries, club decisions and accountability records.
- **Recommended change:** Validate no duplicate completion/reward and ensure latest report action drives every case projection.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A34. Placement and club fit: `youth/placement.ts`, `academyPlacementCase.ts`, `firstTeam/clubResponse.ts`, `boardAI.ts`, `systemFit.ts`

- **Current behavior/status:** Delivery/week / D+S / Active youth; first-team route Partially Active.
- **Intended purpose and inputs/outputs:** Youth eligibility, authored recommendation, club need/budget/trust and RNG → interest, delay, reject or sign.
- **Gameplay value and surface:** Report response, Club decision, alumni entry.
- **Gameplay/technical/balance assessment:** P2 evidence gap: club fit and placement decision reasons are implemented; pressure to recommend everything needs play/strategy evidence.
- **Integration and ownership:** Invokes player lifecycle, finances, career reputation and review scheduling. State: Placement reports, club decisions, signed players and cases.
- **Recommended change:** Keep affordability/pathway/evidence reasons and compare risk against expected playing opportunity.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A35. Delayed reviews and calibration: `youth/recommendationReviews.ts`, `prospectFollowUps.ts`, `scout/sourceCalibration.ts`, `judgmentCalibration.ts`

- **Current behavior/status:** Week and one-/two-season due dates / D / Active.
- **Intended purpose and inputs/outputs:** Preserved original opinion plus later appearance/movement/injury facts → due reviews, call quality and source calibration.
- **Gameplay value and surface:** Reports, Profile, follow-up Inbox/Desk.
- **Gameplay/technical/balance assessment:** P2 SYS16: passed and missed players lack complete feedback at baseline. Review dimensions already use observable outcomes.
- **Integration and ownership:** Learns which sources and decisions were reliable; does not score the user's prediction from hidden initial PA. State: Recommendation reviews, cases and source evidence.
- **Recommended change:** Add honest later feedback to passed decisions while retaining dated reviews and uncertainty when evidence is absent.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A36. Discovery/alumni memory: `career/discoveryTracking.ts`, `youth/alumni.ts`, `career/careerMoments.ts`, `chronology.ts`, `legacy*.ts`

- **Current behavior/status:** Action/week/season/retirement / D+S / Active with partial international abstraction.
- **Intended purpose and inputs/outputs:** Discovery, placement, observed career outcome and milestones → snapshots, retrospectives and legacy.
- **Gameplay value and surface:** Discoveries, Alumni, Career moments, Hall of Fame.
- **Gameplay/technical/balance assessment:** P1 award leak: wasWonderkid and wonderkidTier can announce hidden upside immediately. Obsolete accuracy helper treats hidden initialPA as prediction.
- **Integration and ownership:** Important player identity persists after exit; some alumni milestone rules are abstractions and must be labeled. State: Discovery/alumni records, chronology, moments and legacy.
- **Recommended change:** Remove dead accuracy helper, preserve diagnostic history, and use documented reports followed by observable performance for future awards.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A37. Contacts, trust and sources: `network/`, `scout/sourcePerspectives.ts`, `consequences/accessAgreements.ts`, `relationshipPosition.ts`, `relationshipIdentities.ts`

- **Current behavior/status:** Action/week / D+S / Active.
- **Intended purpose and inputs/outputs:** Meetings, reliability, prior decisions and geographic context → relationships, intel, referrals and access.
- **Gameplay value and surface:** Network, World, investigation dialogues and Inbox.
- **Gameplay/technical/balance assessment:** P2 UX03 copy concern: high-trust sources are described as rarely wrong without calibrated reliability proof.
- **Integration and ownership:** Decay, exclusivity and revoked access alter actual scouting opportunities. State: Contacts, contact intel, access agreements, relationship memories.
- **Recommended change:** Keep conflicting perspectives and show source context; soften certainty claims if calibration cannot support them.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A38. Rival scouts and organizations: `rivals/`

- **Current behavior/status:** Week/action / S / Active.
- **Intended purpose and inputs/outputs:** Persistent personalities, objectives, player interest and club context → competing discoveries, campaigns and responses.
- **Gameplay value and surface:** Rivals, Desk pressure, Inbox, World.
- **Gameplay/technical/balance assessment:** P2 evidence gap: persistent rivals advance weekly; meaningful competition frequency and frustration bounds are unmeasured.
- **Integration and ownership:** Opponents advance without direct user action; influence access, timing and signings. State: Rival scouts/organizations/activities/campaigns.
- **Recommended change:** Trace rival action to a visible opportunity/decision change and test repeated target competition.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A39. Data scouting: `data/dataActivities.ts`, `predictionTracker.ts`, `analyticsTeam.ts`, `analytics/dataTension.ts`

- **Current behavior/status:** Action/week/report / D+S / Partially Active.
- **Intended purpose and inputs/outputs:** Data skills, subscriptions, analysis actions and manager preference → statistical profiles, anomalies, predictions and analyst reports.
- **Gameplay value and surface:** Data activities and analytics surfaces gated in Youth; shared manager context remains live.
- **Gameplay/technical/balance assessment:** P2 scope gap: Data career screens are future-gated. Dead truth-fed charts coexist with live coverage/prediction infrastructure.
- **Integration and ownership:** Different evidence channel and preference weighting; does not justify exposing raw truth in charts. State: Mode-owned predictions, profiles, analysts, anomaly flags.
- **Recommended change:** DELETE traced unused chart generators; KEEP live coverage heatmap and predictionTracker, defer separate-mode certification.
- **Implementation status:** Inventory proposal implemented; focused tests and typecheck passed; integrated read-back remains root responsibility.

## A40. Career tiers, jobs and paths: `career/progression.ts`, `pathChoice.ts`, `transitions.ts`, `rolePackages.ts`, `roleProfile.ts`, `recovery.ts`

- **Current behavior/status:** Action/season/review / D+S / Active.
- **Intended purpose and inputs/outputs:** Validated work, skills, reputation, qualifications and role state → promotion, offers, club/independent path or recovery.
- **Gameplay value and surface:** Career, job offers, path and recovery choices.
- **Gameplay/technical/balance assessment:** P2 evidence gap: jobs/tiers/paths change responsibilities and stakes; long-career pacing and attainable promotions require execution.
- **Integration and ownership:** Changes authority, responsibilities, earning model and opportunity; transitions reconcile dependent state. State: Scout/job offers/reviews/career recovery, finances.
- **Recommended change:** Tie advancement assessment to delivered work, trust and accountability; test meaningful access after tier changes.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A41. Responsibilities and leadership: `career/roleResponsibilities.ts`, `leadership.ts`, `npcScouts.ts`, `management.ts`, `politicalMeetings.ts`

- **Current behavior/status:** Action/week/review / D+S / Active shared; some mode responsibilities Partially Active.
- **Intended purpose and inputs/outputs:** Tier, staff, assignments, board expectations and decisions → portfolio obligations, delegation and satisfaction.
- **Gameplay value and surface:** NPC Management, Career, board/manager cards.
- **Gameplay/technical/balance assessment:** P2 scope/evidence gap: leadership systems are role-gated; not every feature is reachable in an early Youth career.
- **Integration and ownership:** Higher rank should change work and accountability, not just XP; secondary specialization remains gated. State: NPC scouts/reports/delegations, leadership portfolio, board profile.
- **Recommended change:** Keep explicit role gates and test targeted late-career starts before declaring these player-accessible.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A42. Education and pressure: `career/courses.ts`, `developmentPressure.ts`, `performancePulse.ts`, `seasonReviewContext.ts`, `performanceAnalytics.ts`

- **Current behavior/status:** Action/week/period/season / D+S / Active.
- **Intended purpose and inputs/outputs:** Study slots, performance facts and qualifications → progress, development opportunities and review metrics.
- **Gameplay value and surface:** Training, Career, Performance and Inbox.
- **Gameplay/technical/balance assessment:** P2 evidence gap: courses and performance pressure have consumers; optimal training/grind balance is unmeasured.
- **Integration and ownership:** Opportunity cost against scouting; failure can delay role progression. State: Scout enrollment/skills, performance history/reviews.
- **Recommended change:** Compare training cost with improved information and career opportunities; retain recovery constraints.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A43. Late-career identity and ending: `career/activeCareerFronts.ts`, `careerInterventionPortfolio.ts`, `lateCareerDilemmas.ts`, `lateCareerDilemmaMaterializer.ts`, `legacySignature.ts`, `fingerprint.ts`

- **Current behavior/status:** Era/week/action/end / D+S / Active.
- **Intended purpose and inputs/outputs:** Career era, decision history and influence → material choices, legacy fingerprints and ending context.
- **Gameplay value and surface:** Career, agency choices, career moments and Hall of Fame.
- **Gameplay/technical/balance assessment:** P1 SYS18/19 evidence gap: late-career systems exist but this bounded trace does not establish satisfying endings or coherent decades of memory.
- **Integration and ownership:** Changes relationships, resources and professional story; retrospective must preserve causal facts. State: Career fronts/portfolio, consequence ledger, legacy.
- **Recommended change:** Use long-career snapshots and independent play assessment to judge earned identity and closure.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A44. Money and annualization: `finance/expenses.ts`, `core/annualization.ts`, `finance/dashboard.ts`

- **Current behavior/status:** Week/12 periods/action / D / Active.
- **Intended purpose and inputs/outputs:** Cash ledger, career path, salary, active commitments and season length → weekly/period transactions and forecasts.
- **Gameplay value and surface:** Financial Dashboard, Desk cash.
- **Gameplay/technical/balance assessment:** P1 SYS11: finance commits may rely on a later save; annualization is fixture-based and must remain so.
- **Integration and ownership:** Solvency constrains travel/staff; forecasts distinguish recurring income from lifetime totals. State: GS `finances.balance`, transactions and obligations; scout salary is a rate.
- **Recommended change:** Make durable action completion await persistence and assert ledger/reward idempotency across rollover.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A45. Equipment and infrastructure: `finance/equipmentCatalog.ts`, `equipmentBonuses.ts`, `scoutingInvestment.ts`

- **Current behavior/status:** Buy/equip/week/session / D / Active.
- **Intended purpose and inputs/outputs:** Owned items, selected loadout, capital/maintenance costs → confidence, access, travel and report bonuses.
- **Gameplay value and surface:** Equipment, Finance and session availability.
- **Gameplay/technical/balance assessment:** P2 confirmed SYS13 adjacency: owned equipment, active loadout and legacy level are different facts; liquidation must use inventory.
- **Integration and ownership:** Equipment inventory and infrastructure are distinct systems; additive modifiers require documented stacking. State: Finances equipment; GS scouting infrastructure.
- **Recommended change:** Keep active bonuses distinct from ownership, preserve old fields for saves, and derive authoritative sale value from inventory.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A46. Emergency liquidation and distress: `finance/distress.ts`, `creditScore.ts`, `loans.ts`

- **Current behavior/status:** Action/week/period / D / Broken baseline quote mismatch; repaired here using one owned-inventory quote.
- **Intended purpose and inputs/outputs:** Sustained balance, inventory, debts and processed-week IDs → escalating damage, emergency cash, credit and recovery.
- **Gameplay value and surface:** Financial Dashboard distress action, Career recovery, Inbox.
- **Gameplay/technical/balance assessment:** P2 SYS13: displayed/executed sale uses different items and rounding; legacy level fallback can mint value. Unsupported salary-advance recovery advice exists.
- **Integration and ownership:** Staff/client loss, reputation and forced-rest recovery; repeated transactions must not duplicate rewards. State: Finances distress/loan/transaction state, scout/career state.
- **Recommended change:** Implemented shared inventory quote, recognized unique owned item valuation, replay protection and matching payout; removed unsupported recovery advice.
- **Implementation status:** Inventory proposal implemented; focused tests and typecheck passed; integrated read-back remains root responsibility.

## A47. Lifestyle: `finance/lifestyle.ts`

- **Current behavior/status:** Action/period/relationship / D / Active actual effects; unsupported salary claim removed; old field Deprecated.
- **Intended purpose and inputs/outputs:** Chosen tier → cost, networking modifier and high-tier reputation penalty.
- **Gameplay value and surface:** Finance/Handbook and relationship outcomes.
- **Gameplay/technical/balance assessment:** P2 SYS14: salaryOfferBonus has no salary-generation consumer, while UI/wiki advertise salary gains.
- **Integration and ownership:** Networking is consumed in weeklyRelationshipActivities; salaryOfferBonus has no consumer. State: Finances lifestyle.
- **Recommended change:** Implemented removal of salary promise; preserve serialized field and actual expense/networking/penalty effects.
- **Implementation status:** Inventory proposal implemented; focused tests and typecheck passed; integrated read-back remains root responsibility.

## A48. Report marketplace, retainers and consulting: `finance/reportMarketplace.ts`, `retainers.ts`, `retainerBriefs.ts`, `consulting.ts`, `placementFees.ts`, `clubBonuses.ts`, `specializationIncome.ts`

- **Current behavior/status:** Action/week/period/outcome / D+S / Active shared; some specialization income Partially Active.
- **Intended purpose and inputs/outputs:** Deliverables, report quality, clients, exclusivity and outcome → offers, bids, fees and contract settlement.
- **Gameplay value and surface:** Reports, Finance contracts, Inbox.
- **Gameplay/technical/balance assessment:** P2 evidence gap: report sales, retainers and consulting have live obligations; long-run money relevance and repeat-selling incentives remain unmeasured.
- **Integration and ownership:** Resources depend on real work and fulfillment; causal recruitment opportunities retain attribution. State: Report listings, contracts, delivered IDs, revenue/transaction records.
- **Recommended change:** Measure earnings/costs and fulfillment failures at career tiers; preserve exact-once contractual effects.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A49. Agency, clients and employees: `finance/agency.ts`, `agencyCapacity.ts`, `agencyStrategy*.ts`, `agencyDilemmas.ts`, `agency-dilemmas/`, `clientRelationships.ts`, `employee*.ts`, `staffWorkReview.ts`, `analystReviews.ts`, `assistantScouts.ts`, `youthAgencySettlement.ts`

- **Current behavior/status:** Action/week/period / D+S / Active; long-career economy balance not established by wiring.
- **Intended purpose and inputs/outputs:** Office, staff skill, workloads, clients, policies and obligations → accountable work, review, capacity and settlement.
- **Gameplay value and surface:** Agency, NPC Management, Finance and staff reviews.
- **Gameplay/technical/balance assessment:** P2 scope/evidence gap: agency/staff systems are role-dependent; backend existence is not proof of an accessible or enjoyable endgame.
- **Integration and ownership:** Delegation trades expense/control for coverage; policies affect real obligations and professional reputation. State: Finances employees/clients/office/agency state; NPC and work-product state.
- **Recommended change:** Target late-career role scenarios and staff work reviews; keep simulation/state ownership instead of adding duplicate UI state.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A50. International offices and professional investment: `finance/internationalExpansion.ts`, `modifierLedger.ts`, `awards.ts`

- **Current behavior/status:** Action/week/season / D+S / Active.
- **Intended purpose and inputs/outputs:** Geography, capital, staff and achievements → presence, accountable modifiers and awards.
- **Gameplay value and surface:** Agency, World, Career and awards.
- **Gameplay/technical/balance assessment:** P2 evidence gap: office investment and modifiers have consumers; sustainable returns and runaway wealth require long careers.
- **Integration and ownership:** Overlap with regional presence must derive from persisted facts rather than duplicate mutable bonuses. State: Finances offices/investments; modifier records.
- **Recommended change:** Compare marginal access/information value with costs using ledger-backed multi-tier simulation.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A51. Narrative event producers and pacing: `events/`

- **Current behavior/status:** Week/season/action / D+S / Active.
- **Intended purpose and inputs/outputs:** World facts, prior events, era, novelty and authored candidates → selected events/chains and callbacks.
- **Gameplay value and surface:** Inbox, Desk, choice overlays and career moments.
- **Gameplay/technical/balance assessment:** P2 evidence gap: narrative producers and pacing controls are live; frequency, repetition and attachment are playtest questions.
- **Integration and ownership:** A director arbitrates candidates; legacy producers remain adapters rather than a second truth source. State: Events, storylines, event director, storyDirectorV2, era state.
- **Recommended change:** Prefer facts from recommendations, injuries and competition; measure repeated template pressure without claiming scripted stories are emergent.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A52. Consequences, obligations and stakeholder memory: `consequences/`

- **Current behavior/status:** Action/week/due date / D+S / Active.
- **Intended purpose and inputs/outputs:** Explicit decisions, conditions, due dates and world facts → applied effects, access and recurring relationship changes.
- **Gameplay value and surface:** Cases, choices, Network, Desk and retrospective context.
- **Gameplay/technical/balance assessment:** P1 SYS11 and P2 SYS16: obligations/memory must survive durable choices and passed-case transitions.
- **Integration and ownership:** Tracks why outcomes occurred, prevents repeat effects and preserves a permanent story archive before compaction. State: Consequence state, stakeholder profiles, access agreements, story archive.
- **Recommended change:** Commit consequential actions exactly once, preserve explainable provenance and link resulting messages to their originating case.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A53. Dashboard priorities: `dashboard/`, `core/weeklyStrategy.ts`, `weekPreview.ts`, `quickScout.ts`

- **Current behavior/status:** Action/render/week / D+S delegated work / Active.
- **Intended purpose and inputs/outputs:** Open cases, obligations, schedule, career stage and player intent → ranked work, previews and delegated activities.
- **Gameplay value and surface:** Desk, Planner, week simulation and batch controls.
- **Gameplay/technical/balance assessment:** P2 UX01: unsigned prospect rows derive reported from placementReports; a passed authored report can remain decision-ready with Write report/placement nudges.
- **Integration and ownership:** Presentation references facts; weekly intent/delegation must preserve decisions and action authority. State: GS dashboard UI intent/weekly strategy; authoritative source entities.
- **Recommended change:** Project latest case/report action and show passed/revisit-optional; do not reopen without new evidence or player choice.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A54. Achievements, awards and scenarios: `core/achievementEngine.ts`, `seasonAwards.ts`, `scenarios/`, `career/legacy.ts`

- **Current behavior/status:** Event/season/end / D; timestamps are metadata / Active rewards, scenarios Partially Active.
- **Intended purpose and inputs/outputs:** Tracked milestones and scenario constraints → achievements, award/ending records and exact-once completion.
- **Gameplay value and surface:** Achievements, Season Awards, Hall of Fame; scenario selector gated.
- **Gameplay/technical/balance assessment:** P1 verified: achievementEngine count uses wasWonderkid; generational achievement uses hidden tier; scenario predicates repeat both problem and country lookup gap.
- **Integration and ownership:** Build scope filters unavailable goals; rewards and scenario completion need idempotency. State: Achievement store, scenario completion state, legacy.
- **Recommended change:** Assigned follow-up: shared dated observable discovery outcome helper, truthful award copy, country-safe resolution and counterfactual hidden-state tests.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A55. Action authority and navigation

- **Current behavior/status:** Action/week / engine streams / Active.
- **Intended purpose and inputs/outputs:** `stores/gameStore.ts` composes `stores/actions/`; `gameScreenScope.ts` resolves build-safe destinations.
- **Gameplay value and surface:** GS simulation and durable session; screen selection is UI state. Screens do not own independent seasonal ticks.
- **Gameplay/technical/balance assessment:** P1 SYS10/11/12: stale async same-career result, late persistence and unowned load completion can corrupt apparent action authority.
- **Integration and ownership:** GS simulation and durable session; screen selection is UI state. Screens do not own independent seasonal ticks. State: GS simulation and durable session; screen selection is UI state. Screens do not own independent seasonal ticks.
- **Recommended change:** Bind session revision/generation, reject stale writes, reset advancement state and serialize durable mutation completion.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A56. Worker execution

- **Current behavior/status:** Week/batch / seeded / Active.
- **Intended purpose and inputs/outputs:** `weeklySimulationWorkerClient.ts`, weekly async/headless actions and worker exchange a versioned transaction plan, source and materialized result.
- **Gameplay value and surface:** Root commit still owns state; worker work must reject stale results and remain equivalent to main-thread execution.
- **Gameplay/technical/balance assessment:** P1 SYS10/18: stale worker acceptance and equivalence across execution paths require explicit transaction and soak evidence.
- **Integration and ownership:** Root commit still owns state; worker work must reject stale results and remain equivalent to main-thread execution. State: Root commit still owns state; worker work must reject stale results and remain equivalent to main-thread execution.
- **Recommended change:** Validate source fingerprint, restore recoverable advancement state and compare headless/interactive ticks.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A57. Local saves and journals

- **Current behavior/status:** Save/load/action / deterministic migration, wall-clock metadata / Active.
- **Intended purpose and inputs/outputs:** `lib/db.ts`, save envelope/provider, autosave queue and gameplay migration serialize/validate/recover GS; Dexie schema v5 has saves, archives, sync queue, leaderboard and mods.
- **Gameplay value and surface:** No normalized player/report SQL tables: these are save payload entities. Local archives preserve recoverable generations; migrations own compatibility defaults.
- **Gameplay/technical/balance assessment:** P1 SYS11/12/18: interrupted durable choices, load ownership and long-save retention need action/provider evidence.
- **Integration and ownership:** No normalized player/report SQL tables: these are save payload entities. Local archives preserve recoverable generations; migrations own compatibility defaults. State: No normalized player/report SQL tables: these are save payload entities. Local archives preserve recoverable generations; migrations own compatibility defaults.
- **Recommended change:** Await canonical persistence, invalidate obsolete completions, and test reload/duplicate action/long-career round trips.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A58. Cloud and accounts

- **Current behavior/status:** Save/account / external / Partially Active, deliberately gated.
- **Intended purpose and inputs/outputs:** `lib/cloudSave.ts`, `supabaseCloudSave.ts`, `saveProvider.ts`, auth store and active provider support optional remote copies.
- **Gameplay value and surface:** Account cloud saves disabled by `config/beta.ts` until provider recovery/deletion evidence exists; schema existence is not readiness.
- **Gameplay/technical/balance assessment:** P1 release evidence gate: optional cloud provider remains deliberately disabled pending recovery/deletion evidence.
- **Integration and ownership:** Account cloud saves disabled by `config/beta.ts` until provider recovery/deletion evidence exists; schema existence is not readiness. State: Account cloud saves disabled by `config/beta.ts` until provider recovery/deletion evidence exists; schema existence is not readiness.
- **Recommended change:** KEEP gate; local tests do not certify a remote account provider or its data lifecycle.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A59. Leaderboard and feedback

- **Current behavior/status:** Submit/event / external / Partially Active.
- **Intended purpose and inputs/outputs:** Local leaderboard, Steam mapping, `supabase/functions/submit-score`; feedback service and modal.
- **Gameplay value and surface:** Global leaderboard disabled; online feedback independently opt-in. These do not advance football simulation.
- **Gameplay/technical/balance assessment:** P2 deliberate scope gate: global leaderboard is disabled; feedback is separately opt-in and does not advance simulation.
- **Integration and ownership:** Global leaderboard disabled; online feedback independently opt-in. These do not advance football simulation. State: Global leaderboard disabled; online feedback independently opt-in. These do not advance football simulation.
- **Recommended change:** KEEP provider boundaries and certify external submission/read-back independently if enabled.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A60. Tutorial, handbook and presentation

- **Current behavior/status:** Action/render / deterministic portrait allocation / Active.
- **Intended purpose and inputs/outputs:** Tutorial store/runtime, `src/data/wiki/`, screen controls, portrait allocation, audio, settings, i18n.
- **Gameplay value and surface:** Explains mechanics and represents stable identities; guide choices do not excuse fake gameplay. Portrait state is persistent presentation identity.
- **Gameplay/technical/balance assessment:** P2 SYS14/UX02/UX03: help can advertise unsupported salary effects or prescribe favorable observations; source changes require current help review.
- **Integration and ownership:** Explains mechanics and represents stable identities; guide choices do not excuse fake gameplay. Portrait state is persistent presentation identity. State: Explains mechanics and represents stable identities; guide choices do not excuse fake gameplay. Portrait state is persistent presentation identity.
- **Recommended change:** Remove false promises; root reports tutorial fixes, evidence agent handles action/journal consistency; rendered comprehension remains unverified.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A61. Diagnostics and release tooling

- **Current behavior/status:** Test/run / reproducible seed; clocks are telemetry / Active infrastructure; results must be candidate-bound.
- **Intended purpose and inputs/outputs:** `engine/telemetry/`, weekly telemetry, `scripts/run-replayability-telemetry.mjs`, release soak and invariant suites.
- **Gameplay value and surface:** Collects timings, divergence and long-career facts. Tests are development tools, not simulated features or player rewards.
- **Gameplay/technical/balance assessment:** P1 SYS18/19: instrumentation exists but no current complete decades or independent fun evidence followed from initial source inspection.
- **Integration and ownership:** Collects timings, divergence and long-career facts. Tests are development tools, not simulated features or player rewards. State: Collects timings, divergence and long-career facts. Tests are development tools, not simulated features or player rewards.
- **Recommended change:** Publish seed/candidate/run metrics, all invariant failures and exact remaining play/provider gates; no source-only readiness score.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.

## A62. API/cron/background boundary

- **Current behavior/status:** User-requested local progress / D+S / Active offline model.
- **Intended purpose and inputs/outputs:** App routes are client entry screens. No gameplay cron or server action is required for offline world progression; only the local weekly worker advances a requested transaction.
- **Gameplay value and surface:** Supabase/Steam/feedback integration must not become a parallel simulation clock.
- **Gameplay/technical/balance assessment:** KEEP intentional architecture: no separate gameplay server tick was found; offline simulation advances on the authoritative user-requested pipeline.
- **Integration and ownership:** Supabase/Steam/feedback integration must not become a parallel simulation clock. State: saved GameState calendar and the transient weekly worker transaction.
- **Recommended change:** Preserve one simulation clock and keep external integration callbacks from independently advancing world state.
- **Implementation status:** Source inspected; confirmed issues or remaining validation are tracked above. Refer to canonical audit/report for integrated completion.
