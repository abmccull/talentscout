# TalentScout world-class simulation cohesion audit and implementation closure

**Audit baseline:** July 17, 2026  
**Implementation verified:** July 18, 2026  
**Repository:** abmccull/talentscout  
**Branch:** agent/youth-scout-early-access  
**Commit base:** 49c4ba29372c873ab7bee09191bf555a42d657cb  
**Product:** Youth Scout Early Access  
**Current decision:** **Local gameplay candidate complete; hold commercial certification until the changed tree is committed, packaged as an exact candidate, and the external platform/human gates are signed off.**

## Implementation closure

The audit's five release-blocking authority breaks are closed in the current worktree. Youth Scout now has one causal simulation spine: the player observes bounded evidence, classifies it, authors a structured judgment, names the intended audience and action, and later receives consequences from the same canonical football history. Staff work, abstract competitions, alumni, transfers, courses, finance, and long-term reviews no longer create parallel facts or silently award the player credit.

This is a **9.1/10 locally verified Early Access gameplay candidate**, not a literal 10/10 commercial certification. Calling any simulation 10/10 before moderated repeat players, screen-reader users, minimum-spec hardware, signed installers, and all target operating systems have exercised the exact candidate would be false precision.

### Current scorecard

| Area | Verified score | Current verdict |
|---|---:|---|
| Live observation, attention, and evidence | 9.3/10 | Skill, focus, question, regional context, fatigue, conditions, and bounded chance produce reportable cues without exposing hidden truth |
| Structured report writing and case accountability | 9.4/10 | One deterministic evidence-to-judgment authority; no free-text scoring or weekly auto-submission |
| Weekly planning, workload, courses, and delegation | 9.0/10 | Work reserves time and creates accountable pending outputs; study has capacity and completion consequences |
| Geography, regions, travel, and secondary football worlds | 9.1/10 | Full and abstract participation feed the same movement, development, review, and history consumers |
| Transfers, contracts, loans, free agency, and retirement | 9.1/10 | Agreement terms, player/agent willingness, appearances, loans, movement history, and retirement intent form one lifecycle |
| Scout attributes, specialization, perks, and progression | 9.0/10 | Every shipped Youth perk has a runtime consumer, formula, UI explanation, and invariant test |
| Finance, independent career, staff, and agency | 9.0/10 | Staff work has provenance/review; modifier and cash-flow consequences are separated from personal authorship |
| Relationships, rivals, politics, and consequences | 8.9/10 | Strong memory and pressure systems now receive authoritative report/world inputs |
| Long-term accountability, alumni, archives, and legacy | 9.2/10 | Canonical appearances and outcomes drive every retrospective consumer |
| UI, onboarding, language, audio, accessibility, and responsive design | 9.2/10 | Guided navigation, player-facing copy, task navigator, quieter music, click feedback, and desktop/mobile evidence pass |
| Determinism, saves, retention, worker execution, and long-career stability | 9.4/10 | Exact worker materialization, bounded deltas, retained causal records, and a ten-season browser career pass |
| **Overall local Early Access readiness** | **9.1/10** | **A cohesive, deep, test-backed Youth Scout game; ready for committed-candidate QA and player validation** |

### Authority breaks closed

| Original P0 | Implemented authority | Representative implementation and proof |
|---|---|---|
| Planner auto-files player reports | Scheduled report work now reserves/advances accountable work; only explicit structured submission creates a player-authored report | `src/stores/actions/weeklyReportActivities.ts`, `src/stores/actions/reportActions.ts`, `tests/invariants/reportWorkAuthority.test.ts`, report-writing E2E |
| Employees create player-equivalent reports from hidden truth | Staff output has separate provenance, preview, review, and accountable sign-off; personal credit cannot be inferred from employee work | `src/engine/finance/staffWorkReview.ts`, `src/engine/finance/employeeWork.ts`, staff review invariant tests |
| Secondary countries have players but no football history | Bounded abstract competition creates canonical participation and ratings, including depleted-roster and academy-call-up behavior | `src/engine/world/abstractCompetition.ts`, abstract competition cross-consumer, persistence, and performance tests |
| Alumni fabricate a second performance history | Alumni, recommendation reviews, transfer motivation, retirement, profiles, and archives consume the canonical appearance ledger | `src/engine/youth/alumni.ts`, `src/engine/transfers/appearanceLedger.ts`, cross-consumer tests |
| Legacy hypotheses and structured evidence both award value | New cases use versioned structured evidence; legacy evidence migrates read-only and cannot create a second reward path | `src/engine/scout/evidenceModel.ts`, `src/engine/scout/evidenceMigration.ts`, structured evidence and migration tests |

### Additional cohesion delivered

- Transfer agreements now model club terms, squad role, wage/contract context, player and agent willingness, registration/adaptation risk, and final movement history; loans, free agency, and retirement use the same appearance and motivation facts.
- Recruitment briefs use one dynamic capacity rule at generation, weekly refresh, and post-rollover reconciliation, so changing world conditions cannot leave an impossible backlog.
- Courses, tools, infrastructure, mastery perks, Youth perks, scout development, and finance modifiers have explicit runtime consumers or were removed from the shipping promise.
- The report flow is an RPG judgment loop rather than a text box: observations unlock cues; scout skill and context affect clarity; the player chooses defensible claims, unknowns, risks, next test, conviction, audience, and action.
- The tutorial locks unrelated navigation only during the guided assignment, highlights the required control, preserves a route back, and scrolls the next required reflection action into view.
- Player-facing copy no longer describes internal phases, builders, generated state, or "the game" deciding a prospect's future. In-career Roadmap navigation was removed.
- Default music is reduced to a background level and interaction sounds provide restrained feedback with independent controls.
- Save retention preserves causal ratings while bounding growth; date, follow-up, recruitment, transfer, alumni, and competition consumers use indexes rather than repeated full-world scans.
- Weekly simulation uses persistent worker state, bounded top-level deltas, sliding array windows, exact materialization, telemetry, and a tested synchronous fallback.

### Current verification evidence

| Gate | Result |
|---|---|
| TypeScript | PASS |
| Lint | PASS, zero warnings/errors (framework deprecation notice only) |
| Architecture | PASS: 544 modules, 2,509 internal edges, zero cycles |
| Unit and invariant suite | PASS: 191 files, 1,034 tests |
| Critical coverage | PASS: 60 tests; 85.47% statements, 69.28% branches, 89.93% functions, 86.91% lines |
| Save-retention coverage | PASS: 19 tests; 74.02% statements, 74.49% branches, 56.15% functions, 81.84% lines |
| Youth perk truth table | PASS: 8/8 perks have a consumer, formula, UI explanation, and invariant proof |
| Replayability | PASS: 100 seeds x 3 seasons; exact determinism and broad event repetition rate 0.1719 |
| Asset provenance | PASS: 135/135 tracked, zero blockers |
| Critical rendered E2E | PASS: 13/13 onboarding, accessibility, opening, low-end performance, and smoke checks |
| Full Youth Scout E2E | PASS: 53/53 core flows plus one 5.3-minute organic multi-season career, zero retries |
| Current visual evidence | PASS: academy case and both interactivity capture journeys across desktop/mobile, Axe, and overflow checks |
| Browser long-career soak | PASS: 60 batches, 460 simulated weeks, season 11 reached in 13.2 minutes, zero worker fallbacks, 7.05-second worst round-trip |
| Production export | PASS: `/play` 768 kB, 875 kB first load; output in `out` |
| Windows distribution | PASS: NSIS installer built; slim runtime check passed with only `steamworks.js` packaged as a Node dependency |
| Windows supporting runtime | PASS: offline first launch/new career, packaged audio range streaming, save/quit/reopen, corrupt-newest recovery, recovery disclosure, Steam-unavailable fallback, and transactional previous generation |

### Remaining commercial release gates

These are not missing gameplay implementations, and they must not be replaced by self-authored fake evidence:

1. Commit the current tree, tag an exact candidate, rebuild the package manifest, and bind every artifact hash to that clean candidate.
2. Complete Windows Authenticode signing plus installed standard-user, installer/uninstaller, permission-denied, disk-full, network-loss, suspend/reboot, and interrupted-write checks.
3. Build and test signed/notarized macOS packages and Linux AppImage/deb packages on those operating systems.
4. Complete NVDA and VoiceOver journeys with human users.
5. Moderate the first season and repeat-report loop with both Football Manager players and simulation newcomers.
6. Exercise live Steam Cloud conflict/reconnect and legacy golden-save migration against the packaged candidate.
7. Run the separate policy-grade 20-seed, 30-season, isolated-process release soak after the candidate is clean and immutable.

The current release-evidence audit remains red by design because the worktree is dirty and the old package manifest points at another candidate. That status is evidence hygiene, not a reason to weaken the gate.

## Historical audit baseline (July 17, before implementation)

The remainder of this document preserves the original diagnosis and design specification. Scores and "current" statements below describe the pre-implementation baseline; the closure above is the authoritative present status.

TalentScout has the foundations of a distinctive and valuable football-scouting simulation. Its strongest work is genuinely strong: live observation asks the player to direct attention, classify incomplete evidence, accept uncertainty, choose who receives a recommendation, and live with delayed consequences. The football-office presentation is coherent, the weekly calendar has real opportunity cost, the relationship and consequence systems remember decisions, and the transfer lifecycle is much more substantial than a decorative market ticker.

