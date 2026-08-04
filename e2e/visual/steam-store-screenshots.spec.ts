import { mkdir } from "node:fs/promises";
import path from "node:path";
import { dismissCareerMomentOverlays, expect, test } from "../fixtures";
import type { GamePage } from "../fixtures";
import { seedStructuredEvidenceForPlayer } from "../helpers/structured-evidence";

const screenshotDirectory = path.join(
  process.cwd(),
  "public",
  "images",
  "steam",
  "screenshots",
);
const viewport = { width: 1920, height: 1080 } as const;

async function installCaptureStyles(gamePage: GamePage) {
  await gamePage.page.emulateMedia({ reducedMotion: "reduce" });
  await gamePage.page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      html {
        scroll-behavior: auto !important;
      }
      [data-testid="career-moment-overlay"],
      [role="tooltip"] {
        animation: none !important;
        transition: none !important;
      }
    `,
  });
}

async function dismissAchievementNotifications(gamePage: GamePage) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const dismiss = gamePage.page.getByRole("button", {
      name: "Dismiss achievement notification",
    });
    if (!(await dismiss.isVisible({ timeout: 250 }).catch(() => false))) return;
    await dismiss.click();
    await gamePage.page.waitForTimeout(120);
  }
}

async function dismissBlockingUi(gamePage: GamePage) {
  await dismissCareerMomentOverlays(gamePage.page).catch(() => {});
  await dismissAchievementNotifications(gamePage);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const dismissed = await gamePage.page.evaluate(() => {
      const allowedLabels = new Set([
        "Continue",
        "Incredible!",
        "Close week summary",
        "Continue to promotion",
        "Continue to milestone",
      ]);
      const isVisible = (element: HTMLElement): boolean => {
        const style = window.getComputedStyle(element);
        return style.display !== "none"
          && style.visibility !== "hidden"
          && element.getClientRects().length > 0;
      };
      const visibleButton = [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => {
          if (button.disabled || !isVisible(button)) return false;
          const label = button.getAttribute("aria-label")?.trim()
            || button.innerText.trim()
            || button.textContent?.trim()
            || "";
          return allowedLabels.has(label);
        });
      if (!visibleButton) return false;
      visibleButton.click();
      return true;
    });
    if (!dismissed) break;
    await gamePage.page.waitForTimeout(120);
  }

  await gamePage.page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    const gameMain = document.querySelector<HTMLElement>("#game-main");
    gameMain?.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  });
}

async function prepareFreshViewport(gamePage: GamePage) {
  await gamePage.page.setViewportSize(viewport);
  await gamePage.goto();
  await installCaptureStyles(gamePage);
  await dismissBlockingUi(gamePage);
}

async function waitForSettledScreen(
  gamePage: GamePage,
  screen: string,
  expectations: Array<() => Promise<void>> = [],
) {
  await gamePage.waitForScreen(screen, 60_000);
  await gamePage.page
    .getByText(/^Loading workspace/)
    .waitFor({ state: "hidden", timeout: 60_000 })
    .catch(() => {});
  for (const verify of expectations) {
    await verify();
  }
  await dismissBlockingUi(gamePage);
  await gamePage.page.waitForTimeout(250);
}

async function captureViewport(gamePage: GamePage, fileName: string) {
  await dismissBlockingUi(gamePage);
  await gamePage.page.waitForTimeout(200);
  const size = gamePage.page.viewportSize();
  expect(size, `${fileName} viewport must be configured`).toEqual(viewport);
  await gamePage.page.screenshot({
    path: path.join(screenshotDirectory, fileName),
  });
}

async function seedDashboardShowcase(gamePage: GamePage) {
  await gamePage.injectState({
    currentWeek: 6,
    currentSeason: 1,
    scout: {
      firstName: "Maya",
      lastName: "Reed",
      careerTier: 3,
      reputation: 61,
      primarySpecialization: "youth",
    },
    countries: ["england", "brazil"],
  });

  await gamePage.page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const currentState = store?.getState()?.gameState;
    if (!currentState) throw new Error("Dashboard screenshot fixture needs a game state");

    const nextState = structuredClone(currentState);
    const scoutId = nextState.scout.id;
    const playerTemplate = Object.values(nextState.players)[0] ?? {};
    nextState.currentWeek = 6;
    nextState.currentSeason = 1;
    nextState.schedule.activities = nextState.schedule.activities.map(
      (_: unknown, dayIndex: number) => ({
        type: dayIndex === 2 ? "schoolMatch" : "study",
        slots: 1,
        description: dayIndex === 2 ? "Midweek school match" : `Scheduled study block ${dayIndex + 1}`,
        instanceId: `steam-dashboard-${dayIndex + 1}`,
      }),
    );
    nextState.narrativeEvents = [{
      id: "steam-dashboard-verdict",
      type: "careerCrossroads",
      season: 1,
      week: 6,
      title: "Contract verdict is waiting",
      description: "A live football choice still needs your answer before a rival closes the door.",
      choices: [
        { label: "Press the director now", effect: "The director hears your case." },
        { label: "Wait for another report", effect: "The decision remains unresolved." },
      ],
      selectedChoice: undefined,
      resolved: false,
      acknowledged: false,
      relatedIds: ["steam-director-1"],
      decisionDeadlineWeeks: 0,
    }];
    nextState.reportWorkItems = {
      "steam-dashboard-report": {
        id: "steam-dashboard-report",
        playerId: "steam-dashboard-player",
        scoutId,
        createdWeek: 6,
        createdSeason: 1,
        status: "ready",
        sourceActivity: "writeReport",
        preparationQualityPoints: 5,
        preparationQualityBonus: 0.1,
        freshObservationIds: ["steam-dashboard-observation"],
      },
    };
    nextState.players["steam-dashboard-player"] = {
      ...playerTemplate,
      ...(nextState.players["steam-dashboard-player"] ?? {}),
      id: "steam-dashboard-player",
      firstName: "Luca",
      lastName: "Mora",
    };
    nextState.rivalOrganizationState = {
      ...(nextState.rivalOrganizationState ?? {}),
      opportunities: {
        ...(nextState.rivalOrganizationState?.opportunities ?? {}),
        "steam-dashboard-opportunity": {
          id: "steam-dashboard-opportunity",
          organizationId: "steam-org-1",
          kind: "open-showcase",
          title: "Late-entry showcase seat",
          description: "A rival has left one opening for a high-value youth tournament seat.",
          status: "open",
          createdWeek: 6,
          createdSeason: 1,
          expiresWeek: 6,
          expiresSeason: 1,
          outcomeRoll: 0.22,
          successChance: 0.64,
          knownTradeoffs: [
            "Costs one full day in the weekly strip",
            "A failed pitch strengthens the rival relationship instead",
          ],
        },
      },
    };

    store.getState().loadGame(nextState);
    store.getState().setScreen("dashboard");
  });
}

async function seedWorldAndCareerShowcase(gamePage: GamePage) {
  await gamePage.injectState({
    currentWeek: 12,
    currentSeason: 1,
    countries: ["england", "brazil", "spain"],
    scout: {
      firstName: "Maya",
      lastName: "Reed",
      careerTier: 5,
      reputation: 73,
      fatigue: 18,
      primarySpecialization: "youth",
      careerPath: "club",
    },
  });

  await gamePage.page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const state = store.getState().gameState;
    const organization = Object.values(state.rivalOrganizationState.organizations)[0] as any;
    const trackedPlayer = Object.values(state.players)[0] as any;
    const trackedClubs = Object.values(state.clubs) as any[];
    if (!organization || !trackedPlayer || trackedClubs.length < 2) {
      throw new Error("World or career screenshot fixture is unavailable");
    }

    const internationalAssignment = {
      id: "steam-world-assignment",
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
          label: "Complete 3 field observations of destination-based prospects",
          target: 3,
          progress: 1,
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

    const movement = {
      id: "steam-career-movement",
      playerId: trackedPlayer.id,
      type: "permanentTransfer",
      week: Math.max(3, state.currentWeek - 1),
      season: state.currentSeason,
      fromClubId: trackedClubs[0]?.id,
      toClubId: trackedClubs[1]?.id,
      fee: 1_250_000,
      reason: "A strong season created a credible step up.",
    };

    store.getState().loadGame({
      ...state,
      scout: {
        ...state.scout,
        careerTier: Math.max(5, state.scout.careerTier),
        currentClubId: trackedClubs[0]?.id ?? state.scout.currentClubId,
      },
      narrativeEvents: [
        {
          id: "steam-career-crossroads",
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
          ],
        },
        ...state.narrativeEvents,
      ],
      rivalOrganizationState: {
        ...state.rivalOrganizationState,
        opportunities: {
          ...state.rivalOrganizationState.opportunities,
          "steam-rival-opening": {
            id: "steam-rival-opening",
            organizationId: organization.id,
            kind: "counter-scouting-window",
            title: "Counter-scouting window",
            description: `${organization.name} has overextended around a priority target.`,
            status: "open",
            createdWeek: state.currentWeek,
            createdSeason: state.currentSeason,
            expiresSeason: state.currentSeason,
            expiresWeek: state.currentWeek + 2,
            knownTradeoffs: [
              "Costs fatigue and displaces planned work this week",
              "Failure strengthens the rival agenda and increases its influence",
            ],
            outcomeRoll: 0.44,
            successChance: 0.68,
          },
        },
      },
      discoveryRecords: [{
        playerId: trackedPlayer.id,
        discoveredWeek: 2,
        discoveredSeason: state.currentSeason,
        initialCA: trackedPlayer.currentAbility,
        careerSnapshots: [],
        wasWonderkid: false,
      }],
      playerMovementHistory: [
        ...((state.playerMovementHistory ?? []).filter((entry: any) => entry.id !== movement.id)),
        movement,
      ],
      internationalAssignments: [
        internationalAssignment,
        ...state.internationalAssignments.filter(
          (assignment: any) => assignment.id !== internationalAssignment.id,
        ),
      ],
    });
  });
}

async function seedReportWriterShowcase(gamePage: GamePage) {
  await gamePage.injectState({
    currentWeek: 12,
    currentSeason: 1,
    scout: {
      firstName: "Maya",
      lastName: "Reed",
      careerTier: 2,
      reputation: 52,
      primarySpecialization: "youth",
    },
  });

  await gamePage.page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const state = store.getState().gameState;
    const youth = Object.values(state.unsignedYouth)[0] as any;
    const sourceBrief = Object.values(state.youthRecruitmentBriefs)[0] as any;
    const observedPlayerId = (Object.values(state.observations) as any[])
      .find((observation) => state.players[observation.playerId])?.playerId;
    const playerId = observedPlayerId ?? youth?.player?.id ?? Object.keys(state.players)[0];
    const player = state.players[playerId] ?? youth?.player;
    if (!player || !sourceBrief) throw new Error("Report writer screenshot fixture is unavailable");

    const observationId = `steam_report_observation_${playerId}`;
    const contactId = Object.keys(state.contacts)[0] ?? "steam-contact";
    const contactName = state.contacts[contactId]?.name ?? "Academy contact";
    const brief = {
      ...sourceBrief,
      requiredPositions: [player.position],
      preferredRole: undefined,
      maxAge: Math.max(sourceBrief.maxAge, player.age),
      weeklyWageBudget: 2_400,
      riskTolerance: "medium",
      competitionPressure: 81,
      initialCompetitionPressure: 81,
      status: "open",
    };

    store.getState().loadGame({
      ...state,
      unsignedYouth: youth ? {
        ...state.unsignedYouth,
        [youth.id]: {
          ...youth,
          discoveredBy: [...new Set([...youth.discoveredBy, state.scout.id])],
        },
      } : state.unsignedYouth,
      observations: {
        ...state.observations,
        [observationId]: {
          id: observationId,
          playerId,
          scoutId: state.scout.id,
          sourceSessionId: "steam_report_session",
          week: state.currentWeek,
          season: state.currentSeason,
          context: "academyTrialDay",
          attributeReadings: ["firstTouch", "offTheBall", "composure"].map((attribute) => ({
            attribute,
            perceivedValue: player.attributes[attribute],
            confidence: 0.82,
            observationCount: 2,
            rangeLow: Math.max(1, player.attributes[attribute] - 1),
            rangeHigh: Math.min(20, player.attributes[attribute] + 1),
          })),
          notes: ["Independent live evidence for the Steam capture."],
          flaggedMoments: [],
        },
      },
      youthRecruitmentBriefs: { [brief.id]: brief },
      contactIntel: {
        ...state.contactIntel,
        [playerId]: [
          ...(state.contactIntel[playerId] ?? []),
          {
            playerId,
            attribute: "consistency",
            hint: `${contactName} has seen the player recover strongly after difficult openings.`,
            reliability: 0.74,
            sourceContactId: contactId,
            sourceName: contactName,
            recordedWeek: state.currentWeek,
            recordedSeason: state.currentSeason,
          },
        ],
      },
    });
    store.getState().selectPlayer(playerId);
  });

  await seedStructuredEvidenceForPlayer(gamePage.page);
}

async function prepareDashboardScreenshot(gamePage: GamePage) {
  await prepareFreshViewport(gamePage);
  await seedDashboardShowcase(gamePage);
  await waitForSettledScreen(gamePage, "dashboard", [
    () => expect(gamePage.page.getByRole("heading", { name: /Dashboard|Scouting Desk/ })).toBeVisible(),
    () => expect(gamePage.page.getByTestId("dashboard-command-center")).toBeVisible(),
  ]);
  await captureViewport(gamePage, "01-dashboard.png");
}

async function prepareObservationScreenshot(gamePage: GamePage) {
  await prepareFreshViewport(gamePage);
  await gamePage.injectState({
    currentWeek: 12,
    currentSeason: 1,
    scout: {
      firstName: "Maya",
      lastName: "Reed",
      careerTier: 2,
      reputation: 52,
      primarySpecialization: "youth",
    },
  });
  await gamePage.startObservationSession("schoolMatch");
  await waitForSettledScreen(gamePage, "observation", [
    () => expect(gamePage.page.getByRole("heading", { name: "Live Observation" })).toBeVisible(),
  ]);
  await gamePage.page.getByRole("button", { name: /^Begin Observation$/ }).click();
  const focusButton = gamePage.page.locator('button[aria-label^="Add focus to "]').first();
  if (await focusButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await focusButton.click();
    const technicalLens = gamePage.page
      .getByRole("button", { name: /^Use technical lens for /i })
      .first();
    if (await technicalLens.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await technicalLens.click();
    } else {
      await gamePage.page.keyboard.press("Escape");
    }
  }
  const flagMoment = gamePage.page.getByRole("button", { name: /^Flag this moment$/ }).first();
  if (await flagMoment.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await flagMoment.click();
    await gamePage.page.getByRole("button", { name: /^Promising$/ }).click();
  }
  await dismissBlockingUi(gamePage);
  await expect(gamePage.page.getByTestId("active-observation-layout")).toBeVisible();
  await captureViewport(gamePage, "02-observation.png");
}

async function prepareReportWriterScreenshot(gamePage: GamePage) {
  await prepareFreshViewport(gamePage);
  await seedReportWriterShowcase(gamePage);
  await gamePage.setScreen("reportWriter");
  await waitForSettledScreen(gamePage, "reportWriter", [
    () => expect(gamePage.page.getByRole("heading", { name: "Write Scouting Report" })).toBeVisible(),
  ]);
  const buildCaseTab = gamePage.page.getByRole("tab", { name: /^Build the case\b/ });
  if (await buildCaseTab.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await buildCaseTab.click();
  }
  await expect(gamePage.page.getByTestId("report-presentation-room")).toBeVisible();
  await captureViewport(gamePage, "03-report-writer.png");
}

async function prepareProspectsScreenshot(gamePage: GamePage) {
  await prepareFreshViewport(gamePage);
  await seedReportWriterShowcase(gamePage);
  await gamePage.setScreen("youthScouting");
  await waitForSettledScreen(gamePage, "youthScouting", [
    () => expect(gamePage.page.getByRole("heading", { name: /Prospects|Youth Scouting/i })).toBeVisible(),
  ]);
  await captureViewport(gamePage, "04-prospects.png");
}

async function prepareWorldScreenshot(gamePage: GamePage) {
  await prepareFreshViewport(gamePage);
  await seedWorldAndCareerShowcase(gamePage);
  await gamePage.setScreen("internationalView");
  await waitForSettledScreen(gamePage, "internationalView", [
    () => expect(gamePage.page.getByTestId("open-world-outlook")).toBeVisible(),
  ]);
  await captureViewport(gamePage, "05-world-map.png");
}

async function prepareRivalsScreenshot(gamePage: GamePage) {
  await prepareFreshViewport(gamePage);
  await seedWorldAndCareerShowcase(gamePage);
  await gamePage.setScreen("rivals");
  await waitForSettledScreen(gamePage, "rivals", [
    () => expect(gamePage.page.getByTestId("rival-operations-network")).toBeVisible(),
  ]);
  await captureViewport(gamePage, "06-rivals.png");
}

async function prepareCareerScreenshot(gamePage: GamePage) {
  await prepareFreshViewport(gamePage);
  await seedWorldAndCareerShowcase(gamePage);
  await gamePage.setScreen("career");
  await waitForSettledScreen(gamePage, "career", [
    () => expect(gamePage.page.getByRole("heading", { name: "Command bridge" })).toBeVisible(),
  ]);
  const trackRecord = gamePage.page.getByRole("tab", { name: "Track Record" });
  if (await trackRecord.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await trackRecord.click();
    await gamePage.page.waitForTimeout(200);
  }
  await captureViewport(gamePage, "07-career-progression.png");
}

async function prepareCalendarScreenshot(gamePage: GamePage) {
  await prepareFreshViewport(gamePage);
  await gamePage.injectState({
    currentWeek: 12,
    currentSeason: 1,
    scout: {
      firstName: "Maya",
      lastName: "Reed",
      careerTier: 3,
      reputation: 58,
      primarySpecialization: "youth",
    },
  });
  await gamePage.setScreen("calendar");
  await waitForSettledScreen(gamePage, "calendar", [
    () => expect(gamePage.page.locator('[data-tutorial-id="calendar-grid"]')).toBeVisible(),
  ]);
  await gamePage.scheduleActivityByLabel("School Match", "Mon");
  await dismissBlockingUi(gamePage);
  await captureViewport(gamePage, "08-calendar.png");
}

test.describe("Steam store screenshot capture", () => {
  test.setTimeout(900_000);

  test("captures deterministic 1920x1080 Steam store screenshots", async ({ gamePage }) => {
    await mkdir(screenshotDirectory, { recursive: true });

    await prepareDashboardScreenshot(gamePage);
    await prepareObservationScreenshot(gamePage);
    await prepareReportWriterScreenshot(gamePage);
    await prepareProspectsScreenshot(gamePage);
    await prepareWorldScreenshot(gamePage);
    await prepareRivalsScreenshot(gamePage);
    await prepareCareerScreenshot(gamePage);
    await prepareCalendarScreenshot(gamePage);

    gamePage.expectNoConsoleErrors();
  });
});
