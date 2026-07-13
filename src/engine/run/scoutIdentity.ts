import type {
  Contact,
  NarrativeEventType,
  NewGameConfig,
  Scout,
  ScoutAttribute,
  ScoutSkill,
} from "@/engine/core/types";

export type ScoutOriginId =
  | "academy-apprentice"
  | "former-player"
  | "grassroots-organizer"
  | "video-analyst";

export type ScoutFlawId =
  | "stubborn-convictions"
  | "fragile-network"
  | "travel-worn"
  | "unknown-quantity";

export type ScoutDoctrineId =
  | "evidence-first"
  | "relationships-first"
  | "move-before-market"
  | "contrarian-eye";

export interface StartingScoutEffects {
  skillDeltas?: Partial<Record<ScoutSkill, number>>;
  attributeDeltas?: Partial<Record<ScoutAttribute, number>>;
  reputationDelta?: number;
  specializationReputationDelta?: number;
  fatigueDelta?: number;
  homeFamiliarityDelta?: number;
  startingContactRelationshipDelta?: number;
  startingContactTrustDelta?: number;
}

export interface RunChoiceSimulationModifiers {
  narrativeEventChanceMultiplier?: number;
  storylineChanceMultiplier?: number;
  narrativeCooldownDelta?: number;
  youthTalentMultiplier?: number;
  rivalDiscoveryChanceMultiplier?: number;
  rivalPoachChanceMultiplier?: number;
  rivalSigningChanceMultiplier?: number;
  economicEventChanceMultiplier?: number;
  economicImpactMultiplier?: number;
  narrativeTypeWeights?: Partial<Record<NarrativeEventType, number>>;
}

interface RunChoiceDefinitionBase<Id extends string> {
  id: Id;
  name: string;
  description: string;
  playerFacingEffects: string[];
  startingEffects?: StartingScoutEffects;
  simulationModifiers?: RunChoiceSimulationModifiers;
}

export type ScoutOriginDefinition = RunChoiceDefinitionBase<ScoutOriginId>;
export type ScoutFlawDefinition = RunChoiceDefinitionBase<ScoutFlawId>;
export type ScoutDoctrineDefinition = RunChoiceDefinitionBase<ScoutDoctrineId>;

export const DEFAULT_SCOUT_ORIGIN_ID: ScoutOriginId = "academy-apprentice";
export const DEFAULT_SCOUT_FLAW_ID: ScoutFlawId = "stubborn-convictions";
export const DEFAULT_SCOUT_DOCTRINE_ID: ScoutDoctrineId = "evidence-first";

export const SCOUT_ORIGINS: readonly ScoutOriginDefinition[] = [
  {
    id: "academy-apprentice",
    name: "Academy Apprentice",
    description: "You learned the trade logging sessions and debating potential calls inside a professional academy.",
    playerFacingEffects: [
      "+2 Potential Assessment and +1 Psychological Read",
      "+10 starting familiarity in your home country",
    ],
    startingEffects: {
      skillDeltas: { potentialAssessment: 2, psychologicalRead: 1 },
      homeFamiliarityDelta: 10,
    },
  },
  {
    id: "former-player",
    name: "Former Player",
    description: "A playing career gives you instant dressing-room credibility and a sharper eye for present ability.",
    playerFacingEffects: [
      "+2 Technical Eye, +1 Player Judgment, and +1 Persuasion",
      "+3 starting reputation",
    ],
    startingEffects: {
      skillDeltas: { technicalEye: 2, playerJudgment: 1 },
      attributeDeltas: { persuasion: 1 },
      reputationDelta: 3,
    },
  },
  {
    id: "grassroots-organizer",
    name: "Grassroots Organizer",
    description: "Years running local football left you with trusted introductions in places formal recruitment rarely reaches.",
    playerFacingEffects: [
      "+2 Networking and +1 Adaptability",
      "Starting contacts begin with +8 relationship and +5 trust",
    ],
    startingEffects: {
      attributeDeltas: { networking: 2, adaptability: 1 },
      startingContactRelationshipDelta: 8,
      startingContactTrustDelta: 5,
    },
  },
  {
    id: "video-analyst",
    name: "Video Analyst",
    description: "You built your reputation cutting match film, spotting repeatable patterns, and challenging first impressions.",
    playerFacingEffects: [
      "+2 Data Literacy and +1 Tactical Understanding",
      "+2 Memory",
    ],
    startingEffects: {
      skillDeltas: { dataLiteracy: 2, tacticalUnderstanding: 1 },
      attributeDeltas: { memory: 2 },
    },
  },
] as const;

