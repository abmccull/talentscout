import type {
  ActionableGossipItem,
  Contact,
  ContactInteraction,
  FinancialRecord,
  GameDate,
  GameState,
  GossipItem,
  PersonalityArchetype,
  Player,
  RivalScout,
} from "@/engine/core/types";
import { addGameWeeks, getSeasonLength } from "@/engine/core/gameDate";
import { generateSeasonEvents } from "@/engine/core/seasonEvents";
import { deriveTacticalStyleFromPhilosophy } from "@/engine/firstTeam/tacticalStyle";
import { migrateLegacyTransferParticipation } from "@/engine/firstTeam/transferTracker";
import {
  migrateEmployeeSkillsInRecord,
  migrateEquipmentLevel,
  migrateFinancialRecord,
  migrateReportListingBids,
  normalizeClubEconomicsMap,
  normalizeEmployeeContractsInRecord,
} from "@/engine/finance";
import { migratePoliticalMeetingState } from "@/engine/career/politicalMeetings";
import { createRNG } from "@/engine/rng";
import { migrateScoutingCases } from "@/engine/reports";
import { migrateRivalOrganizationState } from "@/engine/rivals";
import { createWeekSchedule } from "@/engine/core/calendar";
import { createEmptyPool } from "@/engine/freeAgents/pool";
import {
  initializeRegionalKnowledge,
  synchronizeRegionalFamiliarity,
} from "@/engine/specializations/regionalKnowledge";
import { getUnlockedPerks } from "@/engine/specializations/perks";
import { migrateObservationSessionInteractions } from "@/engine/observation/interactionSelection";
import { migrateInternationalAssignment } from "@/engine/world/internationalDeliverables";
import { compactLongCareerHistory } from "@/engine/world/saveRetention";
import {
  getTravelEligibleCountryKeys,
  isInternationalAssignmentEligibleCountry,
  isTravelEligibleCountry,
} from "@/engine/world/countryAvailability";
import { getScoutHomeCountry } from "@/engine/world/travel";
import { generateSubRegions } from "@/engine/youth/generation";
import { reconcileScenarioAuthority } from "@/engine/scenarios/scenarioAuthority";
import { getCountryDisplayName, normalizeCountryKey } from "@/lib/country";
import { resetRebuildableGameStateCaches } from "@/engine/core/gameStatePartitions";
import { createStoryDirectorStateV2 } from "@/engine/events/storyDirectorV2";
import { createStakeholderProfileRegistry } from "@/engine/consequences/stakeholderProfiles";
import { createCareerStoryArchiveState } from "@/engine/consequences/careerStoryArchive";
import {
  createCareerChronologyState,
  inferLegacyCareerChronology,
} from "@/engine/career/chronology";
import { createCareerMomentState } from "@/engine/career/careerMoments";

type LegacyContactInteraction = Omit<ContactInteraction, "occurredAt"> & {
  occurredAt?: GameDate;
  week?: number;
  season?: number;
};

type LegacyGossipItem = Omit<
  GossipItem,
  "claimStatus" | "revealedAt" | "expiresAt"
> & {
  claimStatus?: GossipItem["claimStatus"];
  revealedAt?: GameDate;
  expiresAt?: GameDate;
  revealedWeek?: number;
  revealedSeason?: number;
  expiresWeek?: number;
  expiresSeason?: number;
};

type LegacyContact = Omit<
  Contact,
  "lastInteractionAt" | "interactionHistory" | "gossipQueue" | "exclusiveWindow"
> & {
  trustLevel?: number;
  loyalty?: number;
  lastInteractionAt?: GameDate;
  lastInteractionWeek?: number;
  lastInteractionSeason?: number;
  interactionHistory?: LegacyContactInteraction[];
  gossipQueue?: LegacyGossipItem[];
  exclusiveWindow?: {
    playerId: string;
    expiresAt?: GameDate;
    expiresWeek?: number;
    expiresSeason?: number;
  };
  referralNetwork?: Contact["referralNetwork"];
  betrayalRisk?: number;
};

type LegacyActionableGossipItem = Omit<
  ActionableGossipItem,
  keyof GossipItem | "contactId"
> & {
  id: string;
  contactId: string;
  subjectPlayerId: string;
  gossipType: GossipItem["type"];
  description: string;
  week: number;
  season: number;
  resolvedAccurate?: boolean;
  actionTaken?: GossipItem["actionTaken"];
  dismissed?: boolean;
};

type LegacyNetworkGameState = GameState & {
  gossipItems?: LegacyActionableGossipItem[];
};

