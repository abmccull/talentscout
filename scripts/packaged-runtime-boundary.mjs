import path from "node:path";

/**
 * Extract top-level runtime dependencies from electron/asar's entry list.
 * electron/asar has emitted both POSIX and Windows separators across versions
 * and hosts, so package validation must not depend on the build platform.
 */
export function uniqueTopLevelPackages(entries) {
  const packages = new Set();
  for (const entry of entries) {
    const normalized = entry.replaceAll("\\", "/");
    if (!normalized.startsWith("/node_modules/")) continue;
    const segments = normalized.split("/").filter(Boolean);
    if (segments[0] !== "node_modules" || segments.length < 2) continue;
    if (segments[1].startsWith("@") && segments.length >= 3) {
      packages.add(`${segments[1]}/${segments[2]}`);
      continue;
    }
    packages.add(segments[1]);
  }
  return [...packages].sort();
}

export function defaultPackagedAppDirectory(platform, distDirectory = "dist") {
  if (platform === "win32") return path.join(distDirectory, "win-unpacked");
  if (platform === "linux") return path.join(distDirectory, "linux-unpacked");
  if (platform === "darwin") return distDirectory;
  throw new Error(`Unsupported Electron packaging platform: ${platform}`);
}

export function resourceDirectoryCandidates(appDirectory) {
  return [
    path.join(appDirectory, "resources"),
    path.join(appDirectory, "Contents", "Resources"),
  ];
}
