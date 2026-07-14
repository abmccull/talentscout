import { mkdir } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Locator } from "@playwright/test";
import { test, expect } from "../fixtures";
import type { GamePage } from "../fixtures";
import { SELECTORS } from "../helpers/selectors";

const evidenceDir = path.join(
  process.cwd(),
  "design-audit-evidence",
  "release-2026-07-13",
);

const viewports = [
  { name: "desktop" as const, width: 1440, height: 900 },
  { name: "mobile" as const, width: 390, height: 844 },
];

async function dismissAchievement(gamePage: GamePage) {
  const dismiss = gamePage.page.getByRole("button", {
    name: "Dismiss achievement notification",
  });
  if (await dismiss.isVisible({ timeout: 250 }).catch(() => false)) {
    await dismiss.click();
    await gamePage.page.waitForTimeout(200);
  }
}

async function captureBoth(
  gamePage: GamePage,
  name: string,
  options: { fullPage?: boolean; axe?: boolean; assertResponsiveWidth?: boolean } = {},
) {
  for (const viewport of viewports) {
    await gamePage.page.setViewportSize({ width: viewport.width, height: viewport.height });
    await dismissAchievement(gamePage);
    await gamePage.page.waitForTimeout(350);
    await gamePage.page.screenshot({
      path: path.join(evidenceDir, `${viewport.name}-${name}.png`),
      fullPage: options.fullPage ?? false,
    });

    if (options.assertResponsiveWidth) {
      const widths = await gamePage.page.evaluate(() => {
        const main = document.querySelector<HTMLElement>("#game-main");
        return {
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
          mainClient: main?.clientWidth ?? 0,
          mainScroll: main?.scrollWidth ?? 0,
        };
      });
      expect(
        widths.document,
        `${name} ${viewport.name} document has horizontal overflow: ${JSON.stringify(widths)}`,
      ).toBeLessThanOrEqual(widths.viewport + 1);
      if (widths.mainClient > 0) {
        expect(
          widths.mainScroll,
          `${name} ${viewport.name} game surface has horizontal overflow: ${JSON.stringify(widths)}`,
        ).toBeLessThanOrEqual(widths.mainClient + 1);
      }
    }

    if (options.axe) {
      const scan = await new AxeBuilder({ page: gamePage.page }).analyze();
      const blocking = scan.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      );
      expect(
        blocking,
        `${name} ${viewport.name} blocking Axe violations:\n${JSON.stringify(blocking, null, 2)}`,
      ).toEqual([]);
    }
  }
}

async function captureIntroSplashBoth(gamePage: GamePage, name: string) {
  for (const viewport of viewports) {
    await gamePage.page.setViewportSize({ width: viewport.width, height: viewport.height });
    await gamePage.page.reload({ waitUntil: "domcontentloaded" });
    const splash = gamePage.page.getByTestId("main-menu-splash");
    await expect(splash).toBeVisible();
    await gamePage.page.screenshot({
      path: path.join(evidenceDir, `${viewport.name}-${name}.png`),
    });
  }
}

async function captureSurfaceBoth(
  gamePage: GamePage,
  name: string,
  testId: string,
) {
  for (const viewport of viewports) {
    await gamePage.page.setViewportSize({ width: viewport.width, height: viewport.height });
    await dismissAchievement(gamePage);
    const surface = gamePage.page.getByTestId(testId).first();
    await expect(surface).toBeVisible();
    await surface.scrollIntoViewIfNeeded();
    await gamePage.page.waitForTimeout(250);
    await surface.screenshot({
      path: path.join(evidenceDir, `${viewport.name}-${name}.png`),
    });
  }
}

