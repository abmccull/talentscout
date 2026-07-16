import type { ContactType, GameState } from "@/engine/core/types";
import { createNamedRNG } from "@/engine/run";
import { getRecurringRelationshipIdentities } from "./relationshipIdentities";
import type { EntityRef, GameDate } from "./types";

export const STAKEHOLDER_PROFILE_REGISTRY_VERSION = 1 as const;

export type StakeholderProfileRole =
  | "family"
  | "journalist"
  | "agent"
  | "employee"
  | "rival"
  | "manager"
  | "director"
  | "coach"
  | "organizer"
  | "scout"
  | "contact";

export type StakeholderTrait =
  | "ambitious"
  | "cautious"
  | "communal"
  | "competitive"
  | "controlling"
  | "direct"
  | "idealistic"
  | "patient"
  | "political"
  | "protective"
  | "statusConscious"
  | "transactional";

export type StakeholderPriority =
  | "access"
  | "accuracy"
  | "autonomy"
  | "clubSuccess"
  | "control"
  | "credit"
  | "development"
  | "discretion"
  | "education"
  | "exclusivity"
  | "financialSecurity"
  | "integrity"
  | "privacy"
  | "publicity"
  | "speed"
  | "stability"
  | "status"
  | "territory"
  | "welfare";

export type StakeholderRedLine =
  | "brokenConfidence"
  | "creditTheft"
  | "dishonesty"
  | "ignoredDeadline"
  | "publicHumiliation"
  | "recklessPlayerRisk"
  | "territorialIntrusion"
  | "unfairTreatment";

export type StakeholderConflictStyle =
  | "direct"
  | "political"
  | "private"
  | "transactional";

/**
 * Identity and agenda only. Trust, morale, loyalty and aggression deliberately
 * remain authoritative in Contact, AgencyEmployee and RivalScout.
 */
export interface StakeholderProfile {
  entity: EntityRef;
  /** False after the authoritative person leaves; retained only for history. */
  active: boolean;
  role: StakeholderProfileRole;
  name: string;
  affiliation?: string;
  homeCountryId?: string;
  profileSeed: string;
  traits: [StakeholderTrait, StakeholderTrait];
  priorities: [StakeholderPriority, StakeholderPriority];
  redLine: StakeholderRedLine;
  conflictStyle: StakeholderConflictStyle;
  voiceId: string;
  createdAt: GameDate;
}

export interface StakeholderProfileRegistry {
  version: typeof STAKEHOLDER_PROFILE_REGISTRY_VERSION;
  profiles: Record<string, StakeholderProfile>;
}

interface ProfileSource {
  entity: EntityRef;
  role: StakeholderProfileRole;
  name: string;
  affiliation?: string;
  homeCountryId?: string;
}

interface RolePalette {
  traits: readonly StakeholderTrait[];
  priorities: readonly StakeholderPriority[];
  redLines: readonly StakeholderRedLine[];
  styles: readonly StakeholderConflictStyle[];
  voices: readonly string[];
}

