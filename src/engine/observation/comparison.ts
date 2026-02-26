/**
 * Comparison Bench
 *
 * Scouts think in comparisons, not absolutes. This module provides
 * relative assessment against a bench of up to 8 known players,
 * helping scouts contextualise what they're seeing.
 *
 * The bench is a lightweight data structure that travels with a scout
 * across sessions. When a scout wants to understand a new player, they
 * compare against the bench — returning a structured ComparisonResult
 * with a human-readable narrative and a confidence score shaped by
 * how much is known about both players.
 *
 * Pure functions — no side effects, no mutations.
 */

import type { RNG } from "@/engine/rng";

// =============================================================================
// TYPES
// =============================================================================

/**
 * A player held in the scout's comparison bench.
 * Only perceived (not true) attribute values are stored here — the scout's
 * bench reflects what they believe, not ground truth.
 */
export interface BenchPlayer {
  /** Reference to the PlayerProfile id in GameState. */
  playerId: string;
  /** Display name for bench UI and narrative generation. */
  name: string;
  /** Primary playing position (e.g. "CAM", "CB"). */
  position: string;
  /**
   * Perceived attribute values for this bench player.
   * Keys are PlayerAttribute names; values are the scout's assessment (1–20 scale).
   * A sparse record is valid — attributes the scout hasn't observed are simply absent.
   */
  knownAttributes: Record<string, number>;
  /** Game week this player was added to the bench. */
  addedAtWeek: number;
}

/**
 * The scout's portable comparison bench.
 * Holds up to maxSize known players for side-by-side reference.
 */
export interface ComparisonBench {
  /** The players currently on the bench. */
  benchPlayers: BenchPlayer[];
  /** Hard cap on bench size. */
  maxSize: number;
}

/**
 * The result of comparing a target player against one bench player on a
 * specific attribute domain.
 *
 * All fields are deterministic for a given RNG state — two calls with the same
 * inputs and the same RNG seed will produce identical results.
 */
export interface ComparisonResult {
  /** The player being assessed. */
  targetPlayerId: string;
  /** The bench player they are being compared against. */
  benchPlayerId: string;
  /**
   * The attribute domain the comparison covers.
   * Matches the keys used in BenchPlayer.knownAttributes.
   */
  domain: string;
  /**
   * Qualitative comparison label.
   *
   * Thresholds (based on the mean delta across overlapping domain attributes):
   *   >= +3  → "clearly_better"
   *   +1–+2  → "slightly_better"
   *   0      → "comparable"
   *   -1–-2  → "slightly_worse"
   *   <= -3  → "clearly_worse"
   */
  comparison: "clearly_better" | "slightly_better" | "comparable" | "slightly_worse" | "clearly_worse";
  /**
   * How confident the scout is in this comparison, on a 0–1 scale.
   *
   * Confidence degrades when:
   * - Fewer overlapping attributes exist in the domain
   * - The bench player's known attributes are sparse
   * - The RNG adds a small noise component to simulate scout fallibility
   */
  confidence: number;
  /** A human-readable sentence describing the comparison result. */
  narrative: string;
}

// =============================================================================
// NARRATIVE TEMPLATES
// =============================================================================

/**
 * Narrative templates for each comparison tier.
 *
 * Placeholders:
 *   {targetName}  — the player being assessed
 *   {benchName}   — the bench reference player
 *   {domain}      — the attribute domain being compared (e.g. "technical")
 *
 * Multiple variants per tier ensure session-to-session variety via rng.pick().
 */
export const COMPARISON_NARRATIVES: Record<
  ComparisonResult["comparison"],
  string[]
