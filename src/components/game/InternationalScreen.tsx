"use client";

import { useRef } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useAudio } from "@/lib/audio/useAudio";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Globe, Plane, MapPin, Star } from "lucide-react";
import { getCountryOptions } from "@/data/index";
import type { CountryReputation, TravelBooking } from "@/engine/core/types";
import { WorldMap } from "@/components/game/WorldMap";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_COUNTRY_OPTIONS = getCountryOptions();

function getCountryMeta(key: string): { name: string; leagueCount: number; clubCount: number } {
  return (
    ALL_COUNTRY_OPTIONS.find((c) => c.key === key) ?? {
      name: key.charAt(0).toUpperCase() + key.slice(1),
      leagueCount: 0,
      clubCount: 0,
    }
  );
}

function expertiseLabel(familiarity: number): string {
  if (familiarity >= 80) return "Master";
  if (familiarity >= 60) return "Expert";
  if (familiarity >= 40) return "Familiar";
  if (familiarity >= 20) return "Novice";
  return "Unknown";
}

function expertiseColor(familiarity: number): string {
  if (familiarity >= 80) return "bg-emerald-500";
  if (familiarity >= 60) return "bg-blue-500";
  if (familiarity >= 40) return "bg-amber-500";
  if (familiarity >= 20) return "bg-zinc-400";
  return "bg-zinc-700";
}

