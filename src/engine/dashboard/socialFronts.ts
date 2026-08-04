import type { DecisionRecord } from "@/engine/consequences/types";
import {
  buildStoryThread,
  createConsequenceEngineState,
  isAccessAgreementActive,
} from "@/engine/consequences";
import { gameWeeksBetween } from "@/engine/core/gameDate";
import type { GameDate, GameState } from "@/engine/core/types";
import { getOpenRivalOrganizationOpportunities } from "@/engine/rivals";
import type { DashboardActionTarget, DashboardCareerThread, DashboardPrioritySourceSystem } from "./types";

export interface DashboardSocialFront {
  id: string;
  family: "relationship_conflict";
  sourceSystem: DashboardPrioritySourceSystem;
  decisionId: string;
  playerId?: string;
  caseId?: string;
  reportId?: string;
  contactId?: string;
  rivalPlayerId?: string;
  title: string;
  summary: string;
  explanation: string;
  consequence: string;
  actionLabel: string;
  actionTarget: DashboardActionTarget;
  sourceActionTarget: DashboardActionTarget;
  evidenceIds: string[];
  lastUpdatedAt: GameDate;
  significance: number;
  tone: "neutral" | "negative";
  dueAt?: GameDate;
}

function compareDates(left: GameDate, right: GameDate): number {
  return left.season - right.season || left.week - right.week;
}

function uniqueIds(ids: Array<string | undefined | null>): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

function relatedPlayerId(decision: DecisionRecord): string | undefined {
  const playerId = decision.metadata?.relatedPlayerId;
  return typeof playerId === "string" && playerId.length > 0 ? playerId : undefined;
}

function stakeholderKey(entity: { kind: string; id: string }): string {
  return `${entity.kind}:${entity.id}`;
}

function resolveEntityName(state: GameState, entity: { kind: string; id: string }): string | undefined {
  if (entity.kind === "player" || entity.kind === "family") {
    const player = state.players[entity.id] ?? state.retiredPlayers?.[entity.id];
    if (!player) return entity.kind === "family" ? "The family" : undefined;
    const name = `${player.firstName} ${player.lastName}`.trim() || "The player";
    return entity.kind === "family" ? `${name}'s family` : name;
  }
  if (entity.kind === "contact" || entity.kind === "journalist" || entity.kind === "agent") {
    return state.contacts[entity.id]?.name;
  }
  if (entity.kind === "rival") {
    return state.rivalScouts[entity.id]?.name;
  }
  if (entity.kind === "employee") {
    return state.finances?.employees.find((employee) => employee.id === entity.id)?.name;
  }
  if (entity.kind === "club" || entity.kind === "board" || entity.kind === "director") {
    return state.clubs[entity.id]?.name;
  }
  return undefined;
}

function earliestPendingDueAt(state: GameState, decisionId: string): GameDate | undefined {
  return Object.values(state.consequenceState?.consequences ?? {})
    .filter((consequence) =>
      consequence.decisionId === decisionId
      && consequence.status === "pending"
    )
    .map((consequence) => consequence.dueAt)
    .sort(compareDates)[0];
}

function activeDecisionObligationIds(state: GameState, decisionId: string): string[] {
  return Object.values(state.consequenceState?.obligations ?? {})
    .filter((obligation) =>
      obligation.sourceDecisionId === decisionId
      && obligation.status === "active"
    )
    .map((obligation) => obligation.id)
    .sort();
}

function activeDecisionAccessIds(state: GameState, decisionId: string): string[] {
  const now = { season: state.currentSeason, week: state.currentWeek };
  return Object.values(state.accessAgreements ?? {})
    .filter((agreement) =>
      agreement.sourceDecisionId === decisionId
      && isAccessAgreementActive(agreement, now)
    )
    .map((agreement) => agreement.id)
    .sort();
}

function primaryStakeholder(decision: DecisionRecord): DecisionRecord["stakeholders"][number] | undefined {
  return decision.stakeholders.find((stakeholder) => stakeholder.kind === "contact")
    ?? decision.stakeholders.find((stakeholder) => stakeholder.kind === "rival")
    ?? decision.stakeholders.find((stakeholder) => stakeholder.kind !== "scout")
    ?? decision.stakeholders[0];
}

