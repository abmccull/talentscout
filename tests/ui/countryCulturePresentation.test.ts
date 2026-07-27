import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildCountryCulturePresentation,
  formatCultureContextLabel,
} from "@/components/game/world/countryCulturePresentation";
import type { GameState } from "@/engine/core/types";
import { buildCulturalCalendarKey } from "@/engine/world/culturalCalendarState";
import { createCountrySeasonCalendar } from "@/engine/world/footballCultureCalendar";

const SOURCE_ROOT = fileURLToPath(new URL("../../src/", import.meta.url));

function source(relativePath: string): string {
  return readFileSync(`${SOURCE_ROOT}${relativePath}`, "utf8");
}

function stateWithStoredEnglandWindow() {
  const generated = createCountrySeasonCalendar("england", 4, {
    weeksPerSeason: 38,
    rootSeed: "stored-career-seed",
    activeWorldConditionIds: ["stored-world-condition"],
  });
  const storedWindow = {
    ...generated.windows[0],
    label: "Stored regional youth circuit",
    startWeek: 22,
    endWeek: 24,
    contextTags: ["stored-comparison-circuit"],
    reasons: ["The stored circuit creates repeated game states across comparable opposition."],
    biasWarnings: ["One showcase performance still needs a second live view."],
  };
  const storedCalendar = {
    ...generated,
    windows: [storedWindow],
  };

  return {
    countries: ["england"],
    currentSeason: 4,
    currentWeek: 23,
    fixtures: {} as GameState["fixtures"],
    runManifest: { rootSeed: "a-different-live-seed" } as GameState["runManifest"],
    culturalCalendarState: {
      version: 1 as const,
      calendars: {
        [buildCulturalCalendarKey("england", 4)]: storedCalendar,
      },
    },
  } satisfies Pick<
    GameState,
    | "countries"
    | "currentSeason"
    | "currentWeek"
    | "fixtures"
    | "runManifest"
    | "worldConditionState"
    | "culturalCalendarState"
  >;
}

describe("countryCulturePresentation", () => {
  it("uses the stored country-season window and keeps the output player-safe", () => {
    const presentation = buildCountryCulturePresentation(
      stateWithStoredEnglandWindow(),
      "england",
    );

    expect(presentation).not.toBeNull();
    expect(presentation?.cues).toHaveLength(3);
    expect(presentation?.cues.map((cue) => cue.label)).toEqual([
      "Institution",
      "Pathway",
      "Access and evidence",
    ]);
    expect(presentation?.activeWindows).toEqual([
      expect.objectContaining({
        label: "Stored regional youth circuit",
        weekRange: "Weeks 22-24",
      }),
    ]);
    expect(presentation?.contextLabels).toEqual(["Stored comparison circuit"]);
    expect(presentation?.reasons).toEqual([
      "The stored circuit creates repeated game states across comparable opposition.",
    ]);
    expect(presentation?.evidenceWarnings).toEqual([
      "One showcase performance still needs a second live view.",
    ]);

    const serialized = JSON.stringify(presentation);
    expect(serialized).not.toMatch(
      /signalByDomain|uncertaintyMultiplier|misleadingSignalRiskDelta|generationKey|rootSeed|hidden/i,
    );
  });

  it("does not invent an explicit playbook for an unauthored market", () => {
    expect(buildCountryCulturePresentation(stateWithStoredEnglandWindow(), "iceland"))
      .toBeNull();
    expect(formatCultureContextLabel("academy_festival-band"))
      .toBe("Academy festival band");
  });

  it("wires the World popup with semantic headings and no engine-only evidence fields", () => {
    const internationalScreen = source("components/game/InternationalScreen.tsx");
    const countryPopup = source("components/game/CountryPopup.tsx");

    expect(internationalScreen).toContain(
      "buildCountryCulturePresentation(gameState, selectedCountry)",
    );
    expect(internationalScreen).toContain("culture={selectedCulture}");
    expect(countryPopup).toContain("aria-labelledby={cultureTitleId}");
    expect(countryPopup).toContain("<h4");
    expect(countryPopup).toContain("<h5");
    expect(countryPopup).toContain("overflow-y-auto");
    expect(countryPopup).not.toMatch(
      /culture\.(signalByDomain|uncertaintyMultiplier|misleadingSignalRiskDelta|generationKey|rootSeed)/,
    );
  });
});
