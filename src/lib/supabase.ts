/**
 * Supabase client singleton.
 *
 * Import `supabase` wherever you need to interact with the Supabase backend
 * (auth, database, storage).  A single shared instance is sufficient because
 * Supabase JS clients are safe to share across the entire application — they
 * manage their own internal connection pools.
 *
 * SSR helpers are intentionally omitted: TalentScout is a fully client-side
 * game and does not perform any server-side rendering of authenticated pages.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BETA_CLOUD_SAVES_ENABLED } from "@/config/beta";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function authStorageKeyFor(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const projectRef = new URL(url).hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

export const supabaseAuthStorageKey = authStorageKeyFor(supabaseUrl);

/** Remove sessions created by older builds when the cloud beta is disabled. */
export function clearSupabaseAuthSessionStorage(): void {
  if (!supabaseAuthStorageKey) return;
  try {
    localStorage.removeItem(supabaseAuthStorageKey);
    localStorage.removeItem(`${supabaseAuthStorageKey}-code-verifier`);
  } catch {
    // Storage may be unavailable in SSR, privacy lockdown, or recovery mode.
  }
}

/**
 * The Supabase client singleton, or `null` when the env vars are not
 * configured.  All consumers MUST null-check before use so the game can
 * run in offline / Steam mode without a .env.local file.
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          // Supabase also powers anonymous feedback. Keep that client usable,
          // but never create, restore, or refresh browser auth sessions while
          // the player-facing cloud feature is intentionally disabled.
          persistSession: BETA_CLOUD_SAVES_ENABLED,
          autoRefreshToken: BETA_CLOUD_SAVES_ENABLED,
          detectSessionInUrl: BETA_CLOUD_SAVES_ENABLED,
          ...(supabaseAuthStorageKey
            ? { storageKey: supabaseAuthStorageKey }
            : {}),
        },
      })
    : null;