function sourceSystemFor(decision: DecisionRecord): DashboardPrioritySourceSystem {
  return decision.stakeholders.some((stakeholder) => stakeholder.kind === "rival")
    ? "rivals"
    : "relationships";
}

function sourceActionTarget(
  state: GameState,
  decision: DecisionRecord,
  playerId: string | undefined,
): DashboardActionTarget {
  const caseId = typeof decision.metadata?.caseId === "string"
    ? decision.metadata.caseId
    : undefined;
  const reportId = typeof decision.metadata?.reportId === "string"
    ? decision.metadata.reportId
    : undefined;
  if (caseId || reportId) {
    return {
      screen: "reportHistory",
      caseId,
      reportId,
      playerId,
    };
  }
  if (playerId) return { screen: "playerProfile", playerId };
  const stakeholder = primaryStakeholder(decision);
  if (stakeholder?.kind === "contact") {
    return { screen: "network", contactId: stakeholder.id };
  }
  if (stakeholder?.kind === "rival") {
    return { screen: "rivals", playerId };
  }
  return { screen: "career", focus: "overview" };
}

function priorityActionTarget(
  state: GameState,
  decision: DecisionRecord,
  playerId: string | undefined,
  fallback: DashboardActionTarget,
): DashboardActionTarget {
  const stakeholder = primaryStakeholder(decision);
  if (stakeholder?.kind === "contact") {
    return {
      screen: "network",
      contactId: stakeholder.id,
      playerId,
    };
  }
  if (stakeholder?.kind === "rival") {
    const opportunity = findMatchingRivalOpportunity(state, decision, playerId);
    return {
      screen: "rivals",
      ...(opportunity ? { opportunityId: opportunity.id } : {}),
      playerId,
    };
  }
  return fallback;
}

function actionLabel(
  target: DashboardActionTarget,
  state: GameState,
  decision: DecisionRecord,
  playerId: string | undefined,
): string {
  switch (target.screen) {
    case "network":
      return "Protect the line";
    case "rivals": {
      const opportunityId = "opportunityId" in target ? target.opportunityId : undefined;
      if (opportunityId) {
        const opportunity = state.rivalOrganizationState?.opportunities?.[opportunityId];
        if (opportunity) return rivalOpportunityActionLabel(opportunity.kind);
      }
      if (findMatchingRivalOpportunity(state, decision, playerId)) {
        return "Exploit rival opening";
      }
      return "Open rival front";
    }
    case "reportHistory":
      return "Revisit the case";
    case "playerProfile":
      return "Review the player";
    default:
      return "Review the front";
  }
}

function threadPressureLines(
  state: GameState,
  decision: DecisionRecord,
): string[] {
  const now = { season: state.currentSeason, week: state.currentWeek };
  const normalizedConsequenceState = createConsequenceEngineState(state.consequenceState);
  return decision.stakeholders
    .filter((stakeholder) => stakeholder.kind !== "scout")
    .map((stakeholder) => {
      const latest = buildStoryThread({
        state: {
          consequenceState: normalizedConsequenceState,
          accessAgreements: state.accessAgreements,
        },
        stakeholder,
        now,
      }).entries[0];
      if (!latest) return undefined;
      const name = resolveEntityName(state, stakeholder) ?? latest.title;
      return `${name}: ${latest.description}`;
    })
    .filter((line): line is string => Boolean(line))
    .slice(0, 2);
}

function weeksUntil(
  state: GameState,
  dueAt: GameDate | undefined,
): number | undefined {
  if (!dueAt) return undefined;
  return gameWeeksBetween(
    state.fixtures,
    { season: state.currentSeason, week: state.currentWeek },
    dueAt,
  );
}

