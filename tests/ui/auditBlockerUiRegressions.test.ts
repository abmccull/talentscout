import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { GameTerm } from "@/components/ui/GameTerm";
import { InsightPayoff } from "@/components/game/InsightPayoff";
import { isInteractiveControl } from "@/lib/useKeyboardNav";
import { migrateSaveState } from "@/lib/db";
import { useGameStore } from "@/stores/gameStore";

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), "tests/fixtures/saves/v0-save-record.json"), "utf8"),
) as { state: Record<string, unknown> };

function makeElement(tagName: string, role?: string): Element {
  return {
    tagName,
    getAttribute: (name: string) => (name === "role" ? (role ?? null) : null),
  } as unknown as Element;
}

afterEach(() => {
  useGameStore.setState({
    gameState: null,
    saveConflict: null,
    isResolvingSaveConflict: false,
  });
});

describe("audit P0 UI, keyboard, and accessibility regressions", () => {
  it("guards Spacebar shortcut against focused interactive controls", () => {
    expect(isInteractiveControl(makeElement("BUTTON"))).toBe(true);
    expect(isInteractiveControl(makeElement("A"))).toBe(true);
    expect(isInteractiveControl(makeElement("SUMMARY"))).toBe(true);
    expect(isInteractiveControl(makeElement("DIV", "button"))).toBe(true);
    expect(isInteractiveControl(makeElement("DIV", "tab"))).toBe(true);
    expect(isInteractiveControl(makeElement("SPAN", "switch"))).toBe(true);
    expect(isInteractiveControl(makeElement("BODY"))).toBe(false);
    expect(isInteractiveControl(makeElement("MAIN"))).toBe(false);
    expect(isInteractiveControl(null)).toBe(false);
  });

  it("renders GameTerm cleanly for both valid and unknown concept keys without violating Rules of Hooks", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/ui/GameTerm.tsx"), "utf8");
    expect(source).not.toContain("eslint-disable-next-line react-hooks/rules-of-hooks");

    const unknownMarkup = renderToStaticMarkup(
      React.createElement(GameTerm, { conceptKey: "nonexistent-concept" }, "Fallback Term"),
    );
    expect(unknownMarkup).toContain("Fallback Term");

    const validMarkup = renderToStaticMarkup(
      React.createElement(GameTerm, { conceptKey: "reputation" }, "Reputation"),
    );
    expect(validMarkup).toContain("Reputation");
  });

  it("resolves discovered prospect player name instead of showing a raw player ID in InsightPayoff", () => {
    const state = migrateSaveState(fixture.state);
    const playerId = "youth_discovered_99";
    state.players[playerId] = {
      id: playerId,
      firstName: "Callum",
      lastName: "Bramwell",
    } as (typeof state.players)[string];

    useGameStore.setState({ gameState: state });

    const html = renderToStaticMarkup(
      React.createElement(InsightPayoff, {
        actionName: "Diamond in the Rough",
        gameState: state,
        result: {
          actionId: "diamondInTheRough",
          success: true,
          narrative: "Hidden gem surfaced",
          discoveredPlayerId: playerId,
        },
        onDismiss: () => undefined,
      }),
    );

    expect(html).toContain("Callum Bramwell");
    expect(html).not.toContain(playerId);

    const fallbackHtml = renderToStaticMarkup(
      React.createElement(InsightPayoff, {
        actionName: "Diamond in the Rough",
        result: {
          actionId: "diamondInTheRough",
          success: true,
          narrative: "Hidden gem surfaced",
          discoveredPlayerId: playerId,
        },
        onDismiss: () => undefined,
      }),
    );

    expect(fallbackHtml).toContain("Unknown Player");
    expect(fallbackHtml).not.toContain(playerId);
  });

  it("mounts WeekAdvanceConfirmDialog on the Youth Desk Dashboard path", () => {
    const dashboardSource = readFileSync(
      resolve(process.cwd(), "src/components/game/Dashboard.tsx"),
      "utf8",
    );
    const youthBranchStart = dashboardSource.indexOf("<YouthDeskDashboard");
    expect(youthBranchStart).toBeGreaterThan(-1);
    const youthBranch = dashboardSource.slice(youthBranchStart, youthBranchStart + 1400);
    expect(youthBranch).toContain("<YouthDeskDashboard");
    expect(youthBranch).toContain("<WeekAdvanceConfirmDialog");
  });

  it("removes duplicate Settings button and wires Save Conflict dialog in MainMenu", () => {
    const mainMenuSource = readFileSync(
      resolve(process.cwd(), "src/components/game/MainMenu.tsx"),
      "utf8",
    );
    expect(mainMenuSource).not.toContain("Settings as SettingsIcon");
    const settingsButtonMatches = mainMenuSource.match(/onClick=\{\(\) => setScreen\("settings"\)\}/g) ?? [];
    expect(settingsButtonMatches).toHaveLength(1);
    expect(mainMenuSource).toContain("Save Conflict Detected");
    expect(mainMenuSource).toContain("resolveSaveConflict");
    expect(mainMenuSource).toContain("dismissSaveConflict");
  });

  it("fixes high-contrast dark text override, reduced-motion loops, and MentorOverlay primary button contrast", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain('html.ui-contrast-high [class*="text-zinc-"]:not([class*="text-zinc-950"]):not([class*="text-zinc-900"]):not([class*="text-zinc-800"])');
    expect(css).toContain("animation-iteration-count: 1 !important;");

    const mentorSource = readFileSync(
      resolve(process.cwd(), "src/components/game/tutorial/MentorOverlay.tsx"),
      "utf8",
    );
    expect(mentorSource).not.toContain("text-[color:var(--primary-foreground)] text-white");
  });
});
