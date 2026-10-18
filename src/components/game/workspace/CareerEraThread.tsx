"use client";

import { useId } from "react";
import { ArrowRight } from "lucide-react";
import type { CareerEra } from "@/engine/events/careerEraDirector";
import { Button } from "@/components/ui/button";

interface CareerEraThreadProps {
  era?: CareerEra;
  variant: "desk" | "career";
  onOpenProspect?: (playerId: string) => void;
  onOpenWorld?: () => void;
}

function dateLabel(era: CareerEra): string {
  return era.startedAt.season === era.endsAt.season
    ? `Season ${era.startedAt.season}, weeks ${era.startedAt.week}–${era.endsAt.week}`
    : `S${era.startedAt.season} W${era.startedAt.week} to S${era.endsAt.season} W${era.endsAt.week}`;
}

export default function CareerEraThread({ era, variant, onOpenProspect, onOpenWorld }: CareerEraThreadProps) {
  const headingId = useId();
  if (!era) return null;
  return (
    <section aria-labelledby={headingId} data-testid={`${variant}-career-era-thread`} className="border-t border-[var(--border)] py-4">
      <p className="dossier-eyebrow">In the field</p>
      <h2 id={headingId} className="mt-2 font-editorial text-xl leading-snug">{era.title}</h2>
      <p className="mt-2 text-xs leading-5 text-quiet">{dateLabel(era)}</p>
      <details className="mt-2" open={variant === "career" || undefined}>
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-quiet">The wider story</summary>
        <p className="max-w-3xl text-sm leading-6 text-quiet">{era.premise}</p>
        <p className="mt-3 text-sm leading-6">{era.deskPrompt}</p>
      </details>
      {(era.primaryProspectId || era.primaryCountryId) && <div className="mt-2 flex flex-wrap gap-2">
        {era.primaryProspectId && onOpenProspect && <Button variant="ghost" onClick={() => onOpenProspect(era.primaryProspectId!)} className="-ml-3">
          Open linked case <ArrowRight size={15} aria-hidden="true" />
        </Button>}
        {era.primaryCountryId && onOpenWorld && <Button variant="ghost" onClick={onOpenWorld} className="-ml-3">
          Open territory <ArrowRight size={15} aria-hidden="true" />
        </Button>}
      </div>}
    </section>
  );
}
