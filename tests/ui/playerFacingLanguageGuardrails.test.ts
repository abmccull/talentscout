import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = fileURLToPath(new URL("../../src/", import.meta.url));

function source(relativePath: string): string {
  return readFileSync(`${SOURCE_ROOT}${relativePath}`, "utf8");
}

describe("player-facing language guardrails", () => {
  it("keeps internal product language out of the opening journey", () => {
    const openingJourney = [
      "components/game/MainMenu.tsx",
      "components/game/NewGameScreen.tsx",
      "components/game/ObservationScreen.tsx",
      "components/game/ReflectionScreen.tsx",
      "components/game/OpeningDiscoveryScreen.tsx",
      "components/game/ReportWriter.tsx",
    ].map(source).join("\n");

    expect(openingJourney).not.toMatch(/first five minutes/i);
    expect(openingJourney).not.toMatch(/first case:/i);
    expect(openingJourney).not.toMatch(/one important call/i);
    expect(openingJourney).not.toMatch(/the game has not confirmed/i);
    expect(openingJourney).not.toMatch(/core loop is proven/i);
    expect(openingJourney).not.toMatch(/standout action has not yet survived/i);
    expect(openingJourney).not.toMatch(/hidden player ability/i);
    expect(openingJourney).not.toMatch(/small, bounded effect/i);
    expect(openingJourney).not.toMatch(/generated boardroom summary/i);
    expect(openingJourney).not.toMatch(/complete the professional artifact/i);
  });

  it("keeps the youth report structured while its language stays inside the scouting world", () => {
    const reportWriter = source("components/game/ReportWriter.tsx");
    const playerProfile = source("components/game/PlayerProfile.tsx");

    expect(reportWriter).not.toContain("openingCurrentRead");
    expect(reportWriter).not.toContain("openingKeyUncertainty");
    expect(reportWriter).not.toContain("Material risks, one per line");
    expect(reportWriter).not.toContain("categoryDrafts[category].verdict");
    expect(reportWriter).not.toContain("categoryDrafts[category].uncertainty");
    expect(reportWriter).not.toMatch(/hidden player ability/i);
    expect(reportWriter).not.toMatch(/provenance:|structured choices|free typing|evidence and claim builder|assembled from your selected/i);
    expect(reportWriter).not.toMatch(/Decision window[^\n]*gameState\.difficulty/i);
    expect(reportWriter).toContain("Private scout&apos;s note");
    expect(reportWriter).toContain("prepared to defend in the recruitment room");
    expect(playerProfile).not.toMatch(/generate one via the data analysis system/i);
    expect(playerProfile).toContain("Commission an analyst review");
  });

  it("keeps world, career, and handbook language player-facing", () => {
    const worldSurfaces = [
      "components/game/InternationalScreen.tsx",
      "components/game/world/WorldOutlookDrawer.tsx",
      "components/game/career/WorldConditionPanel.tsx",
      "components/game/RivalsScreen.tsx",
    ].map(source).join("\n");
    const careerScreen = [
      "components/game/CareerScreen.tsx",
      "components/game/career/CareerSituationPanel.tsx",
    ].map(source).join("\n");
    const handbookNavigation = [
      "components/game/wiki/WikiArticlePage.tsx",
      "components/game/wiki/WikiScreen.tsx",
      "components/game/wiki/WikiSidebar.tsx",
    ].map(source).join("\n");
    const handbookArticles = [
      "data/wiki/getting-started.tsx",
      "data/wiki/career-progression.tsx",
      "data/wiki/agency.tsx",
      "data/wiki/finances.tsx",
      "data/wiki/world-travel.tsx",
      "data/wiki/match-observation.tsx",
      "data/wiki/match-systems.tsx",
    ].map(source).join("\n");

    expect(worldSurfaces).not.toMatch(/generated countries/i);
    expect(worldSurfaces).not.toMatch(/generated destination/i);
    expect(worldSurfaces).not.toMatch(/simulated fixture calendar/i);
    expect(worldSurfaces).not.toMatch(/fixtures are simulated in this career/i);
    expect(worldSurfaces).not.toMatch(/seeded conditions/i);
    expect(worldSurfaces).not.toMatch(/flavour text/i);
    expect(worldSurfaces).not.toMatch(/run fingerprint/i);
    expect(worldSurfaces).not.toMatch(/world uuid/i);
    expect(worldSurfaces).not.toMatch(/seed-locked/i);
    expect(worldSurfaces).not.toMatch(/reloading cannot/i);
    expect(worldSurfaces).not.toMatch(/reroll/i);

    expect(careerScreen).not.toContain("Full-Time Club Scout");
    expect(careerScreen).toContain("Own practice");
    expect(careerScreen).not.toMatch(/seed-locked/i);

    expect(handbookNavigation).not.toContain("Search Scout wiki");
    expect(handbookNavigation).not.toContain("Open wiki sidebar");
    expect(handbookNavigation).not.toContain("Scout wiki categories");
    expect(handbookNavigation).toContain("Handbook");

    expect(handbookArticles).not.toMatch(/core loop/i);
    expect(handbookArticles).not.toMatch(/Every week each employee is processed/i);
    expect(handbookArticles).not.toMatch(/internal stats shift/i);
    expect(handbookArticles).not.toMatch(/Full-Time Club Scout/i);
    expect(handbookArticles).not.toMatch(/\+1% reduction in error/i);
    expect(handbookArticles).not.toMatch(/AI clubs/i);
    expect(handbookArticles).not.toMatch(/need match score/i);
    expect(handbookArticles).not.toMatch(/1\.5x premium/i);
    expect(handbookArticles).not.toMatch(/2% of transfer fee/i);
    expect(handbookArticles).not.toMatch(/credit score 30\+/i);
    expect(handbookArticles).not.toMatch(/60% to 250%/i);
    expect(handbookArticles).not.toMatch(/10-week recovery period/i);
    expect(handbookArticles).not.toMatch(/0-100 record/i);
    expect(handbookArticles).not.toMatch(/0–100 rating/i);
    expect(handbookArticles).not.toMatch(/generated country/i);
    expect(handbookArticles).not.toMatch(/x1\.5 noise multiplier/i);
    expect(handbookArticles).not.toMatch(/x1\.1/i);
    expect(handbookArticles).not.toMatch(/x0\.7/i);
    expect(handbookArticles).not.toMatch(/yellow card probability depends/i);
    expect(handbookArticles).not.toMatch(/40% chance/i);
    expect(handbookArticles).not.toMatch(/5 yellow cards in a season/i);
    expect(handbookArticles).not.toMatch(/current ability above 80/i);
    expect(handbookArticles).not.toMatch(/0 to 3 transfers occur each week/i);
    expect(handbookArticles).not.toMatch(/5th-power curve/i);
    expect(handbookArticles).not.toMatch(/0\.7x/i);
    expect(handbookArticles).not.toMatch(/1\.8x/i);
    expect(handbookArticles).not.toMatch(/If satisfaction is above 70/i);
    expect(handbookArticles).not.toMatch(/Below 40/i);
  });

  it("keeps in-career consequence and assessment copy inside the scout-room fiction", () => {
    const careerSurfaces = [
      "components/game/WeekSimulationScreen.tsx",
      "components/game/InitialAssessmentBuilder.tsx",
      "components/game/consequence-cinema/ConsequenceCinema.tsx",
      "components/game/consequence-cinema/consequenceCinemaModel.ts",
    ].map(source).join("\n");

    expect(careerSurfaces).not.toMatch(/persisted delegation policy/i);
    expect(careerSurfaces).not.toMatch(/Desk policy/i);
    expect(careerSurfaces).not.toMatch(/No immediate change was recorded/i);
    expect(careerSurfaces).not.toMatch(/assessment builder/i);
    expect(careerSurfaces).not.toMatch(/This builder/i);
    expect(careerSurfaces).not.toMatch(/generated preview/i);
    expect(careerSurfaces).not.toMatch(/assessment score/i);
    expect(careerSurfaces).not.toMatch(/overclaim risk/i);
    expect(careerSurfaces).not.toMatch(/persisted records/i);
    expect(careerSurfaces).not.toMatch(/generated from the persisted/i);
    expect(careerSurfaces).not.toMatch(/current save/i);
    expect(careerSurfaces).not.toMatch(/preserved scores/i);
    expect(careerSurfaces).not.toMatch(/underlying game record/i);
    expect(careerSurfaces).not.toMatch(/career consequence ledger/i);
  });
});
