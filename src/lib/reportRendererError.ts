/** Load optional reporting only for a configured renderer error. */
export async function reportRendererError(error: unknown): Promise<void> {
  if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) return;
  try {
    // Concurrent early errors share the module loader; the runtime initializes
    // the SDK once and preserves each original exception for privacy scrubbing.
    const { captureException } = await import("@/lib/sentry");
    captureException(error);
  } catch {
    // Reporting must not turn a recoverable save or screen failure into an
    // unhandled rejection, and the diagnostic must not repeat private input.
    console.warn("Renderer error reporting is unavailable; local recovery remains available.");
  }
}
