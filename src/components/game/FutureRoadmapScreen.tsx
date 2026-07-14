"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Compass,
  Gamepad2,
  ListChecks,
  Map,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScreenBackground } from "@/components/ui/screen-background";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PRODUCT_QUALITY_BARS,
  PRODUCT_ROADMAP_MODES,
  PRODUCT_ROADMAP_NOTICE,
  PRODUCT_ROADMAP_PHASES,
  PRODUCT_ROADMAP_STATUS_LABELS,
  PRODUCT_ROADMAP_SYSTEMS,
  type ProductRoadmapStatus,
} from "@/data/productRoadmap";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";

const STATUS_STYLES: Readonly<
  Record<ProductRoadmapStatus, { badge: string; dot: string }>
> = {
  available: {
    badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    dot: "bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.45)]",
  },
  validating: {
    badge: "border-sky-400/30 bg-sky-400/10 text-sky-300",
    dot: "bg-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.35)]",
  },
  planned: {
    badge: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    dot: "bg-amber-400",
  },
  exploring: {
    badge: "border-violet-400/30 bg-violet-400/10 text-violet-300",
    dot: "bg-violet-400",
  },
};

function StatusBadge({ status }: { status: ProductRoadmapStatus }) {
  return (
    <Badge
      variant="outline"
      className={`shrink-0 ${STATUS_STYLES[status].badge}`}
    >
      {PRODUCT_ROADMAP_STATUS_LABELS[status]}
    </Badge>
  );
}

