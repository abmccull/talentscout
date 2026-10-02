import type { Locator, Page, TestInfo } from "@playwright/test";
import { test, expect } from "../fixtures";

const REST_REASON = "Fatigue at 75% — rest recommended";
const OBSERVATION_HELP =
  "Number of times you've observed this player. More observations improve reading accuracy.";
const ATTRIBUTE_HELP =
  "Your estimated reading of this attribute. Accuracy depends on observations, lens focus, and scout skills.";
const VISIBLE_ATTRIBUTE = /^(first touch|passing|dribbling|crossing|shooting|heading|tackling|finishing|pace|strength|stamina|agility|jumping|balance|composure|positioning|work rate|decision making|leadership|anticipation|off the ball|pressing|defensive awareness|vision|marking|teamwork)$/i;

type RequestedSide = "left" | "top" | "right";

async function assertPublicSide(
  page: Page,
  trigger: Locator,
  content: string,
  side: RequestedSide,
  testInfo: TestInfo,
) {
  await page.mouse.move(1, 1);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await trigger.scrollIntoViewIfNeeded();
  await expect(trigger).toBeVisible();
  await trigger.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toHaveCount(1);
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(content);

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Public geometry precondition: viewport is unavailable");
  await expect.poll(async () => {
    const card = await tooltip.boundingBox();
    const anchor = await trigger.boundingBox();
    if (!card || !anchor) return false;
    const contained = card.x >= -1 && card.y >= -1
      && card.x + card.width <= viewport.width + 1
      && card.y + card.height <= viewport.height + 1;
    const requestedSide = side === "left"
      ? card.x + card.width <= anchor.x + 1
      : side === "top"
        ? card.y + card.height <= anchor.y + 1
        : card.x >= anchor.x + anchor.width - 1;
    return contained && requestedSide;
  }, { message: `Visible help must fit the viewport on its requested ${side} side` }).toBe(true);

  await testInfo.attach(`public-${side}-geometry.json`, {
    body: JSON.stringify({
      content, requestedSide: side, viewport,
      trigger: await trigger.boundingBox(),
      tooltip: await tooltip.boundingBox(),
    }, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach(`public-${side}-tooltip.png`, {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  const tooltipId = await tooltip.getAttribute("id");
  expect(tooltipId, "The visible public help card must have a description target ID").toBeTruthy();
  if (!tooltipId) throw new Error("Visible public help has no description target ID");
  await expect.poll(async () =>
    ((await trigger.getAttribute("aria-describedby")) ?? "").split(/\s+/).filter(Boolean),
  ).toContain(tooltipId);
  await page.mouse.move(1, 1);
  await expect(tooltip).toHaveCount(0);
}

test.describe("shared Tooltip real directional consumers", () => {
  test.describe.configure({ retries: 0 });

  test("Planner rest suggestion shows left help and describes its real reason span", async ({ gamePage }, testInfo) => {
    const page = gamePage.page;
    await page.setViewportSize({ width: 1440, height: 900 });
    await gamePage.goto();
    // Supported scout/week override; the ordinary desk-start schedule is retained.
    await gamePage.injectState({
      currentWeek: 5,
      scout: { careerTier: 1, primarySpecialization: "youth", fatigue: 75 },
    });
    await gamePage.navigateTo("calendar");
    const preview = page.getByRole("button", { name: /^Week Preview\b/ });
    await expect(preview, "Public precondition: the fatigue Week Preview must exist").toBeVisible();
    if (await preview.getByText("Show", { exact: true }).isVisible()) await preview.click();
    await expect(page.getByText("Suggested Schedule", { exact: true })).toBeVisible();
    // first() retains the public trigger when the old inline help repeats the text.
    const reason = page.getByTestId("planner-scroll-region").getByText(REST_REASON, { exact: true }).first();
    await expect(reason, "Public precondition: an actual free-day rest suggestion must be visible").toBeVisible();
    await assertPublicSide(page, reason, REST_REASON, "left", testInfo);
  });

  // Static draft only. Root must first verify this unseeded public watch/profile
  // precondition. A failure is recorded; never inject evidence or skip the case.
  test("a real observed prospect retains top and right Evidence help", async ({ gamePage }, testInfo) => {
    test.setTimeout(120_000);
    const page = gamePage.page;
    await page.setViewportSize({ width: 1440, height: 900 });
    await gamePage.goto();
    // Existing fresh-career fixture only: normal, England, e2e-seed-42,
    // default youth skills, desk opening. No observation/profile evidence seeded.
    await gamePage.injectState({
      currentWeek: 1,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });
    await gamePage.navigateTo("calendar");
    await gamePage.scheduleActivityByLabel("School Match", "Mon");
    await gamePage.advanceCanonicalWeek({ launchLiveSession: true, maxLiveSessions: 1 });
    await gamePage.navigateTo("youthScouting");

    type PublicProfileAttempt = {
      publicProfileName: string;
      publicBadge: string | null;
      observationHeading: string;
      visibleKnownAttributes: string[];
    };
    const attempts: PublicProfileAttempt[] = [];
    let selected: PublicProfileAttempt | null = null;
    await test.step("real school-match saved-reading precondition", async () => {
      const observedProfiles = page.getByRole("button", { name: /^View profile for / })
        .filter({ has: page.getByText(/^[1-9]\d* looks?$/) });
      const candidates = await observedProfiles.evaluateAll((buttons) => buttons.map((button) => ({
        publicProfileName: button.getAttribute("aria-label") ?? "",
        publicBadge: [...button.querySelectorAll("span")]
          .map((span) => span.textContent?.trim() ?? "")
          .find((text) => /^[1-9]\d* looks?$/.test(text)) ?? null,
      })));
      await testInfo.attach("public-school-match-candidates.json", {
        body: JSON.stringify({
          fixture: { seed: "e2e-seed-42", opening: "desk", week: 1,
            countries: ["england"], difficulty: "normal", maxLiveSessions: 1 },
          candidates,
        }, null, 2),
        contentType: "application/json",
      });
      expect(candidates.length,
        "School-match precondition failed: the one completed real watch exposes no positive observed profile",
      ).toBeGreaterThan(0);
      expect(candidates.every((candidate) => candidate.publicProfileName.length > 0),
        "School-match precondition: each candidate must expose its real profile accessible name",
      ).toBe(true);
      expect(new Set(candidates.map((candidate) => candidate.publicProfileName)).size,
        "School-match precondition: duplicate public profile names require a separate explicit UI disambiguation",
      ).toBe(candidates.length);

      // Inspect real observed profiles from this one watch in rendered order.
      // Every unsuccessful reading candidate is recorded, not skipped or seeded.
      for (const [index, candidate] of candidates.entries()) {
        const profile = page.getByRole("button", { name: candidate.publicProfileName, exact: true })
          .filter({ has: page.getByText(/^[1-9]\d* looks?$/) });
        await expect(profile, "Public precondition: the real observed profile button is unique").toHaveCount(1);
        await profile.scrollIntoViewIfNeeded();
        await expect(profile).toBeVisible();
        await profile.click();
        const evidenceTab = page.getByRole("tab", { name: /^Evidence\b/ });
        await expect(evidenceTab).toBeVisible();
        await evidenceTab.click();
        const evidence = page.locator("#player-profile-panel-evidence");
        await expect(evidence).toBeVisible();
        const observations = evidence.getByText(/^Observations \([1-9]\d*\)$/);
        await expect(observations,
          "Public precondition: this observed profile must retain a positive saved observation count",
        ).toBeVisible();
        // Match the actual attribute-label span, not a value or unknown-row
        // toggle. The initial public Evidence panel renders only known rows.
        const knownLabels = evidence.locator("span.w-32.shrink-0.capitalize")
          .filter({ hasText: VISIBLE_ATTRIBUTE });
        const attempt: PublicProfileAttempt = {
          ...candidate,
          observationHeading: await observations.innerText(),
          visibleKnownAttributes: await knownLabels.allTextContents(),
        };
        attempts.push(attempt);
        await testInfo.attach(`public-profile-precondition-${index + 1}.json`, {
          body: JSON.stringify(attempt, null, 2),
          contentType: "application/json",
        });
        await testInfo.attach(`public-profile-precondition-${index + 1}.png`, {
          body: await page.screenshot(),
          contentType: "image/png",
        });
        if (attempt.visibleKnownAttributes.length > 0) {
          await expect(knownLabels.first(),
            "Public precondition: the saved known attribute label must already be visible",
          ).toBeVisible();
          selected = attempt;
          break;
        }
        const back = page.getByRole("button", { name: "Back to prospects", exact: true });
        await expect(back).toBeVisible();
        await back.click();
        await expect(page.getByRole("button", { name: /^View profile for / }).first()).toBeVisible();
      }
      await testInfo.attach("public-observation-preconditions.json", {
        body: JSON.stringify({ attempts, selected }, null, 2),
        contentType: "application/json",
      });
      expect(selected,
        "School-match precondition failed: none of the observed public profiles has an already visible saved attribute reading; preserve these artifacts before changing the fixture",
      ).not.toBeNull();
    });

    // No tooltip assertion runs until the real public saved-reading step passes.
    const evidence = page.locator("#player-profile-panel-evidence");
    await expect(evidence).toBeVisible();
    const observations = evidence.getByText(/^Observations \([1-9]\d*\)$/);
    const readingLabel = evidence.locator("span.w-32.shrink-0.capitalize")
      .filter({ hasText: VISIBLE_ATTRIBUTE }).first();
    await expect(observations).toBeVisible();
    await expect(readingLabel).toBeVisible();
    await assertPublicSide(page, observations, OBSERVATION_HELP, "top", testInfo);
    await assertPublicSide(page, readingLabel, ATTRIBUTE_HELP, "right", testInfo);
  });
});
