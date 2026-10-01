import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Session } from "node:inspector";
import { expect, it, vi } from "vitest";
import { observeWeeklySimulationTelemetry } from "@/engine/core/weeklySimulationPipeline";
import { createAutonomousCareerTelemetry, driveAutonomousYouthCareerWeek } from "./autonomousYouthCareerDriver";
import { useGameStore } from "@/stores/gameStore";

// The diagnostic never opens the player's database or sends a cloud save.
vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));
vi.mock("@/lib/db", () => ({
  AUTOSAVE_SLOT: 0, migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: { mods: { toArray: async () => [] }, leaderboard: { put: async () => undefined, clear: async () => undefined } },
}));

it("profiles one isolated complete weekly advance from a supplied checkpoint", async () => {
  if (!process.env.CAREER_PROFILE_INPUT || !process.env.CAREER_PROFILE_OUTPUT) {
    throw new Error("Set CAREER_PROFILE_INPUT and CAREER_PROFILE_OUTPUT; optional CAREER_PROFILE_WEEK overrides only the date.");
  }
  const input = resolve(process.env.CAREER_PROFILE_INPUT);
  const output = resolve(process.env.CAREER_PROFILE_OUTPUT);
  const raw = await readFile(input);
  const checkpoint = JSON.parse(raw.toString("utf8"));
  const state = checkpoint.gameState ?? checkpoint;
  const originalDate = { season: state.currentSeason, week: state.currentWeek };
  if (process.env.CAREER_PROFILE_WEEK) {
    const week = Number(process.env.CAREER_PROFILE_WEEK);
    if (!Number.isInteger(week) || week < 1 || week > 52) throw new Error("Invalid profile week");
    state.currentWeek = week;
  }
  useGameStore.setState({ gameState: state, weekSimulation: null });
  const sourceDate = { season: state.currentSeason, week: state.currentWeek };
  const samples: unknown[] = [];
  const stopObserving = observeWeeklySimulationTelemetry(sample => samples.push(sample));
  const session = new Session();
  const post = (method: string) => new Promise<any>((resolvePost, reject) =>
    session.post(method, (error, result) => error ? reject(error) : resolvePost(result)));
  session.connect();
  try {
    await post("Profiler.enable");
    await post("Profiler.start");
    const cpuStart = process.cpuUsage();
    const timing = await driveAutonomousYouthCareerWeek(createAutonomousCareerTelemetry("commercial"));
    const cpu = process.cpuUsage(cpuStart);
    const { profile } = await post("Profiler.stop");
    await new Promise<void>(resolveFlush => setImmediate(resolveFlush));
    const after = useGameStore.getState().gameState!;
    const self = new Map<number, number>();
    for (let index = 0; index < profile.samples.length; index++) {
      const id = profile.samples[index];
      self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0));
    }
    const hotFunctions = profile.nodes.map((node: any) => ({
      ...node.callFrame, selfMs: (self.get(node.id) ?? 0) / 1000,
    })).sort((a: any, b: any) => b.selfMs - a.selfMs).slice(0, 60);
    const report = {
      input, inputSha256: createHash("sha256").update(raw).digest("hex"),
      scope: "One complete weekly advance with commercial chooser and isolated no-op persistence. Optional date override; not an exact replay of the failed career or a release gate.",
      originalDate, sourceDate, resultDate: { season: after.currentSeason, week: after.currentWeek },
      timing, cpuMs: (cpu.user + cpu.system) / 1000, samples, hotFunctions,
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output + ".cpuprofile", JSON.stringify(profile));
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    expect(report.resultDate).not.toEqual(sourceDate);
  } finally {
    stopObserving(); session.disconnect();
  }
});
