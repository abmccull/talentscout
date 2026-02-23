"use client";

import * as React from "react";

interface PaperCardProps {
  children: React.ReactNode;
  className?: string;
  stamp?: "recommended" | "tablePound" | "noted" | null;
}

/**
 * PaperCard — a dark card with a subtle CSS noise texture overlay,
 * optionally displaying a rotated report stamp in the top-right corner.
 *
 * The texture is achieved via repeating-conic-gradient — no external image
 * files required.
 */
export function PaperCard({ children, className, stamp }: PaperCardProps) {
  return (
    <div
      className={`relative rounded-xl border border-zinc-700/50 p-6 ${className ?? ""}`}
      style={{
        backgroundColor: "#141414",
        backgroundImage:
          "repeating-conic-gradient(#1a1a1a 0% 25%, transparent 0% 50%) 0 0 / 4px 4px",
      }}
    >
      {children}
      {stamp != null && <ReportStamp type={stamp} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal sub-component
// ---------------------------------------------------------------------------

const STAMP_LABELS: Record<NonNullable<PaperCardProps["stamp"]>, string> = {
  recommended: "RECOMMENDED",
  tablePound: "TABLE POUND",
  noted: "NOTED",
};

const STAMP_COLORS: Record<NonNullable<PaperCardProps["stamp"]>, string> = {
  recommended: "text-emerald-500 border-emerald-500",
  tablePound: "text-red-500 border-red-500",
  noted: "text-zinc-400 border-zinc-400",
};

function ReportStamp({
  type,
}: {
  type: NonNullable<PaperCardProps["stamp"]>;
}) {
  return (
    <div
      aria-label={`Stamp: ${STAMP_LABELS[type]}`}
      className={`pointer-events-none absolute right-4 top-4 rotate-[-12deg] rounded border-2 px-3 py-1.5 text-sm font-bold uppercase tracking-wider opacity-60 ${STAMP_COLORS[type]}`}
    >
      {STAMP_LABELS[type]}
    </div>
  );
}
