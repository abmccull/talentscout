// Exact lossless leaf port; no state transform, retention, enum normalization or Node runtime imports.
import type { ObservationSituationSnapshot } from "./situations";
import type { StoredObservationSituationSnapshot } from "../core/types/historyStorage";
export type { StoredObservationSituationSnapshot } from "../core/types/historyStorage";

export class InvalidObservationSituationArchiveError extends Error {
  constructor(reason: string) {
    super(`Invalid observation situation archive: ${reason}`);
    this.name = "InvalidObservationSituationArchiveError";
  }
}

const TAG = "observationSituationV1";
const FIELDS = [
  "version", "id", "activityType", "observationContext", "venueType", "countryId", "travelPosture",
  "competitionLevel", "stakes", "tacticalFrame", "weather", "chaosLevel", "crowdIntensity",
  "atmosphereEventIds", "signalByDomain", "signalByAttribute", "uncertaintyMultiplier",
  "misleadingSignalRisk", "repetitionKey", "culturalInsightIds", "culturalCalendarWindowIds",
  "contextTags", "biasWarnings", "reasons",
] as const;
const REQUIRED = [
  "version", "id", "activityType", "venueType", "competitionLevel", "stakes", "tacticalFrame",
  "chaosLevel", "crowdIntensity", "atmosphereEventIds", "signalByDomain", "signalByAttribute",
  "uncertaintyMultiplier", "misleadingSignalRisk", "repetitionKey", "culturalInsightIds",
  "contextTags", "biasWarnings", "reasons",
] as const;
type Field = typeof FIELDS[number];
const KEYS = new Set<string>(FIELDS);
const OPTIONAL = new Set<string>(["observationContext", "countryId", "travelPosture", "weather", "culturalCalendarWindowIds"]);
const NUMBERS = new Set<string>(["chaosLevel", "crowdIntensity", "uncertaintyMultiplier", "misleadingSignalRisk"]);
const ARRAYS = new Set<string>(["atmosphereEventIds", "culturalInsightIds", "culturalCalendarWindowIds", "contextTags", "biasWarnings", "reasons"]);
const MAPS = new Set<string>(["signalByDomain", "signalByAttribute"]);
const MASK_LIMIT = 2 ** FIELDS.length;
const REQUIRED_MASK = 15_727_511;
const own = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const dataDescriptor = (descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } =>
  descriptor !== undefined && own(descriptor, "value") && descriptor.enumerable === true
  && descriptor.writable === true && descriptor.configurable === true;
const exactNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0);

