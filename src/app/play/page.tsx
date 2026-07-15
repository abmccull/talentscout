"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useShallow } from "zustand/react/shallow";
import { useGameStore, type GameScreen } from "@/stores/gameStore";
import { resolveGameScreenForBuild } from "@/stores/gameScreenScope";
import { SettingsApplier } from "@/components/game/SettingsApplier";
import { useKeyboardNav, setFeedbackOpenHandler } from "@/lib/useKeyboardNav";
import { ScreenErrorBoundary } from "@/components/game/ScreenErrorBoundary";
import { warmWeeklySimulationWorker } from "@/lib/weeklySimulationWorkerClient";

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

function DialogLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 text-sm text-zinc-200 backdrop-blur-sm"
    >
      Loading dialog&hellip;
    </div>
  );
}

// Keep the route shell small. The immediately requested menu is its own chunk,
// followed by career creation and the primary dashboard only when selected.
const MainMenu = dynamic(
  () => import("@/components/game/MainMenu").then((module) => module.MainMenu),
  { ssr: false, loading: GameScreenLoading },
);
const NewGameScreen = dynamic(
  () => import("@/components/game/NewGameScreen").then((module) => module.NewGameScreen),
  { ssr: false, loading: GameScreenLoading },
);
const Dashboard = dynamic(
  () => import("@/components/game/Dashboard").then((module) => module.Dashboard),
  { ssr: false, loading: GameScreenLoading },
);

// Optional UI runtimes are isolated from both the menu and workspace chunks.
const AchievementRuntime = dynamic(
  () => import("@/components/game/AchievementRuntime").then((module) => module.AchievementRuntime),
  { ssr: false },
);
const TutorialRuntime = dynamic(
  () => import("@/components/game/tutorial/TutorialRuntime").then((module) => module.TutorialRuntime),
  { ssr: false },
);
const AuthRuntime = dynamic(
  () => import("@/components/game/AuthRuntime").then((module) => module.AuthRuntime),
  { ssr: false },
);
const ScreenMusicRuntime = dynamic(
  () => import("@/components/game/ScreenMusicRuntime").then((module) => module.ScreenMusicRuntime),
  { ssr: false },
);
const Celebration = dynamic(
  () => import("@/components/game/effects/Celebration").then((module) => module.Celebration),
  { ssr: false, loading: DialogLoading },
);
const InsightPayoff = dynamic(
  () => import("@/components/game/InsightPayoff").then((module) => module.InsightPayoff),
  { ssr: false, loading: DialogLoading },
);
const ScenarioOutcomeOverlay = dynamic(
  () => import("@/components/game/ScenarioOutcomeOverlay").then((module) => module.ScenarioOutcomeOverlay),
  { ssr: false, loading: DialogLoading },
);
const FeedbackModal = dynamic(
  () => import("@/components/game/FeedbackModal").then((module) => module.FeedbackModal),
  { ssr: false, loading: DialogLoading },
);

// Full-release and later-career screens stay available, but no longer inflate
// the Youth Early Access launch bundle before a player actually opens them.
const CalendarScreen = dynamic(
  () => import("@/components/game/CalendarScreen").then((module) => module.CalendarScreen),
  { ssr: false, loading: GameScreenLoading },
);
const ObservationScreen = dynamic(
  () => import("@/components/game/ObservationScreen").then((module) => module.ObservationScreen),
  { ssr: false, loading: GameScreenLoading },
);
const OpeningDiscoveryScreen = dynamic(
  () => import("@/components/game/OpeningDiscoveryScreen").then((module) => module.OpeningDiscoveryScreen),
  { ssr: false, loading: GameScreenLoading },
);
const PlayerProfile = dynamic(
  () => import("@/components/game/PlayerProfile").then((module) => module.PlayerProfile),
  { ssr: false, loading: GameScreenLoading },
);
const ReportWriter = dynamic(
  () => import("@/components/game/ReportWriter").then((module) => module.ReportWriter),
  { ssr: false, loading: GameScreenLoading },
);
const ReportHistory = dynamic(
  () => import("@/components/game/ReportHistory").then((module) => module.ReportHistory),
  { ssr: false, loading: GameScreenLoading },
);
const CareerScreen = dynamic(
  () => import("@/components/game/CareerScreen").then((module) => module.CareerScreen),
  { ssr: false, loading: GameScreenLoading },
);
const InboxScreen = dynamic(
  () => import("@/components/game/InboxScreen").then((module) => module.InboxScreen),
  { ssr: false, loading: GameScreenLoading },
);
const SettingsScreen = dynamic(
  () => import("@/components/game/SettingsScreen").then((module) => module.SettingsScreen),
  { ssr: false, loading: GameScreenLoading },
);
const InternationalScreen = dynamic(
  () => import("@/components/game/InternationalScreen").then((module) => module.InternationalScreen),
  { ssr: false, loading: GameScreenLoading },
);
const YouthScoutingScreen = dynamic(
  () => import("@/components/game/YouthScoutingScreen").then((module) => module.YouthScoutingScreen),
  { ssr: false, loading: GameScreenLoading },
);
const WikiScreen = dynamic(
  () => import("@/components/game/wiki/WikiScreen").then((module) => module.WikiScreen),
  { ssr: false, loading: GameScreenLoading },
);
const FutureRoadmapScreen = dynamic(
  () => import("@/components/game/FutureRoadmapScreen").then((module) => module.FutureRoadmapScreen),
  { ssr: false, loading: GameScreenLoading },
);
const WeekSimulationScreen = dynamic(
  () => import("@/components/game/WeekSimulationScreen").then((module) => module.WeekSimulationScreen),
  { ssr: false, loading: GameScreenLoading },
);
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