async function expectNoVisualOverlap(
  first: Locator,
  second: Locator,
  label: string,
) {
  const [firstBox, secondBox] = await Promise.all([
    first.boundingBox(),
    second.boundingBox(),
  ]);
  expect(firstBox, `${label}: first surface is not rendered`).not.toBeNull();
  expect(secondBox, `${label}: second surface is not rendered`).not.toBeNull();
  if (!firstBox || !secondBox) return;

  const overlapWidth = Math.max(
    0,
    Math.min(firstBox.x + firstBox.width, secondBox.x + secondBox.width)
      - Math.max(firstBox.x, secondBox.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(firstBox.y + firstBox.height, secondBox.y + secondBox.height)
      - Math.max(firstBox.y, secondBox.y),
  );
  expect(
    overlapWidth * overlapHeight,
    `${label}: controls overlap by ${overlapWidth * overlapHeight}px`,
  ).toBe(0);
}

async function allocateYouthPoints(gamePage: GamePage) {
  const allocations: Record<string, number> = {
    technicalEye: 2,
    physicalAssessment: 1,
    psychologicalRead: 1,
    playerJudgment: 1,
    potentialAssessment: 3,
  };
  for (const [skill, amount] of Object.entries(allocations)) {
    for (let index = 0; index < amount; index++) {
      await gamePage.page.getByRole("button", { name: `Increase ${skill}` }).click();
    }
  }
}

async function addAuditDecisions(gamePage: GamePage) {
  await gamePage.page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const state = store.getState().gameState;
    const organization = Object.values(
      state.rivalOrganizationState.organizations,
    )[0] as any;
    if (!organization) throw new Error("Rival organization audit fixture is unavailable");

    const opportunity = {
      id: "audit-rival-opening",
      organizationId: organization.id,
      kind: "counter-scouting-window",
      title: "Counter-Scouting Window",
      description: `${organization.name} has overextended around a priority target. Focused work now could expose its recruitment picture.`,
      status: "open",
      createdSeason: state.currentSeason,
      createdWeek: state.currentWeek,
      expiresSeason: state.currentSeason,
      expiresWeek: state.currentWeek + 2,
      knownTradeoffs: [
        "Costs fatigue and displaces planned work this week",
        "Failure strengthens the rival agenda and increases its influence",
      ],
      outcomeRoll: 0.44,
      successChance: 0.68,
    };

    const event = {
      id: "audit-special-event",
      type: "careerCrossroads",
      specialEventId: "career-board-vote",
      week: state.currentWeek,
      season: state.currentSeason,
      title: "Board Vote: Put Your Name On It",
      description:
        "A recruitment committee is split over a prospect. The sporting director wants a recommendation with a name attached before the vote.",
      relatedIds: [],
      acknowledged: false,
      decisionDeadlineWeeks: 2,
      defaultChoiceIndex: 2,
      choices: [
        {
          label: "Stake your reputation",
          effect: "crossroadsAllIn",
          knownTradeoffs: [
            "Maximum personal credit if the player succeeds",
            "A failed recommendation will be attached directly to your name",
          ],
        },
        {
          label: "Build a coalition",
          effect: "crossroadsCoalition",
          knownTradeoffs: [
            "A second opinion improves decision quality",
            "Credit and political ownership will be shared",
          ],
        },
        {
          label: "Walk away",
          effect: "crossroadsWalkAway",
          knownTradeoffs: [
            "Avoids exposure to the football outcome",
            "Decision-makers remember the lack of conviction",
          ],
        },
      ],
    };

    const trackedPlayer = Object.values(state.players)[0] as any;
    const trackedClubs = Object.values(state.clubs) as any[];
    const discoveryRecord = trackedPlayer ? {
      playerId: trackedPlayer.id,
      discoveredWeek: 2,
      discoveredSeason: state.currentSeason,
      initialCA: trackedPlayer.currentAbility,
      careerSnapshots: [],
      wasWonderkid: false,
    } : null;
    const movement = trackedPlayer ? {
      id: "audit-career-movement",
      playerId: trackedPlayer.id,
      type: "permanentTransfer",
      week: Math.max(3, state.currentWeek - 1),
      season: state.currentSeason,
      fromClubId: trackedClubs[0]?.id,
      toClubId: trackedClubs[1]?.id,
      fee: 1_250_000,
      reason: "A strong season created a credible step up.",
    } : null;
    const internationalAssignment = {
      id: "audit-international-assignment",
      country: "brazil",
      region: "southAmerica",
      description: "Build a live youth dossier in Brazil before the recruitment window closes.",
      weekAvailable: state.currentWeek,
      duration: 2,
      reputationReward: 3,
      type: "youthTournament",
      deliverables: [
        {
          kind: "liveObservation",
          label: "Complete 3 field observations of players based in the destination",
          target: 3,
          progress: 0,
        },
        {
          kind: "submittedReport",
          label: "Submit 1 destination-player report before returning",
          target: 1,
          progress: 0,
        },
      ],
      creditedEventIds: [],
    };

    store.getState().loadGame({
      ...state,
      scout: {
        ...state.scout,
        careerTier: Math.max(3, state.scout.careerTier),
      },
      rivalOrganizationState: {
        ...state.rivalOrganizationState,
        opportunities: {
          ...state.rivalOrganizationState.opportunities,
          [opportunity.id]: opportunity,
        },
      },
      narrativeEvents: [event, ...state.narrativeEvents],
      discoveryRecords: discoveryRecord
        ? [
            ...state.discoveryRecords.filter((record: any) => record.playerId !== discoveryRecord.playerId),
            discoveryRecord,
          ]
        : state.discoveryRecords,
      playerMovementHistory: movement
        ? [
            ...(state.playerMovementHistory ?? []).filter((entry: any) => entry.id !== movement.id),
            movement,
          ]
        : state.playerMovementHistory,
      internationalAssignments: [
        internationalAssignment,
        ...state.internationalAssignments.filter(
          (assignment: any) => assignment.id !== internationalAssignment.id,
        ),
      ],
    });
  });
}

