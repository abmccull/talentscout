import type { GameState, InboxMessage } from "@/engine/core/types";
import type { TickResult } from "@/engine/core/gameLoop";
import { createRNG } from "@/engine/rng";
import { processMonthlySnapshot } from "@/engine/career";
import { applyCareerPathTransition } from "@/engine/career/transitions";
import { openCareerSetback } from "@/engine/career/recovery";
import {
  applyPulseConsequences,
  generatePerformancePulse,
  shouldGeneratePulse,
} from "@/engine/career/performancePulse";
import { evaluateFatigueConsequences, rollBurnoutIllness } from "@/engine/core/calendar";
import { processMonthlyCredit } from "@/engine/finance/creditScore";
import { processDistress } from "@/engine/finance/distress";
import { checkRetainerDeliverables } from "@/engine/finance/clientRelationships";

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

  if (state.currentWeek % 4 === 0) {
    finances = processMonthlyCredit(finances);
    const deliverables = checkRetainerDeliverables(
      finances,
      state.currentWeek,
      state.currentSeason,
    );
    finances = deliverables.finances;
    for (const [index, message] of deliverables.messages.entries()) {
      messages.push({
        id: `retainer_fail_s${state.currentSeason}w${state.currentWeek}_${index}`,
        week: state.currentWeek,
        season: state.currentSeason,
        type: "financial",
        title: message.title,
        body: message.body,
        read: false,
        actionRequired: false,
      });
      if (message.title === "Contract Terminated") {
        scout = { ...scout, reputation: Math.max(0, scout.reputation - 5) };
      }
    }
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

  const fatigue = evaluateFatigueConsequences(scout.fatigue, 0);
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
    state = applyCareerPathTransition(state, "independent");
    state = openCareerSetback(state, {
      kind: "bankruptcy",
      previousTier,
      previousClubId,
    });
  }
  return state;
}
