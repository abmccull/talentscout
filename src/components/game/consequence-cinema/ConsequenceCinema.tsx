"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  History,
  Newspaper,
  PhoneCall,
  UserRoundSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildCareerStoryReel,
  type CareerStory,
  type CareerStoryContext,
  type CareerStoryMemory,
  type CareerStoryObligation,
  type CareerStoryTemplate,
  type ConsequenceCinemaSource,
} from "./consequenceCinemaModel";

interface ConsequenceCinemaProps {
  source: ConsequenceCinemaSource;
  onOpenPlayer: (playerId: string) => void;
  onOpenReport: (reportId: string, playerId?: string) => void;
}

const TEMPLATE_LABELS: Record<CareerStoryTemplate, string> = {
  matchProgramme: "Match programme",
  phoneCall: "Phone call",
  boardroom: "Boardroom",
  pressClipping: "Press clipping",
};

const TEMPLATE_ICONS: Record<CareerStoryTemplate, typeof Newspaper> = {
  matchProgramme: BookOpen,
  phoneCall: PhoneCall,
  boardroom: BriefcaseBusiness,
  pressClipping: Newspaper,
};

function toneDot(story: CareerStory): string {
  switch (story.tone) {
    case "positive": return "bg-emerald-400";
    case "negative": return "bg-red-400";
    case "mixed": return "bg-amber-400";
    default: return "bg-sky-400";
  }
}

function ContextDetails({
  context,
  ink = "dark",
}: {
  context: CareerStoryContext;
  ink?: "dark" | "light";
}) {
  const primary = ink === "light" ? "text-zinc-100" : "text-slate-950";
  const secondary = ink === "light" ? "text-zinc-300" : "text-slate-700";
  const muted = ink === "light" ? "text-zinc-400" : "text-slate-600";
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${muted}`}>{context.label}</p>
        <p className={`text-[10px] ${muted}`}>{context.dateLabel}</p>
      </div>
      <h4 className={`mt-2 text-base font-bold ${primary}`}>{context.headline}</h4>
      <p className={`mt-2 text-sm leading-6 ${secondary}`}>{context.body}</p>
      {context.details.length > 0 && (
        <ul className={`mt-3 space-y-1.5 text-xs leading-5 ${secondary}`}>
          {context.details.slice(0, 6).map((detail, index) => (
            <li key={`${detail}-${index}`} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current opacity-60" aria-hidden="true" />
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StakeholderRecords({
  memories,
  obligations,
  ink = "dark",
}: {
  memories: CareerStoryMemory[];
  obligations: CareerStoryObligation[];
  ink?: "dark" | "light";
}) {
  if (memories.length === 0 && obligations.length === 0) return null;
  const border = ink === "light" ? "border-white/10" : "border-slate-900/15";
  const background = ink === "light" ? "bg-white/[0.04]" : "bg-black/[0.035]";
  const primary = ink === "light" ? "text-zinc-100" : "text-slate-950";
  const secondary = ink === "light" ? "text-zinc-300" : "text-slate-700";
  const muted = ink === "light" ? "text-zinc-400" : "text-slate-600";

  return (
    <div className={`grid gap-2 border-t pt-4 sm:grid-cols-2 ${border}`}>
      {memories.map((memory) => (
        <div key={memory.id} className={`rounded-lg border p-3 ${border} ${background}`}>
          <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${muted}`}>Stakeholder memory</p>
          <p className={`mt-1 text-sm font-semibold ${primary}`}>{memory.holder}</p>
          <p className={`mt-1 text-xs leading-5 ${secondary}`}>{memory.summary}</p>
          <p className={`mt-2 text-[10px] ${muted}`}>
            Intensity {memory.intensity}/100 · Salience {memory.salience}/100
          </p>
        </div>
      ))}
      {obligations.map((obligation) => (
        <div key={obligation.id} className={`rounded-lg border p-3 ${border} ${background}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${muted}`}>Obligation</p>
            <span className={`text-[10px] font-bold uppercase ${primary}`}>{obligation.status}</span>
          </div>
          <p className={`mt-1 text-xs font-semibold ${primary}`}>{obligation.parties}</p>
          <p className={`mt-1 text-xs leading-5 ${secondary}`}>{obligation.terms}</p>
          <p className={`mt-2 text-[10px] ${muted}`}>{obligation.timing}</p>
          {obligation.resolution && <p className={`mt-1 text-[10px] ${secondary}`}>{obligation.resolution}</p>}
        </div>
      ))}
    </div>
  );
}

