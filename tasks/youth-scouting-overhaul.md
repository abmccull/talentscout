# Youth Scouting Experience Overhaul — Review & Plan

## The Problem

Youth scouting in TalentScout currently works like this:
1. Schedule an activity (school match, grassroots tournament, etc.)
2. Week advances
3. Receive inbox message with results

That's it. No observation. No moments. No choices during the event. The entire scouting experience — the thing the game is ABOUT — happens off-screen in a batch process. The scout schedules, waits, and reads a report someone else could have written.

The first-team match engine is better but still limited: it's "click Next Phase, read commentary, pick focus players." The match outcome is pre-determined. Events are pre-generated. The scout observes a script, not a simulation.

Neither system delivers the core fantasy: **being in the stands, watching a player, and SEEING something nobody else sees.**

---

## Current Systems Audit

### Youth Scouting (What Exists)

**7 venue types**, each with distinct mechanics:
| Venue | Slots | Fatigue | Pool Size | Noise | Gate |
|-------|-------|---------|-----------|-------|------|
| School Match | 2 | 8 | 3-6 | 1.2x | Always |
| Grassroots Tournament | 3 | 12 | 5-10 | 1.3x | Youth spec ≥1 |
| Street Football | 2 | 6 | 2-5 | 1.4x | Sub-region familiarity ≥20 |
| Academy Trial Day | 2 | 10 | 4-8 | 0.9x | Academy contact rel ≥40 |
| Youth Festival | 3 | 14 | 8-15 | 1.2x | Career tier ≥2 |
| Follow-Up Session | 1 | 5 | 1 (targeted) | 0.85x | Prior observation |
| Parent/Coach Meeting | 1 | 3 | 1 (targeted) | 2.0x | Prior observation |

**The pipeline:** Schedule → Week advances → `processYouthVenueActivity()` → Pool selection → `processVenueObservation()` → Perception engine → Inbox message

**What's good:**
- Venue diversity with meaningful gating (contacts, familiarity, tier)
- Perception noise varies by venue (street football = high noise, academy = low)
- Gut feeling system exists with reliability scoring
- Equipment bonuses affect discovery rates
- Quality tiers (poor → exceptional) with discovery modifiers
- Follow-up sessions and parent/coach meetings for deeper investigation

**What's missing:**
- Zero interactive observation during events
- No moment-by-moment experience
- No choices during the scouting activity itself
- No sense of atmosphere, tension, or discovery
- Results are indistinguishable from a spreadsheet update

### First-Team Match Engine (What Exists)

**12-18 phases** per match, each with 2-4 events. 21 event types. Commentary system with position-aware, form-aware, weather-aware text.

**Scout interactivity:**
- Focus on up to 3 players
- Choose lens per player (technical/physical/mental/tactical/general)
- Advance phases manually
- View pitch canvas with player dots

**Limitations:**
- Match outcome fully pre-determined at generation time
- All events pre-generated — scout choices don't affect what happens
- "Click next, read text" loop
- Focus selection is the ONLY meaningful choice
- No decision points, no branching, no consequences during the match
- Lens switching has no cost or tradeoff

---

## Design Principles (From First Principles)

### What Makes Scouting Different From Managing

| Managing | Scouting |
|----------|----------|
| You control players | You watch players |
| Success = match results | Success = prediction accuracy |
| Skill = tactical optimization | Skill = pattern recognition |
| Resource = money/fitness | Resource = attention/focus |
| Certainty is achievable | Uncertainty is permanent |
| One match matters | Repeated observation matters |

### What Real Scouts Actually Do

1. **They can't watch everyone** — attention is scarce, they choose who to focus on
2. **They watch FOR pressure** — how players respond to mistakes, adversity, chaos
3. **They use two modes** — structured criteria AND gut intuition simultaneously
4. **They compare constantly** — "This kid moves like young Mbappé"
5. **They notice what others miss** — the value is in asymmetric information
6. **They observe repeatedly** — one match tells you almost nothing, patterns emerge over time
7. **Context changes everything** — a player on a rainy school pitch ≠ same player at an academy

### The Design Goal

**From:** "Schedule activity → wait → read results"
**To:** "Attend event → observe players → make choices about what to focus on → notice things → form opinions → test those opinions over time"

