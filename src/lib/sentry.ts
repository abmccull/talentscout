import * as Sentry from "@sentry/nextjs";

export function captureException(error: unknown): void {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.captureException(error);
  }
}
