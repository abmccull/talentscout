import type {
  ActivityType,
  DiscoveryRecord,
  GameState,
  InboxMessage,
  Player,
  PlayerAttribute,
  Scout,
  UnsignedYouth,
  YouthVenueType,
} from "@/engine/core/types";
import { recordDiscovery } from "@/engine/career/discoveryTracking";
import {
  createDecisionRecord,
  processDueConsequences,
  registerDecision,
  selectDecisionOption,
} from "@/engine/consequences";
import type {
  ConsequenceEffect,
  DecisionOption,
  EntityRef,
  StakeholderMemory,
  WorldFact,
} from "@/engine/consequences";
import type {
  ObservationSession,
  PlayerMoment,
  SessionPhase,
} from "@/engine/observation/types";
import { createRNG } from "@/engine/rng";
import { composeOpeningCaseDirectorOptions } from "./openingCaseDirector";
import type {
  OpeningCaseChoiceId,
  OpeningCaseChoiceProjection,
  OpeningCaseProjection,
  OpeningCaseState,
} from "./openingCaseTypes";

export type {
  OpeningCaseChoiceId,
  OpeningCaseChoiceProjection,
  OpeningCaseProjection,
  OpeningCaseStage,
  OpeningCaseState,
} from "./openingCaseTypes";

export const OPENING_CASE_ACTIVITY_PREFIX = "opening-discovery";

export const OPENING_CASE_CHOICES: ReadonlyArray<OpeningCaseChoiceProjection> = [
  {
    id: "protect",
    label: "Keep the name private",
    description: "Protect the source and arrange a second look before the wider market notices.",
    knownTradeoffs: ["Lowest leak risk", "More time to verify", "A rival may still arrive first"],
  },
  {
    id: "callClub",
    label: "Call a club now",
    description: "Move before certainty. Early access can become influence, but attention follows the call.",
    knownTradeoffs: ["Fastest route to action", "Creates club pressure", "Raises visibility and rival risk"],
  },
  {
    id: "verify",
    label: "Ask your source to verify",
    description: "Use the relationship to test your read without presenting it as a finished judgment.",
    knownTradeoffs: ["Adds an independent source", "Strengthens the relationship", "Costs some information control"],
  },
] as const;

export function getOpeningCaseChoices(
  state: Pick<GameState, "openingCase" | "veteranPrologue">,
): ReadonlyArray<OpeningCaseChoiceProjection> {
  const prologue = state.veteranPrologue;
  return prologue && prologue.openingCase.id === state.openingCase?.id
    ? prologue.choices
    : OPENING_CASE_CHOICES;
}

function activeYouth(unsignedYouth: Record<string, UnsignedYouth>): UnsignedYouth[] {
  return Object.values(unsignedYouth).filter((youth) => !youth.placed && !youth.retired);
}

function chooseOpeningLead(candidates: UnsignedYouth[], seed: string): UnsignedYouth | undefined {
  if (candidates.length === 0) return undefined;
  const ranked = [...candidates].sort((left, right) =>
    right.player.potentialAbility - left.player.potentialAbility
    || left.visibility - right.visibility
    || left.player.id.localeCompare(right.player.id)
  );
  const eliteWindow = ranked.slice(0, Math.max(1, Math.min(5, Math.ceil(ranked.length * 0.08))));
  return createRNG(`${seed}-opening-lead`).pick(eliteWindow);
}

/**
 * Create the first career case from the real generated youth pool. Hidden
 * potential is used only to ensure the tutorial contains a genuinely valuable
 * lead; no player-safe projection includes that value.
 */
