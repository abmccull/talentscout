"use client";

import * as React from "react";
import { X, Plane, MapPin, FileText, Star, TrendingUp, Building2, Trophy, Check, BookOpen, Eye, Users } from "lucide-react";
import { getTierColors } from "@/components/game/WorldMap";
import { getContinentId, getTravelDuration } from "@/engine/world/travel";
import type { CountryReputation, TravelBooking, RegionalKnowledge, HiddenLeague, CulturalInsight } from "@/engine/core/types";
import { Tooltip } from "@/components/ui/tooltip";

// =============================================================================
// TYPES
// =============================================================================

export interface CountryPopupProps {
  countryKey: string;
  countryName: string;
  continent: string;
  familiarity: number;
  reputation: CountryReputation | undefined;
  leagueCount: number;
  clubCount: number;
  isHome: boolean;
  isCurrentLocation: boolean;
  activeBooking: TravelBooking | undefined;
  travelCost: number;
  travelSlots: number;
  travelDuration: number;
  currentWeek: number;
  scoutBalance: number;
  /** Screen-relative position for the popup (px). */
  position: { x: number; y: number };
  /** Container dimensions for edge clamping. */
  containerRect: { width: number; height: number };
  /** Whether a booking was just confirmed (shows success state). */
  justBooked: boolean;
  /** Regional knowledge for this country (F13). */
  regionalKnowledge?: RegionalKnowledge;
  /** Hidden leagues discovered in this country (F13). */
  discoveredHiddenLeagues?: HiddenLeague[];
  onBookTravel: () => void;
  onClose: () => void;
}

// =============================================================================
// HELPERS
// =============================================================================

const CONTINENT_LABELS: Record<string, string> = {
  europe: "Europe",
  southamerica: "South America",
  northamerica: "North America",
  africa: "Africa",
  asia: "Asia",
  oceania: "Oceania",
  unknown: "Unknown",
};

function expertiseTierLabel(familiarity: number): string {
  if (familiarity >= 80) return "Master";
  if (familiarity >= 50) return "Expert";
  if (familiarity >= 25) return "Familiar";
  if (familiarity >= 1) return "Novice";
  return "Unknown";
}

function tierBadgeClasses(familiarity: number): string {
  if (familiarity >= 80) return "bg-green-500/20 text-green-400 border-green-500/30";
  if (familiarity >= 50) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (familiarity >= 25) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  if (familiarity >= 1) return "bg-stone-500/20 text-stone-400 border-stone-500/30";
  return "bg-zinc-700/20 text-zinc-500 border-zinc-600/30";
}