type LegacyRival = RivalScout & {
  scoutingProgress?: Record<string, number>;
  aggressiveness?: number;
  budgetTier?: "low" | "medium" | "high";
};

function clampAttribute(value: number): number {
  const bounded = Number.isFinite(value) ? value : 10;
  return Math.round(Math.max(1, Math.min(20, bounded)));
}

/** Legacy partial records may omit one or more source attributes. */
function legacyAttributeValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 10;
}

function migratePlayerRolesAndTraits(state: GameState): void {
  const migratePlayer = (player: Player): void => {
    const attributes = player.attributes;
    // Some very early youth saves only retained identity and potential. Those
    // records are still valid historical prospects, but there is no defensible
    // attribute basis from which to invent a tactical profile.
    if (!attributes || typeof attributes !== "object") {
      player.playerTraits ??= [];
      player.playerTraitsRevealed ??= [];
      return;
    }
    if (!Number.isFinite(attributes.tackling)) {
      const defensiveAwareness = legacyAttributeValue(attributes.defensiveAwareness);
      const strength = legacyAttributeValue(attributes.strength);
      const shooting = legacyAttributeValue(attributes.shooting);
      const composure = legacyAttributeValue(attributes.composure);
      const heading = legacyAttributeValue(attributes.heading);
      const agility = legacyAttributeValue(attributes.agility);
      const positioning = legacyAttributeValue(attributes.positioning);
      const decisionMaking = legacyAttributeValue(attributes.decisionMaking);
      const passing = legacyAttributeValue(attributes.passing);
      const workRate = legacyAttributeValue(attributes.workRate);
      attributes.tackling = clampAttribute(
        defensiveAwareness * 0.6 + strength * 0.4,
      );
      attributes.finishing = clampAttribute(
        shooting * 0.7 + composure * 0.3,
      );
      attributes.jumping = clampAttribute(
        heading * 0.5 + strength * 0.3 + agility * 0.2,
      );
      attributes.balance = clampAttribute(
        agility * 0.6 + strength * 0.4,
      );
      attributes.anticipation = clampAttribute(
        positioning * 0.5 + decisionMaking * 0.5,
      );
      attributes.vision = clampAttribute(
        passing * 0.5 + decisionMaking * 0.5,
      );
      attributes.marking = clampAttribute(
        defensiveAwareness * 0.7 + positioning * 0.3,
      );
      attributes.teamwork = clampAttribute(
        workRate * 0.6 + decisionMaking * 0.4,
      );
    }
    player.playerTraits ??= [];
    player.playerTraitsRevealed ??= [];
  };

  Object.values(state.players).forEach(migratePlayer);
  Object.values(state.unsignedYouth ?? {}).forEach((youth) => {
    if (youth?.player) migratePlayer(youth.player);
  });

  for (const club of Object.values(state.clubs)) {
    club.tacticalStyle ??= deriveTacticalStyleFromPhilosophy(
      club.scoutingPhilosophy,
      club.reputation,
    );
  }
}

function migrateMatchRatings(state: GameState): void {
  state.matchRatings ??= {};
  for (const player of Object.values(state.players)) {
    player.recentMatchRatings ??= [];
    player.seasonRatings ??= [];
  }
  for (const youth of Object.values(state.unsignedYouth ?? {})) {
    if (!youth?.player) continue;
    youth.player.recentMatchRatings ??= [];
    youth.player.seasonRatings ??= [];
  }
}

function migrateInjurySystem(state: GameState): void {
  const migratePlayer = (player: Player): void => {
    player.injuryHistory ??= {
      playerId: player.id,
      injuries: [],
      totalWeeksMissed: 0,
      injuryProneness: 0,
      reinjuryWindowWeeksLeft: 0,
    };
    if (player.injured && !player.currentInjury) {
      const weeksRemaining = Math.max(0, player.injuryWeeksRemaining ?? 0);
      player.currentInjury = {
        id: `inj_migrated_${player.id}`,
        playerId: player.id,
        type: "knock",
        severity: weeksRemaining <= 2 ? "minor" : weeksRemaining <= 5 ? "moderate" : "serious",
        recoveryWeeks: weeksRemaining,
        weeksRemaining,
        reinjuryRisk: 0,
        occurredWeek: state.currentWeek,
        occurredSeason: state.currentSeason,
      };
    }
  };

  Object.values(state.players).forEach(migratePlayer);
  Object.values(state.unsignedYouth ?? {}).forEach((youth) => {
    if (youth?.player) migratePlayer(youth.player);
  });
}

