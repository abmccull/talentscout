# Regional Expert Game Mode

## Implementation plan

| Field | Decision |
| --- | --- |
| Mode ID | `regional-expert` |
| Existing specialization ID | `regional` |
| Product status | Planned full game mode; current code is reusable infrastructure and compatibility scaffolding, not a complete mode |
| Target quality | Youth Scout depth and cohesion, with a distinct territory-and-pipeline strategy game |
| Primary fantasy | Become the person who understands a football region better than anyone else and turns that understanding into trusted cross-border player pathways |
| Primary verbs | Map, listen, travel, interpret, connect, position, recommend, negotiate access, build routes, delegate, defend, recover |
| Persistent stakes | Territorial access, knowledge freshness, route reliability, stakeholder trust, pipeline outcomes, local legitimacy, client confidence, career reputation |
| Core differentiation | Youth Scout is about finding and protecting an individual prospect early. Regional Expert is about building a defensible information-and-access network across places, institutions, markets, and borders. |

This document is an implementation specification, not a feature wishlist. It distinguishes systems that already work, systems that can be extended, incomplete scaffolds, and defects that must be repaired before the mode can be considered real.

**Evidence boundary:** Section 2 describes verified current repository behavior. Sections 3–30 describe proposed design and implementation work unless they explicitly cite a retained current system. A type, screen, wiki entry, or perk definition is not treated as functioning gameplay without an engine consumer, persistent mutation, downstream effect, and test evidence.

---

## 1. Product promise

Regional Expert should create career stories such as:

> I spent two years learning why players from a coastal academy kept stalling after moving abroad. A local coach eventually trusted me enough to explain the gap. I changed how I assessed adaptability, opened a small field office with a bilingual liaison, and built a route to a club whose development model fit those players. A rival network tried to lock up the academy before the transfer window. I chose to protect the relationship rather than rush a sale, lost my largest client, then saw three players succeed through the route over the next five seasons. That pipeline became my reputation—and the reason a national federation later hired me.

The mode succeeds when the player can answer all of these questions from evidence in the game:

- Why is this region worth entering now?
- What do I truly know, what am I assuming, and how fresh is that knowledge?
- Who controls access, what do they want, and whom will I disappoint by choosing a side?
- Which clubs, competitions, and development environments produce which kinds of players?
- What prevents a player from succeeding after crossing a border?
- Is this a one-off prospect or the beginning of a repeatable pathway?
- Should I deepen one territory, widen coverage, or abandon a deteriorating market?
- Which work should I personally perform, delegate, verify, or decline?
- How did my regional judgment create value—or cause harm—years later?

The mode fails if regional play is merely the existing player list with a country filter, a familiarity bar, and a travel fee.

### 1.1 Player-facing promise

1. Every region has a changing football identity, not just a talent rating.
2. Knowledge has source, scope, confidence, age, and possible contradiction.
3. Travel changes what can be learned and whom the player can reach.
4. Bases and routes create durable advantages but carry fixed costs and political commitments.
5. Local people are persistent actors, not anonymous percentage bonuses.
6. Cross-border recommendations are evaluated for timing, price, adaptation, club fit, and long-term outcome.
7. Rival organizations compete for specific access, people, opportunities, and routes.
8. Club and independent careers play differently and remain viable into the late game.
9. Failure closes some doors, opens others, and creates recoverable career stories.
10. Seeds, region conditions, stakeholders, market cycles, and player pathways make careers structurally different.

### 1.2 Non-goals

- Do not add match control, team tactics, or manager responsibilities that do not strengthen scouting.
- Do not model culture as fixed national stereotypes. Institutional practice, language, geography, individual needs, and changing conditions are the actionable variables.
- Do not reveal hidden player truth to make the regional layer feel informative.
- Do not create a second free-floating regional power meter that drifts from real offices, people, work, and outcomes.
- Do not make every country a full league simulation solely to populate a map. Content tiers must remain honest.
- Do not require repetitive travel clicks. Travel is strategic when route, timing, access, cost, fatigue, and missed alternatives matter.
- Do not turn the late game into supervising dozens of identical task cards.

---

## 2. Evidence audit of the current implementation

### 2.1 Classification key

| Classification | Meaning |
| --- | --- |
| Robust foundation | Implemented, persisted, integrated, and covered by meaningful tests; extend rather than replace |
| Functional but shallow | Works, but does not yet create enough decisions or consequences for a full mode |
| Compatibility scaffold | Exists mainly so the specialization can load or share generic systems; not proof of a distinct game mode |
| Partially connected | UI, state, and engine are not all joined, or described effects are not materially applied |
| Defect | Current behavior can violate the intended simulation or player trust |
| Missing | Required mode behavior has no meaningful implementation |

### 2.2 Current system inventory

| System | Current implementation and evidence | Classification | Required disposition |
| --- | --- | --- | --- |
| Regional presence | `deriveRegionalPresence`, `deriveRegionalPresenceIndex`, `getRegionalTravelQuote`, and `applyRegionalPresenceToObservation` in `src/engine/world/regionalPresence.ts` derive access and operational effects from home base, travel, contacts, staff, offices, delegations, knowledge, and world conditions. Effects are bounded and explainable. `tests/invariants/regionalPresence.test.ts` covers stability, bounded effects, transport shocks, staffing, exactly-once observation effects, and ghost-country exclusion. | Robust foundation | Preserve the derived model. Add richer sources and effects without introducing an independently editable presence score. |
| Country eligibility | `getWorldCountryAvailability` and travel/assignment helpers in `src/engine/world/countryAvailability.ts` derive usable destinations from persisted generated world records. `tests/invariants/worldCountryAvailability.test.ts` verifies stale countries are not exposed and assignments remain fulfillable. | Robust foundation | Keep as the authority for country-level eligibility. Extend it with explicit capability flags for region nodes and activities. |
| Regional knowledge | `initializeRegionalKnowledge`, `synchronizeRegionalFamiliarity`, and `processRegionalKnowledgeGrowth` in `src/engine/specializations/regionalKnowledge.ts` initialize, synchronize, and grow a scalar country value. Thresholds unlock authored cultural text, opaque local contact IDs, and hidden leagues. | Functional but shallow | Replace the single scalar as the player-facing decision model with evidence-backed knowledge domains. Retain a derived summary for compatibility and simple UI. |
| Knowledge growth | Active presence, passive derived presence, country contacts, specialization, and equipment affect weekly growth. Comments claim report and successful-find growth, but the processor does not consume those deltas. | Partially connected | Route all knowledge gain through recorded evidence events; remove implicit or undocumented gains. Make reports and outcomes contribute exactly once. |
| Local contacts in knowledge | `generateLocalContact` returns string IDs rather than `Contact` actors. Presence counts those IDs, while the networking engine manages separate persistent people. | Defect/design split | Migrate eligible local-contact IDs into real actors or typed access nodes linked to actors. Never grant relationship power from an uninspectable token. |
| Travel | `getTravelCost`, `getTravelDuration`, `getTravelSlots`, `bookTravel`, `isScoutAbroad`, and `getAccessibleFixtures` in `src/engine/world/travel.ts` provide deterministic country travel, schedule cost, foreign penalties, and fixture restrictions. `progressionActions.ts` validates destination, slots, funds, ledger, assignment, and liaison creation. | Functional but shallow | Replace the one-window, home-origin trip with contiguous route legs and itineraries while keeping quote validation and ledger discipline. |
| Travel geography | Country-to-continent sets and flat travel bands are hard-coded. Every quote starts from the permanent home base even after a prior foreign trip. There are no multi-stop routes, temporary bases, visas, border disruptions, local transit, or route reliability. | Compatibility scaffold | Introduce generated route edges, actual current location, travel modes, and route conditions. Keep a simple auto-route option. |
| World generation | `initializeWorld` in `src/engine/world/init.ts` loads chosen full worlds plus all secondary talent pools, then creates country territories and subregions. The shipped data has six full worlds and sixteen secondary pools. | Robust at its declared content tiers | Do not imply that talent pools have full fixtures. Add regional profiles and market nodes independent of full league simulation. |
| Territory | `Territory` in `src/engine/core/types.ts` is one country with league IDs, capacity, and assigned scout IDs. Generated subregions are not used by territory ownership or work. | Compatibility scaffold | Replace country-as-territory with a hierarchical coverage graph that can represent country, subregion, corridor, competition, academy cluster, and market node. |
| Global map registry | `src/engine/world/mapCountryRegistry.ts` maintains calibrated anchors for the illustrated 800×450 map and explicitly separates artwork coordinates from real latitude/longitude. Tests ensure every generated country has an in-bounds anchor and honest label. | Robust foundation | Keep canonical identity and anchors. Add route geometry, region polygons/areas, overlays, and focus states without pretending the artwork is GIS-accurate. |
| World map experience | `WorldMap.tsx`, `InternationalScreen.tsx`, and `CountryPopup.tsx` provide an animated accessible country browser, familiarity and presence, flight paths, generated-content labels, quotes, current travel, assignment states, search, keyboard markers, focus restoration, and Escape behavior. | Strong UI foundation, shallow strategy | Evolve the workspace into a territory command surface with routes, heatmaps, offices, rival reach, market timing, and actionable drill-down. |
| International assignments | `processInternationalWeek` in `src/engine/world/international.ts` generates tier-gated offers weighted by presence. `internationalDeliverables.ts` creates field observation/report/network deliverables, destination validation, deterministic liaison contacts, exact-once resolution, partial/full/failure grades, and archival outcomes. | Robust transaction integrity, generic design | Reuse the deliverable ledger and resolution discipline. Replace generic checklists with client briefs, research questions, market constraints, and outcome review. Prevent duplicate equivalent offers. |
| Offices and relocation | `internationalExpansion.ts` supports independent-only home-base relocation, satellite opening/closing, staff assignment, monthly costs, and ledger/history. `OfficesTab.tsx` exposes it at agency tier 4+. | Functional but late and generic | Add early temporary desks, partner bases, club hubs, route offices, leases, local legitimacy, operational risk, and market-specific tradeoffs. Preserve satellite/HQ lifecycle and ledger entries. |
| Contacts | `contacts.ts` creates starting Regional contacts, persistent people, meetings, trust, relationship decay, dormancy, betrayal, memories, tips, and access. | Robust relationship foundation | Add regional actor roles, language/communication, reach, affiliations, conflicting obligations, and geography-specific access. Unify knowledge contacts with this graph. |
| NPC territory delegation | `npcScouts.ts` assigns NPC scouts to country territories and generates noisy weekly reports. | Functional but flawed | Unify field staff assignment and coverage briefs; enforce capacity and geographic integrity. |
| Out-of-territory NPC reports | `processNPCScoutingWeek` falls back to the full global player pool when a territory has no eligible players. `assignTerritory` and its store action do not enforce `maxScouts`. | Confirmed defect | Remove global fallback, record a no-lead outcome, enforce capacity atomically, and add invariants. |
| Regional perks | `perks.ts` defines a full Regional progression track, including local network, league knowledge, hidden gems, cultural translator, pipeline builder, territory mastery, and hidden attributes. Repository usage does not call `applyPerkEffects`; some conditions are flattened rather than evaluated. `regionalTransferAvailability` is defined but unused. | UI/data ahead of engine | Audit each perk, wire it into authoritative calculations with provenance, or replace it. No perk may claim an effect that is not tested. Never reveal exact hidden attributes. |
| Unique Regional activities | `src/data/wiki/activities.tsx` states Regional Expert has no unique activity types and relies on existing home activities. | Missing distinct loop | Add research, access, route, market, relationship, and pipeline intents that change evidence and opportunities rather than filling generic slots. |
| Rival organizations | `organizations.ts` has deterministic persistent organizations, agendas, resources, pressure, heat, actions, and history, including a regional guild. `rivalScouts.ts` supports persistent rivals, targets, intelligence, signings, poaching, and nemesis behavior. | Robust foundation, globally scoped | Add country/node/route reach and explicit contested assets. Preserve deterministic action history and give the player counterplay. |
| World conditions | `worldConditions.ts` creates deterministic global and regional conditions such as transport disruption, academy investment, agent exclusivity, registration easing, recession, showcase circuits, and talent surges. Conditions already modify discovery, confidence, opportunity, development, travel, recruitment, market, and rival pressure. | Robust foundation | Extend with corridor, institution, border, and multi-season chains. Surface cause and projected duration. |
| Special events | `specialEventDeck.ts` provides broad persistent, consequence-bearing events involving agents, employees, rivals, and obligations. | Robust framework | Add Regional gating, choices, callbacks, and authored audiovisual variants; do not create a disconnected second event engine. |
| Club/independent paths | Core career path is `club` or `independent`; employment, consultancy, agency, leadership, and recovery are generic. Offices are independent-only. | Functional but not mode-specific | Create distinct club regional-department and independent network/consultancy arcs using the same shared career authority. |
| Failure and recovery | `recovery.ts` supports warnings, firing, bankruptcy, recovery plans, blocked offers, and comeback opportunities. | Robust generic foundation | Add territory loss, failed expansion, access scandal, office closure, staff defection, client loss, and repatriation recovery routes. |
| Leadership | `leadership.ts` provides an attributable portfolio with own/delegate/defer/reject decisions, capacity, and attention. | Robust foundation | Make regional portfolios consist of markets, routes, briefs, and relationship obligations rather than generic task volume. |
| Persistence migration | `gameStore.ts` migrates regional knowledge, presence, world eligibility, and international destinations. Similar migration/default behavior also exists in `src/lib/db.ts`. | Working but structurally risky | Add one pure, versioned mode migration path used by store, local save, cloud, and packaged builds. Avoid another parallel migration. |
| Run identity | `RunManifest` stores seed, specialization, starting country, selected countries, and world traits. World conditions and rivals are deterministic. | Robust seed foundation | Add mode version, regional starting profile, content-pack versions, and initial corridor/market traits so careers can be reproduced and compared. |

### 2.3 What can be retained as-is

- Canonical country identity and generated-world eligibility.
- The derived-not-stored regional presence principle.
- Bounded effect math and explanation strings.
- Ledger-backed travel, office, and reward transactions.
- Exact-once international deliverable resolution.
- Deterministic event, rival, and world-condition histories.
- Persistent contact actors and consequence memories.
- Youth Scout's six-workspace navigation, responsive shells, semantic tabs, accessible dialogs, keyboard scheduling patterns, report artifact pattern, historical callbacks, batched achievement feedback, and first-hour tutorial discipline.

### 2.4 What must not be mistaken for a finished mode

- A Regional specialization in new-game data.
- A perk list whose effects are not consumed.
- A scalar country knowledge meter.
- A world-map marker that opens a dossier.
- Paying to travel to a generated country.
- A generic international assignment with a country name substituted into its copy.
- An agency satellite office that grants a flat quality percentage.
- An NPC scout assigned to a country.

---

## 3. Mode identity and design pillars

### Pillar 1: Territory mastery is a body of evidence

The player does not "level up Brazil." They learn specific competitions, academies, pathways, decision-makers, logistics, market rules, and adaptation patterns through specific sources. A derived mastery summary can aid navigation, but it must always drill into provenance and uncertainty.

### Pillar 2: Access beats omniscience

The most valuable information often belongs to people. A trusted youth coach may reveal a player's training habits; a family adviser may explain relocation resistance; a federation official may grant tournament credentials; a rival-connected agent may offer speed at the cost of exclusivity. Access creates obligations and political tradeoffs, not just bonuses.

### Pillar 3: Routes are strategic assets

A route is more than a cheap flight. It is a repeatable connection among a source region, gatekeepers, competitions, destination clubs, regulatory constraints, staff, and a history of player outcomes. Routes become more reliable through good placements and can collapse through exploitation, poor adaptation, regulation, rival action, or neglected relationships.

### Pillar 4: Timing is part of judgment

A good player in the wrong window, at the wrong price, before the right paperwork, or without a suitable destination is a bad recommendation. Markets cycle. Registration rules, club budgets, elections, tournaments, injuries, and rival attention alter opportunity.

### Pillar 5: Local legitimacy cannot simply be purchased

Offices, translators, analysts, and travel help. They do not replace showing up, honoring promises, learning institutions, developing staff, and accepting local constraints. Fast expansion can create reach while weakening trust and verification.

### Pillar 6: The world pushes back

Regional economies, organizations, club strategies, rival scouts, regulations, and people pursue their own interests. The player can lose access, be wrong about a market, overexpand, or see a carefully built route disrupted.

### Pillar 7: Growth changes the job

The early game is personal fieldwork and scarce travel. The midgame is route design and stakeholder management. The late game is portfolio judgment, organizational culture, delegation, political responsibility, and defending or reinventing a network.

---

## 4. Core gameplay loops

### 4.1 Minute-to-minute loop

1. Read a lead, brief, condition change, contact message, or map signal.
2. Inspect the evidence behind it and identify what is unknown or stale.
3. Compare regions, routes, players, clubs, and stakeholder interests.
4. Choose an action: research remotely, call a contact, request access, schedule observation, travel, create a hypothesis, assign staff, or decline.
5. Resolve an interactive scene or decision with imperfect information.
6. Record a finding, obligation, cost, risk, or revised hypothesis.
7. See the map, dossier, pipeline, and calendar update immediately.

