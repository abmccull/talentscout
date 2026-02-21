/**
 * Narrative event template definitions.
 *
 * Each template describes one of the 8 NarrativeEventType variants:
 * its title, a context-driven description factory, a prerequisites guard
 * that checks whether the current game state makes the event plausible,
 * and optional player choices.
 *
 * Templates are pure data — no side effects, no RNG calls.
 * The narrative events module consumes them to generate concrete events.
 */

import type { GameState, NarrativeEventType } from "@/engine/core/types";

// =============================================================================
// EventContext — fields extracted from GameState for template rendering
// =============================================================================

/**
 * Contextual data extracted from GameState before a template's
 * descriptionTemplate is called.  All fields are optional so templates
 * can degrade gracefully when context is thin.
 */
export interface EventContext {
  /** Name of a related player (e.g. the player being poached). */
  playerName?: string;
  /** Name of a related club. */
  clubName?: string;
  /** Name of a related contact. */
  contactName?: string;
  /** Name of the rival scout involved. */
  rivalName?: string;
  /** The scout's current career tier (1–5). */
  careerTier?: number;
  /** The scout's current reputation (0–100). */
  reputation?: number;
}

// =============================================================================
// EventTemplate interface
// =============================================================================

export interface EventTemplate {
  /** Which NarrativeEventType this template instantiates. */
  type: NarrativeEventType;
  /** Short headline shown in the inbox list. */
  titleTemplate: string;
  /** Generates the full event description given contextual data. */
  descriptionTemplate: (context: EventContext) => string;
  /**
   * Returns true when the current game state makes this event plausible.
   * Called during weekly event generation to filter the eligible pool.
   */
  prerequisites: (state: GameState) => boolean;
  /** Optional player-facing choices. Each item has a label and an effect tag. */
  choices?: ReadonlyArray<{ label: string; effect: string }>;
}

// =============================================================================
// Helper — pick a display name for the first submitted-report player
// =============================================================================

function firstReportPlayerName(state: GameState): string {
  const reportIds = Object.keys(state.reports);
  if (reportIds.length === 0) return "the player";
  const report = state.reports[reportIds[0]];
  const player = state.players[report.playerId];
  if (!player) return "the player";
  return `${player.firstName} ${player.lastName}`;
}

function firstObservationPlayerName(state: GameState): string {
  const obsIds = Object.keys(state.observations);
  if (obsIds.length === 0) return "the player";
  const obs = state.observations[obsIds[0]];
  const player = state.players[obs.playerId];
  if (!player) return "the player";
  return `${player.firstName} ${player.lastName}`;
}

function firstAgentContactName(state: GameState): string {
  const agent = Object.values(state.contacts).find((c) => c.type === "agent");
  return agent ? agent.name : "an agent";
}

function firstHighRelationshipContactName(state: GameState): string {
  const contact = Object.values(state.contacts).find(
    (c) => c.relationship >= 50,
  );
  return contact ? contact.name : "a trusted contact";
}

// =============================================================================
// Template definitions — one per NarrativeEventType
// =============================================================================

const rivalPoachTemplate: EventTemplate = {
  type: "rivalPoach",
  titleTemplate: "Rival Poaching Alert",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "one of your targets";
    const rival = ctx.rivalName ?? "a rival scout";
    return (
      `Intelligence suggests ${rival} has been spotted watching ${player} ` +
      `at least twice this week. Your report on this player is still pending ` +
      `club review — if the rival gets their recommendation in first, your ` +
      `work could be overlooked entirely. Do you rush your report to get ahead, ` +
      `or trust the process and let events unfold?`
    );
  },
  prerequisites: (state) => Object.keys(state.reports).length > 0,
  choices: [
    { label: "Rush report", effect: "rushReport" },
    { label: "Let it go", effect: "ignore" },
  ],
};

const managerFiredTemplate: EventTemplate = {
  type: "managerFired",
  titleTemplate: "Manager Sacked",
  descriptionTemplate: (ctx) => {
    const club = ctx.clubName ?? "your club";
    return (
      `Breaking news: the manager at ${club} has been relieved of their duties ` +
      `following a run of poor results. The board is searching for a replacement ` +
      `and the scouting department faces an uncertain few weeks. Incoming managers ` +
      `often conduct a full review of existing scouting priorities — your current ` +
      `assignments may be reconsidered. Stay alert for further developments.`
    );
  },
  prerequisites: (state) =>
    state.scout.currentClubId !== undefined &&
    state.scout.careerTier >= 2,
  choices: undefined,
};

