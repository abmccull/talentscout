"use client";

import { useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useAuthStore } from "@/stores/authStore";
import { MainMenu } from "@/components/game/MainMenu";
import { NewGameScreen } from "@/components/game/NewGameScreen";
import { Dashboard } from "@/components/game/Dashboard";
import { CalendarScreen } from "@/components/game/CalendarScreen";
import { MatchScreen } from "@/components/game/MatchScreen";
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

export default function Home() {
  const currentScreen = useGameStore((s) => s.currentScreen);
  const initialize = useAuthStore((s) => s.initialize);

  // Check for an existing Supabase session once on mount.
  // initialize() is a no-op if the auth store has not yet been wired to
  // Supabase — safe to call unconditionally.
  useEffect(() => {
    initialize();
  }, [initialize]);

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
    default:
      return <MainMenu />;
  }
}
