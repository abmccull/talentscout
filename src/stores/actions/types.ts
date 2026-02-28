/**
 * Shared types for extracted Zustand action factory functions.
 *
 * Each action file imports these instead of pulling from gameStore.ts,
 * which avoids circular imports while keeping full type-safety.
 */

// Re-export GameStore under a name that makes intent clear.
// The `GameStore` interface lives in gameStore.ts; we reference it here
// via a type-only import so there is no runtime circular dependency.
import type { GameStoreState } from "../gameStore";

export type { GameStoreState };

/** Zustand `get` — returns the full store (state + every action group merged). */
export type GetState = () => GameStoreState;

/** Zustand `set` — accepts a partial update or an updater function. */
export type SetState = (
  partial:
    | Partial<GameStoreState>
    | ((state: GameStoreState) => Partial<GameStoreState>),
) => void;
