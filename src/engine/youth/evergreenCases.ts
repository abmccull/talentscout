import type {
  GameState,
  InboxMessage,
  Player,
  ScoutingCase,
} from "@/engine/core/types";
import { addGameWeeks, gameWeeksBetween } from "@/engine/core/gameDate";
import {
  registerDecision,
  type ConsequenceEffect,
  type DecisionOption,
  type DecisionRecord,
  type EntityRef,
  type GameDate,
} from "@/engine/consequences";
import { createNamedRNG, getRunGameModeId } from "@/engine/run";
import { openProfessionalScoutingCase } from "@/engine/reports/scoutingCases";
import { buildProfessionalCaseOpportunityLockMetadata } from "./professionalCaseOpportunities";

export const YOUTH_CASE_TRIGGER_CHANCE = 0.08;
export const YOUTH_CASE_COOLDOWN_WEEKS = 7;
export const YOUTH_CASE_SEASON_ONE_GUARANTEE_WEEK = 13;
const MAX_OPEN_PLAYER_DECISIONS = 2;

export type YouthEvergreenCaseFamilyId =
  | "academy-release-late-developer"
  | "education-versus-relocation"
  | "injury-recovery-evidence"
  | "dual-national-pathway"
  | "role-conversion"
  | "agent-exclusivity"
  | "rival-claim"
  | "source-conflict"
  | "tournament-window"
  | "welfare-pressure"
  | "trial-deadline"
  | "development-environment";

interface YouthCaseOptionDefinition {
  id: string;
  label: string;
  knownTradeoffs: readonly [string, string, ...string[]];
  fatigueDelta: number;
  reputationDelta: number;
  clubTrustDelta: number;
  specializationDelta: number;
  upsideProbability: number;
  upsideReputation: number;
  upsideClubTrust: number;
  upsideSpecialization: number;
}

export interface YouthEvergreenCaseDefinition {
  id: YouthEvergreenCaseFamilyId;
  title: string;
  centralQuestion: string;
  premise: (playerName: string) => string;
  deadlineWeeks: number;
  baseWeight: number;
  eligible: (state: GameState, player: Player) => boolean;
  options: readonly [
    YouthCaseOptionDefinition,
    YouthCaseOptionDefinition,
    ...YouthCaseOptionDefinition[],
  ];
}

function choice(
  id: string,
  label: string,
  knownTradeoffs: readonly [string, string, ...string[]],
  values: Omit<
    YouthCaseOptionDefinition,
    "id" | "label" | "knownTradeoffs"
  >,
): YouthCaseOptionDefinition {
  return { id, label, knownTradeoffs, ...values };
}

function hasAgent(state: GameState): boolean {
  return Object.values(state.contacts).some((contact) =>
    contact.type === "agent" && !contact.dormant,
  );
}

function hasRival(state: GameState): boolean {
  return Object.keys(state.rivalScouts ?? {}).length > 0;
}

function hasMixedSources(state: GameState, player: Player): boolean {
  const observations = Object.values(state.observations)
    .filter((observation) => observation.playerId === player.id).length;
  const delegated = Object.values(state.npcReports ?? {})
    .some((report) => report.playerId === player.id);
  return observations >= 2 || (observations >= 1 && delegated);
}

function hasLiveTournament(state: GameState, player: Player): boolean {
  return Object.values(state.youthTournaments ?? {}).some((tournament) =>
    tournament.season === state.currentSeason
    && state.currentWeek >= tournament.startWeek
    && state.currentWeek <= tournament.endWeek
    && (
      tournament.country.toLowerCase() === player.nationality.toLowerCase()
      || tournament.participantCountries?.some((country) =>
        country.toLowerCase() === player.nationality.toLowerCase()
      )
    ),
  );
}

function isUnsigned(state: GameState, player: Player): boolean {
  return Object.values(state.unsignedYouth ?? {}).some((candidate) =>
    candidate.player.id === player.id && !candidate.placed && !candidate.retired,
  );
}

function isForeignToBase(state: GameState, player: Player): boolean {
  const base = state.runManifest.startingCountry ?? state.countries[0];
  return Boolean(base) && player.nationality.toLowerCase() !== base?.toLowerCase();
}

