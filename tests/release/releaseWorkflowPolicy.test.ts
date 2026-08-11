import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());

function workflow(name: string): string {
  return readFileSync(resolve(root, ".github", "workflows", name), "utf8");
}

function jobBlock(workflowText: string, jobId: string): string {
  const match = workflowText.match(
    new RegExp(`\\r?\\n  ${jobId}:\\r?\\n([\\s\\S]*?)(?=\\r?\\n  [a-z0-9-]+:\\r?\\n|$)`),
  );
  if (!match) throw new Error(`Missing workflow job: ${jobId}`);
  return match[1];
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
    for (const jobId of ["quality", "build-windows", "build-macos", "build-linux"]) {
      const block = jobBlock(acceptedCandidate, jobId);
      expect(block.match(/Isolate immutable candidate package workspace/g)).toHaveLength(1);
      expect(block.match(/package-lock\.release-control\.json/g)).toHaveLength(1);
      const isolationIndex = block.indexOf("Isolate immutable candidate package workspace");
      const installIndex = block.indexOf("run: npm ci");
      expect(installIndex).toBeGreaterThan(isolationIndex);
    }
    expect(acceptedCandidate).toContain("ESLINT_USE_FLAT_CONFIG: \"false\"");
    expect(acceptedCandidate).toContain(
      "./node_modules/.bin/eslint src --ext .js,.jsx,.ts,.tsx --no-eslintrc --config .eslintrc.json",
    );
    expect(acceptedCandidate).toContain("path: candidate");
    expect(acceptedCandidate).toContain("release/youth-ea-rc2");
    expect(acceptedCandidate).toContain("Pushing any v* tag still triggers legacy build.yml");
    expect(acceptedCandidate).toContain("run: node scripts/validate-steam-store-assets.mjs");
    expect(acceptedCandidate).toContain("name: release-control-store-readiness");
    expect(acceptedCandidate).toContain("node ../scripts/check-release-preflight.mjs --mode \"$mode\" --json");
    expect(acceptedCandidate).toContain("NEXT_PUBLIC_SENTRY_DSN: ${{ secrets.NEXT_PUBLIC_SENTRY_DSN }}");
    expect(acceptedCandidate).toContain("run: npm run test:e2e:opening");
    expect(acceptedCandidate).toContain("run: npm run test:e2e:performance");
    expect(acceptedCandidate).toContain("run: npm run test:e2e:youth-ea");
    expect(acceptedCandidate).toContain("run: npm run test:e2e:smoke");
    expect(acceptedCandidate).toContain("run: npm run test:e2e:accessibility");
    expect(acceptedCandidate).not.toContain("npm run test:release-soak");
    expect(acceptedCandidate).toContain("if: inputs.verification_only != true");
    expect(acceptedCandidate).toContain("name: accepted-candidate-bundle");
    expect(acceptedCandidate).toContain("node ../scripts/validate-release-artifacts.mjs --out=artifacts/release/release-artifact-inventory.json --promote=artifacts/release/promotion-files.txt");
    expect(acceptedCandidate.match(/node \.\.\/scripts\/validate-release-artifacts\.mjs --out=artifacts\/release\/release-artifact-inventory\.json --promote=artifacts\/release\/promotion-files\.txt/g)).toHaveLength(2);
    expect(acceptedCandidate).toContain('fs.rmSync("artifacts/release/release-artifact-inventory.json")');
    expect(acceptedCandidate).toContain("artifacts/release/release-artifact-inventory.json");
    expect(acceptedCandidate).toContain("artifacts/release/promotion-files.txt");
    expect(acceptedCandidate).toContain("artifacts/release/generated/steam-depot-inventories.json");
    expect(acceptedCandidate).toContain('gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${SOURCE_WORKFLOW_RUN_ID}/artifacts?per_page=100"');
    expect(acceptedCandidate).not.toContain('gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"');
    expect(acceptedCandidate).not.toContain("${CANDIDATE_TAG}^{commit}");
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
    expect(certification).toContain("release/youth-ea-rc2");
    expect(certification).toContain("run-id: ${{ inputs.candidate_run_id }}");
    expect(certification).toContain("environment: release-certification");
    expect(certification).toContain("environment: production-release");
    expect(certification).toContain("name: accepted-candidate-bundle");
    expect(certification).toContain("id: bundle_metadata");
    expect(certification).toContain("controlWorkflowSha does not match the current certification control SHA");
    expect(certification).toContain("ref: ${{ steps.bundle_metadata.outputs.candidate_sha }}");
    expect(certification).toContain("path: candidate");
    expect(certification).toContain("RELEASE_EVIDENCE_STATUS: ../docs/release/release-evidence-status.json");
    expect(certification).toContain("working-directory: candidate");
    expect(certification).toContain("node ../scripts/check-release-preflight.mjs --mode certify --json");
    expect(certification).toContain("run: node ../scripts/check-release-evidence.mjs");
    expect(certification).toContain("RELEASE_TAG_BINDING_MODE: intended");
    expect(certification).toContain("node scripts/install-release-certification.mjs");
    expect(certification).toContain("--destination=candidate/artifacts/release/generated/certifications");
    expect(certification).toContain('gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${CANDIDATE_RUN_ID}" > candidate/artifacts/release/generated/certifications/package-workflow-run.json');
    expect(certification).toContain('gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${CANDIDATE_RUN_ID}/jobs?per_page=100" > candidate/artifacts/release/generated/certifications/package-workflow-jobs.json');
    expect(certification).toContain("release-artifact-inventory.json");
    expect(certification).toContain("promotion-files.txt");
    expect(certification).toContain("promotion file byte identity does not match the accepted inventory");
    expect(certification).toContain("blockmapSha256");
    expect(certification).toContain("files: ${{ steps.promotion_manifest.outputs.files }}");
    expect(certification).toContain("accepted candidate bundle is missing artifacts/release/release-artifact-inventory.json");
    expect(certification).toContain("Prerelease/RC tags can never be uploaded to Steam");
    expect(certification).toContain("bind-tag:");
    expect(certification).toContain("Bind certified candidate tag without recursive workflows");
    expect(certification).toContain("refs/tags/${tag}");
    expect(certification).toContain("needs: [certify, bind-tag]");
    expect(certification).toContain("GitHub release tag is not bound to certified commit");
    expect(certification).toContain(
      "if: inputs.publish_steam == true && needs.certify.outputs.prerelease == 'false'",
    );
    expect(certification).toContain("ref: ${{ needs.certify.outputs.candidate_sha }}");
    expect(certification).toContain("node ../scripts/check-release-preflight.mjs --mode promote-steam --json");
    expect(certification).toContain("$GITHUB_WORKSPACE/candidate/steamcmd/app_build_4455570.vdf");
    expect(certification).not.toContain('pattern: "*-build"');
    expect(certification).not.toContain("release-artifacts/windows-build/*");
    expect(certification).not.toContain("ref: ${{ inputs.candidate_tag }}");
  });
});