test.describe("Interactivity audit rendered evidence", () => {
  test.setTimeout(600_000);

  test("captures onboarding, core workspaces, and decision states", async ({ gamePage }) => {
    await mkdir(evidenceDir, { recursive: true });
    await gamePage.goto();

    await captureIntroSplashBoth(gamePage, "00-intro-splash");
    await gamePage.page.getByRole("button", { name: "Skip intro" }).click();
    await expect(gamePage.page.getByTestId("main-menu-actions")).toBeVisible();
    await captureBoth(gamePage, "01-main-menu", { axe: true });
    await gamePage.page.getByRole("button", { name: "Future roadmap" }).click();
    await gamePage.waitForScreen("futureRoadmap");
    await expect(gamePage.page.getByTestId("future-roadmap-screen")).toBeVisible();
    await captureBoth(gamePage, "01b-future-roadmap-overview", {
      fullPage: true,
      axe: true,
      assertResponsiveWidth: true,
    });
    await gamePage.page.getByRole("tab", { name: "Game modes" }).click();
    await captureBoth(gamePage, "01c-future-roadmap-modes", {
      fullPage: true,
      axe: true,
      assertResponsiveWidth: true,
    });
    await gamePage.page.getByRole("button", { name: "Back to main menu" }).click();
    await gamePage.waitForScreen("mainMenu");
    await expect(gamePage.page.getByTestId("main-menu-actions")).toBeVisible();
    await gamePage.page.locator(SELECTORS.newGameButton).first().click();
    await gamePage.page.locator(SELECTORS.firstNameInput).fill("Maya");
    await gamePage.page.locator(SELECTORS.lastNameInput).fill("Reed");
    await captureBoth(gamePage, "02-onboarding-identity", { fullPage: true, axe: true });
    await gamePage.page.getByRole("button", { name: /^Continue$/ }).click();
    await allocateYouthPoints(gamePage);
    await captureBoth(gamePage, "03-onboarding-career-dna", { fullPage: true, axe: true });
    const careerDna = gamePage.page.locator('section[aria-labelledby="career-dna-heading"]');
    for (const viewport of viewports) {
      await gamePage.page.setViewportSize({ width: viewport.width, height: viewport.height });
      await careerDna.scrollIntoViewIfNeeded();
      await careerDna.screenshot({
        path: path.join(evidenceDir, `${viewport.name}-03b-career-dna-detail.png`),
      });
    }

    await gamePage.injectState({
      currentWeek: 12,
      // Brazil is part of this rendered career so the later international
      // assignment remains backed by generated world content after load/migration.
      countries: ["england", "brazil"],
      scout: {
        firstName: "Maya",
        lastName: "Reed",
        careerTier: 2,
        reputation: 52,
        primarySpecialization: "youth",
      },
    });
    await addAuditDecisions(gamePage);

    const workspaces = [
      ["dashboard", "04-desk"],
      ["calendar", "05-planner"],
      ["youthScouting", "06-prospects"],
      ["reportHistory", "07-reports"],
      ["internationalView", "08-world"],
      ["career", "09-career"],
    ] as const;
    for (const [screen, name] of workspaces) {
      await gamePage.setScreen(screen);
      await captureBoth(gamePage, name, { fullPage: true });
      if (screen === "internationalView") {
        const assignmentPanel = gamePage.page.getByTestId("international-assignment-panel");
        await expectNoVisualOverlap(
          assignmentPanel,
          gamePage.page.getByRole("button", { name: /World Archive/i }),
          "mobile World Archive and assignment panel",
        );
        await expectNoVisualOverlap(
          assignmentPanel,
          gamePage.page.getByRole("button", { name: /Browse countries/i }),
          "mobile country browser and assignment panel",
        );
      }
    }

    await gamePage.setScreen("calendar");
    await captureSurfaceBoth(gamePage, "05b-weekly-strategy", "weekly-strategy-panel");

    await gamePage.setScreen("career");
    await captureSurfaceBoth(gamePage, "09a-world-conditions", "world-condition-panel");
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      store.getState().loadGame({
        ...state,
        careerRecovery: {
          version: 1,
          history: [],
          current: {
            id: "audit-career-recovery",
            decisionId: "audit-career-recovery-decision",
            kind: "firing",
            previousTier: Math.max(2, state.scout.careerTier),
            previousClubId: state.scout.currentClubId,
            triggeredWeek: state.currentWeek,
            triggeredSeason: state.currentSeason,
            choiceDueWeek: state.currentWeek + 1,
            choiceDueSeason: state.currentSeason,
            status: "awaitingChoice",
            target: 0,
            progress: 0,
            progressSourceIds: [],
            baselineReportIds: [],
          },
        },
      });
    });
    // loadGame deliberately returns imported saves to their safe restore
    // screen. Navigate back to the workspace whose injected state we are
    // capturing instead of relying on the pre-load route to survive.
    await gamePage.setScreen("career");
    await captureSurfaceBoth(gamePage, "09aa-career-recovery", "career-recovery-panel");

    await gamePage.setScreen("performance");
    await captureSurfaceBoth(gamePage, "09ab-judgment-calibration", "judgment-calibration");

    await gamePage.setScreen("internationalView");
    await captureBoth(gamePage, "08a-international-assignment", {
      fullPage: true,
      axe: true,
      assertResponsiveWidth: true,
    });
    await captureSurfaceBoth(
      gamePage,
      "08b-international-deliverables",
      "international-assignment-objectives",
    );

    await gamePage.setScreen("career");
    await gamePage.page.getByRole("tab", { name: "Track Record" }).click();
    await captureBoth(gamePage, "09b-career-track-record", {
      fullPage: true,
      axe: true,
      assertResponsiveWidth: true,
    });
    await captureSurfaceBoth(gamePage, "09c-consequence-cinema", "consequence-cinema");

    await gamePage.setScreen("dashboard");
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const clubId = Object.keys(state.clubs)[0];
      const manager = state.managerProfiles[clubId];
      if (!clubId || !manager) throw new Error("Political meeting audit fixture is unavailable");
      store.getState().loadGame({
        ...state,
        scout: {
          ...state.scout,
          careerTier: 5,
          careerPath: "club",
          careerPathChosen: true,
          currentClubId: clubId,
          reputation: 62,
          fatigue: 20,
          managerRelationship: {
            managerName: manager.managerName,
            trust: 55,
            influence: 48,
            scoutingPreference: manager.preference,
            meetingsThisSeason: 0,
          },
        },
        finances: state.finances
          ? { ...state.finances, careerPath: "club" }
          : state.finances,
        boardProfile: {
          personality: "ambitious",
          patience: 65,
          satisfactionLevel: 58,
          budgetMultiplier: 1,
          ultimatumIssued: false,
          recentDirectives: [],
        },
      });
      store.getState().setScreen("career");
    });
    await gamePage.waitForScreen("career");
    await captureBoth(gamePage, "09d-career-politics", {
      fullPage: true,
      axe: true,
      assertResponsiveWidth: true,
    });
    await gamePage.page.setViewportSize({ width: 1440, height: 900 });
    await gamePage.page.getByRole("radio", { name: /Challenge professionally/i }).check();
    await gamePage.page.getByRole("button", { name: /Meet Manager/ }).click();
    await gamePage.page.getByRole("radio", { name: /Pitch the vision/i }).check();
    await gamePage.page.getByRole("button", { name: /Meet Board/ }).click();
    await expect(gamePage.page.getByTestId("manager-meeting-outcome")).toBeVisible();
    await expect(gamePage.page.getByTestId("board-meeting-outcome")).toBeVisible();
    await captureBoth(gamePage, "09e-career-political-outcomes", {
      fullPage: true,
      axe: true,
      assertResponsiveWidth: true,
    });
    await captureSurfaceBoth(
      gamePage,
      "09f-manager-political-meeting",
      "manager-political-meeting",
    );
    await captureSurfaceBoth(
      gamePage,
      "09g-board-political-meeting",
      "board-political-meeting",
    );

    await gamePage.setScreen("inbox");
    await captureBoth(gamePage, "10-special-event-choice", {
      fullPage: true,
      axe: true,
    });
    const eventTitle = gamePage.page.getByTestId("narrative-event-title").first();
    const titleLayout = await eventTitle.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
      };
    });
    expect(titleLayout.scrollWidth).toBeLessThanOrEqual(titleLayout.clientWidth + 1);
    expect(titleLayout.textOverflow).not.toBe("ellipsis");
    expect(titleLayout.whiteSpace).not.toBe("nowrap");

    await gamePage.setScreen("rivals");
    await captureBoth(gamePage, "11-rival-landscape", {
      fullPage: true,
      axe: true,
      assertResponsiveWidth: true,
    });
    await captureSurfaceBoth(
      gamePage,
      "11b-rival-operations-network",
      "rival-operations-network",
    );

    gamePage.expectNoConsoleErrors();
  });

  test("captures dossier, observation, and week-simulation gameplay", async ({ gamePage }) => {
    await mkdir(evidenceDir, { recursive: true });
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 12,
      scout: {
        firstName: "Maya",
        lastName: "Reed",
        careerTier: 2,
        reputation: 52,
        primarySpecialization: "youth",
      },
    });

    await gamePage.page.setViewportSize({ width: 1440, height: 900 });
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const youth = Object.values(state.unsignedYouth)[0] as any;
      const playerId = youth?.player?.id ?? Object.keys(state.players)[0];
      if (!playerId) throw new Error("Prospect dossier audit fixture is unavailable");
      const contactId = Object.keys(state.contacts)[0] ?? "audit-contact";
      const contactName = state.contacts[contactId]?.name ?? "Academy contact";
      const contactPerspective = {
        actorId: contactId,
        actorKind: "contact",
        lens: "characterContext",
        riskTolerance: "cautious",
        reliabilityBand: "established",
        biases: [{ category: "consistency", adjustment: -0.08 }],
      };
      const npcPerspective = {
        actorId: "audit-npc-scout",
        actorKind: "npcScout",
        lens: "dataProjection",
        riskTolerance: "bold",
        reliabilityBand: "established",
        biases: [{ category: "consistency", adjustment: 0.09 }],
      };
      const contactClaim = {
        id: `audit-contact-claim-${playerId}`,
        playerId,
        sourceId: contactId,
        sourceName: contactName,
        sourceKind: "contact",
        category: "consistency",
        direction: "negative",
        range: { scale: "qualitative", label: "concern" },
        confidence: 0.72,
        statement: `${contactName} has seen the player drift out of matches after early setbacks.`,
        explanation: "Character-context lens, cautious threshold, established reliability, recorded this week. Different contexts can conflict with live evidence.",
        recordedWeek: state.currentWeek,
        recordedSeason: state.currentSeason,
        perspective: contactPerspective,
        calibration: {
          status: "challenged",
          note: "Challenged at a prior one-season checkpoint by sustained observable performance.",
          reviewedWeek: 8,
          reviewedSeason: state.currentSeason,
        },
      };
      const npcClaim = {
        id: `audit-npc-claim-${playerId}`,
        playerId,
        sourceId: "audit-npc-report",
        sourceName: "Morgan Vale",
        sourceKind: "npcScout",
        category: "consistency",
        direction: "positive",
        range: { scale: "attribute20", low: 12, high: 15 },
        confidence: 0.78,
        statement: "Morgan Vale sees repeatable decision quality across the available match sample.",
        explanation: "Data-projection lens, aggressive threshold, established reliability, recorded this week. The contact is using a different context and reference standard.",
        recordedWeek: state.currentWeek,
        recordedSeason: state.currentSeason,
        perspective: npcPerspective,
        calibration: {
          status: "supported",
          note: "Supported at a prior one-season checkpoint by sustained observable performance.",
          reviewedWeek: 8,
          reviewedSeason: state.currentSeason,
        },
      };
      store.getState().loadGame({
        ...state,
        contactIntel: {
          ...state.contactIntel,
          [playerId]: [
            ...(state.contactIntel[playerId] ?? []),
            {
              playerId,
              attribute: "consistency",
              hint: contactClaim.statement,
              reliability: contactClaim.confidence,
              sourceContactId: contactId,
              sourceName: contactName,
              recordedWeek: state.currentWeek,
              recordedSeason: state.currentSeason,
              evidenceClaim: contactClaim,
            },
          ],
        },
        npcReports: {
          ...state.npcReports,
          "audit-npc-report": {
            id: "audit-npc-report",
            npcScoutId: "audit-npc-scout",
            playerId,
            week: state.currentWeek,
            season: state.currentSeason,
            quality: 78,
            summary: "A positive data-led reading that conflicts with local character context.",
            recommendation: "shortlist",
            reviewed: true,
            sourcePerspective: npcPerspective,
            evidenceClaims: [npcClaim],
          },
        },
      });
      store.getState().selectPlayer(playerId);
      store.getState().setScreen("playerProfile");
    });
    await gamePage.waitForScreen("playerProfile");
    await captureBoth(gamePage, "12-prospect-dossier", {
      fullPage: true,
      axe: true,
      assertResponsiveWidth: true,
    });
    await captureSurfaceBoth(gamePage, "12a-development-environment", "development-environment");
    await expect(gamePage.page.getByTestId("evidence-board")).toContainText("Morgan Vale");
    await expect(gamePage.page.getByTestId("evidence-board")).toContainText(/conflict/i);
    await captureSurfaceBoth(gamePage, "12b-evidence-board", "evidence-board");
    await gamePage.setScreen("reportWriter");
    await gamePage.waitForScreen("reportWriter");
    await gamePage.page.waitForTimeout(250);
    gamePage.expectNoConsoleErrors();
    await captureBoth(gamePage, "13-report-writer", {
      fullPage: true,
      axe: true,
      assertResponsiveWidth: true,
    });
    await captureSurfaceBoth(
      gamePage,
      "13b-report-presentation-room",
      "report-presentation-room",
    );

    await gamePage.startObservationSession("schoolMatch");
    await captureBoth(gamePage, "14-observation-setup", { axe: true });
    await gamePage.page.setViewportSize({ width: 1440, height: 900 });
    await gamePage.page.getByRole("button", { name: /^Begin Observation$/ }).click();
    const focusButton = gamePage.page.locator('button[aria-label^="Add focus to "]').first();
    if (await focusButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await focusButton.click();
      await gamePage.page
        .getByRole("button", { name: /^Use technical lens for /i })
        .first()
        .click();
    }
    const flagMoment = gamePage.page.getByRole("button", { name: /^Flag this moment$/ }).first();
    if (await flagMoment.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await flagMoment.click();
      await gamePage.page.getByRole("button", { name: /^Promising$/ }).click();
    }
    await captureBoth(gamePage, "15-observation-live", {
      axe: true,
      assertResponsiveWidth: true,
    });
    await captureSurfaceBoth(gamePage, "15b-observation-pitch", "observation-pitch");

    await gamePage.page.setViewportSize({ width: 1440, height: 900 });
    for (let phase = 0; phase < 30; phase++) {
      const reflection = gamePage.page.getByRole("button", { name: /^Go to Reflection$/ });
      if (await reflection.isVisible({ timeout: 250 }).catch(() => false)) {
        await reflection.click();
        break;
      }
      const next = gamePage.page.getByRole("button", { name: /^Next Phase$/ });
      if (await next.isVisible({ timeout: 250 }).catch(() => false)) {
        await next.click();
      }
    }
    await captureBoth(gamePage, "16-observation-reflection", { fullPage: true });
    await gamePage.page.setViewportSize({ width: 1440, height: 900 });
    await gamePage.page.getByRole("button", { name: /^Complete (Reflection|Session)$/ }).click();
    await captureBoth(gamePage, "17-observation-complete");
    const continueButton = gamePage.page.getByRole("button", { name: /^Continue$/ });
    if (await continueButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await continueButton.click();
    }

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      store.getState().autoSchedule();
      store.getState().startWeekSimulation();
    });
    await gamePage.waitForScreen("weekSimulation");
    await expect(
      gamePage.page.getByRole("heading", { name: "Week in Progress" }),
    ).toBeVisible();
    await captureBoth(gamePage, "18-week-simulation", {
      axe: true,
      assertResponsiveWidth: true,
    });
    await captureSurfaceBoth(gamePage, "18b-week-journey", "current-day-journey");

    gamePage.expectNoConsoleErrors();
  });
});
