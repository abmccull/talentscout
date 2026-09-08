"use client";

import { useEffect, useState } from "react";
import { Clock3, LockKeyhole, Phone, Users } from "lucide-react";
import { ChoiceCard } from "@/components/ui/ChoiceCard";
import { YouthPortraitWithFallback } from "@/components/game/YouthPortrait";
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
  const setScreen = useGameStore((state) => state.setScreen);
  const activeSession = useGameStore((state) => state.activeSession);
  const { playStinger } = useAudio();
  const [pendingChoice, setPendingChoice] = useState<OpeningCaseChoiceId | null>(null);
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
    ?.find((moment) => moment.playerId === projection?.playerId);
  const hypothesis = latestJournal?.hypotheses
    ?.find((entry) => entry.playerId === projection?.playerId);

  useEffect(() => {
    if (!gameState?.openingCase) return;
    if (gameState.openingCase.stage === "report") {
      useGameStore.getState().setScreen("reportWriter");
    }
  }, [gameState?.openingCase]);

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
    if (pendingChoice) return;
    setPendingChoice(choiceId);
    playStinger("discovery");
    resolveChoice(choiceId);
  };

  return (
    <main
      className="relative min-h-screen overflow-x-hidden bg-[color:var(--background)] text-[color:var(--foreground)]"
      aria-labelledby="opening-discovery-heading"
      data-testid="opening-discovery"
    >
      <ScreenBackground src={background} opacity={0.9} />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] pb-4">
          <div>
            <p className="dossier-eyebrow">{projection.eyebrow}</p>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{projection.venueLabel} · Week {gameState.currentWeek}, Season {gameState.currentSeason}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (gameState.openingCase?.stage === "report") {
                setScreen("reportWriter");
                return;
              }
              setScreen(activeSession ? "observation" : "dashboard");
            }}
            className="min-h-11 rounded px-3 text-sm font-medium text-[color:var(--muted-foreground)] transition hover:bg-[color:var(--surface-interactive)] hover:text-[color:var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ring)]"
          >
            {gameState.openingCase?.stage === "report"
              ? "Continue to the report"
              : activeSession
                ? "Back to Watch"
                : "Back to Desk"}
          </button>
        </header>

        <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
          <div className="min-w-0">
            <div className="flex items-center gap-5">
              <YouthPortraitWithFallback
                playerId={projection.playerId}
                nationality={youth.player.nationality}
                age={projection.age}
                size={96}
                className="shrink-0"
                alt={projection.playerName}
              />
              <div className="min-w-0">
                <p className="dossier-eyebrow">Write the name down</p>
                <h1 id="opening-discovery-heading" className="font-editorial mt-2 text-3xl leading-tight sm:text-4xl">
                  {projection.playerName}
                </h1>
                <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{projection.position} · Age {projection.age}</p>
              </div>
            </div>
            <p className="font-editorial mt-6 text-2xl leading-snug">{projection.headline}</p>
            {projection.premise && <p className="mt-3 text-sm leading-6 text-[color:var(--muted-foreground)]">{projection.premise}</p>}
            <p className="mt-3 text-sm leading-6 text-[color:var(--muted-foreground)]">{projection.uncertainty}</p>

            <div className="dossier-section mt-6 space-y-5">
              <div>
                <h2 className="dossier-eyebrow">{projection.signalLabel}</h2>
                <p className="mt-2 text-sm leading-6">
                  {breakthrough?.description
                    ?? veteranPrologue?.evidenceBeats[1].focused
                    ?? "No clear passage was retained. Keep the uncertainty in your report instead of inventing a strength."}
                </p>
              </div>
              <div>
                <h2 className="dossier-eyebrow">The open question</h2>
                <p className="mt-2 text-sm leading-6">
                  {hypothesis?.text
                    ?? veteranPrologue?.contradiction
                    ?? "Would another context support this first impression, or overturn it?"}
                </p>
              </div>
            </div>
            {projection.deadline && (
              <div className="flex items-start gap-3 border-l-2 border-[color:var(--signal-warn)] pl-4">
                <Clock3 size={17} className="mt-0.5 shrink-0 text-[color:var(--signal-warn)]" aria-hidden="true" />
                <div>
                  <p className="dossier-eyebrow">Decision window</p>
                  <p className="mt-1 text-sm leading-6">{projection.deadline}</p>
                  {projection.stakeholderConflict && <p className="mt-1 text-sm leading-6 text-[color:var(--muted-foreground)]">{projection.stakeholderConflict}</p>}
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0 border-t-2 border-[color:var(--primary)] pt-5">
            <div className="mb-5">
              <p className="dossier-eyebrow">Your next move</p>
              <h2 className="font-editorial mt-2 text-3xl leading-tight">{projection.questionLabel}</h2>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">Your choice affects access, discretion, and trust.</p>
            </div>
            <div
              className="space-y-3"
              role="group"
              aria-label="Choose what to do with the lead"
              data-tutorial-id="opening-discovery-choices"
            >
              {choices.map((choice) => {
                const Icon = CHOICE_ICONS[choice.id];
                const choiceLabel = !veteranPrologue && choice.id === "verify"
                  ? `Ask ${projection.sourceContactName} to verify`
                  : choice.label;
                return (
                  <ChoiceCard
                    key={choice.id}
                    selected={pendingChoice === choice.id}
                    pending={pendingChoice === choice.id}
                    disabled={pendingChoice !== null && pendingChoice !== choice.id}
                    disabledReason={pendingChoice && pendingChoice !== choice.id ? "Choice already committed." : undefined}
                    onSelect={() => handleChoice(choice.id)}
                    className="min-h-24 bg-[color:var(--surface)] px-4 py-4"
                  >
                    <span className="flex items-start gap-3">
                      <Icon size={20} className="mt-0.5 shrink-0 text-[color:var(--primary)]" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold">{choiceLabel}</span>
                        <span className="mt-1 block text-sm leading-6 text-[color:var(--muted-foreground)]">{choice.description}</span>
                        {choice.effect && <span className="mt-2 block text-sm leading-6 text-[color:var(--primary)]">{choice.effect}</span>}
                        <span className="mt-2 block text-xs leading-5 text-[color:var(--muted-foreground)]">
                          {choice.knownTradeoffs.map((tradeoff, index) => (
                            <span key={tradeoff}>{index > 0 && <span aria-hidden="true"> · </span>}{tradeoff}</span>
                          ))}
                        </span>
                      </span>
                    </span>
                  </ChoiceCard>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
