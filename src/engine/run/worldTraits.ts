import type {
  NarrativeEventType,
  RunManifest,
  Specialization,
} from "@/engine/core/types";
import { createNamedRNG } from "./runManifest";
import { getRunChoiceSimulationModifiers } from "./scoutIdentity";

export type WorldTraitDimension = "talent" | "competition" | "economy";

export interface RunSimulationModifiers {
  narrativeEventChanceMultiplier: number;
  storylineChanceMultiplier: number;
  narrativeCooldownDelta: number;
  youthTalentMultiplier: number;
  rivalDiscoveryChanceMultiplier: number;
  rivalPoachChanceMultiplier: number;
  rivalSigningChanceMultiplier: number;
  economicEventChanceMultiplier: number;
  economicImpactMultiplier: number;
  narrativeTypeWeights: Partial<Record<NarrativeEventType, number>>;
}

export interface WorldTraitDefinition {
  id: string;
  name: string;
  dimension: WorldTraitDimension;
  description: string;
  playerFacingEffects: string[];
  modifiers: Partial<Omit<RunSimulationModifiers, "narrativeTypeWeights">> & {
    narrativeTypeWeights?: Partial<Record<NarrativeEventType, number>>;
  };
}

const DEFAULT_MODIFIERS: RunSimulationModifiers = {
  narrativeEventChanceMultiplier: 1,
  storylineChanceMultiplier: 1,
  narrativeCooldownDelta: 0,
  youthTalentMultiplier: 1,
  rivalDiscoveryChanceMultiplier: 1,
  rivalPoachChanceMultiplier: 1,
  rivalSigningChanceMultiplier: 1,
  economicEventChanceMultiplier: 1,
  economicImpactMultiplier: 1,
  narrativeTypeWeights: {},
};

export const WORLD_TRAITS: readonly WorldTraitDefinition[] = [
  {
    id: "golden-generation",
    name: "Golden Generation",
    dimension: "talent",
    description: "An unusually deep youth cohort is emerging across the active football world.",
    playerFacingEffects: [
      "Exceptional youth potential is more common",
      "Youth breakthroughs and wonderkid pressure appear more often",
    ],
    modifiers: {
      youthTalentMultiplier: 1.35,
      narrativeTypeWeights: {
        wonderkidPressure: 1.45,
        youthProdigyDilemma: 1.35,
        debutBrilliance: 1.25,
      },
    },
  },
  {
    id: "thin-crop",
    name: "Thin Crop",
    dimension: "talent",
    description: "Elite youth talent is scarce, making every credible lead more contested and valuable.",
    playerFacingEffects: [
      "Top-end youth potential is rarer",
      "Late bloomers and hidden gems matter more",
    ],
    modifiers: {
      youthTalentMultiplier: 0.72,
      narrativeTypeWeights: {
        hiddenGemVindication: 1.55,
        lateBloomingSurprise: 1.45,
        rivalPoach: 1.2,
      },
    },
  },
  {
    id: "scout-wars",
    name: "Scout Wars",
    dimension: "competition",
    description: "Recruitment departments are aggressive, well funded, and quick to move on shared targets.",
    playerFacingEffects: [
      "Rivals discover and pursue targets faster",
      "Competitive and poaching stories are more common",
    ],
    modifiers: {
      narrativeEventChanceMultiplier: 1.12,
      rivalDiscoveryChanceMultiplier: 1.45,
      rivalPoachChanceMultiplier: 1.6,
      rivalSigningChanceMultiplier: 1.35,
      narrativeTypeWeights: {
        rivalPoach: 1.7,
        rivalPoachBid: 1.7,
        rivalRecruitment: 1.4,
        rivalClubPoach: 1.4,
      },
    },
  },
  {
    id: "trusted-circuit",
    name: "Trusted Circuit",
    dimension: "competition",
    description: "The scouting world runs through durable relationships and reputation more than open conflict.",
    playerFacingEffects: [
      "Rivals move less aggressively",
      "Network access and relationship stories are more common",
    ],
    modifiers: {
      storylineChanceMultiplier: 1.2,
      rivalDiscoveryChanceMultiplier: 0.78,
      rivalPoachChanceMultiplier: 0.7,
      rivalSigningChanceMultiplier: 0.82,
      narrativeTypeWeights: {
        exclusiveAccess: 1.55,
        contactBetrayal: 1.35,
        networkExpansion: 1.35,
        mentorOffer: 1.25,
      },
    },
  },
  {
    id: "boom-bust-market",
    name: "Boom-Bust Market",
    dimension: "economy",
    description: "Club finances and recruitment budgets swing sharply as ownership and regulation change.",
    playerFacingEffects: [
      "Economic shocks happen more often",
      "Market effects are more severe",
    ],
    modifiers: {
      economicEventChanceMultiplier: 1.8,
      economicImpactMultiplier: 1.3,
      narrativeEventChanceMultiplier: 1.08,
      narrativeTypeWeights: {
        budgetCut: 1.4,
        clubFinancialTrouble: 1.5,
        financialFairPlayImpact: 1.45,
        boardroomCoup: 1.2,
      },
    },
  },
  {
    id: "cautious-market",
    name: "Cautious Market",
    dimension: "economy",
    description: "Clubs protect cash, move deliberately, and demand stronger evidence before taking risks.",
    playerFacingEffects: [
      "Large economic shocks are less frequent and milder",
      "Narrative pacing is quieter, making each opening more important",
    ],
    modifiers: {
      economicEventChanceMultiplier: 0.55,
      economicImpactMultiplier: 0.75,
      narrativeEventChanceMultiplier: 0.92,
      narrativeCooldownDelta: 1,
      narrativeTypeWeights: {
        reportCitedInBoardMeeting: 1.3,
        scoutingDeptRestructure: 1.25,
      },
    },
  },
] as const;

