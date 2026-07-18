import type {
  Club,
  Fixture,
  GameState,
  LoanDeal,
  ManagerProfile,
  Player,
  PlayerMatchRating,
  Position,
} from "@/engine/core/types";
import { isFixtureInSeason } from "@/engine/world/fixtures";
import {
  getWorldConditionDefinition,
  getWorldConditionModifiers,
  type WorldConditionModifiers,
} from "@/engine/world/worldConditions";
import { normalizeCountryKey } from "@/lib/country";
import { deriveClubRecruitmentDoctrine } from "@/engine/world/recruitmentIdentity";

export type DevelopmentEnvironmentBand =
  | "excellent"
  | "supportive"
  | "mixed"
  | "restricted"
  | "adverse";

export type DevelopmentFactorImpact =
  | "strong-positive"
  | "positive"
  | "neutral"
  | "negative"
  | "strong-negative";

export type DevelopmentEnvironmentFactorId =
  | "academy"
  | "club-philosophy"
  | "playing-pathway"
  | "manager-context"
  | "competitive-level"
  | "form-and-morale"
  | "health"
  | "loan-plan"
  | "world-context";

/**
 * A player-facing explanation built only from observable world facts. It is
 * safe to render directly: no CA/PA, raw attributes, hidden personality,
 * random rolls, or exact development probabilities are included.
 */
export interface DevelopmentEnvironmentFactor {
  id: DevelopmentEnvironmentFactorId;
  label: string;
  impact: DevelopmentFactorImpact;
  summary: string;
}

export interface PlayerDevelopmentEnvironmentProjection {
  clubId?: string;
  clubName: string;
  score: number;
  band: DevelopmentEnvironmentBand;
  headline: string;
  summary: string;
  factors: DevelopmentEnvironmentFactor[];
  reviewPrompt: string;
}

/** Compact, bounded public record of why an observable career turn occurred. */
export interface PlayerDevelopmentHistoryEntry {
  id: string;
  season: number;
  week: number;
  clubId?: string;
  event: "routine-growth" | "breakthrough" | "decline" | "injury-setback";
  outcome: "improved" | "declined" | "setback";
  environmentBand: DevelopmentEnvironmentBand;
  summary: string;
}

export interface DevelopmentEnvironmentMechanics {
  /** Multiplies the weekly opportunity for positive development. */
  growthChanceMultiplier: number;
  /** Multiplies positive attribute-growth checks after an opportunity occurs. */
  growthQualityMultiplier: number;
  /** Multiplies age-driven decline checks. Strong support can soften, not erase, decline. */
  declineRiskMultiplier: number;
  /** Multiplies the rare breakthrough opportunity. */
  breakthroughMultiplier: number;
  /** Visible-fact fit weight for AI loan and pathway decisions. */
  decisionWeight: number;
}

export interface PlayerDevelopmentEnvironmentEvaluation {
  projection: PlayerDevelopmentEnvironmentProjection;
  mechanics: DevelopmentEnvironmentMechanics;
}

type DevelopmentEnvironmentState = Pick<
  GameState,
  | "currentSeason"
  | "currentWeek"
  | "clubs"
  | "leagues"
  | "players"
  | "fixtures"
  | "managerProfiles"
  | "matchRatings"
  | "activeLoans"
  | "worldConditionState"
> & Partial<Pick<GameState, "seed">>;

interface EvaluationOptions {
  /** Evaluate a proposed destination before the player has joined it. */
  prospectiveClubId?: string;
  /** Reuse the immutable lookup index built for the current weekly tick. */
  index?: DevelopmentEnvironmentIndex;
}

/**
 * Immutable lookup data shared by every development evaluation in one weekly
 * tick. Without this index, each contracted player scans the complete fixture
 * collection and active-loan list independently.
 */
export interface DevelopmentEnvironmentIndex {
  currentSeason: number;
  currentWeek: number;
  playedFixtureCountByClub: ReadonlyMap<string, number>;
  appearanceCountByClubAndPlayer: ReadonlyMap<string, ReadonlyMap<string, number>>;
  academyPlayerIdsByClub: ReadonlyMap<string, ReadonlySet<string>>;
  fitPositionCountByClub: ReadonlyMap<string, ReadonlyMap<Position, number>>;
  fitPlayerOccurrencesByClub: ReadonlyMap<string, ReadonlyMap<string, number>>;
  activeLoanByPlayerAndClub: ReadonlyMap<string, LoanDeal>;
  recruitmentDoctrineByClub: ReadonlyMap<
    string,
    ReturnType<typeof deriveClubRecruitmentDoctrine>
  >;
  worldContextByCountry: Map<string, CachedWorldConditionContext>;
}