The game is not yet one world-class simulation, however. It is currently several mature systems sharing one save. The most serious gaps are not missing content or visual polish. They are **authority breaks**: two paths can create the same supposedly meaningful artifact under different rules, one screen can promise a mechanic that no runtime system consumes, or one subsystem can fabricate an outcome that contradicts another subsystem's canonical history.

The headline examples are:

1. Planner report activities can automatically file a legacy report, choose “recommend,” grant reputation, and bypass the structured evidence-and-judgment report experience.
2. Agency employees generate ordinary ScoutReport records by sampling hidden player attributes, and those reports can enter the player's archive, satisfy client work, affect monthly reviews, reputation, and season awards.
3. Every secondary country is populated with clubs and players but deliberately receives no fixtures. Transfers and loans still treat those players and clubs as fully simulated, turning “not simulated” into “zero appearances” and false playing-time pressure.
4. Alumni pages fabricate a second set of appearances, goals, assists, and ratings instead of using the canonical match history used by recommendation reviews.
5. The new structured evidence model coexists with a legacy hypothesis model that can still create invisible hypotheses and award Insight Points even though the current reflection flow does not let the player interact with those hypotheses.

These defects strike the center of the intended fantasy: *my observations produced my judgment; my judgment influenced a real football world; that world later proved, complicated, or disproved my read*. Until every report, reward, movement, and callback follows that causal chain, more content will increase breadth faster than it increases value.

### Current readiness

| Area | Score | Verdict |
|---|---:|---|
| Live Youth observation and moment-to-moment judgment | 8.6/10 | Strong vertical slice; worth protecting |
| Report-writing interaction | 7.5/10 on the interactive path; 5.0/10 system-wide | Good new design, but the Planner bypass makes it optional |
| Weekly planning and workload | 6.6/10 | Meaningful time/fatigue loop with two major omissions |
| World, geography, and regional simulation | 6.1/10 | Rich connective tissue undermined by non-simulated secondary leagues |
| Transfers, contracts, loans, retirement | 7.1/10 | Robust lifecycle and money movement; destination consent/context remains shallow |
| Scout career and skill progression | 5.8/10 | Real XP and courses, but multiple advertised effects are cosmetic or unconsumed |
| Agency and financial play | 6.3/10 | Broad and consequential; employee-report authority leak is severe |
| Relationships, politics, and consequences | 8.3/10 | One of the most cohesive systems |
| Rival pressure and market competition | 8.0/10 | Strong, fallible, and connected |
| Long-term accountability and alumni | 5.0/10 | Excellent intent; conflicting performance histories break trust |
| Save, deterministic simulation, and automated assurance | 7.6/10 engineering; 4.5/10 release certification | Strong test base, but exact-candidate proof is currently invalid |
| **Overall world-class simulation readiness** | **6.3/10** | **Promising Early Access foundation, not yet a trustworthy paid simulation** |

This score is intentionally different from earlier rendered-design audits. Those audits correctly measured the quality of the visible presentation and interaction grammar. This audit asks a stricter question: **does every visible promise have one authoritative backend cause and one coherent downstream consequence?** On that standard, the game is materially below 9/10.

## What was audited

- 539 TypeScript/TSX source files and a generated architecture graph containing 537 modules and 2,473 internal edges.
- All 41 GameScreen destinations: 2 entry screens, 6 permanent workspaces, 21 drill-down screens, 3 support screens, and 9 Early Access future redirects.
- The complete intended loop from opening lead through planning, observation, reflection, report, delivery, club response, player movement, performance history, career review, finance, and legacy.
- Weekly time, fatigue, strategy, delegated work, courses, tools, equipment, career advancement, scout attributes, specialization perks, and mastery perks.
- Player development, injuries, contracts, transfers, loans, free agency, retirement, regions, travel, world conditions, club recruitment identities, and alumni.
- Agency employees, retainers, consulting, report sales, placement fees, sell-ons, debt, offices, infrastructure, and distress.
- Contacts, stakeholder memory, obligations, politics, rivals, narrative events, defaults, achievements, New Game+, save retention, cloud/local persistence, tutorial behavior, audio, accessibility, and responsive UI.
- Current desktop and mobile renders of the main menu, Desk, Planner, Prospects, Reports, World, Career, Inbox decisions, prospect evidence, and the structured report gate.
- Static checks, unit and invariant suites, critical/retention coverage, architecture checks, replayability telemetry, targeted Playwright rendering, the browser soak harness, asset provenance, and release-evidence certification.

No gameplay code was changed during the original audit pass. The implementation closure at the top records the subsequent remediation and current verification state; unrelated pre-existing worktree changes were preserved throughout.

## The intended causal spine

The game should have one authoritative chain:

~~~mermaid
flowchart LR
    A["Lead or recruitment brief"] --> B["Planner commitment"]
    B --> C["Live or contextual observation"]
    C --> D["Player-classified evidence"]
    D --> E["Authored assessment and uncertainty"]
    E --> F["Named audience or target club"]
    F --> G["Club, family, agent, and rival response"]
    G --> H["Canonical player movement"]
    H --> I["Canonical participation and development history"]
    I --> J["Recommendation review and career accountability"]
    J --> K["Reputation, progression, finance, and legacy"]

    B -. "Current bypass: auto-file report" .-> K
    L["Agency employee hidden-attribute sampler"] -. "Current bypass: ordinary report" .-> F
    M["Secondary league with no fixtures"] -. "Absence becomes zero performance" .-> H
    N["Synthetic alumni generator"] -. "Second performance history" .-> J
~~~

The dashed paths are the central cohesion failures. They should be removed, not balanced around.

## Release-blocking authority breaks

### P0-1 — Planner report work bypasses the report-writing game

**Evidence**

- src/engine/core/calendar.ts offers scheduled writeReport activities.
- src/stores/actions/weeklyReportActivities.ts:28-31 processes those activities during week resolution.
- Lines 81-92 call the legacy report generator and finalizer, hard-code conviction to “recommend,” create generic summary text, and file the report.
- Lines 103-116 calculate quality, grant reputation, and increment submitted-report progression.
- The interactive structured report path lives separately in ReportWriter and structuredYouthReport.

**Why this breaks the game**

The redesigned report writer asks the player to select evidence, make one supportable claim, name an uncertainty, choose a next test, and set confidence. The scheduled version makes those decisions for the player. It therefore turns the most important professional judgment in the game into optional role-play while retaining the same rewards.

It also creates a dominant low-friction strategy: schedule report work, let the week close, receive a finished recommendation and career credit. A simulation player will rationally use the easier path even if the richer path is more engaging.

**Required design**

- In Youth Scout, scheduling “Write report” creates a ReportWorkItem or reserves desk time; it must never create a submitted ScoutReport.
- The scheduled day should unlock or advance an interactive drafting session, not select claims or conviction.
- A week may close with the work explicitly deferred, but no report, reputation, client delivery, or case progression occurs until the player submits.
- Automated report creation remains valid only for non-player actors, and those artifacts must use a different staff-work-product type.

**Acceptance**

- Every player-authored Youth report contains player-selected evidence, claim, uncertainty, next test, confidence, conviction, audience, and provenance.
- No store or weekly processor can insert a player-authored report without the structured submission command.
- Manual advancement, batch advancement, save/reload, and deadline handling produce the same pending work item and never silently submit it.

### P0-2 — Agency employees create player-equivalent reports from hidden truth

**Evidence**

- src/engine/finance/employeeWork.ts:169-188 selects a player and samples target.attributes directly with skill-based noise.
- Lines 198-213 creates a normal ScoutReport with the employee ID as scoutId, a conviction, quality score, and intended client.
- src/stores/actions/weeklyEconomy.ts:269-290 inserts those reports into gameState.reports and records them as retainer and consulting deliveries.
- src/components/game/ReportHistory.tsx:767-806 treats every report in gameState.reports as one archive and includes all of them in totals, quality averages, and listing order.
- src/engine/career/performancePulse.ts:61-78 and src/engine/core/gameLoop.ts:2327-2358 use all reports for monthly quality and board/reputation feedback.
- src/engine/core/seasonAwards.ts:35-40 uses all reports from the season.

**Why this breaks the game**

The agency layer should let the player scale coverage while preserving the difference between *work I personally stand behind* and *work my organization produced*. Instead, an assistant can mint an artifact that is structurally indistinguishable from the player's work, use hidden truth unavailable to the player, fulfill revenue obligations, and inflate personal career measurements.

That makes hiring staff a potential reward exploit and destroys authorship accountability. It also conflicts directly with the new evidence philosophy: every conclusion should be traceable to observed cues and acknowledged uncertainty.

**Required design**

Create a separate ScoutingWorkProduct or StaffDossier authority with:

- authorType, employeeId, assignmentId, clientId, observation/source context, confidence, known limitations, and provenance;
- staff-specific quality and reliability, never hidden-attribute sampling presented as evidence;
- explicit player review/sign-off that costs time and creates accountability;
- a promotion command that converts approved work into a deliverable while preserving both author and reviewer;
- reward scopes separating personal craft, agency output, client fulfillment, and organizational reputation.

**Acceptance**

- Employee work cannot affect personal report count, personal report quality, personal awards, scout-authored case history, or personal board evaluation unless the player signs off.
- Every client delivery identifies the author and accountable reviewer.
- Report sales reject non-owned or unsigned staff work.
- Staff work uses observable/sourced information and never exposes hidden CA/PA or raw attributes as if observed.

### P0-3 — Secondary countries exist as full worlds without competition

