import { describe, expect, it } from "vitest";
import { RNG } from "@/engine/rng";
import type {
  Club,
  Contact,
  GameState,
  Observation,
  Player,
  Scout,
  ScoutReport,
  TournamentEvent,
  YouthRecruitmentBrief,
} from "@/engine/core/types";
import type { ObservationSession } from "@/engine/observation/types";
import { getAvailableActivities } from "@/engine/core/calendar";
import { maybeGenerateYouthTip } from "@/engine/core/gameLoop";
import { checkGutFeelingTrigger } from "@/engine/observation/reflection";
import { generateReportContent } from "@/engine/reports/reporting";
import { resolveScoutPerkModifiers } from "@/engine/specializations/perks";
import { scoreAcademyClubDecision } from "@/engine/youth/academyPlacementCase";
import { rollGutFeeling } from "@/engine/youth/gutFeeling";
import { createWonderkidRadarAlert } from "@/stores/actions/weeklyYouthObservationActivities";

function makeScout(
  specialization: Scout["primarySpecialization"],
  specializationLevel: number,
  overrides: Partial<Scout> = {},
): Scout {
  return {
    id: "scout-1",
    name: "Ari Scout",
    primarySpecialization: specialization,
    specializationLevel,
    unlockedPerks: [],
    specializationXp: 0,
    reputation: 45,
    fatigue: 0,
    careerTier: 1,
    homeCountry: "england",
    countryReputations: { england: 60 },
    skills: {
      technicalEye: 12,
      physicalAssessment: 12,
      psychologicalRead: 12,
      tacticalUnderstanding: 12,
      playerJudgment: 12,
      potentialAssessment: 12,
      dataLiteracy: 12,
    },
    skillXp: {},
    attributes: {
      intuition: 15,
      endurance: 12,
      adaptability: 10,
      networking: 10,
      persuasion: 10,
      memory: 10,
    },
    attributeXp: {},
    ...overrides,
  } as Scout;
}

function makeYouthPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    firstName: "Milo",
    lastName: "Prospect",
    age: 15,
    position: "CM",
    secondaryPositions: ["CAM"],
    currentAbility: 92,
    potentialAbility: 156,
    wonderkidTier: "generational",
    form: 6.8,
    marketValue: 500_000,
    attributes: {
      firstTouch: 13,
      passing: 14,
      dribbling: 12,
      crossing: 9,
      shooting: 10,
      heading: 7,
      pace: 12,
      strength: 9,
      stamina: 11,
      agility: 12,
      composure: 14,
      positioning: 11,
      workRate: 13,
      decisionMaking: 14,
      leadership: 8,
      offTheBall: 13,
      pressing: 12,
      defensiveAwareness: 11,
    },
    ...overrides,
  } as Player;
}

function makeUnsignedYouth(overrides: Partial<GameState["unsignedYouth"][string]> = {}) {
  const overridePlayer = overrides.player as Partial<Player> | undefined;
  const player = makeYouthPlayer(overridePlayer);
  return {
    id: "youth-1",
    player,
    country: "england",
    discoveredBy: [],
    placed: false,
    retired: false,
    buzzLevel: 30,
    visibility: 20,
    venueAppearances: [],
    ...overrides,
  } as GameState["unsignedYouth"][string];
}

function makeObservation(playerId: string, overrides: Partial<Observation> = {}): Observation {
  return {
    id: `observation-${playerId}`,
    playerId,
    scoutId: "scout-1",
    week: 1,
    season: 1,
    context: "schoolMatch",
    attributeReadings: [],
    notes: [],
    flaggedMoments: [],
    abilityReading: {
      perceivedCA: 3.5,
      caConfidence: 0.7,
      perceivedPALow: 4,
      perceivedPAHigh: 4.5,
      paConfidence: 0.45,
    },
    ...overrides,
  } as Observation;
}

function makeGrassrootsTournament(): TournamentEvent {
  return {
    id: "tournament-1",
    name: "North West Community Cup",
    country: "england",
    countryKey: "england",
    participantCountries: ["england"],
    category: "grassroots",
    prestige: "regional",
    startWeek: 1,
    endWeek: 2,
    season: 1,
    discovered: true,
    attended: false,
    poolSizeMultiplier: 1.2,
    observationBonus: 1,
    extraAttributes: 0,
  } as TournamentEvent;
}

