/** Persisted development-history contracts, independent of simulation mechanics. */
export type DevelopmentEnvironmentBand =
  | "excellent"
  | "supportive"
  | "mixed"
  | "restricted"
  | "adverse";

/** Compact, bounded public record of why an observable career turn occurred. */
export interface PlayerDevelopmentHistoryEntry {
  /** Omitted only when reconstructible from the containing player's identity. */
  id?: string;
  season: number;
  week: number;
  clubId?: string;
  event: "routine-growth" | "breakthrough" | "decline" | "injury-setback";
  /** Omitted only when exactly implied by the persisted event. */
  outcome?: "improved" | "declined" | "setback";
  environmentBand: DevelopmentEnvironmentBand;
  /** Custom/historical prose. Omitted when exactly reconstructible by the v1 formatter. */
  summary?: string;
}
