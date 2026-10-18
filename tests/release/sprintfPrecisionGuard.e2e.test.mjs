import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import vm from "node:vm";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const moduleRoot = resolve(process.env.TALENTSCOUT_SPRINTF_MODULE_ROOT || "node_modules");
const baseline = process.env.TALENTSCOUT_SPRINTF_EXPECT === "baseline";
const fixtures = resolve(here, "fixtures/sprintf-precision");
const catalog = JSON.parse(readFileSync(resolve(fixtures, "cases.json"), "utf8"));
const entries = ["src/sprintf.js", "dist/sprintf.min.js"].map((entry) => resolve(moduleRoot, "sprintf-js", entry));
const parts = (values) => values.map((value) => typeof value === "string" ? value : value.repeat.repeat(value.count)).join("");
const formatOf = (row) => row.format ?? `%.${row.formatRecipe.digit.repeat(row.formatRecipe.count)}${row.formatRecipe.type}`;

function oracle(result, expected, callbackCount) {
  if (expected.kind === "error") {
    assert.ok(result.error, "expected original formatter error");
    assert.equal(result.error.name, expected.name);
    if (expected.message) assert.equal(result.error.message, expected.message);
    if (expected.method) assert.match(result.error.message, new RegExp(expected.method));
  } else {
    if (result.error) throw result.error;
    assert.equal(result.value, expected.value ?? parts(expected.parts));
  }
  if (expected.functionCalls !== undefined) assert.equal(callbackCount, expected.functionCalls);
}

for (const entry of entries) {
  test(`full upstream corpus with ${entry.split("/").at(-1)}`, () => {
    const formatter = require(entry);
    let checks = 0;
    for (const name of ["upstream-test.js", "upstream-test-validation.js"]) {
      const source = readFileSync(resolve(fixtures, name), "utf8");
      const execute = vm.runInThisContext(`(function(require, describe, it) {\n${source}\n})`, { filename: name });
      execute((specifier) => specifier === "../src/sprintf.js" ? formatter : require(specifier),
        (_name, run) => run(), (_name, run) => { run(); checks += 1; });
    }
    assert.ok(checks >= 10, `upstream corpus unexpectedly short: ${checks}`);
  });
  for (const api of ["sprintf", "vsprintf"]) {
    test(`unchanged 32-case precision catalog: ${entry} ${api}`, () => {
      const formatter = require(entry);
      assert.equal(catalog.cases.length, 32);
      for (const row of catalog.cases) {
        let callbackCount = 0;
        const args = row.argsRecipe ? [() => { callbackCount += 1; return row.argsRecipe.value; }] : structuredClone(row.args);
        const before = JSON.stringify(args);
        const result = {};
        try { result.value = api === "sprintf" ? formatter.sprintf(formatOf(row), ...args) : formatter.vsprintf(formatOf(row), args); }
        catch (error) { result.error = error; }
        oracle(result, row[baseline ? "baseline" : "candidate"], callbackCount);
        assert.equal(JSON.stringify(args), before);
      }
    });
  }
}

test("advisory calls in actual asynchronous children exit cleanly after the guard", async () => {
  for (const entry of entries) {
    for (const api of ["sprintf", "vsprintf"]) {
      for (const id of catalog.asyncCases) {
        const row = catalog.cases.find((candidate) => candidate.id === id);
        const source = `const f = require(${JSON.stringify(entry)}); setImmediate(() => { console.log('entered'); const value = f.${api}(${JSON.stringify(formatOf(row))}, ${api === "sprintf" ? row.args.map(JSON.stringify).join(",") : JSON.stringify(row.args)}); console.log(JSON.stringify(value)); });`;
        const result = await new Promise((done, reject) => {
          const child = spawn(process.execPath, ["--max-old-space-size=128", "-e", source], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
          let stdout = "", stderr = "";
          const timer = setTimeout(() => { child.kill(); reject(new Error("formatter child timeout")); }, 10000);
          child.stdout.on("data", (chunk) => { stdout += chunk; });
          child.stderr.on("data", (chunk) => { stderr += chunk; });
          child.on("error", reject);
          child.on("close", (code, signal) => { clearTimeout(timer); done({ code, signal, stdout, stderr }); });
        });
        assert.equal(result.signal, null);
        assert.equal(result.code, baseline ? 1 : 0);
        assert.match(result.stdout, /^entered\r?\n/);
        if (baseline) assert.match(result.stderr, /RangeError/);
        else {
          assert.equal(result.stderr, "");
          assert.equal(JSON.parse(result.stdout.trim().split(/\r?\n/)[1]), row.candidate.value ?? parts(row.candidate.parts));
        }
      }
    }
  }
});

test("actual installed Roarr resolves the selected leaf and survives malformed precision", () => {
  const roarrEntry = require.resolve(resolve(moduleRoot, "roarr"));
  const roarrRequire = createRequire(roarrEntry);
  assert.equal(realpathSync(roarrRequire.resolve("sprintf-js")), realpathSync(entries[0]));
  roarrRequire(roarrEntry);
  const factory = roarrRequire(resolve(moduleRoot, "roarr/dist/factories/createLogger.js")).default;
  const messages = [];
  const logger = factory((message) => messages.push(message), structuredClone(catalog.roarr.parentContext));
  for (const row of catalog.roarr.cases) {
    const before = messages.length;
    const invoke = () => row.style === "context" ? logger(structuredClone(catalog.roarr.context), row.format, ...row.args)
      : row.style === "literal" ? logger(row.format) : logger(row.format, ...row.args);
    if (baseline && row.baselineError) {
      assert.throws(invoke, { name: row.baselineError });
      assert.equal(messages.length, before);
    } else {
      invoke();
      assert.equal(messages.length, before + 1);
      assert.equal(messages.at(-1).message, row.message ?? parts(row.messageParts));
      assert.deepEqual(messages.at(-1).context, row.context);
      assert.ok(Number.isSafeInteger(messages.at(-1).time));
    }
  }
});

test("valid raw precision and receiver semantics remain intact", () => {
  for (const entry of entries) {
    const { sprintf } = require(entry);
    const receiver = { valueOf: () => 1, toPrecision(precision) { assert.equal(this, receiver); assert.equal(precision, "0002"); return "1.2"; } };
    assert.equal(sprintf("%.0002g", receiver), "1.2");
    for (const value of [NaN, Infinity, -Infinity, -0, -1.25, 1.25]) {
      for (const precision of [1, 2, 99, 100]) {
        for (const type of ["e", "f", "g"]) {
          const first = sprintf(`%.${precision}${type}`, value);
          assert.equal(sprintf(`%.${precision}${type}`, value), first);
          // Number-method equivalence for finite positive values avoids changing
          // the original formatter's documented sign handling for -0/NaN.
          if (value === 1.25) {
            const expected = type === "e" ? value.toExponential(precision) : type === "f" ? value.toFixed(precision) : String(Number(value.toPrecision(precision)));
            assert.equal(first, expected);
          }
        }
      }
    }
  }
});
