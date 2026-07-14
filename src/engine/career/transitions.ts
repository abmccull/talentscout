/**
 * Career-state transitions.
 *
 * These helpers keep mutually-exclusive club and independent state in sync.
 * They deliberately preserve lifetime history and the financial ledger while
 * closing only active work that cannot survive a path change.
 */

import type {
  CareerPath,
  FinancialRecord,
  GameState,
  JobOffer,
  Scout,
} from "../core/types";
import { calculateMonthlyExpenses } from "../finance/expenses";
import {
  calculateSpecMonthlyBonus,
  calculateSpecUniqueIncome,
} from "../finance/specializationIncome";
import { acceptJobOffer, endClubEmployment } from "./progression";

const CLOSED_OFFICE = {
  tier: "home",
  monthlyCost: 0,
  qualityBonus: 0,
  maxEmployees: 0,
} as const;

/** Close active independent work without erasing its historical records. */
export function closeIndependentOperations(
  finances: FinancialRecord,
): FinancialRecord {
  return {
    ...finances,
    retainerContracts: finances.retainerContracts.map((contract) =>
      contract.status === "active" || contract.status === "suspended"
        ? { ...contract, status: "cancelled" as const }
        : contract,
    ),
    consultingContracts: finances.consultingContracts.map((contract) =>
      contract.status === "active"
        ? { ...contract, status: "expired" as const }
        : contract,
    ),
    reportListings: finances.reportListings.map((listing) => ({
      ...listing,
      status:
        listing.status === "active" ? ("withdrawn" as const) : listing.status,
      bids: listing.bids.map((bid) =>
        bid.status === "pending"
          ? { ...bid, status: "withdrawn" as const }
          : bid,
      ),
    })),
    office: { ...CLOSED_OFFICE },
    employees: [],
    pendingRetainerOffers: [],
    pendingConsultingOffers: [],
    pendingEmployeeEvents: [],
    satelliteOffices: [],
  };
}

function finalizeFinancesForScout(
  finances: FinancialRecord,
  scout: Scout,
): FinancialRecord {
  const withIncome: FinancialRecord = {
    ...finances,
    monthlyIncome: scout.careerPath === "club" ? scout.salary * 4 : 0,
  };

  return {
    ...withIncome,
    expenses: calculateMonthlyExpenses(scout, withIncome),
    specBonusApplied: calculateSpecMonthlyBonus(scout),
    specUniqueIncome: calculateSpecUniqueIncome(scout, withIncome),
  };
}

/** Leave club employment and enter a clean independent career state. */
export function transitionToIndependentCareer(
  scout: Scout,
  finances: FinancialRecord,
): { scout: Scout; finances: FinancialRecord } {
  const transitionedScout = endClubEmployment(scout);
  const transitionedFinances: FinancialRecord = {
    ...finances,
    careerPath: "independent",
    independentTier: 1,
    monthlyIncome: 0,
    // These values are granted by club employment and must not leak into the
    // newly independent business.
    academyPartnerships: 0,
    regionalExpertiseRegion: undefined,
  };

  return {
    scout: transitionedScout,
    finances: finalizeFinancesForScout(transitionedFinances, transitionedScout),
  };
}

/**
 * Enter the club path without asserting employment at a club. Active agency
 * work is closed because it conflicts with full-time club employment.
 */
export function transitionToClubCareer(
  scout: Scout,
  finances: FinancialRecord,
  countries: string[] = [],
): { scout: Scout; finances: FinancialRecord } {
  const transitionedScout: Scout = {
    ...scout,
    careerPath: "club",
    independentTier: undefined,
  };
  const homeCountry = countries[0] ?? "england";
  const closedFinances = closeIndependentOperations(finances);
  const transitionedFinances: FinancialRecord = {
    ...closedFinances,
    careerPath: "club",
    independentTier: undefined,
    monthlyIncome: transitionedScout.salary * 4,
    academyPartnerships:
      transitionedScout.careerTier >= 3 &&
      transitionedScout.primarySpecialization === "youth"
        ? 1
        : 0,
    regionalExpertiseRegion:
      transitionedScout.careerTier >= 3 &&
      transitionedScout.primarySpecialization === "regional"
        ? homeCountry
        : undefined,
  };

  return {
    scout: transitionedScout,
    finances: finalizeFinancesForScout(transitionedFinances, transitionedScout),
  };
}