function frontTitle(
  state: GameState,
  decision: DecisionRecord,
  playerId: string | undefined,
  dueAt: GameDate | undefined,
): string {
  const recurrenceName = typeof decision.metadata?.recurrenceName === "string"
    ? decision.metadata.recurrenceName
    : "Relationship pressure";
  const playerName = playerId ? resolveEntityName(state, { kind: "player", id: playerId }) : undefined;
  if (playerName && dueAt && compareDates(dueAt, { season: state.currentSeason, week: state.currentWeek }) <= 0) {
    return `${playerName}: ${recurrenceName} needs protecting now`;
  }
  if (playerName) return `${playerName}: ${recurrenceName} is still live`;
  return `${recurrenceName} is still live`;
}

function frontSummary(
  state: GameState,
  decision: DecisionRecord,
  playerId: string | undefined,
): string {
  const premise = typeof decision.metadata?.premise === "string"
    ? decision.metadata.premise
    : "Two relationships are still reading the choice you made under pressure.";
  if (!playerId) return premise;
  const playerName = resolveEntityName(state, { kind: "player", id: playerId });
  return playerName
    ? premise.replace(playerName, "the player")
    : premise;
}

function frontConsequence(
  dueAt: GameDate | undefined,
  obligationCount: number,
  accessCount: number,
): string {
  if (dueAt) {
    return `The next relationship callback lands by S${dueAt.season} W${dueAt.week}. Until then, the line stays live and can still redirect access, trust, or rivalry heat.`;
  }
  if (obligationCount > 0) {
    return "An active promise is still attached to this choice. Leaving it unattended keeps the social cost live instead of resolved.";
  }
  if (accessCount > 0) {
    return "A protected access window is still attached to this choice. If you coast, the advantage expires without a defended intervention.";
  }
  return "The choice has not become history yet. The social pressure is still moving in the world.";
}

function frontExplanation(
  state: GameState,
  decision: DecisionRecord,
  pressureLines: readonly string[],
  dueAt: GameDate | undefined,
): string {
  const selectedLabel = decision.options.find((option) => option.id === decision.selectedOptionId)?.label
    ?? "Recorded response";
  const followUpLine = dueAt
    ? `The world checks back in at S${dueAt.season} W${dueAt.week}.`
    : "The world is still carrying the choice forward.";
  return [
    `You chose "${selectedLabel}."`,
    ...pressureLines,
    followUpLine,
  ].join(" ");
}

function rivalStakeholderIds(decision: DecisionRecord): string[] {
  return decision.stakeholders
    .filter((stakeholder) => stakeholder.kind === "rival")
    .map((stakeholder) => stakeholder.id)
    .sort();
}

function findMatchingRivalOpportunity(
  state: GameState,
  decision: DecisionRecord,
  playerId: string | undefined,
) {
  const openOpportunities = getOpenRivalOrganizationOpportunities(state.rivalOrganizationState);
  if (openOpportunities.length === 0) return undefined;

  const rivalIds = new Set(rivalStakeholderIds(decision));
  return openOpportunities
    .filter((opportunity) => {
      if (playerId && opportunity.relatedPlayerId === playerId) return true;
      if (rivalIds.size === 0) return false;
      const organization = state.rivalOrganizationState.organizations[opportunity.organizationId];
      return Boolean(
        organization?.memberRivalIds.some((rivalId) => rivalIds.has(rivalId)),
      );
    })
    .sort((left, right) =>
      compareDates(
        { season: left.expiresSeason, week: left.expiresWeek },
        { season: right.expiresSeason, week: right.expiresWeek },
      ) || left.id.localeCompare(right.id),
    )[0];
}

function rivalOpportunityActionLabel(
  kind: ReturnType<typeof getOpenRivalOrganizationOpportunities>[number]["kind"],
): string {
  switch (kind) {
    case "counter-scouting-window":
      return "Counter-scout now";
    case "insider-intelligence":
      return "Exploit insider leak";
    case "open-showcase":
      return "Exploit showcase opening";
    case "relationship-defection":
      return "Turn relationship opening";
    default:
      return "Exploit rival opening";
  }
}