interface FactorDraft extends DevelopmentEnvironmentFactor {
  points: number;
}

interface CachedWorldConditionContext {
  factor: FactorDraft | null;
  modifiers: WorldConditionModifiers;
}

export const PLAYER_DEVELOPMENT_HISTORY_LIMIT = 8;

function playerClubKey(playerId: string, clubId: string): string {
  return `${playerId}\u0000${clubId}`;
}

const BAND_LABELS: Record<DevelopmentEnvironmentBand, string> = {
  excellent: "Excellent environment",
  supportive: "Supportive environment",
  mixed: "Mixed environment",
  restricted: "Restricted pathway",
  adverse: "Adverse environment",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, places = 2): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function impactFor(points: number): DevelopmentFactorImpact {
  if (points >= 9) return "strong-positive";
  if (points >= 3) return "positive";
  if (points <= -9) return "strong-negative";
  if (points <= -3) return "negative";
  return "neutral";
}

function bandFor(score: number): DevelopmentEnvironmentBand {
  if (score >= 78) return "excellent";
  if (score >= 62) return "supportive";
  if (score >= 45) return "mixed";
  if (score >= 30) return "restricted";
  return "adverse";
}

function makeFactor(
  id: DevelopmentEnvironmentFactorId,
  label: string,
  points: number,
  summary: string,
): FactorDraft {
  return { id, label, points, impact: impactFor(points), summary };
}

export function createDevelopmentEnvironmentIndex(
  state: DevelopmentEnvironmentState,
): DevelopmentEnvironmentIndex {
  const playedFixtureCountByClub = new Map<string, number>();
  const appearanceCountByClubAndPlayer = new Map<string, Map<string, number>>();
  for (const fixture of Object.values(state.fixtures)) {
    if (!fixture.played || !isFixtureInSeason(fixture, state.currentSeason)) continue;
    // A malformed self-fixture must still appear only once, matching the
    // previous Object.values(...).filter(...) behavior.
    const fixtureClubIds = fixture.homeClubId === fixture.awayClubId
      ? [fixture.homeClubId]
      : [fixture.homeClubId, fixture.awayClubId];
    for (const clubId of fixtureClubIds) {
      playedFixtureCountByClub.set(
        clubId,
        (playedFixtureCountByClub.get(clubId) ?? 0) + 1,
      );
    }
    for (const [playerId, rating] of Object.entries(state.matchRatings[fixture.id] ?? {})) {
      if (rating.started !== true && (rating.minutesPlayed ?? 0) <= 0) continue;
      // The legacy query asked whether a rating existed in a fixture belonging
      // to the evaluated club. Attribute it to both fixture clubs to preserve
      // that exact behavior across mid-season transfers and malformed saves.
      for (const clubId of fixtureClubIds) {
        let appearances = appearanceCountByClubAndPlayer.get(clubId);
        if (!appearances) {
          appearances = new Map<string, number>();
          appearanceCountByClubAndPlayer.set(clubId, appearances);
        }
        appearances.set(playerId, (appearances.get(playerId) ?? 0) + 1);
      }
    }
  }

  const academyPlayerIdsByClub = new Map<string, ReadonlySet<string>>();
  const fitPositionCountByClub = new Map<string, ReadonlyMap<Position, number>>();
  const fitPlayerOccurrencesByClub = new Map<string, ReadonlyMap<string, number>>();
  for (const club of Object.values(state.clubs)) {
    academyPlayerIdsByClub.set(club.id, new Set(club.academyPlayerIds ?? []));
    const positionCounts = new Map<Position, number>();
    const playerOccurrences = new Map<string, number>();
    for (const playerId of club.playerIds) {
      const squadPlayer = state.players[playerId];
      if (!squadPlayer || squadPlayer.injured) continue;
      playerOccurrences.set(playerId, (playerOccurrences.get(playerId) ?? 0) + 1);
      const coveredPositions = new Set<Position>([
        squadPlayer.position,
        ...(squadPlayer.secondaryPositions ?? []),
      ]);
      for (const position of coveredPositions) {
        positionCounts.set(position, (positionCounts.get(position) ?? 0) + 1);
      }
    }
    fitPositionCountByClub.set(club.id, positionCounts);
    fitPlayerOccurrencesByClub.set(club.id, playerOccurrences);
  }

  const activeLoanByPlayerAndClub = new Map<string, LoanDeal>();
  for (const deal of state.activeLoans ?? []) {
    // Array.find previously selected the first matching active deal. Preserve
    // that behavior even if a malformed legacy state contains duplicates.
    const key = playerClubKey(deal.playerId, deal.loanClubId);
    if (deal.status === "active" && !activeLoanByPlayerAndClub.has(key)) {
      activeLoanByPlayerAndClub.set(key, deal);
    }
  }

  const recruitmentDoctrineByClub = new Map<
    string,
    ReturnType<typeof deriveClubRecruitmentDoctrine>
  >();
  for (const club of Object.values(state.clubs)) {
    recruitmentDoctrineByClub.set(club.id, deriveClubRecruitmentDoctrine({
      club,
      seed: state.seed ?? `development:${club.id}`,
      season: state.currentSeason,
      manager: state.managerProfiles[club.id],
    }));
  }

  return {
    currentSeason: state.currentSeason,
    currentWeek: state.currentWeek,
    playedFixtureCountByClub,
    appearanceCountByClubAndPlayer,
    academyPlayerIdsByClub,
    fitPositionCountByClub,
    fitPlayerOccurrencesByClub,
    activeLoanByPlayerAndClub,
    recruitmentDoctrineByClub,
    worldContextByCountry: new Map<string, CachedWorldConditionContext>(),
  };
}