The player should rarely click an action solely to fill a progress bar. Every action should answer a question, alter access, create an obligation, consume an opportunity, or expose risk.

### 4.2 Weekly loop

At the start of each week, the player receives:

- client or employer priorities;
- route and market changes;
- expiring opportunities;
- active obligations and promises;
- travel and staff availability;
- rival movements the player has enough intelligence to detect;
- stale or contradicted knowledge;
- pipeline follow-ups and alumni developments.

The player then sets two to four strategic intents rather than filling a grid with interchangeable tasks:

| Intent | Core tradeoff | Examples |
| --- | --- | --- |
| Deepen | Accuracy and access versus breadth | Spend three days at one academy; verify an injury rumor; compare a player in two roles |
| Expand | New opportunity versus weak context | Survey a border competition; meet an unfamiliar organizer; commission a market scan |
| Connect | Relationship capital versus immediate observation | Keep a promise; introduce two stakeholders; mediate a conflict; renew credentials |
| Position | Cost and commitment versus future leverage | Reserve travel; negotiate a desk; staff a corridor; pre-register for a tournament |
| Convert | Speed and conviction versus reputational risk | Present a dossier; pitch a destination club; request a trial; recommend waiting |
| Protect | Defensive focus versus missed growth | Counter a rival approach; audit delegated work; support an adapting alumnus |

The schedule engine translates each intent into location, attention, staff, cost, and deadline requirements. Contextual actions can fill the details, but the player first decides why the week matters.

Weekly resolution must show:

- what was learned and from which source;
- what remains uncertain;
- which opportunities advanced, cooled, or were lost;
- which relationships changed and why;
- what rivals or world actors did;
- which future consequence was created;
- whether delegated work met its brief;
- the cost, fatigue, and opportunity cost.

### 4.3 Seasonal loop

Each season has a generated regional rhythm:

1. **Preseason positioning:** choose target markets, renew credentials, agree employer/client briefs, allocate staff, and decide which routes to maintain.
2. **Early-season learning:** observe development environments, establish baseline club/player hypotheses, and pursue emerging competitions.
3. **Window pressure:** convert evidence into recommendations while prices, rival interest, registration, and client needs move.
4. **Midseason reassessment:** audit failed assumptions, refresh stale knowledge, support recent movers, and respond to new world conditions.
5. **Tournament/showcase phase:** compete for access and attention across concentrated discovery opportunities.
6. **End-of-season review:** evaluate regional predictions, placements, route performance, staff calibration, relationship obligations, finances, and employer/client satisfaction.
7. **Territory planning:** deepen, defend, open, delegate, divest, or relocate for the next season.

Season rollover must alter conditions, club needs, budgets, staff movement, registration rules, route economics, rival strategy, competition prestige, and generated opportunities without arbitrarily erasing the player's accumulated history.

### 4.4 Multi-season career loop

The player builds a portfolio of regions and routes, not an endlessly growing list of unlocked countries.

- A narrow expert can dominate one region, command premium trust, and act as a decisive specialist.
- A corridor builder can connect two or three markets with exceptionally reliable placements.
- A club operator can build an international department aligned to a recruitment philosophy.
- An independent consultant can advise multiple clients while managing conflicts and reputation risk.
- A network founder can train staff, license methods, open partner offices, and shape regional standards.

Every multi-season review should preserve:

- best and worst market calls;
- predicted versus actual player movement;
- source calibration and known blind spots;
- clubs where recommendations succeeded or failed;
- route survival, profitability, adaptation, and player welfare;
- stakeholders gained, alienated, reconciled, or lost;
- rival victories and defeats;
- regions entered, defended, abandoned, and revisited;
- career setbacks and recovery chapters.

---

## 5. First five minutes and first hour

The opening must teach the Regional loop through a generated case, not a fixed star prospect that becomes stale on repeat careers.

### 5.1 New-career setup

The player chooses or accepts a generated starting profile:

- home country and one subregion;
- club employee or independent contract start;
- one language at professional proficiency and optional partial second language;
- one local strength and one blind spot;
- one trusted relationship and one uneasy relationship;
- one world-trait pair that changes the opening opportunity;
- assisted, standard, or expert information support.

Starting presets are expressive, not simply easy/medium/hard:

| Preset | Opening advantage | Opening pressure | Distinct play |
| --- | --- | --- | --- |
| Touchline Connector | Strong academy and organizer access | Weak data and commercial knowledge | Relationship-led, high-context fieldwork |
| Border Analyst | Better market and competition research | Few trusted local actors | Remote comparison, evidence synthesis, careful access building |
| Returned Professional | Destination-club credibility and language | Local gatekeepers distrust outside influence | Cross-border fit and legitimacy repair |
| Independent Fixer | Flexible clients and travel | Cash pressure and conflicts of interest | Opportunistic consultancy and route economics |

Experienced players can skip guided prompts. The opening case still occurs as ordinary simulation content, with different people, regions, constraints, player archetypes, and valid outcomes.

### 5.2 First five minutes: the regional signal

The Desk presents one urgent, legible signal:

> A destination club needs a press-resistant midfielder under a defined budget. A local contact says a nearby academy has one, but the competition is poorly covered and a rival organization has requested credentials for the same weekend.

The player immediately:

1. opens the World workspace and sees the source, destination, route, and known unknowns;
2. compares live attendance, contact verification, and remote data review;
3. schedules one meaningful action;
4. states an initial hypothesis, such as "technical level is real; competition translation and relocation readiness are unknown";
5. receives a visible consequence: access, cost, obligation, or lost alternative.

This teaches that the mode is about making a regional judgment under time pressure, not clearing notifications.

### 5.3 First hour: generated regional case arc

The first-hour director selects modular beats from the seed and starting profile:

1. **Signal:** a player, academy cluster, competition, or market anomaly appears.
2. **Conflict:** two sources disagree, access carries a condition, or a rival moves.
3. **Field choice:** travel, delegate, remote study, or relationship investment.
4. **Context reveal:** role, competition strength, family situation, registration issue, or development-environment evidence changes the hypothesis.
5. **Route choice:** choose among a fast risky destination, a slower developmental fit, waiting, or declining.
6. **Professional artifact:** submit a regional player dossier or market brief with category confidence and conviction.
7. **Immediate consequence:** the club acts, asks for more, rejects the advice, or another party intervenes.
8. **Time jump/callback:** several in-game weeks later, adaptation or missed-opportunity evidence returns.
9. **Aha moment:** the player sees that the quality of regional context—not merely the prospect's potential—changed the outcome.

At least six opening templates should ship, each with variable actors, regions, positions, constraints, and endings. No template may force a successful signing or reveal future ability. The tutorial is marked complete account-wide, offers optional contextual reminders on new modes, and never hijacks an experienced player's schedule.

### 5.4 First-hour acceptance criteria

- A new player can explain the difference among knowledge, access, presence, and reputation.
- The player makes at least one depth-versus-breadth choice, one relationship choice, one travel/delegation choice, and one conviction choice.
- At least one source is incomplete or contradicted.
- At least one valid path avoids travel.
- The first report records intended destination, timing, price context, adaptation risk, evidence confidence, and next step.
- The player sees one delayed consequence before the end of the guided hour.
- Tutorial completion persists separately from career save state.
- Repeat players can skip instruction without skipping the generated opportunity.

---

## 6. Territory model

### 6.1 From country ownership to a coverage graph

The existing `Territory` record should become a compatibility projection over a richer graph:

```text
Macro-region
  -> Country
      -> Subregion / city cluster
          -> Competition, academy cluster, organizer, venue, or market node
      -> Cross-border corridor
          -> Destination country / league / club cluster
```

The graph does not imply military ownership. It represents where an organization has coverage, relationships, permission, knowledge, and reliable operations.

Every node defines:

- content tier and supported activities;
- competitions and institutions;
- travel access and adjacent nodes;
- languages commonly used for football work;
- regulatory and market context;
- opportunity profile and seasonal calendar;
- player-development environment distributions;
- actor affiliations and access gates;
- world-condition exposure;
- rival reach;
- current evidence coverage and freshness.

### 6.2 Territory states

| State | Meaning | Player capability |
| --- | --- | --- |
| Unmapped | Generated but no credible source | Only broad public context; high uncertainty |
| Surveyed | Basic remote or contact evidence | Compare market shape; request introductions |
| Covered | Repeatable observation or data access | Schedule reliable work; maintain watchlists |
| Networked | Multiple independent trusted sources | Cross-check claims; receive earlier leads |
| Embedded | Durable staff/base/institution access | Build routes, delegate, and shape long-term briefs |
| Contested | Rival pressure threatens specific assets | Defensive actions and stakeholder choices appear |
| Degraded | Knowledge, access, or operations have decayed | Repair, re-survey, or exit |

These labels are derived from underlying facts. A single score does not set them.

### 6.3 Coverage capacity

Each territory node has a weekly coverage demand affected by geography, competition density, world conditions, and active briefs. Staff have travel radius, language, reliability, workload, and specialisms. Overcoverage creates diminishing returns; undercoverage causes missed events and stale evidence.

Capacity rules:

- one staff member cannot occupy incompatible assignments in the same week;
- territory capacity is enforced when assigning, not merely displayed;
- an empty territory produces a recorded no-lead result, never a global player fallback;
- delegated output always records location, source, uncertainty, and responsible staff member;
- a player's personal attention remains scarce even when staff capacity grows;
- late-game breadth increases coordination risk, audit demand, payroll, and politics.

### 6.4 Territory comparison

The player can compare up to four nodes across:

- current opportunity and projected timing;
- evidence completeness/freshness;
- access and key blockers;
- travel time/cost/reliability;
- staff and language coverage;
- player archetypes and development environments;
- market cost, contract, and registration context;
- destination route fit;
- rival reach and active claims;
- client/employer demand;
- historical recommendations and outcomes.

Comparisons must preserve uncertainty. Unknown values remain unknown; estimates show range, source, and age.

---

## 7. Knowledge, language, culture, and uncertainty

### 7.1 Knowledge domains

Replace the player-facing scalar with these domains:

| Domain | Typical evidence | Decisions enabled |
| --- | --- | --- |
| Competition | Live matches, video, performance data, coach interviews | Translate performance level and role demands |
| Development pathways | Academy visits, alumni histories, staff testimony | Judge environment quality and likely progression |
| People and access | Meetings, introductions, fulfilled promises, affiliations | Reach players, families, staff, and events |
| Market and regulation | Contracts, fees, wages, windows, permits, agent behavior | Estimate cost, timing, and transaction feasibility |
| Logistics | Routes, venues, weather, safety, lodging, schedule reliability | Plan efficient fieldwork and staff coverage |
| Language and communication | Proficiency, translator quality, repeated interaction | Reduce misunderstanding and relationship friction |
| Adaptation patterns | Alumni follow-up, player/family evidence, destination support | Assess cross-border fit without stereotyping |
| Club and institution identity | Recruitment/development history, leadership, facilities, role usage | Match players to destinations and anticipate behavior |

Each fact stores source, acquired week/season, confidence, contradiction links, scope, and expiry behavior. Domain summaries are derived from facts.

### 7.2 Evidence rules

- Public data is broad and fast but weak on private context.
- Live observation is rich for role and behavior but sample-sensitive.
- Contact testimony can unlock unique context but carries agenda and reliability.
- Delegated work inherits staff skill, fatigue, access, and bias.
- Repeated identical observations have diminishing returns.
- A new role, competition level, venue, coach, or pressure context can reopen learning value.
- Knowledge decays by domain. Competition form changes quickly; infrastructure and institutional history change slowly.
- Contradictory credible evidence creates a decision, not an automatic average.
- The player can preserve a hypothesis, state what would disprove it, and revisit it later.
- Reports and successful outcomes create knowledge evidence once; they do not silently increment a bar every week.

### 7.3 Language

Language is a practical capability, not a nationality modifier.

Track listening, professional conversation, and written/reporting proficiency by language group. Benefits include:

- conducting direct meetings without interpretation loss;
- detecting ambiguity or disagreement;
- building trust faster with some actors;
- understanding local media and documents;
- reducing translator cost and scheduling constraints;
- delegating to the right staff member.

Language never changes a player's football ability. Poor shared language increases uncertainty and interaction friction; it does not deterministically make an individual untrustworthy or unable to adapt.

Learning routes include lessons, immersion, staff mentorship, repeated use, and career background. Gains are slow, capped by effort, and partly lost without use. Translators remain valuable at all levels for legal, family, and high-stakes nuance.

### 7.4 Cultural and adaptation evidence

Replace generic flavor unlocks with actionable, sourced institutional knowledge:

- training and education schedules;
- player-family decision norms for a specific academy or agent group;
- common contract structures;
- school, housing, faith, dietary, and community support available at destinations;
- coaching communication style at a club;
- recent alumni adaptation outcomes;
- travel and competition routines;
- local organizer expectations;
- media pressure and language environment.

Country-level authored insights can remain as broad orientation, but the engine must not turn them into deterministic individual traits. Adaptation reports express risk factors, support requirements, uncertainty, and comparable prior cases.

### 7.5 Scout bias and calibration

Track the player's regional judgment patterns:

- overrating dominant performances in weak competitions;
- underrating late developers;
- trusting particular source types too much;
- excessive confidence after limited live observation;
- underestimating adaptation or regulatory risk;
- defaulting to familiar destination clubs;
- reacting too strongly to a recent failure.

Bias feedback appears only after enough outcomes and explains the sample. It never reveals hidden truth prematurely. Staff have their own calibration profiles, enabling meaningful delegation and audit decisions.

### 7.6 Competition translation

Local competition quality must be modeled as an evolving, uncertain context rather than a permanent country coefficient. A competition profile combines pace, physicality, tactical role usage, age mix, data coverage, venue variation, development purpose, and observed movement outcomes. Profiles change as clubs invest, formats change, strong cohorts graduate, or world conditions intervene.

The player learns translation through:

- observing the same player in different competitions or roles;
- comparing several players who moved from the source competition;
- following loans, trials, and alumni outcomes;
- interviewing coaches and destination-club staff;
- studying performance data with coverage and opponent caveats;
- revising an explicit translation hypothesis.

A profile never yields a universal "minus 12%" transformation. It narrows plausible ranges and highlights risk. A competition can be strong for one development question and weak for another. Local calendars, tournament concentration, postponements, and access shape the route planner and opportunity windows.

---

## 8. Travel, routes, bases, and regional presence

### 8.1 Route graph

Travel becomes a graph of valid route edges among bases, region nodes, and event locations. An edge includes:

- origin and destination;
- travel mode and normal duration;
- cash cost and schedule cost;
- reliability and disruption exposure;
- visa/credential requirements where relevant;
- baggage/equipment constraints where relevant;
- language or liaison support;
- recovery/fatigue load;
- known alternatives;
- history of use.

The route planner can auto-select cheapest, fastest, least fatiguing, or most reliable. Expert players can construct multi-leg itineraries. A player abroad may continue from the actual current node rather than teleporting home between trips.

### 8.2 Itineraries

An itinerary has a purpose and a sequence:

```text
Home base -> academy visit -> tournament -> contact meeting -> destination club -> return
```

Each leg reserves schedule capacity. Delays can cause downstream consequences. The player can build slack, buy flexible travel, call on a contact, delegate a missed action, or accept failure. Batch advancement and manual advancement must resolve the same itinerary identically from the same seed and choices.

### 8.3 Presence ladder

Retain the current derived presence tiers, but enrich their evidence:

| Tier | Typical sources | Strategic effect |
| --- | --- | --- |
| Remote | Public information only | Expensive, weak-context work; few early signals |
| Informed | Recent research or one credible source | Better briefs and comparisons |
| Networked | Several independent actors and repeat activity | Earlier leads and cross-checking |
| Field | Active travel, local operator, or temporary base | Reliable scheduling and contextual observation |
| Established | Durable staffed base, fulfilled obligations, and proven outcomes | Delegation, route building, high-value access, lower operational friction |

Presence remains derived in `regionalPresence.ts`. New contributions must point to real records: staffed offices, active itinerary, verified access agreements, current contacts, or completed work. Closing an office, losing a contact, or leaving a route unattended automatically changes derived effects.

### 8.4 Base types

| Base | Career timing | Benefits | Costs and risks |
| --- | --- | --- | --- |
| Home base | Start | Stable origin, personal network, low friction | Relocation is costly and politically meaningful |
| Temporary desk | Early | Short-term event/market presence | Limited capacity, expires, weak legitimacy |
| Partner base | Early-mid | Shared access through a club, academy, consultant, or federation | Obligations, data boundaries, conflict of interest |
| Field office | Mid | Staff, local records, recurring routes | Rent, permits, management, reputation exposure |
| Regional hub | Late | Multi-territory coordination, training, route resilience | High fixed cost, politics, audit demand |
| Headquarters | Independent late game | Brand, client capacity, leadership systems | Concentration risk and major overhead |
| Club regional department | Club late game | Employer resources and integrated briefs | Board targets, exclusivity, philosophy constraints |

Office quality is not a flat purchased percentage. It derives from staff, local leadership, communication, records, infrastructure, security/reliability, stakeholder legitimacy, and recent performance.

### 8.5 Presence decisions

Opening or maintaining a base asks:

