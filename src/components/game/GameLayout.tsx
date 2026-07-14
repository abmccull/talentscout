"use client";

import { useState, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore, type GameScreen } from "@/stores/gameStore";
import { useTutorialStore, type TutorialSequenceId } from "@/stores/tutorialStore";
import { ScreenHelpButton } from "@/components/game/tutorial/ScreenHelpButton";
import { ScoutAvatar } from "@/components/game/ScoutAvatar";
import { useAudio } from "@/lib/audio/useAudio";
import { IS_YOUTH_EARLY_ACCESS } from "@/lib/demo";
import { getCareerElapsedWeeks } from "@/engine/core/gameDate";
import { selectLatestReportsByCase } from "@/engine/reports/reportAccountability";
import {
  getYouthEarlyAccessNavigationEntries,
  getYouthEarlyAccessWorkspaceParent,
} from "@/stores/gameScreenScope";
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
  Lock,
  Activity,
  Menu,
  Bell,
  Map,
} from "lucide-react";

// ─── Sectioned Navigation ────────────────────────────────────────────────────

interface NavSection {
  label: string | null; // null = no header (utility section)
  items: { screen: GameScreen; label: string; icon: React.ElementType }[];
}

const YOUTH_NAV_ICONS: Partial<Record<GameScreen, React.ElementType>> = {
  dashboard: LayoutDashboard,
  calendar: Calendar,
  youthScouting: GraduationCap,
  reportHistory: FileText,
  internationalView: Globe,
  career: Briefcase,
  handbook: Book,
  futureRoadmap: Map,
  settings: Settings,
};

function getYouthNavItems(
  group: "workspace" | "support",
): NavSection["items"] {
  return getYouthEarlyAccessNavigationEntries(group).map((entry) => ({
    ...entry,
    icon: YOUTH_NAV_ICONS[entry.screen] ?? LayoutDashboard,
  }));
}

const YOUTH_WORKSPACE_ITEMS = getYouthNavItems("workspace");
const YOUTH_SUPPORT_ITEMS = getYouthNavItems("support");