function ScreenContent({ currentScreen }: { currentScreen: GameScreen }) {
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
    case "openingDiscovery":
      return <OpeningDiscoveryScreen />;
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
    case "futureRoadmap":
      return <FutureRoadmapScreen />;
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
  const { currentScreen, hasActiveCareer, setScreen } = useGameStore(useShallow((state) => ({
    currentScreen: state.currentScreen,
    hasActiveCareer: state.gameState !== null,
    setScreen: state.setScreen,
  })));
  const resolvedScreen = resolveGameScreenForBuild(currentScreen, hasActiveCareer);

  useEffect(() => {
    if (resolvedScreen !== currentScreen) {
      setScreen(resolvedScreen);
    }
  }, [currentScreen, resolvedScreen, setScreen]);

  return (
    <div
      key={resolvedScreen}
      data-game-screen={resolvedScreen}
      className="game-screen-enter"
    >
      <ScreenContent currentScreen={resolvedScreen} />
    </div>
  );
}

export default function Home() {
  const activeCareerId = useGameStore((s) => s.gameState?.scout.id);
  const setScreen = useGameStore((s) => s.setScreen);
  const pendingCelebration = useGameStore((s) => s.pendingCelebration);
  const hasWeekSummary = useGameStore((s) => s.lastWeekSummary !== null);
  const dismissCelebration = useGameStore((s) => s.dismissCelebration);
  const lastInsightResult = useGameStore((s) => s.lastInsightResult);
  const dismissInsightResult = useGameStore((s) => s.dismissInsightResult);
  const hasScenarioOutcome = useGameStore(
    (s) => s.scenarioOutcome !== null && s.scenarioOutcomeScenarioId !== null,
  );

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

  // Warm the six permanent Youth Scout workspaces once a career is active.
  // These are primary navigation, not speculative features: fetching their
  // small split chunks while the player reads the Desk prevents first-visit
  // stalls without inflating /play startup.
  useEffect(() => {
    if (!activeCareerId || typeof window === "undefined") return;
    warmWeeklySimulationWorker();
    const prefetch = () => {
      void Promise.all([
        import("@/components/game/CalendarScreen"),
        import("@/components/game/YouthScoutingScreen"),
        import("@/components/game/ReportHistory"),
        import("@/components/game/InternationalScreen"),
        import("@/components/game/CareerScreen"),
      ]);
    };
    const timeoutId = window.setTimeout(prefetch, 500);
    return () => window.clearTimeout(timeoutId);
  }, [activeCareerId]);

  // Register global keyboard shortcuts (Esc, 1-8, Space, ?, F1).
  // Called here — at the root — so the listener is active on every screen.
  useKeyboardNav();

  return (
    <>
      {/* Auth is optional gameplay infrastructure. Initialize it after the
          route shell so Supabase does not block the first workspace render. */}
      <AuthRuntime />
      <ScreenMusicRuntime />
      {/* SettingsApplier applies CSS classes to <html> for font size,
          colorblind filters, and reduced motion. Renders no visible UI. */}
      <SettingsApplier />
      <ScreenErrorBoundary onRecover={handleErrorRecover}>
        <ActiveScreen />
      </ScreenErrorBoundary>
      {/* Career-only runtimes keep tutorial and achievement state out of the
          launch path while retaining their existing priority and evaluation. */}
      {activeCareerId && (
        <>
          <TutorialRuntime />
          <AchievementRuntime />
        </>
      )}
      {/* Celebration overlay — shows tier-appropriate animation on key milestones. */}
      {/* A completed week and its milestone are one sequence, not two stacked
          modal layers. Keep the celebration queued until the player closes the
          week summary so a late-loaded celebration cannot intercept that
          summary's controls or expose two aria-modal dialogs at once. */}
      {pendingCelebration && !hasWeekSummary && (
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
      {/* Load the scenario overlay only after an outcome has been latched. */}
      {activeCareerId && hasScenarioOutcome && <ScenarioOutcomeOverlay />}
      {/* Feedback modal — opened via F1 shortcut or Settings screen */}
      {isFeedbackOpen && (
        <FeedbackModal
          isOpen
          onClose={() => setIsFeedbackOpen(false)}
        />
      )}
    </>
  );
}
