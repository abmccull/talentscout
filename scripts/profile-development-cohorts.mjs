import { createServer } from "vite";
import { resolve, dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const output = process.argv[2];
if (!output) throw new Error("Supply a new diagnostic report path");
const supports = process.argv.includes("--include-poor") ? [0.6, 1, 1.25] : [1, 1.25];
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { generatePlayer } = await server.ssrLoadModule("/src/engine/players/generation.ts");
  const { RNG } = await server.ssrLoadModule("/src/engine/rng/index.ts");
  const { computeSemanticPlayerDevelopment, computeSemanticBreakthrough } = await server.ssrLoadModule("/src/engine/players/development.ts");
  const { applyWeeklyPlayerProgression } = await server.ssrLoadModule("/src/engine/core/weekly/stateApplication.ts");
  const groups = [];
  for (const profile of ["earlyBloomer", "steadyGrower", "lateBloomer", "volatile"]) {
    for (const support of supports) {
      const results = [];
      for (let index = 0; index < 25; index++) {
        const rng = new RNG(`development-cohort-${profile}-${index}`);
        let player = { ...generatePlayer(rng, { position: "CM", ageRange: [16,16], abilityRange: [50,50],
          nationality: "England", clubId: "diagnostic" }), potentialAbility: 180, developmentProfile: profile,
          form: 3, formTrend: "stable", formMomentum: 0 };
        let peakAbility = 50;
        const yearly = [];
        for (let age = 16; age <= 33; age++) {
          player = { ...player, age };
          for (let week = 1; week <= 46; week++) {
            const mechanics = { growthChanceMultiplier: support, growthQualityMultiplier: support,
              breakthroughMultiplier: support, declineRiskMultiplier: 1 };
            const development = computeSemanticPlayerDevelopment(player, rng, 1, mechanics);
            const breakthrough = computeSemanticBreakthrough(player, rng, support);
            player = applyWeeklyPlayerProgression({ players: { [player.id]: player }, currentSeason: age - 15, currentWeek: week },
              { playerDevelopment: [development], breakthroughs: breakthrough ? [breakthrough] : [], injurySetbacks: [] },
              (value, min, max) => Math.min(max, Math.max(min, value)))[player.id];
            peakAbility = Math.max(peakAbility, player.currentAbility);
          }
          yearly.push({ age, ability: player.currentAbility });
        }
        results.push({ index, peakAbility, yearly });
      }
      const peaks = results.map(result => result.peakAbility).sort((a,b) => a-b);
      groups.push({ profile, support, peakMedian: peaks[12], peakMax: peaks.at(-1),
        reached160: peaks.filter(value => value >= 160).length, results });
    }
  }
  const report = { scope: `Isolated current development and canonical state-application functions, ${100 * supports.length} CM prospects from age 16 CA50 PA180, 46 ticks/year through age33. Constant positive form, no injuries or retirement; growth environment multipliers ${supports.join("/")}. Not a canonical world or proof of achievable match minutes.`, groups };
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(groups.map(({results,...summary}) => summary), null, 2));
} finally { await server.close(); }
