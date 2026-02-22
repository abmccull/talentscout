# TalentScout Monetization Strategies

Analysis of viable monetization approaches across three platforms: browser, Steam, and mobile.

## Current State

TalentScout is a football scouting career simulator with a rich in-game economy (British Pounds currency, 30+ purchasable equipment items across 5 slots, monthly subscription costs, career tier progression). There is currently **no real-money monetization** — all currency is earned through gameplay.

---

## 1. Browser-Based (Current Platform)

Browser games face tight monetization constraints: no native payment infrastructure, high bounce rates, and users who expect free experiences.

### Viable Strategies

#### A. Supporter Tier / Voluntary Premium
- One-time or monthly unlock (~$3–5/mo)
- Quality-of-life perks: extra save slots, cloud sync, cosmetic profile badges, leaderboard flair
- Keep the core game 100% free
- **Implementation**: Stripe or Paddle checkout, Supabase for entitlement storage (aligns with existing SERVICES_PLAN.md)
- **Revenue potential**: Low–Medium
- **Player goodwill**: High

#### B. Cosmetic Microtransactions
- Custom scout avatars, notebook skins, office themes, badge/flair for leaderboards
- No gameplay impact — purely visual
- **Implementation**: Stripe/Paddle + cosmetics inventory in game state
- **Revenue potential**: Low–Medium
- **Player goodwill**: High

#### C. Ad-Supported with Ad-Free Unlock
- Non-intrusive ads at natural pause points (between seasons, during loading, end-of-week transitions)
- $3–5 one-time purchase to remove ads permanently
- Simulation games have natural breaks that reduce ad intrusiveness
- **Implementation**: Google AdSense or Carbon Ads + ad-free flag in user profile
- **Revenue potential**: Medium
- **Player goodwill**: Medium

#### D. Expansion Packs (DLC-Style)
- New leagues/regions to scout (e.g., South America, Asia, Africa — beyond the current 23 countries)
- Historical scenarios ("Scout the Class of '92", "Find the Next Messi")
- Specialized career paths (youth academy director, chief scout)
- $2–5 per pack
- **Implementation**: Content gating via entitlement flags
- **Revenue potential**: Medium
- **Player goodwill**: High (if base game feels complete)

#### E. Tip Jar / Ko-fi / Patreon
- Lowest friction, lowest revenue
- Pairs well with a free-to-play model
- Good starting point before building payment infrastructure
- **Revenue potential**: Low
- **Player goodwill**: Very High

### What to Avoid (Browser)
- Aggressive gacha/lootboxes — audience for simulation games skews older and strategy-minded
- Pay-to-win equipment gating — undermines the existing in-game economy progression
- Hard content paywalls — browser users will leave rather than pay

---

## 2. Steam

Steam provides a paying audience that expects upfront pricing. Simulation/management games perform well on the platform (Football Manager is direct market validation).

### Viable Strategies

#### A. Premium Price ($9.99–$19.99)
- The most straightforward model for this genre
- TalentScout has enough depth to justify $14.99: 5 equipment slots, 30+ items, 5 career tiers, 4 specializations, NPC scout management, financial simulation, youth scouting, rival system
- Football Manager sells at $39.99 with a narrower simulation focus (club management vs. scouting career)
- **Revenue potential**: High
- **Player goodwill**: High

#### B. Paid DLC / Expansions (Post-Launch)
- New league/region packs ($3.99–$6.99)
- "Advanced Career" expansion with new mechanics ($7.99–$9.99) — e.g., managing a scouting department, international tournaments
- Historical/scenario packs ($2.99–$4.99)
- **Revenue potential**: Medium–High
- **Player goodwill**: High (if base game is complete)

#### C. Steam Workshop Integration
- Community-created custom leagues, player databases, scenarios
- Extends game longevity at zero cost to you
- Drives base game sales through community engagement
- **Revenue potential**: Indirect (drives base game + DLC sales)
- **Player goodwill**: Very High

#### D. Seasonal Updates + Annual Editions
- Free content updates to retain players during the year
- Annual edition with updated databases, new mechanics ($14.99–$19.99/year)
- Follows the Football Manager model
- Only viable once the game has an established audience
- **Revenue potential**: Very High (long-term)
- **Player goodwill**: Medium (annual purchase fatigue)

### What to Avoid (Steam)
- Free-to-play with microtransactions — Steam simulation audiences will review-bomb this
- Subscription model — not standard for this genre on Steam
- Cosmetic-only DLC at launch — Steam players expect substantive content for money
- Early Access without a clear roadmap — only launch EA with a concrete feature plan

---

## 3. Mobile (iOS / Android)

Mobile has the highest revenue potential but also the most competitive landscape and significant design adaptation requirements.

### Viable Strategies