function makeAcademyContact(): Contact {
  return {
    id: "contact-1",
    name: "Leah Academy",
    type: "academyCoach",
    relationship: 55,
    country: "england",
    organization: "Academy FC",
    knownPlayerIds: ["youth-1"],
  } as Contact;
}

function chanceRecorder(
  onChance: (value: number) => void,
  outcome: boolean,
): RNG {
  return {
    chance: (value: number) => {
      onChance(value);
      return outcome;
    },
    pick: <T,>(values: T[]) => values[0],
    next: () => 0.2,
    nextInt: (min: number) => min,
    shuffle: <T,>(values: T[]) => values,
  } as unknown as RNG;
}

function deterministicRng(outcome: boolean = true): RNG {
  return chanceRecorder(() => undefined, outcome);
}

function makeYouthTipState(level: number): GameState {
  const youth = makeUnsignedYouth();
  return {
    currentWeek: 1,
    currentSeason: 1,
    scout: makeScout("youth", level),
    unsignedYouth: { [youth.id]: youth },
    contacts: { "contact-1": makeAcademyContact() },
  } as unknown as GameState;
}

function makeReflectionSession(): ObservationSession {
  return {
    id: "session-1",
    activityType: "schoolMatch",
    mode: "fullObservation",
    state: "reflection",
    startedAtWeek: 1,
    startedAtSeason: 1,
    currentPhaseIndex: 0,
    phases: [{}],
    players: [{
      playerId: "player-1",
      name: "Milo Prospect",
      focusedPhases: [0],
      currentLens: "technical",
      isFocused: true,
    }],
    flaggedMoments: [{
      reaction: "promising",
      moment: {
        playerId: "player-1",
        momentType: "technicalAction",
        quality: 8,
        isStandout: true,
      },
    }],
    hypotheses: [],
  } as unknown as ObservationSession;
}

function makePlacementBrief(): YouthRecruitmentBrief {
  return {
    id: "brief-1",
    clubId: "club-1",
    type: "academyPlacement",
    createdWeek: 1,
    createdSeason: 1,
    expiresWeek: 8,
    expiresSeason: 1,
    requiredPositions: ["CM"],
    preferredRole: "boxToBox",
    developmentPriority: "highCeiling",
    maxAge: 17,
    riskTolerance: "low",
    weeklyWageBudget: 1_000,
    competitionPressure: 52,
    status: "open",
  } as YouthRecruitmentBrief;
}

function makePlacementReport(): ScoutReport {
  return {
    id: "report-1",
    playerId: "player-1",
    scoutId: "scout-1",
    submittedWeek: 1,
    submittedSeason: 1,
    attributeAssessments: [],
    strengths: ["Carries central midfield well."],
    weaknesses: ["Needs more physical maturity."],
    conviction: "recommend",
    summary: "A credible youth pathway option.",
    estimatedValue: 0,
    qualityScore: 72,
    projectedRole: "boxToBox",
    recommendedAction: "offerAcademyPlace",
    estimatedWeeklyWage: 700,
    riskFactors: ["Physical adaptation", "Education transition"],
    categoryVerdicts: {
      potential: {
        verdict: "High upside remains believable.",
        confidence: "medium",
        hypothesisIds: ["hyp-potential"],
        acknowledgedUncertainty: "Requires another context.",
      },
      roleFit: {
        verdict: "The role fit is already visible.",
        confidence: "medium",
        hypothesisIds: ["hyp-role"],
        acknowledgedUncertainty: "Still youth-sized evidence.",
      },
      characterRisk: {
        verdict: "Nothing alarming from the observed behavior.",
        confidence: "medium",
        hypothesisIds: ["hyp-character"],
        acknowledgedUncertainty: "Character still needs more time.",
      },
    },
  } as ScoutReport;
}

