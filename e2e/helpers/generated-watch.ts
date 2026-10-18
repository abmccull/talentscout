import type { Page } from "@playwright/test";
import { expect } from "../fixtures";

export interface WatchedLead { playerId: string; name: string }

export async function readOpeningLead(page: Page): Promise<WatchedLead> {
  return page.evaluate(() => {
    const { gameState, activeSession } = (window as any).__GAME_STORE__.getState();
    const playerId = gameState.openingCase.playerId as string;
    const player = activeSession.players.find((candidate: any) => candidate.playerId === playerId);
    if (!player) throw new Error("The opening lead must be present in the actual watch");
    return { playerId, name: player.name as string };
  });
}

/** Public controls only; store reads identify the actual lead and verify results. */
export async function advanceGeneratedWatchToReflection(
  page: Page,
  options: { lead: WatchedLead; focus: boolean; hideMentorHelp?: boolean },
) {
  const { lead, focus } = options;
  const controls = page.getByTestId("mobile-observation-controls");
  const trace: unknown[] = [];
  for (let step = 0; step < 30; step++) {
    if (options.hideMentorHelp) {
      const hideHelp = page.getByRole("button", { name: "Hide mentor help", exact: true });
      if (await hideHelp.isVisible()) await hideHelp.click();
    }
    const before = await page.evaluate((playerId) => {
      const session = (window as any).__GAME_STORE__.getState().activeSession;
      const player = session.players.find((candidate: any) => candidate.playerId === playerId);
      return { sessionId: session.id as string, phase: session.currentPhaseIndex as number,
        phaseCount: session.phases.length as number, mode: session.mode as string,
        leadPresent: Boolean(player), focused: player?.isFocused ?? false };
    }, lead.playerId);
    expect(before.leadPresent, "The scheduled watch must contain the intended player").toBe(true);
    if (focus && !before.focused) {
      // The midpoint can replenish tokens and release focus. Select the same
      // real player again, then use the lens offered for the projection question.
      const track = page.getByRole("list", { name: "Players on the observation pitch" })
        .getByRole("button", { name: new RegExp(`^Track ${lead.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`) });
      await track.click();
      await page.getByRole("button", { name: `Use general lens for ${lead.name}`, exact: true }).click();
      await expect(page.getByRole("button", { name: `Remove focus from ${lead.name}`, exact: true })).toBeVisible();
    }

    const moment = page.getByRole("region", { name: "What you noticed", exact: true })
      .locator("article").filter({ has: page.getByRole("heading", { level: 3, name: lead.name, exact: true }) });
    const flag = moment.getByRole("button", { name: /^Flag (standout|this) moment$/ }).first();
    if (await flag.isVisible()) {
      await flag.click();
      await moment.getByRole("button", { name: "Promising", exact: true }).first().click();
    }
    const halftime = page.getByRole("button", { name: /^Confirm the first read\b/ });
    if (await halftime.isVisible() && await halftime.isEnabled()) await halftime.click();
    trace.push({ ...before, displayedPassages: await moment.allTextContents() });

    const reflect = controls.getByRole("button", { name: "Reflect on the watch", exact: true });
    if (await reflect.isVisible()) {
      await expect(reflect).toBeEnabled();
      await reflect.click();
      await expect(page.getByRole("heading", { name: "Post-Observation Reflection", exact: true })).toBeVisible();
      const result = await page.evaluate((playerId) => {
        const { gameState, activeSession: session } = (window as any).__GAME_STORE__.getState();
        return { worldSeed: gameState.worldSeed, sessionId: session.id as string,
          phase: session.currentPhaseIndex as number, questionId: session.scoutingQuestionId,
          careerInstanceId: gameState.careerInstanceId,
          flags: session.flaggedMoments.filter((flag: any) => flag.moment.playerId === playerId),
          cues: session.cueReadings.filter((cue: any) => cue.playerId === playerId),
          anyFocusedPhase: session.players.some((player: any) => player.focusedPhases.length > 0) };
      }, lead.playerId);
      expect(result.flags.length, "Keep at least one actual passage from the intended player").toBeGreaterThan(0);
      if (!focus) expect(result.anyFocusedPhase).toBe(false);
      return { ...result, trace };
    }
    const next = controls.getByRole("button", { name: "Next phase", exact: true });
    await expect(next).toBeEnabled();
    await next.click();
    await expect.poll(() => page.evaluate(() =>
      (window as any).__GAME_STORE__.getState().activeSession.currentPhaseIndex)).toBeGreaterThan(before.phase);
  }
  throw new Error("The generated watch did not reach reflection after 30 actual phases");
}

/** Select a real offered classification, including honest no-conclusion views. */
export async function classifyDisplayedLeadEvidence(page: Page, lead: WatchedLead, noConclusion = false) {
  const groups = page.getByRole("group", { name: "What did this passage show?", exact: true });
  const selections: Array<{ cueId: string; offeredLabels: string[]; chosenLabel: string; classification: string }> = [];
  for (let index = 0; index < await groups.count(); index++) {
    const group = groups.nth(index);
    const name = await group.getByRole("radio").first().getAttribute("name");
    const cueId = name?.replace(/^cue-classification-/, "");
    if (!cueId) throw new Error("Reflection choice has no cue identity");
    const owner = await page.evaluate((id) => {
      const session = (window as any).__GAME_STORE__.getState().activeSession;
      return session.cueReadings.find((cue: any) => cue.id === id)?.playerId;
    }, cueId);
    if (owner !== lead.playerId) continue;
    const radios = group.getByRole("radio");
    const offeredLabels = await radios.evaluateAll((inputs) => inputs.map((input) => input.closest("label")?.textContent?.trim() ?? ""));
    // The public reflection offers only No reliable conclusion for an unclear
    // cue. Never infer a classification from an engine action ID or hidden trait.
    const choiceIndex = noConclusion ? -1 : offeredLabels.findIndex((label) => !label.startsWith("No reliable conclusion"));
    const choice = choiceIndex >= 0 ? radios.nth(choiceIndex)
      : group.getByRole("radio", { name: /^No reliable conclusion/ });
    await choice.check();
    await expect(choice).toBeChecked();
    const classification = await page.evaluate((id) =>
      (window as any).__GAME_STORE__.getState().activeSession.evidenceDecisions[id].classification as string, cueId);
    selections.push({ cueId, offeredLabels, chosenLabel: await choice.locator("..").innerText(), classification });
  }
  expect(selections.length, "The lead's retained passages must be classifiable through public controls").toBeGreaterThan(0);
  return selections;
}
