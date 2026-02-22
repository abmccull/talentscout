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
