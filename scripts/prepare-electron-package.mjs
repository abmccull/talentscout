import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const appId = (process.env.STEAM_APP_ID ?? "4455570").trim();
if (!/^\d+$/.test(appId)) throw new Error("STEAM_APP_ID must contain only digits");
const target = resolve("steam_appid.txt");
let current = null;
try {
  current = await readFile(target, "utf8");
} catch {
  // A fresh clone intentionally has no ignored generated app-id file.
}
const expected = `${appId}\n`;
if (current !== expected) await writeFile(target, expected, "utf8");
console.info(`ELECTRON_PACKAGE_APP_ID ${appId}`);
console.info(
  "Steam native SDK redistributables are provisioned separately; this preflight does not claim they are available.",
);