**Evidence**

- src/engine/world/init.ts:153-168 creates leagues, clubs, players, territories, and subregions for selected and all secondary countries.
- Lines 170-180 deliberately skip fixture generation for every secondary country.
- src/engine/world/transferMotivation.ts:25-40 counts appearances only from played fixtures and matchRatings.
- Lines 101-107 interpret zero appearances as playing-time pressure; lines 148-155 can explain that the player is not receiving enough first-team football.
- AI destination selection in src/engine/core/gameLoop.ts:1537-1599 can select any club in state.clubs, including fixture-less leagues.
- src/engine/world/loans.ts:636-748 only records loan performance from authoritative played fixtures.
- src/engine/world/loans.ts:251-280 later labels appearance rates below 30% unsuccessful.

**Why this breaks the game**

“Not simulated” is not the same as “did not play.” The current model turns a performance-data absence into a football fact. Players in secondary leagues look underused, can transfer for reasons created by missing simulation, and any loan into those leagues accumulates zero appearances before being judged unsuccessful.

This undermines transfers, loans, development environments, recruitment memory, regional scouting, alumni, and delayed recommendation reviews at once. It also makes the map promise a broader living world than the simulation actually maintains.

**Required design**

Use one canonical participation ledger for every active league:

- Full leagues may continue to use played fixtures and matchRatings.
- Abstract leagues should generate bounded weekly/season participation, role, minutes, rating bands, injuries, and club outcomes from the same deterministic world tick.
- Contact-only regions should not own ordinary clubs/players eligible for full transfers and loans.
- Every country and league must expose a visible coverage tier: Full, Abstract, or Contact-only.
- Transfers, loans, development, recruitment memory, world history, alumni, and recommendation reviews must consume the same ledger.

**Acceptance**

- No system interprets missing competition data as zero appearances.
- A loan to an abstract league can succeed, fail, or remain neutral from the canonical abstract record.
- The same player's appearances cannot differ between profile, transfer motivation, loan review, world history, alumni, and recommendation review.
- Coverage tier is visible before the player spends travel time or recommends a destination.

### P0-4 — Alumni fabricate a second football history

**Evidence**

- src/engine/world/worldHistory.ts:181-200 derives performance only from played fixtures and explicit match participation.
- src/engine/youth/recommendationReviews.ts explicitly rejects generated alumni statistics and uses canonical season ratings, movement, and injury ledgers.
- src/engine/youth/alumni.ts:526-588 independently generates annual appearances, goals, assists, and average rating from current ability, position, injury status, and RNG.
- src/components/game/AlumniDashboard.tsx:392-397 displays that independent seasonStats array.

**Why this breaks the game**

The same player can have one public career in World History, a second record in Alumni, zero appearances for transfer/loan logic, and a third delayed recommendation interpretation. Once a player notices a contradiction, every long-term scouting payoff becomes suspect.

The alumni generator also uses current ability to create plausible output. Even if hidden ability is not printed, it lets hidden truth shape a supposedly historical record that was never produced by the world.

**Required design**

- Remove independent AlumniSeasonStats generation.
- Project alumni summaries from the canonical participation ledger and movement/injury history.
- If older saves contain synthetic alumni rows, label them legacy estimates or migrate them only when a canonical source exists; never silently merge them with authoritative history.

**Acceptance**

- Alumni, player profile, world archive, loan history, recommendation review, and career callbacks show the same appearances and clubs.
- No alumni statistic can exist without a source record and source tier.

### P0-5 — Structured evidence and legacy hypotheses both remain authoritative

**Evidence**

- The current Youth report builder writes structured evidence verdicts and currently initializes hypothesisIds as empty.
- src/engine/observation/reflection.ts:844-904 still creates suggestedHypotheses and awards two Insight Points per generated hypothesis.
- src/stores/actions/observationActions.ts:1013-1017 still exposes addSessionHypothesis.
- Existing hypotheses continue through reflectionJournal, scouting cases, evidence-board models, history, and report hypothesis links.
- The current reflection UI presents classification and structured evidence, but no normal player-facing control was found that lets the player select those generated hypotheses before the reward is banked.

**Why this breaks the game**

This is the same design problem the new report model was intended to solve: formulaically generated interpretation receives mechanical value without a meaningful player decision. It also leaves the Evidence Board displaying contacts, contexts, conflicts, and hypotheses that do not align cleanly with the new cue/claim/unknown model.

**Required design**

- Make evidence cards, claims, uncertainties, contradictions, and next tests the sole new-case authority.
- Preserve legacy hypotheses as read-only historical records for migrated saves.
- Stop generating new hypotheses and stop awarding invisible hypothesis-based Insight Points.
- Rebuild the Evidence Board around claims, source reliability, contradictions, unresolved questions, and next tests.

**Acceptance**

- Every Insight Point reward is visible, attributable to a player action, and reproducible after reload.
- New cases never create a legacy Hypothesis.
- Historical hypothesis links remain readable but cannot influence new rewards or reports.

## System-by-system audit

### 1. Opening, tutorial, and first-hour flow — 7.8/10

**Working well**

- The main menu and opening assignment now use player-facing football language rather than development-roadmap language.
- The guided tutorial locks unrelated navigation, highlights Planner, provides an off-screen warning, and includes “Return to guided step.”
- MentorOverlay scrolls highlighted controls into view.
- ReflectionScreen scrolls the completion area into view after evidence classification.
- Audio defaults now place music in the background: master 0.75, music 0.35, effects 0.8, ambience 0.35. A global click listener provides button/link/form feedback and ignores disabled controls.

**Gaps**

- The current rendered evidence journey stopped at the new report gate because an old fixture expected the later report-presentation state. That is most likely stale test setup, but it means the complete current tutorial path has not been re-certified in one uninterrupted rendered run.
- Internal terms still appear in guided surfaces and consequence presentations: “persisted policy,” “persisted record,” “generated preview,” “assessment score,” and “overclaim risk.”
- The tutorial correctly prevents accidental navigation, but the product still needs moderated proof that a new player understands why a cue is evidence, why uncertainty is retained, and what to do next.

**Action**

Refresh the first-hour E2E fixture around the structured evidence path, then test with simulation newcomers and FM players. Keep the guided lock until the first report is submitted, not merely until Planner is opened.

### 2. Live observation, attention, and evidence — 8.6/10

**Working well**

- Resolution uses scout skill, judgment, focus lens, question fit, moment quality, regional knowledge, fatigue, match conditions, halftime approach, uncertainty, and intuition.
- The player directs scarce attention instead of waiting for a deterministic attribute reveal.
- Reflection requires classification and preserves what remains unknown.
- Youth perks such as projection cues, grassroots access, network tips, trial access, and broad long-term estimates have real consumers.
- Hidden truth is generally excluded from player-facing reports and recommendation reviews.

**Gaps**

- Legacy hypotheses and invisible reflection rewards remain.
- Some generated prose is mechanical or unclear, for example “The development signal has not yet repeated across another live context” and “hidden attributes may be a concern.”
- The observation surface is one of several components over 2,000 lines, making future interaction changes risky.

**Action**

Complete the evidence-authority migration, replace simulation/developer phrasing with scout-room language, and extract phase/state components behind one observation-session command API.

### 3. Report authoring and scouting cases — 5.9/10 system-wide

**Working well**

- The interactive Youth builder is deterministic, evidence-linked, and does not depend on AI interpreting free text.
- It asks for a saved cue, supportable claim, named uncertainty, next test, confidence, conviction, and audience.
- Report validation prevents unsupported certainty and hidden-truth leakage.
- Free text can remain a private archive note without mechanical scoring.
- Revisions and delayed outcomes are modeled rather than treating every report as disposable.

**Gaps**

- Planner auto-submission bypasses the design.
- Employee reports share the same authority.
- Legacy hypotheses remain.
- InitialAssessmentBuilder exposes implementation language: “Generated preview,” “Valid,” “Overclaim risk,” “Assessment score,” and “This builder…”
- ReportHistory still mixes “notes, hypotheses, gut-feeling output,” old reports, player-authored reports, and staff reports without strong provenance.

**Action**

Create one submission command and a typed provenance model. The archive should visibly distinguish My Reports, Staff Work, External Sources, and Historical/Legacy Cases.

### 4. Planner, weekly strategy, fatigue, and delegation — 6.6/10

**Working well**

- Seven finite day slots, multi-day costs, fatigue, recovery, forced rest, action-quality variation, diminishing XP, live interactions, delegation defaults, and weekly intent create real opportunity cost.
- Skipping interactive calls retains tradeoffs instead of granting free output.
- Manual and batch advancement use an explicit phase order through the weekly simulation pipeline.

**Gaps**

- Scheduled reports auto-file.
- Active courses consume no calendar capacity despite comments and performance messaging implying study consumes time.
- Enrollment passively prevents idle-week reputation loss and supplies a neutral 50-point report/quality baseline in performance reviews.
- Placement activities can choose a player without requiring a target club, after which weeklyPlacementResolution selects eligibleClubs[0].
- weeklyActions.ts is 2,433 lines and remains the central transaction seam; the typed pipeline documents phases but does not yet own isolated domain transactions.

**Action**

Turn reports, courses, and placements into explicit pending work objects with capacity and completion rules. Decompose the week transaction behind pure domain commands while preserving exactly-once semantics.

### 5. Recruitment briefs, placements, and youth mobility — 7.3/10

**Working well**