> = {
  clearly_better: [
    "Compared to {benchName}, {targetName} shows clearly superior {domain} ability.",
    "Side by side with {benchName}, {targetName} is operating at a measurably higher {domain} level.",
    "{targetName} stands out against the {benchName} benchmark — the {domain} gap is substantial.",
    "The {domain} difference between {targetName} and {benchName} is hard to ignore. {targetName} is clearly ahead.",
    "Putting {targetName} next to {benchName} makes the {domain} advantage plain. This is not a close comparison.",
  ],
  slightly_better: [
    "Against {benchName}, {targetName} edges it in the {domain} department.",
    "{targetName} has a slight advantage over {benchName} when it comes to {domain}.",
    "Compared to {benchName}, {targetName}'s {domain} qualities show a marginal but consistent step up.",
    "On balance {targetName} is a fraction ahead of {benchName} in {domain} terms — not definitive, but there.",
    "The {domain} comparison tilts toward {targetName} when set against {benchName}. Not dramatic, but present.",
  ],
  comparable: [
    "Side by side with {benchName}, {targetName}'s {domain} profile is comparable.",
    "{targetName} and {benchName} are at a similar {domain} level — no meaningful separation.",
    "The {domain} comparison with {benchName} puts {targetName} in the same bracket. Neither stands out.",
    "Against {benchName}, {targetName} reads as {domain}-equivalent. The bench is a fair reference point.",
    "{targetName} and {benchName} are closely matched in {domain}. Distinguishing them will require sharper evidence.",
  ],
  slightly_worse: [
    "{targetName} falls slightly short of {benchName} in the {domain} category.",
    "Against {benchName}, {targetName}'s {domain} is a marginal step down.",
    "The {domain} comparison with {benchName} doesn't favour {targetName} — there's a small but consistent gap.",
    "Set against {benchName}, {targetName} is fractionally behind on {domain}. Not a major concern, but noted.",
    "{targetName} isn't quite matching {benchName} in {domain} terms. The difference is modest but real.",
  ],
  clearly_worse: [
    "{targetName} falls clearly short of {benchName} in the {domain} department.",
    "The {domain} gap between {targetName} and {benchName} is significant. {benchName} is the stronger benchmark.",
    "Against {benchName}, {targetName} is operating below the reference level on {domain}.",
    "Comparing {targetName} to {benchName} on {domain} reveals a clear deficit. The distance is not trivial.",
    "Set against {benchName}, {targetName}'s {domain} profile is noticeably weaker. The bench is the higher standard here.",
  ],
};

// =============================================================================
// BENCH MANAGEMENT
// =============================================================================

/**
 * Creates a new, empty comparison bench with the standard maximum size of 8.
 */
export function createComparisonBench(): ComparisonBench {
  return {
    benchPlayers: [],
    maxSize: 8,
  };
}

/**
 * Adds a player to the comparison bench.
 *
 * If the bench is already at capacity (maxSize), the bench is returned
 * unchanged — the caller must explicitly remove a player before adding
 * a new one. This preserves intentionality over bench composition.
 *
 * If a player with the same playerId already exists, the bench is
 * returned unchanged (no implicit upsert).
 */
export function addToBench(
  bench: ComparisonBench,
  player: BenchPlayer,
): ComparisonBench {
  if (bench.benchPlayers.length >= bench.maxSize) {
    return bench;
  }

  const alreadyPresent = bench.benchPlayers.some(
    (p) => p.playerId === player.playerId,
  );
  if (alreadyPresent) {
    return bench;
  }

  return {
    ...bench,
    benchPlayers: [...bench.benchPlayers, player],
  };
}

/**
 * Removes a player from the bench by their playerId.
 * Returns the bench unchanged if no matching player is found.
 */
export function removeFromBench(
  bench: ComparisonBench,
  playerId: string,
): ComparisonBench {
  const filtered = bench.benchPlayers.filter((p) => p.playerId !== playerId);

  if (filtered.length === bench.benchPlayers.length) {
    // Nothing was removed — return original reference unchanged.
    return bench;
  }

  return {
    ...bench,
    benchPlayers: filtered,
  };
}

// =============================================================================
// ATTRIBUTE DOMAIN CLASSIFICATION
// =============================================================================

/**
 * Maps a domain label to the set of attribute keys that belong to it.
 *
 * When `comparePlayer` is called with a domain, it finds all attributes in
 * `targetAttributes` and `benchPlayer.knownAttributes` whose keys match the
 * domain prefix and averages across them. If no matching attributes exist,
 * the function falls back to comparing all overlapping attributes.
 *
 * Attribute keys are expected to be lower-camelCase strings such as
 * "technicalPassing", "physicalPace", "mentalComposure", etc.
 */
