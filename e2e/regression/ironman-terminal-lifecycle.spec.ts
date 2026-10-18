import type { Page, TestInfo } from "@playwright/test";
import { test, expect, type GamePage } from "../fixtures";
import { dismissTutorials, getDefaultSkillAllocations } from "../helpers/state-injection";

const SEED = "ironman-lifecycle-20261018";
const youthEarlyAccess = process.env.NEXT_PUBLIC_YOUTH_EARLY_ACCESS !== "false";

/** The public creation wizard, including the real Ironman difficulty choice. */
async function startIronmanCareer(gamePage: GamePage, lastName: string) {
  const page = gamePage.page;
  await page.getByRole("button", { name: /^(Start Youth Scout Career|New Game)$/ }).click();
  await page.locator("#scout-first-name").fill("Ironman");
  await page.locator("#scout-last-name").fill(lastName);
  const desk = page.getByRole("radio", { name: /Plan the week yourself/i });
  if (await desk.isVisible()) await desk.check({ force: true });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (!youthEarlyAccess) {
    await page.getByRole("button", { name: /Youth Scout/ }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  for (const [skill, count] of Object.entries(getDefaultSkillAllocations("youth"))) {
    for (let index = 0; index < count; index++) {
      await page.getByRole("button", { name: `Increase ${skill}`, exact: true }).click();
    }
  }
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (!youthEarlyAccess) await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#world-seed").fill(SEED);
  await page.getByRole("button", { name: /^Ironman\b/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Begin Career", exact: true }).click();
  await gamePage.waitForScreen("dashboard", 60_000);
  await dismissTutorials(page);
  return page.evaluate(() => {
    const state = (window as any).__GAME_STORE__.getState().gameState;
    return { instanceId: state.careerInstanceId, runId: state.runManifest.runId, seed: state.seed,
      difficulty: state.difficulty, createdAt: state.createdAt };
  });
}

/** Seed the calendar/employment checkpoint, never the review or terminal result. */
async function seedFinalEmployedWeek(gamePage: GamePage) {
  const checkpoint = await gamePage.page.evaluate(async () => {
    const store = (window as any).__GAME_STORE__;
    const state = structuredClone(store.getState().gameState);
    const season = state.currentSeason;
    const finalWeek = Math.max(...Object.values(state.fixtures)
      .filter((fixture: any) => fixture.season === season).map((fixture: any) => fixture.week));
    const club = Object.values(state.clubs)[0] as any;
    if (!club || !Number.isFinite(finalWeek) || finalWeek < 2) throw new Error("Final-week checkpoint unavailable");
    state.currentWeek = finalWeek;
    state.scout = { ...state.scout, careerPath: "club", careerTier: 1, currentClubId: club.id,
      fatigue: 0, reputation: 0, managerRelationship: 0, salary: 800, boardDirectives: [], employmentContract: undefined };
    state.reports = {};
    state.observations = {};
    state.discoveryRecords = [];
    state.placementReports = {};
    state.alumniRecords = [];
    state.performanceReviews = [];
    state.openingCase = undefined;
    state.activeObservationSession = null;
    state.pendingWeekRecovery = null;
    state.schedule = { week: finalWeek, season, activities: Array(7).fill(null), completed: false };
    for (const fixture of Object.values(state.fixtures) as any[]) {
      if (fixture.season === season && fixture.week < finalWeek) {
        fixture.played = true; fixture.homeGoals = 0; fixture.awayGoals = 0;
      }
    }
    store.getState().loadGame(state);
    await store.getState().flushGameplaySave();
    await store.getState().saveToSlot(1, "Before Ironman dismissal");
    return { season, finalWeek, clubId: club.id, instanceId: state.careerInstanceId };
  });
  await gamePage.navigateTo("calendar");
  return checkpoint;
}

/** These are the real planner and day/week controls; no direct week action. */
async function finishSeasonThroughPlanner(gamePage: GamePage) {
  const page = gamePage.page;
  await page.getByRole("button", { name: "Advance Week", exact: true }).click();
  const empty = page.getByRole("button", { name: "Advance", exact: true });
  if (await empty.isVisible()) await empty.click();
  const confirmation = page.getByRole("dialog", { name: "Advance this week?" });
  if (await confirmation.isVisible()) {
    await confirmation.getByRole("button", { name: "Advance week", exact: true }).click();
  }
  await gamePage.waitForScreen("weekSimulation");
  await page.getByRole("button", { name: "Skip remaining days and complete the week", exact: true }).click();
  await gamePage.waitForScreen("mainMenu", 60_000);
  await expect.poll(() => page.evaluate(() => {
    const s = (window as any).__GAME_STORE__.getState();
    return { career: s.gameState, busy: s.isAdvancingWeek, error: s.weeklyTransactionError, route: s.lastWeeklyExecutionRoute };
  })).toEqual({ career: null, busy: false, error: null, route: "worker" });
}

async function readSlot(page: Page, slot = 0) {
  return page.evaluate((id) => new Promise<any>((resolve, reject) => {
    const request = indexedDB.open("TalentScoutDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction("saves", "readonly").objectStore("saves").get(id);
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => {
        const state = read.result?.state;
        db.close();
        resolve(state ? { slot: id, revision: read.result.storageRevision, instanceId: state.careerInstanceId,
          runId: state.runManifest?.runId, seed: state.seed, season: state.currentSeason, week: state.currentWeek,
          careerEnd: state.careerEnd ?? null, review: state.performanceReviews?.at(-1) ?? null } : null);
      };
    };
  }), slot);
}

async function attachState(page: Page, info: TestInfo, name: string, details: unknown) {
  const runtime = await page.evaluate(() => {
    const current = (window as any).__GAME_STORE__.getState();
    return { screen: current.currentScreen, instanceId: current.gameState?.careerInstanceId ?? null,
      seed: current.gameState?.seed ?? null, error: current.weeklyTransactionError,
      endRecords: Object.keys(localStorage).filter(key => key.startsWith("talentscout:ended-career:"))
        .map(key => ({ key, value: JSON.parse(localStorage.getItem(key)!) })),
      autosaveGate: (window as any).__IRONMAN_AUTOSAVE_GATE__?.snapshot() ?? null };
  });
  await info.attach(`${name}.json`, { body: JSON.stringify({ details, runtime, autosave: await readSlot(page), manual: await readSlot(page, 1) }, null, 2), contentType: "application/json" });
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

/** Hold only the actual coalesced callback after the terminal commit. */
async function installTerminalAutosaveGate(page: Page) {
  await page.addInitScript(() => {
    const nativeTimeout = window.setTimeout.bind(window);
    const nativeClear = window.clearTimeout.bind(window);
    let armed = false;
    let held: { id: number; invoke: () => void } | null = null;
    let watchdog: number | null = null;
    const events: Array<{ event: string; at: number }> = [];
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: any[]) => {
      const store = (window as any).__GAME_STORE__?.getState();
      if (armed && delay === 400 && typeof handler === "function" && store?.gameState === null
        && Object.keys(localStorage).some(key => key.startsWith("talentscout:ended-career:"))) {
        armed = false;
        const id = nativeTimeout(() => undefined, 120_000);
        held = { id, invoke: () => handler(...args) };
        events.push({ event: "terminal-autosave-held", at: performance.now() });
        watchdog = nativeTimeout(() => {
          events.push({ event: "watchdog-release", at: performance.now() });
          const task = held; held = null; if (task) task.invoke();
        }, 90_000);
        return id;
      }
      return nativeTimeout(handler, delay, ...args);
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => {
      if (held?.id === id) events.push({ event: "held-timer-cancelled", at: performance.now() });
      nativeClear(id);
    }) as typeof window.clearTimeout;
    (window as any).__IRONMAN_AUTOSAVE_GATE__ = {
      arm: () => { armed = true; },
      release: () => {
        if (!held) throw new Error("No real terminal autosave is held");
        const task = held; held = null; nativeClear(task.id); if (watchdog !== null) nativeClear(watchdog);
        events.push({ event: "manual-release", at: performance.now() }); task.invoke();
      },
      snapshot: () => ({ armed, held: Boolean(held), events: [...events] }),
    };
  });
}

test.describe("Ironman terminal career runtime acceptance", () => {
  test.setTimeout(240_000);
  test.afterEach(async ({ page }, info) => {
    if (info.status !== info.expectedStatus) await attachState(page, info, "ironman-failure", { status: info.status }).catch(() => undefined);
  });

  test("real dismissal remains ended after reload, while a fresh same-seed career can continue", async ({ gamePage, page }, info) => {
    await gamePage.goto();
    const first = await startIronmanCareer(gamePage, "Ended");
    expect(first).toMatchObject({ seed: SEED, difficulty: "ironman", instanceId: expect.any(String) });
    const checkpoint = await seedFinalEmployedWeek(gamePage);
    await finishSeasonThroughPlanner(gamePage);
    await expect.poll(() => readSlot(page), { timeout: 30_000 }).toMatchObject({ instanceId: first.instanceId,
      careerEnd: { reason: "ironman-fired", season: checkpoint.season, week: checkpoint.finalWeek }, review: { outcome: "fired" } });
    const terminal = await readSlot(page);
    await attachState(page, info, "ironman-real-dismissal", { first, checkpoint, terminal });
    await page.reload();
    await page.waitForFunction(() => Boolean((window as any).__GAME_STORE__));
    const continueButton = page.getByRole("button", { name: /^Continue Career/ });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await expect(page.getByRole("alert").filter({ hasText: /career ended after dismissal/i })).toBeVisible();
    expect(await page.evaluate(() => (window as any).__GAME_STORE__.getState().gameState)).toBeNull();
    await attachState(page, info, "ironman-relaunch-refusal", { terminal });

    const fresh = await startIronmanCareer(gamePage, "Fresh");
    expect(fresh.seed).toBe(first.seed);
    expect(fresh.runId).toBe(first.runId);
    expect(fresh.instanceId).not.toBe(first.instanceId);
    await expect.poll(() => readSlot(page), { timeout: 30_000 }).toMatchObject({ instanceId: fresh.instanceId, careerEnd: null });
    await page.reload();
    await page.waitForFunction(() => Boolean((window as any).__GAME_STORE__));
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await gamePage.waitForScreen("dashboard", 30_000);
    expect(await page.evaluate(() => (window as any).__GAME_STORE__.getState().gameState.careerInstanceId)).toBe(fresh.instanceId);
    await attachState(page, info, "ironman-same-seed-fresh-continue", { first, fresh });
    gamePage.expectNoConsoleErrors();
  });

  test("an old queued terminal autosave cannot overwrite a fresh same-seed career", async ({ gamePage, page }, info) => {
    await installTerminalAutosaveGate(page);
    await gamePage.goto();
    const first = await startIronmanCareer(gamePage, "Queued");
    await seedFinalEmployedWeek(gamePage);
    await page.evaluate(() => (window as any).__IRONMAN_AUTOSAVE_GATE__.arm());
    await finishSeasonThroughPlanner(gamePage);
    await expect.poll(() => page.evaluate(() => (window as any).__IRONMAN_AUTOSAVE_GATE__.snapshot().held)).toBe(true);
    await attachState(page, info, "ironman-terminal-autosave-held", { first });
    const fresh = await startIronmanCareer(gamePage, "Replacement");
    expect(fresh.runId).toBe(first.runId);
    expect(fresh.instanceId).not.toBe(first.instanceId);
    await page.evaluate(() => (window as any).__IRONMAN_AUTOSAVE_GATE__.release());
    await expect.poll(() => readSlot(page), { timeout: 30_000 }).toMatchObject({ instanceId: fresh.instanceId, careerEnd: null });
    const gate = await page.evaluate(() => (window as any).__IRONMAN_AUTOSAVE_GATE__.snapshot());
    expect(gate.events.some((event: any) => event.event === "watchdog-release")).toBe(false);
    await attachState(page, info, "ironman-terminal-queue-replacement", { first, fresh, gate });
    await page.reload();
    await page.waitForFunction(() => Boolean((window as any).__GAME_STORE__));
    const continueButton = page.getByRole("button", { name: /^Continue Career/ });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await gamePage.waitForScreen("dashboard", 30_000);
    expect(await page.evaluate(() => (window as any).__GAME_STORE__.getState().gameState.careerInstanceId)).toBe(fresh.instanceId);
    await attachState(page, info, "ironman-queue-replacement-relaunch", { first, fresh });
    gamePage.expectNoConsoleErrors();
  });
});