/** Accept a job through the same state transition used by path switching. */
export function transitionToClubEmployment(
  scout: Scout,
  finances: FinancialRecord,
  offer: JobOffer,
  currentSeason: number,
  countries: string[] = [],
): { scout: Scout; finances: FinancialRecord } {
  const employedScout = acceptJobOffer(scout, offer, currentSeason);
  return transitionToClubCareer(employedScout, finances, countries);
}

/** Apply a path choice and clear state owned by the path being left. */
export function applyCareerPathTransition(
  state: GameState,
  path: CareerPath,
): GameState {
  if (!state.finances) return state;

  const isInitialChoice = state.scout.careerPathChosen !== true;

  const transition =
    path === "independent"
      ? transitionToIndependentCareer(state.scout, state.finances)
      : transitionToClubCareer(state.scout, state.finances, state.countries);

  const committedScout: Scout = {
    ...transition.scout,
    careerPathChosen: true,
    ...(path === "independent" && isInitialChoice
      ? { independentTier: state.scout.careerTier }
      : {}),
  };
  const committedFinances: FinancialRecord = {
    ...transition.finances,
    ...(path === "independent" && isInitialChoice
      ? { independentTier: state.scout.careerTier }
      : {}),
  };

  const clearedTerritories = Object.fromEntries(
    Object.entries(state.territories).map(([id, territory]) => [
      id,
      { ...territory, assignedScoutIds: [] },
    ]),
  );

  return {
    ...state,
    scout: committedScout,
    finances: committedFinances,
    // Agency assistants cannot be carried into full-time club employment.
    assistantScouts: path === "club" ? [] : state.assistantScouts,
    // Club staff and responsibilities belong to the employer being left, not
    // to the scout personally. Clear them on either explicit path transition.
    npcScouts: {},
    npcReports: {},
    npcDelegations: {},
    leadershipPortfolio: undefined,
    territories: clearedTerritories,
    managerDirectives: [],
    boardProfile: undefined,
    systemFitCache: {},
  };
}

/** Apply an accepted offer and resolve every competing offer atomically. */
export function applyClubEmploymentTransition(
  state: GameState,
  offer: JobOffer,
): GameState {
  if (!state.finances) return state;

  const transition = transitionToClubEmployment(
    state.scout,
    state.finances,
    offer,
    state.currentSeason,
    state.countries,
  );
  const openOfferIds = new Set(state.jobOffers.map((candidate) => candidate.id));

  return {
    ...state,
    scout: transition.scout,
    finances: transition.finances,
    assistantScouts: [],
    npcScouts: {},
    npcReports: {},
    npcDelegations: {},
    leadershipPortfolio: undefined,
    territories: Object.fromEntries(
      Object.entries(state.territories).map(([id, territory]) => [
        id,
        { ...territory, assignedScoutIds: [] },
      ]),
    ),
    managerDirectives: [],
    boardProfile: undefined,
    jobOffers: [],
    inbox: state.inbox.map((message) =>
      message.relatedId && openOfferIds.has(message.relatedId)
        ? { ...message, read: true, actionRequired: false }
        : message,
    ),
    systemFitCache: {},
  };
}

/** Close all active work and enter the playable Tier-1 bankruptcy recovery. */
export function transitionToBankruptcyRecovery(
  scout: Scout,
  finances: FinancialRecord,
): { scout: Scout; finances: FinancialRecord } {
  const independent = transitionToIndependentCareer(scout, finances);
  const closedFinances = closeIndependentOperations(independent.finances);
  return {
    scout: {
      ...independent.scout,
      careerTier: 1,
    },
    finances: finalizeFinancesForScout(
      {
        ...closedFinances,
        careerPath: "independent",
        independentTier: 1,
        monthlyIncome: 0,
      },
      { ...independent.scout, careerTier: 1 },
    ),
  };
}
