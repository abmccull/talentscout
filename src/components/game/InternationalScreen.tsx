"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useTutorialStore, resolveOnboardingSequence } from "@/stores/tutorialStore";
import { useAudio } from "@/lib/audio/useAudio";
import { GameLayout } from "./GameLayout";
import { Globe, MapPin, Wallet, Plane } from "lucide-react";
import { getCountryOptions, getSecondaryCountryOptions } from "@/data/index";
import type { CountryReputation, InternationalAssignment, TravelBooking } from "@/engine/core/types";
import { getTravelCost, getTravelSlots, getTravelDuration, getScoutHomeCountry, getContinentId } from "@/engine/world/travel";
import { getAvailableAssignments } from "@/engine/world/international";
import { WorldMap, COUNTRY_COORDS, lonLatToSvg, getTierColors } from "@/components/game/WorldMap";
import { CountryPopup } from "@/components/game/CountryPopup";
import { WorldHistoryDrawer } from "@/components/game/WorldHistoryDrawer";
import { getActiveEquipmentBonuses } from "@/engine/finance";
import { migrateInternationalAssignment } from "@/engine/world/internationalDeliverables";

// ---------------------------------------------------------------------------
// Country metadata resolver — works for both core and secondary countries
// ---------------------------------------------------------------------------

const CORE_OPTIONS = getCountryOptions();
const SECONDARY_OPTIONS = getSecondaryCountryOptions();

function getCountryMeta(key: string): { name: string; leagueCount: number; clubCount: number } {
  const core = CORE_OPTIONS.find((c) => c.key === key);
  if (core) return { name: core.name, leagueCount: core.leagueCount, clubCount: core.clubCount };
  const sec = SECONDARY_OPTIONS.find((c) => c.key === key);
  if (sec) return { name: sec.name, leagueCount: 0, clubCount: sec.clubCount };
  const coords = COUNTRY_COORDS[key];
  return {
    name: coords?.label ?? key.charAt(0).toUpperCase() + key.slice(1),
    leagueCount: 0,
    clubCount: 0,
  };
}

// ---------------------------------------------------------------------------
// HUD — Location (top-left)
// ---------------------------------------------------------------------------

