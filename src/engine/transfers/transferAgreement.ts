import type {
  Club,
  GameState,
  League,
  LoanDeal,
  Player,
  TransferAddOn,
} from "@/engine/core/types";
import {
  assessClubAffordability,
  buildTransferAddOnObligations,
  getTransferContingentReserve,
  type ClubAffordabilityResult,
} from "@/engine/finance/clubEconomics";
import { formationPositions, parseFormation } from "@/engine/firstTeam/systemFit";
import {
  calculateTransferMotivation,
  type TransferMotivation,
} from "@/engine/world/transferMotivation";
import { getTransferFlowProbability } from "@/engine/world/transfers";
import { normalizeCountryKey } from "@/lib/country";

export type TransferAgreementRole = NonNullable<LoanDeal["agreedPlayingTime"]>;
export type TransferRegistrationStatus = "clear" | "conditional" | "blocked";

export type TransferAgreementWorldContext =
  Pick<GameState, "players" | "clubs" | "leagues" | "currentSeason">
  & Partial<Pick<GameState, "currentWeek" | "managerProfiles" | "fixtures" | "matchRatings">>;

export interface ProposedTransferTerms {
  fee: number;
  wage: number;
  contractLength: number;
  role: TransferAgreementRole;
  signingBonus: number;
  addOns: TransferAddOn[];
}

export interface TransferClubAffordabilityAssessment {
  result: ClubAffordabilityResult;
  signingBonus: number;
  releasedWeeklyCommitment: number;
  addOnReserve: number;
  addOns: TransferAddOn[];
  reasons: string[];
}

export interface TransferRegistrationAssessment {
  status: TransferRegistrationStatus;
  eligible: boolean;
  requiresClearance: boolean;
  score: number;
  crossBorder: boolean;
  routeProbability: number;
  originCountry?: string;
  destinationCountry?: string;
  reasons: string[];
}

export interface TransferPlayerWillingnessAssessment {
  probability: number;
  score: number;
  willingToJoin: boolean;
  reasons: string[];
  role: TransferAgreementRole;
  motivationScore: number;
}

export interface ProposeTransferAgreementInput {
  player: Player;
  buyingClub: Club;
  state: TransferAgreementWorldContext;
  sellingClub?: Club;
  releasedPlayerId?: string;
  motivation?: TransferMotivation;
}

export interface TransferAgreementProposal extends ProposedTransferTerms {
  affordability: TransferClubAffordabilityAssessment;
  registration: TransferRegistrationAssessment;
  willingness: TransferPlayerWillingnessAssessment;
  viable: boolean;
  reasons: string[];
}