const DOMAIN_PREFIXES: Record<string, string> = {
  technical: "technical",
  physical: "physical",
  mental: "mental",
  tactical: "tactical",
};

/**
 * Filters an attribute map to only those keys whose names contain the given
 * domain prefix. Case-insensitive to handle mixed naming conventions.
 *
 * Returns the full map unchanged if no domain prefix matches, ensuring the
 * function always has something to work with.
 */
function filterAttributesByDomain(
  attributes: Record<string, number>,
  domain: string,
): Record<string, number> {
  const prefix = DOMAIN_PREFIXES[domain.toLowerCase()];
  if (!prefix) {
    return attributes;
  }

  const filtered: Record<string, number> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (key.toLowerCase().includes(prefix.toLowerCase())) {
      filtered[key] = value;
    }
  }

  // If no matching keys, fall back to returning the full attribute set so the
  // caller always receives a meaningful comparison even for unlabelled domains.
  return Object.keys(filtered).length > 0 ? filtered : attributes;
}

// =============================================================================
// COMPARISON LOGIC
// =============================================================================

/**
 * Derives the comparison tier from a mean attribute delta.
 *
 * Thresholds:
 *   delta >= +3  → "clearly_better"
 *   delta >= +1  → "slightly_better"
 *   delta <= -3  → "clearly_worse"
 *   delta <= -1  → "slightly_worse"
 *   otherwise    → "comparable"
 */
function deriveComparisonTier(delta: number): ComparisonResult["comparison"] {
  if (delta >= 3) return "clearly_better";
  if (delta >= 1) return "slightly_better";
  if (delta <= -3) return "clearly_worse";
  if (delta <= -1) return "slightly_worse";
  return "comparable";
}

/**
 * Computes a confidence score for the comparison.
 *
 * Confidence is a function of:
 *   1. How many overlapping attributes exist (more overlap → more confidence).
 *   2. How sparse the bench player's knownAttributes are overall (sparse bench → less confidence).
 *   3. A small RNG noise component (±0.05) to simulate scout fallibility.
 *
 * The raw score is clamped to [0.05, 0.99] — never fully certain, never
 * entirely dismissed.
 */
function computeConfidence(
  overlapCount: number,
  totalBenchAttributes: number,
  rng: RNG,
): number {
  // Base confidence scales with overlap count, saturating at 5+ attributes.
  const overlapScore = Math.min(overlapCount / 5, 1.0);

  // Penalty if the bench player is sparsely known.
  const sparsityPenalty = totalBenchAttributes === 0 ? 0.5 : Math.min(totalBenchAttributes / 8, 1.0);

  // RNG noise in [-0.05, +0.05].
  const noise = (rng.next() - 0.5) * 0.1;

  const raw = overlapScore * sparsityPenalty + noise;

  // Clamp to [0.05, 0.99].
  return Math.min(Math.max(raw, 0.05), 0.99);
}

/**
 * Fills in the narrative template for a comparison result.
 *
 * Substitutes {targetName}, {benchName}, and {domain} placeholders with the
 * provided values. Returns the filled string.
 */
function fillNarrative(
  template: string,
  targetName: string,
  benchName: string,
  domain: string,
): string {
  return template
    .replace(/\{targetName\}/g, targetName)
    .replace(/\{benchName\}/g, benchName)
    .replace(/\{domain\}/g, domain);
}

/**
 * Compares a target player's perceived attributes against a single bench player
 * within a specified attribute domain.
 *
 * Algorithm:
 *   1. Filter both attribute sets to the requested domain.
 *   2. Find keys present in both filtered sets (the overlap).
 *   3. Compute the mean delta across overlapping keys (target − bench).
 *   4. Derive the comparison tier from the mean delta.
 *   5. Compute confidence from overlap count and bench sparsity.
 *   6. Pick a narrative template via rng.pick() and fill placeholders.
 *
 * Edge cases:
 *   - If there are no overlapping keys after domain filtering, the delta is
 *     treated as 0 and the comparison returns "comparable" with low confidence.
 *   - The `targetName` parameter is used only for narrative generation; it is
 *     not required to match any stored state.
 *
 * @param targetAttributes  - Perceived attribute map for the player being assessed.
 * @param benchPlayer       - The bench reference player.
 * @param domain            - Attribute domain to compare within (e.g. "technical").
 * @param rng               - Seeded RNG for confidence noise and narrative selection.
 * @param targetPlayerId    - ID of the target player (for the result record).
 * @param targetName        - Display name of the target player (for narrative text).
 */