function MatchProgrammeFrame({ story }: { story: CareerStory }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[#d8caa9] bg-[#e8dfc9] text-slate-950 shadow-[0_20px_50px_rgba(0,0,0,0.32)]">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 bg-[#132019] px-4 py-3 text-[#f4ecd8] sm:px-6">
        <span className="font-serif text-2xl font-black">TS</span>
        <div className="text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em]">Career match programme</p>
          <p className="text-xs text-[#c6d1c8]">The judgment · The outcome</p>
        </div>
        <span className="text-[10px] font-bold">S{story.season} W{story.week}</span>
      </div>
      <div className="border-b-4 border-double border-slate-900/50 px-4 py-5 text-center sm:px-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800">{story.eyebrow}</p>
        <h3 className="mt-2 font-serif text-2xl font-black leading-tight sm:text-3xl">{story.title}</h3>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-700">{story.subtitle}</p>
      </div>
      <div className="grid gap-5 px-4 py-5 sm:grid-cols-2 sm:px-8">
        <ContextDetails context={story.original} />
        <div className="border-t border-slate-900/20 pt-5 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <ContextDetails context={story.outcome} />
        </div>
      </div>
      <div className="px-4 pb-5 sm:px-8">
        <StakeholderRecords memories={story.memories} obligations={story.obligations} />
      </div>
    </article>
  );
}

