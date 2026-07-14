import { elapsedGameWeeks } from "./decisionLedger";
import type {
  ConsequenceEngineState,
  DecisionRecord,
  EntityRef,
  GameDate,
  Obligation,
  StakeholderMemory,
} from "./types";

export interface StakeholderMemorySummary {
  id: string;
  summary: string;
  tone: "positive" | "mixed" | "negative";
  occurredAt: GameDate;
  effectiveSalience: number;
}

export interface StakeholderObligationSummary {
  id: string;
  role: "owedByYou" | "owedToYou" | "involved";
  terms: string;
  status: Obligation["status"];
  dueAt?: GameDate;
  counterpart: EntityRef;
}

export interface StakeholderDecisionSummary {
  id: string;
  summary: string;
  status: DecisionRecord["status"];
  offeredAt: GameDate;
  selectedOption?: string;
  nextConsequenceAt?: GameDate;
}

export interface StakeholderEcologyProfile {
  stakeholder: EntityRef;
  trust: {
    base?: number;
    memoryDelta: number;
    effective?: number;
    label: string;
  };
  influence: {
    score: number;
    label: string;
    activeObligations: number;
    recentDecisions: number;
  };
  memories: StakeholderMemorySummary[];
  obligations: StakeholderObligationSummary[];
  decisions: StakeholderDecisionSummary[];
}

export interface BuildStakeholderEcologyInput {
  state: ConsequenceEngineState;
  stakeholder: EntityRef;
  now: GameDate;
  seasonLength?: number;
  scoutId?: string;
  baseTrust?: number;
  baseInfluence?: number;
  resolveEntityName?: (entity: EntityRef) => string | undefined;
  limit?: number;
}

