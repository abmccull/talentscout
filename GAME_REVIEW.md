# Talent Scout — Game Review & Design Documentation

## Overview

**Talent Scout** is a football (soccer) scouting simulation game. The player assumes the role of a professional football talent scout tasked with discovering, evaluating, and recruiting young players from leagues around the world. The game emphasizes information asymmetry, resource management, and decision-making under uncertainty — your scouts' skill levels determine how accurately they can assess a player's true ability, meaning you're always making judgments with imperfect data.

The backend is built on **Supabase** (PostgreSQL + Edge Functions) using **TypeScript/Deno** for serverless logic and **PLpgSQL** for database schema, triggers, and security policies.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Database | PostgreSQL (via Supabase) |
| Backend Functions | Supabase Edge Functions (Deno/TypeScript) |
| Auth | Supabase Auth (email/password) |
| Data Format | JSONB for flexible game state storage |
| Security | Row Level Security (RLS) policies on all tables |

---

## Core Game Loop

The intended game loop, as reconstructed from the database schema and backend logic, follows this cycle:

```
┌─────────────────────────────────────────────────────────┐
│                    START NEW GAME                        │
│         Create profile → Initialize game state          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│               1. HIRE / MANAGE SCOUTS                   │
│  Browse available scouts → Evaluate skills & salary →   │
│  Hire scouts within budget constraints                  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              2. CHOOSE REGION & MATCHES                 │
│  Select a region (England, Spain, Germany, Italy,       │
│  France, Brazil, Argentina) → Browse available          │
│  matches → Spend ACTION POINTS to attend matches        │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                3. SCOUT PLAYERS                         │
│  At each match, discover players → Receive scouting     │
│  reports filtered through scout accuracy → Evaluate     │
│  perceived attributes vs. potential (with uncertainty)  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│            4. EVALUATE & MAKE DECISIONS                 │
│  Review scouting reports → Assess confidence levels →   │
│  Decide which players to pursue → Manage resources      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│               5. SAVE & CONTINUE                        │
│  Auto-save or manual save → Return to step 1            │
│  (hire better scouts, explore new regions, etc.)        │
└─────────────────────────────────────────────────────────┘
```

### Loop Summary

Each iteration of the loop involves: **managing your scouting staff → selecting where to deploy them → interpreting imperfect intelligence → making recruitment decisions under uncertainty → improving your operation**.

---

## Feature Breakdown

### 1. Authentication & User Management