- What work will this location repeatedly enable?
- Which local partner is attached, and what do they expect?
- Who will staff it, and what work elsewhere is lost?
- Is the market at a temporary peak or a durable opportunity?
- Does the base make a route more reliable or merely add cost?
- Will club/client exclusivity alienate another stakeholder?
- What is the exit cost if conditions change?

---

## 9. Regional economies and market timing

### 9.1 Market state

Every supported market has a generated seasonal state derived from clubs, competitions, contracts, player supply, world conditions, and authored constraints:

- buying and selling pressure;
- common fee and wage bands as uncertain ranges;
- registration and transfer windows;
- work-permit or roster constraints where modeled;
- agent concentration and access friction;
- club liquidity and recruitment appetite;
- development minutes available by role/age;
- export and retention pressure;
- academy investment trend;
- competition visibility;
- currency/economic pressure abstracted into purchasing-power modifiers;
- rival organization attention.

The game should avoid fake precision. A scout knows ranges and tendencies based on evidence quality, not a hidden exact market multiplier.

### 9.2 Opportunity windows

An opportunity window is a time-bounded alignment of player, source, destination need, access, and transaction feasibility. It can open because of:

- a destination-club injury or role vacancy;
- a tournament or showcase;
- a contract nearing expiry;
- registration easing;
- academy cash pressure;
- a player's family timeline;
- a manager or sporting director change;
- a rival losing access;
- transport opening or disruption;
- a contact offering temporary exclusivity.

Waiting yields more evidence but changes the window. The UI shows what is known to be time-sensitive and why; it does not expose a hidden countdown unless the player has credible deadline information.

### 9.3 Ethical and reputational choices

Regional expertise creates responsibility. Choices include:

- rushing a player through an unsuitable route to satisfy a client;
- respecting a family or academy request for privacy;
- disclosing a conflict of interest;
- accepting exclusive access that harms another relationship;
- supporting a player after a failed move;
- challenging exploitative terms;
- withdrawing a recommendation when context changes.

These choices affect access, trust, reputation categories, employee culture, client retention, media narratives, and alumni outcomes. They must not reduce to a single morality score.

### 9.4 Financial loop

Regional Expert uses the shared ledger as the single financial authority.

Independent revenue can come from retainers, scoped briefs, market audits, route design, successful renewals, training, and advisory work. Club careers receive salary, approved travel/department budgets, and performance review rather than personally pocketing transfer value. Neither path receives money merely for accumulating knowledge or repeatedly submitting the same report.

Costs include:

- travel reservation, local transport, lodging, changes, and recovery;
- credentials, data access, translators, fixers, and professional services;
- staff wages, benefits, training, and severance;
- temporary desks, leases, permits, base operations, and closure;
- equipment acquisition, maintenance, and insurance;
- player/alumni support commitments when contractually or ethically assumed;
- failed-contract, cancellation, refund, and conflict-resolution costs.

Every transaction records source, purpose, stakeholder/contract, node, week, and exact-once event ID. Forecasts distinguish committed, probable, and discretionary spend. The player can compare the cash value of an assignment with the opportunity cost of weakening a route or neglecting a client. Overexpansion is recoverable through downgrade, renegotiation, partner transfer, return-home work, bridge contracts, or an employer role; the game must not create an unavoidable negative-interest spiral.

---

## 10. Cross-border pipeline system

### 10.1 Pipeline stages

1. **Signal:** a player, institution, competition, or market pattern is noticed.
2. **Qualification:** verify that the lead matches a real brief or regional thesis.
3. **Context:** gather role, development, personality, family, adaptation, contract, and access evidence.
4. **Destination match:** compare clubs and pathways rather than merely ranking player quality.
5. **Route readiness:** verify timing, paperwork, stakeholder alignment, support, and alternatives.
6. **Recommendation:** submit a player dossier, route memo, or market-entry proposal with conviction and uncertainty.
7. **Conversion:** trial, negotiation, placement, referral, or deliberate wait/decline.
8. **Adaptation:** follow playing time, role use, support, injury, language, and relationship outcomes.
9. **Alumni:** preserve career outcome, route learning, source calibration, and relationship consequences.

### 10.2 Pipeline health

A route or pipeline has derived health across:

- source reliability;
- destination fit history;
- access resilience;
- staff capacity;
- regulatory viability;
- economic viability;
- player adaptation and welfare;
- stakeholder trust;
- rival pressure;
- evidence freshness.

Health is diagnostic, not a resource to grind. A route with excellent profit but repeated player distress is strategically and reputationally unstable.

### 10.3 Player aging and pool integrity

Prospects cannot remain frozen in an unsigned pool indefinitely.

- Each prospect has an age-appropriate pathway state, contract status, activity history, and last meaningful evidence date.
- Unsigned prospects continue aging, may enter amateur, education, lower-league, non-football, or released states, and can re-emerge if the world supports it.
- After three to four seasons without a credible active pathway, the simulation evaluates exit rather than keeping the prospect permanently actionable. The exact threshold depends on age, competition activity, contract attempts, injury, and local pathway—not one universal timer.
- Exited players leave active prospect searches and remain in historical archives when they influenced reports, relationships, or career outcomes.
- Generated replacement cohorts respect regional conditions and development capacity so cleanup does not empty the world.

### 10.4 Route accountability

Evaluate a recommendation on more than eventual ability:

- fit with the destination club's stated need and development model;
- timing and realistic alternatives;
- fee, wage, and transaction context;
- role translation and competition-level judgment;
- identified adaptation and injury risks;
- confidence calibration given available evidence;
- whether the scout revised the view when evidence changed;
- player welfare and support needs;
- destination playing time and progression;
- club financial and sporting value;
- long-term relationship and route effects.

One failed player should not automatically condemn a sound process, and one star should not validate reckless overconfidence.

---

## 11. Reports and professional artifacts

Regional Expert uses several report types, all built on the shared report/case infrastructure rather than separate document engines.

| Artifact | Audience | Key decision |
| --- | --- | --- |
| Player transferability dossier | Club/consulting client | Should this player move through this route now? |
| Regional player report | Recruitment stakeholder | How does observed ability translate from this context? |
| Market-entry brief | Board/client/agency | Should we invest coverage in this region, and how? |
| Destination-fit comparison | Club/player-side stakeholder | Which environment offers the best sporting and adaptation fit? |
| Competition translation note | Recruitment team | How should performance in this competition be interpreted? |
| Route risk memo | Leadership/client | Which access, legal, economic, or welfare risks could break the pathway? |
| Post-placement review | Employer/client/internal archive | What did we predict correctly, miss, or need to change? |

Every submitted artifact includes:

- intended audience and their stated need;
- decision deadline;
- evidence sources and recency;
- role and competition context;
- uncertainty by category;
- known contradictions;
- market/price/wage range and confidence;
- adaptation and support requirements;
- route/access dependencies;
- comparable players, institutions, or prior moves;
- alternatives, including wait and no-action;
- conviction and downside case;
- recommended next step;
- conditions that should trigger reassessment.

The report writer must prefill known context but never silently fabricate certainty. Revising a report preserves version history and shows what changed. Repeated low-information submissions cannot grind reputation or knowledge; only distinct cases and materially new evidence can create evaluation value.

---

## 12. Relationships, access, and regional politics

### 12.1 Persistent actor roles

Extend the existing `Contact` model with regional roles and affiliations:

- academy director and youth coach;
- senior coach and analyst;
- local scout and organizer;
- federation or league official;
- registration/credential administrator;
- player, family member, and family adviser;
- agent and local intermediary;
- journalist and data provider;
- club executive and recruitment lead;
- school/community leader;
- translator, fixer, and travel operator;
- employee and partner-office lead;
- individual rival scout.

Each person has geographic reach, affiliations, needs, memory, preferred communication, conflicts, and boundaries. Relationships can create introductions, event access, data, context, warnings, obligations, or misinformation.

### 12.2 Conflicting obligations

Examples:

- An academy director offers early access only if the player does not circulate names before a showcase.
- A club employer demands exclusivity that conflicts with a long-standing independent contact.
- A family wants a slower education-friendly route while an agent pushes a fast transfer.
- A journalist offers useful market evidence in exchange for a story that could expose a client.
- A regional office lead wants more autonomy; a trusted senior scout wants control of the same territory.
- A federation credential helps one competition but alienates an unofficial organizer.
- A rival offers a temporary partnership that shares both access and credit.

The consequence engine records the specific promise, beneficiary, harmed stakeholder, deadline, privacy, and later callback. Skipped critical choices require an explicit delegation policy—conservative, balanced, aggressive, or named staff authority—and record who made the decision.

### 12.3 Access agreements

Access is modeled through inspectable agreements:

- credential;
- invitation;
- introduction;
- exclusivity;
- data-sharing permission;
- partner-office agreement;
- event accreditation;
- trial/referral pathway;
- privacy commitment;
- destination-support arrangement.

Agreements have scope, duration, grantor, requirements, revocation conditions, and conflict tags. They affect available actions through the regional presence and scheduling engines.

---

## 13. Rivals and organizations

### 13.1 Geographic reach

Extend `RivalOrganizationState` with a sparse reach map rather than one global pressure value. Each organization can invest in:

- region nodes;
- academy or competition access;
- specific contact relationships;
- routes and destination-club relationships;
- local offices and staff;
- media narratives;
- player-specific races.

The player sees only pressure supported by intelligence. Unknown rival assets remain fogged. Known actions show evidence and probable motive, not omniscient intent.

### 13.2 Rival actions

- request the same tournament credentials;
- offer a contact exclusivity;
- hire or poach a local scout;
- flood a destination club with competing recommendations;
- claim credit for a pipeline;
- undermine the player's reliability with a stakeholder;
- overpay to accelerate market entry;
- exploit a transport or regulatory opening;
- abandon a region after repeated failure;
- propose collaboration against a larger organization.

Counterplay includes deepening trust, diversifying sources, accelerating or delaying, sharing credit, negotiating boundaries, auditing staff, shifting destinations, publicly defending a process, or strategically leaving the contest.

### 13.3 Fairness rules

- Rivals consume resources and obey access/timing constraints.
- A rival cannot poach a person or opportunity without a traceable route and motive.
- Rival actions resolve exactly once and persist in history.
- Rival bonuses never read player-hidden information that the simulated rival should not possess.
- High difficulty improves rival planning and risk appetite, not arbitrary hidden-stat advantages.
- Territory pressure is scoped; a powerful rival in one corridor does not magically suppress every country.

---

## 14. Career progression, paths, failure, and recovery

### 14.1 Career stages

| Stage | Core job | New responsibility | New tension |
| --- | --- | --- | --- |
| Local Correspondent | Build credible evidence in one subregion | Personal access and report quality | Cash/time scarcity and weak reach |
| Territory Scout | Cover a country or compact cluster | Competition translation and repeat coverage | Depth versus expansion |
| Country Specialist | Advise on a whole market | Cross-check sources and destination fit | Reputation concentration and rival attention |
| Regional Lead | Manage several nodes and staff | Briefs, audits, route design, office decisions | Delegation, payroll, conflicting stakeholders |
| International Recruitment Partner | Own cross-border pathways | Club/client portfolio and political accountability | Exclusivity, adaptation outcomes, board/client pressure |
| Network Director | Shape an organization or consultancy | Culture, methods, leadership, succession | Systemic failures and loss of personal touch |
| Global Regional Authority | Select high-impact markets and advise institutions | Legacy, standards, crisis response, mentorship | Defending relevance and responsible influence |

Promotion changes the job. It must not merely add percentage bonuses.

### 14.2 Club path

The club player receives resources, privileged internal needs, destination context, and a coherent recruitment philosophy. In exchange, they face:

- exclusivity and confidentiality;
- board and sporting-director priorities;
- budget and squad-path constraints;
- managerial changes that invalidate briefs;
- internal analysts/scouts with competing views;
- responsibility for department performance;
- territory allocation and staff politics;
- firing risk when recommendations or processes fail.

Late-game club roles include Head of Regional Recruitment, International Scouting Director, and Recruitment Strategy Lead. The player builds a department, decides methods, and remains accountable for the quality of delegated judgment.

### 14.3 Independent path

The independent player chooses clients and markets, can specialize deeply, and can build partner offices. In exchange, they face:

- volatile income and travel cash flow;
- conflicts among clients, agents, players, and academies;
- commercial pressure to oversell certainty;
- data and access costs;
- contract scope and liability;
- staff payroll and office overhead;
- brand damage from public failures;
- the need to disclose or manage conflicts.

Late-game independent roles include Specialist Consultant, Corridor Partnership, Regional Intelligence Firm, and Network Founder. Agency ownership is one option, not the required endpoint.

### 14.4 Failure states

- a major report is confidently wrong in a way available evidence should have prevented;
- a route produces repeated poor adaptation outcomes;
- a base becomes financially unsustainable;
- a local partner revokes access after a broken promise;
- a staff member defects or falsifies coverage;
- a client discovers an undisclosed conflict;
- rapid expansion creates stale knowledge and missed obligations;
- a world condition destroys a market thesis;
- a club changes leadership and eliminates the department;
- a rival captures a critical relationship or competition;
- an office closure harms staff and local trust;
- insolvency, firing, or reputational specialization blocks certain offers.

### 14.5 Recovery paths

Extend the shared recovery engine with mode-specific plans:

| Failure | Recovery options |
| --- | --- |
| Territory access loss | Rebuild through a different stakeholder, accept a limited credential, partner with a rival, or exit and return later |
| Failed expansion | Close or downgrade the base, sell/transfer contracts, return home, take a club role, or run a bounded audit |
| Bad route outcomes | Fund alumni support, suspend placements, commission external review, change destinations, or narrow the route thesis |
| Staff integrity failure | Investigate, disclose, compensate affected stakeholders, strengthen audit controls, or accept leadership consequences |
| Client conflict | Disclose, choose a side, refer one party away, renegotiate scope, or lose both through avoidance |
| Firing | Take a lower-profile territory role, consult on a recovery brief, join a former contact, or rebuild through independent proof |
| Reputation collapse | Specialize in a neglected market, publish a transparent process review, mentor under oversight, or pursue a long comeback contract |

Recovery should take seasons, create callbacks, and permanently shape the career archive. It should be possible to survive without returning to the identical dominant strategy.

### 14.6 Professional development and tools

Training changes capability and method rather than awarding generic experience:

- language and high-stakes communication;
- live competition translation;
- interviewing and source verification;
- market/contract literacy;
- cross-border adaptation assessment;
- itinerary and field-safety planning;
- leadership, audit, and feedback;
- consultancy scope and conflict management.

Learning consumes time or money and is strengthened by applying the skill in relevant work. Mentors can accelerate a domain while creating obligations or stylistic bias. Staff development competes with immediate coverage.

Equipment and infrastructure have explicit consumers. Examples include reliable remote video/data access, secure field records, translation support, travel flexibility, office communications, and research tooling. Every upgrade states the authoritative calculation it changes, the conditions under which it applies, operating/maintenance cost, and tradeoff. No tool grants generic certainty. Heavy field equipment can consume itinerary capacity; premium data can be useless where coverage is sparse; an upgraded office without the right people remains weak.

### 14.7 Retirement, victory, and legacy

An open Regional career has no single hard victory. The player may set and complete ambitions such as becoming the authority in one market, establishing a durable ethical corridor, leading a club department, building an independent network, recovering from collapse, or mentoring a successor. Milestones unlock recognition and retrospective content, not an automatic end screen.

Retirement is voluntary whenever the player is not inside an unresolved critical transaction. The game also offers retirement at natural contract, succession, financial, or recovery boundaries. Firing, bankruptcy, access loss, and route collapse are setbacks with recovery choices rather than immediate game-over states. If every viable recovery is declined, the player can close the career through an explicit retirement decision.

The retirement review grades no single score. It presents:

- territories understood and how that knowledge changed;
- routes created, sustained, repaired, or abandoned;
- player and club outcomes attributable to recommendations;
- process quality and confidence calibration;
- financial sustainability and client/employer value;
- people helped, alienated, mentored, or lost;
- best and worst calls using evidence available at the time;
- rival history and public/industry reputation;
- recovery chapters and leadership legacy;
- a seed/run fingerprint for comparison or replay.

New Game+ may unlock cosmetic presentation, retrospective starting backgrounds, or harder world traits. It must not grant hidden truth, guaranteed access, or permanent mechanical superiority that invalidates a fresh career.

---

## 15. Delegation and late-game leadership

### 15.1 Unified fieldwork model

Today, `NPCScout`, `AssistantScout`, and agency employees overlap. Regional Expert should introduce a shared `FieldOperative` adapter over existing staff records rather than a fourth unrelated employee type.

Every delegate has:

- employment source and role;
- location and travel readiness;
- language and regional knowledge;
- source access and affiliations;
- observation/report skills;
- reliability, fatigue, and calibration;
- current brief and capacity;
- manager relationship and autonomy preference;
- attributable outputs and errors.

### 15.2 Delegation brief

The player assigns an outcome-oriented brief:

- question to answer;
- geography and allowed sources;
- deadline;
- evidence minimum;
- budget and travel authority;
- privacy/conflict constraints;
- escalation triggers;
- expected artifact;
- acceptable uncertainty.

