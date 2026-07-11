// Keep the first Early Access build local/Steam-first. Re-enable only after
// cross-device conflict, offline recovery, and account deletion are verified
// against the production Supabase project.
export const BETA_CLOUD_SAVES_ENABLED = false;

export const BETA_CLOUD_SAVES_MESSAGE =
  "Cloud saves are disabled for the Youth Early Access build while cross-device recovery is hardened.";

export const BETA_GLOBAL_LEADERBOARD_ENABLED = false;

export const BETA_GLOBAL_LEADERBOARD_MESSAGE =
  "The global leaderboard is disabled during beta while score verification is hardened.";
