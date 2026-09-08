# Talent Scout game system map

Baseline inspected: `5f141698b87f5964c71723f9f32381cda24df587`, 5 September 2026. This map follows source ownership and callers. It does not treat old documentation, a type declaration, a passing import, or an existing screen as proof of successful gameplay. Gameplay and long-career results belong in `GAMEPLAY_SYSTEMS_REPORT.md`.

## Reading the map

Statuses describe integration, not quality: **Active** has a production caller and an observable or simulation effect; **Partially Active** has a limited abstraction or a non-shipping mode restriction; **Unused** has no discovered production consumer; **Broken** has a confirmed behavior defect; **Deprecated** is superseded compatibility; **Placeholder** advertises or fabricates a capability without its required simulation; **Experimental** is an explicitly incomplete future design; **Dead** is obsolete executable code with no consumer. Removal and restoration decisions are recorded separately in `DEAD_CODE_AND_ABANDONED_SYSTEMS.md`.

`D` means deterministic derivation; `S` means seeded randomness, reproducible for the same inputs and stream. Random outcomes are not necessarily placeholders. `Action`, `session`, `week`, `period`, and `season` identify update frequency; a financial period is one of twelve closes distributed across the fixture-derived season, not necessarily four weeks. Most simulation data lives in one saved `GameState`, abbreviated `GS` below. A UI projection does not own a second copy of simulation truth.

The default build is Youth Scout Early Access: `src/lib/demo.ts:15` enables it unless explicitly set false. `src/stores/gameScreenScope.ts` defines every valid workspace, drill-down and future-screen fallback. The six workspaces are Desk, Planner, Prospects, Reports, World and Career. First Team, Regional and Data remain source foundations, not certified shipping modes. Demo is a separate opt-in restriction.

## Authority and the real loop

Integrated repair authority: `world/loanClosureSettlement.ts` consumes applied lifecycle events, closed loan history and preallocated message IDs once per committed week. It updates recommendation completion, inbox feedback and scout rewards without another RNG draw. `freeAgents/contractSettlement.ts` settles expired ownership after movement arbitration at the season boundary. These are stages of the existing weekly pipeline, not separate clocks or persistence stores.

Planner target availability is owned by `core/calendar.ts`; its searchable youth picker receives the complete observed active unsigned pool. `reports/reportAccountability.ts:indexLatestPlayerReports` supplies the same current judgment to planner pitch availability and `stores/actions/weeklyPlacementResolution.ts`. It includes private passes, unlike career-credit selection, which preserves earlier public stakes. These deterministic projections own no extra saved state. `observation/QuestionFocusGuide.tsx` reads the canonical question definitions to explain skill and lens fit without changing perception.

The root Zustand store composes action modules. `src/engine/core/gameStatePartitions.ts` explicitly partitions shared world, shared career and mode-owned state while preserving the saved shape. The canonical model is `src/engine/core/types.ts:1760`; split types under `core/types/` are part of the same contract, not independent databases.

The source-backed Youth loop is:

1. Start a generated career/opening case or receive a recruitment brief, contact lead, rival pressure or a prospect follow-up.
2. Use the Planner to spend limited calendar slots on a venue, inquiry, repeat visit, footage, relationship work, report work or recovery. Geographic access, costs and fatigue constrain available work.
3. Enter an observation session, choose a scouting question and focus, select evidence or dialogue, and lock decisions. Session state progresses `setup → active → reflection → complete`.
4. Preserve an initial assessment or report judgment: what the evidence supports, what remains unknown, risk, conviction and the next test. The report/case is distinct from the underlying player.
5. Deliver to a club or fulfill contracted work. A case tracks delivery, club decision, placement and accountability. A submitted report alone does not imply a signing.
6. Advance the week. Players, fixtures, injuries, transfers, relationships, finances, rival work and delayed consequences progress. Respond to new evidence, club decisions and unresolved commitments.
7. Revisit previous prospects. Season records, placement reviews, alumni milestones, performance reviews and career changes close earlier decisions and open new ones.

This is a source trace through `calendar.ts`, `observation/session.ts`, `observationActions.ts`, `reportActions.ts` and `weeklyActions.ts`; rendered play must separately confirm that the player can complete it and wants to repeat it. Scouting a player is not equivalent to revealing exact attributes: `Observation`, evidence claims, perceived ability, authored reports and player-facing selectors already exist.

Weekly ordering is explicit in `core/weeklySimulationTelemetry.ts`: activity resolution → world systems → core world tick → post-tick accountability → season rollover → finalize. `core/weeklySimulationPipeline.ts` rejects phase reordering and a completion that does not advance the date. Interactive, async and headless execution enter this shared orchestration through `stores/actions/weeklyActions.ts`, `weeklyAsyncActions.ts`, `weeklyHeadlessTransaction.ts` and `workers/weeklySimulation.worker.ts`. Tests must still establish equivalence and exactly-once effects; the phase contract alone cannot prove them.

The integrated repair adds `freeAgents/contractSettlement.ts` immediately after season-end movement arbitration: unresolved agreed renewals are rechecked after loan/transfer changes, remaining expired ownership is released, and only committed releases create free-agent rows and notices. `match/eligibleRoster.ts` is shared by detailed and abstract selection; registration, injury and suspension determine eligibility before either path ranks players. Academy cover is available when a healthy senior XI or natural goalkeeper is missing. These are active deterministic ownership rules, not a second simulation tick.

`finance/wages.ts` now owns the common ability/club-level wage curve used by generation and contracts. Existing pay anchors renewals and professional moves; unsigned intake uses the destination market. `clubEconomics.ts` retains approved wage capacity during annual reapproval, while `world/relegation.ts` applies authored funding changes once with league membership. These weekly wage limits are distinct from cash and scouting budgets. Joint roster/availability and payroll distributions are development diagnostics, with long-horizon balance tracked in the report.

## World and player simulation

Season events are owned by saved `GameState.seasonEvents`. `seasonEvents.ts` generates 21 dated calendar records, used by Planner/SeasonTimeline/Inbox and by transfer-window and regional-intensity queries. At each authoritative week, `seasonEventEffects.ts` applies only reputation and rounded scout-fatigue points. Six other serialized modifier families are compatibility-only and no longer advertised. A shared selector preserves option indices, removes duplicate/Pareto-dominated real outcomes, and requires at least two meaningful alternatives before UI, inbox, migration or resolver offers a choice. All ten currently authored pairs are suppressed; no winning choice is automatically granted. Resolved historical effects remain unchanged. Calendar/effect status: Active, deterministic; current authored choices: Deprecated; unsupported modifier promises: removed.