The delegate can return evidence, request more authority, expose a conflict, miss the brief, or challenge the premise. The player spends limited leadership attention to review, coach, spot-check, or accept.

### 15.3 Automation without abdication

At high tiers, routine maintenance can be automated by policy:

- keep knowledge above a freshness threshold;
- prioritize expiring client briefs;
- never promise exclusivity without escalation;
- cap travel spend;
- require two independent sources for high-conviction recommendations;
- preserve minimum alumni follow-up;
- avoid assigning staff across affiliation conflicts.

Policy outcomes remain attributable and reviewable. Critical choices never silently vanish; a named delegate or policy owns them and consequences record that owner.

---

## 16. Replayability and event architecture

### 16.1 Seeded career identity

Extend `RunManifest` with:

- `gameModeId: "regional-expert"` and mode rules version;
- `runKind: "career" | "challenge"`, with optional challenge definition ID;
- specialization/build identity stored separately from mode and run kind;
- starting regional profile;
- generated market archetypes;
- corridor opportunity traits;
- language/access setup;
- starting relationship triangle;
- rival organization distribution;
- regional economy volatility;
- content pack versions;
- tutorial template and completion mode.

The manifest allows a career to be reproduced. Deterministic does not mean predictable: the player sees only information their character could know.

### 16.2 Region archetypes

Archetypes shape probabilities and initial systems but do not dictate outcomes:

- academy-dense export market;
- late-development senior market;
- fragmented local competition network;
- data-rich, access-poor market;
- relationship-rich, low-visibility market;
- expensive mature market;
- cross-border tournament corridor;
- rapidly investing federation;
- economically unstable talent source;
- under-scouted diaspora network.

Two countries can share an archetype but differ through clubs, actors, languages, rules, geography, conditions, and seed.

### 16.3 Event layers

| Layer | Cadence | Examples |
| --- | --- | --- |
| Signal | Weekly | Contact tip, data anomaly, role vacancy, access offer |
| Friction | Weekly/monthly | Delay, contradiction, credential issue, staff overload |
| Choice event | Monthly/conditional | Exclusivity, public claim, family request, client conflict |
| Regional condition | Seasonal/multi-season | Investment wave, transport shock, recession, regulation shift |
| Career chain | Multi-season | Rivalry, office rise/fall, alumni network, staff succession |
| World callback | Years later | Player success/failure, route legacy, contact promotion, public reassessment |

Extend the existing world-condition, special-event, consequence, and event-director frameworks. Do not build separate random pop-up systems.

### 16.4 Randomness rules

- Random rolls are seeded, logged at domain boundaries, and stable across save/load.
- Important outcomes combine state and uncertainty; they are not arbitrary coin flips.
- The player can usually understand the contributing factors afterward without seeing exact hidden rolls.
- Events respect prerequisites and cannot demand nonexistent players, fixtures, countries, contacts, or funds.
- Cooldowns and diversity weighting prevent the same event family from dominating.
- Failed or ignored events can alter later event weights.
- Rare events create stories, not automatic optimal rewards.
- Manual and batch week advancement produce equivalent state.

### 16.5 Distinct-career target

Across twenty seeds with the same starting preset, by season three at least:

- 70% of careers should have a different primary contested territory or route;
- 60% should have a different top relationship ally and rival;
- 50% should have experienced a materially different market-condition chain;
- no single weekly intent should exceed 45% of all optimal expert actions in balance simulations;
- multiple viable careers should exist without opening an office or joining a club;
- event repetition should remain below the authored cooldown target;
- outcome distributions should show both recovery and collapse without dead-career lockout.

These are telemetry/balance targets, not achievements shown to players.

### 16.6 Challenge Career compatibility

Challenge Careers compose Regional Expert by setting `runKind: "challenge"`, selecting the same `gameModeId: "regional-expert"`, and adding a validated challenge contract. A Regional challenge may constrain starting nodes, budget, deadlines, employer, access, world traits, permissible bases, or required outcomes. It consumes the same territory, knowledge, route, brief, report, rival, finance, and consequence engines.

Challenge setup may not mutate shared state through ad hoc UI patches. The shared scenario validator must prove that every objective and restriction is enforceable by registered Regional capabilities and canonical domain events. When a challenge ends, its score/epilogue can evaluate bounded objectives while the underlying mode archive remains internally consistent. The challenge manifest is immutable. If a definition allows “continue as career,” the game forks a new career save with a new `RunManifestV2`, `runKind: "career"`, and `parentChallengeRunId`; it archives the original challenge unchanged and never converts it in place or changes its fingerprint.

---

## 17. Workspaces, interactivity, presentation, and accessibility

Regional Expert should reuse the six permanent workspaces while tailoring their decision surfaces.

### 17.1 Desk — Dispatch and commitments

Primary decisions:

- triage briefs, signals, obligations, and expiring windows;
- decide what deserves personal attention;
- respond to contacts and stakeholders;
- review delegated exceptions;
- see consequences that require action.

Interactive presentation:

- regional dispatch cards with map context;
- voice/message snippets where assets exist;
- deadline and obligation links;
- a compact "why now" explanation;
- choice scenes with named people, not anonymous modifiers.

Avoid: a feed of decorative notifications or equivalent accept/dismiss buttons.

### 17.2 Planner — Intent, itinerary, and delegation

Primary decisions:

- choose weekly intents;
- build or auto-plan itineraries;
- reserve travel and access;
- assign outcome briefs;
- handle conflicts, slack, fatigue, and budget.

Interactive presentation:

- drag/keyboard route legs on a time-and-place canvas;
- map-linked calendar;
- visible travel connections and failure points;
- compare "go myself," "delegate," "remote," and "defer";
- immediate opportunity-cost preview.

Keyboard users receive equivalent move, insert, remove, and reorder controls with clear announcements.

### 17.3 Prospects — Pipeline

Primary decisions:

- advance, monitor, compare, pause, reroute, or close a lead;
- connect player evidence to a destination brief;
- identify missing regional context;
- follow alumni and route outcomes.

Interactive presentation:

- pipeline board plus dense expert table toggle;
- source and destination map miniatures;
- multi-season player/club/manager timelines;
- evidence contradiction cards;
- side-by-side destination-fit comparison;
- clear archive/age-out states.

### 17.4 Reports — Dossiers and accountability

Primary decisions:

- compose the correct artifact for the audience;
- set confidence and conviction;
- compare alternatives;
- revise after new evidence;
- review predicted versus actual outcomes.

Interactive presentation:

- evidence tray with provenance;
- map/route context embedded in report;
- confidence-by-category controls;
- version-diff view;
- stakeholder reaction and later callback timeline.

### 17.5 World — Territory command map

Primary decisions:

- choose where to deepen, expand, defend, or leave;
- inspect market/knowledge/access/rival layers;
- plan routes and bases;
- compare region nodes;
- open contact, institution, competition, and route dossiers.

Interactive layers:

- content-tier honesty;
- knowledge freshness heatmap;
- presence sources;
- live/available route edges;
- offices and staff;
- market opportunity windows;
- rival reach with intelligence fog;
- active itineraries and disruptions;
- source/destination player flows;
- world-condition regions.

Graphics should include animated route travel, venue/fieldwork vignettes, region-specific but rights-cleared environmental art, competition scenes, office evolution, and consequence callbacks. Motion must obey reduced-motion settings and never carry essential information alone.

### 17.6 Career — Reputation, organization, and legacy

Primary decisions:

- accept roles and clients;
- allocate department/firm strategy;
- open, staff, downgrade, or close bases;
- set policies and develop employees;
- review finances, calibration, reputation, and route history;
- choose recovery and succession paths.

Interactive presentation:

- career map of regions and transitions;
- best/worst calls with evidence available at the time;
- relationship constellation;
- organization chart and coverage map;
- route legacy and alumni wall;
- multi-season club/manager/player comparisons.

### 17.7 Mobile

- World defaults to a searchable region list with a synchronized map, not a tiny map-only interaction.
- Route planning uses a leg list with an optional map preview.
- Bottom navigation retains six destinations and indicates urgent obligations without notification overload.
- Dossiers use sticky primary actions and collapsible evidence domains.
- Comparison supports two entities on narrow screens and saves larger comparison sets for desktop review.

### 17.8 Accessibility acceptance

- Every map action has a list/table equivalent.
- Country, node, route, office, and rival markers are keyboard reachable in a predictable order.
- Status is not conveyed solely by color, animation, or geography.
- Dynamic route and schedule changes use concise live-region announcements.
- Dialogs restore focus and support Escape when safe.
- Touch targets meet the shipped application standard.
- Reduced motion, high contrast, text scaling, and 200% zoom remain functional.
- Automated Axe checks report zero serious or critical issues across all six workspaces at desktop and mobile sizes.
- Manual NVDA and VoiceOver scripts cover map/list synchronization, route planning, report evidence, travel confirmation, office management, and consequence dialogs before release.

---

## 18. Data model

The following schemas are directional TypeScript contracts. Final names should follow the existing core-domain conventions, but the separation of persisted facts and derived views is required.

### 18.1 Mode and geography

```ts
// RunManifestV2, GameModeId, RunKind, and ModeState are imported from the
// shared mode platform; Regional only narrows the canonical manifest.
type RegionalRunManifest = RunManifestV2 & {
  gameModeId: "regional-expert";
};

interface RegionalModeState {
  startingProfileId: string;
  regionProfilesVersion: string;
  territoryCoverage: Record<string, TerritoryCoverageRecord>;
  knowledgeEvidence: RegionalKnowledgeEvidence[];
  accessAgreements: Record<string, AccessAgreement>;
  routes: Record<string, RegionalRoute>;
  itineraryIds: string[];
  baseIds: string[];
  observedMarketSnapshotIds: string[];
  pipelines: Record<string, CrossBorderPipeline>;
  briefs: Record<string, RegionalBrief>;
  rivalIntelligence: Record<string, RivalReachEstimate>;
  careerArchive: RegionalCareerArchive;
}

interface RegionProfile {
  id: string;
  kind:
    | "macro"
    | "country"
    | "subregion"
    | "cityCluster"
    | "corridor"
    | "competition"
    | "academyCluster"
    | "market";
  parentId?: string;
  countryKey: string;
  name: string;
  contentTier: "fullWorld" | "talentPool" | "contextOnly";
  supportedActivities: RegionalActivityType[];
  adjacentNodeIds: string[];
  institutionIds: string[];
  competitionIds: string[];
  venueIds: string[];
  languageIds: string[];
  marketProfileId: string;
  opportunityProfileId: string;
}
```

`GameModeId`, `Specialization`, and `RunKind` must remain separate authorities. Regional Expert is the host simulation mode; `regional` is a legacy/current specialization choice that can seed a build but must not be used as the mode discriminator. A Challenge Career sets `runKind: "challenge"` and composes a Regional Expert host mode rather than becoming a fifth mode or forking Regional engine state. New-game routing, save manifests, analytics, migrations, feature flags, and entitlement checks use this boundary consistently. `RunManifestV2` is the only run identity. `RegionalModeState` is stored inside the shared discriminated `ModeState` envelope, whose `modeStateSchemaVersion` owns schema migration.

Canonical scout location, travel itineraries, bases that affect the shared organization, market truth, and rival organizations/reach stay in shared world state. Regional mode state stores references and the scout's fallible observations (`itineraryIds`, market snapshot IDs, and `rivalIntelligence`), preventing a second location or market authority. Other modes can therefore see the same travel, market, staff, and rival history.

`RegionProfile` is generated or content-backed. It must not be embedded redundantly into every save. Saves store stable IDs, version, generated overrides, and player-created records.

### 18.2 Evidence-backed knowledge

```ts
type RegionalKnowledgeDomain =
  | "competition"
  | "developmentPathway"
  | "peopleAccess"
  | "marketRegulation"
  | "logistics"
  | "languageCommunication"
  | "adaptation"
  | "institutionIdentity";

interface RegionalKnowledgeEvidence {
  id: string;
  nodeId: string;
  domain: RegionalKnowledgeDomain;
  subjectId?: string;
  sourceType: "live" | "data" | "contact" | "delegated" | "reportOutcome" | "public";
  sourceId?: string;
  acquiredWeek: number;
  acquiredSeason: number;
  confidence: number;
  freshnessClass: "fast" | "medium" | "slow" | "historical";
  claimKey: string;
  value: RegionalClaimValue;
  contradictionGroupId?: string;
  visibility: "player" | "internalEngine";
  creditedEventId: string;
}

interface DerivedRegionalKnowledge {
  nodeId: string;
  domains: Record<RegionalKnowledgeDomain, {
    coverage: number;
    confidence: number;
    freshness: number;
    supportingEvidenceIds: string[];
    contradictionIds: string[];
  }>;
  legacyScalar: number;
}
```

`creditedEventId` prevents report, outcome, or weekly processing from awarding knowledge twice.

### 18.3 Access and people

```ts
interface AccessAgreement {
  id: string;
  nodeId: string;
  grantorContactId: string;
  organizationId?: string;
  type: "credential" | "invitation" | "introduction" | "exclusivity" |
    "dataPermission" | "partnerBase" | "trialPathway" | "privacyCommitment";
  scopeIds: string[];
  startsWeek: number;
  expiresWeek?: number;
  requirementIds: string[];
  conflictTags: string[];
  revocationConditions: string[];
  status: "offered" | "active" | "suspended" | "revoked" | "expired";
}

interface ContactRegionalReach {
  contactId: string;
  nodeIds: string[];
  institutionIds: string[];
  accessTypes: string[];
  languageIds: string[];
  affiliationIds: string[];
}
```

### 18.4 Routes, itineraries, and bases

```ts
interface RegionalRouteEdge {
  id: string;
  originNodeId: string;
  destinationNodeId: string;
  mode: "rail" | "road" | "air" | "ferry" | "local";
  baseCost: number;
  baseDurationSlots: number;
  baseFatigue: number;
  reliability: number;
  requirementIds: string[];
  conditionExposureTags: string[];
}

interface TravelItinerary {
  id: string;
  purpose: "fieldwork" | "relationship" | "assignment" | "office" | "mixed";
  legIds: string[];
  activityIds: string[];
  startsWeek: number;
  endsWeek: number;
  budgetAuthorized: number;
  slackSlots: number;
  status: "draft" | "booked" | "active" | "disrupted" | "complete" | "cancelled";
  resolutionEventIds: string[];
}

interface RegionalBase {
  id: string;
  nodeId: string;
  type: "home" | "temporaryDesk" | "partner" | "fieldOffice" | "regionalHub" | "hq" | "clubDepartment";
  partnerContactId?: string;
  agreementId?: string;
  openedWeek: number;
  leaseEndsWeek?: number;
  staffIds: string[];
  capacity: number;
  monthlyCost: number;
  status: "planned" | "active" | "degraded" | "closing" | "closed";
  historyEventIds: string[];
}
```

The existing `TravelBooking` and `SatelliteOffice` remain readable during migration and can be projected from the new records for older shared UI until removed.

### 18.5 Markets, briefs, and pipelines

```ts
interface RegionalMarketSnapshot {
  id: string;
  nodeId: string;
  season: number;
  createdWeek: number;
  evidenceIds: string[];
  buyingPressureRange: NumericRange;
  sellingPressureRange: NumericRange;
  costBands: Record<string, NumericRange>;
  registrationWindowIds: string[];
  constraintIds: string[];
  clubDemandIds: string[];
  opportunityWindowIds: string[];
}

interface RegionalBrief {
  id: string;
  ownerType: "club" | "client" | "self" | "federation";
  ownerId: string;
  question: string;
  sourceNodeIds: string[];
  destinationContextIds: string[];
  deliverableType: string;
  requirementIds: string[];
  deadlineWeek: number;
  budget: number;
  conflictTags: string[];
  status: "offered" | "accepted" | "active" | "submitted" | "resolved" | "failed" | "declined";
  outcomeId?: string;
}

interface CrossBorderPipeline {
  id: string;
  sourceNodeIds: string[];
  destinationClubIds: string[];
  stakeholderIds: string[];
  routeIds: string[];
  playerCaseIds: string[];
  establishedSeason: number;
  evidenceIds: string[];
  outcomeIds: string[];
  status: "hypothesis" | "active" | "proven" | "stressed" | "suspended" | "closed";
}
```

### 18.6 Rival reach and archive

```ts
interface RivalReachRecord {
  organizationId: string;
  nodeId: string;
  sourceIds: string[];
  knownInfluenceRange?: NumericRange;
  lastObservedWeek: number;
  contestedAssetIds: string[];
  intelligenceConfidence: number;
}

interface RegionalCareerArchive {
  reportOutcomeIds: string[];
  territoryChapterIds: string[];
  routeOutcomeIds: string[];
  stakeholderMemoryIds: string[];
  careerSetbackIds: string[];
  recoveryChapterIds: string[];
  annualReviewIds: string[];
  compactedThroughSeason: number;
}
```

---

## 19. Engine architecture and integration

### 19.1 Existing engines to extend

