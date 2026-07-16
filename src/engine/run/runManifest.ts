/**
 * Deterministic run identity and named random streams.
 *
 * A run manifest contains only immutable creation-time inputs. It deliberately
 * excludes timestamps and mutable game state so the same seed and setup always
 * produce the same run ID. Gameplay systems can derive independent RNG streams
 * from the root seed without sharing mutable RNG state.
 */

import { createRNG, type RNG } from "@/engine/rng";
import type {
  DifficultyLevel,
  GameModeId,
  RunIntegrity,
  RunKind,
  RunManifest,
  Specialization,
} from "@/engine/core/types";

export const RUN_MANIFEST_VERSION = 3 as const;
export const RUN_RULES_VERSION = "youth-ea.4" as const;
export const RUN_CONTENT_VERSION = "run-content.3" as const;
export const NAMED_RNG_VERSION = "named-rng.1" as const;

export type SeedScopePart = string | number | boolean | null;

export interface CreateRunManifestInput {
  rootSeed: string;
  specialization: Specialization;
  gameModeId?: GameModeId;
  runKind?: RunKind;
  difficulty: DifficultyLevel;
  selectedCountries: readonly string[];
  startingCountry?: string;
  worldTraitIds?: readonly string[];
  mutatorIds?: readonly string[];
  originId?: string;
  flawId?: string;
  doctrineIds?: readonly string[];
  legacyUnlockIds?: readonly string[];
  integrity?: RunIntegrity;
  creationRulesVersion?: string;
  contentVersion?: string;
  /** All IDs in the definition catalog that can influence this run. */
  contentDefinitionIds?: readonly string[];
  /** V1 is reserved for reconstructing an untouched pre-ledger career. */
  manifestVersion?: 1 | 2 | 3;
}

const GAME_MODE_BY_SPECIALIZATION: Readonly<Record<Specialization, GameModeId>> = {
  youth: "youth-scout",
  firstTeam: "first-team-scout",
  regional: "regional-expert",
  data: "data-scout",
};

/** Stable bridge used by legacy manifests and creation-time validation. */
export function deriveGameModeIdFromSpecialization(
  specialization: Specialization,
): GameModeId {
  return GAME_MODE_BY_SPECIALIZATION[specialization];
}

/** Resolve a mode from immutable run identity, including V1/V2 careers. */
export function getRunGameModeId(manifest: RunManifest): GameModeId {
  return manifest.gameModeId
    ?? deriveGameModeIdFromSpecialization(manifest.specialization);
}

/** Legacy careers were all open-ended careers rather than challenge overlays. */
export function getRunKind(manifest: RunManifest): RunKind {
  return manifest.runKind ?? "career";
}

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new RangeError(`${label} must not be empty`);
  }
  return normalized;
}

function uniqueOrdered(values: readonly string[], label: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = requireNonEmpty(value, label);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function uniqueSorted(values: readonly string[], label: string): string[] {
  // Deliberately avoid localeCompare: ICU collation can vary by platform,
  // while code-unit ordering is specified by JavaScript and fully portable.
  return uniqueOrdered(values, label).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

function canonicalize(value: unknown): CanonicalValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError("Fingerprint inputs must contain only finite numbers");
    }
    // JSON has no distinct -0 representation. Normalize it explicitly so the
    // result is stable across runtimes.
    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value === "object") {
    const result: { [key: string]: CanonicalValue } = {};
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry === undefined) continue;
      result[key] = canonicalize(entry);
    }
    return result;
  }

  throw new TypeError(`Unsupported fingerprint input type: ${typeof value}`);
}

/** Stable JSON serialization with recursively sorted object keys. */
export function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function hash32(input: string, initialState: number): number {
  let hash = initialState >>> 0;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= hash >>> 13;
  }
  return hash >>> 0;
}

/**
 * Stable 64-bit-style hexadecimal fingerprint built from two independent
 * 32-bit hashes. This avoids BigInt so it remains compatible with the ES2017
 * browser target.
 */
export function stableFingerprint(value: unknown): string {
  const serialized = stableSerialize(value);
  const high = hash32(serialized, 0x811c9dc5);
  const low = hash32(serialized, 0x9e3779b9);
  return `${high.toString(16).padStart(8, "0")}${low
    .toString(16)
    .padStart(8, "0")}`;
}

