# TalentScout Monetization Strategies

## Strategic Vision

**Browser → Steam → Mobile** — a phased platform strategy where the browser version serves as the core development and playtesting vehicle, Steam Early Access is the first paid launch with a clear roadmap to full release, and mobile follows as the final expansion.

## Current State

TalentScout is a football scouting career simulator with a rich in-game economy (British Pounds currency, 30+ purchasable equipment items across 5 slots, monthly subscription costs, career tier progression). There is currently **no real-money monetization** — all currency is earned through gameplay.

---

## Phase 1: Browser as Development Vehicle

The browser version is not primarily a revenue channel — it's a **development platform, playtesting environment, and community builder**. The goal is to polish the game, gather feedback, and build an audience before the paid Steam launch.

### Strategy: Free-to-Play, Community-First

#### Core Approach
- Game is **100% free** on browser — no paywalls, no ads during active development
- Use the browser audience as your playtest community
- Collect feedback through bug reports, feature requests, and gameplay data
- Iterate rapidly using the web deployment pipeline (Vercel = instant updates)

#### Low-Effort Revenue (Optional)
- **Tip Jar** (Ko-fi / Buy Me a Coffee / Patreon) — let early supporters contribute voluntarily
- **Supporter Badge** on leaderboards for donors — visible recognition, zero gameplay impact
- **Discord / community access** for supporters — builds the core community that will drive Steam launch

#### Browser-Specific Features to Build
1. **Cloud saves via Supabase** (already planned) — makes the browser version feel premium
2. **Global leaderboards** (infrastructure exists) — creates competition and retention
3. **Analytics dashboard** (planned) — track play patterns to inform Steam content priorities
4. **Expansion content** — new regions, scenarios, equipment — developed here first, bundled into Steam later

#### What the Browser Phase Accomplishes
- Validates core gameplay loop with real players before charging money
- Builds a wishlist/following for the Steam launch
- Generates content (regions, features, balance tuning) that ships with Steam
- Creates word-of-mouth and community ambassadors
- Identifies what players value most (informs DLC/roadmap priorities)

---

## Phase 2: Steam Early Access Launch

Steam is the **primary monetization platform**. Early Access is the right model — it aligns with the game's active development state, and the simulation genre has proven EA success stories (Dwarf Fortress, Rimworld, Football Manager started as Championship Manager shareware).

### Pricing Model: Early Access → Full Release

| Stage | Price | Content |
|---|---|---|
| **Early Access Launch** | **$14.99–$19.99** | Core game: 4 specializations, 5 career tiers, 23 countries, equipment system, NPC scouts, youth scouting, financial simulation, rival system |
| **Major EA Updates** (free) | — | New regions, features, balance patches, community-requested content |
| **Full Release (v1.0)** | **$29.99–$39.99** | All EA content + expanded regions, narrative events, polished UI, full transfer window system, historical scenarios |
| **Post-Launch DLC** | $4.99–$9.99 each | Major expansions (see roadmap below) |

### Why Early Access at $14.99–$19.99 Works

1. **Price anchoring** — Players who buy at $14.99 feel they got a deal when v1.0 hits $29.99+. This builds goodwill and positive reviews ("bought this for $15 and it's already worth $30").

2. **Genre precedent** — Successful EA simulation games follow this exact pattern:
   - Rimworld: $30 EA → $35 full release
   - Dwarf Fortress (Steam): $30 from day one
   - Software Inc: $11 EA → ongoing development
   - Prison Architect: $30 EA → full release + DLC
   - Football Manager itself started as affordable shareware

3. **Revenue during development** — EA sales fund continued development without needing outside investment or ad revenue. Every copy sold is reinvested into the game.

4. **Community co-development** — EA buyers are invested stakeholders. Their feedback shapes the roadmap. This is especially powerful for a simulation game where depth matters more than polish.

5. **Review momentum** — Positive EA reviews compound over time. By v1.0 launch, you have hundreds of reviews saying "great value, active development, devs listen to feedback."

### $14.99 vs $19.99 Entry Point

| Factor | $14.99 | $19.99 |
|---|---|---|
| Volume | Higher — lower barrier, more impulse buys | Moderate — still accessible but slightly filtered |
| Revenue per unit | Lower | Higher |
| Perceived value | "Steal" when full game hits $29.99+ | Fair price, still feels like a deal at v1.0 |
| Audience signal | Casts wider net, more casual buyers | Slightly more committed buyers, better feedback |
| Price increase room | Can bump to $19.99 mid-EA as content grows | Already at ceiling for EA |
| **Recommendation** | **Start here** — maximize volume and reviews early | Move here mid-EA after 2-3 major updates |

