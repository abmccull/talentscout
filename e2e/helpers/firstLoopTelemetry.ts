import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import type { Page } from "@playwright/test";

/** Optional diagnostics around an unchanged real-player flow, including later chunks. */
export function firstLoopTelemetry(page: Page, name: string) {
  const outputRoot = process.env.FIRST_LOOP_METRICS_DIR;
  const started = performance.now();
  const responses: Array<{ path: string; rawBytes: number; gzipBytes: number; optionalSdkMarkers: string[] }> = [];
  const pending: Promise<void>[] = [];
  const failures: string[] = [];
  const milestones: Array<Record<string, unknown>> = [];
  if (outputRoot) page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (!path.endsWith(".js")) return;
    pending.push(response.body().then((body) => {
      const source = body.toString("utf8");
      responses.push({ path, rawBytes: body.length, gzipBytes: gzipSync(body, { level: 6 }).length,
        optionalSdkMarkers: ["GoTrueClient", "sentry.javascript.nextjs"].filter((marker) => source.includes(marker)),
      });
    }).catch(() => { failures.push(`Could not retain script response: ${path}`); }));
  });
  return {
    async mark(stage: string) {
      if (!outputRoot) return;
      await Promise.all(pending);
      milestones.push({ stage, elapsedDiagnosticMs: performance.now() - started, responseCount: responses.length,
        cumulativeRawResponseBytes: responses.reduce((sum, entry) => sum + entry.rawBytes, 0),
        cumulativeGzipEquivalentBytes: responses.reduce((sum, entry) => sum + entry.gzipBytes, 0),
      });
    },
    async finish() {
      if (!outputRoot) return;
      await Promise.all(pending);
      const scripts = [...new Map(responses.map((entry) => [entry.path, entry])).values()];
      await mkdir(outputRoot, { recursive: true });
      await writeFile(resolve(outputRoot, `${name}.json`), JSON.stringify({
        scope: "Instrumented browser flow; times include assertions, captures and automation, not runtime benchmark acceptance. Gzip values are a level-6 equivalent; the local server transfers uncompressed scripts.",
        milestones, scripts, scriptResponseCount: responses.length,
        uniqueRawScriptBytes: scripts.reduce((sum, entry) => sum + entry.rawBytes, 0),
        uniqueGzipScriptBytes: scripts.reduce((sum, entry) => sum + entry.gzipBytes, 0), failures,
      }, null, 2));
      if (failures.length) throw new Error(failures.join("\n"));
      if (process.env.EXPECT_DEFERRED_OPTIONAL_SERVICES === "true" && scripts.some((entry) => entry.optionalSdkMarkers.length)) {
        throw new Error("Offline first loop loaded an optional service SDK");
      }
    },
  };
}
