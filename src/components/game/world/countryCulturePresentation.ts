import type { GameState } from "@/engine/core/types";
import { resolveStateCountrySeasonCalendar } from "@/engine/world/culturalCalendarState";
import { resolvePersistedCountryCalendarEffects } from "@/engine/world/footballCultureCalendar";
import { getExplicitFootballCulturePlaybook } from "@/engine/world/footballCulturePlaybooks";

export interface CountryCultureCue {
  label: "Institution" | "Pathway" | "Access and evidence";
  text: string;
}

export interface ActiveCountryCultureWindow {
  id: string;
  label: string;
  weekRange: string;
}

export interface CountryCulturePresentation {
  countryName: string;
  season: number;
  week: number;
  cues: CountryCultureCue[];
  activeWindows: ActiveCountryCultureWindow[];
  contextLabels: string[];
  reasons: string[];
  evidenceWarnings: string[];
}

type CountryCultureState = Pick<
  GameState,
  | "countries"
  | "currentSeason"
  | "currentWeek"
  | "fixtures"
  | "runManifest"
  | "worldConditionState"
  | "culturalCalendarState"
>;

function joinCues(...values: Array<string | undefined>): string {
  return values
    .filter((value): value is string => !!value)
    .map((value) => value.trim())
    .join(" ");
}

export function formatCultureContextLabel(value: string): string {
  const normalized = value.trim().replace(/[-_]+/g, " ");
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatWindowWeekRange(
  startWeek: number,
  endWeek: number,
  weeksPerSeason: number,
): string {
  if (startWeek === endWeek) return `Week ${startWeek}`;
  if (startWeek < endWeek) return `Weeks ${startWeek}-${endWeek}`;
  return `Weeks ${startWeek}-${weeksPerSeason} / 1-${endWeek}`;
}

export function buildCountryCulturePresentation(
  state: CountryCultureState,
  countryId: string | undefined,
): CountryCulturePresentation | null {
  if (!countryId) return null;

  const playbook = getExplicitFootballCulturePlaybook(countryId);
  if (!playbook) return null;

  const calendar = resolveStateCountrySeasonCalendar(
    state,
    countryId,
    state.currentSeason,
  );
  const effects = resolvePersistedCountryCalendarEffects(calendar, state.currentWeek);
  const activeWindowIds = new Set(effects.activeWindowIds);
  const activeWindows = (calendar?.windows ?? [])
    .filter((window) => activeWindowIds.has(window.id))
    .map((window) => ({
      id: window.id,
      label: window.label,
      weekRange: formatWindowWeekRange(
        window.startWeek,
        window.endWeek,
        calendar?.weeksPerSeason ?? 38,
      ),
    }));
  const cues: CountryCultureCue[] = [
    {
      label: "Institution",
      text: playbook.notes.institutions[0] ?? "",
    },
    {
      label: "Pathway",
      text: playbook.notes.pathways[0] ?? "",
    },
    {
      label: "Access and evidence",
      text: joinCues(
        playbook.notes.accessPoints[0],
        playbook.notes.evidenceTraps[0],
      ),
    },
  ];

  return {
    countryName: playbook.displayName,
    season: calendar?.season ?? state.currentSeason,
    week: effects.week ?? state.currentWeek,
    cues: cues.filter((cue) => cue.text.length > 0),
    activeWindows,
    contextLabels: effects.contextTags
      .map(formatCultureContextLabel)
      .filter((label) => label.length > 0)
      .slice(0, 4),
    reasons: effects.reasons.slice(0, 2),
    evidenceWarnings: effects.biasWarnings.slice(0, 2),
  };
}