Club ability context is owned by the pure `players/clubAbility.ts` functions. Generation consumes the authored ability range; free-agent expiry/renewal offers consume its midpoint, avoiding a second incompatible club-level scale. Inputs: club reputation; outputs: deterministic ability range and midpoint. There is no additional saved field or random draw. Effects appear in initial squad quality and contextual renewal decisions; status: Active.

Annual recruitment funding is owned by `Club.annualRecruitmentBudget` and `lastRecruitmentAllocation` in saved GameState. New worlds use the authored club budget; legacy clubs derive a fixed stature-based baseline once. The authoritative season rollover grants that baseline plus at most 20% carryover, records returned spending authority and preserves debts. Promotion/relegation adjusts the baseline in its existing atomic transaction. The allocation is deterministic, once per season, affects affordable recruitment and is separate from wage capacity, scouting budget and the scout's personal finances. Allocation receipts are diagnostic state; player-facing consequences appear through club recruitment decisions. Status: Active implementation, long-career validation pending.

| System and source under `src/engine/` | Purpose and inputs → outputs | Dependencies and hidden simulation consequences | Player consequence / UI | State owner | Cadence / RNG / status |
|---|---|---|---|---|---|
| Run identity: `run/`, `rng/`, `content/` | Seed, mode, identity and versioned definitions → run manifest, named RNG streams and modifiers | Generation, deterministic IDs, scenario and content lookup; changes opportunity distribution across careers | New Game choices and opening context | GS `seed`, `runManifest`; static registry | Creation and event streams / D+S / Active; non-youth content Partially Active |
| World initialization: `world/init.ts`, `countryAvailability.ts`, `mapCountryRegistry.ts`; country data in `src/data/` | Selected countries and seed → clubs, leagues, rosters, fixtures, available geography | Player generation, club templates, travel eligibility; country presence must represent generated content | New Game, World map, Planner opportunities | GS `countries`, `clubs`, `leagues`, `players`, `fixtures` | Creation / S / Active |
| Player identity, attributes and potential: `players/generation.ts`, `core/types/player.ts` | Position, age, club level, country and RNG → canonical player, attributes, current/potential ability, development profile | Truth drives performances/development; IDs join reports, rosters and history | Public identity and observed estimates in Prospects/Profile; hidden ability must stay behind selectors | GS `players`, embedded `unsignedYouth.player`, later `retiredPlayers` | Intake/creation / S / Active |
| Personality and mentality: `players/personality.ts`, `personalityEffects.ts`, `personalityReveal.ts`, `behavioralTraits.ts`, `traitReveal.ts` | Generated traits and hidden modifiers plus observed contexts → match/development effects and learned traits | Professionalism, consistency, pressure and conduct affect different systems; baseline contains two overlapping reveal authorities | Character/evidence panel, report claims, match clues | Player truth plus `personalityRevealed`, profile reveal fields and observations | Creation, observation, match / S / Broken at baseline: count-based full reveal needs evidence-bound authority |
| Development and regression: `players/development.ts`, `core/weekly/playerSimulation.ts`, `world/developmentEnvironment.ts` | Age, capacity, profile, playing opportunities, club environment, traits and injury → attribute/ability deltas and environment history | Player roles, manager context, ratings and difficulty; alters future opportunities and club value | Profile Development, future observations, alumni and reviews | Player attributes/ability/history; GS match/loan/world context | Week and seasonal lifecycle / D+S / Active; calibration and decades require harness evidence |
| Injury, fatigue, form and momentum: `core/weekly/playerSimulation.ts`, `match/ratings.ts` | Age, proneness, fitness, match appearances and ratings → injuries, recovery, setbacks, form | Availability changes XI, observations, development and transfer decisions | Profile injury log and visible risk; match/World feedback | Player injury/form fields, injury history, `matchRatings` | Week/match / S / Active |
| Position and role: `players/roles.ts`, `match/tactics.ts`, `firstTeam/systemFit.ts`, `world/developmentEnvironment.ts` | Position, attributes, team style, promised role and opportunities → role fit, selection and environment assessments | Development and recruitment use different fit questions; pure quality is insufficient | Profile fit, report assessment; first-team tactics surfaces are future scope | Player position/roles; manager profiles; `systemFitCache` report/session knowledge | Observation, transfer, lineup, week / D+S / Active shared; first-team UI Partially Active |
| Fixture calendar: `world/fixtures.ts`, `core/gameDate.ts`, `core/standings.ts` | League clubs, season and results → fixture list, game dates and standings | Defines authoritative season length and completion; financial annualization depends on it | World tables, Planner; Fixture Browser future-gated | GS fixtures/leagues/current week/season | Creation, match, season / D+S / Active |
| Competition simulation: `match/phases.ts`, `ratings.ts`, `discipline.ts`, `world/abstractCompetition.ts`, `core/gameLoop.ts` | XI, attributes, context and RNG → meaningful phases, scores, ratings, card events and participation | Playing time, form, injuries, reputation and recruitment; abstract leagues intentionally have reduced detail | Youth observational events; World results; interactive first-team match UI gated | Fixtures, ratings, disciplinary records, appearance histories | Fixture/week / S / Active simulation; first-team interaction Partially Active |
| Scouting match attention: `match/focus.ts`, `observation/fullObservation.ts`, `moments.ts`, `momentReading.ts` | Underlying performance/moments, scout skill, focus and lens → contextual readings and missed information | Attention selection affects which claims can be earned; a performance is not a player truth dump | Observation pitch, focus/lens controls, evidence cards | `activeObservationSession`, committed observations | Phase/session / S / Active youth session; first-team focus mode Partially Active |
| Promotion/relegation and manager changes: `world/relegation.ts`, `managerTurnover.ts`, `clubPhilosophyTransitions.ts` | Standings, manager/club context → division movements, philosophy and directive changes | Changes opponent level, finances, academy needs and development environments | World archive, Inbox and brief context | Clubs/leagues/managers, philosophy transitions, history | Season/weekly checks / S / Active |
| Club economics and recruitment identity: `finance/clubEconomics.ts`, `world/recruitmentIdentity.ts`, `recruitmentDoctrineCatalog.ts`, `clubRecruitmentEcosystem.ts` | Budget, commitments, roster/age needs, philosophy and report → affordability and differentiated demand | Restricts signings and obligations; doctrine weights evidence, risk, age and regional reach | Briefs, eligible clubs, placement decision reasons, World dossiers | Clubs and derived doctrine; report/decision ledgers | Action/week/season / D+S / Active |
| Transfers and contracts: `recruitment/recruitmentOpportunities.ts`, `transfers/transferAgreement.ts`, `world/transfers.ts`, `transferMotivation.ts` | Report-driven interest, roster need, price, role, contract and willingness → proposals and movement intents | Budget/wage obligations, registration fit and competition; case attribution links intelligence to transfers | Report/club response and movement history; Negotiation screen future-gated | Player contract/club, club economics, transfer/decision records | Week/windows/action / D+S / Active world; direct negotiation Partially Active |
| Loans: `world/loans.ts`, `firstTeam/loanIntegration.ts`, `transfers/appearanceLedger.ts` | Player role, temporary destination and agreement → loan deal, participation, return and outcome | Development environment and wage contributions; returns must restore one authoritative roster | Player journey, placement/accountability; first-team loan recommendation controls gated | `activeLoans`, `loanHistory`, movement/appearance ledgers | Week/end date / D+S / Active world; first-team controls Partially Active |
| Free agents: `freeAgents/` | Contract expiry, discovery eligibility, clubs and player context → pool, visible candidates and negotiation state | Must not duplicate player identity; free agency and retirement share lifecycle authority | World consequences; dedicated Free Agents screen is future-gated | `freeAgentPool`, `freeAgentNegotiations`, players | Week/expiry/action / S / Partially Active |
| Retirement, aging and roster movement: `world/playerLifecycle.ts`, `transfers/retirementPlanning.ts`, `youth/generation.ts` | Age, career context, eligibility and movement intent → retirements, releases, signings, archive references | Roster/player/pool consistency is resolved centrally; population is replenished through intake, not a literal cloned regen | Player history, alumni, changing prospect pool | Live/retired players, youth pool, retired IDs, `playerMovementHistory` | Week/season/action / D+S / Active; long-run population health separately tested |
| Youth generation and academy intake: `youth/generation.ts`, `tournaments.ts`, `venues.ts` | Countries/subregions, season, club capacity, age profile and RNG → unsigned prospects, intake and events | Discovery availability, competition environments and roster replacement | Prospects, Planner, youth trials/festivals/tournaments | `unsignedYouth`, `subRegions`, `youthTournaments`, club rosters | Creation/season/event / S / Active |
| Geography, knowledge and travel: `world/travel.ts`, `regions.ts`, `regionalPresence.ts`, `territoryIdentity.ts`, `hiddenLeagues.ts` | Home base, contacts, travel posture, office/staff and earned knowledge → access, costs, penalties and local opportunities | Presence is derived from existing facts; modifies observation interpretation and discovery access | World, country dossier, Planner and career offices | Scout travel/knowledge, countries, territories, infrastructure/contacts | Action/week / D+S / Active; standalone Regional career Partially Active |
| Football culture and world conditions: `footballCulture*.ts`, `culturalCalendarState.ts`, `worldConditions.ts`, `worldConditionArcs.ts`, `worldConditionStakeholders.ts` | Seeded seasonal state, cultural learning and calendar → interpretation modifiers, windows and stakeholder pressure | Effects alter recruitment/access/development context; culture does not alter player truth merely when learned | World dossier, session context, story choices and calendar | World-condition/culture states; consequence facts | Season/week/session / D+S / Active |
| International assignments and mobility: `world/international.ts`, `internationalDeliverables.ts`, `youth/youthMobility.ts` | Career access, country coverage, deliverables and age/geography → assignment, assessment and completion | Travel/registration friction is a bounded game abstraction, not actual legal modeling | World, Planner, report/case delivery | International assignments/history; derived mobility assessment | Period/action/week / D+S / Active |
| International football selection | No national-team selection, international fixtures or authoritative call-up roster exists | Unsupported ability/random milestone generation stopped; scouting travel and international assignments remain separate | Historical recorded call-ups remain visible; no new selection claim | Historical alumni milestones and existing unlock identities | Historical only / Deprecated unsupported producer; intentional absence of national-team simulation |
| Historical world record: `world/worldHistory.ts`, `historyComparison.ts`, `worldHistoryTypes.ts`, `saveRetention.ts` | Completed fixtures, participation, movement and table outcomes → compact season archive | Retains authoritative facts without reconstructing fictional past scores; bounded compaction protects saves | World history, player journey, career retrospectives | `worldHistory`, movement ledger and archived players | Season/retention / D / Active |

