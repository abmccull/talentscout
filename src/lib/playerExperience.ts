/**
 * Small, profile-scoped experience record shared by tutorial UI and saves.
 *
 * This is intentionally separate from GameState: finishing onboarding is a
 * property of the person playing TalentScout, not of one scout career. The
 * browser cache keeps offline starts fast, while save envelopes carry the same
 * record through IndexedDB, Steam Cloud, and authenticated Supabase slots.
 */

export const CURRENT_PLAYER_EXPERIENCE_VERSION = 2;
export const PLAYER_EXPERIENCE_STORAGE_KEY = "talentscout_player_experience";
export const MAX_RECENT_VETERAN_PROLOGUE_TEMPLATES = 3;

export interface PlayerExperienceRecord {
  version: number;
  tutorial: {
    completed: boolean;
    dismissed: boolean;
  };
  /** Oldest-to-newest history used to avoid repetitive veteran openings. */
  recentVeteranPrologueTemplateIds: string[];
  updatedAt: number;
}

export const DEFAULT_PLAYER_EXPERIENCE: Readonly<PlayerExperienceRecord> =
  Object.freeze({
    version: CURRENT_PLAYER_EXPERIENCE_VERSION,
    tutorial: Object.freeze({
      completed: false,
      dismissed: false,
    }),
    recentVeteranPrologueTemplateIds: Object.freeze([]) as unknown as string[],
    updatedAt: 0,
  });

type PlayerExperienceListener = (record: PlayerExperienceRecord) => void;

const listeners = new Set<PlayerExperienceListener>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function boundedRecentTemplateIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const uniqueNewestFirst = new Set<string>();
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const entry = value[index];
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (id.length === 0) continue;
    uniqueNewestFirst.add(id);
    if (uniqueNewestFirst.size >= MAX_RECENT_VETERAN_PROLOGUE_TEMPLATES) break;
  }
  return [...uniqueNewestFirst].reverse();
}

function appendRecentTemplateIds(older: string[], newer: string[]): string[] {
  return boundedRecentTemplateIds([...older, ...newer]);
}

/**
 * Normalize current records and the legacy tutorial-store shape.
 *
 * Legacy input support is deliberate: released builds persisted
 * `guidedSessionCompleted` and `dismissed` directly in talentscout_tutorial.
 */
export function migratePlayerExperience(raw: unknown): PlayerExperienceRecord {
  if (!isRecord(raw)) {
    return {
      version: CURRENT_PLAYER_EXPERIENCE_VERSION,
      tutorial: { ...DEFAULT_PLAYER_EXPERIENCE.tutorial },
      recentVeteranPrologueTemplateIds: [],
      updatedAt: 0,
    };
  }

  const tutorial = isRecord(raw.tutorial) ? raw.tutorial : {};
  return {
    version: CURRENT_PLAYER_EXPERIENCE_VERSION,
    tutorial: {
      completed:
        tutorial.completed === true
        || raw.completed === true
        || raw.guidedSessionCompleted === true,
      dismissed: tutorial.dismissed === true || raw.dismissed === true,
    },
    recentVeteranPrologueTemplateIds: boundedRecentTemplateIds(
      raw.recentVeteranPrologueTemplateIds,
    ),
    updatedAt: finiteTimestamp(raw.updatedAt),
  };
}

/**
 * Deterministic, monotonic merge. Completion and permanent dismissal are
 * account experience facts, so either side winning is enough to preserve them.
 */
