import { test, expect } from "../fixtures";

const VISIBLE_ATTRIBUTE = /^(first touch|passing|dribbling|crossing|shooting|heading|tackling|finishing|pace|strength|stamina|agility|jumping|balance|composure|positioning|work rate|decision making|leadership|anticipation|off the ball|pressing|defensive awareness|vision|marking|teamwork)$/i;

test.describe.configure({ retries: 0 });

  test("one public school-match watch exposes a saved known attribute precondition", async ({ gamePage }, testInfo) => {
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

  });
