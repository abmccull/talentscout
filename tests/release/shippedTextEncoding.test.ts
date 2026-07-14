import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SHIPPED_TEXT_ROOTS = ["src", "messages", "public", "electron"] as const;
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".vdf",
]);

// These are specific UTF-8-as-Windows-1252 signatures, not a blanket ban on
// accented names or authored Unicode punctuation. Keep the pieces escaped so
// this invariant cannot flag its own source if the scan scope grows later.
const MOJIBAKE_SIGNATURES = [
  "\u00c2\u00a0", // non-breaking space
  "\u00c2\u00a3", // pound sign
  "\u00c2\u00a9", // copyright sign
  "\u00c2\u00ae", // registered sign
  "\u00c2\u00b0", // degree sign
  "\u00c2\u00b7", // middle dot
  "\u00c3\u00a1", // a-acute
  "\u00c3\u00a3", // a-tilde
  "\u00c3\u00a7", // c-cedilla
  "\u00c3\u00a9", // e-acute
  "\u00c3\u00b1", // n-tilde
  "\u00c3\u00bc", // u-diaeresis
  "\u00e2\u20ac", // quotes, dashes, and ellipsis
  "\u00e2\u2020", // arrows decoded with a dagger prefix
  "\u00e2\u0161", // warning symbols decoded with an s-caron prefix
  "\u00e2\u0153", // check marks decoded with an oe-ligature prefix
  "\u00ef\u00bf\u00bd", // replacement character re-encoded as text
  "\u00ef\u00bb\u00bf", // UTF-8 BOM re-encoded as text
  "\u00f0\u0178", // common prefix of a corrupted four-byte emoji
  "\ufffd", // decoder replacement character
] as const;

function collectTextFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTextFiles(path));
    } else if (
      entry.isFile() &&
      TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())
    ) {
      files.push(path);
    }
  }

  return files;
}

describe("shipped text encoding", () => {
  it("includes the player-facing product roadmap catalog", () => {
    const scannedFiles = SHIPPED_TEXT_ROOTS.flatMap((root) =>
      collectTextFiles(join(process.cwd(), root)),
    ).map((path) => relative(process.cwd(), path).replaceAll("\\", "/"));

    expect(scannedFiles).toContain("src/data/productRoadmap.ts");
  });

  it("is valid UTF-8 and contains no known mojibake signatures", () => {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const violations: string[] = [];

    for (const root of SHIPPED_TEXT_ROOTS) {
      for (const path of collectTextFiles(join(process.cwd(), root))) {
        let text: string;
        try {
          text = decoder.decode(readFileSync(path));
        } catch {
          violations.push(`${relative(process.cwd(), path)}: invalid UTF-8`);
          continue;
        }

        for (const signature of MOJIBAKE_SIGNATURES) {
          if (text.includes(signature)) {
            const escaped = [...signature]
              .map((character) =>
                `U+${character.codePointAt(0)!
                  .toString(16)
                  .toUpperCase()
                  .padStart(4, "0")}`,
              )
              .join(" ");
            violations.push(`${relative(process.cwd(), path)}: ${escaped}`);
          }
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