function currentDevelopmentIndex(
  state: DevelopmentEnvironmentState,
  index: DevelopmentEnvironmentIndex | undefined,
): DevelopmentEnvironmentIndex | undefined {
  return index?.currentSeason === state.currentSeason
    && index.currentWeek === state.currentWeek
    ? index
    : undefined;
}

function playedFixturesForClub(
  fixtures: Record<string, Fixture>,
  clubId: string,
  season: number,
): readonly Fixture[] {
  return Object.values(fixtures).filter(
    (fixture) =>
      fixture.played === true
      && isFixtureInSeason(fixture, season)
      && (fixture.homeClubId === clubId || fixture.awayClubId === clubId),
  );
}

function explicitAppearance(
  matchRatings: Record<string, Record<string, PlayerMatchRating>>,
  fixtureId: string,
  playerId: string,
): boolean {
  const rating = matchRatings[fixtureId]?.[playerId];
  return rating?.started === true || (rating?.minutesPlayed ?? 0) > 0;
}

function countPositionCompetition(
  club: Club,
  player: Player,
  players: Record<string, Player>,
  index?: DevelopmentEnvironmentIndex,
): number {
  if (index) {
    const total = index.fitPositionCountByClub.get(club.id)?.get(player.position) ?? 0;
    const indexedPlayer = players[player.id];
    const coversPosition = indexedPlayer?.position === player.position
      || indexedPlayer?.secondaryPositions?.includes(player.position) === true;
    const ownOccurrences = indexedPlayer && !indexedPlayer.injured && coversPosition
      ? index.fitPlayerOccurrencesByClub.get(club.id)?.get(player.id) ?? 0
      : 0;
    return total - ownOccurrences;
  }
  return club.playerIds.reduce((count, playerId) => {
    if (playerId === player.id) return count;
    const squadPlayer = players[playerId];
    if (!squadPlayer || squadPlayer.injured) return count;
    const coversPosition = squadPlayer.position === player.position
      || squadPlayer.secondaryPositions?.includes(player.position);
    return count + (coversPosition ? 1 : 0);
  }, 0);
}

const FORMATION_POSITION_CACHE_LIMIT = 64;
const FORMATION_POSITION_CACHE = new Map<string, ReadonlySet<Position>>();