**Implementation:** `supabase/functions/auth/index.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `signup` | POST | Register with email, password, username, display name |
| `signin` | POST | Login; returns user, profile, and session |
| `signout` | POST | End session |
| `user` | GET | Fetch current user and profile |
| `reset-password` | POST | Send password reset email |

**How it works:** When a new user registers, a PostgreSQL trigger (`handle_new_user`) automatically creates their `profiles` row and initializes `user_settings` with defaults (`theme: light`, `notifications: true`, `sound: true`). This ensures every authenticated user has a complete data record from the moment they sign up.

**Constraints:**
- Usernames must be 3-30 characters (enforced at DB level)
- Emails validated via regex constraint
- Usernames must be unique

---

### 2. Player Generation System

**Implementation:** `supabase/functions/players/index.ts`

This is the heart of the game. Players (football athletes) are procedurally generated with the following subsystems:

#### 2a. Name Generation

Region-specific first and last name pools for 7 regions:
- **England:** Harry Smith, Jack Williams, Thomas Davies, etc.
- **Spain:** Javier Garcia, Carlos Rodriguez, Antonio Fernandez, etc.
- **Germany:** Hans Müller, Thomas Schmidt, Franz Schneider, etc.
- **Italy:** Marco Rossi, Antonio Russo, Giuseppe Ferrari, etc.
- **France:** Jean Martin, Antoine Bernard, Pierre Dubois, etc.
- **Brazil:** Carlos Silva, Rafael Santos, Gustavo Oliveira, etc.
- **Argentina:** Lionel Gonzalez, Diego Rodriguez, Sergio Fernandez, etc.

Falls back to English names for unrecognized regions.

#### 2b. Age Distribution (Weighted Toward Youth)

| Age Range | Probability | Design Intent |
|-----------|-------------|---------------|
| 16-19 | 40% | Core scouting targets — raw talent with maximum development ceiling |
| 20-23 | 30% | Emerging players entering their development prime |
| 24-27 | 20% | Prime-age players — lower upside but more reliable |
| 28-35 | 10% | Experienced veterans — limited development potential |

This weighting reflects the game's scouting theme: the valuable finds are the young unknowns with high ceilings, not established veterans.

#### 2c. Positions (13 Total)

```
GK                          ← Goalkeeper
CB, RB, LB                  ← Defenders
CDM, CM, CAM, RM, LM        ← Midfielders
RW, LW, ST, CF              ← Forwards
```

#### 2d. Attribute System

Three attribute categories on a **1-10 scale**:

| Attribute | Description |
|-----------|-------------|
| **Technical** | Ball control, passing, shooting, dribbling |
| **Physical** | Speed, strength, stamina, agility |
| **Mental** | Decision-making, positioning, composure, vision |

**Position-specific boosts** adjust the base range (3-9) to reflect realistic position demands:

| Position | Technical | Physical | Mental |
|----------|-----------|----------|--------|
| GK | +0 | +1 | +1 |
| CB | +0 | +2 | +0 |
| RB/LB | +1 | +1 | +0 |
| CDM | +1 | +1 | +1 |
| CM | +2 | +0 | +1 |
| CAM | +3 | -1 | +1 |
| RM/LM | +2 | +1 | +0 |
| RW/LW | +2 | +1 | +0 |
| ST | +2 | +1 | +0 |
| CF | +3 | +0 | +0 |

#### 2e. Potential System

- Base range: 5-9
- **Age factor**: Younger players have higher potential ceilings. A 16-year-old has full ceiling (ageFactor = 1.0); a 30-year-old has reduced ceiling (ageFactor ≈ 0.0), losing up to 3 points from max.
- **Scout assessment skill** narrows the accuracy of potential evaluation.

#### 2f. Scout Skill Impact on Player Discovery

Scouts have specialized knowledge skills that affect two things:

1. **Quality of players found** — Higher `talent_spotting` skill increases the maximum attribute cap (up to +3 bonus), meaning better scouts literally find better talent.
2. **Accuracy of attribute assessment** — Position-specific knowledge (e.g., `goalkeeper_knowledge`, `defender_knowledge`) narrows the error range in perceived vs. actual attributes.

---

### 3. Scouting Report System

This is the game's core information asymmetry mechanic. When a scout evaluates a player, the report includes **perceived** attributes and potential — not the true values.

#### Accuracy Model

| Factor | Base | Max Bonus | Cap |
|--------|------|-----------|-----|
| Attribute accuracy | 70% | +15% (talent spotting) + 15% (position knowledge) | 95% |
| Potential accuracy | 70% | +20% (potential assessment) + 10% (talent spotting) | 95% |

#### Error Calculation

```
maxError = 10 - floor(accuracy * 10)    // 0 to 3 points
error = random(0..maxError) * random_sign(+1 or -1)
perceivedValue = clamp(trueValue + error, 1, 10)
```

At **70% base accuracy** (no scout skills): up to ±3 points of error on any attribute.
At **95% max accuracy** (elite scout): up to ±0-1 point of error.

#### Confidence Scores

Each report includes confidence percentages for attributes and potential, letting the player gauge how much to trust the data. A report with 72% attribute confidence and 85% potential confidence tells the player "the potential estimate is more reliable than the attribute breakdown."

#### Narrative Report Text

The system generates descriptive text based on perceived (not actual) values:

- **Age commentary**: "Very young player with time to develop" / "Experienced player with limited development potential"
- **Attribute commentary**: "Technically exceptional" / "Physically dominant" / "Mental aspects need work"
- **Position commentary**: "Strong defensive attributes" / "Technically gifted midfielder"
- **Potential commentary**: "Has world-class potential" / "Limited potential for future growth"

This means your scout can be *wrong* in the narrative too — a mediocre player might be described as "world-class potential" if the scout's assessment accuracy is low.

---

### 4. Match System

**Implementation:** Database schema only (`match_templates` and `generated_matches` tables). Edge functions not yet built.

**Intended design from schema:**

| Field | Type | Purpose |
|-------|------|---------|
| `home_team` / `away_team` | TEXT | The two teams playing |
| `location` | TEXT | Where the match takes place |
| `region_id` | TEXT | Geographic region (ties to player generation regions) |
| `date` | INTEGER | Game-world date (likely day counter) |
| `talent_probability` | FLOAT | Chance of discovering quality talent at this match |
| `action_point_cost` | INTEGER | Resource cost to attend this match |

**Match templates** define generation parameters per region:
- `team_level_range`: Quality range of teams in the match
- `talent_probability_range`: Min/max chance of finding talent
- `action_point_cost_range`: Min/max AP cost to attend

**Gameplay implication:** Players must choose which matches to attend based on a risk/reward tradeoff — higher talent probability matches may cost more action points, and different regions offer different player pools.

---

### 5. Scout Management

**Implementation:** Database schema only (`scout_templates` and `generated_scouts` tables). Edge functions not yet built.

**Intended design from schema:**

Scouts are themselves procedurally generated entities with:

| Field | Purpose |
|-------|---------|
| `name` | Scout's name |
| `nationality` | Scout's origin |
| `skills` | JSONB — specialized knowledge areas (goalkeeper, defender, midfielder, forward knowledge; talent spotting; potential assessment) |
| `salary` | Ongoing cost to employ the scout |
| `description` | Narrative description of the scout |

**Scout templates** define generation parameters:
- `skill_ranges`: Min/max for each skill category
- `salary_range`: Correlation between skill level and cost

**Gameplay implication:** Better scouts cost more but find better players and provide more accurate assessments. This creates a budget management layer — do you hire one elite scout or several mediocre ones to cover more ground?

---

### 6. Save/Load System

**Implementation:** `supabase/functions/saves/index.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `list` | GET | List all saves (id, name, version, is_auto_save, timestamps) |
| `create` | POST | Create new save or update existing auto-save |
| `update` | PUT/PATCH | Update specific save by ID |
| `delete` | DELETE | Delete a save |
| `get` | GET | Load a specific save by ID |