export const SCOUT_FLAWS: readonly ScoutFlawDefinition[] = [
  {
    id: "stubborn-convictions",
    name: "Stubborn Convictions",
    description: "Once you form an opinion, changing course takes more effort than it should.",
    playerFacingEffects: ["-2 Adaptability"],
    startingEffects: { attributeDeltas: { adaptability: -2 } },
  },
  {
    id: "fragile-network",
    name: "Fragile Network",
    description: "You have useful names in your phone, but few of those relationships have been tested under pressure.",
    playerFacingEffects: [
      "-2 Networking",
      "Starting contacts begin with -8 relationship and -5 trust",
    ],
    startingEffects: {
      attributeDeltas: { networking: -2 },
      startingContactRelationshipDelta: -8,
      startingContactTrustDelta: -5,
    },
  },
  {
    id: "travel-worn",
    name: "Travel Worn",
    description: "Long journeys and irregular weeks drain you faster than most scouts.",
    playerFacingEffects: ["-2 Endurance", "Begin the career with 15 fatigue"],
    startingEffects: {
      attributeDeltas: { endurance: -2 },
      fatigueDelta: 15,
    },
  },
  {
    id: "unknown-quantity",
    name: "Unknown Quantity",
    description: "You enter the profession without a recognized name or an established body of work.",
    playerFacingEffects: [
      "-5 starting reputation",
      "-2 starting specialization reputation",
    ],
    startingEffects: {
      reputationDelta: -5,
      specializationReputationDelta: -2,
    },
  },
] as const;

export const SCOUT_DOCTRINES: readonly ScoutDoctrineDefinition[] = [
  {
    id: "evidence-first",
    name: "Evidence First",
    description: "Prefer slower, longitudinal cases over a constant stream of reactive opportunities.",
    playerFacingEffects: [
      "Storylines are 15% more likely",
      "Standalone narrative events have a one-week longer cooldown",
      "Board recognition for well-supported reports is more common",
    ],
    simulationModifiers: {
      storylineChanceMultiplier: 1.15,
      narrativeCooldownDelta: 1,
      narrativeTypeWeights: { reportCitedInBoardMeeting: 1.4 },
    },
  },
  {
    id: "relationships-first",
    name: "Relationships First",
    description: "Treat access and reciprocity as the foundation of every credible scouting opinion.",
    playerFacingEffects: [
      "Storylines are 20% more likely",
      "Exclusive-access and network-expansion events are more common",
      "Contact betrayal also becomes a greater career risk",
    ],
    simulationModifiers: {
      storylineChanceMultiplier: 1.2,
      narrativeTypeWeights: {
        exclusiveAccess: 1.5,
        networkExpansion: 1.4,
        contactBetrayal: 1.2,
      },
    },
  },
  {
    id: "move-before-market",
    name: "Move Before the Market",
    description: "Accept less certainty in exchange for acting before rival departments finish their process.",
    playerFacingEffects: [
      "Narrative opportunities arrive 12% more often",
      "Rivals discover targets 12% slower and complete signings 18% less often",
      "Competitive bid decisions become more prominent",
    ],
    simulationModifiers: {
      narrativeEventChanceMultiplier: 1.12,
      rivalDiscoveryChanceMultiplier: 0.88,
      rivalSigningChanceMultiplier: 0.82,
      narrativeTypeWeights: { rivalPoachBid: 1.25 },
    },
  },
  {
    id: "contrarian-eye",
    name: "Contrarian Eye",
    description: "Deliberately investigate players and development paths the consensus has dismissed.",
    playerFacingEffects: [
      "Hidden-gem and late-bloomer events are 60% more prominent",
      "Long-form storylines are 10% more likely",
    ],
    simulationModifiers: {
      storylineChanceMultiplier: 1.1,
      narrativeTypeWeights: {
        hiddenGemVindication: 1.6,
        lateBloomingSurprise: 1.6,
      },
    },
  },
] as const;

