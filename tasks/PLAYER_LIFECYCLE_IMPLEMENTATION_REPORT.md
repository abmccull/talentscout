# Player lifecycle, transfers, and loans implementation report

**Date:** July 10, 2026
**Scope:** Youth Scout Early Access plus the world simulation needed to support long careers.
**Decision:** The lifecycle is now coherent enough for Early Access. One authoritative resolver owns registration, contract ownership, club budgets, loan state, retirement, and movement history.

## Authoritative invariants

The game now distinguishes two facts that were previously conflated:

- `player.clubId` is the club where the player is currently registered and playing.
- `player.contractClubId` is the club that owns the player's contract.

Every movement runs through `src/engine/world/playerLifecycle.ts`. A player can complete at most one lifecycle transition in a resolution pass, with terminal events taking priority. The resolver repairs club arrays before registering a player, so a player cannot remain in two senior squads, two academies, a free-agent pool and a club, or both sides of a loan.

The protected movement types are:

- youth signing;
- permanent transfer;
- loan start, return, recall, and buy option;
- release and free-agent signing;
- contract renewal;
- retirement and exit from professional football.

Every accepted transition writes an immutable `PlayerMovementEvent`. Rejected proposals do not create financial payouts, transfer records, news, or sell-on revenue.

## Permanent transfers

- AI and manual transfers use the same movement resolver.
- Transfer windows gate initiation and completion.
- The buying club pays the transfer fee and signing bonus; the selling club receives the fee.
- New wages and contract expiry are applied at completion.
- AI fees account for market value, contract length, age, club budget, and sporting fit.
- Destination selection accounts for position need, reputation, club philosophy, and country-to-country transfer corridors.
- Repeat career moves are retained. Transfer accountability suppresses only an exact duplicate movement, not every future transfer for that player.
- The latest eligible scout report is linked to each tracked transfer, preserving long-term accountability.
- Player profiles expose a chronological career journey sourced from the movement ledger.

## Loans

- A scout recommendation names a player, destination, rationale, duration, and proposed wage contribution.
- Recommendations receive a real club response. Reputation and XP are awarded only when the recommendation is accepted.
- Loan clubs pay the one-time fee and their full agreed wage share for the planned duration; parent clubs receive both amounts.
- Contract ownership remains with the parent club while registration moves to the host.
- Under-18 players cannot take cross-border loans. Older players are offered only domestic or established international loan routes.
- Playing-time promises affect appearance probability.
- Weekly performance persists appearances, goals, assists, rating, satisfaction, and real development since loan start.
- Monitoring is limited to once per game week per deal and uses the central scout progression helper.
- Returns, recalls, and affordable buy options are authoritative lifecycle transitions, with final outcomes stored in loan history.
- Successful, failed, recalled, and purchased loans feed back into scout reputation, XP, recommendations, messages, and player career history.

## Contracts, free agents, and retirement

- Season-end renewals and releases are resolved once; the old duplicate mutation path is gone.
- Mid-season releases cannot release loaned players or players whose registration and ownership do not match.
- Free-agent negotiations remain visible while active and expire correctly across season boundaries.
- NPC and player-controlled signings apply wages, bonuses, contracts, budgets, roster placement, and pool removal atomically.
- Free-agent identity now stores nationality separately from the canonical country market.
- Retirement archives the complete player, removes every roster/pool/loan reference, and keeps the player profile resolvable from career history.

## Scout progression integration

`src/engine/scout/progression.ts` is now the single XP carry-over and level-up implementation. Calendar work, loan monitoring, and loan outcomes no longer apply subtly different progression rules. XP can carry across thresholds and award multiple levels safely.

## Conflicting and dead paths removed

- direct cross-country transfer mutation;
- duplicate store-level loan mutation;
- duplicate season-end transfer-record update;
- standalone completed-transfer mutation helper;
- generic loan calendar cards that had no player, club, or deal context;
- unused free-agent pool mutation helpers;
- unused youth placement fee helper;
- unused familiarity penalty helper;
- duplicate territory generator;
- duplicate international youth-tournament engine;
- duplicate sub-region data generator;
- unused youth home-advantage module.

## Verification

- TypeScript: pass.
- ESLint: pass with zero warnings or errors.
- Unit/invariant tests: **20/20 pass** across lifecycle, loans, repeated transfers, free-agent geography, regional knowledge, country identity, placement routes, and scout XP.
- Youth Early Access E2E gate before the final toast-only patch: **23/23 pass** in 7.3 minutes.
- Focused post-toast regression: **4/4 pass**, including the exact first report/bid journey and click-through behavior.
- Ten-season soak: no duplicate/missing rosters, dual ownership, stale free agents, invalid loans, resurrected retirees, invalid market values, duplicate loan history, or broken youth bounds.

## Remaining depth, not lifecycle correctness

The simulation now supports long careers, but a `$29` Early Access promise still benefits from more player-facing decisions around that simulation:

1. club/client personalities that remember report style and prior outcomes;
2. loan-plan negotiation over role, position, recall conditions, and development targets;
3. more mid-horizon career beats between submission and two-season validation;
4. transfer rumors, competing bids, agent pressure, and deadline trade-offs visible to the scout;
5. broader seed telemetry to tune market liquidity, fees, wages, and loan success rates.
