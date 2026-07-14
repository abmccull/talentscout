/**
 * Shared types for extracted Zustand action factory functions.
 *
 * Each action file imports these instead of pulling from gameStore.ts,
 * which avoids circular imports while keeping full type-safety.
 */

import type { GameStoreState } from "../gameStoreTypes";

export type { GameStoreState };

/** Zustand `get` — returns the full store (state + every action group merged). */
export type GetState = () => GameStoreState;

/** Zustand `set` — accepts a partial update or an updater function. */
export type SetState = (
  partial:
    | Partial<GameStoreState>
    | ((state: GameStoreState) => Partial<GameStoreState>),
) => void;