function formationPositions(formation: string): ReadonlySet<Position> {
  const cached = FORMATION_POSITION_CACHE.get(formation);
  if (cached) return cached;

  const parts = formation.split("-").map(Number);
  const positions = new Set<Position>(["GK", "CB", "CM", "ST"]);
  if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
    const defenders = parts[0];
    const forwards = parts[parts.length - 1];
    const midfieldLine = parts.slice(1, -1);
    if (defenders >= 4 || defenders === 3 || defenders === 5) {
      positions.add("LB");
      positions.add("RB");
    }
    if (midfieldLine.some((line) => line <= 2) || formation.includes("-1-")) {
      positions.add("CDM");
    }
    if (parts.length >= 4 || midfieldLine.some((line) => line >= 3)) {
      positions.add("CAM");
    }
    if (forwards >= 3 || formation === "4-5-1" || formation === "3-4-3") {
      positions.add("LW");
      positions.add("RW");
    }
  }

  // Manager formations repeat for thousands of weekly player evaluations.
  // Keep the pure parse bounded so custom/modded formations cannot grow an
  // unbounded process-global cache.
  if (FORMATION_POSITION_CACHE.size < FORMATION_POSITION_CACHE_LIMIT) {
    FORMATION_POSITION_CACHE.set(formation, positions);
  }
  return positions;
}

function academyFactor(player: Player, club: Club | undefined): FactorDraft {
  if (!club) {
    return makeFactor(
      "academy",
      "Coaching infrastructure",
      -10,
      "No formal club coaching or academy programme is supporting the player right now.",
    );
  }

  const ageWeight = player.age <= 21 ? 1 : player.age <= 24 ? 0.65 : 0.3;
  const points = Math.round((club.youthAcademyRating - 10) * 1.45 * ageWeight);
  const quality = club.youthAcademyRating >= 16
    ? "elite"
    : club.youthAcademyRating >= 12
      ? "strong"
      : club.youthAcademyRating >= 8
        ? "serviceable"
        : "limited";
  return makeFactor(
    "academy",
    "Coaching infrastructure",
    points,
    `${club.name}'s ${club.youthAcademyRating}/20 academy provides ${quality} support for this career stage.`,
  );
}

function philosophyFactor(
  state: DevelopmentEnvironmentState,
  player: Player,
  club: Club | undefined,
  manager: ManagerProfile | undefined,
  index?: DevelopmentEnvironmentIndex,
): FactorDraft {
  if (!club) {
    return makeFactor(
      "club-philosophy",
      "Club philosophy",
      -5,
      "Without a club, there is no committed development philosophy or internal pathway.",
    );
  }

  const doctrine = index?.recruitmentDoctrineByClub.get(club.id)
    ?? deriveClubRecruitmentDoctrine({
      club,
      seed: state.seed ?? `development:${club.id}`,
      season: state.currentSeason,
      manager,
    });
  const developing = player.age <= doctrine.preferredSeniorAgeRange[1];
  const patienceContribution = developing
    ? Math.round((doctrine.pathwayPatience - 50) * 0.32)
    : Math.round((doctrine.pathwayPatience - 50) * 0.1);
  const points = clamp(patienceContribution, -14, 14);
  return makeFactor(
    "club-philosophy",
    "Recruitment doctrine",
    points,
    `${club.name}'s ${doctrine.pathwayPatience >= 70 ? "patient" : doctrine.pathwayPatience <= 35 ? "immediate-results" : "balanced"} pathway (${doctrine.pathwayPatience}/100) ${points >= 0 ? "supports" : "restricts"} this career stage; the club currently prioritises ${doctrine.seasonalObjective.replace(/([A-Z])/g, " $1").toLowerCase()}.`,
  );
}

