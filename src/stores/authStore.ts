/**
 * Auth store — holds the user's cloud authentication state and cloud-save
 * preference.
 *
 * Currently a stub: no real auth backend is wired up.  The store is designed
 * so that a Supabase (or other provider) integration only needs to call
 * login() / logout() with the resolved user details — no store changes required.
 *
 * The cloudSaveEnabled flag is persisted via Zustand middleware in a future
 * iteration.  For now it lives purely in memory and resets on page refresh.
 */

import { create } from "zustand";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface AuthState {
  /** True when the user has an active session with a cloud provider. */
  isAuthenticated: boolean;

  /**
   * The cloud provider's user identifier.
   * null before login or after logout.
   */
  userId: string | null;

  /**
   * Human-readable display name for the authenticated user.
   * Used in the UI to greet the user and label cloud saves.
   * null before login or after logout.
   */
  displayName: string | null;

  /**
   * Whether the user has opted in to cloud saves.
   * Defaults to false (opt-in model — no data leaves the device unless the
   * user explicitly enables this).
   */
  cloudSaveEnabled: boolean;

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /**
   * Call this after a successful cloud auth flow to populate user data and
   * mark the session as active.
   */
  login: (userId: string, displayName: string) => void;

  /**
   * Clears all auth state and disables cloud saves.
   * Call on sign-out or when the remote session expires.
   */
  logout: () => void;

  /**
   * Toggle whether cloud save syncing is active.
   * Disabling does not delete existing cloud saves — it only prevents future
   * uploads/downloads until the user re-enables the feature.
   */
  toggleCloudSave: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>((set) => ({
  // Initial state — unauthenticated, cloud saves off
  isAuthenticated: false,
  userId: null,
  displayName: null,
  cloudSaveEnabled: false,

  login: (userId, displayName) =>
    set({
      isAuthenticated: true,
      userId,
      displayName,
    }),

  logout: () =>
    set({
      isAuthenticated: false,
      userId: null,
      displayName: null,
      cloudSaveEnabled: false,
    }),

  toggleCloudSave: (enabled) =>
    set({ cloudSaveEnabled: enabled }),
}));