/** Format a fingerprint for display without changing its identity. */
export function formatRunFingerprint(fingerprint: string): string {
  const normalized = fingerprint.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (normalized.length !== 16) {
    throw new RangeError("Run fingerprint must contain exactly 16 hexadecimal characters");
  }
  return normalized.match(/.{1,4}/g)?.join("-") ?? normalized;
}

export function createContentFingerprint(
  creationRulesVersion: string,
  contentVersion: string,
  definitionIds: readonly string[],
): string {
  return stableFingerprint({
    creationRulesVersion: requireNonEmpty(
      creationRulesVersion,
      "creationRulesVersion",
    ),
    contentVersion: requireNonEmpty(contentVersion, "contentVersion"),
    definitionIds: uniqueSorted(definitionIds, "content definition ID"),
  });
}

/**
 * Build a deterministic manifest. The function never reads time, global RNG,
 * storage, or mutable application state.
 */
export function createRunManifest(input: CreateRunManifestInput): RunManifest {
  const rootSeed = requireNonEmpty(input.rootSeed, "rootSeed");
  const selectedCountries = uniqueOrdered(
    input.selectedCountries,
    "selected country",
  );
  if (selectedCountries.length === 0) {
    throw new RangeError("selectedCountries must contain at least one country");
  }

  const startingCountry = input.startingCountry
    ? requireNonEmpty(input.startingCountry, "startingCountry")
    : undefined;
  if (startingCountry && !selectedCountries.includes(startingCountry)) {
    throw new RangeError("startingCountry must be included in selectedCountries");
  }
  const creationRulesVersion = requireNonEmpty(
    input.creationRulesVersion ?? RUN_RULES_VERSION,
    "creationRulesVersion",
  );
  const contentVersion = requireNonEmpty(
    input.contentVersion ?? RUN_CONTENT_VERSION,
    "contentVersion",
  );
  const worldTraitIds = uniqueOrdered(
    input.worldTraitIds ?? [],
    "world trait ID",
  );
  const mutatorIds = uniqueSorted(input.mutatorIds ?? [], "mutator ID");
  const doctrineIds = uniqueOrdered(input.doctrineIds ?? [], "doctrine ID");
  const legacyUnlockIds = uniqueSorted(
    input.legacyUnlockIds ?? [],
    "legacy unlock ID",
  );
  const originId = input.originId
    ? requireNonEmpty(input.originId, "originId")
    : undefined;
  const flawId = input.flawId
    ? requireNonEmpty(input.flawId, "flawId")
    : undefined;
  const integrity = input.integrity ?? "standard";
  const contentDefinitionIds = uniqueSorted(
    input.contentDefinitionIds ?? [],
    "content definition ID",
  );
  const manifestVersion = input.manifestVersion ?? RUN_MANIFEST_VERSION;
  const gameModeId = input.gameModeId
    ?? deriveGameModeIdFromSpecialization(input.specialization);
  if (gameModeId !== deriveGameModeIdFromSpecialization(input.specialization)) {
    throw new RangeError("gameModeId must match specialization");
  }
  const runKind = input.runKind ?? "career";
  const contentFingerprint = createContentFingerprint(
    creationRulesVersion,
    contentVersion,
    contentDefinitionIds,
  );

  const identity = {
    manifestVersion,
    rootSeed,
    creationRulesVersion,
    contentVersion,
    contentFingerprint,
    ...(manifestVersion >= 2 ? { contentDefinitionIds } : {}),
    ...(manifestVersion >= 3 ? { gameModeId, runKind } : {}),
    specialization: input.specialization,
    difficulty: input.difficulty,
    selectedCountries,
    startingCountry,
    worldTraitIds,
    mutatorIds,
    originId,
    flawId,
    doctrineIds,
    legacyUnlockIds,
    integrity,
  };
  const fingerprint = stableFingerprint(identity);

  return {
    ...identity,
    runId: `run_${fingerprint}`,
    fingerprint,
  };
}