## Scouting, evidence and recommendations

| System and source under `src/engine/` | Purpose and inputs → outputs | Dependencies and hidden simulation consequences | Player consequence / UI | State owner | Cadence / RNG / status |
|---|---|---|---|---|---|
| Scout creation and progression: `scout/creation.ts`, `progression.ts`, `specializations/`, `tools/` | Background, allocations, work, performance and prerequisites → skills, specialization perks and tools | Skills change confidence, discovery and judgments; unlock checks and bonuses must have real consumers | New Game, Career, Training, Equipment; unavailable secondary specs gated | GS scout, unlocked tools, finances equipment | Action/week/promotion / D+S / Active youth; other specs Partially Active |
| Evidence and uncertainty: `scout/perception.ts`, `perceivedAbility.ts`, `evidenceModel.ts`, `observationTrend.ts`, `starRating.ts` | True event/player state, skill, lens, context and prior observations → noisy readings, estimates, confidence and claims | Separates truth from learned knowledge; repeated correlated evidence should not grant certainty by itself | Profile, Report Writer, reflection and Prospects | `observations`, reports, claims and session evidence | Observation/report / S and D aggregation / Active; personality exception noted above |
| Player-safe information projections: `scout/playerFacingIntel.ts`, `career/playerFacingDiscovery.ts`, `reports/recommendationReviewDisplay.ts` | Earned observations, reports, visible injury and historical facts → charts, discovery and review views | No new truth or invented development history; prevents raw CA/PA from leaking through secondary views | Profile, Discoveries, Analytics (future-gated), reports | Derived only; source records remain in GS | Render/query / D / Active |
| Session lifecycle and focus: `observation/session.ts`, `types.ts`, `fullObservation.ts`, `informationGain.ts`, `questions.ts`, `objectives.ts` | Activity, question, phase, attention tokens and prior choices → locked focus/flags and completion | Limited attention, session completeness and repeat-work effects determine evidence earned | Observation, halftime, Reflection | `activeObservationSession`, completed activity IDs, reflection journal | Action/phase/session / D+S / Active |
| Context and situations: `observation/contextResolution.ts`, `situationCatalog.ts`, `situations.ts`, `backgroundSituation.ts`, `atmosphere.ts` | Venue, opposition, role, timing, conditions and chosen posture → contextual opportunities/readings | Distinguishes an action under pressure from an uncontested action; attention can miss simultaneous evidence | Observation pitch, context cues, event text | Session phases/situations; observation provenance | Session/phase / S / Active |
| Inquiry, analysis and quick interaction: `observation/investigation.ts`, `analysis.ts`, `quickInteraction.ts`, `interactionSelection.ts`, `inquiryConsequences.ts` | Dialogue/data/strategic choice, relationships and source context → evidence, effects and locked response | Contacts can bias evidence; choices change follow-on phase or relationship, not only text | ObservationScreen imports three live children from ObservationPhase.tsx | Session choices/resolutions, observations, relationships | Action/phase / D+S / Active; data-specific activities Partially Active |
| Reflection and authored assessment: `observation/reflection.ts`, `evidence.ts`, `reports/structuredYouthReport.ts` | Flagged moments and user classifications → journal, explicit claims, unknowns, risks and next tests | Prevents report work from silently making the scout's judgment; private notes are not scored text parsing | Reflection, Initial Assessment, Report Writer | Journal, reports/work items/cases | Session/report / D+S / Active; obsolete auto-hypothesis helper Deprecated |
| Insight and gut feelings: `insight/`, `youth/gutFeeling.ts` | Earned insight, activity scope, cooldowns and observed signals → bounded special reads and attention hooks | Costs and availability constrain enhanced information; must not guarantee potential | Insight overlay, session actions, opening/prospect hooks | Scout/session insight state, gut feelings, observations | Action/observation / D+S / Active |
| Recruitment briefs and openings: `youth/recruitmentBriefs.ts`, `openingCase*.ts`, `openingMode.ts`, `openingFollowUp.ts`, `veteranPrologue*.ts`, `evergreenCases.ts`, `professionalCaseOpportunities.ts` | Career start/era, club needs, generated opportunity and past work → bounded cases and follow-ups | Gives purpose to a visit; cases expose stakes, alternatives and due work | New Game, opening discovery, Desk, Planner | Opening case/prologue, youth briefs, scouting cases | Creation/season/week/action / D+S / Active |
| Reports, conviction and comparison: `reports/reporting.ts`, `conviction.ts`, `presentationStrategy.ts`, `comparison.ts`, `caseQuestions.ts` | Authored estimates, evidence, audience, conviction and comparisons → quality/risk/exposure and deliverable | Club fit, quality, delivery context and report revisions affect consequences | Report Writer, History, Comparison | Reports, work items and deliveries | Submit/revise/deliver / D+S / Active |
| Case authority and accountability: `reports/scoutingCases.ts`, `caseAccountability.ts`, `reportAccountability.ts`, `scoutingCaseTimeline.ts` | Case state, report revision, delivery and club outcome → valid transitions, review basis and timeline | Connects intelligence to outcome, prevents treating each revision as an independent success | Desk case boards, Reports, Profile | Cases, deliveries, club decisions and accountability records | Action/week/season / D / Active; duplicate/reload invariants required |
| Placement and club fit: `youth/placement.ts`, `academyPlacementCase.ts`, `firstTeam/clubResponse.ts`, `boardAI.ts`, `systemFit.ts` | Youth eligibility, authored recommendation, club need/budget/trust and RNG → interest, delay, reject or sign | Invokes player lifecycle, finances, career reputation and review scheduling | Report response, Club decision, alumni entry | Placement reports, club decisions, signed players and cases | Delivery/week / D+S / Active youth; first-team route Partially Active |
| Delayed reviews and calibration: `youth/recommendationReviews.ts`, `prospectFollowUps.ts`, `scout/sourceCalibration.ts`, `judgmentCalibration.ts` | Preserved original opinion plus later appearance/movement/injury facts → due reviews, call quality and source calibration | Learns which sources and decisions were reliable; does not score the user's prediction from hidden initial PA | Reports, Profile, follow-up Inbox/Desk | Recommendation reviews, cases and source evidence | Week and one-/two-season due dates / D / Active |
| Discovery/alumni memory: `career/discoveryTracking.ts`, `youth/alumni.ts`, `career/careerMoments.ts`, `chronology.ts`, `legacy*.ts` | Discovery, placement, observed career outcome and milestones → snapshots, retrospectives and legacy | Important player identity persists after exit; new performance milestones require dated post-placement minutes, goals and sustained ratings | Discoveries, Alumni, Career moments, Hall of Fame | Discovery/alumni records, chronology, moments and legacy | Action/week/season/retirement / D+S / Active; unsupported new selection announcements removed |
| Contacts, trust and sources: `network/`, `scout/sourcePerspectives.ts`, `consequences/accessAgreements.ts`, `relationshipPosition.ts`, `relationshipIdentities.ts` | Meetings, reliability, prior decisions and geographic context → relationships, intel, referrals and access | Decay, exclusivity and revoked access alter actual scouting opportunities | Network, World, investigation dialogues and Inbox | Contacts, contact intel, access agreements, relationship memories | Action/week / D+S / Active |
| Rival scouts and organizations: `rivals/` | Persistent personalities, objectives, player interest and club context → competing discoveries, campaigns and responses | Opponents advance without direct user action; influence access, timing and signings | Rivals, Desk pressure, Inbox, World | Rival scouts/organizations/activities/campaigns | Week/action / S / Active |
| Data scouting: `data/dataActivities.ts`, `predictionTracker.ts`, `analyticsTeam.ts`, `analytics/dataTension.ts` | Data skills, subscriptions, analysis actions and manager preference → statistical profiles, anomalies, predictions and analyst reports | Different evidence channel and preference weighting; does not justify exposing raw truth in charts | Data activities and analytics surfaces gated in Youth; shared manager context remains live | Mode-owned predictions, profiles, analysts, anomaly flags | Action/week/report / D+S / Partially Active |