function migrateSeasonEvents(state: GameState): void {
  if (state.seasonEvents.length === 0) return;
  const freshEvents = generateSeasonEvents(
    state.currentSeason,
    getSeasonLength(state.fixtures, state.currentSeason),
  );
  const existingByName = new Map(state.seasonEvents.map((event) => [event.name, event]));
  state.seasonEvents = freshEvents.map((template) => {
    const existing = existingByName.get(template.name);
    return existing
      ? {
          ...template,
          resolved: existing.resolved ?? false,
          choiceSelected: existing.choiceSelected,
        }
      : template;
  });
}

function migrateInboxMessages(state: GameState): void {
  if (state.inbox.length === 0 || state.seasonEvents.length === 0) return;
  const seasonEventsByName = new Map(state.seasonEvents.map((event) => [event.name, event]));
  state.inbox = state.inbox.map((message) => {
    if (message.type !== "event") return message;
    const titleBase = message.title.replace(/\s+— Decision Required$/, "");
    const seasonEvent = seasonEventsByName.get(titleBase);
    if (!seasonEvent) return message;
    const actionable = !seasonEvent.resolved && (
      !seasonEvent.relevantSpecializations
      || seasonEvent.relevantSpecializations.includes(state.scout.primarySpecialization)
    );
    return {
      ...message,
      title: actionable ? `${seasonEvent.name} — Decision Required` : seasonEvent.name,
      body: actionable
        ? `${seasonEvent.description}. You have a decision to make regarding your scouting strategy during this period.`
        : `${seasonEvent.description}. This shapes the wider football landscape, but there is nothing you need to decide directly right now.`,
      actionRequired: actionable,
      relatedId: seasonEvent.id,
      relatedEntityType: "seasonEvent",
    };
  });
}

function migratePersonalityProfiles(state: GameState): void {
  const defaults: Record<
    PersonalityArchetype,
    { transferWillingness: number; dressingRoomImpact: number; formVolatility: number; bigMatchModifier: number }
  > = {
    leader: { transferWillingness: 0.3, dressingRoomImpact: 3, formVolatility: 0.3, bigMatchModifier: 1 },
    mercenary: { transferWillingness: 0.9, dressingRoomImpact: -1, formVolatility: 0.5, bigMatchModifier: 0 },
    homesick: { transferWillingness: 0.2, dressingRoomImpact: 0, formVolatility: 0.6, bigMatchModifier: -1 },
    ambitious: { transferWillingness: 0.7, dressingRoomImpact: 1, formVolatility: 0.4, bigMatchModifier: 1 },
    loyal: { transferWillingness: 0.15, dressingRoomImpact: 2, formVolatility: 0.25, bigMatchModifier: 0 },
    disruptive: { transferWillingness: 0.6, dressingRoomImpact: -2, formVolatility: 0.7, bigMatchModifier: 0 },
    introvert: { transferWillingness: 0.35, dressingRoomImpact: 0, formVolatility: 0.35, bigMatchModifier: -1 },
    professional: { transferWillingness: 0.5, dressingRoomImpact: 1, formVolatility: 0.2, bigMatchModifier: 0 },
    hothead: { transferWillingness: 0.55, dressingRoomImpact: -1, formVolatility: 0.8, bigMatchModifier: -1 },
    clutch: { transferWillingness: 0.4, dressingRoomImpact: 2, formVolatility: 0.35, bigMatchModifier: 2 },
  };
  const migratePlayer = (player: Player): void => {
    if (player.personalityProfile) return;
    const traits = player.personalityTraits ?? [];
    const traitSet = new Set(traits);
    let archetype: PersonalityArchetype = "professional";
    if (traitSet.has("leader")) archetype = "leader";
    else if (traitSet.has("bigGamePlayer") || traitSet.has("pressurePlayer")) archetype = "clutch";
    else if (traitSet.has("ambitious") || traitSet.has("flair")) archetype = "ambitious";
    else if (traitSet.has("loyal") || traitSet.has("modelCitizen")) archetype = "loyal";
    else if (traitSet.has("temperamental") && traitSet.has("controversialCharacter")) archetype = "disruptive";
    else if (traitSet.has("temperamental")) archetype = "hothead";
    else if (traitSet.has("introvert")) archetype = "introvert";
    const defaultProfile = defaults[archetype];
    player.personalityProfile = {
      archetype,
      traits: [...traits],
      transferWillingness: defaultProfile.transferWillingness,
      dressingRoomImpact: defaultProfile.dressingRoomImpact,
      formVolatility: defaultProfile.formVolatility,
      bigMatchModifier: defaultProfile.bigMatchModifier,
      hiddenUntilRevealed: true,
      revealedTraits: [...(player.personalityRevealed ?? [])],
    };
  };
  Object.values(state.players).forEach(migratePlayer);
  Object.values(state.unsignedYouth ?? {}).forEach((youth) => {
    if (youth?.player) migratePlayer(youth.player);
  });
}