function PhoneCallFrame({ story }: { story: CareerStory }) {
  const caller = story.memories[0]?.holder ?? "Career archive";
  return (
    <article className="rounded-xl border border-sky-300/15 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_38%),#07111c] p-3 shadow-[0_22px_55px_rgba(0,0,0,0.4)] sm:p-6">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[1.8rem] border border-white/15 bg-[#0b1521] shadow-2xl">
        <div className="border-b border-white/10 bg-black/20 px-5 py-4 text-center">
          <PhoneCall size={20} className="mx-auto text-sky-300" aria-hidden="true" />
          <p className="mt-1 text-xs font-semibold text-white">{caller}</p>
          <p className="text-[10px] uppercase tracking-[0.15em] text-sky-200/70">Recorded career callback</p>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white/8 p-4">
            <ContextDetails context={story.original} ink="light" />
          </div>
          <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-sky-400/12 p-4 ring-1 ring-sky-300/15">
            <ContextDetails context={story.outcome} ink="light" />
          </div>
          <StakeholderRecords memories={story.memories} obligations={story.obligations} ink="light" />
        </div>
        <div className="border-t border-white/10 px-5 py-3 text-center text-[10px] text-zinc-400">
          S{story.season} W{story.week} · Transcript assembled from persisted records
        </div>
      </div>
    </article>
  );
}

function BoardroomFrame({ story }: { story: CareerStory }) {
  return (
    <article className="overflow-hidden rounded-xl border border-amber-200/15 bg-[linear-gradient(145deg,#171713,#0d1010)] shadow-[0_20px_55px_rgba(0,0,0,0.4)]">
      <div className="flex flex-col gap-3 border-b border-amber-100/10 bg-amber-50/[0.035] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/70">Recruitment committee · Agenda item</p>
          <h3 className="mt-1 text-xl font-bold text-white sm:text-2xl">{story.title}</h3>
        </div>
        <span className="self-start rounded border border-amber-200/20 px-2.5 py-1 text-[10px] font-bold text-amber-100 sm:self-auto">
          S{story.season} W{story.week}
        </span>
      </div>
      <p className="px-4 pt-4 text-sm text-zinc-300 sm:px-6">{story.subtitle}</p>
      <div className="grid gap-3 p-4 sm:p-6">
        <div className="grid gap-4 rounded-lg border border-white/10 bg-black/20 p-4 sm:grid-cols-[2.5rem_1fr]">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-200/20 text-sm font-black text-amber-200">01</span>
          <ContextDetails context={story.original} ink="light" />
        </div>
        <div className="grid gap-4 rounded-lg border border-emerald-200/10 bg-emerald-300/[0.035] p-4 sm:grid-cols-[2.5rem_1fr]">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200/20 text-sm font-black text-emerald-200">02</span>
          <ContextDetails context={story.outcome} ink="light" />
        </div>
        <StakeholderRecords memories={story.memories} obligations={story.obligations} ink="light" />
      </div>
    </article>
  );
}

function PressClippingFrame({ story }: { story: CareerStory }) {
  return (
    <article className="overflow-hidden rounded-sm border border-[#d5cfbf] bg-[#eeeadd] text-slate-950 shadow-[6px_8px_0_rgba(0,0,0,0.16),0_22px_55px_rgba(0,0,0,0.3)]">
      <div className="border-b-[3px] border-double border-slate-900 px-4 py-3 text-center sm:px-8">
        <p className="font-serif text-2xl font-black uppercase tracking-tight sm:text-3xl">The Scouting Record</p>
        <div className="mt-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">
          <span>Career edition</span><span>Season {story.season}</span><span>Week {story.week}</span>
        </div>
      </div>
      <div className="px-4 py-5 sm:px-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-800">{story.eyebrow}</p>
        <h3 className="mt-2 font-serif text-3xl font-black leading-[0.95] sm:text-4xl">{story.title}</h3>
        <p className="mt-3 border-b border-slate-900/25 pb-4 font-serif text-sm italic text-slate-700">{story.subtitle}</p>
        <div className="grid gap-5 py-5 sm:grid-cols-2">
          <ContextDetails context={story.original} />
          <div className="border-t border-slate-900/20 pt-5 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            <ContextDetails context={story.outcome} />
          </div>
        </div>
        <StakeholderRecords memories={story.memories} obligations={story.obligations} />
      </div>
    </article>
  );
}

function StoryFrame({ story }: { story: CareerStory }) {
  switch (story.template) {
    case "phoneCall": return <PhoneCallFrame story={story} />;
    case "boardroom": return <BoardroomFrame story={story} />;
    case "pressClipping": return <PressClippingFrame story={story} />;
    default: return <MatchProgrammeFrame story={story} />;
  }
}

export function ConsequenceCinema({
  source,
  onOpenPlayer,
  onOpenReport,
}: ConsequenceCinemaProps) {
  const stories = useMemo(() => buildCareerStoryReel(source), [source]);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(stories[0]?.id ?? null);
  const selectorRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (stories.length === 0) {
      setSelectedStoryId(null);
      return;
    }
    if (!stories.some((story) => story.id === selectedStoryId)) {
      setSelectedStoryId(stories[0].id);
    }
  }, [selectedStoryId, stories]);

  const selectedStory = stories.find((story) => story.id === selectedStoryId) ?? stories[0];

  const handleSelectorKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? stories.length - 1
        : event.key === "ArrowLeft"
          ? (index - 1 + stories.length) % stories.length
          : (index + 1) % stories.length;
    const nextStory = stories[nextIndex];
    setSelectedStoryId(nextStory.id);
    const buttons = selectorRef.current?.querySelectorAll<HTMLButtonElement>("[data-story-selector]");
    buttons?.[nextIndex]?.focus({ preventScroll: true });
    buttons?.[nextIndex]?.scrollIntoView({ block: "nearest", inline: "center" });
  };

  return (
    <section
      data-testid="consequence-cinema"
      aria-labelledby="consequence-cinema-heading"
      className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c1116]/95 shadow-xl shadow-black/20"
    >
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <History size={17} className="text-emerald-300" aria-hidden="true" />
            <h2 id="consequence-cinema-heading" className="text-base font-bold text-white">Career story reel</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Revisit what you believed, what you chose, and what the football world recorded later.
          </p>
        </div>
        {stories.length > 0 && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
            {stories.length} preserved {stories.length === 1 ? "story" : "stories"}
          </p>
        )}
      </div>

      {stories.length === 0 || !selectedStory ? (
        <div className="px-4 py-10 text-center sm:px-6">
          <FileSearch size={28} className="mx-auto text-zinc-600" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold text-zinc-200">No complete causal stories yet</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-400">
            A reel appears after a recommendation review completes, a player you discovered moves, or a recorded decision finishes resolving. The game will not manufacture a story before the save contains an outcome.
          </p>
        </div>
      ) : (
        <>
          <div className="border-b border-white/10 bg-black/15 px-3 py-3 sm:px-4">
            <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              <span>Select a preserved story</span>
              <span className="hidden items-center gap-1 sm:flex"><ChevronLeft size={11} aria-hidden="true" /> Arrow keys <ChevronRight size={11} aria-hidden="true" /></span>
            </div>
            <ul
              ref={selectorRef}
              className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
              aria-label="Career story reel selections"
            >
              {stories.map((story, index) => {
                const Icon = TEMPLATE_ICONS[story.template];
                const selected = story.id === selectedStory.id;
                return (
                  <li key={story.id} className="min-w-[15rem] max-w-[18rem] flex-1 snap-start">
                    <button
                      type="button"
                      data-story-selector
                      onClick={() => setSelectedStoryId(story.id)}
                      onKeyDown={(event) => handleSelectorKeyDown(event, index)}
                      aria-pressed={selected}
                      aria-controls="career-story-stage"
                      className={`flex min-h-[5.6rem] w-full items-start gap-3 rounded-xl border p-3 text-left transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                        selected
                          ? "border-emerald-300/40 bg-emerald-300/[0.08]"
                          : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.045]"
                      }`}
                    >
                      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/25 text-zinc-300">
                        <Icon size={17} aria-hidden="true" />
                        <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#11161c] ${toneDot(story)}`} aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[9px] font-bold uppercase tracking-[0.13em] text-zinc-400">
                          {TEMPLATE_LABELS[story.template]} · S{story.season} W{story.week}
                        </span>
                        <span className="mt-1 block line-clamp-2 text-sm font-semibold leading-5 text-zinc-100">{story.title}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="sr-only" aria-live="polite" aria-atomic="true">
            Selected {TEMPLATE_LABELS[selectedStory.template]} story: {selectedStory.title}
          </p>
          <div id="career-story-stage" role="region" aria-label={`Selected career story: ${selectedStory.title}`} className="p-3 sm:p-5">
            <StoryFrame key={selectedStory.id} story={selectedStory} />
            {(selectedStory.playerId || selectedStory.reportId) && (
              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-400">Continue from the preserved story into the underlying game record.</p>
                <div className="flex flex-col gap-2 min-[430px]:flex-row">
                  {selectedStory.playerId && (
                    <Button size="sm" variant="outline" onClick={() => onOpenPlayer(selectedStory.playerId!)} className="min-h-11">
                      <UserRoundSearch size={14} className="mr-2" aria-hidden="true" />
                      Open player dossier
                    </Button>
                  )}
                  {selectedStory.reportId && (
                    <Button size="sm" onClick={() => onOpenReport(selectedStory.reportId!, selectedStory.playerId)} className="min-h-11">
                      <FileSearch size={14} className="mr-2" aria-hidden="true" />
                      Open report history
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