function playingPathwayFactor(
  state: DevelopmentEnvironmentState,
  player: Player,
  club: Club | undefined,
  prospective: boolean,
  index?: DevelopmentEnvironmentIndex,
): FactorDraft {
  if (!club) {
    return makeFactor(
      "playing-pathway",
      "Playing pathway",
      -12,
      "There is no senior squad or formal match pathway available at present.",
    );
  }

  const activeLoan = prospective
    ? undefined
    : index
      ? index.activeLoanByPlayerAndClub.get(playerClubKey(player.id, club.id))
      : state.activeLoans?.find(
        (deal) => deal.playerId === player.id && deal.status === "active" && deal.loanClubId === club.id,
      );
  const activeClubLoan = activeLoan;
  if (activeClubLoan?.performanceRecord) {
    const elapsedWeeks = Math.max(
      1,
      state.currentSeason === activeClubLoan.startSeason
        ? state.currentWeek - activeClubLoan.startWeek + 1
        : state.currentWeek,
    );
    const appearanceRate = activeClubLoan.performanceRecord.appearances / elapsedWeeks;
    const points = appearanceRate >= 0.65 ? 15 : appearanceRate >= 0.4 ? 6 : appearanceRate < 0.2 ? -15 : -5;
    return makeFactor(
      "playing-pathway",
      "Playing pathway",
      points,
      `${activeClubLoan.performanceRecord.appearances} loan appearances in ${elapsedWeeks} weeks make the promised ${activeClubLoan.agreedPlayingTime ?? "rotation"} role ${points > 0 ? "credible" : "uncertain"}.`,
    );
  }

  const isAcademyPlayer = index
    ? index.academyPlayerIdsByClub.get(club.id)?.has(player.id) === true
    : club.academyPlayerIds?.includes(player.id) === true;
  if (isAcademyPlayer && player.age < 18) {
    const competition = countPositionCompetition(club, player, state.players, index);
    const points = competition <= 2 ? 8 : competition >= 5 ? -5 : 3;
    return makeFactor(
      "playing-pathway",
      "Playing pathway",
      points,
      `The player is in the academy pathway with ${competition} fit senior options currently ahead in the same position.`,
    );
  }

  const clubFixtures = index
    ? undefined
    : playedFixturesForClub(state.fixtures, club.id, state.currentSeason);
  const playedFixtureCount = index
    ? index.playedFixtureCountByClub.get(club.id) ?? 0
    : clubFixtures?.length ?? 0;
  const appearances = index
    ? index.appearanceCountByClubAndPlayer.get(club.id)?.get(player.id) ?? 0
    : clubFixtures?.filter((fixture) =>
        explicitAppearance(state.matchRatings, fixture.id, player.id)
      ).length ?? 0;
  if (!prospective && playedFixtureCount >= 3) {
    const appearanceRate = appearances / playedFixtureCount;
    const points = appearanceRate >= 0.7 ? 15 : appearanceRate >= 0.4 ? 6 : appearanceRate < 0.2 ? -16 : -6;
    return makeFactor(
      "playing-pathway",
      "Playing pathway",
      points,
      `${appearances} appearances from ${playedFixtureCount} played club fixtures show ${points > 0 ? "a live first-team pathway" : "limited access to competitive minutes"}.`,
    );
  }

  const competition = countPositionCompetition(club, player, state.players, index);
  const points = competition <= 1 ? 12 : competition === 2 ? 4 : competition >= 5 ? -15 : -7;
  return makeFactor(
    "playing-pathway",
    "Playing pathway",
    points,
    prospective
      ? `${competition} fit senior options cover this position; that indicates ${points > 0 ? "a plausible route to minutes" : "meaningful squad congestion"}.`
      : `With limited recent match evidence, ${competition} fit senior options in the position indicate ${points > 0 ? "a plausible opening" : "squad congestion"}.`,
  );
}

function managerFactor(player: Player, manager: ManagerProfile | undefined): FactorDraft {
  if (!manager) {
    return makeFactor(
      "manager-context",
      "Manager context",
      0,
      "No stable manager profile is available, so the tactical pathway is uncertain.",
    );
  }

  const required = formationPositions(manager.preferredFormation);
  const primaryFit = required.has(player.position);
  const secondaryFit = player.secondaryPositions?.some((position) => required.has(position)) === true;
  const points = primaryFit ? 7 : secondaryFit ? 3 : -7;
  return makeFactor(
    "manager-context",
    "Manager context",
    points,
    primaryFit
      ? `${manager.managerName}'s ${manager.preferredFormation} gives the player's primary position a clear tactical route.`
      : secondaryFit
        ? `${manager.managerName}'s ${manager.preferredFormation} offers a route through a known secondary position.`
        : `${manager.managerName}'s ${manager.preferredFormation} has no obvious role for the player's listed positions.`,
  );
}

function competitionFactor(player: Player, club: Club | undefined, tier?: number): FactorDraft {
  if (!club) {
    return makeFactor(
      "competitive-level",
      "Competitive level",
      -4,
      "The player is outside a regular professional competition environment.",
    );
  }

  let points = club.reputation >= 75 ? 4 : club.reputation <= 30 ? -3 : 1;
  if (player.age <= 20 && tier === 1 && club.reputation >= 75) points -= 6;
  if (player.age <= 22 && tier !== undefined && tier >= 2) points += 4;
  return makeFactor(
    "competitive-level",
    "Competitive level",
    points,
    player.age <= 22 && tier !== undefined && tier >= 2
      ? `${club.name}'s level offers a more reachable senior proving ground without removing professional pressure.`
      : club.reputation >= 75
        ? `${club.name}'s elite standards improve daily demands, but young players must earn scarce first-team opportunities.`
        : `${club.name}'s competitive level provides a credible professional development setting.`,
  );
}

