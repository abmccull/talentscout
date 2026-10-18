import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import { getVisualEvidenceDirectory } from "../helpers/releaseEvidencePath";
import { getWorldConditionArcDefinitions } from "../../src/engine/world/worldConditionArcs";

const evidenceDir = getVisualEvidenceDirectory("quality-polish");
const widths = [320, 390, 768, 834, 1366, 1920];

async function settleWorkspace(page: Page) {
  const dismiss = page.getByRole("button", { name: "Dismiss achievement notification" });
  if (await dismiss.isVisible()) {
    await dismiss.click();
    await expect(dismiss).not.toBeVisible();
  }
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    await expect.poll(async () => Math.round(
      await page.locator("#game-nav-sidebar").evaluate((node) => node.getBoundingClientRect().x),
    )).toBe(0);
  }
}

test("report comparison leads with a decision and preserves every supporting view", async ({ gamePage }) => {
  await mkdir(evidenceDir, { recursive: true });
  await gamePage.goto();
  await gamePage.injectState({ currentWeek: 12, currentSeason: 1, scout: { careerTier: 2, primarySpecialization: "youth" } });
  const names = await gamePage.page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const state = store.getState().gameState;
    const players = Object.values(state.players).slice(0, 2) as any[];
    if (players.length !== 2) throw new Error("Comparison needs two real people in the fixture world");
    const reports = players.map((player, index) => ({
      id: `quality-report-${index}`, playerId: player.id, scoutId: state.scout.id,
      submittedWeek: 11, submittedSeason: 1, conviction: "recommend", estimatedValue: 500_000,
      qualityScore: 72, summary: "Another observation is warranted.",
      strengths: ["Carries the ball through pressure.", "Finds the spare passing lane."],
      weaknesses: ["Away adaptation remains untested.", "Recovery after a setback is unknown."],
      intendedAudience: "academyDirector", projectedRole: "poacher", recommendedAction: "inviteForTrial",
      riskAssessments: [{ id: "adaptationMobility", label: "Adaptation and mobility", status: "untested", evidenceIds: [] }],
      evidenceAssessment: { evidenceIds: [`cue-${index}-1`, `cue-${index}-2`] },
      categoryVerdicts: Object.fromEntries(["potential", "roleFit", "characterRisk"].map((category) => [category, {
        status: "assessed", confidence: "medium", evidenceIds: [`cue-${index}-1`], hypothesisIds: [],
        verdict: `${player.firstName}: ${category === "potential" ? "The development ceiling warrants another controlled look." : category === "roleFit" ? "Movement supports a poacher pathway." : "A reliable character claim needs more evidence."}`,
        acknowledgedUncertainty: "Physical maturation and adaptation remain unknown.",
      }])),
      attributeAssessments: ["passing", "firstTouch", "composure", "offTheBall"].map((attribute) => ({
        attribute, estimatedValue: 12 + index, confidenceRange: [10, 15],
        domain: ["passing", "firstTouch"].includes(attribute) ? "technical" : "mental",
      })),
    }));
    store.setState({ gameState: { ...state, reports: Object.fromEntries(reports.map((report) => [report.id, report])) }, comparisonReportIds: reports.map((report) => report.id) });
    return players.map((player) => `${player.firstName} ${player.lastName}`);
  });
  await gamePage.setScreen("reportComparison");
  const page = gamePage.page;
  const geometry = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await settleWorkspace(page);
    await expect(page.getByRole("heading", { name: "Report Comparison", exact: true })).toBeVisible();
    const decision = page.getByRole("region", { name: "Comparison decision" });
    await expect(decision).toContainText("Both reports recommend: Invite For Trial.");
    const decisionBox = await decision.boundingBox();
    expect(decisionBox).not.toBeNull();
    expect(decisionBox!.y + decisionBox!.height).toBeLessThan(844);
    for (const name of names) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    const workspace = page.locator("main .game-workspace");
    const contentHeight = await workspace.evaluate((node) => node.scrollHeight);
    expect(contentHeight).toBeLessThanOrEqual(1600);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    geometry.push({ width, contentHeight, decisionBottom: decisionBox!.y + decisionBox!.height });
    await page.screenshot({ path: path.join(evidenceDir, `comparison-${width}.png`), fullPage: true });
  }
  await writeFile(path.join(evidenceDir, "comparison-geometry.json"), JSON.stringify(geometry, null, 2));
  await page.setViewportSize({ width: 390, height: 844 });
  const judgments = page.getByTestId("comparison-judgments");
  await judgments.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(judgments).toHaveAttribute("open", "");
  await expect(judgments.getByText(/development ceiling warrants/).first()).toBeVisible();
  await expect(judgments.getByText("Physical maturation and adaptation remain unknown.").first()).toBeVisible();
  await judgments.locator("summary").click();
  for (const id of ["comparison-earlier-estimates", "comparison-strengths", "comparison-reference"]) {
    const details = page.getByTestId(id);
    await details.locator("summary").click();
    await expect(details).toHaveAttribute("open", "");
    if (id === "comparison-earlier-estimates") await expect(details.getByLabel("Radar chart comparing player attributes")).toBeVisible();
    if (id === "comparison-strengths") await expect(details.getByText("Away adaptation remains untested.")).toBeVisible();
    if (id === "comparison-reference") await expect(details.getByRole("cell", { name: "Open Unknowns", exact: true })).toBeVisible();
    await details.locator("summary").click();
  }
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(violations).toEqual([]);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reports", exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as any).__GAME_STORE__.getState().comparisonReportIds)).toHaveLength(2);
  gamePage.expectNoConsoleErrors();
});

