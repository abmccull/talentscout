import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "vite";

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) throw new Error("Supply checkpoint and new report paths");
const input = resolve(inputArg), output = resolve(outputArg);
if (input === output) throw new Error("Cannot overwrite source");
const raw = await readFile(input);
const checkpoint = JSON.parse(raw.toString("utf8"));
const state = checkpoint.gameState ?? checkpoint;
const server = await createServer({ configFile: false, server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } }, appType: "custom" });
try {
  const { generatePlayer } = await server.ssrLoadModule("/src/engine/players/generation.ts");
  const { RNG } = await server.ssrLoadModule("/src/engine/rng/index.ts");
  const { getDevelopmentAttributeWeights } = await server.ssrLoadModule("/src/engine/players/development.ts");
  const { ATTRIBUTE_DOMAINS } = await server.ssrLoadModule("/src/engine/core/types/player.ts");
  const { evaluatePlayerDevelopmentEnvironment, createDevelopmentEnvironmentIndex } = await server.ssrLoadModule("/src/engine/world/developmentEnvironment.ts");
  const environmentIndex = createDevelopmentEnvironmentIndex(state);
  const selected = Object.values(state.players).filter(player => player.age < 27 && player.currentAbility >= 110)
    .sort((a, b) => b.currentAbility - a.currentAbility || a.id.localeCompare(b.id)).slice(0, 60);
  const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const countBy = (items, key) => items.reduce((counts, item) => {
    const value = key(item) ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
  const highPotential = Object.values(state.players).filter(player => player.age < 27 && player.potentialAbility >= 150);
  const potentialCohorts = [[0, 17], [18, 21], [22, 26]].map(([minimumAge, maximumAge]) => {
    const players = highPotential.filter(player => player.age >= minimumAge && player.age <= maximumAge);
    const history = players.flatMap(player => player.developmentHistory ?? []);
    return { minimumAge, maximumAge, count: players.length,
      meanAbility: mean(players.map(player => player.currentAbility)),
      reached150: players.filter(player => player.currentAbility >= 150).length,
      unattached: players.filter(player => !state.clubs[player.clubId]).length,
      developmentProfiles: countBy(players, player => player.developmentProfile),
      retainedEventCount: history.length,
      retainedEvents: countBy(history, entry => entry.event),
      retainedEventEnvironments: countBy(history, entry => entry.environmentBand),
      playersWithoutRetainedEvents: players.filter(player => !player.developmentHistory?.length).length };
  });
  const rows = selected.map(player => {
    const weights = getDevelopmentAttributeWeights(player, "growth").filter(({ item }) => ATTRIBUTE_DOMAINS[item] !== "hidden");
    const strength = attributes => weights.reduce((sum, { item, weight }) => sum + attributes[item] * weight, 0)
      / weights.reduce((sum, { weight }) => sum + weight, 0);
    const reference = Array.from({ length: 25 }, (_, index) => generatePlayer(new RNG(`ability-reference-${player.id}-${index}`), {
      position: player.position, ageRange: [player.age, player.age],
      abilityRange: [player.currentAbility, player.currentAbility], nationality: player.nationality,
      clubId: player.clubId || undefined,
    }));
    const expected = mean(reference.map(candidate => strength(candidate.attributes)));
    const environment = evaluatePlayerDevelopmentEnvironment(state, player, { index: environmentIndex });
    return { id: player.id, age: player.age, position: player.position, role: player.naturalRole,
      clubId: player.clubId ?? null,
      ability: player.currentAbility, potential: player.potentialAbility, profile: player.developmentProfile,
      form: player.form, actualWeightedAttributes: strength(player.attributes),
      generatedReferenceMean: expected, difference: strength(player.attributes) - expected,
      environmentBand: environment.projection.band, environmentMechanics: environment.mechanics };
  });
  const reservations = Object.values(state.playerPortraits?.reservations ?? {});
  const report = { inputSha256: createHash("sha256").update(raw).digest("hex"),
    scope: "Read-only top under-27 CA110+ cohort; role-development-weighted attribute proxy compared with 25 fresh same-age/position/CA generated players each. Not match strength, causal history, or a target to force onto developed players. Current environment is a snapshot, not career-long exposure; season-opening appearance counts can affect pathway assessment.",
    season: state.currentSeason, week: state.currentWeek, sampleCount: rows.length,
    meanAttributeDifference: mean(rows.map(row => row.difference)),
    potentialCohortScope: "All active under-27 PA150+ players by age band. History contains retained events only: dossier timelines cap at eight, while canonical save retention further caps background players at three. It excludes uneventful weeks and is not a measure of time spent in each environment or lifetime growth.",
    potentialCohorts,
    portraitKnownPeople: reservations.length,
    portraitBoundPeople: reservations.filter(row => row.binding).length,
    portraitWaitingPeople: reservations.filter(row => !row.binding).length,
    rows };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ ...report, rows: undefined }, null, 2));
} finally { await server.close(); }
