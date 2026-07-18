"use client";

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type QueueTone = "default" | "emerald" | "amber" | "sky" | "violet" | "red";

export interface UrgentQueueItem {
  id: string;
  eyebrow?: string;
  title: string;
  body: string;
  meta?: string;
  tone?: QueueTone;
  actionLabel?: string;
  onAction?: () => void;
}

interface UrgentQueueProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  items: UrgentQueueItem[];
  emptyTitle: string;
  emptyBody: string;
  footerActionLabel?: string;
  onFooterAction?: () => void;
  className?: string;
  contentClassName?: string;
}

function toneClass(tone: QueueTone = "default"): string {
  switch (tone) {
    case "emerald":
      return "border-emerald-400/20 bg-emerald-400/[0.05]";
    case "amber":
      return "border-amber-400/20 bg-amber-400/[0.05]";
    case "sky":
      return "border-sky-400/20 bg-sky-400/[0.05]";
    case "violet":
      return "border-violet-400/20 bg-violet-400/[0.05]";
    case "red":
      return "border-red-400/20 bg-red-400/[0.05]";
    default:
      return "border-white/10 bg-white/[0.025]";
  }
}

export function UrgentQueue({
  title,
  description,
  icon,
  items,
  emptyTitle,
  emptyBody,
  footerActionLabel,
  onFooterAction,
  className,
  contentClassName,
}: UrgentQueueProps) {
  return (
    <Card className={cn("border-white/10 bg-[#11161c]/95", className)}>
      <CardHeader className="p-5 pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          {icon}
          {title}
        </CardTitle>
        {description && (
          <p className="text-sm leading-6 text-zinc-400">{description}</p>
        )}
      </CardHeader>
      <CardContent className={cn("space-y-3 p-5 pt-1", contentClassName)}>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-4">
            <p className="text-sm font-semibold text-white">{emptyTitle}</p>
            <p className="mt-1 text-sm leading-6 text-zinc-400">{emptyBody}</p>
          </div>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className={cn("rounded-xl border p-3", toneClass(item.tone))}
            >
              {item.eyebrow && (
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  {item.eyebrow}
                </p>
              )}
              <p className="mt-1 text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-1 line-clamp-3 text-xs leading-5 text-zinc-400" title={item.body}>
                {item.body}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[11px] text-zinc-500">{item.meta}</span>
                {item.onAction && item.actionLabel && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    onClick={item.onAction}
                  >
                    {item.actionLabel}
                  </Button>
                )}
              </div>
            </article>
          ))
        )}
        {footerActionLabel && onFooterAction && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full justify-between"
            onClick={onFooterAction}
          >
            {footerActionLabel}
            <ArrowRight size={15} aria-hidden="true" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