function migrateRegionalKnowledgeAndPresence(state: GameState): void {
  if (!state.regionalKnowledge || Object.keys(state.regionalKnowledge).length === 0) {
    const startingCountry = normalizeCountryKey(getScoutHomeCountry(state.scout))
      ?? normalizeCountryKey(state.countries[0])
      ?? "england";
    state.regionalKnowledge = initializeRegionalKnowledge(state.countries, startingCountry);
  }
  if (!state.subRegions || Object.keys(state.subRegions).length === 0) {
    const generatedSubRegions: GameState["subRegions"] = {};
    for (const countryKey of state.countries) {
      const countryName = getCountryDisplayName(countryKey);
      for (const subRegion of generateSubRegions(countryName)) {
        generatedSubRegions[subRegion.id] = subRegion;
      }
    }
    state.subRegions = generatedSubRegions;
  }
  for (const subRegion of Object.values(state.subRegions)) {
    subRegion.countryKey ??= normalizeCountryKey(subRegion.country);
  }
  for (const territory of Object.values(state.territories)) {
    territory.countryKey ??= normalizeCountryKey(territory.country)
      ?? normalizeCountryKey(territory.id.replace(/^territory_/, ""));
  }
  for (const tournament of Object.values(state.youthTournaments ?? {})) {
    tournament.countryKey ??= normalizeCountryKey(tournament.country);
  }
  const synchronized = synchronizeRegionalFamiliarity(
    state.scout,
    state.subRegions,
    state.regionalKnowledge,
  );
  state.scout = synchronized.scout;
  state.subRegions = synchronized.subRegions;

  const eligibleCountries = new Set(getTravelEligibleCountryKeys(state));
  const homeCountry = [
    normalizeCountryKey(state.scout.homeCountry),
    state.runManifest.startingCountry
      ? normalizeCountryKey(state.runManifest.startingCountry)
      : undefined,
    normalizeCountryKey(getScoutHomeCountry(state.scout)),
    normalizeCountryKey(state.countries[0]),
  ].find((country): country is string => typeof country === "string" && country.length > 0 && (
    eligibleCountries.size === 0 || eligibleCountries.has(country)
  ));
  if (homeCountry) state.scout = { ...state.scout, homeCountry };

  if (!state.finances) return;
  const employeeIds = new Set(state.finances.employees.map((employee) => employee.id));
  const claimedEmployees = new Set<string>();
  const claimedCountries = new Set<string>();
  state.finances = {
    ...state.finances,
    satelliteOffices: (state.finances.satelliteOffices ?? []).flatMap((office) => {
      const country = normalizeCountryKey(office.region);
      if (!country || claimedCountries.has(country)) return [];
      if (eligibleCountries.size > 0 && !eligibleCountries.has(country)) return [];
      claimedCountries.add(country);
      const employeeIdsForOffice = [...new Set(office.employeeIds)].filter((employeeId) => {
        if (!employeeIds.has(employeeId) || claimedEmployees.has(employeeId)) return false;
        claimedEmployees.add(employeeId);
        return true;
      });
      return [{ ...office, region: country, employeeIds: employeeIdsForOffice }];
    }),
  };
}

function migrateInternationalDestinationEligibility(state: GameState): void {
  state.internationalAssignments = state.internationalAssignments.filter((assignment) =>
    isInternationalAssignmentEligibleCountry(state, assignment.country),
  );
  if (
    state.activeInternationalAssignment
    && !isInternationalAssignmentEligibleCountry(state, state.activeInternationalAssignment.country)
  ) {
    state.activeInternationalAssignment = null;
  }
  const booking = state.scout.travelBooking;
  if (!booking || isTravelEligibleCountry(state, booking.destinationCountry)) return;
  const destinationKey = normalizeCountryKey(booking.destinationCountry);
  state.scout = { ...state.scout, travelBooking: undefined };
  state.schedule = {
    ...state.schedule,
    activities: state.schedule.activities.map((activity) =>
      activity?.type === "internationalTravel"
      && normalizeCountryKey(activity.targetId) === destinationKey
        ? null
        : activity,
    ),
  };
}

function isGameDate(value: unknown): value is GameDate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameDate>;
  return Number.isInteger(candidate.season)
    && (candidate.season ?? 0) >= 1
    && Number.isInteger(candidate.week)
    && (candidate.week ?? 0) >= 1;
}

