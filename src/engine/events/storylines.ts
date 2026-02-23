/**
 * Multi-Week Storyline System
 *
 * Storylines are sequences of NarrativeEvents spread across multiple weeks.
 * Each storyline carries context between stages so choices and world state
 * in earlier stages can affect later ones.
 *
 * Architecture:
 *  - StorylineState (from types.ts) is the persisted, serialisable representation.
 *    It has no function fields and can be stored in save files safely.
 *  - StorylineTemplate (defined here) holds the actual stage logic functions.
 *    Templates are looked up by templateId at runtime.
 *
 * Design:
 *  - Pure functions: no mutation, no side-effects, deterministic with RNG.
 *  - Uses the same NarrativeEvent interface as the existing event system.
 *  - Storylines appear in the inbox exactly like regular narrative events.
 *  - At most 2 active storylines at any time to prevent overload.
 *  - 5% per-week trigger probability for a new storyline.
 */

import type { GameState, NarrativeEvent, NarrativeEventType, StorylineState } from "../core/types";

// =============================================================================
// RE-EXPORT StorylineState as Storyline for external consumers
// =============================================================================

/** Runtime alias. The persisted type is `StorylineState` in core/types.ts. */
export type Storyline = StorylineState;

// =============================================================================
// INTERNAL STAGE DEFINITION
// =============================================================================

/**
 * A stage within a storyline template.
 * Not persisted — only exists in the in-memory template registry.
 */
export interface StorylineStage {
  /** Weeks after the previous stage (or after start for stage 0). */
  weekDelay: number;
  /**
   * Generates the NarrativeEvent for this stage.
   * Returns null to silently skip the stage (soft-abort).
   */
  generateEvent: (
    context: Record<string, unknown>,
    state: GameState,
    rng: SimpleRNG,
  ) => NarrativeEvent | null;
  /**
   * Optional guard: if this returns false, the entire storyline is aborted
   * because the world has changed in a way that makes the story implausible.
   */
  prerequisites?: (state: GameState) => boolean;
}

/** Minimal RNG surface used by storylines (matches the engine RNG interface). */
export interface SimpleRNG {
  next(): number;
}

/** A storyline template — the blueprint for creating Storyline instances. */
interface StorylineTemplate {
  id: string;
  name: string;
  /** Returns true when conditions allow this storyline to begin. */
  canTrigger: (state: GameState) => boolean;
  stages: StorylineStage[];
  /** Build the initial context object when the storyline starts. */
  initContext: (state: GameState, rng: SimpleRNG) => Record<string, unknown>;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Generate a short ID for a storyline instance. */
function generateStorylineId(rng: SimpleRNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 10; i++) {
    id += chars[Math.floor(rng.next() * chars.length)];
  }
  return `sl_${id}`;
}

/** Generate a short ID for a storyline-generated NarrativeEvent. */
function generateStoryEventId(rng: SimpleRNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(rng.next() * chars.length)];
  }
  return `evt_${id}`;
}

/**
 * Return the total week-count of the current point in the game,
 * treating each season as 38 weeks. Used to compare across season boundaries.
 */
function absoluteWeek(season: number, week: number): number {
  return (season - 1) * 38 + week;
}

/**
 * Given an absolute week count, return { season, week }.
 * Seasons start at 1; weeks run 1–38.
 */
function fromAbsoluteWeek(abs: number): { season: number; week: number } {
  const season = Math.floor((abs - 1) / 38) + 1;
  const week = ((abs - 1) % 38) + 1;
  return { season, week };
}

// =============================================================================
// STORYLINE TEMPLATES
// =============================================================================

// ---------------------------------------------------------------------------
// 1. The Wonderkid Chase (3 stages, 6 weeks)
// ---------------------------------------------------------------------------