export function comparePlayer(
  targetAttributes: Record<string, number>,
  benchPlayer: BenchPlayer,
  domain: string,
  rng: RNG,
  targetPlayerId: string,
  targetName: string,
): ComparisonResult {
  // 1. Filter to the requested domain.
  const filteredTarget = filterAttributesByDomain(targetAttributes, domain);
  const filteredBench = filterAttributesByDomain(benchPlayer.knownAttributes, domain);

  // 2. Find overlapping attribute keys.
  const overlapKeys = Object.keys(filteredTarget).filter(
    (key) => key in filteredBench,
  );

  // 3. Compute mean delta (target − bench). Default to 0 if no overlap.
  let meanDelta = 0;
  if (overlapKeys.length > 0) {
    const totalDelta = overlapKeys.reduce((sum, key) => {
      const targetVal = filteredTarget[key] ?? 0;
      const benchVal = filteredBench[key] ?? 0;
      return sum + (targetVal - benchVal);
    }, 0);
    meanDelta = totalDelta / overlapKeys.length;
  }

  // 4. Derive comparison tier.
  const comparison = deriveComparisonTier(meanDelta);

  // 5. Compute confidence.
  const totalBenchAttributes = Object.keys(benchPlayer.knownAttributes).length;
  const confidence = computeConfidence(overlapKeys.length, totalBenchAttributes, rng);

  // 6. Select and fill narrative.
  const narrativeTemplates = COMPARISON_NARRATIVES[comparison];
  const rawTemplate = rng.pick(narrativeTemplates);
  const narrative = fillNarrative(rawTemplate, targetName, benchPlayer.name, domain);

  return {
    targetPlayerId,
    benchPlayerId: benchPlayer.playerId,
    domain,
    comparison,
    confidence,
    narrative,
  };
}

// =============================================================================
// BULK COMPARISON HELPERS
// =============================================================================

/**
 * Compares a target player against every player on the bench for a single domain.
 *
 * Returns an array of ComparisonResults, one per bench player. The order
 * matches the bench's benchPlayers array order.
 *
 * Returns an empty array if the bench contains no players.
 */
export function compareAgainstBench(
  targetAttributes: Record<string, number>,
  bench: ComparisonBench,
  domain: string,
  rng: RNG,
  targetPlayerId: string,
  targetName: string,
): ComparisonResult[] {
  return bench.benchPlayers.map((benchPlayer) =>
    comparePlayer(
      targetAttributes,
      benchPlayer,
      domain,
      rng,
      targetPlayerId,
      targetName,
    ),
  );
}

/**
 * Finds the closest match on the bench to the target player for a given domain.
 *
 * "Closest" is defined as the bench player with the smallest absolute mean
 * delta to the target — i.e. the one whose attributes most closely mirror the
 * target's. Useful for identifying a natural comparison anchor.
 *
 * Returns null if the bench is empty.
 */
export function findClosestBenchMatch(
  targetAttributes: Record<string, number>,
  bench: ComparisonBench,
  domain: string,
  rng: RNG,
  targetPlayerId: string,
  targetName: string,
): ComparisonResult | null {
  if (bench.benchPlayers.length === 0) {
    return null;
  }

  const results = compareAgainstBench(
    targetAttributes,
    bench,
    domain,
    rng,
    targetPlayerId,
    targetName,
  );

  // "comparable" is the closest tier; then "slightly_better"/"slightly_worse";
  // then "clearly_better"/"clearly_worse". Use tier proximity as the sort key.
  const tierOrder: Record<ComparisonResult["comparison"], number> = {
    comparable: 0,
    slightly_better: 1,
    slightly_worse: 1,
    clearly_better: 2,
    clearly_worse: 2,
  };

  const sorted = results.slice().sort(
    (a, b) => tierOrder[a.comparison] - tierOrder[b.comparison],
  );

  return sorted[0] ?? null;
}