const ORIGIN_BY_ID: ReadonlyMap<string, ScoutOriginDefinition> = new Map(
  SCOUT_ORIGINS.map((definition) => [definition.id, definition]),
);
const FLAW_BY_ID: ReadonlyMap<string, ScoutFlawDefinition> = new Map(
  SCOUT_FLAWS.map((definition) => [definition.id, definition]),
);
const DOCTRINE_BY_ID: ReadonlyMap<string, ScoutDoctrineDefinition> = new Map(
  SCOUT_DOCTRINES.map((definition) => [definition.id, definition]),
);

export interface ScoutIdentitySelection {
  originId?: string;
  flawId?: string;
  doctrineIds?: readonly string[];
}

function resolveDefinition<Definition>(
  id: string | undefined,
  catalog: ReadonlyMap<string, Definition>,
  label: string,
): Definition | undefined {
  if (!id) return undefined;
  const definition = catalog.get(id);
  if (!definition) throw new RangeError(`Unknown scout ${label}: ${id}`);
  return definition;
}

export function getScoutOriginDefinition(id: string | undefined): ScoutOriginDefinition | undefined {
  return resolveDefinition(id, ORIGIN_BY_ID, "origin");
}

export function getScoutFlawDefinition(id: string | undefined): ScoutFlawDefinition | undefined {
  return resolveDefinition(id, FLAW_BY_ID, "flaw");
}

export function getScoutDoctrineDefinitions(ids: readonly string[] = []): ScoutDoctrineDefinition[] {
  return [...new Set(ids)].map((id) => {
    const definition = resolveDefinition(id, DOCTRINE_BY_ID, "doctrine");
    if (!definition) throw new RangeError(`Unknown scout doctrine: ${id}`);
    return definition;
  });
}

function selectedDefinitions(selection: ScoutIdentitySelection): Array<
  ScoutOriginDefinition | ScoutFlawDefinition | ScoutDoctrineDefinition
