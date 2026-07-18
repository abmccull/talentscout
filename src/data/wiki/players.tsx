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
      "Behavioral traits describe what players repeatedly do on the pitch. Different match situations and follow-up observations reveal how dependable those patterns are.",
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
      "Player careers develop through age, opportunity, environment, personality, form, and setbacks. Their ceiling remains uncertain until the career provides evidence.",
    searchText:
      "Development is uncertain. Young players usually have more room to grow, but playing time, coaching, club environment, personality, injuries, adaptation, and form shape what actually happens. Scouts should revisit prospects in different contexts, preserve projections, and compare those calls with observable career outcomes. Market value reflects age, role, contract, club context, demand, reputation, and recent performance rather than exposing hidden ability.",
    content: (
      <SectionBlock>
        <Para>
          Development is a career story, not a number the scout is entitled to
          see. Your reports preserve an estimated current level, a potential
          range, confidence, risks, and the environment in which that projection
          might succeed. Later evidence can validate, complicate, or overturn it.
        </Para>

        <Subheading>Development Profiles</Subheading>
        <Table
          headers={["Observed pattern", "What it can mean", "Scouting response"]}
          rows={[
            ["Steady progress", "The environment and workload may be working", "Keep a longitudinal baseline"],
            ["Fast early rise", "Real growth or temporary physical advantage", "Test against older and stronger opposition"],
            ["Late acceleration", "Opportunity, role, or maturity changed", "Revisit old dismissals"],
            ["Surges and plateaus", "Form, confidence, minutes, or adaptation may be interacting", "Change context before changing conviction"],
          ]}
        />

        <Subheading>Evidence by Career Stage</Subheading>
        <Table
          headers={["Stage", "Useful evidence", "Main uncertainty"]}
          rows={[
            ["Academy", "Learning speed, movement, character, physical trajectory", "Competition quality and maturity"],
            ["Emerging senior", "Role fit, minutes, adaptation, repeat performance", "Whether opportunity becomes consistency"],
            ["Prime years", "Reliability, tactical value, availability, price", "Fit and decline risk"],
            ["Veteran", "Role change, leadership, physical trend, workload", "How quickly the floor may fall"],
          ]}
        />

        <Subheading>Labels Are Claims, Not Truth</Subheading>
        <Para>
          Terms such as <Tag color="amber">high upside</Tag>, wonderkid, or
          future international describe a projection or later public status.
          They never reveal an engine rating. Record who made the claim, what
          evidence supported it, and how confident you were.
        </Para>

        <Subheading>Market Value</Subheading>
        <Para>
          Market value is public context, not proof of quality. Age, contract,
          position, club leverage, demand, reputation, recent form, and perceived
          potential all move the price. Look for disagreements between your
          evidence and the market, then ask why the gap exists.
        </Para>

        <GridCards>
          <InfoCard title="Environment Matters" color="amber">
            Coaching quality, playing time, tactical role, competition level,
            adaptation, and injuries can turn the same projection into very
            different careers.
          </InfoCard>
          <InfoCard title="Form Effect" color="blue">
            Hot streaks attract attention and poor runs suppress confidence.
            Observe across time and contexts before treating either as ability.
          </InfoCard>
        </GridCards>

        <Subheading>Questions Worth Preserving</Subheading>
        <BulletList
          items={[
            "Is progress coming from the player, the role, or weaker opposition?",
            "Does the current club provide the minutes and coaching this player needs?",
            "Which risk would most change this projection?",
            "When should the case be revisited, and in what context?",
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
