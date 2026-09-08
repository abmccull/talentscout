"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

/** Use the repository's installed compiler and exact source validation modules. */
function loadPortraitSources(repoDirectory) {
  const repo = fs.realpathSync(repoDirectory);
  const dependency = createRequire(path.join(repo, "package.json"));
  const ts = dependency("typescript");
  const sourceRoot = path.join(repo, "src", "engine", "players", "portraits");
  const cache = new Map();
  function load(filename) {
    const resolved = fs.realpathSync(filename);
    const relative = path.relative(sourceRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative) || path.extname(resolved) !== ".ts") {
      throw new Error("Portrait tooling may load only the repository portrait source modules");
    }
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const compiled = ts.transpileModule(fs.readFileSync(resolved, "utf8"), {
      fileName: resolved,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true, isolatedModules: true },
    });
    const errors = (compiled.diagnostics || []).filter((entry) => entry.category === ts.DiagnosticCategory.Error);
    if (errors.length) throw new Error(errors.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, "\n")).join("\n"));
    const module = { exports: {} };
    cache.set(resolved, module);
    const sourceRequire = (specifier) => specifier.startsWith(".")
      ? load(path.resolve(path.dirname(resolved), specifier + (path.extname(specifier) ? "" : ".ts")))
      : dependency(specifier);
    // Only the explicitly selected local repository source is executed here.
    // Nothing is downloaded, and compilation creates no build directory.
    new Function("require", "module", "exports", compiled.outputText + "\n//# sourceURL=" + resolved)(sourceRequire, module, module.exports);
    return module.exports;
  }
  return {
    repo,
    sharp: dependency("sharp"),
    ...load(path.join(sourceRoot, "types.ts")),
    ...load(path.join(sourceRoot, "identity.ts")),
    ...load(path.join(sourceRoot, "catalog.ts")),
    ...load(path.join(sourceRoot, "offline", "verifyPackFiles.ts")),
  };
}

function parseFlags(argv, allowed) {
  const flags = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const separator = argument.indexOf("=");
    const name = separator >= 0 ? argument.slice(0, separator) : argument;
    const value = separator >= 0 ? argument.slice(separator + 1) : argv[++index];
    if (!allowed.includes(name) || !value || value.startsWith("--") || flags[name] !== undefined) throw new Error("Invalid or repeated flag: " + name);
    flags[name] = value;
  }
  return flags;
}

module.exports = { loadPortraitSources, parseFlags };
