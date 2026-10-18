import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateSentryProviderReceipt } from "../../scripts/validate-sentry-provider-receipt.mjs";

const dirs: string[] = [];
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const root = mkdtempSync(join(process.env.RELEASE_FIXTURE_ROOT ?? tmpdir(), "sentry-receipt-"));
  dirs.push(root);
  const directory = "artifacts/release/generated/certifications";
  mkdirSync(join(root, directory), { recursive: true });
  const sha = "a".repeat(40);
  const eventId = "b".repeat(32);
  const timestamp = Date.parse("2026-01-01T12:00:00Z") / 1000;
  const manifest = { packages: [{ kind: "windows-installer", sha256: "c".repeat(64), bytes: 100 }] };
  const packageManifestPath = join(root, "manifest.json");
  writeFileSync(packageManifestPath, JSON.stringify(manifest));
  const sent = { event_id: eventId, timestamp, platform: "javascript", level: "error", release: sha, environment: "production", tags: { runtime: "renderer" }, exception: { values: [{ type: "Error", value: "Renderer exception (message omitted for privacy)" }] } };
  const received = { eventID: eventId, platform: "javascript", type: "error", release: { version: sha }, dateReceived: "2026-01-01T12:00:01Z", tags: [{ key: "runtime", value: "renderer" }, { key: "environment", value: "production" }], entries: [{ type: "exception", data: { values: sent.exception.values } }], user: { id: null, ip_address: null } };
  function bound(name: string, value: unknown) {
    const path = `${directory}/${name}.json`;
    writeFileSync(join(root, path), JSON.stringify(value));
    return { path, sha256: digest(readFileSync(join(root, path))) };
  }
  const apiUrl = `https://sentry.io/api/0/projects/test-org/test-project/events/${eventId}/`;
  const evidence = {
    schemaVersion: 1, evidenceKind: "sentry-provider-receipt", candidateCommitSha: sha, candidateTreeSha: "d".repeat(40), candidateTag: "v1.0.0-rc.1",
    packageManifestSha256: digest(readFileSync(packageManifestPath)), testedPackage: { ...manifest.packages[0] }, status: "Passed", operator: "Fixture only",
    completedAt: "2026-01-01T12:02:00Z", controls: Object.fromEntries(["installedExactPackage", "intentionalRendererError", "providerEventReadBack", "payloadPrivacyReviewed"].map((id) => [id, { status: "Passed" }])),
    provider: { eventId, organization: "test-org", project: "test-project", eventApiUrl: apiUrl, retrievedAt: "2026-01-01T12:01:00Z", httpStatus: 200, attachmentsApiUrl: `${apiUrl}attachments/`, attachmentsHttpStatus: 200 },
    sentEvent: bound("sent", sent), providerEvent: bound("received", received), providerAttachments: bound("attachments", []),
  };
  const readBoundJson = async (path: string, expectedSha256: string) => {
    const bytes = readFileSync(join(root, path));
    if (bytes.length > 8 * 1024 * 1024) throw new Error("descriptor size admission exceeded");
    if (digest(bytes) !== expectedSha256) throw new Error("hash does not match");
    return { value: JSON.parse(bytes.toString("utf8")), sha256: digest(bytes) };
  };
  const input = { root, evidence, readBoundJson, packageManifestSha256: evidence.packageManifestSha256, candidateSha: sha, candidateTreeSha: evidence.candidateTreeSha, candidateTag: evidence.candidateTag, packageManifest: manifest, packageManifestPath };
  return { input, evidence, sent, received, bound };
}