describe("youth perk authority", () => {
  it("makes Grassroots Access unlock grassroots tournaments and street football", () => {
    const tournaments = { "tournament-1": makeGrassrootsTournament() };
    const subRegions = {
      "region-1": {
        id: "region-1",
        name: "North West",
        familiarity: 25,
        country: "england",
      },
    } as unknown as GameState["subRegions"];

    const firstTeamActivities = getAvailableActivities(
      makeScout("firstTeam", 1),
      1,
      [],
      [],
      subRegions,
      {},
      {},
      {},
      undefined,
      tournaments,
      {},
    );
    const youthActivities = getAvailableActivities(
      makeScout("youth", 1),
      1,
      [],
      [],
      subRegions,
      {},
      {},
      {},
      undefined,
      tournaments,
      {},
    );

    expect(firstTeamActivities.some((activity) => activity.type === "grassrootsTournament")).toBe(false);
    expect(firstTeamActivities.some((activity) => activity.type === "streetFootball")).toBe(false);
    expect(firstTeamActivities.some((activity) => activity.type === "academyVisit")).toBe(false);
    expect(youthActivities.some((activity) => activity.type === "grassrootsTournament")).toBe(true);
    expect(youthActivities.some((activity) => activity.type === "streetFootball")).toBe(true);
    expect(youthActivities.some((activity) => activity.type === "academyVisit")).toBe(true);
  });

  it("makes Raw Potential Reading unlock the youth upside range", () => {
    const player = makeYouthPlayer();
    const observations = [makeObservation(player.id)];

    const beforeUnlock = generateReportContent(
      player,
      observations,
      makeScout("youth", 2),
    );
    const afterUnlock = generateReportContent(
      player,
      observations,
      makeScout("youth", 3),
    );

    expect(beforeUnlock.perceivedPARange).toBeUndefined();
    expect(afterUnlock.perceivedPARange).toEqual([4, 4.5]);
  });

  it("makes Instinct Sharpening increase youth gut-feeling trigger odds", () => {
    const scout = makeScout("youth", 5);
    const youth = makeUnsignedYouth();
    const modifiers = resolveScoutPerkModifiers(scout);
    let baselineChance = 0;
    let perkChance = 0;

    rollGutFeeling(
      chanceRecorder((value) => {
        baselineChance = value;
      }, false),
      scout,
      youth,
      "schoolMatch",
      undefined,
      0,
    );
    rollGutFeeling(
      chanceRecorder((value) => {
        perkChance = value;
      }, false),
      scout,
      youth,
      "schoolMatch",
      {
        gutFeelingMultiplier: modifiers.gutFeelingMultiplier,
        gutFeelingMaxAge: modifiers.gutFeelingMaxAge,
      },
      0,
    );

    expect(perkChance).toBeGreaterThan(baselineChance);
    expect(perkChance / baselineChance).toBeGreaterThan(1.35);
  });

  it("makes Youth Network tips appear only after the perk unlocks", () => {
    const withoutPerk = maybeGenerateYouthTip(
      makeYouthTipState(6),
      deterministicRng(true),
    );
    const withPerk = maybeGenerateYouthTip(
      makeYouthTipState(7),
      deterministicRng(true),
    );

    expect(withoutPerk).toBeNull();
    expect(withPerk?.relatedId).toBe("player-1");
  });

  it("makes Placement Reputation change academy club decisions", () => {
    const shared = {
      report: makePlacementReport(),
      brief: makePlacementBrief(),
      player: {
        id: "player-1",
        age: 16,
        position: "CM",
        secondaryPositions: [],
      } as unknown as Parameters<typeof scoreAcademyClubDecision>[0]["player"],
      observations: [
        makeObservation("player-1", { context: "schoolMatch" }),
        makeObservation("player-1", { id: "observation-2", context: "followUpSession" }),
      ],
      club: {
        id: "club-1",
        name: "Academy FC",
        shortName: "AFC",
        leagueId: "league-1",
        reputation: 55,
        budget: 2_000_000,
        scoutingPhilosophy: "academyFirst",
        managerId: "manager-1",
        playerIds: [],
        academyPlayerIds: [],
        youthAcademyRating: 13,
      } as Club,
      relationshipScore: 40,
    };

    const beforeUnlock = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("placement-reputation"),
      scout: makeScout("youth", 8, { reputation: 20 }),
    });
    const afterUnlock = scoreAcademyClubDecision({
      ...shared,
      rng: new RNG("placement-reputation"),
      scout: makeScout("youth", 9, { reputation: 20 }),
    });

    expect(afterUnlock.breakdown.total).toBe(beforeUnlock.breakdown.total + 5);
    expect(afterUnlock.reasons.join(" ")).toContain("placement reputation");
  });

  it("prevents a blocked youth mobility route from becoming a signing decision", () => {
    const decision = scoreAcademyClubDecision({
      rng: new RNG("blocked-youth-mobility"),
      report: {
        ...makePlacementReport(),
        conviction: "tablePound",
        qualityScore: 100,
      },
      brief: makePlacementBrief(),
      player: {
        id: "player-1",
        age: 15,
        position: "CM",
        secondaryPositions: [],
      },
      observations: [
        makeObservation("player-1", { context: "schoolMatch" }),
        makeObservation("player-1", { id: "observation-2", context: "academyTrialDay" }),
      ],
      scout: makeScout("youth", 18, { reputation: 90 }),
      club: {
        id: "club-1",
        name: "Academy FC",
        shortName: "AFC",
        leagueId: "league-1",
        reputation: 80,
        budget: 5_000_000,
        scoutingPhilosophy: "academyFirst",
        managerId: "manager-1",
        playerIds: [],
        academyPlayerIds: [],
        youthAcademyRating: 18,
      } as Club,
      relationshipScore: 90,
      mobilityAssessment: {
        status: "blocked",
        clubDecisionAdjustment: {
          score: -12,
          summary: "The in-game mobility gate is blocked and the placement must not proceed.",
        },
        visibleReasons: ["Registration: cross-border youth clearance is unavailable."],
        suggestedMitigationActions: ["Wait for the age gate and verify the route."],
      },
    });

    expect(decision.outcome).toBe("followUpRequested");
    expect(decision.breakdown.mobility).toBe(-12);
    expect(decision.requestedEvidenceCategory).toBeUndefined();
    expect(decision.reasons.join(" ")).toMatch(/must not proceed/i);
  });

  it("makes Wonderkid Radar produce evidence-based alerts", () => {
    const youth = makeUnsignedYouth();
    const observations = [makeObservation(youth.player.id)];

    const beforeUnlock = createWonderkidRadarAlert({
      perkModifiers: resolveScoutPerkModifiers(makeScout("youth", 11)),
      youth,
      observations,
      week: 1,
      season: 1,
    });
    const afterUnlock = createWonderkidRadarAlert({
      perkModifiers: resolveScoutPerkModifiers(makeScout("youth", 12)),
      youth,
      observations,
      week: 1,
      season: 1,
    });

    expect(beforeUnlock).toBeNull();
    expect(afterUnlock?.title).toContain("High-Upside Signal");
  });

  it("makes Academy Whisperer unlock academy trial days", () => {
    const contacts = [makeAcademyContact()];

    const beforeUnlock = getAvailableActivities(
      makeScout("youth", 14),
      1,
      [],
      contacts,
      {},
      {},
      {},
      {},
      undefined,
      {},
      {},
    );
    const afterUnlock = getAvailableActivities(
      makeScout("youth", 15),
      1,
      [],
      contacts,
      {},
      {},
      {},
      {},
      undefined,
      {},
      {},
    );

    expect(beforeUnlock.some((activity) => activity.type === "academyTrialDay")).toBe(false);
    expect(afterUnlock.some((activity) => activity.type === "academyTrialDay")).toBe(true);
  });

  it("makes Generational Eye reveal a bounded PA estimate during reflection", () => {
    const session = makeReflectionSession();
    const players = { "player-1": makeYouthPlayer() };
    const noPerk = checkGutFeelingTrigger(
      deterministicRng(true),
      session,
      40,
      18,
      { paEstimate: false },
      0,
      players,
    );
    const modifiers = resolveScoutPerkModifiers(makeScout("youth", 18));
    const withPerk = checkGutFeelingTrigger(
      deterministicRng(true),
      session,
      40,
      18,
      {
        paEstimate: modifiers.hasPAEstimate,
        paEstimateMargin: modifiers.paEstimateMargin,
      },
      0,
      players,
    );

    expect(noPerk?.paEstimate).toBeUndefined();
    expect(withPerk?.paEstimate).toEqual({ low: 151, high: 161 });
  });
});
