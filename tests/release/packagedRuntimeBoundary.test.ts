import { describe, expect, it } from "vitest";

import {
  defaultPackagedAppDirectory,
  resourceDirectoryCandidates,
  uniqueTopLevelPackages,
} from "../../scripts/packaged-runtime-boundary.mjs";

describe("packaged runtime dependency boundary", () => {
  it.each([
    ["Windows separators", "\\node_modules\\steamworks.js\\index.js"],
    ["POSIX separators", "/node_modules/steamworks.js/index.js"],
  ])("recognizes the Steam bridge with %s", (_label, entry) => {
    expect(uniqueTopLevelPackages([entry])).toEqual(["steamworks.js"]);
  });

  it("handles scoped packages and ignores non-runtime entries consistently", () => {
    expect(uniqueTopLevelPackages([
      "/out/index.html",
      "/node_modules/@scope/runtime/index.js",
      "\\node_modules\\steamworks.js\\package.json",
      "/node_modules/steamworks.js/index.js",
    ])).toEqual(["@scope/runtime", "steamworks.js"]);
  });

  it("selects native output roots and macOS bundle resources without Windows assumptions", () => {
    expect(defaultPackagedAppDirectory("win32", "dist")).toMatch(/dist[\\/]win-unpacked$/);
    expect(defaultPackagedAppDirectory("linux", "dist")).toMatch(/dist[\\/]linux-unpacked$/);
    expect(defaultPackagedAppDirectory("darwin", "dist")).toBe("dist");
    expect(resourceDirectoryCandidates("dist/mac/TalentScout.app")).toEqual([
      expect.stringMatching(/TalentScout\.app[\\/]resources$/),
      expect.stringMatching(/TalentScout\.app[\\/]Contents[\\/]Resources$/),
    ]);
  });
});
