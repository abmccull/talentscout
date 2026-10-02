import type {
  CompactTerminalLoanV1,
  CompactTerminalLoanV2,
  CompactTerminalLoanV41,
  CompactTerminalLoanV42,
  CompactLoanOptionalV1,
  StableFinancialIdentity,
  LoanDeal,
  LoanPerformanceRecord,
  StoredLoanDeal,
} from "../core/types";
import type {
  ClubFinancialObligation,
  CompactTerminalObligationV1,
  CompactTerminalObligationV2,
  CompactTerminalObligationV31,
  CompactTerminalObligationV32,
  StoredClubFinancialObligation,
} from "../core/types/world";
export type { StoredLoanDeal } from "../core/types";
export type { StoredClubFinancialObligation } from "../core/types/world";

export class InvalidTerminalRecordArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTerminalRecordArchiveError";
  }
}

const LOAN_REQUIRED = ["id", "playerId", "parentClubId", "loanClubId", "startWeek", "startSeason", "endWeek", "endSeason", "loanFee", "wageContribution", "recallClause", "status"] as const;
const LOAN_OPTIONAL = ["buyOptionFee", "outcome", "agreedPlayingTime", "startCurrentAbility", "monitoringWeeks", "scoutId", "performanceRecord"] as const;
const LOAN_KEYS = new Set<string>([...LOAN_REQUIRED, ...LOAN_OPTIONAL]);
const PERFORMANCE_KEYS = ["appearances", "goals", "assists", "avgRating", "developmentDelta", "parentClubSatisfaction", "loanClubSatisfaction"] as const;
const PERFORMANCE_FIELDS = new Set<string>(PERFORMANCE_KEYS);
const TERMINAL_LOANS = new Set(["completed", "recalled", "terminated"]);
const LOAN_OUTCOMES = new Set(["successful", "neutral", "unsuccessful", "buy-option-exercised", "recalled-early", "terminated"]);
const LOAN_ROLES = new Set(["key", "regular", "rotation", "prospect"]);
const OPTIONAL_LOAN_FIELDS = new Set<string>(LOAN_OPTIONAL);

const OBLIGATION_FIELDS = ["type", "playerId", "creditorClubId", "amount", "percentage", "weeklyAmount", "remainingWeeks", "createdWeek", "createdSeason", "status", "trigger", "triggeredWeek", "triggeredSeason", "lastProcessedWeek", "lastProcessedSeason", "appearanceThreshold", "goalThreshold", "assistThreshold", "appearancesRecorded", "goalsRecorded", "assistsRecorded", "lastTriggerEvaluationWeek", "lastTriggerEvaluationSeason"] as const;
const OBLIGATION_KEYS = new Set<string>(["id", ...OBLIGATION_FIELDS]);
const OBLIGATION_REQUIRED = ["id", "type", "playerId", "createdWeek", "createdSeason", "status"] as const;
const REQUIRED_OBLIGATION_FIELDS = new Set<string>(OBLIGATION_REQUIRED);
const OBLIGATION_TYPES = new Set(["loanWageContribution", "appearanceBonus", "performanceBonus", "relegationClause", "sellOnClause"]);
const TERMINAL_OBLIGATIONS = new Set(["settled", "expired"]);
const OBLIGATION_TEXT_OPTIONAL = new Set(["creditorClubId", "trigger"]);
const OBLIGATION_ENVELOPE_FIELDS_V1 = new Set(["id", "obligationArchiveV1"]);
const OBLIGATION_ENVELOPE_FIELDS_V2 = new Set(["id", "obligationArchiveV2"]);
const REQUIRED_OBLIGATION_MASK = 899;
const OBLIGATION_MASK_LIMIT = 2 ** OBLIGATION_FIELDS.length;
const utf8Encoder = new TextEncoder();