**Key behaviors:**
- **Auto-save deduplication**: When creating an auto-save, the system checks for an existing auto-save and updates it rather than creating duplicates.
- **Ownership verification**: All operations verify the save belongs to the requesting user before allowing modifications.
- **Flexible game state**: The `game_data` JSONB field stores the entire game state, allowing the schema to remain stable even as game features evolve.
- **Versioning**: Each save includes a `version` field for forward compatibility.

---

### 7. Security Model

**Row Level Security (RLS)** is enabled on every table:

| Table | Policy |
|-------|--------|
| `profiles` | Users can only view/insert/update their own profile |
| `saved_games` | Users can only CRUD their own saves |
| `user_settings` | Users can only view/insert/update their own settings |
| `player_templates` | Read-only for all authenticated users |
| `generated_players` | Read-only for all authenticated users |
| `scout_templates` | Read-only for all authenticated users |
| `generated_scouts` | Read-only for all authenticated users |
| `match_templates` | Read-only for all authenticated users |
| `generated_matches` | Read-only for all authenticated users |

Template and generated data are shared resources (read-only), while user-specific data is strictly isolated.

---

## How Gameplay Should Work (Reconstructed)

### Starting a New Game

1. User creates an account (email + username + display name)
2. Profile and default settings are auto-created via database trigger
3. Player begins with an initial budget and starting scout(s)
4. An empty game state is initialized and stored in `saved_games`

### A Typical Game Session

1. **Review your scouting staff** — Check your scouts' skills and salaries. You might have a scout with strong `defender_knowledge` (8/10) but weak `forward_knowledge` (3/10). Decide if you need to hire or replace anyone.

2. **Pick a region to scout** — Each region (England, Spain, Germany, Italy, France, Brazil, Argentina) has different player pools and match schedules. Brazilian and Argentine regions may yield more technically gifted players; English and German regions may produce more physically dominant ones.

3. **Select matches to attend** — Browse available matches in your chosen region. Each match has:
   - A **talent probability** (higher = better chance of finding gems)
   - An **action point cost** (your limited resource per turn/season)
   - You must balance attending high-value matches vs. conserving action points.

4. **Discover players** — At each match, the system generates players based on the region. Your scout evaluates them and produces scouting reports. The reports show *perceived* attributes and potential, not true values. The confidence percentage tells you how much to trust the numbers.

5. **Interpret the data** — A report might say a player has perceived technical ability of 8/10 with 75% confidence. The true value could be anywhere from 6 to 10. A better scout would narrow that range. You must decide: is this player worth pursuing based on incomplete information?

6. **Make decisions** — Based on your scouting reports, decide which players to recruit, which to pass on, and which to follow up on later. This likely involves committing budget resources.