## Career, economy and narrative

| System and source under `src/engine/` | Purpose and inputs → outputs | Dependencies and hidden simulation consequences | Player consequence / UI | State owner | Cadence / RNG / status |
|---|---|---|---|---|---|
| Career tiers, jobs and paths: `career/progression.ts`, `pathChoice.ts`, `transitions.ts`, `rolePackages.ts`, `roleProfile.ts`, `recovery.ts` | Validated work, skills, reputation, qualifications and role state → promotion, offers, club/independent path or recovery | Changes authority, responsibilities, earning model and opportunity; transitions reconcile dependent state | Career, job offers, path and recovery choices | Scout/job offers/reviews/career recovery, finances | Action/season/review / D+S / Active |
| Responsibilities and leadership: `career/roleResponsibilities.ts`, `leadership.ts`, `npcScouts.ts`, `management.ts`, `politicalMeetings.ts` | Tier, staff, assignments, board expectations and decisions → portfolio obligations, delegation and satisfaction | Higher rank should change work and accountability, not just XP; secondary specialization remains gated | NPC Management, Career, board/manager cards | NPC scouts/reports/delegations, leadership portfolio, board profile | Action/week/review / D+S / Active shared; some mode responsibilities Partially Active |
| Education and pressure: `career/courses.ts`, `developmentPressure.ts`, `performancePulse.ts`, `seasonReviewContext.ts`, `performanceAnalytics.ts` | Study slots, performance facts and qualifications → progress, development opportunities and review metrics | Opportunity cost against scouting; failure can delay role progression | Training, Career, Performance and Inbox | Scout enrollment/skills, performance history/reviews | Action/week/period/season / D+S / Active |
| Late-career identity and ending: `career/activeCareerFronts.ts`, `careerInterventionPortfolio.ts`, `lateCareerDilemmas.ts`, `lateCareerDilemmaMaterializer.ts`, `legacySignature.ts`, `fingerprint.ts` | Career era, decision history and influence → material choices, legacy fingerprints and ending context | Changes relationships, resources and professional story; retrospective must preserve causal facts | Career, agency choices, career moments and Hall of Fame | Career fronts/portfolio, consequence ledger, legacy | Era/week/action/end / D+S / Active |
| Money and annualization: `finance/expenses.ts`, `core/annualization.ts`, `finance/dashboard.ts` | Cash ledger, career path, salary, active commitments and season length → weekly/period transactions and forecasts | Solvency constrains travel/staff; forecasts distinguish recurring income from lifetime totals | Financial Dashboard, Desk cash | GS `finances.balance`, transactions and obligations; scout salary is a rate | Week/12 periods/action / D / Active |
| Equipment and infrastructure: `finance/equipmentCatalog.ts`, `equipmentBonuses.ts`, `scoutingInvestment.ts` | Owned items, selected loadout, capital/maintenance costs → confidence, access, travel and report bonuses | Equipment inventory and infrastructure are distinct systems; additive modifiers require documented stacking | Equipment, Finance and session availability | Finances equipment; GS scouting infrastructure | Buy/equip/week/session / D / Active |
| Emergency liquidation and distress: `finance/distress.ts`, `creditScore.ts`, `loans.ts` | Sustained balance, inventory, debts and processed-week IDs → escalating damage, emergency cash, credit and recovery | Staff/client loss, reputation and forced-rest recovery; repeated transactions must not duplicate rewards | Financial Dashboard distress action, Career recovery, Inbox | Finances distress/loan/transaction state, scout/career state | Action/week/period / D / Broken baseline quote mismatch; repaired here using one owned-inventory quote |
| Lifestyle: `finance/lifestyle.ts` | Chosen tier → cost, networking modifier and high-tier reputation penalty | Networking is consumed in weeklyRelationshipActivities; salaryOfferBonus has no consumer | Finance/Handbook and relationship outcomes | Finances lifestyle | Action/period/relationship / D / Active actual effects; unsupported salary claim removed; old field Deprecated |
| Report marketplace, retainers and consulting: `finance/reportMarketplace.ts`, `retainers.ts`, `retainerBriefs.ts`, `consulting.ts`, `placementFees.ts`, `clubBonuses.ts`, `specializationIncome.ts` | Deliverables, report quality, clients, exclusivity and outcome → offers, bids, fees and contract settlement | Resources depend on real work and fulfillment; causal recruitment opportunities retain attribution | Reports, Finance contracts, Inbox | Report listings, contracts, delivered IDs, revenue/transaction records | Action/week/period/outcome / D+S / Active shared; some specialization income Partially Active |
| Agency, clients and employees: `finance/agency.ts`, `agencyCapacity.ts`, `agencyStrategy*.ts`, `agencyDilemmas.ts`, `agency-dilemmas/`, `clientRelationships.ts`, `employee*.ts`, `staffWorkReview.ts`, `analystReviews.ts`, `assistantScouts.ts`, `youthAgencySettlement.ts` | Office, staff skill, workloads, clients, policies and obligations → accountable work, review, capacity and settlement | Delegation trades expense/control for coverage; policies affect real obligations and professional reputation | Agency, NPC Management, Finance and staff reviews | Finances employees/clients/office/agency state; NPC and work-product state | Action/week/period / D+S / Active; long-career economy balance not established by wiring |
| International offices and professional investment: `finance/internationalExpansion.ts`, `modifierLedger.ts`, `awards.ts` | Geography, capital, staff and achievements → presence, accountable modifiers and awards | Overlap with regional presence must derive from persisted facts rather than duplicate mutable bonuses | Agency, World, Career and awards | Finances offices/investments; modifier records | Action/week/season / D+S / Active |
| Narrative event producers and pacing: `events/` | World facts, prior events, era, novelty and authored candidates → selected events/chains and callbacks | A director arbitrates candidates; legacy producers remain adapters rather than a second truth source | Inbox, Desk, choice overlays and career moments | Events, storylines, event director, storyDirectorV2, era state | Week/season/action / D+S / Active |
| Consequences, obligations and stakeholder memory: `consequences/` | Explicit decisions, conditions, due dates and world facts → applied effects, access and recurring relationship changes | Tracks why outcomes occurred, prevents repeat effects and preserves a permanent story archive before compaction | Cases, choices, Network, Desk and retrospective context | Consequence state, stakeholder profiles, access agreements, story archive | Action/week/due date / D+S / Active |
| Dashboard priorities: `dashboard/`, `core/weeklyStrategy.ts`, `weekPreview.ts`, `quickScout.ts` | Open cases, obligations, schedule, career stage and player intent → ranked work, previews and delegated activities | Presentation references facts; weekly intent/delegation must preserve decisions and action authority | Desk, Planner, week simulation and batch controls | GS dashboard UI intent/weekly strategy; authoritative source entities | Action/render/week / D+S delegated work / Active |
| Achievements, awards and scenarios: `core/achievementEngine.ts`, `seasonAwards.ts`, `scenarios/`, `career/legacy.ts` | Tracked milestones and scenario constraints → achievements, award/ending records and exact-once completion | Build scope filters unavailable goals; rewards and scenario completion need idempotency | Achievements, Season Awards, Hall of Fame; scenario selector gated | Achievement store, scenario completion state, legacy | Event/season/end / D; timestamps are metadata / Active rewards, scenarios Partially Active |

