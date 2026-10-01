// Next.js executes this entry for static exports. Offline builds remove this branch.
if (process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
  void import("../sentry.client.config").catch(() => {
    console.warn("Renderer error reporting could not start; local gameplay remains available.");
  });
}
