import type { Fixture, RivalScout } from "@/engine/core/types";
import { addGameWeeks } from "@/engine/core/gameDate";
import type {
  ConsequenceEffect,
  DecisionOption,
  EntityRef,
  GameDate,
  JsonValue,
  ScheduledConsequenceTemplate,
  StakeholderMemory,
  WorldFact,
} from "@/engine/consequences";
import { createRNG } from "@/engine/rng";
import type { OpeningCaseChoiceId, OpeningCaseState } from "./openingCaseTypes";

export interface OpeningCaseDirectorCast {
  scout: EntityRef;
  player: EntityRef;
  contact?: EntityRef;
  club?: EntityRef;
  rival?: EntityRef;
}

export interface OpeningCaseDirectorStage {
  id: string;
  title: string;
  dueAt: GameDate;
  stakeholders: EntityRef[];
}

export interface OpeningCaseDirectorChain {
  id: string;
  caseId: string;
  cast: OpeningCaseDirectorCast;
  stages: [OpeningCaseDirectorStage, OpeningCaseDirectorStage, OpeningCaseDirectorStage];
}

export interface OpeningCaseDirectorInput {
  seed: string;
  openingCase: OpeningCaseState;
  scoutId: string;
  now: GameDate;
  fixtures: Record<string, Fixture>;
  rivals: Record<string, RivalScout>;
}

function selectRival(
  rivals: Record<string, RivalScout>,
  playerId: string,
): RivalScout | undefined {
  return Object.values(rivals).sort((left, right) =>
    Number(right.currentTarget === playerId) - Number(left.currentTarget === playerId)
    || Number(right.isNemesis) - Number(left.isNemesis)
    || right.reputation - left.reputation
    || right.quality - left.quality
    || left.id.localeCompare(right.id),
  )[0];
}

