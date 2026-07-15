/**
 * Semantic equality for persisted game snapshots.
 *
 * `lastSaved` is a presentation timestamp written after a successful save. It
 * must never manufacture a new journal generation when the actual game world
 * has not changed. Everything else is compared structurally so a checkpoint
 * and an immediately-following autosave can safely collapse to one revision.
 */

type ComparableRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ComparableRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function enumerableKeys(value: ComparableRecord, ignoreLastSaved: boolean): string[] {
  return Object.keys(value)
    .filter((key) => (ignoreLastSaved ? key !== "lastSaved" : true))
    // JSON persistence drops undefined object properties. Treating them as
    // absent preserves the historical wire contract while avoiding a needless
    // rewrite after moving callers to the structured boundary.
    .filter((key) => value[key] !== undefined)
    .sort();
}

function valuesEquivalent(
  left: unknown,
  right: unknown,
  ignoreRootLastSaved: boolean,
  seen: WeakMap<object, object>,
): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null) return false;
  if (typeof left !== "object" || typeof right !== "object") return false;

  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date
      && right instanceof Date
      && left.getTime() === right.getTime();
  }

  const previousRight = seen.get(left);
  if (previousRight) return previousRight === right;
  seen.set(left, right);

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) =>
      valuesEquivalent(value, right[index], false, seen));
  }

  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = enumerableKeys(left, ignoreRootLastSaved);
  const rightKeys = enumerableKeys(right, ignoreRootLastSaved);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key, index) =>
    key === rightKeys[index]
    && valuesEquivalent(left[key], right[key], false, seen));
}

/** Compare GameState payloads while intentionally excluding only root lastSaved. */
export function areEquivalentSaveStates(left: unknown, right: unknown): boolean {
  return valuesEquivalent(left, right, true, new WeakMap<object, object>());
}

/** Compare small envelope metadata such as player-experience records. */
export function areEquivalentSaveMetadata(left: unknown, right: unknown): boolean {
  return valuesEquivalent(left, right, false, new WeakMap<object, object>());
}