function RoadmapOverview() {
  return (
    <div className="space-y-5" data-testid="roadmap-overview">
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Product phases">
        {PRODUCT_ROADMAP_PHASES.map((phase, index) => (
          <li
            key={phase.id}
            className="relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950/55 p-4"
          >
            <div className="mb-4 flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_STYLES[phase.status].dot}`}
                aria-hidden="true"
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Phase {index + 1}
              </span>
            </div>
            <p className="text-xs font-medium text-emerald-300">{phase.eyebrow}</p>
            <p className="mt-1 text-sm font-semibold text-white">{phase.title}</p>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-2">
        {PRODUCT_ROADMAP_PHASES.map((phase, index) => (
          <Card
            key={phase.id}
            className="border-white/10 bg-[#11161c]/95"
          >
            <CardHeader className="p-5 pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {index + 1}. {phase.eyebrow}
                  </p>
                  <CardTitle className="mt-2 text-lg text-white">{phase.title}</CardTitle>
                </div>
                <StatusBadge status={phase.status} />
              </div>
              <p className="pt-2 text-sm leading-relaxed text-zinc-300">
                {phase.summary}
              </p>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <ul className="space-y-2.5">
                {phase.outcomes.map((outcome) => (
                  <li key={outcome} className="flex gap-2.5 text-sm leading-relaxed text-zinc-400">
                    {phase.status === "available" ? (
                      <CheckCircle2
                        size={16}
                        className="mt-0.5 shrink-0 text-emerald-400"
                        aria-hidden="true"
                      />
                    ) : (
                      <CircleDashed
                        size={16}
                        className="mt-0.5 shrink-0 text-zinc-500"
                        aria-hidden="true"
                      />
                    )}
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RoadmapModes() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="roadmap-modes">
      {PRODUCT_ROADMAP_MODES.map((mode) => (
        <Card
          key={mode.id}
          className={`border-white/10 bg-[#11161c]/95 ${
            mode.status === "available" ? "ring-1 ring-emerald-400/20" : ""
          }`}
        >
          <CardHeader className="p-5 pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-lg text-white">{mode.name}</CardTitle>
                <p className="mt-1 text-xs font-medium text-emerald-300">{mode.role}</p>
              </div>
              <StatusBadge status={mode.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            <p className="text-sm leading-relaxed text-zinc-300">{mode.fantasy}</p>
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                What makes it play differently
              </p>
              <ul className="space-y-2">
                {mode.differentiators.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-zinc-400">
                    <Target
                      size={14}
                      className="mt-0.5 shrink-0 text-amber-300"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RoadmapSystems() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="roadmap-systems">
      {PRODUCT_ROADMAP_SYSTEMS.map((system) => (
        <Card key={system.id} className="border-white/10 bg-[#11161c]/95">
          <CardHeader className="p-5 pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle className="max-w-lg text-base leading-snug text-white">
                {system.title}
              </CardTitle>
              <StatusBadge status={system.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-0">
            <p className="text-sm leading-relaxed text-zinc-400">
              {system.description}
            </p>
            <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.06] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                Why it matters
              </p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-300">
                {system.playerValue}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RoadmapQualityBar() {
  return (
    <div className="space-y-4" data-testid="roadmap-quality-bar">
      <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.07] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck
            size={22}
            className="mt-0.5 shrink-0 text-sky-300"
            aria-hidden="true"
          />
          <div>
            <h2 className="font-semibold text-white">Evidence before expansion</h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-300">
              A screen, engine, or compiled module is not treated as released functionality.
              A feature graduates only when its decisions affect persistent state, future outcomes,
              saves, simulation processing, feedback, and accessible player journeys.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PRODUCT_QUALITY_BARS.map((bar, index) => (
          <Card key={bar.title} className="border-white/10 bg-[#11161c]/95">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-xs font-semibold text-emerald-300">
                  {index + 1}
                </span>
                <h3 className="font-semibold text-white">{bar.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                {bar.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 sm:p-5">
        <h2 className="font-semibold text-amber-200">What the labels mean</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold text-emerald-300">Available now</dt>
            <dd className="mt-1 text-xs leading-relaxed text-zinc-400">
              Playable in the current Youth Scout Early Access build.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-sky-300">In validation</dt>
            <dd className="mt-1 text-xs leading-relaxed text-zinc-400">
              Implemented or actively being hardened; scope may still change before it is considered proven.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-amber-300">Planned direction</dt>
            <dd className="mt-1 text-xs leading-relaxed text-zinc-400">
              Part of the intended product path, without a promised order or release date.
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-violet-300">Exploring</dt>
            <dd className="mt-1 text-xs leading-relaxed text-zinc-400">
              A possibility being tested; it may change substantially or not ship.
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function RoadmapContent({ hasActiveCareer }: { hasActiveCareer: boolean }) {
  const setScreen = useGameStore((state) => state.setScreen);

  return (
    <div
      className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10"
      data-testid="future-roadmap-screen"
    >
      <button
        type="button"
        onClick={() => setScreen(hasActiveCareer ? "dashboard" : "mainMenu")}
        className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {hasActiveCareer ? "Back to Desk" : "Back to main menu"}
      </button>

      <header className="overflow-hidden rounded-2xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.15),transparent_40%),linear-gradient(135deg,rgba(17,24,31,0.98),rgba(10,13,17,0.98))] p-5 shadow-2xl shadow-black/20 sm:p-7 lg:p-9">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
                Youth Scout Early Access
              </Badge>
              <Badge
                variant="outline"
                className="border-white/15 bg-black/15 text-zinc-300"
              >
                No fixed dates
              </Badge>
            </div>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              From one great scouting career to a scouting universe
            </p>
            <h1
              id="future-roadmap-title"
              className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
            >
              Product roadmap
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">
              TalentScout will grow by making judgement, uncertainty, access, persuasion,
              and long-term accountability deeper, without turning the player into a football manager.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {hasActiveCareer ? (
              <>
                <Button
                  variant="outline"
                  className="min-h-11 border-white/15 bg-black/15"
                  onClick={() => setScreen("handbook")}
                >
                  Read the handbook
                </Button>
                <Button className="min-h-11" onClick={() => setScreen("dashboard")}>
                  Continue career
                  <ArrowRight size={16} className="ml-2" aria-hidden="true" />
                </Button>
              </>
            ) : (
              <Button className="min-h-11" onClick={() => setScreen("newGame")}>
                Start a Youth career
                <ArrowRight size={16} className="ml-2" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <div
        id="roadmap-notice"
        className="mt-4 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] p-4"
        role="note"
      >
        <Compass
          size={19}
          className="mt-0.5 shrink-0 text-amber-300"
          aria-hidden="true"
        />
        <p className="text-sm leading-relaxed text-zinc-300">{PRODUCT_ROADMAP_NOTICE}</p>
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <div className="overflow-x-auto pb-1">
          <TabsList
            className="h-auto min-w-max justify-start border border-white/10 bg-zinc-900/90 p-1"
            aria-label="Roadmap sections"
          >
            <TabsTrigger value="overview" className="min-h-11 gap-2 px-3 sm:px-4">
              <Map size={15} aria-hidden="true" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="modes" className="min-h-11 gap-2 px-3 sm:px-4">
              <Gamepad2 size={15} aria-hidden="true" />
              Game modes
            </TabsTrigger>
            <TabsTrigger value="systems" className="min-h-11 gap-2 px-3 sm:px-4">
              <Sparkles size={15} aria-hidden="true" />
              Systems
            </TabsTrigger>
            <TabsTrigger value="quality" className="min-h-11 gap-2 px-3 sm:px-4">
              <ListChecks size={15} aria-hidden="true" />
              Quality bar
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" className="mt-5 focus:outline-none">
          <RoadmapOverview />
        </TabsContent>
        <TabsContent value="modes" className="mt-5 focus:outline-none">
          <RoadmapModes />
        </TabsContent>
        <TabsContent value="systems" className="mt-5 focus:outline-none">
          <RoadmapSystems />
        </TabsContent>
        <TabsContent value="quality" className="mt-5 focus:outline-none">
          <RoadmapQualityBar />
        </TabsContent>
      </Tabs>

      <footer className="mt-8 rounded-xl border border-white/10 bg-black/20 p-4 text-center sm:p-5">
        <p className="text-sm text-zinc-300">
          The constant across every phase: you are the scout. Your eye, evidence,
          relationships, and recommendations shape the story.
        </p>
      </footer>
    </div>
  );
}

export function FutureRoadmapScreen() {
  const hasActiveCareer = useGameStore(
    useShallow((state) => state.gameState !== null),
  );

  if (hasActiveCareer) {
    return (
      <GameLayout>
        <RoadmapContent hasActiveCareer />
      </GameLayout>
    );
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#090b0e]"
      aria-labelledby="future-roadmap-title"
    >
      <ScreenBackground src="/images/backgrounds/menu-bg-1.png" opacity={0.88} />
      <div className="relative z-10 min-h-screen overflow-y-auto">
        <RoadmapContent hasActiveCareer={false} />
      </div>
    </main>
  );
}
