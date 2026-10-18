import type { Scout } from "@/engine/core/types";

type AccuracyEntry = NonNullable<Scout["accuracyHistory"]>[number];

/** Legacy rows mixed review-date CA with submission judgments. Keep history,
 * but never present an unknown comparison date as reliable accuracy. */
export function isSubmissionAccuracy(entry: AccuracyEntry): boolean {
  return entry.assessmentBasis === "submission"
    && Number.isFinite(entry.predictedCA) && Number.isFinite(entry.actualCA)
    && entry.predictedCA >= 1 && entry.predictedCA <= 200
    && entry.actualCA >= 1 && entry.actualCA <= 200;
}