const ROLE_PALETTES: Record<StakeholderProfileRole, RolePalette> = {
  family: {
    traits: ["protective", "cautious", "patient", "communal", "direct", "idealistic"],
    priorities: ["welfare", "privacy", "education", "stability", "development", "financialSecurity"],
    redLines: ["brokenConfidence", "recklessPlayerRisk", "dishonesty", "publicHumiliation"],
    styles: ["private", "direct"],
    voices: ["family-grounded", "family-protective", "family-pragmatic"],
  },
  journalist: {
    traits: ["ambitious", "direct", "competitive", "idealistic", "political", "statusConscious"],
    priorities: ["accuracy", "exclusivity", "publicity", "access", "speed", "integrity"],
    redLines: ["dishonesty", "ignoredDeadline", "brokenConfidence", "publicHumiliation"],
    styles: ["direct", "political", "transactional"],
    voices: ["press-investigator", "press-insider", "press-columnist"],
  },
  agent: {
    traits: ["ambitious", "controlling", "political", "transactional", "competitive", "patient"],
    priorities: ["control", "access", "speed", "financialSecurity", "credit", "discretion"],
    redLines: ["brokenConfidence", "creditTheft", "publicHumiliation", "dishonesty"],
    styles: ["transactional", "political", "direct"],
    voices: ["agent-dealmaker", "agent-gatekeeper", "agent-strategist"],
  },
  employee: {
    traits: ["ambitious", "communal", "direct", "patient", "competitive", "idealistic"],
    priorities: ["credit", "autonomy", "financialSecurity", "development", "stability", "status"],
    redLines: ["creditTheft", "unfairTreatment", "publicHumiliation", "dishonesty"],
    styles: ["direct", "private", "political"],
    voices: ["staff-rising", "staff-specialist", "staff-loyalist"],
  },
  rival: {
    traits: ["competitive", "ambitious", "patient", "political", "statusConscious", "direct"],
    priorities: ["territory", "credit", "status", "exclusivity", "speed", "control"],
    redLines: ["territorialIntrusion", "creditTheft", "publicHumiliation", "dishonesty"],
    styles: ["direct", "political", "transactional"],
    voices: ["rival-provocateur", "rival-professional", "rival-operator"],
  },
  manager: {
    traits: ["ambitious", "controlling", "direct", "patient", "political", "competitive"],
    priorities: ["clubSuccess", "speed", "control", "accuracy", "stability", "status"],
    redLines: ["dishonesty", "ignoredDeadline", "publicHumiliation", "unfairTreatment"],
    styles: ["direct", "political", "private"],
    voices: ["manager-pragmatist", "manager-controller", "manager-developer"],
  },
  director: {
    traits: ["political", "patient", "ambitious", "cautious", "controlling", "transactional"],
    priorities: ["clubSuccess", "financialSecurity", "control", "integrity", "status", "development"],
    redLines: ["dishonesty", "publicHumiliation", "ignoredDeadline", "unfairTreatment"],
    styles: ["political", "transactional", "private"],
    voices: ["director-budget", "director-vision", "director-politics"],
  },
  coach: {
    traits: ["patient", "protective", "direct", "idealistic", "communal", "cautious"],
    priorities: ["development", "welfare", "accuracy", "stability", "education", "integrity"],
    redLines: ["recklessPlayerRisk", "dishonesty", "unfairTreatment", "creditTheft"],
    styles: ["direct", "private"],
    voices: ["coach-teacher", "coach-realist", "coach-protector"],
  },
  organizer: {
    traits: ["communal", "transactional", "direct", "patient", "protective", "political"],
    priorities: ["access", "stability", "financialSecurity", "territory", "development", "integrity"],
    redLines: ["brokenConfidence", "unfairTreatment", "territorialIntrusion", "dishonesty"],
    styles: ["transactional", "direct", "private"],
    voices: ["organizer-local", "organizer-networker", "organizer-caretaker"],
  },
  scout: {
    traits: ["competitive", "patient", "direct", "cautious", "ambitious", "idealistic"],
    priorities: ["accuracy", "credit", "territory", "access", "integrity", "status"],
    redLines: ["creditTheft", "territorialIntrusion", "dishonesty", "publicHumiliation"],
    styles: ["direct", "private", "political"],
    voices: ["scout-traditional", "scout-analytical", "scout-networked"],
  },
  contact: {
    traits: ["transactional", "communal", "cautious", "direct", "patient", "political"],
    priorities: ["access", "discretion", "accuracy", "stability", "status", "integrity"],
    redLines: ["brokenConfidence", "dishonesty", "ignoredDeadline", "unfairTreatment"],
    styles: ["private", "transactional", "direct"],
    voices: ["contact-insider", "contact-pragmatist", "contact-observer"],
  },
};

function entityKey(entity: EntityRef): string {
  return `${entity.kind}:${entity.id}`;
}

function normalizedNameId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

/**
 * Canonical manager identity shared by meetings, dilemmas, memories, conflicts,
 * and the permanent archive. A generated manager id survives club/name copy
 * changes; legacy worlds without one fall back to club + normalized name.
 */
export function getManagerStakeholderRef(
  state: GameState,
  clubId: string | undefined = state.scout.currentClubId,
): EntityRef | undefined {
  if (!clubId) return undefined;
  const profile = state.managerProfiles?.[clubId];
  const managerName = profile?.managerName
    ?? (state.scout.currentClubId === clubId
      ? state.scout.managerRelationship?.managerName
      : undefined);
  const managerId = profile?.managerId
    ?? (!profile ? state.clubs[clubId]?.managerId : undefined);
  if (!managerId && !managerName) return undefined;
  return {
    kind: "manager",
    id: managerId ?? `${clubId}:${normalizedNameId(managerName ?? "unknown-manager")}`,
  };
}

/** Resolve canonical and pre-unification manager ids for save compatibility. */
export function resolveManagerStakeholderName(
  state: GameState,
  stakeholderId: string,
): string | undefined {
  for (const [clubId, manager] of Object.entries(state.managerProfiles ?? {})) {
    const canonical = getManagerStakeholderRef(state, clubId);
    const legacyProfileId = `${clubId}:${normalizedNameId(manager.managerName)}`;
    const legacyMeetingId = `${clubId}:${state.clubs[clubId]?.managerId ?? "unidentified"}:${normalizedNameId(manager.managerName)}`;
    if (
      canonical?.id === stakeholderId
      || legacyProfileId === stakeholderId
      || legacyMeetingId === stakeholderId
      || manager.managerName === stakeholderId
    ) return manager.managerName;
  }
  return undefined;
}

function roleForContact(type: ContactType): StakeholderProfileRole {
  if (type === "journalist") return "journalist";
  if (type === "agent" || type === "youthAgent") return "agent";
  if (type === "sportingDirector" || type === "academyDirector") return "director";
  if (type === "academyCoach" || type === "schoolCoach") return "coach";
  if (type === "grassrootsOrganizer") return "organizer";
  if (type === "scout" || type === "localScout") return "scout";
  return "contact";
}

function pickDistinct<T>(values: readonly T[], rng: ReturnType<typeof createNamedRNG>): [T, T] {
  const firstIndex = rng.nextInt(0, values.length - 1);
  let secondIndex = rng.nextInt(0, values.length - 2);
  if (secondIndex >= firstIndex) secondIndex += 1;
  return [values[firstIndex], values[secondIndex]];
}

