import { createServer } from "vite";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
const output = process.argv[2];
if (!output) throw new Error("Supply new report path");
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { RNG } = await server.ssrLoadModule("/src/engine/rng/index.ts");
  const { estimatePlayerWeeklyWage } = await server.ssrLoadModule("/src/engine/players/wages.ts");
  const { generateAcademyIntake } = await server.ssrLoadModule("/src/engine/youth/generation.ts");
  const { ENGLAND_DATA } = await server.ssrLoadModule("/src/data/england.ts");
  const { computeSemanticPlayerDevelopment, computeSemanticBreakthrough } = await server.ssrLoadModule("/src/engine/players/development.ts");
  const { applyWeeklyPlayerProgression } = await server.ssrLoadModule("/src/engine/core/weekly/stateApplication.ts");
  const stats = values => { const s = values.toSorted((a,b) => a-b); return { count:s.length,
    min:s[0]??null, median:s[Math.floor((s.length-1)/2)]??null, max:s.at(-1)??null }; };
  const intake = [];
  for (let seed = 0; seed < 60; seed++) {
    intake.push(...generateAcademyIntake(new RNG(`readiness-${seed}`), {
      id:`academy-${seed}`, reputation:70, youthAcademyRating:18,
    }, ENGLAND_DATA, 2));
  }
  const prospects = intake.filter(player => player.potentialAbility >= 150);
  const cohorts = [];
  for (const support of [0.85, 1, 1.15]) {
    const rows = prospects.map(original => {
      let player = { ...original, form: 0, formMomentum: 0, formTrend: "stable" };
      const rng = new RNG(`readiness-development-${original.id}`);
      const yearly = [];
      for (let age = player.age; age <= 26; age++) {
        player = { ...player, age };
        for (let week = 1; week <= 46; week++) {
          const mechanics = { growthChanceMultiplier:support, growthQualityMultiplier:support,
            breakthroughMultiplier:support, declineRiskMultiplier:1 };
          const development = computeSemanticPlayerDevelopment(player, rng, 1, mechanics);
          const breakthrough = computeSemanticBreakthrough(player, rng, support);
          player = applyWeeklyPlayerProgression({ players:{[player.id]:player}, currentSeason:age-original.age+2, currentWeek:week },
            { playerDevelopment:[development], breakthroughs:breakthrough?[breakthrough]:[], injurySetbacks:[] },
            (value,min,max)=>Math.max(min,Math.min(max,value)))[player.id];
        }
        yearly.push({ age, ability:player.currentAbility });
      }
      return { id:player.id, initialAge:original.age, initialAbility:original.currentAbility,
        potential:player.potentialAbility, finalAbility:player.currentAbility, profile:player.developmentProfile, yearly };
    });
    cohorts.push({ support, finalAbility:stats(rows.map(row=>row.finalAbility)),
      reached150:rows.filter(row=>row.finalAbility>=150).length,
      reachedPotential:rows.filter(row=>row.finalAbility>=row.potential).length, rows });
  }
  const report = { scope:"Sixty rating18 academy intakes; PA150+ prospects followed through end of age26 using actual development and state application. Constant neutral form (therefore no breakthroughs), fixed environment, no injuries, club moves, selection or retirement. Isolated readiness calibration, not canonical world balance.",
    allIntake:stats(intake.map(player=>player.currentAbility)),
    registrationWages:stats(intake.map(player=>player.wage)),
    combinedWeeklyAcademyWages:intake.reduce((sum,player)=>sum+player.wage,0),
    combinedSeniorScaleCounterfactual:intake.reduce((sum,player)=>sum+estimatePlayerWeeklyWage(player.currentAbility,70),0),
    highPotentialIntake:stats(prospects.map(player=>player.currentAbility)),
    byAge:[14,15,16].map(age=>({age,ability:stats(prospects.filter(player=>player.age===age).map(player=>player.currentAbility))})), cohorts };
  await writeFile(output, JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({...report,cohorts:cohorts.map(({rows,...summary})=>summary)},null,2));
} finally { await server.close(); }