function familiarityBarGradient(familiarity: number): string {
  const tier = getTierColors(familiarity);
  return tier.core;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CountryPopup({
  countryKey,
  countryName,
  continent,
  familiarity,
  reputation,
  leagueCount,
  clubCount,
  isHome,
  isCurrentLocation,
  activeBooking,
  travelCost,
  travelSlots,
  travelDuration,
  currentWeek,
  scoutBalance,
  position,
  containerRect,
  justBooked,
  regionalKnowledge,
  discoveredHiddenLeagues,
  onBookTravel,
  onClose,
}: CountryPopupProps) {
  const popupRef = React.useRef<HTMLDivElement>(null);
  const [entering, setEntering] = React.useState(true);

  // Entry animation
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setEntering(false));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Calculate position: prefer right of dot, flip left if in right third
  const popupWidth = 300;
  const popupOffset = 20;
  const flipLeft = position.x > containerRect.width * 0.65;
  let left = flipLeft ? position.x - popupWidth - popupOffset : position.x + popupOffset;
  let top = position.y - 60;

  // Edge clamping
  left = Math.max(8, Math.min(left, containerRect.width - popupWidth - 8));
  top = Math.max(8, top);

  // Clamp bottom edge (estimate popup height ~380px)
  const estimatedHeight = 380;
  if (top + estimatedHeight > containerRect.height - 8) {
    top = containerRect.height - estimatedHeight - 8;
    if (top < 8) top = 8;
  }

  const departureWeek = currentWeek + 1;
  const returnWeek = departureWeek + travelDuration;
  const durationLabel = travelDuration === 1 ? "1 week" : `${travelDuration} weeks`;
  const canAfford = scoutBalance >= travelCost;
  const hasBooking = activeBooking !== undefined;
  const bookingIsForThisCountry = activeBooking?.destinationCountry === countryKey;
  const canBook = !isCurrentLocation && !hasBooking && canAfford && travelCost > 0;

  const continentLabel = CONTINENT_LABELS[continent] ?? continent;
  const reports = reputation?.reportsSubmitted ?? 0;
  const finds = reputation?.successfulFinds ?? 0;

  return (
    <div
      ref={popupRef}
      className="absolute z-50 pointer-events-auto"
      style={{
        left,
        top,
        width: popupWidth,
        transform: entering ? "scale(0.9)" : "scale(1)",
        opacity: entering ? 0 : 1,
        transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease",
      }}
      role="dialog"
      aria-label={`${countryName} intel dossier`}
    >
      <div className="rounded-xl border border-zinc-700/60 bg-zinc-950/92 shadow-2xl backdrop-blur-xl overflow-hidden">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
          <div>
            <h3 className="text-lg font-bold text-white leading-tight">{countryName}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{continentLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Status badges ──────────────────────────────────────── */}
        <div className="flex gap-1.5 px-4 pb-2">
          {isHome && (
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-600/40 bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
              <MapPin size={10} /> Home
            </span>
          )}
          {isCurrentLocation && (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
              <MapPin size={10} /> Currently Here
            </span>
          )}
          {bookingIsForThisCountry && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              <Plane size={10} /> Booking Active
            </span>
          )}
        </div>

        {/* ── Familiarity bar ────────────────────────────────────── */}
        <div className="px-4 pb-3" data-tutorial-id="travel-familiarity">
          <Tooltip content="Your knowledge of this country. Higher familiarity = better scouting accuracy. Grows from reports, contacts, and successful finds." side="bottom">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-zinc-500">Familiarity</span>
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${tierBadgeClasses(familiarity)}`}>
                {expertiseTierLabel(familiarity)}
              </span>
              <span className="text-[11px] text-zinc-400">{familiarity}/100</span>
            </div>
          </div>
          </Tooltip>
          <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${familiarity}%`,
                backgroundColor: familiarityBarGradient(familiarity),
              }}
            />
          </div>
        </div>

        {/* ── Stats grid ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-1.5 px-4 pb-3">
          <div className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2">
            <Trophy size={12} className="text-zinc-500" />
            <div>
              <p className="text-[10px] text-zinc-500">Leagues</p>
              <p className="text-xs font-semibold text-white">{leagueCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2">
            <Building2 size={12} className="text-zinc-500" />
            <div>
              <p className="text-[10px] text-zinc-500">Clubs</p>
              <p className="text-xs font-semibold text-white">{clubCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2">
            <FileText size={12} className="text-zinc-500" />
            <div>
              <p className="text-[10px] text-zinc-500">Reports</p>
              <p className="text-xs font-semibold text-white">{reports}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2">
            <Star size={12} className="text-zinc-500" />
            <div>
              <p className="text-[10px] text-zinc-500">Finds</p>
              <p className="text-xs font-semibold text-white">{finds}</p>
            </div>
          </div>
        </div>

        {/* ── Regional Knowledge (F13) ─────────────────────────── */}
        {regionalKnowledge && regionalKnowledge.knowledgeLevel > 0 && (
          <div className="px-4 pb-3">
            <Tooltip content="Regional knowledge grows from scouting activity in this country. Higher knowledge unlocks hidden leagues, cultural insights, and local contacts." side="bottom">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                <BookOpen size={10} className="text-purple-400" />
                Knowledge
              </span>
              <span className="text-[11px] text-purple-300">
                {regionalKnowledge.knowledgeLevel}/100
              </span>
            </div>
            </Tooltip>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${regionalKnowledge.knowledgeLevel}%`,
                  backgroundColor: regionalKnowledge.knowledgeLevel >= 75 ? "#a855f7"
                    : regionalKnowledge.knowledgeLevel >= 50 ? "#6366f1"
                    : regionalKnowledge.knowledgeLevel >= 25 ? "#8b5cf6"
                    : "#64748b",
                }}
              />
            </div>

            {/* Cultural insights */}
            {regionalKnowledge.culturalInsights.length > 0 && (
              <div className="mt-2 space-y-1">
                {regionalKnowledge.culturalInsights.map((insight, i) => (
                  <Tooltip key={i} content={insight.gameplayEffect} side="bottom">
                  <div className="flex items-start gap-1.5 rounded bg-purple-500/5 border border-purple-500/10 px-2 py-1">
                    <Eye size={9} className="text-purple-400 mt-0.5 flex-shrink-0" />
                    <p className="text-[9px] text-purple-300 leading-tight">{insight.description}</p>
                  </div>
                  </Tooltip>
                ))}
              </div>
            )}

            {/* Local contacts count */}
            {regionalKnowledge.localContacts.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1">
                <Users size={9} className="text-purple-400" />
                <span className="text-[9px] text-purple-300">
                  {regionalKnowledge.localContacts.length} local contact{regionalKnowledge.localContacts.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Discovered Hidden Leagues (F13) ────────────────────── */}
        {discoveredHiddenLeagues && discoveredHiddenLeagues.length > 0 && (
          <div className="px-4 pb-3">
            <p className="text-[10px] text-zinc-500 mb-1">Hidden Leagues</p>
            <div className="space-y-1">
              {discoveredHiddenLeagues.map((league) => (
                <Tooltip key={league.id} content={`Tier ${league.tier} — talent density ${Math.round(league.talentDensity * 100)}%`} side="bottom">
                <div className="flex items-center justify-between rounded bg-indigo-500/5 border border-indigo-500/10 px-2 py-1">
                  <span className="text-[9px] text-indigo-300">{league.name}</span>
                  <span className="text-[8px] text-indigo-400 font-mono">T{league.tier}</span>
                </div>
                </Tooltip>
              ))}
            </div>
          </div>
        )}

        {/* ── Divider ────────────────────────────────────────────── */}
        {!isCurrentLocation && (
          <div className="mx-4 border-t border-zinc-800" />
        )}

        {/* ── Travel section ─────────────────────────────────────── */}
        {!isCurrentLocation && !justBooked && (
          <div className="px-4 pt-3 pb-4" data-tutorial-id="travel-booking-section">
            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              <Tooltip content="Travel cost based on distance from home. Deducted from your balance when you book." side="bottom">
              <div>
                <p className="text-[10px] text-zinc-500">Cost</p>
                <p className="text-xs font-semibold text-white">
                  {travelCost > 0 ? `£${travelCost.toLocaleString()}` : "—"}
                </p>
              </div>
              </Tooltip>
              <Tooltip content="Activity slots consumed by travel. Long-distance trips take more slots from your weekly schedule." side="bottom">
              <div>
                <p className="text-[10px] text-zinc-500">Slots</p>
                <p className="text-xs font-semibold text-white">
                  {travelSlots > 0 ? `${travelSlots} slot${travelSlots > 1 ? "s" : ""}` : "—"}
                </p>
              </div>
              </Tooltip>
              <Tooltip content="How long you'll be away. Nearby countries: 1 week. Far countries: up to 3 weeks." side="bottom">
              <div>
                <p className="text-[10px] text-zinc-500">Duration</p>
                <p className="text-xs font-semibold text-white">
                  {travelDuration > 0 ? durationLabel : "—"}
                </p>
                {travelDuration > 0 && (
                  <p className="text-[9px] text-zinc-600 mt-0.5">
                    Wk {departureWeek}–{returnWeek}
                  </p>
                )}
              </div>
              </Tooltip>
            </div>

            <button
              onClick={canBook ? onBookTravel : undefined}
              disabled={!canBook}
              className={`w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                canBook
                  ? "bg-blue-600 text-white hover:bg-blue-500 active:scale-[0.97]"
                  : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              }`}
            >
              <Plane size={13} />
              {hasBooking
                ? "Booking Active"
                : !canAfford
                  ? "Insufficient Funds"
                  : travelCost === 0
                    ? "Same Location"
                    : "Book Travel"}
            </button>
          </div>
        )}

        {/* ── Confirmation state ─────────────────────────────────── */}
        {justBooked && (
          <div className="px-4 pt-3 pb-4 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
              <Check size={20} className="text-green-400" />
            </div>
            <p className="text-sm font-semibold text-green-400">Travel Booked!</p>
            <p className="mt-1 text-[11px] text-zinc-400">
              {durationLabel} · Wk {departureWeek}–{returnWeek} · £{travelCost.toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
