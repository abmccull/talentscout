/**
 * Global setup: warm up the Next.js dev server before tests run.
 *
 * The first page load triggers JavaScript bundle compilation which can take
 * 30-60s under load. By warming up here, all test workers get fast page loads.
 */

import { chromium } from "@playwright/test";

async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto("http://localhost:3000/play", {
      timeout: 120_000,
      waitUntil: "domcontentloaded",
    });
    // Wait for the game store to be hydrated — this forces full JS compilation
    await page.waitForFunction(
      () => (window as any).__GAME_STORE__ !== undefined,
      { timeout: 120_000 },
    );
  } catch (e) {
    console.warn("[global-setup] Warmup failed, tests may be slower:", e);
  } finally {
    await browser.close();
  }
}

export default globalSetup;