const exclusiveTipTemplate: EventTemplate = {
  type: "exclusiveTip",
  titleTemplate: "Exclusive Intel Available",
  descriptionTemplate: (ctx) => {
    const contact = ctx.contactName ?? "a trusted contact";
    return (
      `${contact} has reached out with what they describe as an exclusive tip on ` +
      `a hidden gem currently flying under the radar in the lower divisions. ` +
      `They insist the window to act is narrow — other scouts will pick up the ` +
      `trail within weeks. Investigating will cost you time this week, but the ` +
      `discovery could be career-defining. Your call.`
    );
  },
  prerequisites: (state) =>
    Object.values(state.contacts).some((c) => c.relationship >= 50),
  choices: [
    { label: "Investigate", effect: "investigate" },
    { label: "Ignore", effect: "ignore" },
  ],
};

const debutHatTrickTemplate: EventTemplate = {
  type: "debutHatTrick",
  titleTemplate: "Your Target Scores Debut Hat-Trick",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "a player you reported on";
    return (
      `${player} marked their senior debut in spectacular fashion, netting a ` +
      `hat-trick in front of a packed crowd. Your report on this player is now ` +
      `being discussed in the boardroom with fresh urgency. Club executives who ` +
      `initially filed the report away are re-reading every line. Your eye for ` +
      `talent is under the spotlight — and the moment is yours to own.`
    );
  },
  prerequisites: (state) => Object.keys(state.reports).length > 0,
  choices: undefined,
};

const targetInjuredTemplate: EventTemplate = {
  type: "targetInjured",
  titleTemplate: "Scouting Target Injured",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "one of your current targets";
    return (
      `Unfortunate news: ${player} has picked up an injury during training and ` +
      `is expected to be sidelined for several weeks. Your active observation ` +
      `programme will need to be paused. Depending on the severity, this could ` +
      `affect the player's form and market value. It may also be an opportunity ` +
      `to assess their recovery professionalism and mental resilience.`
    );
  },
  prerequisites: (state) => Object.keys(state.observations).length > 0,
  choices: undefined,
};

const reportCitedTemplate: EventTemplate = {
  type: "reportCitedInBoardMeeting",
  titleTemplate: "Your Report Cited in Board Meeting",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "one of your targets";
    const club = ctx.clubName ?? "the club";
    return (
      `Word has filtered down that your scouting report on ${player} was ` +
      `referenced directly by the chairman during yesterday's board meeting at ` +
      `${club}. Directors praised the depth of analysis and the conviction of ` +
      `your recommendation. This kind of visibility is rare — your standing ` +
      `within the organisation has strengthened considerably as a result.`
    );
  },
  prerequisites: (state) =>
    state.scout.careerTier >= 3 &&
    Object.keys(state.reports).length > 0,
  choices: undefined,
};

const rivalRecruitmentTemplate: EventTemplate = {
  type: "rivalRecruitment",
  titleTemplate: "Rival Club Makes Approach",
  descriptionTemplate: (ctx) => {
    const club = ctx.clubName ?? "a rival club";
    const reputation = ctx.reputation ?? 0;
    return (
      `${club} has made a discreet enquiry about your availability. Your ` +
      `reputation of ${reputation} has clearly attracted attention beyond your ` +
      `current employer. The approach is flattering, but accepting could burn ` +
      `bridges and complicate your standing here. A polite decline might also ` +
      `strengthen your hand in any upcoming contract negotiations. How you ` +
      `handle this could define your next career chapter.`
    );
  },
  prerequisites: (state) => state.scout.reputation >= 40,
  choices: [
    { label: "Engage with the approach", effect: "engage" },
    { label: "Decline politely", effect: "decline" },
  ],
};

