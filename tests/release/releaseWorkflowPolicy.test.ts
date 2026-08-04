import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());

function workflow(name: string): string {
  return readFileSync(resolve(root, ".github", "workflows", name), "utf8");
}

describe("release workflow policy", () => {
  it("constructs immutable candidates without publishing or uploading to Steam", () => {
    const build = workflow("build.yml");
    const acceptedCandidate = workflow("package-accepted-candidate.yml");

    expect(build).toContain("candidate-bundle:");
    expect(build).toContain("name: candidate-build-evidence");
    expect(build.match(/run: npm run electron:prepare/g)).toHaveLength(3);
    expect(build).toContain("run: npm run test:e2e:opening");
    expect(build).toContain("run: npm run test:e2e:performance");
    expect(build).toContain("run: npm run test:coverage:critical");
    expect(build).toContain("name: quality-evidence");
    expect(build).toContain("Critical coverage summary is missing from quality evidence");
    expect(build).not.toContain("softprops/action-gh-release");
    expect(build).not.toContain("steamcmd +login");

    expect(acceptedCandidate).toMatch(/^on:\s*\r?\n\s+workflow_dispatch:/m);
    expect(acceptedCandidate).toContain("candidate_sha:");
    expect(acceptedCandidate).toContain("candidate_tree_sha:");
    expect(acceptedCandidate).toContain("candidate_tag:");
    expect(acceptedCandidate).toContain("accepted_source_run_id:");
    expect(acceptedCandidate).toContain("verification_only:");
    expect(acceptedCandidate).toContain("path: candidate");
    expect(acceptedCandidate).toContain("run: npm run test:e2e:opening");
    expect(acceptedCandidate).toContain("run: npm run test:e2e:performance");
    expect(acceptedCandidate).toContain("run: npm run test:e2e:youth-ea");
    expect(acceptedCandidate).toContain("run: npm run test:e2e:smoke");
    expect(acceptedCandidate).toContain("run: npm run test:e2e:accessibility");
    expect(acceptedCandidate).not.toContain("npm run test:release-soak");
    expect(acceptedCandidate).toContain("if: inputs.verification_only != true");
    expect(acceptedCandidate).toContain("name: accepted-candidate-bundle");
    expect(acceptedCandidate).toContain('gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${SOURCE_WORKFLOW_RUN_ID}/artifacts?per_page=100"');
    expect(acceptedCandidate).not.toContain("softprops/action-gh-release");
    expect(acceptedCandidate).not.toContain("steamcmd +login");
  });

  it("runs the critical coverage floor in CI and a full browser suite nightly", () => {
    const ci = workflow("ci.yml");
    const nightly = workflow("nightly-soak.yml");

    expect(ci).toContain("run: npm run test:coverage:critical");
    expect(nightly).toContain("browser-regression:");
    expect(nightly).toContain("name: Full Chromium browser regression");
    expect(nightly).toMatch(/^\s*- run: npm run test:e2e\s*$/m);
  });

  it("certifies accepted candidate bundles from control policy and promotes only explicit files", () => {
    const certification = workflow("certify-release.yml");

    expect(certification).toMatch(/^on:\s*\r?\n\s+workflow_dispatch:/m);
    expect(certification).not.toMatch(/^\s+push:/m);
    expect(certification).toContain("run-id: ${{ inputs.candidate_run_id }}");
    expect(certification).toContain("environment: release-certification");
    expect(certification).toContain("environment: production-release");
    expect(certification).toContain("name: accepted-candidate-bundle");
    expect(certification).toContain("path: candidate");
    expect(certification).toContain("RELEASE_EVIDENCE_STATUS: ../docs/release/release-evidence-status.json");
    expect(certification).toContain("working-directory: candidate");
    expect(certification).toContain("run: node ../scripts/check-release-evidence.mjs");
    expect(certification).toContain("bundle/artifacts/release/promotion-files.txt");
    expect(certification).toContain("files: ${{ steps.promotion.outputs.files }}");
    expect(certification).toContain("Prerelease/RC tags can never be uploaded to Steam");
    expect(certification).toContain(
      "if: inputs.publish_steam == true && needs.certify.outputs.prerelease == 'false'",
    );
    expect(certification).not.toContain('pattern: "*-build"');
    expect(certification).not.toContain("release-artifacts/windows-build/*");
  });
});