| Existing module | Use |
| --- | --- |
| `src/engine/world/regionalPresence.ts` | Remain the authoritative derived operational-effects bridge |
| `src/engine/specializations/regionalKnowledge.ts` | Become the compatibility facade and derived summary over evidence-backed knowledge |
| `src/engine/world/countryAvailability.ts` | Remain country/content-tier authority; expose node capabilities |
| `src/engine/world/travel.ts` | Keep identity, validation, and simple quotes; delegate new trips to the route engine |
| `src/engine/world/international.ts` | Generate regional briefs and destination-valid opportunities |
| `src/engine/world/internationalDeliverables.ts` | Reuse exact-once deliverable resolution and archival contracts |
| `src/engine/network/contacts.ts` | Own real people, memory, trust, decay, access grantors, and relationship consequences |
| `src/engine/rivals/organizations.ts` | Own persistent organization intent/action/history |
| `src/engine/rivals/rivalScouts.ts` | Own individual rival targeting and intelligence |
| `src/engine/world/worldConditions.ts` | Own deterministic world/regional condition generation and modifiers |
| `src/engine/events/specialEventDeck.ts` | Own conditional special-event selection and consequence choices |
| `src/engine/career/leadership.ts` | Own attention, delegation, and attributable portfolio decisions |
| `src/engine/career/recovery.ts` | Own failure/recovery plans and offer gates |
| `src/engine/finance/internationalExpansion.ts` | Own base financial transactions and lifecycle after generalization |

### 19.2 New domain modules

| Proposed module | Responsibility |
| --- | --- |
| `src/engine/modes/` Regional definition | Register `gameModeId`, capabilities, workspace/action policy, report/accountability profile, progression, onboarding, content IDs, and challenge compatibility |
| `src/engine/regional/regionProfiles.ts` | Generate/validate hierarchical nodes and capability flags |
| `src/engine/regional/knowledgeEvidence.ts` | Add, deduplicate, decay, contradict, and derive knowledge evidence |
| `src/engine/regional/access.ts` | Validate agreements, conflicts, expiry, revocation, and action permission |
| `src/engine/world/routes.ts` | Quote shared route edges, find paths, validate contiguous travel, and apply disruptions |
| `src/engine/world/itineraries.ts` | Own the one canonical scout location, reserve schedules, advance legs, and resolve delay choices for every mode |
| `src/engine/world/regionalMarkets.ts` | Own objective regional market conditions and opportunity windows visible to every mode |
| `src/engine/regional/marketIntel.ts` | Convert earned Regional evidence into fallible, time-stamped market snapshots referenced by Regional cases |
| `src/engine/regional/pipelines.ts` | Link cases, source/destination context, route outcomes, adaptation, and alumni |
| `src/engine/regional/briefs.ts` | Generate, accept, validate, submit, grade, and archive professional briefs |
| `src/engine/regional/territoryCoverage.ts` | Derive coverage states, capacity, gaps, and maintenance demand |
| `src/engine/rivals/geographicReach.ts` | Own authoritative organization reach, costs, actions, and history across modes |
| `src/engine/regional/rivalIntel.ts` | Derive the Regional player's incomplete estimate of rival reach from earned intelligence |
| `src/engine/regional/career.ts` | Mode-specific stage requirements, role offers, setbacks, and legacy summaries |
| `src/engine/regional/migrations.ts` | Pure, versioned mode migration used by every persistence path |

All pure simulation modules accept state plus deterministic random context and return state changes/events. They do not import React, Zustand, Electron, or storage.

### 19.3 Weekly processing order

Order is a simulation contract:

1. Validate/migrate loaded regional mode state if needed.
2. Materialize scheduled player and delegate intents.
3. Advance itinerary legs and resolve known disruptions.
4. Apply location/access availability to scheduled work.
5. Resolve observations, research, meetings, and delegated briefs.
6. Record knowledge evidence and contradictions exactly once.
7. Submit/advance reports, briefs, placements, and opportunity windows.
8. Process contacts, promises, access expiry, and relationship memory.
9. Process clubs, players, development, transfers, injuries, and adaptation.
10. Update pipelines and report accountability from world outcomes.
11. Process rivals using scoped reachable assets and known world state.
12. Process bases, staff capacity/fatigue, office costs, and ledger entries.
13. Process world conditions and event-director choices at their cadence.
14. Derive presence, coverage, market views, knowledge summaries, and alerts.
15. Archive compactable detail and produce the weekly explanation bundle.

Manual advancement, fast-forward, NPC delegation, and season rollover call the same ordered processor. UI actions may enqueue intents but may not independently simulate outcomes.

### 19.4 Store actions

Expose narrow actions such as:

- `setRegionalWeeklyIntent`
- `createTravelItinerary`
- `bookTravelItinerary`
- `respondToTravelDisruption`
- `requestRegionalIntroduction`
- `acceptAccessAgreement`
- `recordRegionalHypothesis`
- `assignRegionalBrief`
- `submitRegionalArtifact`
- `openRegionalBase`
- `staffRegionalBase`
- `closeRegionalBase`
- `createPipeline`
- `changePipelineStatus`
- `setRegionalDelegationPolicy`
- `resolveRegionalCriticalChoice`

Actions validate current generated-world capability, location, access, schedule, funds, conflicts, and exact-once event IDs. Components never mutate arrays directly.

### 19.5 Selectors and rendering performance

Use memoized narrow selectors for:

- visible map nodes and overlays;
- selected-node dossier;
- itinerary legs;
- weekly intent availability;
- active obligations;
- pipeline cards/table rows;
- report evidence tray;
- career archive timeline.

Do not subscribe the map or pipeline board to the entire game store. Compute heavy derived indexes once per relevant state revision. Virtualize large pipeline/history lists, lazy-load non-core drawers, and cap animation layers on low-end profiles.

---

## 20. Persistence, migration, save growth, and compatibility

### 20.1 Versioning

- Upgrade the one shared run manifest to `RunManifestV2` with `gameModeId`, `runKind`, `modeDefinitionVersion`, and `modeContentFingerprint`; keep `modeStateSchemaVersion` on the outer mode-state envelope rather than inventing Regional identity/version fields.
- Save generated decisions and stable content IDs, not duplicated immutable profile data.
- Keep random stream boundaries versioned so patches do not silently scramble every future event in an existing career.
- Record mode feature flags that materially change simulation behavior.

### 20.2 Migration path

1. Invoke the canonical legacy-mode classifier in `README.md`. `specialization === "regional"` is insufficient by itself; only a valid manifest, known legacy build plus a complete Regional state signature, or an explicit legacy-scenario host mapping may select Regional Expert. Ambiguous saves remain preserved and use the recorded `legacy-import` compatibility choice/recovery flow.
2. Canonicalize home country using `getScoutHomeCountry` and current identity helpers.
3. Convert country `Territory` records into country-node coverage projections.
4. Convert scalar `RegionalKnowledge` into legacy evidence records marked `migrationEstimate`; do not invent specific contact claims or cultural facts.
5. Link valid `localContacts` to real contacts where identity exists; otherwise discard opaque bonuses and create a migration notice, not a fake person.
6. Convert an active `TravelBooking` to a simple two-leg itinerary from the pinned home base, preserving cost and dates.
7. Convert valid `SatelliteOffice` records to field offices, deduplicating employee assignment.
8. Filter all nodes, offices, routes, assignments, staff claims, and contacts through generated-world country eligibility.
9. Preserve ledger, report, relationship, rival, world-condition, and career histories.
10. Rebuild derived presence, coverage, and knowledge summaries.
11. Validate invariants; if recoverable records fail, quarantine them in migration diagnostics rather than crash the save.

`src/engine/regional/migrations.ts` must be a pure function used by `gameStore.ts`, `src/lib/db.ts`, cloud load, import, and packaged recovery. Remove duplicated regional defaults once all callers use it.

### 20.3 Archive compaction

- Keep full detail for active cases, current/recent seasons, unresolved promises, contested routes, and records referenced by a report.
- Compact old weekly travel/activity logs into immutable season summaries while retaining ledger totals, knowledge provenance needed for current claims, major relationship memories, and career callbacks.
- Never compact an event that could still resolve or a source required to explain a live derived value.
- Store hash/count diagnostics before and after compaction.
- Add configurable long-save thresholds and monitor size, load time, and memory in the 20-seed × 30-season soak.

### 20.4 Interrupted writes and cloud conflicts

- Save regional mode state in the same atomic snapshot as world state and ledger.
- Interrupted-write recovery must choose the last verified complete snapshot.
- Cloud conflict UI shows career, season/week, mode, last action, device, and snapshot integrity.
- Never merge two divergent simulation snapshots field by field.
- Package tests cover offline play, reconnect, conflict choice, recovery, and repeated save/load on Windows, macOS, and Linux.

---

## 21. Content and audiovisual requirements

### 21.1 Minimum launch content

- 10 region archetypes.
- 8 opening-case templates with at least 5 variable beats each.
- 40 Regional-specific weekly signals.
- 30 relationship conflict events.
- 24 route/travel events.
- 24 market/regulatory/economic events.
- 18 rival territory actions and 12 counter-events.
- 16 office/base events.
- 20 placement/adaptation callbacks.
- 12 failure/recovery chains.
- 8 late-career leadership chains.
- 6 club-role arcs and 6 independent-client arcs.
- Authored broad orientation for every supported country, plus institutional facts generated from simulation state.

Content counts are floors, not substitutes for systemic variation. Templates combine actors, nodes, constraints, evidence, timing, and consequences under eligibility rules.

### 21.2 Visual/audio language

- World-map layers and route animation communicate movement and pressure.
- Fieldwork scenes show venue, academy, travel, office, and meeting contexts without implying match control.
- Region-specific ambience uses owned/licensed assets and supports independent music/ambience/effects controls.
- Consequence callbacks use a mix of dossier stamps, map changes, messages, newspaper-style panels, office scenes, and alumni timeline moments.
- High-value discovery, painful failure, route breakthrough, and long-term vindication each have distinct presentation beats.
- Repetition controls rotate copy, composition, sound, and image treatment.
- All assets remain in the existing hash inventory with commercial-rights provenance recorded before packaging.

---

## 22. Delivery roadmap

Effort uses S (up to several focused days), M (roughly one to two engineer-weeks), L (multi-week cross-layer change), and XL (multi-system milestone). Estimates assume existing shared systems remain available and include engineering plus automated tests, but not the full authored-content volume or external usability sessions.

### 22.1 Executable work-package register

The register is the delivery authority; the detailed entries that follow add implementation notes. “Existing → new modules” names the current integration point first and proposed domain owner second.

