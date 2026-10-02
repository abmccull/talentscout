// Browser-safe lossless movement collection storage.
import type { PlayerMovementEvent, PlayerMovementType } from "@/engine/core/types";
import type { MovementRowsArchiveV1 } from "@/engine/core/types/historyStorage";
export type { MovementRowsArchiveV1 } from "@/engine/core/types/historyStorage";
import type { StoredPlayerMovementSummary } from "@/engine/world/worldHistoryTypes";

type Kind = 0 | 1;
type OriginalSummaryId = string | [string, string];
interface Facts extends Record<string, unknown> {
  id: OriginalSummaryId;
  playerId: string;
  type: PlayerMovementType;
  week: number;
  season?: number;
}
type RowInfo = { eligible: true; source: Kind; facts: Facts }
  | { eligible: false; reason: string };
export type StoredPlayerMovementHistory = PlayerMovementEvent[] | MovementRowsArchiveV1;
export type StoredPlayerMovementSummaries = StoredPlayerMovementSummary[] | MovementRowsArchiveV1;

export class InvalidMovementRowsArchiveError extends Error {
  constructor(message: string, public readonly code: "CORRUPT_SAVE" | "FUTURE_VERSION" = "CORRUPT_SAVE") {
    super(`Invalid movement archive: ${message}`);
    this.name = "InvalidMovementRowsArchiveError";
  }
}

const TYPES: readonly PlayerMovementType[] = Object.freeze([
  "youthSigning", "permanentTransfer", "loanStart", "loanReturn", "loanRecall",
  "loanBuyOption", "release", "freeAgentSigning", "contractRenewal", "retirement", "footballExit",
]);
const RAW_OPTIONAL = ["fromClubId", "toClubId", "contractClubId", "fee", "loanDealId", "reason", "financialSettlements"] as const;
const SUMMARY_OPTIONAL = ["fromClubId", "toClubId", "contractClubId", "fee"] as const;
const RAW_KEYS = new Set<string>(["id", "playerId", "type", "week", "season", ...RAW_OPTIONAL]);
const SUMMARY_KEYS = new Set<string>(["id", "playerId", "type", "week", ...SUMMARY_OPTIONAL]);
const encoder = new TextEncoder();
const own = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
const finite = (value: unknown): value is number => typeof value === "number"
  && Number.isFinite(value) && !Object.is(value, -0);