The youth scouting experience should feel like **an investigation**, not an inbox notification.

---

## The Plan: Youth Observation Engine

### Architecture Overview

```
┌─────────────────────────────────────────────────┐
│           YOUTH OBSERVATION ENGINE               │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Event    │  │ Attention │  │  Perception  │  │
│  │ Generator │→│  System   │→│    Engine     │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│       ↓              ↓              ↓           │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Venue   │  │  Moment  │  │  Hypothesis  │  │
│  │ Atmosphere│  │ Timeline │  │   Tracker    │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│                      ↓                          │
│              ┌──────────────┐                   │
│              │  Observation │                   │
│              │   Summary    │                   │
│              └──────────────┘                   │
└─────────────────────────────────────────────────┘
```

### Feature 1: The Observation Match (Core Experience)

**What changes:** Youth events become interactive, phase-based experiences — not background processes.

**Structure:**
- Youth matches/events generate **8-12 phases** (shorter than first-team's 12-18)
- Each phase is 5-8 minutes of game time
- Each phase generates **3-6 player moments** across the youth pool
- The scout WATCHES these moments unfold and makes choices

**How it works:**
```
Phase starts →
  3-6 moments generate (players doing things) →
  Scout sees moments for focused players in detail,
    unfocused players appear as vague descriptions →
  Scout can: focus a player, flag a moment,
    switch lens, take a note, trigger comparison →
Phase ends → next phase
```

**Key difference from first-team engine:** Moments are player-centric, not match-centric. You're not watching "the match" — you're watching "the players." Goals and scores matter less than individual moments of skill, decision-making, and character.

**Venue-specific event generation:**
- **School match**: Structured play, coaching visible, fewer "raw" moments. Good for reading tactical awareness and coachability.
- **Grassroots tournament**: High intensity, fatigue, pressure. Good for reading mentality, stamina, composure.
- **Street football**: Chaotic, improvisational, creative. Good for reading raw technique, flair, improvisation. Worst for reading tactical discipline.
- **Academy trial**: Controlled drills + small-sided games. Best accuracy but players perform "for the coaches" — may hide true personality.
- **Youth festival**: International mix, unfamiliar opponents, high stakes. Good for reading adaptability, ambition, big-game temperament.

### Feature 2: The Attention System (Focus Tokens)

**What changes:** Scout has limited attention. Can't watch everyone. Must choose.

**Mechanics:**
- Scout gets **3 focus tokens per half** (6 total per event)
- Each token locks focus on 1 player for 1-3 consecutive phases
- Focused players: detailed moment descriptions, attribute hints, emotional reads
- Unfocused players: vague descriptions ("a midfielder made a nice pass", "a striker missed a chance")
- Focus can be split: 2 tokens on one player (deeper read) or 1 token each on 3 players (wider scan)

**Why tokens, not unlimited focus:**
- Forces the scout to make the core scouting decision: WHO deserves my attention?
- Creates natural replay value: "I focused on the striker but the left-back caught my eye — I need to come back"
- Mirrors real scouting: you physically cannot watch everyone at once

**Lens integration (improved):**
- Lenses still exist (technical/physical/mental/tactical)
- NEW: Lens has a **warmup period** — first phase with a new lens gives partial reads, subsequent phases give full reads
- NEW: Lens **fatigue** — using the same lens for 4+ consecutive phases reduces accuracy (you're overthinking it)
- NEW: **Switching cost** — changing lens mid-focus costs half a phase of accuracy (your eye needs to readjust)

### Feature 3: Venue Atmosphere System

**What changes:** Where you scout changes WHAT you can learn.

**Atmosphere properties per venue:**
```
{
  venue: "streetFootball",
  weather: "overcast",
  pitchQuality: "poor",
  crowdSize: "small",
  structure: "chaotic",

  // What's MORE visible here
  amplified: ["dribbling", "creativity", "balance", "improvisation"],

  // What's LESS visible here
  dampened: ["positioning", "tacticalDiscipline", "teamwork"],

  // Unique to this venue
  reveals: ["rawTalent", "streetSmarts"],

  // Perception modifier
  noiseMultiplier: 1.4,

  // Atmosphere text
  description: "A concrete pitch behind a community centre. No lines,
    no nets on the goals. Kids playing for the love of it.
    The ones with something show it differently here."
}
```

**Dynamic atmosphere events:**
- Rain starts mid-match → technical noise increases, physical attributes become clearer
- A fight breaks out → composure and leadership become visible
- A parent starts shouting from the sideline → pressure response becomes readable
- The match gets lopsided → work rate and attitude become visible (does the kid keep trying when losing 5-0?)

**Why atmosphere matters:**
- Same player, different venue = different signal. This makes repeated observation meaningful.
- Atmosphere events create unpredictable narrative moments (not scripted, rolled from venue properties)
- The scout LEARNS which venues are best for evaluating specific attributes

### Feature 4: The Moment System (Flagging & Timeline)

**What changes:** Scouts build a personal timeline of notable moments.

**How it works:**
- During each phase, after moments generate, scout can **flag** up to 1 moment
- Flagging captures: minute, player, what happened, which attributes were hinted, scout's quick reaction
- Scout chooses a reaction tag: `promising` | `concerning` | `interesting` | `needs_more_data`
- After the event, scout has a **moment timeline** they can review
- Moments persist across multiple observations of the same player

**Post-event reflection:**
- After the match ends, scout enters a brief **reflection phase**
- Reviews their flagged moments
- Can upgrade/downgrade reaction tags with hindsight ("I flagged that as concerning but actually it was smart")
- Can write a free-form note (stored as `scoutNote` on the observation)
- The reflection phase is where gut feelings trigger (not randomly during play)

**Long-term timeline:**
- Over multiple observations, a player's moment timeline becomes a **story**
- "First time I saw him: missed two chances but his movement was elite"
- "Second time: academy trial, composed, but something felt coached"
- "Third time: street football in the rain, and there it was — the real player"
- This IS the scouting narrative. It's YOUR story about THIS player.

### Feature 5: Hypothesis System (Expanded Gut Feelings)

**What changes:** Gut feelings become investigative prompts, not just flavor text.

**How it works:**
- When a gut feeling triggers (during post-event reflection), it creates a **hypothesis**
- Example hypotheses:
  - "This player's vision is special — I need to see him in a structured match to confirm"
  - "His composure worries me — he's fine in low-pressure, but how does he handle a tournament?"
  - "The technique is raw but the ceiling could be exceptional — needs follow-up sessions"
  - "Something about his movement reminds me of [comparison player] — investigate"

**Hypothesis states:**
- `open` → Not yet tested
- `supported` → Subsequent observation provided evidence FOR
- `contradicted` → Subsequent observation provided evidence AGAINST
- `confirmed` → Multiple supporting observations (high confidence)
- `debunked` → Multiple contradicting observations

**Hypothesis resolution:**
- When the scout observes the player again, the system checks if the new observation's attribute readings support or contradict open hypotheses
- Scout gets notified: "Your hypothesis about his composure was SUPPORTED — he crumbled under tournament pressure"
- Or: "Your hypothesis was CONTRADICTED — he was composed and decisive under pressure. Your initial read may have been wrong."

**Meta-game:**
- Track hypothesis accuracy over time → builds into a "scout intuition" stat
- Scouts with high accuracy get more frequent, more specific gut feelings
- Scouts with low accuracy get vaguer, less reliable gut feelings (but can improve)

### Feature 6: The Comparison Bench

**What changes:** Instead of absolute ratings, scouts think in relative terms.

**How it works:**
- Scout maintains a **comparison bench** of up to 8 youth players
- During observation, scout can trigger a **quick comparison**: "How does this player's X compare to [bench player]'s X?"
- Result: `clearly better` | `slightly better` | `similar` | `slightly worse` | `clearly worse` | `can't tell yet`
- Comparisons are subjective — they're filtered through the scout's perception, not objective truth
- Two scouts watching the same player might compare differently

**Why this matters:**
- This is how real scouts think: "He's not as quick as the kid I saw in São Paulo, but his touch is better"
- Removes the "spreadsheet" feeling — you're not looking at numbers, you're forming opinions
- Creates personal investment: your bench IS your expertise

### Feature 7: Simulation-Only Mode (Quick Scout)

**For players who want to skip to results:**
- Toggle: "Attend event" (full observation) vs. "Send scout" (simulation only)
- Simulation mode works exactly like the current system — schedule, advance week, get results
- BUT: simulation mode gives **lower confidence readings** and **no flagged moments**
- The scout misses things when they're not personally present
- This is the tradeoff: speed vs. depth

**Hybrid mode:**
- "Quick scan" — attend the event but auto-advance phases, only stopping when something notable happens
- Gets ~70% of the full observation benefit in ~30% of the time
- Good for events where you're not sure if there's anyone worth watching

---

## Implementation Phases

### Phase 1: Youth Event Engine (Foundation)
**Scope:** Build the phase-based event generation for youth venues

- [ ] Create `src/engine/youth/eventEngine.ts` — generates phases and moments for youth events
- [ ] Create youth-specific moment types (distinct from first-team match events)
- [ ] Implement venue atmosphere system with dynamic properties
- [ ] Generate player moments based on venue type, weather, and player attributes
- [ ] Create moment quality system (how well a player performed in this moment)
- [ ] Wire into existing venue types (school, grassroots, street, academy, festival)

**Key types:**
```typescript
interface YouthEventPhase {
  phaseNumber: number;
  minuteStart: number;
  minuteEnd: number;
  moments: YouthMoment[];
  atmosphereEvent?: AtmosphereEvent;  // dynamic venue events
}

interface YouthMoment {
  playerId: string;
  momentType: YouthMomentType;  // 'technicalAction' | 'physicalTest' | 'mentalResponse' | 'tacticalDecision' | 'characterReveal'
  quality: number;              // 1-10
  attributesHinted: string[];   // which attributes this moment gives signal on
  description: string;          // narrative text
  detailedDescription: string;  // only visible when focused
  vagueDescription: string;     // visible when unfocused
  pressureContext: boolean;     // was this under pressure?
}
```

**Estimated effort:** ~2,000 lines across 3-4 new files

### Phase 2: Attention & Focus System
**Scope:** Build the token-based attention system

- [ ] Create `src/engine/youth/attention.ts` — focus token management
- [ ] Implement focus token allocation (3 per half, 6 total)
- [ ] Add lens warmup and fatigue mechanics
- [ ] Add lens switching cost
- [ ] Wire focus state into moment visibility (focused = detailed, unfocused = vague)
- [ ] Connect to existing perception engine for attribute reads

**Estimated effort:** ~800 lines, 1-2 new files + edits to existing perception

### Phase 3: Observation UI
**Scope:** Build the interactive observation screen

- [ ] Create `src/components/game/YouthObservation.tsx` — main observation screen
- [ ] Phase display with moment cards (similar concept to match phases but youth-specific)
- [ ] Focus selection UI — tap a player to spend a focus token
- [ ] Lens selector with warmup/fatigue indicators
- [ ] Moment flagging UI — quick tap to flag with reaction tag
- [ ] Atmosphere bar — shows current venue conditions and dynamic events
- [ ] Unfocused player rendering (vague, anonymous-feeling)
- [ ] Visual distinction between focused (clear, named, detailed) and unfocused (hazy, generic)

**Estimated effort:** ~1,500 lines, 3-4 new components

### Phase 4: Post-Event Reflection
**Scope:** Build the reflection and moment timeline system

- [ ] Create `src/components/game/YouthReflection.tsx` — post-event review screen
- [ ] Moment timeline view — chronological flagged moments with reaction tags
- [ ] Reaction editing — upgrade/downgrade tags after the fact
- [ ] Free-form note writing per observation
- [ ] Gut feeling trigger (fires during reflection based on what was observed)
- [ ] Summary generation — auto-generates observation summary from flagged moments

**Estimated effort:** ~800 lines, 2 new components

### Phase 5: Hypothesis System
**Scope:** Expand gut feelings into an investigative mechanic

- [ ] Create `src/engine/youth/hypothesis.ts` — hypothesis generation and tracking
- [ ] Hypothesis templates based on attribute domains and observation patterns
- [ ] State machine: open → supported/contradicted → confirmed/debunked
- [ ] Resolution logic — check new observations against open hypotheses
- [ ] Scout intuition tracking — accuracy over time
- [ ] UI: hypothesis tracker panel in YouthScoutingScreen

**Estimated effort:** ~600 lines, 1 new engine file + UI additions

### Phase 6: Comparison Bench
**Scope:** Relative assessment system

- [ ] Create `src/engine/youth/comparison.ts` — comparison bench logic
- [ ] Bench management (add/remove players, max 8)
- [ ] Quick comparison during observation — trigger from moment view
- [ ] Relative assessment output (better/similar/worse with uncertainty)
- [ ] UI: comparison panel and bench management screen

**Estimated effort:** ~500 lines, 1 new engine file + UI additions

### Phase 7: Integration & Polish
**Scope:** Wire everything together, add simulation-only fallback

- [ ] Connect observation engine to existing `processYouthVenueActivity` (observation mode vs. simulation mode)
- [ ] Add "attend event" vs. "send scout" toggle to activity scheduling
- [ ] Quick scan mode (auto-advance, stop on notable moments)
- [ ] Update gameStore with new observation actions
- [ ] Update YouthScoutingScreen with new observation data display
- [ ] Moment timeline persistence across multiple observations
- [ ] Update placement reports to incorporate flagged moments and hypotheses

**Estimated effort:** ~1,000 lines of integration work

---

## Total Estimated Scope

| Phase | New Lines | Files |
|-------|-----------|-------|
| 1. Youth Event Engine | ~2,000 | 3-4 new |
| 2. Attention System | ~800 | 1-2 new |
| 3. Observation UI | ~1,500 | 3-4 new |
| 4. Post-Event Reflection | ~800 | 2 new |
| 5. Hypothesis System | ~600 | 1 new + edits |
| 6. Comparison Bench | ~500 | 1 new + edits |
| 7. Integration | ~1,000 | edits across existing |
| **Total** | **~7,200** | **~12-15 new files** |

This is roughly a 7% increase to the codebase (7.2K on 105K). Not massive, but it transforms the core experience.

---

## What This Changes For The Player

### Before (Current)
```
Monday:    Schedule "School Match" for Wednesday
Wednesday: Activity executes (off-screen)
Friday:    Read inbox: "You observed 4 youth players.
           João Silva showed good pace (14±3)."
```

### After (With Observation Engine)
```
Monday:    Schedule "School Match" for Wednesday
Wednesday: ATTEND the school match

  Phase 1:  Kickoff. 8 players on the pitch.
            You don't know any of them yet.

  Phase 2:  A midfielder picks out a pass that
            splits the defence. You spend a focus
            token on him. His name is João Silva, 16.
            Lens: Technical.

  Phase 3:  João receives under pressure. First touch
            is clean. You flag the moment: "promising."
            Atmosphere: rain starts. Technical noise
            increases.

  Phase 4:  João misplaces a pass in the rain. You
            notice — his technique is fine, but his
            decision-making under weather pressure
            drops. You flag: "interesting."

  Phase 5:  A defender catches your eye — big, quick,
            reads the game. But you're out of focus
            tokens for this half. You make a mental
            note: come back for him.

  Half-time: 3 tokens refresh. You split focus:
             2 tokens on João, 1 on the defender.

  Phase 8:  João under pressure again — this time
            he's composed. Contradicts phase 4. Was
            the earlier mistake just the rain?

  Phase 10: The defender makes a last-ditch tackle.
            Leadership moment — he organizes the back
            line after. You flag: "promising."

  Post-match reflection:
    - João: 3 flagged moments. Technical reads:
      first touch (good, ±2), passing (mixed signals),
      composure (uncertain — need more data).
    - Gut feeling triggers: "João's passing is better
      than it looked today. I need to see him on a
      dry pitch to confirm."
    - Hypothesis created: "João's passing quality is
      weather-dependent. Test in controlled conditions."
    - The defender: only 1 phase of focus. Vague reads.
      Need to come back.

Friday:   You schedule a follow-up: João at an Academy
          Trial Day (dry, controlled, low noise). And
          you schedule a return to the school for the
          defender.
```

THAT is the scouting fantasy. That's what the game should feel like.

---

## Priority Recommendation

**Start with Phases 1-3.** That gives you:
- Interactive youth events (not background processing)
- Attention/focus choices during events
- A real observation UI

That alone transforms the experience. Phases 4-7 are enhancements that deepen it further, but the core shift happens in Phases 1-3.
