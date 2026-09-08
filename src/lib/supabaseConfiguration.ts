/** Environment and local auth cleanup without loading the optional network SDK. */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_CONFIGURED = Boolean(
  supabaseUrl && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

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
