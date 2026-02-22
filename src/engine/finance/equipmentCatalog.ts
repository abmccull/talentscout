/**
 * Equipment catalog — declarative item definitions for the 5-slot loadout system.
 *
 * Each slot covers a different aspect of scouting. Items within a slot are
 * tiered (1–4) with increasing cost and effect. Specialization items are
 * tier-3 equivalents with unique effects for a specific career path.
 *
 * All data is static — no runtime logic, no mutation.
 */

import type { Specialization, ActivityType, EquipmentSlot, EquipmentItemId, EquipmentLoadout, EquipmentInventory } from "@/engine/core/types";

// Re-export types whose canonical definitions now live in types.ts
export type { EquipmentSlot, EquipmentItemId, EquipmentLoadout, EquipmentInventory };

// =============================================================================
// TYPES
// =============================================================================

export type EquipmentEffectType =
  | "observationConfidence"
  | "videoConfidence"
  | "dataAccuracy"
  | "reportQuality"
  | "fatigueReduction"
  | "travelCostReduction"
  | "travelSlotReduction"
  | "relationshipGainBonus"
  | "intelReliabilityBonus"
  | "youthDiscoveryBonus"
  | "gutFeelingBonus"
  | "attributesPerSession"
  | "familiarityGainBonus"
  | "paEstimateAccuracy"
  | "systemFitAccuracy"
  | "anomalyDetectionRate"
  | "predictionAccuracy"
  | "valuationAccuracy";

export interface EquipmentEffect {
  type: EquipmentEffectType;
  /** Numeric value: percentages as decimals (0.03 = +3%), flat values as integers. */
  value: number;
  /** Only applies to specific activity types (e.g. fatigue reduction for attendMatch only). */
  activityTypes?: ActivityType[];
  /** Only applies in the scout's home region. */
  homeRegionOnly?: boolean;
}

export interface EquipmentItemDefinition {
  id: EquipmentItemId;
  slot: EquipmentSlot;
  name: string;
  description: string;
  tier: 1 | 2 | 3 | 4;
  purchaseCost: number;
  monthlyCost: number;
  effects: EquipmentEffect[];
  /** Only purchasable by this specialization. */
  specialization?: Specialization;
  /** Sell-back price (default: 50% of purchaseCost). */
  sellValue?: number;
}

// =============================================================================
// ALL SLOTS
// =============================================================================

export const ALL_EQUIPMENT_SLOTS: readonly EquipmentSlot[] = [
  "notebook",
  "video",
  "travel",
  "network",
  "analysis",
] as const;

// =============================================================================
// DEFAULT LOADOUT
// =============================================================================

export const DEFAULT_LOADOUT: EquipmentLoadout = {
  notebook: "notebook_t1",
  video: "video_t1",
  travel: "travel_t1",
  network: "network_t1",
  analysis: "analysis_t1",
};

export const DEFAULT_OWNED_ITEMS: EquipmentItemId[] = [
  "notebook_t1",
  "video_t1",
  "travel_t1",
  "network_t1",
  "analysis_t1",
];

// =============================================================================
// CATALOG
// =============================================================================