function clampWeekToSeason(state: GameState, date: GameDate): GameDate {
  const season = Math.max(1, Math.floor(date.season));
  const seasonLength = getSeasonLength(state.fixtures, season);
  if (date.week <= seasonLength) {
    return { season, week: Math.max(1, Math.floor(date.week)) };
  }
  return addGameWeeks(
    state.fixtures,
    { season, week: 1 },
    Math.max(0, Math.floor(date.week) - 1),
  );
}

function inferLegacyPastDate(
  state: GameState,
  week: number | undefined,
  season?: number,
): GameDate | undefined {
  if (!Number.isFinite(week)) return undefined;
  const boundedWeek = Math.max(1, Math.floor(week!));
  const inferredSeason = Number.isInteger(season) && (season ?? 0) >= 1
    ? Math.floor(season!)
    : boundedWeek > state.currentWeek && state.currentSeason > 1
      ? state.currentSeason - 1
      : state.currentSeason;
  return clampWeekToSeason(state, { season: inferredSeason, week: boundedWeek });
}

function inferLegacyExpiryDate(
  state: GameState,
  week: number | undefined,
  season?: number,
): GameDate | undefined {
  if (!Number.isFinite(week)) return undefined;
  const boundedWeek = Math.max(1, Math.floor(week!));
  const explicitSeason = Number.isInteger(season) && (season ?? 0) >= 1
    ? Math.floor(season!)
    : undefined;
  if (explicitSeason !== undefined) {
    return clampWeekToSeason(state, { season: explicitSeason, week: boundedWeek });
  }

  const currentSeasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  const baseSeason = boundedWeek > currentSeasonLength && state.currentSeason > 1
    ? state.currentSeason - 1
    : state.currentSeason;
  return clampWeekToSeason(state, { season: baseSeason, week: boundedWeek });
}

function migrateContactInteraction(
  state: GameState,
  interaction: LegacyContactInteraction,
): ContactInteraction | null {
  const occurredAt = isGameDate(interaction.occurredAt)
    ? clampWeekToSeason(state, interaction.occurredAt)
    : inferLegacyPastDate(state, interaction.week, interaction.season);
  if (!occurredAt) return null;
  return {
    occurredAt,
    type: interaction.type,
    trustDelta: Number.isFinite(interaction.trustDelta) ? interaction.trustDelta : 0,
  };
}

function migrateContactGossip(
  state: GameState,
  gossip: LegacyGossipItem,
): GossipItem | null {
  const revealedAt = isGameDate(gossip.revealedAt)
    ? clampWeekToSeason(state, gossip.revealedAt)
    : inferLegacyPastDate(state, gossip.revealedWeek, gossip.revealedSeason);
  if (!revealedAt) return null;

  let expiresAt: GameDate;
  if (isGameDate(gossip.expiresAt)) {
    expiresAt = clampWeekToSeason(state, gossip.expiresAt);
  } else if (
    Number.isFinite(gossip.expiresWeek)
    && Number.isFinite(gossip.revealedWeek)
    && gossip.expiresSeason === undefined
  ) {
    expiresAt = addGameWeeks(
      state.fixtures,
      revealedAt,
      Math.max(0, Math.floor(gossip.expiresWeek! - gossip.revealedWeek!)),
    );
  } else {
    expiresAt = inferLegacyExpiryDate(
      state,
      gossip.expiresWeek,
      gossip.expiresSeason,
    ) ?? addGameWeeks(state.fixtures, revealedAt, 6);
  }

  const claimStatus = gossip.claimStatus === "accurate"
    || gossip.claimStatus === "inaccurate"
    || gossip.claimStatus === "ambiguous"
      ? gossip.claimStatus
      : "ambiguous";
  return {
    id: gossip.id,
    type: gossip.type,
    playerId: gossip.playerId,
    clubId: gossip.clubId,
    reliability: Number.isFinite(gossip.reliability)
      ? Math.max(0, Math.min(1, gossip.reliability))
      : 0.5,
    claimStatus,
    revealedAt,
    expiresAt,
    content: gossip.content,
    actionTaken: gossip.actionTaken,
    dismissed: gossip.dismissed ?? false,
  };
}

