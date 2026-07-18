import { mkdir } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../fixtures";
import type { GamePage } from "../fixtures";
import { getVisualEvidenceDirectory } from "../helpers/releaseEvidencePath";

const evidenceDir = getVisualEvidenceDirectory("scouting-ecology-workspaces");
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

async function captureWorkspace(gamePage: GamePage, name: string): Promise<void> {
  for (const viewport of viewports) {
    await gamePage.page.setViewportSize({ width: viewport.width, height: viewport.height });
    await gamePage.page.waitForTimeout(300);
    const widths = await gamePage.page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(widths.document, `${name} ${viewport.name} horizontal overflow`)
      .toBeLessThanOrEqual(widths.viewport + 1);
    const scan = await new AxeBuilder({ page: gamePage.page }).analyze();
    expect(scan.violations.filter((violation) =>
      violation.impact === "serious" || violation.impact === "critical",
    )).toEqual([]);
    await gamePage.page.screenshot({
      path: path.join(evidenceDir, `${viewport.name}-${name}.png`),
      fullPage: true,
    });
  }
}

test.describe("Scouting ecology rendered workspaces", () => {
  test("renders recurring relationships, inbox pressure, and rival counterplay", async ({ gamePage }) => {
    await mkdir(evidenceDir, { recursive: true });
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const contact = Object.values(state.contacts)[0] as any;
      if (!contact) return;
      const now = { season: state.currentSeason, week: state.currentWeek };
      const agreementId = `audit-access-${contact.id}`;
      store.getState().loadGame({
        ...state,
        accessAgreements: {
          ...(state.accessAgreements ?? {}),
          [agreementId]: {
            id: agreementId,
            grantor: { kind: "contact", id: contact.id },
            beneficiary: { kind: "scout", id: state.scout.id },
            scope: "clubChannel",
            status: "active",
            exclusive: true,
            confidential: true,
            createdAt: now,
            countryId: contact.country,
            regionId: contact.region,
            metadata: { grantorName: contact.name },
          },
        },
        consequenceState: {
          ...state.consequenceState,
          memories: {
            ...state.consequenceState.memories,
            [`audit-memory-${contact.id}`]: {
              id: `audit-memory-${contact.id}`,
              stakeholder: { kind: "contact", id: contact.id },
              subject: { kind: "scout", id: state.scout.id },
              tags: ["protected confidence"],
              valence: 36,
              intensity: 72,
              salience: 70,
              visibility: "stakeholders",
              createdAt: now,
            },
          },
        },
        inbox: [
          {
            id: "audit-relationship-pressure",
            week: state.currentWeek,
            season: state.currentSeason,
            type: "news",
            title: `${contact.name} needs an answer`,
            body: "A protected introduction is at risk while a rival works the same channel.",
            read: false,
            actionRequired: true,
            relatedId: contact.id,
            relatedEntityType: "contact",
          },
          ...state.inbox,
        ],
      });
    });

    await gamePage.setScreen("network");
    await gamePage.waitForScreen("network");
    await gamePage.page.locator('button[aria-label^="View contact:"]').first().click();
    await captureWorkspace(gamePage, "network-contact-thread");

    await gamePage.setScreen("inbox");
    await gamePage.waitForScreen("inbox");
    await captureWorkspace(gamePage, "inbox-decision-queue");

    await gamePage.setScreen("rivals");
    await gamePage.waitForScreen("rivals");
    await captureWorkspace(gamePage, "rival-landscape");
  });
});