export function createOpeningCase(input: {
  seed: string;
  scout: Scout;
  unsignedYouth: Record<string, UnsignedYouth>;
  contacts: GameState["contacts"];
  youthRecruitmentBriefs: GameState["youthRecruitmentBriefs"];
  preferredCountry?: string;
  week: number;
  season: number;
}): OpeningCaseState | null {
  const eligible = activeYouth(input.unsignedYouth).filter((youth) => youth.player.age <= 17);
  const localCandidates = input.preferredCountry
    ? eligible.filter((youth) => youth.country.toLowerCase() === input.preferredCountry?.toLowerCase())
    : [];
  const candidates = localCandidates.length >= 4 ? localCandidates : eligible;
  const lead = chooseOpeningLead(candidates, input.seed);
  if (!lead) return null;

  const sameArea = candidates.filter((candidate) =>
    candidate.id !== lead.id
    && (candidate.regionId === lead.regionId || candidate.country === lead.country)
  );
  const fallback = candidates.filter((candidate) => candidate.id !== lead.id);
  const poolRng = createRNG(`${input.seed}-opening-cast`);
  const supporting = poolRng.shuffle(sameArea.length >= 3 ? sameArea : fallback).slice(0, 3);
  const source = Object.values(input.contacts)
    .sort((left, right) => right.relationship - left.relationship || left.id.localeCompare(right.id))[0];
  const brief = Object.values(input.youthRecruitmentBriefs)
    .filter((candidate) => candidate.status === "open")
    .sort((left, right) =>
      right.competitionPressure - left.competitionPressure
      || left.expiresSeason - right.expiresSeason
      || left.expiresWeek - right.expiresWeek
      || left.id.localeCompare(right.id)
    )[0];

  return {
    id: `${OPENING_CASE_ACTIVITY_PREFIX}:${input.scout.id}:${lead.player.id}`,
    scoutId: input.scout.id,
    youthId: lead.id,
    playerId: lead.player.id,
    playerPoolIds: [lead.player.id, ...supporting.map((candidate) => candidate.player.id)],
    sourceContactId: source?.id,
    sourceContactName: source?.name ?? "Tommy Reyes",
    briefId: brief?.id,
    clubId: brief?.clubId,
    stage: "observation",
    startedWeek: input.week,
    startedSeason: input.season,
    discoveryRecordCreated: false,
  };
}

export function isOpeningDiscoverySession(
  session: Pick<ObservationSession, "activityInstanceId"> | null | undefined,
): boolean {
  return Boolean(session?.activityInstanceId?.startsWith(OPENING_CASE_ACTIVITY_PREFIX));
}

function openingMoment(input: {
  id: string;
  player: Player;
  type: PlayerMoment["momentType"];
  quality: number;
  attributes: PlayerAttribute[];
  description: string;
  vagueDescription: string;
  pressure?: boolean;
}): PlayerMoment {
  return {
    id: input.id,
    playerId: input.player.id,
    momentType: input.type,
    quality: input.quality,
    attributesHinted: input.attributes,
    description: input.description,
    vagueDescription: input.vagueDescription,
    pressureContext: input.pressure ?? false,
    isStandout: input.quality >= 8,
  };
}

function reindexPhase(phase: SessionPhase, index: number): SessionPhase {
  return { ...phase, index };
}

/**
 * Compress the opening assignment into three authored beats while preserving
 * the real focus, moment, evidence, reflection, and observation state machine.
 */
export function shapeOpeningObservationSession(
  session: ObservationSession,
  lead: Player,
): ObservationSession {
  if (!isOpeningDiscoverySession(session) || session.mode !== "fullObservation") return session;
  const source = session.phases.length > 0 ? session.phases : [{
    index: 0,
    minute: 8,
    description: "The school match settles into an uncertain opening rhythm.",
    moments: [],
  }];
  const phases = [0, 1, 2].map((index) => reindexPhase(source[index] ?? source[source.length - 1], index));

  phases[0] = {
    ...phases[0],
    minute: 9,
    description: "A loose opening gives you only fragments. Choose where to spend your attention.",
    moments: [
      openingMoment({
        id: `${session.id}-opening-ambiguous`,
        player: lead,
        type: "technicalAction",
        quality: 6,
        attributes: ["firstTouch", "passing"],
        description: `${lead.firstName} ${lead.lastName} receives under pressure, cushions the ball cleanly, then chooses the safe pass. The technique is interesting; the ambition is still unclear.`,
        vagueDescription: "The player from the tip controls one awkward ball cleanly, but the next action is conservative.",
      }),
      ...(phases[0].moments ?? []).filter((moment) => moment.playerId !== lead.id).slice(0, 1),
    ],
  };
  phases[1] = {
    ...phases[1],
    minute: 31,
    description: "The shape breaks. For a few seconds, instinct matters more than instruction.",
    moments: [
      openingMoment({
        id: `${session.id}-opening-breakthrough`,
        player: lead,
        type: "tacticalDecision",
        quality: 9,
        attributes: ["vision", "anticipation", "passing"],
        pressure: true,
        description: `${lead.firstName} ${lead.lastName} scans before the ball arrives, lets a defender commit, and splits two lines with a pass nobody else had seen. The move changes the match in one touch.`,
        vagueDescription: "One player appears to see a passing lane before everyone around him.",
      }),
      ...(phases[1].moments ?? []).filter((moment) => moment.playerId !== lead.id).slice(0, 1),
    ],
    atmosphereEvent: {
      id: `${session.id}-opening-crowd-shift`,
      description: "The small touchline crowd reacts before the receiver even reaches the pass.",
      effect: "reveal",
      affectedAttributes: ["vision", "anticipation"],
      noiseDelta: -0.1,
    },
  };
  phases[2] = {
    ...phases[2],
    minute: 57,
    description: "Now the match asks a different question: can the early impression survive pressure?",
    moments: [
      openingMoment({
        id: `${session.id}-opening-contradiction`,
        player: lead,
        type: "mentalResponse",
        quality: 4,
        attributes: ["composure", "decisionMaking"],
        pressure: true,
        description: `${lead.firstName} ${lead.lastName} is closed down quickly and forces the next pass. It is the first reminder that one exceptional action is not a finished assessment.`,
        vagueDescription: "The earlier standout is rushed into a poor decision when the pressure arrives faster.",
      }),
      ...(phases[2].moments ?? []).filter((moment) => moment.playerId !== lead.id).slice(0, 1),
    ],
  };

  return {
    ...session,
    phases,
    currentPhaseIndex: 0,
    players: [
      ...session.players.filter((player) => player.playerId === lead.id),
      ...session.players.filter((player) => player.playerId !== lead.id),
    ],
  };
}

