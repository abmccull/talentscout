/**
 * Analytics module barrel export.
 *
 * Exposes the data/analytics tension system: manager profile generation
 * and the preference-alignment scoring that determines how much weight
 * a manager places on a given scout's reports.
 */

export {
  generateManagerProfile,
  generateManagerProfiles,
  calculatePreferenceAlignment,
  getReportQualityModifier,
} from "./dataTension";
