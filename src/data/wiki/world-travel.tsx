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

// ─── World & Travel ─────────────────────────────────────────────────────────

export const worldTravelArticles: WikiArticle[] = [
  // ── Countries & Leagues ─────────────────────────────────────────────────
  {
    slug: "countries-leagues",
    title: "Countries & Leagues",
    category: "world-travel",
    order: 0,
    summary:
      "The game world spans 50 countries across 6 continents, each with its own league, talent profile, and scouting opportunities.",
    searchText:
      "The game world spans 50 countries across 6 continents. Europe has 24 countries including England, Spain, Germany, France, Italy, Portugal, Netherlands, Belgium, Turkey, Russia, Ukraine, Scotland, Austria, Switzerland, Czech Republic, Poland, Denmark, Sweden, Norway, Croatia, Serbia, Greece, Romania, and Hungary. South America has 10 countries: Brazil, Argentina, Colombia, Uruguay, Chile, Paraguay, Ecuador, Peru, Bolivia, and Venezuela. North America has 3 countries: Mexico, United States, and Canada. Africa has 7 countries: Nigeria, Ghana, Ivory Coast, Cameroon, Senegal, Egypt, and South Africa. Asia has 4 countries: Japan, South Korea, China, and Saudi Arabia. Oceania has 2 countries: Australia and New Zealand. Each country has a league system with clubs that generate and develop players. Stronger leagues produce more high-ability players and attract transfers from weaker leagues. Your home country starts with 50 familiarity while all other countries start at 0. Scouting in unfamiliar countries is less effective due to the foreign scouting penalty. Building familiarity through visits, reports, and contacts improves your effectiveness in each country over time.",
    content: (
      <SectionBlock>
        <Para>
          The game world spans <Tag color="emerald">50 countries</Tag> across 6
          continents. Each country has a league system with clubs that generate
          and develop players.
        </Para>
        <Table
          headers={["Continent", "Countries", "Count"]}
          rows={[
            [
              "Europe",
              "England, Spain, Germany, France, Italy, Portugal, Netherlands, Belgium, Turkey, and 15 more",
              "24",
            ],
            [
              "South America",
              "Brazil, Argentina, Colombia, Uruguay, Chile, Paraguay, Ecuador, Peru, Bolivia, Venezuela",
              "10",
            ],
            [
              "North America",
              "Mexico, United States, Canada",
              "3",
            ],
            [
              "Africa",
              "Nigeria, Ghana, Ivory Coast, Cameroon, Senegal, Egypt, South Africa",
              "7",
            ],
            [
              "Asia",
              "Japan, South Korea, China, Saudi Arabia",
              "4",
            ],
            [
              "Oceania",
              "Australia, New Zealand",
              "2",
            ],
          ]}
        />
        <Para>
          Stronger leagues produce more high-ability players and attract
          transfers from weaker leagues. Your home country starts with{" "}
          <Tag color="blue">50 familiarity</Tag> while all other countries
          start at 0.
        </Para>
        <InfoCard title="Foreign Scouting Penalty" color="amber">
          Scouting in unfamiliar countries is less effective. Build familiarity
          through visits, reports, and contacts to improve your effectiveness
          over time.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "travel-system",
      "familiarity",
      "international-offices",
      "transfer-windows",
    ],
    tags: [
      "countries",
      "leagues",
      "continents",
      "world",
      "europe",
      "south-america",
      "africa",
    ],
  },

  // ── Travel System ───────────────────────────────────────────────────────
  {
    slug: "travel-system",
    title: "Travel System",
    category: "world-travel",
    order: 1,
    summary:
      "Travelling costs money, schedule capacity, and time. Established regional presence can reduce the burden without making distant work free.",
    searchText:
      "Travel costs vary with the route from your permanent home base. Same-country travel is free and instant; distant international trips cost more money, schedule capacity, and time. Regional knowledge, trusted local contacts, and a staffed satellite office can reduce route cost and fatigue. A staffed office can also shorten a long journey and recover schedule capacity. Equipment reductions are applied alongside these regional effects, and the booking screen shows the final quote before you commit. Plan international work by grouping assignments and observations in countries where you are building a durable presence.",
    content: (
      <SectionBlock>
        <Para>
          Travel costs vary based on the distance between your current location
          and your destination. You must schedule travel before an away match —
          it occupies its own day-slot(s).
        </Para>
        <Table
          headers={["Distance", "Cost", "Slots Used", "Duration"]}
          rows={[
            ["Same country", "Free", "0", "Instant"],
            ["Same continent", "$300 – $600", "1 slot", "1 week"],
            ["Adjacent continent", "$800 – $1,500", "1 slot", "2 weeks"],
            ["Distant continent", "$1,500 – $3,000", "2 slots", "3 weeks"],
          ]}
        />
        <InfoCard title="Regional Routes" color="blue">
          Your home base remains fixed even when another country becomes more
          familiar. Knowledge and trusted contacts reduce travel overhead, while
          a staffed satellite office can also reduce journey time and recover a
          schedule slot on long routes. The booking card always shows the final
          cost and capacity before you confirm.
        </InfoCard>
        <Subheading>Planning Tips</Subheading>
        <BulletList
          items={[
            "Domestic travel within your home country is always free and instant.",
            "Two-slot international trips significantly cut your scouting capacity for the week.",
            "Group multiple matches in the same region to maximise the value of expensive travel.",
            "Build contacts and staff an office to make a recurring route more efficient.",
            "Equipment upgrades in the Travel slot can reduce travel fatigue and costs.",
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "countries-leagues",
      "familiarity",
      "scheduling-your-week",
      "fatigue",
      "expenses-overview",
    ],
    tags: ["travel", "cost", "slots", "international", "domestic", "distance"],
  },

  // ── Familiarity ─────────────────────────────────────────────────────────
  {
    slug: "familiarity",
    title: "Regional Knowledge & Presence",
    category: "world-travel",
    order: 2,
    summary:
      "Regional knowledge, contacts, travel, and infrastructure shape your reach and how firmly local reads land.",
    searchText:
      "Regional knowledge reflects how well you understand a country's football environment. Visits, observations, reports, relationships, and maintained local infrastructure build it over time. Knowledge is one source of operational presence alongside your home base, current location, trusted contacts, satellite offices, and assigned staff. Stronger presence expands the prospect pool you can reach, improves the confidence of contextual evidence, creates more relevant local opportunities, and reduces travel friction. It never reveals a player's hidden true ability. The country dossier explains your current access tier and why your read carries more or less local weight.",
    content: (
      <SectionBlock>
        <Para>
          Regional knowledge is your running feel for each country. It reflects
          how well you understand the football culture, players, and
          competitions there. Your home country starts with an advantage;
          foreign markets must be learned through work and relationships.
        </Para>
        <Subheading>Building Knowledge and Presence</Subheading>
        <BulletList
          items={[
            "Observe players and complete assignments in the country.",
            "Develop trusted local contacts who can provide access and context.",
            "Open and staff a satellite office for durable weekly coverage.",
            "Delegate employees or scouts when your own calendar is committed elsewhere.",
          ]}
        />
        <Subheading>Knowledge Levels</Subheading>
        <Table
          headers={["Level", "What it means"]}
          rows={[
            ["Novice", "First foothold with limited local feel."],
            ["Connected", "Usable context, but you still need confirmation."],
            ["Established", "Reliable routes, contacts, and sharper local reads."],
            ["Embedded", "The market feels familiar and your instincts travel well."],
          ]}
        />
        <Subheading>Impact on Scouting</Subheading>
        <Para>
          Stronger operational presence helps you reach more prospects, adds
          confidence to local context and statistical evidence, and increases
          the flow of relevant opportunities. Observation dossiers preserve the
          country, access tier, and reason for that confidence.
        </Para>
        <Para>
          Presence improves the quality of evidence available to your scout; it
          does not reveal hidden ratings or guarantee that your interpretation
          is correct. Different contexts and repeated observations still matter.
        </Para>
        <InfoCard title="Strategy" color="blue">
          Building familiarity is a long-term investment. Focus on one or two
          target countries at a time rather than spreading yourself thin across
          the entire world.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "countries-leagues",
      "travel-system",
      "international-offices",
      "satellite-offices",
      "activity-quality",
    ],
    tags: [
      "familiarity",
      "accuracy",
      "expertise",
      "regional",
      "penalty",
      "adaptability",
    ],
  },

  // ── International Offices ───────────────────────────────────────────────
  {
    slug: "international-offices",
    title: "International Offices",
    category: "world-travel",
    order: 3,
    summary:
      "A staffed satellite office creates durable overseas access, evidence, opportunity, travel, and knowledge advantages.",
    searchText:
      "International offices, also called satellite offices, provide a permanent scouting foothold in another country. They cost 8000 to establish and 1200 per month to maintain, and can hold up to three employees. An empty office establishes a foothold, but assigned staff unlock its strongest route-planning and evidence benefits. Offices and staff add passive regional knowledge, expand discovery access, improve contextual and data confidence, increase the flow of local leads, and reduce travel cost and fatigue. A staffed office can also shorten a long route and recover a planning slot. Opening an office requires at least a Professional Office tier, and duplicate or unsupported offices are blocked.",
    content: (
      <SectionBlock>
        <Para>
          International offices provide a permanent scouting presence in a
          foreign country, reducing travel overhead and accelerating your
          familiarity growth.
        </Para>
        <Subheading>Benefits</Subheading>
        <BulletList
          items={[
            "Broader local discovery and stronger contextual evidence.",
            "More local leads and passive regional knowledge each week.",
            "Up to 3 employees stationed at each office.",
            "Lower route cost and fatigue, with stronger planning benefits once staffed.",
          ]}
        />
        <Subheading>High-Value Targets</Subheading>
        <GridCards>
          <InfoCard title="Brazil" color="emerald">
            World-class attackers and creative midfielders. Enormous talent
            pool.
          </InfoCard>
          <InfoCard title="Argentina" color="emerald">
            Technical players and strikers. Strong youth development culture.
          </InfoCard>
          <InfoCard title="France" color="blue">
            Athletic, versatile players across all positions. Gateway to
            European football.
          </InfoCard>
          <InfoCard title="West Africa" color="amber">
            Nigeria, Ghana, Ivory Coast, Senegal — raw athletic talent often
            undervalued by the market.
          </InfoCard>
        </GridCards>
        <InfoCard title="Requirements" color="amber">
          Opening an international office requires at least a Professional
          Office tier. Ensure your agency finances are stable before expanding.
          Consider combining with the Regional Expert specialization for maximum
          effectiveness.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "satellite-offices",
      "countries-leagues",
      "familiarity",
      "travel-system",
      "agency-overview",
      "agency-employees",
    ],
    tags: [
      "international",
      "office",
      "satellite",
      "expansion",
      "brazil",
      "talent",
    ],
  },
];
