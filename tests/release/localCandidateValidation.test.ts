import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function run(root: string, command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function json(path: string, value: unknown) { writeFileSync(path, JSON.stringify(value)); }
function fixture(requireSentry = false) {
  const root = mkdtempSync(join(process.env.RELEASE_FIXTURE_ROOT ?? tmpdir(), "local-candidate-validation-"));
  directories.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "docs/release"), { recursive: true });
  mkdirSync(join(root, "artifacts/release/generated"), { recursive: true });
  for (const script of ["validate-release-candidate.mjs", "check-release-evidence.mjs", "stage-accepted-source-soak.mjs", "validate-sentry-provider-receipt.mjs"]) {
    copyFileSync(resolve("scripts", script), join(root, "scripts", script));
  }
  writeFileSync(join(root, ".gitignore"), "artifacts/\n");
  writeFileSync(join(root, "evidence.txt"), "Fixture evidence only\n");
  json(join(root, "package.json"), { version: "1.0.0" });
  json(join(root, "docs/release/release-evidence-status.json"), {
    schemaVersion: 2,
    candidate: { requireVersionTag: true, packageManifest: "artifacts/release/candidate-package-manifest.json", requiredPackageKinds: ["test-package"] },
    gates: requireSentry ? { sentryProviderReceipt: { status: "Unverified", evidence: [], generatedEvidence: { kind: "sentry-provider-receipt", path: "artifacts/release/generated/sentry.json" } } } : { fixture: { status: "Passed", evidence: ["evidence.txt"] } },
  });
  run(root, "git", ["init"]);
  run(root, "git", ["config", "user.email", "fixture@example.test"]);
  run(root, "git", ["config", "user.name", "Fixture"]);
  run(root, "git", ["add", "."]);
  run(root, "git", ["commit", "-m", "fixture"]);
  const sha = run(root, "git", ["rev-parse", "HEAD"]);
  const tree = run(root, "git", ["rev-parse", "HEAD^{tree}"]);
  const metadataPath = join(root, "artifacts/release/generated/accepted-candidate.json");
  const metadata = { schemaVersion: 1, verificationOnly: false, candidateCommitSha: sha, candidateTreeSha: tree, controlWorkflowSha: sha, candidateTag: "v1.0.0-rc.1", packageWorkflowRunId: "1234" };
  json(metadataPath, metadata);
  writeFileSync(join(root, "artifacts/package.bin"), "fixture package");
  json(join(root, "artifacts/release/candidate-package-manifest.json"), { schemaVersion: 2, candidateCommitSha: sha, candidateTag: metadata.candidateTag, productVersion: "1.0.0", workflowRunId: "1234", packages: [{ kind: "test-package", path: "artifacts/package.bin", bytes: 15, sha256: hash("fixture package") }] });
  const execute = (extra: string[] = []) => spawnSync(process.execPath, [join(root, "scripts/validate-release-candidate.mjs"), `--candidate-root=${root}`, ...extra], { cwd: root, encoding: "utf8" });
  return { root, metadata, metadataPath, execute };
}
afterEach(() => { for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("local-only candidate validation", () => {
  it("runs the strict validator successfully without creating refs or changing candidate files", () => {
    const f = fixture();
    const refs = run(f.root, "git", ["show-ref"]);
    const outcome = f.execute();
    expect(outcome.status, outcome.stderr).toBe(0);
    expect(outcome.stdout).toContain("LOCAL_CANDIDATE_VALIDATION_ONLY");
    expect(run(f.root, "git", ["show-ref"])).toBe(refs);
    expect(run(f.root, "git", ["status", "--porcelain"])).toBe("");
    const report = JSON.parse(readFileSync(join(f.root, "artifacts/release/release-evidence-check.json"), "utf8"));
    expect(report.status).toBe("Passed");
    expect(report.candidate.tagBindingMode).toBe("intended");
  }, 20_000);
  it("rejects mutation arguments rather than forwarding them", () => {
    const f = fixture();
    for (const arg of ["--publish-github", "--publish-steam", "--bind-tag", "--report-only"]) {
      const outcome = f.execute([arg]);
      expect(outcome.status).toBe(1);
      expect(outcome.stderr).toContain("Usage:");
    }
    expect(run(f.root, "git", ["tag", "--list"])).toBe("");
  }, 20_000);
  it("rejects a different control revision and verification-only bundle", () => {
    const f = fixture();
    json(f.metadataPath, { ...f.metadata, controlWorkflowSha: "f".repeat(40) });
    expect(f.execute().stderr).toContain("control revision does not match");
    json(f.metadataPath, { ...f.metadata, verificationOnly: true });
    expect(f.execute().stderr).toContain("accepted shipping candidate");
  }, 20_000);
  it("fails the real strict checker when the required Sentry receipt is missing", () => {
    const f = fixture(true);
    const outcome = f.execute();
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain("sentryProviderReceipt generated evidence: generated evidence cannot be read");
    expect(run(f.root, "git", ["tag", "--list"])).toBe("");
  }, 20_000);
  it("accepts a bound provider fixture through the real strict checker and rejects a rehashed wrong-candidate event", () => {
    const f = fixture(true);
    const providerId = "a".repeat(32);
    const values = [{ type: "Error", value: "Renderer exception (message omitted for privacy)" }];
    function bound(name: string, value: unknown) {
      const path = `artifacts/release/generated/${name}.json`;
      json(join(f.root, path), value);
      return { path, sha256: hash(readFileSync(join(f.root, path))) };
    }
    const sentEvent = bound("sent", { event_id: providerId, timestamp: Date.parse("2026-01-01T12:00:00Z") / 1000, platform: "javascript", level: "error", release: f.metadata.candidateCommitSha, environment: "production", tags: { runtime: "renderer" }, exception: { values } });
    const event = { eventID: providerId, platform: "javascript", type: "error", release: { version: f.metadata.candidateCommitSha }, dateReceived: "2026-01-01T12:00:01Z", tags: [{ key: "runtime", value: "renderer" }, { key: "environment", value: "production" }], entries: [{ type: "exception", data: { values } }] };
    const eventApiUrl = `https://sentry.io/api/0/projects/fixture/fixture/events/${providerId}/`;
    const receipt = {
      schemaVersion: 1, evidenceKind: "sentry-provider-receipt", candidateCommitSha: f.metadata.candidateCommitSha, candidateTreeSha: f.metadata.candidateTreeSha, candidateTag: f.metadata.candidateTag,
      packageManifestSha256: hash(readFileSync(join(f.root, "artifacts/release/candidate-package-manifest.json"))),
      testedPackage: { kind: "test-package", bytes: 15, sha256: hash("fixture package") }, status: "Passed", operator: "Fixture only", completedAt: "2026-01-01T12:02:00Z",
      controls: Object.fromEntries(["installedExactPackage", "intentionalRendererError", "providerEventReadBack", "payloadPrivacyReviewed"].map((key) => [key, { status: "Passed" }])),
      provider: { eventId: providerId, organization: "fixture", project: "fixture", eventApiUrl, httpStatus: 200, retrievedAt: "2026-01-01T12:01:00Z", attachmentsApiUrl: `${eventApiUrl}attachments/`, attachmentsHttpStatus: 200 },
      sentEvent, providerEvent: bound("received", event), providerAttachments: bound("attachments", []),
    };
    json(join(f.root, "artifacts/release/generated/sentry.json"), receipt);
    const passed = f.execute();
    expect(passed.status, passed.stderr).toBe(0);
    receipt.providerEvent = bound("received", { ...event, release: { version: "f".repeat(40) } });
    json(join(f.root, "artifacts/release/generated/sentry.json"), receipt);
    const failed = f.execute();
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain("Sentry provider event identity/release does not match the candidate");
    expect(run(f.root, "git", ["tag", "--list"])).toBe("");
  }, 20_000);
});