export const EQUIPMENT_CATALOG: EquipmentItemDefinition[] = [
  // ---------------------------------------------------------------------------
  // NOTEBOOK SLOT
  // ---------------------------------------------------------------------------
  {
    id: "notebook_t1",
    slot: "notebook",
    name: "Spiral Notepad",
    description: "A basic notepad for jotting down observations. Gets the job done, barely.",
    tier: 1,
    purchaseCost: 0,
    monthlyCost: 0,
    effects: [],
  },
  {
    id: "notebook_t2",
    slot: "notebook",
    name: "Leather Scout's Journal",
    description: "A quality leather journal with pre-printed match observation templates and weather-resistant pages.",
    tier: 2,
    purchaseCost: 300,
    monthlyCost: 0,
    effects: [
      { type: "observationConfidence", value: 0.03 },
    ],
  },
  {
    id: "notebook_t3",
    slot: "notebook",
    name: "Tablet with Match Notes App",
    description: "A ruggedised tablet running bespoke scouting software with voice-to-text, GPS tagging, and cloud sync.",
    tier: 3,
    purchaseCost: 1200,
    monthlyCost: 30,
    effects: [
      { type: "observationConfidence", value: 0.06 },
      { type: "attributesPerSession", value: 1 },
    ],
  },
  {
    id: "notebook_t4",
    slot: "notebook",
    name: "Professional Scouting Tablet",
    description: "Top-of-the-line tablet with AI-assisted note capture, real-time formation overlay, and multi-match cross-referencing.",
    tier: 4,
    purchaseCost: 3000,
    monthlyCost: 60,
    effects: [
      { type: "observationConfidence", value: 0.10 },
      { type: "attributesPerSession", value: 2 },
      { type: "fatigueReduction", value: 1, activityTypes: ["attendMatch"] },
    ],
  },
  {
    id: "notebook_youth",
    slot: "notebook",
    name: "Grassroots Scouting Journal",
    description: "A specialised journal with youth-specific observation prompts, development stage indicators, and age-adjusted templates.",
    tier: 3,
    purchaseCost: 1000,
    monthlyCost: 25,
    effects: [
      { type: "observationConfidence", value: 0.04 },
      { type: "gutFeelingBonus", value: 0.20 },
      { type: "fatigueReduction", value: 2, activityTypes: ["schoolMatch", "grassrootsTournament", "youthFestival", "academyTrialDay", "streetFootball"] },
    ],
    specialization: "youth",
  },

  // ---------------------------------------------------------------------------
  // VIDEO SLOT
  // ---------------------------------------------------------------------------
  {
    id: "video_t1",
    slot: "video",
    name: "Basic Laptop",
    description: "A standard laptop for watching match clips. Functional, if slow.",
    tier: 1,
    purchaseCost: 0,
    monthlyCost: 0,
    effects: [],
  },
  {
    id: "video_t2",
    slot: "video",
    name: "Match Replay Subscription",
    description: "Access to full-match replays across major leagues with basic tagging and bookmarking tools.",
    tier: 2,
    purchaseCost: 200,
    monthlyCost: 40,
    effects: [
      { type: "videoConfidence", value: 0.04 },
    ],
  },
  {
    id: "video_t3",
    slot: "video",
    name: "Multi-Angle Video Suite",
    description: "Multi-camera angle access with slow-motion review, clip extraction, and automated highlight compilation.",
    tier: 3,
    purchaseCost: 1500,
    monthlyCost: 75,
    effects: [
      { type: "videoConfidence", value: 0.08 },
      { type: "reportQuality", value: 0.05 },
    ],
  },
  {
    id: "video_t4",
    slot: "video",
    name: "Professional Editing Bay",
    description: "A full editing suite with broadcast-quality feeds, telestrator tools, and automated sequence analysis.",
    tier: 4,
    purchaseCost: 4000,
    monthlyCost: 100,
    effects: [
      { type: "videoConfidence", value: 0.12 },
      { type: "reportQuality", value: 0.10 },
      { type: "fatigueReduction", value: 1, activityTypes: ["writeReport", "writePlacementReport"] },
    ],
  },
  {
    id: "video_firstTeam",
    slot: "video",
    name: "Tactical Board Pro",
    description: "Tactical analysis platform with formation overlays, pressing heat maps, and system-fit modelling tools.",
    tier: 3,
    purchaseCost: 1800,
    monthlyCost: 80,
    effects: [
      { type: "videoConfidence", value: 0.10 },
      { type: "systemFitAccuracy", value: 0.15 },
    ],
    specialization: "firstTeam",
  },
  {
    id: "video_data",
    slot: "video",
    name: "Statistical Video Overlay",
    description: "Video analysis tool with live statistical overlays, per-90 metrics, and event-level data integration.",
    tier: 3,
    purchaseCost: 1200,
    monthlyCost: 65,
    effects: [
      { type: "videoConfidence", value: 0.10, activityTypes: ["deepVideoAnalysis"] },
      { type: "dataAccuracy", value: 0.10, activityTypes: ["watchVideo", "deepVideoAnalysis"] },
    ],
    specialization: "data",
  },

  // ---------------------------------------------------------------------------
  // TRAVEL SLOT
  // ---------------------------------------------------------------------------
  {
    id: "travel_t1",
    slot: "travel",
    name: "Public Transport Pass",
    description: "Buses, trains, and the occasional Uber. It gets you there, eventually.",
    tier: 1,
    purchaseCost: 0,
    monthlyCost: 0,
    effects: [],
  },
  {
    id: "travel_t2",
    slot: "travel",
    name: "Scout's Car",
    description: "A reliable second-hand car that lets you cover more ground with less exhaustion.",
    tier: 2,
    purchaseCost: 800,
    monthlyCost: 25,
    effects: [
      { type: "fatigueReduction", value: 2, activityTypes: ["travel", "internationalTravel", "attendMatch"] },
      { type: "travelCostReduction", value: 0.10 },
    ],
  },
  {
    id: "travel_t3",
    slot: "travel",
    name: "Business Travel Account",
    description: "Corporate accounts with airlines and hotels, priority boarding, and airport lounge access.",
    tier: 3,
    purchaseCost: 500,
    monthlyCost: 80,
    effects: [
      { type: "fatigueReduction", value: 4, activityTypes: ["travel", "internationalTravel", "attendMatch"] },
      { type: "travelCostReduction", value: 0.20 },
      { type: "travelSlotReduction", value: 1 },
    ],
  },
  {
    id: "travel_t4",
    slot: "travel",
    name: "Premium Travel Package",
    description: "Business class flights, premium hotels, and a personal travel coordinator who optimises your routes.",
    tier: 4,
    purchaseCost: 2000,
    monthlyCost: 150,
    effects: [
      { type: "fatigueReduction", value: 6, activityTypes: ["travel", "internationalTravel", "attendMatch"] },
      { type: "travelCostReduction", value: 0.30 },
      { type: "travelSlotReduction", value: 1 },
      { type: "familiarityGainBonus", value: 5 },
    ],
  },
  {
    id: "travel_regional",
    slot: "travel",
    name: "Regional Routes Optimizer",
    description: "A specialised travel toolkit for your home region — local contacts for lifts, knowledge of back roads, and accommodation deals.",
    tier: 3,
    purchaseCost: 400,
    monthlyCost: 70,
    effects: [
      { type: "fatigueReduction", value: 5, activityTypes: ["travel", "internationalTravel", "attendMatch"], homeRegionOnly: true },
      { type: "travelCostReduction", value: 0.25, homeRegionOnly: true },
      { type: "familiarityGainBonus", value: 10 },
    ],
    specialization: "regional",
  },

  // ---------------------------------------------------------------------------
  // NETWORK SLOT
  // ---------------------------------------------------------------------------
  {
    id: "network_t1",
    slot: "network",
    name: "Personal Phone",
    description: "Your personal mobile. Contacts saved in random notes apps and WhatsApp groups.",
    tier: 1,
    purchaseCost: 0,
    monthlyCost: 0,
    effects: [],
  },
  {
    id: "network_t2",
    slot: "network",
    name: "Contacts Spreadsheet",
    description: "A properly organised spreadsheet tracking every contact, last interaction, and reliability rating.",
    tier: 2,
    purchaseCost: 100,
    monthlyCost: 0,
    effects: [
      { type: "relationshipGainBonus", value: 0.05 },
    ],
  },
  {
    id: "network_t3",
    slot: "network",
    name: "Scout CRM Subscription",
    description: "A dedicated CRM designed for football scouts — automated follow-ups, reliability scoring, and interaction history.",
    tier: 3,
    purchaseCost: 400,
    monthlyCost: 50,
    effects: [
      { type: "relationshipGainBonus", value: 0.10 },
      { type: "fatigueReduction", value: 1, activityTypes: ["networkMeeting"] },
      { type: "intelReliabilityBonus", value: 0.10 },
    ],
  },
  {
    id: "network_t4",
    slot: "network",
    name: "Industry Networking Suite",
    description: "Enterprise-grade networking platform with event coordination, automated introductions, and intelligence aggregation.",
    tier: 4,
    purchaseCost: 1500,
    monthlyCost: 90,
    effects: [
      { type: "relationshipGainBonus", value: 0.15 },
      { type: "fatigueReduction", value: 2, activityTypes: ["networkMeeting"] },
      { type: "intelReliabilityBonus", value: 0.20 },
    ],
  },
  {
    id: "network_firstTeam",
    slot: "network",
    name: "Agent Relationship Manager",
    description: "A specialised tool for managing agent relationships — deal history tracking, valuation cross-referencing, and trust scoring.",
    tier: 3,
    purchaseCost: 600,
    monthlyCost: 55,
    effects: [
      { type: "relationshipGainBonus", value: 0.12 },
      { type: "valuationAccuracy", value: 0.15 },
    ],
    specialization: "firstTeam",
  },
  {
    id: "network_regional",
    slot: "network",
    name: "Local Intelligence Network",
    description: "A curated network of local informants — youth coaches, journalists, and community contacts who feed you reliable intelligence.",
    tier: 3,
    purchaseCost: 500,
    monthlyCost: 45,
    effects: [
      { type: "relationshipGainBonus", value: 0.12, homeRegionOnly: true },
      { type: "intelReliabilityBonus", value: 0.25, homeRegionOnly: true },
    ],
    specialization: "regional",
  },

  // ---------------------------------------------------------------------------
  // ANALYSIS SLOT
  // ---------------------------------------------------------------------------
  {
    id: "analysis_t1",
    slot: "analysis",
    name: "Pen & Paper Stats",
    description: "Tallying goals, assists, and passes on the back of a programme. Old school, but limited.",
    tier: 1,
    purchaseCost: 0,
    monthlyCost: 0,
    effects: [],
  },
  {
    id: "analysis_t2",
    slot: "analysis",
    name: "Spreadsheet Templates",
    description: "Pre-built spreadsheet models for tracking player statistics across multiple matches and seasons.",
    tier: 2,
    purchaseCost: 150,
    monthlyCost: 0,
    effects: [
      { type: "dataAccuracy", value: 0.05 },
    ],
  },
  {
    id: "analysis_t3",
    slot: "analysis",
    name: "Statistical Database Access",
    description: "Subscription to a professional statistical database with per-90 metrics, expected goals, and league-wide comparisons.",
    tier: 3,
    purchaseCost: 1000,
    monthlyCost: 60,
    effects: [
      { type: "dataAccuracy", value: 0.10 },
      { type: "youthDiscoveryBonus", value: 0.10 },
      { type: "reportQuality", value: 0.05 },
    ],
  },
  {
    id: "analysis_t4",
    slot: "analysis",
    name: "Advanced Analytics Platform",
    description: "Enterprise analytics platform with predictive models, automated alerts, and custom report generation.",
    tier: 4,
    purchaseCost: 3500,
    monthlyCost: 120,
    effects: [
      { type: "dataAccuracy", value: 0.15 },
      { type: "youthDiscoveryBonus", value: 0.20 },
      { type: "reportQuality", value: 0.10 },
      { type: "fatigueReduction", value: 2, activityTypes: ["databaseQuery", "deepVideoAnalysis", "statsBriefing", "algorithmCalibration"] },
    ],
  },
  {
    id: "analysis_youth",
    slot: "analysis",
    name: "Youth Development Tracker",
    description: "A specialised platform for tracking youth player development curves, academy progression rates, and early-age talent indicators.",
    tier: 3,
    purchaseCost: 800,
    monthlyCost: 50,
    effects: [
      { type: "youthDiscoveryBonus", value: 0.15 },
      { type: "paEstimateAccuracy", value: 0.10 },
    ],
    specialization: "youth",
  },
  {
    id: "analysis_data",
    slot: "analysis",
    name: "Machine Learning Pipeline",
    description: "Custom ML models trained on your scouting data — anomaly detection, breakout prediction, and automated prospect scoring.",
    tier: 3,
    purchaseCost: 2000,
    monthlyCost: 100,
    effects: [
      { type: "dataAccuracy", value: 0.20 },
      { type: "anomalyDetectionRate", value: 0.30 },
      { type: "predictionAccuracy", value: 0.10 },
    ],
    specialization: "data",
  },
];

// =============================================================================
// LOOKUP HELPERS
// =============================================================================

/** O(1) lookup by item ID. */
const CATALOG_INDEX = new Map<EquipmentItemId, EquipmentItemDefinition>(
  EQUIPMENT_CATALOG.map((item) => [item.id, item]),
);

/** Look up an item definition by ID. Returns undefined for unknown IDs. */
export function getEquipmentItem(id: EquipmentItemId): EquipmentItemDefinition | undefined {
  return CATALOG_INDEX.get(id);
}

/** Return all items available for a given slot, optionally filtered by specialization. */
export function getItemsForSlot(
  slot: EquipmentSlot,
  specialization?: Specialization,
): EquipmentItemDefinition[] {
  return EQUIPMENT_CATALOG.filter(
    (item) =>
      item.slot === slot &&
      (item.specialization === undefined || item.specialization === specialization),
  );
}