## Runtime, persistence and support systems

| System | Inputs → outputs and integration | Ownership / consequence | Cadence / randomness / status |
|---|---|---|---|
| Action authority and navigation | `stores/gameStore.ts` composes `stores/actions/`; `gameScreenScope.ts` resolves build-safe destinations | GS simulation and durable session; screen selection is UI state. Screens do not own independent seasonal ticks | Action/week / engine streams / Active |
| Worker execution | `weeklySimulationWorkerClient.ts`, weekly async/headless actions and worker exchange a versioned transaction plan, source and materialized result | Root commit still owns state; worker work must reject stale results and remain equivalent to main-thread execution | Week/batch / seeded / Active |
| Local saves and journals | `lib/db.ts`, save envelope/provider, autosave queue and gameplay migration serialize/validate/recover GS; Dexie schema v5 has saves, archives, sync queue, leaderboard and mods | No normalized player/report SQL tables: these are save payload entities. Local archives preserve recoverable generations; migrations own compatibility defaults | Save/load/action / deterministic migration, wall-clock metadata / Active |
| Cloud and accounts | `lib/cloudSave.ts`, `supabaseCloudSave.ts`, `saveProvider.ts`, auth store and active provider support optional remote copies | Account cloud saves disabled by `config/beta.ts` until provider recovery/deletion evidence exists; schema existence is not readiness | Save/account / external / Partially Active, deliberately gated |
| Leaderboard and feedback | Local leaderboard, Steam mapping, `supabase/functions/submit-score`; feedback service and modal | Global leaderboard disabled; online feedback independently opt-in. These do not advance football simulation | Submit/event / external / Partially Active |
| Tutorial, handbook and presentation | Tutorial store/runtime, `src/data/wiki/`, screen controls, portrait allocation, audio, settings, i18n | Explains mechanics and represents stable identities; guide choices do not excuse fake gameplay. Portrait state is persistent presentation identity | Action/render / deterministic portrait allocation / Active |
| Diagnostics and release tooling | `engine/telemetry/`, weekly telemetry, `scripts/run-replayability-telemetry.mjs`, release soak and invariant suites | Collects timings, divergence and long-career facts. Tests are development tools, not simulated features or player rewards | Test/run / reproducible seed; clocks are telemetry / Active infrastructure; results must be candidate-bound |
| API/cron/background boundary | App routes are client entry screens. No gameplay cron or server action is required for offline world progression; only the local weekly worker advances a requested transaction | Supabase/Steam/feedback integration must not become a parallel simulation clock | User-requested local progress / D+S / Active offline model |

