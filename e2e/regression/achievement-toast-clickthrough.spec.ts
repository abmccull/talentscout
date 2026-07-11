import { test, expect } from "../fixtures";

test.describe("Achievement feedback", () => {
  test("toast body never intercepts core gameplay controls", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      scout: {
        careerTier: 2,
        primarySpecialization: "youth",
        careerPath: "independent",
        reputation: 35,
      },
    });

    await expect(gamePage.page.getByRole("status", { name: /Achievement unlocked:/ })).toBeVisible();
    await gamePage.page.evaluate(() => {
      const button = document.createElement("button");
      button.id = "toast-click-target";
      button.textContent = "Underlying gameplay control";
      button.style.cssText = [
        "position:fixed",
        "right:140px",
        "bottom:70px",
        "width:80px",
        "height:40px",
        "z-index:40",
      ].join(";");
      button.addEventListener("click", () => {
        (window as any).__TOAST_CLICK_THROUGH__ = true;
      });
      document.body.appendChild(button);
    });

    await gamePage.page.locator("#toast-click-target").click();
    expect(await gamePage.page.evaluate(() => (window as any).__TOAST_CLICK_THROUGH__)).toBe(true);
  });
});