interface CountryResolution {
  originCountry?: string;
  destinationCountry?: string;
  crossBorder: boolean;
  routeProbability: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampProbability(value: number): number {
  return clamp(value, 0.03, 0.97);
}

function contractOwner(player: Player): string | undefined {
  return player.contractClubId ?? player.loanParentClubId ?? player.clubId;
}

function roundTransferValue(value: number): number {
  const safe = Math.max(0, Math.round(value));
  if (safe >= 10_000_000) return Math.round(safe / 250_000) * 250_000;
  if (safe >= 2_000_000) return Math.round(safe / 100_000) * 100_000;
  if (safe >= 500_000) return Math.round(safe / 25_000) * 25_000;
  return Math.round(safe / 5_000) * 5_000;
}

function roundWeeklyWage(value: number): number {
  return Math.max(100, Math.round(Math.max(0, value) / 100) * 100);
}

function positionCoverage(
  player: Player,
  clubId: string,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
): number {
  const club = clubs[clubId];
  if (!club) return 0;
  return club.playerIds.reduce((coverage, playerId) => {
    if (playerId === player.id) return coverage;
    const teammate = players[playerId];
    if (!teammate) return coverage;
    if (teammate.position === player.position) return coverage + 1;
    if (teammate.secondaryPositions?.includes(player.position)) return coverage + 0.35;
    return coverage;
  }, 0);
}

function tacticalPositions(formation: string | undefined): ReadonlySet<Player["position"]> {
  if (!formation) return new Set<Player["position"]>();
  const parsed = parseFormation(formation);
  return parsed
    ? formationPositions(parsed.defenders, parsed.midfielders, parsed.forwards)
    : new Set<Player["position"]>();
}

function downgradeRole(role: TransferAgreementRole): TransferAgreementRole {
  switch (role) {
    case "key": return "regular";
    case "regular": return "rotation";
    case "rotation": return "prospect";
    default: return "prospect";
  }
}

function roleWeight(role: TransferAgreementRole): number {
  switch (role) {
    case "key": return 1.15;
    case "regular": return 1.04;
    case "rotation": return 0.95;
    case "prospect": return 0.87;
  }
}

function resolveClubCountry(club: Club | undefined, leagues: Record<string, League>): string | undefined {
  if (!club) return undefined;
  return normalizeCountryKey(leagues[club.leagueId]?.country);
}

function resolveCountries(
  player: Player,
  buyingClub: Club,
  leagues: Record<string, League>,
  sellingClub?: Club,
): CountryResolution {
  const originCountry =
    resolveClubCountry(sellingClub, leagues)
    ?? normalizeCountryKey(player.nationality);
  const destinationCountry =
    resolveClubCountry(buyingClub, leagues)
    ?? originCountry;
  const crossBorder = Boolean(
    originCountry
    && destinationCountry
    && originCountry !== destinationCountry,
  );
  return {
    originCountry,
    destinationCountry,
    crossBorder,
    routeProbability:
      crossBorder && originCountry && destinationCountry
        ? getTransferFlowProbability(originCountry, destinationCountry)
        : 0.3,
  };
}

function routeLabel(routeProbability: number): string {
  if (routeProbability >= 0.15) return "well-trodden";
  if (routeProbability >= 0.08) return "credible";
  if (routeProbability >= 0.04) return "less familiar";
  return "rare";
}

function releasedWeeklyCommitment(
  club: Club,
  players: Record<string, Player>,
  playerId: string | undefined,
): number {
  if (!playerId) return 0;
  const player = players[playerId];
  if (!player || contractOwner(player) !== club.id) return 0;
  return Math.max(0, Math.round(player.wage ?? 0));
}

export function proposeTransferRole(
  player: Player,
  buyingClub: Club,
  state: TransferAgreementWorldContext,
): TransferAgreementRole {
  const manager = state.managerProfiles?.[buyingClub.id];
  const required = tacticalPositions(manager?.preferredFormation);
  const primaryFit = required.size === 0 || required.has(player.position);
  const secondaryFit = (player.secondaryPositions ?? []).some((position) => required.has(position));
  const coverage = positionCoverage(player, buyingClub.id, state.players, state.clubs);
  const playerLevel = player.currentAbility / 2;

  let role: TransferAgreementRole;
  if (coverage === 0) {
    role = playerLevel >= buyingClub.reputation + 8 ? "key" : "regular";
  } else if (coverage <= 1.35) {
    role = playerLevel >= buyingClub.reputation + 12 ? "key" : "regular";
  } else if (coverage <= 2.35) {
    role = player.age <= 21 && player.potentialAbility >= player.currentAbility + 14
      ? "prospect"
      : "rotation";
  } else {
    role = player.age <= 21 ? "prospect" : "rotation";
  }

  if (!primaryFit && !secondaryFit) {
    role = downgradeRole(role);
  } else if (!primaryFit && secondaryFit && role === "key") {
    role = "regular";
  }

  if (player.age >= 33 && role === "prospect") {
    return "rotation";
  }
  return role;
}

export function proposeTransferTerms(
  input: ProposeTransferAgreementInput,
): ProposedTransferTerms {
  const { player, buyingClub, state } = input;
  const sellingClub = input.sellingClub ?? state.clubs[contractOwner(player) ?? ""];
  const role = proposeTransferRole(player, buyingClub, state);
  const currentSeason = state.currentSeason;
  const contractYearsRemaining = Math.max(0, player.contractExpiry - currentSeason);
  const motivation = input.motivation ?? calculateTransferMotivation(player, state);

  const contractLength = player.age <= 20 ? 5
    : player.age <= 24 ? 4
      : player.age <= 29 ? (role === "key" ? 4 : 3)
        : player.age <= 32 ? (role === "key" ? 3 : 2)
          : player.age <= 35 ? 2
            : 1;

  const ageFactor = player.age <= 21 ? 1.16
    : player.age <= 24 ? 1.08
      : player.age >= 33 ? 0.62
        : player.age >= 30 ? 0.8
          : 1;
  const contractFactor = contractYearsRemaining <= 0 ? 0.28
    : contractYearsRemaining === 1 ? 0.62
      : contractYearsRemaining === 2 ? 0.88
        : 1.04;
  const prestigeFactor = sellingClub
    ? clamp(1 + (buyingClub.reputation - sellingClub.reputation) / 250, 0.9, 1.12)
    : 1;
  const pressureDiscount = motivation.willingToMove
    ? clamp(1 - motivation.score / 420, 0.8, 1)
    : 1;
  const fee = Math.max(
    sellingClub ? 50_000 : 0,
    roundTransferValue(
      player.marketValue
      * ageFactor
      * contractFactor
      * prestigeFactor
      * roleWeight(role)
      * pressureDiscount,
    ),
  );

  const abilityBaseline = Math.max(player.wage, Math.round(player.currentAbility * 60));
  const wage = roundWeeklyWage(
    abilityBaseline
    * roleWeight(role)
    * (player.age <= 22 ? 1.04 : player.age >= 33 ? 0.9 : 1)
    * clamp(1 + (buyingClub.reputation - (sellingClub?.reputation ?? buyingClub.reputation)) / 180, 0.94, 1.1)
    * (player.personalityProfile?.transferWillingness ?? 0.5 >= 0.75 ? 1.06 : 1)
    * (contractLength >= 4 ? 0.98 : contractLength === 1 ? 1.04 : 1),
  );

  const signingBonusWeeks = role === "key" ? 6 : role === "regular" ? 4 : role === "rotation" ? 3 : 2;
  const signingBonus = roundTransferValue(wage * signingBonusWeeks);

  const addOns: TransferAddOn[] = buyingClub.scoutingPhilosophy === "marketSmart"
    && player.age <= 23
    && fee >= 1_500_000
    ? [{
        type: "appearanceBonus",
        value: roundTransferValue(fee * 0.08),
        trigger: "20 appearances",
      }]
    : [];

  return {
    fee,
    wage,
    contractLength,
    role,
    signingBonus,
    addOns,
  };
}

export function assessTransferClubAffordability(input: {
  buyingClub: Club;
  players: Record<string, Player>;
  playerId: string;
  fee: number;
  wage: number;
  signingBonus?: number;
  addOns?: TransferAddOn[];
  releasedPlayerId?: string;
  currentWeek?: number;
  currentSeason?: number;
}): TransferClubAffordabilityAssessment {
  const addOns = input.addOns ?? [];
  const obligations = addOns.length === 0
    ? []
    : buildTransferAddOnObligations({
        playerId: input.playerId,
        creditorClubId: input.buyingClub.id,
        addOns,
        currentWeek: input.currentWeek ?? 1,
        currentSeason: input.currentSeason ?? 1,
      });
  const addOnReserve = getTransferContingentReserve(obligations);
  const released = releasedWeeklyCommitment(
    input.buyingClub,
    input.players,
    input.releasedPlayerId,
  );
  const result = assessClubAffordability({
    club: input.buyingClub,
    players: input.players,
    upfrontCost: Math.max(0, input.fee) + Math.max(0, input.signingBonus ?? 0),
    weeklyWageCommitment: input.wage,
    releasedWeeklyCommitment: released,
    contingentReserve: addOnReserve,
  });

  const reasons = result.affordable
    ? [
        `Remaining cash after terms and reserve: ${result.remainingBudgetAfterReserve}.`,
        `Weekly wage headroom after the move: ${result.remainingWeeklyHeadroom}.`,
      ]
    : [
        ...(result.remainingBudgetAfterReserve < 0
          ? [`The upfront package overruns cash by ${Math.abs(result.remainingBudgetAfterReserve)}.`]
          : []),
        ...(result.remainingWeeklyHeadroom < 0
          ? [`The wage package overruns weekly headroom by ${Math.abs(result.remainingWeeklyHeadroom)}.`]
          : []),
      ];

  if (addOnReserve > 0) {
    reasons.push(`A contingent reserve of ${addOnReserve} is held for negotiated add-ons.`);
  }

  return {
    result,
    signingBonus: Math.max(0, input.signingBonus ?? 0),
    releasedWeeklyCommitment: released,
    addOnReserve,
    addOns,
    reasons,
  };
}

export function assessTransferRegistrationFit(input: {
  player: Player;
  buyingClub: Club;
  leagues: Record<string, League>;
  sellingClub?: Club;
}): TransferRegistrationAssessment {
  const countries = resolveCountries(
    input.player,
    input.buyingClub,
    input.leagues,
    input.sellingClub,
  );

  if (!countries.crossBorder) {
    return {
      status: "clear",
      eligible: true,
      requiresClearance: false,
      score: 96,
      crossBorder: false,
      routeProbability: countries.routeProbability,
      originCountry: countries.originCountry,
      destinationCountry: countries.destinationCountry,
      reasons: ["The move stays inside one domestic registration framework."],
    };
  }

  if (input.player.age < 16) {
    return {
      status: "blocked",
      eligible: false,
      requiresClearance: true,
      score: 8,
      crossBorder: true,
      routeProbability: countries.routeProbability,
      originCountry: countries.originCountry,
      destinationCountry: countries.destinationCountry,
      reasons: [
        `The ${countries.originCountry ?? "origin"} to ${countries.destinationCountry ?? "destination"} move is cross-border.`,
        "The player is below the age gate this simulation uses for international registration realism.",
      ],
    };
  }

  let score = 58;
  score += Math.round(countries.routeProbability * 100);
  if (normalizeCountryKey(input.player.nationality) === countries.destinationCountry) score += 16;
  if (input.buyingClub.scoutingPhilosophy === "globalRecruiter") score += 8;
  if (input.buyingClub.youthAcademyRating >= 14) score += 5;
  if (input.player.age <= 18) score -= 18;
  if (input.player.age >= 30) score += 4;
  score = clamp(score, 12, 92);

  const status: TransferRegistrationStatus =
    input.player.age <= 17
    || score < 52
    || countries.routeProbability < 0.04
    ? "conditional"
    : "clear";

  return {
    status,
    eligible: true,
    requiresClearance: status !== "clear",
    score,
    crossBorder: true,
    routeProbability: countries.routeProbability,
    originCountry: countries.originCountry,
    destinationCountry: countries.destinationCountry,
    reasons: [
      `The route is ${routeLabel(countries.routeProbability)} in the existing transfer-flow model.`,
      ...(normalizeCountryKey(input.player.nationality) === countries.destinationCountry
        ? ["The destination matches the player's nationality, which eases modeled settling friction."]
        : ["The destination does not match the player's nationality, so settling work remains live."]),
      ...(status === "conditional"
        ? ["Registration and settling clearance should be treated as a final pre-commit gate."]
        : ["The route clears the bounded registration and settling checks without extra flags."]),
    ],
  };
}

export function assessTransferPlayerWillingness(input: {
  player: Player;
  buyingClub: Club;
  state: TransferAgreementWorldContext;
  terms: Pick<ProposedTransferTerms, "wage" | "contractLength" | "role">;
  sellingClub?: Club;
  registration?: TransferRegistrationAssessment;
  motivation?: TransferMotivation;
}): TransferPlayerWillingnessAssessment {
  const sellingClub = input.sellingClub ?? input.state.clubs[contractOwner(input.player) ?? ""];
  const registration = input.registration ?? assessTransferRegistrationFit({
    player: input.player,
    buyingClub: input.buyingClub,
    leagues: input.state.leagues,
    sellingClub,
  });
  const motivation = input.motivation ?? calculateTransferMotivation(input.player, input.state);
  const currentClub = sellingClub ?? input.buyingClub;
  const wageRatio = input.terms.wage / Math.max(1, input.player.wage);
  const reputationDelta = input.buyingClub.reputation - currentClub.reputation;

  let probability = 0.22;
  probability += motivation.score / 220;
  probability += clamp(reputationDelta / 120, -0.14, 0.16);
  probability += input.terms.role === "key" ? 0.16
    : input.terms.role === "regular" ? 0.08
      : input.terms.role === "rotation" ? -0.02
        : input.player.age <= 21 ? 0.02 : -0.12;
  probability += clamp((wageRatio - 1) * 0.18, -0.1, 0.12);
  probability += clamp((registration.score - 60) / 180, -0.12, 0.1);

  if (input.player.age <= 21) {
    probability += input.terms.contractLength >= 4 ? 0.06 : -0.08;
  } else if (input.player.age >= 32) {
    probability += input.terms.contractLength <= 2 ? 0.08 : -0.08;
  }

  if (input.player.injured) {
    probability -= clamp((input.player.injuryWeeksRemaining ?? 0) / 80, 0.03, 0.12);
  }

  const countries = resolveCountries(input.player, input.buyingClub, input.state.leagues, sellingClub);
  if (!countries.crossBorder) probability += 0.04;
  else if (countries.routeProbability < 0.04) probability -= 0.04;

  probability = clampProbability(probability);
  const reasons = [
    ...(motivation.willingToMove ? ["The player is already open to leaving the current club."] : []),
    ...(reputationDelta >= 10 ? ["The destination is a meaningful prestige step."] : []),
    ...(input.terms.role === "key" ? ["The role promise points to immediate importance."] : []),
    ...(wageRatio >= 1.15 ? ["The wage offer materially improves the current deal."] : []),
    ...(registration.status === "conditional"
      ? ["Cross-border clearance still adds risk to the decision."]
      : []),
    ...(input.player.injured ? ["Current injury status pushes the player toward caution."] : []),
  ];

  return {
    probability,
    score: Math.round(probability * 100),
    willingToJoin: probability >= 0.52,
    reasons: reasons.length > 0 ? reasons : ["The player sees the move as viable but not compelling."],
    role: input.terms.role,
    motivationScore: motivation.score,
  };
}

export function proposeTransferAgreement(
  input: ProposeTransferAgreementInput,
): TransferAgreementProposal {
  const sellingClub = input.sellingClub ?? input.state.clubs[contractOwner(input.player) ?? ""];
  const motivation = input.motivation ?? calculateTransferMotivation(input.player, input.state);
  const terms = proposeTransferTerms({ ...input, sellingClub, motivation });
  const registration = assessTransferRegistrationFit({
    player: input.player,
    buyingClub: input.buyingClub,
    leagues: input.state.leagues,
    sellingClub,
  });
  const affordability = assessTransferClubAffordability({
    buyingClub: input.buyingClub,
    players: input.state.players,
    playerId: input.player.id,
    fee: terms.fee,
    wage: terms.wage,
    signingBonus: terms.signingBonus,
    addOns: terms.addOns,
    releasedPlayerId: input.releasedPlayerId,
    currentWeek: input.state.currentWeek,
    currentSeason: input.state.currentSeason,
  });
  const willingness = assessTransferPlayerWillingness({
    player: input.player,
    buyingClub: input.buyingClub,
    state: input.state,
    terms,
    sellingClub,
    registration,
    motivation,
  });

  const reasons = [
    ...(affordability.result.affordable ? [] : affordability.reasons),
    ...(registration.status === "blocked" ? registration.reasons : []),
    ...(willingness.willingToJoin ? [] : willingness.reasons),
  ];

  return {
    ...terms,
    affordability,
    registration,
    willingness,
    viable:
      affordability.result.affordable
      && registration.eligible
      && willingness.willingToJoin,
    reasons: reasons.length > 0
      ? reasons
      : [
          `Role promise: ${terms.role}.`,
          ...registration.reasons.slice(0, 1),
          ...willingness.reasons.slice(0, 2),
        ],
  };
}