## Explicit gaps and limits

- National-team selection/matches are not implemented. Historical alumni call-ups remain readable, but no new international-selection milestones are manufactured.
- The world includes football competition, selection and roles, not user squad management or a touch-by-touch football engine. This is intentional scope, not an invitation to copy a manager game.
- Replacement academy/youth generation exists; a one-to-one identity-preserving "regen" of each retired player was not found or required.
- The supplied baseline has real causal report reviews and world histories. The removed chart history helper and discovery prediction helper were obsolete alternatives, not evidence that all history/reviews are fake.
- "Stubbed" comments in `core/types.ts` are stale for finance, events, transfer windows and scenarios: callers are the authority. Conversely, future mode roadmaps are plans, not proof that every mode has shipped.
- The map covers every engine directory below through a meaningful parent system. Module listings are inventory, not an assertion that every export is reachable. No runtime, balanced-outcome or release-ready claims follow from `Active` alone.

## Engine module inventory

The grouped inventory below is generated from source files, excluding colocated tests. All listed types, catalogs, barrels and helpers belong to the parent systems above; they are not separate player activities.

### analytics (2 modules)

`dataTension.ts`, `index.ts`.

### career (28 modules)

`activeCareerFronts.ts`, `careerInterventionPortfolio.ts`, `careerMoments.ts`, `chronology.ts`, `courses.ts`, `developmentPressure.ts`, `discoveryTracking.ts`, `fingerprint.ts`, `index.ts`, `lateCareerDilemmaMaterializer.ts`, `lateCareerDilemmas.ts`, `leadership.ts`, `legacy.ts`, `legacySignature.ts`, `management.ts`, `npcScouts.ts`, `pathChoice.ts`, `performanceAnalytics.ts`, `performancePulse.ts`, `playerFacingDiscovery.ts`, `politicalMeetings.ts`, `progression.ts`, `recovery.ts`, `rolePackages.ts`, `roleProfile.ts`, `roleResponsibilities.ts`, `seasonReviewContext.ts`, `transitions.ts`.

### consequences (18 modules)

`accessAgreements.ts`, `authoredRelationshipConflicts.ts`, `careerStoryArchive.ts`, `decisionLedger.ts`, `index.ts`, `lifecycle.ts`, `narrativeAdapter.ts`, `processor.ts`, `projection.ts`, `relationshipConflictDirector.ts`, `relationshipIdentities.ts`, `relationshipPosition.ts`, `stakeholderEcology.ts`, `stakeholderEnsembles.ts`, `stakeholderMemoryPolicy.ts`, `stakeholderProfiles.ts`, `storyThreads.ts`, `types.ts`.

### content (3 modules)

`contracts.ts`, `modeDefinitions.ts`, `registry.ts`.

### core (37 modules)