export function buildOpeningCaseProjection(
  state: Pick<GameState, "openingCase" | "unsignedYouth" | "veteranPrologue">,
): OpeningCaseProjection | null {
  const openingCase = state.openingCase;
  if (!openingCase) return null;
  const youth = state.unsignedYouth[openingCase.youthId];
  if (!youth) return null;
  const prologue = state.veteranPrologue?.openingCase.id === openingCase.id
    ? state.veteranPrologue
    : undefined;
  return {
    id: openingCase.id,
    playerId: openingCase.playerId,
    playerName: `${youth.player.firstName} ${youth.player.lastName}`,
    position: youth.player.position,
    age: youth.player.age,
    country: youth.country,
    sourceContactName: openingCase.sourceContactName,
    stage: openingCase.stage,
    selectedChoiceId: openingCase.selectedChoiceId,
    eyebrow: prologue?.presentation.eyebrow ?? "Your first discovery",
    venueLabel: prologue?.presentation.venue ?? "School ground",
    headline: prologue?.presentation.headline ?? "You saw it before the room changed",
    uncertainty: prologue?.presentation.uncertainty
      ?? "One exceptional action is a lead, not proof. What you do next determines who hears the name and how much evidence you can gather first.",
    signalLabel: prologue?.presentation.signalLabel ?? "The signal",
    questionLabel: prologue?.presentation.questionLabel ?? "Who hears the name next?",
    premise: prologue?.premise,
    pressure: prologue?.pressure,
    deadline: prologue?.deadline,
    stakeholderConflict: prologue?.stakeholderConflict,
  };
}

function appendUniqueDiscovery(
  records: DiscoveryRecord[],
  player: Player,
  scout: Scout,
  week: number,
  season: number,
): DiscoveryRecord[] {
  return records.some((record) => record.playerId === player.id)
    ? records
    : [...records, recordDiscovery(player, scout, week, season)];
}

function openingYouthVenue(activityType?: ActivityType): YouthVenueType {
  switch (activityType) {
    case "grassrootsTournament":
    case "streetFootball":
    case "academyTrialDay":
    case "youthFestival":
    case "followUpSession":
    case "parentCoachMeeting":
    case "schoolMatch":
      return activityType;
    case "academyVisit":
    case "trialMatch":
      return "academyTrialDay";
    case "youthTournament":
      return "grassrootsTournament";
    default:
      // Analysis and limited-access missions are follow-up evidence rather
      // than a second fabricated live venue appearance.
      return "followUpSession";
  }
}

