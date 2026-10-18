import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "vite";

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) throw new Error("Usage: node scripts/inspect-career-checkpoint.mjs <checkpoint> <new-report>");
const input = resolve(inputArg), output = resolve(outputArg);
if (input === output) throw new Error("Cannot overwrite input checkpoint");
const raw = await readFile(input);
const checkpoint = JSON.parse(raw.toString("utf8"));
const state = checkpoint.gameState ?? checkpoint;
const players = Object.values(state.players);
const stats = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const quantile = p => sorted[Math.floor((sorted.length - 1) * p)] ?? null;
  return { count: sorted.length, min: quantile(0), median: quantile(.5), p90: quantile(.9), max: quantile(1) };
};
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { getClubWeeklyCommitmentTotal } = await server.ssrLoadModule("/src/engine/finance/clubEconomics.ts");
  const clubs = Object.values(state.clubs).map(club => {
    const squad = [...new Set(club.playerIds)].map(id => state.players[id]).filter(player => player?.clubId === club.id);
    const commitment = getClubWeeklyCommitmentTotal(club, state.players);
    const keeper = squad.filter(player => player.position === "GK")
      .sort((a, b) => b.currentAbility - a.currentAbility)[0];
    const outfield = squad.filter(player => player.position !== "GK")
      .sort((a, b) => b.currentAbility - a.currentAbility).slice(0, 10);
    return { id: club.id, name: club.name, leagueId: club.leagueId, reputation: club.reputation,
      roster: squad.length, keepers: squad.filter(player => player.position === "GK").length,
      outfield: squad.filter(player => player.position !== "GK").length,
      underSixteen: squad.filter(player => player.age < 16).length,
      injured: squad.filter(player => player.injured).length,
      ability: stats(squad.map(player => player.currentAbility)),
      // Registered quality only; ignores injuries, tactical fit and match selection.
      registeredElevenMeanAbility: keeper && outfield.length === 10
        ? [keeper, ...outfield].reduce((sum, player) => sum + player.currentAbility, 0) / 11 : null,
      budget: club.budget, weeklyWageBudget: club.weeklyWageBudget, weeklyCommitment: commitment,
      weeklyHeadroom: (club.weeklyWageBudget ?? 0) - commitment };
  });
  const report = {
    input, inputSha256: createHash("sha256").update(raw).digest("hex"), inputBytes: raw.length,
    scope: "Read-only supplied state inspection. Uses current source commitment rules; does not advance the career or certify long-term balance, playing availability or solvency. Registered eleven quality ignores injuries, tactical fit and match selection.",
    date: { season: state.currentSeason, week: state.currentWeek },
    people: players.length, clubCount: clubs.length,
    ages: stats(players.map(player => player.age)), abilities: stats(players.map(player => player.currentAbility)),
    ageBands: Object.fromEntries([[0,15],[16,20],[21,25],[26,30],[31,35],[36,40],[41,100]]
      .map(([low, high]) => [`${low}-${high}`, players.filter(player => player.age >= low && player.age <= high).length])),
    abilityByAgeBand: Object.fromEntries([[0,15],[16,20],[21,25],[26,30],[31,35],[36,40],[41,100]]
      .map(([low, high]) => [`${low}-${high}`, stats(players.filter(player => player.age >= low && player.age <= high)
        .map(player => player.currentAbility))])),
    leagueQuality: Object.fromEntries([...new Set(clubs.map(club => club.leagueId))].sort()
      .map(leagueId => {
        const members = clubs.filter(club => club.leagueId === leagueId);
        return [leagueId, { clubs: members.length,
          withoutRegisteredEleven: members.filter(club => club.registeredElevenMeanAbility === null).length,
          registeredElevenAbility: stats(members.map(club => club.registeredElevenMeanAbility)) }];
      })),
    withoutClub: players.filter(player => !player.clubId).length,
    rosterSizes: stats(clubs.map(club => club.roster)),
    belowPlayingEleven: clubs.filter(club => club.keepers < 1 || club.outfield < 10),
    belowEighteen: clubs.filter(club => club.roster < 18),
    aboveForty: clubs.filter(club => club.roster > 40),
    overWageBudget: clubs.filter(club => club.weeklyHeadroom < 0),
    negativeBudgets: clubs.filter(club => club.budget < 0),
    clubs,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ ...report, clubs: undefined, leagueQuality: undefined, abilityByAgeBand: undefined, belowPlayingEleven: report.belowPlayingEleven.length,
    belowEighteen: report.belowEighteen.length, aboveForty: report.aboveForty.length,
    overWageBudget: report.overWageBudget.length, negativeBudgets: report.negativeBudgets.length }, null, 2));
} finally { await server.close(); }