- Recruitment briefs, club identity, development environment, relationships, evidence quality, family/education concerns, registration, adaptation, housing, and world conditions influence placement decisions.
- A club can block, request more evidence, or accept, and delayed recommendation reviews hold the original judgment accountable.

**Gaps**

- A general placement without intendedClubId or destinationClubId silently chooses the first eligible club.
- The player does not compare a shortlist of academy pathway, relationship, registration, welfare, squad congestion, and evidence-fit tradeoffs before spending the placement action.
- Secondary destination competition may be non-simulated, invalidating pathway evidence.

**Action**

Require a target audience and target club. Present a shortlist with visible uncertainties and require the player to choose a pitch posture and welfare/pathway conditions.

### 6. Regions, geography, travel, and world conditions — 6.1/10

**Working well**

- Subregions, regional knowledge, travel posture, operational presence, international assignments, development environments, recruitment identities, and world-condition arcs have real cross-system hooks.
- The map is not purely decorative; it affects access, fatigue, context, relationships, mobility, and deliverables.

**Gaps**

- Secondary leagues have no competition.
- World UI calls countries and clubs “generated” and explains that generated clubs/fixtures are “simulated,” breaking immersion and obscuring actual coverage.
- The active country count and Handbook/world claims do not give a clear Full/Abstract/Contact-only contract.
- Adaptability is described as reducing unfamiliar-region accuracy penalties, and getForeignScoutingPenalty implements it, but no runtime caller was found.
- On mobile, the assignment/dossier surface can dominate the map and makes country comparison cumbersome.

**Action**

Implement coverage tiers and the canonical participation ledger. Wire adaptability into observable uncertainty, not hidden accuracy. Replace “generated” with in-world coverage language such as “League coverage,” “Local contacts,” or “Competition detail.”

### 7. Player development, injuries, and retirement — 7.0/10

**Working well**

- Weekly development uses age, development profile, mindset, professionalism, personality, form/momentum, position/role weights, potential ceiling, development environment, injury setbacks, and rare breakthroughs.
- Attribute direction handles negative traits such as injury proneness correctly.
- Retirement and exits use the authoritative movement lifecycle and repair club ownership.

**Gaps**

- Development is broad and systemic, but many visible coaching/training/pathway changes collapse into one aggregate environment score.
- Retirement is mostly an age-probability ladder rather than a career decision arc involving contract, injuries, role, family, motivation, announcement, and possible post-playing relationships.
- Secondary leagues lack canonical competitive context.
- Alumni later overwrite the player's story with synthetic output.

**Action**

Keep the current bounded growth model, but connect named pathway events and role promises to development context. Add retirement intention and farewell states only after canonical participation is unified.

### 8. Transfers, contracts, loans, free agency, and movement lifecycle — 7.1/10

**Working well**

- resolvePlayerMovements is the authoritative mutation path for permanent transfers, loans, returns, recalls, buy options, releases, free-agent signings, youth signings, renewals, retirement, and exits.
- Reservation/priority logic prevents dual ownership and repairs club rosters.
- Fees, signing bonuses, wages, sell-ons, add-ons, loan wage obligations, affordability, contracts, and movement history are applied.
- Transfer motivation considers contract, morale, playing time, squad surplus, ambition, tactical fit, personality, and age.
- Destination scoring considers geography, reputation, squad need, manager/recruitment doctrine, age/pathway, recruitment memory, budget, and roster capacity.
- Reports delivered to the exact club can influence recruitment opportunities, and loan terms/outcomes are substantive.

**Gaps**

- AI transfers build a movement intent with player, clubs, and fee only. The lifecycle supplies defaults because AI market logic does not negotiate wage, contract length, signing bonus, role, agent demands, or add-ons.
- Destination selection has no separate player/agent acceptance, family/language adaptation, work-permit/registration, or target-country willingness stage.
- The Youth mobility engine models many of these concerns, but the general transfer engine does not.
- Secondary fixture-less leagues corrupt motivation and loan outcomes.
- The Negotiation and Free Agents screens are future-redirected in Youth EA even though underlying systems remain in the codebase.

**Action**

After fixing competition coverage, add an explainable two-sided agreement: club bid/terms, player-agent willingness, adaptation/registration, and final lifecycle commitment. Do not create a second movement mutation path.

### 9. Scout skills, specialization, perks, and career progression — 5.8/10

**Working well**

- Activities grant domain-specific XP; repetition, quality, and fatigue modify gains; carryover and multi-level progression are handled.
- Youth specialization XP and most Youth perks affect actual observation, projection, access, tips, gut feeling, placement reputation, and trial opportunities.
- Secondary specialization selection exists for higher-tier careers.
- Career tiers, job offers, employment terms, courses, promotion gates, path choices, and failure/recovery provide a broad scaffold.

**Gaps**

- Mastery perks are displayed through checkMasteryPerkUnlocks, but getMasteryPerkModifiers has no runtime consumer. Their promised signature moves are cosmetic.
- Most non-Youth specialization effect fields have definitions but no runtime consumers. That is acceptable for a tightly scoped Youth build only if the UI never promises them; it is not a full-release foundation yet.
- Memory receives XP and is described as retaining more detail from video analysis, but no simulation consumer was found.
- Adaptability has an implemented foreign penalty reducer with no caller.
- Several Insight perk fields appear unconsumed; Deep Focus has a direct path, while others remain definition-only.
- CareerScreen uses a path-neutral tier label that can show “Full-Time Club Scout · Independent.”
- Progression rewards frequently add numbers without changing what decisions the player can make.

**Action**

Create a progression contract test: every player-facing skill/perk/tool description must map to at least one runtime effect, visible feedback, and deterministic test. Prefer new verbs, extra evidence choices, reduced uncertainty, or new negotiation options over small percentage bonuses.

### 10. Courses and professional development — 5.5/10

**Working well**

- Courses have price, duration, prerequisites, tier gates, employer education budgets, qualification effects, and promotion requirements.
- Completion is deterministic and saveable.

**Gaps**

- Enrollment progresses with calendar time only; it does not reserve study days, create assessments, reduce fatigue capacity, or require player effort.
- The game simultaneously treats enrollment as productive work: it blocks idle penalties and creates a neutral monthly performance baseline.
- Comments say course work consumes time, but the Planner remains fully available.

**Action**

Reserve weekly study capacity or create a workload choice: light study takes longer, intensive study consumes days/fatigue, and missed study delays completion. Employer-sponsored time should be a visible contract benefit. Performance protection should depend on completed study obligations, not the existence of an enrollment record.

### 11. Tools, equipment, subscriptions, and infrastructure — 5.9/10

**Working well**

- Video Editor, Travel Planner, Contact Manager, Network Analyzer, and Report Templates have identifiable consumers affecting confidence, fatigue, relationships, or report effort.
- Agency infrastructure and equipment have costs, recurring effects, and a modifier ledger.

**Gaps**

- The persistent Data Subscription tool defines an accuracy bonus but the weekly data-reading path uses insight calibration rather than that tool bonus.
- Scouting App, Youth Database, and Performance Tracker are advertised but have no clear ID-specific runtime consumers beyond unlock aggregation/display.
- Three overlapping taxonomies describe similar purchases:
  - milestone tools such as Statistical Data Subscription;
  - agency data-subscription tiers and infrastructure;
  - swappable equipment such as Statistical Database Access.
- Similar overlap exists for video editing, CRM/contact management, and travel planning.
- The agency modifier ledger includes infrastructure/equipment/offices but not the persistent tool layer, making stacked effects difficult to explain.

**Action**

Use one hierarchy: career milestones unlock a category; money buys or subscribes to a tier; scarce loadout slots choose portable equipment. Project every modifier through one ledger with source, scope, cap, and player-facing explanation.

### 12. Finance, independent career, and agency — 6.3/10

**Working well**

- Salary, report sales, placement fees, sell-ons, club bonuses, retainers, consulting, employees, office/staff/satellite costs, infrastructure, credit, loans, lifestyle, distress, and recovery create actual stakes.
- Market conditions and offers are deterministic.
- Agency capacity, deadlines, contract failures, client relationship changes, and insolvency consequences prevent money from being a static score.
- Financial actions generally route player movement through the canonical lifecycle.

**Gaps**

- Employee reports bypass evidence and personal/organizational reward boundaries.
- Staff work can satisfy client delivery without player review, making organizational scale primarily a probability/output multiplier.
- Overlapping tool/subscription/equipment systems obscure ROI.
- The finance dashboard is deep, but the emotional stakes of payroll, client loss, and recovery are not always surfaced at the weekly decision point.

**Action**

Fix work-product authority first. Then make the agency loop about portfolio risk: which briefs to accept, which employee to trust, what the player signs off, where quality debt accumulates, and which client relationship is endangered.

### 13. Contacts, relationships, politics, and stakeholder memory — 8.3/10

**Working well**

- Contacts model trust, loyalty, reliability, decay, dormancy, gossip, referrals, betrayal, and exclusive windows.
- Consequence records include decisions, obligations, actor-specific memory, visibility, salience, and decay.
- Stakeholder effects connect to meetings, families, clubs, agents, academy decisions, and later career moments.
- Manual decisions and deadline defaults are designed to share the same consequence projection.

**Gaps**

- The UI occasionally presents implementation truth rather than in-world truth: “persisted consequence record,” “generated from the persisted record,” and “Transcript assembled from persisted records.”
- Some ordinary weekly consequences are still generic cards beside highly polished major moments.
- The sheer number of relationship/effect layers makes causal explanation essential; no new modifier should appear without a human-readable reason.

