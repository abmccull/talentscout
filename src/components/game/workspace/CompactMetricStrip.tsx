"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CompactMetricItem {
  label: string;
  value: string | number;
  detail?: string;
  icon?: ReactNode;
  toneClassName?: string;
}

interface CompactMetricStripProps {
  items: CompactMetricItem[];
  className?: string;
}

export function CompactMetricStrip({
  items,
  className,
}: CompactMetricStripProps) {
  return (
    <section
      aria-label="Current status snapshot"
      className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-white/10 bg-[#11161c]/90 px-4 py-3 shadow-lg shadow-black/10"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {item.label}
              </p>
              <p className={cn("mt-1 text-lg font-semibold text-white", item.toneClassName)}>
                {item.value}
              </p>
              {item.detail && (
                <p className="mt-1 text-xs leading-5 text-zinc-400">{item.detail}</p>
              )}
            </div>
            {item.icon}
          </div>
        </div>
      ))}
    </section>
  );
}
