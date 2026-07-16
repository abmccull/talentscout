import type { GameState } from "../core/types";
import { addGameWeeks, getSeasonLength } from "../core/gameDate";
import {
  createDecisionRecord,
  registerDecision,
  selectDecisionOption,
} from "../consequences/decisionLedger";
import { processDueConsequences } from "../consequences/processor";
import {
  projectConsequenceMetrics,
  synchronizeConsequenceMetrics,
} from "../consequences/projection";
import { getManagerStakeholderRef } from "../consequences/stakeholderProfiles";
import type {
  ConsequenceEffect,
  DecisionOption,
  DecisionRecord,
  EntityRef,
  GameDate,
} from "../consequences/types";
import { createNamedRNG } from "../run";
import type {
  LateCareerDilemmaDefinition,
  LateCareerDilemmaOption,
  LateCareerStakeholderKind,
} from "./lateCareerDilemmas";

type RiskLevel = "measured" | "volatile" | "careerBet";

interface MetricDeltas {
  reputation?: number;
  clubTrust?: number;
  specializationReputation?: number;
  fatigue?: number;
}

/**
 * Permanent seen-set used by the seasonal selector. Live decisions, compacted
 * consequence history, and the career archive all count so a dilemma cannot
 * quietly repeat late in a long save.
 */
export function getSeenLateCareerDilemmaIds(state: GameState): Set<string> {
  return new Set([
    ...Object.values(state.consequenceState.decisions)
      .filter((decision) => decision.source.kind === "lateCareerDilemma")
      .map((decision) => decision.source.id),
    ...(state.consequenceState.history ?? [])
      .filter((record) => record.source.kind === "lateCareerDilemma")
      .map((record) => record.source.id),
    ...Object.values(state.careerStoryArchive?.records ?? {})
      .filter((record) => record.source.kind === "lateCareerDilemma")
      .map((record) => record.source.id),
  ]);
}

interface OptionConsequenceProfile {
  risk: RiskLevel;
  immediate: MetricDeltas;
  reckoning: MetricDeltas;
  favorable: MetricDeltas;
  costly: MetricDeltas;
  stakeholderValence: Partial<Record<LateCareerStakeholderKind, number>>;
}

const PROFILE = (
  risk: RiskLevel,
  immediate: MetricDeltas,
  reckoning: MetricDeltas,
  favorable: MetricDeltas,
  costly: MetricDeltas,
  stakeholderValence: Partial<Record<LateCareerStakeholderKind, number>>,
): OptionConsequenceProfile => ({
  risk,
  immediate,
  reckoning,
  favorable,
  costly,
  stakeholderValence,
});

/**
 * Explicit balance data for every authored option. These are deliberately not
 * inferred from prose: copy changes cannot silently alter simulation balance.
 */
