"use client";

import type { GameState } from "@/engine/core/types";
import { portraitCheckpoint } from "@/engine/players/portraits/identity";
import { resolvePlayerEntity } from "@/lib/playerResolution";
import { useGameStore } from "@/stores/gameStore";
import { PlayerAvatar } from "./PlayerAvatar";

interface RecordedDate { season: number; week?: number }
interface RecordedAge extends RecordedDate { age: number }
export interface PlayerAgeTimelineInput {
  currentDate: RecordedDate;
  currentAge?: number;
  retired: boolean;
  hasPortraitBinding: boolean;
  firstPortrait?: RecordedAge;
  discovery?: RecordedDate;
  snapshots: readonly RecordedAge[];
}
export interface PlayerAgeFrame {
  age: number;
  label: "First portrait record" | "Career record" | "Now" | "Last recorded";
  date?: RecordedDate;
}
export interface PlayerAgeTimelineModel {
  frames: PlayerAgeFrame[];
  firstPortrait?: RecordedAge;
  discovery?: RecordedDate;
  hasAgeProgression: boolean;
}

function validDate(date: RecordedDate): boolean {
  return Number.isInteger(date.season) && date.season > 0
    && (date.week === undefined || (Number.isInteger(date.week) && date.week > 0));
}
function reached(date: RecordedDate, now: RecordedDate): boolean {
  return validDate(date) && (date.season < now.season
    || (date.season === now.season && (date.week ?? 0) <= (now.week ?? 0)));
}
function validAge(age: number | undefined): age is number {
  return age !== undefined && Number.isInteger(age) && age >= 0 && age <= 100;
}

/** Uses recorded ages only. No birthday inference, future previews or post-retirement aging. */
export function buildPlayerAgeTimeline(input: PlayerAgeTimelineInput): PlayerAgeTimelineModel | null {
  if (!input.hasPortraitBinding) return null;
  const snapshots = input.snapshots.filter((record) =>
    validAge(record.age) && reached(record, input.currentDate),
  ).sort((left, right) => left.season - right.season || (left.week ?? 0) - (right.week ?? 0));
  const firstPortrait = input.firstPortrait && validAge(input.firstPortrait.age)
    && reached(input.firstPortrait, input.currentDate) ? input.firstPortrait : undefined;
  const latestSnapshot = snapshots.at(-1);
  // A photo reservation may be newer than the final retained season snapshot.
  // Use the newest recorded season, then the reached age within that season.
  const latestRecord = [...snapshots, ...(firstPortrait ? [firstPortrait] : [])]
    .sort((left, right) => right.season - left.season || right.age - left.age
      || (right.week ?? 0) - (left.week ?? 0))[0];
  const currentAge = validAge(input.currentAge) ? input.currentAge : latestRecord?.age;
  if (currentAge === undefined) return null;
  const validFirstPortrait = firstPortrait && firstPortrait.age <= currentAge ? firstPortrait : undefined;
  const prior: PlayerAgeFrame[] = snapshots.filter((record) => record.age < currentAge)
    .map((record) => ({ age: record.age, label: "Career record", date: record }));
  if (validFirstPortrait && validFirstPortrait.age < currentAge) {
    prior.push({ age: validFirstPortrait.age, label: "First portrait record", date: validFirstPortrait });
  }
  prior.sort((left, right) => left.age - right.age
    || (left.label === "First portrait record" ? -1 : right.label === "First portrait record" ? 1 : 0));
  // Keep one image per reached visual age; adjacent birthdays may use the same checkpoint.
  const frames = new Map<number, PlayerAgeFrame>();
  for (const frame of prior) {
    const checkpoint = portraitCheckpoint(frame.age);
    if (!frames.has(checkpoint)) frames.set(checkpoint, frame);
  }
  const latestDate = latestSnapshot?.age === currentAge ? latestSnapshot
    : validFirstPortrait?.age === currentAge ? validFirstPortrait : undefined;
  frames.set(portraitCheckpoint(currentAge), {
    age: currentAge,
    label: !input.retired && validAge(input.currentAge) ? "Now" : "Last recorded",
    date: !input.retired && validAge(input.currentAge) ? input.currentDate : latestDate,
  });
  const ordered = [...frames.values()].sort((left, right) => left.age - right.age);
  return {
    frames: ordered,
    firstPortrait: validFirstPortrait,
    discovery: input.discovery && reached(input.discovery, input.currentDate) ? input.discovery : undefined,
    hasAgeProgression: ordered.length > 1,
  };
}

/** Store projection is read-only, including when the full Player is no longer retained. */
export function selectPlayerAgeTimeline(state: GameState, entityId: string): PlayerAgeTimelineModel | null {
  const resolved = resolvePlayerEntity(state, entityId);
  const playerId = resolved?.player.id ?? entityId;
  const reservation = state.playerPortraits?.reservations["person:v1:" + playerId];
  const discoveries = (state.discoveryRecords ?? []).filter((record) => record.playerId === playerId);
  const alumni = (state.alumniRecords ?? []).filter((record) => record.playerId === playerId);
  const discovery = discoveries.slice().sort((left, right) =>
    left.discoveredSeason - right.discoveredSeason || left.discoveredWeek - right.discoveredWeek,
  )[0];
  return buildPlayerAgeTimeline({
    currentDate: { season: state.currentSeason, week: state.currentWeek },
    currentAge: resolved?.player.age,
    retired: Boolean(resolved?.isRetired || alumni.some((record) => record.currentStatus === "retired")
      || discoveries.some((record) => record.careerOutcome === "retired")),
    hasPortraitBinding: Boolean(reservation?.binding),
    firstPortrait: reservation?.firstSeenAge === undefined ? undefined : {
      ...reservation.firstSeen, age: reservation.firstSeenAge,
    },
    discovery: discovery ? { season: discovery.discoveredSeason, week: discovery.discoveredWeek } : undefined,
    snapshots: [...discoveries, ...alumni].flatMap((record) => record.careerSnapshots),
  });
}

function formatDate(date: RecordedDate): string {
  return `Season ${date.season}${date.week === undefined ? "" : ` · Week ${date.week}`}`;
}

export function PlayerAgeTimeline({ playerId, compact = false, className = "" }: {
  playerId: string;
  compact?: boolean;
  className?: string;
}) {
  const state = useGameStore((store) => store.gameState);
  const model = state ? selectPlayerAgeTimeline(state, playerId) : null;
  if (!model || (compact && !model.hasAgeProgression)) return null;
  const frames = compact ? [model.frames[0]!, model.frames.at(-1)!] : model.frames;
  return (
    <section aria-label="Player photographs through the years" className={`min-w-0 ${className}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
        <h3 className="text-sm font-semibold text-zinc-100">Through the years</h3>
        {!compact && model.discovery && (
          <p className="text-xs text-zinc-400">Discovered by you · {formatDate(model.discovery)}</p>
        )}
      </div>
      <ol className={`grid gap-x-4 gap-y-6 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"}`}>
        {frames.map((frame) => (
          <li key={frame.age} className="min-w-0">
            <PlayerAvatar playerId={playerId} atAge={frame.age} size={compact ? 88 : 112}
              className="max-w-full" />
            <p className="mt-2 text-sm font-semibold text-zinc-100">Age {frame.age}</p>
            <p className="mt-0.5 text-xs text-zinc-400">{frame.label}</p>
            {frame.date && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{formatDate(frame.date)}</p>}
          </li>
        ))}
      </ol>
      {!compact && model.firstPortrait && (
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          First portrait record: age {model.firstPortrait.age} · {formatDate(model.firstPortrait)}.
        </p>
      )}
    </section>
  );
}