export const YOUTH_EVERGREEN_CASE_DEFINITIONS: readonly YouthEvergreenCaseDefinition[] = [
  {
    id: "academy-release-late-developer",
    title: "The Late Developer Window",
    centralQuestion: "How much exposure should you create before the evidence is complete?",
    premise: (name) => `${name} is reaching the point where an unsigned prospect can disappear from organized football. You have enough evidence to act, but not enough to be comfortable.`,
    deadlineWeeks: 2,
    baseWeight: 1.1,
    eligible: (state, player) => isUnsigned(state, player) && player.age >= 18,
    options: [
      choice("force-exposure", "Create immediate exposure", ["Puts the player in front of decision-makers now", "Thin evidence makes your reputation part of the gamble"], { fatigueDelta: 6, reputationDelta: 1, clubTrustDelta: -2, specializationDelta: 0, upsideProbability: 0.4, upsideReputation: 5, upsideClubTrust: 0, upsideSpecialization: 1 }),
      choice("targeted-level", "Target one realistic level", ["Improves fit and preserves credibility", "A narrow search may miss the best available pathway"], { fatigueDelta: 4, reputationDelta: 0, clubTrustDelta: 1, specializationDelta: 1, upsideProbability: 0.65, upsideReputation: 2, upsideClubTrust: 2, upsideSpecialization: 2 }),
      choice("evidence-first", "Build the evidence first", ["Produces a more defensible projection", "The placement window may close while you wait"], { fatigueDelta: 2, reputationDelta: -1, clubTrustDelta: 0, specializationDelta: 1, upsideProbability: 0.76, upsideReputation: 1, upsideClubTrust: 1, upsideSpecialization: 3 }),
    ],
  },
  {
    id: "education-versus-relocation",
    title: "A Move Before They Are Ready",
    centralQuestion: "Should opportunity outrun personal readiness?",
    premise: (name) => `${name} is young enough that any serious pathway could disrupt education, family routines and support. The football case and the welfare case do not point to the same timetable.`,
    deadlineWeeks: 2,
    baseWeight: 1,
    eligible: (_state, player) => player.age <= 18,
    options: [
      choice("push-move", "Push for the opportunity", ["Uses the current football window", "Family confidence and adaptation become live risks"], { fatigueDelta: 3, reputationDelta: 2, clubTrustDelta: -3, specializationDelta: 0, upsideProbability: 0.48, upsideReputation: 4, upsideClubTrust: 0, upsideSpecialization: 1 }),
      choice("protect-local", "Protect the local pathway", ["Preserves stability and family trust", "A better-resourced opportunity may not return"], { fatigueDelta: 1, reputationDelta: -1, clubTrustDelta: 3, specializationDelta: 1, upsideProbability: 0.66, upsideReputation: 1, upsideClubTrust: 3, upsideSpecialization: 2 }),
      choice("staged-pathway", "Negotiate a staged pathway", ["Tests commitment without forcing an immediate move", "Requires time, follow-up and cooperation from both sides"], { fatigueDelta: 6, reputationDelta: 0, clubTrustDelta: 1, specializationDelta: 1, upsideProbability: 0.74, upsideReputation: 2, upsideClubTrust: 2, upsideSpecialization: 2 }),
    ],
  },
  {
    id: "injury-recovery-evidence",
    title: "The Recovery Sample",
    centralQuestion: "Do you pause the opinion, investigate recovery, or stand behind the projection?",
    premise: (name) => `${name} is currently injured. The interruption removes normal match evidence but creates a rare chance to judge rehabilitation habits and support.`,
    deadlineWeeks: 1,
    baseWeight: 1.35,
    eligible: (_state, player) => player.injured,
    options: [
      choice("pause-opinion", "Pause the case", ["Avoids treating recovery form as normal ability", "Clubs and rivals may move on without your view"], { fatigueDelta: -1, reputationDelta: -1, clubTrustDelta: 1, specializationDelta: 0, upsideProbability: 0.72, upsideReputation: 1, upsideClubTrust: 2, upsideSpecialization: 1 }),
      choice("study-rehab", "Study the rehabilitation", ["Can reveal professionalism and support quality", "Costs attention without providing normal match evidence"], { fatigueDelta: 5, reputationDelta: 0, clubTrustDelta: 1, specializationDelta: 2, upsideProbability: 0.68, upsideReputation: 1, upsideClubTrust: 1, upsideSpecialization: 4 }),
      choice("stand-behind", "Stand behind the existing projection", ["Signals conviction while the player is vulnerable", "A setback makes your confidence look careless"], { fatigueDelta: 2, reputationDelta: 2, clubTrustDelta: -2, specializationDelta: 0, upsideProbability: 0.38, upsideReputation: 6, upsideClubTrust: 2, upsideSpecialization: 1 }),
    ],
  },
  {
    id: "dual-national-pathway",
    title: "Two Football Pathways",
    centralQuestion: "Which environment should shape the next stage of the player?",
    premise: (name) => `${name}'s nationality and your current base create more than one plausible football pathway. Access, adaptation and competition quality pull in different directions.`,
    deadlineWeeks: 3,
    baseWeight: 0.85,
    eligible: (state, player) => isForeignToBase(state, player),
    options: [
      choice("home-network", "Use the home-country network", ["Builds on cultural familiarity and trusted access", "May provide less visibility to clubs near your base"], { fatigueDelta: 4, reputationDelta: 0, clubTrustDelta: 1, specializationDelta: 2, upsideProbability: 0.66, upsideReputation: 2, upsideClubTrust: 1, upsideSpecialization: 3 }),
      choice("base-pathway", "Build a pathway near your base", ["Makes follow-up and club persuasion easier", "Adaptation evidence remains incomplete"], { fatigueDelta: 3, reputationDelta: 1, clubTrustDelta: 1, specializationDelta: 0, upsideProbability: 0.55, upsideReputation: 3, upsideClubTrust: 2, upsideSpecialization: 1 }),
      choice("compare-both", "Compare both environments", ["Produces the strongest environment judgment", "Travel and delay expose the opportunity to competitors"], { fatigueDelta: 7, reputationDelta: -1, clubTrustDelta: 0, specializationDelta: 2, upsideProbability: 0.78, upsideReputation: 2, upsideClubTrust: 1, upsideSpecialization: 4 }),
    ],
  },
  {
    id: "role-conversion",
    title: "The Role Nobody Has Tested",
    centralQuestion: "Do you evaluate the player they are or the role they might become?",
    premise: (name) => `${name} already has experience outside a single position. A role conversion could reveal a higher ceiling, but it could also turn projection into wishful thinking.`,
    deadlineWeeks: 2,
    baseWeight: 0.95,
    eligible: (_state, player) => player.secondaryPositions.length > 0,
    options: [
      choice("current-role", "Judge the established role", ["Keeps the report grounded in repeatable evidence", "May miss the trait that makes the player exceptional"], { fatigueDelta: 1, reputationDelta: 0, clubTrustDelta: 2, specializationDelta: 0, upsideProbability: 0.62, upsideReputation: 2, upsideClubTrust: 2, upsideSpecialization: 1 }),
      choice("test-conversion", "Seek a conversion context", ["Directly tests the alternative-role hypothesis", "The right fixture or coaching access may take weeks"], { fatigueDelta: 5, reputationDelta: -1, clubTrustDelta: 0, specializationDelta: 2, upsideProbability: 0.72, upsideReputation: 2, upsideClubTrust: 1, upsideSpecialization: 4 }),
      choice("sell-versatility", "Sell the versatility now", ["Creates a compelling and flexible recruitment story", "Overstating role readiness exposes your calibration"], { fatigueDelta: 2, reputationDelta: 2, clubTrustDelta: -2, specializationDelta: 0, upsideProbability: 0.42, upsideReputation: 5, upsideClubTrust: 1, upsideSpecialization: 1 }),
    ],
  },
  {
    id: "agent-exclusivity",
    title: "The Exclusive Introduction",
    centralQuestion: "How much control will you trade for privileged access?",
    premise: (name) => `An agent in your network will give you the first serious introduction around ${name}, but only if you keep the case away from competing channels for now.`,
    deadlineWeeks: 1,
    baseWeight: 0.9,
    eligible: (state) => hasAgent(state),
    options: [
      choice("accept-exclusive", "Accept exclusivity", ["Protects privileged access and agent trust", "Limits the clubs and contacts you can approach"], { fatigueDelta: 1, reputationDelta: 0, clubTrustDelta: 2, specializationDelta: 0, upsideProbability: 0.58, upsideReputation: 3, upsideClubTrust: 3, upsideSpecialization: 1 }),
      choice("refuse-control", "Keep the case independent", ["Preserves freedom to find the best pathway", "The agent may close the introduction immediately"], { fatigueDelta: 2, reputationDelta: 1, clubTrustDelta: -2, specializationDelta: 1, upsideProbability: 0.48, upsideReputation: 4, upsideClubTrust: 0, upsideSpecialization: 2 }),
      choice("limited-window", "Negotiate a limited window", ["Balances access with a defined escape point", "Consumes time and neither side receives full control"], { fatigueDelta: 5, reputationDelta: 0, clubTrustDelta: 1, specializationDelta: 1, upsideProbability: 0.7, upsideReputation: 2, upsideClubTrust: 2, upsideSpecialization: 2 }),
    ],
  },
  {
    id: "rival-claim",
    title: "A Rival Enters the File",
    centralQuestion: "Do you accelerate, defend the source, or let the evidence lead?",
    premise: (name) => `A named rival has begun working around ${name}. The player is still available, but your next move will define whether this becomes a race, a territorial dispute or a disciplined case.`,
    deadlineWeeks: 1,
    baseWeight: 1,
    eligible: (state) => hasRival(state),
    options: [
      choice("accelerate", "Accelerate the recommendation", ["May secure the opportunity before the rival", "Compresses observation and increases calibration risk"], { fatigueDelta: 6, reputationDelta: 2, clubTrustDelta: -2, specializationDelta: 0, upsideProbability: 0.44, upsideReputation: 6, upsideClubTrust: 1, upsideSpecialization: 1 }),
      choice("protect-source", "Protect the source and access", ["Makes the pipeline harder to poach", "Slows club outreach while the rival remains active"], { fatigueDelta: 4, reputationDelta: 0, clubTrustDelta: 2, specializationDelta: 1, upsideProbability: 0.64, upsideReputation: 2, upsideClubTrust: 3, upsideSpecialization: 2 }),
      choice("ignore-race", "Keep the evidence plan", ["Preserves analytical discipline", "The rival can reach the decision-maker first"], { fatigueDelta: 1, reputationDelta: -1, clubTrustDelta: 0, specializationDelta: 2, upsideProbability: 0.72, upsideReputation: 2, upsideClubTrust: 1, upsideSpecialization: 3 }),
    ],
  },
  {
    id: "source-conflict",
    title: "Two Readings of the Same Player",
    centralQuestion: "Which source should determine the next observation?",
    premise: (name) => `Your live and second-hand evidence around ${name} emphasize different questions. Resolving the disagreement requires choosing what kind of evidence deserves the next block of attention.`,
    deadlineWeeks: 2,
    baseWeight: 1.15,
    eligible: (state, player) => hasMixedSources(state, player),
    options: [
      choice("trust-live", "Back the live sample", ["Preserves your own contextual judgment", "A small live sample may be unusually flattering or harsh"], { fatigueDelta: 2, reputationDelta: 1, clubTrustDelta: 0, specializationDelta: 1, upsideProbability: 0.55, upsideReputation: 3, upsideClubTrust: 1, upsideSpecialization: 2 }),
      choice("trust-network", "Back the network source", ["Uses longitudinal access you cannot reproduce quickly", "The source has their own incentives and blind spots"], { fatigueDelta: 1, reputationDelta: 0, clubTrustDelta: 2, specializationDelta: 0, upsideProbability: 0.52, upsideReputation: 2, upsideClubTrust: 3, upsideSpecialization: 1 }),
      choice("commission-test", "Commission a discriminating test", ["Targets the exact reason the sources disagree", "Costs time while both interpretations remain unresolved"], { fatigueDelta: 6, reputationDelta: -1, clubTrustDelta: 0, specializationDelta: 2, upsideProbability: 0.8, upsideReputation: 2, upsideClubTrust: 1, upsideSpecialization: 4 }),
    ],
  },
  {
    id: "tournament-window",
    title: "One Tournament, Many Eyes",
    centralQuestion: "Do you chase breadth, protect one target, or work the access layer?",
    premise: (name) => `${name} is relevant to a tournament currently in the football calendar. The same event can produce discovery volume, deep evidence or valuable introductions, but not all three.`,
    deadlineWeeks: 1,
    baseWeight: 1.2,
    eligible: (state, player) => hasLiveTournament(state, player),
    options: [
      choice("broad-scan", "Scan the full field", ["Maximizes discovery breadth", "Produces shallow evidence on the player already in your case"], { fatigueDelta: 5, reputationDelta: 0, clubTrustDelta: 0, specializationDelta: 2, upsideProbability: 0.58, upsideReputation: 1, upsideClubTrust: 0, upsideSpecialization: 4 }),
      choice("shadow-target", "Shadow the target deeply", ["Builds rare same-event contextual evidence", "Other emerging players may pass unnoticed"], { fatigueDelta: 6, reputationDelta: 0, clubTrustDelta: 1, specializationDelta: 2, upsideProbability: 0.72, upsideReputation: 2, upsideClubTrust: 1, upsideSpecialization: 3 }),
      choice("work-access", "Work the organizers and clubs", ["Creates future access beyond this event", "Sacrifices first-hand observation time now"], { fatigueDelta: 4, reputationDelta: 1, clubTrustDelta: 2, specializationDelta: 0, upsideProbability: 0.64, upsideReputation: 3, upsideClubTrust: 3, upsideSpecialization: 1 }),
    ],
  },
  {
    id: "welfare-pressure",
    title: "The Prospect Becomes a Story",
    centralQuestion: "How visible should a young prospect become before support catches up?",
    premise: (name) => `${name} is still young enough that added attention can change family, school and peer pressure before it improves the football pathway.`,
    deadlineWeeks: 2,
    baseWeight: 0.95,
    eligible: (_state, player) => player.age <= 17,
    options: [
      choice("shield-player", "Keep the case quiet", ["Protects welfare and reduces external pressure", "Clubs cannot act on a prospect they never hear about"], { fatigueDelta: 2, reputationDelta: -1, clubTrustDelta: 3, specializationDelta: 1, upsideProbability: 0.66, upsideReputation: 1, upsideClubTrust: 4, upsideSpecialization: 2 }),
      choice("controlled-exposure", "Arrange controlled exposure", ["Creates opportunity with boundaries", "Requires constant coordination and careful promises"], { fatigueDelta: 6, reputationDelta: 0, clubTrustDelta: 2, specializationDelta: 1, upsideProbability: 0.72, upsideReputation: 3, upsideClubTrust: 3, upsideSpecialization: 2 }),
      choice("build-profile", "Build public momentum", ["Can force faster club attention", "The player and family absorb the cost if hype outruns evidence"], { fatigueDelta: 3, reputationDelta: 2, clubTrustDelta: -3, specializationDelta: 0, upsideProbability: 0.4, upsideReputation: 6, upsideClubTrust: 0, upsideSpecialization: 1 }),
    ],
  },
  {
    id: "trial-deadline",
    title: "The Trial Slot",
    centralQuestion: "When is incomplete evidence strong enough to justify a scarce opportunity?",
    premise: (name) => `${name} is unattached and eligible for a trial-led pathway. You can push for a slot now, search for a better fit, or wait for stronger evidence.`,
    deadlineWeeks: 1,
    baseWeight: 1.05,
    eligible: (state, player) => isUnsigned(state, player),
    options: [
      choice("use-slot", "Push for the next available trial", ["Turns the case into a real opportunity immediately", "A poor fit can close doors as quickly as it opens them"], { fatigueDelta: 4, reputationDelta: 2, clubTrustDelta: -1, specializationDelta: 0, upsideProbability: 0.46, upsideReputation: 5, upsideClubTrust: 2, upsideSpecialization: 1 }),
      choice("fit-first", "Find the best development fit", ["Improves the chance the trial tests relevant qualities", "The next suitable slot may be weeks away"], { fatigueDelta: 5, reputationDelta: 0, clubTrustDelta: 2, specializationDelta: 1, upsideProbability: 0.68, upsideReputation: 2, upsideClubTrust: 3, upsideSpecialization: 2 }),
      choice("observe-again", "Wait for one more context", ["Reduces the risk of spending access on a weak case", "Waiting can eliminate the trial entirely"], { fatigueDelta: 2, reputationDelta: -1, clubTrustDelta: 0, specializationDelta: 2, upsideProbability: 0.77, upsideReputation: 1, upsideClubTrust: 1, upsideSpecialization: 3 }),
    ],
  },
  {
    id: "development-environment",
    title: "Talent Is Not the Whole Recommendation",
    centralQuestion: "Which environment gives the projection a chance to become real?",
    premise: (name) => `The evidence on ${name} is becoming clearer, but the next decision depends on coaching, minutes, patience and support as much as raw football quality.`,
    deadlineWeeks: 3,
    baseWeight: 1,
    eligible: (_state, player) => player.age <= 20,
    options: [
      choice("elite-environment", "Prioritize elite resources", ["Provides stronger coaching and facilities", "Competition for minutes can stall the pathway"], { fatigueDelta: 3, reputationDelta: 2, clubTrustDelta: -1, specializationDelta: 0, upsideProbability: 0.48, upsideReputation: 5, upsideClubTrust: 1, upsideSpecialization: 1 }),
      choice("minutes-pathway", "Prioritize a route to minutes", ["Turns development into repeated senior experience", "Lower resources may limit technical growth"], { fatigueDelta: 4, reputationDelta: 0, clubTrustDelta: 2, specializationDelta: 1, upsideProbability: 0.65, upsideReputation: 2, upsideClubTrust: 3, upsideSpecialization: 2 }),
      choice("support-fit", "Prioritize the complete support fit", ["Balances coaching, welfare, culture and opportunity", "Finding the right environment takes more scouting work"], { fatigueDelta: 7, reputationDelta: -1, clubTrustDelta: 2, specializationDelta: 2, upsideProbability: 0.78, upsideReputation: 2, upsideClubTrust: 3, upsideSpecialization: 3 }),
    ],
  },
];

