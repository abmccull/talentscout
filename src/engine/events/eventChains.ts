/**
 * Event Chain System (F2) -- Multi-week narrative event chains.
 *
 * Chains are sequences of NarrativeEvents that span multiple weeks,
 * where player choices at earlier steps influence later outcomes.
 * Each chain follows a template that defines its steps, timing,
 * and branching logic.
 *
 * Architecture:
 *  - ChainTemplate defines the blueprint (steps, timing, generation logic).
 *  - EventChain (from types.ts) is the persisted, serialisable state.
 *  - Pure functions: no mutation, no side-effects, deterministic with RNG.
 *  - Chain events bypass the normal 12% weekly roll and fire deterministically.
 */

import type {
  GameState,
  NarrativeEvent,
  NarrativeEventType,
  EventChain,
} from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import { resolveCareerPathText } from "@/engine/utils/textResolution";
import { getSeasonLength } from "@/engine/core/gameLoop";
import { selectLatestReportsByCase } from "@/engine/reports/reportAccountability";
import type { RumorNarrativeTruthContract } from "./narrativeTruth";

// =============================================================================
// Constants
// =============================================================================

/** Probability that a random narrative event spawns a new chain (10%). */
export const CHAIN_TRIGGER_CHANCE = 0.10;

/** Maximum number of active (unresolved) chains at any time. */
const MAX_ACTIVE_CHAINS = 3;

// =============================================================================
// Chain Step Definition
// =============================================================================

interface ChainStep {
  /** Weeks after previous step before this step fires. */
  weekDelay: number;
  /** Escalation level for this step (0=normal, 1=warning, 2=critical). */
  escalationLevel: number;
  /**
   * Generate the NarrativeEvent for this step.
   * Returns null to silently skip (soft abort).
   */
  generateEvent: (
    chain: EventChain,
    state: GameState,
    rng: RNG,
  ) => NarrativeEvent | null;
  /** Optional guard: if false, the chain is resolved/aborted. */
  prerequisites?: (state: GameState, chain: EventChain) => boolean;
}

interface ChainTemplate {
  key: string;
  name: string;
  steps: ChainStep[];
  /** Returns true when game conditions allow this chain to start. */
  canTrigger: (state: GameState) => boolean;
  /** Build initial context when the chain starts. */
  initContext: (state: GameState, rng: RNG) => Record<string, string>;
}

// =============================================================================
// Helpers
// =============================================================================

function generateChainId(rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 10; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `chain_${id}`;
}

function generateChainEventId(rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `evt_${id}`;
}

/** Compute an absolute narrative week using the persisted fixture calendar. */
function absoluteWeek(state: GameState, season: number, week: number): number {
  return (season - 1) * getSeasonLength(state.fixtures) + week;
}

/** Get a random player name from state (for context). */
function pickPlayerName(state: GameState, rng: RNG): { id: string; name: string } {
  const players = Object.values(state.players);
  if (players.length === 0) return { id: "", name: "a player" };
  const p = players[rng.nextInt(0, players.length - 1)];
  return { id: p.id, name: `${p.firstName} ${p.lastName}` };
}

/** Get a random young player name from state. */
function pickYoungPlayer(state: GameState, rng: RNG): { id: string; name: string } {
  const young = Object.values(state.players).filter((p) => p.age <= 22);
  if (young.length === 0) return pickPlayerName(state, rng);
  const p = young[rng.nextInt(0, young.length - 1)];
  return { id: p.id, name: `${p.firstName} ${p.lastName}` };
}

/** Get a random club name from state. */
function pickClubName(state: GameState, rng: RNG): { id: string; name: string } {
  const clubs = Object.values(state.clubs);
  if (clubs.length === 0) return { id: "", name: "a rival club" };
  const c = clubs[rng.nextInt(0, clubs.length - 1)];
  return { id: c.id, name: c.name };
}

/** Get a random contact name from state. */
function pickContactName(state: GameState, rng: RNG): { id: string; name: string } {
  const contacts = Object.values(state.contacts);
  if (contacts.length === 0) return { id: "", name: "a contact" };
  const c = contacts[rng.nextInt(0, contacts.length - 1)];
  return { id: c.id, name: c.name };
}

/** Build a NarrativeEvent from chain context. */
function buildChainEvent(
  rng: RNG,
  chain: EventChain,
  state: GameState,
  type: NarrativeEventType,
  title: string,
  description: string,
  escalationLevel: number,
  choices?: { label: string; effect: string }[],
): NarrativeEvent {
  const step = chain.currentStep + 1; // 1-based for display
  return {
    id: generateChainEventId(rng),
    type,
    week: state.currentWeek,
    season: state.currentSeason,
    title,
    description,
    relatedIds: chain.context.playerId ? [chain.context.playerId] :
                chain.context.clubId ? [chain.context.clubId] :
                chain.context.contactId ? [chain.context.contactId] : [],
    acknowledged: false,
    choices,
    selectedChoice: undefined,
    chainId: chain.id,
    chainStep: step,
    parentEventId: chain.eventIds.length > 0 ? chain.eventIds[chain.eventIds.length - 1] : undefined,
    followUpWeek: undefined, // set by caller after creation
    escalationLevel,
    resolved: false,
  };
}

