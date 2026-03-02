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
      "Travelling to other countries costs money, schedule slots, and time. Same-country travel is free; intercontinental trips cost up to 3,000 and take 2 slots.",
    searchText:
      "Travel costs vary based on the distance between your current location and your destination. Same country travel is free, costs 0 money, takes 0 extra schedule slots, and has no travel duration. Same continent travel costs 300-600, takes 1 schedule slot, and has a 1 week travel duration. Intercontinental travel to an adjacent continent costs 800-1500, takes 1 schedule slot, and has a 2 week travel duration. Intercontinental travel to a distant continent costs 1500-3000, takes 2 schedule slots, and has a 3 week travel duration. You must schedule travel before an away match. Travel occupies its own day slots the day before the match. Domestic travel within your home country is always free and instant. The slot cost represents how much of your weekly schedule the journey consumes. Two-slot international trips significantly reduce how much scouting you can do that week. Plan international scouting trips carefully by grouping multiple matches in the same region to maximise the value of expensive travel. Equipment upgrades in the Travel slot can reduce travel fatigue and costs.",
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
        <Subheading>Planning Tips</Subheading>
        <BulletList
          items={[
            "Domestic travel within your home country is always free and instant.",
            "Two-slot international trips significantly cut your scouting capacity for the week.",
            "Group multiple matches in the same region to maximise the value of expensive travel.",
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
    title: "Familiarity",
    category: "world-travel",
    order: 2,
    summary:
      "Familiarity (0-100) with a country affects your scouting accuracy there. It starts at 50 for your home country and grows through activities.",
    searchText:
      "Familiarity is a 0-100 rating for each country that represents how well you know its football culture, players, and leagues. Your home country starts at 50 familiarity. All other countries start at 0. Familiarity increases through specific events: writing a report on a player from that country gives +2, a successful outcome from a report gives +5, and building a contact in that country gives +3. There are four expertise levels: Novice at 0-24 familiarity, Intermediate at 25-49, Expert at 50-79, and Master at 80-100. Higher familiarity improves your scouting accuracy in that country. The regional accuracy bonus formula is 0.5 plus familiarity divided by 200, clamped between 0.5 and 1.5. This means at 0 familiarity you operate at 50% accuracy, at 50 familiarity you operate at 75% accuracy, and at 100 familiarity you operate at 100% accuracy with a bonus. The foreign scouting penalty is calculated as 0.3 multiplied by (1 minus familiarity divided by 100). This penalty is further reduced by your adaptability scout attribute divided by 40. At high familiarity the penalty approaches zero. At low familiarity in a distant country the penalty can make observations significantly noisier and less reliable. Building familiarity is a long-term investment. Focus on one or two target countries at a time rather than spreading yourself thin across the entire world.",
    content: (
      <SectionBlock>
        <Para>
          Familiarity is a <Tag color="emerald">0–100 rating</Tag> for each
          country that represents how well you know its football culture,
          players, and leagues. Your home country starts at 50; all others
          start at 0.
        </Para>
        <Subheading>Earning Familiarity</Subheading>
        <Table
          headers={["Event", "Familiarity Gained"]}
          rows={[
            ["Write a report on a player from that country", "+2"],
            ["Successful outcome from a report", "+5"],
            ["Build a contact in that country", "+3"],
          ]}
        />
        <Subheading>Expertise Levels</Subheading>
        <Table
          headers={["Level", "Familiarity Range"]}
          rows={[
            ["Novice", "0 – 24"],
            ["Intermediate", "25 – 49"],
            ["Expert", "50 – 79"],
            ["Master", "80 – 100"],
          ]}
        />
        <Subheading>Impact on Accuracy</Subheading>
        <Para>
          Higher familiarity improves scouting accuracy. At{" "}
          <Tag color="rose">0 familiarity</Tag> you operate at 50% accuracy.
          At <Tag color="amber">50 familiarity</Tag> you operate at 75%
          accuracy. At <Tag color="emerald">100 familiarity</Tag> you reach
          full accuracy with a bonus.
        </Para>
        <Para>
          The foreign scouting penalty is further reduced by your{" "}
          <Tag color="zinc">adaptability</Tag> scout attribute. High
          adaptability scouts suffer less from unfamiliar territory.
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
      "Permanent overseas presence through satellite offices reduces travel overhead and accelerates familiarity growth in target countries.",
    searchText:
      "International offices (also called satellite offices) provide a permanent scouting presence in a foreign country. They cost 8000 to set up and 1200 per month to maintain. Benefits include a 10% quality bonus to all scouting in that country, faster familiarity growth for stationed employees, up to 3 employees can be stationed at each office, and reduced need for repeated expensive international travel. International offices are most valuable in countries with strong talent pipelines. Brazil produces world-class attackers and creative midfielders. Argentina is known for technical players and strikers. France develops athletic and versatile players across all positions. Portugal is a gateway for Brazilian and African talent entering European football. West African countries like Nigeria, Ghana, Ivory Coast, and Senegal produce raw athletic talent that is often undervalued by the market. Opening an international office requires at least a Professional Office tier at your main headquarters. The setup cost is significant so ensure your agency finances are stable before expanding internationally. Consider combining international offices with the Regional Expert specialization to maximise the benefits. The Territory Mastery insight action can provide a temporary familiarity boost while you build toward a permanent office.",
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
            <>
              <Tag color="emerald">+10%</Tag> quality bonus to all scouting in
              that country.
            </>,
            "Faster familiarity growth for stationed employees.",
            "Up to 3 employees stationed at each office.",
            "Eliminates repeated expensive international travel costs.",
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