function formFactor(player: Player): FactorDraft {
  const trend = player.formTrend ?? "stable";
  const momentum = player.formMomentum ?? 0;
  const moraleContribution = player.morale >= 8 ? 3 : player.morale <= 3 ? -4 : 0;
  const formContribution = player.form >= 2
    ? 7
    : player.form >= 1
      ? 4
      : player.form <= -2
        ? -8
        : player.form <= -1
          ? -4
          : 0;
  const momentumContribution = trend === "rising" && momentum >= 3
    ? 3
    : trend === "falling" && momentum >= 3
      ? -3
      : 0;
  const points = formContribution + momentumContribution + moraleContribution;
  return makeFactor(
    "form-and-morale",
    "Form and morale",
    points,
    points >= 5
      ? "Visible form, momentum, and morale are reinforcing training confidence and match learning."
      : points <= -5
        ? "Poor visible form or morale is making it harder to convert training into sustained progress."
        : "Form and morale are stable enough that neither is currently driving the trajectory.",
  );
}

function healthFactor(player: Player): FactorDraft {
  if (player.injured && player.injuryWeeksRemaining > 6) {
    return makeFactor(
      "health",
      "Availability",
      -20,
      `A long-term injury with ${player.injuryWeeksRemaining} weeks remaining has paused normal development work.`,
    );
  }
  if (player.injured) {
    return makeFactor(
      "health",
      "Availability",
      -10,
      `An active injury with ${player.injuryWeeksRemaining} weeks remaining is disrupting training continuity.`,
    );
  }

  const visibleInjuries = player.injuryHistory?.injuries ?? [];
  const recentSerious = visibleInjuries
    .slice(-3)
    .filter((injury) => injury.recoveryWeeks >= 5).length;
  const points = recentSerious >= 2 ? -7 : recentSerious === 1 ? -3 : 2;
  return makeFactor(
    "health",
    "Availability",
    points,
    recentSerious >= 2
      ? "The visible recent injury record has repeatedly interrupted training blocks."
      : recentSerious === 1
        ? "A recent serious absence remains relevant when judging development continuity."
        : "The visible record shows no recent serious interruption to training continuity.",
  );
}

function loanPlanFactor(
  state: DevelopmentEnvironmentState,
  player: Player,
  club: Club | undefined,
  prospective: boolean,
  index?: DevelopmentEnvironmentIndex,
): FactorDraft | null {
  if (prospective || !club) return null;
  const loan = index
    ? index.activeLoanByPlayerAndClub.get(playerClubKey(player.id, club.id))
    : state.activeLoans?.find(
        (deal) => deal.playerId === player.id && deal.status === "active" && deal.loanClubId === club.id,
      );
  if (!loan) return null;

  const role = loan.agreedPlayingTime ?? "rotation";
  const points = role === "key" ? 10 : role === "regular" ? 7 : role === "rotation" ? 1 : -6;
  return makeFactor(
    "loan-plan",
    "Loan plan",
    points,
    `The loan agreement names a ${role} role; actual appearances determine whether that promise is being kept.`,
  );
}

function createWorldConditionContext(
  state: DevelopmentEnvironmentState,
  country: string | undefined,
): CachedWorldConditionContext {
  const modifiers = getWorldConditionModifiers(state, country);
  if (!country) return { factor: null, modifiers };
  const countryId = normalizeCountryKey(country)
    ?? country.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const points = Math.round(
    (modifiers.developmentMultiplier - 1) * 55
    + (modifiers.breakthroughMultiplier - 1) * 20,
  );
  if (points === 0) return { factor: null, modifiers };
  const names = (state.worldConditionState?.active ?? [])
    .filter((condition) =>
      condition.scope === "global" || condition.countryId === countryId
    )
    .filter((condition) =>
      condition.modifiers.developmentMultiplier !== 1
      || condition.modifiers.breakthroughMultiplier !== 1
    )
    .flatMap((condition) => {
      const definition = getWorldConditionDefinition(condition.definitionId);
      return definition ? [definition.name] : [];
    });
  return {
    factor: names.length === 0
      ? null
      : makeFactor(
          "world-context",
          "Seasonal football context",
          points,
          points > 0
            ? `${names.join(" and ")} are improving coaching continuity and breakthrough conditions this season.`
            : `${names.join(" and ")} are disrupting coaching continuity and breakthrough conditions this season.`,
        ),
    modifiers,
  };
}

