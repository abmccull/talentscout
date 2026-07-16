/**
 * Global setup: verify the production static export has loaded and hydrated.
 */

import { chromium, type FullConfig } from "@playwright/test";

async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const baseURL = config.projects[0]?.use.baseURL ?? "http://127.0.0.1:3000";

  try {
    await page.goto(`${baseURL}/play`, {
      timeout: 120_000,
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: /Start Youth Career|New Game/ }).waitFor({
      state: "visible",
      timeout: 120_000,
    });
    await page.waitForFunction(
      () => Boolean((window as typeof window & { __GAME_STORE__?: unknown }).__GAME_STORE__),
      undefined,
      { timeout: 120_000 },
    );
  } catch (e) {
    console.error("[global-setup] Production export failed to hydrate:", e);
    throw e;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
