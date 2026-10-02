import type {
  CompactTerminalLoanV1,
  LoanDeal,
  LoanPerformanceRecord,
  StoredLoanDeal,
} from "../core/types";
import type {
  ClubFinancialObligation,
  CompactTerminalObligationV1,
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
const OBLIGATION_ENVELOPE_FIELDS = new Set(["id", "obligationArchiveV1"]);
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
    return descriptor !== undefined && descriptor.enumerable && own(descriptor, "value");
  });
}

function denseArray(value: unknown, expectedLength?: number): value is unknown[] {
  if (!Array.isArray(value) || (expectedLength !== undefined && value.length !== expectedLength)
    || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys[value.length] !== "length") return false;
  for (let index = 0; index < value.length; index += 1) {
    if (keys[index] !== String(index)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !own(descriptor, "value")) return false;
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

function knownLoan(value: unknown): value is LoanDeal {
  if (!dataRecord(value, LOAN_KEYS) || !LOAN_REQUIRED.every(key => own(value, key))
    || !member(value.status, TERMINAL_LOANS)
    || !["id", "playerId", "parentClubId", "loanClubId"].every(key => typeof value[key] === "string")
    || !["startWeek", "startSeason", "endWeek", "endSeason"].every(key => safeDate(value[key]))
    || !finite(value.loanFee) || !finite(value.wageContribution) || typeof value.recallClause !== "boolean") return false;
  for (const key of LOAN_OPTIONAL) {
    if (!own(value, key)) continue;
    const payload = value[key];
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

function knownObligation(value: unknown): value is ClubFinancialObligation {
  if (!dataRecord(value, OBLIGATION_KEYS) || !OBLIGATION_REQUIRED.every(key => own(value, key))
    || typeof value.id !== "string" || typeof value.playerId !== "string"
    || !member(value.type, OBLIGATION_TYPES) || !member(value.status, TERMINAL_OBLIGATIONS)
    || !finite(value.createdWeek) || !finite(value.createdSeason)) return false;
  for (const key of OBLIGATION_FIELDS) {
    if (REQUIRED_OBLIGATION_FIELDS.has(key) || !own(value, key) || value[key] === null) continue;
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

export function expandLoanDeal(entry: StoredLoanDeal): LoanDeal;
export function expandLoanDeal<T extends null | undefined>(entry: T): T;
export function expandLoanDeal(entry: StoredLoanDeal | undefined): LoanDeal | undefined;
export function expandLoanDeal(entry: StoredLoanDeal | null | undefined): LoanDeal | null | undefined;
export function expandLoanDeal(entry: StoredLoanDeal | null | undefined): LoanDeal | null | undefined {
  if (!Array.isArray(entry)) return entry;
  if (!denseArray(entry, 14) || entry[0] !== 1) {
    throw new InvalidTerminalRecordArchiveError("Invalid or unsupported terminal loan archive");
  }
  const optional = entry[13];
  if (!dataRecord(optional, OPTIONAL_LOAN_FIELDS)) {
    throw new InvalidTerminalRecordArchiveError("Invalid terminal loan optional archive");
  }
  const optionalEntries: [string, unknown][] = [];
  for (const [key, payload] of Object.entries(optional)) {
    if (key === "performanceRecord") {
      if (!denseArray(payload, 7) || !payload.every(finite)) {
        throw new InvalidTerminalRecordArchiveError("Invalid terminal loan performance archive");
      }
      optionalEntries.push([key, Object.fromEntries(PERFORMANCE_KEYS.map((field, index) => [field, payload[index]]))]);
    } else {
      optionalEntries.push([key, payload]);
    }
  }
  const expanded = Object.fromEntries([
    ...LOAN_REQUIRED.map((key, index): [string, unknown] => [key, entry[index + 1]]),
    ...optionalEntries,
  ]);
  if (!knownLoan(expanded)) {
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
    return entry;
  }
  if (!knownLoan(entry)) return entry;
  const optional = Object.fromEntries(Object.entries(entry)
    .filter(([key]) => OPTIONAL_LOAN_FIELDS.has(key))
    .map(([key, payload]) => [key, key === "performanceRecord"
      ? PERFORMANCE_KEYS.map(field => (payload as LoanPerformanceRecord)[field]) : payload]));
  // Screening deliberately packs every eligible terminal loan, even if larger.
  return [1, ...LOAN_REQUIRED.map(key => entry[key]), optional] as CompactTerminalLoanV1;
}

export function expandClubFinancialObligation(entry: StoredClubFinancialObligation): ClubFinancialObligation;
export function expandClubFinancialObligation<T extends null | undefined>(entry: T): T;
export function expandClubFinancialObligation(entry: StoredClubFinancialObligation | undefined): ClubFinancialObligation | undefined;
export function expandClubFinancialObligation(entry: StoredClubFinancialObligation | null | undefined): ClubFinancialObligation | null | undefined;
export function expandClubFinancialObligation(entry: StoredClubFinancialObligation | null | undefined): ClubFinancialObligation | null | undefined {
  if (!obligationArchiveShaped(entry)) return entry as ClubFinancialObligation | null | undefined;
  if (!dataRecord(entry, OBLIGATION_ENVELOPE_FIELDS)
    || !own(entry, "id") || !own(entry, "obligationArchiveV1") || typeof entry.id !== "string") {
    throw new InvalidTerminalRecordArchiveError("Invalid or unsupported terminal obligation archive");
  }
  const row = entry.obligationArchiveV1;
  if (!denseArray(row) || row.length < 1) {
    throw new InvalidTerminalRecordArchiveError("Invalid terminal obligation archive array");
  }
  const mask = row[0];
  if (typeof mask !== "number" || !Number.isInteger(mask) || mask < 0
    || mask >= OBLIGATION_MASK_LIMIT || (mask & REQUIRED_OBLIGATION_MASK) !== REQUIRED_OBLIGATION_MASK) {
    throw new InvalidTerminalRecordArchiveError("Invalid terminal obligation presence mask");
  }
  const entries: [string, unknown][] = [["id", entry.id]];
  let offset = 1;
  for (let index = 0; index < OBLIGATION_FIELDS.length; index += 1) {
    if ((mask & 2 ** index) === 0) continue;
    if (offset >= row.length) {
      throw new InvalidTerminalRecordArchiveError("Missing terminal obligation archive payload");
    }
    entries.push([OBLIGATION_FIELDS[index], row[offset]]);
    offset += 1;
  }
  if (offset !== row.length) {
    throw new InvalidTerminalRecordArchiveError("Unexpected terminal obligation archive payload");
  }
  const expanded = Object.fromEntries(entries);
  if (!knownObligation(expanded)) {
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
    return entry as StoredClubFinancialObligation;
  }
  if (!knownObligation(entry)) return entry;
  let mask = 0;
  const payload: (string | number | null)[] = [];
  OBLIGATION_FIELDS.forEach((key, index) => {
    if (own(entry, key)) {
      mask += 2 ** index;
      payload.push(entry[key] as string | number | null);
    }
  });
  const packed: CompactTerminalObligationV1 = { id: entry.id, obligationArchiveV1: [mask, ...payload] };
  const originalBytes = utf8Encoder.encode(JSON.stringify(entry)).byteLength;
  const packedBytes = utf8Encoder.encode(JSON.stringify(packed)).byteLength;
  return packedBytes < originalBytes ? packed : entry;
}
