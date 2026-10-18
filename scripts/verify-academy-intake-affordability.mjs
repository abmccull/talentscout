import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "vite";
import assert from "node:assert/strict";

const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) throw new Error("Provide a checkpoint and a distinct new report path");
const raw = await readFile(input);
const state = JSON.parse(raw).gameState;
assert.equal(state.currentWeek, 1, "Use a season-boundary checkpoint");
const original = JSON.stringify(state);
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { buildClubAffordabilityContext } = await server.ssrLoadModule("/src/engine/finance/clubEconomics.ts");
  const { limitAcademyIntakeToClubCapacity } = await server.ssrLoadModule("/src/engine/youth/generation.ts");
  const intake = Object.values(state.players).filter(p => p.id.startsWith("academy_") && p.id.includes(`_s${state.currentSeason}_`));
  const intakeIds = new Set(intake.map(p => p.id));
  const players = Object.fromEntries(Object.entries(state.players).filter(([id]) => !intakeIds.has(id)));
  const clubs = Object.fromEntries(Object.entries(state.clubs).map(([id, club]) => [id, {
    ...club, playerIds: club.playerIds.filter(id => !intakeIds.has(id)),
    academyPlayerIds: (club.academyPlayerIds ?? []).filter(id => !intakeIds.has(id)),
  }]));
  const context = buildClubAffordabilityContext(clubs, players, state);
  const rows = Object.values(clubs).map(club => {
    const candidates = intake.filter(p => p.clubId === club.id);
    const headroom = context[club.id].club.weeklyWageBudget - context[club.id].currentWeeklyCommitment;
    const accepted = limitAcademyIntakeToClubCapacity(club, candidates, headroom);
    const wages = list => list.reduce((sum, p) => sum + (p.wage ?? 0), 0);
    return { clubId: club.id, name: club.name, beforeIntakeHeadroom: headroom,
      originalIntakeWages: wages(candidates), admittedIntakeWages: wages(accepted),
      originalOverrun: Math.max(0, wages(candidates) - headroom),
      admittedOverrun: Math.max(0, wages(accepted) - headroom),
      originalIntakeCount: candidates.length, admittedIntakeCount: accepted.length };
  });
  assert.equal(JSON.stringify(state), original);
  const report = { scope: "Isolated admission counterfactual on retained season-start intake; not a canonical replay or a rewrite of existing contracts.",
    sourceSha256: createHash("sha256").update(raw).digest("hex"), season: state.currentSeason,
    sourceUnchanged: true, clubsOriginallyOver: rows.filter(r => r.originalOverrun > 0).length,
    clubsOverAfterAdmission: rows.filter(r => r.admittedOverrun > 0).length,
    affected: rows.filter(r => r.originalOverrun > 0 || r.originalIntakeCount !== r.admittedIntakeCount) };
  await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" });
  console.log(JSON.stringify(report));
} finally { await server.close(); }
