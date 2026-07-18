import type { Club, GameState, Player } from "@/engine/core/types";
import { getCurrentSeasonAppearances } from "./appearanceLedger";

export type RetirementIntentStatus = "settled" | "considering" | "ready";
export type RetirementTrendDirection = "rising" | "stable" | "falling";

export type RetirementPlanningWorldContext =
  Pick<GameState, "players" | "clubs" | "currentSeason">
  & Partial<Pick<GameState, "currentWeek" | "fixtures" | "matchRatings">>;

export interface RetirementIntentAssessment {
  probability: number;
  status: RetirementIntentStatus;
  likelyToRetire: boolean;
  reasons: string[];
  components: {
    agePressure: number;
    abilityTrendPressure: number;
    playingTimePressure: number;
    contractPressure: number;
    injuryPressure: number;
  };
  trend: {
    direction: RetirementTrendDirection;
    score: number;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function contractOwner(player: Player): string | undefined {
  return player.contractClubId ?? player.loanParentClubId ?? player.clubId;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function assessAbilityTrend(player: Player): {
  direction: RetirementTrendDirection;
  score: number;
  reasons: string[];
} {
  let score = 6;
  let direction: RetirementTrendDirection = "stable";
  const reasons: string[] = [];

  if (player.formTrend === "falling") {
    score += 24;
    direction = "falling";
    reasons.push("Recent form is trending downward.");
  } else if (player.formTrend === "rising") {
    score -= 6;
    direction = "rising";
  }

  const recentRatings = (player.recentMatchRatings ?? []).map((entry) => entry.rating);
  if (recentRatings.length >= 4) {
    const midpoint = Math.floor(recentRatings.length / 2);
    const delta = average(recentRatings.slice(midpoint)) - average(recentRatings.slice(0, midpoint));
    if (delta <= -0.45) {
      score += 18;
      direction = "falling";
      reasons.push("The rolling match-rating average has dipped sharply.");
    } else if (delta >= 0.35) {
      score -= 5;
      if (direction !== "falling") direction = "rising";
    }
  }

  const seasonRatings = player.seasonRatings ?? [];
  if (seasonRatings.length >= 2) {
    const latest = seasonRatings[seasonRatings.length - 1];
    const prior = seasonRatings[seasonRatings.length - 2];
    if (latest.appearances >= 8 && prior.appearances >= 8) {
      const delta = latest.avgRating - prior.avgRating;
      if (delta <= -0.3) {
        score += 16;
        direction = "falling";
        reasons.push("Last season's average level dropped against the prior year.");
      } else if (delta >= 0.25) {
        score -= 4;
        if (direction !== "falling") direction = "rising";
      }
    }
  }

  return {
    direction,
    score: clamp(Math.round(score), 0, 100),
    reasons,
  };
}

function agePressure(age: number): number {
  if (age <= 31) return 4;
  if (age === 32) return 14;
  if (age === 33) return 24;
  if (age === 34) return 36;
  if (age === 35) return 50;
  if (age === 36) return 66;
  if (age === 37) return 80;
  return 96;
}

function playingTimePressure(
  player: Player,
  club: Club | undefined,
  state: RetirementPlanningWorldContext,
): number {
  const fallbackAppearances = player.seasonRatings?.[player.seasonRatings.length - 1]?.appearances ?? 0;
  const appearances = club ? getCurrentSeasonAppearances(player, club.id, state) : fallbackAppearances;
  const elapsedWeeks = Math.max(1, state.currentWeek ?? 0);
  const expectedStarts = Math.max(1, Math.floor(elapsedWeeks / 2));
  const share = appearances / expectedStarts;

  let score = clamp((0.55 - Math.min(1, share)) * 100, 0, 55);
  if (player.age >= 33 && appearances <= 4) score += 14;
  if (player.age >= 35 && appearances === 0) score += 18;
  return clamp(Math.round(score), 0, 92);
}

function contractPressure(player: Player, currentSeason: number, club: Club | undefined): number {
  if (!club) return 55;
  const yearsRemaining = player.contractExpiry - currentSeason;
  const base = yearsRemaining <= 0 ? 48
    : yearsRemaining === 1 ? 28
      : yearsRemaining === 2 ? 12
        : 2;
  return clamp(base + (player.age >= 34 && yearsRemaining <= 1 ? 12 : 0), 0, 80);
}

function injuryPressure(player: Player): number {
  const currentInjuryPressure = player.injured
    ? player.injuryWeeksRemaining >= 24 ? 44
      : player.injuryWeeksRemaining >= 12 ? 28
        : 14
    : 0;
  const history = player.injuryHistory;
  if (!history) return currentInjuryPressure;

  let score = currentInjuryPressure;
  if (history.totalWeeksMissed >= 40) score += 22;
  else if (history.totalWeeksMissed >= 20) score += 12;
  if (history.injuries.length >= 4) score += 12;
  else if (history.injuries.length >= 2) score += 6;
  if (history.reinjuryWindowWeeksLeft >= 4) score += 8;
  return clamp(score, 0, 90);
}

export function assessRetirementIntent(
  player: Player,
  state: RetirementPlanningWorldContext,
): RetirementIntentAssessment {
  const ownerClubId = contractOwner(player);
  const club = ownerClubId ? state.clubs[ownerClubId] : undefined;
  const trend = assessAbilityTrend(player);
  const ageComponent = agePressure(player.age);
  const playingTimeComponent = playingTimePressure(player, club, state);
  const contractComponent = contractPressure(player, state.currentSeason, club);
  const injuryComponent = injuryPressure(player);

  let probability = 0.04;
  probability += ageComponent / 140;
  probability += trend.score / 240;
  probability += playingTimeComponent / 260;
  probability += contractComponent / 320;
  probability += injuryComponent / 320;

  if (!club) probability += 0.08;
  if (player.age >= 38) probability = Math.max(probability, 0.74);
  if (player.age >= 36 && (injuryComponent >= 35 || trend.score >= 35)) {
    probability = Math.max(probability, 0.58);
  }

  probability = clamp(probability, 0.03, 0.97);
  const status: RetirementIntentStatus = probability >= 0.7
    ? "ready"
    : probability >= 0.45
      ? "considering"
      : "settled";

  const reasons = [
    ...(ageComponent >= 50 ? ["Career stage now puts retirement squarely on the table."] : []),
    ...trend.reasons,
    ...(playingTimeComponent >= 36 ? ["Playing time has fallen below a convincing late-career role."] : []),
    ...(contractComponent >= 28 ? ["The contract situation offers little medium-term security."] : []),
    ...(injuryComponent >= 28 ? ["Injuries and recovery load are materially shaping the decision."] : []),
  ];

  return {
    probability,
    status,
    likelyToRetire: probability >= 0.6,
    reasons: reasons.length > 0
      ? reasons
      : ["The player still has enough role clarity and physical runway to continue."],
    components: {
      agePressure: ageComponent,
      abilityTrendPressure: trend.score,
      playingTimePressure: playingTimeComponent,
      contractPressure: contractComponent,
      injuryPressure: injuryComponent,
    },
    trend,
  };
}