function threadForFront(front: DashboardSocialFront, pressureLines: readonly string[]): DashboardCareerThread {
  return {
    id: `career-thread:${front.id}`,
    type: "relationship_front",
    primaryItemId: front.id,
    relatedItemIds: uniqueIds([
      front.decisionId,
      front.playerId,
      front.caseId,
      front.reportId,
      front.contactId,
      ...front.evidenceIds,
    ]),
    playerId: front.playerId,
    caseId: front.caseId,
    decisionId: front.decisionId,
    reportId: front.reportId,
    title: front.title,
    summary: front.summary,
    whatHappened: [
      `LIVE FRONT: ${front.explanation}`,
      ...pressureLines.map((line) => `PRESSURE: ${line}`),
    ],
    careerImpact: front.consequence,
    actionTarget: front.sourceActionTarget,
    evidenceIds: front.evidenceIds,
    lastUpdatedAt: front.lastUpdatedAt,
    archived: false,
    significance: front.significance,
    tone: front.tone,
  };
}

export function buildDashboardSocialFronts(state: GameState): DashboardSocialFront[] {
  const fronts: DashboardSocialFront[] = [];
  const now = { season: state.currentSeason, week: state.currentWeek };
  for (const decision of Object.values(state.consequenceState?.decisions ?? {})) {
    if (decision.source.kind !== "relationshipConflict") continue;
    if (decision.status !== "selected" || !decision.selectedOptionId) continue;

    const pendingDueAt = earliestPendingDueAt(state, decision.id);
    const obligationIds = activeDecisionObligationIds(state, decision.id);
    const accessIds = activeDecisionAccessIds(state, decision.id);
    if (!pendingDueAt && obligationIds.length === 0 && accessIds.length === 0) continue;

    const playerId = relatedPlayerId(decision);
    const evidenceIds = uniqueIds([
      decision.id,
      playerId,
      ...decision.stakeholders.map((stakeholder) => stakeholder.id),
      ...obligationIds,
      ...accessIds,
    ]);
    const pressureLines = threadPressureLines(state, decision);
    const targetSource = sourceActionTarget(state, decision, playerId);
    const target = priorityActionTarget(state, decision, playerId, targetSource);
    const dueInWeeks = weeksUntil(state, pendingDueAt);
    const isRival = sourceSystemFor(decision) === "rivals";
    fronts.push({
      id: `social-front:${decision.id}`,
      family: "relationship_conflict",
      sourceSystem: sourceSystemFor(decision),
      decisionId: decision.id,
      ...(playerId ? { playerId } : {}),
      ...(typeof decision.metadata?.caseId === "string" ? { caseId: decision.metadata.caseId } : {}),
      ...(typeof decision.metadata?.reportId === "string" ? { reportId: decision.metadata.reportId } : {}),
      ...(target.screen === "network" && target.contactId ? { contactId: target.contactId } : {}),
      ...(target.screen === "rivals" && playerId ? { rivalPlayerId: playerId } : {}),
      title: frontTitle(state, decision, playerId, pendingDueAt),
      summary: frontSummary(state, decision, playerId),
      explanation: frontExplanation(state, decision, pressureLines, pendingDueAt),
      consequence: frontConsequence(pendingDueAt, obligationIds.length, accessIds.length),
      actionLabel: actionLabel(target, state, decision, playerId),
      actionTarget: target,
      sourceActionTarget: targetSource,
      evidenceIds,
      lastUpdatedAt: now,
      significance: Math.min(
        0.98,
        0.68
          + (isRival ? 0.1 : 0)
          + (obligationIds.length > 0 ? 0.08 : 0)
          + (accessIds.length > 0 ? 0.05 : 0)
          + (dueInWeeks !== undefined && dueInWeeks <= 1 ? 0.09 : 0),
      ),
      tone: isRival || obligationIds.length > 0 ? "negative" : "neutral",
      ...(pendingDueAt ? { dueAt: pendingDueAt } : {}),
    });
  }
  return fronts.sort((left, right) =>
    (right.significance - left.significance)
    || (left.dueAt && right.dueAt ? compareDates(left.dueAt, right.dueAt) : 0)
    || left.id.localeCompare(right.id),
  );
}

export function buildDashboardSocialFrontThreads(state: GameState): DashboardCareerThread[] {
  return buildDashboardSocialFronts(state).map((front) =>
    threadForFront(front, threadPressureLines(
      state,
      createConsequenceEngineState(state.consequenceState).decisions[front.decisionId],
    )),
  );
}