function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InvalidMovementRowsArchiveError(message);
}
function descriptor(value: unknown, key: PropertyKey): PropertyDescriptor | undefined {
  return value !== null && typeof value === "object" ? Object.getOwnPropertyDescriptor(value, key) : undefined;
}
function data(value: unknown, key: PropertyKey): unknown {
  const d = descriptor(value, key);
  return d && own(d, "value") ? d.value : undefined;
}
function normalData(d: PropertyDescriptor | undefined): boolean {
  return Boolean(d && own(d, "value") && d.enumerable && d.writable && d.configurable);
}
function ordinaryObject(value: unknown, allowed: ReadonlySet<string> | null = null): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Reflect.ownKeys(value).every(key => typeof key === "string"
    && (!allowed || allowed.has(key)) && normalData(descriptor(value, key)));
}
function denseArray(value: unknown, expectedLength: number | null = null): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || expectedLength !== null && value.length !== expectedLength) return false;
  const keys = Reflect.ownKeys(value), length = descriptor(value, "length");
  if (!length || !own(length, "value") || !length.writable || length.enumerable || length.configurable
    || keys.length !== value.length + 1 || keys[value.length] !== "length") return false;
  for (let i = 0; i < value.length; i++) {
    if (keys[i] !== String(i) || !normalData(descriptor(value, String(i)))) return false;
  }
  return true;
}
function jsonData(value: unknown, active = new Set<object>(), allowUndefined = true): boolean {
  if (value === undefined) return allowUndefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return finite(value);
  if (typeof value !== "object" || active.has(value)) return false;
  if (Array.isArray(value) ? !denseArray(value) : !ordinaryObject(value)) return false;
  active.add(value);
  const children: unknown[] = Array.isArray(value) ? value : Object.keys(value).map(key => data(value, key));
  const result = children.every(child => jsonData(child, active, allowUndefined));
  active.delete(value);
  return result;
}
// Called only on guarded source rows or newly built plain payloads. No whole GameState charge.
const jsonBytes = (value: unknown): number => encoder.encode(JSON.stringify(value)).byteLength;
function fields(kind: Kind): readonly string[] { return kind === 0 ? RAW_OPTIONAL : SUMMARY_OPTIONAL; }
interface Layout {
  source: number; mask: number; undefinedMask: number; id: number; player: number;
  type: number; week: number; season: number; optionalStart: number;
}
function layout(kind: Kind): Layout {
  return kind === 0
    ? { source: -1, mask: 0, undefinedMask: 1, id: 2, player: 3, type: 4, week: 5, season: 6, optionalStart: 7 }
    : { source: 0, mask: 1, undefinedMask: 2, id: 3, player: 4, type: 5, week: 6, season: -1, optionalStart: 7 };
}
function validType(value: unknown): value is PlayerMovementType {
  return typeof value === "string" && (TYPES as readonly string[]).includes(value);
}
function validOptional(kind: Kind, key: string, value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (key === "fee") return finite(value);
  if (kind === 0 && key === "financialSettlements") return denseArray(value) && jsonData(value, new Set(), false);
  return typeof value === "string";
}
function objectInfo(kind: Kind, row: unknown): RowInfo {
  if (!ordinaryObject(row, kind === 0 ? RAW_KEYS : SUMMARY_KEYS)) {
    return { eligible: false, reason: "unknown-or-exotic-object" };
  }
  const required = kind === 0 ? ["id", "playerId", "type", "week", "season"] : ["id", "playerId", "type", "week"];
  if (!required.every(key => own(row, key)) || typeof row.id !== "string" || !row.id
    || typeof row.playerId !== "string" || !row.playerId || !validType(row.type)
    || !finite(row.week) || kind === 0 && !finite(row.season)) {
    return { eligible: false, reason: "unsupported-required-value" };
  }
  if (fields(kind).some(key => own(row, key) && !validOptional(kind, key, row[key]))) {
    return { eligible: false, reason: "unsupported-optional-value" };
  }
  return { eligible: true, source: 0, facts: row as Facts };
}
function summaryInfo(row: unknown): RowInfo {
  if (!Array.isArray(row)) return objectInfo(1, row);
  if (!denseArray(row) || row.length < 5) return { eligible: false, reason: "exotic-or-short-existing-summary" };
  const [id, playerId, type, week, mask] = row;
  const validId = typeof id === "string" && id.length > 0
    || denseArray(id, 2) && id.every(part => typeof part === "string");
  if (!validId || typeof playerId !== "string" || !playerId || !validType(type) || !finite(week)
    || typeof mask !== "number" || !Number.isSafeInteger(mask) || mask < 0 || mask >= 16) {
    return { eligible: false, reason: "unsupported-existing-summary-header" };
  }
  let cursor = 5;
  const facts: Facts = { id: id as OriginalSummaryId, playerId, type, week };
  for (let bit = 0; bit < SUMMARY_OPTIONAL.length; bit++) {
    if (mask & 2 ** bit) {
      if (cursor >= row.length || !validOptional(1, SUMMARY_OPTIONAL[bit], row[cursor])) {
        return { eligible: false, reason: "unsupported-existing-summary-optional" };
      }
      facts[SUMMARY_OPTIONAL[bit]] = row[cursor++];
    }
  }
  if (cursor !== row.length) return { eligible: false, reason: "unknown-existing-summary-columns" };
  return { eligible: true, source: 1, facts };
}
function info(kind: Kind, row: unknown): RowInfo { return kind === 0 ? objectInfo(0, row) : summaryInfo(row); }

