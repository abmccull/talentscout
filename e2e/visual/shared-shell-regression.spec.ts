import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../fixtures";

const screens = ["dashboard", "calendar", "youthScouting", "reportHistory", "internationalView", "career", "settings"];

async function assertVisibleTarget(target: Locator, page: Page) {
  const bounds = await target.evaluate((element) => {
    const r = element.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
      viewportHeight: innerHeight, viewportWidth: innerWidth, hit: hit !== null && element.contains(hit) };
  });
  expect(bounds.top, JSON.stringify(bounds)).toBeGreaterThanOrEqual(-1);
  expect(bounds.bottom, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.viewportHeight + 1);
  expect(bounds.left, JSON.stringify(bounds)).toBeGreaterThanOrEqual(-1);
  expect(bounds.right, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.viewportWidth + 1);
  expect(bounds.hit, JSON.stringify(bounds)).toBe(true);
  return bounds;
}

for (const viewport of [
  { name: "small-phone", width: 320, height: 568 },
  { name: "phone", width: 390, height: 844 },
]) {
  for (const motion of ["default", "preference-reduced", "setting-reduced"] as const) {
    test(`workspace navigation remains attached to ${viewport.name} viewport with ${motion} motion`, async ({ gamePage, page }, info) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: motion === "preference-reduced" ? "reduce" : "no-preference" });
      await page.addInitScript((reducedMotion) => {
        localStorage.setItem("talentscout_settings", JSON.stringify({ reducedMotion, fontSize: "medium" }));
      }, motion === "setting-reduced");
      await gamePage.goto();
      await gamePage.injectLateGameState("youth");
      const samples: unknown[] = [];
      for (const screen of screens) {
        await gamePage.setScreen(screen);
        await page.getByText(/^Loading workspace/).waitFor({ state: "hidden" });
        await page.waitForTimeout(250);
        const toast = page.getByRole("button", { name: "Dismiss achievement notification" });
        if (await toast.isVisible().catch(() => false)) await toast.click();
        const nav = page.getByRole("navigation", { name: "Youth Scout workspace", exact: true });
        await expect(nav).toBeVisible();
        const buttons = nav.getByRole("button");
        expect(await buttons.count()).toBe(6);
        for (const button of await buttons.all()) samples.push({ screen, scroll: "top", ...await assertVisibleTarget(button, page) });
        const wrapper = page.locator(`[data-game-screen="${screen}"]`);
        const styles = await wrapper.evaluate(el => ({ transform: getComputedStyle(el).transform, animation: getComputedStyle(el).animationName }));
        expect(styles.transform).toBe("none");
        expect(styles.animation).toBe(motion === "default" ? "game-screen-enter" : "none");
        await page.evaluate(() => {
          const main = document.querySelector<HTMLElement>("#game-main");
          if (main) main.scrollTop = main.scrollHeight;
          window.scrollTo(0, document.documentElement.scrollHeight);
        });
        for (const button of await buttons.all()) samples.push({ screen, scroll: "bottom", ...await assertVisibleTarget(button, page) });
        // Click by viewport coordinate: locator clicks can silently scroll an offscreen nav into view.
        const planner = nav.getByRole("button", { name: "Planner", exact: true });
        const r = await planner.boundingBox();
        if (!r) throw new Error("Planner nav target has no bounds");
        await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
        await gamePage.waitForScreen("calendar");
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      await info.attach("viewport-navigation-bounds", { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
      await gamePage.setScreen("dashboard");
      await page.waitForTimeout(250);
      await page.screenshot({ path: info.outputPath("desk-viewport.png"), fullPage: false });
      gamePage.expectNoConsoleErrors();
    });
  }
}

for (const width of [768, 806, 1024, 1280]) {
  test(`shared help and Settings return action are independently clickable at ${width}px`, async ({ gamePage, page }, info) => {
    await page.setViewportSize({ width, height: 691 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await gamePage.goto();
    await gamePage.injectLateGameState("youth");
    await gamePage.navigateTo("settings");
    await page.waitForTimeout(250);
    const help = page.getByRole("button", { name: /^Ask (Tommy|Margaret) for help$/ });
    const back = page.getByRole("button", { name: "Back to Desk", exact: true });
    const helpRect = await assertVisibleTarget(help, page);
    const backRect = await assertVisibleTarget(back, page);
    const overlap = Math.max(0, Math.min(helpRect.right, backRect.right) - Math.max(helpRect.left, backRect.left))
      * Math.max(0, Math.min(helpRect.bottom, backRect.bottom) - Math.max(helpRect.top, backRect.top));
    expect(overlap).toBe(0);
    await page.screenshot({ path: info.outputPath("settings-targets.png"), fullPage: false });
    const r = await back.boundingBox();
    if (!r) throw new Error("Return control has no bounds");
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    await gamePage.waitForScreen("dashboard");
  });
}

test("empty Reports puts its next scouting action inside the phone viewport", async ({ gamePage, page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gamePage.goto();
  await gamePage.injectLateGameState("youth");
  await gamePage.navigateTo("reportHistory");
  await page.waitForTimeout(250);
  const action = page.getByRole("button", { name: "Plan the first live look", exact: true });
  await assertVisibleTarget(action, page);
  await page.screenshot({ path: info.outputPath("empty-reports-action.png"), fullPage: false });
  await action.click();
  await gamePage.waitForScreen("calendar");
});

test("Watch retains its intentional omission of workspace navigation", async ({ gamePage, page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gamePage.goto();
  await gamePage.injectLateGameState("youth");
  await gamePage.startObservationSession("schoolMatch");
  await gamePage.waitForScreen("observation");
  await expect(page.getByRole("navigation", { name: "Youth Scout workspace", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open navigation menu", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("watch-without-workspace-nav.png"), fullPage: false });
});
