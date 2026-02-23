/**
 * Data scouting engine — barrel export.
 *
 * Provides all data-exclusive scouting capabilities:
 *  - Database queries and statistical profiling (dataActivities)
 *  - Prediction creation, resolution, and accuracy tracking (predictionTracker)
 *  - Analytics department management — analysts and passive reports (analyticsTeam)
 *
 * Usage:
 *   import { executeDatabaseQuery, createPrediction, generateAnalystCandidate } from "@/engine/data";
 */

// Data activities — database queries, video analysis, stats briefings
export type { DatabaseQueryFilters, StatsBriefingResult } from "./dataActivities";
export {
  executeDatabaseQuery,
  executeDeepVideoAnalysis,
  generateStatsBriefing,
  validateAnomalyFromObservation,
} from "./dataActivities";

// Prediction tracker — create, resolve, and evaluate predictions
export type { PredictionAccuracy, PredictionSuggestion } from "./predictionTracker";
export {
  createPrediction,
  resolvePredictions,
  calculatePredictionAccuracy,
  generatePredictionSuggestions,
} from "./predictionTracker";

// Analytics team — analyst management and passive reports
export {
  generateAnalystCandidate,
  generateAnalystReport,
  updateAnalystMorale,
  getAnalystSalaryCost,
} from "./analyticsTeam";