function sameEntity(left: EntityRef, right: EntityRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function effectiveSalience(
  memory: StakeholderMemory,
  now: GameDate,
  seasonLength: number,
): number {
  if (!memory.halfLifeWeeks) return memory.salience;
  const age = Math.max(0, elapsedGameWeeks(now, memory.createdAt, seasonLength));
  return memory.salience * Math.pow(0.5, age / memory.halfLifeWeeks);
}

function dateOrdinal(date: GameDate, seasonLength: number): number {
  return (date.season - 1) * seasonLength + date.week;
}

function relatedPlayerName(
  memory: StakeholderMemory,
  resolveEntityName?: BuildStakeholderEcologyInput["resolveEntityName"],
): string | undefined {
  const playerId = typeof memory.metadata?.playerId === "string"
    ? memory.metadata.playerId
    : undefined;
  return playerId ? resolveEntityName?.({ kind: "player", id: playerId }) : undefined;
}

function memorySummary(
  memory: StakeholderMemory,
  resolveEntityName?: BuildStakeholderEcologyInput["resolveEntityName"],
): string {
  const playerName = relatedPlayerName(memory, resolveEntityName);
  const subject = playerName ? ` on ${playerName}` : "";
  const tags = new Set(memory.tags);

  if (tags.has("protectedSource") || tags.has("caseSourceProtected")) {
    return `You protected a confidential source${subject}.`;
  }
  if (tags.has("askedForVerification") || tags.has("caseVerificationRequested")) {
    return `You trusted their judgment enough to verify your read${subject}.`;
  }
  if (tags.has("earlyCall") || tags.has("caseClubFirstMover")) {
    return `You moved early and put your reputation behind a lead${subject}.`;
  }
  if (tags.has("caseSourceExposed")) {
    return `They remember that speed took priority over protecting the source${subject}.`;
  }
  if (tags.has("caseRivalPressure")) {
    return `They recognize you as direct competition for the same prospect${subject}.`;
  }
  if (tags.has("caseFollowThrough")) {
    return `Your handling of the follow-up remains part of their assessment${subject}.`;
  }
  if (tags.has("protectedFamily")) {
    return `They remember that you protected the family's privacy when publicity offered an easier reward${subject}.`;
  }
  if (tags.has("exposedFamily")) {
    return `They remember that you put media access ahead of the family's privacy request${subject}.`;
  }
  if (tags.has("creditedWork")) {
    return `They remember that you put their name on work they genuinely owned${subject}.`;
  }
  if (tags.has("creditDenied")) {
    return `They remember that someone outside the agency received credit for their work${subject}.`;
  }
  if (tags.has("sourceAttribution") && tags.has("promiseKept")) {
    return `They remember that you honored their role in opening the opportunity${subject}.`;
  }
  if (tags.has("ceasefire")) {
    return `They remember the competitive boundary you agreed and will judge whether you keep it${subject}.`;
  }
  if (tags.has("ceasefireRejected")) {
    return `They remember that you rejected a quiet settlement and chose direct competition${subject}.`;
  }
  if (tags.has("negotiatedBoundary")) {
    return `They remember the boundary you negotiated when two loyalties collided${subject}.`;
  }
  if (tags.has("breach") || tags.has("betrayal") || tags.has("confidentialityBreach")) {
    return `They remember a broken promise${subject}.`;
  }
  if (tags.has("reliable") || tags.has("trusted") || tags.has("keptPromise")) {
    return `They remember that you followed through${subject}.`;
  }

  const theme = memory.tags.find((tag) => !["openingDiscovery", "caseDirector"].includes(tag));
  return theme
    ? `A past ${theme.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} decision still shapes this relationship${subject}.`
    : `A past decision still shapes this relationship${subject}.`;
}

function decisionSummary(decision: DecisionRecord): string {
  const hasCaseId = typeof decision.metadata?.caseId === "string";
  if (hasCaseId) return "Opening prospect handling";
  const title = typeof decision.metadata?.title === "string"
    ? decision.metadata.title
    : undefined;
  if (title) return title;
  return decision.source.kind
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function trustLabel(effective: number | undefined, delta: number): string {
  if (effective !== undefined) {
    if (effective >= 75) return "Strong trust";
    if (effective >= 50) return "Working trust";
    if (effective >= 25) return "Conditional trust";
    return "Low trust";
  }
  if (delta >= 5) return "Positive history";
  if (delta <= -5) return "Hostile history";
  return "Limited history";
}

function influenceLabel(score: number): string {
  if (score >= 75) return "Major influence";
  if (score >= 50) return "Established influence";
  if (score >= 25) return "Local influence";
  return "Limited influence";
}

/**
 * Player-safe projection of one recurring actor's causal history. It exposes
 * only persisted decisions and relationship records, never hidden player truth.
 */
export function buildStakeholderEcologyProfile(
  input: BuildStakeholderEcologyInput,
): StakeholderEcologyProfile {
  const seasonLength = Math.max(1, Math.floor(input.seasonLength ?? 38));
  const limit = Math.max(1, Math.floor(input.limit ?? 4));
  const rawMemories = Object.values(input.state.memories)
    .filter((memory) => sameEntity(memory.stakeholder, input.stakeholder))
    .map((memory) => ({
      memory,
      salience: effectiveSalience(memory, input.now, seasonLength),
    }))
    .sort((left, right) =>
      right.salience - left.salience
      || dateOrdinal(right.memory.createdAt, seasonLength)
        - dateOrdinal(left.memory.createdAt, seasonLength)
      || left.memory.id.localeCompare(right.memory.id),
    );
  const memories: StakeholderMemorySummary[] = rawMemories
    .slice(0, limit)
    .map(({ memory, salience }) => ({
      id: memory.id,
      summary: memorySummary(memory, input.resolveEntityName),
      tone: memory.valence > 8 ? "positive" : memory.valence < -8 ? "negative" : "mixed",
      occurredAt: memory.createdAt,
      effectiveSalience: Math.round(salience),
    }));

  const scout = input.scoutId ? { kind: "scout", id: input.scoutId } : undefined;
  const obligations: StakeholderObligationSummary[] = Object.values(input.state.obligations)
    .filter((obligation) =>
      sameEntity(obligation.creditor, input.stakeholder)
      || sameEntity(obligation.debtor, input.stakeholder),
    )
    .sort((left, right) =>
      Number(right.status === "active") - Number(left.status === "active")
      || dateOrdinal(right.createdAt, seasonLength) - dateOrdinal(left.createdAt, seasonLength)
      || left.id.localeCompare(right.id),
    )
    .slice(0, limit)
    .map((obligation) => {
      const stakeholderIsCreditor = sameEntity(obligation.creditor, input.stakeholder);
      const counterpart = stakeholderIsCreditor ? obligation.debtor : obligation.creditor;
      const role = scout && sameEntity(counterpart, scout)
        ? stakeholderIsCreditor ? "owedByYou" as const : "owedToYou" as const
        : "involved" as const;
      return {
        id: obligation.id,
        role,
        terms: obligation.terms,
        status: obligation.status,
        dueAt: obligation.dueAt,
        counterpart,
      };
    });

  const decisions: StakeholderDecisionSummary[] = Object.values(input.state.decisions)
    .filter((decision) =>
      decision.stakeholders.some((stakeholder) => sameEntity(stakeholder, input.stakeholder))
      || sameEntity(decision.source, input.stakeholder),
    )
    .sort((left, right) =>
      dateOrdinal(right.offeredAt, seasonLength) - dateOrdinal(left.offeredAt, seasonLength)
      || left.id.localeCompare(right.id),
    )
    .slice(0, limit)
    .map((decision) => {
      const nextConsequence = Object.values(input.state.consequences)
        .filter((consequence) =>
          consequence.decisionId === decision.id && consequence.status === "pending",
        )
        .sort((left, right) =>
          dateOrdinal(left.dueAt, seasonLength) - dateOrdinal(right.dueAt, seasonLength)
          || left.id.localeCompare(right.id),
        )[0];
      return {
        id: decision.id,
        summary: decisionSummary(decision),
        status: decision.status,
        offeredAt: decision.offeredAt,
        selectedOption: decision.options.find((option) => option.id === decision.selectedOptionId)?.label,
        nextConsequenceAt: nextConsequence?.dueAt,
      };
    });

  const weightedMemory = rawMemories.reduce(
    (total, { memory, salience }) =>
      total + memory.valence * (memory.intensity / 100) * (salience / 100),
    0,
  );
  const memoryDelta = Math.round(clamp(weightedMemory / 4, -20, 20));
  const baseTrust = input.baseTrust === undefined ? undefined : clamp(input.baseTrust);
  const effectiveTrust = baseTrust === undefined ? undefined : Math.round(clamp(baseTrust + memoryDelta));
  const activeObligations = obligations.filter((obligation) => obligation.status === "active").length;
  const influenceScore = Math.round(clamp(
    (input.baseInfluence ?? 0)
      + Math.min(12, activeObligations * 4)
      + Math.min(10, decisions.length * 2)
      + Math.min(8, rawMemories.length * 1.5),
  ));

  return {
    stakeholder: { ...input.stakeholder },
    trust: {
      base: baseTrust,
      memoryDelta,
      effective: effectiveTrust,
      label: trustLabel(effectiveTrust, memoryDelta),
    },
    influence: {
      score: influenceScore,
      label: influenceLabel(influenceScore),
      activeObligations,
      recentDecisions: decisions.length,
    },
    memories,
    obligations,
    decisions,
  };
}
