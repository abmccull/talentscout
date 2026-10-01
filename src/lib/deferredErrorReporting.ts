/** Optional reporting must never block a recovery screen or local persistence. */
let reporter: Promise<typeof import("./sentry")> | null = null;

export function captureException(error: unknown): void {
  if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) return;
  reporter ??= import("./sentry").catch((failure: unknown) => {
    // A missing/offline chunk can be retried by a later capture.
    reporter = null;
    throw failure;
  });
  void reporter
    .then(({ captureException: report }) => report(error))
    .catch(() => {
      // The original exception already has a local recovery path. Reporting
      // failures must not replace it or trigger an unhandled promise rejection.
    });
}
