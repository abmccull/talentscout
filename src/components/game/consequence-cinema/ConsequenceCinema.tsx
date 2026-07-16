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
  Clock3,
  FileSearch,
  History,
  Mail,
  Newspaper,
  NotebookPen,
  PhoneCall,
  Quote,
  UserRoundSearch,
  Voicemail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudio } from "@/lib/audio/useAudio";
import { careerMomentSfx } from "@/lib/audio/audioDirector";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  buildCareerStoryReel,
  type CareerStory,
  type CareerStoryContext,
  type CareerStoryMemory,
  type CareerStoryObligation,
  type CareerStorySecondaryEvent,
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
  notebook: "Scout notebook",
  voicemail: "Voicemail",
  farewellLetter: "Farewell letter",
};

const TEMPLATE_ICONS: Record<CareerStoryTemplate, typeof Newspaper> = {
  matchProgramme: BookOpen,
  phoneCall: PhoneCall,
  boardroom: BriefcaseBusiness,
  pressClipping: Newspaper,
  notebook: NotebookPen,
  voicemail: Voicemail,
  farewellLetter: Mail,
};

function toneDot(story: CareerStory): string {
  switch (story.tone) {
    case "positive": return "bg-emerald-400";
    case "negative": return "bg-red-400";
    case "mixed": return "bg-amber-400";
    default: return "bg-sky-400";
  }
}

function toneAccent(tone: CareerStory["tone"]): string {
  switch (tone) {
    case "positive": return "border-emerald-300/30 bg-emerald-300/[0.06] text-emerald-100";
    case "negative": return "border-red-300/30 bg-red-300/[0.06] text-red-100";
    case "mixed": return "border-amber-300/30 bg-amber-300/[0.06] text-amber-100";
    default: return "border-sky-300/30 bg-sky-300/[0.06] text-sky-100";
  }
}

function secondaryToneDot(tone: CareerStorySecondaryEvent["tone"]): string {
  switch (tone) {
    case "positive": return "bg-emerald-400";
    case "negative": return "bg-red-400";
    case "mixed": return "bg-amber-400";
    default: return "bg-sky-400";
  }
}