const OPTION_PROFILES: Record<string, OptionConsequenceProfile> = {
  "clubDoctrineCollision:backManager": PROFILE("volatile", { clubTrust: 2, fatigue: 2 }, { clubTrust: -1 }, { reputation: 3, clubTrust: 3 }, { reputation: -3, clubTrust: -4 }, { board: -28, manager: 38, employee: -12 }),
  "clubDoctrineCollision:obeyBoard": PROFILE("measured", { clubTrust: 3 }, { specializationReputation: -1 }, { reputation: 2, clubTrust: 3 }, { reputation: -2, clubTrust: -4 }, { board: 38, manager: -32, employee: -6 }),
  "clubDoctrineCollision:brokerCompromise": PROFILE("volatile", { clubTrust: -1, fatigue: 5 }, { specializationReputation: 1 }, { reputation: 5, clubTrust: 3, specializationReputation: 2 }, { reputation: -3, clubTrust: -3 }, { board: 10, manager: 10, employee: 18 }),
  "clubDoctrineCollision:threatenExit": PROFILE("careerBet", { reputation: 1, clubTrust: -8, fatigue: 4 }, { clubTrust: -2 }, { reputation: 8, specializationReputation: 4, clubTrust: 6 }, { reputation: -7, clubTrust: -10 }, { board: -58, manager: -22, employee: 16 }),

  "departmentSuccession:promoteLoyalist": PROFILE("measured", { specializationReputation: 1 }, {}, { reputation: 2, specializationReputation: 3 }, { reputation: -2, specializationReputation: -1 }, { employee: 42, rival: -28 }),
  "departmentSuccession:hireRival": PROFILE("careerBet", { reputation: 1, fatigue: 2 }, { specializationReputation: 1 }, { reputation: 5, specializationReputation: 4 }, { reputation: -4, specializationReputation: -3 }, { employee: -38, rival: 36 }),
  "departmentSuccession:splitAuthority": PROFILE("volatile", { fatigue: 6 }, { specializationReputation: 1 }, { reputation: 4, specializationReputation: 3 }, { reputation: -3, clubTrust: -2 }, { employee: 16, rival: 14 }),

  "agencyIndependenceCrossroads:sellStake": PROFILE("volatile", { reputation: 1, fatigue: 3 }, { specializationReputation: -1 }, { reputation: 5, specializationReputation: 2 }, { reputation: -4, specializationReputation: -3 }, { client: 34, employee: 12, journalist: 16 }),
  "agencyIndependenceCrossroads:exclusiveClub": PROFILE("measured", { reputation: 1 }, { specializationReputation: -1 }, { reputation: 4, clubTrust: 3 }, { reputation: -3, specializationReputation: -2 }, { client: 40, employee: 8, journalist: -12 }),
  "agencyIndependenceCrossroads:stayBoutique": PROFILE("measured", { specializationReputation: 2 }, {}, { reputation: 3, specializationReputation: 4 }, { reputation: -1, specializationReputation: -1 }, { client: 12, employee: -18, journalist: 14 }),

  "reputationMortgage:publicConviction": PROFILE("careerBet", { reputation: 3, fatigue: 4 }, { clubTrust: 1 }, { reputation: 9, clubTrust: 6, specializationReputation: 3 }, { reputation: -10, clubTrust: -7, specializationReputation: -3 }, { board: 18, manager: 20, client: 24, journalist: 36 }),
  "reputationMortgage:privateRecommendation": PROFILE("measured", { clubTrust: 1 }, {}, { reputation: 3, clubTrust: 3 }, { reputation: -2, clubTrust: -2 }, { board: 10, manager: 8, client: 12, journalist: -5 }),
  "reputationMortgage:demandMoreEvidence": PROFILE("volatile", { clubTrust: -2, fatigue: 5 }, { specializationReputation: 1 }, { reputation: 5, specializationReputation: 4 }, { reputation: -4, clubTrust: -3 }, { board: -14, manager: -18, client: -12, journalist: 8 }),

  "youthGuardianship:protectPlayer": PROFILE("measured", { specializationReputation: 2, clubTrust: -1 }, {}, { reputation: 3, specializationReputation: 4 }, { reputation: -2, clubTrust: -3 }, { family: 48, agent: -34, manager: -12 }),
  "youthGuardianship:backMove": PROFILE("careerBet", { clubTrust: 2 }, { specializationReputation: -1 }, { reputation: 6, clubTrust: 4 }, { reputation: -7, specializationReputation: -5 }, { family: -44, agent: 40, manager: 30 }),
  "youthGuardianship:independentPlan": PROFILE("volatile", { fatigue: 5 }, { specializationReputation: 1 }, { reputation: 5, specializationReputation: 4, clubTrust: 2 }, { reputation: -3, clubTrust: -2 }, { family: 22, agent: 10, manager: 12 }),

  "dataModelCrisis:publishFailure": PROFILE("careerBet", { reputation: -1, specializationReputation: 2 }, { fatigue: 2 }, { reputation: 7, specializationReputation: 5 }, { reputation: -5, specializationReputation: -3 }, { employee: 14, manager: -10, journalist: 38 }),
  "dataModelCrisis:quietPatch": PROFILE("measured", { specializationReputation: 1 }, {}, { specializationReputation: 3, reputation: 2 }, { reputation: -7, clubTrust: -4 }, { employee: 18, manager: -16, journalist: -24 }),
  "dataModelCrisis:hybridReview": PROFILE("volatile", { fatigue: 4 }, { specializationReputation: 1 }, { reputation: 5, specializationReputation: 5, clubTrust: 2 }, { reputation: -3, specializationReputation: -2 }, { employee: 28, manager: 18, journalist: 8 }),

  "regionalLoyalty:stayLocal": PROFILE("measured", { specializationReputation: 2 }, {}, { reputation: 3, specializationReputation: 4 }, { reputation: -2, clubTrust: -2 }, { client: 28, family: 34, employee: 12 }),
  "regionalLoyalty:goGlobal": PROFILE("careerBet", { reputation: 2, fatigue: 3 }, { specializationReputation: 1 }, { reputation: 7, specializationReputation: 5 }, { reputation: -5, specializationReputation: -3 }, { client: -30, family: -38, employee: 8 }),
  "regionalLoyalty:buildBridge": PROFILE("volatile", { fatigue: 4 }, { specializationReputation: 1 }, { reputation: 5, specializationReputation: 4 }, { reputation: -3, specializationReputation: -2 }, { client: 16, family: 8, employee: 18 }),

  "firstTeamPanic:approveVeteran": PROFILE("careerBet", { clubTrust: 3 }, { specializationReputation: -1 }, { reputation: 7, clubTrust: 6 }, { reputation: -7, clubTrust: -6, specializationReputation: -3 }, { board: 18, manager: 40, agent: 24, journalist: 12 }),
  "firstTeamPanic:blockDeal": PROFILE("careerBet", { clubTrust: -5, specializationReputation: 2 }, { fatigue: 2 }, { reputation: 8, clubTrust: 5, specializationReputation: 5 }, { reputation: -8, clubTrust: -8 }, { board: -18, manager: -40, agent: -34, journalist: 16 }),
  "firstTeamPanic:loanCompromise": PROFILE("measured", { fatigue: 3, clubTrust: 1 }, {}, { reputation: 4, clubTrust: 3 }, { reputation: -3, clubTrust: -2 }, { board: 24, manager: 14, agent: 8, journalist: 5 }),
};

