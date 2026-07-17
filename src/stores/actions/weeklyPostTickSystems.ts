import type { GameState, InboxMessage } from "@/engine/core/types";
import { getSeasonLength, type TickResult } from "@/engine/core/gameLoop";
import { isFinancialPeriodClose } from "@/engine/core/annualization";
import { createRNG } from "@/engine/rng";
import { processMonthlySnapshot } from "@/engine/career";
import { applyCareerPathTransition } from "@/engine/career/transitions";
import { openCareerSetback } from "@/engine/career/recovery";
import {
  applyPulseConsequences,
  generatePerformancePulse,
  shouldGeneratePulse,
} from "@/engine/career/performancePulse";
import {
  CONSECUTIVE_REST_WEEKS_METRIC,
  evaluateFatigueConsequences,
  getNextConsecutiveRestWeeks,
  readConsecutiveRestWeeks,
  rollBurnoutIllness,
} from "@/engine/core/calendar";
import { createConsequenceEngineState } from "@/engine/consequences";
import { processMonthlyCredit } from "@/engine/finance/creditScore";
import { processDistress } from "@/engine/finance/distress";
import { projectWeeklyProspectFollowUps } from "@/engine/youth/prospectFollowUps";

export interface WeeklyPostTickSystemsInput {
  beforeWeek: GameState;
  state: GameState;
  alumniMilestones: TickResult["alumniMilestones"];
}