test("Settings categories support keyboard navigation and actual preference changes", async ({ gamePage }) => {
  await mkdir(evidenceDir, { recursive: true });
  await gamePage.goto();
  await gamePage.injectState({ currentWeek: 12 });
  await gamePage.setScreen("settings");
  const page = gamePage.page;
  const audio = page.getByRole("tab", { name: "Audio", exact: true });
  await audio.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Graphics", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Accessibility", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(audio).toBeFocused();
  const mute = page.getByRole("switch").first();
  const before = await mute.getAttribute("aria-checked");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
  await mute.click();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await settleWorkspace(page);
    await page.screenshot({ path: path.join(evidenceDir, `settings-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(violations).toEqual([]);
  gamePage.expectNoConsoleErrors();
});

test("World outlook keeps decisions visible while disclosing background stories", async ({ gamePage }) => {
  await mkdir(evidenceDir, { recursive: true });
  await gamePage.goto();
  await gamePage.injectState({ currentWeek: 12, currentSeason: 1 });
  const definitions = getWorldConditionArcDefinitions().slice(0, 3);
  expect(definitions).toHaveLength(3);
  // Presentation coverage of three real content definitions; simulation progression is tested separately.
  await gamePage.page.evaluate((serializedDefinitions) => {
    const definitions = JSON.parse(serializedDefinitions);
    const store = (window as any).__GAME_STORE__;
    const state = store.getState().gameState;
    const active = Object.fromEntries(definitions.map((definition: any, index: number) => {
      const id = `quality-arc-${index}`;
      return [id, {
        id, definitionId: definition.id, conditionInstanceId: `quality-condition-${index}`,
        conditionDefinitionId: definition.conditionDefinitionId, season: 1,
        startedAt: { season: 1, week: 1 }, decisionAt: { season: 1, week: 12 },
        phase: ["signal", "decision", "aftermath"][index], emittedBeatIds: [], outcomeRoll: 0.5,
        ...(index === 2 ? { selectedChoiceId: definition.choices[0].id } : {}),
      }];
    }));
    store.setState({ gameState: { ...state, worldConditionArcState: { version: 1, active, completed: [] } } });
  }, JSON.stringify(definitions));
  await gamePage.setScreen("internationalView");
  await gamePage.page.getByTestId("open-world-outlook").click();
  const page = gamePage.page;
  const drawer = page.getByTestId("world-outlook-drawer");
  const developing = drawer.locator("details").filter({ has: page.locator("summary", { hasText: "Developing stories" }) });
  await expect(developing).not.toHaveAttribute("open", "");
  await expect(drawer.getByText("A time-limited decision is waiting on your Desk.")).toBeVisible();
  await expect(drawer.getByText(definitions[2].choices[0].label, { exact: true })).toBeVisible();
  for (const tradeoff of definitions[2].choices[0].knownTradeoffs) {
    await expect(drawer.getByText(tradeoff, { exact: true })).toBeVisible();
  }
  await expect(developing.getByText(definitions[0].title, { exact: true })).not.toBeVisible();
  await developing.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(developing.getByText(definitions[0].title, { exact: true })).toBeVisible();
  await developing.locator("summary").click();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await settleWorkspace(page);
    await drawer.getByRole("button", { name: "Close world outlook" }).focus();
    await drawer.locator("div.overflow-y-auto").evaluate((node) => { node.scrollTop = 0; });
    const action = await drawer.getByRole("button", { name: "Open rival desk" }).boundingBox();
    expect(action).not.toBeNull();
    expect(action!.y + action!.height).toBeLessThan(844);
    expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: path.join(evidenceDir, `world-${width}.png`), fullPage: true });
  }
  const network = drawer.locator("details").filter({ has: page.locator("summary", { hasText: "Your regional network" }) });
  await network.locator("summary").click();
  await expect(network.getByText("Strongholds", { exact: true })).toBeVisible();
  await expect(network.getByText("Stale markets", { exact: true })).toBeVisible();
  await network.locator("summary").click();
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(violations).toEqual([]);
  await drawer.getByRole("button", { name: "Open rival desk" }).click();
  await gamePage.waitForScreen("rivals");
  await expect(drawer).not.toBeVisible();
  gamePage.expectNoConsoleErrors();
});

test("Settings remains operable with a doubled base text size", async ({ gamePage }) => {
  await gamePage.goto();
  await gamePage.injectState({ currentWeek: 12 });
  await gamePage.setScreen("settings");
  const page = gamePage.page;
  await page.setViewportSize({ width: 390, height: 844 });
  await settleWorkspace(page);
  const baseline = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  await page.evaluate((fontSize) => document.documentElement.style.setProperty("font-size", `${fontSize * 2}px`, "important"), baseline);
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(baseline * 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const graphics = page.getByRole("tab", { name: "Graphics", exact: true });
  await graphics.click();
  const large = page.getByRole("radio", { name: "Large", exact: true });
  await large.check();
  await expect(large).toBeChecked();
  await page.getByRole("tab", { name: "Audio", exact: true }).click();
  const mute = page.getByRole("switch").first();
  const before = await mute.getAttribute("aria-checked");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
  await page.screenshot({ path: path.join(evidenceDir, "settings-390-double-base-text.png"), fullPage: true });
  gamePage.expectNoConsoleErrors();
});

test("Hall preserves active-career choices and readable retirement results across widths", async ({ gamePage }) => {
  await mkdir(evidenceDir, { recursive: true });
  await gamePage.goto();
  // Seed only the elapsed-career boundary; retirement and its cancellation use real controls.
  await gamePage.injectState({ currentWeek: 12, currentSeason: 4, scout: { careerTier: 2, primarySpecialization: "youth" } });
  await gamePage.setScreen("hallOfFame");
  const page = gamePage.page;
  await expect(page.getByRole("heading", { name: "Hall of Fame Snapshot", exact: true })).toBeVisible();
  await expect(page.getByText(/Youth Scout/, { exact: false }).first()).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/territoryReader|pathwayBuilder|departmentSteward/);
  const completionMarkers = () => page.evaluate(() => (window as any).__GAME_STORE__.getState().gameState.completedScenarioIds);
  const snapshot = await completionMarkers();
  await page.getByRole("button", { name: "Retire Career", exact: true }).click();
  await page.getByRole("button", { name: "Keep Scouting", exact: true }).click();
  expect(await completionMarkers()).toEqual(snapshot);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.locator("body").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.screenshot({ path: path.join(evidenceDir, `hall-active-${width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "Retire Career", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Retirement", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Career Complete", exact: true })).toBeVisible();
  expect(await completionMarkers()).toContain("career_retired_voluntarily");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.locator("body").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "New Game+", exact: true }).focus();
    await expect(page.getByRole("button", { name: "New Game+", exact: true })).toBeFocused();
    const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(violations).toEqual([]);
    await page.screenshot({ path: path.join(evidenceDir, `hall-complete-${width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "New Game+", exact: true }).click();
  await gamePage.waitForScreen("newGame");
  gamePage.expectNoConsoleErrors();
});

for (const playerKind of ["registered", "unsigned"] as const) {
  test(`${playerKind} player Development context stays readable and its evidence can be opened`, async ({ gamePage }) => {
    await mkdir(evidenceDir, { recursive: true });
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
    const page = gamePage.page;
    const playerName = await page.evaluate((kind) => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const player = kind === "registered"
        ? Object.values(state.players).find((candidate: any) => candidate.clubId && !candidate.retired) as any
        : (Object.values(state.unsignedYouth)[0] as any)?.player;
      if (!player) throw new Error(`Missing ${kind} player boundary fixture`);
      store.getState().selectPlayer(player.id);
      store.getState().setScreen("playerProfile");
      return `${player.firstName} ${player.lastName}`;
    }, playerKind);
    await gamePage.waitForScreen("playerProfile");
    await expect(page.getByRole("heading", { name: playerName, exact: true })).toBeVisible();
    await page.getByRole("tab", { name: /^Development/ }).click();
    const panel = page.getByTestId("development-environment");
    await expect(panel).toContainText("They do not predict the player's ceiling.");
    await panel.locator("summary").click();
    await expect(panel.locator("details")).toHaveAttribute("open", "");
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await settleWorkspace(page);
      const bounds = await panel.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, width: node.clientWidth, scroll: node.scrollWidth };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(width);
      expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
      const violations = (await new AxeBuilder({ page }).include('[data-testid="development-environment"]').analyze()).violations
        .filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(violations).toEqual([]);
      await panel.getByRole("heading", { name: "What to check next" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(evidenceDir, `development-${playerKind}-${width}.png`), fullPage: true });
    }
    await page.getByRole("tab", { name: /^Evidence/ }).click();
    await expect(panel).not.toBeVisible();
    gamePage.expectNoConsoleErrors();
  });
}