`achievementEngine.ts`, `activityInteractions.ts`, `activityMetadata.ts`, `activityQuality.ts`, `annualization.ts`, `calendar.ts`, `difficulty.ts`, `gameDate.ts`, `gameLoop.ts`, `gameStatePartitions.ts`, `index.ts`, `quickScout.ts`, `scoutPerformance.ts`, `seasonAwards.ts`, `seasonEventEffects.ts`, `seasonEvents.ts`, `standings.ts`, `transferWindow.ts`, `types/batch.ts`, `types/discovery.ts`, `types/infrastructure.ts`, `types/match.ts`, `types/negotiation.ts`, `types/networkDepth.ts`, `types/player.ts`, `types/visualization.ts`, `types/world.ts`, `types.ts`, `weekly/playerSimulation.ts`, `weekly/stateApplication.ts`, `weekly/tickPhases.ts`, `weekly/types.ts`, `weeklySimulationPipeline.ts`, `weeklySimulationTelemetry.ts`, `weeklyStrategy.ts`, `weeklyTransactionProtocol.ts`, `weekPreview.ts`.

### dashboard (8 modules)

`activeFronts.ts`, `careerStage.ts`, `careerThreads.ts`, `insights.ts`, `outcomeExplanations.ts`, `socialFronts.ts`, `state.ts`, `types.ts`.

### data (5 modules)

`analyticsTeam.ts`, `dataActivities.ts`, `index.ts`, `predictionTracker.ts`, `visualizationData.ts`.

### events (14 modules)

`careerEraCatalog.ts`, `careerEraDirector.ts`, `economicEvents.ts`, `eventChains.ts`, `eventDirector.ts`, `eventTemplates.ts`, `index.ts`, `narrativeEvents.ts`, `narrativeTruth.ts`, `specialEventDeck.ts`, `storyDirectorV2.ts`, `storylines.ts`, `weeklyStoryDirectorAdapter.ts`, `worldPulse.ts`.

### finance (42 modules)

`agency-dilemmas/contexts.ts`, `agency-dilemmas/effects.ts`, `agency-dilemmas/helpers.ts`, `agency-dilemmas/preparation.ts`, `agency-dilemmas/reconciliation.ts`, `agency-dilemmas/types.ts`, `agency.ts`, `agencyCapacity.ts`, `agencyDilemmas.ts`, `agencyStrategy.ts`, `agencyStrategyState.ts`, `analystReviews.ts`, `assistantScouts.ts`, `awards.ts`, `clientRelationships.ts`, `clubBonuses.ts`, `clubEconomics.ts`, `consulting.ts`, `creditScore.ts`, `dashboard.ts`, `distress.ts`, `employeeEconomics.ts`, `employeeEvents.ts`, `employeeSkills.ts`, `employeeWork.ts`, `equipmentBonuses.ts`, `equipmentCatalog.ts`, `expenses.ts`, `index.ts`, `internationalExpansion.ts`, `lifestyle.ts`, `loans.ts`, `modifierLedger.ts`, `placementFees.ts`, `reportMarketplace.ts`, `retainerBriefs.ts`, `retainers.ts`, `saveMigration.ts`, `scoutingInvestment.ts`, `specializationIncome.ts`, `staffWorkReview.ts`, `youthAgencySettlement.ts`.

### firstTeam (9 modules)

`boardAI.ts`, `clubResponse.ts`, `directives.ts`, `index.ts`, `loanIntegration.ts`, `negotiation.ts`, `systemFit.ts`, `tacticalStyle.ts`, `transferTracker.ts`.

### freeAgents (5 modules)

`discovery.ts`, `expiry.ts`, `index.ts`, `negotiation.ts`, `pool.ts`.

### insight (4 modules)

`actions.ts`, `effects.ts`, `insight.ts`, `types.ts`.

### match (8 modules)

`commentary.ts`, `commentaryTemplates.ts`, `discipline.ts`, `focus.ts`, `index.ts`, `phases.ts`, `ratings.ts`, `tactics.ts`.

### network (4 modules)

`contacts.ts`, `gossip.ts`, `index.ts`, `referrals.ts`.

### observation (20 modules)

`analysis.ts`, `atmosphere.ts`, `backgroundSituation.ts`, `contextResolution.ts`, `evidence.ts`, `fullObservation.ts`, `informationGain.ts`, `inquiryConsequences.ts`, `interactionSelection.ts`, `investigation.ts`, `momentReading.ts`, `moments.ts`, `objectives.ts`, `questions.ts`, `quickInteraction.ts`, `reflection.ts`, `session.ts`, `situationCatalog.ts`, `situations.ts`, `types.ts`.

### players (20 modules)

`behavioralTraits.ts`, `development.ts`, `generation.ts`, `index.ts`, `personality.ts`, `personalityEffects.ts`, `personalityReveal.ts`, `portraits/allocation.ts`, `portraits/bundledCatalog.ts`, `portraits/catalog.ts`, `portraits/gameIntegration.ts`, `portraits/identity.ts`, `portraits/index.ts`, `portraits/migration.ts`, `portraits/offline/verifyPackFiles.ts`, `portraits/requests.ts`, `portraits/state.ts`, `portraits/types.ts`, `roles.ts`, `traitReveal.ts`.

### recruitment (2 modules)

`index.ts`, `recruitmentOpportunities.ts`.

### reports (12 modules)

`caseAccountability.ts`, `caseQuestions.ts`, `comparison.ts`, `conviction.ts`, `index.ts`, `presentationStrategy.ts`, `recommendationReviewDisplay.ts`, `reportAccountability.ts`, `reporting.ts`, `scoutingCases.ts`, `scoutingCaseTimeline.ts`, `structuredYouthReport.ts`.

### rivals (8 modules)

`campaignDirectory.ts`, `campaigns.ts`, `index.ts`, `organizations.ts`, `organizationTypes.ts`, `rivalEvidence.ts`, `rivalScouts.ts`, `youthCompetition.ts`.

### rng (1 modules)

`index.ts`.

### run (4 modules)

`index.ts`, `runManifest.ts`, `scoutIdentity.ts`, `worldTraits.ts`.

### scenarios (5 modules)

`index.ts`, `scenarioAuthority.ts`, `scenarioDefinitions.ts`, `scenarioEngine.ts`, `scenarioSetup.ts`.

### scout (13 modules)