export function validateYouthEvergreenCaseDefinitions(
  definitions: readonly YouthEvergreenCaseDefinition[] = YOUTH_EVERGREEN_CASE_DEFINITIONS,
): string[] {
  const errors: string[] = [];
  const definitionIds = new Set<string>();
  for (const definition of definitions) {
    if (definitionIds.has(definition.id)) errors.push(`Duplicate case family: ${definition.id}`);
    definitionIds.add(definition.id);
    if (definition.options.length < 3) errors.push(`${definition.id}: requires three options`);
    if (definition.deadlineWeeks < 1) errors.push(`${definition.id}: invalid deadline`);
    const optionIds = new Set<string>();
    const signatures = new Set<string>();
    for (const option of definition.options) {
      if (optionIds.has(option.id)) errors.push(`${definition.id}: duplicate option ${option.id}`);
      optionIds.add(option.id);
      if (option.knownTradeoffs.length < 2) errors.push(`${definition.id}/${option.id}: missing tradeoffs`);
      if (option.upsideProbability < 0 || option.upsideProbability > 1) {
        errors.push(`${definition.id}/${option.id}: invalid probability`);
      }
      const signature = [
        option.fatigueDelta,
        option.reputationDelta,
        option.clubTrustDelta,
        option.specializationDelta,
        option.upsideProbability,
        option.upsideReputation,
        option.upsideClubTrust,
        option.upsideSpecialization,
      ].join(":");
      if (signatures.has(signature)) errors.push(`${definition.id}/${option.id}: equivalent outcome`);
      signatures.add(signature);
    }
  }
  return errors;
}

