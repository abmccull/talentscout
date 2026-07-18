"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useTutorialStore, resolveOnboardingSequence } from "@/stores/tutorialStore";
import { useAudio } from "@/lib/audio/useAudio";
import { GameLayout } from "./GameLayout";
import { Globe2, MapPin, Wallet, Plane, Search, X } from "lucide-react";
import { getCountryOptions, getSecondaryCountryOptions } from "@/data/index";
import type { CountryReputation, InternationalAssignment, TravelBooking, TravelPosture } from "@/engine/core/types";
import {
  getScoutHomeCountry,
  getContinentId,
  TRAVEL_POSTURE_DEFINITIONS,
} from "@/engine/world/travel";
import { deriveRegionalPresence, getRegionalTravelQuote } from "@/engine/world/regionalPresence";
import { getAvailableAssignments } from "@/engine/world/international";
import { WorldMap } from "@/components/game/WorldMap";
import { CountryPopup } from "@/components/game/CountryPopup";
import { WorldHistoryDrawer } from "@/components/game/WorldHistoryDrawer";
import { WORLD_TERMS, worldTermSummary } from "@/components/game/worldTerminology";
import { getContextualEquipmentBonuses } from "@/engine/finance";
import { migrateInternationalAssignment } from "@/engine/world/internationalDeliverables";
import {
  getWorldCountryAvailability,
  isTravelEligibleCountry,
  type WorldCountryAvailability,
} from "@/engine/world/countryAvailability";
import { getHiddenLeaguesForCountry } from "@/engine/world/hiddenLeagues";
import { getCountryMapLabel, getCountryMapPosition } from "@/engine/world/mapCountryRegistry";
import { getCountryDisplayName } from "@/lib/country";
import { WorldOutlookDrawer } from "./world/WorldOutlookDrawer";
import {
  deriveClubRecruitmentEcosystem,
  deriveTerritoryIdentity,
  deriveWorldConditionStakeholderMatrix,
} from "@/engine/world";

// ---------------------------------------------------------------------------
// Country metadata resolver — works for both core and secondary countries
// ---------------------------------------------------------------------------

const CORE_OPTIONS = getCountryOptions();
const SECONDARY_OPTIONS = getSecondaryCountryOptions();