function uniqueEntities(entities: Array<EntityRef | undefined>): EntityRef[] {
  const seen = new Set<string>();
  return entities.filter((entity): entity is EntityRef => {
    if (!entity) return false;
    const key = `${entity.kind}:${entity.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Build a stable recurring cast and three deadlines from the real opening case. */
export function buildOpeningCaseDirectorChain(
  input: OpeningCaseDirectorInput,
): OpeningCaseDirectorChain {
  const rival = selectRival(input.rivals, input.openingCase.playerId);
  const cast: OpeningCaseDirectorCast = {
    scout: { kind: "scout", id: input.scoutId },
    player: { kind: "player", id: input.openingCase.playerId },
    contact: input.openingCase.sourceContactId
      ? { kind: "contact", id: input.openingCase.sourceContactId }
      : undefined,
    club: input.openingCase.clubId
      ? { kind: "club", id: input.openingCase.clubId }
      : undefined,
    rival: rival ? { kind: "rival", id: rival.id } : undefined,
  };
  const chainId = `case-director:${input.openingCase.id}`;
  const accessDeadline = addGameWeeks(input.fixtures, input.now, 2);
  const echoDeadline = addGameWeeks(input.fixtures, input.now, 6);
  return {
    id: chainId,
    caseId: input.openingCase.id,
    cast,
    stages: [
      {
        id: `${chainId}:stance`,
        title: "Choose who hears the name",
        dueAt: input.now,
        stakeholders: uniqueEntities([cast.contact, cast.club]),
      },
      {
        id: `${chainId}:access-contest`,
        title: "Access contest",
        dueAt: accessDeadline,
        stakeholders: uniqueEntities([cast.contact, cast.rival]),
      },
      {
        id: `${chainId}:reputation-echo`,
        title: "Reputation echo",
        dueAt: echoDeadline,
        stakeholders: uniqueEntities([cast.contact, cast.club, cast.rival]),
      },
    ],
  };
}

function metadata(
  chain: OpeningCaseDirectorChain,
  stage: OpeningCaseDirectorStage,
  choiceId: OpeningCaseChoiceId,
): Record<string, JsonValue> {
  return {
    caseId: chain.caseId,
    chainId: chain.id,
    stageId: stage.id,
    playerId: chain.cast.player.id,
    choiceId,
    deadline: { week: stage.dueAt.week, season: stage.dueAt.season },
    ...(chain.cast.contact ? { contactId: chain.cast.contact.id } : {}),
    ...(chain.cast.club ? { clubId: chain.cast.club.id } : {}),
    ...(chain.cast.rival ? { rivalId: chain.cast.rival.id } : {}),
  };
}

function memoryEffect(input: {
  chain: OpeningCaseDirectorChain;
  stage: OpeningCaseDirectorStage;
  choiceId: OpeningCaseChoiceId;
  stakeholder: EntityRef;
  valence: number;
  tags: string[];
  decisionId: string;
}): ConsequenceEffect {
  const memory: StakeholderMemory = {
    id: `memory:${input.stage.id}:${input.choiceId}:${input.stakeholder.kind}:${input.stakeholder.id}`,
    stakeholder: input.stakeholder,
    subject: input.chain.cast.scout,
    tags: ["caseDirector", "openingDiscovery", ...input.tags],
    valence: input.valence,
    intensity: 72,
    salience: 86,
    visibility: "stakeholders",
    createdAt: input.stage.dueAt,
    sourceDecisionId: input.decisionId,
    halfLifeWeeks: 104,
    metadata: metadata(input.chain, input.stage, input.choiceId),
  };
  return {
    id: `effect:${input.stage.id}:${input.choiceId}:memory:${input.stakeholder.kind}:${input.stakeholder.id}`,
    type: "addMemory",
    memory,
  };
}

function factEffect(input: {
  chain: OpeningCaseDirectorChain;
  stage: OpeningCaseDirectorStage;
  choiceId: OpeningCaseChoiceId;
  decisionId: string;
}): ConsequenceEffect {
  const fact: WorldFact = {
    id: `fact:${input.stage.id}:${input.choiceId}`,
    kind: input.stage.id.endsWith("access-contest")
      ? "openingCaseAccessContest"
      : "openingCaseReputationEcho",
    subject: input.chain.cast.player,
    value: metadata(input.chain, input.stage, input.choiceId),
    observedAt: input.stage.dueAt,
    visibility: "stakeholders",
    sourceDecisionId: input.decisionId,
    metadata: metadata(input.chain, input.stage, input.choiceId),
  };
  return {
    id: `effect:${input.stage.id}:${input.choiceId}:fact`,
    type: "recordFact",
    fact,
  };
}

const CHOICE_TONES: Record<OpeningCaseChoiceId, {
  contact: number;
  club: number;
  rival: number;
  contactTags: string[];
  clubTags: string[];
}> = {
  protect: {
    contact: 14,
    club: -3,
    rival: -4,
    contactTags: ["caseSourceProtected"],
    clubTags: ["caseClubCaution"],
  },
  callClub: {
    contact: -12,
    club: 10,
    rival: -14,
    contactTags: ["caseSourceExposed"],
    clubTags: ["caseClubFirstMover"],
  },
  verify: {
    contact: 12,
    club: 4,
    rival: -7,
    contactTags: ["caseVerificationRequested"],
    clubTags: ["caseFollowThrough"],
  },
};

function scheduledStage(
  chain: OpeningCaseDirectorChain,
  stage: OpeningCaseDirectorStage,
  choiceId: OpeningCaseChoiceId,
  decisionId: string,
  seed: string,
): ScheduledConsequenceTemplate {
  const tone = CHOICE_TONES[choiceId];
  const effects: ConsequenceEffect[] = [
    factEffect({ chain, stage, choiceId, decisionId }),
  ];
  if (chain.cast.contact) {
    effects.push(memoryEffect({
      chain,
      stage,
      choiceId,
      stakeholder: chain.cast.contact,
      valence: stage.id.endsWith("reputation-echo")
        ? Math.round(tone.contact * 0.6)
        : tone.contact,
      tags: stage.id.endsWith("reputation-echo")
        ? ["caseFollowThrough", ...tone.contactTags]
        : tone.contactTags,
      decisionId,
    }));
  }
  if (chain.cast.rival) {
    effects.push(memoryEffect({
      chain,
      stage,
      choiceId,
      stakeholder: chain.cast.rival,
      valence: tone.rival,
      tags: ["caseRivalPressure"],
      decisionId,
    }));
  }
  if (stage.id.endsWith("reputation-echo") && chain.cast.club) {
    effects.push(memoryEffect({
      chain,
      stage,
      choiceId,
      stakeholder: chain.cast.club,
      valence: tone.club,
      tags: tone.clubTags,
      decisionId,
    }));
  }
  return {
    id: `${stage.id}:${choiceId}`,
    dueAt: stage.dueAt,
    effects,
    probability: 1,
    outcomeRoll: createRNG(`${seed}:${stage.id}:${choiceId}`).next(),
    tags: ["caseDirector", "openingDiscovery", choiceId],
  };
}

/** Attach stages two and three to every stance without duplicating stage one. */
export function composeOpeningCaseDirectorOptions(input: {
  director: OpeningCaseDirectorInput;
  decisionId: string;
  options: DecisionOption[];
}): { chain: OpeningCaseDirectorChain; options: DecisionOption[] } {
  const chain = buildOpeningCaseDirectorChain(input.director);
  const [, accessStage, echoStage] = chain.stages;
  return {
    chain,
    options: input.options.map((option) => {
      const choiceId = option.id as OpeningCaseChoiceId;
      return {
        ...option,
        scheduledConsequences: [
          ...option.scheduledConsequences,
          scheduledStage(chain, accessStage, choiceId, input.decisionId, input.director.seed),
          scheduledStage(chain, echoStage, choiceId, input.decisionId, input.director.seed),
        ],
      };
    }),
  };
}