const wonderkidChaseTemplate: StorylineTemplate = {
  id: "wonderkidChase",
  name: "The Wonderkid Chase",

  canTrigger: (state) =>
    state.scout.reputation > 30 &&
    Object.keys(state.contacts).length >= 1,

  initContext: (state, rng) => {
    const contacts = Object.values(state.contacts);
    const contact = contacts.length > 0
      ? contacts[Math.floor(rng.next() * contacts.length)]
      : null;

    const players = Object.values(state.players).filter(
      (p) => p.currentAbility < 120 && p.age <= 22,
    );
    const wonderkid = players.length > 0
      ? players[Math.floor(rng.next() * players.length)]
      : null;

    return {
      contactName: contact?.name ?? "a trusted source",
      contactId: contact?.id ?? "",
      wonderkidId: wonderkid?.id ?? "",
      wonderkidName: wonderkid
        ? `${wonderkid.firstName} ${wonderkid.lastName}`
        : "an exceptional young talent",
      playerChoice: null as string | null,
    };
  },

  stages: [
    {
      weekDelay: 0,
      generateEvent: (ctx, state, rng): NarrativeEvent => ({
        id: generateStoryEventId(rng),
        type: "exclusiveTip" as NarrativeEventType,
        week: state.currentWeek,
        season: state.currentSeason,
        title: "Whisper of a Hidden Wonderkid",
        description:
          `${ctx.contactName as string} has been unusually secretive, but ` +
          `over coffee they finally revealed the name: ${ctx.wonderkidName as string}. ` +
          `Barely sixteen, playing in the lower amateur pyramid, and ` +
          `apparently doing things with a football that shouldn't be possible ` +
          `at that age. "You need to see this kid before the word gets out," ` +
          `they said. The window to act is narrow.`,
        relatedIds: ctx.contactId ? [ctx.contactId as string] : [],
        acknowledged: false,
        choices: undefined,
      }),
    },
    {
      weekDelay: 3,
      prerequisites: (state) => state.scout.reputation > 25,
      generateEvent: (ctx, state, rng): NarrativeEvent => ({
        id: generateStoryEventId(rng),
        type: "wonderkidPressure" as NarrativeEventType,
        week: state.currentWeek,
        season: state.currentSeason,
        title: "The Wonderkid Attracting Attention",
        description:
          `${ctx.wonderkidName as string}'s performances have been turning heads. ` +
          `You've gathered enough data to file a compelling report, but the ` +
          `word is spreading — two other scouts were spotted at last weekend's ` +
          `fixture. Submitting now locks in your claim. Waiting another week ` +
          `risks being beaten to the story, but more evidence would make ` +
          `the report stronger.`,
        relatedIds: ctx.wonderkidId ? [ctx.wonderkidId as string] : [],
        acknowledged: false,
        choices: [
          { label: "Rush a report now", effect: "wonderkidRush" },
          { label: "Wait for more data", effect: "wonderkidWait" },
        ],
      }),
    },
    {
      weekDelay: 3,
      generateEvent: (ctx, state, rng): NarrativeEvent => {
        const choice = ctx.playerChoice as string | null;
        const rushChance = 0.6;
        const waitChance = 0.4;

        let success: boolean;
        let reputationLabel: string;
        let description: string;

        if (choice === "wonderkidRush" || choice === null) {
          success = rng.next() < rushChance;
          if (success) {
            description =
              `Moving quickly paid off. Your report on ${ctx.wonderkidName as string} ` +
              `reached the right desk before anyone else's. The club's technical ` +
              `director called it "the most compelling piece of early-stage ` +
              `scouting I've read this season." Reputation rises accordingly.`;
            reputationLabel = "+8 Reputation";
          } else {
            description =
              `Despite your speed, a rival scout somehow got there first. ` +
              `Their report landed twenty-four hours before yours. The club ` +
              `acknowledged your work but the credit — and the discovery bonus ` +
              `— goes elsewhere. A painful lesson in the margins of this game.`;
            reputationLabel = "-3 Reputation";
          }
        } else {
          // wonderkidWait
          success = rng.next() < waitChance;
          if (success) {
            description =
              `Patience justified. The additional observations gave your report ` +
              `on ${ctx.wonderkidName as string} a depth and precision that ` +
              `no rushed competitor could match. The club has moved decisively ` +
              `on your recommendation. Your methodical approach is being praised.`;
            reputationLabel = "+12 Reputation";
          } else {
            description =
              `The extra week cost you the discovery. Another scout submitted ` +
              `their report while you were still refining yours. ` +
              `${ctx.wonderkidName as string} is already on a rival club's ` +
              `shortlist. The data you gathered is excellent — but it arrived ` +
              `too late to matter.`;
            reputationLabel = "-5 Reputation";
          }
        }

        void success; // used only for narrative branch selection above

        return {
          id: generateStoryEventId(rng),
          type: "hiddenGemVindication" as NarrativeEventType,
          week: state.currentWeek,
          season: state.currentSeason,
          title: `Wonderkid Chase: ${reputationLabel}`,
          description,
          relatedIds: ctx.wonderkidId ? [ctx.wonderkidId as string] : [],
          acknowledged: false,
          choices: undefined,
        };
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 2. The Corrupt Agent (3 stages, 8 weeks)
// ---------------------------------------------------------------------------

const corruptAgentTemplate: StorylineTemplate = {
  id: "corruptAgent",
  name: "The Corrupt Agent",

  canTrigger: (state) =>
    Object.keys(state.contacts).length >= 1 &&
    state.scout.reputation > 20,

  initContext: (state, rng) => {
    const agents = Object.values(state.contacts).filter((c) => c.type === "agent");
    const allContacts = Object.values(state.contacts);
    const pool = agents.length > 0 ? agents : allContacts;
    const agent = pool[Math.floor(rng.next() * pool.length)];

    return {
      agentId: agent?.id ?? "",
      agentName: agent?.name ?? "an agent",
      playerChoice: null as string | null,
    };
  },

  stages: [
    {
      weekDelay: 0,
      generateEvent: (ctx, state, rng): NarrativeEvent => ({
        id: generateStoryEventId(rng),
        type: "agentDeception" as NarrativeEventType,
        week: state.currentWeek,
        season: state.currentSeason,
        title: "Unusually Good Deal on Player Access",
        description:
          `${ctx.agentName as string} has been offering extraordinary access to ` +
          `clients — more than any other agent in your network, with better ` +
          `terms and fewer conditions. The deals are suspiciously good. In this ` +
          `business, that usually means someone somewhere is paying a hidden price. ` +
          `Worth monitoring before you rely too heavily on the relationship.`,
        relatedIds: ctx.agentId ? [ctx.agentId as string] : [],
        acknowledged: false,
        choices: undefined,
      }),
    },
    {
      weekDelay: 4,
      generateEvent: (ctx, state, rng): NarrativeEvent => ({
        id: generateStoryEventId(rng),
        type: "agentDoubleDealing" as NarrativeEventType,
        week: state.currentWeek,
        season: state.currentSeason,
        title: "Agent Inflating Player Statistics",
        description:
          `Your own investigation has confirmed the suspicion. ` +
          `${ctx.agentName as string} has been systematically overstating ` +
          `client performance metrics — fabricating game-time numbers, ` +
          `cherry-picking samples, and in two cases altering third-party ` +
          `data. Clubs that acted on those numbers have been defrauded. ` +
          `What you do with this information defines your character in this industry.`,
        relatedIds: ctx.agentId ? [ctx.agentId as string] : [],
        acknowledged: false,
        choices: [
          { label: "Expose publicly", effect: "agentExpose" },
          { label: "Leverage for intel", effect: "agentLeverage" },
        ],
      }),
    },
    {
      weekDelay: 4,
      generateEvent: (ctx, state, rng): NarrativeEvent => {
        const choice = ctx.playerChoice as string | null;
        let description: string;
        let title: string;

        if (choice === "agentExpose" || choice === null) {
          description =
            `The exposure of ${ctx.agentName as string} has been swift and ` +
            `unambiguous. Governing bodies have opened a formal investigation. ` +
            `Three clubs have already severed ties with the agent. Your ` +
            `reputation for integrity — rare in a business where everyone ` +
            `knows everyone — has risen measurably. The contact is gone, but ` +
            `you gained something more valuable.`;
          title = "Agent Exposed: Reputation Gained";
        } else {
          // agentLeverage — outcome determined at choice resolution time
          const discovered = rng.next() < 0.3;
          if (discovered) {
            description =
              `The arrangement worked briefly — intel packages obtained at no ` +
              `cost. But word got out. Colleagues who knew about the inflated ` +
              `stats and saw you continue working with the agent have drawn their ` +
              `own conclusions. Your reputation has taken a quiet but real hit.`;
            title = "Agent Leverage Exposed";
          } else {
            description =
              `The leverage has paid off quietly. Two free intelligence ` +
              `packages obtained, the agent kept compliant, and no one the ` +
              `wiser. Whether the means justify the ends is a question only you ` +
              `can answer — for now, the professional calculus is in the black.`;
            title = "Agent Intel Secured";
          }
        }

        return {
          id: generateStoryEventId(rng),
          type: "journalistExpose" as NarrativeEventType,
          week: state.currentWeek,
          season: state.currentSeason,
          title,
          description,
          relatedIds: ctx.agentId ? [ctx.agentId as string] : [],
          acknowledged: false,
          choices: undefined,
        };
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 3. The Prodigal Return (2 stages, 4 weeks)
// ---------------------------------------------------------------------------

const prodigalReturnTemplate: StorylineTemplate = {
  id: "prodigalReturn",
  name: "The Prodigal Return",

  canTrigger: (state) =>
    state.currentSeason >= 2 &&
    Object.keys(state.reports).length >= 1,

  initContext: (state, rng) => {
    const olderPlayers = Object.values(state.players).filter(
      (p) => p.age >= 27 && p.age <= 35,
    );
    const player = olderPlayers.length > 0
      ? olderPlayers[Math.floor(rng.next() * olderPlayers.length)]
      : Object.values(state.players)[0];

    return {
      playerId: player?.id ?? "",
      playerName: player
        ? `${player.firstName} ${player.lastName}`
        : "a veteran player",
      playerChoice: null as string | null,
    };
  },

  stages: [
    {
      weekDelay: 0,
      generateEvent: (ctx, state, rng): NarrativeEvent => ({
        id: generateStoryEventId(rng),
        type: "lateBloomingSurprise" as NarrativeEventType,
        week: state.currentWeek,
        season: state.currentSeason,
        title: "The Prodigal Return",
        description:
          `Once the talk of every scout in the country, ` +
          `${ctx.playerName as string} has returned to a lower-league club ` +
          `after years playing abroad. The stories from overseas are mixed — ` +
          `"inconsistent form but moments of brilliance," according to one ` +
          `source. At their age and level, it's either a player with enough ` +
          `left in the tank to justify a look, or a name coasting on past ` +
          `glories. Your eye will tell you which.`,
        relatedIds: ctx.playerId ? [ctx.playerId as string] : [],
        acknowledged: false,
        choices: undefined,
      }),
    },
    {
      weekDelay: 4,
      generateEvent: (ctx, state, rng): NarrativeEvent => ({
        id: generateStoryEventId(rng),
        type: "reportCitedInBoardMeeting" as NarrativeEventType,
        week: state.currentWeek,
        season: state.currentSeason,
        title: "Time for Your Verdict",
        description:
          `After four weeks of observations, ${ctx.playerName as string} ` +
          `remains difficult to read. There are games where they look a ` +
          `level above everyone on the pitch. There are others where the ` +
          `pace has clearly gone and the decision-making is a step slow. ` +
          `Multiple clubs are asking for assessments. Your professional ` +
          `judgement — and your willingness to back it — is what separates ` +
          `a good scout from an equivocating one. What's your call?`,
        relatedIds: ctx.playerId ? [ctx.playerId as string] : [],
        acknowledged: false,
        choices: [
          { label: "Recommend — still has it", effect: "prodigalRecommend" },
          { label: "Pass — too much decline", effect: "prodigalPass" },
        ],
      }),
    },
  ],
};

// ---------------------------------------------------------------------------
// 4. Board Power Struggle (4 stages, 12 weeks)
// ---------------------------------------------------------------------------

const boardPowerStruggleTemplate: StorylineTemplate = {
  id: "boardPowerStruggle",
  name: "Board Power Struggle",

  canTrigger: (state) =>
    state.scout.careerTier >= 3 &&
    state.scout.currentClubId !== undefined,

  initContext: (state, rng) => {
    const clubId = state.scout.currentClubId ?? "";
    const club = state.clubs[clubId];

    const firstNames = ["Marcus", "Elena", "David", "Priya", "Henrik", "Lucia"];
    const lastNames = ["Vance", "Kowalski", "Osei", "Sharma", "Bergman", "Reyes"];
    const boardMemberName =
      firstNames[Math.floor(rng.next() * firstNames.length)] +
      " " +
      lastNames[Math.floor(rng.next() * lastNames.length)];

    return {
      clubId,
      clubName: club?.name ?? "your club",
      boardMemberName,
      playerChoice: null as string | null,
    };
  },

  stages: [
    {
      weekDelay: 0,
      prerequisites: (state) =>
        state.scout.currentClubId !== undefined && state.scout.careerTier >= 3,
      generateEvent: (ctx, state, rng): NarrativeEvent => ({
        id: generateStoryEventId(rng),
        type: "boardroomCoup" as NarrativeEventType,
        week: state.currentWeek,
        season: state.currentSeason,
        title: "New Board Member Challenges Scouting Methodology",
        description:
          `A newly appointed board member at ${ctx.clubName as string}, ` +
          `${ctx.boardMemberName as string}, has wasted no time making their ` +
          `views known. In an internal memo circulated this week they questioned ` +
          `"the qualitative nature of the current scouting operation" and ` +
          `called for "data-led, measurable recruitment criteria." The scouting ` +
          `department is being talked about as a line item rather than a function. ` +
          `Watch this space.`,
        relatedIds: ctx.clubId ? [ctx.clubId as string] : [],
        acknowledged: false,
        choices: undefined,
      }),
    },
    {
      weekDelay: 4,
      prerequisites: (state) => state.scout.currentClubId !== undefined,
      generateEvent: (ctx, state, rng): NarrativeEvent => ({
        id: generateStoryEventId(rng),
        type: "reportCitedInBoardMeeting" as NarrativeEventType,
        week: state.currentWeek,
        season: state.currentSeason,
        title: "Justify Your Reports to the Board",
        description:
          `${ctx.boardMemberName as string} has requested a formal review of ` +
          `the scouting department's methodology. You've been asked to present ` +
          `your last six months of work — the reports, the rationale, the ` +
          `process — to a board sub-committee. It's an uncomfortable request, ` +
          `but also an opportunity: handled well, it could silence the critic ` +
          `before the criticism becomes structural. The presentation is next week.`,
        relatedIds: ctx.clubId ? [ctx.clubId as string] : [],
        acknowledged: false,
        choices: undefined,
      }),
    },
    {
      weekDelay: 4,
      prerequisites: (state) => state.scout.currentClubId !== undefined,
      generateEvent: (ctx, state, rng): NarrativeEvent => ({
        id: generateStoryEventId(rng),
        type: "scoutingDeptRestructure" as NarrativeEventType,
        week: state.currentWeek,
        season: state.currentSeason,
        title: "Political Maneuvering",
        description:
          `The political situation at ${ctx.clubName as string} has clarified. ` +
          `${ctx.boardMemberName as string} has the support of two other investors. ` +
          `The existing chairman has the loyalty of the football operations side. ` +
          `Neither faction is asking you directly, but the message is being sent ` +
          `through intermediaries: where do your loyalties lie? This will be ` +
          `remembered, whatever the outcome.`,
        relatedIds: ctx.clubId ? [ctx.clubId as string] : [],
        acknowledged: false,
        choices: [
          { label: "Align with the new board member", effect: "boardAlignNew" },
          { label: "Support the existing structure", effect: "boardAlignOld" },
          { label: "Stay strictly neutral", effect: "boardNeutral" },
        ],
      }),
    },
    {
      weekDelay: 4,
      generateEvent: (ctx, state, rng): NarrativeEvent => {
        const choice = ctx.playerChoice as string | null;

        // 60% chance the new board member wins
        const newBoardWins = rng.next() < 0.6;
        let description: string;
        let title: string;

        if (newBoardWins) {
          if (choice === "boardAlignNew") {
            description =
              `${ctx.boardMemberName as string}'s faction has prevailed. The existing ` +
              `chairman tendered their resignation this morning. Your early alignment ` +
              `with the incoming regime has been noticed — you've been described as ` +
              `"one of the pragmatic professionals who understood where this was going." ` +
              `Reputation and trust at the club have risen.`;
            title = "New Board Wins: Alignment Rewarded (+5 Rep)";
          } else if (choice === "boardAlignOld") {
            description =
              `${ctx.boardMemberName as string}'s faction has prevailed. The chairman is ` +
              `gone and the new regime is installing its own people. Your association ` +
              `with the outgoing structure has not been forgotten. You'll need to work ` +
              `harder to prove your value to the new board.`;
            title = "New Board Wins: Loyalty to Old Structure Penalised (-3 Rep)";
          } else {
            description =
              `${ctx.boardMemberName as string} has taken control. Your neutrality ` +
              `kept you out of the firing line — neither rewarded nor punished. ` +
              `A cautious choice that preserved your position. The new regime ` +
              `is an unknown quantity, but you have no enemies there.`;
            title = "New Board Wins: Neutral Position Holds";
          }
        } else {
          // Old board wins
          if (choice === "boardAlignOld") {
            description =
              `The existing structure survived. The chairman's faction mobilised ` +
              `support among the majority shareholders and ${ctx.boardMemberName as string}'s ` +
              `initiative has been rebuffed. Your loyalty to the existing ` +
              `structure has been noted at the highest level. Reputation rises.`;
            title = "Existing Board Prevails: Loyalty Rewarded (+5 Rep)";
          } else if (choice === "boardAlignNew") {
            description =
              `The existing structure survived and ${ctx.boardMemberName as string} ` +
              `has been sidelined. Your alignment with the losing faction has been ` +
              `noted. The chairman's inner circle is keeping a careful distance. ` +
              `You'll need to rebuild trust over time.`;
            title = "Existing Board Prevails: Alignment Penalised (-3 Rep)";
          } else {
            description =
              `The existing board held on. Your neutrality proved wise — both ` +
              `sides had reasons to respect your non-involvement. The chairman ` +
              `specifically mentioned your "professional focus" in a private conversation. ` +
              `You emerge with your position intact.`;
            title = "Existing Board Prevails: Neutral Position Holds";
          }
        }

        return {
          id: generateStoryEventId(rng),
          type: "boardroomCoup" as NarrativeEventType,
          week: state.currentWeek,
          season: state.currentSeason,
          title,
          description,
          relatedIds: ctx.clubId ? [ctx.clubId as string] : [],
          acknowledged: false,
          choices: undefined,
        };
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 5. The International Discovery (3 stages, 10 weeks)
// ---------------------------------------------------------------------------

const internationalDiscoveryTemplate: StorylineTemplate = {
  id: "internationalDiscovery",
  name: "The International Discovery",

  canTrigger: (state) =>
    state.countries.length >= 2 &&
    state.scout.reputation > 40,

  initContext: (state, rng) => {
    const contacts = Object.values(state.contacts);
    const contact = contacts.length > 0
      ? contacts[Math.floor(rng.next() * contacts.length)]
      : null;

    const foreignCountries = state.countries.slice(1);
    const rawCountry = foreignCountries.length > 0
      ? foreignCountries[Math.floor(rng.next() * foreignCountries.length)]
      : state.countries[0];
    const country = rawCountry.charAt(0).toUpperCase() + rawCountry.slice(1);

    const youngPlayers = Object.values(state.players).filter(
      (p) => p.age <= 23 && p.currentAbility < 130,
    );
    const player = youngPlayers.length > 0
      ? youngPlayers[Math.floor(rng.next() * youngPlayers.length)]
      : null;

    return {
      contactId: contact?.id ?? "",
      contactName: contact?.name ?? "a contact overseas",
      country,
      playerId: player?.id ?? "",
      playerName: player
        ? `${player.firstName} ${player.lastName}`
        : "a young talent",
      playerChoice: null as string | null,
    };
  },

  stages: [
    {
      weekDelay: 0,
      generateEvent: (ctx, state, rng): NarrativeEvent => ({
        id: generateStoryEventId(rng),
        type: "internationalTournament" as NarrativeEventType,
        week: state.currentWeek,
        season: state.currentSeason,
        title: "Unknown Talent in a Remote League",
        description:
          `${ctx.contactName as string} has mentioned a name you've never encountered: ` +
          `${ctx.playerName as string}, playing in a semi-professional setup in ` +
          `${ctx.country as string}. "I've been watching them for three months and ` +
          `I've never seen anything like it at this level," they said. The league ` +
          `isn't on any major radar. If this is genuine, you'd have the picture ` +
          `entirely to yourself.`,
        relatedIds: [
          ...(ctx.contactId ? [ctx.contactId as string] : []),
          ...(ctx.playerId ? [ctx.playerId as string] : []),
        ],
        acknowledged: false,
        choices: undefined,
      }),
    },
    {
      weekDelay: 5,
      prerequisites: (state) => state.countries.length >= 2,
      generateEvent: (ctx, state, rng): NarrativeEvent => ({
        id: generateStoryEventId(rng),
        type: "exclusiveAccess" as NarrativeEventType,
        week: state.currentWeek,
        season: state.currentSeason,
        title: "The Scouting Trip",
        description:
          `You've made the journey to ${ctx.country as string}. The facilities ` +
          `are humble, the travel was long, and the local football is rawer ` +
          `than what you're used to. But ${ctx.playerName as string} is ` +
          `immediately visible — a presence on the pitch that stands out even ` +
          `in this context. You spend three days observing, taking notes, ` +
          `filming where permitted. Your notebook is filling with things ` +
          `that could justify the trip many times over.`,
        relatedIds: ctx.playerId ? [ctx.playerId as string] : [],
        acknowledged: false,
        choices: undefined,
      }),
    },
    {
      weekDelay: 5,
      generateEvent: (ctx, state, rng): NarrativeEvent => ({
        id: generateStoryEventId(rng),
        type: "networkExpansion" as NarrativeEventType,
        week: state.currentWeek,
        season: state.currentSeason,
        title: "The International Placement Decision",
        description:
          `Your assessment of ${ctx.playerName as string} is complete. ` +
          `The talent is genuine — probably worth two or three tiers higher ` +
          `than their current environment. Now comes the harder question: ` +
          `who do you recommend them to? Your own club would get the benefit, ` +
          `but a bigger club could transform the player's career. Or you could ` +
          `hold the information and wait for a clearer opportunity.`,
        relatedIds: ctx.playerId ? [ctx.playerId as string] : [],
        acknowledged: false,
        choices: [
          { label: "Recommend to your club", effect: "intlRecommendOwn" },
          { label: "Recommend to a bigger club", effect: "intlRecommendBig" },
          { label: "Hold off for now", effect: "intlHoldOff" },
        ],
      }),
    },
  ],
};

// =============================================================================
// TEMPLATE REGISTRY
// =============================================================================

const STORYLINE_TEMPLATES: readonly StorylineTemplate[] = [
  wonderkidChaseTemplate,
  corruptAgentTemplate,
  prodigalReturnTemplate,
  boardPowerStruggleTemplate,
  internationalDiscoveryTemplate,
];

/**
 * Look up a template by its ID.
 * Returns undefined if the templateId is not recognised (e.g. legacy save).
 */
function findTemplate(templateId: string): StorylineTemplate | undefined {
  return STORYLINE_TEMPLATES.find((t) => t.id === templateId);
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Maximum number of storylines that can run simultaneously.
 */
const MAX_ACTIVE_STORYLINES = 2;

/**
 * Weekly probability that a new storyline will trigger (if eligible).
 */
const STORYLINE_TRIGGER_CHANCE = 0.05;

/**
 * Attempt to trigger a new storyline this week.
 *
 * @param state - Current game state.
 * @param rng   - Shared PRNG.
 * @returns A new Storyline, or null if none triggered this week.
 */
export function checkStorylineTriggers(
  state: GameState,
  rng: SimpleRNG,
): Storyline | null {
  // Step 1: weekly trigger roll
  if (rng.next() >= STORYLINE_TRIGGER_CHANCE) return null;

  // Step 2: cap check
  const active = state.activeStorylines.filter((s) => !s.resolved);
  if (active.length >= MAX_ACTIVE_STORYLINES) return null;

  // Step 3: filter eligible templates
  const activeTemplateIds = new Set(active.map((s) => s.templateId));
  const eligible = STORYLINE_TEMPLATES.filter(
    (t) => !activeTemplateIds.has(t.id) && t.canTrigger(state),
  );
  if (eligible.length === 0) return null;

  // Step 4: pick a random eligible template
  const template = eligible[Math.floor(rng.next() * eligible.length)];
  const context = template.initContext(state, rng);

  const storyline: Storyline = {
    id: generateStorylineId(rng),
    templateId: template.id,
    name: template.name,
    // stages stored as empty array — actual stage logic lives in templates
    stages: [],
    currentStage: 0,
    // Stage 0 has weekDelay: 0 so it fires immediately
    nextStageWeek: state.currentWeek,
    nextStageSeason: state.currentSeason,
    startedWeek: state.currentWeek,
    startedSeason: state.currentSeason,
    resolved: false,
    context,
  };

  return storyline;
}

/**
 * Result from processing one tick of all active storylines.
 */
export interface StorylineTickResult {
  events: NarrativeEvent[];
  updatedStorylines: Storyline[];
}

/**
 * Process all active storylines for the current week.
 *
 * @param state - Current game state.
 * @param rng   - Shared PRNG.
 * @returns Events generated and the updated storylines array.
 */
export function processActiveStorylines(
  state: GameState,
  rng: SimpleRNG,
): StorylineTickResult {
  const events: NarrativeEvent[] = [];
  const updatedStorylines: Storyline[] = [];
  const currentAbs = absoluteWeek(state.currentSeason, state.currentWeek);

  for (const storyline of state.activeStorylines) {
    if (storyline.resolved) {
      updatedStorylines.push(storyline);
      continue;
    }

    const stageAbs = absoluteWeek(storyline.nextStageSeason, storyline.nextStageWeek);

    // Not yet time for this stage
    if (currentAbs < stageAbs) {
      updatedStorylines.push(storyline);
      continue;
    }

    const template = findTemplate(storyline.templateId);
    if (!template) {
      // Unknown template — mark resolved to avoid stale entries
      updatedStorylines.push({ ...storyline, resolved: true });
      continue;
    }

    const stage = template.stages[storyline.currentStage];
    if (!stage) {
      updatedStorylines.push({ ...storyline, resolved: true });
      continue;
    }

    // Prerequisite guard
    if (stage.prerequisites && !stage.prerequisites(state)) {
      updatedStorylines.push({ ...storyline, resolved: true });
      continue;
    }

    // Generate stage event
    const event = stage.generateEvent(storyline.context, state, rng);
    if (event !== null) {
      events.push(event);
    }

    const nextStageIndex = storyline.currentStage + 1;
    const allStagesDone = nextStageIndex >= template.stages.length;

    if (allStagesDone) {
      updatedStorylines.push({
        ...storyline,
        currentStage: nextStageIndex,
        resolved: true,
      });
    } else {
      const nextStage = template.stages[nextStageIndex];
      const nextAbs = currentAbs + nextStage.weekDelay;
      const { season: nextStageSeason, week: nextStageWeek } = fromAbsoluteWeek(nextAbs);

      updatedStorylines.push({
        ...storyline,
        currentStage: nextStageIndex,
        nextStageWeek,
        nextStageSeason,
      });
    }
  }

  return { events, updatedStorylines };
}

// =============================================================================
// CHOICE RESOLUTION
// =============================================================================

export interface StorylineChoiceResult {
  storyline: Storyline;
  reputationChange: number;
  fatigueChange: number;
  message?: string;
}

/**
 * Apply a player's choice to the current pending-choice stage of a storyline.
 *
 * Records the choice in the storyline context so the next (resolution) stage
 * can read it. Also computes immediate reputation and fatigue effects.
 *
 * @param storyline   - The storyline containing the pending choice.
 * @param stageIndex  - Stage index on which the choice was made (0-based).
 * @param choiceIndex - The player's selected choice index (0-based).
 * @param rng         - Shared PRNG for probabilistic outcomes.
 */
export function resolveStorylineChoice(
  storyline: Storyline,
  stageIndex: number,
  choiceIndex: number,
  rng: SimpleRNG,
): StorylineChoiceResult {
  const effectTag = deriveEffectTag(storyline.templateId, stageIndex, choiceIndex);

  const updatedContext: Record<string, unknown> = {
    ...storyline.context,
    playerChoice: effectTag,
  };

  let reputationChange = 0;
  let fatigueChange = 0;
  let message: string | undefined;

  switch (effectTag) {
    case "wonderkidRush":
      fatigueChange = 5;
      message = "You rush to compile your report. The pressure is on.";
      break;

    case "wonderkidWait":
      message = "You decide to gather more data. Patience is a virtue in this business.";
      break;

    case "agentExpose":
      reputationChange = 5;
      message = "You report the agent's conduct. The industry will take note.";
      break;

    case "agentLeverage": {
      const discovered = rng.next() < 0.3;
      if (discovered) {
        reputationChange = -3;
        message = "The leverage arrangement has been discovered. Your reputation suffers.";
      } else {
        message = "You quietly leverage the information. Two free intel packages secured.";
      }
      break;
    }

    case "prodigalRecommend": {
      const repChange = resolveProdigalChoice(rng, true);
      reputationChange = repChange;
      message = repChange > 0
        ? "Your recommendation was correct — the veteran still has it. Reputation rises."
        : "The veteran's decline accelerated. Your recommendation didn't land well.";
      break;
    }

    case "prodigalPass": {
      const repChange = resolveProdigalChoice(rng, false);
      reputationChange = repChange;
      message = repChange > 0
        ? "Your caution was validated — the veteran struggled badly. Sound judgement."
        : "The veteran proved you wrong with a string of excellent performances.";
      break;
    }

    case "boardAlignNew":
    case "boardAlignOld":
    case "boardNeutral":
      message = "Your position in the board struggle has been registered.";
      break;

    case "intlRecommendOwn":
      reputationChange = 4;
      message = "You submit the report to your own club. A direct benefit to your standing here.";
      break;

    case "intlRecommendBig":
      reputationChange = 7;
      message = "Recommending upward takes courage. Your reputation for selfless scouting grows.";
      break;

    case "intlHoldOff":
      message = "You hold the information. No risk, no reward — for now.";
      break;

    default:
      break;
  }

  return {
    storyline: { ...storyline, context: updatedContext },
    reputationChange,
    fatigueChange,
    message,
  };
}

// =============================================================================
// PRIVATE HELPERS
// =============================================================================

/**
 * Map (templateId, stageIndex, choiceIndex) to an effect tag string.
 * Mirrors the choices arrays embedded in each template stage.
 */
function deriveEffectTag(
  templateId: string,
  stageIndex: number,
  choiceIndex: number,
): string {
  const effectMap: Record<string, Record<number, string[]>> = {
    wonderkidChase: {
      1: ["wonderkidRush", "wonderkidWait"],
    },
    corruptAgent: {
      1: ["agentExpose", "agentLeverage"],
    },
    prodigalReturn: {
      1: ["prodigalRecommend", "prodigalPass"],
    },
    boardPowerStruggle: {
      2: ["boardAlignNew", "boardAlignOld", "boardNeutral"],
    },
    internationalDiscovery: {
      2: ["intlRecommendOwn", "intlRecommendBig", "intlHoldOff"],
    },
  };

  const stageMap = effectMap[templateId];
  if (!stageMap) return "unknown";
  const choices = stageMap[stageIndex];
  if (!choices) return "unknown";
  return choices[choiceIndex] ?? "unknown";
}

/**
 * Resolve the prodigal return outcome (50/50 whether the veteran performs).
 * Correct call = +6 rep. Wrong call = -4 rep.
 */
function resolveProdigalChoice(rng: SimpleRNG, recommended: boolean): number {
  const playerPerforms = rng.next() < 0.5;
  const correct = recommended === playerPerforms;
  return correct ? 6 : -4;
}
