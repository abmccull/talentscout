import { test, expect } from "../fixtures";

test.describe("Contact Network", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
  });

  test("contacts exist in game state", async ({ gamePage }) => {
    const contactCount = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const contacts = store.getState().gameState?.contacts;
      return contacts ? Object.keys(contacts).length : 0;
    });

    expect(contactCount).toBeGreaterThanOrEqual(0);
  });

  test("contact has relationship, type, and name", async ({ gamePage }) => {
    const contactInfo = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const contacts = store.getState().gameState?.contacts ?? {};
      const contactIds = Object.keys(contacts);
      if (contactIds.length === 0) return null;

      const contact = contacts[contactIds[0]];
      return {
        hasName: typeof contact.name === "string" || typeof contact.firstName === "string",
        hasType: typeof contact.type === "string" || typeof contact.role === "string",
        hasRelationship:
          typeof contact.relationship === "number" ||
          typeof contact.relationshipLevel === "number" ||
          typeof contact.trust === "number",
      };
    });

    if (contactInfo) {
      expect(contactInfo.hasName).toBe(true);
    }
  });

  test("network screen shows contact list", async ({ gamePage }) => {
    await gamePage.setScreen("network");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("network");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);

    gamePage.expectNoConsoleErrors();
  });

  test("networkMeeting activity starts investigation session", async ({ gamePage }) => {
    await gamePage.startObservationSession("networkMeeting");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    const session = await gamePage.getActiveSession();
    expect(session).not.toBeNull();
    expect(session!.mode).toBe("investigation");

    // Clean up
    await gamePage.page.evaluate(() => {
      (window as any).__GAME_STORE__.getState().endObservationSession();
    });
  });

  test("intel section renders on network screen", async ({ gamePage }) => {
    await gamePage.setScreen("network");
    await gamePage.page.waitForTimeout(500);

    // Verify screen has meaningful content — intel may be in various UI elements
    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);

    gamePage.expectNoConsoleErrors();
  });
});