#### A. Free-to-Play with Premium Unlock ($4.99–$9.99)
- Let players experience the first 2–3 seasons for free
- One-time purchase to unlock the full game
- Proven model for quality simulation games (Mini Motorways, Pocket City, Retro Bowl)
- **Implementation**: App Store / Google Play IAP
- **Revenue potential**: High
- **Player goodwill**: High

#### B. Cosmetic IAP + Ad Removal Bundle
- Free with non-intrusive ads (between weeks/seasons)
- $2.99–$4.99 to remove ads permanently
- Optional cosmetic packs ($0.99–$2.99) for scout customization, office themes
- **Revenue potential**: Medium–High
- **Player goodwill**: Medium–High

#### C. Season Pass Model
- $1.99–$3.99/month or $9.99/year
- Ongoing content drops: new leagues, equipment items, scenarios, exclusive cosmetics
- The equipment catalog system already supports new item additions easily
- **Revenue potential**: High (recurring)
- **Player goodwill**: Medium

#### D. Apple Arcade / Google Play Pass Submission
- Paid per engagement rather than direct sales
- Good discovery channel for indie games
- No ads or IAP required (subscription services prohibit them)
- Removes monetization complexity — you just make the best game possible
- **Revenue potential**: Medium (depends on engagement metrics)
- **Player goodwill**: Very High

#### E. Energy System (Cautious Approach)
- The existing fatigue mechanic could map to a real-time energy system
- Activities cost energy that refills over time (or can be refilled with IAP)
- **Warning**: This is the most revenue-generating but most player-hostile option
- Only viable if implemented subtly — aggressive gating will drive users away from a simulation game
- **Revenue potential**: Very High
- **Player goodwill**: Low

### What to Avoid (Mobile)
- Upfront premium price with no free trial — discovery is too difficult on app stores
- Lootbox mechanics — increasingly regulated (illegal in Belgium/Netherlands, restricted in many markets)
- Aggressive notification-driven engagement loops — scouting sim players want depth, not casual hooks
- Multiple premium currencies — adds confusion and feels manipulative

---

## Platform Comparison Matrix

| Strategy | Revenue | Effort | Goodwill | Best Platform |
|---|---|---|---|---|
| Supporter tier + cosmetics | Low–Med | Low | High | Browser |
| Ads + ad-free unlock | Medium | Low | Medium | Browser, Mobile |
| Premium price ($14.99) | High | Medium | High | Steam |
| Paid DLC / expansions | Med–High | Medium | High | Steam, Mobile |
| Free trial + premium unlock | High | High | High | Mobile |
| Season pass (recurring) | High | High | Medium | Mobile |
| Apple Arcade / Play Pass | Medium | Low | Very High | Mobile |
| Workshop / community content | Indirect | Medium | Very High | Steam |

---

## Recommended Approach (Multi-Platform)

A tiered strategy that respects each platform's norms:

### Phase 1: Browser (Now)
1. Launch the game for free as-is
2. Add a **tip jar** (Ko-fi / Buy Me a Coffee) for immediate low-effort revenue
3. Implement **Supabase cloud sync** (already planned) as a free feature to build user base
4. Add a **Supporter badge** on leaderboards for donors

### Phase 2: Browser Monetization + Steam Prep
1. Add **expansion packs** (new regions/scenarios) as paid content ($2–5 via Stripe)
2. Implement **cosmetic options** for supporters
3. Prepare Steam build — the game's offline-first architecture suits Steam well
4. Consider an **ad-supported tier** with ad-free unlock

### Phase 3: Steam Launch
1. Launch at **$14.99** with all current content
2. Include browser expansion packs in the base price
3. Plan **DLC roadmap** (new regions, career modes, historical scenarios)
4. Add **Steam Workshop** support for community content

### Phase 4: Mobile Port
1. Adapt UI for touch (the turn-based nature suits mobile well)
2. Launch **free-to-play with premium unlock** ($6.99 for full game)
3. Submit to **Apple Arcade / Google Play Pass** for discovery
4. Add **cosmetic IAP** and optional **season pass** for ongoing content

---

## Key Principles

1. **Never gate existing mechanics behind paywalls** — The in-game economy (equipment shop, salary progression) is core gameplay. Real-money monetization should add _new_ content, not lock existing content.

2. **Respect the audience** — Simulation game players are strategy-minded adults who will reject exploitative mechanics and reward fair pricing with loyalty and word-of-mouth.

3. **Match platform expectations** — Browser = free/cheap, Steam = premium upfront, Mobile = free trial then convert.

4. **Build community first, monetize second** — A loyal player base that trusts you will support fair monetization. Aggressive early monetization kills growth.

5. **Lean on the game's depth** — TalentScout's 22 attributes, 4 specializations, 5 career tiers, equipment system, and NPC management provide genuine value. Let the game sell itself.
