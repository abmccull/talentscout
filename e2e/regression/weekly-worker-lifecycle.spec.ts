import type { Page, TestInfo } from "@playwright/test";
import { expect, test, type GamePage, dismissCareerMomentOverlays } from "../fixtures";

/** Hold only delivery of real compiled-worker results; never replace its math. */
async function installRealWorkerDeliveryGate(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const held = new Map<string, { worker: Worker; event: MessageEvent; timer: number }>();
    const bypass = new WeakSet<Event>();
    let holdCount = 0;
    let workerSequence = 0;
    const log: any[] = [];
    function persistedView(state: any) {
      return {
        seed: state?.seed, week: state?.currentWeek, season: state?.currentSeason,
        scoutId: state?.scout?.id, firstName: state?.scout?.firstName,
        watchlist: state?.watchlist ?? [],
        reportIds: Object.keys(state?.reports ?? {}).sort(),
        observationIds: Object.keys(state?.observations ?? {}).sort(),
        portraitReservations: state?.playerPortraits?.reservations ?? {},
        playedFixtureIds: Object.values(state?.fixtures ?? {})
          .filter((fixture: any) => fixture.played).map((fixture: any) => fixture.id).sort(),
        ratingFixtureIds: Object.keys(state?.matchRatings ?? {}).sort(),
        sessionId: state?.activeObservationSession?.id ?? null,
        recovery: state?.pendingWeekRecovery ? {
          week: state.pendingWeekRecovery.week, season: state.pendingWeekRecovery.season,
          day: state.pendingWeekRecovery.simulation.currentDay,
          pendingWorldTick: state.pendingWeekRecovery.simulation.pendingWorldTick,
          activityInstanceIds: state.pendingWeekRecovery.simulation.dayResults
            .map((day: any) => day.activityInstanceId ?? null),
        } : null,
        lastSaved: state?.lastSaved,
      };
    }
    class DeliveryGateWorker extends NativeWorker {
      private gateId: number;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.gateId = ++workerSequence;
        log.push({ event: "created", workerId: this.gateId, url: String(url), name: options?.name });
        // Register before the application listener so it receives the exact
        // original data only when released. All other messages pass through.
        super.addEventListener("message", (event: MessageEvent) => {
          if (bypass.has(event) || event.data?.kind !== "weekly-transaction-result" || holdCount === 0) return;
          holdCount -= 1;
          event.stopImmediatePropagation();
          const jobId = event.data.jobId as string;
          log.push({ event: "held", workerId: this.gateId, jobId, source: event.data.source,
            computeMs: event.data.state?.metrics?.computeMs, responseBytes: event.data.state?.metrics?.responseBytes });
          const timer = window.setTimeout(() => release(jobId, true), 6_000);
          held.set(jobId, { worker: this, event, timer });
        });
      }
      postMessage(message: any, transfer: Transferable[]): void;
      postMessage(message: any, options?: StructuredSerializeOptions): void;
      postMessage(message: any, transferOrOptions?: Transferable[] | StructuredSerializeOptions): void {
        if (message?.kind === "weekly-transaction-request") {
          log.push({ event: "requested", workerId: this.gateId, jobId: message.job.id,
            source: message.job.source, wireKind: message.state?.kind });
        }
        if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
        else super.postMessage(message, transferOrOptions);
      }
      terminate() {
        log.push({ event: "terminated", workerId: this.gateId });
        super.terminate();
      }
    }
    function release(jobId: string, automatic = false) {
      const entry = held.get(jobId);
      if (!entry) throw new Error(`No real worker result is held for ${jobId}`);
      held.delete(jobId);
      clearTimeout(entry.timer);
      log.push({ event: "released", jobId, automatic });
      const delivery = new MessageEvent("message", { data: entry.event.data });
      bypass.add(delivery);
      // Re-deliver the unchanged real result even if its owner was terminated.
      // This models an already-queued response arriving after career replacement.
      NativeWorker.prototype.dispatchEvent.call(entry.worker, delivery);
    }
    Object.defineProperty(window, "Worker", { configurable: true, value: DeliveryGateWorker });
    (window as any).__WEEKLY_REAL_GATE__ = {
      holdNext: (count = 1) => { holdCount += count; },
      release,
      view: persistedView,
      snapshot: () => ({ heldJobIds: [...held.keys()], log: [...log] }),
    };
  });
}

async function gateSnapshot(page: Page) {
  return page.evaluate(() => (window as any).__WEEKLY_REAL_GATE__.snapshot());
}

async function prepareCareer(gamePage: GamePage) {
  await gamePage.goto();
  await gamePage.injectState({ currentWeek: 4, scout: {
    firstName: "Lifecycle", lastName: "Proof", primarySpecialization: "youth",
  } });
  await gamePage.navigateTo("calendar");
}