/** Build post-tick feedback and apply weekly career-health consequences. */
export function processWeeklyPostTickSystems(
  input: WeeklyPostTickSystemsInput,
): GameState {
  let state = input.state;

  const prospectFollowUps = projectWeeklyProspectFollowUps(state);
  if (prospectFollowUps.length > 0) {
    state = {
      ...state,
      inbox: [
        ...state.inbox,
        ...prospectFollowUps.map((beat) => beat.message),
      ],
    };
  }

  if (input.alumniMilestones && input.alumniMilestones.length > 0) {
    const messages: InboxMessage[] = input.alumniMilestones.map((milestone, index) => ({
      id: `msg_alumni_${milestone.type}_s${state.currentSeason}w${state.currentWeek}_${index}`,
      week: state.currentWeek,
      season: state.currentSeason,
      type: "event",
      title: `Alumni Milestone: ${milestone.type.replace(/([A-Z])/g, " $1").trim()}`,
      body: milestone.description,
      read: false,
      actionRequired: false,
    }));
    state = { ...state, inbox: [...state.inbox, ...messages] };
  }

  const decayWarnings: InboxMessage[] = [];
  for (const [contactId, contact] of Object.entries(state.contacts)) {
    const previous = input.beforeWeek.contacts[contactId];
    if (!previous) continue;
    if (contact.dormant && !previous.dormant) {
      decayWarnings.push({
        id: `decay-dormant-${contactId}-w${state.currentWeek}-s${state.currentSeason}`,
        week: state.currentWeek,
        season: state.currentSeason,
        type: "warning",
        title: `Contact Gone Dormant: ${contact.name}`,
        body: `Your contact ${contact.name} has gone dormant. Schedule a meeting to rebuild the relationship.`,
        read: false,
        actionRequired: false,
        relatedId: contactId,
        relatedEntityType: "contact",
      });
    }
    if (
      previous.relationship >= 30
      && contact.relationship < 30
      && !contact.dormant
    ) {
      decayWarnings.push({
        id: `decay-fading-${contactId}-w${state.currentWeek}-s${state.currentSeason}`,
        week: state.currentWeek,
        season: state.currentSeason,
        type: "warning",
        title: `Relationship Fading: ${contact.name}`,
        body: `Your relationship with ${contact.name} is fading. Consider reaching out.`,
        read: false,
        actionRequired: false,
        relatedId: contactId,
        relatedEntityType: "contact",
      });
    }
  }
  if (decayWarnings.length > 0) {
    state = { ...state, inbox: [...state.inbox, ...decayWarnings] };
  }

  const previousRestWeeks = readConsecutiveRestWeeks(
    input.beforeWeek.consequenceState?.metrics,
  );
  const consecutiveRestWeeks = input.beforeWeek.schedule
    ? getNextConsecutiveRestWeeks(input.beforeWeek.schedule, previousRestWeeks)
    : 0;
  const consequenceState = state.consequenceState ?? createConsequenceEngineState();
  const earnedRefreshedBuff = previousRestWeeks < 2 && consecutiveRestWeeks >= 2;
  const refreshedMessageId = `refreshed-s${state.currentSeason}w${state.currentWeek}`;
  const refreshedMessage: InboxMessage | null = earnedRefreshedBuff
    && !state.inbox.some((message) => message.id === refreshedMessageId)
    ? {
        id: refreshedMessageId,
        week: state.currentWeek,
        season: state.currentSeason,
        type: "health",
        title: "Fully Refreshed",
        body: "Two recovery weeks have restored your edge. Your next working week earns 10% more skill and attribute XP.",
        read: false,
        actionRequired: false,
      }
    : null;
  state = {
    ...state,
    consequenceState: {
      ...consequenceState,
      metrics: {
        ...consequenceState.metrics,
        [CONSECUTIVE_REST_WEEKS_METRIC]: consecutiveRestWeeks,
      },
    },
    inbox: refreshedMessage ? [...state.inbox, refreshedMessage] : state.inbox,
  };

  const snapshot = processMonthlySnapshot(state);
  if (snapshot) {
    state = {
      ...state,
      performanceHistory: [...state.performanceHistory, snapshot],
    };
  }

  if (!state.finances) return state;
  let finances = state.finances;
  let scout = state.scout;
  const messages: InboxMessage[] = [];

  const sourceSeasonLength = getSeasonLength(
    input.beforeWeek.fixtures,
    input.beforeWeek.currentSeason,
  );
  if (isFinancialPeriodClose(input.beforeWeek.currentWeek, sourceSeasonLength)) {
    finances = processMonthlyCredit(
      finances,
      input.beforeWeek.currentWeek,
      input.beforeWeek.currentSeason,
    );
  }

  const previousDistress = finances.distressLevel ?? "healthy";
  const previousTier = scout.careerTier;
  const previousClubId = scout.currentClubId;
  const distress = processDistress(
    finances,
    scout,
    state.currentWeek,
    state.currentSeason,
  );
  finances = distress.finances;
  scout = distress.scout;
  messages.push(...distress.messages);

  if (shouldGeneratePulse(state.currentWeek)) {
    const pulse = generatePerformancePulse(state, scout);
    const result = applyPulseConsequences(
      scout,
      pulse,
      state.currentWeek,
      state.currentSeason,
    );
    scout = result.scout;
    messages.push(...result.messages);
  }

  const fatigue = evaluateFatigueConsequences(scout.fatigue, consecutiveRestWeeks);
  if (fatigue.burnoutRisk) {
    const rng = createRNG(
      `${input.beforeWeek.seed}-burnout-${state.currentWeek}-${state.currentSeason}`,
    );
    const burnout = rollBurnoutIllness(scout, rng);
    if (burnout.triggered) {
      scout = burnout.updatedScout;
      messages.push({
        id: `burnout_${state.currentWeek}_${state.currentSeason}`,
        week: state.currentWeek,
        season: state.currentSeason,
        type: "health",
        title: "Burnout Illness",
        body: `The relentless pace has caught up with you. You've fallen ill and your ${burnout.affectedAttribute} has permanently decreased by 2. Take better care of yourself.`,
        read: false,
        actionRequired: false,
      });
    }
  }
  if (fatigue.forcedRest) {
    messages.push({
      id: `forced_rest_${state.currentWeek}_${state.currentSeason}`,
      week: state.currentWeek,
      season: state.currentSeason,
      type: "health",
      title: fatigue.status === "burnout_risk"
        ? "Burnout Warning — Forced Rest"
        : "Exhaustion — Forced Rest",
      body: "You are too exhausted to work effectively. You must rest next week. All scheduled activities have been cleared.",
      read: false,
      actionRequired: false,
    });
  }

  state = {
    ...state,
    finances,
    scout,
    inbox: [...state.inbox, ...messages],
  };
  if (previousDistress !== "bankruptcy" && finances.distressLevel === "bankruptcy") {
    const affectedStakeholders = (finances.employees ?? [])
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, 4)
      .map((employee) => ({ kind: "employee" as const, id: employee.id }));
    const latestFinancialTrigger = finances.transactions
      .slice()
      .reverse()
      .find((transaction) => transaction.amount < 0);
    state = applyCareerPathTransition(state, "independent");
    state = openCareerSetback(state, {
      kind: "bankruptcy",
      previousTier,
      previousClubId,
      triggerSummary: `the agency entering bankruptcy at a £${Math.abs(finances.balance).toLocaleString()} deficit${latestFinancialTrigger ? ` after ${latestFinancialTrigger.description.toLowerCase()}` : ""}`,
      affectedStakeholders,
    });
  }
  return state;
}
