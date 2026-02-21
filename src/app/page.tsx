"use client";

import { useGameStore } from "@/stores/gameStore";
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

export default function Home() {
  const currentScreen = useGameStore((s) => s.currentScreen);

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
    default:
      return <MainMenu />;
  }
}
