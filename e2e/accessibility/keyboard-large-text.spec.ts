import { test, expect } from "../fixtures";

test.use({ viewport: { width: 711, height: 452 }, contextOptions: { reducedMotion: "reduce" } });

test.beforeEach(async ({ page }) => {
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
});

test("settings radio labels expose native keyboard focus with large interface text", async ({ page }, testInfo) => {
  await page.goto("/play");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const graphics = page.getByRole("tab", { name: "Graphics", exact: true });
  await graphics.click();
  await graphics.focus();
  const medium = page.getByRole("radiogroup", { name: "fontSize", exact: true }).getByRole("radio", { name: "Medium", exact: true });
  for (let index = 0; index < 12 && !(await medium.evaluate(e => e === document.activeElement)); index++) {
    await page.keyboard.press("Tab");
  }
  await expect(medium).toBeFocused();
  const before = await medium.evaluate(e => ({ input: getComputedStyle(e).outline, label: getComputedStyle(e.parentElement!).outline }));
  await page.screenshot({ path: testInfo.outputPath("settings-native-focus.png") });
  await testInfo.attach("settings-focus.json", { body: JSON.stringify(before), contentType: "application/json" });
  expect(await medium.evaluate(e => parseFloat(getComputedStyle(e.parentElement!).outlineWidth))).toBeGreaterThanOrEqual(2);
  await page.keyboard.press("ArrowRight");
  const large = page.getByRole("radio", { name: "Large", exact: true });
  await expect(large).toBeFocused();
  await expect(large).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/font-large/);
  expect(await large.evaluate(e => parseFloat(getComputedStyle(e.parentElement!).outlineWidth))).toBeGreaterThanOrEqual(2);
  await page.keyboard.press("Tab");
  expect(await large.evaluate(e => parseFloat(getComputedStyle(e.parentElement!).outlineWidth))).toBe(0);
});

test("keyboard assessment step changes retain focus at large-text reflow width", async ({ page, gamePage }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/play");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Graphics", exact: true }).click();
  await page.getByRole("radio", { name: "Large", exact: true }).locator("..").click();
  await page.getByRole("button", { name: "Back to main menu", exact: true }).click();
  await page.getByRole("button", { name: "Start Youth Scout Career", exact: true }).click();
  await page.locator("#scout-first-name").fill("Keyboard");
  await page.locator("#scout-last-name").fill("Reflow");
  await page.getByRole("button", { name: /Projection Specialist/ }).click();
  await page.getByRole("button", { name: "Take the call", exact: true }).click();
  await gamePage.waitForScreen("observation", 60_000);
  await page.getByRole("button", { name: "Watch the match", exact: true }).click();
  const controls = page.getByTestId("mobile-observation-controls");
  // Generated openings can put a lead passage in any phase. Use the available
  // lead flag and approach controls instead of assuming a scripted phase order.
  for (let phase = 0; phase < 12; phase++) {
    const flag = page.locator('[data-tutorial-id="observation-flag-moment"]:visible').first();
    if (await flag.isVisible()) {
      await flag.click();
      await page.locator('[data-tutorial-id="observation-promising-reaction"]:visible').first().click();
    }
    const approach = page.getByRole("button", { name: /^Confirm the first read/ });
    if (await approach.isVisible() && await approach.isEnabled()) await approach.click();
    const reflect = controls.getByRole("button", { name: "Reflect on the watch", exact: true });
    if (await reflect.isVisible()) { await reflect.click(); break; }
    await controls.getByRole("button", { name: "Next phase", exact: true }).click();
  }
  await page.getByRole("radio", { name: /^No reliable conclusion/ }).first().check();
  await page.getByRole("button", { name: "Complete Reflection", exact: true }).click();
  await gamePage.waitForScreen("openingDiscovery");
  await page.getByRole("button", { name: /Keep the name private/ }).click();
  await gamePage.waitForScreen("reportWriter");
  const stages = ["Saved evidence", "What it suggests", "What remains untested", "Next test"];
  const focusProof: unknown[] = [];
  await page.getByRole("group", { name: stages[0], exact: true }).getByRole("radio").first().focus();
  for (let index = 0; index < stages.length - 1; index++) {
    await page.keyboard.press("Space");
    const next = page.getByRole("group", { name: stages[index + 1], exact: true }).getByRole("radio").first();
    await expect(next).toBeVisible();
    focusProof.push(await page.evaluate(() => ({ tag: document.activeElement?.tagName, name: document.activeElement?.getAttribute("name") })));
    await testInfo.attach(`step-${index + 1}-focus.json`, { body: JSON.stringify(focusProof.at(-1)), contentType: "application/json" });
    await expect(next).toBeFocused();
  }
  await page.keyboard.press("Space"); // choose next test without advancing past recommendation
  const recommendation = page.getByRole("group", { name: "Recommended action", exact: true }).getByRole("radio", { name: /^Keep private/ });
  await recommendation.focus();
  await page.keyboard.press("Space");
  const confidence = page.getByRole("group", { name: "Confidence", exact: true }).getByRole("radio").first();
  await expect(confidence).toBeFocused();
  await page.keyboard.press("Space");
  const file = page.getByRole("button", { name: "File initial assessment", exact: true });
  await expect(file).toBeEnabled();
  await file.focus();
  await page.keyboard.press("Enter");
  await gamePage.waitForScreen("calendar");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("large-text-keyboard-planner.png") });
  await testInfo.attach("assessment-keyboard-focus.json", { body: JSON.stringify(focusProof), contentType: "application/json" });
  gamePage.expectNoConsoleErrors();
});