const FAVORABLE_CHANCE: Record<RiskLevel, number> = {
  measured: 0.68,
  volatile: 0.54,
  careerBet: 0.42,
};

export interface LateCareerStakeholderBindings {
  board?: EntityRef[];
  manager?: EntityRef[];
  employee?: EntityRef[];
  client?: EntityRef[];
  agent?: EntityRef[];
  family?: EntityRef[];
  journalist?: EntityRef[];
  rival?: EntityRef[];
}

export interface MaterializedLateCareerDilemma {
  decision: DecisionRecord;
  stakeholders: LateCareerStakeholderBindings;
}

export interface LateCareerDilemmaMutationResult {
  state: GameState;
  decision?: DecisionRecord;
  changed: boolean;
  error?: string;
}

function clamp(value: number, min = -100, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function profileFor(
  definition: LateCareerDilemmaDefinition,
  option: LateCareerDilemmaOption,
): OptionConsequenceProfile {
  const profile = OPTION_PROFILES[`${definition.id}:${option.id}`];
  if (!profile) throw new Error(`Missing consequence profile for ${definition.id}/${option.id}`);
  return profile;
}

function firstContact(
  state: GameState,
  predicate: (type: GameState["contacts"][string]["type"]) => boolean,
): EntityRef[] | undefined {
  const contact = Object.values(state.contacts)
    .filter((candidate) => predicate(candidate.type))
    .sort((left, right) => right.relationship - left.relationship || left.id.localeCompare(right.id))[0];
  return contact ? [{ kind: "contact", id: contact.id }] : undefined;
}

/** Bind authored roles to persistent people already present in this save. */
export function resolveLateCareerStakeholders(
  state: GameState,
  definition: LateCareerDilemmaDefinition,
  overrides: LateCareerStakeholderBindings = {},
  subjectPlayerId?: string,
): LateCareerStakeholderBindings {
  const club = state.scout.currentClubId ? state.clubs[state.scout.currentClubId] : undefined;
  const employee = state.finances?.employees
    .slice()
    .sort((left, right) => right.morale - left.morale || left.id.localeCompare(right.id))[0];
  const rival = Object.values(state.rivalScouts)
    .sort((left, right) => Number(right.isNemesis) - Number(left.isNemesis)
      || right.reputation - left.reputation
      || left.id.localeCompare(right.id))[0];
  const manager = getManagerStakeholderRef(state);
  const resolved: LateCareerStakeholderBindings = {
    board: club ? [{ kind: "board", id: club.id }] : undefined,
    manager: manager ? [manager] : undefined,
    employee: employee ? [{ kind: "employee", id: employee.id }] : undefined,
    client: firstContact(state, (type) => type === "sportingDirector" || type === "clubStaff"),
    agent: firstContact(state, (type) => type === "agent" || type === "youthAgent"),
    family: subjectPlayerId ? [{ kind: "family", id: subjectPlayerId }] : undefined,
    journalist: firstContact(state, (type) => type === "journalist"),
    rival: rival ? [{ kind: "rival", id: rival.id }] : undefined,
    ...overrides,
  };
  return Object.fromEntries(
    definition.stakeholders
      .map((kind) => [kind, resolved[kind]])
      .filter((entry): entry is [LateCareerStakeholderKind, EntityRef[]] => Boolean(entry[1]?.length)),
  );
}

function uniqueStakeholders(bindings: LateCareerStakeholderBindings): EntityRef[] {
  const seen = new Set<string>();
  return Object.values(bindings).flatMap((refs) => refs ?? []).filter((ref) => {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function metricEffects(prefix: string, deltas: MetricDeltas): ConsequenceEffect[] {
  const values: Array<[string, number | undefined]> = [
    ["scout:reputation", deltas.reputation],
    ["scout:clubTrust", deltas.clubTrust],
    ["scout:specializationReputation", deltas.specializationReputation],
    ["scout:fatigue", deltas.fatigue],
  ];
  return values.flatMap(([metricKey, delta]) => delta
    ? [{ id: `effect:${prefix}:metric:${metricKey}`, type: "adjustMetric" as const, metricKey, delta, min: 0, max: 100 }]
    : []);
}

function stakeholderMetric(ref: EntityRef): string | undefined {
  if (ref.kind === "contact") return `contact:${ref.id}:trust`;
  if (ref.kind === "employee") return `employee:${ref.id}:morale`;
  if (ref.kind === "rival") return `rival:${ref.id}:aggressiveness`;
  return undefined;
}

function stakeholderEffects(input: {
  prefix: string;
  refs: EntityRef[];
  role: LateCareerStakeholderKind;
  valence: number;
  scoutId: string;
  decisionId: string;
  at: GameDate;
  stage: "opening" | "callback";
}): ConsequenceEffect[] {
  return input.refs.flatMap((ref, index) => {
    const metricKey = stakeholderMetric(ref);
    const metricDelta = metricKey
      ? Math.round(clamp(
          ref.kind === "rival" ? -input.valence / 10 : input.valence / 10,
          -10,
          10,
        ))
      : 0;
    return [
      {
        id: `effect:${input.prefix}:memory:${input.role}:${index}`,
        type: "addMemory" as const,
        memory: {
          id: `memory:${input.prefix}:${input.role}:${ref.kind}:${ref.id}`,
          stakeholder: ref,
          subject: { kind: "scout", id: input.scoutId },
          tags: ["lateCareerDilemma", input.stage, input.role],
          valence: clamp(input.valence),
          intensity: Math.round(clamp(48 + Math.abs(input.valence) * 0.45, 40, 94)),
          salience: Math.round(clamp(55 + Math.abs(input.valence) * 0.42, 48, 96)),
          visibility: "stakeholders" as const,
          createdAt: input.at,
          sourceDecisionId: input.decisionId,
          halfLifeWeeks: input.stage === "callback" ? 156 : 104,
          metadata: { role: input.role, stage: input.stage },
        },
      },
      ...(metricKey && metricDelta !== 0
        ? [{ id: `effect:${input.prefix}:metric:${input.role}:${index}`, type: "adjustMetric" as const, metricKey, delta: metricDelta, min: 0, max: 100 }]
        : []),
    ];
  });
}

function factEffect(input: {
  prefix: string;
  decisionId: string;
  definition: LateCareerDilemmaDefinition;
  option: LateCareerDilemmaOption;
  at: GameDate;
  stage: "opening" | "reckoning" | "callback";
  branch?: "favorable" | "costly";
}): ConsequenceEffect {
  return {
    id: `effect:${input.prefix}:fact`,
    type: "recordFact",
    fact: {
      id: `fact:${input.prefix}`,
      kind: "LateCareerDilemmaOutcome",
      subject: { kind: "lateCareerDilemma", id: input.definition.id },
      value: {
        optionId: input.option.id,
        stage: input.stage,
        branch: input.branch ?? null,
        immediateOutcomeTags: [...input.option.immediateOutcomeTags],
        delayedOutcomeTags: [...input.option.delayedOutcomeTags],
        recoveryTags: [...input.option.recoveryTags],
      },
      observedAt: input.at,
      visibility: input.stage === "opening" ? "stakeholders" : "public",
      sourceDecisionId: input.decisionId,
    },
  };
}

function buildDecisionOption(input: {
  state: GameState;
  definition: LateCareerDilemmaDefinition;
  option: LateCareerDilemmaOption;
  decisionId: string;
  stakeholders: LateCareerStakeholderBindings;
  offeredAt: GameDate;
}): DecisionOption {
  const { state, definition, option, decisionId, stakeholders, offeredAt } = input;
  const profile = profileFor(definition, option);
  const reckoningAt = addGameWeeks(
    state.fixtures,
    offeredAt,
    definition.stages.find((stage) => stage.id === "reckoning")?.delayWeeks ?? 8,
  );
  const callbackAt = addGameWeeks(
    state.fixtures,
    offeredAt,
    definition.stages.find((stage) => stage.id === "callback")?.delayWeeks ?? 52,
  );
  const branchRoll = createNamedRNG(
    state.runManifest.rootSeed,
    "late-career-dilemma-outcome",
    decisionId,
    option.id,
  ).next();
  const branch = branchRoll < FAVORABLE_CHANCE[profile.risk] ? "favorable" : "costly";
  const obligationId = `obligation:${decisionId}:${option.id}:career-promise`;
  const creditor = uniqueStakeholders(stakeholders)[0]
    ?? { kind: "career", id: definition.id };
  const immediatePrefix = `${decisionId}:${option.id}:opening`;
  const callbackPrefix = `${decisionId}:${option.id}:callback:${branch}`;
  const immediateStakeholderEffects = definition.stakeholders.flatMap((role) =>
    stakeholderEffects({
      prefix: immediatePrefix,
      refs: stakeholders[role] ?? [],
      role,
      valence: profile.stakeholderValence[role] ?? 0,
      scoutId: state.scout.id,
      decisionId,
      at: offeredAt,
      stage: "opening",
    }),
  );
  const callbackValence = branch === "favorable" ? 34 : -38;
  const callbackStakeholderEffects = definition.stakeholders.flatMap((role) =>
    stakeholderEffects({
      prefix: callbackPrefix,
      refs: stakeholders[role] ?? [],
      role,
      valence: callbackValence,
      scoutId: state.scout.id,
      decisionId,
      at: callbackAt,
      stage: "callback",
    }),
  );

  return {
    id: option.id,
    label: option.label,
    knownTradeoffs: [...option.knownTradeoffs],
    immediateEffects: [
      factEffect({ prefix: immediatePrefix, decisionId, definition, option, at: offeredAt, stage: "opening" }),
      ...metricEffects(immediatePrefix, profile.immediate),
      ...immediateStakeholderEffects,
      {
        id: `effect:${immediatePrefix}:obligation`,
        type: "createObligation",
        obligation: {
          id: obligationId,
          debtor: { kind: "scout", id: state.scout.id },
          creditor,
          kind: "lateCareerAccountability",
          terms: `Live with the operational and reputational consequences of: ${option.label}.`,
          status: "active",
          createdAt: offeredAt,
          dueAt: callbackAt,
          sourceDecisionId: decisionId,
          metadata: { dilemmaId: definition.id, optionId: option.id },
        },
      },
    ],
    scheduledConsequences: [
      {
        id: "reckoning",
        dueAt: reckoningAt,
        effects: [
          factEffect({ prefix: `${decisionId}:${option.id}:reckoning`, decisionId, definition, option, at: reckoningAt, stage: "reckoning" }),
          ...metricEffects(`${decisionId}:${option.id}:reckoning`, profile.reckoning),
        ],
        tags: ["lateCareerDilemma", definition.id, option.id, "reckoning"],
      },
      {
        id: "callback",
        dueAt: callbackAt,
        effects: [
          factEffect({ prefix: callbackPrefix, decisionId, definition, option, at: callbackAt, stage: "callback", branch }),
          ...metricEffects(callbackPrefix, branch === "favorable" ? profile.favorable : profile.costly),
          ...callbackStakeholderEffects,
          {
            id: `effect:${callbackPrefix}:obligation`,
            type: "transitionObligation",
            obligationId,
            status: branch === "favorable" ? "fulfilled" : "breached",
            note: `${definition.title}: ${option.label} produced a ${branch} long-term callback.`,
          },
        ],
        tags: ["lateCareerDilemma", definition.id, option.id, "callback", branch],
      },
    ],
  };
}

function defaultOptionId(definition: LateCareerDilemmaDefinition): string {
  return [...definition.options]
    .sort((left, right) => {
      const weight = { measured: 0, volatile: 1, careerBet: 2 } as const;
      return weight[profileFor(definition, left).risk] - weight[profileFor(definition, right).risk]
        || left.id.localeCompare(right.id);
    })[0]?.id ?? definition.options[0].id;
}

/** Materialize authored content into the existing persisted consequence ledger. */
export function materializeLateCareerDilemma(
  state: GameState,
  definition: LateCareerDilemmaDefinition,
  options: {
    stakeholderOverrides?: LateCareerStakeholderBindings;
    subjectPlayerId?: string;
    decisionId?: string;
    deadlineWeeks?: number;
  } = {},
): MaterializedLateCareerDilemma {
  const offeredAt = { week: state.currentWeek, season: state.currentSeason };
  const decisionId = options.decisionId
    ?? `late-career:${definition.id}:s${state.currentSeason}w${state.currentWeek}`;
  const stakeholders = resolveLateCareerStakeholders(
    state,
    definition,
    options.stakeholderOverrides,
    options.subjectPlayerId,
  );
  const decision = createDecisionRecord({
    id: decisionId,
    source: { kind: "lateCareerDilemma", id: definition.id },
    offeredAt,
    deadlineAt: addGameWeeks(state.fixtures, offeredAt, options.deadlineWeeks ?? 2),
    visibility: "stakeholders",
    stakeholders: uniqueStakeholders(stakeholders),
    options: definition.options.map((option) => buildDecisionOption({
      state,
      definition,
      option,
      decisionId,
      stakeholders,
      offeredAt,
    })),
    defaultOptionId: defaultOptionId(definition),
    outcomeRoll: createNamedRNG(
      state.runManifest.rootSeed,
      "late-career-dilemma-decision",
      decisionId,
    ).next(),
    seasonLength: getSeasonLength(state.fixtures, state.currentSeason),
    metadata: {
      dilemmaId: definition.id,
      title: definition.title,
      premise: definition.premise,
      stakeholderRoles: [...definition.stakeholders],
      ...(options.subjectPlayerId ? { relatedPlayerId: options.subjectPlayerId } : {}),
    },
  });
  return { decision, stakeholders };
}

/** Register once and seed every referenced domain metric from authoritative state. */
export function offerLateCareerDilemma(
  state: GameState,
  definition: LateCareerDilemmaDefinition,
  options: Parameters<typeof materializeLateCareerDilemma>[2] = {},
): LateCareerDilemmaMutationResult {
  const materialized = materializeLateCareerDilemma(state, definition, options);
  const registered = registerDecision(state.consequenceState, materialized.decision);
  if (registered.error) return { state, decision: materialized.decision, changed: false, error: registered.error };
  if (!registered.changed) return { state, decision: materialized.decision, changed: false };
  const withDecision = { ...state, consequenceState: registered.state };
  const synchronized = synchronizeConsequenceMetrics(withDecision, registered.state);
  return {
    state: { ...withDecision, consequenceState: synchronized },
    decision: materialized.decision,
    changed: true,
  };
}

/** Select and immediately project the opening costs; delayed callbacks stay queued. */
export function chooseLateCareerDilemmaOption(
  state: GameState,
  decisionId: string,
  optionId: string,
): LateCareerDilemmaMutationResult {
  const now = { week: state.currentWeek, season: state.currentSeason };
  const seasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  const synchronized = synchronizeConsequenceMetrics(state, state.consequenceState);
  const selected = selectDecisionOption(
    synchronized,
    decisionId,
    optionId,
    now,
    "player",
    seasonLength,
  );
  if (selected.error) return { state, changed: false, error: selected.error };
  if (!selected.changed) return { state, changed: false };
  const processed = processDueConsequences(selected.state, now, seasonLength);
  const withConsequences = { ...state, consequenceState: processed.state };
  return {
    state: projectConsequenceMetrics(withConsequences, processed.state),
    decision: processed.state.decisions[decisionId],
    changed: true,
    error: processed.errors.length > 0 ? processed.errors.join("; ") : undefined,
  };
}

/** Catch missing balance rows before content reaches a player-facing build. */
export function validateLateCareerDilemmaProfiles(
  definitions: readonly LateCareerDilemmaDefinition[],
): string[] {
  const expected = new Set(definitions.flatMap((definition) =>
    definition.options.map((option) => `${definition.id}:${option.id}`),
  ));
  return [
    ...[...expected].filter((key) => !OPTION_PROFILES[key]).map((key) => `Missing option profile: ${key}`),
    ...Object.keys(OPTION_PROFILES).filter((key) => !expected.has(key)).map((key) => `Orphan option profile: ${key}`),
  ].sort();
}