const TRAITS_BY_ID = new Map(WORLD_TRAITS.map((trait) => [trait.id, trait]));
const DIMENSIONS: readonly WorldTraitDimension[] = [
  "talent",
  "competition",
  "economy",
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** One deterministic trait from each dimension creates eight mechanical eras. */
export function deriveWorldTraitIds(
  rootSeed: string,
  specialization: Specialization,
): string[] {
  return DIMENSIONS.map((dimension) => {
    const candidates = WORLD_TRAITS.filter((trait) => trait.dimension === dimension);
    const rng = createNamedRNG(
      rootSeed,
      "world-trait",
      dimension,
      specialization,
    );
    return candidates[rng.nextInt(0, candidates.length - 1)].id;
  });
}

export function getWorldTraitDefinitions(
  traitIds: readonly string[],
): WorldTraitDefinition[] {
  return traitIds.flatMap((id) => {
    const trait = TRAITS_BY_ID.get(id);
    return trait ? [trait] : [];
  });
}

export function getRunSimulationModifiers(
  manifestOrIds: RunManifest | readonly string[],
): RunSimulationModifiers {
  const manifest = Array.isArray(manifestOrIds)
    ? undefined
    : manifestOrIds as RunManifest;
  const ids = manifest
    ? manifest.worldTraitIds
    : manifestOrIds as readonly string[];
  const combined: RunSimulationModifiers = {
    ...DEFAULT_MODIFIERS,
    narrativeTypeWeights: {},
  };

  const modifierSets = [
    ...getWorldTraitDefinitions(ids).map((trait) => trait.modifiers),
    ...(manifest ? getRunChoiceSimulationModifiers(manifest) : []),
  ];
  for (const modifiers of modifierSets) {
    for (const key of [
      "narrativeEventChanceMultiplier",
      "storylineChanceMultiplier",
      "youthTalentMultiplier",
      "rivalDiscoveryChanceMultiplier",
      "rivalPoachChanceMultiplier",
      "rivalSigningChanceMultiplier",
      "economicEventChanceMultiplier",
      "economicImpactMultiplier",
    ] as const) {
      combined[key] *= modifiers[key] ?? 1;
    }
    combined.narrativeCooldownDelta += modifiers.narrativeCooldownDelta ?? 0;
    for (const [type, weight] of Object.entries(
      modifiers.narrativeTypeWeights ?? {},
    ) as [NarrativeEventType, number][]) {
      combined.narrativeTypeWeights[type] =
        (combined.narrativeTypeWeights[type] ?? 1) * weight;
    }
  }

  combined.narrativeEventChanceMultiplier = clamp(
    combined.narrativeEventChanceMultiplier,
    0.5,
    2,
  );
  combined.storylineChanceMultiplier = clamp(
    combined.storylineChanceMultiplier,
    0.5,
    2,
  );
  combined.youthTalentMultiplier = clamp(combined.youthTalentMultiplier, 0.5, 1.75);
  return combined;
}

export function getWorldTraitContentDefinitionIds(): string[] {
  return WORLD_TRAITS.map((trait) => `world-trait:${trait.id}`).sort();
}

export function formatWorldTraitBrief(traitIds: readonly string[]): string {
  return getWorldTraitDefinitions(traitIds)
    .map((trait) => `${trait.name}: ${trait.description}`)
    .join("\n\n");
}
