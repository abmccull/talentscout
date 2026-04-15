import type { CareerPath } from "@/engine/core/types";

/**
 * Applies career-path-aware text substitution.
 * For independent scouts, replaces "your club" / "your club's" with "your clients" / "your clients'".
 */
export function resolveCareerPathText(
  text: string,
  careerPath?: CareerPath,
): string {
  if (careerPath !== "independent") return text;
  return text
    .replace(/your club's/gi, "your clients'")
    .replace(/your club/gi, "your clients");
}
