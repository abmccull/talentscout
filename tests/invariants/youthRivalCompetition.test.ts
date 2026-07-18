import { describe, expect, it } from "vitest";

import type {
  InboxMessage,
  PlacementReport,
  Player,
  RivalActivity,
  RivalScout,
  UnsignedYouth,
} from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { assessRivalMarketCounterplay } from "@/engine/rivals/organizations";
import {
  advanceYouthRivalPressure,
  getRivalYouthClaimEligibility,
  rankYouthRivalTargets,
  resolveRivalYouthClaim,
  selectYouthRivalTarget,
} from "@/engine/rivals/youthCompetition";

function player(
  id: string,
  potentialAbility = 120,
  currentAbility = 40,
): Player {
  return {
    id,
    firstName: "Youth",
    lastName: id,
    age: 16,
    clubId: "",
    contractClubId: undefined,
    wage: 0,
    marketValue: 0,
    currentAbility,
    potentialAbility,
  } as Player;
}

function youth(
  id: string,
  overrides: Partial<UnsignedYouth> = {},
  youthPlayer: Player = player(id),
): UnsignedYouth {
  return {
    id,
    player: youthPlayer,
    visibility: 10,
    buzzLevel: 10,
    discoveredBy: [],
    regionId: "region-1",
    country: "england",
    venueAppearances: ["schoolMatch"],
    generatedSeason: 1,
    placed: false,
    retired: false,
    ...overrides,
  };
}

function rival(overrides: Partial<RivalScout> = {}): RivalScout {
  return {
    id: "rival-youth-1",
    name: "Rita Rival",
    quality: 3,
    specialization: "youth",
    clubId: "club-rival",
    targetPlayerIds: [],
    reputation: 60,
    personality: "aggressive",
    isNemesis: false,
    competingForPlayers: [],
    scoutingProgress: {},
    aggressiveness: 0.8,
    budgetTier: "medium",
    winsAgainstPlayer: 0,
    lossesToPlayer: 0,
    ...overrides,
  };
}

