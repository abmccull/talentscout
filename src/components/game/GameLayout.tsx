"use client";

import { useGameStore, type GameScreen } from "@/stores/gameStore";
import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  Briefcase,
  Network,
  Mail,
  Settings,
  ChevronRight,
  UserCheck,
  Globe,
  Trophy,
  Award,
  BarChart3,
} from "lucide-react";

const NAV_ITEMS: { screen: GameScreen; label: string; icon: React.ElementType }[] = [
  { screen: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { screen: "calendar", label: "Calendar", icon: Calendar },
  { screen: "playerDatabase", label: "Players", icon: Users },
  { screen: "reportHistory", label: "Reports", icon: FileText },
  { screen: "career", label: "Career", icon: Briefcase },
  { screen: "network", label: "Network", icon: Network },
  { screen: "inbox", label: "Inbox", icon: Mail },
  { screen: "npcManagement", label: "Scouts", icon: UserCheck },
  { screen: "internationalView", label: "International", icon: Globe },
  { screen: "discoveries", label: "Discoveries", icon: Trophy },
  { screen: "leaderboard", label: "Leaderboard", icon: Award },
  { screen: "analytics", label: "Analytics", icon: BarChart3 },
  { screen: "settings", label: "Settings", icon: Settings },
];

export function GameLayout({ children }: { children: React.ReactNode }) {
  const { currentScreen, setScreen, gameState } = useGameStore();

  if (!gameState) return null;

  const unreadCount = gameState.inbox.filter((m) => !m.read).length;
  const unreviewedNpcReportCount = Object.values(gameState.npcReports).filter(
    (r) => !r.reviewed,
  ).length;

  const visibleNavItems = NAV_ITEMS.filter(({ screen }) => {
    if (screen === "npcManagement") return gameState.scout.careerTier >= 4;
    if (screen === "internationalView") return gameState.countries.length > 1;
    return true;
  });

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-[var(--border)] bg-[#0c0c0c]">
        <div className="border-b border-[var(--border)] p-4">
          <h1 className="text-lg font-bold">
            Talent<span className="text-emerald-500">Scout</span>
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Week {gameState.currentWeek} — Season {gameState.currentSeason}
          </p>
        </div>

        <nav className="flex-1 p-2">
          {visibleNavItems.map(({ screen, label, icon: Icon }) => (
            <button
              key={screen}
              onClick={() => setScreen(screen)}
              className={`mb-0.5 flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                currentScreen === screen
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "text-zinc-400 hover:bg-[var(--secondary)] hover:text-white"
              }`}
            >
              <Icon size={16} />
              <span className="flex-1 text-left">{label}</span>
              {screen === "inbox" && unreadCount > 0 && (
                <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
                  {unreadCount}
                </span>
              )}
              {screen === "npcManagement" && unreviewedNpcReportCount > 0 && (
                <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
                  {unreviewedNpcReportCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Scout Info */}
        <div className="border-t border-[var(--border)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-zinc-500">Scout</span>
            <button
              onClick={() => setScreen("career")}
              className="cursor-pointer text-xs text-zinc-500 hover:text-emerald-400 transition"
            >
              <ChevronRight size={12} />
            </button>
          </div>
          <p className="text-sm font-medium">
            {gameState.scout.firstName} {gameState.scout.lastName}
          </p>
          <p className="text-xs text-zinc-500 capitalize">
            {gameState.scout.primarySpecialization} Scout — Tier {gameState.scout.careerTier}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Reputation</span>
            <span className="text-emerald-400">{Math.round(gameState.scout.reputation)}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${gameState.scout.reputation}%` }}
            />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
