"use client";

/**
 * Next.js App Router global error boundary.
 * Catches errors in the root layout itself — renders outside the <html> tag.
 */

import { APP_VERSION } from "@/config/version";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0a0a] text-white antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center px-6">
          <div className="w-full max-w-md text-center">
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
              <svg
                className="h-8 w-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>

            <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
            <p className="mb-8 text-sm text-zinc-400">
              An unexpected error occurred. Your progress up to the last
              autosave is safe.
            </p>

            {process.env.NODE_ENV === "development" && error.message && (
              <pre className="mb-6 max-h-32 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left text-xs text-red-300">
                {error.message}
              </pre>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={reset}
                className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
              >
                Try Again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Global error boundary renders outside root layout */}
              <a
                href="/"
                className="rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white"
              >
                Return to Menu
              </a>
            </div>
          </div>

          <p className="mt-16 text-xs text-zinc-600">
            TalentScout v{APP_VERSION}
          </p>
        </div>
      </body>
    </html>
  );
}
