import type { WikiArticle } from "@/components/game/wiki/wikiTypes";
import { SectionBlock, Para, Table, Subheading } from "./components";

// ─── Equipment & Tools ──────────────────────────────────────────────────────

export const equipmentArticles: WikiArticle[] = [
  // ── Equipment Overview ──────────────────────────────────────────────────────
  {
    slug: "equipment-overview",
    title: "Equipment Slots",
    category: "equipment",
    order: 0,
    summary:
      "Overview of the five equipment slots: Notebook, Video, Travel, Network, and Analysis.",
    searchText:
      "Equipment Slots. Your loadout has five equipment slots. Each slot has tiered items (Tier 1-4) and one specialization-specific item. You can only equip one item per slot at a time, but you can own multiple and swap between them. Notebook governs observation confidence and attributes captured per session. Video governs video analysis confidence and report quality. Travel governs fatigue from travel and match attendance, travel cost reduction. Network governs relationship gain from meetings, intel reliability. Analysis governs data accuracy, youth discovery bonus, anomaly detection.",
    content: (
      <SectionBlock>
        <Para>
          Your loadout has five equipment slots. Each slot has tiered items (Tier
          1{"\u2013"}4) and one specialization-specific item. You can only equip
          one item per slot at a time, but you can own multiple and swap between
          them.
        </Para>
        <Table
          headers={["Slot", "Governs"]}
          rows={[
            [
              "Notebook",
              "Observation confidence and attributes captured per session",
            ],
            ["Video", "Video analysis confidence and report quality"],
            [
              "Travel",
              "Fatigue from travel and match attendance, travel cost reduction",
            ],
            ["Network", "Relationship gain from meetings, intel reliability"],
            [
              "Analysis",
              "Data accuracy, youth discovery bonus, anomaly detection",
            ],
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "notebook-video-equipment",
      "travel-network-analysis-equipment",
      "tools-unlockables",
      "fatigue",
    ],
    tags: [
      "equipment",
      "slots",
      "loadout",
      "notebook",
      "video",
      "travel",
      "network",
      "analysis",
    ],
  },

  // ── Notebook & Video Equipment ──────────────────────────────────────────────
  {
    slug: "notebook-video-equipment",
    title: "Notebook & Video Equipment",
    category: "equipment",
    order: 1,
    summary:
      "Tiered items for the Notebook slot (observation confidence) and Video slot (video analysis and report quality).",
    searchText:
      "Notebook and Video Equipment. Notebook Slot items: Spiral Notepad T1, free baseline. Leather Scout's Journal T2, +3% observation confidence. Tablet with Match Notes App T3, +6% confidence, +1 attribute per session. Professional Scouting Tablet T4, +10% confidence, +2 attributes per session, -1 fatigue matches. Grassroots Scouting Journal Youth specialization, +4% confidence, +20% gut feeling, reduced youth activity fatigue. Video Slot items: Basic Laptop T1, free baseline. Match Replay Subscription T2, +4% video confidence. Multi-Angle Video Suite T3, +8% video confidence, +5% report quality. Professional Editing Bay T4, +12% video confidence, +10% report quality, -1 fatigue writing. Tactical Board Pro First Team specialization, +10% video confidence, +15% system fit accuracy. Statistical Video Overlay Data specialization, +10% deep video confidence, +10% data accuracy.",
    content: (
      <SectionBlock>
        <Subheading>Notebook Slot</Subheading>
        <Table
          headers={["Item", "Tier", "Key Bonuses"]}
          rows={[
            ["Spiral Notepad", "T1", "Free \u2014 baseline"],
            [
              "Leather Scout\u2019s Journal",
              "T2",
              "+3% observation confidence",
            ],
            [
              "Tablet with Match Notes App",
              "T3",
              "+6% confidence, +1 attribute/session",
            ],
            [
              "Professional Scouting Tablet",
              "T4",
              "+10% confidence, +2 attributes/session, -1 fatigue (matches)",
            ],
            [
              "Grassroots Scouting Journal (Youth)",
              "Spec",
              "+4% confidence, +20% gut feeling, reduced youth activity fatigue",
            ],
          ]}
        />
        <Subheading>Video Slot</Subheading>
        <Table
          headers={["Item", "Tier", "Key Bonuses"]}
          rows={[
            ["Basic Laptop", "T1", "Free \u2014 baseline"],
            ["Match Replay Subscription", "T2", "+4% video confidence"],
            [
              "Multi-Angle Video Suite",
              "T3",
              "+8% video confidence, +5% report quality",
            ],
            [
              "Professional Editing Bay",
              "T4",
              "+12% video confidence, +10% report quality, -1 fatigue (writing)",
            ],
            [
              "Tactical Board Pro (First Team)",
              "Spec",
              "+10% video confidence, +15% system fit accuracy",
            ],
            [
              "Statistical Video Overlay (Data)",
              "Spec",
              "+10% deep video confidence, +10% data accuracy",
            ],
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "equipment-overview",
      "travel-network-analysis-equipment",
      "youth-scout-spec",
      "first-team-scout-spec",
      "data-scout-spec",
    ],
    tags: [
      "equipment",
      "notebook",
      "video",
      "confidence",
      "observation",
      "report quality",
      "tier",
    ],
  },

  // ── Travel, Network & Analysis Equipment ────────────────────────────────────
  {
    slug: "travel-network-analysis-equipment",
    title: "Travel, Network & Analysis Equipment",
    category: "equipment",
    order: 2,
    summary:
      "Tiered items for the Travel slot (fatigue and cost), Network slot (relationships and intel), and Analysis slot (data accuracy).",
    searchText:
      "Travel, Network and Analysis Equipment. Travel Slot items: Public Transport Pass T1, free baseline. Scout's Car T2, -2 fatigue travel and matches, -10% travel cost. Business Travel Account T3, -4 fatigue, -20% travel cost, -1 travel slot. Premium Travel Package T4, -6 fatigue, -30% cost, -1 slot, +5 familiarity gain. Regional Routes Optimizer Regional specialization, -5 fatigue at home, -25% cost at home, +10 familiarity gain. Network Slot items: Personal Phone T1, free baseline. Contacts Spreadsheet T2, +5% relationship gain. Scout CRM Subscription T3, +10% relationship gain, +10% intel reliability, -1 fatigue meetings. Industry Networking Suite T4, +15% relationship gain, +20% intel reliability, -2 fatigue meetings. Agent Relationship Manager First Team specialization, +12% relationship gain, +15% valuation accuracy. Local Intelligence Network Regional specialization, +12% relationship gain at home, +25% intel reliability at home. Analysis Slot items: Pen and Paper Stats T1, free baseline. Spreadsheet Templates T2, +5% data accuracy. Statistical Database Access T3, +10% data accuracy, +10% youth discovery, +5% report quality. Advanced Analytics Platform T4, full suite of data bonuses including anomaly detection and prediction accuracy.",
    content: (
      <SectionBlock>
        <Subheading>Travel Slot</Subheading>
        <Table
          headers={["Item", "Tier", "Key Bonuses"]}
          rows={[
            ["Public Transport Pass", "T1", "Free \u2014 baseline"],
            [
              "Scout\u2019s Car",
              "T2",
              "-2 fatigue (travel/matches), -10% travel cost",
            ],
            [
              "Business Travel Account",
              "T3",
              "-4 fatigue, -20% travel cost, -1 travel slot",
            ],
            [
              "Premium Travel Package",
              "T4",
              "-6 fatigue, -30% cost, -1 slot, +5 familiarity gain",
            ],
            [
              "Regional Routes Optimizer (Regional)",
              "Spec",
              "-5 fatigue at home, -25% cost at home, +10 familiarity gain",
            ],
          ]}
        />
        <Subheading>Network Slot</Subheading>
        <Table
          headers={["Item", "Tier", "Key Bonuses"]}
          rows={[
            ["Personal Phone", "T1", "Free \u2014 baseline"],
            ["Contacts Spreadsheet", "T2", "+5% relationship gain"],
            [
              "Scout CRM Subscription",
              "T3",
              "+10% relationship gain, +10% intel reliability, -1 fatigue (meetings)",
            ],
            [
              "Industry Networking Suite",
              "T4",
              "+15% relationship gain, +20% intel reliability, -2 fatigue (meetings)",
            ],
            [
              "Agent Relationship Manager (First Team)",
              "Spec",
              "+12% relationship gain, +15% valuation accuracy",
            ],
            [
              "Local Intelligence Network (Regional)",
              "Spec",
              "+12% relationship gain at home, +25% intel reliability at home",
            ],
          ]}
        />
        <Subheading>Analysis Slot</Subheading>
        <Table
          headers={["Item", "Tier", "Key Bonuses"]}
          rows={[
            ["Pen & Paper Stats", "T1", "Free \u2014 baseline"],
            ["Spreadsheet Templates", "T2", "+5% data accuracy"],
            [
              "Statistical Database Access",
              "T3",
              "+10% data accuracy, +10% youth discovery, +5% report quality",
            ],
            [
              "Advanced Analytics Platform",
              "T4",
              "Full suite of data bonuses including anomaly detection and prediction accuracy",
            ],
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "equipment-overview",
      "notebook-video-equipment",
      "regional-expert-spec",
      "first-team-scout-spec",
      "fatigue",
    ],
    tags: [
      "equipment",
      "travel",
      "network",
      "analysis",
      "fatigue",
      "relationship",
      "data accuracy",
      "tier",
    ],
  },

  // ── Tools (Unlockables) ─────────────────────────────────────────────────────
  {
    slug: "tools-unlockables",
    title: "Tools (Unlockables)",
    category: "equipment",
    order: 3,
    summary:
      "One-time unlocks that provide persistent bonuses, earned through career progression milestones.",
    searchText:
      "Tools are one-time unlocks that provide persistent bonuses. Unlike equipment they are not swappable, once unlocked they are always active. Tools are unlocked via career progression milestones and are displayed in your Career screen. Check the Career screen's Tools panel to see which tools are available at your current tier and what each one provides.",
    content: (
      <SectionBlock>
        <Para>
          Tools are one-time unlocks that provide persistent bonuses. Unlike
          equipment they are not swappable {"\u2014"} once unlocked they are
          always active. Tools are unlocked via career progression milestones and
          are displayed in your Career screen.
        </Para>
        <Para>
          Check the Career screen&apos;s Tools panel to see which tools are
          available at your current tier and what each one provides.
        </Para>
      </SectionBlock>
    ),
    related: [
      "equipment-overview",
      "career-tiers",
      "notebook-video-equipment",
      "travel-network-analysis-equipment",
    ],
    tags: [
      "tools",
      "unlockables",
      "career",
      "progression",
      "persistent",
      "bonus",
    ],
  },
];
