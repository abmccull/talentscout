"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/stores/gameStore";
import { useAuthStore } from "@/stores/authStore";
import { MainMenu } from "@/components/game/MainMenu";
import { NewGameScreen } from "@/components/game/NewGameScreen";
import { Dashboard } from "@/components/game/Dashboard";
import { CalendarScreen } from "@/components/game/CalendarScreen";
import { ObservationScreen } from "@/components/game/ObservationScreen";
import { PlayerProfile } from "@/components/game/PlayerProfile";
import { ReportWriter } from "@/components/game/ReportWriter";
import { ReportHistory } from "@/components/game/ReportHistory";
import { CareerScreen } from "@/components/game/CareerScreen";
import { InboxScreen } from "@/components/game/InboxScreen";
import { SettingsScreen } from "@/components/game/SettingsScreen";
import { InternationalScreen } from "@/components/game/InternationalScreen";
import { YouthScoutingScreen } from "@/components/game/YouthScoutingScreen";
import { WikiScreen } from "@/components/game/wiki/WikiScreen";
import { WeekSimulationScreen } from "@/components/game/WeekSimulationScreen";
import { AchievementToast } from "@/components/game/AchievementToast";
import { MentorOverlay } from "@/components/game/tutorial/MentorOverlay";
import { GuidedChecklist } from "@/components/game/tutorial/GuidedChecklist";
import { ScreenGuidePanel } from "@/components/game/tutorial/ScreenGuidePanel";
import { HintToast } from "@/components/game/tutorial/HintToast";
import { SettingsApplier } from "@/components/game/SettingsApplier";
import { Celebration } from "@/components/game/effects/Celebration";
import { InsightPayoff } from "@/components/game/InsightPayoff";
import { ScenarioOutcomeOverlay } from "@/components/game/ScenarioOutcomeOverlay";
import { useAchievementStore } from "@/stores/achievementStore";
import { useTutorialStore } from "@/stores/tutorialStore";
import { useScreenMusic } from "@/lib/audio/useScreenMusic";
import { useKeyboardNav, setFeedbackOpenHandler } from "@/lib/useKeyboardNav";
import { FeedbackModal } from "@/components/game/FeedbackModal";
import { ScreenErrorBoundary } from "@/components/game/ScreenErrorBoundary";

function GameScreenLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-[#090b0e] text-sm text-zinc-400"
    >
      Loading workspace…
    </div>
  );
}

// Full-release and later-career screens stay available, but no longer inflate
// the Youth Early Access launch bundle before a player actually opens them.
const MatchScreen = dynamic(
  () => import("@/components/game/MatchScreen").then((module) => module.MatchScreen),
  { ssr: false, loading: GameScreenLoading },
);
const PlayerDatabase = dynamic(
  () => import("@/components/game/PlayerDatabase").then((module) => module.PlayerDatabase),
  { ssr: false, loading: GameScreenLoading },
);
const NetworkScreen = dynamic(
  () => import("@/components/game/NetworkScreen").then((module) => module.NetworkScreen),
  { ssr: false, loading: GameScreenLoading },
);
const NPCManagementScreen = dynamic(
  () => import("@/components/game/NPCManagementScreen").then((module) => module.NPCManagementScreen),
  { ssr: false, loading: GameScreenLoading },
);
const DiscoveriesScreen = dynamic(
  () => import("@/components/game/DiscoveriesScreen").then((module) => module.DiscoveriesScreen),
  { ssr: false, loading: GameScreenLoading },
);
const LeaderboardScreen = dynamic(
  () => import("@/components/game/LeaderboardScreen").then((module) => module.LeaderboardScreen),
  { ssr: false, loading: GameScreenLoading },
);
const AnalyticsScreen = dynamic(
  () => import("@/components/game/AnalyticsScreen").then((module) => module.AnalyticsScreen),
  { ssr: false, loading: GameScreenLoading },
);
const MatchSummaryScreen = dynamic(
  () => import("@/components/game/MatchSummaryScreen").then((module) => module.MatchSummaryScreen),
  { ssr: false, loading: GameScreenLoading },
);
const FixtureBrowser = dynamic(
  () => import("@/components/game/FixtureBrowser").then((module) => module.FixtureBrowser),
  { ssr: false, loading: GameScreenLoading },
);
const AlumniDashboard = dynamic(
  () => import("@/components/game/AlumniDashboard").then((module) => module.AlumniDashboard),
  { ssr: false, loading: GameScreenLoading },
);
const FinancialDashboard = dynamic(
  () => import("@/components/game/FinancialDashboard").then((module) => module.FinancialDashboard),
  { ssr: false, loading: GameScreenLoading },
);
const AchievementScreen = dynamic(
  () => import("@/components/game/AchievementScreen").then((module) => module.AchievementScreen),
  { ssr: false, loading: GameScreenLoading },
);
const ScenarioSelect = dynamic(
  () => import("@/components/game/ScenarioSelect").then((module) => module.ScenarioSelect),
  { ssr: false, loading: GameScreenLoading },
);
const HallOfFame = dynamic(
  () => import("@/components/game/HallOfFame").then((module) => module.HallOfFame),
  { ssr: false, loading: GameScreenLoading },
);
const DemoEndScreen = dynamic(
  () => import("@/components/game/DemoEndScreen").then((module) => module.DemoEndScreen),
  { ssr: false, loading: GameScreenLoading },
);
const EquipmentScreen = dynamic(
  () => import("@/components/game/EquipmentScreen").then((module) => module.EquipmentScreen),
  { ssr: false, loading: GameScreenLoading },
);
const AgencyScreen = dynamic(
  () => import("@/components/game/AgencyScreen").then((module) => module.AgencyScreen),
  { ssr: false, loading: GameScreenLoading },
);
const TrainingScreen = dynamic(
  () => import("@/components/game/TrainingScreen").then((module) => module.TrainingScreen),
  { ssr: false, loading: GameScreenLoading },
);
const RivalsScreen = dynamic(
  () => import("@/components/game/RivalsScreen").then((module) => module.RivalsScreen),
  { ssr: false, loading: GameScreenLoading },
);
const ReportComparison = dynamic(
  () => import("@/components/game/ReportComparison").then((module) => module.ReportComparison),
  { ssr: false, loading: GameScreenLoading },
);
const NegotiationScreen = dynamic(
  () => import("@/components/game/NegotiationScreen").then((module) => module.NegotiationScreen),
  { ssr: false, loading: GameScreenLoading },
);
const FreeAgentScreen = dynamic(
  () => import("@/components/game/FreeAgentScreen").then((module) => module.FreeAgentScreen),
  { ssr: false, loading: GameScreenLoading },
);
const SeasonAwardsScreen = dynamic(
  () => import("@/components/game/SeasonAwardsScreen").then((module) => module.SeasonAwardsScreen),
  { ssr: false, loading: GameScreenLoading },
);
const ScoutPerformanceDashboard = dynamic(
  () => import("@/components/game/ScoutPerformanceDashboard").then((module) => module.ScoutPerformanceDashboard),
  { ssr: false, loading: GameScreenLoading },
);