const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const safeDate = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const member = (value: unknown, values: ReadonlySet<string>): value is string => typeof value === "string" && values.has(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

// JSON-domain guards match screening. Exotic own data must not disappear during
// packing: inherited/accessor/nonenumerable/symbol/class shapes remain fallback.
function dataRecord(value: unknown, allowed: ReadonlySet<string>): value is Record<string, unknown> {
  if (!record(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every(key => {
    if (typeof key !== "string" || !allowed.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && descriptor.writable
      && descriptor.configurable && own(descriptor, "value");
  });
}

function denseArray(value: unknown, expectedLength?: number): value is unknown[] {
  if (!Array.isArray(value) || (expectedLength !== undefined && value.length !== expectedLength)
    || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const length = Object.getOwnPropertyDescriptor(value, "length");
  // Array length has different normal flags from a payload index. Its writable
  // flag must still survive ordinary fallback or recognized-archive refusal.
  if (!length || !own(length, "value") || !length.writable
    || length.enumerable || length.configurable) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys[value.length] !== "length") return false;
  for (let index = 0; index < value.length; index += 1) {
    if (keys[index] !== String(index)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !descriptor.writable
      || !descriptor.configurable || !own(descriptor, "value")) return false;
  }
  return true;
}

function knownPerformance(value: unknown): value is LoanPerformanceRecord {
  return dataRecord(value, PERFORMANCE_FIELDS)
    && PERFORMANCE_KEYS.every(key => own(value, key) && finite(value[key]));
}

function knownMonitoring(value: unknown): value is string[] {
  if (!denseArray(value)) return false;
  for (const item of value) if (typeof item !== "string") return false;
  return true;
}

function knownLoan(value: unknown, allowOptionalUndefined = false): value is LoanDeal {
  if (!dataRecord(value, LOAN_KEYS) || !LOAN_REQUIRED.every(key => own(value, key))
    || !member(value.status, TERMINAL_LOANS)
    || !["id", "playerId", "parentClubId", "loanClubId"].every(key => typeof value[key] === "string")
    || !["startWeek", "startSeason", "endWeek", "endSeason"].every(key => safeDate(value[key]))
    || !finite(value.loanFee) || !finite(value.wageContribution) || typeof value.recallClause !== "boolean") return false;
  for (const key of LOAN_OPTIONAL) {
    if (!own(value, key)) continue;
    const payload = value[key];
    if (allowOptionalUndefined && payload === undefined) continue;
    if (key === "buyOptionFee" || key === "startCurrentAbility") {
      if (!finite(payload)) return false;
    } else if (key === "outcome") {
      if (!member(payload, LOAN_OUTCOMES)) return false;
    } else if (key === "agreedPlayingTime") {
      if (!member(payload, LOAN_ROLES)) return false;
    } else if (key === "scoutId") {
      if (typeof payload !== "string") return false;
    } else if (key === "monitoringWeeks") {
      if (!knownMonitoring(payload)) return false;
    } else if (!knownPerformance(payload)) return false;
  }
  return true;
}

function knownObligation(value: unknown, allowOptionalUndefined = false): value is ClubFinancialObligation {
  if (!dataRecord(value, OBLIGATION_KEYS) || !OBLIGATION_REQUIRED.every(key => own(value, key))
    || typeof value.id !== "string" || typeof value.playerId !== "string"
    || !member(value.type, OBLIGATION_TYPES) || !member(value.status, TERMINAL_OBLIGATIONS)
    || !finite(value.createdWeek) || !finite(value.createdSeason)) return false;
  for (const key of OBLIGATION_FIELDS) {
    if (REQUIRED_OBLIGATION_FIELDS.has(key) || !own(value, key) || value[key] === null) continue;
    if (allowOptionalUndefined && value[key] === undefined) continue;
    if (OBLIGATION_TEXT_OPTIONAL.has(key)) {
      if (typeof value[key] !== "string") return false;
    } else if (!finite(value[key])) return false;
  }
  return true;
}

function obligationArchiveShaped(value: unknown): value is Record<string, unknown> {
  if (!record(value)) return false;
  // A full authored ordinary row keeps its extensions, including tag-looking keys.
  if (OBLIGATION_REQUIRED.every(key => own(value, key))) return false;
  return Object.getOwnPropertyNames(value).some(key => /^obligationArchiveV[0-9]+$/.test(key));
}

// Versioned closed authorities: never infer aliases or reorder a table in-place.
const LOAN_STATUS_CODES = ["completed", "recalled", "terminated"] as const;
const LOAN_OUTCOME_CODES = ["successful", "neutral", "unsuccessful", "buy-option-exercised", "recalled-early", "terminated"] as const;
const LOAN_ROLE_CODES = ["key", "regular", "rotation", "prospect"] as const;
const OBLIGATION_TYPE_CODES = ["loanWageContribution", "appearanceBonus", "performanceBonus", "relegationClause", "sellOnClause"] as const;
const OBLIGATION_STATUS_CODES = ["settled", "expired"] as const;
const OBLIGATION_ENVELOPE_FIELDS_V31 = new Set(["id", "obligationArchiveV31"]);
const OBLIGATION_ENVELOPE_FIELDS_V32 = new Set(["id", "obligationArchiveV32"]);

function enumCode(value: unknown, table: readonly string[]): number {
  const code = typeof value === "string" ? table.indexOf(value) : -1;
  if (code < 0) throw new InvalidTerminalRecordArchiveError("Unknown financial enum value");
  return code;
}

function enumText(value: unknown, table: readonly string[]): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || Object.is(value, -0)
    || value < 0 || value >= table.length) {
    throw new InvalidTerminalRecordArchiveError("Invalid financial enum code");
  }
  return table[value];
}

function jsonBytes(value: unknown): number {
  return utf8Encoder.encode(JSON.stringify(value)).byteLength;
}

function factorFinancialId(id: string, playerId: string): StableFinancialIdentity {
  if (playerId === "") return id;
  const at = id.indexOf(playerId);
  if (at < 0) return id;
  const parts: [string, string] = [id.slice(0, at), id.slice(at + playerId.length)];
  return jsonBytes(parts) < jsonBytes(id) ? parts : id;
}

function restoreFinancialId(value: unknown, playerId: unknown): string {
  if (typeof playerId !== "string") {
    throw new InvalidTerminalRecordArchiveError("Invalid financial player identity");
  }
  if (typeof value === "string") return value;
  if (playerId === "" || !denseArray(value, 2) || !value.every(part => typeof part === "string")) {
    throw new InvalidTerminalRecordArchiveError("Invalid financial identity parts");
  }
  return (value[0] as string) + playerId + (value[1] as string);
}

// Selection must not erase negative zero, prototypes, descriptors or cycles.
// Recognition/validation happens first; this guard selects exact fallback only.
function losslessLeafJSON(value: unknown, ancestors: ReadonlySet<object> = new Set()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return finite(value) && !Object.is(value, -0);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  if (Array.isArray(value)) {
    if (!denseArray(value)) return false;
  } else if (Object.getPrototypeOf(value) !== Object.prototype
    || !dataRecord(value, new Set(Object.getOwnPropertyNames(value)))) return false;
  const next = new Set(ancestors);
  next.add(value);
  return Object.keys(value).every(key => losslessLeafJSON(Object.getOwnPropertyDescriptor(value, key)!.value, next));
}

function restoreStableLoan(entry: unknown[]): CompactTerminalLoanV1 | CompactTerminalLoanV2 {
  const isV2 = entry[0] === 42;
  if (!denseArray(entry, isV2 ? 15 : 14)) {
    throw new InvalidTerminalRecordArchiveError("Invalid stable terminal loan archive");
  }
  if (isV2 && Object.is(entry[13], -0)) {
    throw new InvalidTerminalRecordArchiveError("Invalid stable terminal loan undefined mask");
  }
  const optional = entry[isV2 ? 14 : 13];
  if (!dataRecord(optional, OPTIONAL_LOAN_FIELDS) || Object.getPrototypeOf(optional) !== Object.prototype) {
    throw new InvalidTerminalRecordArchiveError("Invalid stable terminal loan optional archive");
  }
  const restored: unknown[] = [...entry];
  restored[0] = isV2 ? 2 : 1;
  restored[1] = restoreFinancialId(entry[1], entry[2]);
  restored[12] = enumText(entry[12], LOAN_STATUS_CODES);
  restored[isV2 ? 14 : 13] = Object.fromEntries(Object.entries(optional).map(([key, payload]) => [key,
    key === "outcome" ? enumText(payload, LOAN_OUTCOME_CODES)
      : key === "agreedPlayingTime" ? enumText(payload, LOAN_ROLE_CODES) : payload]));
  // The existing ordinary v1/v2 decoder validates all other masks/full facts.
  return restored as CompactTerminalLoanV1 | CompactTerminalLoanV2;
}

function upgradeStableLoan(entry: CompactTerminalLoanV1 | CompactTerminalLoanV2): StoredLoanDeal {
  if (!losslessLeafJSON(entry)) return entry;
  const packed: unknown[] = [...entry];
  packed[0] = entry[0] === 1 ? 41 : 42;
  packed[1] = factorFinancialId(entry[1], entry[2]);
  packed[12] = enumCode(entry[12], LOAN_STATUS_CODES);
  const optional = entry[entry[0] === 1 ? 13 : 14] as CompactLoanOptionalV1;
  packed[packed.length - 1] = Object.fromEntries(Object.entries(optional).map(([key, payload]) => [key,
    key === "outcome" ? enumCode(payload, LOAN_OUTCOME_CODES)
      : key === "agreedPlayingTime" ? enumCode(payload, LOAN_ROLE_CODES) : payload]));
  return jsonBytes(packed) < jsonBytes(entry)
    ? packed as CompactTerminalLoanV41 | CompactTerminalLoanV42 : entry;
}

function walkStableObligation(row: unknown[], isV2: boolean, visit: (field: string, offset: number) => void): void {
  if (!denseArray(row) || row.length < (isV2 ? 2 : 1)) {
    throw new InvalidTerminalRecordArchiveError("Invalid stable terminal obligation payload");
  }
  const mask = row[0];
  const undefinedMask = isV2 ? row[1] : 0;
  if (typeof mask !== "number" || !Number.isInteger(mask) || Object.is(mask, -0) || mask < 0
    || mask >= OBLIGATION_MASK_LIMIT || (mask & REQUIRED_OBLIGATION_MASK) !== REQUIRED_OBLIGATION_MASK) {
    throw new InvalidTerminalRecordArchiveError("Invalid stable terminal obligation presence mask");
  }
  if (typeof undefinedMask !== "number" || !Number.isInteger(undefinedMask) || Object.is(undefinedMask, -0)
    || undefinedMask < 0 || undefinedMask >= OBLIGATION_MASK_LIMIT
    || (undefinedMask & mask) !== undefinedMask || (undefinedMask & REQUIRED_OBLIGATION_MASK) !== 0) {
    throw new InvalidTerminalRecordArchiveError("Invalid stable terminal obligation undefined mask");
  }
  let offset = isV2 ? 2 : 1;
  for (let index = 0; index < OBLIGATION_FIELDS.length; index += 1) {
    const bit = 2 ** index;
    if ((mask & bit) === 0 || (undefinedMask & bit) !== 0) continue;
    if (offset >= row.length || row[offset] === undefined) {
      throw new InvalidTerminalRecordArchiveError("Missing or unmasked stable terminal obligation payload");
    }
    visit(OBLIGATION_FIELDS[index], offset);
    offset += 1;
  }
  if (offset !== row.length) {
    throw new InvalidTerminalRecordArchiveError("Extra stable terminal obligation payload");
  }
}

function restoreStableObligation(entry: Record<string, unknown>): CompactTerminalObligationV1 | CompactTerminalObligationV2 {
  const isV1 = own(entry, "obligationArchiveV31"), isV2 = own(entry, "obligationArchiveV32");
  const key = isV2 ? "obligationArchiveV32" : "obligationArchiveV31";
  if (isV1 === isV2 || !dataRecord(entry, isV2 ? OBLIGATION_ENVELOPE_FIELDS_V32 : OBLIGATION_ENVELOPE_FIELDS_V31)
    || Object.getPrototypeOf(entry) !== Object.prototype || !own(entry, "id") || !own(entry, key)) {
    throw new InvalidTerminalRecordArchiveError("Invalid stable terminal obligation envelope");
  }
  const row = entry[key];
  if (!denseArray(row)) throw new InvalidTerminalRecordArchiveError("Invalid stable terminal obligation array");
  const restoredValues: unknown[] = [...row];
  walkStableObligation(row, isV2, (field, offset) => {
    if (field === "type") restoredValues[offset] = enumText(row[offset], OBLIGATION_TYPE_CODES);
    else if (field === "status") restoredValues[offset] = enumText(row[offset], OBLIGATION_STATUS_CODES);
  });
  const id = restoreFinancialId(entry.id, restoredValues[isV2 ? 3 : 2]);
  const originalKey = isV2 ? "obligationArchiveV2" : "obligationArchiveV1";
  const restored = Object.fromEntries(Object.keys(entry).map(field => [field === "id" ? "id" : originalKey,
    field === "id" ? id : restoredValues]));
  return restored as unknown as CompactTerminalObligationV1 | CompactTerminalObligationV2;
}

function upgradeStableObligation(entry: CompactTerminalObligationV1 | CompactTerminalObligationV2): StoredClubFinancialObligation {
  if (!losslessLeafJSON(entry)) return entry;
  const isV2 = own(entry, "obligationArchiveV2");
  const row = isV2 ? (entry as CompactTerminalObligationV2).obligationArchiveV2
    : (entry as CompactTerminalObligationV1).obligationArchiveV1;
  const values: unknown[] = [...row];
  const playerId = row[isV2 ? 3 : 2];
  if (typeof playerId !== "string") throw new InvalidTerminalRecordArchiveError("Invalid financial player identity");
  const id = factorFinancialId(entry.id, playerId);
  walkStableObligation(row, isV2, (field, offset) => {
    if (field === "type") values[offset] = enumCode(row[offset], OBLIGATION_TYPE_CODES);
    else if (field === "status") values[offset] = enumCode(row[offset], OBLIGATION_STATUS_CODES);
  });
  const key = isV2 ? "obligationArchiveV32" : "obligationArchiveV31";
  const packed = Object.fromEntries(Object.keys(entry).map(field => [field === "id" ? "id" : key,
    field === "id" ? id : values]));
  return jsonBytes(packed) < jsonBytes(entry)
    ? packed as unknown as CompactTerminalObligationV31 | CompactTerminalObligationV32 : entry;
}


export function expandLoanDeal(entry: StoredLoanDeal): LoanDeal;
export function expandLoanDeal<T extends null | undefined>(entry: T): T;
export function expandLoanDeal(entry: StoredLoanDeal | undefined): LoanDeal | undefined;
export function expandLoanDeal(entry: StoredLoanDeal | null | undefined): LoanDeal | null | undefined;
export function expandLoanDeal(entry: StoredLoanDeal | null | undefined): LoanDeal | null | undefined {
  if (!Array.isArray(entry)) return entry;
  if (!denseArray(entry)) {
    throw new InvalidTerminalRecordArchiveError("Invalid terminal loan archive descriptors");
  }
  if (entry[0] === 41 || entry[0] === 42) return expandLoanDeal(restoreStableLoan(entry));
  if (!denseArray(entry)
    || (entry[0] !== 1 && entry[0] !== 2)
    || entry.length !== (entry[0] === 1 ? 14 : 15)) {
    throw new InvalidTerminalRecordArchiveError("Invalid or unsupported terminal loan archive");
  }
  const version = entry[0];
  const undefinedMask = version === 2 ? entry[13] : 0;
  if (typeof undefinedMask !== "number" || !Number.isInteger(undefinedMask)
    || undefinedMask < 0 || undefinedMask >= 2 ** LOAN_OPTIONAL.length) {
    throw new InvalidTerminalRecordArchiveError("Invalid terminal loan undefined mask");
  }
  const optional = entry[version === 2 ? 14 : 13];
  if (!dataRecord(optional, OPTIONAL_LOAN_FIELDS)) {
    throw new InvalidTerminalRecordArchiveError("Invalid terminal loan optional archive");
  }
  const optionalEntries: [string, unknown][] = [];
  for (const [key, payload] of Object.entries(optional)) {
    const bit = 2 ** LOAN_OPTIONAL.indexOf(key as typeof LOAN_OPTIONAL[number]);
    if (payload === undefined || (undefinedMask & bit) !== 0) {
      throw new InvalidTerminalRecordArchiveError("Invalid terminal loan optional ownership");
    }
    if (key === "performanceRecord") {
      if (!denseArray(payload, 7) || !payload.every(finite)) {
        throw new InvalidTerminalRecordArchiveError("Invalid terminal loan performance archive");
      }
      optionalEntries.push([key, Object.fromEntries(PERFORMANCE_KEYS.map((field, index) => [field, payload[index]]))]);
    } else {
      optionalEntries.push([key, payload]);
    }
  }
  LOAN_OPTIONAL.forEach((key, index) => {
    if ((undefinedMask & 2 ** index) !== 0) optionalEntries.push([key, undefined]);
  });
  const expanded = Object.fromEntries([
    ...LOAN_REQUIRED.map((key, index): [string, unknown] => [key, entry[index + 1]]),
    ...optionalEntries,
  ]);
  if (!knownLoan(expanded, version === 2)) {
    throw new InvalidTerminalRecordArchiveError("Invalid terminal loan archive payload");
  }
  return expanded;
}

export function compactLoanDeal(entry: StoredLoanDeal): StoredLoanDeal;
export function compactLoanDeal<T extends null | undefined>(entry: T): T;
export function compactLoanDeal(entry: StoredLoanDeal | undefined): StoredLoanDeal | undefined;
export function compactLoanDeal(entry: StoredLoanDeal | null | undefined): StoredLoanDeal | null | undefined;
export function compactLoanDeal(entry: StoredLoanDeal | null | undefined): StoredLoanDeal | null | undefined {
  if (Array.isArray(entry)) {
    expandLoanDeal(entry);
    return entry[0] === 41 || entry[0] === 42 ? entry : upgradeStableLoan(entry);
  }
  if (!knownLoan(entry, true)) return entry;
  let undefinedMask = 0;
  LOAN_OPTIONAL.forEach((key, index) => {
    if (own(entry, key) && entry[key] === undefined) undefinedMask += 2 ** index;
  });
  const optional = Object.fromEntries(Object.entries(entry)
    .filter(([key, payload]) => OPTIONAL_LOAN_FIELDS.has(key) && payload !== undefined)
    .map(([key, payload]) => [key, key === "performanceRecord"
      ? PERFORMANCE_KEYS.map(field => (payload as LoanPerformanceRecord)[field]) : payload]));
  // Screening deliberately packs every eligible terminal loan, even if larger.
  if (undefinedMask !== 0) {
    return upgradeStableLoan([2, ...LOAN_REQUIRED.map(key => entry[key]), undefinedMask, optional] as CompactTerminalLoanV2);
  }
  return upgradeStableLoan([1, ...LOAN_REQUIRED.map(key => entry[key]), optional] as CompactTerminalLoanV1);
}

export function expandClubFinancialObligation(entry: StoredClubFinancialObligation): ClubFinancialObligation;
export function expandClubFinancialObligation<T extends null | undefined>(entry: T): T;
export function expandClubFinancialObligation(entry: StoredClubFinancialObligation | undefined): ClubFinancialObligation | undefined;
export function expandClubFinancialObligation(entry: StoredClubFinancialObligation | null | undefined): ClubFinancialObligation | null | undefined;
export function expandClubFinancialObligation(entry: StoredClubFinancialObligation | null | undefined): ClubFinancialObligation | null | undefined {
  if (!obligationArchiveShaped(entry)) return entry as ClubFinancialObligation | null | undefined;
  if (own(entry, "obligationArchiveV31") || own(entry, "obligationArchiveV32")) {
    return expandClubFinancialObligation(restoreStableObligation(entry));
  }
  const isV2 = own(entry, "obligationArchiveV2");
  const archiveKey = isV2 ? "obligationArchiveV2" : "obligationArchiveV1";
  if (!dataRecord(entry, isV2 ? OBLIGATION_ENVELOPE_FIELDS_V2 : OBLIGATION_ENVELOPE_FIELDS_V1)
    || !own(entry, "id") || !own(entry, archiveKey) || typeof entry.id !== "string") {
    throw new InvalidTerminalRecordArchiveError("Invalid or unsupported terminal obligation archive");
  }
  const row = entry[archiveKey];
  if (!denseArray(row) || row.length < (isV2 ? 2 : 1)) {
    throw new InvalidTerminalRecordArchiveError("Invalid terminal obligation archive array");
  }
  const mask = row[0];
  if (typeof mask !== "number" || !Number.isInteger(mask) || mask < 0
    || mask >= OBLIGATION_MASK_LIMIT || (mask & REQUIRED_OBLIGATION_MASK) !== REQUIRED_OBLIGATION_MASK) {
    throw new InvalidTerminalRecordArchiveError("Invalid terminal obligation presence mask");
  }
  const undefinedMask = isV2 ? row[1] : 0;
  if (typeof undefinedMask !== "number" || !Number.isInteger(undefinedMask)
    || undefinedMask < 0 || undefinedMask >= OBLIGATION_MASK_LIMIT
    || (undefinedMask & mask) !== undefinedMask
    || (undefinedMask & REQUIRED_OBLIGATION_MASK) !== 0) {
    throw new InvalidTerminalRecordArchiveError("Invalid terminal obligation undefined mask");
  }
  const entries: [string, unknown][] = [["id", entry.id]];
  let offset = isV2 ? 2 : 1;
  for (let index = 0; index < OBLIGATION_FIELDS.length; index += 1) {
    if ((mask & 2 ** index) === 0) continue;
    if ((undefinedMask & 2 ** index) !== 0) {
      entries.push([OBLIGATION_FIELDS[index], undefined]);
      continue;
    }
    if (offset >= row.length) {
      throw new InvalidTerminalRecordArchiveError("Missing terminal obligation archive payload");
    }
    if (row[offset] === undefined) {
      throw new InvalidTerminalRecordArchiveError("Invalid terminal obligation unmasked payload");
    }
    entries.push([OBLIGATION_FIELDS[index], row[offset]]);
    offset += 1;
  }
  if (offset !== row.length) {
    throw new InvalidTerminalRecordArchiveError("Unexpected terminal obligation archive payload");
  }
  const expanded = Object.fromEntries(entries);
  if (!knownObligation(expanded, isV2)) {
    throw new InvalidTerminalRecordArchiveError("Invalid terminal obligation archive payload");
  }
  return expanded;
}

export function compactClubFinancialObligation(entry: StoredClubFinancialObligation): StoredClubFinancialObligation;
export function compactClubFinancialObligation<T extends null | undefined>(entry: T): T;
export function compactClubFinancialObligation(entry: StoredClubFinancialObligation | undefined): StoredClubFinancialObligation | undefined;
export function compactClubFinancialObligation(entry: StoredClubFinancialObligation | null | undefined): StoredClubFinancialObligation | null | undefined;
export function compactClubFinancialObligation(entry: StoredClubFinancialObligation | null | undefined): StoredClubFinancialObligation | null | undefined {
  if (obligationArchiveShaped(entry)) {
    expandClubFinancialObligation(entry as StoredClubFinancialObligation);
    return own(entry, "obligationArchiveV31") || own(entry, "obligationArchiveV32")
      ? entry as StoredClubFinancialObligation
      : upgradeStableObligation(entry as unknown as CompactTerminalObligationV1 | CompactTerminalObligationV2);
  }
  if (!knownObligation(entry, true)) return entry;
  let mask = 0;
  let undefinedMask = 0;
  const payload: (string | number | null)[] = [];
  OBLIGATION_FIELDS.forEach((key, index) => {
    if (own(entry, key)) {
      mask += 2 ** index;
      if (entry[key] === undefined) undefinedMask += 2 ** index;
      else payload.push(entry[key] as string | number | null);
    }
  });
  const packed: CompactTerminalObligationV1 | CompactTerminalObligationV2 = undefinedMask === 0
    ? { id: entry.id, obligationArchiveV1: [mask, ...payload] }
    : { id: entry.id, obligationArchiveV2: [mask, undefinedMask, ...payload] };
  const candidate = upgradeStableObligation(packed);
  return jsonBytes(candidate) < jsonBytes(entry) ? candidate : entry;
}