function migrateContactNetworkDatesAndGossip(state: GameState): void {
  const legacyState = state as LegacyNetworkGameState;
  for (const [contactId, rawContact] of Object.entries(state.contacts) as Array<
    [string, LegacyContact]
  >) {
    const lastInteractionAt = isGameDate(rawContact.lastInteractionAt)
      ? clampWeekToSeason(state, rawContact.lastInteractionAt)
      : inferLegacyPastDate(
          state,
          rawContact.lastInteractionWeek,
          rawContact.lastInteractionSeason,
        );
    const interactionHistory = (rawContact.interactionHistory ?? [])
      .map((interaction) => migrateContactInteraction(state, interaction))
      .filter((interaction): interaction is ContactInteraction => interaction !== null);
    const gossipQueue = (rawContact.gossipQueue ?? [])
      .map((gossip) => migrateContactGossip(state, gossip))
      .filter((gossip): gossip is GossipItem => gossip !== null);
    const exclusiveExpiresAt = rawContact.exclusiveWindow
      ? isGameDate(rawContact.exclusiveWindow.expiresAt)
        ? clampWeekToSeason(state, rawContact.exclusiveWindow.expiresAt)
        : inferLegacyExpiryDate(
            state,
            rawContact.exclusiveWindow.expiresWeek,
            rawContact.exclusiveWindow.expiresSeason,
          )
      : undefined;

    const migrated: Contact = {
      ...rawContact,
      lastInteractionAt,
      interactionHistory,
      gossipQueue,
      exclusiveWindow: rawContact.exclusiveWindow && exclusiveExpiresAt
        ? {
            playerId: rawContact.exclusiveWindow.playerId,
            expiresAt: exclusiveExpiresAt,
          }
        : undefined,
      accessSuspendedUntil: isGameDate(rawContact.accessSuspendedUntil)
        ? clampWeekToSeason(state, rawContact.accessSuspendedUntil)
        : undefined,
    };
    const migratedRecord = migrated as unknown as Record<string, unknown>;
    delete migratedRecord.lastInteractionWeek;
    delete migratedRecord.lastInteractionSeason;
    state.contacts[contactId] = migrated;
  }

  for (const legacyGossip of legacyState.gossipItems ?? []) {
    const contact = state.contacts[legacyGossip.contactId];
    if (!contact || (contact.gossipQueue ?? []).some((item) => item.id === legacyGossip.id)) {
      continue;
    }
    const revealedAt = clampWeekToSeason(state, {
      season: Math.max(1, legacyGossip.season),
      week: Math.max(1, legacyGossip.week),
    });
    const migrated: GossipItem = {
      id: legacyGossip.id,
      type: legacyGossip.gossipType,
      playerId: legacyGossip.subjectPlayerId,
      reliability: Math.max(0, Math.min(1, contact.reliability / 100)),
      claimStatus: legacyGossip.resolvedAccurate === true
        ? "accurate"
        : legacyGossip.resolvedAccurate === false
          ? "inaccurate"
          : "ambiguous",
      revealedAt,
      expiresAt: addGameWeeks(state.fixtures, revealedAt, 6),
      content: legacyGossip.description,
      actionTaken: legacyGossip.actionTaken,
      dismissed: legacyGossip.dismissed ?? false,
    };
    contact.gossipQueue = [...(contact.gossipQueue ?? []), migrated];
  }
  delete legacyState.gossipItems;
}

function migrateRivalsContactsAndAlumni(state: GameState): void {
  state.rivalActivities ??= [];
  for (const rival of Object.values(state.rivalScouts) as LegacyRival[]) {
    rival.scoutingProgress ??= {};
    if (rival.aggressiveness === undefined) {
      rival.aggressiveness = {
        aggressive: 0.8,
        methodical: 0.3,
        connected: 0.5,
        lucky: 0.6,
      }[rival.personality] ?? 0.5;
    }
    rival.budgetTier ??= "medium";
  }
  for (const contact of Object.values(state.contacts) as LegacyContact[]) {
    contact.trustLevel ??= contact.relationship ?? 30;
    contact.loyalty ??= 50;
    contact.interactionHistory ??= [];
    contact.gossipQueue ??= [];
    contact.referralNetwork ??= [];
    contact.betrayalRisk ??= 0;
  }
  migrateContactNetworkDatesAndGossip(state);
  for (const record of state.alumniRecords) {
    record.careerUpdates ??= [];
    record.currentStatus ??= "academy";
    record.seasonStats ??= [];
    record.becameContact ??= false;
  }
}

/**
 * Fill required collection/index fields that were introduced after the first
 * public save format. This belongs at the persistence boundary rather than in
 * a UI store: cloud, recovery, direct imports, and tests must all receive the
 * same structurally usable state.
 */
