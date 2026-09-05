import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext } from "@playwright/test";
import { test, expect, GamePage } from "../fixtures";
import type { GameState } from "@/engine/core/types";
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
    expect(response.ok()).toBe(true);
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
      expect(artifact.ok(), file.path).toBe(true);
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

      const profile = testInfo.outputPath("retained-browser-profile");
      let context: BrowserContext | undefined;
      const launch = async () => {
        context = await chromium.launchPersistentContext(profile, {
          headless: true, baseURL, viewport: { width: 1280, height: 800 },
        });
        const gamePage = new GamePage(context.pages()[0] ?? await context.newPage());
        await gamePage.goto();
        return gamePage;
      };
      try {
        let gamePage = await launch();
        // Fixture injection supplies only the input. All persistence below uses
        // production store/provider methods and the browser's native IndexedDB.
        const committed = await gamePage.page.evaluate(async (checkpointJson) => {
          const checkpoint = JSON.parse(checkpointJson);
          const store = (window as any).__GAME_STORE__;
          store.getState().loadGame(checkpoint);
          await store.getState().flushGameplaySave();
          await store.getState().saveToSlot(1, "Retained release checkpoint");
          return await new Promise<any>((resolveRecord, reject) => {
            const request = indexedDB.open("TalentScoutDB");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const transaction = database.transaction("saves", "readonly");
              const read = transaction.objectStore("saves").get(1);
              read.onerror = () => { database.close(); reject(read.error); };
              read.onsuccess = () => { const record = read.result; database.close(); resolveRecord(record); };
            };
          });
        }, JSON.stringify(input));
        expect(committed, "A fulfilled save must have an authoritative persisted row").toBeTruthy();
        expect(committed.state.playerPortraits).toEqual(input.playerPortraits);
        expect(persistentStateDigest(committed.state)).toBe(receipt.persistentStateSha256);

        gamePage.expectNoConsoleErrors();
        // Close the complete Chromium process, then launch another process against
        // the same isolated on-disk profile. No storageState/JSON reinjection is
        // permitted in the second launch; native IndexedDB is the only save input.
        await context!.close();
        context = undefined;
        gamePage = await launch();
        const restored = await gamePage.page.evaluate(async () => {
          const store = (window as any).__GAME_STORE__;
          await store.getState().loadFromSlot(1);
          return { state: store.getState().gameState, conflict: store.getState().saveConflict };
        });
        expect(restored.conflict).toBeNull();
        expect(restored.state?.playerPortraits).toEqual(input.playerPortraits);
        expect(persistentStateDigest(restored.state)).toBe(receipt.persistentStateSha256);
        await testInfo.attach(`season-${completedSeason}-storage-receipt`, {
          body: JSON.stringify({
            ...receipt, storageVerification: "native-browser-indexeddb-fresh-process-passed",
            browserProcessLaunches: 2, servedBuild,
            browser: testInfo.project.name, inputSha256: receipt.sha256,
            committedDigest: persistentStateDigest(committed.state), restoredDigest: persistentStateDigest(restored.state),
            physicalPackagedFaults: "not-tested",
          }, null, 2), contentType: "application/json",
        });
        gamePage.expectNoConsoleErrors();
      } finally {
        await context?.close();
      }
    });
  }
});