export function mergePlayerExperience(
  left: unknown,
  right: unknown,
): PlayerExperienceRecord {
  const a = migratePlayerExperience(left);
  const b = migratePlayerExperience(right);
  // When timestamps tie, canonical lexical ordering makes the merge
  // commutative rather than depending on backend response order.
  const [older, newer] = a.updatedAt < b.updatedAt
    ? [a, b]
    : a.updatedAt > b.updatedAt
      ? [b, a]
      : JSON.stringify(a.recentVeteranPrologueTemplateIds)
          <= JSON.stringify(b.recentVeteranPrologueTemplateIds)
        ? [a, b]
        : [b, a];
  return {
    version: CURRENT_PLAYER_EXPERIENCE_VERSION,
    tutorial: {
      completed: a.tutorial.completed || b.tutorial.completed,
      dismissed: a.tutorial.dismissed || b.tutorial.dismissed,
    },
    recentVeteranPrologueTemplateIds: appendRecentTemplateIds(
      older.recentVeteranPrologueTemplateIds,
      newer.recentVeteranPrologueTemplateIds,
    ),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}

export function readPlayerExperience(): PlayerExperienceRecord {
  if (typeof window === "undefined") {
    return migratePlayerExperience(DEFAULT_PLAYER_EXPERIENCE);
  }

  try {
    const raw = window.localStorage.getItem(PLAYER_EXPERIENCE_STORAGE_KEY);
    return raw
      ? migratePlayerExperience(JSON.parse(raw) as unknown)
      : migratePlayerExperience(DEFAULT_PLAYER_EXPERIENCE);
  } catch {
    return migratePlayerExperience(DEFAULT_PLAYER_EXPERIENCE);
  }
}

function writePlayerExperience(record: PlayerExperienceRecord): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PLAYER_EXPERIENCE_STORAGE_KEY,
      JSON.stringify(record),
    );
  } catch {
    // The in-memory store still works when storage is blocked or full.
  }
}

function publish(record: PlayerExperienceRecord): void {
  for (const listener of listeners) listener(record);
}

/** Merge an experience record received from a save or cloud slot. */
export function mergePersistedPlayerExperience(
  incoming: unknown,
): PlayerExperienceRecord {
  const previous = readPlayerExperience();
  const merged = mergePlayerExperience(previous, incoming);
  writePlayerExperience(merged);

  if (
    merged.tutorial.completed !== previous.tutorial.completed
    || merged.tutorial.dismissed !== previous.tutorial.dismissed
    || merged.updatedAt !== previous.updatedAt
  ) {
    publish(merged);
  }
  return merged;
}

/** Record a local player choice without allowing an older false value to win. */
export function updatePlayerExperience(input: {
  tutorialCompleted?: boolean;
  tutorialDismissed?: boolean;
  updatedAt?: number;
}): PlayerExperienceRecord {
  const current = readPlayerExperience();
  const completed = current.tutorial.completed || input.tutorialCompleted === true;
  const dismissed = current.tutorial.dismissed || input.tutorialDismissed === true;
  const changed =
    completed !== current.tutorial.completed
    || dismissed !== current.tutorial.dismissed;
  const next: PlayerExperienceRecord = {
    version: CURRENT_PLAYER_EXPERIENCE_VERSION,
    tutorial: { completed, dismissed },
    recentVeteranPrologueTemplateIds:
      current.recentVeteranPrologueTemplateIds,
    updatedAt: changed
      ? Math.max(current.updatedAt, input.updatedAt ?? Date.now())
      : current.updatedAt,
  };

  writePlayerExperience(next);
  if (changed) publish(next);
  return next;
}

/**
 * Remember a generated veteran-opening template so the next career can avoid
 * it. Re-recording an ID moves it to the newest position without duplication.
 */
export function recordVeteranPrologueTemplate(
  templateId: string,
): PlayerExperienceRecord {
  const id = templateId.trim();
  if (id.length === 0) return readPlayerExperience();

  const current = readPlayerExperience();
  const next: PlayerExperienceRecord = {
    ...current,
    version: CURRENT_PLAYER_EXPERIENCE_VERSION,
    recentVeteranPrologueTemplateIds: boundedRecentTemplateIds([
      ...current.recentVeteranPrologueTemplateIds,
      id,
    ]),
    updatedAt: Math.max(current.updatedAt, Date.now()),
  };
  writePlayerExperience(next);
  publish(next);
  return next;
}

export function subscribePlayerExperience(
  listener: PlayerExperienceListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