function normalizeRequiredStateShape(state: GameState): void {
  state.seed ||= state.runManifest?.rootSeed || "legacy-import";
  state.difficulty ??= "normal";
  state.schedule ??= createWeekSchedule(state.currentWeek, state.currentSeason);
  state.activeStorylines ??= [];
  state.eventChains ??= [];
  state.satisfactionHistory ??= [];
  state.systemFitCache ??= {};
  state.freeAgentNegotiations ??= [];
  state.freeAgentPool ??= createEmptyPool(state.currentSeason);
  state.freeAgentPool.agents ??= [];
  state.freeAgentPool.lastRefreshSeason ??= state.currentSeason;
  state.freeAgentPool.totalReleasedThisSeason ??= 0;
  state.freeAgentPool.totalSignedThisSeason ??= 0;
  state.freeAgentPool.totalRetiredThisSeason ??= 0;
  state.createdAt ??= 0;
  state.lastSaved ??= 0;
  state.totalWeeksPlayed ??= 0;

  // Pre-economics saves can have a financial envelope without the later
  // expense map. `migrateFinancialRecord` deliberately retains historical
  // cash, so only supply an empty category map here; it will add the canonical
  // expense categories without inventing spending.
  if (state.finances) {
    state.finances.expenses ??= {} as FinancialRecord["expenses"];
  }
}

function migrateScoutEmploymentContract(state: GameState): void {
  const scout = state.scout;
  if (
    scout.employmentContract
    || scout.careerPath !== "club"
    || !scout.currentClubId
  ) return;

  const endSeason = Math.max(
    state.currentSeason,
    scout.contractEndSeason ?? state.currentSeason + 1,
  );
  scout.contractEndSeason = endSeason;
  scout.employmentContract = {
    id: `legacy-scout-contract:${scout.currentClubId}:s${endSeason}`,
    clubId: scout.currentClubId,
    role: scout.careerTier >= 4 ? "Head of Scouting" : "Club Scout",
    tier: scout.careerTier,
    weeklySalary: Math.max(0, scout.salary),
    startSeason: Math.max(1, endSeason - 1),
    endSeason,
    status: endSeason <= state.currentSeason ? "expiring" : "active",
    objectives: {
      reportsPerSeason: 10 + scout.careerTier * 5,
      minimumAverageQuality: 42 + scout.careerTier * 7,
      successfulRecommendations: Math.max(1, scout.careerTier - 1),
    },
    signingBonus: 0,
    performanceBonusRate: 0.05 + scout.careerTier * 0.02,
    severanceWeeks: scout.careerTier >= 5 ? 16 : scout.careerTier >= 4 ? 10 : 4,
    educationBudget: scout.careerTier * 750,
  };
}

/**
 * Gameplay-specific compatibility repairs. This owns every persisted-state
 * mutation that used to happen inside the Zustand load action, so local,
 * cloud, recovery, direct-import, and test loads now share one migration path.
 * The caller has already cloned and validated the state.
 */
