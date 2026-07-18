"use client";

import Image from "next/image";
import { ArrowRight, Clock3, Eye, LockKeyhole, Phone, Sparkles, Users } from "lucide-react";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ScreenBackground } from "@/components/ui/screen-background";
import { useAudio } from "@/lib/audio/useAudio";
import { useGameStore } from "@/stores/gameStore";
import {
  buildOpeningCaseProjection,
  getOpeningCaseChoices,
  type OpeningCaseChoiceId,
} from "@/engine/youth/openingCase";

const CHOICE_ICONS = {
  protect: LockKeyhole,
  callClub: Phone,
  verify: Users,
} as const;

export function OpeningDiscoveryScreen() {
  const gameState = useGameStore((state) => state.gameState);
  const resolveChoice = useGameStore((state) => state.resolveOpeningDiscoveryChoice);
  const { playSFX } = useAudio();
  const projection = gameState ? buildOpeningCaseProjection(gameState) : null;
  const choices = gameState ? getOpeningCaseChoices(gameState) : [];
  const veteranPrologue = gameState?.veteranPrologue;
  const youth = gameState?.openingCase
    ? gameState.unsignedYouth[gameState.openingCase.youthId]
    : undefined;
  const latestJournal = gameState && projection
    ? Object.values(gameState.reflectionJournal ?? {})
        .filter((entry) => entry.playerIds.includes(projection.playerId))
        .sort((left, right) => right.createdAt - left.createdAt)[0]
    : undefined;
  const breakthrough = latestJournal?.flaggedMoments
    ?.find((moment) => moment.playerId === projection?.playerId && moment.reaction === "promising");
  const hypothesis = latestJournal?.hypotheses
    ?.find((entry) => entry.playerId === projection?.playerId);

  if (!gameState || !projection || !youth) return null;

  const background = veteranPrologue?.templateId === "data-anomaly"
    ? "/images/backgrounds/reports-desk.png"
    : veteranPrologue?.templateId === "international-limited-access"
      ? "/images/backgrounds/world-map.png"
      : veteranPrologue?.templateId === "rival-already-watching"
        ? "/images/backgrounds/rivals-binoculars.png"
        : ["followUpSession", "parentCoachMeeting"].includes(veteranPrologue?.activityType ?? "")
          ? "/images/backgrounds/network-lounge.png"
          : "/images/backgrounds/match-atmosphere.png";

  const handleChoice = (choiceId: OpeningCaseChoiceId) => {
    playSFX("discovery");
    resolveChoice(choiceId);
  };

  return (
    <main
      className="relative min-h-screen overflow-x-hidden bg-[#070a09] text-white"
      aria-labelledby="opening-discovery-heading"
      data-testid="opening-discovery"
    >
      <ScreenBackground src={background} opacity={0.45} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(16,185,129,0.18),transparent_35%),linear-gradient(to_bottom,rgba(4,7,6,0.15),#070a09_75%)]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-8 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/images/branding/icon-notebook.png"
              alt=""
              width={44}
              height={44}
              unoptimized
              className="h-11 w-11 rounded-xl border border-emerald-300/20 object-cover"
            />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                {projection.eyebrow}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">{projection.venueLabel} · Week {gameState.currentWeek}, Season {gameState.currentSeason}</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-300 sm:flex">
            <Eye size={14} className="text-emerald-300" aria-hidden="true" />
            You were first to notice
          </div>
        </header>

        <section className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
          <div className="mx-auto w-full max-w-xl text-center lg:text-left">
            <div className="mx-auto mb-5 flex w-fit items-end gap-3 lg:mx-0">
              <div className="rounded-full border-2 border-emerald-300/50 bg-[#101712] p-1 shadow-[0_0_50px_rgba(16,185,129,0.18)]">
                <PlayerAvatar
                  playerId={projection.playerId}
                  nationality={youth.player.nationality}
                  size={96}
                  className="rounded-full"
                />
              </div>
              <span className="mb-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
                {projection.position} · Age {projection.age}
              </span>
            </div>

            <div className="mb-3 flex items-center justify-center gap-2 lg:justify-start">
              <Sparkles size={18} className="text-amber-300" aria-hidden="true" />
              <p className="font-handwritten text-lg text-amber-100">Write the name down.</p>
            </div>
            <h1 id="opening-discovery-heading" className="text-balance text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
              {projection.playerName}
            </h1>
            <p className="mt-4 text-balance text-lg leading-7 text-zinc-200">
              {projection.headline}
            </p>
            {projection.premise && (
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {projection.premise}
              </p>
            )}
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              {projection.uncertainty}
            </p>

            <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">{projection.signalLabel}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-200">
                  {breakthrough?.description
                    ?? veteranPrologue?.evidenceBeats[1].focused
                    ?? "A pressured action showed vision and anticipation beyond the rhythm of the match."}
                </p>
              </div>
              <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">The open question</p>
                <p className="mt-2 text-sm leading-6 text-zinc-200">
                  {hypothesis?.text
                    ?? veteranPrologue?.contradiction
                    ?? "Was that natural composure—or one exceptional moment in an otherwise uneven performance?"}
                </p>
              </div>
            </div>
            {projection.deadline && (
              <div className="mt-3 flex items-start gap-3 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-4 text-left">
                <Clock3 size={17} className="mt-0.5 shrink-0 text-rose-200" aria-hidden="true" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-200">Decision window</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-200">{projection.deadline}</p>
                  {projection.stakeholderConflict && (
                    <p className="mt-1 text-xs leading-5 text-zinc-400">{projection.stakeholderConflict}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d1210]/95 p-4 shadow-2xl backdrop-blur sm:p-6">
            <div className="mb-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Your next move</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{projection.questionLabel}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                The call you make now will shape who gets access, how quickly the name spreads,
                and whether people trust your judgment later.
              </p>
            </div>

            <div className="space-y-3" role="group" aria-label="Choose what to do with the lead">
              {choices.map((choice) => {
                const Icon = CHOICE_ICONS[choice.id];
                const choiceLabel = !veteranPrologue && choice.id === "verify"
                  ? `Ask ${projection.sourceContactName} to verify`
                  : choice.label;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => handleChoice(choice.id)}
                    className="group flex min-h-24 w-full items-start gap-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-left transition hover:border-emerald-300/40 hover:bg-emerald-300/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 motion-reduce:transition-none"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-emerald-300">
                      <Icon size={19} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-white group-hover:text-emerald-100">{choiceLabel}</span>
                        <ArrowRight size={16} className="shrink-0 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-emerald-300 motion-reduce:transition-none" aria-hidden="true" />
                      </span>
                      <span className="mt-1.5 block text-sm leading-5 text-zinc-400">{choice.description}</span>
                      {choice.effect && (
                        <span className="mt-1.5 block text-xs leading-5 text-emerald-200/80">
                          What this means: {choice.effect}
                        </span>
                      )}
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {choice.knownTradeoffs.map((tradeoff) => (
                          <span key={tradeoff} className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-zinc-300">
                            {tradeoff}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-center text-[11px] leading-5 text-zinc-400">
              No one knows what this player will become. What you record, who you tell, and
              whether you return will decide whether this first read earns trust or becomes a lesson.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