// =============================================================================
// CHAIN TEMPLATES (10 total)
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Dressing Room Conflict (3 steps)
// ---------------------------------------------------------------------------
const dressingRoomConflict: ChainTemplate = {
  key: "dressingRoomConflict",
  name: "Dressing Room Conflict",
  canTrigger: (state) =>
    Object.keys(state.players).length >= 5 &&
    state.scout.careerTier >= 2,
  initContext: (state, rng) => {
    const p1 = pickPlayerName(state, rng);
    const p2 = pickPlayerName(state, rng);
    const club = pickClubName(state, rng);
    return {
      player1Id: p1.id,
      player1Name: p1.name,
      player2Id: p2.id,
      player2Name: p2.name,
      clubId: club.id,
      clubName: club.name,
    };
  },
  steps: [
    {
      weekDelay: 0,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) =>
        buildChainEvent(rng, chain, state, "playerControversy",
          "Dressing Room Tensions",
          `Reports are emerging from ${chain.context.clubName} about a growing rift between ` +
          `${chain.context.player1Name} and ${chain.context.player2Name}. Sources inside ` +
          `the club describe a training ground confrontation that had to be broken up by ` +
          `coaching staff. The tension is affecting team morale and could impact the ` +
          `transfer value of both players. Worth monitoring closely.`,
          0),
    },
    {
      weekDelay: 3,
      escalationLevel: 1,
      generateEvent: (chain, state, rng) => {
        const previousChoice = chain.choiceHistory[0];
        const escalated = previousChoice === undefined || previousChoice === 1;
        return buildChainEvent(rng, chain, state, "playerControversy",
          escalated ? "Conflict Escalates" : "Conflict Being Managed",
          escalated
            ? `The situation at ${chain.context.clubName} has deteriorated. ` +
              `${chain.context.player1Name} gave a thinly-veiled interview criticising ` +
              `a teammate, and ${chain.context.player2Name} responded on social media. ` +
              `The manager has called an emergency meeting. One of them will likely ` +
              `be made available for transfer. Your assessment of which player retains ` +
              `value could be critical.`
            : `The mediation at ${chain.context.clubName} appears to be working. ` +
              `${chain.context.player1Name} and ${chain.context.player2Name} were seen ` +
              `training together this week, though sources say the relationship remains ` +
              `fragile. The club may still look to move one of them in the next window.`,
          escalated ? 1 : 0,
          [
            { label: "Recommend signing the outcast", effect: "conflictSign" },
            { label: resolveCareerPathText("Warn your club to avoid", state.scout.careerPath), effect: "conflictAvoid" },
            { label: "Monitor for another week", effect: "conflictWait" },
          ]);
      },
    },
    {
      weekDelay: 3,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) => {
        const choice = chain.choiceHistory[1];
        let description: string;
        let title: string;
        if (choice === 0) {
          // Recommended signing
          const success = rng.chance(0.6);
          title = success ? "Shrewd Transfer Call" : "Transfer Gamble Backfires";
          description = success
            ? `Your recommendation to sign the outcast from ${chain.context.clubName} ` +
              `has paid off. The player, freed from the toxic dynamic, has shown ` +
              `renewed energy and professionalism. Your judgment on character under ` +
              `pressure has been validated.`
            : `The player you recommended from ${chain.context.clubName} brought the ` +
              `same attitude problems to their new environment. The dressing room ` +
              `conflict wasn't a one-off — it's a pattern. A lesson in the limits ` +
              `of scouting from a distance.`;
        } else if (choice === 1) {
          title = "Sound Warning Heeded";
          description = `Your warning about the ${chain.context.clubName} situation was ` +
            `well-received. The club avoided what could have been a costly character ` +
            `misjudgment. Both players have since left the club, and the reviews on ` +
            `their conduct at new teams are mixed. Caution proved the right call.`;
        } else {
          title = "Dressing Room Saga Concludes";
          description = `The conflict at ${chain.context.clubName} has finally been ` +
            `resolved. ${chain.context.player1Name} was sold in a cut-price deal, while ` +
            `${chain.context.player2Name} signed an extension. The chapter is closed, ` +
            `but the intelligence gathered during the saga will inform future assessments.`;
        }
        return buildChainEvent(rng, chain, state, "playerControversy", title, description, 0);
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 2. Transfer Saga (4 steps)
// ---------------------------------------------------------------------------
const transferSaga: ChainTemplate = {
  key: "transferSaga",
  name: "Transfer Saga",
  canTrigger: (state) =>
    Object.keys(state.players).length >= 3 &&
    state.scout.reputation >= 20,
  initContext: (state, rng) => {
    const player = pickPlayerName(state, rng);
    const club = pickClubName(state, rng);
    return {
      playerId: player.id,
      playerName: player.name,
      clubId: club.id,
      clubName: club.name,
      bidAmount: String(rng.nextInt(5, 40)),
    };
  },
  steps: [
    {
      weekDelay: 0,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) =>
        buildRumorChainEvent(rng, chain, state, "exclusiveTip",
          "Transfer Whispers",
          `Multiple sources claim that ${chain.context.clubName} are quietly ` +
          `exploring a move for ${chain.context.playerName}. No formal approach ` +
          `yet, but the player's agent has been spotted at meetings with the ` +
          `club's sporting director. If this progresses, your early intelligence ` +
          `could be invaluable.`,
          0),
    },
    {
      weekDelay: 2,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) =>
        buildRumorChainEvent(rng, chain, state, "exclusiveTip",
          "Formal Interest Registered",
          `An intermediary claims ${chain.context.clubName} have asked about ` +
          `${chain.context.playerName}. The asking price is rumoured to be ` +
          `around ${chain.context.bidAmount}M. No enquiry or valuation exists in ` +
          `the authoritative transfer state yet — the question is whether the talk progresses ` +
          `and what your role in it should be.`,
          0,
          [
            { label: "Submit a detailed assessment", effect: "transferAssess" },
            { label: resolveCareerPathText("Flag concerns to your club", state.scout.careerPath), effect: "transferWarn" },
          ]),
    },
    {
      weekDelay: 2,
      escalationLevel: 1,
      generateEvent: (chain, state, rng) => {
        const chose = chain.choiceHistory[1];
        return buildRumorChainEvent(rng, chain, state, "rivalPoach",
          "Bid Talk Intensifies",
          chose === 0
            ? `Your assessment of ${chain.context.playerName} is now central to ` +
              `the discussion. A source believes ${chain.context.clubName} may prepare ` +
              `an offer near ${chain.context.bidAmount}M and says your assessment is ` +
              `being considered. No bid has been recorded yet.`
            : `Despite your concerns, sources believe ${chain.context.clubName} may ` +
              `prepare an offer near ${chain.context.bidAmount}M for ${chain.context.playerName}. ` +
              `Your warning is on record, but no bid has been recorded yet.`,
          1,
          [
            { label: "Advocate for the deal", effect: "transferAdvocate" },
            { label: "Recommend rejection", effect: "transferReject" },
          ]);
      },
    },
    {
      weekDelay: 3,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) => {
        const lastChoice = chain.choiceHistory[2];
        const talksPositive = rng.chance(lastChoice === 0 ? 0.7 : 0.3);
        let title: string;
        let description: string;
        if (talksPositive) {
          title = "Talks Reportedly Progressing";
          description = `Sources expect discussions about ${chain.context.playerName} ` +
            `to continue, with ${chain.context.clubName} still interested near the ` +
            `reported ${chain.context.bidAmount}M figure. Only an authoritative movement ` +
            `record can confirm whether a signing ultimately happens.`;
        } else {
          title = "Talks Reportedly Cooling";
          description = `Sources now doubt that discussions about ` +
            `${chain.context.playerName} will progress. No cause has been confirmed and ` +
            `no authoritative transfer outcome has been recorded.`;
        }
        return buildRumorChainEvent(rng, chain, state, "transferRuleChange", title, description, 0);
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 3. Wonderkid Pressure (3 steps)
// ---------------------------------------------------------------------------
const wonderkidPressure: ChainTemplate = {
  key: "wonderkidPressure",
  name: "Wonderkid Under Pressure",
  canTrigger: (state) => {
    const young = Object.values(state.players).filter((p) => p.age <= 21);
    return young.length >= 1 && state.scout.reputation >= 15;
  },
  initContext: (state, rng) => {
    const player = pickYoungPlayer(state, rng);
    return { playerId: player.id, playerName: player.name };
  },
  steps: [
    {
      weekDelay: 0,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) =>
        buildChainEvent(rng, chain, state, "wonderkidPressure",
          "Media Spotlight on Young Talent",
          `${chain.context.playerName} has attracted significant media attention after ` +
          `a string of impressive performances. National newspapers are running ` +
          `features, agents are circling, and the pressure on a young player is ` +
          `mounting visibly. How they handle this will reveal their character.`,
          0),
    },
    {
      weekDelay: 3,
      escalationLevel: 1,
      generateEvent: (chain, state, rng) =>
        buildChainEvent(rng, chain, state, "wonderkidPressure",
          "Performance Pressure Mounts",
          `The weight of expectation is showing. ${chain.context.playerName}'s ` +
          `recent performances have dipped noticeably — hesitation on the ball, ` +
          `risk-averse decision making, visible frustration. The media narrative ` +
          `has shifted from "rising star" to "can they handle it?" Your assessment ` +
          `of their mental resilience could shape their immediate future.`,
          1,
          [
            { label: "Recommend patience and protection", effect: "wonderkidProtect" },
            { label: "Suggest a loan move for development", effect: "wonderkidLoan" },
            { label: "Flag as a sell-high opportunity", effect: "wonderkidSell" },
          ]),
    },
    {
      weekDelay: 4,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) => {
        const choice = chain.choiceHistory[1];
        const breakthrough = rng.chance(choice === 0 ? 0.65 : choice === 1 ? 0.5 : 0.3);
        let title: string;
        let description: string;
        if (breakthrough) {
          title = "Wonderkid Breaks Through";
          description = `${chain.context.playerName} has responded magnificently. ` +
            `A match-winning performance in a high-pressure fixture has silenced ` +
            `the doubters and confirmed the talent everyone suspected was there. ` +
            `The player has emerged stronger from the ordeal. Your role in their ` +
            `development pathway has been quietly acknowledged.`;
        } else {
          title = "Wonderkid Struggles Continue";
          description = `Unfortunately, ${chain.context.playerName} has not been ` +
            `able to handle the pressure. A series of poor performances and reports ` +
            `of training ground issues suggest the young talent needs time away ` +
            `from the spotlight. The ceiling remains high, but the timeline has shifted.`;
        }
        return buildChainEvent(rng, chain, state, "wonderkidPressure", title, description, 0);
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 4. Board Ultimatum (3 steps)
// ---------------------------------------------------------------------------
const boardUltimatum: ChainTemplate = {
  key: "boardUltimatum",
  name: "Board Ultimatum",
  canTrigger: (state) =>
    state.scout.careerTier >= 3 &&
    state.scout.currentClubId !== undefined,
  initContext: (state, rng) => {
    const clubId = state.scout.currentClubId ?? "";
    const club = state.clubs[clubId];
    return {
      clubId,
      clubName: club?.name ?? "your club",
    };
  },
  steps: [
    {
      weekDelay: 0,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) =>
        buildChainEvent(rng, chain, state, "boardroomCoup",
          "Board Review Warning",
          `The board at ${chain.context.clubName} has issued a formal notice: ` +
          `the scouting department's recent recommendations will be reviewed ` +
          `against actual player performance metrics. This is a routine audit ` +
          `on paper, but the tone of the memo suggests political intent. ` +
          `Your track record is about to be scrutinised.`,
          0),
    },
    {
      weekDelay: 3,
      escalationLevel: 1,
      generateEvent: (chain, state, rng) =>
        buildChainEvent(rng, chain, state, "boardroomCoup",
          "Board Deadline Approaching",
          `The audit results are due next week. Preliminary feedback suggests ` +
          `the board is split on the scouting department's value. You have one ` +
          `chance to present your case — backed by data and successful ` +
          `recommendations. How you frame this could determine whether the ` +
          `department gets expanded or cut.`,
          1,
          [
            { label: "Present data-driven defence", effect: "ultimatumData" },
            { label: "Rally internal allies", effect: "ultimatumAllies" },
            { label: "Accept the review gracefully", effect: "ultimatumAccept" },
          ]),
    },
    {
      weekDelay: 3,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) => {
        const choice = chain.choiceHistory[1];
        const survives = rng.chance(choice === 0 ? 0.7 : choice === 1 ? 0.6 : 0.4);
        let title: string;
        let description: string;
        if (survives) {
          title = "Board Approves Department";
          description = `The board review has concluded in your favour. ` +
            `${chain.context.clubName}'s scouting department will continue ` +
            `with renewed backing and a modest budget increase. Your handling ` +
            `of the political pressure has strengthened your standing.`;
        } else {
          title = "Scouting Budget Reduced";
          description = `The board review did not go well. ${chain.context.clubName} ` +
            `has decided to reduce the scouting department's budget by 20%. ` +
            `You'll need to do more with less. The decision stings, but ` +
            `the best scouts have always found ways to thrive under constraints.`;
        }
        return buildChainEvent(rng, chain, state, "budgetCut", title, description, 0);
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 5. Rival Poaching (3 steps)
// ---------------------------------------------------------------------------
const rivalPoaching: ChainTemplate = {
  key: "rivalPoaching",
  name: "Rival Scout Poaching",
  canTrigger: (state) =>
    Object.keys(state.rivalScouts).length >= 1 &&
    Object.keys(state.players).length >= 3,
  initContext: (state, rng) => {
    const rivals = Object.values(state.rivalScouts);
    const rival = rivals.length > 0
      ? rivals[rng.nextInt(0, rivals.length - 1)]
      : null;
    const player = pickPlayerName(state, rng);
    return {
      rivalId: rival?.id ?? "",
      rivalName: rival?.name ?? "a rival scout",
      playerId: player.id,
      playerName: player.name,
    };
  },
  steps: [
    {
      weekDelay: 0,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) =>
        buildChainEvent(rng, chain, state, "rivalPoach",
          "Rival Scout Spotted",
          `${chain.context.rivalName} has been seen at the same fixtures as you, ` +
          `focusing heavily on ${chain.context.playerName}. This isn't coincidence ` +
          `— they appear to be working from similar intelligence. If they submit ` +
          `their report first, your groundwork could be wasted.`,
          0),
    },
    {
      weekDelay: 2,
      escalationLevel: 1,
      generateEvent: (chain, state, rng) =>
        buildChainEvent(rng, chain, state, "rivalPoach",
          "Rival Makes Their Move",
          `${chain.context.rivalName} has submitted a report on ` +
          `${chain.context.playerName} to their club. The intelligence ` +
          `network confirms it was well-received. You're now in a direct ` +
          `race — do you rush your own assessment or take the time to ` +
          `produce something definitive?`,
          1,
          [
            { label: "Rush your report immediately", effect: "poachRush" },
            { label: "Take time for a thorough report", effect: "poachThorough" },
            { label: "Pivot to a different target", effect: "poachPivot" },
          ]),
    },
    {
      weekDelay: 3,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) => {
        const choice = chain.choiceHistory[1];
        let title: string;
        let description: string;
        if (choice === 0) {
          const beaten = rng.chance(0.4);
          title = beaten ? "Beaten to the Punch" : "Speed Wins the Race";
          description = beaten
            ? `Despite rushing, ${chain.context.rivalName}'s head start was too ` +
              `great. Their report reached the decision-makers first and ` +
              `${chain.context.playerName} is now on the rival's shortlist. ` +
              `Speed isn't always enough when the competition started earlier.`
            : `Your rapid response paid off. The report on ${chain.context.playerName} ` +
              `was received alongside ${chain.context.rivalName}'s, and your ` +
              `reputation tipped the balance. The club is proceeding with your ` +
              `recommendation.`;
        } else if (choice === 1) {
          const quality = rng.chance(0.65);
          title = quality ? "Thoroughness Rewarded" : "Too Slow";
          description = quality
            ? `The wait was worth it. Your detailed report on ${chain.context.playerName} ` +
              `was significantly more comprehensive than ${chain.context.rivalName}'s. ` +
              `Quality over speed — the decision-makers could see the difference immediately.`
            : `Your thoroughness cost you the window. By the time your report was ` +
              `complete, the club had already acted on ${chain.context.rivalName}'s ` +
              `recommendation. ${chain.context.playerName} moved before your ` +
              `assessment could influence the outcome.`;
        } else {
          title = "Strategic Pivot";
          description = `You redirected your attention to other targets and let ` +
            `${chain.context.rivalName} take ${chain.context.playerName}. ` +
            `A pragmatic choice — not every battle is worth fighting. Your ` +
            `time is better spent on opportunities where you have the advantage.`;
        }
        return buildChainEvent(rng, chain, state, "rivalPoach", title, description, 0);
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 6. Injury Comeback (3 steps)
// ---------------------------------------------------------------------------
const injuryComeback: ChainTemplate = {
  key: "injuryComeback",
  name: "Injury Comeback Trail",
  canTrigger: (state) =>
    Object.keys(state.players).length >= 3,
  initContext: (state, rng) => {
    const player = pickPlayerName(state, rng);
    const injuryTypes = ["ACL", "knee ligament", "ankle", "hamstring", "Achilles"];
    const injury = injuryTypes[rng.nextInt(0, injuryTypes.length - 1)];
    return {
      playerId: player.id,
      playerName: player.name,
      injuryType: injury,
    };
  },
  steps: [
    {
      weekDelay: 0,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) =>
        buildRumorChainEvent(rng, chain, state, "injurySetback",
          "Possible Injury Concern",
          `A source claims ${chain.context.playerName} is being assessed for a ` +
          `${chain.context.injuryType} problem. The medical detail and recovery ` +
          `timeline are unconfirmed; rely on the player's canonical injury record ` +
          `before changing a formal assessment.`,
          0),
    },
    {
      weekDelay: 4,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) =>
        buildRumorChainEvent(rng, chain, state, "injurySetback",
          "Unverified Rehab Update",
          `Sources close to ${chain.context.playerName} report ` +
          `mixed signals. The physical recovery is on schedule, but there are ` +
          `concerns about the player's confidence in the affected area. They've ` +
          `been avoiding certain movements in training. The next few weeks will ` +
          `reveal whether this is a temporary psychological hurdle or something ` +
          `more permanent.`,
          0,
          [
            { label: "Maintain your rating — they'll recover", effect: "injuryOptimistic" },
            { label: "Downgrade your assessment", effect: "injuryDowngrade" },
          ]),
    },
    {
      weekDelay: 4,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) => {
        const choice = chain.choiceHistory[1];
        const optimisticReport = rng.chance(0.5);
        let title: string;
        let description: string;
        if (optimisticReport) {
          title = "Sources Sound Optimistic";
          description = choice === 0
            ? `A source says ${chain.context.playerName}'s work is progressing well. ` +
              `That supports your patience, but it does not confirm a return or ` +
              `validate the original assessment.`
            : `A source says ${chain.context.playerName}'s work is progressing well. ` +
              `Your cautious assessment can be revisited when an authoritative ` +
              `injury status or match appearance supports it.`;
        } else {
          title = "Sources Report Continued Concern";
          description = choice === 0
            ? `A source says ${chain.context.playerName}'s recovery remains uncertain. ` +
              `Your optimistic position now needs verified medical or match evidence, ` +
              `not another anonymous update.`
            : `A source says ${chain.context.playerName}'s recovery remains uncertain. ` +
              `The caution may prove appropriate, but no outcome is confirmed yet.`;
        }
        return buildRumorChainEvent(rng, chain, state, "injurySetback", title, description, 0);
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 7. Contact Betrayal (2 steps)
// ---------------------------------------------------------------------------
const contactBetrayalChain: ChainTemplate = {
  key: "contactBetrayal",
  name: "Contact Double-Cross",
  canTrigger: (state) =>
    Object.keys(state.contacts).length >= 2,
  initContext: (state, rng) => {
    const contact = pickContactName(state, rng);
    return {
      contactId: contact.id,
      contactName: contact.name,
    };
  },
  steps: [
    {
      weekDelay: 0,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) =>
        buildChainEvent(rng, chain, state, "contactBetrayal",
          "Suspicious Contact Behaviour",
          `${chain.context.contactName} has been uncharacteristically evasive ` +
          `lately. Two pieces of intelligence they provided last month turned ` +
          `out to be inaccurate, and they've been seen meeting with a rival ` +
          `scout. This could be nothing — or it could be the beginning of ` +
          `a betrayal.`,
          0,
          [
            { label: "Confront them directly", effect: "betrayalConfront" },
            { label: "Feed them false intel as a test", effect: "betrayalTest" },
          ]),
    },
    {
      weekDelay: 3,
      escalationLevel: 1,
      generateEvent: (chain, state, rng) => {
        const choice = chain.choiceHistory[0];
        let title: string;
        let description: string;
        if (choice === 0) {
          // Confronted
          const loyal = rng.chance(0.4);
          title = loyal ? "False Alarm: Contact Loyal" : "Betrayal Confirmed";
          description = loyal
            ? `The confrontation cleared the air. ${chain.context.contactName} ` +
              `had a credible explanation — they'd been working a separate deal ` +
              `that required discretion. The inaccurate intelligence was genuine ` +
              `error, not deception. The relationship has survived, possibly ` +
              `even strengthened by your directness.`
            : `The confrontation revealed the truth. ${chain.context.contactName} ` +
              `admitted to sharing your intelligence with a rival in exchange for ` +
              `payment. The relationship is severed. Word of your zero-tolerance ` +
              `approach to betrayal is spreading through the network — which has ` +
              `its own value.`;
        } else {
          // Tested
          const caught = rng.chance(0.6);
          title = caught ? "Contact Caught Red-Handed" : "Test Inconclusive";
          description = caught
            ? `The test worked perfectly. The false intel you planted with ` +
              `${chain.context.contactName} surfaced in a rival scout's report ` +
              `within days. The evidence is undeniable. You've identified a ` +
              `leak in your network and can now act with certainty.`
            : `The false intel you provided to ${chain.context.contactName} ` +
              `didn't surface anywhere. Either they're clean, or they're ` +
              `sophisticated enough to recognise a test. The uncertainty ` +
              `remains, but you've learned something about their operational ` +
              `awareness either way.`;
        }
        return buildChainEvent(rng, chain, state, "contactBetrayal", title, description,
          choice === 0 ? 0 : 1);
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 8. Scouting Scandal (3 steps)
// ---------------------------------------------------------------------------
const scoutingScandal: ChainTemplate = {
  key: "scoutingScandal",
  name: "Scouting Scandal",
  canTrigger: (state) =>
    state.scout.reputation >= 25 &&
    selectLatestReportsByCase(Object.values(state.reports)).length >= 3,
  initContext: (state, rng) => {
    const names = ["The Athletic", "The Guardian", "Sky Sports", "BBC Sport", "L'Equipe"];
    const outlet = names[rng.nextInt(0, names.length - 1)];
    return { outlet };
  },
  steps: [
    {
      weekDelay: 0,
      escalationLevel: 1,
      generateEvent: (chain, state, rng) =>
        buildChainEvent(rng, chain, state, "youthAcademyScandal",
          "Scandal Accusation",
          `${chain.context.outlet} is preparing to run a story alleging ` +
          `irregularities in scouting practices at your level. Your name ` +
          `hasn't been mentioned directly, but the investigation covers ` +
          `methods and networks that overlap with your own work. This could ` +
          `be a career-defining moment.`,
          1,
          [
            { label: "Cooperate fully with the investigation", effect: "scandalCooperate" },
            { label: "Seek legal counsel immediately", effect: "scandalLegal" },
          ]),
    },
    {
      weekDelay: 3,
      escalationLevel: 2,
      generateEvent: (chain, state, rng) => {
        const choice = chain.choiceHistory[0];
        return buildChainEvent(rng, chain, state, "youthAcademyScandal",
          "Investigation Deepens",
          choice === 0
            ? `Your cooperation has been noted. ${chain.context.outlet}'s ` +
              `journalists have acknowledged your transparency. However, the ` +
              `investigation has uncovered practices by others in your network ` +
              `that may reflect on you by association. The story runs next week.`
            : `Your legal counsel has been effective in limiting exposure, but ` +
              `${chain.context.outlet} has continued investigating. The story ` +
              `is going ahead regardless. The legal posture may have protected ` +
              `you — or it may have made you look like you have something to hide.`,
          2);
      },
    },
    {
      weekDelay: 2,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) => {
        const choice = chain.choiceHistory[0];
        const vindicated = rng.chance(choice === 0 ? 0.75 : 0.5);
        let title: string;
        let description: string;
        if (vindicated) {
          title = "Vindicated: Name Cleared";
          description = `The story ran and you emerged clean. ${chain.context.outlet}'s ` +
            `investigation focused on others, and your cooperation (or distance) ` +
            `kept your reputation intact. The ordeal is over, and if anything, ` +
            `your standing has improved — survival in a scandal has its own currency.`;
        } else {
          title = "Reputation Damaged";
          description = `The ${chain.context.outlet} story mentioned your name in ` +
            `an unflattering context. While no wrongdoing was established, the ` +
            `association has damaged your reputation. Rebuilding trust will ` +
            `take time and demonstrable integrity in your future work.`;
        }
        return buildChainEvent(rng, chain, state, "youthAcademyScandal", title, description, 0);
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 9. Manager Fallout (3 steps)
// ---------------------------------------------------------------------------
const managerFallout: ChainTemplate = {
  key: "managerFallout",
  name: "Manager Disagreement",
  canTrigger: (state) =>
    state.scout.currentClubId !== undefined &&
    Object.keys(state.managerProfiles).length >= 1,
  initContext: (state, rng) => {
    const clubId = state.scout.currentClubId ?? "";
    const club = state.clubs[clubId];
    const managerNames = ["Thomas", "Antonio", "Jurgen", "Pep", "Erik", "Unai"];
    const managerSurnames = ["Walker", "Rossi", "Fischer", "Garcia", "Lindqvist", "Santos"];
    const managerName = managerNames[rng.nextInt(0, managerNames.length - 1)] +
      " " + managerSurnames[rng.nextInt(0, managerSurnames.length - 1)];
    return {
      clubId,
      clubName: club?.name ?? "your club",
      managerName,
    };
  },
  steps: [
    {
      weekDelay: 0,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) =>
        buildChainEvent(rng, chain, state, "managerSacked",
          "Disagreement With Manager",
          `${chain.context.managerName} at ${chain.context.clubName} has publicly ` +
          `dismissed your last two player recommendations. In a staff meeting, ` +
          `they questioned whether the scouting department "understands what ` +
          `the first team actually needs." The criticism stung — and it was ` +
          `delivered in front of colleagues.`,
          0),
    },
    {
      weekDelay: 3,
      escalationLevel: 1,
      generateEvent: (chain, state, rng) =>
        buildChainEvent(rng, chain, state, "managerSacked",
          "Tension Escalates",
          `The tension between you and ${chain.context.managerName} has become ` +
          `visible to the entire department. Two of your reports were returned ` +
          `unread. Meanwhile, the manager has brought in their own scout from ` +
          `a previous club. The political implications are clear.`,
          1,
          [
            { label: "Request a private meeting", effect: "falloutMeet" },
            { label: "Go directly to the sporting director", effect: "falloutEscalate" },
            { label: "Prove your worth through results", effect: "falloutResults" },
          ]),
    },
    {
      weekDelay: 4,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) => {
        const choice = chain.choiceHistory[1];
        let title: string;
        let description: string;
        if (choice === 0) {
          const reconciled = rng.chance(0.6);
          title = reconciled ? "Reconciliation" : "Meeting Makes It Worse";
          description = reconciled
            ? `The private meeting cleared the air. ${chain.context.managerName} ` +
              `acknowledged they'd been under pressure and the criticism of your ` +
              `work was unfair. A working understanding has been restored.`
            : `The meeting escalated into an argument. ${chain.context.managerName} ` +
              `doubled down on their criticism. The relationship may be beyond repair ` +
              `while this manager remains at the club.`;
        } else if (choice === 1) {
          const backed = rng.chance(0.5);
          title = backed ? "Director Backs You" : "Director Sides With Manager";
          description = backed
            ? `The sporting director listened to both sides and came down firmly ` +
              `in your corner. ${chain.context.managerName} has been told to ` +
              `respect the scouting process. A political victory — though the ` +
              `personal relationship may never fully recover.`
            : `The sporting director sided with ${chain.context.managerName}. ` +
              `Escalating the dispute proved to be a miscalculation. Your ` +
              `position at the club has weakened.`;
        } else {
          const proved = rng.chance(0.55);
          title = proved ? "Results Speak Louder" : "Proving Ground Insufficient";
          description = proved
            ? `Your latest recommendation was a demonstrable success. Even ` +
              `${chain.context.managerName} had to acknowledge the quality of ` +
              `the find. Actions over words — the most effective form of argument.`
            : `Despite your best efforts, the recent recommendations haven't ` +
              `produced the standout result you needed. ${chain.context.managerName}'s ` +
              `position has been reinforced. You'll need to find another way to ` +
              `rebuild your influence at the club.`;
        }
        return buildChainEvent(rng, chain, state, "managerSacked", title, description, 0);
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 10. Youth Breakthrough (3 steps)
// ---------------------------------------------------------------------------
const youthBreakthrough: ChainTemplate = {
  key: "youthBreakthrough",
  name: "Youth Breakthrough",
  canTrigger: (state) => {
    const young = Object.values(state.players).filter((p) => p.age <= 20);
    return young.length >= 1;
  },
  initContext: (state, rng) => {
    const young = Object.values(state.players).filter((p) => p.age <= 20);
    const player = young.length > 0
      ? young[rng.nextInt(0, young.length - 1)]
      : Object.values(state.players)[0];
    const club = pickClubName(state, rng);
    return {
      playerId: player?.id ?? "",
      playerName: player ? `${player.firstName} ${player.lastName}` : "a youth prospect",
      clubId: club.id,
      clubName: club.name,
    };
  },
  steps: [
    {
      weekDelay: 0,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) =>
        buildRumorChainEvent(rng, chain, state, "debutBrilliance",
          "Youth Player Drawing Attention",
          `A youth-football source says ${chain.context.playerName} has been ` +
          `drawing attention around ${chain.context.clubName}. No match-rating ` +
          `record has been cited, so treat the account as a lead to investigate ` +
          `rather than performance evidence.`,
          0),
    },
    {
      weekDelay: 3,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) =>
        buildRumorChainEvent(rng, chain, state, "debutBrilliance",
          "Possible First-Team Opportunity",
          `A club source believes ${chain.context.playerName} may be close to ` +
          `senior involvement at ${chain.context.clubName}. No debut milestone ` +
          `or recruitment enquiry is recorded yet. Your early awareness gives ` +
          `you time to seek direct evidence.`,
          0,
          [
            { label: "File a comprehensive report now", effect: "youthReportNow" },
            { label: "Wait for more first-team data", effect: "youthWait" },
          ]),
    },
    {
      weekDelay: 4,
      escalationLevel: 0,
      generateEvent: (chain, state, rng) => {
        const choice = chain.choiceHistory[1];
        const positiveChatter = rng.chance(0.5);
        let title: string;
        let description: string;
        if (positiveChatter) {
          title = "Positive Chatter Continues";
          description = choice === 0
            ? `Sources remain enthusiastic about ${chain.context.playerName}. ` +
              `Your early report has gained attention, but no first-team place or ` +
              `star trajectory is established by this update.`
            : `Sources remain enthusiastic about ${chain.context.playerName}. ` +
              `Waiting preserved your evidence standard; the next direct observation ` +
              `or recorded senior appearance should decide what you write.`;
        } else {
          title = "Early Chatter Cools";
          description = choice === 0
            ? `Sources are now less certain about ${chain.context.playerName}. ` +
              `That does not prove the report wrong, but it exposes how little ` +
              `verified evidence supported the original rush.`
            : `Sources are now less certain about ${chain.context.playerName}. ` +
              `Your caution avoided turning unverified enthusiasm into a formal claim.`;
        }
        return buildRumorChainEvent(rng, chain, state, "debutBrilliance", title, description, 0);
      },
    },
  ],
};

// =============================================================================
// TEMPLATE REGISTRY
// =============================================================================

const CHAIN_TEMPLATES: readonly ChainTemplate[] = [
  dressingRoomConflict,
  transferSaga,
  wonderkidPressure,
  boardUltimatum,
  rivalPoaching,
  injuryComeback,
  contactBetrayalChain,
  scoutingScandal,
  managerFallout,
  youthBreakthrough,
];

function findChainTemplate(key: string): ChainTemplate | undefined {
  return CHAIN_TEMPLATES.find((t) => t.key === key);
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Result of starting a new chain.
 */
export interface ChainStartResult {
  chain: EventChain;
  event: NarrativeEvent;
}

/**
 * Start a new event chain from a template.
 *
 * @param rng         - Shared PRNG instance.
 * @param state       - Current game state (read-only).
 * @param templateKey - Which chain template to instantiate.
 * @returns The new EventChain and its first NarrativeEvent, or null if
 *          the template doesn't exist or prerequisites aren't met.
 */
export function startChain(
  rng: RNG,
  state: GameState,
  templateKey: string,
): ChainStartResult | null {
  const template = findChainTemplate(templateKey);
  if (!template) return null;
  if (!template.canTrigger(state)) return null;

  const context = template.initContext(state, rng);
  const currentAbs = absoluteWeek(state, state.currentSeason, state.currentWeek);

  const chain: EventChain = {
    id: generateChainId(rng),
    templateKey: template.key,
    startWeek: currentAbs,
    currentStep: 0,
    maxSteps: template.steps.length,
    resolved: false,
    choiceHistory: [],
    context,
    nextStepWeek: currentAbs, // step 0 fires immediately
    eventIds: [],
  };

  const step = template.steps[0];
  const event = step.generateEvent(chain, state, rng);
  if (!event) return null;

  // Set the follow-up week on the event if there's a next step
  const nextStepAbs = template.steps.length > 1
    ? currentAbs + template.steps[1].weekDelay
    : undefined;

  const eventWithFollowUp: NarrativeEvent = {
    ...event,
    followUpWeek: nextStepAbs,
  };

  const updatedChain: EventChain = {
    ...chain,
    currentStep: 1,
    resolved: template.steps.length === 1 &&
      (eventWithFollowUp.choices?.length ?? 0) === 0,
    eventIds: [eventWithFollowUp.id],
    nextStepWeek: nextStepAbs ?? currentAbs,
    awaitingChoice: (eventWithFollowUp.choices?.length ?? 0) > 0
      ? {
          eventId: eventWithFollowUp.id,
          stepIndex: 0,
          terminal: template.steps.length === 1,
        }
      : undefined,
  };

  return { chain: updatedChain, event: eventWithFollowUp };
}

/**
 * Result of advancing a chain by one step.
 */
export interface ChainAdvanceResult {
  chain: EventChain;
  event: NarrativeEvent | null;
}

/**
 * Advance a chain to its next step, optionally recording a choice.
 *
 * @param rng         - Shared PRNG.
 * @param state       - Current game state.
 * @param chain       - The chain to advance.
 * @param choiceIndex - If the previous step had choices, the player's selection.
 * @returns Updated chain and the new event (or null if step was skipped/chain ended).
 */
export function advanceChain(
  rng: RNG,
  state: GameState,
  chain: EventChain,
  choiceIndex?: number,
): ChainAdvanceResult {
  const template = findChainTemplate(chain.templateKey);
  if (!template || chain.resolved) {
    return { chain, event: null };
  }

  if (chain.awaitingChoice && choiceIndex === undefined) {
    return { chain, event: null };
  }

  // Record choice for previous step if provided
  const choiceHistory = [...chain.choiceHistory];
  if (choiceIndex !== undefined) {
    choiceHistory[chain.awaitingChoice?.stepIndex ?? chain.currentStep - 1] = choiceIndex;
  }

  const chainWithChoice: EventChain = {
    ...chain,
    choiceHistory,
    awaitingChoice: choiceIndex !== undefined ? undefined : chain.awaitingChoice,
  };

  const stepIndex = chain.currentStep;
  if (stepIndex >= template.steps.length) {
    return { chain: { ...chainWithChoice, resolved: true }, event: null };
  }

  const step = template.steps[stepIndex];

  // Check prerequisites
  if (step.prerequisites && !step.prerequisites(state, chainWithChoice)) {
    return { chain: { ...chainWithChoice, resolved: true }, event: null };
  }

  const event = step.generateEvent(chainWithChoice, state, rng);
  if (!event) {
    return { chain: { ...chainWithChoice, resolved: true }, event: null };
  }

  const currentAbs = absoluteWeek(state, state.currentSeason, state.currentWeek);
  const nextStepIndex = stepIndex + 1;
  const allDone = nextStepIndex >= template.steps.length;

  const nextStepAbs = !allDone
    ? currentAbs + template.steps[nextStepIndex].weekDelay
    : undefined;

  const eventWithFollowUp: NarrativeEvent = {
    ...event,
    followUpWeek: nextStepAbs,
  };

  const updatedChain: EventChain = {
    ...chainWithChoice,
    currentStep: nextStepIndex,
    resolved: allDone && (eventWithFollowUp.choices?.length ?? 0) === 0,
    eventIds: [...chainWithChoice.eventIds, eventWithFollowUp.id],
    nextStepWeek: nextStepAbs ?? currentAbs,
    awaitingChoice: (eventWithFollowUp.choices?.length ?? 0) > 0
      ? {
          eventId: eventWithFollowUp.id,
          stepIndex,
          terminal: allDone,
        }
      : undefined,
  };

  return { chain: updatedChain, event: eventWithFollowUp };
}

/**
 * Check which chains are due for their next event this week.
 *
 * @param state       - Current game state.
 * @returns Array of chains whose next step is due (nextStepWeek <= current absolute week).
 */
export function checkPendingChains(state: GameState): EventChain[] {
  const currentAbs = absoluteWeek(state, state.currentSeason, state.currentWeek);
  return (state.eventChains ?? []).filter(
    (chain) => !chain.resolved &&
      !chain.awaitingChoice &&
      chain.nextStepWeek <= currentAbs,
  );
}

/** Record a choice and release (or terminalize) its persisted chain gate. */
export function resolveChainChoice(
  chain: EventChain,
  eventId: string,
  choiceIndex: number,
  legacyStepIndex?: number,
): EventChain {
  const pending = chain.awaitingChoice;
  const resolvesPendingChoice = pending?.eventId === eventId;
  const stepIndex = resolvesPendingChoice
    ? pending.stepIndex
    : legacyStepIndex ?? Math.max(0, chain.currentStep - 1);
  const choiceHistory = [...chain.choiceHistory];
  choiceHistory[stepIndex] = choiceIndex;

  return {
    ...chain,
    choiceHistory,
    resolved: resolvesPendingChoice && pending.terminal
      ? true
      : chain.resolved,
    awaitingChoice: resolvesPendingChoice ? undefined : chain.awaitingChoice,
  };
}

/**
 * Chains without an authoritative world command may still carry useful market
 * intelligence, but they must never masquerade as completed simulation facts.
 */
function buildRumorChainEvent(
  rng: RNG,
  chain: EventChain,
  state: GameState,
  type: NarrativeEventType,
  title: string,
  description: string,
  escalationLevel: number,
  choices?: { label: string; effect: string }[],
): NarrativeEvent {
  const truth = {
    kind: "rumor",
    sourceLabel: "unverified football source",
  } satisfies RumorNarrativeTruthContract;
  return buildChainEvent(
    rng,
    chain,
    state,
    type,
    `Rumour: ${title}`,
    `This is ${truth.sourceLabel} intelligence, not an authoritative world-state update. ${description}`,
    escalationLevel,
    choices,
  );
}

/**
 * Mark a chain as resolved with final effects.
 *
 * @param state   - Current game state.
 * @param chainId - ID of the chain to resolve.
 * @returns Updated eventChains array.
 */
export function resolveChain(
  state: GameState,
  chainId: string,
): EventChain[] {
  return (state.eventChains ?? []).map((chain) =>
    chain.id === chainId ? { ...chain, resolved: true } : chain,
  );
}

/**
 * Try to trigger a new event chain from the available templates.
 * Called when a random event fires and has a 10% chance of spawning a chain.
 *
 * @param rng   - Shared PRNG.
 * @param state - Current game state.
 * @returns A ChainStartResult, or null if no chain triggers.
 */
export function tryTriggerChain(
  rng: RNG,
  state: GameState,
): ChainStartResult | null {
  // Check active chain cap
  const activeChains = (state.eventChains ?? []).filter((c) => !c.resolved);
  if (activeChains.length >= MAX_ACTIVE_CHAINS) return null;

  // Filter to eligible templates not already running
  const activeKeys = new Set(activeChains.map((c) => c.templateKey));
  const eligible = CHAIN_TEMPLATES.filter(
    (t) => !activeKeys.has(t.key) && t.canTrigger(state),
  );
  if (eligible.length === 0) return null;

  // Pick a random eligible template
  const template = eligible[rng.nextInt(0, eligible.length - 1)];
  return startChain(rng, state, template.key);
}

type ChainChoiceEffects = Readonly<{
  reputationChange: number;
  fatigueChange: number;
}>;

/**
 * Authored immediate stakes for every shipped chain choice. The delayed chain
 * outcomes still decide whether the judgment was correct; these values price
 * what the scout commits immediately (political capital, effort, or restraint).
 */
const CHAIN_CHOICE_EFFECTS: Readonly<Record<string, readonly ChainChoiceEffects[]>> = {
  "dressingRoomConflict:1": [
    { reputationChange: 3, fatigueChange: 4 },
    { reputationChange: 1, fatigueChange: 1 },
    { reputationChange: 0, fatigueChange: -2 },
  ],
  "transferSaga:1": [
    { reputationChange: 2, fatigueChange: 3 },
    { reputationChange: 1, fatigueChange: 1 },
  ],
  "transferSaga:2": [
    { reputationChange: 4, fatigueChange: 4 },
    { reputationChange: 2, fatigueChange: 1 },
  ],
  "wonderkidPressure:1": [
    { reputationChange: 3, fatigueChange: 3 },
    { reputationChange: 2, fatigueChange: 2 },
    { reputationChange: 1, fatigueChange: 0 },
  ],
  "boardUltimatum:1": [
    { reputationChange: 4, fatigueChange: 4 },
    { reputationChange: 3, fatigueChange: 5 },
    { reputationChange: 0, fatigueChange: -2 },
  ],
  "rivalPoaching:1": [
    { reputationChange: 3, fatigueChange: 7 },
    { reputationChange: 2, fatigueChange: 4 },
    { reputationChange: 0, fatigueChange: -2 },
  ],
  "injuryComeback:1": [
    { reputationChange: 2, fatigueChange: 1 },
    { reputationChange: 1, fatigueChange: 0 },
  ],
  "contactBetrayal:0": [
    { reputationChange: 2, fatigueChange: 3 },
    { reputationChange: 0, fatigueChange: 4 },
  ],
  "scoutingScandal:0": [
    { reputationChange: 4, fatigueChange: 5 },
    { reputationChange: 1, fatigueChange: 2 },
  ],
  "managerFallout:1": [
    { reputationChange: 3, fatigueChange: 3 },
    { reputationChange: 1, fatigueChange: 5 },
    { reputationChange: 4, fatigueChange: 7 },
  ],
  "youthBreakthrough:1": [
    { reputationChange: 3, fatigueChange: 4 },
    { reputationChange: 1, fatigueChange: -1 },
  ],
};

/**
 * Compute reputation and fatigue changes for a chain event choice.
 * This is called when a player resolves a choice on a chain event.
 *
 * @param chain       - The event chain.
 * @param choiceIndex - The player's choice.
 * @param rng         - Shared PRNG.
 * @returns Object with reputationChange and fatigueChange.
 */
export function computeChainChoiceEffects(
  chain: EventChain,
  choiceIndex: number,
  rng: RNG,
  choiceStepIndex?: number,
): { reputationChange: number; fatigueChange: number } {
  const stepIndex = choiceStepIndex ??
    chain.awaitingChoice?.stepIndex ??
    chain.currentStep - 1;
  const template = findChainTemplate(chain.templateKey);
  if (!template) return { reputationChange: 0, fatigueChange: 0 };

  const authoredEffects = CHAIN_CHOICE_EFFECTS[`${chain.templateKey}:${stepIndex}`];
  const authoredChoice = authoredEffects?.[choiceIndex];
  if (authoredChoice) return { ...authoredChoice };

  const step = template.steps[stepIndex];
  const escalation = step?.escalationLevel ?? 0;

  // Base effects scale with escalation level
  const baseRep = (escalation + 1) * 2;
  let reputationChange: number;
  let fatigueChange = 0;

  if (choiceIndex === 0) {
    // Proactive/bold choice — higher reward, slight fatigue
    reputationChange = baseRep;
    fatigueChange = 3;
  } else if (choiceIndex === 1) {
    // Moderate choice
    reputationChange = Math.floor(baseRep * 0.5);
    fatigueChange = 0;
  } else {
    // Cautious/wait choice — small reward, fatigue relief
    reputationChange = 0;
    fatigueChange = -2;
  }

  return { reputationChange, fatigueChange };
}

/**
 * Get all chain template keys (useful for debugging/testing).
 */
export function getChainTemplateKeys(): string[] {
  return CHAIN_TEMPLATES.map((t) => t.key);
}