function worldConditionContext(
  state: DevelopmentEnvironmentState,
  country: string | undefined,
  index?: DevelopmentEnvironmentIndex,
): CachedWorldConditionContext {
  if (!index) return createWorldConditionContext(state, country);
  const cacheKey = country ?? "";
  const cached = index.worldContextByCountry.get(cacheKey);
  if (cached) return cached;
  const created = createWorldConditionContext(state, country);
  index.worldContextByCountry.set(cacheKey, created);
  return created;
}

function strongestFactors(factors: readonly FactorDraft[]): {
  strongestPositive?: FactorDraft;
  strongestRisk?: FactorDraft;
} {
  let strongestPositive: FactorDraft | undefined;
  let strongestRisk: FactorDraft | undefined;
  const isStronger = (candidate: FactorDraft, current: FactorDraft | undefined) =>
    !current
    || Math.abs(candidate.points) > Math.abs(current.points)
    || (
      Math.abs(candidate.points) === Math.abs(current.points)
      && candidate.id.localeCompare(current.id) < 0
    );
  for (const factor of factors) {
    if (factor.points > 0 && isStronger(factor, strongestPositive)) {
      strongestPositive = factor;
    } else if (factor.points < 0 && isStronger(factor, strongestRisk)) {
      strongestRisk = factor;
    }
  }
  return { strongestPositive, strongestRisk };
}

/**
 * Evaluate a player's current or proposed development setting. All public
 * explanations are based on facts already visible elsewhere in the game.
 */
export function evaluatePlayerDevelopmentEnvironment(
  state: DevelopmentEnvironmentState,
  player: Player,
  options: EvaluationOptions = {},
): PlayerDevelopmentEnvironmentEvaluation {
  const clubId = options.prospectiveClubId ?? player.clubId;
  const club = clubId ? state.clubs[clubId] : undefined;
  const manager = club ? state.managerProfiles[club.id] : undefined;
  const league = club ? state.leagues[club.leagueId] : undefined;
  const prospective = options.prospectiveClubId !== undefined;
  const index = currentDevelopmentIndex(state, options.index);
  const factors: FactorDraft[] = [
    academyFactor(player, club),
    philosophyFactor(state, player, club, manager, index),
    playingPathwayFactor(state, player, club, prospective, index),
    managerFactor(player, manager),
    competitionFactor(player, club, league?.tier),
    formFactor(player),
    healthFactor(player),
  ];
  const loanPlan = loanPlanFactor(state, player, club, prospective, index);
  if (loanPlan) factors.push(loanPlan);
  const worldCountry = league?.country ?? player.nationality;
  const worldContext = worldConditionContext(state, worldCountry, index);
  const seasonalFactor = worldContext.factor;
  if (seasonalFactor) factors.push(seasonalFactor);
  const worldModifiers = worldContext.modifiers;

  const structuralScore = clamp(
    50 + factors.reduce(
      (total, factor) => total + (factor.id === "world-context" ? 0 : factor.points),
      0,
    ),
    0,
    100,
  );
  const score = clamp(
    structuralScore
      + (seasonalFactor?.points ?? 0),
    0,
    100,
  );
  const band = bandFor(score);
  const { strongestPositive, strongestRisk } = strongestFactors(factors);
  const clubName = club?.name ?? "Unattached football";
  const headline = BAND_LABELS[band];
  const structuralSummary = strongestRisk
    ? `${strongestPositive?.summary ?? "There is some support in place"} The main constraint is clear: ${strongestRisk.summary}`
    : `${strongestPositive?.summary ?? "The setting is stable."} No major visible pathway constraint stands out right now.`;
  const summary = seasonalFactor && !structuralSummary.includes(seasonalFactor.summary)
    ? `${structuralSummary} ${seasonalFactor.summary}`
    : structuralSummary;
  const reviewPrompt = strongestRisk?.id === "playing-pathway"
    ? "Review after the next run of fixtures or consider a less congested pathway."
    : strongestRisk?.id === "health"
      ? "Review after medical clearance and a sustained training block."
      : "Review when the manager, club, loan role, or run of appearances changes.";

  return {
    projection: {
      ...(club ? { clubId: club.id } : {}),
      clubName,
      score,
      band,
      headline,
      summary,
      factors: factors.map(({ points: _points, ...factor }) => factor),
      reviewPrompt,
    },
    mechanics: {
      growthChanceMultiplier: round(
        (0.72 + (structuralScore / 100) * 0.62)
          * worldModifiers.developmentMultiplier,
      ),
      growthQualityMultiplier: round(
        (0.88 + (structuralScore / 100) * 0.26)
          * worldModifiers.developmentMultiplier,
      ),
      declineRiskMultiplier: round(1.13 - (structuralScore / 100) * 0.26),
      breakthroughMultiplier: round(
        (0.65 + (structuralScore / 100) * 0.7)
          * worldModifiers.breakthroughMultiplier,
      ),
      decisionWeight: round(0.65 + (score / 100) * 0.8),
    },
  };
}