**Action**

Keep this architecture. Replace persistence vocabulary with source/date/stakeholder language, and expose a bounded “why this changed” trail from the authoritative consequence record.

### 14. Rivals, organizations, and market pressure — 8.0/10

**Working well**

- Rival scouts operate from fallible/public evidence, progress targets, submit reports, and can trigger canonical signings.
- Youth pressure uses public buzz, exposure, recruitment-brief competition, and actual movement history.
- Rivals can displace pending pitches or close cases, which gives delay a real cost.
- Rival organizations extend pressure beyond a single named opponent.

**Gaps**

- Pressure will feel unfair if the player's own report can be auto-filed or staff can mint hidden-truth reports; the shared evidence authority must be fixed first.
- Rival outcomes need the same coverage-tier protection in secondary countries.

**Action**

Do not broaden rival content until the player/staff/report and world-performance authorities are unified. Then use rival divergence as one of the main replayability drivers.

### 15. Narrative events, defaults, career moments, and emotional continuity — 7.8/10

**Working well**

- The event director manages cadence, semantic repetition, pressure release, linked chains, defaults, and actor-specific consequences.
- Career moments and the archive turn simulation facts into memorable callbacks without needing generative AI.
- Obligations and confidentiality can mature into later dilemmas.

**Gaps**

- Persistence/developer language breaks the fourth wall.
- The Handbook exposes exact hidden formulas and probabilities, including ability thresholds, random transfer volumes, probability values, reputation windows, and market curves. That converts a professional simulation into a solved optimization exercise.
- Presentation quality is uneven: major moments feel authored; many ordinary outcomes remain system notifications.

**Action**

Keep mechanics documentation qualitative in-career. Put exact formula documentation in a developer/modding appendix outside the career fantasy. Generate explanations from visible causes, not random-roll details.

### 16. Alumni, discoveries, recommendation reviews, achievements, and legacy — 5.8/10

**Working well**

- Discoveries and recommendation reviews preserve original conviction, evidence limits, movement, injury, and later observable outcomes.
- Reviews deliberately mark insufficient evidence rather than reading hidden potential.
- Achievements can evaluate real cases, countries, alumni, and career records; unavailable Youth achievements are filtered.
- New Game+ and career records provide long-horizon reasons to restart.

**Gaps**

- Alumni synthetic stats conflict with canonical history.
- Employee reports can inflate awards and career measurements.
- Scenario Select is a future screen, so some unlocked meta progression cannot currently be used in Youth EA.
- Achievements are meaningful as recognition, but most do not feed back into weekly strategy.

**Action**

Unify performance and authorship first. Then make legacy unlocks alter starting contacts, regional familiarity, career flaws, or opening opportunities rather than just badges.

### 17. Save, cloud, retention, migration, and deterministic execution — 7.6/10 engineering

**Working well**

- Save providers, envelopes, cloud conflict handling, checkpoints, migrations, retention, and world-history compaction are substantial.
- Architecture graph has zero import cycles.
- Manual/batch week paths share a canonical phase order.
- Critical and retention coverage are unusually strong for a game at this stage.

**Gaps**

- GameState remains one very large canonical object. gameStatePartitions returns the same object as sharedWorld, sharedCareer, mode, and rebuildableCaches; it is a read-only ownership facade, not isolated domain ownership.
- REBUILDABLE_GAME_STATE_CACHE_KEYS is empty, so every currently modeled field persists.
- weeklyActions.ts, gameLoop.ts, core/types.ts, and multiple screen components are giant change-risk surfaces.
- src/lib/localCloudSave.ts is unreachable from the current import graph while documentation still describes it as a working save path; the active stack uses saveProvider/Supabase.
- Supabase leaderboard code and the Leaderboard screen remain effectively future/dead in the Early Access build.

**Action**

Keep one persisted save envelope, but move mutation authority behind domain commands and normalized ledgers. Delete or formally archive stale save/leaderboard paths after migration verification.

### 18. Replayability and hours of play — 7.2/10 potential

**Working well**

- The 100-seed, three-season telemetry run passed deterministic same-seed checks and showed strong manifest, event, rival, and trajectory divergence.
- Event overlap was low, special trajectories were varied, and thousands of choice/rival opportunities appeared.
- Career paths, regional variation, contacts, rivals, world conditions, finances, and delayed outcomes can create substantial replay value.

**Gaps**

- Telemetry proves procedural divergence, not that observation and report decisions remain strategically different for dozens of seasons.
- Cosmetic perks, passive courses, automated reports, and synthetic histories flatten long-term mastery.
- No current evidence establishes realistic hours-to-content-exhaustion, first-season pacing, or whether repeated reports become formulaic.
- Future specializations are compiled but not playable, so they should not be counted toward Early Access value.

**Action**

Measure decision diversity, not only event diversity: report claim distributions, follow-up strategies, club-target choices, regional portfolio shapes, staff sign-off decisions, and career archetypes over full normal-play seasons. Run moderated repeat-season sessions after P0 fixes.

### 19. Accessibility, audio, controls, and responsive behavior — 8.4/10 provisional

**Working well**

- Automated accessibility checks passed the current workspaces and core dialogs with no serious/critical Axe failures.
- Mobile navigation is functional, guided navigation can be locked, overlays manage focus, reduced-motion/audio options exist, and default music is now appropriately subdued.
- Click effects provide consistent tactile feedback.

**Gaps**

- Manual NVDA and VoiceOver proof is still absent.
- Long pages create cognitive and motor burden even when technically accessible.
- Mobile World comparison is weak, and fixed/overlay surfaces can consume much of the viewport.
- Decision-critical metadata sometimes uses very small type.

**Action**

Add section navigation and task summaries to long artifacts; complete screen-reader and keyboard journeys on packaged builds.

## Architecture and state-cohesion findings

### Strong foundations

- 537 modules and 2,473 internal edges with zero cycles.
- One canonical player-movement lifecycle.
- One explicit weekly phase order.
- Deterministic RNG and seeded replayability.
- Typed, persisted causal records for reports, movements, consequences, and history.
- Strong invariant-test culture.

### Change-risk concentrations

| Module | Current size | Risk |
|---|---:|---|
| src/engine/core/types.ts | 5,799 lines | A single schema surface couples every domain and migration |
| src/engine/core/gameLoop.ts | 4,186 lines | World simulation, transfers, reputation, and seasonal behavior share one file |
| src/components/game/PlayerProfile.tsx | 3,006 lines | One screen owns too many unrelated views and state projections |
| src/components/game/ReportWriter.tsx | 2,466 lines | Core judgment UX and legacy/new modes are difficult to isolate |
| src/components/game/Dashboard.tsx | 2,458 lines | Command center risks becoming the dumping ground for every system |
| src/stores/actions/weeklyActions.ts | 2,433 lines | Highest-risk exactly-once transaction seam |
| src/components/game/CareerScreen.tsx | 2,281 lines | Progression, employment, skills, tools, and records compete |
| src/components/game/NewGameScreen.tsx | 2,152 lines | Opening configuration and tutorial complexity are tightly coupled |
| src/components/game/ObservationScreen.tsx | 2,019 lines | Core gameplay state machine is expensive to modify safely |
| src/components/game/ReportHistory.tsx | 1,980 lines | Archive, finance listings, outcomes, and multiple report authorities mix |

The architecture check currently proves cycle freedom, but the generated artifact reports no guarded modules. It therefore does not stop these modules from growing or accumulating more responsibilities.

### Authority matrix

| Artifact | Intended owner | Current competing owner/path | Required rule |
|---|---|---|---|
| Observation evidence | Observation session + player classification | Legacy suggested hypotheses | New cases use structured evidence only |
| Player-authored report | Interactive ReportWriter submission | Planner weekly auto-finalizer | Only the explicit submission command may create it |
| Staff scouting output | Agency employee assignment | Ordinary ScoutReport | Separate work-product type and sign-off |
| Club recommendation | Player-selected audience/club | First eligible club fallback | Explicit target required |
| Player movement | resolvePlayerMovements | No competing mutation path found | Preserve as sole movement authority |
| Participation/performance | Fixtures/match ratings | No data in secondary leagues; synthetic alumni stats | One Full/Abstract participation ledger |
| Personal career credit | Player-authored/reviewed work | Employee reports and passive course state | Scope every reward by author and accountable actor |
| Tool/modifier effect | Unified modifier ledger | Tools, equipment, subscriptions, infrastructure | One effect registry and explanation |
| Narrative explanation | Consequence/history record | UI-generated persistence language | Project in-world explanation from canonical facts |

## Complete screen-by-screen audit

### Entry and permanent workspaces