| ID | Verified current problem | Proposed solution and player value | Existing → new modules | Dependencies and principal risks | Effort | Acceptance criteria | Required tests | Save migration impact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RE-P0-01 | NPC empty-territory processing can use the global player pool; assignment capacity is not enforced atomically. | Enforce geographic/capacity integrity and return an honest no-lead result, so delegated coverage is trustworthy. | `npcScouts.ts`, `progressionActions.ts` → territory validation in `territoryCoverage.ts` | Canonical country identity; legacy over-capacity claims may need repair. | M | Zero out-of-scope reports; capacity and unique assignment always hold. | Unit, generative assignment, migration, manual/batch equivalence. | Deduplicate claims and unassign excess staff with notice. |
| RE-P0-02 | Regional perks are defined but their generic effect applicator has no verified consumer; conditions can be flattened. | Wire or replace every perk and expose effect provenance, making progression real and honest. | `perks.ts` → domain-specific perk consumers in presence, knowledge, travel, contacts, reports | Knowledge/access contracts; balance drift; hidden-truth risk. | L | Every shipped perk has a tested consumer; conditional effects respect predicates; no truth leaks. | Per-perk unit table, cross-engine integration, explanation snapshots. | Rules-version marker; no structural rewrite unless effects store state. |
| RE-P0-03 | Store/database regional migration logic is duplicated. | One pure versioned migration used by every persistence path protects long careers. | `gameStore.ts`, `db.ts` → `regional/migrations.ts` | Target schemas must stabilize; highest save-integrity risk. | L | Migration is idempotent; all load paths normalize identically. | Golden fixtures, import/cloud parity, corruption and interrupted-write recovery. | Central migration work package. |
| RE-P0-04 | Regional knowledge can grant opaque local-contact string bonuses unrelated to persistent people. | Resolve introductions into real contacts/access leads, making local advantage inspectable and narrative. | `regionalKnowledge.ts`, `contacts.ts`, `regionalPresence.ts` → `regional/access.ts` | Region profile/reach identity; duplicate-contact risk. | M | Every mechanical contact contribution links to a real actor/agreement. | Identity, dedupe, provenance, decay/presence integration. | Link resolvable IDs; discard unresolvable bonuses with diagnostic. |
| RE-P0-05 | Specialization presence does not define a full mode or supported activities by content tier. | Add the standardized manifest/mode-state contract and capability matrix, preventing impossible or misleading actions. | core types, `runManifest.ts`, `countryAvailability.ts`, new-game → shared `src/engine/modes/` registry plus `regionProfiles.ts` | Existing new-game/save routing; sparse talent-pool content; shared legacy classifier. | M | `GameModeId`, `Specialization`, and `RunKind` remain separate; every offered action is fulfillable. | Capability properties across countries/seeds, manifest/mode-state routing, and the shared legacy-classifier fixture matrix. | Use the canonical classifier; specialization alone never selects `regional-expert` or a run kind. |
| RE-P1-01 | Territories are country-only while generated subregions have no coverage role. | Hierarchical nodes and derived coverage create meaningful depth-versus-breadth territory strategy. | `init.ts`, core `Territory`, World UI → `regionProfiles.ts`, `territoryCoverage.ts` | Capability matrix; map density/content imbalance. | XL | A full slice supports survey-to-embedded progression, capacity gaps, comparison, and persistence. | Determinism, identity, coverage, capacity, capability integration. | Project country territories into country nodes. |
| RE-P1-02 | Scalar knowledge cannot express source, topic, freshness, or contradiction. | Evidence-backed domains and hypotheses turn regional judgment into the core game. | `regionalKnowledge.ts`, observations/reports/contacts → `knowledgeEvidence.ts` | Region nodes; state-size/UI complexity. | XL | Every estimate drills to evidence; repeats diminish; contradictions persist and matter. | Credit/dedup, decay, contradiction, hidden boundary, save/load, size soak. | Convert scalar to low-specificity migration evidence. |
| RE-P1-03 | Planner relies on generic task filling rather than a Regional strategy. | Six strategic intents expose depth, breadth, access, timing, conversion, and defense choices each week. | schedule/weekly actions, Planner → regional intent resolver | Knowledge, capabilities, contacts; dominant-strategy risk. | L | Intent previews show cost/risk/opportunity; at least two viable contexts each. | Availability matrices, balance simulation, keyboard E2E, batch parity. | Wrap existing scheduled work as `legacyTask`. |
| RE-P1-04 | International deliverables are exact-once but generic; reports do not grade regional process/fit/timing. | Regional briefs and artifacts create accountable professional judgment and long callbacks. | `international.ts`, `internationalDeliverables.ts`, reports → `regional/briefs.ts` | Knowledge/market context; grading explainability. | XL | Process, fit, timing, calibration, and outcomes affect review; grinding is impossible. | Resolve-once, anti-grind, revisions, delayed callback, reload. | Existing offers retain a legacy blueprint until resolution. |
| RE-P1-05 | Generic onboarding cannot teach knowledge/access/presence or deliver a Regional aha moment. | Generated skippable opening cases teach the real loop and reveal one delayed consequence. | new-game, tutorial, event director, six workspaces → Regional case content | P1 systems; template eligibility/combinatorics. | L engineering + L content | All first-hour criteria pass for every preset; tutorial skip never removes gameplay. | E2E by template/preset, resume, preference persistence, accessibility. | Tutorial completion stored outside career saves. |
| RE-P2-01 | Travel is one home-origin booking with no continuous location or itinerary. | A shared route graph and one canonical world itinerary/location authority make travel strategic without creating a Regional-only location. | `world/travel.ts`, progression/weekly actions → shared `world/routes.ts`, `world/itineraries.ts` | Region nodes; scheduling complexity and stranded-state risk; all modes must read the same location. | XL | Legs are contiguous; costs reconcile; actual shared location drives access; ghost routes and divergent location fields are impossible. | Path properties, single-location authority, ledger invariants, disruption, rollover, batch parity. | Convert active booking to a shared outbound/return itinerary. |
| RE-P2-02 | Contacts lack geography-scoped reach, permissions, and inspectable obligations. | Persistent access agreements turn relationships into strategic geography. | `contacts.ts`, consequence engine → `access.ts` | Region profiles, actor migration; excessive blocking risk. | L | Major access has grantor, scope, duration, conditions, conflicts, and revocation. | Expiry/revocation, conflicts, delegated choices, memory callbacks. | Infer conservative reach from existing country affiliation. |
| RE-P2-03 | Familiarity/adaptability do not model practical communication or translator tradeoffs. | Bounded language proficiency and support change evidence, time, cost, and relationship friction. | scout/staff creation, contacts, travel, reports → language capability service | Access/region profiles; stereotype and grind risk. | L | Language never changes football ability; every effect is practical/explainable. | Ethical boundaries, translator effects, learning bounds, migration. | Infer/confirm starting language during first upgraded load. |
| RE-P2-04 | Current satellite office is a late generic independent-only asset. | Temporary desks, partner bases, field offices, hubs, HQ, and club departments make presence strategic on both paths. | `internationalExpansion.ts`, `OfficesTab.tsx`, employment → generalized base lifecycle | Routes/access/staff adapter; bankruptcy snowball. | XL | Each base has a distinct purpose/downside; staffing/closure immediately changes presence. | Ledger, staff uniqueness, cost cadence, closure cascade, recovery. | Convert satellites to field offices. |
| RE-P2-05 | Regional opportunity lacks evidence-sensitive market, regulation, demand, and timing context. | Shared objective market state plus Regional evidence-derived snapshots make when and where as important as who without duplicating economic truth. | transfer/contract/club/world-condition engines → shared `world/regionalMarkets.ts` plus `regional/marketIntel.ts` | Knowledge and club simulation; false precision/duplicate economy risk. | XL | Every mode observes the same market events; Regional ranges cite earned sources; timing changes valid recommendations; transfer authority remains single. | Shared-market identity, range containment, modifiers, expiry, hidden boundary, long-season stability. | Generate shared market state at a safe seasonal boundary; create no retroactive Regional certainty. |
| RE-P3-01 | Reports/placements do not combine into persistent cross-border pathways, and long-unsigned prospects can linger without a credible lifecycle. | Pipelines link source, route, destination, adaptation, alumni, accountability, and contextual age-out into legacy. | reports, transfers, development, player lifecycle, alumni → `pipelines.ts` | Reports/markets/routes; causation-overclaim and pool-depletion risk. | XL | Every placement traces to later outcome; inactive unsigned prospects exit active pools contextually after roughly 3–4 seasons; archives and replacement cohorts remain coherent. | Multi-season lifecycle, conditional age-out, pool conservation, loan/release/retire, compaction/callback. | Seed low-context historical pipelines where links are reliable. |
| RE-P3-02 | Rival organization pressure is global rather than territory/asset scoped. | Shared authoritative geographic reach plus a Regional intelligence view creates fair, legible competition without two rival truths. | `organizations.ts`, `rivalScouts.ts` → shared `rivals/geographicReach.ts` plus `regional/rivalIntel.ts` | Nodes/access/routes; snowball/cheating perception. | L | Rival actions have reachable location, target, cost, motive, and shared history; the player's estimate can be incomplete and counterplay exists. | Shared reach identity, scope, resources, resolve-once, fog, difficulty fairness, 30-season soak. | Seed shared reach from archetype and valid existing history; initialize player intelligence conservatively. |
| RE-P3-03 | Club employment is generic and does not create a Regional department career. | Internal briefs, philosophy, staff politics, board accountability, and leadership form a constrained high-resource path. | employment, board, leadership/recovery → `regional/career.ts` | Delegation/bases/reports; manager-feature scope creep. | XL | Scouting remains central; leadership changes alter work; firing and recovery are viable. | Role gates, directives, portfolio attribution, turnover, career E2E. | Map existing Regional club careers to nearest valid role. |
| RE-P3-04 | Consulting/agency are generic, and agency ownership risks being the only independent endgame. | Market audits, corridor design, retainers, intelligence products, and network leadership create several viable businesses. | consulting, agency, finance → Regional contract adapters in `briefs.ts`/`career.ts` | Markets/reports/access/bases; easy-money/report-grind risk. | XL | Three viable independent models; all revenue/costs are sourced; conflicts matter. | Ledger, contract resolve-once, conflict, anti-grind, insolvency/recovery. | Let existing contracts resolve as legacy type. |
| RE-P3-05 | Generic firing/bankruptcy does not preserve territory, route, office, access, or staff failure stories. | Mode-specific setback adapters and multi-season comeback plans make failure playable. | `recovery.ts`, event director, career archive → Regional recovery adapters | Career paths/consequence records; punitive cascade risk. | L | Common setbacks retain at least one credible recovery route and alter later offers. | Each setback, cascade guards, offer gates, overlapping failure states. | No structural conversion; future setbacks use new records. |
| RE-P3-06 | Shared conditions/events are strong but not numerous or scoped enough for a full Regional career. | Extend existing directors with corridor, actor, office, market, and career chains for divergent seeds. | `worldConditions.ts`, `specialEventDeck.ts`, consequences → Regional content packs | Stable schemas; invalid prerequisites/repetition risk. | L engineering + XL content | Distinct-career targets and cooldown/diversity goals pass; all references valid. | Eligibility fuzzing, deterministic replay, cooldown/diversity, schema validation. | Content-version marker only. |
| RE-P3-07 | Generic XP, equipment, and career tiers do not deliver Regional practice development, retirement, or legacy. | Add applied training, tool consumers, mode milestones, voluntary retirement, and a multi-dimensional legacy review. | creation, perks, training/equipment, achievements/history → Regional progression and archive policies | Mode registry, career paths, report outcomes; passive-bonus and score-chasing risk. | L | Every upgrade changes a named calculation/decision; retirement is explicit; legacy reconstructs process and consequences without one dominant score. | Progression gates, equipment consumers, training bounds, retirement state, legacy/history, New Game+ fairness. | Map earned legacy-compatible perks/tools; preserve unsupported legacy unlocks as historical recognition. |
| RE-P4-01 | World map is an accessible country dossier browser but not yet a territory strategy surface. | Layered command map and synchronized list make knowledge, routes, offices, markets, and rivals spatially actionable. | `WorldMap.tsx`, `InternationalScreen.tsx`, `CountryPopup.tsx` → Regional map layers/selectors | Stable mode engines; clutter/mobile/performance risk. | XL | Every overlay supports a decision; map/list parity; physical performance target met. | Component, keyboard, Axe, mobile, visual, physical hardware profiling. | None. |
| RE-P4-02 | Multi-season player/club/manager/region/route comparisons are insufficient for expert review. | Comparison workbench and source-time timelines make judgment explainable and nostalgic. | Prospects/Reports/Career/history → archive read models and comparison UI | Pipeline/archive; query/render cost. | L | Reconstruct knowledge-at-recommendation and later outcomes without truth leaks. | Historical correctness, compaction, 30-season performance, accessibility. | Build read indexes lazily after load. |
| RE-P4-03 | Simulation outcomes can feel like text/number changes rather than fieldwork and consequence. | Reusable state-driven observation, meeting, travel, office, and callback scenes add place and emotion. | Desk/Planner/World, event UI/assets → shared Regional scene grammar | Stable actions/events; content cost/repetition. | XL | Every scene reveals or changes real state, has expert fast path, and supports reduced motion. | Consequences, resume, inputs, accessibility, asset fallback, repetition. | None. |
| RE-P4-04 | Evidence, map layers, pipelines, and archives can threaten long-save memory/load/render budgets. | Indexing, compaction, narrow selectors, virtualization, and profiling protect 30-season careers. | store/persistence/UI/soak harness → archive compactor and read indexes | Stable schemas; explanation/callback loss risk. | L | Physical hardware, 20×30 soak, package load/save, and bounded-growth budgets pass. | Heap/load/frame soak, compaction equivalence, render counts, packages. | Add compaction version and reversible pre-compaction snapshot. |
| RE-P5-01 | Automated green checks alone do not prove assistive-tech, usability, physical hardware, or packaged-platform readiness. | Execute a tag-bound release matrix with no unowned waivers, making the mode safe to sell. | CI/release/test evidence; no new gameplay module | Feature complete; platform scheduling/late findings. | L + test calendar | Every gate in section 24 has dated evidence; zero open P0/P1 defects. | Full automated ladder, NVDA/VoiceOver, usability, hardware, package/cloud/recovery. | Validate every supported migration in release candidate. |

### P0 — Integrity and mode foundations

#### RE-P0-01: Fix territory delegation integrity

- **Problem:** NPC scouts can fall back to the global player pool when their territory is empty, and territory capacity is not atomically enforced.
- **Solution:** Remove the fallback; produce an explainable no-lead outcome. Validate territory eligibility/capacity and staff uniqueness in the engine and store action.
- **Player value:** Geography becomes trustworthy; a regional network cannot fabricate global coverage.
- **Files:** `src/engine/career/npcScouts.ts`, `src/stores/actions/progressionActions.ts`, territory selectors and invariant tests.
- **Technical approach:** Add `validateTerritoryAssignment`; require eligible player/node filtering; return typed resolution outcomes; repair invalid legacy claims during migration.
- **Dependencies:** Canonical country identity.
- **Risks:** Existing saves may have over-capacity assignments.
- **Effort:** M.
- **Acceptance criteria:** No delegated report references a player outside the assigned supported node; capacity cannot be exceeded; empty coverage is visible and non-crashing.
- **Tests:** Unit validation, property-based random assignments, save migration, manual/batch equivalence.
- **Migration:** Yes; deduplicate and unassign excess staff with a player-facing inbox explanation.

#### RE-P0-02: Make Regional perks honest

- **Problem:** Regional perks exist in data/UI, but `applyPerkEffects` is not integrated and some conditional effects are flattened.
- **Solution:** Trace every perk to an authoritative calculation, rewrite conditions as explicit predicates, and remove or rename claims that cannot be supported. Replace exact hidden-attribute reveal with bounded uncertainty or a specialized question.
- **Player value:** Progression changes decisions and can be trusted.
- **Files:** `src/engine/specializations/perks.ts`, regional presence/knowledge/travel/contact/report engines, perk UI and tests.
- **Technical approach:** Add typed perk-effect consumers at domain boundaries; include effect source in explanations; assert all shipped perk IDs have at least one tested consumer.
- **Dependencies:** Knowledge and access contracts.
- **Risks:** Balance changes for legacy specialization careers.
- **Effort:** L.
- **Acceptance criteria:** No player-facing perk is inert; conditional effects apply only when conditions hold; no hidden truth leaks.
- **Tests:** Per-perk unit table, integration tests for claimed downstream effects, snapshot of explanations.
- **Migration:** Data-compatible; rebalance/version marker required.

#### RE-P0-03: Unify regional persistence migration

- **Problem:** Regional/default migration logic is duplicated across store and database paths.
- **Solution:** Create a pure versioned migration module and use it for local, cloud, import, packaged recovery, and new-game compatibility.
- **Player value:** Existing careers survive updates predictably.
- **Files:** `src/stores/gameStore.ts`, `src/lib/db.ts`, new `src/engine/regional/migrations.ts`, save providers.
- **Technical approach:** Golden fixtures for each schema version; idempotent migration; diagnostics/quarantine for invalid references.
- **Dependencies:** Target schemas.
- **Risks:** High save-integrity risk; requires fixture coverage before rollout.
- **Effort:** L.
- **Acceptance criteria:** Re-running migration is a no-op; every persistence entry point produces byte-equivalent normalized mode state.
- **Tests:** Golden migration fixtures, cloud/import parity, corrupted-reference recovery, interrupted-write recovery.
- **Migration:** This is the migration system.

#### RE-P0-04: Replace opaque local-contact bonuses

- **Problem:** Regional knowledge grants string contact IDs with no person, memory, or inspectable relationship.
- **Solution:** Grant introductions or typed access leads that resolve into real `Contact` actors; discard unresolvable legacy tokens from derived presence.
- **Player value:** Local knowledge creates people and stories, not invisible power.
- **Files:** `regionalKnowledge.ts`, `contacts.ts`, `regionalPresence.ts`, contact UI, migration.
- **Technical approach:** Add deterministic contact templates and eligibility; link actor reach to node/access; use an introduction event rather than immediate trust.
- **Dependencies:** Region profiles and contact reach.
- **Risks:** Contact volume and duplicate identities.
- **Effort:** M.
- **Acceptance criteria:** Every presence-contributing contact is inspectable; no anonymous contact token changes mechanics.
- **Tests:** Identity/deduplication, source provenance, migration, contact decay effect on presence.
- **Migration:** Yes.

#### RE-P0-05: Establish mode contract and content-tier capability matrix

- **Problem:** The Regional specialization can load generic systems, but the application cannot state which region activities are actually supported.
- **Solution:** Register Regional Expert in the shared `src/engine/modes/` definition/capability platform and add a node capability matrix derived from generated-world eligibility. Keep `GameModeId`, `Specialization`, and `RunKind` separate.
- **Player value:** UI never advertises fixtures, data, or assignments that the world cannot fulfill.
- **Files:** core types, shared `src/engine/modes/` registry/capability service, `countryAvailability.ts`, `init.ts`, new region profile module, new-game flow.
- **Technical approach:** The mode definition declares capabilities such as `scouting.territory-intelligence`, `world.regional-presence`, `organization.local-network`, and `report.territory-dossier`. Region nodes separately expose content capabilities such as `liveSeniorFixtures`, `youthEvents`, `playerPool`, `marketResearch`, `contactNetwork`, and `baseOperations`. Engine, store, UI, and Challenge Career validation query the same authorities.
- **Dependencies:** None beyond current availability.
- **Risks:** Content gaps become visible and require honest locked/alternative states.
- **Effort:** M.
- **Acceptance criteria:** Every generated action is fulfillable; talent-pool countries are labeled and behave honestly; `runKind: "challenge"` composes the same Regional mode without cloning state or becoming another mode.
- **Tests:** Capability property tests over every generated country/seed.
- **Migration:** Upgrade through the shared `RunManifestV2` and legacy-mode classifier. Do not infer Regional Expert or `runKind` from specialization alone.

### P1 — Vertical slice: territory judgment

#### RE-P1-01: Hierarchical region profiles and coverage

- **Problem:** Country-only territories cannot express local density, corridors, institutions, or meaningful coverage choices.
- **Solution:** Generate hierarchical profiles and derive coverage state/capacity from work, staff, access, and freshness.
- **Player value:** The player chooses where and how deeply to operate.
- **Files:** world init/data, new `regionProfiles.ts` and `territoryCoverage.ts`, core types, selectors, World workspace.
- **Technical approach:** Start with one full-world country plus two secondary neighboring/source pools; generate stable nodes from existing subregions, clubs, competitions, and venues; maintain country projection for shared systems.
- **Dependencies:** P0 capability matrix.
- **Risks:** Content density imbalance and map clutter.
- **Effort:** XL.
- **Acceptance criteria:** One complete region supports survey-to-embedded progression, capacity gaps, staff assignment, comparison, and save/load.
- **Tests:** Generation determinism, identity, capacity, coverage derivation, content capability.
- **Migration:** Country territories project into country nodes.

#### RE-P1-02: Evidence-backed regional knowledge

- **Problem:** A scalar knowledge bar makes repeated work homogeneous and cannot explain what the player knows.
- **Solution:** Implement knowledge domains, provenance, freshness, contradiction, hypotheses, and derived summaries.
- **Player value:** Observation, research, and relationships answer different questions and support real judgment.
- **Files:** new `knowledgeEvidence.ts`, compatibility changes to `regionalKnowledge.ts`, observations, reports, contacts, dossiers.
- **Technical approach:** Event-sourced evidence records with exact-once credit; domain-specific decay; memoized derived index; hypothesis/disproof UI.
- **Dependencies:** Region profiles.
- **Risks:** State growth and overwhelming UI.
- **Effort:** XL.
- **Acceptance criteria:** The player can explain every domain estimate from sources; identical repeated work has diminishing value; contradictory evidence persists until addressed.
- **Tests:** Deduplication, decay bounds, contradiction resolution, save/reload, hidden-truth boundary, long-save size.
- **Migration:** Convert scalar to low-specificity migration evidence.

#### RE-P1-03: Strategic weekly intents

- **Problem:** Generic task filling does not express Regional depth/breadth, access, route, and conversion tradeoffs.
- **Solution:** Add Deepen, Expand, Connect, Position, Convert, and Protect intents with contextual action builders.
- **Player value:** Each week expresses a strategy and visible opportunity cost.
- **Files:** planner components, schedule/weekly actions, new regional intent resolver, tutorial.
- **Technical approach:** Intent chooses outcome and constraints; engine generates valid actions from current location/capabilities; shared weekly processor resolves them.
- **Dependencies:** Knowledge, region capability, contacts.
- **Risks:** False choice if one intent dominates.
- **Effort:** L.
- **Acceptance criteria:** Every intent has at least two viable contexts; previews show cost/risk/unknowns; batch/manual resolution matches.
- **Tests:** Availability matrices, dominant-strategy simulation, keyboard scheduling E2E, manual/batch equivalence.
- **Migration:** None; legacy schedule adapts to `legacyTask` intent.

#### RE-P1-04: Regional briefs and report accountability

- **Problem:** Generic assignments and reports do not assess market translation, route, adaptation, timing, or audience need.
- **Solution:** Generalize exact-once deliverables into Regional briefs and professional artifacts with long-term review.
- **Player value:** Reports become career-defining judgments.
- **Files:** `international.ts`, `internationalDeliverables.ts`, reports/cases, new briefs engine, report writer, outcome evaluation.
- **Technical approach:** Typed brief blueprint; distinct-case anti-grind; versioned report evidence; outcome evaluator consumes world events without hidden truth leaks.
- **Dependencies:** Knowledge and market context.
- **Risks:** Complex grading may feel opaque.
- **Effort:** XL.
- **Acceptance criteria:** Reports are evaluated on process, context, timing, fit, calibration, and outcome; reaction and delayed review are explainable.
- **Tests:** Resolve-once, revision distinction, anti-grind, audience fit, delayed callbacks, save/reload.
- **Migration:** Existing international assignments retain legacy blueprint.

#### RE-P1-05: Regional first-hour vertical slice

