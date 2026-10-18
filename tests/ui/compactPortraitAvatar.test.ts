import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GameState, Player } from "@/engine/core/types";
import { createVisualIdentity } from "@/engine/players/portraits/identity";
import { revealGamePortraits } from "@/engine/players/portraits/gameIntegration";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { YouthPortrait } from "@/components/game/YouthPortrait";

const runtime = vi.hoisted(() => ({ gameState: null as GameState | null }));
vi.mock("@/stores/gameStore", () => ({
  useGameStore: (selector: (state: typeof runtime) => unknown) => selector(runtime),
}));

describe("saved compact portrait identity in the actual avatar", () => {
  it.each(["players", "retiredPlayers", "unsignedYouth"] as const)(
    "renders the same bound photograph and historical age from %s after JSON restoration",
    (collection) => {
      const player = {
        id: "canon-person-portrait-retention", firstName: "Ari", lastName: "Prospect",
        age: 27, visualIdentity: createVisualIdentity("canon-person-portrait-retention"),
      } as Player;
      const entityId = collection === "unsignedYouth" ? "opportunity-alias" : player.id;
      const source = {
        currentSeason: 19, currentWeek: 1, players: {}, retiredPlayers: {}, unsignedYouth: {},
        [collection]: collection === "unsignedYouth"
          ? { [entityId]: { id: entityId, player } } : { [entityId]: player },
      } as unknown as GameState;
      const seen = revealGamePortraits(source, [entityId], "selected");
      expect(seen.playerPortraits!.reservations["person:v1:" + player.id]!.binding).toBeDefined();
      runtime.gameState = seen;
      const render = (atAge: number) => renderToStaticMarkup(createElement(PlayerAvatar, {
        playerId: entityId, atAge, size: 64,
      }));
      const before = [render(18), render(39)];
      for (const markup of before) {
        expect(markup).toContain('data-portrait-status="available"');
        expect(markup).toContain('data-portrait-identity="person:v1:' + player.id + '"');
      }
      const restored = JSON.parse(JSON.stringify(seen)) as GameState;
      const subject = collection === "unsignedYouth"
        ? restored.unsignedYouth[entityId]!.player : restored[collection][entityId]!;
      subject.visualIdentity = { version: 1 } as Player["visualIdentity"];
      const savedLedger = JSON.stringify(restored.playerPortraits);
      runtime.gameState = restored;
      expect([render(18), render(39)]).toEqual(before);
      expect(JSON.stringify(restored.playerPortraits)).toBe(savedLedger);
      expect(subject.visualIdentity).toEqual({ version: 1 });
    },
  );

  it("continues to render a pruned player's retained reservation without rebuilding a face", () => {
    const player = {
      id: "archived-portrait-person", firstName: "Theo", lastName: "Jackson", age: 27,
      visualIdentity: createVisualIdentity("archived-portrait-person"),
    } as Player;
    const seen = revealGamePortraits({
      currentSeason: 19, currentWeek: 1, players: { [player.id]: player },
      retiredPlayers: {}, unsignedYouth: {},
    } as unknown as GameState, [player.id], "selected");
    runtime.gameState = { ...seen, players: {} };
    const before = JSON.stringify(runtime.gameState);
    const markup = renderToStaticMarkup(createElement(PlayerAvatar, { playerId: player.id, atAge: 39 }));
    expect(markup).toContain('data-portrait-status="available"');
    expect(markup).toContain('data-portrait-identity="person:v1:' + player.id + '"');
    expect(JSON.stringify(runtime.gameState)).toBe(before);
  });
});


describe("shared youth portrait identity presentation", () => {
  it("uses the canonical adult age and exact requested size when callers omit age", () => {
    const player = { id: "grown-academy-player", firstName: "Ari", lastName: "Reed", age: 35,
      visualIdentity: { version: 1 } } as Player;
    const seen = revealGamePortraits({ currentSeason: 20, currentWeek: 1, players: { [player.id]: player },
      retiredPlayers: {}, unsignedYouth: {} } as unknown as GameState, [player.id], "selected");
    runtime.gameState = seen;
    const before = JSON.stringify(seen);
    const markup = renderToStaticMarkup(createElement(YouthPortrait, { playerId: player.id, size: 32 }));
    expect(markup).toContain('data-portrait-age="35"');
    expect(markup).toContain('--portrait-size:32px');
    expect(markup).toContain('width="32"');
    expect(markup).toContain('data-portrait-status="available"');
    const historical = renderToStaticMarkup(createElement(YouthPortrait, { playerId: player.id, age: 35, atAge: 18, size: 32 }));
    expect(historical).toContain('data-portrait-age="18"');
    expect(JSON.stringify(seen)).toBe(before);
    expect(player.visualIdentity).toEqual({ version: 1 });
  });
});