| Screen | Purpose and what works | Cohesion, gameplay, or UX gap | Disposition |
|---|---|---|---|
| **Main Menu** (mainMenu) | Strong football-office identity; the value proposition now speaks to discovery, evidence, and judgment. Continue/load states are clear. | “What’s Coming” is appropriate before entering a career, but Early Access/product-roadmap language should remain outside the simulation once play begins. | **Keep and polish.** Use it as the only roadmap entry point. |
| **New Career** (newGame) | Meaningful origin, strength/flaw, doctrine, specialization, country, and opening-mode choices can change the starting context. | At 2,152 lines and several viewport heights, it mixes fantasy, rules, advanced setup, and tutorial configuration. Some explanatory language still describes systems rather than lived career consequences. | **Rework hierarchy.** A short recommended setup first, optional advanced drawer, and a visible “what this changes” summary. |
| **Desk** (dashboard) | Best command-center concept: current week, live briefs, loop framing, obligations, pressure, and next work are visible. It makes separate systems feel like one job. | It is too long, especially on mobile. “1,061 in your active world” is noise when zero players are known. Secondary cards compete with the one decision the player should make next. | **Keep; compress.** One primary decision, one deadline strip, one pipeline summary, then drill-downs. |
| **Planner** (calendar) | The strongest strategic workspace after observation. Time, fatigue, intent, delegation, opportunities, and tradeoffs are visible. | It is the entry point for the auto-report bypass, passive courses are absent from capacity, and placement can omit its club target. The activity board is information-dense before a player understands priority. | **Critical rework.** Preserve the calendar; change report/course/placement contracts. |
| **Prospects** (youthScouting) | Useful case pipeline, watchlist, known/unknown distinction, and contextual empty state. It gives discovered players a professional working status. | Dossier and evidence drill-down become extremely long. Old hypothesis/contact/conflict counts do not cleanly match the new evidence model. | **Keep; rebuild evidence summary.** Add “decision readiness,” unresolved question, next action, and provenance filters. |
| **Reports** (reportHistory) | Valuable permanent archive with revision, delivery, transfer outcome, pricing, and comparison potential. Empty state routes the player back to meaningful work. | It mixes player reports, employee reports, legacy reports, hypotheses, listings, quality totals, and outcome history as if they share one authority. Staff work can distort every aggregate. | **Critical rework.** Separate authored, reviewed staff, external, and legacy artifacts before calculating metrics. |
| **World** (internationalView) | Visually distinctive; countries, clubs, assignments, regional presence, travel posture, recruitment identity, and development context can inform decisions. | “Generated” language breaks immersion. Coverage depth is unclear. Secondary leagues look alive but have no fixtures. Mobile dossiers obscure comparison and map context. | **Critical backend fix, then UI rework.** Show Full, Abstract, and Contact-only coverage. |
| **Career** (career) | Ambitious long-term hub for employment, path, attributes, specialization, mastery, qualifications, track record, equipment, finances, and legacy. | At 2,281 lines it is too broad and too long. It advertises cosmetic mastery, dead attributes/effects, and can display “Full-Time Club Scout · Independent.” Career progression reads as many meters rather than changed professional responsibility. | **Major rework.** Separate Current Role, Development, Track Record, and Business; remove every unconsumed promise. |

### Support screens

| Screen | Purpose and what works | Cohesion, gameplay, or UX gap | Disposition |
|---|---|---|---|
| **Handbook** (handbook) | Helpful searchable learning surface and a good place to explain scouting concepts. | It exposes exact internal thresholds, random counts, probabilities, reputation windows, and market formulas. Those values invite save-scumming and optimization around hidden math instead of football judgment. | **Keep, rewrite.** In-career guidance should be qualitative and example-driven. Exact mechanics belong in an optional external appendix. |
| **Roadmap** (futureRoadmap) | Useful Early Access expectation-setting on the main menu. | A permanent in-career sidebar link breaks the fiction and occupies navigation space without helping the current week. | **Remove from career navigation.** Keep on the main menu/settings/about surface only. |
| **Settings** (settings) | Strong audio, accessibility, presentation, save, and control surface. Background-music defaults and click feedback are now sensible. | Manual screen-reader and packaged-runtime validation remain open. Some technical settings copy should be checked for player-facing language. | **Keep.** It is release-worthy after platform/AT certification. |

### Drill-down and gameplay screens

| Screen | Purpose and what works | Cohesion, gameplay, or UX gap | Disposition |
|---|---|---|---|
| **Live Observation** (observation) | The core game: attention, lenses, focus, moments, fatigue, conditions, classification, and uncertainty create actual play. | Legacy hypotheses and invisible reflection IP remain; several generated phrases are robotic; component size raises regression risk. | **Protect and finish.** Make structured evidence the sole output. |
| **Opening Assignment** (openingDiscovery) | A compelling first lead and guided way to establish scout identity through action. Recent wording is much more player-facing. | The current complete tutorial has not been re-certified after the evidence redesign; product/internal terminology still appears downstream. | **Keep.** Refresh the end-to-end fixture and moderate the first hour. |
| **Player Profile / Dossier** (playerProfile) | Rich case context: development environment, unsigned-youth status, character, evidence, contacts, performance, and history. | At 3,006 lines it stacks too many domains, duplicates information available elsewhere, and creates many viewport heights of equal-weight detail. | **Recompose.** One decision summary, evidence tabs, pathway, history, and context; lazy-load deep records. |
| **Report Writer** (reportWriter) | Structured assessment is the right answer to free-text determinism. Evidence, uncertainty, confidence, audience, and conviction can create a real RPG craft loop. | Planner can bypass it. “Generated preview,” “Valid,” “Overclaim risk,” “Assessment score,” and “This builder” expose implementation language. The page is very long on mobile. | **Critical rework.** Make it mandatory for player reports and use in-world editorial language. |
| **Network** (network) | Contacts, trust, reliability, obligations, access, and relationship maintenance connect information to people. | Needs stronger prioritization of expiring promises and current-case relevance; otherwise it can become another database. | **Keep.** Lead with “who needs attention this week” and “what access is at risk.” |
| **Inbox** (inbox) | Effective global action queue. Deadlines, defaults, tradeoffs, and special decisions communicate stakes well. | As every system adds messages, it risks becoming the real game while workspaces become archives. Generic updates compete with irreversible decisions. | **Keep; add triage.** Separate Decisions, Deadlines, People, Market, and Archive; pin unresolved consequences. |
| **Colleagues / NPC Management** (npcManagement) | Source-perspective and delegated work can create contrasting opinions and leadership choices. | NPC source reports and agency employee output need explicit semantic separation. Otherwise “another opinion” and “work my firm sells” blur together. | **Keep after provenance refactor.** |
| **Discoveries** (discoveries) | Good delayed-outcome and “was I early or merely impressed?” surface. Supports career narrative. | Its credibility depends completely on canonical performance and report authorship. Synthetic alumni output would contaminate the payoff. | **Keep after world-history unification.** |
| **Performance** (performance) | Can distinguish craft quality, validated accuracy, outcomes, workload, and employer expectations. Annual review logic correctly filters player-authored reports in some paths. | Monthly pulse and board/reputation paths use all reports, so staff can improve or damage personal performance. Course-only months receive a passive baseline despite no study workload. | **Critical metrics fix.** Every score needs author, period, source, and reason. |
| **Alumni** (alumniDashboard) | Excellent long-term fantasy: follow players, see pathways, build a contact legacy, and revisit calls. | The displayed season stats are independently fabricated from ability and RNG, contradicting world history and recommendation reviews. | **Critical rewrite.** Read only the canonical performance ledger. |
| **Finances** (finances) | Deep but understandable categories, cashflow, client revenue, obligations, credit, distress, and recovery. It can create real stakes without requiring double-entry accounting. | Staff-report exploitation and overlapping modifier systems distort profitability. Some consequences arrive after the decision rather than being forecast at the weekly choice. | **Keep; fix authority and forecasting.** |
| **Achievements** (achievements) | Recognizes real milestones; Youth-unavailable achievements are filtered; supports long-term goals. | Primarily retrospective. Some meta unlocks point at future screens unavailable in Early Access. | **Keep, narrow to playable promises.** Favor unlocks that change a future career start. |
| **Hall of Fame** (hallOfFame) | Strong long-term collection and identity surface. | Any ranking built on synthetic alumni stats or employee-inflated reports is untrustworthy. | **Keep after authority fixes.** |
| **Demo End** (demoEnd) | Useful for a time-limited demo build. | A paid Early Access product should not expose a demo boundary in normal careers. It adds another product-state branch to maintain. | **Build-gate it.** Exclude from paid EA and retain only for an explicit demo SKU. |
| **Equipment** (equipment) | Loadout choice can support specialization and tradeoffs. | It overlaps persistent tools, subscriptions, infrastructure, CRM, travel, video, and data systems. Several advertised bonuses lack consumers. | **Consolidate.** Keep only scarce/swappable gear here. |
| **Agency** (agency) | Substantial management game: staff, assignments, capacity, clients, retainers, offices, infrastructure, events, and financial pressure. | Employee output becomes ordinary hidden-truth reports and personal career credit. This is the single largest agency design defect. | **Critical work-product refactor.** |
| **Week Simulation** (weekSimulation) | Day-by-day resolution, live calls, delegation, quality, and skipped-action tradeoffs make advancement feel consequential rather than a loading screen. | Some copy says “persisted policy”; current long-career browser proof fails because the soak test calls an async helper without awaiting it. | **Keep.** Rewrite copy and repair certification harness. |
| **Training / Courses** (training) | Cost, prerequisites, duration, qualification effects, education budget, and promotion gates are clear. | Enrollment requires no weekly time or interaction but protects reputation/performance. It is a purchase-and-wait screen rather than development gameplay. | **Major rework.** Add study workload, pace, assessment, and employer-time tradeoffs. |
| **Rivals** (rivals) | Named competition, public evidence, target races, report progress, and canonical signings create urgency. | Must use the same world coverage and report provenance as the player; otherwise pressure can feel arbitrary. | **Keep.** One of the stronger connected systems. |
| **Report Comparison** (reportComparison) | Useful for calibration and shortlist decisions; can turn reports into strategic choices rather than archive entries. | It needs comparable source types and evidence freshness. Comparing a player-authored case with a hidden-truth employee report is invalid. | **Keep after provenance refactor.** |
| **Season Awards** (seasonAwards) | Gives seasonal rhythm, recognition, and replay goals. | getSeasonReports includes all reports, so employee output can inflate personal awards and volume. | **Fix scope.** Separate individual, agency, and world awards. |