7. **Advance the game** — Move to the next cycle/season. New matches become available, players age, and the cycle repeats.

8. **Save your progress** — Manual saves or auto-saves preserve your game state.

### The Strategic Layer

The game's depth comes from layered resource management:

- **Action Points**: Limited per cycle; determines how many matches you can attend
- **Budget/Salary**: Scouts cost ongoing salary; better scouts cost more
- **Information Quality**: Cheap scouts give unreliable data; expensive scouts give accurate data
- **Regional Specialization**: You can't scout everywhere at once — focus on regions where your scouts have expertise
- **Risk vs. Reward**: Young players (16-19) have the highest ceiling but the most uncertainty; older players are more of a known quantity but with less upside

---

## Code Review Observations

### Strengths

1. **Clean separation of concerns** — Database schema, edge functions, and auth are well-isolated.
2. **Robust security model** — RLS policies on every table with proper ownership checks in edge functions.
3. **Thoughtful game design** — The scout accuracy/confidence system creates genuine strategic depth through information asymmetry.
4. **Auto-save deduplication** — Smart handling that updates existing auto-saves rather than proliferating save entries.
5. **Weighted age distribution** — The 40/30/20/10 split creates a realistic scouting environment.
6. **Position-specific attribute generation** — Attributes make sense for each position (e.g., CAM gets +3 technical, -1 physical).

### Areas for Improvement

1. **Missing edge functions** — Scout generation/management, match generation/management, and simulation functions are referenced in the README but not yet implemented. The schema supports them, but the API endpoints don't exist yet.

2. **No INSERT policies for generated data** — The edge functions insert into `generated_players`, but RLS only has SELECT policies for authenticated users. The inserts would need to come through a service role key or additional INSERT policies need to be added.

3. **Duplicated boilerplate** — The Supabase client creation, error/success helpers, and response types are copy-pasted across all three edge functions. These should be extracted to a shared module.

4. **Limited name pools** — 7 first names and 7 last names per region yields only 49 possible names per region. This will produce noticeable repetition. The pools should be significantly larger.

5. **Flat attribute model** — Three aggregate attributes (technical, physical, mental) are quite coarse. Football Manager-style games typically use 15-30 granular attributes. The current model may feel too simplified for engaged players.

6. **Scout skill impact math** — The `scoutAdjustment` variable is calculated but never actually used in the attribute generation logic (it's assigned but not applied to `min`/`max`). This appears to be a bug.

7. **`talent_probability` not used in generation** — The match schema includes `talent_probability` but since match functions aren't built yet, there's no mechanism connecting match attendance to player discovery quality.

8. **Error status codes** — All errors return HTTP 400 regardless of type. Auth failures should return 401, not-found should return 404, etc.

9. **No rate limiting or abuse prevention** — The player generation endpoint could be called repeatedly to farm for high-attribute players. There should be action point validation or rate limiting tied to game state.

10. **`date` field is INTEGER** — The `generated_matches.date` field is an integer rather than a timestamp or date type. While this likely represents an in-game day counter, it should be documented. The naming could lead to confusion.

---

## Incomplete / Planned Features

Based on the schema and README, these features are designed but not yet implemented:

| Feature | Schema Ready | Edge Function | Status |
|---------|-------------|---------------|--------|
| Authentication | Yes | Yes | **Complete** |
| User Profiles | Yes | Yes (via auth) | **Complete** |
| Save/Load | Yes | Yes | **Complete** |
| User Settings | Yes | No | Schema only |
| Player Generation | Yes | Yes | **Complete** |
| Scout Generation | Yes | No | **Schema only** |
| Match Generation | Yes | No | **Schema only** |
| Simulation Engine | No | No | **Referenced in README, not implemented** |
| Frontend/UI | No | No | **No frontend repository found** |

---

## Summary

Talent Scout is a well-conceived football scouting simulation with a strong backend foundation. The core innovation is the **information asymmetry mechanic** — your scouts' skills determine how accurately they perceive player attributes and potential, forcing strategic decisions under uncertainty. The schema design is solid and forward-looking, with JSONB fields providing flexibility for evolving game state. The project is roughly 40% complete on the backend (3 of ~6 planned edge function modules) with no frontend yet built. The existing code is clean and functional, with the main gaps being missing edge functions for scouts/matches/simulation and the issues noted in the code review section.