function generateProfile(
  rootSeed: string,
  source: ProfileSource,
  createdAt: GameDate,
): StakeholderProfile {
  const key = entityKey(source.entity);
  const profileSeed = `${rootSeed}:stakeholder-profile:v1:${key}`;
  const rng = createNamedRNG(rootSeed, "stakeholder-profile", key);
  const palette = ROLE_PALETTES[source.role];
  return {
    entity: { ...source.entity },
    active: true,
    role: source.role,
    name: source.name,
    affiliation: source.affiliation,
    homeCountryId: source.homeCountryId,
    profileSeed,
    traits: pickDistinct(palette.traits, rng),
    priorities: pickDistinct(palette.priorities, rng),
    redLine: rng.pick(palette.redLines),
    conflictStyle: rng.pick(palette.styles),
    voiceId: rng.pick(palette.voices),
    createdAt: { ...createdAt },
  };
}

function profileSources(state: GameState): ProfileSource[] {
  const sources: ProfileSource[] = [];
  for (const contact of Object.values(state.contacts)) {
    sources.push({
      entity: { kind: "contact", id: contact.id },
      role: roleForContact(contact.type),
      name: contact.name,
      affiliation: contact.organization,
      homeCountryId: contact.country,
    });
  }
  for (const employee of state.finances?.employees ?? []) {
    sources.push({
      entity: { kind: "employee", id: employee.id },
      role: "employee",
      name: employee.name,
      affiliation: "Your agency",
      homeCountryId: employee.regionSpecialization,
    });
  }
  for (const rival of Object.values(state.rivalScouts)) {
    sources.push({
      entity: { kind: "rival", id: rival.id },
      role: "rival",
      name: rival.name,
      affiliation: state.clubs[rival.clubId]?.name,
    });
  }
  for (const [clubId, manager] of Object.entries(state.managerProfiles)) {
    const entity = getManagerStakeholderRef(state, clubId);
    if (!entity) continue;
    sources.push({
      entity,
      role: "manager",
      name: manager.managerName,
      affiliation: state.clubs[clubId]?.name,
    });
  }
  if (state.boardProfile && state.scout.currentClubId) {
    const clubId = state.scout.currentClubId;
    sources.push({
      entity: { kind: "board", id: clubId },
      role: "director",
      name: `${state.clubs[clubId]?.shortName ?? state.clubs[clubId]?.name ?? "Club"} board`,
      affiliation: state.clubs[clubId]?.name,
    });
  }
  for (const identity of getRecurringRelationshipIdentities(state)) {
    if (identity.role !== "family") continue;
    sources.push({
      entity: { ...identity.entity },
      role: "family",
      name: identity.name,
      affiliation: identity.affiliation,
    });
  }
  return [...new Map(sources.map((source) => [entityKey(source.entity), source])).values()]
    .sort((left, right) => entityKey(left.entity).localeCompare(entityKey(right.entity)));
}

export function createStakeholderProfileRegistry(
  state: GameState,
  existing?: StakeholderProfileRegistry,
): StakeholderProfileRegistry {
  const profiles = Object.fromEntries(
    Object.entries(existing?.profiles ?? {}).map(([key, profile]) => [
      key,
      { ...profile, active: false },
    ]),
  );
  const createdAt = { week: state.currentWeek, season: state.currentSeason };
  for (const source of profileSources(state)) {
    const key = entityKey(source.entity);
    let current = profiles[key];
    if (!current && source.role === "manager") {
      const legacy = Object.entries(profiles).find(([, profile]) =>
        profile.role === "manager"
        && profile.name === source.name
        && profile.affiliation === source.affiliation,
      );
      if (legacy) {
        current = legacy[1];
        delete profiles[legacy[0]];
      }
    }
    profiles[key] = current
      ? {
          ...current,
          entity: { ...source.entity },
          active: true,
          role: source.role,
          name: source.name,
          affiliation: source.affiliation,
          homeCountryId: source.homeCountryId,
        }
      : generateProfile(state.runManifest.rootSeed, source, createdAt);
  }
  return {
    version: STAKEHOLDER_PROFILE_REGISTRY_VERSION,
    profiles,
  };
}

export function getStakeholderProfile(
  registry: StakeholderProfileRegistry,
  entity: EntityRef,
): StakeholderProfile | undefined {
  return registry.profiles[entityKey(entity)];
}

/** Metric keys are references to existing authority, never copied values. */
export function getStakeholderAuthoritativeMetricKeys(
  profile: StakeholderProfile,
): string[] {
  if (profile.entity.kind === "contact") {
    return [
      `contact:${profile.entity.id}:relationship`,
      `contact:${profile.entity.id}:trust`,
      `contact:${profile.entity.id}:loyalty`,
    ];
  }
  if (profile.entity.kind === "employee") return [`employee:${profile.entity.id}:morale`];
  if (profile.entity.kind === "rival") return [`rival:${profile.entity.id}:aggressiveness`];
  return [];
}