function getNavSections(specialization: string, youthEarlyAccess: boolean): NavSection[] {
  if (youthEarlyAccess) {
    return [
      { label: "Scout workspace", items: YOUTH_WORKSPACE_ITEMS },
      { label: "Support", items: YOUTH_SUPPORT_ITEMS },
    ];
  }

  const isYouth = specialization === "youth";
  return [
    {
      label: "Scouting",
      items: [
        { screen: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { screen: "calendar", label: "Calendar", icon: Calendar },
        ...(isYouth
          ? [{ screen: "youthScouting" as GameScreen, label: "Youth Hub", icon: GraduationCap }]
          : [{ screen: "playerDatabase" as GameScreen, label: "Players", icon: Users }]),
        { screen: "fixtureBrowser", label: "Fixtures", icon: CalendarDays },
        { screen: "reportHistory", label: "Reports", icon: FileText },
      ],
    },
    {
      label: "Career",
      items: [
        { screen: "career", label: "My Scout", icon: Briefcase },
        { screen: "performance", label: "Performance", icon: Activity },
        { screen: "equipment", label: "Equipment", icon: Wrench },
        { screen: "training", label: "Training", icon: BookOpen },
        { screen: "finances", label: "Finances", icon: Wallet },
        { screen: "agency", label: "Agency", icon: Building2 },
      ],
    },
    {
      label: "World",
      items: [
        ...(isYouth
          ? [{ screen: "playerDatabase" as GameScreen, label: "Players", icon: Users }]
          : [{ screen: "youthScouting" as GameScreen, label: "Youth Hub", icon: GraduationCap }]),
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
        { screen: "futureRoadmap", label: "Roadmap", icon: Map },
        { screen: "settings", label: "Settings", icon: Settings },
      ],
    },
  ];
}

// Screens that are always visible regardless of tier or week
const ALWAYS_VISIBLE = new Set<GameScreen>([
  "dashboard",
  "calendar",
  "playerDatabase",
  "achievements",
  "handbook",
  "futureRoadmap",
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

/** Extra game state needed for refined progressive disclosure gating. */
interface NavGateContext {
  tier: number;
  effectiveWeek: number;
  currentSeason: number;
  countryCount: number;
  careerPath: string;
  specialization: string;
  observationCount: number;
  reportCount: number;
  hasScheduledActivity: boolean;
  hasAttendedMatch: boolean;
}

/** Returns true if the nav item should be shown given current game state. */
function getNavVisibility(
  screen: GameScreen,
  ctx: NavGateContext,
): boolean {
  if (ALWAYS_VISIBLE.has(screen)) return true;

  const { tier, effectiveWeek, currentSeason, countryCount, specialization, observationCount, reportCount, hasScheduledActivity, hasAttendedMatch } = ctx;

  switch (screen) {
    // Inbox: always visible (essential for directives)
    case "inbox":
      return true;

    // Match and Report Writer unlock after first scheduled activity
    case "fixtureBrowser":
      return hasAttendedMatch || effectiveWeek >= 2;

    // Report History: after first report or week 3+
    case "reportHistory":
      return reportCount > 0 || effectiveWeek >= 3;

    // Career, Performance: after week 2
    case "career":
    case "performance":
      return effectiveWeek >= 2;

    // Equipment, Training: Tier 2+ (rep 25)
    case "equipment":
    case "training":
      return tier >= 2 || effectiveWeek >= 6;

    // Finances: after week 3
    case "finances":
      // Override ALWAYS_VISIBLE — finances is in that set but we want progressive
      return effectiveWeek >= 3;

    // International: Tier 2+ or multiple countries
    case "internationalView":
      return tier >= 2 || countryCount > 1;

    // Network, Rivals: Tier 2+
    case "network":
      return tier >= 2 || effectiveWeek >= 4;
    case "rivals":
      return tier >= 2;

    // Youth Hub: always for youth scouts, tier 3+ otherwise
    case "youthScouting":
      return specialization === "youth" || tier >= 3;

    // Discoveries, Analytics, Alumni: Tier 3+
    case "discoveries":
    case "analytics":
    case "alumniDashboard":
      return tier >= 3;

    // Agency: Tier 3+
    case "agency":
      return tier >= 3 || effectiveWeek >= 12;

    // NPC Management: Tier 4+
    case "npcManagement":
      return tier >= 4;

    // Leaderboard: after the first completed season, regardless of calendar length.
    case "leaderboard":
      return currentSeason > 1;

    default:
      return true;
  }
}

function getNavLockState(
  _screen: GameScreen,
  _tier: number,
  _careerPath: string,
): "unlocked" | "preview" | "locked" | null {
  // Agency is now always unlocked (gating is internal via tabs)
  return null;
}

export function GameLayout({ children }: { children: React.ReactNode }) {
  const {
    currentScreen,
    setScreen,
    autosaveError,
    hasGame,
    currentWeek,
    currentSeason,
    unreadCount,
    unreviewedNpcReportCount,
    tier,
    countryCount,
    careerPath,
    specialization,
    effectiveWeek,
    observationCount,
    reportCount,
    hasScheduledActivity,
    hasAttendedMatch,
    scoutAvatarId,
    scoutFirstName,
    scoutLastName,
    scoutReputation,
  } = useGameStore(useShallow((state) => {
    const gameState = state.gameState;
    return {
      currentScreen: state.currentScreen,
      setScreen: state.setScreen,
      autosaveError: state.autosaveError,
      hasGame: gameState !== null,
      currentWeek: gameState?.currentWeek ?? 0,
      currentSeason: gameState?.currentSeason ?? 0,
      unreadCount: gameState?.inbox.filter((message) => !message.read).length ?? 0,
      unreviewedNpcReportCount: gameState
        ? Object.values(gameState.npcReports).filter((report) => !report.reviewed).length
        : 0,
      tier: gameState?.scout.careerTier ?? 1,
      countryCount: gameState?.countries.length ?? 0,
      careerPath: gameState?.scout.careerPath ?? "club",
      specialization: gameState?.scout.primarySpecialization ?? "",
      effectiveWeek: gameState
        ? getCareerElapsedWeeks(gameState.fixtures, {
            season: gameState.currentSeason,
            week: gameState.currentWeek,
          })
        : 0,
      observationCount: gameState ? Object.keys(gameState.observations ?? {}).length : 0,
      reportCount: gameState
        ? selectLatestReportsByCase(Object.values(gameState.reports ?? {})).length
        : 0,
      hasScheduledActivity:
        gameState?.schedule?.activities?.some((activity) => activity != null) ?? false,
      hasAttendedMatch: (gameState?.playedFixtures?.length ?? 0) > 0,
      scoutAvatarId: gameState?.scout.avatarId ?? 1,
      scoutFirstName: gameState?.scout.firstName ?? "",
      scoutLastName: gameState?.scout.lastName ?? "",
      scoutReputation: gameState?.scout.reputation ?? 0,
    };
  }));
  const { playSFX } = useAudio();

  // All hooks must be called before any early return
  const [seenNav, setSeenNav] = useState<Set<GameScreen>>(() => loadSeenNav());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const previousScreenRef = useRef<GameScreen | null>(null);

  // Close sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Prevent body scroll when sidebar overlay is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    main.scrollTo({ top: 0, left: 0 });
    if (previousScreenRef.current !== null && previousScreenRef.current !== currentScreen) {
      main.focus({ preventScroll: true });
    }

    previousScreenRef.current = currentScreen;
  }, [currentScreen]);

  if (!hasGame) return null;

  const navCtx: NavGateContext = {
    tier,
    effectiveWeek,
    currentSeason,
    countryCount,
    careerPath,
    specialization,
    observationCount,
    reportCount,
    hasScheduledActivity,
    hasAttendedMatch,
  };
  const useYouthEarlyAccessNav =
    IS_YOUTH_EARLY_ACCESS && specialization === "youth";

  const isNavScreenVisible = (screen: GameScreen): boolean => {
    if (useYouthEarlyAccessNav) {
      return YOUTH_WORKSPACE_ITEMS.some((item) => item.screen === screen)
        || YOUTH_SUPPORT_ITEMS.some((item) => item.screen === screen);
    }
    return getNavVisibility(screen, navCtx);
  };

  // Build visible sections — only include sections that have at least one visible item
  const navSections = getNavSections(specialization, useYouthEarlyAccessNav);
  const visibleSections = navSections.map((section) => ({
    ...section,
    visibleItems: section.items.filter(({ screen }) =>
      isNavScreenVisible(screen),
    ),
  })).filter((section) => section.visibleItems.length > 0);
  const showCareerShortcut = isNavScreenVisible("career");
  const activeNavScreen = useYouthEarlyAccessNav
    ? getYouthEarlyAccessWorkspaceParent(currentScreen)
    : currentScreen;
  const activeWorkspaceLabel = useYouthEarlyAccessNav
    ? [
        ...YOUTH_WORKSPACE_ITEMS,
        ...YOUTH_SUPPORT_ITEMS,
        { screen: "inbox" as GameScreen, label: "Inbox", icon: Mail },
      ].find((item) => item.screen === activeNavScreen)?.label ?? "TalentScout"
    : "TalentScout";

  function handleNavClick(screen: GameScreen): void {
    if (screen !== currentScreen) playSFX("click");
    const isFirstVisit = !seenNav.has(screen);
    if (isFirstVisit) {
      const next = new Set(seenNav);
      next.add(screen);
      setSeenNav(next);
      saveSeenNav(next);
    }
    setScreen(screen);
    setSidebarOpen(false);

    // Auto-open screen guide on first click of a newly-visible nav item.
    if (isFirstVisit) {
      setTimeout(() => {
        useTutorialStore.getState().recordScreenVisit(screen);
      }, 300);

      // Contextual mini-tutorials for specific screens on first visit.
      const contextualTriggers: Partial<Record<GameScreen, TutorialSequenceId>> = {
        equipment: "contextual:equipment",
        npcManagement: "contextual:npcManagement",
        freeAgents: "contextual:freeAgent",
        network: "contextual:network",
        rivals: "contextual:rival",
      };
      const seqId = contextualTriggers[screen];
      if (seqId) {
        setTimeout(() => {
          useTutorialStore.getState().startSequence(seqId);
        }, 800);
      }
    }
  }

  return (
    <div className="flex min-h-screen bg-[#090b0e]">
      <a
        href="#game-main"
        className="fixed left-3 top-3 z-[70] -translate-y-20 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition focus:translate-y-0"
      >
        Skip to game content
      </a>

      <header className="fixed inset-x-0 top-0 z-30 grid h-14 grid-cols-[5.5rem_minmax(0,1fr)_5.5rem] items-center border-b border-white/10 bg-[#0b0e12]/95 px-2 backdrop-blur md:hidden">
        <div className="flex items-center">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            aria-label="Open navigation menu"
          >
            <Menu size={21} aria-hidden="true" />
          </button>
        </div>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold text-white">{activeWorkspaceLabel}</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">
            Week {currentWeek} · Season {currentSeason}
          </p>
        </div>
        <div className="flex items-center justify-end">
          <ScreenHelpButton placement="mobileHeader" />
          <button
            onClick={() => handleNavClick("inbox")}
            className="relative flex h-11 w-11 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            aria-label={unreadCount > 0 ? `Open inbox, ${unreadCount} unread` : "Open inbox"}
          >
            <Bell size={20} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-amber-400 px-1 text-center text-[9px] font-bold leading-4 text-zinc-950">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — desktop: static, mobile: slide-over overlay */}
      <aside aria-label="Game navigation" className={`
        fixed inset-y-0 left-0 z-50 flex w-72 md:w-60 flex-col border-r border-white/10 bg-[#0b0e12]
        transform transition-transform duration-200 ease-in-out
        md:static md:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold tracking-tight">
              Talent<span className="text-emerald-500">Scout</span>
            </h1>
            {/* Close button visible only on mobile */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/5 hover:text-white md:hidden"
              aria-label="Close sidebar"
            >
              <X size={19} aria-hidden="true" />
            </button>
          </div>
          {useYouthEarlyAccessNav && (
            <span className="mt-2 inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
              Youth Scout · Early Access
            </span>
          )}
          <p className="mt-2 text-xs text-zinc-400">
            Week {currentWeek} — Season {currentSeason}
          </p>
          {useYouthEarlyAccessNav && (
            <button
              data-tutorial-id="nav-inbox"
              onClick={() => handleNavClick("inbox")}
              className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-300 transition hover:border-emerald-400/30 hover:bg-emerald-400/[0.06] hover:text-white"
            >
              <Bell size={16} aria-hidden="true" />
              <span className="flex-1 text-left">Inbox</span>
              {unreadCount > 0 && (
                <span className="min-w-5 rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-[10px] font-bold text-zinc-950">
                  {unreadCount}
                </span>
              )}
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-2" data-tutorial-id="sidebar-nav">
          {visibleSections.map((section) => (
            <div key={section.label ?? "util"}>
              {section.label && (
                <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  {section.label}
                </p>
              )}
              {!section.label && visibleSections.length > 1 && (
                <div className="mx-3 my-2 border-t border-zinc-800" />
              )}
              {section.visibleItems.map(({ screen, label, icon: Icon }) => {
                const isNew = !useYouthEarlyAccessNav && !seenNav.has(screen);
                const lockState = getNavLockState(screen, tier, careerPath);
                const isLocked = lockState === "locked";
                return (
                  <button
                    key={screen}
                    data-tutorial-id={`nav-${screen}`}
                    onClick={() => !isLocked && handleNavClick(screen)}
                    disabled={isLocked}
                    title={isLocked ? "Unlocks at Tier 3" : undefined}
                    aria-current={activeNavScreen === screen ? "page" : undefined}
                    className={`mb-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                      isLocked
                        ? "cursor-not-allowed opacity-40 text-zinc-600"
                        : activeNavScreen === screen
                          ? "bg-emerald-400/12 font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/20"
                          : "cursor-pointer text-zinc-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span className="flex-1 text-left">{label}</span>
                    {isLocked && (
                      <Lock size={12} className="text-zinc-600" aria-hidden="true" />
                    )}
                    {lockState === "preview" && !isNew && (
                      <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                        Preview
                      </span>
                    )}
                    {isNew && !isLocked && lockState !== "preview" && (
                      <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                        New
                      </span>
                    )}
                    {screen === "inbox" && !isNew && unreadCount > 0 && (
                      <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white min-w-[18px] text-center">
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
        <div className="border-t border-white/10 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">Scout</span>
            {showCareerShortcut && (
              <button
                onClick={() => handleNavClick("career")}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/5 hover:text-emerald-300"
                aria-label="Open career screen"
              >
                <ChevronRight size={12} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <ScoutAvatar avatarId={scoutAvatarId} size={32} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {scoutFirstName} {scoutLastName}
              </p>
              <p className="text-xs text-zinc-400 capitalize">
                {specialization} Scout — Tier {tier}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-zinc-400">Reputation</span>
            <span className="text-emerald-400">{Math.round(scoutReputation)}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${scoutReputation}%` }}
            />
          </div>
        </div>
      </aside>

      {/* Main Content — extra top padding on mobile for hamburger button */}
      {useYouthEarlyAccessNav && (
        <nav
          aria-label="Youth Scout workspace"
          className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-6 border-t border-white/10 bg-[#0b0e12]/98 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          {YOUTH_WORKSPACE_ITEMS.map(({ screen, label, icon: Icon }) => {
            const isActive = activeNavScreen === screen;
            return (
              <button
                key={screen}
                data-tutorial-id={`mobile-nav-${screen}`}
                onClick={() => handleNavClick(screen)}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-0.5 text-[9px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                  isActive ? "text-emerald-300" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="max-w-full truncate">{label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <main
        id="game-main"
        ref={mainRef}
        tabIndex={-1}
        className={`game-mobile-safe-scroll relative min-w-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.07),transparent_34%),linear-gradient(180deg,#0b0e12_0%,#090b0e_100%)] pt-14 focus:outline-none md:pt-0 ${useYouthEarlyAccessNav ? "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0" : ""}`}
      >
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
        <ScreenHelpButton />
        {children}
      </main>
    </div>
  );
}
