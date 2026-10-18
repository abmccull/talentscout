import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fontPath = "src/app/fonts/Caveat-Variable.ttf";
const fontHash = "0bdb6b660482d31531b3945849fba5916b3ef8695da7024a9e6b9ee3c4157988";
const expectedNotices = {
  "Caveat-OFL.txt": "1f9d81d094273d82f3898a1ee8b598a717d050ecbf5ff7bede105b704880157b",
  "THIRD-PARTY-NOTICES.txt": "6be2887aec2f736cc8bbc3eba8222e322f9233ae22164b515d3c223408fd95a4",
};
const fontExtensions = new Set([".ttf", ".otf", ".woff", ".woff2"]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let sourceOnly = false;
const args = process.argv.slice(2);

function requireValue(value, message) { if (!value) throw new Error(message); }
async function ordinary(path, directory = false) {
  let current = root;
  requireValue((await lstat(root)).isDirectory() && !(await lstat(root)).isSymbolicLink(), "Font check root is nonordinary");
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = resolve(current, parts[index]);
    const stat = await lstat(current);
    const expectDirectory = index < parts.length - 1 || directory;
    requireValue(!stat.isSymbolicLink() && (expectDirectory ? stat.isDirectory() : stat.isFile()), `Font path is nonordinary: ${path}`);
  }
  return current;
}
async function read(path) { return readFile(await ordinary(path)); }
async function verify(path, expectedHash, expectedBytes = null) {
  const bytes = await read(path);
  requireValue(hash(bytes) === expectedHash && (expectedBytes === null || bytes.length === expectedBytes), `Font or notice bytes changed: ${path}`);
  return { path, bytes: bytes.length, sha256: expectedHash };
}
async function fontsUnder(path) {
  const found = [];
  for (const entry of await readdir(await ordinary(path, true), { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    requireValue(!entry.isSymbolicLink(), `Export path is a symlink: ${child}`);
    if (entry.isDirectory()) found.push(...await fontsUnder(child));
    else if (fontExtensions.has(extname(entry.name).toLowerCase())) found.push(child);
  }
  return found.sort();
}

try {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--source-only" && !sourceOnly) sourceOnly = true;
    else if (args[index] === "--root" && args[index + 1]) root = resolve(args[++index]);
    else throw new Error(`Unknown or incomplete font check argument: ${args[index]}`);
  }
  const sourceFont = await verify(fontPath, fontHash, 403648);
  const sourceNotices = [];
  for (const [name, expected] of Object.entries(expectedNotices)) sourceNotices.push(await verify(`public/licenses/${name}`, expected));
  const metadata = JSON.parse((await read("docs/release/caveat-source-provenance.json")).toString("utf8"));
  requireValue(metadata.evidenceKind === "font-source-license-reconciliation"
    && metadata.font?.path === fontPath && metadata.font?.sha256 === fontHash && metadata.font?.bytes === 403648
    && metadata.sourceCommit === "5571d84c0d8c70ec1af4f64072d8c5cf1e4e9643"
    && metadata.license === "SIL Open Font License 1.1"
    && metadata.notice?.sha256 === expectedNotices["Caveat-OFL.txt"]
    && metadata.notice?.matchesPinnedUpstream === true, "Font provenance metadata does not bind the pinned source and license");
  const layout = (await read("src/app/layout.tsx")).toString("utf8");
  requireValue(layout.includes('from "next/font/local"') && !layout.includes('from "next/font/google"')
    && layout.includes('src: "./fonts/Caveat-Variable.ttf"'), "Layout must use the pinned local Caveat source");
  const emittedFonts = [];
  const emittedNotices = [];
  if (!sourceOnly) {
    const paths = await fontsUnder("out");
    requireValue(paths.length === 1 && paths[0].startsWith("out/_next/static/media/"), "Fresh export must contain exactly one emitted Caveat font and no stale/unreviewed fonts");
    emittedFonts.push(await verify(paths[0], fontHash, 403648));
    for (const [name, expected] of Object.entries(expectedNotices)) emittedNotices.push(await verify(`out/licenses/${name}`, expected));
  }
  console.info(JSON.stringify({ schemaVersion: 1, evidenceKind: "pinned-caveat-font-verification", status: "Passed",
    scope: sourceOnly ? "source-only" : "source-and-static-export", sourceFont, sourceNotices, emittedFonts, emittedNotices,
    packageAcceptance: false, humanApproval: false, commercialReleaseApproved: false }));
} catch (error) {
  console.error(JSON.stringify({ schemaVersion: 1, evidenceKind: "pinned-caveat-font-verification", status: "Failed",
    scope: sourceOnly ? "source-only" : "source-and-static-export", failure: error instanceof Error ? error.message : String(error),
    packageAcceptance: false, humanApproval: false, commercialReleaseApproved: false }));
  process.exitCode = 1;
}
