"use client";

import { useEffect, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkspaceDisclosureProps
  extends Omit<ComponentPropsWithoutRef<"details">, "title"> {
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: ReactNode;
  summary?: ReactNode;
  tone?: "default" | "subtle";
  contentClassName?: string;
  responsiveOpenAt?: "lg" | "xl";
}

const RESPONSIVE_OPEN_QUERIES = {
  lg: "(min-width: 1024px)",
  xl: "(min-width: 1280px)",
} as const;

export function WorkspaceDisclosure({
  title,
  description,
  eyebrow,
  icon,
  summary,
  tone = "default",
  className,
  contentClassName,
  responsiveOpenAt,
  open,
  onToggle,
  children,
  ...props
}: WorkspaceDisclosureProps) {
  const subtle = tone === "subtle";
  const [matchesResponsiveOpen, setMatchesResponsiveOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(Boolean(open));

  useEffect(() => {
    if (!responsiveOpenAt) return;
    const media = window.matchMedia(RESPONSIVE_OPEN_QUERIES[responsiveOpenAt]);
    const sync = () => setMatchesResponsiveOpen(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [responsiveOpenAt]);

  useEffect(() => {
    if (open !== undefined) setUserOpen(open);
  }, [open]);

  const resolvedOpen = responsiveOpenAt
    ? matchesResponsiveOpen || (open ?? userOpen)
    : open;

  return (
    <details
      className={cn(
        subtle
          ? "group overflow-hidden rounded-xl border border-white/[0.07] bg-black/20"
          : "group overflow-hidden rounded-xl border border-white/10 bg-[#11161c]/90",
        className,
      )}
      open={resolvedOpen}
      onToggle={(event) => {
        if (responsiveOpenAt && !matchesResponsiveOpen && open === undefined) {
          setUserOpen(event.currentTarget.open);
        }
        onToggle?.(event);
      }}
      {...props}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
              {eyebrow}
            </p>
          )}
          <div className="mt-0.5 flex items-center gap-2">
            {icon}
            <span className={cn(
              "text-sm font-semibold",
              subtle ? "text-zinc-200" : "text-zinc-100",
            )}>{title}</span>
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
      <div className={cn(
        subtle ? "border-t border-white/[0.06] p-4" : "border-t border-white/8 p-4",
        contentClassName,
      )}>
        {children}
      </div>
    </details>
  );
}