- **Problem:** Generic onboarding cannot deliver the mode's aha moment.
- **Solution:** Ship generated opening cases, account-level tutorial completion, optional reminders, and an early delayed consequence.
- **Player value:** The core fantasy is experienced before the interface becomes broad.
- **Files:** new-game, tutorial, Desk/Planner/World/Reports, event director, settings.
- **Technical approach:** Modular seeded beats with eligibility checks and multiple valid outcomes; no forced star or truth reveal.
- **Dependencies:** P1 territory, knowledge, intents, reports.
- **Risks:** Authored combinations can break under sparse worlds.
- **Effort:** L engineering + L content.
- **Acceptance criteria:** First-hour criteria in section 5 pass across every preset and supported seed set; skip path is clean.
- **Tests:** E2E per template family/preset, resume mid-tutorial, account completion, accessibility.
- **Migration:** Tutorial preference separate from career saves.

### P2 — Routes, access, markets, and presence

#### RE-P2-01: Route and itinerary engine

- **Problem:** Travel is a home-origin country booking with no multi-leg strategy.
- **Solution:** Extend the shared world travel authority with contiguous route edges, one canonical current location, multi-purpose itineraries, delays, slack, alternatives, and auto-routing.
- **Player value:** Travel becomes a planning decision and a source of stories.
- **Files:** `world/travel.ts`, progression/weekly actions, Planner/World, new shared `world/routes.ts` and `world/itineraries.ts` engines.
- **Technical approach:** Versioned route graph; deterministic pathfinding/quotes; ledger reservation/settlement; itinerary state machine.
- **Dependencies:** Region nodes and capabilities.
- **Risks:** Scheduling complexity and stranded saves.
- **Effort:** XL.
- **Acceptance criteria:** Multi-leg trips use actual origin; costs conserve through ledger; cancellation/disruption/recovery are explainable; no ghost node can be booked.
- **Tests:** Path properties, ledger invariants, rollover, delay chains, manual/batch equivalence, migration.
- **Migration:** Convert active bookings.

#### RE-P2-02: Access agreements and regional actors

- **Problem:** Contacts do not express geographic reach, affiliation, permission scope, or high-stakes obligations.
- **Solution:** Add reach and inspectable access agreements to persistent contacts.
- **Player value:** People become the strategic geography of the mode.
- **Files:** `contacts.ts`, consequence engine, access engine, Desk/World/contact dossier.
- **Technical approach:** Agreement state machine with scope/duration/conflicts; contact actions query language, trust, affiliation, and prior promises.
- **Dependencies:** Region profiles and real-contact migration.
- **Risks:** Content complexity and excessive blocking.
- **Effort:** L.
- **Acceptance criteria:** Important access has a grantor, scope, requirement, and revocation path; conflicting agreements create explicit choices.
- **Tests:** Expiry/revocation, conflict detection, skipped-choice delegation, stakeholder memory.
- **Migration:** Contacts gain default reach from existing country coverage.

#### RE-P2-03: Language and communication

- **Problem:** Adaptability/familiarity abstracts communication too broadly.
- **Solution:** Add practical language proficiency, translator/liaison support, misunderstanding risk, and learning activities.
- **Player value:** Staffing and relationship decisions vary by route and career background.
- **Files:** scout/staff types, contacts, reports, travel, creation, training, UI.
- **Technical approach:** Small bounded skill model; language requirements on interactions; translation preserves access but changes cost/time/confidence.
- **Dependencies:** Actor reach and region profiles.
- **Risks:** Stereotyping or grind.
- **Effort:** L.
- **Acceptance criteria:** Language changes communication evidence and logistics, never player ability; every blocked interaction offers a credible support route where one exists.
- **Tests:** Ethical boundary tests, translator effects, learning bounds, migration defaults.
- **Migration:** Infer conservative starting language from home/background; player confirms during upgrade.

#### RE-P2-04: Base progression

- **Problem:** £8k generic satellite offices arrive late and only for independent careers.
- **Solution:** Implement temporary desks, partner bases, field offices, regional hubs, and club departments with real staffing and agreements.
- **Player value:** Presence becomes a durable strategic investment across both career paths.
- **Files:** `internationalExpansion.ts`, agency offices, employment/club systems, presence, Career/World.
- **Technical approach:** Generalize base lifecycle and monthly ledger; derived base quality; partner obligations; downgrade/closure/recovery.
- **Dependencies:** Routes, access, staff adapter.
- **Risks:** Fixed costs can create unavoidable bankruptcy.
- **Effort:** XL.
- **Acceptance criteria:** Each base type supports a distinct use case and downside; closing/removing staff updates presence immediately; club and independent paths have equivalent depth but different constraints.
- **Tests:** Ledger conservation, staff uniqueness, cost cadence, closure cascade, insolvency/recovery.
- **Migration:** Convert satellites to field offices.

#### RE-P2-05: Regional markets and opportunity windows

- **Problem:** Regional opportunity lacks changing price, registration, club-demand, and timing context.
- **Solution:** Generate objective seasonal market state in the shared world, then derive Regional evidence-sensitive snapshots and opportunities.
- **Player value:** Waiting, moving, or exiting becomes a real judgment.
- **Files:** transfers/contracts/clubs/world conditions, new shared `world/regionalMarkets.ts`, Regional `marketIntel.ts`, dossiers/map/report writer.
- **Technical approach:** Derive ground truth from simulated entities but expose only evidence-bounded ranges; generate opportunity windows with source/deadline.
- **Dependencies:** Knowledge evidence and club world simulation.
- **Risks:** False precision and duplicated transfer logic.
- **Effort:** XL.
- **Acceptance criteria:** Market views explain sources/age; timing materially changes valid recommendations; no separate economy contradicts transfer engine.
- **Tests:** Range containment, condition modifiers, window expiry, no hidden leaks, long-season stability.
- **Migration:** Seasonal snapshot generated on next safe boundary.

### P3 — Pipelines, rivalry, career breadth, and replayability

#### RE-P3-01: Cross-border pipelines and adaptation follow-up

- **Problem:** Individual reports do not aggregate into durable pathways or years-long accountability, and unsigned prospects can remain indefinitely actionable without a believable career state.
- **Solution:** Link cases, routes, stakeholders, destinations, placements, adaptation, alumni, contextual prospect age-out, and replacement cohorts into pipeline records.
- **Player value:** The player builds a legacy and learns why routes work.
- **Files:** player careers/transfers/development, reports, alumni, new pipelines engine, Prospects/Career.
- **Technical approach:** Sparse links to existing events; derived health; scheduled adaptation checkpoints; archive on closure.
- **Dependencies:** Reports, markets, routes.
- **Risks:** Correlation presented as causation.
- **Effort:** XL.
- **Acceptance criteria:** Every placement can be traced from evidence to destination and later outcome; health explains factors without claiming certainty. Prospects with no credible pathway transition out of the active pool after a context-sensitive window centered on three to four seasons, remain in history when referenced, and are replaced without emptying or exponentially growing the world.
- **Tests:** Multi-season callbacks; conditional three/four-season age-out; age/injury/activity exceptions; referenced-player archive preservation; player-pool conservation; transfer/loan/release/retirement; archive compaction.
- **Migration:** Existing recommendations can seed historical pipelines with low context.

#### RE-P3-02: Geographic rival organizations

- **Problem:** Rival pressure is global and cannot create legible territorial contests.
- **Solution:** Add shared authoritative geographic reach and resource-consuming rival actions, then derive Regional intelligence fog and counterplay from earned evidence.
- **Player value:** Regional advantage is threatened by persistent actors rather than random penalties.
- **Files:** rival organizations/scouts, shared `rivals/geographicReach.ts`, Regional `rivalIntel.ts`, World/Desk, consequence history.
- **Technical approach:** Sparse node influence derived from actions/offices/contacts; deterministic action planner evaluates reachable assets.
- **Dependencies:** Nodes/access/routes.
- **Risks:** Snowballing and perceived cheating.
- **Effort:** L.
- **Acceptance criteria:** Every rival action has location, target, cost, motive, and history; pressure is local; recovery/exit remains viable.
- **Tests:** Scope, resource conservation, exact-once actions, fog, difficulty fairness, 30-season stability.
- **Migration:** Initialize reach from organization archetype and existing history.

#### RE-P3-03: Club regional department path

- **Problem:** Generic club employment does not change Regional play.
- **Solution:** Add internal briefs, philosophy, department budget, staff politics, board directives, manager changes, and leadership roles.
- **Player value:** A resource-rich but constrained career distinct from independent play.
- **Files:** employment/contracts/board/leadership, Career/Desk/Planner, regional career engine.
- **Technical approach:** Role templates; employer-owned briefs/bases; attributable portfolio; recovery integration.
- **Dependencies:** Delegation, bases, reports.
- **Risks:** Duplicate management-game features.
- **Effort:** XL.
- **Acceptance criteria:** Club decisions remain scouting-centered; leadership changes alter briefs and consequences; firing/reassignment/recovery work.
- **Tests:** Role gates, directive outcomes, staff portfolio, manager turnover, career path E2E.
- **Migration:** Regional club careers map to nearest role.

#### RE-P3-04: Independent consultancy/network path

- **Problem:** Current consulting and agency systems are generic and agency ownership risks becoming the only endgame.
- **Solution:** Add market audits, corridor design, regional retainers, conflicts, partner offices, intelligence products, and network leadership.
- **Player value:** A flexible commercial career with meaningful scope and ethical pressure.
- **Files:** consulting/agency/finance, contacts, reports, Career, regional career engine.
- **Technical approach:** Contract templates built on briefs; scope/deliverable/payment/conflict/renewal state; product value depends on evidence and outcomes.
- **Dependencies:** Markets, reports, access, bases.
- **Risks:** Easy money or report farming.
- **Effort:** XL.
- **Acceptance criteria:** At least three viable independent models; revenue has recorded source/cost; repeat work requires value and trust, not clicking.
- **Tests:** Ledger invariants, contract exact-once, conflict consequences, insolvency/recovery, anti-grind.
- **Migration:** Existing consulting contracts remain legacy type until resolved.

#### RE-P3-05: Regional failure and recovery chains

- **Problem:** Generic firing/bankruptcy does not preserve mode-specific consequences.
- **Solution:** Add access, route, office, staff, client, and expansion failures with multi-season recovery choices.
- **Player value:** Setbacks become memorable careers rather than reload prompts.
- **Files:** `recovery.ts`, event director, contacts, bases, career archive, Career UI.
- **Technical approach:** Mode setback adapters into shared recovery plans; permanent archive markers; offer gates and comeback contracts.
- **Dependencies:** Career paths and consequence records.
- **Risks:** Punitive cascades.
- **Effort:** L.
- **Acceptance criteria:** No common setback creates an unrecoverable dead career without an explicit retirement choice; recovery changes later opportunities.
- **Tests:** Each setback path, cascading guards, offer gates, bankruptcy/firing overlap, multi-season callback.
- **Migration:** None.

#### RE-P3-06: Dynamic Regional event and condition expansion

- **Problem:** Shared conditions are strong but lack enough node/corridor/actor variation for a full mode.
- **Solution:** Add conditional event chains using existing director/deck/condition systems.
- **Player value:** Seeds and choices create structurally different careers.
- **Files:** world conditions, special event deck, consequences, regional content data, assets.
- **Technical approach:** Eligibility predicates, diversity weights, cooldowns, stateful chains, scoped modifiers, audiovisual variants.
- **Dependencies:** All major mode state.
- **Risks:** Content combinatorics and invalid prerequisites.
- **Effort:** L engineering + XL content.
- **Acceptance criteria:** Distinct-career targets in section 16 pass; events never reference missing content; important chains produce callbacks.
- **Tests:** Eligibility fuzzing, cooldown/diversity, deterministic replay, content-schema validation.
- **Migration:** Content versioning only.

#### RE-P3-07: Professional development, retirement, and legacy

- **Problem:** Generic XP, equipment, and tier labels do not yet model the Regional Expert's practice, and there is no mode-specific definition of a completed career.
- **Solution:** Add applied training domains, verified tool/infrastructure consumers, Regional milestones, voluntary retirement, succession choices, and a multi-dimensional career review.
- **Player value:** Advancement changes how the player works; a long career has a meaningful conclusion and replay prompt without one optimal score.
- **Files:** scout creation/progression, `src/engine/specializations/perks.ts`, shared training/equipment, achievements/history, mode registry, regional career/archive modules, Career UI.
- **Technical approach:** Every training/tool unlock declares a calculation/action consumer and evidence in explanation output. Career milestones consume canonical domain events. Retirement snapshots active histories safely, runs archive compaction, and produces a seed/run fingerprint. New Game+ unlocks presentation/background variety but no hidden truth or permanent mechanical advantage.
- **Dependencies:** Club/independent paths, accountability, mode registry, archive.
- **Risks:** Passive percentage progression, grind, or a legacy score that crowds out varied careers.
- **Effort:** L.
- **Acceptance criteria:** Early/mid/late advancement changes responsibilities; every displayed upgrade is connected; retirement is explicit and never triggered by an ordinary setback; legacy presents regions, routes, judgment, people, finance, recovery, and leadership.
- **Tests:** Progression gates, per-upgrade consumer contracts, learning bounds, milestone exact-once, retirement with active cases, archive/history correctness, New Game+ fairness.
- **Migration:** Map compatible perks/tools and preserve unsupported legacy unlocks as historical recognition without claiming active effects.

### P4 — Expert UX, presentation, performance, and archive

#### RE-P4-01: Territory command map

- **Problem:** Current map is immersive but functions primarily as a country dossier selector.
- **Solution:** Add accessible overlays for nodes, knowledge, access, routes, bases, markets, rivals, conditions, and flows.
- **Player value:** Strategy is spatial, legible, and interactive.
- **Files:** `WorldMap.tsx`, `InternationalScreen.tsx`, `CountryPopup.tsx`, regional selectors/components.
- **Technical approach:** Layer registry, canvas/SVG performance budget, synchronized list, lazy-loaded details, map state in URL/local UI state rather than save.
- **Dependencies:** Mode engines.
- **Risks:** Visual clutter and mobile performance.
- **Effort:** XL.
- **Acceptance criteria:** Every layer answers a decision question; map/list feature parity; stable 30/60 fps targets by hardware profile; no geographic truth claims beyond calibrated art.
- **Tests:** Component, keyboard, Axe, mobile, visual regression, low-end emulation plus physical profiling.
- **Migration:** None.

#### RE-P4-02: Multi-season expert comparison and archive

- **Problem:** Players need better player/club/manager/region/route history to understand long-term judgment.
- **Solution:** Add comparison workbench and timelines linked to report versions and world events.
- **Player value:** Careers become explainable and nostalgic; expertise can be audited.
- **Files:** Prospects/Reports/Career, analytics/history, archive compaction.
- **Technical approach:** Read models over existing histories; compare up to four entities; saved comparison sets; virtualized timelines.
- **Dependencies:** Pipeline/archive data.
- **Risks:** Query/render cost.
- **Effort:** L.
- **Acceptance criteria:** Player can reconstruct what was known at recommendation time and compare it with later reality without hidden truth leakage.
- **Tests:** Historical correctness, compaction preservation, performance with 30-season saves, accessibility.
- **Migration:** Index build on load/idle.

#### RE-P4-03: Interactive fieldwork and consequence presentation

- **Problem:** Deep simulation can still feel like a spreadsheet if actions resolve only as text and number changes.
- **Solution:** Add short interactive observation, meeting, travel, office, and callback scenes grounded in engine choices.
- **Player value:** Discovery, suspense, place, rivalry, and vindication become felt experiences.
- **Files:** shared scene framework, Desk/Planner/World, audio/asset manifests, reduced-motion settings.
- **Technical approach:** Reusable scene grammar consumes state and emits typed choices; visuals/audio vary by context; no separate outcome logic in UI.
- **Dependencies:** Events and actions.
- **Risks:** Expensive content and repetition.
- **Effort:** XL.
- **Acceptance criteria:** Scenes change or reveal real state; every scene has a fast expert path; repetition and reduced-motion controls work.
- **Tests:** Choice consequences, resume, input/accessibility, asset fallback, repetition telemetry.
- **Migration:** None.

#### RE-P4-04: Performance and long-save hardening

- **Problem:** Large maps, evidence histories, pipelines, and 30-season careers can exceed memory/load/render budgets.
- **Solution:** Add indexes, archive compaction, narrow selectors, virtualization, lazy loading, and hardware budgets.
- **Player value:** Long careers remain playable on minimum hardware.
- **Files:** store selectors, persistence, map/pipeline/timelines, soak/performance harnesses.
- **Technical approach:** Profile before optimization; publish snapshot size/load/heap/frame metrics; preserve explanation provenance during compaction.
- **Dependencies:** Stable schemas.
- **Risks:** Compaction can erase callbacks or explanations.
- **Effort:** L.
- **Acceptance criteria:** Meets agreed physical minimum-hardware budgets, 20×30 soak, packaged load/save/recovery, and no unbounded growth curve.
- **Tests:** Memory/load soak, compaction equivalence, selector render counts, packaged profiling.
- **Migration:** Compaction version marker.

### P5 — Release proof

#### RE-P5-01: Complete validation matrix

