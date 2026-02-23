/**
 * Auth store — holds the user's cloud authentication state and cloud-save
 * preference.
 *
 * Backed by Supabase Auth.  Call `initialize()` once at app startup (e.g. in
 * a top-level layout component) to restore any existing session and wire up
 * the auth-state listener so the store stays in sync as sessions are created
 * and destroyed.
 *
 * The `cloudSaveEnabled` flag is persisted to localStorage under the key
 * "cloudSaveEnabled" so the user's preference survives page refreshes without
 * requiring a round-trip to the server.
 */

import { create } from "zustand";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLOUD_SAVE_KEY = "cloudSaveEnabled";

function readCloudSavePref(): boolean {
  try {
    return localStorage.getItem(CLOUD_SAVE_KEY) === "true";
  } catch {
    // localStorage unavailable (e.g. SSR context or private browsing lockdown)
    return false;
  }
}

function writeCloudSavePref(enabled: boolean): void {
  try {
    localStorage.setItem(CLOUD_SAVE_KEY, String(enabled));
  } catch {
    // Silently ignore — preference will revert to default on next load.
  }
}

/**
 * Derive a human-readable display name from a Supabase user object.
 * Prefers the `full_name` user metadata field, then `username`, then the
 * local part of the email address, and finally a generic fallback.
 */
function resolveDisplayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string {
  const meta = user.user_metadata ?? {};
  if (typeof meta["full_name"] === "string" && meta["full_name"]) {
    return meta["full_name"] as string;
  }
  if (typeof meta["name"] === "string" && meta["name"]) {
    return meta["name"] as string;
  }
  if (typeof meta["username"] === "string" && meta["username"]) {
    return meta["username"] as string;
  }
  if (user.email) {
    return user.email.split("@")[0]!;
  }
  return "Scout";
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface AuthState {
  /**
   * True once `initialize()` has completed its first session check.
   * Components should wait for `isLoading === false` before rendering
   * auth-dependent UI to avoid flashes of unauthenticated content.
   */
  isLoading: boolean;

  /** True when the user has an active session with Supabase Auth. */
  isAuthenticated: boolean;

  /**
   * The Supabase user ID (UUID string).
   * null before sign-in or after sign-out.
   */
  userId: string | null;

  /**
   * Human-readable display name for the authenticated user.
   * Derived from user metadata or email; see `resolveDisplayName`.
   * null before sign-in or after sign-out.
   */
  displayName: string | null;

  /**
   * Whether the user has opted in to cloud saves.
   * Defaults to false (opt-in — no data leaves the device without consent).
   * Persisted to localStorage.
   */
  cloudSaveEnabled: boolean;

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /**
   * Bootstrap the auth store.  Must be called once at app startup.
   *
   * 1. Reads the persisted cloudSaveEnabled preference from localStorage.
   * 2. Calls `supabase.auth.getSession()` to restore any existing session.
   * 3. Registers `supabase.auth.onAuthStateChange()` so the store reacts to
   *    future SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED events automatically.
   *
   * Safe to call multiple times — subsequent calls after the first are no-ops
   * because the listener subscription is only created once.
   */
  initialize: () => void;

  /**
   * Sign in with email + password.
   * Throws on invalid credentials or network errors.
   * On success the onAuthStateChange listener updates the store automatically.
   */
  signInWithEmail: (email: string, password: string) => Promise<void>;

  /**
   * Create a new account with email + password.
   * After sign-up, Supabase may send a confirmation email depending on project
   * settings; the caller should handle the pending-confirmation UX.
   * On success (or after confirmation) the listener updates the store.
   */
  signUpWithEmail: (email: string, password: string) => Promise<void>;

  /**
   * Initiate an OAuth sign-in flow (Google or GitHub).
   * Redirects the browser to the provider's consent page; the user returns to
   * the app after granting access and the listener handles the new session.
   */
  signInWithOAuth: (provider: "google" | "github") => Promise<void>;

  /**
   * Sign out the current user and clear all auth state.
   * Also disables cloud saves (the user is no longer authenticated to sync).
   */
  signOut: () => Promise<void>;

  /**
   * Legacy alias for signOut kept for compatibility with existing call sites.
   * @deprecated Use signOut() instead.
   */
  logout: () => Promise<void>;

  /**
   * Toggle whether cloud save syncing is active.
   * Disabling does not delete existing cloud saves — it only prevents future
   * uploads/downloads until the user re-enables the feature.
   * The new value is persisted to localStorage immediately.
   */
  toggleCloudSave: (enabled: boolean) => void;

  /**
   * Internal setter — update store state from a Supabase session.
   * Not intended for direct use outside the store.
   */
  _applySession: (session: Session | null) => void;
}

// ---------------------------------------------------------------------------
// Singleton subscription guard
// ---------------------------------------------------------------------------

let listenerRegistered = false;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state — loading, unauthenticated, cloud saves off
  isLoading: true,
  isAuthenticated: false,
  userId: null,
  displayName: null,
  cloudSaveEnabled: false,

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  _applySession: (session) => {
    if (session?.user) {
      set({
        isAuthenticated: true,
        userId: session.user.id,
        displayName: resolveDisplayName(session.user),
      });
    } else {
      set({
        isAuthenticated: false,
        userId: null,
        displayName: null,
        cloudSaveEnabled: false,
      });
      writeCloudSavePref(false);
    }
  },

  // -------------------------------------------------------------------------
  // initialize
  // -------------------------------------------------------------------------

  initialize: () => {
    // Restore persisted cloud-save preference first (synchronous).
    set({ cloudSaveEnabled: readCloudSavePref() });

    // When Supabase is not configured (no env vars), skip auth entirely
    // so the game works in offline / Steam mode.
    if (!supabase) {
      set({ isLoading: false });
      return;
    }

    // 1. Restore any existing session (e.g. from a previous page load).
    supabase.auth.getSession().then(({ data: { session } }) => {
      get()._applySession(session);
      set({ isLoading: false });
    }).catch(() => {
      set({ isLoading: false });
    });

    // 2. Register the real-time auth state listener (once only).
    if (listenerRegistered) return;
    listenerRegistered = true;

    supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          get()._applySession(session);
        } else if (event === "SIGNED_OUT") {
          get()._applySession(null);
        }
        // INITIAL_SESSION is handled by getSession() above; ignore here.
      },
    );
  },

  // -------------------------------------------------------------------------
  // signInWithEmail
  // -------------------------------------------------------------------------

  signInWithEmail: async (email, password) => {
    if (!supabase) throw new Error("Cloud features are not configured");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    // Store is updated via onAuthStateChange; no manual set() needed here.
  },

  // -------------------------------------------------------------------------
  // signUpWithEmail
  // -------------------------------------------------------------------------

  signUpWithEmail: async (email, password) => {
    if (!supabase) throw new Error("Cloud features are not configured");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
  },

  // -------------------------------------------------------------------------
  // signInWithOAuth
  // -------------------------------------------------------------------------

  signInWithOAuth: async (provider) => {
    if (!supabase) throw new Error("Cloud features are not configured");
    const { error } = await supabase.auth.signInWithOAuth({ provider });
    if (error) throw new Error(error.message);
    // Browser will redirect to provider; no further action needed here.
  },

  // -------------------------------------------------------------------------
  // signOut
  // -------------------------------------------------------------------------

  signOut: async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    // onAuthStateChange will fire SIGNED_OUT and call _applySession(null).
  },

  logout: async () => {
    return get().signOut();
  },

  // -------------------------------------------------------------------------
  // toggleCloudSave
  // -------------------------------------------------------------------------

  toggleCloudSave: (enabled) => {
    set({ cloudSaveEnabled: enabled });
    writeCloudSavePref(enabled);
  },
}));
