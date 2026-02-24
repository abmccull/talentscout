"use client";

import { useState } from "react";
import { useGameStore, type GameScreen } from "@/stores/gameStore";
import { useAudio } from "@/lib/audio/useAudio";
import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
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
  GraduationCap,
  Wallet,
  Book,
  Medal,
  Wrench,
  Building2,
  X,
  BookOpen,
  Swords,
} from "lucide-react";

// ─── Sectioned Navigation ────────────────────────────────────────────────────

interface NavSection {
  label: string | null; // null = no header (utility section)
  items: { screen: GameScreen; label: string; icon: React.ElementType }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Scouting",
    items: [
      { screen: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { screen: "calendar", label: "Calendar", icon: Calendar },
      { screen: "fixtureBrowser", label: "Fixtures", icon: CalendarDays },
      { screen: "playerDatabase", label: "Players", icon: Users },
      { screen: "reportHistory", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Career",
    items: [
      { screen: "career", label: "My Scout", icon: Briefcase },
      { screen: "equipment", label: "Equipment", icon: Wrench },
      { screen: "training", label: "Training", icon: BookOpen },
      { screen: "finances", label: "Finances", icon: Wallet },
      { screen: "agency", label: "Agency", icon: Building2 },
    ],
  },
  {
    label: "World",
    items: [
      { screen: "youthScouting", label: "Youth Hub", icon: GraduationCap },
      { screen: "discoveries", label: "Discoveries", icon: Trophy },
      { screen: "network", label: "Scout Network", icon: Network },
      { screen: "rivals", label: "Rivals", icon: Swords },
      { screen: "npcManagement", label: "Scouts", icon: UserCheck },
      { screen: "internationalView", label: "International", icon: Globe },
      { screen: "alumniDashboard", label: "Alumni", icon: Award },
      { screen: "analytics", label: "Analytics", icon: BarChart3 },
      { screen: "leaderboard", label: "Leaderboard", icon: Award },
    ],
  },
  {
    label: null,
    items: [
      { screen: "inbox", label: "Inbox", icon: Mail },
      { screen: "achievements", label: "Achievements", icon: Medal },
      { screen: "handbook", label: "Handbook", icon: Book },
      { screen: "settings", label: "Settings", icon: Settings },
    ],
  },
];

// Screens that are always visible regardless of tier or week
const ALWAYS_VISIBLE = new Set<GameScreen>([
  "dashboard",
  "calendar",
  "playerDatabase",
  "fixtureBrowser",
  "finances",
  "achievements",
  "handbook",
  "settings",
]);

const SEEN_NAV_KEY = "talentscout_seen_nav";

function loadSeenNav(): Set<GameScreen> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SEEN_NAV_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as GameScreen[]);
  } catch {
    return new Set();
  }
}

function saveSeenNav(seen: Set<GameScreen>): void {
  try {
    localStorage.setItem(SEEN_NAV_KEY, JSON.stringify([...seen]));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

/** Returns true if the nav item should be shown given current game state. */
function getNavVisibility(
  screen: GameScreen,
  tier: number,
  effectiveWeek: number,
  countryCount: number,
  careerPath: string,
  specialization: string,
): boolean {
  if (ALWAYS_VISIBLE.has(screen)) return true;

  switch (screen) {
    // Always visible (reports encourage early writing)
    case "reportHistory":
      return effectiveWeek >= 3;

    // Week 3+ items
    case "career":
    case "equipment":
    case "training":
    case "inbox":
      return effectiveWeek >= 3;

    // Agency: independent path + tier 3+
    case "agency":
      return careerPath === "independent" && tier >= 3;

    // Tier 2+ items
    case "network":
    case "rivals":
      return tier >= 2;

    // Leaderboard always visible
    case "leaderboard":
      return true;

    // Youth Hub: always visible for youth scouts, tier 3+ for others
    case "youthScouting":
      return specialization === "youth" || tier >= 3;

    // Tier 3+ items
    case "discoveries":
    case "analytics":
    case "alumniDashboard":
      return tier >= 3;

    // Tier 4+ item
    case "npcManagement":
      return tier >= 4;

    // Country-gated item
    case "internationalView":
      return countryCount > 1;

    default:
      return true;
  }
}

export function GameLayout({ children }: { children: React.ReactNode }) {
  const { currentScreen, setScreen, gameState } = useGameStore();
  const autosaveError = useGameStore((s) => s.autosaveError);
  const { playSFX } = useAudio();

  // All hooks must be called before any early return
  const [seenNav, setSeenNav] = useState<Set<GameScreen>>(() => loadSeenNav());

  if (!gameState) return null;

  const unreadCount = gameState.inbox.filter((m) => !m.read).length;
  const unreviewedNpcReportCount = Object.values(gameState.npcReports).filter(
    (r) => !r.reviewed,
  ).length;

  const tier = gameState.scout.careerTier;
  const countryCount = gameState.countries.length;
  const careerPath = gameState.scout.careerPath ?? "club";
  const specialization = gameState.scout.primarySpecialization ?? "";
  // effectiveWeek accumulates across seasons so week-gated items stay visible
  // after season 1 ends (season 2+ means week >= 53, unlocking everything)
  const effectiveWeek =
    (gameState.currentSeason - 1) * 52 + gameState.currentWeek;

  // Build visible sections — only include sections that have at least one visible item
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    visibleItems: section.items.filter(({ screen }) =>
      getNavVisibility(screen, tier, effectiveWeek, countryCount, careerPath, specialization),
    ),
  })).filter((section) => section.visibleItems.length > 0);

  function handleNavClick(screen: GameScreen): void {
    if (screen !== currentScreen) playSFX("click");
    if (!seenNav.has(screen)) {
      const next = new Set(seenNav);
      next.add(screen);
      setSeenNav(next);
      saveSeenNav(next);
    }
    setScreen(screen);
  }

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

        <nav className="flex-1 overflow-y-auto p-2" data-tutorial-id="sidebar-nav">
          {visibleSections.map((section) => (
            <div key={section.label ?? "util"}>
              {section.label && (
                <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  {section.label}
                </p>
              )}
              {!section.label && visibleSections.length > 1 && (
                <div className="mx-3 my-2 border-t border-zinc-800" />
              )}
              {section.visibleItems.map(({ screen, label, icon: Icon }) => {
                const isNew = !seenNav.has(screen);
                return (
                  <button
                    key={screen}
                    data-tutorial-id={`nav-${screen}`}
                    onClick={() => handleNavClick(screen)}
                    className={`mb-0.5 flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                      currentScreen === screen
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "text-zinc-400 hover:bg-[var(--secondary)] hover:text-white"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="flex-1 text-left">{label}</span>
                    {isNew && (
                      <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                        New
                      </span>
                    )}
                    {screen === "inbox" && !isNew && unreadCount > 0 && (
                      <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
                        {unreadCount}
                      </span>
                    )}
                    {screen === "npcManagement" && !isNew && unreviewedNpcReportCount > 0 && (
                      <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
                        {unreviewedNpcReportCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
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
      <main className="flex-1 overflow-auto">
        {autosaveError !== null && (
          <div
            role="alert"
            aria-live="polite"
            className="flex items-center justify-between gap-3 bg-red-900/90 px-4 py-2.5 text-sm text-white"
          >
            <span>
              <span className="font-semibold">Autosave failed:</span> {autosaveError}
            </span>
            <button
              onClick={() => useGameStore.setState({ autosaveError: null })}
              aria-label="Dismiss autosave error"
              className="shrink-0 rounded p-0.5 text-red-200 transition hover:bg-red-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