/** Start and resolve the real itinerary through its renderer controls. */
async function beginHeldWeek(gamePage: GamePage, count = 1) {
  const page = gamePage.page;
  await page.evaluate((n) => (window as any).__WEEKLY_REAL_GATE__.holdNext(n), count);
  await page.getByRole("button", { name: "Advance Week", exact: true }).click();
  const emptyAdvance = page.getByRole("button", { name: "Advance", exact: true });
  if (await emptyAdvance.isVisible()) await emptyAdvance.click();
  const confirmation = page.getByRole("dialog", { name: "Advance this week?" });
  if (await confirmation.isVisible()) await confirmation.getByRole("button", { name: "Advance week", exact: true }).click();
  await gamePage.waitForScreen("weekSimulation");
  await page.getByRole("button", { name: "Skip remaining days and complete the week", exact: true }).click();
  await expect.poll(async () => (await gateSnapshot(page)).heldJobIds.length).toBe(1);
  await expect(page.getByRole("button", { name: "View Calendar", exact: true })).toBeDisabled();
  return (await gateSnapshot(page)).heldJobIds[0] as string;
}

async function liveView(page: Page) {
  return page.evaluate(() => {
    const store = (window as any).__GAME_STORE__.getState();
    return {
      state: (window as any).__WEEKLY_REAL_GATE__.view(store.gameState),
      route: store.lastWeeklyExecutionRoute, telemetry: store.lastWeeklyWorkerTelemetry,
      busy: store.isAdvancingWeek, error: store.weeklyTransactionError,
      screen: store.currentScreen,
    };
  });
}

async function readSlot(page: Page, slot = 0) {
  return page.evaluate((slotNumber) => new Promise<any>((resolve, reject) => {
    const open = indexedDB.open("TalentScoutDB");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction("saves", "readonly").objectStore("saves").get(slotNumber);
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => {
        const state = read.result?.state ?? null;
        const view = state ? (window as any).__WEEKLY_REAL_GATE__.view(state) : null;
        db.close();
        resolve(view);
      };
    };
  }), slot);
}