function ordinary(value: unknown, allowed?: ReadonlySet<string>): value is Record<string, unknown> {
  if (!object(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Reflect.ownKeys(value).every(key => typeof key === "string"
    && (!allowed || allowed.has(key)) && dataDescriptor(Object.getOwnPropertyDescriptor(value, key)));
}

function dense(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const length = Object.getOwnPropertyDescriptor(value, "length");
  if (!length || !own(length, "value") || !Number.isSafeInteger(length.value) || length.value < 0
    || length.writable !== true || length.enumerable !== false || length.configurable !== false) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length.value + 1 || keys[keys.length - 1] !== "length") return false;
  for (let i = 0; i < length.value; i++) {
    if (keys[i] !== String(i) || !dataDescriptor(Object.getOwnPropertyDescriptor(value, String(i)))) return false;
  }
  return true;
}

function strings(value: unknown): value is string[] {
  return dense(value) && value.every(entry => typeof entry === "string");
}
function numbers(value: unknown): value is Record<string, number> {
  if (!ordinary(value)) return false;
  return Reflect.ownKeys(value).every(key => exactNumber(Object.getOwnPropertyDescriptor(value, key)!.value));
}

function known(value: unknown): value is ObservationSituationSnapshot {
  if (!ordinary(value, KEYS) || !REQUIRED.every(key => own(value, key))) return false;
  if (Object.getOwnPropertyDescriptor(value, "version")!.value !== 1) return false;
  for (const key of FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    const entry: unknown = descriptor.value;
    if (OPTIONAL.has(key) && (entry === undefined || entry === null)) continue;
    if (key === "version") continue;
    if (NUMBERS.has(key)) { if (!exactNumber(entry)) return false; }
    else if (ARRAYS.has(key)) { if (!strings(entry)) return false; }
    else if (MAPS.has(key)) { if (!numbers(entry)) return false; }
    else if (typeof entry !== "string") return false;
  }
  return true;
}

function refuse(reason: string): never { throw new InvalidObservationSituationArchiveError(reason); }

function decode(input: unknown): unknown {
  if (!object(input) || !own(input, TAG)) return input;
  // A complete logical snapshot with a tag-looking extension remains authored custom data.
  // Own-property checks do not evaluate accessors, even on that fallback path.
  if (REQUIRED.every(key => own(input, key))) return input;
  if (!ordinary(input, new Set([TAG]))) refuse("noncanonical envelope descriptors or fields");
  const payload: unknown = Object.getOwnPropertyDescriptor(input, TAG)!.value;
  if (!dense(payload)) refuse("noncanonical or sparse payload");
  if (payload.length < 3 || payload[0] !== 1) refuse("unsupported archive version or header");
  const presence = payload[1], undefinedMask = payload[2];
  if (typeof presence !== "number" || !Number.isSafeInteger(presence) || presence < 0 || Object.is(presence, -0) || presence >= MASK_LIMIT
    || typeof undefinedMask !== "number" || !Number.isSafeInteger(undefinedMask) || undefinedMask < 0 || Object.is(undefinedMask, -0) || undefinedMask >= MASK_LIMIT)
    refuse("invalid presence or undefined mask");
  if ((undefinedMask & presence) !== undefinedMask) refuse("undefined bit is not present");
  if ((presence & REQUIRED_MASK) !== REQUIRED_MASK) refuse("missing required field");
  if ((undefinedMask & REQUIRED_MASK) !== 0) refuse("required field is undefined");
  const entries: [Field, unknown][] = [];
  let offset = 3;
  for (let index = 0; index < FIELDS.length; index++) {
    const bit = 2 ** index;
    if (!(presence & bit)) continue;
    if (undefinedMask & bit) entries.push([FIELDS[index], undefined]);
    else {
      if (offset >= payload.length) refuse("missing payload value");
      entries.push([FIELDS[index], payload[offset++]]);
    }
  }
  if (offset !== payload.length) refuse("extra payload values");
  const restored = Object.fromEntries(entries);
  if (!known(restored)) refuse("unsupported field values or nested descriptors");
  return restored;
}

function encode(input: ObservationSituationSnapshot): StoredObservationSituationSnapshot {
  let presence = 0, undefinedMask = 0;
  const values: unknown[] = [];
  FIELDS.forEach((key, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor) return;
    const bit = 2 ** index; presence += bit;
    if (descriptor.value === undefined) undefinedMask += bit;
    else values.push(descriptor.value);
  });
  return { observationSituationV1: [1, presence, undefinedMask, ...values] };
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Preserve ordinary custom inputs exactly; malformed recognized archives refuse before any getters. */
export function compactObservationSituationSnapshot<T>(input: T): T | StoredObservationSituationSnapshot {
  const decoded = decode(input);
  if (decoded !== input) return input;
  if (!known(input)) return input;
  const candidate = encode(input);
  return jsonBytes(candidate) < jsonBytes(input) ? candidate : input;
}

export function expandObservationSituationSnapshot(
  input: ObservationSituationSnapshot | StoredObservationSituationSnapshot,
): ObservationSituationSnapshot;
export function expandObservationSituationSnapshot(
  input: ObservationSituationSnapshot | StoredObservationSituationSnapshot | undefined,
): ObservationSituationSnapshot | undefined;
export function expandObservationSituationSnapshot<T>(input: T): T | ObservationSituationSnapshot;
export function expandObservationSituationSnapshot(input: unknown): unknown { return decode(input); }