- **Problem:** Automated success cannot substitute for assistive-technology, usability, hardware, and packaged-platform proof.
- **Solution:** Execute all release gates in section 24 with captured evidence tied to a clean commit/tag.
- **Player value:** The mode is safe to sell and support.
- **Files:** test plans, release manifests, CI, evidence artifacts; no simulation behavior.
- **Technical approach:** Clean tagged build; repeatable scripts; issue severity rubric; no waiver without owner/rationale/expiry.
- **Dependencies:** Feature complete.
- **Risks:** Late platform findings.
- **Effort:** L plus study/test calendar.
- **Acceptance criteria:** Every required gate has dated evidence and zero open P0/P1 defects.
- **Tests:** See section 24.
- **Migration:** Not applicable.

---

## 23. Automated testing strategy

### 23.1 Unit tests

- region profile generation and capability derivation;
- country/node identity canonicalization;
- knowledge evidence credit, decay, contradiction, and summary;
- language/translator effects and bounds;
- access agreement scope, expiry, conflict, and revocation;
- route quote, pathfinding, duration, fatigue, and reliability;
- itinerary state transitions and disruption choices;
- base costs, capacity, quality derivation, downgrade, and closure;
- market range generation and opportunity expiry;
- pipeline health and accountability categories;
- scoped rival reach and action affordability;
- career gates, setbacks, recovery offers, and retirement;
- migration from every supported schema version;
- archive compaction.

### 23.2 Property and invariant tests

1. A staff member cannot occupy incompatible assignments or bases simultaneously.
2. Territory capacity cannot be exceeded.
3. A delegated regional report cannot select an out-of-scope player.
4. Empty coverage never falls back to the global pool.
5. Every travel leg starts where the prior leg ended.
6. The player has one current location at a time.
7. A route, assignment, report outcome, reward, expense, or event resolves only once.
8. Money cannot be created or destroyed without a ledger source.
9. Cancelled, disrupted, and completed travel reconcile reservations and charges.
10. Ghost countries/nodes cannot create bookings, offices, assignments, contacts, or presence.
11. Derived presence is stable when sources are unchanged and bounded under all modifiers.
12. Removing an office, employee, access agreement, or contact immediately removes its derived contribution.
13. Knowledge can grow only from a recorded evidence source and one event cannot credit twice.
14. Knowledge decay never becomes negative or increases confidence.
15. A contradiction cannot disappear without expiry, invalidation, or a recorded resolution.
16. UI-visible estimates cannot access hidden truth outside authorized engine transformations.
17. A market opportunity references existing actors/content and supported activities.
18. Rival actions are geographically reachable, resource-affordable, and exactly once.
19. Manual week advancement equals batch advancement from the same state and choices.
20. Save/reload preserves deterministic future outcomes until the player makes a new choice.
21. Season rollover cannot orphan active reports, routes, bases, briefs, or player cases.
22. Prospect aging cannot leave inactive unsigned players forever in the active pool.
23. Prospect cleanup cannot remove a player referenced by an unresolved case without an archival transition.
24. Archive compaction preserves all live derived explanations and future callbacks.
25. No difficulty mode bypasses core integrity or silently reveals hidden truth.

Use generative tests over random seeds, sparse content tiers, zero-player nodes, maximum staff, overlapping world conditions, season rollover, and corrupted legacy inputs.

### 23.3 Integration tests

- contact introduction → access agreement → scheduled event → observation → knowledge evidence;
- market signal → itinerary → live/delegated work → report → club action → adaptation callback;
- office opening → staffing → presence effects → monthly cost → closure → coverage degradation;
- rival action → contested access → player response → stakeholder memory → later callback;
- club brief → delegated portfolio → report evaluation → board reaction → promotion/firing/recovery;
- independent contract → disclosure conflict → deliverable/payment/renewal or loss;
- travel disruption → missed deadline/delegation choice → report consequence;
- save during every itinerary/report/event state → reload → finish exactly once;
- migration of Regional compatibility career → first new weekly cycle.

### 23.4 End-to-end journeys

1. New Regional career through the generated first-hour aha moment.
2. Skip tutorial and play the same opportunity without blocking overlays.
3. Survey an unmapped node and build it to Networked presence.
4. Plan a multi-leg trip with keyboard only.
5. Resolve a contradictory-source dossier and revise it later.
6. Complete, partially complete, and fail a Regional brief.
7. Open, staff, downgrade, and close a field office.
8. Build a cross-border route and see a multi-season alumni outcome.
9. Lose access to a rival and recover through a different stakeholder.
10. Progress club path to Regional Lead and survive a manager change.
11. Progress independent path to consultancy/network leadership and manage a client conflict.
12. Play on mobile across all six workspaces.
13. Import a legacy Regional save with active travel/office/assignment.
14. Resolve a cloud conflict and recover an interrupted save in a packaged build.

### 23.5 Soak and balance

- Required exact gate: 20 seeds × 30 seasons.
- Run manual-policy baselines for narrow specialist, broad explorer, relationship-first, data-first, office-heavy, no-office, club, independent, and delegation-heavy styles.
- Track player-pool size, unsigned aging, transfer/loan/release/retirement, ledger totals, office count, staff claims, route count, knowledge evidence count, archive size, event variety, rival reach, dead careers, recovery rates, and processing time.
- Compare one-week-at-a-time and batched season advancement hashes at defined checkpoints.
- Flag exponential growth, empty pools, inaccessible regions, dominant intents, unavoidable bankruptcy, permanent lockout, repeated event families, and monotonic player advantage without new tension.

---

## 24. Release gates

Regional Expert is not release-ready until all gates are tied to the clean commit/tag used to package it.

### 24.1 Code and simulation

- TypeScript, lint, unit, property, integration, smoke, full E2E, and production build pass.
- All current Regional and shared invariant suites pass, including regional presence, knowledge compatibility, country availability, map registry, country identity, international deliverables, world conditions, and rival organizations.
- 20-seed × 30-season soak passes with reviewed metrics.
- Manual/batch equivalence passes for itinerary, assignments, rivals, finances, player lifecycle, and season rollover.
- No P0/P1 defects; accepted lower defects have owner, rationale, and target.

### 24.2 Save and platforms

- Clean manifest generated from the release tag.
- Packaged Windows, macOS, and Linux install, first run, save, load, offline, update, migration, interrupted-write recovery, and cloud-conflict journeys pass.
- Long-save size, load time, weekly processing, and archive compaction meet budgets.
- Steam/cloud integration is tested with actual packaged binaries, not only browser mocks.

### 24.3 UX and accessibility

- Zero serious or critical Axe issues across all six workspaces on desktop and mobile.
- Manual NVDA and VoiceOver scripts complete with recorded findings/resolution.
- Keyboard-only route planning, map/list use, report writing, office management, and critical choices pass.
- Moderated first-hour usability study validates comprehension of knowledge/access/presence/reputation, the aha moment, and tutorial skip behavior.
- Expert usability sessions validate comparison, itinerary, delegation, and archive workflows.

### 24.4 Performance

- Throttled Chromium journey is retained as emulation evidence only.
- Physical minimum-hardware profiling covers map layers, large pipeline, 30-season save/load, week advancement, report comparison, and workspace transitions.
- Peak memory, steady-state memory, CPU time, frame pacing, and load/save budgets are documented per platform.
- No unbounded listener, timer, selector, image, audio, or history growth.

### 24.5 Commercial and content

- Every shipped image/audio asset remains hash-inventoried and mapped to an approved source/ownership record.
- User-provided ownership assertion is recorded in the commercial-rights evidence workflow; final approval is attached to the release manifest.
- Event/content schema validation reports no invalid references or unreachable mandatory content.
- Copy, geography, language, and cultural representation receive editorial review.

---

## 25. Acceptance criteria for mode completion

Regional Expert reaches Youth Scout parity only when all of the following are true:

### Cohesion

- The six workspaces form one traceable loop from signal to territory decision to evidence to report to route/placement to long-term consequence.
- Every major UI action has an engine mutation, persisted state, downstream effect, and test—or is explicitly informational.
- No player-facing system claims benefits that are not applied.

### Distinctiveness

- Regional play includes at least four recurring decisions Youth Scout does not center: territory allocation, route design, access agreements, and cross-border market timing.
- Early, middle, and late careers require materially different work.
- Club and independent careers share core simulation but create different responsibilities and constraints.
- A viable narrow expert, wide network, no-office consultant, and department leader strategy exist.

### Depth

- Knowledge is domain-specific, sourced, time-sensitive, and capable of contradiction.
- Contacts are persistent people with reach, obligations, conflict, and memory.
- Travel changes access, timing, cost, fatigue, and opportunity rather than toggling a country.
- Bases and staff create durable leverage and liabilities.
- Reports assess intended fit, timing, market, adaptation, confidence, and later outcome.
- Rival organizations compete for specific geographic assets and obey constraints.

### Replayability

- Opening cases vary systemically and remain skippable as instruction.
- Region archetypes, actor networks, market conditions, rival reach, event chains, and career choices create the distinct-career targets in section 16.
- No single dominant weekly intent or career path emerges across balance runs.
- Failure produces multiple viable recovery stories.

### Credibility and trust

- Content tiers are honest.
- No hidden player truth leaks to UI.
- No out-of-territory reports, ghost destinations, duplicate resolution, ledger creation, or stale derived presence.
- Long careers preserve history while remaining stable and performant.
- Important outcomes explain contributing evidence and uncertainty.

### Emotional engagement

- The game regularly creates discovery, place, suspense, obligation, rivalry, risk, pride, regret, adaptation concern, vindication, and nostalgia through interactive scenes and callbacks—not only numerical notifications.
- Players can name a route they built, a region they understood, a relationship they protected or lost, a rival they remember, and a recommendation whose consequences shaped their career.

---

## 26. What to consolidate, remove, or defer

### Consolidate

- `NPCScout`, `AssistantScout`, and agency employee fieldwork through a shared operative/brief adapter.
- Scalar Regional knowledge and country familiarity into one evidence-backed derived view with legacy projections.
- `TravelBooking` and international assignment travel into the itinerary engine.
- `SatelliteOffice`, home relocation, partner bases, and club departments into one base lifecycle.
- Generic international deliverables and Regional briefs into one exact-once contract framework.
- Store and database migrations into one pure versioned path.

### Remove or hide until connected

- Any Regional perk copy without an authoritative consumer.
- Opaque local-contact IDs as mechanical bonuses.
- Out-of-territory NPC fallback behavior.
- Generic actions that differ only by country name and produce no distinct evidence.
- Exact hidden-attribute Regional perk behavior.
- Office-quality percentages that do not explain their operational sources.
- Map overlays that are decorative and do not support a decision.

### Automate at higher tiers

- routine travel selection under player-set policy;
- knowledge freshness maintenance;
- ordinary contact upkeep;
- low-risk brief assignment;
- monthly office administration;
- alumni monitoring thresholds;
- routine report formatting.

Automation must preserve exceptions, attribution, and the ability to inspect why a policy acted.

### Defer beyond first Regional release

- Fully simulated lower-league fixtures for every secondary talent pool.
- Real-world GIS navigation or street-level maps.
- Detailed visa law for every jurisdiction; start with data-driven abstract rule families.
- Real-time multiplayer territory competition.
- User-authored region/content editors.
- Controlling a federation or club outside scouting/recruitment responsibilities.
- A global currency-trading simulation.

---

## 27. Key risks and recommended defaults

| Risk | Recommended default |
| --- | --- |
| Mode becomes a map spreadsheet | Require every layer to connect to an action, scene, comparison, or consequence; include fieldwork and relationship presentation |
| Too many meters | Store evidence and facts; derive a small number of diagnostic summaries |
| Cultural stereotyping | Model institutions, languages, individual needs, and observed outcomes; editorial review all authored orientation content |
| Travel becomes busywork | Auto-route is default; manual routing matters only when tradeoffs exist |
| Wide expansion snowballs | Add maintenance, audit, fixed cost, relationship, freshness, and political load |
| Rival actions feel like cheating | Scope reach, consume resources, preserve history, and expose evidence at appropriate intelligence |
| Offices become the only strategy | Make partner bases, periodic travel, remote/data specialization, club resources, and narrow expertise viable |
| Knowledge history explodes save size | Sparse evidence, source reuse, active-reference protection, and season compaction |
| Reports become form filling | Contextual prefill, reusable evidence, audience-specific decisions, and fast expert path |
| Secondary pools feel fake | Honest capability labels; emphasize markets, actors, youth/player pools, and cross-border context rather than nonexistent fixtures |
| Randomness invalidates judgment | Seeded state-aware probabilities, post-outcome explanation, and meaningful mitigation |
| Tutorial becomes repetitive | Account-level completion plus generated case content that remains normal gameplay |

---

## 28. Critical path and recommended delivery order

```text
Integrity fixes and mode contract
  -> Region profiles and capability matrix
    -> Evidence-backed knowledge and weekly intents
      -> Regional briefs/report accountability
        -> First-hour vertical slice
          -> Route/itinerary and access systems
            -> Bases, markets, and pipelines
              -> Geographic rivals and career paths
                -> Event/content breadth and expert UX
                  -> Long-save hardening and release proof
```

Do not begin broad content production until the mode event/brief schemas and eligibility validators are stable. Do not build the complete map overlay before the territory, route, and knowledge selectors exist. Do not migrate legacy saves until the target schemas and invariants are fixed. Do not claim Regional Expert is playable because the first vertical-slice country works; complete at least one full-world market, two secondary pools, two corridors, both career paths, and the multi-season outcome loop before external positioning.

### 28.1 Recommended vertical slice

The first playable slice should contain:

- one supported full-world country with at least three meaningful subregion/institution nodes;
- two secondary talent-pool countries that connect through distinct constraints;
- one reliable and one volatile route;
- six persistent regional actors with conflicting affiliations;
- one rival organization and one individual rival scout;
- three Regional briefs and two report artifacts;
- one temporary desk and one partner-base option;
- one club and one independent career contract;
- one placement/adaptation callback chain;
- one access-loss recovery chain;
- three world-condition combinations;
- the generated first-hour case.

The slice is complete only if it can play for three seasons without placeholder UI, impossible assignments, repeated fixed content, or disconnected outcomes.

---

## 29. Source traceability

| Planned capability | Primary current source to reuse or change |
| --- | --- |
| Derived operational effects | `src/engine/world/regionalPresence.ts` |
| Knowledge compatibility and familiarity sync | `src/engine/specializations/regionalKnowledge.ts` |
| Content-tier eligibility | `src/engine/world/countryAvailability.ts` |
| World/country/subregion generation | `src/engine/world/init.ts`, `src/data/index.ts` |
| Travel identity and scheduling | `src/engine/world/travel.ts`, `src/stores/actions/progressionActions.ts`, `src/stores/actions/weeklyActions.ts` |
| International opportunity/deliverable integrity | `src/engine/world/international.ts`, `src/engine/world/internationalDeliverables.ts` |
| Base and office lifecycle | `src/engine/finance/internationalExpansion.ts`, `src/components/game/agency/OfficesTab.tsx` |
| Persistent actors and memory | `src/engine/network/contacts.ts` |
| Staff territory work | `src/engine/career/npcScouts.ts`, `src/components/game/NPCManagementScreen.tsx` |
| Leadership attention/delegation | `src/engine/career/leadership.ts` |
| Rival organizations and scouts | `src/engine/rivals/organizations.ts`, `src/engine/rivals/rivalScouts.ts` |
| World variation | `src/engine/world/worldConditions.ts`, `src/engine/events/specialEventDeck.ts` |
| Failure and recovery | `src/engine/career/recovery.ts` |
| Map identity and interaction | `src/engine/world/mapCountryRegistry.ts`, `src/components/game/WorldMap.tsx`, `src/components/game/InternationalScreen.tsx`, `src/components/game/CountryPopup.tsx` |
| Mode progression scaffold | `src/engine/scout/creation.ts`, `src/engine/specializations/perks.ts` |
| Persistence entry points | `src/stores/gameStore.ts`, `src/lib/db.ts` |
| Current invariant examples | `tests/invariants/regionalPresence.test.ts`, `regionalKnowledge.test.ts`, `worldCountryAvailability.test.ts`, `mapCountryRegistry.test.ts`, `internationalAssignmentDeliverables.test.ts`, `countryIdentity.test.ts`, `worldConditions.test.ts`, `rivalOrganizations.test.ts` |

---

## 30. Final definition of success

Regional Expert is world-class when a player no longer thinks, "I unlocked another country." They think:

- "I understand this competition, but I still do not trust my adaptation evidence."
- "I can reach the academy because I kept a promise two seasons ago."
- "This route is cheap but fragile; that route is slower and produces better outcomes."
- "My rival is strong here for a reason, and I can choose whether to fight, partner, or leave."
- "My staff can cover the matches, but only I can resolve this stakeholder conflict."
- "The player was talented; my real mistake was the destination and timing."
- "Closing that office hurt, but rebuilding as a narrow consultant changed my career."
- "This region is not a number on a map. It is a history of people, institutions, judgments, and consequences that I helped shape."

That is the Regional Expert mode: a simulation of earning contextual authority, turning it into responsible pathways, and living with what those pathways do to players, clubs, relationships, and the scout's own career.