function expertiseBadgeVariant(
  familiarity: number,
): "success" | "default" | "warning" | "secondary" | "outline" {
  if (familiarity >= 80) return "success";
  if (familiarity >= 60) return "default";
  if (familiarity >= 40) return "warning";
  return "secondary";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ActiveBookingPanelProps {
  booking: TravelBooking;
  currentWeek: number;
}

function ActiveBookingPanel({ booking, currentWeek }: ActiveBookingPanelProps) {
  const meta = getCountryMeta(booking.destinationCountry);
  const isAbroad = booking.isAbroad;
  const departingThisWeek = !isAbroad && booking.departureWeek === currentWeek;

  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm text-blue-400">
          <Plane size={16} aria-hidden="true" />
          {isAbroad ? "Currently Abroad" : "Upcoming Travel"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
          <div>
            <p className="text-zinc-500">Destination</p>
            <p className="font-medium text-white">{meta.name}</p>
          </div>
          <div>
            <p className="text-zinc-500">Departs Week</p>
            <p className="font-medium text-white">{booking.departureWeek}</p>
          </div>
          <div>
            <p className="text-zinc-500">Returns Week</p>
            <p className="font-medium text-white">{booking.returnWeek}</p>
          </div>
          <div>
            <p className="text-zinc-500">Cost</p>
            <p className="font-medium text-white">£{booking.cost.toLocaleString()}</p>
          </div>
        </div>
        {departingThisWeek && (
          <p className="mt-3 text-xs text-amber-400">
            Travel departs this week — add an &quot;International Travel&quot; activity to your schedule.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface CountryCardProps {
  countryKey: string;
  reputation: CountryReputation | undefined;
  isHome: boolean;
  isCurrentLocation: boolean;
  hasActiveBooking: boolean;
  onBookTravel: () => void;
}

function CountryCard({
  countryKey,
  reputation,
  isHome,
  isCurrentLocation,
  hasActiveBooking,
  onBookTravel,
}: CountryCardProps) {
  const meta = getCountryMeta(countryKey);
  const familiarity = reputation?.familiarity ?? 0;
  const label = expertiseLabel(familiarity);
  const badgeVariant = expertiseBadgeVariant(familiarity);

  return (
    <Card
      className={
        isCurrentLocation
          ? "border-blue-500/40 bg-blue-500/5"
          : "border-[#27272a] bg-[#141414]"
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm text-white">
            <Globe size={15} className="shrink-0 text-zinc-400" aria-hidden="true" />
            {meta.name}
          </CardTitle>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {isHome && (
              <Badge variant="secondary" className="text-[10px]">
                Home
              </Badge>
            )}
            {isCurrentLocation && (
              <Badge variant="success" className="text-[10px]">
                Currently Here
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Familiarity bar */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Familiarity</span>
            <div className="flex items-center gap-1.5">
              <Badge variant={badgeVariant} className="text-[10px]">
                {label}
              </Badge>
              <span className="text-zinc-400">{familiarity}/100</span>
            </div>
          </div>
          <Progress
            value={familiarity}
            max={100}
            className="h-1.5"
            indicatorClassName={expertiseColor(familiarity)}
          />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-zinc-800/60 px-3 py-2">
            <p className="text-zinc-500">Leagues</p>
            <p className="font-semibold text-white">{meta.leagueCount}</p>
          </div>
          <div className="rounded-md bg-zinc-800/60 px-3 py-2">
            <p className="text-zinc-500">Clubs</p>
            <p className="font-semibold text-white">{meta.clubCount}</p>
          </div>
        </div>

        {/* Scouting history (only shown once the scout has activity there) */}
        {reputation && (reputation.reportsSubmitted > 0 || reputation.successfulFinds > 0) && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Star size={11} className="text-amber-400" aria-hidden="true" />
              <span>{reputation.successfulFinds} finds</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-400">
              <MapPin size={11} className="text-blue-400" aria-hidden="true" />
              <span>{reputation.reportsSubmitted} reports</span>
            </div>
          </div>
        )}

        {/* Action */}
        {!isCurrentLocation && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={onBookTravel}
            disabled={hasActiveBooking}
            aria-label={`Book travel to ${meta.name}`}
          >
            <Plane size={13} className="mr-1.5" aria-hidden="true" />
            {hasActiveBooking ? "Booking Active" : "Book Travel"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function InternationalScreen() {
  const { gameState, bookInternationalTravel } = useGameStore();
  const { playSFX } = useAudio();
  const countryCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  if (!gameState) return null;

  const { scout, countries, currentWeek } = gameState;
  const booking: TravelBooking | undefined = scout.travelBooking;

  // Derive "currently here" country from an active abroad booking
  const currentCountry: string | null =
    booking?.isAbroad === true ? booking.destinationCountry : null;

  // Home country: the first country in the list (set at game creation)
  const homeCountry = countries[0] ?? null;

  const hasActiveBooking = booking !== undefined;

  // Status subtitle
  const statusLine = currentCountry
    ? `Currently scouting in ${getCountryMeta(currentCountry).name}`
    : booking
      ? `Travel to ${getCountryMeta(booking.destinationCountry).name} booked — departing week ${booking.departureWeek}`
      : "Based at home — book travel to scout abroad";

  // Build familiarity levels map from scout.countryReputations
  const familiarityLevels: Record<string, number> = {};
  for (const [key, rep] of Object.entries(scout.countryReputations)) {
    familiarityLevels[key] = rep.familiarity;
  }

  // Handle map country click: scroll to that country's card and briefly highlight
  const handleMapCountryClick = (countryKey: string) => {
    const el = countryCardRefs.current[countryKey];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
  };

  return (
    <GameLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Globe size={22} className="text-blue-400" aria-hidden="true" />
            International Scouting
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-400">
            <MapPin size={13} aria-hidden="true" />
            {statusLine}
          </p>
        </div>

        {/* Active booking banner */}
        {booking && (
          <div className="mb-6">
            <ActiveBookingPanel booking={booking} currentWeek={currentWeek} />
          </div>
        )}

        {/* World Map */}
        {countries.length > 0 && (
          <div className="mb-6">
            <WorldMap
              countries={countries}
              familiarityLevels={familiarityLevels}
              currentLocation={currentCountry ?? undefined}
              onCountryClick={handleMapCountryClick}
            />
          </div>
        )}

        {/* Country grid */}
        {countries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Globe size={40} className="mb-4 text-zinc-700" aria-hidden="true" />
            <p className="text-sm text-zinc-500">No countries active in this game world.</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Available Countries ({countries.length})
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {countries.map((countryKey) => {
                const reputation: CountryReputation | undefined =
                  scout.countryReputations[countryKey];
                const isHome = countryKey === homeCountry;
                const isCurrentLocation = countryKey === currentCountry;

                return (
                  <div
                    key={countryKey}
                    ref={(el) => {
                      countryCardRefs.current[countryKey] = el;
                    }}
                    tabIndex={-1}
                    className="outline-none focus:ring-2 focus:ring-emerald-500 rounded-lg"
                  >
                    <CountryCard
                      countryKey={countryKey}
                      reputation={reputation}
                      isHome={isHome}
                      isCurrentLocation={isCurrentLocation}
                      hasActiveBooking={hasActiveBooking}
                      onBookTravel={() => { playSFX("travel"); bookInternationalTravel(countryKey); }}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </GameLayout>
  );
}