function distinctPlayers(state: GameState): Player[] {
  const candidates = new Map<string, Player>();
  for (const youth of Object.values(state.unsignedYouth ?? {})) {
    if (youth.placed || youth.retired || !youth.discoveredBy.includes(state.scout.id)) continue;
    candidates.set(youth.player.id, youth.player);
  }
  for (const playerId of state.watchlist ?? []) {
    const player = state.players[playerId];
    if (player && player.age <= 20) candidates.set(player.id, player);
  }
  for (const report of Object.values(state.reports ?? {})) {
    const player = state.players[report.playerId]
      ?? Object.values(state.unsignedYouth ?? {})
        .find((candidate) => candidate.player.id === report.playerId)?.player;
    if (player && player.age <= 20) candidates.set(player.id, player);
  }
  return [...candidates.values()]
    .filter((player) => !Object.values(state.scoutingCases ?? {}).some((record) =>
      record.playerId === player.id && Boolean(record.professionalContext),
    ))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function latestYouthCaseDate(state: GameState): GameDate | undefined {
  const dates = [
    ...Object.values(state.consequenceState.decisions)
      .filter((decision) => decision.source.kind === "professionalCase")
      .map((decision) => decision.offeredAt),
    ...(state.consequenceState.history ?? [])
      .filter((record) => record.source.kind === "professionalCase")
      .map((record) => record.offeredAt),
  ];
  const now = { week: state.currentWeek, season: state.currentSeason };
  return dates.sort((left, right) =>
    gameWeeksBetween(state.fixtures, left, now)
    - gameWeeksBetween(state.fixtures, right, now),
  )[0];
}

/**
 * Escalate the first professional case through the opening season. The player
 * still gets four quiet onboarding weeks, but a viable Youth career cannot go
 * an entire first season without the multi-stakeholder judgment loop appearing.
 */
export function getYouthProfessionalCaseTriggerChance(state: GameState): number {
  if (latestYouthCaseDate(state)) return YOUTH_CASE_TRIGGER_CHANCE;
  if (state.currentSeason > 1) return YOUTH_CASE_TRIGGER_CHANCE;
  if (state.currentWeek >= YOUTH_CASE_SEASON_ONE_GUARANTEE_WEEK) return 1;
  if (state.currentWeek >= 9) return 0.24;
  if (state.currentWeek >= 5) return 0.12;
  return 0;
}

function stakeholderRefs(state: GameState, player: Player): EntityRef[] {
  const refs: EntityRef[] = [{ kind: "family", id: player.id }];
  const agent = Object.values(state.contacts)
    .filter((contact) => contact.type === "agent" && !contact.dormant)
    .sort((left, right) => right.relationship - left.relationship || left.id.localeCompare(right.id))[0];
  if (agent) refs.push({ kind: "contact", id: agent.id });
  const rival = Object.values(state.rivalScouts ?? {})
    .sort((left, right) => right.aggressiveness - left.aggressiveness || left.id.localeCompare(right.id))[0];
  if (rival) refs.push({ kind: "rival", id: rival.id });
  if (player.clubId && state.clubs[player.clubId]) refs.push({ kind: "club", id: player.clubId });
  return refs.slice(0, 3);
}

function metricEffect(
  decisionId: string,
  optionId: string,
  metric: "fatigue" | "reputation" | "clubTrust" | "specializationReputation",
  delta: number,
): ConsequenceEffect[] {
  if (delta === 0) return [];
  return [{
    id: `effect:${decisionId}:${optionId}:${metric}`,
    type: "adjustMetric",
    metricKey: `scout:${metric}`,
    delta,
    min: 0,
    max: 100,
  }];
}

function playerDisplayName(player: Player): string {
  return `${player.firstName ?? ""} ${player.lastName ?? ""}`.trim() || "The prospect";
}

function familyDisplayName(player: Player): string {
  const surname = player.lastName?.trim();
  if (surname) return `The ${surname} family`;
  const fallback = player.firstName?.trim() || "The player";
  return `${fallback}'s family`;
}

function stakeholderDisplayName(
  state: GameState,
  player: Player,
  stakeholder: EntityRef,
): string {
  switch (stakeholder.kind) {
    case "family":
      return familyDisplayName(player);
    case "contact":
      return state.contacts[stakeholder.id]?.name ?? "A contact in your network";
    case "rival":
      return state.rivalScouts?.[stakeholder.id]?.name ?? "A rival scout";
    case "club":
      return state.clubs[stakeholder.id]?.name ?? "The club";
    default:
      return stakeholder.id;
  }
}

function caseClubName(
  state: GameState,
  player: Player,
  stakeholders: readonly EntityRef[],
): string | undefined {
  const clubId = player.clubId || stakeholders.find((stakeholder) => stakeholder.kind === "club")?.id;
  return clubId ? state.clubs[clubId]?.name : undefined;
}

function selectCallbackActor(
  familyId: YouthEvergreenCaseFamilyId,
  outcome: "opening" | "setback",
  player: Player,
  stakeholders: readonly EntityRef[],
): EntityRef {
  const preferredKinds: readonly string[] = (() => {
    switch (familyId) {
      case "academy-release-late-developer":
        return outcome === "opening" ? ["club", "contact", "family"] : ["family", "contact", "club"];
      case "education-versus-relocation":
        return ["family", "contact", "club"];
      case "injury-recovery-evidence":
        return outcome === "opening" ? ["club", "contact", "family"] : ["club", "family", "contact"];
      case "dual-national-pathway":
        return outcome === "opening" ? ["contact", "family", "club"] : ["family", "contact", "club"];
      case "role-conversion":
        return ["club", "contact", "family"];
      case "agent-exclusivity":
        return ["contact", "family", "club"];
      case "rival-claim":
        return ["contact", "family", "club", "rival"];
      case "source-conflict":
        return ["contact", "family", "club"];
      case "tournament-window":
        return ["contact", "club", "family"];
      case "welfare-pressure":
        return ["family", "contact", "club"];
      case "trial-deadline":
        return ["club", "contact", "family"];
      case "development-environment":
        return outcome === "opening" ? ["club", "contact", "family"] : ["family", "club", "contact"];
    }
  })();
  for (const kind of preferredKinds) {
    const match = stakeholders.find((stakeholder) => stakeholder.kind === kind);
    if (match) return match;
  }
  return stakeholders[0] ?? { kind: "family", id: player.id };
}

interface CallbackPackage {
  detail: string;
  changeTag: "callback-access" | "callback-obligation";
  effects: ConsequenceEffect[];
  metadata: Record<string, string>;
}

function callbackMemoryEffect(input: {
  decisionId: string;
  optionId: string;
  outcome: "opening" | "setback";
  caseId: string;
  familyId: YouthEvergreenCaseFamilyId;
  playerId: string;
  actor: EntityRef;
  actorName: string;
  rememberedDecision: string;
  callbackAt: GameDate;
  scoutId: string;
}): ConsequenceEffect {
  const positive = input.outcome === "opening";
  return {
    id: `effect:${input.decisionId}:${input.optionId}:${input.outcome}:callback-memory`,
    type: "addMemory",
    memory: {
      id: `memory:${input.decisionId}:${input.optionId}:${input.outcome}:${input.actor.kind}:${input.actor.id}`,
      stakeholder: { ...input.actor },
      subject: { kind: "scout", id: input.scoutId },
      tags: [
        "professionalCase",
        input.familyId,
        input.optionId,
        `callback:${input.outcome}`,
      ],
      valence: positive ? 28 : -34,
      intensity: positive ? 70 : 78,
      salience: positive ? 74 : 82,
      visibility: "stakeholders",
      createdAt: { ...input.callbackAt },
      sourceDecisionId: input.decisionId,
      halfLifeWeeks: 104,
      metadata: {
        caseId: input.caseId,
        playerId: input.playerId,
        actorName: input.actorName,
        rememberedDecision: input.rememberedDecision,
      },
    },
  };
}

function callbackOpportunityEffect(input: {
  state: GameState;
  decisionId: string;
  optionId: string;
  outcome: "opening" | "setback";
  caseId: string;
  familyId: YouthEvergreenCaseFamilyId;
  player: Player;
  actor: EntityRef;
  actorName: string;
  clubName?: string;
  callbackAt: GameDate;
  label: string;
  expiresInWeeks: number;
}): ConsequenceEffect {
  const expiresAt = addGameWeeks(input.state.fixtures, input.callbackAt, input.expiresInWeeks);
  return {
    id: `effect:${input.decisionId}:${input.optionId}:${input.outcome}:callback-opportunity`,
    type: "createOpportunityLock",
    lock: {
      id: `opportunity:${input.decisionId}:${input.optionId}:${input.outcome}`,
      opportunityId: `professional-case:${input.caseId}:${input.familyId}:${input.outcome}`,
      exclusiveSetId: `professional-case:${input.caseId}:${input.familyId}`,
      owner: { kind: "scout", id: input.state.scout.id },
      status: "active",
      createdAt: { ...input.callbackAt },
      expiresAt,
      sourceDecisionId: input.decisionId,
      metadata: buildProfessionalCaseOpportunityLockMetadata({
        label: input.label,
        actorName: input.actorName,
        countryId: input.player.nationality,
        playerName: playerDisplayName(input.player),
        clubName: input.clubName ?? null,
        playerId: input.player.id,
        caseId: input.caseId,
        familyId: input.familyId,
      }),
    },
  };
}

function callbackObligationEffect(input: {
  state: GameState;
  decisionId: string;
  optionId: string;
  outcome: "opening" | "setback";
  caseId: string;
  familyId: YouthEvergreenCaseFamilyId;
  player: Player;
  actor: EntityRef;
  actorName: string;
  clubName?: string;
  callbackAt: GameDate;
  obligationKind: string;
  terms: string;
  dueInWeeks?: number;
}): ConsequenceEffect {
  return {
    id: `effect:${input.decisionId}:${input.optionId}:${input.outcome}:callback-obligation`,
    type: "createObligation",
    obligation: {
      id: `obligation:${input.decisionId}:${input.optionId}:${input.outcome}:${input.actor.kind}:${input.actor.id}`,
      debtor: { kind: "scout", id: input.state.scout.id },
      creditor: { ...input.actor },
      kind: input.obligationKind,
      terms: input.terms,
      status: "active",
      createdAt: { ...input.callbackAt },
      dueAt: input.dueInWeeks === undefined
        ? undefined
        : addGameWeeks(input.state.fixtures, input.callbackAt, input.dueInWeeks),
      sourceDecisionId: input.decisionId,
      metadata: {
        caseId: input.caseId,
        familyId: input.familyId,
        playerId: input.player.id,
        actorName: input.actorName,
        clubName: input.clubName ?? null,
      },
    },
  };
}

function buildCallbackPackage(input: {
  state: GameState;
  player: Player;
  definition: YouthEvergreenCaseDefinition;
  option: YouthCaseOptionDefinition;
  decisionId: string;
  caseId: string;
  stakeholders: readonly EntityRef[];
  callbackAt: GameDate;
  outcome: "opening" | "setback";
}): CallbackPackage {
  const playerName = playerDisplayName(input.player);
  const actor = selectCallbackActor(
    input.definition.id,
    input.outcome,
    input.player,
    input.stakeholders,
  );
  const actorName = stakeholderDisplayName(input.state, input.player, actor);
  const clubName = caseClubName(input.state, input.player, input.stakeholders);
  const clubContext = clubName ? ` at ${clubName}` : "";
  const rememberedDecision = `Remembered decision: "${input.option.label}".`;
  const baseMetadata = {
    actorId: actor.id,
    actorKind: actor.kind,
    actorName,
    playerName,
    clubName: clubName ?? "",
    rememberedDecision: input.option.label,
  };
  const memoryEffect = callbackMemoryEffect({
    decisionId: input.decisionId,
    optionId: input.option.id,
    outcome: input.outcome,
    caseId: input.caseId,
    familyId: input.definition.id,
    playerId: input.player.id,
    actor,
    actorName,
    rememberedDecision: input.option.label,
    callbackAt: input.callbackAt,
    scoutId: input.state.scout.id,
  });
  const makeOpportunity = (
    narrative: string,
    nextState: string,
    label: string,
    expiresInWeeks: number,
  ): CallbackPackage => ({
    detail: `${narrative}\n${rememberedDecision}\nNext state: ${nextState}`,
    changeTag: "callback-access",
    effects: [
      memoryEffect,
      callbackOpportunityEffect({
        state: input.state,
        decisionId: input.decisionId,
        optionId: input.option.id,
        outcome: input.outcome,
        caseId: input.caseId,
        familyId: input.definition.id,
        player: input.player,
        actor,
        actorName,
        clubName,
        callbackAt: input.callbackAt,
        label,
        expiresInWeeks,
      }),
    ],
    metadata: {
      ...baseMetadata,
      changeType: "access",
      stateChange: nextState,
    },
  });
  const makeObligation = (
    narrative: string,
    nextState: string,
    obligationKind: string,
    terms: string,
    dueInWeeks: number,
  ): CallbackPackage => ({
    detail: `${narrative}\n${rememberedDecision}\nNext state: ${nextState}`,
    changeTag: "callback-obligation",
    effects: [
      memoryEffect,
      callbackObligationEffect({
        state: input.state,
        decisionId: input.decisionId,
        optionId: input.option.id,
        outcome: input.outcome,
        caseId: input.caseId,
        familyId: input.definition.id,
        player: input.player,
        actor,
        actorName,
        clubName,
        callbackAt: input.callbackAt,
        obligationKind,
        terms,
        dueInWeeks,
      }),
    ],
    metadata: {
      ...baseMetadata,
      changeType: "obligation",
      stateChange: nextState,
    },
  });

  switch (input.definition.id) {
    case "academy-release-late-developer":
      return input.outcome === "opening"
        ? makeOpportunity(
            `${actorName} is prepared to judge ${playerName} one realistic rung down${clubContext} rather than wait for a perfect file.`,
            `a six-week realistic-level placement window is now live for ${playerName}`,
            "Realistic-level placement window",
            6,
          )
        : makeObligation(
            `${actorName} now treats the early exposure around ${playerName} as your call rather than natural momentum.`,
            `you now owe ${actorName} a rebuilt pathway brief before you circulate ${playerName} again`,
            "pathwayRebuild",
            `a rebuilt pathway brief before you circulate ${playerName} again`,
            5,
          );
    case "education-versus-relocation":
      return input.outcome === "opening"
        ? makeObligation(
            `${actorName} accepts a staged move because your plan tied football to schooling and support around ${playerName}.`,
            `you now owe ${actorName} a welfare check before the relocation becomes permanent`,
            "welfareUpdate",
            `a welfare check before the relocation around ${playerName} becomes permanent`,
            6,
          )
        : makeOpportunity(
            `${actorName} now treats the move around ${playerName} as destabilizing pressure instead of a timely opportunity.`,
            `only a four-week local-pathway review window remains before relocation talk closes`,
            "Local-pathway review window",
            4,
          );
    case "injury-recovery-evidence":
      return input.outcome === "opening"
        ? makeOpportunity(
            `${actorName} agrees to let you judge the recovery setting around ${playerName}${clubContext}, not just the injury report.`,
            `a five-week rehabilitation access window is open around ${playerName}`,
            "Rehabilitation access window",
            5,
          )
        : makeObligation(
            `${actorName} now links the recovery setback around ${playerName} to the conviction you showed without full match evidence.`,
            `you now owe ${actorName} a recovery-based reassessment before you advocate for ${playerName} again`,
            "reassessment",
            `a recovery-based reassessment before you advocate for ${playerName} again`,
            4,
          );
    case "dual-national-pathway":
      return input.outcome === "opening"
        ? makeOpportunity(
            `${actorName} opens a route in the stronger-fit football environment for ${playerName} because you backed that pathway early.`,
            `a six-week cross-border introduction window is live for ${playerName}`,
            "Cross-border introduction window",
            6,
          )
        : makeObligation(
            `${actorName} now wants an explanation for why you pushed the wrong football environment around ${playerName}.`,
            `you now owe ${actorName} a comparative pathway brief before the next move`,
            "comparativeBrief",
            `a comparative pathway brief before the next move for ${playerName}`,
            5,
          );
    case "role-conversion":
      return input.outcome === "opening"
        ? makeOpportunity(
            `${actorName} agrees to test ${playerName}${clubContext} in the alternative role instead of arguing about it from clips.`,
            `a four-week role-conversion access window is now open for ${playerName}`,
            "Role-conversion access window",
            4,
          )
        : makeObligation(
            `${actorName} now sees the conversion pitch around ${playerName} as projection rather than evidence.`,
            `you now owe ${actorName} a current-role report before another role-switch recommendation`,
            "currentRoleReport",
            `a current-role report before another role-switch recommendation for ${playerName}`,
            4,
          );
    case "agent-exclusivity":
      return input.outcome === "opening"
        ? makeObligation(
            `${actorName} keeps the privileged introduction around ${playerName} live because you respected the control they asked for.`,
            `you now owe ${actorName} confidentiality while the channel stays exclusive for six weeks`,
            "confidentiality",
            `confidential handling of the exclusive channel around ${playerName} for the next six weeks`,
            6,
          )
        : makeOpportunity(
            `${actorName} has shut the private channel after the case around ${playerName} slipped outside the agreed route.`,
            `only a four-week public-market salvage window remains for ${playerName}`,
            "Public-market salvage window",
            4,
          );
    case "rival-claim":
      return input.outcome === "opening"
        ? makeOpportunity(
            `${actorName} keeps feeding you the case around ${playerName} because you protected the lane instead of panicking.`,
            `a four-week protected-source window is open before the rival normalizes the file`,
            "Protected-source window",
            4,
          )
        : makeObligation(
            `${actorName} now believes the rival turned your hesitation around ${playerName} into their leverage.`,
            `you now owe ${actorName} a cleaner protection plan before they reopen this player`,
            "sourceProtection",
            `a cleaner protection plan before they reopen ${playerName}`,
            4,
          );
    case "source-conflict":
      return input.outcome === "opening"
        ? makeOpportunity(
            `${actorName} agrees to one discriminating test around ${playerName} because you named the exact point of disagreement.`,
            `a five-week evidence-test window is open to break the tie around ${playerName}`,
            "Evidence-test window",
            5,
          )
        : makeObligation(
            `${actorName} now treats your call around ${playerName} as backing the other read against them.`,
            `you now owe ${actorName} a side-by-side review before they trust the file again`,
            "sideBySideReview",
            `a side-by-side review before they trust the ${playerName} file again`,
            4,
          );
    case "tournament-window":
      return input.outcome === "opening"
        ? makeOpportunity(
            `${actorName} opens the right people around ${playerName} because you used the tournament week for access, not noise.`,
            `a three-week tournament follow-up window is live while the event memory is fresh`,
            "Tournament follow-up window",
            3,
          )
        : makeObligation(
            `${actorName} now sees the tournament week around ${playerName} as a missed chance to build the room.`,
            `you now owe ${actorName} a cleaned follow-up packet before the next event opens`,
            "followUpPacket",
            `a cleaned follow-up packet on ${playerName} before the next event opens`,
            3,
          );
    case "welfare-pressure":
      return input.outcome === "opening"
        ? makeObligation(
            `${actorName} accepts limited exposure around ${playerName} because you kept the support needs ahead of the hype.`,
            `you now owe ${actorName} regular welfare updates while the case stays live`,
            "welfareUpdate",
            `regular welfare updates while the case around ${playerName} stays live`,
            6,
          )
        : makeObligation(
            `${actorName} now treats outside attention around ${playerName} as a cost you created.`,
            `you now owe ${actorName} a quieter handling plan before any new exposure`,
            "quietHandlingPlan",
            `a quieter handling plan before any new exposure around ${playerName}`,
            5,
          );
    case "trial-deadline":
      return input.outcome === "opening"
        ? makeOpportunity(
            `${actorName} keeps a scarce trial slot open for ${playerName}${clubContext} because your timing looked credible.`,
            `a four-week trial window is now open for ${playerName}`,
            "Trial window",
            4,
          )
        : makeObligation(
            `${actorName} now reads the missed fit around ${playerName} as a burned ask, not neutral waiting.`,
            `you now owe ${actorName} a tighter shortlist before you request another slot`,
            "trialShortlist",
            `a tighter shortlist before you request another trial slot for ${playerName}`,
            4,
          );
    case "development-environment":
      return input.outcome === "opening"
        ? makeOpportunity(
            `${actorName} wants to continue around ${playerName}${clubContext} because you argued for the environment, not just the talent.`,
            `a six-week support-fit channel is open with the destination environment`,
            "Support-fit channel",
            6,
          )
        : makeObligation(
            `${actorName} now sees the support questions around ${playerName} as unresolved enough to block the raw-talent pitch.`,
            `you now owe ${actorName} a full environment brief before the recommendation can move again`,
            "environmentBrief",
            `a full environment brief before the recommendation on ${playerName} can move again`,
            5,
          );
  }
}

function materializeOption(input: {
  state: GameState;
  player: Player;
  definition: YouthEvergreenCaseDefinition;
  option: YouthCaseOptionDefinition;
  decisionId: string;
  caseId: string;
  stakeholders: EntityRef[];
  now: GameDate;
  outcomeRoll: number;
}): DecisionOption {
  const { option, decisionId, caseId, player, stakeholders, now, outcomeRoll } = input;
  const memoryValence = Math.max(-80, Math.min(80,
    option.clubTrustDelta * 10 + option.reputationDelta * 4,
  ));
  const immediateEffects: ConsequenceEffect[] = [
    {
      id: `effect:${decisionId}:${option.id}:approach-fact`,
      type: "recordFact",
      fact: {
        id: `fact:${caseId}:approach`,
        kind: "professionalCaseApproach",
        subject: { kind: "player", id: player.id },
        value: option.id,
        observedAt: { ...now },
        visibility: "stakeholders",
        sourceDecisionId: decisionId,
        metadata: {
          caseId,
          familyId: input.definition.id,
        },
      },
    },
    ...metricEffect(decisionId, option.id, "fatigue", option.fatigueDelta),
    ...metricEffect(decisionId, option.id, "reputation", option.reputationDelta),
    ...metricEffect(decisionId, option.id, "clubTrust", option.clubTrustDelta),
    ...metricEffect(decisionId, option.id, "specializationReputation", option.specializationDelta),
    ...stakeholders.map((stakeholder, index): ConsequenceEffect => ({
      id: `effect:${decisionId}:${option.id}:memory:${index}`,
      type: "addMemory",
      memory: {
        id: `memory:${decisionId}:${option.id}:${stakeholder.kind}:${stakeholder.id}`,
        stakeholder: { ...stakeholder },
        subject: { kind: "scout", id: input.state.scout.id },
        tags: ["professionalCase", input.definition.id, option.id],
        valence: memoryValence,
        intensity: 58 + Math.min(30, Math.abs(memoryValence) / 3),
        salience: 68,
        visibility: "stakeholders",
        createdAt: { ...now },
        sourceDecisionId: decisionId,
        halfLifeWeeks: 152,
        metadata: { caseId, playerId: player.id },
      },
    })),
  ];
  const callbackAt = addGameWeeks(input.state.fixtures, now, 4);
  const openingPackage = buildCallbackPackage({
    ...input,
    callbackAt,
    outcome: "opening",
  });
  const openingEffects: ConsequenceEffect[] = [
    {
      id: `effect:${decisionId}:${option.id}:opening-fact`,
      type: "recordFact",
      fact: {
        id: `fact:${caseId}:callback:${option.id}:opening`,
        kind: "professionalCaseCallback",
        subject: { kind: "player", id: player.id },
        value: "opening",
        observedAt: callbackAt,
        visibility: "stakeholders",
        sourceDecisionId: decisionId,
        metadata: {
          caseId,
          familyId: input.definition.id,
          optionId: option.id,
          outcome: "opening",
          detail: openingPackage.detail,
          ...openingPackage.metadata,
        },
      },
    },
    ...metricEffect(decisionId, `${option.id}:callback`, "reputation", option.upsideReputation),
    ...metricEffect(decisionId, `${option.id}:callback`, "clubTrust", option.upsideClubTrust),
    ...metricEffect(decisionId, `${option.id}:callback`, "specializationReputation", option.upsideSpecialization),
    ...openingPackage.effects,
  ];
  const setbackPackage = buildCallbackPackage({
    ...input,
    callbackAt,
    outcome: "setback",
  });
  const setbackEffects: ConsequenceEffect[] = [
    {
      id: `effect:${decisionId}:${option.id}:setback-fact`,
      type: "recordFact",
      fact: {
        id: `fact:${caseId}:callback:${option.id}:setback`,
        kind: "professionalCaseCallback",
        subject: { kind: "player", id: player.id },
        value: "setback",
        observedAt: callbackAt,
        visibility: "stakeholders",
        sourceDecisionId: decisionId,
        metadata: {
          caseId,
          familyId: input.definition.id,
          optionId: option.id,
          outcome: "setback",
          detail: setbackPackage.detail,
          ...setbackPackage.metadata,
        },
      },
    },
    ...metricEffect(
      decisionId,
      `${option.id}:setback`,
      "reputation",
      -Math.max(1, Math.ceil(option.upsideReputation / 2)),
    ),
    ...metricEffect(
      decisionId,
      `${option.id}:setback`,
      "clubTrust",
      -Math.max(1, Math.ceil(option.upsideClubTrust / 2)),
    ),
    ...metricEffect(
      decisionId,
      `${option.id}:setback`,
      "specializationReputation",
      option.specializationDelta > 0 ? -1 : 0,
    ),
    ...setbackPackage.effects,
  ];
  const inverseRoll = Math.max(
    0,
    Math.min(1 - Number.EPSILON, 1 - outcomeRoll),
  );
  return {
    id: option.id,
    label: option.label,
    knownTradeoffs: [...option.knownTradeoffs],
    immediateEffects,
    scheduledConsequences: [
      {
        id: `callback:${option.id}:opening`,
        dueAt: callbackAt,
        effects: openingEffects,
        probability: option.upsideProbability,
        outcomeRoll,
        tags: [
          "professional-case",
          input.definition.id,
          option.id,
          "opening",
          openingPackage.changeTag,
        ],
      },
      {
        id: `callback:${option.id}:setback`,
        dueAt: callbackAt,
        effects: setbackEffects,
        probability: 1 - option.upsideProbability,
        outcomeRoll: inverseRoll,
        tags: [
          "professional-case",
          input.definition.id,
          option.id,
          "setback",
          setbackPackage.changeTag,
        ],
      },
    ],
  };
}

export type YouthCaseBlockedReason =
  | "wrong-mode"
  | "opening"
  | "choice-cap"
  | "unresolved-case"
  | "cooldown"
  | "trigger-missed"
  | "no-prospect"
  | "no-case-family"
  | "registration-failed";

export interface YouthCaseDirectionResult {
  state: GameState;
  offeredDecisionId?: string;
  caseId?: string;
  blockedReason?: YouthCaseBlockedReason;
}

/** Seeded, bounded generator for recurring Youth cases after the opening hook. */
export function directWeeklyYouthProfessionalCase(input: {
  state: GameState;
  triggerChance?: number;
  forceTrigger?: boolean;
}): YouthCaseDirectionResult {
  const state = input.state;
  if (getRunGameModeId(state.runManifest) !== "youth-scout") {
    return { state, blockedReason: "wrong-mode" };
  }
  if (state.currentSeason === 1 && state.currentWeek < 5) {
    return { state, blockedReason: "opening" };
  }
  const openDecisions = Object.values(state.consequenceState.decisions)
    .filter((decision) => decision.status === "offered");
  if (openDecisions.length >= MAX_OPEN_PLAYER_DECISIONS) {
    return { state, blockedReason: "choice-cap" };
  }
  if (openDecisions.some((decision) => decision.source.kind === "professionalCase")) {
    return { state, blockedReason: "unresolved-case" };
  }
  const now = { week: state.currentWeek, season: state.currentSeason };
  const previous = latestYouthCaseDate(state);
  if (
    previous
    && gameWeeksBetween(state.fixtures, previous, now) < YOUTH_CASE_COOLDOWN_WEEKS
  ) return { state, blockedReason: "cooldown" };

  const chance = Math.max(0, Math.min(
    1,
    input.triggerChance ?? getYouthProfessionalCaseTriggerChance(state),
  ));
  const triggerRng = createNamedRNG(
    state.runManifest.rootSeed,
    "weekly-youth-professional-case-trigger",
    state.currentSeason,
    state.currentWeek,
  );
  if (!input.forceTrigger && !triggerRng.chance(chance)) {
    return { state, blockedReason: "trigger-missed" };
  }

  const players = distinctPlayers(state);
  if (players.length === 0) return { state, blockedReason: "no-prospect" };
  const candidates = players.flatMap((player) =>
    YOUTH_EVERGREEN_CASE_DEFINITIONS
      .filter((definition) => definition.eligible(state, player))
      .map((definition) => ({ player, definition })),
  );
  if (candidates.length === 0) return { state, blockedReason: "no-case-family" };
  const selectionRng = createNamedRNG(
    state.runManifest.rootSeed,
    "weekly-youth-professional-case-selection",
    state.currentSeason,
    state.currentWeek,
    candidates.map(({ player, definition }) => `${player.id}:${definition.id}`).join("|"),
  );
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.definition.baseWeight, 0);
  let threshold = selectionRng.next() * totalWeight;
  let selected = candidates[candidates.length - 1];
  for (const candidate of candidates) {
    threshold -= candidate.definition.baseWeight;
    if (threshold <= 0) {
      selected = candidate;
      break;
    }
  }
  if (!selected) return { state, blockedReason: "no-case-family" };

  const { player, definition } = selected;
  const caseId = `case_${state.scout.id}_${player.id}`;
  const decisionId = [
    "professional-case",
    `s${state.currentSeason}w${state.currentWeek}`,
    definition.id,
    player.id,
  ].join(":");
  const stakeholders = stakeholderRefs(state, player);
  const outcomeRoll = createNamedRNG(
    state.runManifest.rootSeed,
    "weekly-youth-professional-case-outcome",
    decisionId,
  ).next();
  const options = definition.options.map((option) => materializeOption({
    state,
    player,
    definition,
    option,
    decisionId,
    caseId,
    stakeholders,
    now,
    outcomeRoll,
  }));
  const decision: DecisionRecord = {
    id: decisionId,
    source: { kind: "professionalCase", id: caseId },
    offeredAt: { ...now },
    deadlineAt: addGameWeeks(state.fixtures, now, definition.deadlineWeeks),
    status: "offered",
    visibility: "stakeholders",
    stakeholders,
    options,
    defaultOptionId: options[1]?.id ?? options[0].id,
    outcomeRoll,
    consequenceIds: [],
    opportunitySetId: `opportunity-set:${caseId}:approach`,
    metadata: {
      title: definition.title,
      premise: definition.premise(`${player.firstName} ${player.lastName}`),
      centralQuestion: definition.centralQuestion,
      caseId,
      familyId: definition.id,
      playerId: player.id,
      relatedPlayerId: player.id,
      semanticSignature: `professional-case:${definition.id}`,
    },
  };
  const registered = registerDecision(state.consequenceState, decision);
  if (registered.error) return { state, blockedReason: "registration-failed" };

  const opened = openProfessionalScoutingCase({
    scoutingCases: state.scoutingCases ?? {},
    scoutId: state.scout.id,
    playerId: player.id,
    week: state.currentWeek,
    season: state.currentSeason,
    context: {
      modeId: "youth-scout",
      familyId: definition.id,
      title: definition.title,
      premise: definition.premise(`${player.firstName} ${player.lastName}`),
      centralQuestion: definition.centralQuestion,
      stakeholderRefs: stakeholders.map((stakeholder) => `${stakeholder.kind}:${stakeholder.id}`),
      judgmentDecisionIds: [decisionId],
    },
  });
  const message: InboxMessage = {
    id: `inbox:${decisionId}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "assignment",
    title: definition.title,
    body: `${definition.premise(`${player.firstName} ${player.lastName}`)} ${definition.centralQuestion}`,
    read: false,
    actionRequired: true,
    relatedId: decisionId,
  };
  return {
    state: {
      ...state,
      consequenceState: registered.state,
      scoutingCases: opened.scoutingCases,
      inbox: [...state.inbox, message],
    },
    offeredDecisionId: decisionId,
    caseId: opened.scoutingCase.id,
  };
}

/** Read the chosen approach without exposing scheduled random outcomes. */
export function getProfessionalCaseApproach(
  state: GameState,
  scoutingCase: ScoutingCase,
): string | undefined {
  const decisionId = scoutingCase.professionalContext?.judgmentDecisionIds.at(-1);
  const decision = decisionId ? state.consequenceState.decisions[decisionId] : undefined;
  if (decision?.selectedOptionId) return decision.selectedOptionId;
  const recordedApproach = state.consequenceState.facts[
    `fact:${scoutingCase.id}:approach`
  ]?.value;
  return typeof recordedApproach === "string" ? recordedApproach : undefined;
}