export function projectPlayerDevelopmentEnvironment(
  state: DevelopmentEnvironmentState,
  player: Player,
  options: EvaluationOptions = {},
): PlayerDevelopmentEnvironmentProjection {
  return evaluatePlayerDevelopmentEnvironment(state, player, options).projection;
}

export function projectProspectiveDevelopmentEnvironment(
  state: DevelopmentEnvironmentState,
  player: Player,
  clubId: string,
): PlayerDevelopmentEnvironmentProjection {
  return projectPlayerDevelopmentEnvironment(state, player, { prospectiveClubId: clubId });
}

export function getDevelopmentEnvironmentBandLabel(
  band: DevelopmentEnvironmentBand,
): string {
  return BAND_LABELS[band];
}

export function createPlayerDevelopmentHistoryEntry(
  playerId: string,
  season: number,
  week: number,
  event: PlayerDevelopmentHistoryEntry["event"],
  projection: PlayerDevelopmentEnvironmentProjection,
): PlayerDevelopmentHistoryEntry {
  const outcome = event === "routine-growth" || event === "breakthrough"
    ? "improved"
    : event === "injury-setback"
      ? "setback"
      : "declined";
  const eventSummary = event === "breakthrough"
    ? `A visible development breakthrough arrived in a ${projection.headline.toLowerCase()}.`
    : event === "routine-growth"
      ? `Steady progress was recorded while the player was in a ${projection.headline.toLowerCase()}.`
      : event === "injury-setback"
        ? "A serious injury created a visible physical-development setback."
        : `Age and current context produced a period of decline in a ${projection.headline.toLowerCase()}.`;
  return {
    id: `development_${season}_${week}_${playerId}_${event}`,
    season,
    week,
    ...(projection.clubId ? { clubId: projection.clubId } : {}),
    event,
    outcome,
    environmentBand: projection.band,
    summary: eventSummary,
  };
}

/**
 * Canonicalize the persisted timeline without changing anything rendered in
 * the dossier. Early versions copied up to three full factor explanations into
 * every turn for every world player, even though those snapshots were never
 * read by gameplay or UI. The current environment already owns that detailed
 * explanation; the timeline only needs the visible turn and its context.
 */
export function compactPlayerDevelopmentHistory(
  current: readonly PlayerDevelopmentHistoryEntry[] | undefined,
): PlayerDevelopmentHistoryEntry[] {
  const canonicalById = new Map<string, PlayerDevelopmentHistoryEntry>();
  for (const entry of current ?? []) {
    const canonical: PlayerDevelopmentHistoryEntry = {
      id: entry.id,
      season: entry.season,
      week: entry.week,
      ...(entry.clubId ? { clubId: entry.clubId } : {}),
      event: entry.event,
      outcome: entry.outcome,
      environmentBand: entry.environmentBand,
      summary: entry.summary,
    };
    // A retry of the same deterministic event replaces the prior copy and
    // takes its actual chronological position.
    canonicalById.delete(canonical.id);
    canonicalById.set(canonical.id, canonical);
  }
  return [...canonicalById.values()].slice(-PLAYER_DEVELOPMENT_HISTORY_LIMIT);
}

export function appendPlayerDevelopmentHistory(
  current: readonly PlayerDevelopmentHistoryEntry[] | undefined,
  entry: PlayerDevelopmentHistoryEntry,
): PlayerDevelopmentHistoryEntry[] {
  return compactPlayerDevelopmentHistory([...(current ?? []), entry]);
}
