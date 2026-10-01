import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { createServer } from "vite";
import assert from "node:assert/strict";
const [input, output] = process.argv.slice(2);
if (!input || !output || resolve(input) === resolve(output)) throw new Error("Provide source and new report paths");
const raw = await readFile(input), state = JSON.parse(raw).gameState, original = JSON.stringify(state);
const server = await createServer({ configFile: false, server: { middlewareMode: true }, resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
 const { selectStartingXI } = await server.ssrLoadModule("/src/engine/core/gameLoop.ts");
 const { getFormationSlots, ADJACENT_POSITIONS } = await server.ssrLoadModule("/src/engine/firstTeam/systemFit.ts");
 const rows = Object.values(state.clubs).map(club => {
  const manager = state.managerProfiles[club.id];
  const squad = [...new Set(club.playerIds)].map(id => state.players[id]).filter(p => p?.clubId === club.id);
  const eligible = squad.filter(p => !p.injured && (state.disciplinaryRecords?.[p.id]?.suspensionWeeksRemaining ?? 0) <= 0);
  const slots = getFormationSlots(manager?.preferredFormation ?? "4-4-2");
  const coverage = candidates => {
   const assigned = new Map();
   function fit(player, position) { return player.position === position || player.secondaryPositions?.includes(position)
    || ADJACENT_POSITIONS[player.position]?.includes(position) || ADJACENT_POSITIONS[position]?.includes(player.position); }
   function match(slotIndex, seen) {
    for (const player of candidates) {
     if (seen.has(player.id) || !fit(player, slots[slotIndex])) continue;
     seen.add(player.id);
     if (!assigned.has(player.id) || match(assigned.get(player.id), seen)) { assigned.set(player.id, slotIndex); return true; }
    } return false;
   }
   return slots.reduce((count, _, index) => count + Number(match(index, new Set())), 0);
  };
  const selected = selectStartingXI(club, state.players, state.disciplinaryRecords, undefined, manager);
  return { clubId: club.id, name: club.name, formation: manager?.preferredFormation ?? "4-4-2", squad: squad.length,
   eligible: eligible.length, selected: selected.length, selectedKeepers: selected.filter(p => p.position === "GK").length,
   duplicateSelections: selected.length - new Set(selected.map(p => p.id)).size,
   invalidOwners: selected.filter(p => p.clubId !== club.id).length,
   registeredSlotCoverage: coverage(squad), availableSlotCoverage: coverage(eligible), selectedSlotCoverage: coverage(selected) };
 });
 assert.equal(JSON.stringify(state), original);
 const report = { scope: "Read-only checkpoint lineup inspection. Slot coverage permits primary, secondary and adjacent positions; not a match-quality or 30-year certification.",
  sourceSha256: createHash("sha256").update(raw).digest("hex"), season: state.currentSeason, week: state.currentWeek,
  summary: { clubs: rows.length, multipleKeepers: rows.filter(r => r.selectedKeepers > 1).length,
   noKeeper: rows.filter(r => r.selectedKeepers === 0).length, shortLineup: rows.filter(r => r.selected < 11).length,
   registeredShapeGaps: rows.filter(r => r.registeredSlotCoverage < 11).length,
   availableShapeGaps: rows.filter(r => r.availableSlotCoverage < 11).length,
   missedAvailableFit: rows.filter(r => r.selectedSlotCoverage < r.availableSlotCoverage).length }, rows };
 await writeFile(output, JSON.stringify(report, null, 2), { flag: "wx" }); console.log(JSON.stringify(report.summary));
} finally { await server.close(); }
