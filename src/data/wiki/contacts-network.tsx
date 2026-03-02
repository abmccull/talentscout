import type { WikiArticle } from "@/components/game/wiki/wikiTypes";
import {
  SectionBlock,
  Para,
  Tag,
  Table,
  BulletList,
  Subheading,
} from "./components";

// ─── Contacts & Network ─────────────────────────────────────────────────────

export const contactsNetworkArticles: WikiArticle[] = [
  // ── Contact Types ───────────────────────────────────────────────────────────
  {
    slug: "contact-types",
    title: "Contact Types",
    category: "contacts-network",
    order: 0,
    summary:
      "Overview of all 11 contact types and the categories of intelligence each provides.",
    searchText:
      "Contact Types. Your network is built from contacts of different types. Each type provides different categories of intelligence. Agent provides transfer availability, wage demands, player ambitions. Scout provides cross-region leads, secondary opinions on players. Club Staff provides training ground access, injury news, morale information. Journalist provides transfer rumours, club finance news, squad dynamics. Academy Coach provides youth talent tips, development progress, unsigned prospects. Sporting Director provides club transfer priorities, budget information, shortlist intel. Grassroots Organizer provides unsigned youth sightings, local tournament schedules. School Coach provides very young prospects under 14, community talent leads. Youth Agent provides unsigned youth with representation, early PA hints. Academy Director provides formal youth intake information, trial day access. Local Scout provides regional coverage in areas you cannot personally attend.",
    content: (
      <SectionBlock>
        <Para>
          Your network is built from contacts of different types. Each type
          provides different categories of intelligence.
        </Para>
        <Table
          headers={["Type", "Intel Provided"]}
          rows={[
            [
              "Agent",
              "Transfer availability, wage demands, player ambitions",
            ],
            [
              "Scout",
              "Cross-region leads, secondary opinions on players",
            ],
            [
              "Club Staff",
              "Training ground access, injury news, morale information",
            ],
            [
              "Journalist",
              "Transfer rumours, club finance news, squad dynamics",
            ],
            [
              "Academy Coach",
              "Youth talent tips, development progress, unsigned prospects",
            ],
            [
              "Sporting Director",
              "Club transfer priorities, budget information, shortlist intel",
            ],
            [
              "Grassroots Organizer",
              "Unsigned youth sightings, local tournament schedules",
            ],
            [
              "School Coach",
              "Very young prospects (under 14), community talent leads",
            ],
            [
              "Youth Agent",
              "Unsigned youth with representation, early PA hints",
            ],
            [
              "Academy Director",
              "Formal youth intake information, trial day access",
            ],
            [
              "Local Scout",
              "Regional coverage in areas you cannot personally attend",
            ],
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "relationship-building",
      "intel-reliability",
      "gossip-intel",
      "regional-expert-spec",
      "unsigned-youth",
    ],
    tags: [
      "contacts",
      "agent",
      "scout",
      "journalist",
      "academy",
      "network",
      "intel",
      "types",
    ],
  },

  // ── Relationship Building ───────────────────────────────────────────────────
  {
    slug: "relationship-building",
    title: "Relationship Building",
    category: "contacts-network",
    order: 1,
    summary:
      "How to build and maintain contact relationships from 0 to 100, including decay and the networking attribute.",
    searchText:
      "Relationship Building. Each contact has a relationship score (0-100). Higher relationship means more candid intel and willingness to share sensitive information. Relationships are built through: Network Meeting activities. Providing useful intel back to the contact. Acting on tips they provide (following up with visits). Specialization perks (e.g. Regional Expert's Local Network perk). Network equipment bonuses. Relationships decay slowly over time if you do not maintain them. The networking scout attribute speeds up relationship gain per meeting.",
    content: (
      <SectionBlock>
        <Para>
          Each contact has a relationship score (0{"\u2013"}100). Higher
          relationship means more candid intel and willingness to share sensitive
          information. Relationships are built through:
        </Para>
        <BulletList
          items={[
            "Network Meeting activities",
            "Providing useful intel back to the contact",
            "Acting on tips they provide (following up with visits)",
            <>
              Specialization perks (e.g. Regional Expert&apos;s Local Network
              perk)
            </>,
            "Network equipment bonuses",
          ]}
        />
        <Para>
          Relationships decay slowly over time if you do not maintain them. The{" "}
          <Tag color="zinc">networking</Tag> scout attribute speeds up
          relationship gain per meeting.
        </Para>
      </SectionBlock>
    ),
    related: [
      "contact-types",
      "intel-reliability",
      "gossip-intel",
      "travel-network-analysis-equipment",
      "regional-expert-spec",
    ],
    tags: [
      "relationship",
      "networking",
      "decay",
      "meetings",
      "score",
      "contacts",
    ],
  },

  // ── Intel Reliability ───────────────────────────────────────────────────────
  {
    slug: "intel-reliability",
    title: "Intel Reliability",
    category: "contacts-network",
    order: 2,
    summary:
      "How each contact has a hidden reliability rating that is gradually revealed through interactions.",
    searchText:
      "Intel Reliability. Each contact also has a hidden reliability rating (0-100) that you discover over time. High-reliability contacts share accurate intel. Low-reliability contacts may pass on rumours or deliberately misleading information. Reliability is revealed gradually through repeated interactions. When a contact's tip proves accurate after you follow it up, their reliability estimate improves. Network equipment and the Scout CRM subscription boost intel reliability across all contacts.",
    content: (
      <SectionBlock>
        <Para>
          Each contact also has a hidden reliability rating (0{"\u2013"}100)
          that you discover over time. High-reliability contacts share accurate
          intel. Low-reliability contacts may pass on rumours or deliberately
          misleading information.
        </Para>
        <Para>
          Reliability is revealed gradually through repeated interactions{" "}
          {"\u2014"} when a contact&apos;s tip proves accurate after you follow
          it up, their reliability estimate improves. Network equipment and the
          Scout CRM subscription boost intel reliability across all contacts.
        </Para>
      </SectionBlock>
    ),
    related: [
      "contact-types",
      "relationship-building",
      "gossip-intel",
      "travel-network-analysis-equipment",
    ],
    tags: [
      "reliability",
      "intel",
      "accuracy",
      "contacts",
      "CRM",
      "hidden",
      "rating",
    ],
  },

  // ── Gossip & Actionable Intel ───────────────────────────────────────────────
  {
    slug: "gossip-intel",
    title: "Gossip & Actionable Intel",
    category: "contacts-network",
    order: 3,
    summary:
      "How contacts share gossip during meetings, different intel types, reliability filtering, and acting on tips.",
    searchText:
      "Gossip and Actionable Intel. During network meetings, contacts may share gossip alongside standard relationship gains. Gossip comes in several forms: transfer rumours about players becoming available or clubs preparing bids, injury whispers about unreported knocks or fitness concerns that could affect a player's value, squad unrest indicating dressing room problems, contract disputes, or players angling for a move, and youth sightings where contacts tip you off about promising unsigned youngsters in the area. The accuracy of gossip is directly tied to the contact's reliability rating. High-reliability contacts share intel that is almost always accurate. Low-reliability contacts may pass on hearsay, outdated information, or even deliberate misinformation from agents with an agenda. Until you have verified a contact's reliability through multiple interactions, treat all gossip with caution. Cross-referencing the same rumour from two independent contacts significantly increases the chance it is accurate. When you receive actionable intel, you can act on it by scheduling a visit to observe the player in question, checking the transfer market for movement that matches the rumour, adjusting your report conviction levels based on character intel, or prioritising a region or venue that a contact has flagged. Following up on a contact's tip and finding it accurate strengthens your relationship with that contact and improves your estimate of their reliability.",
    content: (
      <SectionBlock>
        <Para>
          During network meetings, contacts may share gossip alongside standard
          relationship gains. Gossip comes in several forms:
        </Para>
        <BulletList
          items={[
            <>
              <span className="font-medium text-zinc-200">
                Transfer rumours
              </span>{" "}
              {"\u2014"} players becoming available or clubs preparing bids
            </>,
            <>
              <span className="font-medium text-zinc-200">
                Injury whispers
              </span>{" "}
              {"\u2014"} unreported knocks or fitness concerns that could affect
              a player&apos;s value
            </>,
            <>
              <span className="font-medium text-zinc-200">Squad unrest</span>{" "}
              {"\u2014"} dressing room problems, contract disputes, or players
              angling for a move
            </>,
            <>
              <span className="font-medium text-zinc-200">
                Youth sightings
              </span>{" "}
              {"\u2014"} contacts tip you off about promising unsigned youngsters
              in the area
            </>,
          ]}
        />
        <Subheading>Reliability Filtering</Subheading>
        <Para>
          The accuracy of gossip is directly tied to the contact&apos;s
          reliability rating. High-reliability contacts share intel that is
          almost always accurate. Low-reliability contacts may pass on hearsay,
          outdated information, or even deliberate misinformation from agents
          with an agenda. Until you have verified a contact&apos;s reliability
          through multiple interactions, treat all gossip with caution.
          Cross-referencing the same rumour from two independent contacts
          significantly increases the chance it is accurate.
        </Para>
        <Subheading>Acting on Tips</Subheading>
        <Para>
          When you receive actionable intel, you can follow up by:
        </Para>
        <BulletList
          items={[
            "Scheduling a visit to observe the player in question",
            "Checking the transfer market for movement that matches the rumour",
            "Adjusting your report conviction levels based on character intel",
            "Prioritising a region or venue that a contact has flagged",
          ]}
        />
        <Para>
          Following up on a contact&apos;s tip and finding it accurate
          strengthens your relationship with that contact and improves your
          estimate of their reliability.
        </Para>
      </SectionBlock>
    ),
    related: [
      "contact-types",
      "intel-reliability",
      "relationship-building",
      "building-conviction",
      "reading-between-the-lines",
    ],
    tags: [
      "gossip",
      "intel",
      "rumours",
      "tips",
      "transfer",
      "injury",
      "reliability",
      "actionable",
    ],
  },
];