function LocationHUD({ location, week }: { location: string; week: number }) {
  return (
    <div className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-900/80 px-3 py-2 backdrop-blur-md">
      <MapPin size={14} className="text-blue-400" />
      <span className="text-xs text-zinc-300">
        Currently in: <span className="font-semibold text-white">{location}</span>
      </span>
      <span className="text-zinc-600">·</span>
      <span className="text-xs text-zinc-400">Week {week}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HUD — Budget (top-right)
// ---------------------------------------------------------------------------

function BudgetHUD({ balance }: { balance: number }) {
  const color =
    balance < 500
      ? "text-red-400"
      : balance < 1000
        ? "text-amber-400"
        : "text-white";

  return (
    <div className="absolute top-3 right-3 z-20 flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-900/80 px-3 py-2 backdrop-blur-md">
      <Wallet size={14} className="text-emerald-400" />
      <span className={`text-sm font-semibold ${color}`}>
        £{balance.toLocaleString()}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HUD — Legend (bottom-left)
// ---------------------------------------------------------------------------

const LEGEND_ITEMS = [
  { color: "#3f3f46", label: "Unknown" },
  { color: "#78716c", label: "Novice" },
  { color: "#d97706", label: "Familiar" },
  { color: "#2563eb", label: "Expert" },
  { color: "#16a34a", label: "Master" },
] as const;

function LegendHUD() {
  return (
    <div
      className="absolute bottom-3 left-3 z-20 rounded-lg border border-zinc-700/50 bg-zinc-900/80 px-3 py-2 backdrop-blur-md"
      aria-label="Map legend"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {LEGEND_ITEMS.map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border-2 border-amber-500 bg-zinc-800"
            aria-hidden="true"
          />
          Current
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HUD — Booking banner (bottom-center)
// ---------------------------------------------------------------------------

function BookingBanner({ booking, homeName }: { booking: TravelBooking; homeName: string }) {
  const destName = getCountryMeta(booking.destinationCountry).name;
  const isAbroad = booking.isAbroad;
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-lg border border-blue-500/30 bg-zinc-900/80 px-4 py-2 backdrop-blur-md">
      <Plane size={14} className="text-blue-400" />
      <span className="text-xs text-zinc-300">
        {isAbroad ? (
          <>Scouting in <span className="font-semibold text-white">{destName}</span> · Returns Wk {booking.returnWeek}</>
        ) : (
          <>Travel to <span className="font-semibold text-white">{destName}</span> · Dep: Wk {booking.departureWeek} · Ret: Wk {booking.returnWeek}</>
        )}
      </span>
      <span className="text-xs text-zinc-500">· £{booking.cost.toLocaleString()}</span>
    </div>
  );
}

function assignmentTypeLabel(type: "youthTournament" | "seniorFriendly" | "scoutingMission"): string {
  switch (type) {
    case "youthTournament":
      return "Youth Tournament";
    case "seniorFriendly":
      return "Senior Friendly";
    case "scoutingMission":
      return "Scouting Mission";
  }
}

function AssignmentObjectives({
  assignment: source,
  active = false,
}: {
  assignment: InternationalAssignment;
  active?: boolean;
}) {
  const assignment = migrateInternationalAssignment(source);
  return (
    <div
      className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5"
      data-testid={active ? "active-international-objectives" : "international-assignment-objectives"}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
        {active ? "Objective progress" : "Required deliverables"}
      </p>
      <ul className="mt-2 space-y-2" aria-label={`${assignmentTypeLabel(assignment.type)} objectives`}>
        {(assignment.deliverables ?? []).map((deliverable) => {
          const complete = deliverable.progress >= deliverable.target;
          return (
            <li key={deliverable.kind} className="flex items-start justify-between gap-3 text-xs">
              <span className={complete ? "text-emerald-300" : "text-zinc-300"}>
                {deliverable.label}
              </span>
              <span
                className={`shrink-0 font-semibold tabular-nums ${complete ? "text-emerald-300" : "text-zinc-400"}`}
                aria-hidden="true"
              >
                {deliverable.progress}/{deliverable.target}
              </span>
              <span className="sr-only">
                {deliverable.progress} of {deliverable.target} complete
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
        Graded at return. Waiting or travel alone earns no assignment reward.
      </p>
    </div>
  );
}

function AssignmentPanel({
  currentWeek,
  currentSeason,
  assignments,
  activeAssignment,
  canAcceptAssignments,
  scoutBalance,
  homeCountry,
  canFitTravel,
  onOpenAssignment,
  onAcceptAssignment,
}: {
  currentWeek: number;
  currentSeason: number;
  assignments: InternationalAssignment[];
  activeAssignment: InternationalAssignment | null;
  canAcceptAssignments: boolean;
  scoutBalance: number;
  homeCountry: string;
  canFitTravel: (country: string) => boolean;
  onOpenAssignment: (country: string) => void;
  onAcceptAssignment: (assignmentId: string) => void;
}) {
  return (
    <div className="absolute left-3 top-16 z-20 max-h-[calc(100%-5.5rem)] w-[min(320px,calc(100%-1.5rem))] overflow-y-auto rounded-xl border border-zinc-700/50 bg-zinc-950/85 p-4 backdrop-blur-md">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Assignments</p>
          <h2 className="mt-1 text-sm font-semibold text-white">
            {assignments.length > 0 ? `${assignments.length} available this week` : "No live assignments"}
          </h2>
        </div>
        <div className="rounded-full border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-[10px] text-zinc-400">
          W{currentWeek} · S{currentSeason}
        </div>
      </div>

      {activeAssignment && (
        <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-blue-300">Active Trip</p>
          <p className="mt-1 text-sm font-medium text-white">
            {getCountryMeta(activeAssignment.country).name} · {assignmentTypeLabel(activeAssignment.type)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-300">{activeAssignment.description}</p>
          <AssignmentObjectives assignment={activeAssignment} active />
        </div>
      )}

      {assignments.length === 0 ? (
        <p className="text-xs leading-relaxed text-zinc-500">
          {canAcceptAssignments
            ? "No international assignments are live right now. New opportunities refresh periodically as your network grows."
            : "Assignments unlock at career tier 3 and pause while you are actively abroad."}
        </p>
      ) : (
        <div className="space-y-2">
          {assignments.map((assignment) => (
            (() => {
              const travelCost = getTravelCost(homeCountry, assignment.country);
              const canAfford = scoutBalance >= travelCost;
              const hasCalendarCapacity = canFitTravel(assignment.country);
              const canAccept = canAcceptAssignments && canAfford && hasCalendarCapacity;

              return (
            <div
              key={assignment.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-white">{getCountryMeta(assignment.country).name}</p>
                  <p className="text-[11px] text-zinc-500">{assignment.region} · {assignmentTypeLabel(assignment.type)}</p>
                </div>
                <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
                  Up to +{assignment.reputationReward} rep
                </div>
              </div>
              <p className="text-xs leading-relaxed text-zinc-400">{assignment.description}</p>
              <AssignmentObjectives assignment={assignment} />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] text-zinc-500">
                    {assignment.duration === 1 ? "1 week" : `${assignment.duration} weeks`} on site
                  </p>
                  <p className="text-[10px] text-zinc-600">Travel £{travelCost.toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenAssignment(assignment.country)}
                    className="min-h-11 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-zinc-600 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                  >
                    Open on Map
                  </button>
                  <button
                    type="button"
                    onClick={() => onAcceptAssignment(assignment.id)}
                    disabled={!canAccept}
                    className={`min-h-11 rounded-md px-3 py-2 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                      canAccept
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-500/15"
                        : "cursor-not-allowed border border-zinc-800 bg-zinc-900 text-zinc-600"
                    }`}
                  >
                    {canAcceptAssignments
                      ? canAfford
                        ? hasCalendarCapacity
                          ? "Accept"
                          : "Clear Calendar"
                        : "Funds Low"
                      : "Unavailable"}
                  </button>
                </div>
              </div>
            </div>
              );
            })()
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function InternationalScreen() {
  const gameState = useGameStore((state) => state.gameState);
  const bookInternationalTravel = useGameStore((state) => state.bookInternationalTravel);
  const pendingInternationalCountry = useGameStore((state) => state.pendingInternationalCountry);
  const setPendingInternationalCountry = useGameStore((state) => state.setPendingInternationalCountry);
  const selectPlayer = useGameStore((state) => state.selectPlayer);
  const setScreen = useGameStore((state) => state.setScreen);
  const { playSFX } = useAudio();
  const startSequence = useTutorialStore((state) => state.startSequence);
  const checkAutoAdvance = useTutorialStore((state) => state.checkAutoAdvance);

  // SVG ref for coordinate conversion
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bookTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const focusRestoreRafRef = useRef<number | null>(null);
  const popupTriggerRef = useRef<HTMLElement | SVGElement | null>(null);

  useEffect(() => () => {
    clearTimeout(bookTimerRef.current);
    if (focusRestoreRafRef.current !== null) {
      cancelAnimationFrame(focusRestoreRafRef.current);
    }
  }, []);

  // Popup state
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [justBooked, setJustBooked] = useState(false);

  const rememberPopupTrigger = useCallback((candidate: Element | null) => {
    const container = containerRef.current;
    if (!candidate || !container?.contains(candidate)) return;
    if (candidate instanceof HTMLElement || candidate instanceof SVGElement) {
      popupTriggerRef.current = candidate;
    }
  }, []);

  const handleClose = useCallback(() => {
    setSelectedCountry(null);
    setPopupPos(null);
    setJustBooked(false);

    const trigger = popupTriggerRef.current;
    popupTriggerRef.current = null;
    if (!trigger) return;

    if (focusRestoreRafRef.current !== null) {
      cancelAnimationFrame(focusRestoreRafRef.current);
    }
    focusRestoreRafRef.current = requestAnimationFrame(() => {
      focusRestoreRafRef.current = null;
      if (trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    });
  }, []);

  // ── Handlers (must be before early return) ────────────────────────────────

  const openCountryPopup = useCallback((countryKey: string, svgX: number, svgY: number) => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    const ctm = svg.getScreenCTM();
    if (!ctm) return;

    const containerRect = container.getBoundingClientRect();
    const screenX = svgX * ctm.a + ctm.e - containerRect.left;
    const screenY = svgY * ctm.d + ctm.f - containerRect.top;

    setSelectedCountry(countryKey);
    setPopupPos({ x: screenX, y: screenY });
    setJustBooked(false);
  }, []);

  const handleCountrySelect = useCallback(
    (countryKey: string, svgX: number, svgY: number) => {
      const activeElement = document.activeElement;
      if (activeElement && svgRef.current?.contains(activeElement)) {
        rememberPopupTrigger(activeElement);
      }

      // If clicking the same country, toggle off
      if (selectedCountry === countryKey) {
        handleClose();
        return;
      }

      openCountryPopup(countryKey, svgX, svgY);
      checkAutoAdvance("countryClicked");
    },
    [selectedCountry, openCountryPopup, checkAutoAdvance, handleClose, rememberPopupTrigger],
  );

  const handleBookTravel = useCallback(() => {
    if (!gameState || !selectedCountry) return;
    if (gameState.scout.travelBooking) return;
    const homeCountry = getScoutHomeCountry(gameState.scout);
    const travelCost = getTravelCost(homeCountry, selectedCountry);
    if ((gameState.finances?.balance ?? Infinity) < travelCost) return;

    const selectedAssignment = getAvailableAssignments(
      gameState.scout,
      gameState.internationalAssignments,
      gameState.currentWeek,
    ).find((assignment) => assignment.country === selectedCountry);

    const booked = bookInternationalTravel(
      selectedCountry,
      selectedAssignment
        ? {
            duration: selectedAssignment.duration,
            assignmentId: selectedAssignment.id,
          }
        : undefined,
    );
    if (!booked) return;
    playSFX("travel");
    setJustBooked(true);
    // Auto-dismiss after 1.5s
    clearTimeout(bookTimerRef.current);
    bookTimerRef.current = setTimeout(() => {
      handleClose();
    }, 1500);
  }, [gameState, selectedCountry, playSFX, bookInternationalTravel, handleClose]);

  const handleAcceptAssignment = useCallback((assignmentId: string) => {
    if (!gameState) return;
    const assignment = gameState.internationalAssignments.find(
      (item) => item.id === assignmentId,
    );
    if (!assignment || gameState.scout.travelBooking) return;

    const homeCountry = getScoutHomeCountry(gameState.scout);
    const travelCost = getTravelCost(homeCountry, assignment.country);
    if ((gameState.finances?.balance ?? Infinity) < travelCost) return;

    const booked = bookInternationalTravel(assignment.country, {
      duration: assignment.duration,
      assignmentId: assignment.id,
    });
    if (!booked) return;
    playSFX("travel");
    setJustBooked(true);
    clearTimeout(bookTimerRef.current);
    bookTimerRef.current = setTimeout(() => {
      handleClose();
    }, 1500);
  }, [gameState, playSFX, bookInternationalTravel, handleClose]);

  useEffect(() => {
    if (!pendingInternationalCountry) return;

    const coords = COUNTRY_COORDS[pendingInternationalCountry];
    if (!coords) {
      setPendingInternationalCountry(null);
      return;
    }

    const projected = lonLatToSvg(coords.lon, coords.lat);
    popupTriggerRef.current = null;
    openCountryPopup(pendingInternationalCountry, projected.x, projected.y);
    setPendingInternationalCountry(null);
  }, [openCountryPopup, pendingInternationalCountry, setPendingInternationalCountry]);

  // Recalculate popup position on resize
  useEffect(() => {
    if (!selectedCountry || !popupPos) return;
    const handler = () => {
      const svg = svgRef.current;
      const container = containerRef.current;
      if (!svg || !container) return;

      const ctm = svg.getScreenCTM();
      if (!ctm) return;

      const coords = COUNTRY_COORDS[selectedCountry];
      if (!coords) return;

      const projected = lonLatToSvg(coords.lon, coords.lat);
      const svgX = projected.x;
      const svgY = projected.y;

      const containerRect = container.getBoundingClientRect();
      const screenX = svgX * ctm.a + ctm.e - containerRect.left;
      const screenY = svgY * ctm.d + ctm.f - containerRect.top;

      setPopupPos({ x: screenX, y: screenY });
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [selectedCountry, popupPos]);

  // ── Tutorial triggers on first visit ─────────────────────────────────────
  useEffect(() => {
    startSequence("firstTravel");
    // Regional scouts: trigger specialization onboarding on first International visit
    const gs = useGameStore.getState().gameState;
    if (gs?.scout.primarySpecialization === "regional") {
      startSequence(resolveOnboardingSequence("regional", !!gs.scout.currentClubId));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Early return after all hooks ──────────────────────────────────────────

  if (!gameState) return null;

  const { scout, countries, currentWeek } = gameState;
  const booking: TravelBooking | undefined = scout.travelBooking;
  const activeAssignment = gameState.activeInternationalAssignment;
  const availableAssignments = getAvailableAssignments(
    scout,
    gameState.internationalAssignments,
    currentWeek,
  );
  const assignmentCountries = Array.from(
    new Set([
      ...availableAssignments.map((assignment) => assignment.country),
      ...(activeAssignment ? [activeAssignment.country] : []),
    ]),
  );
  const canAcceptAssignments = scout.careerTier >= 3 && !booking;

  // Derive "currently here" country from an active abroad booking
  const currentCountry: string | null =
    booking?.isAbroad === true ? booking.destinationCountry : null;

  // Home country
  const homeCountry = getScoutHomeCountry(scout);
  const homeMeta = getCountryMeta(homeCountry);

  // Effective location for display
  const effectiveLocation = currentCountry ?? homeCountry;
  const locationName = getCountryMeta(effectiveLocation).name;

  const hasActiveBooking = booking !== undefined;

  // Build familiarity levels map
  const familiarityLevels: Record<string, number> = {};
  for (const [key, rep] of Object.entries(scout.countryReputations)) {
    familiarityLevels[key] = rep.familiarity;
  }

  // Scout balance (from finances)
  const scoutBalance = gameState.finances?.balance ?? 0;

  // ── Popup data ────────────────────────────────────────────────────────────

  const selectedMeta = selectedCountry ? getCountryMeta(selectedCountry) : null;
  const selectedReputation: CountryReputation | undefined = selectedCountry
    ? scout.countryReputations[selectedCountry]
    : undefined;
  const selectedFamiliarity = selectedReputation?.familiarity ?? 0;
  const selectedContinent = selectedCountry ? getContinentId(selectedCountry) : "unknown";
  const selectedTravelCost = selectedCountry
    ? getTravelCost(homeCountry, selectedCountry)
    : 0;
  const travelSlotReduction = gameState.finances?.equipment
    ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout).travelSlotReduction ?? 0
    : 0;
  const effectiveTravelSlotsFor = (country: string) => Math.max(
    1,
    getTravelSlots(homeCountry, country) - travelSlotReduction,
  );
  const canFitTravel = (country: string) => {
    const requiredSlots = effectiveTravelSlotsFor(country);
    return !gameState.schedule.completed &&
      gameState.schedule.activities.some((_, startIndex, activities) => {
        if (startIndex + requiredSlots > activities.length) return false;
        for (let offset = 0; offset < requiredSlots; offset++) {
          if (activities[startIndex + offset] !== null) return false;
        }
        return true;
      });
  };
  const selectedTravelSlots = selectedCountry
    ? effectiveTravelSlotsFor(selectedCountry)
    : 0;
  const scheduleHasTravelCapacity = selectedCountry
    ? canFitTravel(selectedCountry)
    : false;
  const selectedTravelDuration = selectedCountry
    ? getTravelDuration(homeCountry, selectedCountry)
    : 0;
  const selectedAssignment = selectedCountry
    ? availableAssignments.find((assignment) => assignment.country === selectedCountry) ?? null
    : null;

  // Container rect for popup clamping
  const containerEl = containerRef.current;
  const cRect = containerEl
    ? { width: containerEl.clientWidth, height: containerEl.clientHeight }
    : { width: 1200, height: 800 };

  return (
    <GameLayout>
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden bg-[#0a0a0a]"
        onPointerDownCapture={(event) => {
          const target = event.target instanceof Element
            ? event.target.closest('[role="button"]')
            : null;
          if (target && svgRef.current?.contains(target)) {
            rememberPopupTrigger(target);
          }
        }}
        onClick={(e) => {
          // Click on empty map space closes popup
          if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "svg") {
            handleClose();
          }
        }}
      >
        {/* ── SVG Map ──────────────────────────────────────────── */}
        <div data-tutorial-id="travel-world-map">
        <WorldMap
          countries={countries}
          familiarityLevels={familiarityLevels}
          currentLocation={currentCountry ?? homeCountry}
          activeAssignments={assignmentCountries}
          travelDestination={booking && !booking.isAbroad ? booking.destinationCountry : undefined}
          onCountryClick={handleCountrySelect}
          svgRef={svgRef}
        />
        </div>

        {/* ── HUD Overlays ─────────────────────────────────────── */}
        <div data-tutorial-id="travel-location-hud">
        <LocationHUD location={locationName} week={currentWeek} />
        </div>
        <BudgetHUD balance={scoutBalance} />
        <WorldHistoryDrawer
          history={gameState.worldHistory}
          currentSeason={gameState.currentSeason}
          clubs={gameState.clubs}
          leagues={gameState.leagues}
          players={gameState.players}
          retiredPlayers={gameState.retiredPlayers}
          onOpenPlayer={(playerId) => {
            selectPlayer(playerId);
            setScreen("playerProfile");
          }}
        />
        <LegendHUD />
        {booking && <BookingBanner booking={booking} homeName={homeMeta.name} />}
        <AssignmentPanel
          currentWeek={currentWeek}
          currentSeason={gameState.currentSeason}
          assignments={availableAssignments}
          activeAssignment={activeAssignment}
          canAcceptAssignments={canAcceptAssignments}
          scoutBalance={scoutBalance}
          homeCountry={homeCountry}
          canFitTravel={canFitTravel}
          onOpenAssignment={(country) => {
            const coords = COUNTRY_COORDS[country];
            if (!coords) return;
            rememberPopupTrigger(document.activeElement);
            const projected = lonLatToSvg(coords.lon, coords.lat);
            openCountryPopup(country, projected.x, projected.y);
          }}
          onAcceptAssignment={handleAcceptAssignment}
        />

        {/* ── Country Popup ────────────────────────────────────── */}
        {selectedCountry && popupPos && selectedMeta && (
          <CountryPopup
            countryKey={selectedCountry}
            countryName={selectedMeta.name}
            continent={selectedContinent}
            familiarity={selectedFamiliarity}
            reputation={selectedReputation}
            leagueCount={selectedMeta.leagueCount}
            clubCount={selectedMeta.clubCount}
            isHome={selectedCountry === homeCountry}
            isCurrentLocation={selectedCountry === effectiveLocation}
            activeBooking={booking}
            travelCost={selectedTravelCost}
            travelSlots={selectedTravelSlots}
            travelDuration={selectedTravelDuration}
            scheduleHasCapacity={scheduleHasTravelCapacity}
            currentWeek={currentWeek}
            scoutBalance={scoutBalance}
            position={popupPos}
            containerRect={cRect}
            justBooked={justBooked}
            bookingActionLabel={selectedAssignment ? "Accept Assignment" : "Book Travel"}
            bookingDetail={
              selectedAssignment
                ? `Full completion can earn up to +${selectedAssignment.reputationReward} reputation; objectives are graded at return.`
                : undefined
            }
            regionalKnowledge={gameState.regionalKnowledge?.[selectedCountry]}
            onBookTravel={handleBookTravel}
            onClose={handleClose}
          />
        )}
      </div>
    </GameLayout>
  );
}
