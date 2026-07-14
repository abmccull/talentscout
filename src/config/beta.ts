// Keep the first Early Access build local/Steam-first. Re-enable only after
// cross-device conflict, offline recovery, and account deletion are verified
// against the production Supabase project.
export const BETA_CLOUD_SAVES_ENABLED = false;

export const BETA_CLOUD_SAVES_MESSAGE =
  "Cloud saves are disabled for the Youth Early Access build while cross-device recovery is hardened.";

export const BETA_GLOBAL_LEADERBOARD_ENABLED = false;

export const BETA_GLOBAL_LEADERBOARD_MESSAGE =
  "The global leaderboard is disabled during beta while score verification is hardened.";

// Anonymous online submission must remain independently disabled even when a
// Supabase URL/key exists for development. Enable only in a build whose
// feedback-table RLS, abuse throttling, retention, and monitoring are certified.
export const BETA_ONLINE_FEEDBACK_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_ONLINE_FEEDBACK === "true";

export const BETA_ONLINE_FEEDBACK_MESSAGE =
  "Online feedback submission is disabled in this build. You can still create an email draft.";
