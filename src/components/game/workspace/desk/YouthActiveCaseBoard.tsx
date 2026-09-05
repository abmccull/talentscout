"use client";
import type { ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { YouthPortrait } from "@/components/game/YouthPortrait";
import type { YouthActiveCaseModel } from "./youthDeskModel";
interface YouthActiveCaseBoardProps {
  model: YouthActiveCaseModel;
  eyebrow: string;
  ctaLabel: string;
  scheduledSlots: number;
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
  secondaryLabel?: string;
  asideContent?: ReactNode;
}
export function YouthActiveCaseBoard({ model, eyebrow, ctaLabel, scheduledSlots, onPrimaryAction, onSecondaryAction, secondaryLabel, asideContent }: YouthActiveCaseBoardProps) {
  const facts = [{ label: "Evidence", value: model.evidenceLine }, { label: "Context", value: model.networkLine }, { label: "Recommendation", value: model.recommendationLine }];
  return (
    <article data-testid="desk-primary-decision" className="grid min-w-0 gap-8 py-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <p className="dossier-eyebrow mb-4">{eyebrow}</p>
        <div className="flex items-start gap-4 sm:gap-6">
          {model.playerId && <YouthPortrait playerId={model.playerId} age={model.subjectAge} size={96} alt={model.subjectName ?? "Active case"} className="shrink-0 !rounded-sm !ring-0 sm:!h-36 sm:!w-32" />}
          <div className="min-w-0">
            {model.subjectName && <p className="mb-2 text-sm text-[var(--primary)]">{model.subjectName}{model.subjectAge ? ` · ${model.subjectAge}` : ""}</p>}
            <h2 className="font-editorial max-w-2xl text-2xl leading-tight sm:text-4xl">{model.title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-quiet">{model.summary}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={onPrimaryAction}>{ctaLabel} <ArrowRight size={16} /></Button>
          {onSecondaryAction && secondaryLabel && <Button variant="ghost" onClick={onSecondaryAction}>{secondaryLabel}</Button>}
        </div>
        <details className="mt-5 border-t border-[var(--border)] pt-1">
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-quiet">Review case signals</summary>
          <dl className="grid gap-4 pb-4 sm:grid-cols-3">{facts.map((fact) => <div key={fact.label}><dt className="dossier-eyebrow">{fact.label}</dt><dd className="mt-2 text-sm leading-6 text-quiet">{fact.value}</dd></div>)}</dl>
        </details>
      </div>
      <aside className="min-w-0 border-t border-[var(--border)] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
        <details data-testid="case-progression-disclosure">
          <summary className="cursor-pointer py-2 text-sm font-semibold">{model.stageLabel}</summary>
          <p className="mt-3 text-sm leading-6 text-quiet">{model.briefLine}</p>
          <ol className="mt-4 space-y-3" aria-label="Case progression">{model.stageSteps.map((step, index) => <li key={step.label} className={`flex items-center gap-3 text-sm ${step.active ? "text-[var(--primary)]" : "text-quiet"}`}><span className="flex h-5 w-5 items-center justify-center text-xs tabular-nums">{step.complete ? <Check size={14} /> : index + 1}</span><span>{step.label}{step.active ? " · Now" : ""}</span></li>)}</ol>
        </details>
        <p className="mt-3 text-sm text-quiet">{scheduledSlots}/7 days committed</p>
        <div className="mt-4">{asideContent}</div>
      </aside>
    </article>
  );
}
