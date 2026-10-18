// Failure-first process contract for the real Windows package-input boundary.
// Copy into tests/release before applying the accompanying source patch.
// Run from the candidate: node --test tests/release/windowsInstallerInputs.test.mjs
// This contract never builds, launches Electron, installs/uninstalls a package,
// downloads files, or changes provider state. All package bytes are synthetic.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const source = path.resolve(process.env.TALENTSCOUT_RELEASE_SOURCE ?? process.cwd());
const helper = path.join(source, "scripts/run-windows-packaged-runtime-check.mjs");
const require = createRequire(path.join(source, "package.json"));
const playwrightPackagePath = require.resolve("playwright/package.json");
const playwrightMetadata = JSON.parse(await readFile(playwrightPackagePath, "utf8"));
const playwrightImportEntry = playwrightMetadata.exports?.["."]?.import;
assert.equal(typeof playwrightImportEntry, "string", "Playwright must declare its ESM import entry for fixture loading");
const playwrightUrl = pathToFileURL(path.resolve(path.dirname(playwrightPackagePath), playwrightImportEntry)).href;
const head = "a".repeat(40);
const defaultInstaller = "dist/TalentScout-Setup-1.0.0.exe";
const acceptedInstaller = "release-artifacts/windows-build/TalentScout-Setup-1.0.0.exe";
const bytes = Buffer.from("MZ synthetic installer fixture; never executed\n");
const sha = value => createHash("sha256").update(value).digest("hex");

async function fixture() {
  const base = await mkdtemp(path.join(tmpdir(), "talentscout-installer-inputs-"));
  const root = path.join(base, "candidate");
  await mkdir(path.join(root, "dist/win-unpacked/resources"), { recursive: true });
  await mkdir(path.join(root, "release-artifacts/windows-build"), { recursive: true });
  await mkdir(path.join(root, "artifacts/release"), { recursive: true });
  await writeFile(path.join(root, "dist/win-unpacked/TalentScout.exe"), "synthetic unpacked executable; never executed");
  await writeFile(path.join(root, "dist/win-unpacked/resources/app.asar"), "synthetic ASAR; never executed");
  await writeFile(path.join(root, defaultInstaller), bytes);
  await writeFile(path.join(root, acceptedInstaller), bytes);
  const manifest = { schemaVersion: 2, candidateCommitSha: head, packages: [
    { kind: "windows-installer", path: defaultInstaller, bytes: bytes.length, sha256: sha(bytes) },
  ] };
  // Instrument only module loading and private visibility. All selected-path,
  // file access, artifact hashing, manifest, and install preconditions run the
  // real candidate source code. Import prevents its direct-entry main() path.
  const sourceText = await readFile(helper, "utf8");
  assert.match(sourceText, /from "playwright"/);
  const instrumented = sourceText.replace('from "playwright"', `from ${JSON.stringify(playwrightUrl)}`)
    + "\nexport { INSTALLER, artifactMetadata, assertRequiredFiles, inspectManifestBinding, runExactCandidateInstallJourney };\n";
  const modulePath = path.join(base, "real-candidate-boundary.mjs");
  await writeFile(modulePath, instrumented);
  return { base, root, manifest, modulePath };
}

