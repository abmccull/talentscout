"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/stores/gameStore";
import { useAuthStore } from "@/stores/authStore";
import { MainMenu } from "@/components/game/MainMenu";
import { NewGameScreen } from "@/components/game/NewGameScreen";
import { Dashboard } from "@/components/game/Dashboard";
import { CalendarScreen } from "@/components/game/CalendarScreen";
import { MatchScreen } from "@/components/game/MatchScreen";
import { ObservationScreen } from "@/components/game/ObservationScreen";
import { PlayerProfile } from "@/components/game/PlayerProfile";
import { PlayerDatabase } from "@/components/game/PlayerDatabase";
import { ReportWriter } from "@/components/game/ReportWriter";
import { ReportHistory } from "@/components/game/ReportHistory";
import { CareerScreen } from "@/components/game/CareerScreen";
import { NetworkScreen } from "@/components/game/NetworkScreen";
import { InboxScreen } from "@/components/game/InboxScreen";
import { SettingsScreen } from "@/components/game/SettingsScreen";
import { NPCManagementScreen } from "@/components/game/NPCManagementScreen";
import { InternationalScreen } from "@/components/game/InternationalScreen";
import { DiscoveriesScreen } from "@/components/game/DiscoveriesScreen";
import { LeaderboardScreen } from "@/components/game/LeaderboardScreen";
import { AnalyticsScreen } from "@/components/game/AnalyticsScreen";
import { MatchSummaryScreen } from "@/components/game/MatchSummaryScreen";
import { FixtureBrowser } from "@/components/game/FixtureBrowser";
import { YouthScoutingScreen } from "@/components/game/YouthScoutingScreen";
import { AlumniDashboard } from "@/components/game/AlumniDashboard";
import { FinancialDashboard } from "@/components/game/FinancialDashboard";
import { HandbookScreen } from "@/components/game/HandbookScreen";
import { AchievementScreen } from "@/components/game/AchievementScreen";
import { ScenarioSelect } from "@/components/game/ScenarioSelect";
import { HallOfFame } from "@/components/game/HallOfFame";
import { DemoEndScreen } from "@/components/game/DemoEndScreen";
import { WeekSimulationScreen } from "@/components/game/WeekSimulationScreen";
import { EquipmentScreen } from "@/components/game/EquipmentScreen";
import { AgencyScreen } from "@/components/game/AgencyScreen";
import { TrainingScreen } from "@/components/game/TrainingScreen";
import { RivalsScreen } from "@/components/game/RivalsScreen";
import { ReportComparison } from "@/components/game/ReportComparison";
import { NegotiationScreen } from "@/components/game/NegotiationScreen";
import { FreeAgentScreen } from "@/components/game/FreeAgentScreen";
import { SeasonAwardsScreen } from "@/components/game/SeasonAwardsScreen";
import { ScoutPerformanceDashboard } from "@/components/game/ScoutPerformanceDashboard";
import { AchievementToast } from "@/components/game/AchievementToast";
import { TutorialOverlay } from "@/components/game/tutorial/TutorialOverlay";
import { SettingsApplier } from "@/components/game/SettingsApplier";
import { Celebration } from "@/components/game/effects/Celebration";
import { ScenarioOutcomeOverlay } from "@/components/game/ScenarioOutcomeOverlay";
import { useAchievementStore } from "@/stores/achievementStore";
import { useScreenMusic } from "@/lib/audio/useScreenMusic";
import { useKeyboardNav } from "@/lib/useKeyboardNav";

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
      return <HandbookScreen />;
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
  const checkAndUnlock = useAchievementStore((s) => s.checkAndUnlock);
  const pendingCelebration = useGameStore((s) => s.pendingCelebration);
  const dismissCelebration = useGameStore((s) => s.dismissCelebration);

  // Check for an existing Supabase session once on mount.
  // initialize() is a no-op if the auth store has not yet been wired to
  // Supabase — safe to call unconditionally.
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Register global keyboard shortcuts (Esc, 1-8, Space, ?).
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

  return (
    <>
      {/* SettingsApplier applies CSS classes to <html> for font size,
          colorblind filters, and reduced motion. Renders no visible UI. */}
      <SettingsApplier />
      <ActiveScreen />
      {/* TutorialOverlay is a fixed overlay; it renders null when no tutorial
          is active, so it is safe to include unconditionally on every screen. */}
      <TutorialOverlay />
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
      {/* Scenario outcome overlay — shows victory/failure modal at end of scenario. */}
      <ScenarioOutcomeOverlay />
    </>
  );
}
