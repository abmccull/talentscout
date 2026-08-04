import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installReleaseCertification } from "../../scripts/install-release-certification.mjs";

const tempDirs: string[] = [];

function write(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

function fixture() {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "talentscout-certification-install-"));
  tempDirs.push(workspaceRoot);
  const sourceDirectory = "release-certifications/v1.0.0-rc.7";
  const destinationDirectory = "candidate/artifacts/release/generated/certifications";
  mkdirSync(join(workspaceRoot, sourceDirectory), { recursive: true });
  mkdirSync(join(workspaceRoot, destinationDirectory), { recursive: true });
  write(join(workspaceRoot, destinationDirectory, "source-workflow-run.json"), "trusted");
  return { workspaceRoot, sourceDirectory, destinationDirectory };
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("release certification installer", () => {
  it("adds new independent evidence without touching accepted workflow evidence", async () => {
    const setup = fixture();
    write(join(setup.workspaceRoot, setup.sourceDirectory, "long-career-timing-exception.json"), "exception");
    write(join(setup.workspaceRoot, setup.sourceDirectory, "sessions", "nvda.json"), "nvda");

    const installed = await installReleaseCertification(setup);

    expect(installed).toEqual([
      "long-career-timing-exception.json",
      "sessions/nvda.json",
    ]);
    expect(readFileSync(
      join(setup.workspaceRoot, setup.destinationDirectory, "source-workflow-run.json"),
      "utf8",
    )).toBe("trusted");
  });

  it("rejects reserved GitHub workflow evidence names and shard trees", async () => {
    const setup = fixture();
    write(join(setup.workspaceRoot, setup.sourceDirectory, "source-workflow-jobs.json"), "forged");
    await expect(installReleaseCertification(setup)).rejects.toThrow(
      "may not replace trusted workflow evidence",
    );

    rmSync(join(setup.workspaceRoot, setup.sourceDirectory), { recursive: true, force: true });
    write(join(
      setup.workspaceRoot,
      setup.sourceDirectory,
      "source-long-career-shards",
      "seed-17.json",
    ), "forged");
    await expect(installReleaseCertification(setup)).rejects.toThrow(
      "may not replace trusted workflow evidence",
    );
  });

  it("rejects every collision with accepted evidence before copying anything", async () => {
    const setup = fixture();
    write(join(setup.workspaceRoot, setup.sourceDirectory, "new-evidence.json"), "new");
    write(join(setup.workspaceRoot, setup.sourceDirectory, "source-workflow-run.json"), "forged");

    await expect(installReleaseCertification(setup)).rejects.toThrow();
    expect(() => readFileSync(
      join(setup.workspaceRoot, setup.destinationDirectory, "new-evidence.json"),
      "utf8",
    )).toThrow();
  });

  it("rejects symbolic links in independent evidence", async () => {
    const setup = fixture();
    const target = join(setup.workspaceRoot, "outside.txt");
    write(target, "outside");
    symlinkSync(target, join(setup.workspaceRoot, setup.sourceDirectory, "linked.json"), "file");

    await expect(installReleaseCertification(setup)).rejects.toThrow(
      "may not contain symbolic links",
    );
  });
});