function manifestIdentity(manifest: RunManifest): Omit<RunManifest, "runId" | "fingerprint"> {
  const identity: Omit<RunManifest, "runId" | "fingerprint"> = {
    manifestVersion: manifest.manifestVersion,
    rootSeed: manifest.rootSeed,
    creationRulesVersion: manifest.creationRulesVersion,
    contentVersion: manifest.contentVersion,
    contentFingerprint: manifest.contentFingerprint,
    specialization: manifest.specialization,
    difficulty: manifest.difficulty,
    selectedCountries: [...manifest.selectedCountries],
    startingCountry: manifest.startingCountry,
    worldTraitIds: [...manifest.worldTraitIds],
    mutatorIds: [...manifest.mutatorIds],
    originId: manifest.originId,
    flawId: manifest.flawId,
    doctrineIds: [...manifest.doctrineIds],
    legacyUnlockIds: [...manifest.legacyUnlockIds],
    integrity: manifest.integrity,
  };
  // V1 manifests predate the source ledger. Omitting it here preserves their
  // historical fingerprint exactly; V2 fingerprints bind both the ledger and
  // its derived hash.
  if (manifest.contentDefinitionIds !== undefined) {
    identity.contentDefinitionIds = uniqueSorted(
      manifest.contentDefinitionIds,
      "content definition ID",
    );
  }
  if (manifest.manifestVersion >= 3) {
    identity.gameModeId = manifest.gameModeId;
    identity.runKind = manifest.runKind;
  }
  return identity;
}

/** Recompute the immutable identity hash without trusting the persisted hash. */
export function computeRunManifestFingerprint(manifest: RunManifest): string {
  return stableFingerprint(manifestIdentity(manifest));
}

/**
 * Validate the two persisted identity fields and the seed used by the live
 * simulation. Returning every issue makes corrupted/imported saves diagnosable.
 */
export function validateRunManifest(
  manifest: RunManifest,
  expectedRootSeed?: string,
): string[] {
  const errors: string[] = [];
  if (
    manifest.manifestVersion !== 1
    && manifest.manifestVersion !== 2
    && manifest.manifestVersion !== 3
  ) {
    errors.push("run manifest version is unsupported");
  }
  if (manifest.manifestVersion >= 2 && !Array.isArray(manifest.contentDefinitionIds)) {
    errors.push("run manifest V2 is missing its content definition ledger");
  }
  if (Array.isArray(manifest.contentDefinitionIds)) {
    try {
      const expectedContentFingerprint = createContentFingerprint(
        manifest.creationRulesVersion,
        manifest.contentVersion,
        manifest.contentDefinitionIds,
      );
      if (manifest.contentFingerprint !== expectedContentFingerprint) {
        errors.push("run manifest content fingerprint does not match its definition ledger");
      }
    } catch {
      errors.push("run manifest content definition ledger is invalid");
    }
  }
  if (manifest.manifestVersion >= 3) {
    if (!manifest.gameModeId) {
      errors.push("run manifest V3 is missing its game mode");
    } else if (
      manifest.gameModeId
      !== deriveGameModeIdFromSpecialization(manifest.specialization)
    ) {
      errors.push("run manifest game mode does not match its specialization");
    }
    if (manifest.runKind !== "career" && manifest.runKind !== "challenge") {
      errors.push("run manifest V3 is missing a supported run kind");
    }
  }
  let fingerprint: string | undefined;
  try {
    fingerprint = computeRunManifestFingerprint(manifest);
  } catch {
    errors.push("run manifest immutable inputs are invalid");
  }
  if (fingerprint === undefined) return errors;
  if (manifest.fingerprint !== fingerprint) {
    errors.push("run manifest fingerprint does not match its immutable inputs");
  }
  if (manifest.runId !== `run_${fingerprint}`) {
    errors.push("run manifest ID does not match its fingerprint");
  }
  if (expectedRootSeed !== undefined && manifest.rootSeed !== expectedRootSeed) {
    errors.push("run manifest root seed does not match the simulation seed");
  }
  return errors;
}

/**
 * Repair an imported or inconsistent manifest while explicitly downgrading its
 * integrity. The content fingerprint is preserved because it identifies the
 * catalog under which the save was originally created.
 */
