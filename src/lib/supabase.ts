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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * The Supabase client singleton, or `null` when the env vars are not
 * configured.  All consumers MUST null-check before use so the game can
 * run in offline / Steam mode without a .env.local file.
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