/**
 * Null-safe wrapper for HallOfFame.
 * Redirects to mainMenu when there is no active game state.
 */
function HallOfFameWrapper() {
  const gameState = useGameStore((s) => s.gameState);
  const setScreen = useGameStore((s) => s.setScreen);

  useEffect(() => {
    if (!gameState) {
      setScreen("mainMenu");
    }
  }, [gameState, setScreen]);

  if (!gameState) return null;

  return (
    <HallOfFame
      legacyScore={gameState.legacyScore}
      scout={gameState.scout}
      gameState={gameState}
    />
  );
}

function ScreenContent({ currentScreen }: { currentScreen: string }) {
  switch (currentScreen) {
    case "mainMenu":
      return <MainMenu />;
    case "newGame":
      return <NewGameScreen />;
    case "dashboard":
      return <Dashboard />;
    case "calendar":
      return <CalendarScreen />;
    case "match":
      return <MatchScreen />;
    case "observation":
      return <ObservationScreen />;
    case "matchSummary":
      return <MatchSummaryScreen />;
    case "playerProfile":
      return <PlayerProfile />;
    case "playerDatabase":
      return <PlayerDatabase />;
    case "reportWriter":
      return <ReportWriter />;
    case "reportHistory":
      return <ReportHistory />;
    case "career":
      return <CareerScreen />;
    case "network":
      return <NetworkScreen />;
    case "inbox":
      return <InboxScreen />;
    case "settings":
      return <SettingsScreen />;
    case "npcManagement":
      return <NPCManagementScreen />;
    case "internationalView":
      return <InternationalScreen />;
    case "discoveries":
      return <DiscoveriesScreen />;
    case "leaderboard":
      return <LeaderboardScreen />;
    case "analytics":
      return <AnalyticsScreen />;
    case "fixtureBrowser":
      return <FixtureBrowser />;
    case "youthScouting":
      return <YouthScoutingScreen />;
    case "alumniDashboard":
      return <AlumniDashboard />;
    case "finances":
      return <FinancialDashboard />;
    case "handbook":
      return <WikiScreen />;
    case "achievements":
      return <AchievementScreen />;
    case "scenarioSelect":
      return <ScenarioSelect />;
    case "hallOfFame":
      return <HallOfFameWrapper />;
    case "demoEnd":
      return <DemoEndScreen />;
    case "weekSimulation":
      return <WeekSimulationScreen />;
    case "equipment":
      return <EquipmentScreen />;
    case "agency":
      return <AgencyScreen />;
    case "training":
      return <TrainingScreen />;
    case "rivals":
      return <RivalsScreen />;
    case "reportComparison":
      return <ReportComparison />;
    case "negotiation":
      return <NegotiationScreen />;
    case "seasonAwards":
      return <SeasonAwardsScreen />;
    case "freeAgents":
      return <FreeAgentScreen />;
    case "performance":
      return <ScoutPerformanceDashboard />;
    default:
      return <MainMenu />;
  }
}

