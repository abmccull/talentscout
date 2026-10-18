import { describe, expect, it } from "vitest";
import type { Club, Contact, FinancialRecord, GameState, ScoutReport } from "@/engine/core/types";
import { getClientPitchEligibility, attemptClientPitch } from "@/engine/finance/clientRelationships";
import { RNG } from "@/engine/rng";

const club = { id: "club-1", name: "North Academy", shortName: "NAC", reputation: 40, playerIds: [] } as unknown as Club;
function state(): GameState {
  return {
    currentWeek: 37, currentSeason: 1, fixtures: {}, clubs: { [club.id]: club },
    players: {}, contacts: {}, reports: {}, inbox: [],
    scout: { id: "scout", careerPath: "independent", reputation: 20, fatigue: 10 },
    finances: {
      balance: 500, actionSequence: 0, transactions: [], employees: [],
      retainerContracts: [], pendingRetainerOffers: [], clientRelationships: [],
    } as unknown as FinancialRecord,
  } as unknown as GameState;
}
const rejectRng = { chance: () => false } as unknown as RNG;
describe("earned client acquisition", () => {
  it("keeps private receipts out of showcases while retaining legacy professional reports", () => {
    const initial = state();
    initial.reports.report = { id: "report", scoutId: "scout", qualityScore: 90, submittedWeek: 1, submittedSeason: 1,
      recommendedAction: "monitor", decisionReceipt: { id: "private-receipt", action: "pass" },
    } as unknown as ScoutReport;
    expect(getClientPitchEligibility(initial, club.id, "showcase").eligible).toBe(false);
    expect(attemptClientPitch(initial, club.id, "showcase", { chance: () => { throw new Error("private report must not be pitched"); } } as unknown as RNG)).toBe(initial);
    initial.reports.report = { id: "legacy-report", scoutId: "scout", qualityScore: 90,
      submittedWeek: 1, submittedSeason: 1, recommendedAction: "pass" } as ScoutReport;
    expect(getClientPitchEligibility(initial, club.id, "showcase").eligible).toBe(true);
  });

  it("charges one unsuccessful attempt and persists the cooldown across reload and season rollover", () => {
    const initial = state();
    const first = attemptClientPitch(initial, club.id, "coldCall", rejectRng);
    expect(first.finances!.balance).toBe(450);
    expect(first.scout.fatigue).toBe(13);
    expect(first.finances!.clientPitchHistory?.[0]).toMatchObject({ clubId: club.id, success: false });
    expect(first.finances!.actionSequence).toBe(1);
    expect(first.finances!.transactions).toHaveLength(1);
    const reloaded = JSON.parse(JSON.stringify(first)) as GameState;
    expect(attemptClientPitch(reloaded, club.id, "coldCall", rejectRng)).toBe(reloaded);
    expect(getClientPitchEligibility({ ...reloaded, currentSeason: 2, currentWeek: 1 }, club.id, "coldCall").eligible).toBe(false);
    expect(getClientPitchEligibility({ ...reloaded, currentSeason: 2, currentWeek: 3 }, club.id, "coldCall").eligible).toBe(true);
  });
  it("cannot bypass the weekly limit by changing club or method", () => {
    const first = attemptClientPitch(state(), club.id, "coldCall", rejectRng);
    const other = { ...club, id: "club-2" };
    first.clubs[other.id] = other;
    expect(attemptClientPitch(first, other.id, "coldCall", rejectRng)).toBe(first);
    expect(attemptClientPitch(first, club.id, "referral", rejectRng)).toBe(first);
  });
  it("requires a named active contact at the target club for a referral", () => {
    const initial = state();
    expect(getClientPitchEligibility(initial, club.id, "referral").eligible).toBe(false);
    initial.contacts.known = { id: "known", name: "Alex Coach", organization: club.name, relationship: 55, dormant: false } as Contact;
    expect(getClientPitchEligibility(initial, club.id, "referral")).toMatchObject({ eligible: true, evidenceLabel: "Referred by Alex Coach" });
    initial.contacts.known.dormant = true;
    expect(getClientPitchEligibility(initial, club.id, "referral").eligible).toBe(false);
    initial.contacts.known.dormant = false;
    initial.contacts.known.accessSuspendedUntil = { week: 38, season: 1 };
    expect(getClientPitchEligibility(initial, club.id, "referral").eligible).toBe(false);
    initial.contacts.known.accessSuspendedUntil = undefined;
    initial.contacts.known.organization = "Unrelated Club";
    expect(getClientPitchEligibility(initial, club.id, "referral").eligible).toBe(false);
  });
  it("requires a completed quality report authored by this scout for a showcase", () => {
    const initial = state();
    expect(getClientPitchEligibility(initial, club.id, "showcase").eligible).toBe(false);
    initial.reports.report = { id: "report", scoutId: "other", qualityScore: 75, submittedWeek: 1, submittedSeason: 1 } as ScoutReport;
    expect(getClientPitchEligibility(initial, club.id, "showcase").eligible).toBe(false);
    initial.reports.report.scoutId = "scout";
    expect(getClientPitchEligibility(initial, club.id, "showcase").eligible).toBe(true);
  });
  it("shows readable showcase evidence but retains its exact ID in the attempt audit", () => {
    const initial = state();
    initial.players.player = { id: "player", firstName: "Alex", lastName: "Youth" } as GameState["players"][string];
    initial.reports.report = {
      id: "internal-report-identifier", playerId: "player", scoutId: "scout", qualityScore: 75,
      submittedWeek: 4, submittedSeason: 1,
    } as ScoutReport;
    const gate = getClientPitchEligibility(initial, club.id, "showcase");
    expect(gate.evidenceLabel).toContain("Alex Youth");
    expect(gate.evidenceLabel).toContain("season 1, week 4");
    expect(gate.evidenceLabel).not.toContain("internal-report-identifier");
    const pitched = attemptClientPitch(initial, club.id, "showcase", rejectRng);
    expect(pitched.finances!.clientPitchHistory?.[0].evidenceId).toBe("internal-report-identifier");
  });
  it("does not spend, roll, or advance sequence for invalid actions", () => {
    for (const kind of ["poor", "exhausted", "blacklisted", "retained", "pending"] as const) {
      const initial = state();
      if (kind === "poor") initial.finances!.balance = 0;
      if (kind === "exhausted") initial.scout.fatigue = 99;
      if (kind === "blacklisted") initial.finances!.blacklistedClubs = [club.id];
      if (kind === "retained") initial.finances!.retainerContracts = [{ clubId: club.id, status: "active" }] as FinancialRecord["retainerContracts"];
      if (kind === "pending") initial.finances!.pendingRetainerOffers = [{ clubId: club.id }] as FinancialRecord["pendingRetainerOffers"];
      expect(attemptClientPitch(initial, club.id, "coldCall", { chance: () => { throw new Error("must not roll"); } } as unknown as RNG)).toBe(initial);
    }
  });
  it("records one offer on success without duplicate retries", () => {
    const first = attemptClientPitch(state(), club.id, "coldCall", { chance: () => true, nextInt: (minimum: number) => minimum } as unknown as RNG);
    expect(first.finances!.pendingRetainerOffers).toHaveLength(1);
    expect(first.finances!.clientPitchHistory?.[0].message).toContain("accepted");
    expect(attemptClientPitch(first, club.id, "coldCall", rejectRng)).toBe(first);
  });
});
