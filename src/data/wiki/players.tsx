import type { WikiArticle } from "@/components/game/wiki/wikiTypes";
import {
  SectionBlock,
  Para,
  Tag,
  Table,
  Subheading,
  BulletList,
  InfoCard,
  GridCards,
} from "./components";

// ─── Players & Attributes ───────────────────────────────────────────────────

export const playersArticles: WikiArticle[] = [
  // ── Player Attributes ────────────────────────────────────────────────────
  {
    slug: "player-attributes",
    title: "Player Attributes",
    category: "players",
    order: 0,
    summary:
      "Every player has 28 attributes across five domains: Technical, Physical, Mental, Tactical, and Hidden. All attributes use a 1-20 scale.",
    searchText:
      "Every player has 28 attributes across five domains. Technical attributes: First Touch, Passing, Shooting, Dribbling, Crossing, Heading, Tackling, Finishing. Physical attributes: Pace, Strength, Stamina, Agility, Jumping, Balance. Mental attributes: Composure, Positioning, Leadership, Decision Making, Work Rate, Anticipation, Vision. Tactical attributes: Off the Ball, Pressing, Defensive Awareness, Marking, Teamwork. Hidden attributes: Injury Proneness, Consistency, Big Game Temperament, Professionalism. All visible attributes use a 1-20 scale. Higher is better. Hidden attributes are generated around a midpoint of 10 with high variance and cannot be seen directly. They must be uncovered through observation and insight actions. Attribute generation is position-weighted. Strikers naturally have higher shooting and finishing. Centre-backs have higher tackling and heading. Position weight multipliers range from 0.1 to 1.8. Higher current ability produces attributes closer to their position ideal with less random deviation.",
    content: (
      <SectionBlock>
        <Para>
          Every player has <Tag color="emerald">28 attributes</Tag> distributed
          across five domains. All visible attributes use a{" "}
          <Tag color="amber">1-20 scale</Tag> where higher is always better.
        </Para>

        <Subheading>Technical (8 attributes)</Subheading>
        <Table
          headers={["Attribute", "Description"]}
          rows={[
            ["First Touch", "Quality of ball control on first contact"],
            ["Passing", "Short and long pass accuracy and weight"],
            ["Shooting", "Power and accuracy of shots from open play"],
            ["Dribbling", "Ball control while running and beating opponents"],
            ["Crossing", "Accuracy and quality of deliveries from wide areas"],
            ["Heading", "Aerial ability when attacking the ball"],
            ["Tackling", "Ability to win the ball in defensive challenges"],
            ["Finishing", "Composure and accuracy in goalscoring situations"],
          ]}
        />

        <Subheading>Physical (6 attributes)</Subheading>
        <Table
          headers={["Attribute", "Description"]}
          rows={[
            ["Pace", "Top speed and acceleration"],
            ["Strength", "Physical power in challenges and shielding"],
            ["Stamina", "Ability to maintain performance over 90 minutes"],
            ["Agility", "Quickness in turning and changing direction"],
            ["Jumping", "Vertical reach for aerial duels"],
            ["Balance", "Ability to stay on feet under pressure"],
          ]}
        />

        <Subheading>Mental (7 attributes)</Subheading>
        <Table
          headers={["Attribute", "Description"]}
          rows={[
            ["Composure", "Calmness under pressure in key moments"],
            ["Positioning", "Spatial awareness and finding good positions"],
            ["Leadership", "Ability to inspire and organise teammates"],
            ["Decision Making", "Quality of choices with and without the ball"],
            ["Work Rate", "Effort and willingness to track back or press"],
            ["Anticipation", "Reading the game and predicting play"],
            ["Vision", "Ability to spot passing opportunities others miss"],
          ]}
        />

        <Subheading>Tactical (5 attributes)</Subheading>
        <Table
          headers={["Attribute", "Description"]}
          rows={[
            ["Off the Ball", "Movement quality when not in possession"],
            ["Pressing", "Effectiveness of closing down opponents"],
            ["Defensive Awareness", "Understanding of defensive shape and duty"],
            ["Marking", "Ability to track and contain assigned opponents"],
            ["Teamwork", "Willingness to follow tactical instructions"],
          ]}
        />

        <Subheading>Hidden (4 attributes)</Subheading>
        <Para>
          Hidden attributes are generated around a midpoint of 10 with high
          variance (standard deviation of 4). They are never directly visible
          and must be uncovered through repeated observation or the{" "}
          <Tag color="blue">Hidden Nature</Tag> insight action.
        </Para>
        <Table
          headers={["Attribute", "Description"]}
          rows={[
            ["Injury Proneness", "Likelihood of picking up injuries"],
            ["Consistency", "How stable performance is week to week"],
            ["Big Game Temperament", "Performance modifier in important matches"],
            ["Professionalism", "Training attitude and off-pitch discipline"],
          ]}
        />

        <InfoCard title="Position Weighting" color="amber">
          Attribute generation is position-weighted. Strikers get up to 1.8x
          weight on shooting and 1.7x on finishing, while their tackling
          receives only 0.2x. This means a ST with current ability 120 will
          naturally have high shooting but low tackling. The standard deviation
          narrows as ability rises, producing more predictable profiles for
          elite players.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "player-roles",
      "personality-traits",
      "behavioral-markers",
      "perception-model",
      "focus-lenses",
    ],
    tags: [
      "attributes",
      "technical",
      "physical",
      "mental",
      "tactical",
      "hidden",
      "1-20 scale",
      "stats",
    ],
  },

  // ── Player Roles & Positions ─────────────────────────────────────────────
  {
    slug: "player-roles",
    title: "Player Roles & Positions",
    category: "players",
    order: 1,
    summary:
      "There are 11 positions and 25 tactical roles. Each role has key and secondary attributes, preferred traits, and available duties.",
    searchText:
      "There are 11 positions: GK, CB, LB, RB, CDM, CM, CAM, LW, RW, ST. Each position has 2-4 compatible tactical roles. There are 25 roles total. GK roles: Shot Stopper, Sweeper. CB roles: Ball-Playing Defender, No-Nonsense CB, Libero. LB/RB roles: Full Back, Wing Back, Inverted Full Back. CDM roles: Anchor Man, Half Back, Deep-Lying Playmaker. CM roles: Box-to-Box, Mezzala, Advanced Playmaker, Carrilero, Deep-Lying Playmaker. CAM roles: Enganche, Shadow Striker, Trequartista, Advanced Playmaker. LW/RW roles: Winger, Inverted Winger, Inside Forward. ST roles: Poacher, Target Man, Advanced Forward, Pressing Forward. Role suitability is calculated from weighted key attributes at 65% and secondary attributes at 35%. Matching preferred traits add plus 5 suitability. Conflicting traits subtract 5. Each role has available duties: Defend, Support, or Attack. A players natural role is the one with the highest suitability score at their primary position. Players can also have secondary positions. 40 percent chance of one secondary position assigned at generation.",
    content: (
      <SectionBlock>
        <Para>
          There are <Tag color="emerald">11 positions</Tag> and{" "}
          <Tag color="emerald">25 tactical roles</Tag>. Each position supports
          2-4 compatible roles. A player&apos;s natural role is the one with the
          highest calculated suitability at their primary position.
        </Para>

        <Subheading>Positions</Subheading>
        <Para>
          GK, CB, LB, RB, CDM, CM, CAM, LW, RW, ST. Players may also have one
          secondary position (40% chance at generation) drawn from a
          position-specific pool.
        </Para>

        <Subheading>Role List by Position</Subheading>
        <Table
          headers={["Position", "Available Roles"]}
          rows={[
            ["GK", "Shot Stopper, Sweeper"],
            ["CB", "Ball-Playing Defender, No-Nonsense CB, Libero"],
            ["LB / RB", "Full Back, Wing Back, Inverted Full Back"],
            ["CDM", "Anchor Man, Half Back, Deep-Lying Playmaker"],
            ["CM", "Box-to-Box, Mezzala, Adv. Playmaker, Carrilero, DLP"],
            ["CAM", "Enganche, Shadow Striker, Trequartista, Adv. Playmaker"],
            ["LW / RW", "Winger, Inverted Winger, Inside Forward"],
            ["ST", "Poacher, Target Man, Adv. Forward, Pressing Forward"],
          ]}
        />

        <Subheading>Suitability Calculation</Subheading>
        <Para>
          Role suitability is a 0-100 score computed from:{" "}
          <Tag color="zinc">65%</Tag> weighted average of key attributes +{" "}
          <Tag color="zinc">35%</Tag> weighted average of secondary attributes.
          Each matching preferred trait adds <Tag color="emerald">+5</Tag>, and
          each conflicting trait subtracts <Tag color="rose">-5</Tag>.
        </Para>

        <Subheading>Duties</Subheading>
        <Para>
          Each role supports one or more duties: Defend, Support, or Attack.
          Selecting the Attack duty adds +3 to suitability, while Defend
          subtracts -3. Duties affect the player&apos;s tactical behaviour during
          matches but do not change their underlying attributes.
        </Para>

        <InfoCard title="Secondary Positions" color="blue">
          Players have a 40% chance of being assigned one secondary position at
          generation. CB can play CDM, RB, or LB. CAM can play CM, ST, LW, or
          RW. Suitability at secondary positions may be lower due to different
          attribute priorities.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "player-attributes",
      "tactics-formations",
      "perception-model",
      "behavioral-markers",
    ],
    tags: [
      "roles",
      "positions",
      "tactics",
      "suitability",
      "duties",
      "formations",
    ],
  },

  // ── Personality Traits ───────────────────────────────────────────────────
  {
    slug: "personality-traits",
    title: "Personality Traits",
    category: "players",
    order: 2,
    summary:
      "Each player has 2-4 personality traits and a personality archetype that affect form volatility, transfer willingness, dressing room impact, and big-match performance.",
    searchText:
      "Each player receives 2 to 4 personality traits at generation. There are 16 possible traits: ambitious, loyal, professional, temperamental, determined, easygoing, leader, introvert, flair, controversial character, model citizen, pressure player, big game player, inconsistent, injury prone, late developer. Trait selection is weighted by position category (GK, DEF, MID, FWD) and development profile. Forwards are more likely to get ambitious and flair. Defenders lean toward determined and leader. Players also receive a personality archetype: leader, mercenary, homesick, ambitious, loyal, disruptive, introvert, professional, hothead, or clutch. Each archetype sets modifiers for transfer willingness 0 to 1, dressing room impact -3 to +3, form volatility 0 to 1, and big match modifier -2 to +2. Personality is hidden by default and must be discovered through observation. After 3 observations the archetype is revealed. After 5 observations all traits are visible. Scouts with high psychological read skill can reveal traits faster. The mental focus lens gives +5% reveal chance.",
    content: (
      <SectionBlock>
        <Para>
          Each player receives <Tag color="emerald">2-4 personality traits</Tag>{" "}
          and a <Tag color="amber">personality archetype</Tag> at generation.
          These hidden systems affect form, transfers, team chemistry, and
          big-match performance.
        </Para>

        <Subheading>The 16 Personality Traits</Subheading>
        <Table
          headers={["Trait", "Category"]}
          rows={[
            ["Ambitious", "Drive / Motivation"],
            ["Loyal", "Character"],
            ["Professional", "Work Ethic"],
            ["Temperamental", "Risk / Volatility"],
            ["Determined", "Drive / Motivation"],
            ["Easygoing", "Character"],
            ["Leader", "Leadership"],
            ["Introvert", "Character"],
            ["Flair", "Creativity"],
            ["Controversial Character", "Risk / Volatility"],
            ["Model Citizen", "Character"],
            ["Pressure Player", "Performance"],
            ["Big Game Player", "Performance"],
            ["Inconsistent", "Risk / Volatility"],
            ["Injury Prone", "Physical"],
            ["Late Developer", "Growth"],
          ]}
        />

        <Subheading>Trait Weighting</Subheading>
        <Para>
          Trait selection is weighted by position and development profile.
          Forwards are 2x more likely to get <Tag>ambitious</Tag> and 1.5x for{" "}
          <Tag>flair</Tag>. Defenders lean toward{" "}
          <Tag>determined</Tag> (2x) and <Tag>leader</Tag> (1.5x).
          Development profiles stack multiplicatively: a volatile player is
          2.5x more likely to be <Tag>inconsistent</Tag>.
        </Para>

        <Subheading>Personality Archetypes (10 Types)</Subheading>
        <Table
          headers={["Archetype", "Transfer Will.", "Form Vol.", "Big Match"]}
          rows={[
            ["Natural Leader", "0.30", "Low (0.3)", "+1"],
            ["Mercenary", "0.90", "Medium (0.5)", "0"],
            ["Homesick", "0.20", "High (0.6)", "-1"],
            ["Ambitious", "0.70", "Medium (0.4)", "+1"],
            ["One-Club Player", "0.15", "Low (0.25)", "0"],
            ["Disruptive", "0.60", "High (0.7)", "0"],
            ["Quiet Professional", "0.35", "Medium (0.35)", "-1"],
            ["Model Professional", "0.50", "Low (0.2)", "0"],
            ["Hothead", "0.55", "Very High (0.8)", "-1"],
            ["Big-Game Player", "0.40", "Medium (0.35)", "+2"],
          ]}
        />

        <Subheading>Discovery</Subheading>
        <BulletList
          items={[
            "Personality is fully hidden by default.",
            "After 3+ observations (or 2 with psych skill 15+): archetype revealed.",
            "After 5+ observations (or 4 with psych skill 18+): all traits visible.",
            "Each observation has a 15% + (psychSkill / 100) chance to reveal one trait.",
            "Using the Mental focus lens adds +5% reveal chance.",
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "player-attributes",
      "behavioral-markers",
      "player-development",
      "observation-modes",
    ],
    tags: [
      "personality",
      "traits",
      "archetype",
      "form",
      "transfer",
      "morale",
      "temperament",
      "character",
    ],
  },

  // ── Behavioral Markers ───────────────────────────────────────────────────
  {
    slug: "behavioral-markers",
    title: "Behavioral Markers",
    category: "players",
    order: 3,
    summary:
      "Behavioral traits describe what players do on the pitch. They are generated from attributes and discovered through match observation events.",
    searchText:
      "Behavioral traits are distinct from personality traits. They describe what a player does on the pitch: places shots, tries tricks, cuts inside, runs with ball, moves into channels, shoots from distance, tries killer balls, stays back, dives straight in, marks player tightly, dictates tempo, plays short passes, switches play to flank, plays one-twos, holds up ball, brings others into play, arrives late in box, plays with back to goal, drifts wide, drops deep. There are 20 behavioral traits total. Each player receives 2 to 4 traits at generation based on their attributes meeting minimum thresholds. For example places shots requires finishing and composure averaging at least 12. Traits have position biases giving 1.5x weight for favoured positions. Some traits conflict and cannot coexist: stays back conflicts with arrives late in box, cuts inside conflicts with drifts wide. Traits are discovered during match observation when matching events occur. The base reveal chance is 12% per matching event. Scouts with tactical understanding 12 or higher get an extra 5% chance. Trait-event affinities determine which match events can reveal which traits. Goals and shots can reveal places shots. Dribbles can reveal tries tricks and cuts inside.",
    content: (
      <SectionBlock>
        <Para>
          Behavioral traits describe <em>what a player does</em> on the pitch,
          distinct from personality traits which describe <em>who they are</em>.
          Each player has <Tag color="emerald">2-4 behavioral traits</Tag>{" "}
          generated at creation based on their attributes.
        </Para>

        <Subheading>Trait Categories</Subheading>
        <Table
          headers={["Category", "Traits"]}
          rows={[
            [
              "Attacking",
              "Places Shots, Tries Tricks, Cuts Inside, Runs with Ball, Moves into Channels, Shoots from Distance, Tries Killer Balls",
            ],
            [
              "Defensive",
              "Stays Back, Dives Straight In, Marks Player Tightly",
            ],
            [
              "Passing",
              "Dictates Tempo, Plays Short Passes, Switches Play to Flank, Plays One-Twos",
            ],
            [
              "Physical / Style",
              "Holds Up Ball, Brings Others into Play, Arrives Late in Box, Plays with Back to Goal",
            ],
            ["Positional", "Drifts Wide, Drops Deep"],
          ]}
        />

        <Subheading>Generation Rules</Subheading>
        <BulletList
          items={[
            "Each trait requires the player's relevant attributes to average above a minimum threshold (11-14 depending on trait).",
            "Favoured positions receive 1.5x weight; non-favoured positions still get 0.3x (rare but possible).",
            "Conflicting pairs cannot coexist: Stays Back vs Arrives Late in Box, Cuts Inside vs Drifts Wide, Drops Deep vs Moves into Channels.",
          ]}
        />

        <Subheading>Discovery During Matches</Subheading>
        <Para>
          Traits are revealed when the player performs a matching event type
          during an observed match. The base reveal chance is{" "}
          <Tag color="amber">12%</Tag> per matching event. Scouts with{" "}
          <Tag>Tactical Understanding 12+</Tag> gain an additional{" "}
          <Tag color="emerald">+5%</Tag> reveal chance.
        </Para>

        <Table
          headers={["Trait", "Revealing Events"]}
          rows={[
            ["Places Shots", "Goal, Shot"],
            ["Tries Tricks", "Dribble"],
            ["Cuts Inside", "Dribble, Shot, Goal"],
            ["Stays Back", "Tackle, Interception, Positioning"],
            ["Dictates Tempo", "Pass, Through Ball, Positioning"],
            ["Holds Up Ball", "Hold Up"],
            ["Drifts Wide", "Cross, Dribble"],
          ]}
        />

        <InfoCard title="Scouting Tip" color="emerald">
          Watch for patterns: if a winger consistently creates events during
          dribble moments, they likely have Tries Tricks or Runs with Ball. If a
          striker scores but rarely dribbles, they may be a Poacher with Places
          Shots and Moves into Channels.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "player-attributes",
      "personality-traits",
      "player-roles",
      "maximising-observations",
      "match-phases",
    ],
    tags: [
      "behavioral",
      "traits",
      "markers",
      "observation",
      "discovery",
      "match events",
    ],
  },

  // ── Player Development ───────────────────────────────────────────────────
  {
    slug: "player-development",
    title: "Player Development",
    category: "players",
    order: 4,
    summary:
      "Players grow based on development profiles, age curves, and the gap between current and potential ability. Wonderkid tiers classify young talent by ceiling.",
    searchText:
      "Player development is governed by current ability (CA, 1-200 scale), potential ability (PA, 1-200 scale), age, and development profile. Development profiles are: Steady Grower (50% of players, linear reliable growth), Early Bloomer (20%, fast initial development), Late Bloomer (20%, slow start then rapid improvement), Volatile (10%, unpredictable surges and plateaus). Potential ability is generated relative to current ability and age. Under 21: PA is CA plus 15-60 points. Age 21-23: PA is CA plus 5-35. Age 24-28: PA is CA plus 0-20. Age 29 plus: PA is only CA plus or minus a few points. Wonderkid tiers classify youth potential: Generational (PA 180 plus, under 21), World Class (PA 150-179, under 21), Quality Pro (PA 100-149, under 21), Journeyman (PA under 100 or age 21 plus). Market value uses a 5th power curve on CA divided by 200, multiplied by age factor, position multiplier, potential premium, and club reputation. Age factors: under 18 at 0.35x, 24-29 at 1.0x peak, over 33 at 0.12x. Strikers command 1.3x premium. GKs are valued at 0.75x. Form ranges from -3 to +3 and modifies value by -10% to +10%. Preferred foot distribution: 72% right, 20% left, 8% both footed.",
    content: (
      <SectionBlock>
        <Para>
          Every player has two hidden ability ratings: Current Ability (
          <Tag color="amber">CA, 1-200</Tag>) and Potential Ability (
          <Tag color="amber">PA, 1-200</Tag>). The gap between them represents
          room to grow. How quickly that gap closes depends on the player&apos;s
          age and development profile.
        </Para>

        <Subheading>Development Profiles</Subheading>
        <Table
          headers={["Profile", "Frequency", "Description"]}
          rows={[
            ["Steady Grower", "50%", "Linear, reliable progression over time"],
            [
              "Early Bloomer",
              "20%",
              "Rapid early development, may plateau sooner",
            ],
            [
              "Late Bloomer",
              "20%",
              "Slow start, then rapid improvement in mid-20s",
            ],
            [
              "Volatile",
              "10%",
              "Unpredictable surges and plateaus, high risk/reward",
            ],
          ]}
        />

        <Subheading>Potential Ability by Age</Subheading>
        <Table
          headers={["Age", "PA Range (above CA)"]}
          rows={[
            ["Under 21", "+15 to +60"],
            ["21-23", "+5 to +35"],
            ["24-28", "+0 to +20"],
            ["29+", "-5 to +10 (minimal growth)"],
          ]}
        />

        <Subheading>Wonderkid Tiers</Subheading>
        <Table
          headers={["Tier", "Requirement", "Significance"]}
          rows={[
            ["Generational", "PA 180+, age < 21", "Future world star"],
            ["World Class", "PA 150-179, age < 21", "International quality ceiling"],
            ["Quality Pro", "PA 100-149, age < 21", "Reliable top-flight regular"],
            ["Journeyman", "PA < 100 or age 21+", "Lower division / squad filler"],
          ]}
        />

        <Subheading>Market Value</Subheading>
        <Para>
          Market value follows a steep 5th-power curve: CA 50 is worth around
          195k, CA 100 around 6.25M, CA 150 around 47M, and CA 180 around
          118M. Age, position, potential premium, club reputation, and current
          form all modify the base figure. Strikers command a{" "}
          <Tag color="emerald">1.3x</Tag> premium while goalkeepers are valued
          at <Tag color="zinc">0.75x</Tag>.
        </Para>

        <GridCards>
          <InfoCard title="Age Curve" color="amber">
            Under 18: 0.35x value. 21-23: 0.8x. 24-29: full 1.0x. 30-31:
            drops to 0.6x. Over 33: just 0.12x of base value.
          </InfoCard>
          <InfoCard title="Form Effect" color="blue">
            Form ranges from -3 to +3 and modifies market value by -10% to
            +10%. Hot streaks inflate value; poor runs deflate it.
          </InfoCard>
        </GridCards>

        <Subheading>Other Generation Details</Subheading>
        <BulletList
          items={[
            "Preferred foot: 72% right, 20% left, 8% both",
            "Starting morale: random 5-8",
            "Form starts at 0 (neutral)",
            "Squad sizes: 22-28 players per club",
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "player-attributes",
      "player-roles",
      "personality-traits",
      "conviction-levels",
      "youth-scout-spec",
    ],
    tags: [
      "development",
      "potential",
      "wonderkid",
      "growth",
      "age curve",
      "market value",
      "current ability",
      "potential ability",
    ],
  },
];
