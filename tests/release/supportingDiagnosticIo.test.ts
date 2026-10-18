import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, open, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSupportingJson, writeSupportingJson, supportingOutputPath } from "../../scripts/supporting-diagnostic-io.mjs";
const roots: string[] = [];
async function fixture() { const root = await mkdtemp(join(tmpdir(), "supporting-io-")); roots.push(root); return root; }
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
describe("supporting output preserves prior inputs and refuses unbounded reads", () => {
  it("writes and reads exact JSON once, refusing replacement", async () => {
    const root = await fixture(); const path = join(root, "result.json");
    await writeSupportingJson(path, { passed: false, failures: ["retained"] });
    const before = await readFile(path);
    await expect(writeSupportingJson(path, { passed: true })).rejects.toThrow();
    expect(await readFile(path)).toEqual(before);
    expect((await readSupportingJson(path)).value.passed).toBe(false);
  });
  it("rejects oversized sparse files before allocation or JSON decoding", async () => {
    const path = join(await fixture(), "large.json"); const file = await open(path, "wx");
    try { await file.truncate(16 * 1024 * 1024 + 1); } finally { await file.close(); }
    await expect(readSupportingJson(path)).rejects.toThrow("size/type admission");
  });
  it("rejects malformed JSON and paths outside the owned directory", async () => {
    const root = await fixture(); await writeFile(join(root, "invalid.json"), "not JSON");
    await expect(readSupportingJson(join(root, "invalid.json"))).rejects.toThrow();
    await expect(supportingOutputPath(root, "../outside.json")).rejects.toThrow("owned directory");
  });
});