async function acknowledgeCommit(gamePage: GamePage, expectedWeek: number) {
  const page = gamePage.page;
  await expect.poll(() => liveView(page)).toMatchObject({
    state: { week: expectedWeek }, busy: false, error: null, route: "worker",
  });
  const summary = page.getByRole("dialog", { name: "Week Summary", exact: true });
  if (await summary.isVisible()) await summary.getByRole("button").first().click();
  await dismissCareerMomentOverlays(page);
  await gamePage.waitForScreen("calendar");
  await expect(page.getByRole("button", { name: "Advance Week", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeEnabled();
  await expect(page.getByTestId("planner-scroll-region").getByText(`Week ${expectedWeek} — Season 1`, { exact: true })).toBeVisible();
  await expect.poll(() => readSlot(page)).toMatchObject({ week: expectedWeek, recovery: null, sessionId: null });
}

async function artifact(page: Page, testInfo: TestInfo, name: string, evidence: any) {
  const gate = await gateSnapshot(page);
  expect(gate.log.filter((item: any) => item.event === "released" && item.automatic)).toEqual([]);
  expect(gate.log.filter((item: any) => item.event === "held").every((item: any) =>
    item.computeMs >= 0 && item.responseBytes > 0)).toBe(true);
  await testInfo.attach(`${name}.json`, {
    body: JSON.stringify({ ...evidence, gate, live: await liveView(page), autosave: await readSlot(page) }, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

test.describe("Real weekly worker lifecycle and persistence", () => {
  test.setTimeout(120_000);
  test.beforeEach(async ({ page }) => { await installRealWorkerDeliveryGate(page); });

  test("busy-window saves and visibility persistence allow the real commit, then manual-slot load restores it", async ({ gamePage, page }, testInfo) => {
    await prepareCareer(gamePage);
    const jobId = await beginHeldWeek(gamePage);
    const busy = await liveView(page);
    expect(busy).toMatchObject({ state: { week: 4 }, busy: true, route: null });
    const mirrorIdentity = await page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      const simulation = store.getState().weekSimulation;
      const session = store.getState().activeSession;
      store.getState().saveGame();
      await store.getState().flushGameplaySave();
      return { sameSimulation: store.getState().weekSimulation === simulation,
        sameSession: store.getState().activeSession === session };
    });
    expect(mirrorIdentity).toEqual({ sameSimulation: true, sameSession: true });
    const savedBusy = await readSlot(page);
    expect(savedBusy).toMatchObject({ week: 4, sessionId: null,
      recovery: { week: 4, season: 1, day: 7, pendingWorldTick: true } });
    // A clean repeat flush intentionally deduplicates and keeps the previous
    // record timestamp. Select an unseen real player through the public action
    // to give this hidden flush meaningful pending portrait metadata to save.
    const portraitMetadata = await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const before = store.getState();
      const playerId = Object.keys(before.gameState.players).find((id) =>
        !before.gameState.playerPortraits?.reservations["person:v1:" + id]);
      if (!playerId) throw new Error("Fixture requires a real player without a portrait reservation");
      store.getState().selectPlayer(playerId);
      const selected = store.getState();
      const identityId = "person:v1:" + playerId;
      const reservation = selected.gameState.playerPortraits?.reservations[identityId];
      if (!reservation) throw new Error("Public player selection did not reveal its portrait identity");
      const beforeHiddenLastSaved = selected.gameState.lastSaved;
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      // The mounted original PersistenceRuntime handles the event. Its original
      // flush publishes synchronously before awaiting persistence. Selection's
      // coalesced queue does not publish this lastSaved value into live state.
      document.dispatchEvent(new Event("visibilitychange"));
      const afterHidden = store.getState();
      const metadataFields = new Set(["playerPortraits", "lastSaved", "activeObservationSession", "pendingWeekRecovery"]);
      return {
        playerId, identityId, reservation, beforeHiddenLastSaved,
        afterHiddenLastSaved: afterHidden.gameState.lastSaved,
        hiddenFlushPublished: afterHidden.gameState !== selected.gameState
          && afterHidden.gameState.lastSaved > beforeHiddenLastSaved,
        sameSimulation: afterHidden.weekSimulation === before.weekSimulation,
        sameSession: afterHidden.activeSession === before.activeSession,
        busy: afterHidden.isAdvancingWeek,
        worldFieldsUnchanged: [...new Set([...Object.keys(before.gameState), ...Object.keys(afterHidden.gameState)])]
          .filter((key) => !metadataFields.has(key))
          .every((key) => Object.is(before.gameState[key], afterHidden.gameState[key])),
      };
    });
    expect(portraitMetadata).toMatchObject({ hiddenFlushPublished: true,
      sameSimulation: true, sameSession: true, busy: true, worldFieldsUnchanged: true });
    await expect.poll(() => readSlot(page)).toMatchObject({ week: 4, sessionId: null,
      recovery: { week: 4, season: 1, day: 7, pendingWorldTick: true },
      portraitReservations: { [portraitMetadata.identityId]: portraitMetadata.reservation } });
    const hiddenSaved = await readSlot(page);
    // This is now a new semantic save, rather than demanding a duplicate write.
    expect(hiddenSaved!.lastSaved).toBeGreaterThan(savedBusy!.lastSaved);
    await page.evaluate(() => { delete (document as any).visibilityState; });
    expect(await liveView(page)).toMatchObject({ state: { week: 4 }, busy: true });
    await page.screenshot({ path: testInfo.outputPath("busy-window-saved.png"), fullPage: true });
    await page.evaluate((id) => (window as any).__WEEKLY_REAL_GATE__.release(id), jobId);
    await acknowledgeCommit(gamePage, 5);
    const committed = await liveView(page);
    expect(committed.state.lastSaved).toBeGreaterThanOrEqual(hiddenSaved!.lastSaved);
    expect(committed.state.portraitReservations[portraitMetadata.identityId]).toEqual(portraitMetadata.reservation);
    await gamePage.navigateTo("settings");
    await page.getByRole("button", { name: "Quick Save", exact: true }).click();
    await expect(page.getByText("Saved to slot 1", { exact: true })).toBeVisible();
    const manual = await readSlot(page, 1);
    expect(manual).toMatchObject({ week: 5, recovery: null, sessionId: null,
      portraitReservations: { [portraitMetadata.identityId]: portraitMetadata.reservation } });
    await gamePage.navigateTo("calendar");
    await gamePage.advanceCanonicalWeek();
    expect(await gamePage.getCurrentWeek()).toBe(6);
    await gamePage.navigateTo("settings");
    await page.getByRole("button", { name: "Manage Saves", exact: true }).click();
    const load = page.getByRole("dialog", { name: "Save and Load Game", exact: true });
    await load.getByRole("tab", { name: "Load", exact: true }).click();
    await load.getByRole("button", { name: "Load save slot 1", exact: true }).click();
    await load.getByRole("button", { name: "Confirm", exact: true }).click();
    await gamePage.waitForScreen("dashboard");
    const restored = await liveView(page);
    expect(restored.state).toEqual(manual);
    expect(restored).toMatchObject({ busy: false, error: null, route: null });
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeEnabled();
    await artifact(page, testInfo, "worker-busy-save-manual-load", { jobId, busy, savedBusy, hiddenSaved, mirrorIdentity, portraitMetadata, committed, manual, restored });
    gamePage.expectNoConsoleErrors();
  });

  test("a substantive watchlist edit survives stale result discard and the real Retry Week commit", async ({ gamePage, page }, testInfo) => {
    await prepareCareer(gamePage);
    const jobId = await beginHeldWeek(gamePage);
    // Navigate to a real player profile and make its normal UI edit while the
    // completed worker result is still waiting for delivery.
    const playerId = await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const id = Object.keys(store.getState().gameState.players)[0];
      store.getState().selectPlayer(id);
      store.getState().setScreen("playerProfile");
      return id;
    });
    await gamePage.waitForScreen("playerProfile");
    await page.getByRole("button", { name: "Add to watchlist", exact: true }).click();
    await page.evaluate(() => (window as any).__GAME_STORE__.getState().setScreen("weekSimulation"));
    await gamePage.waitForScreen("weekSimulation");
    await page.evaluate((id) => (window as any).__WEEKLY_REAL_GATE__.release(id), jobId);
    await expect.poll(() => liveView(page)).toMatchObject({
      state: { week: 4, watchlist: [playerId] }, busy: false,
      error: "Your career changed while this week was being resolved. Your changes are safe; complete the week again.",
    });
    const discarded = await liveView(page);
    const retry = page.getByRole("button", { name: "Retry Week", exact: true });
    await expect(retry).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath("worker-edit-discard-retry.png"), fullPage: true });
    await retry.click();
    await acknowledgeCommit(gamePage, 5);
    expect((await liveView(page)).state.watchlist).toContain(playerId);
    expect((await readSlot(page))!.watchlist).toContain(playerId);
    await artifact(page, testInfo, "worker-edit-survives-retry", { jobId, playerId, discarded });
    gamePage.expectNoConsoleErrors();
  });

  test("same-seed replacement and a newer real job retain their owner when the old response arrives", async ({ gamePage, page }, testInfo) => {
    await prepareCareer(gamePage);
    const oldJobId = await beginHeldWeek(gamePage, 2);
    const replacement = await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = structuredClone(store.getState().gameState);
      const playerId = Object.keys(state.players)[0];
      state.scout.firstName = "Replacement";
      state.watchlist = [playerId];
      // Atomic use of real production load/start/resolve actions exercises
      // the old finally callback while the new owner already holds its latch.
      // Neither simulation state nor worker execution is manufactured here.
      store.getState().loadGame(state);
      store.getState().startWeekSimulation();
      void store.getState().fastForwardWeek();
      return { seed: state.seed, week: state.currentWeek, playerId, scoutId: state.scout.id };
    });
    await expect.poll(async () => (await gateSnapshot(page)).heldJobIds.length).toBe(2);
    const gate = await gateSnapshot(page);
    const newJobId = gate.heldJobIds.find((id: string) => id !== oldJobId) as string;
    const requests = gate.log.filter((item: any) => item.event === "requested");
    const oldRequest = requests.find((item: any) => item.jobId === oldJobId);
    const newRequest = requests.find((item: any) => item.jobId === newJobId);
    expect(newRequest.source).toEqual(oldRequest.source);
    expect(newRequest.workerId).not.toBe(oldRequest.workerId);
    expect(newJobId).not.toBe(oldJobId);
    await page.evaluate((id) => (window as any).__WEEKLY_REAL_GATE__.release(id), oldJobId);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const afterOldDelivery = await liveView(page);
    expect(afterOldDelivery).toMatchObject({
      state: { seed: replacement.seed, week: 4, firstName: "Replacement", watchlist: [replacement.playerId] },
      busy: true, error: null, route: null,
    });
    await expect(page.getByRole("button", { name: "View Calendar", exact: true })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath("replacement-new-owner-still-busy.png"), fullPage: true });
    await page.evaluate((id) => (window as any).__WEEKLY_REAL_GATE__.release(id), newJobId);
    await acknowledgeCommit(gamePage, 5);
    expect((await liveView(page)).state).toMatchObject({ firstName: "Replacement", watchlist: [replacement.playerId] });
    expect(await readSlot(page)).toMatchObject({ firstName: "Replacement", week: 5, watchlist: [replacement.playerId] });
    await artifact(page, testInfo, "worker-replacement-owner-proof", { oldJobId, newJobId, oldRequest, newRequest, replacement, afterOldDelivery });
    gamePage.expectNoConsoleErrors();
  });
});