### Early Access future redirects

These screens are compiled and deliberately redirected by gameScreenScope. That protects the current UX, but maintaining nine unavailable feature chunks still creates drift and misleading backend assumptions.

| Screen | Current state | Audit decision |
|---|---|---|
| **Match** (match) | Redirects to Planner; underlying full-match concepts remain in the codebase. | Keep unavailable. Youth observation is the product; do not reintroduce match management. |
| **Match Summary** (matchSummary) | Redirects to Planner. | Keep unavailable; observation reflection should own the relevant summary. |
| **Player Database** (playerDatabase) | Redirects to Prospects. | Correct for Youth EA. Unknown players should not become a browsable omniscient database. |
| **Leaderboard** (leaderboard) | Redirects to Career; Supabase leaderboard path is effectively unused. | Remove from EA bundle/docs or formally mark post-EA. |
| **Analytics** (analytics) | Redirects to Career; several Data specialization effects remain unconsumed. | Do not count toward value until Data mode has its own evidence game. |
| **Fixture Browser** (fixtureBrowser) | Redirects to Planner. | Keep unavailable until league coverage tiers and abstract competition are coherent. |
| **Scenario Select** (scenarioSelect) | Redirects to Main Menu despite scenario/meta unlock records. | Either expose a finished Youth challenge mode from the menu or stop awarding unusable scenario unlocks. |
| **Negotiation** (negotiation) | Redirects to Desk; underlying negotiation actions exist. | Keep out of Youth EA unless recommendations intentionally lead to player-facing deal work. General AI transfers still need non-screen negotiation logic. |
| **Free Agents** (freeAgents) | Redirects to Desk; underlying lifecycle exists. | Keep out of scope. Free-agent movement should continue in the world without becoming a separate player job. |

## Rendered design and UX scorecard

This scorecard uses the Global Design Auditor's 12 dimensions plus System Cohesion. Scores reflect the current rendered workspaces **and** whether their visible hierarchy truthfully represents the underlying game.

| Dimension | Score | Evidence-backed judgment |
|---|---:|---|
| Visual hierarchy | 7.8 | Opening, Inbox choices, and observation have strong focal questions; Desk, Career, dossier, and report pages are overlong and distribute emphasis too evenly. |
| Layout and spacing | 6.8 | Desktop is polished; mobile remains functional but requires excessive vertical travel and weakens repeat-week prioritization. |
| Typography | 7.8 | Brand hierarchy is strong; dense metadata and decision explanations frequently become small, compact text. |
| Color and contrast | 8.6 | Emerald/amber/rose/cyan roles are consistent and automated accessibility passed; photographic/map surfaces still need manual verification. |
| Components and states | 8.3 | Cards, dialogs, badges, tabs, and decisions share one grammar; very large screens combine too many component responsibilities. |
| Interaction and feedback | 8.0 | Observation, choices, travel posture, and click/audio feedback are good; passive courses and auto-reports are false interaction depth. |
| Information architecture and navigation | 7.2 | Six permanent workspaces are understandable; in-career Roadmap, huge drill-downs, and Inbox centralization weaken the model. |
| Task-flow design | 6.5 | The visible Find → Verify → Recommend → Track loop is excellent, but background paths can skip Verify/Recommend while granting the same result. |
| Accessibility and inclusive UX | 8.5 provisional | Automated Axe and keyboard-responsive work are strong; manual NVDA/VoiceOver, packaged builds, and long-page cognitive burden remain open. |
| Imagery and iconography | 8.8 | Football-office photography, pitch, map, notebook, and career-record treatments reinforce the role. |
| Brand visual system | 9.0 | TalentScout has a distinct professional scouting identity rather than a generic dashboard aesthetic. |
| Emotional trust and polish | 6.9 | Major moments are evocative, but fourth-wall copy and conflicting histories can destroy trust more quickly than visual polish builds it. |
| **System Cohesion** | **5.7** | Strong visible grammar masks report, performance, authorship, progression, and world-history authority breaks. |

No visual score should be used as a release override for an authority defect. A beautifully presented false career history is worse than a plain but trustworthy one.

## Duplicate, legacy, dead, and conflicting functionality

| Area | Evidence | Classification | Required cleanup |
|---|---|---|---|
| Structured evidence vs legacy hypotheses | New Youth verdicts plus old reflectionJournal/suggestedHypotheses/addSessionHypothesis | **Conflicting authority** | New cases use structured evidence only; migrate old hypotheses read-only |
| Interactive report vs weekly auto-report | ReportWriter submission plus weeklyReportActivities auto-finalizer | **Conflicting authority** | Replace auto-finalization with pending report work |
| Player reports vs employee reports | Both stored as ScoutReport and consumed by shared metrics | **Conflicting authority** | Separate staff work product and sign-off |
| Canonical ratings vs AlumniSeasonStats | World/review ratings plus independent alumni generator | **Conflicting truth** | One participation/performance ledger |
| Full-looking secondary worlds vs no fixtures | Clubs/players exist; fixture generation skipped | **Incomplete abstraction** | Explicit Full/Abstract/Contact-only tiers |
| Persistent tools vs equipment vs subscriptions vs infrastructure | Similar data, video, CRM, and travel effects across four catalogs | **Conceptual duplication** | One unlock/purchase/loadout hierarchy and modifier ledger |
| Mastery perk display vs runtime modifiers | Unlocks displayed; getMasteryPerkModifiers has no consumer | **Cosmetic/dead mechanic** | Implement effects or remove promises |
| Memory attribute | Gains XP/display; no simulation consumer found | **Dead progression promise** | Wire to observable recall/evidence or remove |
| Adaptability foreign penalty | getForeignScoutingPenalty exists; no caller found | **Orphan implementation** | Use in evidence uncertainty or remove |
| Non-Youth specialization effect fields | Many definitions have no consumers | **Future scaffolding presented as mechanics** | Hide from Youth; require consumer tests before full release |
| Unlockable Data Subscription accuracy | Bonus defined; weekly data path does not consume tool bonus | **Orphan modifier** | Route through unified ledger or remove |
| localCloudSave.ts | Unreachable in current import graph; docs describe working cloud save while saveProvider/Supabase is active | **Stale duplicate path** | Verify migrations, then delete/archive and correct docs |
| Supabase leaderboard | Unused/future screen redirect | **Dormant feature** | Remove from EA bundle/docs or place behind explicit future build flag |
| Future screens | Nine redirected screens remain compiled | **Scope/debt risk** | Enforce build-level code splitting or exclude future modules from EA |
| Roadmap in career nav | Product-development screen inside simulation | **Immersion conflict** | Main menu/settings only |
| Exact formulas in Handbook | Internal thresholds and probabilities | **Design/confidence leak** | Qualitative in-world guidance only |
| Persistence language in UI | “persisted consequence record,” “generated from persisted records” | **Fourth-wall leak** | Replace with source, date, witness, and career-record language |
| GameState partitions | Every facade points to the same GameState object | **Transitional architecture, not true isolation** | Move mutation behind domain commands; retain save compatibility |

Not every unreachable file is dead. Barrel exports, telemetry, and localization may be intentionally indirect. The cleanup should target verified duplicate authority and stale product paths, not indiscriminate deletion.

## Historical functional verification and release evidence

### Passing evidence

| Check | Result |
|---|---|
| TypeScript | PASS |
| Lint | PASS, with Next.js lint deprecation warning |
| Architecture | PASS: 537 modules, 2,473 internal edges, zero cycles |
| Critical coverage | PASS: 7 files, 60 tests; 85.44% statements, 69.28% branches, 89.80% functions, 86.89% lines |
| Retention coverage | PASS: 18 tests; 73.96% statements, 74.60% branches, 55.81% functions, 81.79% lines |
| Unit/invariant suite | PASS: 177 files, 989 tests |
| Replayability release telemetry | PASS: 100 seeds × 3 seasons |
| Asset provenance | PASS: 135 assets, no blockers, approximately 66.8 MB |
| Targeted rendered accessibility/performance subset | 9 passed; accessibility and low-end checks passed |
| Existing current-worktree Youth E2E evidence | 53 core tests plus the organic-career journey passed earlier in the current worktree; smoke and focused visual/accessibility checks also passed |

Replayability details:

- Same-seed determinism was exact.
- Manifest, composite, and event uniqueness were 1.0.
- Special-trajectory uniqueness was 0.92.
- Catalog coverage was 0.878.
- Average trajectory distance was 0.9523; average event overlap was 0.0477.
- 4,819 choice opportunities and 3,593 rival opportunities were recorded.
- Exact adjacent event repetition was zero.

This is strong procedural evidence. It does **not** prove that authored observation/report strategy, agency choices, or long-term career play remain non-formulaic for the player.

### Failed or stale evidence

