import type { ClubSeasonHistory } from "./worldHistory";

/** Versioned, lossless archive representation; never used for live clubs. */
export interface CompactClubSeasonHistory {
  clubId: string;
  archiveV1: [number, ...unknown[]];
}
export type ClubSeasonHistoryEntry = ClubSeasonHistory | CompactClubSeasonHistory;

// Field order is the persisted v1 format. Append/change only in a new version.
const FIELDS = ["leagueId", "standing", "leagueMovement", "nextLeagueId", "reputation",
  "budget", "scoutingPhilosophy", "recruitmentDoctrine", "tacticalStyle", "manager"] as const;
const NESTED: Record<string, readonly string[]> = {
  standing: ["position", "tableSize", "played", "won", "drawn", "lost", "goalsFor",
    "goalsAgainst", "goalDifference", "points"],
  recruitmentDoctrine: ["version", "archetype", "preferredSeniorAgeRange", "evidencePreference",
    "riskTolerance", "geographicReach", "adaptationTolerance", "pathwayPatience",
    "tacticalRoleRigidity", "sellingPressure", "managerInfluence", "directorInfluence", "seasonalObjective"],
  tacticalStyle: ["defensiveLine", "pressingIntensity", "tempo", "width", "directness",
    "tacticalIdentity", "eventDistribution", "strengthAgainst", "weakAgainst"],
  manager: ["managerId", "managerName", "scoutingPreference", "reportInfluence", "preferredFormation"],
};

type Packed = CompactClubSeasonHistory["archiveV1"];
function pack(record: Record<string, unknown>, fields: readonly string[]): Packed | undefined {
  if (Object.keys(record).some(key => !fields.includes(key))) return undefined;
  const packed: Packed = [0];
  fields.forEach((key, index) => {
    if (record[key] === undefined) return; // Same omission as JSON object serialization.
    packed[0] |= 1 << index;
    packed.push(record[key]);
  });
  return packed;
}

function unpack(packed: Packed, fields: readonly string[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  let cursor = 1;
  fields.forEach((key, index) => {
    if (packed[0] & (1 << index)) record[key] = packed[cursor++];
  });
  return record;
}

export function compactClubSeasonHistory(entry: ClubSeasonHistoryEntry): ClubSeasonHistoryEntry {
  if ("archiveV1" in entry) return entry;
  const { clubId, ...fields } = entry;
  const encoded: Record<string, unknown> = { ...fields };
  for (const [key, schema] of Object.entries(NESTED)) {
    const value = encoded[key];
    if (value === undefined) continue;
    // Unknown mod fields or unusual legacy payloads keep their original form.
    if (!value || typeof value !== "object" || Array.isArray(value)) return entry;
    const packed = pack(value as Record<string, unknown>, schema);
    if (!packed) return entry;
    encoded[key] = packed;
  }
  const archiveV1 = pack(encoded, FIELDS);
  return archiveV1 ? { clubId, archiveV1 } : entry;
}

export function expandClubSeasonHistory(entry: ClubSeasonHistoryEntry): ClubSeasonHistory {
  if (!("archiveV1" in entry)) return entry;
  const fields = unpack(entry.archiveV1, FIELDS);
  for (const [key, schema] of Object.entries(NESTED)) {
    if (fields[key] !== undefined) fields[key] = unpack(fields[key] as Packed, schema);
  }
  return { clubId: entry.clubId, ...fields } as unknown as ClubSeasonHistory;
}
