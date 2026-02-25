"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useTutorialStore } from "@/stores/tutorialStore";
import { useAudio } from "@/lib/audio/useAudio";
import { GameLayout } from "./GameLayout";
import { Globe, MapPin, Wallet, Plane } from "lucide-react";
import { getCountryOptions, getSecondaryCountryOptions } from "@/data/index";
import type { CountryReputation, TravelBooking } from "@/engine/core/types";
import { getTravelCost, getTravelSlots, getTravelDuration, getScoutHomeCountry, getContinentId } from "@/engine/world/travel";
import { WorldMap, COUNTRY_COORDS, lonLatToSvg, getTierColors } from "@/components/game/WorldMap";
import { CountryPopup } from "@/components/game/CountryPopup";

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

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function InternationalScreen() {
  const { gameState, bookInternationalTravel } = useGameStore();
  const { playSFX } = useAudio();
  const { startSequence, checkAutoAdvance } = useTutorialStore();

  // SVG ref for coordinate conversion
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Popup state
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [justBooked, setJustBooked] = useState(false);

  // ── Handlers (must be before early return) ────────────────────────────────

  const handleCountrySelect = useCallback(
    (countryKey: string, svgX: number, svgY: number) => {
      // If clicking the same country, toggle off
      if (selectedCountry === countryKey) {
        setSelectedCountry(null);
        setPopupPos(null);
        setJustBooked(false);
        return;
      }

      // Convert SVG coords to screen coords relative to container
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
      checkAutoAdvance("countryClicked");
    },
    [selectedCountry, checkAutoAdvance],
  );

  const handleBookTravel = useCallback(() => {
    if (!selectedCountry) return;
    playSFX("travel");
    bookInternationalTravel(selectedCountry);
    setJustBooked(true);
    // Auto-dismiss after 1.5s
    setTimeout(() => {
      setSelectedCountry(null);
      setPopupPos(null);
      setJustBooked(false);
    }, 1500);
  }, [selectedCountry, playSFX, bookInternationalTravel]);

  const handleClose = useCallback(() => {
    setSelectedCountry(null);
    setPopupPos(null);
    setJustBooked(false);
  }, []);

  // Escape key closes popup
  useEffect(() => {
    if (!selectedCountry) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCountry, handleClose]);

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

  // ── Tutorial trigger on first visit ──────────────────────────────────────
  useEffect(() => {
    startSequence("firstTravel");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Early return after all hooks ──────────────────────────────────────────

  if (!gameState) return null;

  const { scout, countries, currentWeek } = gameState;
  const booking: TravelBooking | undefined = scout.travelBooking;

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
  const selectedTravelSlots = selectedCountry
    ? getTravelSlots(homeCountry, selectedCountry)
    : 0;
  const selectedTravelDuration = selectedCountry
    ? getTravelDuration(homeCountry, selectedCountry)
    : 0;

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
          activeAssignments={[]}
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
        <LegendHUD />
        {booking && <BookingBanner booking={booking} homeName={homeMeta.name} />}

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
            currentWeek={currentWeek}
            scoutBalance={scoutBalance}
            position={popupPos}
            containerRect={cRect}
            justBooked={justBooked}
            onBookTravel={handleBookTravel}
            onClose={handleClose}
          />
        )}
      </div>
    </GameLayout>
  );
}