// Factor0 reconstructs prefix + exact stored playerId + suffix; factor1 restores the old ID pair.
function factorString(value: unknown, playerId: string): unknown {
  if (typeof value !== "string" || !playerId) return value;
  const offset = value.indexOf(playerId);
  if (offset < 0) return value;
  const packed = [0, value.slice(0, offset), value.slice(offset + playerId.length)];
  return jsonBytes(packed) < jsonBytes(value) ? packed : value;
}
function encodePayload(kind: Kind, rowInfo: Extract<RowInfo, { eligible: true }>): unknown[] {
  const row = rowInfo.facts;
  let mask = 0, undefinedMask = 0;
  const values: unknown[] = [];
  fields(kind).forEach((key, bit) => {
    if (!own(row, key)) return;
    mask += 2 ** bit;
    if (row[key] === undefined) undefinedMask += 2 ** bit;
    else values.push(key === "loanDealId" ? factorString(row[key], row.playerId) : row[key]);
  });
  const id = Array.isArray(row.id) ? [1, row.id[0], row.id[1]] : factorString(row.id, row.playerId);
  return kind === 0
    ? [mask, undefinedMask, id, row.playerId, TYPES.indexOf(row.type), row.week, row.season, ...values]
    : [rowInfo.source, mask, undefinedMask, id, row.playerId, TYPES.indexOf(row.type), row.week, ...values];
}
type TextTransform = (value: unknown) => unknown;
function transformStrings(kind: Kind, payload: unknown[], transform: TextTransform): unknown[] {
  const L = layout(kind), result = payload.slice();
  const id = result[L.id];
  result[L.id] = Array.isArray(id) ? [id[0], transform(id[1]), transform(id[2])] : transform(id);
  result[L.player] = transform(result[L.player]);
  const optional = fields(kind);
  let cursor = L.optionalStart;
  for (let bit = 0; bit < optional.length; bit++) {
    if (!((result[L.mask] as number) & 2 ** bit) || (result[L.undefinedMask] as number) & 2 ** bit) continue;
    const value = result[cursor];
    if (optional[bit] !== "fee" && optional[bit] !== "financialSettlements" && value !== null) {
      result[cursor] = Array.isArray(value) ? [value[0], transform(value[1]), transform(value[2])] : transform(value);
    }
    cursor++;
  }
  return result;
}
function textToken(value: unknown, dictionary: readonly string[]): string {
  if (typeof value === "string") return value;
  requireCondition(finite(value) && Number.isSafeInteger(value) && value >= 0
    && value < dictionary.length, "dictionary reference is not a bounded integer");
  return dictionary[value];
}
function validateFactor(value: unknown, allowOldPair: boolean): void {
  if (!Array.isArray(value)) return;
  // Inspect nested descriptors before transformStrings can read a factored tuple.
  requireCondition(denseArray(value, 3) && (value[0] === 0 || allowOldPair && value[0] === 1),
    "invalid factored ID payload");
}
function decodeString(value: unknown, playerId: string, allowOldPair = false): OriginalSummaryId {
  if (typeof value === "string") return value;
  requireCondition(denseArray(value, 3) && (value[0] === 0 || allowOldPair && value[0] === 1)
    && typeof value[1] === "string" && typeof value[2] === "string", "invalid factored ID payload");
  return value[0] === 1 ? [value[1], value[2]] : value[1] + playerId + value[2];
}
function decodePayload(kind: Kind, stored: unknown, dictionary: readonly string[]): unknown {
  requireCondition(denseArray(stored) && stored.length >= 7, "invalid movement payload length");
  const L = layout(kind), optional = fields(kind), maskLimit = 2 ** optional.length;
  const mask = stored[L.mask], undefinedMask = stored[L.undefinedMask], typeCode = stored[L.type];
  requireCondition(finite(mask) && Number.isSafeInteger(mask) && mask >= 0 && mask < maskLimit
    && finite(undefinedMask) && Number.isSafeInteger(undefinedMask) && undefinedMask >= 0
    && undefinedMask < maskLimit && (undefinedMask & ~mask) === 0, "unknown presence/undefined bits");
  if (kind === 1) requireCondition(stored[L.source] === 0 || stored[L.source] === 1, "unknown original summary shape");
  requireCondition(finite(typeCode) && Number.isSafeInteger(typeCode)
    && typeCode >= 0 && typeCode < TYPES.length, "unknown movement type code");
  const oldPair = kind === 1 && stored[L.source] === 1;
  validateFactor(stored[L.id], oldPair);
  let expectedLength = L.optionalStart;
  for (let bit = 0; bit < optional.length; bit++) {
    if (!(mask & 2 ** bit) || undefinedMask & 2 ** bit) continue;
    requireCondition(expectedLength < stored.length, "missing optional column");
    if (optional[bit] === "loanDealId") validateFactor(stored[expectedLength], false);
    else if (optional[bit] !== "fee" && optional[bit] !== "financialSettlements") {
      requireCondition(!Array.isArray(stored[expectedLength]), "factor in an unsupported text slot");
    }
    expectedLength++;
  }
  requireCondition(expectedLength === stored.length, "extra movement columns");
  const payload = transformStrings(kind, stored, value => textToken(value, dictionary));
  const playerId = payload[L.player];
  requireCondition(typeof playerId === "string" && playerId.length > 0, "invalid stored player anchor");
  const id = decodeString(payload[L.id], playerId, oldPair), week = payload[L.week];
  requireCondition(finite(week), "nonfinite or signed-zero movement week");
  const row: Facts = { id, playerId, type: TYPES[typeCode], week };
  if (kind === 0) {
    const season = payload[L.season];
    requireCondition(finite(season), "nonfinite or signed-zero movement season");
    row.season = season;
  }
  let cursor = L.optionalStart;
  for (let bit = 0; bit < optional.length; bit++) {
    if (!(mask & 2 ** bit)) continue;
    if (undefinedMask & 2 ** bit) row[optional[bit]] = undefined;
    else {
      const value = payload[cursor++];
      row[optional[bit]] = optional[bit] === "loanDealId" && value !== null
        ? decodeString(value, playerId) : value;
    }
  }
  if (kind === 0 || payload[L.source] === 0) {
    requireCondition(objectInfo(kind, row).eligible, "unsupported decoded movement facts");
    return row;
  }
  const original: unknown[] = [id, playerId, row.type, row.week, mask];
  optional.forEach((key, bit) => { if (mask & 2 ** bit) original.push(row[key]); });
  requireCondition(summaryInfo(original).eligible, "unsupported reconstructed original summary");
  return original;
}
function dictionaryFor(kind: Kind, payloads: (unknown[] | null)[]): string[] {
  const counts = new Map<string, number>();
  for (const payload of payloads) {
    if (!payload) continue;
    transformStrings(kind, payload, value => {
      requireCondition(typeof value === "string", "encoder observed unsupported string leaf");
      counts.set(value, (counts.get(value) ?? 0) + 1);
      return value;
    });
  }
  const repeated = [...counts.entries()].filter(([, count]) => count > 1);
  const maxReferenceBytes = String(Math.max(0, repeated.length - 1)).length;
  return repeated.filter(([value, count]) => (jsonBytes(value) - maxReferenceBytes) * count > jsonBytes(value) + 1)
    .map(([value]) => value);
}
function archiveKeys(value: unknown): string[] {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.getOwnPropertyNames(value).filter(key => /^movementRowsV[0-9]+$/.test(key)) : [];
}
function decodeCollection(value: unknown, expectedKind: Kind): unknown {
  const keys = archiveKeys(value);
  if (keys.length === 0) return value;
  if (keys.some(key => Number(key.slice("movementRowsV".length)) > 1)) {
    throw new InvalidMovementRowsArchiveError("unsupported future collection version", "FUTURE_VERSION");
  }
  requireCondition(ordinaryObject(value, new Set(["movementRowsV1"])) && own(value, "movementRowsV1"),
    "unknown version, extension or exotic collection archive");
  const packed = value.movementRowsV1;
  requireCondition(denseArray(packed, 3) && packed[0] === expectedKind, "invalid collection scope/payload");
  const dictionary = packed[1], entries = packed[2];
  requireCondition(denseArray(dictionary) && dictionary.every(item => typeof item === "string")
    && new Set(dictionary).size === dictionary.length, "invalid or duplicate dictionary");
  requireCondition(denseArray(entries), "invalid entry collection");
  const strings = dictionary as string[];
  return entries.map(entry => {
    requireCondition(denseArray(entry) && (entry[0] === 0 || entry[0] === 1), "invalid packed/fallback discriminator");
    if (entry[0] === 0) {
      requireCondition(entry.length === 2 && jsonData(entry[1], new Set(), false), "invalid opaque fallback");
      return entry[1];
    }
    return decodePayload(expectedKind, entry.slice(1), strings);
  });
}
function variant(kind: Kind, collection: unknown[], payloads: (unknown[] | null)[], dictionary: string[]): {
  container: MovementRowsArchiveV1; bytes: number;
} {
  const references = new Map(dictionary.map((value, index) => [value, index] as const));
  const entries = collection.map((row, index): unknown[] => {
    const payload = payloads[index];
    if (!payload) return [0, row];
    const shared = transformStrings(kind, payload, value => typeof value === "string" && references.has(value)
      ? references.get(value) : value);
    const entry = [1, ...shared];
    return jsonBytes(entry) < jsonBytes(row) ? entry : [0, row];
  });
  const container: MovementRowsArchiveV1 = { movementRowsV1: [kind, dictionary, entries] };
  return { container, bytes: jsonBytes(container) };
}
function compactCollection(kind: Kind, collection: unknown): unknown {
  if (archiveKeys(collection).length > 0) {
    decodeCollection(collection, kind); // Idempotence validates recognized existing storage first.
    return collection;
  }
  if (!denseArray(collection) || !jsonData(collection)) return collection;
  const infos = collection.map(row => info(kind, row));
  // Only declared optional undefined has an explicit mask. Opaque undefined stays exact original scope.
  if (infos.some((value, index) => !value.eligible && !jsonData(collection[index], new Set(), false))) return collection;
  const payloads = infos.map(value => value.eligible ? encodePayload(kind, value) : null);
  const originalBytes = jsonBytes(collection);
  const simple = variant(kind, collection, payloads, []);
  const dictionary = variant(kind, collection, payloads, dictionaryFor(kind, payloads));
  let best = simple.bytes < originalBytes ? simple : null;
  if (dictionary.bytes < originalBytes && (!best || dictionary.bytes < best.bytes)) best = dictionary;
  return best ? best.container : collection;
}

export function compactPlayerMovementHistory(stored: StoredPlayerMovementHistory): StoredPlayerMovementHistory {
  return compactCollection(0, stored) as StoredPlayerMovementHistory;
}
export function expandPlayerMovementHistory(stored: StoredPlayerMovementHistory): PlayerMovementEvent[] {
  return decodeCollection(stored, 0) as PlayerMovementEvent[];
}
export function compactPlayerMovementSummaries(stored: StoredPlayerMovementSummaries): StoredPlayerMovementSummaries {
  return compactCollection(1, stored) as StoredPlayerMovementSummaries;
}
export function expandPlayerMovementSummaries(stored: StoredPlayerMovementSummaries): StoredPlayerMovementSummary[] {
  return decodeCollection(stored, 1) as StoredPlayerMovementSummary[];
}
