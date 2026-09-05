import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type BrowserContext } from "@playwright/test";
import { test, expect, GamePage } from "../fixtures";
import type { GameState } from "@/engine/core/types";
import {
  assertCompleteCheckpoint, independentlyVettedMigration, installPresentationRecorder,
  removePresentationRecorder, replayPresentation, type PresentationReceipt,
} from "../helpers/retained-storage-boundaries";
import { persistentStateDigest, type RetainedCheckpointReceipt } from "../../tests/release/portraitRetentionDiagnostics";

// This separate evidence lane consumes actual completed-career inputs. Absent
// fixtures produce skipped tests, never a storage-certification pass.
const directory = process.env.SOAK_STORAGE_CHECKPOINT_DIRECTORY;
test.describe("retained career checkpoints through the real browser save provider", () => {
  let servedBuild: { candidateCommitSha: string; candidateTreeSha: string; compiledRuntimeSha256: string };
  test.beforeAll(async ({ request }) => {
    test.skip(!directory, "Supply actual completed-career inputs");
    // This is fetched from the same server used below, never inferred from an
    // environment label or whichever export happens to be present on disk.
    const response = await request.get("/.e2e-bridge.json");
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.sourceTreeClean).toBe(true);
    expect(manifest.candidateCommitSha).toBe(process.env.SOAK_CANDIDATE_SHA);
    expect(manifest.candidateTreeSha).toBe(process.env.SOAK_CANDIDATE_TREE_SHA);
    expect(manifest.manifestScope).toBe("compiled-runtime-and-entry-documents");
    expect(Array.isArray(manifest.files)).toBe(true);
    expect(manifest.files.length).toBeGreaterThan(0);
    expect(createHash("sha256").update(JSON.stringify(manifest.files)).digest("hex"))
      .toBe(manifest.compiledRuntimeSha256);
    const paths = new Set<string>();
    let candidateFoundInJavaScript = false;
    for (const file of manifest.files) {
      expect(file.path).toMatch(/^[a-zA-Z0-9_./()[\]-]+$/);
      expect(file.path.split("/")).not.toContain("..");
      expect(file.path.startsWith("/")).toBe(false);
      expect(paths.has(file.path)).toBe(false);
      paths.add(file.path);
      const artifact = await request.get(`/${file.path}`);
      // The exported error document is intentionally served with HTTP 404.
      // Every other manifest entry must return its own HTTP 200 body; keep the
      // byte length and digest checks below for both statuses.
      expect(artifact.status(), file.path).toBe(file.path === "404.html" ? 404 : 200);
      const bytes = await artifact.body();
      expect(bytes.length, file.path).toBe(file.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), file.path).toBe(file.sha256);
      if (file.path.endsWith(".js") && bytes.toString("utf8").includes(manifest.candidateCommitSha)) {
        candidateFoundInJavaScript = true;
      }
    }
    expect(paths.has("play.html")).toBe(true);
    expect(candidateFoundInJavaScript, "The served compiled runtime must contain its source identity").toBe(true);
    servedBuild = { candidateCommitSha: manifest.candidateCommitSha,
      candidateTreeSha: manifest.candidateTreeSha,
      compiledRuntimeSha256: manifest.compiledRuntimeSha256 };
  });
  test.skip(!directory, "Run the canonical soak first and supply its reference-seed storage-inputs directory");
  for (const completedSeason of [1, 10, 30]) {
    test(`completed season ${completedSeason} survives IndexedDB commit and a fresh browser process`, async ({ baseURL }, testInfo) => {
      test.setTimeout(180_000);
      const path = resolve(directory!, `completed-season-${completedSeason}.json`);
      const bytes = readFileSync(path);
      const receipt = JSON.parse(readFileSync(`${path}.receipt.json`, "utf8")) as RetainedCheckpointReceipt;
      const input = JSON.parse(bytes.toString("utf8")) as GameState;
      expect(process.env.SOAK_CANDIDATE_SHA, "Bind the browser build and inputs to the same candidate").toMatch(/^[a-f0-9]{40,64}$/);
      expect(receipt.candidateCommitSha).toBe(servedBuild.candidateCommitSha);
      expect(receipt.candidateTreeSha).toBe(servedBuild.candidateTreeSha);
      expect(receipt.sourceTreeClean, "Dirty-tree fixtures remain supporting diagnostics").toBe(true);
      expect(receipt.completedSeason).toBe(completedSeason);
      expect(input.currentSeason).toBe(completedSeason + 1);
      expect(input.worldHistory?.latestRecordedSeason).toBe(completedSeason);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(receipt.sha256);
      expect(bytes.length).toBe(receipt.bytes);
      expect(persistentStateDigest(input)).toBe(receipt.persistentStateSha256);

      // A new short on-disk directory avoids Chromium's Windows path limit.
      // mkdtemp never silently reuses a previous profile; retain it as evidence.
      const profile = mkdtempSync(join(process.env.SOAK_STORAGE_PROFILE_ROOT ?? tmpdir(), "ts-retained-"));
      const expectedHydrated = independentlyVettedMigration(input);
      let context: BrowserContext | undefined;
      const launch = async () => {
        context = await chromium.launchPersistentContext(profile, {
          headless: true, baseURL, viewport: { width: 1280, height: 800 },
        });
        const gamePage = new GamePage(context.pages()[0] ?? await context.newPage());
        await gamePage.goto();
        return gamePage;
      };
      let phase = "launch first browser";
      let lastObserved: GameState | undefined;
      let expectedAtBoundary: GameState = expectedHydrated;
      let completed = false;
      const presentationEvidence: { beforeSave?: PresentationReceipt[]; afterRestart?: PresentationReceipt[] } = {};
      try {
        let gamePage = await launch();
        await installPresentationRecorder(gamePage.page);
        // This is the only fixture injection. Capture the synchronous load result
        // before React's dashboard effects, not the later state after an await.
        phase = "synchronous input hydration";
        const immediateHydrated = await gamePage.page.evaluate((checkpointJson) => {
          const store = (window as any).__GAME_STORE__;
          store.getState().loadGame(JSON.parse(checkpointJson));
          return JSON.parse(JSON.stringify(store.getState().gameState));
        }, JSON.stringify(input));
        lastObserved = immediateHydrated;
        assertCompleteCheckpoint(immediateHydrated, expectedHydrated, "immediate input hydration");
        expect(immediateHydrated.lastSaved).toBe(input.lastSaved);
        await gamePage.page.evaluate(async () => {
          await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
          await (window as any).__GAME_STORE__.getState().flushGameplaySave();
        });
        phase = "native save invocation and commit";
        const saved = await gamePage.page.evaluate(async () => {
          const store = (window as any).__GAME_STORE__;
          const recorder = (window as any).__RETAINED_STORAGE_TRACE__;
          // Restoring wrappers and capturing/invoking saveToSlot are synchronous.
          // saveToSlot takes this same gameState/activeSession before its first await.
          recorder.stop();
          const snapshot = JSON.parse(JSON.stringify({ ...store.getState().gameState,
            activeObservationSession: store.getState().activeSession }));
          const startedAt = Date.now();
          await store.getState().saveToSlot(1, "Retained release checkpoint");
          const completedAt = Date.now();
          const record = await new Promise<any>((resolveRecord, reject) => {
            const request = indexedDB.open("TalentScoutDB");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const transaction = database.transaction("saves", "readonly");
              const read = transaction.objectStore("saves").get(1);
              read.onerror = () => { database.close(); reject(read.error); };
              read.onsuccess = () => { const row = read.result; database.close(); resolveRecord(row); };
            };
          });
          return { snapshot, record, startedAt, completedAt, presentation: await recorder.collect() };
        });
        presentationEvidence.beforeSave = saved.presentation as PresentationReceipt[];
        lastObserved = saved.snapshot;
        const preSaveExpected = replayPresentation(expectedHydrated, saved.presentation as PresentationReceipt[]);
        expectedAtBoundary = preSaveExpected;
        assertCompleteCheckpoint(saved.snapshot, preSaveExpected, "post-render state at save invocation");
        const committed = saved.record;
        expect(committed, "A fulfilled save must have an authoritative persisted row").toBeTruthy();
        lastObserved = committed.state;
        expectedAtBoundary = saved.snapshot;
        assertCompleteCheckpoint(committed.state, saved.snapshot, "exact native commit fidelity");
        expect(committed.state.playerPortraits).toEqual(input.playerPortraits);
        expect(committed.state.lastSaved).toBe(committed.savedAt);
        expect(committed.savedAt).toBeGreaterThanOrEqual(saved.startedAt);
        expect(committed.savedAt).toBeLessThanOrEqual(saved.completedAt);
        // Include the previously excluded delivery timestamp in full equality
        // once its independently checked provider boundary value is known.
        expect(committed.state).toEqual({ ...saved.snapshot, lastSaved: committed.savedAt });
        const expectedRestored = independentlyVettedMigration(committed.state);
        assertCompleteCheckpoint(expectedRestored, committed.state, "committed state needs no further migration");
        await removePresentationRecorder(gamePage.page);
        gamePage.expectNoConsoleErrors();

        // Close the complete process and launch a second process using ONLY its
        // native on-disk profile. No JSON/storageState reinjection on this launch.
        await context!.close();
        context = undefined;
        phase = "fresh-process provider restore";
        gamePage = await launch();
        await installPresentationRecorder(gamePage.page);
        const restored = await gamePage.page.evaluate(async () => {
          const store = (window as any).__GAME_STORE__;
          if (store.getState().gameState) throw new Error("Fresh process unexpectedly has an active career");
          let immediate: any = null;
          const unsubscribe = store.subscribe((next: any, previous: any) => {
            if (!immediate && next.isLoaded && next.gameState && next.gameState !== previous.gameState) {
              // The Zustand notification runs synchronously inside loadGame.set,
              // before React effects can turn restoration into presentation work.
              immediate = JSON.parse(JSON.stringify(next.gameState));
            }
          });
          try { await store.getState().loadFromSlot(1); } finally { unsubscribe(); }
          return { immediate, conflict: store.getState().saveConflict };
        });
        expect(restored.conflict).toBeNull();
        expect(restored.immediate, "Observe the actual first hydrated state from native provider load").toBeTruthy();
        lastObserved = restored.immediate;
        expectedAtBoundary = expectedRestored;
        assertCompleteCheckpoint(restored.immediate, expectedRestored, "fresh-process immediate restore");
        expect(restored.immediate).toEqual(committed.state);
        phase = "fresh-process presentation and retained native row";
        const afterRestart = await gamePage.page.evaluate(async () => {
          await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
          const recorder = (window as any).__RETAINED_STORAGE_TRACE__;
          recorder.stop();
          const state = JSON.parse(JSON.stringify((window as any).__GAME_STORE__.getState().gameState));
          const record = await new Promise<any>((resolveRecord, reject) => {
            const request = indexedDB.open("TalentScoutDB");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const transaction = database.transaction("saves", "readonly");
              const read = transaction.objectStore("saves").get(1);
              read.onerror = () => { database.close(); reject(read.error); };
              read.onsuccess = () => { const row = read.result; database.close(); resolveRecord(row); };
            };
          });
          return { state, record, presentation: await recorder.collect() };
        });
        presentationEvidence.afterRestart = afterRestart.presentation as PresentationReceipt[];
        lastObserved = afterRestart.state;
        expectedAtBoundary = replayPresentation(expectedRestored, afterRestart.presentation as PresentationReceipt[]);
        assertCompleteCheckpoint(afterRestart.state, expectedAtBoundary, "fresh-process post-render state");
        expect(afterRestart.record).toEqual(committed);
        await removePresentationRecorder(gamePage.page);
        await testInfo.attach(`season-${completedSeason}-storage-receipt`, {
          body: JSON.stringify({
            ...receipt, storageVerification: "native-browser-indexeddb-fresh-process-passed",
            boundaryContract: "explicit-migration-presentation-native-commit-restart-v1",
            browserProcessLaunches: 2, profile, servedBuild,
            browser: testInfo.project.name, inputSha256: receipt.sha256,
            rawInputDigest: receipt.persistentStateSha256,
            approvedMigrationDigest: persistentStateDigest(expectedHydrated),
            immediateHydrationDigest: persistentStateDigest(immediateHydrated),
            preSaveDigest: persistentStateDigest(saved.snapshot),
            committedDigest: persistentStateDigest(committed.state),
            restoredDigest: persistentStateDigest(restored.immediate),
            presentationBeforeSave: saved.presentation, presentationAfterRestart: afterRestart.presentation,
            commitTimestamp: committed.savedAt,
            physicalPackagedFaults: "not-tested",
          }, null, 2), contentType: "application/json",
        });
        gamePage.expectNoConsoleErrors();
        completed = true;
      } finally {
        await testInfo.attach(`season-${completedSeason}-boundary-status`, {
          body: JSON.stringify({ completed, phase, profile, inputDigest: receipt.persistentStateSha256,
            expectedDigest: persistentStateDigest(expectedAtBoundary),
            observedDigest: lastObserved ? persistentStateDigest(lastObserved) : null,
            presentationEvidence }, null, 2),
          contentType: "application/json",
        });
        if (!completed && lastObserved) {
          await testInfo.attach(`season-${completedSeason}-failed-boundary-observed`, {
            body: JSON.stringify(lastObserved), contentType: "application/json",
          });
          await testInfo.attach(`season-${completedSeason}-failed-boundary-expected`, {
            body: JSON.stringify(expectedAtBoundary), contentType: "application/json",
          });
        }
        // Restore any test wrappers even if an assertion fails before save/reload.
        for (const page of context?.pages() ?? []) await removePresentationRecorder(page);
        await context?.close();
      }
    });
  }
});