export function repairRunManifest(
  manifest: RunManifest,
  authoritativeRootSeed: string,
): RunManifest {
  let contentDefinitionIds: string[] | undefined;
  if (Array.isArray(manifest.contentDefinitionIds)) {
    try {
      contentDefinitionIds = uniqueSorted(
        manifest.contentDefinitionIds,
        "content definition ID",
      );
    } catch {
      contentDefinitionIds = undefined;
    }
  }
  const hasValidV3Mode = manifest.gameModeId
    === deriveGameModeIdFromSpecialization(manifest.specialization);
  const hasValidV3Kind = manifest.runKind === "career" || manifest.runKind === "challenge";
  const manifestVersion: 1 | 2 | 3 = manifest.manifestVersion === 3
    && contentDefinitionIds
    && hasValidV3Mode
    && hasValidV3Kind
    ? 3
    : (manifest.manifestVersion === 2 || manifest.manifestVersion === 3)
      && contentDefinitionIds
      ? 2
      : 1;
  const repairedContentDefinitionIds = manifestVersion >= 2
    ? contentDefinitionIds
    : undefined;
  const contentFingerprint = repairedContentDefinitionIds
    ? createContentFingerprint(
      manifest.creationRulesVersion,
      manifest.contentVersion,
      repairedContentDefinitionIds,
    )
    : manifest.contentFingerprint;
  const repairedBase: RunManifest = {
    ...manifest,
    manifestVersion,
    rootSeed: requireNonEmpty(authoritativeRootSeed, "authoritativeRootSeed"),
    contentFingerprint,
    selectedCountries: [...manifest.selectedCountries],
    worldTraitIds: [...manifest.worldTraitIds],
    mutatorIds: [...manifest.mutatorIds],
    doctrineIds: [...manifest.doctrineIds],
    legacyUnlockIds: [...manifest.legacyUnlockIds],
    contentDefinitionIds: repairedContentDefinitionIds
      ? [...repairedContentDefinitionIds]
      : undefined,
    gameModeId: manifestVersion >= 3 ? manifest.gameModeId : undefined,
    runKind: manifestVersion >= 3 ? manifest.runKind : undefined,
    integrity: "legacy-import",
    runId: "",
    fingerprint: "",
  };
  const fingerprint = computeRunManifestFingerprint(repairedBase);
  return {
    ...repairedBase,
    runId: `run_${fingerprint}`,
    fingerprint,
  };
}

function encodeScopePart(part: SeedScopePart): string {
  if (part === null) return "null:0:";
  const type = typeof part;
  if (typeof part === "number" && !Number.isFinite(part)) {
    throw new RangeError("Named RNG scope numbers must be finite");
  }
  const value = typeof part === "number" && Object.is(part, -0)
    ? "0"
    : String(part);
  return `${type}:${value.length}:${value}`;
}

/**
 * Derive a collision-resistant named seed. Length-prefixing distinguishes
 * paths such as ["ab", "c"] and ["a", "bc"], while type tags distinguish
 * the number 1 from the string "1".
 */
export function deriveNamedSeed(
  rootSeed: string,
  ...scope: readonly SeedScopePart[]
): string {
  const root = requireNonEmpty(rootSeed, "rootSeed");
  if (scope.length === 0) {
    throw new RangeError("A named RNG stream requires at least one scope part");
  }
  return [NAMED_RNG_VERSION, encodeScopePart(root), ...scope.map(encodeScopePart)].join("|");
}

/** Create an independent deterministic RNG stream for a named simulation domain. */
export function createNamedRNG(
  rootSeed: string,
  ...scope: readonly SeedScopePart[]
): RNG {
  return createRNG(deriveNamedSeed(rootSeed, ...scope));
}

/** Create a deterministic gameplay ID without wall-clock or global randomness. */
export function createDeterministicRunId(
  prefix: string,
  rootSeed: string,
  ...scope: readonly SeedScopePart[]
): string {
  const normalizedPrefix = requireNonEmpty(prefix, "ID prefix")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalizedPrefix.length === 0) {
    throw new RangeError("ID prefix must contain an alphanumeric character");
  }
  return `${normalizedPrefix}_${stableFingerprint(
    deriveNamedSeed(rootSeed, ...scope),
  )}`;
}
