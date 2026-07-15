import ts from "typescript";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const sourceRoot = resolve(root, "src");
const checkBaseline = process.argv.includes("--check");
const baselinePath = resolve(root, "scripts/architecture-baseline.json");
const explicitOutputPath = process.env.ARCHITECTURE_AUDIT_OUTPUT?.trim();
const outputPath = resolve(
  root,
  explicitOutputPath || "artifacts/architecture/module-graph.json",
);
// The release gate invokes `--check` from a clean candidate. A timestamped
// report must not dirty that checkout and make later package/soak evidence
// self-invalidating. Callers that need check-mode evidence can opt into an
// ignored candidate-bound path with ARCHITECTURE_AUDIT_OUTPUT.
const shouldWriteReport = !checkBaseline || Boolean(explicitOutputPath);

const normalize = (path) => path.split(sep).join("/");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name)) && !entry.name.endsWith(".d.ts")) files.push(path);
  }
  return files;
}

const files = (await walk(sourceRoot)).sort();
const fileSet = new Set(files);

async function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/")
    ? resolve(sourceRoot, specifier.slice(2))
    : resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    resolve(base, "index.ts"),
    resolve(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (fileSet.has(candidate)) return candidate;
    try {
      if ((await stat(candidate)).isFile() && fileSet.has(resolve(candidate))) return resolve(candidate);
    } catch {
      // Candidate does not exist.
    }
  }
  return null;
}

const graph = new Map(files.map((file) => [file, new Set()]));
const lineCounts = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  lineCounts.push({ file: normalize(relative(root, file)), lines: text.split(/\r?\n/).length });
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    false,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers = [];
  source.forEachChild((node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
  });
  for (const specifier of specifiers) {
    const target = await resolveImport(file, specifier);
    if (target && target !== file) graph.get(file).add(target);
  }
}

let nextIndex = 0;
const indexes = new Map();
const lowLinks = new Map();
const stack = [];
const onStack = new Set();
const components = [];

function connect(node) {
  indexes.set(node, nextIndex);
  lowLinks.set(node, nextIndex);
  nextIndex += 1;
  stack.push(node);
  onStack.add(node);

  for (const dependency of graph.get(node) ?? []) {
    if (!indexes.has(dependency)) {
      connect(dependency);
      lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(dependency)));
    } else if (onStack.has(dependency)) {
      lowLinks.set(node, Math.min(lowLinks.get(node), indexes.get(dependency)));
    }
  }

  if (lowLinks.get(node) === indexes.get(node)) {
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    if (component.length > 1) components.push(component.sort());
  }
}

for (const file of files) if (!indexes.has(file)) connect(file);

const cycles = components
  .map((component) => component.map((file) => normalize(relative(root, file))))
  .sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
const lineCountByModule = new Map(
  lineCounts.map(({ file, lines }) => [file, lines]),
);
const baseline = checkBaseline
  ? JSON.parse(await readFile(baselinePath, "utf8"))
  : null;
const guardedModules = Object.entries(
  baseline?.maximumModuleLinesByModule ?? {},
)
  .map(([file, maximumLines]) => ({
    file,
    maximumLines,
    lines: lineCountByModule.get(file),
  }))
  .sort((left, right) => left.file.localeCompare(right.file));
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  summary: {
    modules: files.length,
    internalEdges: [...graph.values()].reduce((sum, edges) => sum + edges.size, 0),
    stronglyConnectedComponents: cycles.length,
    modulesInCycles: new Set(cycles.flat()).size,
  },
  largestModules: lineCounts.sort((left, right) => right.lines - left.lines).slice(0, 30),
  guardedModules,
  cycles,
};
if (shouldWriteReport) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.info(`ARCHITECTURE_AUDIT ${JSON.stringify(report.summary)}`);
console.info(`Largest module: ${report.largestModules[0]?.file} (${report.largestModules[0]?.lines} lines)`);
if (shouldWriteReport) {
  console.info(`Evidence: ${normalize(relative(root, outputPath))}`);
}

if (checkBaseline) {
  const baselineConfig = baseline;
  const violations = [];
  if (report.summary.stronglyConnectedComponents > baselineConfig.maximumStronglyConnectedComponents) {
    violations.push(
      `SCC count ${report.summary.stronglyConnectedComponents} exceeds ${baselineConfig.maximumStronglyConnectedComponents}`,
    );
  }
  if (report.summary.modulesInCycles > baselineConfig.maximumModulesInCycles) {
    violations.push(
      `cyclic module count ${report.summary.modulesInCycles} exceeds ${baselineConfig.maximumModulesInCycles}`,
    );
  }
  for (const cycle of report.cycles) {
    const allowedGroup = baselineConfig.allowedCycleGroups.find((group) =>
      cycle.every((module) => group.modules.includes(module)),
    );
    if (!allowedGroup) {
      violations.push(`unapproved cycle: ${cycle.join(" -> ")}`);
    }
  }
  for (const guarded of guardedModules) {
    if (guarded.lines === undefined) {
      violations.push(`guarded module is missing: ${guarded.file}`);
      continue;
    }
    if (typeof guarded.maximumLines !== "number" || !Number.isFinite(guarded.maximumLines)) {
      violations.push(`invalid line limit for ${guarded.file}`);
      continue;
    }
    if (guarded.lines > guarded.maximumLines) {
      violations.push(
        `${guarded.file} has ${guarded.lines} lines, exceeding ${guarded.maximumLines}`,
      );
    }
  }
  if (violations.length > 0) {
    console.error(`ARCHITECTURE_CHECK_FAILED\n${violations.map((violation) => `- ${violation}`).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.info(
      `ARCHITECTURE_CHECK_PASS baseline=${normalize(relative(root, baselinePath))}`,
    );
  }
}
