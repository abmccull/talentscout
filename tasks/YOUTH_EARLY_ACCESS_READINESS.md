# Youth Scout Early Access readiness

**Target:** One complete Freelance Youth Scout vertical slice for desktop Early Access.
**Runtime:** Next.js static export inside Electron, with browser development support.
**Release decision:** **Early Access candidate.** Local product, build, accessibility, and Windows packaging gates pass. Steam publishing remains externally gated by licensed SDK files and portal/depot configuration.

## Certified product scope

Included:

- Freelance Youth Scout career creation with exact eight-point skill allocation.
- Dashboard and manual weekly planning.
- School Match discovery and the real multi-phase observation session.
- Player focus, evidence flags, cross-session hypotheses, and an on-profile evidence dossier.
- Evidence-backed report writing with developmental Youth language and no hidden-truth scoring.
- Immediate report-craft feedback followed by delayed career-evidence accuracy validation.
- Independent report listing, a paced first named-club bid, acceptance, and financial payoff.
- Specialization mastery, regional familiarity, reputation, fatigue, XP, finances, and truthful season reviews.
- International country dossiers and travel that consumes cash and calendar capacity, changes the active youth market, and grows destination knowledge.
- A career tracker that preserves the original scouting read without exposing CA, PA, or wonderkid truth.
- Local autosave plus five manual save/load slots.
- Preservation and rejection of incompatible full-game saves.
- Ten-season world integrity for youth development, academy/senior rosters, and bounded attributes.
- Desktop layout plus the 390 × 844 responsive browser layout.

Explicitly outside this Early Access gate:

- First Team, Data, and Regional specializations.
- Club-employed starts and scenarios.
- Batch Advance / Quick Scout and Auto-Schedule.
- Premature career completion and New Game+.
- Agency, Leaderboard, Analytics, NPC rivals, and other late-game breadth.
- Supabase account saves and the global leaderboard.

## Certified player journey

The no-retry E2E gate verifies this path through normal UI and game-state transitions:

1. Start a Freelance Youth Scout career.
2. Allocate exactly eight starting skill points.
3. Land on the dashboard with an actionable **Open the calendar** mentor task.
4. Open the mobile navigation and Calendar without the mentor blocking the hamburger.
5. Schedule a School Match.
6. Advance through the canonical week simulation.
7. Launch the real observation session, focus a player, flag evidence, and complete reflection.
8. Open a discovered player and write an evidence-backed report.
9. Submit and list the report.
10. Advance through the normal weekly path and receive one first named-club bid.
11. Accept the bid and see the balance and bid status update.
12. Save manually, autosave independently, load the prior state, and delete only the chosen slot.

## Release controls

| Control | Status | Current evidence |
|---|---|---|
| Youth creation and eight-point boundary | **Verified** | Wizard + engine assertions |
| Honest specialization/path scope | **Verified** | Menu, creator, nav, dashboard, calendar, and save checks |
| Youth onboarding | **Verified for first-week route** | Fresh tutorial state + mobile browser interaction |
| Canonical weekly processing | **Verified** | Real week simulation; Batch hidden |
| Observation focus/reflection | **Verified for School Match** | Multi-phase UI loop and persisted evidence |
| Report credibility | **Verified for EA guardrails** | Evidence claims + low-evidence 14-year-old GK case |
| Marketplace first outcome | **Verified** | Listing, one paced first bid, and acceptance |
| Weekly summary state | **Verified for canonical path** | Persisted fatigue, reputation, discovery, and observation deltas |
| Save/load isolation | **Verified** | Autosave slot 0, manual slots 1–5, load/delete, incompatible-save preservation |
| Responsive journey | **Verified** | 1280 × 720 and 390 × 844 rendered evidence |
| Accessibility | **Verified for four critical states** | Zero serious/critical axe violations on main, creation, dashboard, calendar |
| Clean dependency install | **Verified** | `npm ci` succeeds from the synchronized lockfile |
| Type, lint, syntax, and diff | **Verified** | Typecheck and lint pass with zero warnings; `git diff --check` has no content errors |
| Production static export | **Verified** | Next.js build passes; `/play` first-load JS is approximately 920 KB |
| Youth EA E2E | **Verified** | **23/23 pass serially** before the final toast-only patch; **4/4 focused post-fix**, including the affected first-report path |
| Production dependency security | **Pass with accepted moderate debt** | No high/critical advisory; four moderate Next/PostCSS advisories remain |
| Windows Electron package | **Verified** | NSIS and unpacked builds produced; process smoke passes |
| Steam redistributables | **Externally managed** | Real licensed SDK files required for tagged Steam builds |
| Steam Cloud, achievements, depot | **Externally managed** | Steamworks portal verification required |
| Rollback ownership | **Externally managed** | Release owner must retain a known-good depot/build |
| Production diagnostics/support | **Partial** | Local save recovery exists; production Sentry/support ownership remains external |

## Current Windows artifact

- Installer: `dist/TalentScout-Setup-1.0.0.exe`
- Size: 250,304,197 bytes
- SHA-256: `3B39338878C3C109CBB5A2CD56A7B3E2AE4CB1C9AC992621CF5ACFA59A933734`
- Smoke result: the packaged app remained healthy for eight seconds with five Electron processes and then closed cleanly.

## Remaining non-blocking debt

- Four moderate advisories originate from Next's bundled PostCSS. npm's proposed force fix downgrades Next to 9 and is rejected as unsafe.
- `/play` is still a large client route and should be split before broadening the game.
- The Windows installer is not production-certificate signed; storefront release still requires the release certificate.
- Ten-season state integrity is certified, but economy tuning, venue-content variety, and long-horizon balance still need broader seed telemetry.

## External Steam release checklist

Before publishing a Steam depot, the release owner must:

1. Provision real `steam_appid.txt` and platform Steam API redistributables from the licensed SDK.
2. Verify Steam achievements, Cloud quotas/paths, app ID, depot, branch, and launch options in Steamworks.
3. Sign the Windows installer with the production certificate.
4. Upload to a private branch and repeat the packaged first-report smoke on a clean machine.
5. Retain the prior known-good depot and name the rollback/support owner.

## Post-Early-Access depth backlog

- More authored event variety and venue-specific observation moments after School Match pacing is validated.
- Richer client relationships, repeat buyers, and club-specific scouting philosophies.
- More visible alumni milestones and career-story callbacks beyond delayed report validation.
- Club-employed Youth path.
- Additional specializations, scenarios, agency management, rivals, and deeper international regulations/culture.
- New Game+ only after a real idempotent career-ending contract exists.