`creation.ts`, `evidenceMigration.ts`, `evidenceModel.ts`, `index.ts`, `judgmentCalibration.ts`, `observationTrend.ts`, `perceivedAbility.ts`, `perception.ts`, `playerFacingIntel.ts`, `progression.ts`, `sourceCalibration.ts`, `sourcePerspectives.ts`, `starRating.ts`.

### specializations (4 modules)

`index.ts`, `masteryPerks.ts`, `perks.ts`, `regionalKnowledge.ts`.

### telemetry (2 modules)

`performancePolicy.ts`, `replayabilityDivergence.ts`.

### tools (2 modules)

`index.ts`, `unlockables.ts`.

### transfers (5 modules)

`appearanceLedger.ts`, `index.ts`, `presentation.ts`, `retirementPlanning.ts`, `transferAgreement.ts`.

### utils (1 modules)

`textResolution.ts`.

### world (40 modules)

`abstractCompetition.ts`, `acceptedNarrativeConsequences.ts`, `clubPhilosophyTransitions.ts`, `clubRecruitmentEcosystem.ts`, `countryAvailability.ts`, `culturalCalendarState.ts`, `developmentEnvironment.ts`, `fixtures.ts`, `footballCulture.ts`, `footballCultureCalendar.ts`, `footballCulturePlaybookCatalog.ts`, `footballCulturePlaybooks.ts`, `hiddenLeagues.ts`, `historyComparison.ts`, `inboxActionAuthority.ts`, `index.ts`, `init.ts`, `international.ts`, `internationalDeliverables.ts`, `loans.ts`, `managerTurnover.ts`, `mapCountryRegistry.ts`, `playerLifecycle.ts`, `recruitmentDoctrineCatalog.ts`, `recruitmentIdentity.ts`, `recruitmentMemory.ts`, `regionalPresence.ts`, `regions.ts`, `relegation.ts`, `saveRetention.ts`, `territoryIdentity.ts`, `transferMotivation.ts`, `transfers.ts`, `travel.ts`, `worldConditionArcs.ts`, `worldConditions.ts`, `worldConditionStakeholders.ts`, `worldConditionTypes.ts`, `worldHistory.ts`, `worldHistoryTypes.ts`.

### youth (26 modules)

`academyPlacementCase.ts`, `alumni.ts`, `evergreenCases.ts`, `generation.ts`, `gutFeeling.ts`, `index.ts`, `openingCase.ts`, `openingCaseDirector.ts`, `openingCaseTypes.ts`, `openingFollowUp.ts`, `openingMode.ts`, `placement.ts`, `professionalCaseOpportunities.ts`, `prospectFollowUps.ts`, `recommendationReviews.ts`, `recruitmentBriefs.ts`, `tournaments.ts`, `venues.ts`, `veteranPrologue.ts`, `veteranPrologueSession.ts`, `veteranPrologueTypes.ts`, `youthCaseFocus.ts`, `youthCaseList.ts`, `youthDeskStakes.ts`, `youthMobility.ts`, `youthSeasonReview.ts`.

## Overhaul integration status

The map above preserves the inspected baseline. This implementation now uses season-aware birthdays, coherent bounded development and veteran decline; event-earned interactive readings, evidence-derived forecasts, polarity-aware reports and context-bound personality knowledge; invocation-owned weekly/load work and durable finance/career commits; generated opening performances with unique passage IDs; private pass receipts with observable one/two-season reviews and consistent closed-case projections; shared liquidation quotes; and retrospective discovery awards. Fixed fields/paths are documented in GAMEPLAY_SYSTEMS_AUDIT.md. The removed chart generators/wrapper are listed in the dead-code ledger. Hidden capacity remains an internal development bound, not a promised career or a player-facing reward trigger.

The canonical diagnostic runner is `node scripts/run-game-systems-diagnostics.mjs`; smoke/long profiles retain requested 1/5/10/20/30-season distributions and structural failures. It does not replace actual provider persistence or human enjoyment evidence.

### Added and restored authorities

| System / source | Purpose, inputs and outputs | Dependencies and consequences | UI / state ownership | Frequency, randomness and status |
|---|---|---|---|---|
| Action-coherent moments: `observation/momentActions.ts` and `moments.ts` | Role/context → football action → tested attributes/pressure → execution and matching prose | Player attributes and session consistency affect the same action that supplies evidence; focus changes visibility rather than football | Observation / generated session moments | Session generation / seeded / Active |
| Earned readings and forecasts: `scout/observedKnowledge.ts`, `abilityProjection.ts` | Noticed cues, skill, prior contexts and age → estimates, ranges and confidence | Interactive knowledge cannot fall back to hidden ability/potential; conflicting evidence increases uncertainty | Profile, Reports / observations and derived projections | Observed session / seeded readings, deterministic aggregation / Active |
| Observable retrospective authority: `youth/decisionReviews.ts`, `career/earnedDiscoveryOutcomes.ts` | Immutable authored decisions plus later dated participation/movement → review judgments and award eligibility | A pass can become a remembered miss; rewards require backing before demonstrated outcomes | Reviews, Career, awards / existing review and achievement ledgers | Existing season reviews / deterministic / Active |
| Authored follow-up booking: `youth/openingFollowUp.ts` | Report next test, availability and free calendar block → correct activity, duration, question and required context | Tournament and meeting choices use existing modes; unavailable tests remain pending; private passes schedule nothing | Initial assessment, Planner, live session / schedule plus report evidence assessment | Initial filing / deterministic / Active |
| Fair report bids: `finance/reportMarketplace.ts` | Report quality, scout track record, club need/budget and market → independent value and bounded offer | Asking price cannot create buyer wealth; discounts, competition and exclusivity retain economic effects | Marketplace, Inbox / listings, bids and authoritative transaction ledger | Market tick / seeded / Active |
| Durable action ownership: `stores/actions/durableGameplayCommit.ts`, `saveLoadOwnership.ts` | Current invocation and changed durable state → queued save or rejection of obsolete completion | Preserves actual choices across interruption without allowing a late career load to replace current work | Save feedback and recovery / store plus existing provider journal | Action/load / deterministic ownership, asynchronous I/O / Active |

Weekly outcome narration now shares the resolved-decision boundary with its metrics. Reflection text is derived from actual focus, cue direction and recorded interpretations. These presentation rules add no independent simulation state or hidden rewards.
