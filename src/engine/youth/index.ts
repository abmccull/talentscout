/**
 * Youth engine barrel export.
 *
 * Re-exports all public functions from youth sub-modules.
 * Additional youth modules (scouting, placement, etc.) should be added here
 * as they are created.
 */

export {
  generateSubRegions,
  generateRegionalYouth,
  generateAcademyIntake,
  processYouthAging,
  processPlayerRetirement,
} from "./generation";

// Placement pipeline — placing unsigned youth at clubs
export {
  generatePlacementReport,
  calculateClubAcceptanceChance,
  processPlacementOutcome,
  getEligibleClubsForPlacement,
} from "./placement";

// Alumni tracking — long-term payoff loop for placed youth
export {
  createAlumniRecord,
  processAlumniWeek,
  calculateLegacyScore,
  calculateAlumniReputationBonus,
} from "./alumni";

// Tournament system — named, scheduled, discoverable youth events
export {
  generateSeasonTournaments,
  discoverTournamentsPassive,
  generateGrassrootsTournament,
  processContactTournamentTip,
  getActiveTournaments,
  getTournamentActivities,
  createAgencyShowcase,
  estimateTournamentCost,
} from "./tournaments";

// Gut feeling mechanic — narrative flash moments during youth scouting
export { rollGutFeeling, formatGutFeelingWithPA } from "./gutFeeling";
export type { GutFeelingPerkModifiers } from "./gutFeeling";
