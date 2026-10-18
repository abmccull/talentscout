// Persistent installed-consumer E2E gate. Cases/oracles were frozen before ts.2.
// This candidate-only subset does not replace the full 108-case paired matrix.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const source = path.resolve(path.dirname(SELF), "../..");
const fixturePath = path.join(path.dirname(SELF), "fixtures/braces-depth-guard-regression-cases.json");
const generated = path.join(source, "artifacts/release/generated");
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => process.platform === 'win32' ? value.toLowerCase() : value;
const same = (a, b) => canonical(path.resolve(a)) === canonical(path.resolve(b));
const inside = (root, file) => { const r = path.relative(root, file); return r !== '' && r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r); };
function need(value, message) { if (!value) throw new Error(message); }
function abs(value) { need(typeof value === 'string' && path.isAbsolute(value) && !/[\r\n\0]/.test(value), 'Absolute path required'); return path.resolve(value); }
function physical(value) {
  const full = abs(value), st = fs.lstatSync(full);
  need(st.isDirectory() && !st.isSymbolicLink() && same(fs.realpathSync.native(full), full), 'Physical directory required');
  return full;
}
const identity = st => Object.fromEntries(['dev','ino','mode','nlink','size','mtimeNs','ctimeNs','birthtimeNs'].map(key => { need(typeof st[key] === 'bigint', 'Missing identity field'); return [key, st[key].toString()]; }));
const equalIdentity = (a, b) => JSON.stringify(identity(a)) === JSON.stringify(identity(b));
// Node22 Windows path stat may expose dev=0 while fd stat exposes the volume serial.
// Full identities still must stay stable within each observation family.
function pathDescriptorEqual(pathStat, descriptorStat) {
  if (equalIdentity(pathStat, descriptorStat)) return true;
  if (process.platform !== 'win32' || pathStat.dev !== 0n || descriptorStat.dev === 0n) return false;
  const pathname = identity(pathStat), descriptor = identity(descriptorStat);
  pathname.dev = descriptor.dev;
  return JSON.stringify(pathname) === JSON.stringify(descriptor);
}
function readOrdinary(value, owner, limit = 16777216) {
  const full = abs(value);
  if (owner) need(inside(physical(owner), full), 'Read outside admitted owner');
  const before = fs.lstatSync(full, { bigint: true });
  need(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size <= BigInt(limit) && same(fs.realpathSync.native(full), full), 'Ordinary single-link bounded file required');
  const fd = fs.openSync(full, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  let answer;
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    need(pathDescriptorEqual(before, opened), 'File changed before open');
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) { const n = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); need(n > 0, 'Premature EOF'); offset += n; }
    need(fs.readSync(fd, Buffer.alloc(1), 0, 1, offset) === 0, 'File grew during read');
    const ended = fs.fstatSync(fd, { bigint: true }), final = fs.lstatSync(full, { bigint: true });
    need(equalIdentity(opened, ended) && equalIdentity(before, final) && pathDescriptorEqual(final, ended) && final.isFile() && !final.isSymbolicLink() && same(fs.realpathSync.native(full), full), 'File/path changed around read');
    answer = { path: full, bytes, sha256: sha(bytes), identity: identity(ended) };
  } finally { fs.closeSync(fd); }
  return answer;
}
const decode = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
function writeNew(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' }); }
function errorView(error) { return { name: String(error?.name ?? typeof error), code: typeof error?.code === 'string' ? error.code : null, message: String(error?.message ?? error) }; }

// Fixture construction and iterative projection reused from the pre-code matrix.
function nested(shape, depth) {
  need(Number.isInteger(depth) && depth >= 0 && depth <= 4000, 'Frozen nesting bound');
  const opens = [];
  for (let i = 0; i < depth; i++) opens.push(shape === 'brace' ? '{' : shape === 'paren' ? '(' : i % 2 === 0 ? '{' : '(');
  return opens.join('') + 'x' + opens.slice().reverse().map(x => x === '{' ? '}' : ')').join('');
}
function astChain(depth) {
  let node = { type:'text', value:'x' };
  for (let i = 0; i < depth; i++) {
    const parent = { type:'paren', nodes:[{ type:'text', value:'(' }, node, { type:'text', value:')' }] };
    for (const child of parent.nodes) child.parent = parent;
    node = parent;
  }
  const root = { type:'root', nodes:[node] }; node.parent = root; return root;
}
function fixtureInput(recipe) {
  if (recipe.kind === 'literal') return recipe.value;
  if (recipe.kind === 'nested-string') return nested(recipe.shape, recipe.depth);
  if (recipe.kind === 'literal-delimiters') return '"' + '{'.repeat(recipe.count) + '"';
  if (recipe.kind === 'ast-chain') return astChain(recipe.depth);
  if (recipe.kind === 'ast-child-cycle') { const ast = astChain(1), node = ast.nodes[0]; node.nodes = [node]; return ast; }
  if (recipe.kind === 'ast-parent') {
    const ast = astChain(1), node = ast.nodes[0];
    if (recipe.cycle === 'self') node.parent = node;
    else if (recipe.cycle === 'two') { const other = { type:'paren', parent:node }; node.parent = other; }
    else { let parent = ast; for (let i = 1; i < recipe.depth; i++) parent = { type:'paren', parent }; node.parent = parent; }
    return ast;
  }
  throw new Error('Unknown frozen fixture recipe');
}
function project(value, limits) {
  const seen = new Map(), queue = [], records = [];
  let properties = 0;
  function atom(item) {
    if (item === null) return { kind:'null' };
    if (typeof item === 'string') { need(item.length <= limits.maxStringCharacters, 'Observation string bound'); return { kind:'string', value:item }; }
    if (typeof item === 'boolean') return { kind:'boolean', value:item };
    if (typeof item === 'number') return { kind:'number', value:Number.isNaN(item) ? 'NaN' : Object.is(item,-0) ? '-0' : String(item) };
    if (typeof item === 'undefined') return { kind:'undefined' };
    need(typeof item === 'object', 'Unsupported consumer result kind');
    need(Array.isArray(item) || Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null, 'Unsupported consumer result prototype');
    if (!seen.has(item)) { need(queue.length < limits.maxObjects, 'Observation object bound'); seen.set(item, queue.length); queue.push(item); }
    return { kind:'ref', id:seen.get(item) };
  }
  const root = atom(value);
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index], fields = [];
    need(Object.getOwnPropertySymbols(item).length === 0, 'Unrepresented result symbol');
    for (const key of Object.keys(item).sort()) {
      need(++properties <= limits.maxProperties, 'Observation property bound');
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      need(descriptor && Object.hasOwn(descriptor, 'value'), 'Result accessor is outside observation contract');
      fields.push([key, atom(descriptor.value)]);
    }
    records.push({ id:index, kind:Array.isArray(item) ? 'array' : Object.getPrototypeOf(item) === null ? 'null-prototype-object' : 'object', ...(Array.isArray(item) ? { length:item.length } : {}), fields });
  }
  const bytes = Buffer.from(JSON.stringify({ root, records }));
  need(bytes.length <= limits.maxEncodedBytes, 'Observation encoded-byte bound');
  return { format:'iterative-enumerable-graph-v1', sha256:sha(bytes), bytes:bytes.length, objects:records.length, properties, preview:records.slice(0,2), complete:true, parentAndPrevRepresentedAsReferences:true };
}
function makeLayout(owner) {
  const pages = path.join(owner,'projects','alpha','pages');
  fs.mkdirSync(pages,{ recursive:true });
  fs.writeFileSync(path.join(pages,'about.js'),'// Disposable page-discovery fixture only.\n',{ flag:'wx' });
}
function nextVerify(modules, owner, recipe, sources) {
  const { Linter } = modules.eslint, plugin = modules.nextPlugin.default ?? modules.nextPlugin;
  const prefix = owner.replace(/\\/g,'/') + '/projects/';
  let rootDir = prefix + '{missing,alpha}';
  if (recipe.mode === 'array') rootDir = [prefix + 'missing',rootDir];
  if (recipe.mode === 'windows') rootDir = rootDir.replace(/\//g,'\\');
  if (recipe.mode === 'deep') rootDir = prefix + '{'.repeat(101) + 'alpha' + '}'.repeat(101);
  const linter = new Linter({ cwd:owner, configType:'flat' });
  const config = [{ files:['**/*.jsx'], languageOptions:{ ecmaVersion:2022, sourceType:'module', parserOptions:{ ecmaFeatures:{ jsx:true } } }, plugins:{ '@next/next':plugin }, settings:{ next:{ rootDir } }, rules:{ '@next/next/no-html-link-for-pages':'error' } }];
  const verify = code => linter.verify(code,config,{ filename:path.join(owner,'probe.jsx'),allowInlineConfig:false });
  return { internal:verify(sources.internal),external:verify(sources.external) };
}

function filePin(file, owner) {
  const value = readOrdinary(file, owner);
  return { path: value.path, bytes: value.bytes.length, sha256: value.sha256 };
}
function catalog() {
  const fixture = readOrdinary(fixturePath, path.dirname(fixturePath));
  const value = decode(fixture.bytes);
  need(value.schema === "installed-braces-regression-cases-v1" && value.cases.length === 32
    && new Set(value.cases.map(item => item.id)).size === 32, "Frozen regression selection differs");
  need(value.ceiling === 100 && value.childDeadlineMs === 5000 && value.childOldSpaceMiB === 128,
    "Frozen depth/child controls differ");
  need(value.installedIdentity.name === "@talentscout/braces-depth-guard"
    && value.installedIdentity.version === "3.0.3-ts.2" && value.installedIdentity.files.length === 12,
    "Reviewed installed identity/file count differs");
  return { value, pin: { path: fixturePath, bytes: fixture.bytes.length, sha256: fixture.sha256 } };
}
function installed(cases) {
  const modules = physical(path.join(source, "node_modules"));
  const req = createRequire(path.join(source, "package.json"));
  const entries = Object.fromEntries(Object.entries({
    braces: "braces", micromatch: "micromatch", fastGlob: "fast-glob",
    nextPlugin: "@next/eslint-plugin-next", eslint: "eslint",
  }).map(([key, name]) => [key, req.resolve(name)]));
  for (const entry of Object.values(entries)) {
    need(inside(modules, entry), "Installed consumer escaped Source node_modules");
    readOrdinary(entry, modules);
  }
  const bracesRoot = physical(path.dirname(entries.braces));
  const manifest = decode(readOrdinary(path.join(bracesRoot, "package.json"), bracesRoot).bytes);
  need(manifest.name === cases.installedIdentity.name
    && manifest.version === cases.installedIdentity.version && manifest.private === true,
  "Installed Braces private identity differs");
  const files = cases.installedIdentity.files.map(expected => {
    const actual = filePin(path.join(bracesRoot, expected.path), bracesRoot);
    need(actual.bytes === expected.bytes && actual.sha256 === expected.sha256,
      "Installed reviewed Braces bytes differ: " + expected.path);
    return { relativePath: expected.path, ...actual };
  });
  const names = [];
  function walk(directory) {
    for (const leaf of fs.readdirSync(directory)) {
      const full = path.join(directory, leaf), info = fs.lstatSync(full);
      need(!info.isSymbolicLink(), "Braces package contains a link");
      if (info.isDirectory()) {
        need(same(full, path.join(bracesRoot, "lib")), "Unexpected Braces package directory");
        walk(full);
      } else {
        need(info.isFile(), "Unexpected Braces package member");
        names.push(path.relative(bracesRoot, full).split(path.sep).join("/"));
      }
    }
  }
  walk(bracesRoot);
  assert.deepEqual(names.sort(), cases.installedIdentity.files.map(item => item.path).sort(),
    "Installed Braces membership differs from twelve reviewed files");
  const resolutions = [];
  for (const [consumer, dependency, target] of [
    ["micromatch", "braces", "braces"], ["fastGlob", "micromatch", "micromatch"],
    ["nextPlugin", "fast-glob", "fastGlob"],
  ]) {
    const actual = createRequire(entries[consumer]).resolve(dependency);
    need(same(actual, entries[target]), "Actual installed resolution differs: " + consumer + " -> " + dependency);
    resolutions.push({ consumer, dependency, actual, expected: entries[target] });
  }
  const archive = filePin(path.join(source, cases.installedIdentity.archive.path), source);
  need(archive.bytes === cases.installedIdentity.archive.bytes
    && archive.sha256 === cases.installedIdentity.archive.sha256, "Vendored Braces archive differs");
  return { entries, files, resolutions, archive, name: manifest.name, version: manifest.version };
}
function fingerprint(installation) {
  return sha(Buffer.from(JSON.stringify(installation)));
}
async function childMain() {
  const [, , , caseId, ownerArgument, fixtureSha] = process.argv;
  const owner = physical(ownerArgument);
  need(inside(generated, owner), "Child output escaped generated evidence");
  const result = { caseId, pid: process.pid, stage: "setup", fixtureSha, consumer: null };
  try {
    assert.deepEqual(process.execArgv, ["--max-old-space-size=128"]);
    const { value: cases, pin: fixture } = catalog();
    need(fixture.sha256 === fixtureSha, "Child fixture changed");
    const spec = cases.cases.find(item => item.id === caseId);
    need(spec, "Unknown selected case");
    const installation = installed(cases);
    result.installationFingerprint = fingerprint(installation);
    const req = createRequire(path.join(source, "package.json"));
    const modules = { braces: req(installation.entries.braces) };
    if (spec.consumer === "micromatch") modules.micromatch = req(installation.entries.micromatch);
    if (spec.consumer === "next") {
      modules.eslint = req(installation.entries.eslint);
      modules.nextPlugin = req(installation.entries.nextPlugin);
      makeLayout(owner);
    }
    const value = spec.consumer === "next" ? null : fixtureInput(spec.input);
    const phase = { caseId, pid: process.pid, fixtureSha };
    writeNew(path.join(owner, "consumer-entered.json"), phase);
    let returned, rejected, didReject = false;
    try {
      if (spec.consumer === "next") returned = nextVerify(modules, owner, spec.input, cases.nextSources);
      else if (spec.consumer === "micromatch") returned = modules.micromatch[spec.api](value, spec.options);
      else returned = modules.braces[spec.api](value, spec.options);
    } catch (error) { didReject = true; rejected = error; }
    writeNew(path.join(owner, "consumer-settled.json"), phase);
    result.stage = "consumer-settled";
    result.consumer = didReject ? { outcome: "error", error: errorView(rejected) } : { outcome: "value" };
    try {
      if (!didReject && spec.consumer === "next") {
        result.lintEvidence = {
          internal: returned.internal, external: returned.external,
          intendedRuleViolation: returned.internal.length === 1
            && returned.internal[0].ruleId === spec.expect.lintRule
            && returned.internal[0].severity === 2 && !returned.internal[0].fatal
            && returned.internal[0].message.includes("/about") && returned.external.length === 0,
        };
      } else if (!didReject) {
        result.observation = project(returned, cases.projectionLimits);
        if (Object.hasOwn(spec.expect, "value")) {
          result.explicitOracleMatches = result.observation.sha256 === project(spec.expect.value, cases.projectionLimits).sha256;
        }
      }
    } catch (error) { result.stage = "observation-error"; result.observationError = errorView(error); }
  } catch (error) { result.stage = "setup-error"; result.setupError = errorView(error); }
  writeNew(path.join(owner, "child-result.json"), result);
  if (result.stage !== "consumer-settled") process.exitCode = 2;
}
function childEnvironment(owner) {
  const env = {};
  for (const key of ["SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"]) {
    const actual = Object.entries(process.env).find(([name]) => name.toLowerCase() === key.toLowerCase());
    if (actual) env[key] = actual[1];
  }
  for (const leaf of ["home", "tmp"]) fs.mkdirSync(path.join(owner, leaf));
  return { ...env, HOME: path.join(owner, "home"), USERPROFILE: path.join(owner, "home"),
    TEMP: path.join(owner, "tmp"), TMP: path.join(owner, "tmp"), TMPDIR: path.join(owner, "tmp") };
}
async function runOne(spec, fixture, runOwner) {
  const owner = path.join(runOwner, spec.id);
  fs.mkdirSync(owner);
  const result = { caseId: spec.id, owner, actualCloseObserved: false };
  const argv = ["--max-old-space-size=128", SELF, "--case-child", spec.id, owner, fixture.sha256];
  const descriptors = [];
  let child, timer;
  try {
    const env = childEnvironment(owner);
    result.command = { executable: process.execPath, argv, cwd: owner, environment: env, deadlineMs: 5000 };
    const stdout = fs.openSync(path.join(owner, "stdout.bin"), "wx");
    descriptors.push(stdout);
    const stderr = fs.openSync(path.join(owner, "stderr.bin"), "wx");
    descriptors.push(stderr);
    child = spawn(process.execPath, argv, { cwd: owner, env, shell: false, windowsHide: true,
      stdio: ["ignore", stdout, stderr] });
    result.pid = child.pid ?? null;
    child.once("error", error => { result.processError = errorView(error); });
    timer = setTimeout(() => {
      result.watchdog = true;
      result.killRequested = true;
      try { result.killReturned = child.kill(); }
      catch (error) { result.killError = errorView(error); }
    }, 5000);
    await new Promise(resolve => child.once("close", (code, signal) => {
      clearTimeout(timer);
      Object.assign(result, { code, signal, actualCloseObserved: true });
      resolve();
    }));
  } catch (error) { result.processError ??= errorView(error); }
  finally {
    clearTimeout(timer);
    for (const fd of descriptors) {
      try { fs.closeSync(fd); } catch (error) { result.parentIoError ??= errorView(error); }
    }
  }
  result.outputs = {};
  try {
    for (const leaf of ["stdout.bin", "stderr.bin", "consumer-entered.json", "consumer-settled.json", "child-result.json"]) {
      const read = readOrdinary(path.join(owner, leaf), owner);
      result.outputs[leaf] = { path: read.path, bytes: read.bytes.length, sha256: read.sha256 };
      if (leaf === "child-result.json") result.child = decode(read.bytes);
      if (leaf.startsWith("consumer-")) {
        const phase = decode(read.bytes);
        need(phase.caseId === spec.id && phase.pid === result.pid && phase.fixtureSha === fixture.sha256,
          "Consumer phase identity differs");
      }
    }
  } catch (error) { result.observationError = errorView(error); }
  writeNew(path.join(owner, "run-result.json"), result);
  return result;
}
function failuresFor(spec, run, installationFingerprint) {
  const failures = [];
  if (!run.actualCloseObserved || run.watchdog || run.code !== 0 || run.signal || run.processError
    || run.parentIoError || run.observationError || run.child?.stage !== "consumer-settled") {
    failures.push("Child did not actually close normally with a settled, observable consumer result");
  }
  if (run.child?.caseId !== spec.id || run.child?.pid !== run.pid
    || run.child?.installationFingerprint !== installationFingerprint) failures.push("Child input/installed identity differs");
  const consumer = run.child?.consumer;
  if (spec.expect.kind === "guard") {
    const error = consumer?.error;
    if (consumer?.outcome !== "error" || error?.name !== spec.expect.name || error?.code !== spec.expect.code
      || /maximum call stack|out of memory/i.test(error?.message ?? "")) {
      failures.push("Exact controlled guard error was not observed");
    }
  } else {
    if (consumer?.outcome !== "value") failures.push("Ordinary consumer did not return a value");
    if (Object.hasOwn(spec.expect, "value") && run.child?.explicitOracleMatches !== true) {
      failures.push("Frozen explicit ordinary output changed");
    }
    if (spec.baselineNormalProjection && run.child?.observation?.sha256 !== spec.baselineNormalProjection.sha256) {
      failures.push("Portable original-baseline result projection changed");
    }
    if (spec.consumer === "next" && run.child?.lintEvidence?.intendedRuleViolation !== true) {
      failures.push("Real Next internal-link violation or external control changed");
    }
  }
  return failures;
}
if (process.argv[2] === "--case-child") {
  await childMain();
} else {
  test("installed reviewed Braces retains public depth guards and real lint consumers", async t => {
    fs.mkdirSync(generated, { recursive: true });
    const owner = path.join(physical(generated), "braces-depth-guard-e2e-" + crypto.randomUUID());
    fs.mkdirSync(owner);
    const report = {
      schemaVersion: 1, scope: "Installed Braces persistent candidate-only regression subset",
      source, owner, status: "Failed", runs: [], failures: [], fullPairedMatrixEquivalent: false,
      fullCareerAccepted: false, dependencyAdoptionAccepted: false, releaseAccepted: false, productionCertified: false,
    };
    try {
      const { value: cases, pin: fixture } = catalog();
      report.fixture = fixture;
      report.script = filePin(SELF, path.dirname(SELF));
      report.runtime = { executable: process.execPath, version: process.version };
      report.before = installed(cases);
      const identity = fingerprint(report.before);
      for (const spec of cases.cases) {
        const run = await runOne(spec, fixture, owner);
        run.failures = failuresFor(spec, run, identity);
        report.runs.push(run);
        report.failures.push(...run.failures.map(message => spec.id + ": " + message));
      }
      report.after = installed(cases);
      assert.deepEqual(report.after, report.before, "Installed file/resolution inputs changed during regression");
      need(filePin(fixturePath, path.dirname(fixturePath)).sha256 === fixture.sha256, "Fixture changed during regression");
      if (report.runs.length === 32 && report.failures.length === 0) report.status = "Passed";
    } catch (error) { report.failures.push(errorView(error)); }
    finally {
      const artifact = path.join(owner, "summary.json");
      writeNew(artifact, report);
      t.diagnostic("Braces regression evidence: " + artifact);
    }
    assert.equal(report.status, "Passed", JSON.stringify(report.failures));
  });
}