export function applyGameplaySaveMigrations(state: GameState): GameState {
  normalizeRequiredStateShape(state);
  migrateScoutEmploymentContract(state);
  if (state.finances && !state.finances.equipment) {
    state.finances.equipment = migrateEquipmentLevel(state.finances.equipmentLevel);
  }
  if (state.finances) {
    state.finances = migrateFinancialRecord(state.finances, state.scout);
    if (state.finances.employees.some((employee) => !employee.skills)) {
      state.finances = migrateEmployeeSkillsInRecord(
        state.finances,
        createRNG(`${state.seed}-skill-migrate`),
      );
    }
    state.finances = normalizeEmployeeContractsInRecord(
      state.finances,
      state.scout.reputation,
      state.currentWeek,
      state.currentSeason,
    );
    state.finances = migrateReportListingBids(
      state.finances,
      getSeasonLength(state.fixtures, state.currentSeason),
    );
  }

  migratePlayerRolesAndTraits(state);
  migrateMatchRatings(state);
  migrateInjurySystem(state);
  migrateSeasonEvents(state);
  migrateInboxMessages(state);
  migratePersonalityProfiles(state);
  state.scoutingInfrastructure ??= {
    dataSubscription: "none",
    travelBudget: "economy",
    officeEquipment: "basic",
    investmentCosts: { weekly: 0, oneTime: 0 },
  };
  state.assistantScouts ??= [];
  migrateRegionalKnowledgeAndPresence(state);

  state.disciplinaryRecords ??= {};
  migrateScoutingCases(state);
  state.managerDirectives ??= [];
  state.clubResponses ??= [];
  state.transferRecords ??= [];
  state.activeNegotiations ??= [];
  state.transferRecords = migrateLegacyTransferParticipation(state.transferRecords);
  state.predictions ??= [];
  state.dataAnalysts ??= [];
  state.statisticalProfiles ??= {};
  state.anomalyFlags ??= [];
  state.analystReports ??= {};
  migrateRivalsContactsAndAlumni(state);
  state.rivalOrganizationState = migrateRivalOrganizationState(
    state.seed || state.runManifest.rootSeed,
    state.rivalScouts,
    state.rivalOrganizationState,
    Math.max(1, state.currentSeason),
  );

  state.internationalAssignments = state.internationalAssignments.map(
    migrateInternationalAssignment,
  );
  state.activeInternationalAssignment ??= null;
  if (state.activeInternationalAssignment) {
    state.activeInternationalAssignment = {
      ...migrateInternationalAssignment(state.activeInternationalAssignment),
      acceptedWeek: state.activeInternationalAssignment.acceptedWeek ?? state.currentWeek,
      acceptedSeason: state.activeInternationalAssignment.acceptedSeason ?? state.currentSeason,
    };
  }
  state.internationalAssignmentHistory = (state.internationalAssignmentHistory ?? []).map(
    migrateInternationalAssignment,
  );
  migrateInternationalDestinationEligibility(state);

  state.boardReactions ??= [];
  if (
    state.boardProfile?.ultimatumIssued
    && state.boardProfile.ultimatumDeadline !== undefined
    && state.boardProfile.ultimatumDeadlineSeason === undefined
  ) {
    state.boardProfile.ultimatumDeadlineSeason = state.currentSeason;
  }
  if (state.finances) {
    state.finances.creditScore ??= 50;
    state.finances.distressLevel ??= "healthy";
    state.finances.weeksInDistress ??= 0;
    state.finances.failedContractCount ??= 0;
    state.finances.blacklistedClubs ??= [];
    state.finances.bankruptcyRecoveryCooldown ??= 0;
  }
  state.scout.accuracyHistory ??= [];
  state.scout.performancePulses ??= [];
  state.scout.specializationXp ??= 0;
  state.scout.avatarId ??= 1;
  state.scout.unlockedPerks = Array.from(new Set([
    ...(state.scout.unlockedPerks ?? []),
    ...getUnlockedPerks(
      state.scout.primarySpecialization,
      state.scout.specializationLevel ?? 1,
    ).map((perk) => perk.id),
  ]));
  state.youthTournaments ??= {};
  state.youthRecruitmentBriefs ??= {};
  state.recommendationReviews ??= {};
  state.activeLoans ??= [];
  state.loanHistory ??= [];
  state.loanRecommendations ??= [];
  state.storyDirectorV2 = createStoryDirectorStateV2(state.storyDirectorV2);
  state.careerChronology = state.careerChronology
    ? createCareerChronologyState({
        currentSeason: state.currentSeason,
        careerTier: state.scout.careerTier,
        partial: state.careerChronology,
      })
    : inferLegacyCareerChronology({
        currentSeason: state.currentSeason,
        careerTier: state.scout.careerTier,
        legacyCompletedSeasons: state.legacyScore?.totalSeasons,
        legacyPeakTier: state.legacyScore?.careerHighTier,
        performanceReviewSeasons: (state.performanceReviews ?? []).map((review) => review.season),
        performanceSnapshotSeasons: (state.performanceHistory ?? []).map((snapshot) => snapshot.season),
      });
  state.careerMoments = createCareerMomentState(state.careerMoments);
  state.careerStoryArchive = createCareerStoryArchiveState(state.careerStoryArchive);
  state.stakeholderProfiles = createStakeholderProfileRegistry(
    state,
    state.stakeholderProfiles,
  );
  for (const club of Object.values(state.clubs)) {
    club.loanedOutPlayerIds ??= [];
    club.loanedInPlayerIds ??= [];
    club.academyPlayerIds ??= [];
  }

  const compacted = reconcileScenarioAuthority(
    migratePoliticalMeetingState(compactLongCareerHistory(resetRebuildableGameStateCaches(state))),
  );
  compacted.clubs = normalizeClubEconomicsMap(
    compacted.clubs,
    compacted.players,
    {
      currentWeek: compacted.currentWeek,
      currentSeason: compacted.currentSeason,
    },
  );
  const serializedSession = compacted.activeObservationSession
    ? migrateObservationSessionInteractions(compacted.activeObservationSession)
    : null;
  const completionId = serializedSession?.activityInstanceId ?? serializedSession?.id;
  const resumableSession = serializedSession
    && serializedSession.state !== "complete"
    && !(compacted.completedInteractiveSessions ?? []).includes(completionId ?? "")
      ? serializedSession
      : null;
  return {
    ...compacted,
    activeObservationSession: resumableSession,
  };
}