**Recommended approach**: Launch EA at **$14.99**, raise to **$19.99** after 2-3 major content updates, then **$29.99** at v1.0 full release. Each price increase drives a sales spike as players rush to buy before the next increase.

### Steam Early Access Roadmap

This roadmap should be public on the Steam store page — transparency is critical for EA trust.

#### EA Launch Content (Day 1)
- 4 specializations (Youth Scout, First Team Scout, Regional Expert, Data Scout)
- 5 career tiers with progression
- 23 countries with leagues and clubs
- Full equipment system (30+ items across 5 slots)
- NPC scout management
- Youth scouting and academy system
- Financial simulation
- Rival scout system
- Local and cloud leaderboards

#### EA Update 1: Transfer Windows & Narratives (Free)
- Full transfer window system with deadline-day pressure
- Narrative event system (media scandals, hot streaks, injury crises)
- Improved match simulation with richer observation mechanics
- New equipment items

#### EA Update 2: Expanded World (Free)
- 10+ new countries/regions (South America, Africa, Asia expansion)
- Regional scouting specialties and cultural mechanics
- Cross-continental transfer dynamics
- New contacts and network types per region

#### EA Update 3: Advanced Career (Free)
- Scouting department management (hire/fire/manage a team of scouts)
- International tournament scouting (World Cup, continental championships)
- Media interactions and press conferences
- Scout reputation visible to other clubs (get headhunted)

#### v1.0 Full Release
- All EA content polished and balanced
- Full tutorial and onboarding experience
- Achievement system
- Historical scenarios ("Scout the Class of '92")
- Mod support / Steam Workshop foundation

### Post-v1.0 Paid DLC Strategy

Once v1.0 establishes the full-price baseline, DLC extends the game's revenue tail:

| DLC | Price | Content |
|---|---|---|
| **Region Packs** | $4.99 each | Deep-dive into specific regions: MLS & South America, J-League & K-League & A-League, African football, Scandinavian leagues |
| **Historical Scenarios** | $4.99–$6.99 | "The Class of '92", "Brazil's Golden Generation", "Ajax Youth Revolution", "Leicester's Miracle" |
| **Advanced Careers** | $7.99–$9.99 | Chief Scout career path, Academy Director mode, International Scout for national teams |
| **Annual Database Update** | $9.99/year | Updated real-world-inspired player databases, new clubs, league restructuring |

### Steam Workshop Integration

- Community-created leagues, player databases, and scenarios
- Extends game longevity indefinitely
- Drives base game + DLC sales through community engagement
- **Free to implement, massive return on investment**

### Steam-Specific Marketing

- **Wishlists are everything** — drive browser players to wishlist before EA launch
- **Steam Next Fest** — submit a demo (the browser version IS the demo)
- **Launch discount** — 10% off for launch week drives volume and visibility
- **Regular dev updates** — Steam rewards active EA developers with algorithm visibility

---

## Phase 3: Mobile Port

Mobile comes **after** Steam establishes the game and generates revenue to fund the port. The turn-based weekly cycle is a natural fit for mobile sessions.

### Pricing Model: Free Trial → Premium Unlock

| Tier | Price | Content |
|---|---|---|
| **Free** | $0 | First 3 seasons, 1 specialization, limited countries |
| **Premium Unlock** | $6.99–$9.99 | Full game (all specializations, all countries, unlimited seasons) |
| **Expansion IAP** | $2.99–$4.99 each | Region packs, historical scenarios (mirrors Steam DLC) |

### Why Free-to-Try on Mobile

- App store discovery requires a free download — premium-only games are nearly invisible
- 3 seasons is enough to hook simulation players but short enough to leave them wanting more
- The unlock price ($6.99–$9.99) is premium for mobile but justified by the game's depth
- Proven model: Retro Bowl, Pocket City, Mini Motorways all follow this pattern

### Alternative: Apple Arcade / Google Play Pass

- Submit to subscription services for guaranteed per-engagement revenue
- Removes all monetization complexity — no ads, no IAP, just make the best game
- Good discovery channel for indie titles
- Can run alongside the direct App Store/Play Store listing

### Mobile-Specific Considerations