/** Claim the lead exactly once after a completed observation session. */
export function claimOpeningDiscovery(state: GameState): GameState {
  const openingCase = state.openingCase;
  if (!openingCase || openingCase.stage !== "observation") return state;
  const youth = state.unsignedYouth[openingCase.youthId];
  if (!youth) return state;
  const discoveredBy = youth.discoveredBy.includes(state.scout.id)
    ? youth.discoveredBy
    : [...youth.discoveredBy, state.scout.id];
  const openingVenue = openingYouthVenue(state.veteranPrologue?.activityType);
  const venueAppearances = youth.venueAppearances.includes(openingVenue)
    ? youth.venueAppearances
    : [...youth.venueAppearances, openingVenue];
  return {
    ...state,
    openingCase: {
      ...openingCase,
      stage: "decision",
      claimedWeek: state.currentWeek,
      claimedSeason: state.currentSeason,
      discoveryRecordCreated: true,
    },
    unsignedYouth: {
      ...state.unsignedYouth,
      [youth.id]: {
        ...youth,
        discoveredBy,
        venueAppearances,
        visibility: Math.max(1, youth.visibility),
        buzzLevel: Math.max(1, youth.buzzLevel),
      },
    },
    discoveryRecords: appendUniqueDiscovery(
      state.discoveryRecords ?? [],
      youth.player,
      state.scout,
      state.currentWeek,
      state.currentSeason,
    ),
  };
}

function openingFact(
  openingCase: OpeningCaseState,
  choiceId: OpeningCaseChoiceId,
  now: { week: number; season: number },
  decisionId: string,
): WorldFact {
  return {
    id: `fact:${openingCase.id}:${choiceId}`,
    kind: "openingDiscoveryApproach",
    subject: { kind: "player", id: openingCase.playerId },
    value: choiceId,
    observedAt: now,
    visibility: choiceId === "protect" ? "private" : "stakeholders",
    sourceDecisionId: decisionId,
    metadata: { caseId: openingCase.id },
  };
}

function openingMemory(input: {
  openingCase: OpeningCaseState;
  choiceId: OpeningCaseChoiceId;
  now: { week: number; season: number };
  decisionId: string;
  stakeholder: EntityRef;
  valence: number;
  tags: string[];
}): StakeholderMemory {
  return {
    id: `memory:${input.openingCase.id}:${input.choiceId}:${input.stakeholder.kind}:${input.stakeholder.id}`,
    stakeholder: input.stakeholder,
    subject: { kind: "scout", id: input.openingCase.scoutId },
    tags: ["openingDiscovery", input.choiceId, ...input.tags],
    valence: input.valence,
    intensity: 70,
    salience: 85,
    visibility: "stakeholders",
    createdAt: input.now,
    sourceDecisionId: input.decisionId,
    halfLifeWeeks: 104,
    metadata: {
      caseId: input.openingCase.id,
      playerId: input.openingCase.playerId,
    },
  };
}

function createOpeningDecisionOptions(
  openingCase: OpeningCaseState,
  now: { week: number; season: number },
  decisionId: string,
  choices: ReadonlyArray<OpeningCaseChoiceProjection>,
): DecisionOption[] {
  const sourceRef: EntityRef = openingCase.sourceContactId
    ? { kind: "contact", id: openingCase.sourceContactId }
    : { kind: "mentor", id: "tommy-reyes" };
  const clubRef: EntityRef = openingCase.clubId
    ? { kind: "club", id: openingCase.clubId }
    : { kind: "recruitmentMarket", id: "local-market" };
  const effect = (
    choiceId: OpeningCaseChoiceId,
    stakeholder: EntityRef,
    valence: number,
    tags: string[],
  ): ConsequenceEffect[] => [
    {
      id: `effect:${openingCase.id}:${choiceId}:fact`,
      type: "recordFact",
      fact: openingFact(openingCase, choiceId, now, decisionId),
    },
    {
      id: `effect:${openingCase.id}:${choiceId}:memory`,
      type: "addMemory",
      memory: openingMemory({ openingCase, choiceId, now, decisionId, stakeholder, valence, tags }),
    },
  ];
  return choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    knownTradeoffs: [...choice.knownTradeoffs],
    immediateEffects: choice.id === "protect"
      ? effect(choice.id, sourceRef, 14, ["protectedSource", "confidential"])
      : choice.id === "verify"
        ? effect(choice.id, sourceRef, 9, ["askedForVerification", "trustedSource"])
        : effect(choice.id, clubRef, 6, ["earlyCall", "careerRisk"]),
    scheduledConsequences: [],
  }));
}

