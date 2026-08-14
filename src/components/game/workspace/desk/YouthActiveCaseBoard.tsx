"use client";

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { ArrowRight, Compass, FileText, Link2, Radar, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { YouthActiveCaseModel } from "./youthDeskModel";
import { WorkspaceDisclosure } from "../WorkspaceDisclosure";

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

export function YouthActiveCaseBoard({
  model,
  eyebrow,
  ctaLabel,
  scheduledSlots,
  onPrimaryAction,
  onSecondaryAction,
  secondaryLabel,
  asideContent,
}: YouthActiveCaseBoardProps) {
  const handleHorizontalRailKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.currentTarget.scrollBy({
      left: event.key === "ArrowLeft" ? -240 : 240,
      behavior: "smooth",
    });
  };

  const factItems = [
    {
      label: "Evidence",
      value: model.evidenceLine,
      affordance: "Re-open the dossier if the read still feels thin.",
      icon: <Radar size={16} className="text-sky-300" aria-hidden="true" />,
    },
    {
      label: "Context",
      value: model.networkLine,
      affordance: "Cross-check whether context sharpens or biases the case.",
      icon: <Link2 size={16} className="text-violet-300" aria-hidden="true" />,
    },
    {
      label: "Recommendation bar",
      value: model.recommendationLine,
      affordance: "Only attach your name when the fit and timing survive challenge.",
      icon: <FileText size={16} className="text-amber-300" aria-hidden="true" />,
    },
    {
      label: "Schedule pressure",
      value: model.scheduleLine,
      affordance: "Planner decides whether this week creates proof or drift.",
      icon: <Compass size={16} className="text-emerald-300" aria-hidden="true" />,
    },
  ];

  return (
    <Card
      data-testid="desk-primary-decision"
      className="relative w-full min-w-0 overflow-hidden border-white/12 bg-[#0f1519]/[0.98] shadow-2xl shadow-black/35"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(52,211,153,0.18),transparent_32%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" aria-hidden="true" />
      <CardContent className="relative grid min-w-0 gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.74fr)] xl:p-7">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200" variant="outline">
              {eyebrow}
            </Badge>
            <Badge className="border-white/12 bg-white/[0.06] text-zinc-100" variant="outline">
              Active case board
            </Badge>
            <span className="text-xs text-zinc-300">
              {scheduledSlots}/7 days committed
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-meta font-semibold uppercase tracking-[0.18em] text-emerald-200/85">
              <ArrowRight size={14} aria-hidden="true" />
              Next move
            </div>
            <h2 className="max-w-3xl text-2xl font-bold leading-tight text-white sm:text-3xl xl:text-[2.15rem]">
              {model.title}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-zinc-200 sm:text-base">
              {model.summary}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="min-h-11 px-5" onClick={onPrimaryAction}>
              {ctaLabel}
              <ArrowRight size={16} className="ml-2" aria-hidden="true" />
            </Button>
            {onSecondaryAction && secondaryLabel && (
              <Button
                className="min-h-11 border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                variant="outline"
                onClick={onSecondaryAction}
              >
                {secondaryLabel}
              </Button>
            )}
          </div>

          <WorkspaceDisclosure
            tone="subtle"
            title="Review case signals"
            description="Four pressures explain what the next week should prove."
            summary={<span>Evidence · context · recommendation · schedule</span>}
            responsiveOpenAt="xl"
            className="min-w-0 bg-black/30 xl:[&>summary]:hidden"
            contentClassName="xl:!block xl:!border-t-0"
          >
            <div
              className="flex max-w-full snap-x gap-2 overflow-x-auto pb-1 focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 [scrollbar-width:thin] xl:grid xl:grid-cols-2 xl:overflow-visible xl:pb-0"
              tabIndex={0}
              role="region"
              aria-label="Case signals. Use left and right arrow keys to review all signals."
              onKeyDown={handleHorizontalRailKeyDown}
            >
              {factItems.map((item) => (
                <div key={item.label} className="min-w-[15rem] snap-start rounded-xl border border-white/10 bg-white/[0.045] px-3 py-3 xl:min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-eyebrow font-semibold uppercase tracking-[0.16em] text-quiet">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-zinc-100">{item.value}</p>
                      <p className="mt-2 text-xs leading-5 text-zinc-400">{item.affordance}</p>
                    </div>
                    <span className="mt-0.5 rounded-full border border-white/10 bg-black/25 p-2">
                      {item.icon}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </WorkspaceDisclosure>
        </div>

        <div className="min-w-0 space-y-4">
          <WorkspaceDisclosure
            data-testid="case-progression-disclosure"
            title={model.stageLabel}
            eyebrow="Case progression"
            icon={<Target size={16} className="text-emerald-300" aria-hidden="true" />}
            description="Open the case path and the assignment pressure attached to it."
            summary={<span>{model.stageSteps.filter((step) => step.complete).length}/{model.stageSteps.length} complete</span>}
            responsiveOpenAt="xl"
            className="min-w-0 bg-black/30 xl:[&>summary]:hidden"
            contentClassName="xl:!block xl:!border-t-0"
          >
            <p className="mb-4 text-xs leading-5 text-zinc-300">
              {model.briefLine}
            </p>
            <ol
              className="flex max-w-full snap-x gap-2 overflow-x-auto pb-1 focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 [scrollbar-width:thin] xl:grid xl:grid-cols-1 xl:overflow-visible xl:pb-0"
              tabIndex={0}
              aria-label="Case progression. Use left and right arrow keys to review every stage."
              onKeyDown={handleHorizontalRailKeyDown}
            >
              {model.stageSteps.map((step) => (
                <li
                  key={step.label}
                  className={`min-w-[7.75rem] snap-start rounded-xl border px-3 py-2.5 xl:min-w-0 ${
                    step.active
                      ? "border-emerald-400/30 bg-emerald-400/10"
                      : step.complete
                        ? "border-blue-400/20 bg-blue-400/[0.06]"
                        : "border-white/10 bg-white/[0.025]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-eyebrow font-bold ${
                        step.active
                          ? "bg-emerald-300 text-zinc-950"
                          : step.complete
                            ? "bg-blue-300 text-zinc-950"
                            : "bg-zinc-700 text-zinc-200"
                      }`}
                    >
                      {step.complete ? "OK" : step.active ? ">" : ""}
                    </span>
                    <span className="text-xs font-semibold text-white">{step.label}</span>
                  </div>
                </li>
              ))}
            </ol>
          </WorkspaceDisclosure>

          {asideContent}
        </div>
      </CardContent>
    </Card>
  );
}