function guardedPlayer(id: string): Player {
  const base = player(id, 199, 55);
  return new Proxy(base, {
    get(target, property, receiver) {
      if (
        property === "potentialAbility"
        || property === "currentAbility"
        || property === "attributes"
        || property === "hiddenAttributes"
      ) {
        throw new Error(`Rival targeting read hidden field ${String(property)}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

describe("rival competition for unsigned youth", () => {
  it("targets eligible unsigned youth using visible signals without reading hidden ability", () => {
    const youthRival = rival();
    const pool = {
      guarded: youth("guarded", {
        visibility: 70,
        buzzLevel: 80,
        discoveredBy: ["scout-a", "scout-b"],
        venueAppearances: ["schoolMatch", "grassrootsTournament"],
      }, guardedPlayer("guarded")),
      quiet: youth("quiet", { visibility: 5, buzzLevel: 2 }, player("quiet", 200, 60)),
      placed: youth("placed", { placed: true, placedClubId: "club-a" }),
      retired: youth("retired", { retired: true }),
      contracted: youth(
        "contracted",
        {},
        { ...player("contracted"), clubId: "club-a", contractClubId: "club-a" },
      ),
    };

    expect(() => rankYouthRivalTargets(youthRival, pool)).not.toThrow();
    const ranked = rankYouthRivalTargets(youthRival, pool);

    expect(ranked.map((candidate) => candidate.youthId)).toEqual([
      "guarded",
      "quiet",
    ]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(rankYouthRivalTargets(
      { ...youthRival, specialization: "firstTeam" },
      pool,
    )).toEqual([]);
  });

  it("keeps ranking and seeded selection invariant when only hidden PA and CA change", () => {
    const youthRival = rival({ personality: "methodical" });
    const visibleA = {
      a: youth("a", { visibility: 40, buzzLevel: 45 }, player("a", 40, 10)),
      b: youth("b", { visibility: 65, buzzLevel: 60 }, player("b", 200, 80)),
    };
    const hiddenValuesSwapped = {
      a: youth("a", { visibility: 40, buzzLevel: 45 }, player("a", 200, 80)),
      b: youth("b", { visibility: 65, buzzLevel: 60 }, player("b", 40, 10)),
    };

    const firstRanking = rankYouthRivalTargets(youthRival, visibleA);
    const secondRanking = rankYouthRivalTargets(youthRival, hiddenValuesSwapped);
    const firstSelection = selectYouthRivalTarget(
      new RNG("visible-only-target"),
      youthRival,
      visibleA,
    );
    const secondSelection = selectYouthRivalTarget(
      new RNG("visible-only-target"),
      youthRival,
      hiddenValuesSwapped,
    );

    expect(secondRanking).toEqual(firstRanking);
    expect(secondSelection).toEqual(firstSelection);
  });

  it("persists activity and contact intelligence only as pressure crosses visible bands", () => {
    const target = youth("target");
    const activeRival = rival({
      targetPlayerIds: [target.player.id],
      currentTarget: target.player.id,
      scoutingProgress: { [target.player.id]: 2 },
    });
    const existingActivity: RivalActivity = {
      rivalId: "old-rival",
      type: "spotted",
      playerId: "old-player",
      week: 4,
      season: 1,
    };
    const existingMessage: InboxMessage = {
      id: "old-message",
      week: 4,
      season: 1,
      type: "news",
      title: "Old intelligence",
      body: "Existing message.",
      read: true,
      actionRequired: false,
    };

    const contested = advanceYouthRivalPressure({
      rival: activeRival,
      youth: target,
      week: 5,
      season: 1,
      scoutHasInterest: true,
      existingActivities: [existingActivity],
      existingMessages: [existingMessage],
    });

    expect(contested).toMatchObject({
      previousBand: "watching",
      band: "contested",
    });
    expect(contested.updatedRival).toMatchObject({
      currentTarget: target.player.id,
      scoutingProgress: { [target.player.id]: 3 },
      competingForPlayers: [target.player.id],
    });
    expect(contested.updatedYouth.discoveredBy).toContain(activeRival.id);
    expect(contested.updatedYouth.visibility).toBeGreaterThan(target.visibility);
    expect(contested.updatedYouth.buzzLevel).toBeGreaterThan(target.buzzLevel);
    expect(contested.newActivities).toEqual([expect.objectContaining({ type: "spotted" })]);
    expect(contested.newMessages).toEqual([
      expect.objectContaining({ title: "Prospect Now Contested", actionRequired: false }),
    ]);
    expect(contested.activities[0]).toEqual(existingActivity);
    expect(contested.messages[0]).toEqual(existingMessage);

    const imminent = advanceYouthRivalPressure({
      rival: contested.updatedRival,
      youth: contested.updatedYouth,
      week: 6,
      season: 1,
      scoutHasInterest: true,
      existingActivities: contested.activities,
      existingMessages: contested.messages,
    });
    expect(imminent).toMatchObject({ previousBand: "contested", band: "imminent" });
    expect(imminent.newActivities).toEqual([
      expect.objectContaining({ type: "reportSubmitted" }),
    ]);
    expect(imminent.newMessages).toEqual([
      expect.objectContaining({ title: "Rival Youth Claim Imminent", actionRequired: false }),
    ]);

    const stillImminent = advanceYouthRivalPressure({
      rival: imminent.updatedRival,
      youth: imminent.updatedYouth,
      week: 7,
      season: 1,
      scoutHasInterest: true,
      existingActivities: imminent.activities,
      existingMessages: imminent.messages,
    });
    expect(stillImminent.band).toBe("imminent");
    expect(stillImminent.newActivities).toEqual([]);
    expect(stillImminent.newMessages).toEqual([]);
  });

  it("can poach a contested youth and displace pending placement work without PA affecting the outcome", () => {
    const targetId = "poach-target";
    const claimRival = rival({
      quality: 5,
      targetPlayerIds: [targetId],
      competingForPlayers: [targetId],
      currentTarget: targetId,
      scoutingProgress: { [targetId]: 5 },
      aggressiveness: 1,
    });
    const lowPaYouth = youth(targetId, {
      visibility: 100,
      buzzLevel: 100,
      discoveredBy: ["player-scout", claimRival.id],
    }, player(targetId, 40, 10));
    const highPaYouth = youth(targetId, {
      visibility: 100,
      buzzLevel: 100,
      discoveredBy: ["player-scout", claimRival.id],
    }, player(targetId, 200, 90));
    const pendingReport: PlacementReport = {
      id: "placement-pending",
      unsignedYouthId: targetId,
      targetClubId: "club-player",
      scoutId: "player-scout",
      conviction: "strongRecommend",
      clubResponse: "pending",
      qualityScore: 80,
      week: 8,
      season: 1,
    };
    const eligibilityLow = getRivalYouthClaimEligibility(claimRival, lowPaYouth);
    const eligibilityHigh = getRivalYouthClaimEligibility(claimRival, highPaYouth);

    expect(eligibilityLow).toEqual(eligibilityHigh);
    expect(eligibilityLow).toMatchObject({ eligible: true, chance: 0.9 });

    const successfulSeed = Array.from({ length: 20 }, (_, index) => `claim-${index}`)
      .find((seed) => resolveRivalYouthClaim(new RNG(seed), {
        rival: claimRival,
        youth: lowPaYouth,
        week: 9,
        season: 1,
        scoutHasInterest: true,
        placementReports: { [pendingReport.id]: pendingReport },
      }).success);
    expect(successfulSeed).toBeDefined();

    const lowResult = resolveRivalYouthClaim(new RNG(successfulSeed!), {
      rival: claimRival,
      youth: lowPaYouth,
      week: 9,
      season: 1,
      scoutHasInterest: true,
      placementReports: { [pendingReport.id]: pendingReport },
    });
    const highResult = resolveRivalYouthClaim(new RNG(successfulSeed!), {
      rival: claimRival,
      youth: highPaYouth,
      week: 9,
      season: 1,
      scoutHasInterest: true,
      placementReports: { [pendingReport.id]: pendingReport },
    });

    expect(highResult.success).toBe(lowResult.success);
    expect(highResult.chance).toBe(lowResult.chance);
    expect(lowResult.chance).toBeLessThan(eligibilityLow.chance);
    expect(lowResult).toMatchObject({
      attempted: true,
      success: true,
      marketCounterplay: { response: "advocate" },
      marketCounterplaySource: "placementReport",
      marketCounterplaySourceId: pendingReport.id,
      consequence: "poached",
      placementType: "youthContract",
      displacedPlacementReportIds: [pendingReport.id],
      updatedYouth: {
        placed: true,
        placedClubId: claimRival.clubId,
        player: {
          clubId: claimRival.clubId,
          contractClubId: claimRival.clubId,
          contractExpiry: 4,
          wage: 750,
        },
      },
      updatedRival: {
        targetPlayerIds: [],
        competingForPlayers: [],
        winsAgainstPlayer: 1,
      },
    });
    expect(lowResult.newActivities).toEqual([
      expect.objectContaining({ type: "playerSigned", playerId: targetId }),
    ]);
    expect(lowResult.newMessages).toEqual([
      expect.objectContaining({ title: "Rival Poached Your Prospect" }),
    ]);
  });

  it("rejects a claim before pressure is imminent without mutating inputs", () => {
    const target = youth("early-target");
    const earlyRival = rival({
      targetPlayerIds: [target.player.id],
      scoutingProgress: { [target.player.id]: 1 },
    });

    const result = resolveRivalYouthClaim(new RNG("too-early"), {
      rival: earlyRival,
      youth: target,
      week: 3,
      season: 1,
      scoutHasInterest: true,
    });

    expect(result).toMatchObject({ attempted: false, success: false, consequence: "none" });
    expect(result.rejectionReason).toMatch(/pressure/i);
    expect(result.updatedRival).toBe(earlyRival);
    expect(result.updatedYouth).toBe(target);
  });

  it("applies advocate and withdraw choices as bounded influence, not control", () => {
    const target = youth("counterplay", {
      visibility: 60,
      buzzLevel: 60,
      discoveredBy: ["player-scout", "rival-youth-1"],
    });
    const activeRival = rival({
      targetPlayerIds: [target.player.id],
      currentTarget: target.player.id,
      competingForPlayers: [target.player.id],
      scoutingProgress: { [target.player.id]: 5 },
    });
    const pressure = {
      playerId: target.player.id,
      score: 65,
      band: "contested" as const,
      watchers: [],
      informationExposure: "circulating" as const,
      leakSourceIds: [],
      family: {
        preference: "unverified" as const,
        explanation: "No family preference is recorded.",
      },
      reasons: [],
    };
    const advocate = assessRivalMarketCounterplay({ pressure, response: "advocate" });
    const withdraw = assessRivalMarketCounterplay({ pressure, response: "withdraw" });
    const baseline = getRivalYouthClaimEligibility(activeRival, target);
    const advocated = getRivalYouthClaimEligibility(activeRival, target, advocate);
    const withdrawn = getRivalYouthClaimEligibility(activeRival, target, withdraw);

    expect(advocated.chance).toBeLessThan(baseline.chance);
    expect(withdrawn.chance).toBeGreaterThan(baseline.chance);
    expect(advocated.chance).toBeGreaterThanOrEqual(0.08);
    expect(withdrawn.chance).toBeLessThanOrEqual(0.9);
    expect(advocated.eligible).toBe(true);
    expect(withdrawn.eligible).toBe(true);
  });
});
