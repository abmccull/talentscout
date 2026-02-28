"use client";

/**
 * Next.js App Router page-level error boundary.
 * Catches errors within pages while preserving the root layout.
 */

import { useEffect, useState } from "react";
import { captureException } from "@/lib/sentry";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);

  useEffect(() => {
    captureException(error);
    // Attempt to read the last autosave timestamp (best-effort).
    try {
      const openReq = indexedDB.open("TalentScoutDB");
      openReq.onsuccess = () => {
        const db = openReq.result;
        if (!db.objectStoreNames.contains("saves")) {
          db.close();
          return;
        }
        const tx = db.transaction("saves", "readonly");
        const store = tx.objectStore("saves");
        const getReq = store.get(0); // autosave slot
        getReq.onsuccess = () => {
          const record = getReq.result as
            | { savedAt?: number }
            | undefined;
          if (record?.savedAt) {
            const d = new Date(record.savedAt);
            setLastSaveTime(
              d.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              }),
            );
          }
          db.close();
        };
        getReq.onerror = () => db.close();
      };
    } catch {
      // Silently ignore — this is a best-effort read.
    }
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#0a0a0a] to-[#0f1a0f] px-6">
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

        <h1 className="mb-2 text-2xl font-bold text-white">
          Something went wrong
        </h1>
        <p className="mb-2 text-sm text-zinc-400">
          An unexpected error occurred. Your progress up to the last autosave is
          safe.
        </p>

        {lastSaveTime && (
          <p className="mb-6 text-xs text-zinc-500">
            Last autosave: {lastSaveTime}
          </p>
        )}

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
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Error boundary cannot use next/link */}
          <a
            href="/"
            className="rounded-lg border border-zinc-700 px-6 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white"
          >
            Return to Menu
          </a>
        </div>
      </div>
    </div>
  );
}