> {
  return [
    getScoutOriginDefinition(selection.originId),
    getScoutFlawDefinition(selection.flawId),
    ...getScoutDoctrineDefinitions(selection.doctrineIds),
  ].filter((definition): definition is ScoutOriginDefinition | ScoutFlawDefinition | ScoutDoctrineDefinition =>
    Boolean(definition),
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function combinedStartingEffects(selection: ScoutIdentitySelection): StartingScoutEffects {
  const combined: StartingScoutEffects = {
    skillDeltas: {},
    attributeDeltas: {},
  };
  for (const definition of selectedDefinitions(selection)) {
    const effects = definition.startingEffects;
    if (!effects) continue;
    for (const [skill, delta] of Object.entries(effects.skillDeltas ?? {}) as [ScoutSkill, number][]) {
      combined.skillDeltas![skill] = (combined.skillDeltas![skill] ?? 0) + delta;
    }
    for (const [attribute, delta] of Object.entries(effects.attributeDeltas ?? {}) as [ScoutAttribute, number][]) {
      combined.attributeDeltas![attribute] = (combined.attributeDeltas![attribute] ?? 0) + delta;
    }
    combined.reputationDelta = (combined.reputationDelta ?? 0) + (effects.reputationDelta ?? 0);
    combined.specializationReputationDelta =
      (combined.specializationReputationDelta ?? 0)
      + (effects.specializationReputationDelta ?? 0);
    combined.fatigueDelta = (combined.fatigueDelta ?? 0) + (effects.fatigueDelta ?? 0);
    combined.homeFamiliarityDelta =
      (combined.homeFamiliarityDelta ?? 0) + (effects.homeFamiliarityDelta ?? 0);
    combined.startingContactRelationshipDelta =
      (combined.startingContactRelationshipDelta ?? 0)
      + (effects.startingContactRelationshipDelta ?? 0);
    combined.startingContactTrustDelta =
      (combined.startingContactTrustDelta ?? 0)
      + (effects.startingContactTrustDelta ?? 0);
  }
  return combined;
}

/** Apply deterministic creation-time effects after the scout's seeded variation. */
export function applyScoutIdentityStartingEffects(
  scout: Scout,
  selection: ScoutIdentitySelection,
): Scout {
  const effects = combinedStartingEffects(selection);
  const skills = { ...scout.skills };
  for (const [skill, delta] of Object.entries(effects.skillDeltas ?? {}) as [ScoutSkill, number][]) {
    skills[skill] = clamp(skills[skill] + delta, 1, 20);
  }
  const attributes = { ...scout.attributes };
  for (const [attribute, delta] of Object.entries(effects.attributeDeltas ?? {}) as [ScoutAttribute, number][]) {
    attributes[attribute] = clamp(attributes[attribute] + delta, 1, 20);
  }

  const countryReputations = { ...scout.countryReputations };
  const homeEntry = Object.entries(countryReputations)[0];
  if (homeEntry && effects.homeFamiliarityDelta) {
    const [countryKey, reputation] = homeEntry;
    countryReputations[countryKey] = {
      ...reputation,
      familiarity: clamp(
        reputation.familiarity + effects.homeFamiliarityDelta,
        0,
        100,
      ),
    };
  }

  return {
    ...scout,
    skills,
    attributes,
    reputation: clamp(scout.reputation + (effects.reputationDelta ?? 0), 0, 100),
    specializationReputation: clamp(
      scout.specializationReputation + (effects.specializationReputationDelta ?? 0),
      0,
      100,
    ),
    fatigue: clamp(scout.fatigue + (effects.fatigueDelta ?? 0), 0, 100),
    countryReputations,
  };
}

/** Apply network-related origin/flaw effects to the generated starting cast. */
export function applyScoutIdentityContactEffects(
  contacts: readonly Contact[],
  selection: ScoutIdentitySelection,
): Contact[] {
  const effects = combinedStartingEffects(selection);
  const relationshipDelta = effects.startingContactRelationshipDelta ?? 0;
  const trustDelta = effects.startingContactTrustDelta ?? 0;
  if (relationshipDelta === 0 && trustDelta === 0) return [...contacts];
  return contacts.map((contact) => {
    const relationship = clamp(contact.relationship + relationshipDelta, 0, 100);
    return {
      ...contact,
      relationship,
      trustLevel: clamp((contact.trustLevel ?? contact.relationship) + trustDelta, 0, 100),
      dormant: relationship <= 20,
    };
  });
}

export function getRunChoiceSimulationModifiers(
  selection: ScoutIdentitySelection,
): RunChoiceSimulationModifiers[] {
  // Persisted manifests may contain retired/modded catalog IDs. Unknown IDs
  // remain part of their immutable fingerprint but cannot crash weekly play.
  const knownDefinitions = [
    selection.originId ? ORIGIN_BY_ID.get(selection.originId) : undefined,
    selection.flawId ? FLAW_BY_ID.get(selection.flawId) : undefined,
    ...(selection.doctrineIds ?? []).map((id) => DOCTRINE_BY_ID.get(id)),
  ].filter((definition): definition is ScoutOriginDefinition | ScoutFlawDefinition | ScoutDoctrineDefinition =>
    Boolean(definition),
  );
  return knownDefinitions.flatMap((definition) =>
    definition.simulationModifiers ? [definition.simulationModifiers] : [],
  );
}

export function getScoutIdentityContentDefinitionIds(): string[] {
  return [
    ...SCOUT_ORIGINS.map((definition) => `scout-origin:${definition.id}`),
    ...SCOUT_FLAWS.map((definition) => `scout-flaw:${definition.id}`),
    ...SCOUT_DOCTRINES.map((definition) => `scout-doctrine:${definition.id}`),
  ].sort();
}

export function formatScoutIdentityBrief(selection: ScoutIdentitySelection): string {
  return selectedDefinitions(selection)
    .map((definition) => `${definition.name}: ${definition.playerFacingEffects.join("; ")}`)
    .join("\n");
}

export function scoutIdentitySelectionFromConfig(
  config: Pick<NewGameConfig, "originId" | "flawId" | "doctrineIds">,
): ScoutIdentitySelection {
  return {
    originId: config.originId,
    flawId: config.flawId,
    doctrineIds: config.doctrineIds,
  };
}