function ActiveScreen() {
  const currentScreen = useGameStore((s) => s.currentScreen);
  // Derive match weather for weather-aware ambience in useScreenMusic
  const matchWeather = useGameStore((s) => {
    if (s.currentScreen !== "match" || !s.activeMatch || !s.gameState) return undefined;
    const fixture = s.gameState.fixtures[s.activeMatch.fixtureId];
    return fixture?.weather;
  });
  useScreenMusic(currentScreen, matchWeather);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentScreen}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.15 }}
      >
        <ScreenContent currentScreen={currentScreen} />
      </motion.div>
    </AnimatePresence>
  );
}

export default function Home() {
  const initialize = useAuthStore((s) => s.initialize);
  const gameState = useGameStore((s) => s.gameState);
  const setScreen = useGameStore((s) => s.setScreen);
  const checkAndUnlock = useAchievementStore((s) => s.checkAndUnlock);
  const pendingCelebration = useGameStore((s) => s.pendingCelebration);
  const dismissCelebration = useGameStore((s) => s.dismissCelebration);
  const lastInsightResult = useGameStore((s) => s.lastInsightResult);
  const dismissInsightResult = useGameStore((s) => s.dismissInsightResult);
  const tutorialActive = useTutorialStore((s) => s.tutorialActive);
  const currentSequence = useTutorialStore((s) => s.currentSequence);
  const guidedSessionActive = useTutorialStore((s) => s.guidedSessionActive);
  const currentGuidedTask = useTutorialStore((s) => s.currentGuidedTask);
  const activeScreenGuide = useTutorialStore((s) => s.activeScreenGuide);
  const activeHint = useTutorialStore((s) => s.activeHint);

  // Feedback modal state (opened via F1 or Settings)
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  // Register the F1 → feedback handler
  const openFeedback = useCallback(() => setIsFeedbackOpen(true), []);
  useEffect(() => {
    setFeedbackOpenHandler(openFeedback);
    return () => setFeedbackOpenHandler(null);
  }, [openFeedback]);

  // ScreenErrorBoundary recovery: navigate back to dashboard
  const handleErrorRecover = useCallback(() => {
    setScreen("dashboard");
  }, [setScreen]);

  // Check for an existing Supabase session once on mount.
  // initialize() is a no-op if the auth store has not yet been wired to
  // Supabase — safe to call unconditionally.
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Register global keyboard shortcuts (Esc, 1-8, Space, ?, F1).
  // Called here — at the root — so the listener is active on every screen.
  useKeyboardNav();

  // Re-run achievement checks whenever the game state changes.
  // This catches achievements unlocked by advanceWeek(), report submission,
  // career progression, or any other game-loop mutation.
  useEffect(() => {
    if (gameState) {
      checkAndUnlock(gameState);
    }
  }, [gameState, checkAndUnlock]);

  const showMentorOverlay = Boolean(
    (tutorialActive && currentSequence) || (guidedSessionActive && currentGuidedTask),
  );
  const showScreenGuidePanel = !showMentorOverlay && activeScreenGuide != null;
  const showHintToast = !showMentorOverlay && !showScreenGuidePanel && activeHint != null;
  const showGuidedChecklist =
    guidedSessionActive && !showMentorOverlay && !showScreenGuidePanel && !showHintToast;

  return (
    <>
      {/* SettingsApplier applies CSS classes to <html> for font size,
          colorblind filters, and reduced motion. Renders no visible UI. */}
      <SettingsApplier />
      <ScreenErrorBoundary onRecover={handleErrorRecover}>
        <ActiveScreen />
      </ScreenErrorBoundary>
      {/* Tutorial surfaces follow a single priority: mentor overlay, screen guide, hint, checklist. */}
      {showMentorOverlay && <MentorOverlay />}
      {showScreenGuidePanel && <ScreenGuidePanel />}
      {showHintToast && <HintToast />}
      {showGuidedChecklist && <GuidedChecklist />}
      {/* AchievementToast is a fixed overlay; it renders null when there are
          no pending achievement notifications. */}
      <AchievementToast />
      {/* Celebration overlay — shows tier-appropriate animation on key milestones. */}
      {pendingCelebration && (
        <Celebration
          tier={pendingCelebration.tier}
          title={pendingCelebration.title}
          description={pendingCelebration.description}
          onDismiss={dismissCelebration}
        />
      )}
      {/* Insight payoff overlay — shows result after using an Insight action. */}
      {lastInsightResult && (
        <InsightPayoff
          result={lastInsightResult}
          actionName={lastInsightResult.actionId?.replace(/([A-Z])/g, " $1").trim() ?? "Insight"}
          onDismiss={dismissInsightResult}
        />
      )}
      {/* Scenario outcome overlay — shows victory/failure modal at end of scenario. */}
      <ScenarioOutcomeOverlay />
      {/* Feedback modal — opened via F1 shortcut or Settings screen */}
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />
    </>
  );
}
