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

export const YOUTH_CASE_TRIGGER_CHANCE = 0.08;
export const YOUTH_CASE_COOLDOWN_WEEKS = 7;
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
          detail: option.knownTradeoffs[0],
        },
      },
    },
    ...metricEffect(decisionId, `${option.id}:callback`, "reputation", option.upsideReputation),
    ...metricEffect(decisionId, `${option.id}:callback`, "clubTrust", option.upsideClubTrust),
    ...metricEffect(decisionId, `${option.id}:callback`, "specializationReputation", option.upsideSpecialization),
  ];
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
          detail: option.knownTradeoffs[1],
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
        tags: ["professional-case", input.definition.id, option.id, "opening"],
      },
      {
        id: `callback:${option.id}:setback`,
        dueAt: callbackAt,
        effects: setbackEffects,
        probability: 1 - option.upsideProbability,
        outcomeRoll: inverseRoll,
        tags: ["professional-case", input.definition.id, option.id, "setback"],
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

  const chance = Math.max(0, Math.min(1, input.triggerChance ?? YOUTH_CASE_TRIGGER_CHANCE));
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
