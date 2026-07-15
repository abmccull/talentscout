/**
 * Bounded, in-memory persistence telemetry.
 *
 * Save records themselves remain the durable source of truth. These samples
 * exist to make write cost and deduplication observable without putting an
 * unbounded diagnostic history into every career save.
 */

export type SavePersistenceDisposition = "written" | "deduplicated";

export interface SavePersistenceTelemetrySample {
  /** Wall-clock timestamp suitable for correlating with runtime diagnostics. */
  recordedAt: number;
  slot: number;
  /** The authoritative local journal revision after this request. */
  storageRevision: number | null;
  disposition: SavePersistenceDisposition;
  /** End-to-end local persistence time, excluding asynchronous cloud upload. */
  durationMs: number;
  /**
   * UTF-8 bytes of the complete serializable save record when a write occurs.
   * A deduplicated request intentionally avoids serialization, so it is null.
   */
  payloadBytes: number | null;
  /** Bytes added to the immutable local recovery journal by this request. */
  archivedBytes: number;
}

const MAX_SAMPLES = 80;
const samples: SavePersistenceTelemetrySample[] = [];

/** Calculate UTF-8 bytes without requiring TextEncoder in every test runtime. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit < 0x80) {
      bytes += 1;
    } else if (codeUnit < 0x800) {
      bytes += 2;
    } else if (
      codeUnit >= 0xd800
      && codeUnit <= 0xdbff
      && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00
      && value.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Measure the exact JSON boundary payload when serialization is required.
 * Local structured saves call this only for a real write; deduplicated writes
 * deliberately do not pay a stringify cost merely for diagnostics.
 */
export function measureSerializedJsonBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== "string") {
    throw new Error("A save payload could not be serialized.");
  }
  return utf8ByteLength(serialized);
}

export function recordSavePersistenceTelemetry(
  sample: SavePersistenceTelemetrySample,
): void {
  samples.push({
    ...sample,
    durationMs: Math.max(0, sample.durationMs),
    archivedBytes: Math.max(0, sample.archivedBytes),
  });
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
}

/** A defensive snapshot for diagnostics, performance journeys, and tests. */
export function getRecentSavePersistenceTelemetry(): readonly SavePersistenceTelemetrySample[] {
  return samples.map((sample) => ({ ...sample }));
}

/** Test-only reset keeps persistence metrics deterministic between cases. */
export function clearSavePersistenceTelemetryForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Save telemetry resets are available only in tests.");
  }
  samples.length = 0;
}
