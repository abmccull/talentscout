# Regions and geography integration audit

**Date:** July 10, 2026
**Scope:** Country identity, sub-regions, regional knowledge, travel, tournaments, free agents, transfers, loans, youth placement, contacts, territories, UI exposure, and save migration.
**Decision:** Geography now functions as a connected Youth Scout gameplay layer. Before this pass, several systems rendered geography but used incompatible identities underneath; those release-critical defects are fixed. The remaining work is authored depth and simulation nuance, not broken state plumbing.

## Audit outcome

| System | Current status | Gameplay consequence |
|---|---|---|
| Country identity | Fixed and canonical | Display names, compact keys, spacing, hyphens, and common demonyms now resolve to the same market |
| Regional knowledge | Fixed | Domestic growth follows the scout's real home; travel grows the destination |
| Youth venue pools | Fixed | Foreign trips surface youth from the destination and use that country's knowledge quality |
| International travel | Integrated into Youth EA | Visible in navigation; costs money, consumes calendar slots, changes effective location, and returns correctly |
| Sub-regions | Consolidated | One generator owns data; canonical keys survive alongside display labels and saves migrate safely |
| Tournaments | Consolidated and normalized | Discovery works for multi-word countries and one live tournament engine owns events |
| Free agents | Fixed | Market country comes from releasing club/league; nationality remains display information |
| Permanent transfers | Integrated | Country corridors influence plausible destinations without owning transfer mutation |
| Loans | Integrated | Domestic routes are preferred; under-18 cross-border loans are blocked; weak routes are rejected |
| Youth placement | Integrated | Domestic clubs rank first; older youth can use established cross-border pathways |
| Contacts and territories | Fixed | Coverage checks use canonical country identity and explicit territory keys |
| Save migration | Fixed | Legacy demonyms/display labels normalize without deleting old records |

## Release-critical defects found and closed

### 1. Nationality was masquerading as location

Free agents stored values such as `English` and `Brazilian` in a field consumed as a country key. Familiarity maps, contacts, territories, and the UI expected `england` or `brazil`, so regional discovery silently missed valid players.

The model now persists a canonical market country and keeps nationality separately. Releases derive location from the releasing club's league, with nationality only as a migration fallback.

### 2. Domestic knowledge could grow in the wrong country

The weekly regional engine previously treated `state.countries[0]` as the scout's location. A scout who started in another selected country could spend a domestic season increasing the first array entry instead.

The engine now resolves the actual home country and switches to the canonical travel destination only while abroad.

### 3. Foreign scouting used home-country quality

Youth venue selection correctly changed the player pool while abroad, but the quality weighting still read home-country reputation and labeled it regional knowledge. This could make a first trip to South Korea as accurate as years of work in England.

Venue quality now reads the canonical `regionalKnowledge` ledger for the venue or tournament host country.

### 4. Multi-word countries split into incompatible identities

`South Korea`, `southkorea`, `Saudi Arabia`, `newzealand`, `Ivory Coast`, and similar values were compared with ad-hoc `toLowerCase()` logic. Spaces and hyphens caused tournament, contact, territory, travel, and transfer-route misses.

`src/lib/country.ts` now owns normalization and display labels. Country-sensitive systems route through it, and invariant tests cover the known multi-word cases.

### 5. Geography was hidden from the focused mode

Youth Early Access generated countries, tournaments, sub-regions, and knowledge but hid International navigation and travel context. Players could not deliberately act on the world simulation.

International is now a Youth EA screen. Booking a trip requires money and contiguous calendar capacity, schedules a real travel activity, moves the scout abroad on the next week, and visibly exposes regional knowledge in the country dossier.

### 6. Multiple authoritative-looking geography engines coexisted

The repository contained duplicate tournament, territory, sub-region, and home-advantage implementations. Several were uncalled, and their country semantics differed from the live systems.

The unused implementations and public exports are removed. Tournament scheduling, territory creation, and sub-region generation each have one live owner.

## Geography now affects actual decisions

- Where the scout travels changes which youth can be found.
- The destination's knowledge level changes discovery quality.
- Travel consumes scarce weekly calendar space and cash.
- Tournament discovery depends on local familiarity, contacts, reputation, and schedule.
- Free-agent visibility depends on knowledge and network coverage in the correct market.
- AI permanent transfers use established country corridors as one factor alongside sporting and financial fit.
- Loan and placement target lists prefer domestic solutions and reject implausible cross-border routes.
- Regional knowledge feeds sub-region familiarity, unlock thresholds, cultural insight, hidden-league discovery, and local contacts.

## What still needs deeper integration for a Football Manager-level feel

These are the highest-value post-EA geography additions:

1. **Work permits and youth registration rules.** Model association-specific thresholds, under-18 exceptions, Brexit-style permit risk, and loan/transfer registration windows.
2. **Language and adaptation.** Let scout adaptability, language knowledge, player personality, distance, and culture affect trip efficiency and move success.
3. **Dynamic regional eras.** Academies, local investment, coaching quality, economic shocks, and golden generations should make talent hotspots evolve by save.
4. **Persistent pipelines.** Repeated work with a school, academy, agent, or region should create named relationships, exclusivity, referrals, and reputational risk.
5. **Travel events and logistics.** Visa delays, fixture changes, weather, fatigue, overlapping tournaments, and budget class should create planning trade-offs.
6. **Regional football identities.** Venue moments, tactical norms, physical development, family context, contract culture, and agent behavior need authored country/sub-region variation.
7. **Board and client strategy.** Clubs should issue geographic briefs, react to travel spend, compare markets, and remember whether the scout's regional bets paid off.
8. **Market evolution telemetry.** Track transfers, loans, placements, free-agent duration, travel choices, and discoveries by country across many seeds to tune route weights and opportunity density.

## Verification evidence

- Country-identity invariant tests cover contacts, travel, territories, tournaments, transfers, and multi-word countries.
- Regional-knowledge tests cover correct home growth, foreign destination growth, venue-country filtering, and destination quality.
- Free-agent geography tests cover legacy migration and territory discovery.
- Youth placement tests cover domestic and credible international pathways.
- Browser E2E verifies Youth International navigation, funded booking, calendar occupancy, and effective foreign location.
- Ten-season soak verifies sub-regions persist and familiarity continues to grow without lifecycle corruption.