- **UI adaptation**: Current web UI will need touch-friendly redesign (larger tap targets, swipe navigation, simplified menus)
- **Session length**: Mobile players have shorter sessions — ensure the weekly cycle can be completed in 5-10 minutes
- **Offline play**: The IndexedDB/offline-first architecture translates well to mobile
- **Notifications**: Optional "your week is ready" reminders — tasteful, not aggressive
- **Cross-platform saves**: Cloud sync via Supabase enables play on browser/mobile with the same save

### What to Avoid on Mobile
- Energy/stamina systems that gate play time — hostile to the simulation audience
- Lootbox mechanics — increasingly regulated globally
- Aggressive ad frequency — one interstitial per session maximum
- Multiple premium currencies — confusing and predatory

---

## Revenue Projections (Conservative)

These are rough estimates based on indie simulation game benchmarks, not promises.

### Steam Early Access

| Metric | Conservative | Moderate | Optimistic |
|---|---|---|---|
| EA units (year 1) | 2,000 | 8,000 | 25,000 |
| Avg price (after Steam cut) | $10.50 | $10.50 | $10.50 |
| EA revenue (year 1) | $21,000 | $84,000 | $262,500 |
| v1.0 launch spike | 1.5x EA sales | 2x EA sales | 3x EA sales |
| DLC attach rate | 15% | 25% | 40% |

*Steam takes a 30% cut (drops to 25% after $10M, 20% after $50M). Net revenue per $14.99 sale = ~$10.50.*

### Mobile (Year 1 Post-Launch)

| Metric | Conservative | Moderate | Optimistic |
|---|---|---|---|
| Downloads | 10,000 | 50,000 | 200,000 |
| Free → paid conversion | 5% | 8% | 12% |
| Avg revenue per paying user | $7.99 | $9.99 | $12.99 |
| Mobile revenue (year 1) | $4,000 | $40,000 | $312,000 |

*Apple/Google take a 30% cut (15% for small developers under $1M/year via Small Business Program).*

---

## Platform Comparison Matrix

| Factor | Browser | Steam EA | Steam v1.0 | Mobile |
|---|---|---|---|---|
| **Price** | Free | $14.99–$19.99 | $29.99–$39.99 | Free + $6.99–$9.99 |
| **Primary purpose** | Development & community | First revenue + co-development | Full monetization | Audience expansion |
| **Revenue** | Tips only | Medium–High | High | Medium–High |
| **Effort** | Current stack | Medium (Electron/Tauri wrap) | Continuation of EA | High (UI redesign) |
| **Timeline** | Now | After browser polish | 12-18 months post-EA | After Steam v1.0 |
| **Key metric** | Player count & feedback | Units sold & reviews | Review score & DLC attach | Conversion rate |

---

## Phased Timeline

```
Browser (Now)                Steam EA                    Steam v1.0              Mobile
─────────────────────────────────────────────────────────────────────────────────────────
 Polish gameplay              $14.99 launch               $29.99-$39.99           Free + $6.99
 Build community              Free content updates         DLC strategy            IAP expansions
 Gather feedback              Raise to $19.99             Workshop support         Apple Arcade
 Drive wishlists              Build review count           Annual updates           Cross-platform saves
─────────────────────────────────────────────────────────────────────────────────────────
 Revenue: Tips               Revenue: EA Sales            Revenue: Full Price     Revenue: Premium Unlock
 Goal: Validate & Build      Goal: Fund Development       Goal: Maximize          Goal: Expand Reach
```

---

## Key Principles

1. **Browser is the lab, not the cash register** — Use it to build, test, and grow a community. Don't optimize for browser revenue.

2. **Early Access is a partnership with players** — Be transparent about the roadmap, deliver regular updates, and respond to feedback. EA buyers are your most valuable asset.

3. **Price increases reward early believers** — Players who bought at $14.99 become evangelists when the game reaches $29.99. They feel smart, not cheated.

4. **Never gate existing mechanics behind paywalls** — The in-game economy (equipment shop, salary progression) is core gameplay. Real-money monetization adds _new_ content on top.

5. **Each platform funds the next** — Browser is free (low cost to run). Steam EA revenue funds continued development and the mobile port. Mobile revenue extends the long tail.

6. **Respect the audience** — Simulation game players are strategy-minded adults who will reject exploitative mechanics and reward fair pricing with loyalty, positive reviews, and word-of-mouth.

7. **Ship the roadmap, not just the game** — On Steam, the public roadmap IS part of the product. Players buy into the vision as much as the current state. Deliver on promises consistently.