function getCountryMeta(key: string): { name: string; leagueCount: number; clubCount: number } {
  const core = CORE_OPTIONS.find((c) => c.key === key);
  const mapLabel = getCountryMapLabel(key);
  if (core) return { name: mapLabel ?? core.name, leagueCount: core.leagueCount, clubCount: core.clubCount };
  const sec = SECONDARY_OPTIONS.find((c) => c.key === key);
  if (sec) return { name: mapLabel ?? sec.name, leagueCount: 0, clubCount: sec.clubCount };
  return {
    name: mapLabel ?? getCountryDisplayName(key),
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
      className="absolute bottom-3 left-3 z-20 max-w-[18rem] rounded-lg border border-zinc-700/50 bg-zinc-900/80 px-3 py-2 backdrop-blur-md"
      role="group"
      aria-label="World map legend"
      title={worldTermSummary()}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
        {WORLD_TERMS.familiarity.label} marker tiers
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
        Personal credibility shown by the ring color. {WORLD_TERMS.regionalKnowledge.label} uses the purple badge. {WORLD_TERMS.operationalPresence.label} lives in the dossier and country browser, not as a separate map tier.
      </p>
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
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-3 w-3 items-center justify-center rounded-[3px] bg-violet-500 text-[8px] font-semibold text-white" aria-hidden="true">
            2
          </span>
          {WORLD_TERMS.regionalKnowledge.label} band
        </span>
        <span className="text-zinc-500">
          {WORLD_TERMS.operationalPresence.label}: open the dossier
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HUD — Booking banner (bottom-center)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Country browser — the map is atmospheric, not the only way to navigate
// ---------------------------------------------------------------------------

const CONTINENT_NAMES: Record<string, string> = {
  europe: "Europe",
  southamerica: "South America",
  northamerica: "North America",
  africa: "Africa",
  asia: "Asia",
  oceania: "Oceania",
  unknown: "Other regions",
};

function countryContentLabel(contentTier: WorldCountryAvailability["contentTier"]): string {
  if (contentTier === "fullWorld") return "Live calendar";
  if (contentTier === "talentPool") return "Scouting network";
  return "Unavailable";
}

function countryCoverageSummary(country: WorldCountryAvailability): string {
  if (country.contentTier === "fullWorld") {
    return `${country.clubCount} clubs · ${country.fixtureCount} fixtures`;
  }

  return `${country.unsignedYouthCount} youth · ${country.subRegionCount} regions`;
}

interface CountryBrowserProps {
  countries: WorldCountryAvailability[];
  currentCountry: string;
  activeAssignmentCountries: string[];
  knowledgeLevels: Record<string, number>;
  presenceScores: Record<string, number>;
  onOpenCountry: (countryKey: string, trigger: HTMLButtonElement) => void;
}

function CountryBrowser({
  countries,
  currentCountry,
  activeAssignmentCountries,
  knowledgeLevels,
  presenceScores,
  onOpenCountry,
}: CountryBrowserProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const activeAssignments = useMemo(
    () => new Set(activeAssignmentCountries),
    [activeAssignmentCountries],
  );

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (!open) return;

    const focusFrame = requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A country dossier may be opened from this persistent browser. Its
      // own Escape contract takes precedence and restores focus to the row.
      if (!panelRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [close, open]);

  const visibleCountries = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return countries
      .filter((country) => country.travelEligible)
      .filter((country) => {
        if (!search) return true;
        const name = getCountryMeta(country.countryKey).name.toLocaleLowerCase();
        const continent = CONTINENT_NAMES[getContinentId(country.countryKey)]?.toLocaleLowerCase() ?? "";
        return [name, continent, countryContentLabel(country.contentTier).toLocaleLowerCase()]
          .some((value) => value.includes(search));
      })
      .sort((left, right) => {
        const leftPriority = left.countryKey === currentCountry ? -2 : activeAssignments.has(left.countryKey) ? -1 : 0;
        const rightPriority = right.countryKey === currentCountry ? -2 : activeAssignments.has(right.countryKey) ? -1 : 0;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        const knowledgeDelta = (knowledgeLevels[right.countryKey] ?? 0) - (knowledgeLevels[left.countryKey] ?? 0);
        return knowledgeDelta || getCountryMeta(left.countryKey).name.localeCompare(getCountryMeta(right.countryKey).name);
      });
  }, [activeAssignments, countries, currentCountry, knowledgeLevels, query]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="country-browser"
        onClick={() => setOpen((value) => !value)}
        className="absolute right-3 top-[7.75rem] z-30 flex min-h-11 items-center gap-2 rounded-lg border border-blue-500/35 bg-zinc-950/90 px-3 py-2 text-xs font-semibold text-blue-100 shadow-lg backdrop-blur-md transition hover:border-blue-300/65 hover:bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300"
      >
        <Globe2 size={16} aria-hidden="true" />
        Browse countries
        <span className="rounded-full bg-blue-400/15 px-1.5 py-0.5 text-[10px] text-blue-100">
          {countries.filter((country) => country.travelEligible).length}
        </span>
      </button>

      {open && (
        <aside
          ref={panelRef}
          id="country-browser"
          role="region"
          aria-labelledby="country-browser-title"
          aria-describedby="country-browser-description"
          data-testid="country-browser"
          className="absolute inset-x-3 bottom-3 top-[10.75rem] z-40 flex flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950/95 shadow-2xl backdrop-blur-xl md:inset-x-auto md:right-3 md:top-[10.75rem] md:w-[min(348px,calc(100%-1.5rem))]"
        >
          <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300">
                World access
              </p>
              <h2 id="country-browser-title" className="mt-1 text-base font-semibold text-white">
                Browse active countries
              </h2>
              <p id="country-browser-description" className="mt-1 text-xs leading-relaxed text-zinc-400">
                Only countries with active scouting opportunities in this career are listed.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition hover:border-zinc-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300"
              aria-label="Close country browser"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="border-b border-zinc-800 px-4 py-3">
            <label className="relative block">
              <span className="sr-only">Search active countries</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search country or region"
                className="min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300"
              />
            </label>
            <p className="mt-2 text-[10px] text-zinc-500" aria-live="polite">
              {visibleCountries.length} destination{visibleCountries.length === 1 ? "" : "s"} shown · Live-calendar countries track fixtures week by week; scouting-network countries focus on prospects and local intelligence.
            </p>
          </div>

          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-label="Active scouting destinations">
            {visibleCountries.map((country) => {
              const countryName = getCountryMeta(country.countryKey).name;
              const continent = CONTINENT_NAMES[getContinentId(country.countryKey)] ?? "Other regions";
              const knowledge = knowledgeLevels[country.countryKey] ?? 0;
              const isCurrent = country.countryKey === currentCountry;
              const hasAssignment = activeAssignments.has(country.countryKey);
              const contentTierLabel = countryContentLabel(country.contentTier);
              return (
                <li key={country.countryKey}>
                  <button
                    type="button"
                    data-country-key={country.countryKey}
                    onClick={(event) => {
                      const dossierTrigger = triggerRef.current ?? event.currentTarget;
                      setOpen(false);
                      onOpenCountry(country.countryKey, dossierTrigger);
                    }}
                    className="min-h-14 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5 text-left transition hover:border-blue-400/55 hover:bg-blue-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300"
                    aria-label={`${countryName}, ${contentTierLabel}, ${WORLD_TERMS.regionalKnowledge.shortLabel.toLowerCase()} ${knowledge} of 100, ${WORLD_TERMS.operationalPresence.shortLabel.toLowerCase()} ${presenceScores[country.countryKey] ?? 0} of 100. Open country dossier.`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-100">{countryName}</p>
                        <p className="mt-0.5 text-[10px] text-zinc-500">{continent} · {countryCoverageSummary(country)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        country.contentTier === "fullWorld"
                          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                          : "border-indigo-500/35 bg-indigo-500/10 text-indigo-200"
                      }`}>
                        {contentTierLabel}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[10px]">
                      <span className="text-purple-200" title={worldTermSummary()}>
                        {WORLD_TERMS.regionalKnowledge.shortLabel} {knowledge}/100 · {WORLD_TERMS.operationalPresence.shortLabel} {presenceScores[country.countryKey] ?? 0}/100
                      </span>
                      <span className={isCurrent ? "font-medium text-blue-200" : hasAssignment ? "font-medium text-amber-200" : "text-zinc-500"}>
                        {isCurrent ? "Current location" : hasAssignment ? "Live assignment" : "Open dossier"}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {visibleCountries.length === 0 && (
            <div className="border-t border-zinc-800 px-4 py-5 text-center">
              <p className="text-sm font-medium text-zinc-200">No country matches that search.</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Try a country name, continent, or coverage type.
              </p>
            </div>
          )}
        </aside>
      )}
    </>
  );
}

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
          <>Travel to <span className="font-semibold text-white">{destName}</span> · {booking.posture ? TRAVEL_POSTURE_DEFINITIONS[booking.posture].label : "Legacy itinerary"} · Dep: Wk {booking.departureWeek} · Ret: Wk {booking.returnWeek}</>
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
  travelCostFor,
  canFitTravel,
  onOpenAssignment,
  onReviewAssignment,
}: {
  currentWeek: number;
  currentSeason: number;
  assignments: InternationalAssignment[];
  activeAssignment: InternationalAssignment | null;
  canAcceptAssignments: boolean;
  scoutBalance: number;
  travelCostFor: (country: string) => number;
  canFitTravel: (country: string) => boolean;
  onOpenAssignment: (country: string) => void;
  onReviewAssignment: (assignmentId: string) => void;
}) {
  return (
    <div
      data-testid="international-assignment-panel"
      className="absolute left-3 top-[11.25rem] z-20 max-h-[calc(100%-17rem)] w-[min(320px,calc(100%-1.5rem))] overflow-y-auto rounded-xl border border-zinc-700/50 bg-zinc-950/85 p-4 backdrop-blur-md md:top-16 md:max-h-[calc(100%-5.5rem)]"
    >
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
              const travelCost = travelCostFor(assignment.country);
              const canAfford = scoutBalance >= travelCost;
              const hasCalendarCapacity = canFitTravel(assignment.country);

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
                  <p className="text-[10px] text-zinc-600">Base travel £{travelCost.toLocaleString()}</p>
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
                    onClick={() => onReviewAssignment(assignment.id)}
                    disabled={!canAcceptAssignments}
                    className={`min-h-11 rounded-md px-3 py-2 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                      canAcceptAssignments
                        ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400/50 hover:bg-emerald-500/15"
                        : "cursor-not-allowed border border-zinc-800 bg-zinc-900 text-zinc-600"
                    }`}
                  >
                    {canAcceptAssignments ? "Review trip" : "Unavailable"}
                  </button>
                </div>
              </div>
              {canAcceptAssignments && (!canAfford || !hasCalendarCapacity) && (
                <p className="mt-2 text-[10px] leading-relaxed text-amber-300/85">
                  {!canAfford
                    ? "Commitment is blocked right now: raise funds before you book from the dossier."
                    : "Commitment is blocked right now: clear enough weekly schedule space before you book from the dossier."}
                </p>
              )}
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
  const worldOutlookTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => {
    clearTimeout(bookTimerRef.current);
    if (focusRestoreRafRef.current !== null) {
      cancelAnimationFrame(focusRestoreRafRef.current);
    }
  }, []);

  // Popup state
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<"map" | "browser" | null>(null);
  const [justBooked, setJustBooked] = useState(false);
  const [travelPosture, setTravelPosture] = useState<TravelPosture>("assignmentFirst");
  const [worldOutlookOpen, setWorldOutlookOpen] = useState(false);

  const closeWorldOutlook = useCallback(() => {
    setWorldOutlookOpen(false);
    requestAnimationFrame(() => worldOutlookTriggerRef.current?.focus({ preventScroll: true }));
  }, []);

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
    setPopupAnchor(null);
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
    setPopupAnchor("map");
    setJustBooked(false);
  }, []);

  const openCountryPopupFromBrowser = useCallback((
    countryKey: string,
    trigger: HTMLButtonElement,
  ) => {
    const container = containerRef.current;
    if (!container) return;

    rememberPopupTrigger(trigger);
    const containerRect = container.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    setSelectedCountry(countryKey);
    setPopupPos({
      x: triggerRect.left - containerRect.left + triggerRect.width / 2,
      y: triggerRect.top - containerRect.top + triggerRect.height / 2,
    });
    setPopupAnchor("browser");
    setJustBooked(false);
    checkAutoAdvance("countryClicked");
  }, [checkAutoAdvance, rememberPopupTrigger]);

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
    const equipmentBonuses = gameState.finances?.equipment
      ? getContextualEquipmentBonuses(
          gameState.finances.equipment.loadout,
          {
            scoutHomeCountry: getScoutHomeCountry(gameState.scout),
            country: selectedCountry,
          },
        )
      : undefined;
    const travelCost = Math.round(
      getRegionalTravelQuote(gameState, selectedCountry, travelPosture).cost
        * (1 - (equipmentBonuses?.travelCostReduction ?? 0)),
    );
    if ((gameState.finances?.balance ?? Infinity) < travelCost) return;

    const selectedAssignment = getAvailableAssignments(
      gameState.scout,
      gameState.internationalAssignments,
      gameState.currentWeek,
      gameState,
    ).find((assignment) => assignment.country === selectedCountry);

    const booked = bookInternationalTravel(
      selectedCountry,
      selectedAssignment
        ? {
            duration: selectedAssignment.duration,
            assignmentId: selectedAssignment.id,
            posture: travelPosture,
          }
        : { posture: travelPosture },
    );
    if (!booked) return;
    playSFX("travel");
    setJustBooked(true);
    // Auto-dismiss after 1.5s
    clearTimeout(bookTimerRef.current);
    bookTimerRef.current = setTimeout(() => {
      handleClose();
    }, 1500);
  }, [gameState, selectedCountry, travelPosture, playSFX, bookInternationalTravel, handleClose]);

  const handleReviewAssignment = useCallback((assignmentId: string) => {
    if (!gameState) return;
    const assignment = gameState.internationalAssignments.find(
      (item) => item.id === assignmentId,
    );
    if (!assignment) return;
    const position = getCountryMapPosition(assignment.country);
    if (!position) return;

    rememberPopupTrigger(document.activeElement);
    setTravelPosture("assignmentFirst");
    openCountryPopup(assignment.country, position.x, position.y);
  }, [gameState, openCountryPopup, rememberPopupTrigger]);

  useEffect(() => {
    if (!pendingInternationalCountry) return;

    const position = getCountryMapPosition(pendingInternationalCountry);
    if (!gameState || !position || !isTravelEligibleCountry(gameState, pendingInternationalCountry)) {
      setPendingInternationalCountry(null);
      return;
    }

    popupTriggerRef.current = null;
    openCountryPopup(pendingInternationalCountry, position.x, position.y);
    setPendingInternationalCountry(null);
  }, [gameState, openCountryPopup, pendingInternationalCountry, setPendingInternationalCountry]);

  // Recalculate popup position on resize
  useEffect(() => {
    if (!selectedCountry || !popupPos || popupAnchor !== "map") return;
    const handler = () => {
      const svg = svgRef.current;
      const container = containerRef.current;
      if (!svg || !container) return;

      const ctm = svg.getScreenCTM();
      if (!ctm) return;

      const position = getCountryMapPosition(selectedCountry);
      if (!position) return;

      const containerRect = container.getBoundingClientRect();
      const screenX = position.x * ctm.a + ctm.e - containerRect.left;
      const screenY = position.y * ctm.d + ctm.f - containerRect.top;

      setPopupPos({ x: screenX, y: screenY });
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [popupAnchor, popupPos, selectedCountry]);

  // ── Tutorial triggers on first visit ─────────────────────────────────────
  useEffect(() => {
    startSequence("firstTravel");
    // Regional scouts: trigger specialization onboarding on first International visit
    const gs = useGameStore.getState().gameState;
    if (gs?.scout.primarySpecialization === "regional") {
      startSequence(resolveOnboardingSequence("regional", !!gs.scout.currentClubId));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generatedCountryAvailability = useMemo(
    () => gameState ? getWorldCountryAvailability(gameState) : [],
    [gameState],
  );

  // ── Early return after all hooks ──────────────────────────────────────────

  if (!gameState) return null;

  const { scout, currentWeek } = gameState;
  const booking: TravelBooking | undefined = scout.travelBooking;
  const activeAssignment = gameState.activeInternationalAssignment;
  const availableAssignments = getAvailableAssignments(
    scout,
    gameState.internationalAssignments,
    currentWeek,
    gameState,
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

  const travelEligibleCountries = generatedCountryAvailability.filter(
    (country) => country.travelEligible,
  );
  const travelEligibleCountryKeys = travelEligibleCountries.map(
    (country) => country.countryKey,
  );
  const knowledgeLevels = Object.fromEntries(
    travelEligibleCountries.map((country) => [
      country.countryKey,
      gameState.regionalKnowledge?.[country.countryKey]?.knowledgeLevel
        ?? familiarityLevels[country.countryKey]
        ?? 0,
    ]),
  ) as Record<string, number>;
  const presenceScores = Object.fromEntries(
    travelEligibleCountries.map((country) => [
      country.countryKey,
      deriveRegionalPresence(gameState, country.countryKey).accessScore,
    ]),
  ) as Record<string, number>;

  // Scout balance (from finances)
  const scoutBalance = gameState.finances?.balance ?? 0;

  // ── Popup data ────────────────────────────────────────────────────────────

  const selectedMeta = selectedCountry ? getCountryMeta(selectedCountry) : null;
  const selectedAvailability = selectedCountry
    ? travelEligibleCountries.find((country) => country.countryKey === selectedCountry)
    : undefined;
  const selectedReputation: CountryReputation | undefined = selectedCountry
    ? scout.countryReputations[selectedCountry]
    : undefined;
  const selectedFamiliarity = selectedReputation?.familiarity ?? 0;
  const selectedContinent = selectedCountry ? getContinentId(selectedCountry) : "unknown";
  const effectiveTravelQuoteFor = (
    country: string,
    posture: TravelPosture = country === selectedCountry
      ? travelPosture
      : "assignmentFirst",
  ) => {
    const travelEquipmentBonuses = gameState.finances?.equipment
      ? getContextualEquipmentBonuses(
          gameState.finances.equipment.loadout,
          {
            scoutHomeCountry: homeCountry,
            country,
          },
        )
      : undefined;
    const quote = getRegionalTravelQuote(gameState, country, posture);
    return {
      ...quote,
      cost: Math.round(
        quote.cost * (1 - (travelEquipmentBonuses?.travelCostReduction ?? 0)),
      ),
      slots: Math.max(
        quote.slots === 0 ? 0 : 1,
        quote.slots - (travelEquipmentBonuses?.travelSlotReduction ?? 0),
      ),
    };
  };
  const selectedTravelQuote = selectedCountry
    ? effectiveTravelQuoteFor(selectedCountry)
    : undefined;
  const selectedTravelCost = selectedTravelQuote?.cost ?? 0;
  const effectiveTravelSlotsFor = (country: string) => effectiveTravelQuoteFor(country).slots;
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
  const selectedTravelDuration = selectedTravelQuote?.duration ?? 0;
  const selectedAssignment = selectedCountry
    ? availableAssignments.find((assignment) => assignment.country === selectedCountry) ?? null
    : null;
  const selectedRegionalKnowledge = selectedCountry
    ? gameState.regionalKnowledge?.[selectedCountry]
    : undefined;
  const selectedHiddenLeagues = selectedCountry && selectedRegionalKnowledge
    ? getHiddenLeaguesForCountry(selectedCountry).filter((league) =>
        (selectedRegionalKnowledge.discoveredLeagues ?? []).includes(league.id),
      )
    : [];
  const selectedWorldActivitySummary = selectedAvailability
    ? selectedAvailability.contentTier === "fullWorld"
      ? `${selectedAvailability.clubCount} active clubs and ${selectedAvailability.fixtureCount} playable fixtures are on the calendar here.`
      : `${selectedAvailability.unsignedYouthCount} youth prospects and ${selectedAvailability.subRegionCount} regional scouting areas are active here. This country is tracked through local intel rather than a weekly fixture calendar.`
    : undefined;
  const selectedTerritoryIdentity = selectedCountry
    ? deriveTerritoryIdentity(gameState, selectedCountry)
    : null;
  const selectedStakeholderMatrix = selectedCountry
    ? deriveWorldConditionStakeholderMatrix(gameState, { countryId: selectedCountry })
    : null;
  const selectedClubEcosystems = selectedCountry
    ? Object.values(gameState.clubs)
      .filter((club) => gameState.leagues[club.leagueId]?.country === selectedCountry)
      .map((club) => ({
        clubId: club.id,
        name: club.name,
        ecosystem: deriveClubRecruitmentEcosystem(gameState, club.id),
      }))
      .filter((entry): entry is { clubId: string; name: string; ecosystem: NonNullable<ReturnType<typeof deriveClubRecruitmentEcosystem>> } => entry.ecosystem !== null)
      .sort((left, right) =>
        right.ecosystem.marketUrgency - left.ecosystem.marketUrgency
        || right.ecosystem.evidenceFloor - left.ecosystem.evidenceFloor
        || left.name.localeCompare(right.name),
      )
      .slice(0, 3)
    : [];
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
          countries={travelEligibleCountryKeys}
          familiarityLevels={familiarityLevels}
          knowledgeLevels={knowledgeLevels}
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
        <button
          ref={worldOutlookTriggerRef}
          type="button"
          aria-expanded={worldOutlookOpen}
          aria-controls="world-outlook-drawer"
          onClick={() => setWorldOutlookOpen(true)}
          className="absolute left-3 top-16 z-30 flex min-h-11 items-center gap-2 rounded-lg border border-emerald-500/35 bg-zinc-950/90 px-3 py-2 text-xs font-semibold text-emerald-100 shadow-lg backdrop-blur-md transition hover:border-emerald-300/65 hover:bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 md:left-auto md:right-[10.5rem]"
          data-testid="open-world-outlook"
        >
          <Globe2 size={16} aria-hidden="true" />
          World outlook
        </button>
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
        <CountryBrowser
          countries={travelEligibleCountries}
          currentCountry={effectiveLocation}
          activeAssignmentCountries={assignmentCountries}
          knowledgeLevels={knowledgeLevels}
          presenceScores={presenceScores}
          onOpenCountry={openCountryPopupFromBrowser}
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
          travelCostFor={(country) => effectiveTravelQuoteFor(country, "assignmentFirst").cost}
          canFitTravel={canFitTravel}
          onOpenAssignment={(country) => {
            const position = getCountryMapPosition(country);
            if (!position) return;
            rememberPopupTrigger(document.activeElement);
            openCountryPopup(country, position.x, position.y);
          }}
          onReviewAssignment={handleReviewAssignment}
        />

        {/* ── Country Popup ────────────────────────────────────── */}
        {selectedCountry && popupPos && selectedMeta && (
          <CountryPopup
            countryKey={selectedCountry}
            countryName={selectedMeta.name}
            continent={selectedContinent}
            familiarity={selectedFamiliarity}
            reputation={selectedReputation}
            leagueCount={selectedAvailability?.leagueCount ?? 0}
            clubCount={selectedAvailability?.clubCount ?? 0}
            isHome={selectedCountry === homeCountry}
            isCurrentLocation={selectedCountry === effectiveLocation}
            activeBooking={booking}
            travelCost={selectedTravelCost}
            travelSlots={selectedTravelSlots}
            travelDuration={selectedAssignment?.duration ?? selectedTravelDuration}
            scheduleHasCapacity={scheduleHasTravelCapacity}
            currentWeek={currentWeek}
            scoutBalance={scoutBalance}
            position={popupPos}
            containerRect={cRect}
            justBooked={justBooked}
            bookingActionLabel={selectedAssignment ? "Commit trip" : "Book travel"}
            bookingDetail={
              selectedAssignment
                ? `Choose a trip posture before you commit. Full completion can earn up to +${selectedAssignment.reputationReward} reputation; objectives are graded at return.`
                : undefined
            }
            contentTier={selectedAvailability?.contentTier === "unavailable" ? undefined : selectedAvailability?.contentTier}
            worldActivitySummary={selectedWorldActivitySummary}
            fixtureCount={selectedAvailability?.fixtureCount}
            regionalKnowledge={selectedRegionalKnowledge}
            regionalPresence={selectedTravelQuote?.presence}
            discoveredHiddenLeagues={selectedHiddenLeagues}
            territoryIdentity={selectedTerritoryIdentity}
            stakeholderMatrix={selectedStakeholderMatrix}
            clubEcosystems={selectedClubEcosystems}
            travelPosture={travelPosture}
            onTravelPostureChange={setTravelPosture}
            onBookTravel={handleBookTravel}
            onClose={handleClose}
          />
        )}
        {worldOutlookOpen && (
          <div id="world-outlook-drawer">
            <WorldOutlookDrawer
              state={gameState}
              onClose={closeWorldOutlook}
              onOpenRivals={() => {
                setWorldOutlookOpen(false);
                setScreen("rivals");
              }}
            />
          </div>
        )}
      </div>
    </GameLayout>
  );
}