function choiceMessage(
  openingCase: OpeningCaseState,
  choiceId: OpeningCaseChoiceId,
  week: number,
  season: number,
  choices: ReadonlyArray<OpeningCaseChoiceProjection>,
): InboxMessage {
  const choice = choices.find((candidate) => candidate.id === choiceId)!;
  return {
    id: `opening-choice:${openingCase.id}:${choiceId}`,
    week,
    season,
    type: "event",
    title: `First lead: ${choice.label}`,
    body: `${choice.description} This decision is preserved with the original observation and will shape who remembers the case.`,
    read: false,
    actionRequired: false,
    relatedId: openingCase.playerId,
    relatedEntityType: "player",
  };
}

/** Resolve the post-discovery tradeoff through the consequence ledger exactly once. */
export function resolveOpeningCaseChoice(
  state: GameState,
  choiceId: OpeningCaseChoiceId,
): GameState {
  const openingCase = state.openingCase;
  if (!openingCase || openingCase.stage !== "decision") return state;
  const choices = getOpeningCaseChoices(state);
  if (!choices.some((choice) => choice.id === choiceId)) return state;
  const youth = state.unsignedYouth[openingCase.youthId];
  if (!youth) return state;

  const now = { week: state.currentWeek, season: state.currentSeason };
  const decisionId = `decision:${openingCase.id}`;
  const directed = composeOpeningCaseDirectorOptions({
    director: {
      seed: state.seed,
      openingCase,
      scoutId: state.scout.id,
      now,
      fixtures: state.fixtures,
      rivals: state.rivalScouts,
    },
    decisionId,
    options: createOpeningDecisionOptions(openingCase, now, decisionId, choices),
  });
  const stakeholders: EntityRef[] = [
    directed.chain.cast.contact
      ?? { kind: "mentor", id: "tommy-reyes" },
    directed.chain.cast.club,
    directed.chain.cast.rival,
  ].filter((stakeholder): stakeholder is EntityRef => Boolean(stakeholder));
  const decision = createDecisionRecord({
    id: decisionId,
    source: { kind: "openingCase", id: openingCase.id },
    offeredAt: now,
    deadlineAt: now,
    visibility: "stakeholders",
    stakeholders,
    options: directed.options,
    defaultOptionId: "protect",
    outcomeRoll: createRNG(`${state.seed}-${decisionId}`).next(),
    metadata: {
      caseId: openingCase.id,
      chainId: directed.chain.id,
      playerId: openingCase.playerId,
      deadlines: directed.chain.stages.map((stage) => ({
        stageId: stage.id,
        week: stage.dueAt.week,
        season: stage.dueAt.season,
      })),
      ...(directed.chain.cast.contact ? { contactId: directed.chain.cast.contact.id } : {}),
      ...(directed.chain.cast.club ? { clubId: directed.chain.cast.club.id } : {}),
      ...(directed.chain.cast.rival ? { rivalId: directed.chain.cast.rival.id } : {}),
    },
  });
  const registered = registerDecision(state.consequenceState, decision);
  const selected = selectDecisionOption(
    registered.state,
    decisionId,
    choiceId,
    now,
    "player",
  );
  const processed = processDueConsequences(selected.state, now);
  const visibilityDelta = choiceId === "callClub" ? 8 : choiceId === "verify" ? 3 : 0;
  const buzzDelta = choiceId === "callClub" ? 6 : choiceId === "verify" ? 2 : 0;
  const sourceContact = openingCase.sourceContactId
    ? state.contacts[openingCase.sourceContactId]
    : undefined;
  const contactDelta = choiceId === "protect" ? 3 : choiceId === "verify" ? 2 : -1;

  return {
    ...state,
    openingCase: {
      ...openingCase,
      stage: "report",
      selectedChoiceId: choiceId,
      decisionId,
    },
    consequenceState: processed.state,
    unsignedYouth: {
      ...state.unsignedYouth,
      [youth.id]: {
        ...youth,
        visibility: Math.min(100, youth.visibility + visibilityDelta),
        buzzLevel: Math.min(100, youth.buzzLevel + buzzDelta),
      },
    },
    contacts: sourceContact
      ? {
          ...state.contacts,
          [sourceContact.id]: {
            ...sourceContact,
            relationship: Math.max(0, Math.min(100, sourceContact.relationship + contactDelta)),
          },
        }
      : state.contacts,
    inbox: [
      ...state.inbox,
      choiceMessage(
        openingCase,
        choiceId,
        state.currentWeek,
        state.currentSeason,
        choices,
      ),
    ],
  };
}