| Check | Result | Interpretation |
|---|---|---|
| Youth perk audit script | FAIL | The script expects an old test title about a bounded PA estimate; the test now correctly describes a broad cue-derived projection. All eight Youth perk paths were present. Tooling contract is stale. |
| Targeted visual report flow | 1 failure | Old fixture expected the report-presentation room; the new evidence gate correctly stopped a case with no classified moment. Refresh the fixture before treating later states as certified. |
| Browser long-career soak | FAIL at S1W1 | e2e/regression/long-career-invariants.spec.ts calls asynchronous batchAdvance without await before asserting progress. This invalidates the browser proof; it does not establish a simulation failure. |
| Release evidence audit | 26 failures | Dirty tree, no exact tag, stale candidate manifest/hash, incomplete Windows hash, missing macOS/Linux, stale automation, missing NVDA/VoiceOver/usability/hardware attestations, missing packaged-runtime certification, and malformed/stale soak evidence. |

### Release interpretation

The codebase has strong engineering checks, but the current state is **not release-certifiable**. Passing unit tests and a production build cannot compensate for:

- invalid exact-candidate provenance;
- a broken browser-soak harness;
- stale fixtures after a core report redesign;
- missing packaged platform proof;
- missing human usability and screen-reader evidence;
- unresolved systemic authority breaks that current tests do not assert.

## Implemented remediation plan (historical specification)

### Phase 0 — Lock the simulation authorities

| Priority | Work | Impact | Effort | Dependency / caution |
|---:|---|---|---:|---|
| 1 | Replace weekly report auto-finalization with ReportWorkItem and one player submission command | Restores the core gameplay loop | L | Must migrate scheduled reports without losing calendar state |
| 2 | Introduce StaffWorkProduct, author/reviewer provenance, and player sign-off | Stops agency reward and hidden-truth leakage | L | Retainer/consulting metrics and archive filters must migrate together |
| 3 | Add Full/Abstract/Contact-only competition coverage and one participation ledger | Repairs transfers, loans, development, regions, and outcomes | XL | Do not simulate full fixtures everywhere; bounded abstract records are sufficient |
| 4 | Replace AlumniSeasonStats generation with canonical projections | Restores long-term trust | M | Legacy synthetic rows need explicit migration policy |
| 5 | End new legacy hypothesis generation and invisible rewards | Completes the evidence redesign | M | Preserve historical links read-only |
| 6 | Add invariant tests for all five authorities | Prevents regression | M | Test manual, batch, save/reload, employee, and abstract-world paths |

### Phase 1 — Make progression promises real

1. Build a player-facing effect registry with source, scope, value, cap, runtime consumer, and explanation.
2. Require a test for every displayed skill, attribute, perk, tool, equipment item, course effect, and infrastructure modifier.
3. Implement or remove mastery effects, Memory, Adaptability, unconsumed Insight fields, and orphan tool bonuses.
4. Give courses a weekly workload, pace choice, fatigue/capacity consequence, and completion requirement.
5. Consolidate tools, subscriptions, equipment, and infrastructure into one unlock/purchase/loadout model.
6. Replace path-neutral career titles and make each promotion change responsibilities, delegation, access, and risk.

### Phase 2 — Deepen decisions without adding more dashboards

1. Require explicit placement club and audience selection.
2. Present a club shortlist with pathway, competition tier, relationship, registration, welfare, style, squad congestion, and evidence-fit tradeoffs.
3. Add two-sided AI transfer agreement: club terms, player/agent willingness, role, adaptation/registration, wage, contract, and final lifecycle commitment.
4. Add retirement intention and farewell arcs from canonical contract, role, injury, and motivation context.
5. Turn agency scale into review/sign-off, portfolio risk, quality debt, and client-priority decisions.
6. Feed rewards back into new verbs and information choices, not only percentage multipliers.

### Phase 3 — Compress and de-internalize the UI

1. Remove “generated,” “persisted,” “builder,” “valid,” “assessment score,” “overclaim risk,” and exact hidden-formula language from in-career screens.
2. Remove Roadmap from career navigation.
3. Give Desk one dominant next decision and move world-size/secondary metrics into drill-downs.
4. Add sticky section navigation and completion/error summaries to Player Profile, Report Writer, Career, World dossier, and Reports.
5. Separate report provenance visually and in filters.
6. Improve mobile World comparison and ensure overlays never obscure the final actionable control.
7. Fix “Full-Time Club Scout · Independent” and every path/status contradiction.

### Phase 4 — Rebuild release certification

1. Fix the missing await in the browser soak and re-run a true every-week ten-season career.
2. Refresh the structured-report visual/E2E fixtures and run the entire guided first case without injected impossible state.
3. Update the Youth perk audit to assert perk IDs/behavior rather than human-readable test titles.
4. Produce a clean, tagged, SHA-bound candidate manifest.
5. Run release-equivalent Windows, macOS, and Linux packages through new career, save/load, migration, offline, reconnect, cloud conflict, interrupted write, and recovery.
6. Complete NVDA and VoiceOver journeys.
7. Moderate the first season with simulation newcomers and FM players.
8. Re-run typecheck, lint, architecture, all units/invariants, critical/retention coverage, Youth E2E, accessibility, visual, performance, replayability, soak, build, packaged smokes, and release evidence against that same candidate.

## Required invariant and acceptance-test matrix

| Contract | Required proof |
|---|---|
| A player report is authored | No report exists until explicit structured submission; all selected evidence and uncertainty survive reload |
| A staff report is staff work | Cannot enter personal totals/awards/reputation; sign-off preserves original author and accountable reviewer |
| A world performance fact is canonical | One appearance total across transfer motivation, loan review, profile, world archive, alumni, and recommendation review |
| Missing simulation is not failure | Abstract/contact-only coverage never converts absence into zero minutes or a failed loan |
| A placement is intentional | No club fallback; target, rationale, and terms are player-selected and persisted |
| Progression text is true | Every displayed effect has a runtime consumer and behavior test; no consumer means no promise |
| Courses cost career capacity | Study workload appears in Planner and performance protection requires completed work |
| Rewards belong to the accountable actor | Personal, team, agency, client, and world metrics are separately scoped |
| Manual/batch/reload parity | The same committed inputs create exactly the same world and consequences |
| No hidden-truth leak | Reports, explanations, reviews, staff work, and UI never reveal or derive claims from hidden CA/PA without a permitted broad signal |
| UI preserves immersion | No “game,” “generated,” “persisted record,” internal score, or exact random formula in ordinary career presentation |
| Future scope is honest | Unavailable screens and mechanics are not counted, advertised, or rewarded in Youth EA |

## What not to build yet

- Do not add another playable specialization before the Youth report/world/progression authorities are fixed.
- Do not add AI interpretation of free text; structured, deterministic choices are the correct design.
- Do not add more top-level workspaces or dashboards. Improve the causal handoff between existing ones.
- Do not generate full fixtures for every country if an abstract participation ledger can produce coherent facts more cheaply.
- Do not add more perks, tools, or courses until every current description has a verified consumer.
- Do not add more alumni presentation variants until the underlying history is canonical.
- Do not broaden agency staffing until authorship, review, and reward scopes are explicit.

## Definition of a 9/10 Early Access simulation

TalentScout reaches a credible 9/10 Early Access bar when:

1. Every player-facing report comes from the evidence interaction and cannot be auto-created.
2. Every staff artifact has provenance and cannot become personal achievement without explicit review/accountability.
3. Every active player belongs to a world coverage tier with one canonical participation and development history.
4. Transfers, loans, placements, alumni, world history, and reviews agree about what happened.
5. Scout skills, perks, courses, tools, and promotions visibly change decisions and have tested runtime effects.
6. No in-career screen exposes internal persistence terms, generator language, or exact hidden formulas.
7. The six workspaces remain the stable navigation model and long drill-downs gain fast expert navigation.
8. A clean exact candidate passes full normal-play, long-horizon, save/reload, accessibility, packaged-platform, and recovery gates.
9. New and experienced simulation players can complete the first case, explain why their report remains uncertain, and identify how that judgment changed the world.
10. Repeat careers produce different scouting strategies and career identities, not only different event text.

## Historical final recommendation

TalentScout should continue as a focused Youth Scout Early Access game. The correct next move is not expansion; it is **causal consolidation**.

The observation and structured-evidence work has identified the right product: a professional judgment RPG where information is incomplete, attention is scarce, relationships shape access, confidence carries reputational risk, and the football world later answers back. The repository already contains enough systems and content to support a valuable game. What it lacks is a strict rule that every system must honor the same evidence, authorship, performance, and reward authorities.

Fix the five P0 authority breaks, make progression promises real, compress the high-density screens, and certify one clean candidate. At that point the existing breadth becomes an asset rather than a source of contradiction—and the game can plausibly justify a paid Early Access position on depth, replayability, and trust rather than on feature count alone.

## Current final recommendation

Keep TalentScout focused on Youth Scout for the paid Early Access release. The causal consolidation is now implemented: observation, structured evidence, report authorship, staff work, football participation, transfers, finance, progression, and career callbacks share explicit authorities and tested handoffs.

The next move is candidate hardening and external validation, not another major system. Commit this work as one reviewable candidate, rebuild and bind the packages, complete the platform/accessibility/failure-mode matrix, and put the first season in front of Football Manager players and genre newcomers. Use those sessions to tune pacing, explanation, balance, and emotional payoff; do not reopen the architecture unless evidence shows a real break.

On current local evidence, the game has the depth, replayability, and systemic trust to justify a focused paid Early Access proposition. It is not yet commercially certified, but the remaining work is release engineering and human validation rather than a missing core-gameplay rewrite.
