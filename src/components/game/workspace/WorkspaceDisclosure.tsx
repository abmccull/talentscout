"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkspaceDisclosureProps
  extends Omit<ComponentPropsWithoutRef<"details">, "title"> {
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: ReactNode;
  summary?: ReactNode;
  contentClassName?: string;
}

export function WorkspaceDisclosure({
  title,
  description,
  eyebrow,
  icon,
  summary,
  className,
  contentClassName,
  children,
  ...props
}: WorkspaceDisclosureProps) {
  return (
    <details
      className={cn(
        "group overflow-hidden rounded-xl border border-white/10 bg-[#11161c]/90",
        className,
      )}
      {...props}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              {eyebrow}
            </p>
          )}
          <div className="mt-0.5 flex items-center gap-2">
            {icon}
            <span className="text-sm font-semibold text-zinc-100">{title}</span>
          </div>
          {description && (
            <p className="mt-1 text-xs leading-5 text-zinc-400">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {summary && (
            <div className="hidden text-right text-xs text-zinc-400 sm:block">
              {summary}
            </div>
          )}
          <ChevronDown
            size={16}
            className="text-zinc-500 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </div>
      </summary>
      <div className={cn("border-t border-white/8 p-4", contentClassName)}>
        {children}
      </div>
    </details>
  );
}
