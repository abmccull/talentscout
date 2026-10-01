import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormPerformanceCard } from "@/components/game/player-profile/PlayerProfileHistoryCards";
import { compactSeasonRating } from "@/engine/players/seasonRatingArchive";
import type { Player } from "@/engine/core/types";

describe("player season history rendering", () => {
  it("renders identical visible history for legacy, compact and mixed-format saved records", () => {
    const seasons = Array.from({ length: 30 }, (_, index) => ({ season: index + 1,
      avgRating: 6 + index / 20, appearances: 20 + index, goals: index,
      assists: index + 1, cleanSheets: index % 4 }));
    const player = { form: 1, recentMatchRatings: [], seasonRatings: seasons } as unknown as Player;
    const render = (subject: Player) => renderToStaticMarkup(createElement(FormPerformanceCard, { player: subject }));
    const expected = render(player);
    for (const archived of [seasons.map(compactSeasonRating), seasons.map((record, index) => index % 2 ? compactSeasonRating(record) : record)]) {
      expect(render({ ...player, seasonRatings: JSON.parse(JSON.stringify(archived)) })).toBe(expected);
    }
    expect(expected).toContain("Season History");
    expect(expected.match(/scope="row"/g)).toHaveLength(30);
    expect(expected.match(/scope="col"/g)).toHaveLength(6);
    expect(expected).toContain("Season performance history</caption>");
    expect(expected).toContain('aria-label="Appearances"');
    expect(expected).toContain("49");
    expect(expected).not.toContain("NaN");
  });
});