const agentDeceptionTemplate: EventTemplate = {
  type: "agentDeception",
  titleTemplate: "Agent Gives Misleading Information",
  descriptionTemplate: (ctx) => {
    const agent = ctx.contactName ?? "an agent";
    return (
      `${agent} provided you with glowing information about a client's form, ` +
      `fitness, and contract situation — but multiple details have since proven ` +
      `inaccurate or exaggerated. It appears the agent was managing perceptions ` +
      `rather than sharing facts. This kind of deception is common in the ` +
      `business, but it underlines the importance of cross-referencing tips ` +
      `with independent observations before committing to a recommendation.`
    );
  },
  prerequisites: (state) =>
    Object.values(state.contacts).some((c) => c.type === "agent"),
  choices: undefined,
};

// =============================================================================
// Exported registry — ordered array used by narrativeEvents.ts
// =============================================================================

export const EVENT_TEMPLATES: ReadonlyArray<EventTemplate> = [
  rivalPoachTemplate,
  managerFiredTemplate,
  exclusiveTipTemplate,
  debutHatTrickTemplate,
  targetInjuredTemplate,
  reportCitedTemplate,
  rivalRecruitmentTemplate,
  agentDeceptionTemplate,
];

// =============================================================================
// Context extraction helpers — exported for use in narrativeEvents.ts
// =============================================================================

/**
 * Build an EventContext from a GameState for a given event type.
 * Extracts the most relevant names and figures the template can reference.
 */
export function buildEventContext(
  type: NarrativeEventType,
  state: GameState,
): EventContext {
  const scout = state.scout;
  const rivalNames = Object.values(state.rivalScouts).map((r) => r.name);
  const rivalName = rivalNames.length > 0 ? rivalNames[0] : undefined;

  const employerClub = scout.currentClubId
    ? state.clubs[scout.currentClubId]
    : undefined;

  switch (type) {
    case "rivalPoach":
      return {
        playerName: firstReportPlayerName(state),
        rivalName,
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "managerFired":
      return {
        clubName: employerClub?.name,
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "exclusiveTip":
      return {
        contactName: firstHighRelationshipContactName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "debutHatTrick":
      return {
        playerName: firstReportPlayerName(state),
        clubName: employerClub?.name,
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "targetInjured":
      return {
        playerName: firstObservationPlayerName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "reportCitedInBoardMeeting":
      return {
        playerName: firstReportPlayerName(state),
        clubName: employerClub?.name,
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "rivalRecruitment": {
      // Pick a rival club (not the scout's current employer)
      const rivalClub = Object.values(state.clubs).find(
        (c) => c.id !== scout.currentClubId,
      );
      return {
        clubName: rivalClub?.name,
        reputation: scout.reputation,
        careerTier: scout.careerTier,
      };
    }

    case "agentDeception":
      return {
        contactName: firstAgentContactName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };
  }
}

/**
 * Returns the IDs of entities most directly related to an event type.
 * Used to populate NarrativeEvent.relatedIds.
 */
export function extractRelatedIds(
  type: NarrativeEventType,
  state: GameState,
): string[] {
  const scout = state.scout;

  switch (type) {
    case "rivalPoach":
    case "debutHatTrick": {
      const reportIds = Object.keys(state.reports);
      if (reportIds.length === 0) return [];
      const report = state.reports[reportIds[0]];
      return [report.playerId];
    }

    case "targetInjured": {
      const obsIds = Object.keys(state.observations);
      if (obsIds.length === 0) return [];
      const obs = state.observations[obsIds[0]];
      return [obs.playerId];
    }

    case "managerFired":
      return scout.currentClubId ? [scout.currentClubId] : [];

    case "exclusiveTip": {
      const contact = Object.values(state.contacts).find(
        (c) => c.relationship >= 50,
      );
      return contact ? [contact.id] : [];
    }

    case "reportCitedInBoardMeeting": {
      const reportIds = Object.keys(state.reports);
      if (reportIds.length === 0) return [];
      const report = state.reports[reportIds[0]];
      const ids: string[] = [report.playerId];
      if (scout.currentClubId) ids.push(scout.currentClubId);
      return ids;
    }

    case "rivalRecruitment": {
      const rivalClub = Object.values(state.clubs).find(
        (c) => c.id !== scout.currentClubId,
      );
      return rivalClub ? [rivalClub.id] : [];
    }

    case "agentDeception": {
      const agent = Object.values(state.contacts).find(
        (c) => c.type === "agent",
      );
      return agent ? [agent.id] : [];
    }
  }
}
