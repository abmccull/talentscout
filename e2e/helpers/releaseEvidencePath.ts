import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const FULL_GIT_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

export interface VisualEvidenceProvenance {
  commitSha: string | null;
  baseTreeSha: string | null;
  dirty: boolean;
  dirtyFingerprint: string | null;
  slug: string;
}

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function normalizeGitSha(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return FULL_GIT_SHA.test(normalized) ? normalized : null;
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 12) : "unknown";
}

export function buildVisualEvidenceProvenance(
  input: Pick<VisualEvidenceProvenance, "commitSha" | "baseTreeSha" | "dirty" | "dirtyFingerprint">,
): VisualEvidenceProvenance {
  const commitSha = normalizeGitSha(input.commitSha);
  const baseTreeSha = normalizeGitSha(input.baseTreeSha);
  const dirtyFingerprint = input.dirty
    ? input.dirtyFingerprint?.trim().toLowerCase() || "unknown"
    : null;

  const slug = input.dirty
    ? [
        `head-${shortSha(commitSha)}`,
        `base-tree-${shortSha(baseTreeSha)}`,
        `dirty-${dirtyFingerprint}`,
      ].join("__")
    : `candidate-${shortSha(commitSha)}`;

  return {
    commitSha,
    baseTreeSha,
    dirty: input.dirty,
    dirtyFingerprint,
    slug,
  };
}

export function fingerprintDirtyVisualEvidence(
  status: string,
  trackedDiff: string,
  untracked: Array<{ path: string; sha256: string }>,
): string {
  return createHash("sha256").update(JSON.stringify({
    status, trackedDiff,
    untracked: [...untracked].sort((left, right) => left.path.localeCompare(right.path)),
  })).digest("hex").slice(0, 12);
}

function detectVisualEvidenceProvenance(): VisualEvidenceProvenance {
  const commitSha = normalizeGitSha(
    git(["rev-parse", "HEAD"]) ?? process.env.GITHUB_SHA ?? null,
  );
  const baseTreeSha = normalizeGitSha(git(["rev-parse", "HEAD^{tree}"]));
  const statusOutput = git(["status", "--porcelain", "--untracked-files=all"]) ?? "";
  const dirty = statusOutput.trim().length > 0;
  const dirtyFingerprint = dirty
    ? fingerprintDirtyVisualEvidence(statusOutput, git(["diff", "--binary", "HEAD"]) ?? "unavailable", (
        git(["ls-files", "--others", "--exclude-standard", "-z"]) ?? ""
      ).split("\0").filter(Boolean).map((file) => ({
        path: file,
        sha256: createHash("sha256").update(readFileSync(path.resolve(file))).digest("hex"),
      })))
    : null;

  return buildVisualEvidenceProvenance({
    commitSha,
    baseTreeSha,
    dirty,
    dirtyFingerprint,
  });
}

const visualEvidenceProvenance = detectVisualEvidenceProvenance();

export function getVisualEvidenceDirectory(suiteName: string): string {
  const root = path.resolve(
    process.cwd(),
    process.env.VISUAL_EVIDENCE_OUTPUT_ROOT
      ?? "artifacts/release/generated/visual-evidence",
  );
  const marker = path.resolve("out-e2e", ".e2e-bridge.json");
  const compiledHash = existsSync(marker)
    ? (JSON.parse(readFileSync(marker, "utf8")) as { compiledRuntimeSha256?: string }).compiledRuntimeSha256
    : undefined;
  const build = compiledHash && /^[a-f0-9]{64}$/.test(compiledHash)
    ? `build-${compiledHash.slice(0, 12)}` : "unbound-build";
  return path.join(root, visualEvidenceProvenance.slug, build, suiteName);
}

export function getVisualEvidenceProvenance(): VisualEvidenceProvenance {
  return visualEvidenceProvenance;
}