afterEach(() => { for (const directory of dirs.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("candidate-bound Sentry receipt contract (synthetic fixtures, no provider acceptance)", () => {
  it("requires the caller's shared admitted reader instead of opening evidence itself", async () => {
    const f = fixture();
    const failures = await validateSentryProviderReceipt({ ...f.input, readBoundJson: undefined });
    expect(failures).toContain("Sentry receipt requires the shared bounded evidence reader");
  });
  it("retains a shared budget admission failure instead of using a fallback read", async () => {
    const f = fixture();
    const failures = await validateSentryProviderReceipt({ ...f.input, readBoundJson: async () => { throw new Error("ERR_RELEASE_ARTIFACT_LIMIT"); } });
    expect(failures).toEqual(expect.arrayContaining([expect.stringContaining("ERR_RELEASE_ARTIFACT_LIMIT")]));
  });
  it("refuses aliasing or dot traversal before invoking the admitted reader", async () => {
    const f = fixture();
    f.evidence.providerEvent.path = "artifacts/release/../release/generated/certifications/received.json";
    expect(await validateSentryProviderReceipt(f.input)).toEqual(expect.arrayContaining([expect.stringContaining("invalid file binding")]));
  });
  it("returns a failure for malformed receipt roots", async () => {
    expect(await validateSentryProviderReceipt({ ...fixture().input, evidence: null })).toContain("Sentry receipt must be an object");
  });
  it("accepts a complete matching sent-event and provider read-back fixture", async () => {
    expect(await validateSentryProviderReceipt(fixture().input)).toEqual([]);
  });
  it.each(["candidateCommitSha", "candidateTreeSha", "candidateTag", "packageManifestSha256"] as const)("rejects a mismatched %s", async (key) => {
    const f = fixture();
    f.evidence[key] = "wrong";
    expect((await validateSentryProviderReceipt(f.input)).length).toBeGreaterThan(0);
  });
  it("rejects a different package even when the manifest binding matches", async () => {
    const f = fixture();
    f.evidence.testedPackage.sha256 = "f".repeat(64);
    expect(await validateSentryProviderReceipt(f.input)).toContain("Sentry receipt is not bound to an exact manifest package hash/length");
  });
  it("rejects missing and tampered read-backs", async () => {
    const f = fixture();
    unlinkSync(join(f.input.root, f.evidence.providerEvent.path));
    writeFileSync(join(f.input.root, f.evidence.sentEvent.path), "{}");
    const failures = await validateSentryProviderReceipt(f.input);
    expect(failures).toEqual(expect.arrayContaining([expect.stringContaining("Sentry provider event:"), expect.stringContaining("hash does not match")]));
  });
  it("rejects a rehashed event from another candidate or event", async () => {
    const f = fixture();
    f.evidence.providerEvent = f.bound("received", { ...f.received, eventID: "e".repeat(32), release: { version: "f".repeat(40) } });
    expect(await validateSentryProviderReceipt(f.input)).toContain("Sentry provider event identity/release does not match the candidate");
  });
  it("accepts documented normalized frames and narrow server browser/os enrichment", async () => {
    const f = fixture();
    const frame = { filename: "/_next/static/chunks/app.js", function: "render", lineno: 1, colno: 20, in_app: true };
    const stacktrace = { frames: [{ filename: frame.filename, absPath: frame.filename, function: "render", lineNo: 1, colNo: 20, inApp: true, vars: null, context: [], module: null, platform: null }], framesOmitted: null, registers: null, hasSystemFrames: false };
    f.evidence.sentEvent = f.bound("sent", { ...f.sent, exception: { values: [{ ...f.sent.exception.values[0], stacktrace: { frames: [frame] } }] } });
    f.evidence.providerEvent = f.bound("received", { ...f.received, entries: [{ type: "exception", data: { values: [{ ...f.sent.exception.values[0], stacktrace, rawStacktrace: stacktrace, module: null, mechanism: { type: "generic", handled: true } }] } }], contexts: { browser: { type: "browser", name: "Chrome", version: "132.0.0" }, os: { type: "os", name: "Windows", version: "11" } } });
    expect(await validateSentryProviderReceipt(f.input)).toEqual([]);
  });
  it.each(["private-path", "extra-field", "raw-private-path"])("rejects rehashed provider frames with %s", async (kind) => {
    const f = fixture();
    const frame = { filename: "/_next/static/chunks/app.js", function: "render", lineno: 1, colno: 20, in_app: true };
    const normalized = { filename: frame.filename, function: "render", lineNo: 1, colNo: 20, inApp: true };
    const bad = kind === "extra-field" ? { ...normalized, privateSave: "career data" } : { ...normalized, filename: "C:\\Users\\Private\\career.json" };
    f.evidence.sentEvent = f.bound("sent", { ...f.sent, exception: { values: [{ ...f.sent.exception.values[0], stacktrace: { frames: [frame] } }] } });
    const exception = { ...f.sent.exception.values[0], stacktrace: { frames: [kind === "raw-private-path" ? normalized : bad] }, ...(kind === "raw-private-path" ? { rawStacktrace: { frames: [bad] } } : {}) };
    f.evidence.providerEvent = f.bound("received", { ...f.received, entries: [{ type: "exception", data: { values: [exception] } }] });
    expect(await validateSentryProviderReceipt(f.input)).toContain("Sentry provider frames do not match the sanitized sent frame allowlist");
  });
  it.each(["private-tag", "private-title", "private-metadata", "private-entry-data", "unknown-top-level", "private-release-metadata"])("rejects rehashed provider privacy leaks in %s", async (kind) => {
    const f = fixture();
    const value: Record<string, unknown> = { ...f.received };
    if (kind === "private-tag") value.tags = [...f.received.tags, { key: "user.email", value: "private@example.test" }];
    if (kind === "private-title") value.title = "Private career save";
    if (kind === "private-metadata") value.metadata = { value: "Renderer exception (message omitted for privacy)", filename: "C:/Users/Private/save.json", privateSave: "private" };
    if (kind === "private-entry-data") value.entries = [{ type: "exception", data: { values: f.sent.exception.values, privateSave: "private" } }];
    if (kind === "unknown-top-level") value.privateSave = "private";
    if (kind === "private-release-metadata") value.release = { version: f.input.candidateSha, privateSave: "private" };
    f.evidence.providerEvent = f.bound("received", value);
    expect(await validateSentryProviderReceipt(f.input)).toEqual(expect.arrayContaining([expect.stringContaining("provider presentation") ]));
  });
  it("accepts documented harmless server presentation and normalized exception metadata", async () => {
    const f = fixture();
    f.evidence.providerEvent = f.bound("received", { ...f.received,
      id: "e".repeat(32), groupID: "123", size: 2500, previousEventID: null, nextEventID: null,
      title: "Error: Renderer exception (message omitted for privacy)",
      metadata: { type: "Error", value: "Renderer exception (message omitted for privacy)" },
      entries: [{ type: "exception", data: { values: f.sent.exception.values, excOmitted: null, hasSystemFrames: false } }],
      tags: [...f.received.tags, { key: "level", value: "error" }, { key: "browser.name", value: "Chrome" }],
      contexts: { browser: { type: "browser", name: "Chrome", version: "132.0" } },
      sdk: { name: "sentry.javascript.browser", version: "10.0.0" }, packages: {}, _meta: { entries: {}, tags: {} },
      fingerprints: ["f".repeat(32)], errors: [], dist: null,
    });
    expect(await validateSentryProviderReceipt(f.input)).toEqual([]);
  });
  it("rejects custom contexts hidden among otherwise safe browser enrichment", async () => {
    const f = fixture();
    f.evidence.providerEvent = f.bound("received", { ...f.received, contexts: { browser: { type: "browser", name: "Chrome", version: "132.0" }, career: { save: "private" } } });
    expect(await validateSentryProviderReceipt(f.input)).toContain("Sentry provider event contains personal, request, or custom context data");
  });
  it("rejects privacy leaks even when all file hashes are updated", async () => {
    const f = fixture();
    f.evidence.sentEvent = f.bound("sent", { ...f.sent, extra: { save: "private career" } });
    f.evidence.providerEvent = f.bound("received", { ...f.received, user: { email: "fixture@example.test" } });
    f.evidence.providerAttachments = f.bound("attachments", [{ id: "123" }]);
    const failures = await validateSentryProviderReceipt(f.input);
    expect(failures).toContain("Sentry sent event contains fields outside the privacy allowlist");
    expect(failures).toContain("Sentry provider event contains personal, request, or custom context data");
    expect(failures).toContain("Sentry provider event must have zero attachments");
  });
  it("rejects unsafe paths, missing controls, and failed provider retrieval", async () => {
    const f = fixture();
    f.evidence.provider.httpStatus = 404;
    f.evidence.controls.providerEventReadBack.status = "Unverified";
    f.evidence.providerEvent.path = "../outside.json";
    const failures = await validateSentryProviderReceipt(f.input);
    expect(failures).toEqual(expect.arrayContaining([expect.stringContaining("successful provider read-back"), expect.stringContaining("control providerEventReadBack"), expect.stringContaining("Sentry provider event:")]));
  });
});
