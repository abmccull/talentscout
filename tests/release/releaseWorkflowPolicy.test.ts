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

    expect(build).toContain("candidate-bundle:");
    expect(build).toContain("name: candidate-build-evidence");
    expect(build.match(/run: npm run electron:prepare/g)).toHaveLength(3);
    expect(build).toContain("run: npm run test:e2e:opening");
    expect(build).toContain("run: npm run test:e2e:performance");
    expect(build).not.toContain("softprops/action-gh-release");
    expect(build).not.toContain("steamcmd +login");
  });

  it("certifies original-run artifacts and makes promotion explicitly manual", () => {
    const certification = workflow("certify-release.yml");

    expect(certification).toMatch(/^on:\s*\r?\n\s+workflow_dispatch:/m);
    expect(certification).not.toMatch(/^\s+push:/m);
    expect(certification).toContain("run-id: ${{ inputs.candidate_run_id }}");
    expect(certification).toContain("environment: release-certification");
    expect(certification).toContain("environment: production-release");
    expect(certification).toContain("Prerelease/RC tags can never be uploaded to Steam");
    expect(certification).toContain(
      "if: inputs.publish_steam == true && needs.certify.outputs.prerelease == 'false'",
    );
  });
});