function CareerCallback({ story }: { story: CareerStory }) {
  return (
    <aside className={`mt-3 overflow-hidden rounded-xl border ${toneAccent(story.tone)}`} aria-label="Career callback and later events">
      <blockquote className="relative px-4 py-4 sm:px-5">
        <Quote size={22} className="absolute right-4 top-3 opacity-25" aria-hidden="true" />
        <p className="pr-7 font-serif text-base font-semibold italic leading-6">{story.callbackLine}</p>
        <footer className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] opacity-65">
          From the career archive
        </footer>
      </blockquote>
      {story.secondaryEvents.length > 0 && (
        <div className="border-t border-current/15 bg-black/20 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2">
            <Clock3 size={14} aria-hidden="true" />
            <h4 className="text-[10px] font-bold uppercase tracking-[0.15em]">What happened next</h4>
          </div>
          <ol className="mt-3 grid gap-2 sm:grid-cols-3">
            {story.secondaryEvents.map((event) => (
              <li key={event.id} className="relative rounded-lg border border-white/10 bg-black/20 p-3 pl-5 text-zinc-100">
                <span className={`absolute left-2 top-4 h-2 w-2 rounded-full ${secondaryToneDot(event.tone)}`} aria-hidden="true" />
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-400">{event.dateLabel}</p>
                <p className="mt-1 text-xs font-semibold">{event.label}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-300">{event.summary}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </aside>
  );
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

function NotebookFrame({ story }: { story: CareerStory }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[#9f8258]/45 bg-[#d8c39a] text-slate-950 shadow-[0_22px_55px_rgba(0,0,0,0.34)]">
      <div className="flex items-center justify-between gap-3 border-b border-[#59452d]/35 bg-[#43301f] px-4 py-3 text-[#f4e7c6] sm:px-6">
        <div className="flex items-center gap-2">
          <NotebookPen size={18} aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-[0.16em]">Personal scouting notebook</span>
        </div>
        <span className="text-[10px] font-semibold">S{story.season} W{story.week}</span>
      </div>
      <div className="bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,rgba(62,85,103,0.16)_32px)] px-4 py-5 sm:px-8 sm:py-7">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-900">{story.eyebrow}</p>
        <h3 className="mt-2 font-handwritten text-3xl font-bold leading-tight sm:text-4xl">{story.title}</h3>
        <p className="mt-2 max-w-3xl border-b border-[#59452d]/25 pb-4 text-sm italic text-slate-700">{story.subtitle}</p>
        <div className="grid gap-5 py-5 sm:grid-cols-2">
          <ContextDetails context={story.original} />
          <div className="border-t border-[#59452d]/25 pt-5 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            <ContextDetails context={story.outcome} />
          </div>
        </div>
        <StakeholderRecords memories={story.memories} obligations={story.obligations} />
      </div>
    </article>
  );
}

function VoicemailFrame({ story }: { story: CareerStory }) {
  return (
    <article className="rounded-xl border border-violet-300/15 bg-[radial-gradient(circle_at_top,rgba(167,139,250,0.15),transparent_40%),#090b13] p-3 shadow-[0_22px_55px_rgba(0,0,0,0.42)] sm:p-6">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[1.6rem] border border-white/12 bg-[#11131d]">
        <div className="border-b border-white/10 px-5 py-5 text-center">
          <Voicemail size={24} className="mx-auto text-violet-300" aria-hidden="true" />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/70">Archived voicemail transcript</p>
          <h3 className="mt-2 text-xl font-bold text-white">{story.title}</h3>
          <p className="mt-1 text-sm text-zinc-400">{story.subtitle}</p>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <ContextDetails context={story.original} ink="light" />
          </div>
          <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.06] p-4">
            <ContextDetails context={story.outcome} ink="light" />
          </div>
          <StakeholderRecords memories={story.memories} obligations={story.obligations} ink="light" />
        </div>
        <div className="border-t border-white/10 px-5 py-3 text-center text-[10px] text-zinc-500">
          Transcript only · no audio contains gameplay information
        </div>
      </div>
    </article>
  );
}

function FarewellLetterFrame({ story }: { story: CareerStory }) {
  return (
    <article className="overflow-hidden rounded-sm border border-[#d2c7ae] bg-[#eee8da] text-slate-950 shadow-[0_24px_65px_rgba(0,0,0,0.38)]">
      <div className="h-2 bg-[linear-gradient(90deg,#31563d_0_33%,#d7bd74_33%_66%,#713c32_66%)]" aria-hidden="true" />
      <div className="mx-auto max-w-4xl px-5 py-7 sm:px-10 sm:py-10">
        <div className="flex flex-col gap-3 border-b border-slate-900/20 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-900">From the final notebook</p>
            <h3 className="mt-2 font-serif text-3xl font-black leading-tight sm:text-4xl">{story.title}</h3>
          </div>
          <span className="text-xs font-semibold text-slate-600">Season {story.season}, Week {story.week}</span>
        </div>
        <p className="mt-5 font-serif text-base italic leading-7 text-slate-700">{story.subtitle}</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <ContextDetails context={story.original} />
          <div className="border-t border-slate-900/20 pt-6 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <ContextDetails context={story.outcome} />
          </div>
        </div>
        <div className="mt-6">
          <StakeholderRecords memories={story.memories} obligations={story.obligations} />
        </div>
        <p className="mt-8 text-right font-handwritten text-2xl text-slate-800">The work continues in other hands.</p>
      </div>
    </article>
  );
}

function StoryFrame({ story }: { story: CareerStory }) {
  switch (story.template) {
    case "phoneCall": return <PhoneCallFrame story={story} />;
    case "boardroom": return <BoardroomFrame story={story} />;
    case "pressClipping": return <PressClippingFrame story={story} />;
    case "notebook": return <NotebookFrame story={story} />;
    case "voicemail": return <VoicemailFrame story={story} />;
    case "farewellLetter": return <FarewellLetterFrame story={story} />;
    default: return <MatchProgrammeFrame story={story} />;
  }
}

export function ConsequenceCinema({
  source,
  onOpenPlayer,
  onOpenReport,
}: ConsequenceCinemaProps) {
  const { playSFX } = useAudio();
  const emotionalAudioCues = useSettingsStore((state) => state.emotionalAudioCues);
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

  const selectStory = (story: CareerStory) => {
    if (story.id === selectedStoryId) return;
    setSelectedStoryId(story.id);
    if (emotionalAudioCues) {
      playSFX(
        story.momentCategory
          ? careerMomentSfx(story.momentCategory)
          : story.tone === "positive"
            ? "discovery"
            : story.tone === "negative"
              ? "error"
              : story.tone === "mixed"
                ? "notification"
                : "page-turn",
      );
    }
  };

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
    selectStory(nextStory);
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
                      onClick={() => selectStory(story)}
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
            <CareerCallback story={selectedStory} />
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
