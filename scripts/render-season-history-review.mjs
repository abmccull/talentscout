import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { createServer } from "vite";

const output = resolve("artifacts/quality-first-week/history-review");
await mkdir(output, { recursive: true });
const cssPath = resolve("src/app/globals.css");
const css = await postcss([tailwind({ base: process.cwd() })]).process(await readFile(cssPath, "utf8"), { from: cssPath });
await writeFile(resolve(output, "game.css"), css.css);
const server = await createServer({ configFile: false, oxc: { jsx: { runtime: "automatic" } },
  server: { middlewareMode: true }, resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { FormPerformanceCard } = await server.ssrLoadModule("/src/components/game/player-profile/PlayerProfileHistoryCards.tsx");
  const { compactSeasonRating } = await server.ssrLoadModule("/src/engine/players/seasonRatingArchive.ts");
  const seasonRatings = Array.from({ length: 30 }, (_, index) => compactSeasonRating({ season: index + 1,
    avgRating: 6 + index / 20, appearances: 20 + index, goals: index, assists: index + 1, cleanSheets: index % 4 }));
  const markup = renderToStaticMarkup(createElement(FormPerformanceCard, { player: { form: 1, recentMatchRatings: [], seasonRatings } }));
  await writeFile(resolve(output, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Season history component review</title><link rel="stylesheet" href="game.css"></head><body style="margin:0;padding:24px;font-family:Arial,sans-serif"><h1 style="font-size:20px;margin-bottom:12px">Season history component review</h1><p style="margin-bottom:20px">Synthetic 30-season records. Actual FormPerformanceCard and compiled game CSS. No career save is loaded.</p><main style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start"><section style="width:600px;max-width:100%" aria-label="Wide history panel">${markup}</section><section style="width:288px;max-width:100%" aria-label="Narrow history panel">${markup}</section></main></body></html>`);
  console.log(JSON.stringify({ output, rowsPerTable: seasonRatings.length, component: "FormPerformanceCard", styles: cssPath }));
} finally { await server.close(); }
// This one-shot preview owns no service; release Tailwind/Vite worker handles.
process.exit(0);