async function invoke(f, args = [], journey = null) {
  await writeFile(path.join(f.root, "artifacts/release/candidate-package-manifest.json"), JSON.stringify(f.manifest));
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import path from "node:path";
    import { pathToFileURL } from "node:url";
    process.argv = [process.execPath, "fixture-runner-only", ...JSON.parse(process.env.FIXTURE_ARGS)];
    try {
      const module = await import(pathToFileURL(process.env.FIXTURE_MODULE).href);
      await module.assertRequiredFiles();
      const artifact = await module.artifactMetadata("windows-installer", module.INSTALLER);
      const binding = await module.inspectManifestBinding(${JSON.stringify(head)}, artifact);
      const journeyInput = JSON.parse(process.env.FIXTURE_JOURNEY);
      const journey = journeyInput ? await module.runExactCandidateInstallJourney({
        evidenceDir: path.resolve("artifacts/release/never-installed"), head: ${JSON.stringify(head)},
        sourceTreeClean: journeyInput.clean, manifestBinding: {passed: journeyInput.bound},
        authenticode: {Status: journeyInput.signature}, expectedAsarSha256: "unused-no-install"
      }) : null;
      console.info(JSON.stringify({selected: artifact.path, artifact, binding, journey}));
    } catch (error) {
      console.info(JSON.stringify({error: error.message, errorName: error.name, errorCode: error.code ?? null}));
      process.exitCode = 1;
    }
  `], { cwd: f.root, encoding: "utf8", windowsHide: true, timeout: 30000,
    env: {...process.env, FIXTURE_ARGS: JSON.stringify(args), FIXTURE_MODULE: f.modulePath, FIXTURE_JOURNEY: JSON.stringify(journey)},
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.ok(child.stdout.trim(), child.stderr || "child process returned no contract result");
  const response = JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
  assert.ok(response.errorName !== "SyntaxError"
    && !["ERR_MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED", "ERR_REQUIRE_ESM"].includes(response.errorCode),
    `Unexpected fixture/module loading failure before installer behavior: ${response.errorName ?? ""} ${response.errorCode ?? ""} ${response.error ?? ""}; helper=${helper}; Playwright ESM=${playwrightUrl}`);
  return { code: child.status, ...response };
}

async function scenario(body) {
  const f = await fixture();
  try { await body(f); }
  finally {
    const target = path.resolve(f.base);
    assert.ok(target.startsWith(path.resolve(tmpdir()) + path.sep)
      && path.basename(target).startsWith("talentscout-installer-inputs-"), "cleanup must stay in the disposable fixture");
    await rm(target, {recursive: true, force: true});
  }
}

test("default dist installer retains exact manifest binding", () => scenario(async f => {
  const result = await invoke(f);
  assert.equal(result.code, 0); assert.equal(result.selected, defaultInstaller);
  assert.equal(result.binding.passed, true);
}));
test("accepted bundle installer path binds without changing the canonical manifest", () => scenario(async f => {
  f.manifest.packages[0].path = acceptedInstaller;
  const result = await invoke(f, [`--installer=${acceptedInstaller}`]);
  assert.equal(result.code, 0); assert.equal(result.selected, acceptedInstaller);
  assert.equal(result.binding.passed, true);
}));
test("missing explicit installer cannot fall back to an existing dist installer", () => scenario(async f => {
  const result = await invoke(f, ["--installer=release-artifacts/windows-build/missing.exe"]);
  assert.notEqual(result.code, 0); assert.match(result.error, /ENOENT|not found/i);
}));
test("equal bytes at another path do not satisfy exact manifest path equality", () => scenario(async f => {
  const result = await invoke(f, [`--installer=${acceptedInstaller}`]);
  assert.equal(result.code, 0); assert.equal(result.binding.passed, false);
  assert.ok(result.binding.failures.includes("installer path does not match manifest"));
}));
for (const [name, mutate, expected] of [
  ["hash mismatch", entry => {entry.sha256 = "b".repeat(64);}, "installer SHA-256 does not match manifest"],
  ["length mismatch", entry => {entry.bytes += 1;}, "installer byte length does not match manifest"],
]) {
  test(`${name} remains a binding failure`, () => scenario(async f => {
    mutate(f.manifest.packages[0]);
    const result = await invoke(f); assert.equal(result.binding.passed, false);
    assert.ok(result.binding.failures.includes(expected));
  }));
}
test("another candidate SHA cannot bind", () => scenario(async f => {
  f.manifest.candidateCommitSha = "b".repeat(40);
  const result = await invoke(f); assert.equal(result.binding.passed, false);
  assert.ok(result.binding.failures.includes("manifest candidate SHA does not match HEAD"));
}));
test("missing Windows manifest entry cannot bind", () => scenario(async f => {
  f.manifest.packages = [];
  const result = await invoke(f); assert.equal(result.binding.passed, false);
  assert.ok(result.binding.failures.includes("manifest has no windows-installer entry"));
}));
for (const [name, args, expected] of [
  ["parent traversal", ["--installer=../outside.exe"], /escapes the repository/],
  ["nested traversal", ["--installer=dist/../../outside.exe"], /escapes the repository/],
  ["absolute Windows path", ["--installer=C:\\outside.exe"], /repository-relative path/],
  ["absolute POSIX path", ["--installer=/outside.exe"], /repository-relative path/],
  ["empty explicit path", ["--installer="], /nonempty repository-relative path/],
  ["missing equals value", ["--installer"], /nonempty repository-relative path/],
  ["duplicate selection", [`--installer=${defaultInstaller}`, `--installer=${acceptedInstaller}`], /at most one/],
  ["non-executable extension", ["--installer=dist/installer.zip"], /\.exe file/],
]) {
  test(`${name} is rejected before any runtime journey`, () => scenario(async f => {
    const result = await invoke(f, args);
    assert.notEqual(result.code, 0); assert.match(result.error, expected);
  }));
}
test("a directory junction or symlink cannot move installer reads outside the repository", () => scenario(async f => {
  const outside = path.join(f.base, "outside");
  await mkdir(outside); await writeFile(path.join(outside, "fixture.exe"), bytes);
  await symlink(outside, path.join(f.root, "redirect"), process.platform === "win32" ? "junction" : "dir");
  f.manifest.packages[0].path = "redirect/fixture.exe";
  const result = await invoke(f, ["--installer=redirect/fixture.exe"]);
  assert.notEqual(result.code, 0); assert.match(result.error, /resolves outside the repository/);
}));
for (const [name, journey, expected] of [
  ["unsigned installer", {clean:true,bound:true,signature:"NotSigned"}, "valid Authenticode signature"],
  ["dirty candidate", {clean:false,bound:true,signature:"Valid"}, "working tree is not clean"],
  ["unbound manifest", {clean:true,bound:false,signature:"Valid"}, "not bound to the candidate manifest"],
]) {
  test(`${name} still prevents the actual installer journey`, () => scenario(async f => {
    const result = await invoke(f, ["--install-journey"], journey);
    assert.equal(result.code, 0); assert.notEqual(result.journey.status, "Passed");
    assert.ok(result.journey.failures.some(failure => failure.includes(expected)));
    assert.equal(result.journey.install, null);
  }));
}
