/**
 * Steam Rich Presence helpers.
 *
 * Translates the current in-game screen + context into Steam Rich Presence
 * key/value pairs.  The display strings are defined in
 * `electron/rich_presence.vdf` — the keys here must match the tokens there.
 *
 * This module deliberately accepts plain primitive data rather than importing
 * the full GameState or GameStore to avoid circular-import issues.
 */

import { getSteam } from "./steamInterface";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RichPresenceContext {
  /** The country the scout is currently operating in (e.g. "England"). */
  currentCountry?: string;
  /** Current season year, e.g. 2024. */
  currentSeason?: number;
  /** Current week within the season, typically 1–38. */
  currentWeek?: number;
  /**
   * Match fixture label shown while watching a game.
   * Expected format: "Home FC vs Away FC".
   */
  matchFixture?: string;
  /** Active scenario ID, if any. */
  activeScenarioId?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Update Steam Rich Presence to reflect the current screen and game context.
 *
 * All key/value pairs are fire-and-forget; failures are silently swallowed
 * by the underlying ElectronSteamInterface.
 *
 * @param screen  - The current GameScreen value (string union).
 * @param context - Relevant bits of GameState needed for presence strings.
 */
export function updateRichPresence(
  screen: string,
  context: RichPresenceContext
): void {
  const steam = getSteam();

  // Resolve the display token based on the current screen.
  const steamDisplay = resolveDisplayToken(screen);
  steam.setRichPresence("steam_display", steamDisplay);

  // Screen-specific keys.
  if (
    (screen === "dashboard" || screen === "calendar") &&
    context.currentCountry
  ) {
    steam.setRichPresence("country", context.currentCountry);
  }

  if (screen === "match" && context.matchFixture) {
    steam.setRichPresence("fixture", context.matchFixture);
  }

  // Always-present keys.
  steam.setRichPresence(
    "season",
    context.currentSeason !== undefined ? String(context.currentSeason) : ""
  );
  steam.setRichPresence(
    "week",
    context.currentWeek !== undefined ? String(context.currentWeek) : ""
  );

  // Group players by country so friends in the same country appear together.
  if (context.currentCountry) {
    steam.setRichPresence("steam_player_group", context.currentCountry);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveDisplayToken(screen: string): string {
  switch (screen) {
    case "dashboard":
    case "calendar":
      return "#StatusScouting";
    case "match":
      return "#StatusWatching";
    case "reportWriter":
      return "#StatusReporting";
    default:
      return "#StatusPlaying";
  }
}
