import { describe, expect, it } from "vitest";
import { RNG } from "@/engine/rng";
import type {
  Club,
  ClubDecision,
  Contact,
  Observation,
  Scout,
  ScoutReport,
  YouthRecruitmentBrief,
} from "@/engine/core/types";
import {
  createAcademyClubDecisionMemory,
  createConsequenceEngineState,
  evaluateStakeholderMemoryPolicy,
  recordStakeholderMemory,
  type Obligation,
  type StakeholderMemory,
} from "@/engine/consequences";
import { scoreAcademyClubDecision } from "@/engine/youth/academyPlacementCase";
import { meetContact } from "@/engine/network/contacts";

const now = { season: 1, week: 12 };
const clubRef = { kind: "club", id: "club-1" };
const contactRef = { kind: "contact", id: "contact-1" };
const scoutRef = { kind: "scout", id: "scout-1" };

function memory(overrides: Partial<StakeholderMemory> = {}): StakeholderMemory {
  return {
    id: "memory-1",
    stakeholder: clubRef,
    subject: scoutRef,
    tags: ["academyReport", "reportProcess"],
    valence: 80,
    intensity: 90,
    salience: 90,
    visibility: "stakeholders",
    createdAt: { season: 1, week: 2 },
    halfLifeWeeks: 76,
    ...overrides,
  };
}

function contactMemory(overrides: Partial<StakeholderMemory> = {}): StakeholderMemory {
  return memory({
    id: "contact-memory-1",
    stakeholder: contactRef,
    tags: ["confidentiality", "promiseKept", "reciprocity"],
    ...overrides,
  });
}

function activeObligation(overrides: Partial<Obligation> = {}): Obligation {
  return {
    id: "obligation-1",
    debtor: scoutRef,
    creditor: contactRef,
    kind: "confidentiality",
    terms: "Keep the source confidential.",
    status: "active",
    createdAt: { season: 1, week: 10 },
    sourceDecisionId: "decision-1",
    ...overrides,
  };
}

function policy(memories: StakeholderMemory[]) {
  return evaluateStakeholderMemoryPolicy({
    memories,
    stakeholder: clubRef,
    subject: scoutRef,
    now,
    domain: "academyReport",
    seasonLength: 38,
  });
}

const scout = {
  id: "scout-1",
  reputation: 40,
  attributes: { networking: 10 },
} as Scout;

const club = {
  id: "club-1",
  name: "Northbridge Academy",
  shortName: "NBA",
  leagueId: "league-1",
  reputation: 55,
  budget: 1_000_000,
  scoutingPhilosophy: "academyFirst",
  managerId: "manager-1",
  playerIds: [],
  academyPlayerIds: [],
  youthAcademyRating: 14,
} as Club;

const brief = {
  id: "brief-1",
  clubId: club.id,
  type: "academyPlacement",
  createdWeek: 1,
  createdSeason: 1,
  expiresWeek: 20,
  expiresSeason: 1,
  requiredPositions: ["CM"],
  preferredRole: "boxToBox",
  developmentPriority: "highCeiling",
  maxAge: 17,
  riskTolerance: "medium",
  weeklyWageBudget: 1_000,
  competitionPressure: 50,
  status: "open",
} as YouthRecruitmentBrief;

const report = {
  id: "report-1",
  playerId: "player-1",
  scoutId: scout.id,
  submittedWeek: 10,
  submittedSeason: 1,
  attributeAssessments: [],
  strengths: ["Scanning"],
  weaknesses: ["Physical adaptation"],
  conviction: "recommend",
  summary: "A disciplined, evidence-led academy recommendation.",
  estimatedValue: 0,
  qualityScore: 72,
  projectedRole: "boxToBox",
  recommendedAction: "offerAcademyPlace",
  estimatedWeeklyWage: 600,
  riskFactors: ["Physical adaptation"],
  categoryVerdicts: {
    potential: {
      verdict: "Promising pathway",
      confidence: "high",
      hypothesisIds: ["potential-1"],
      acknowledgedUncertainty: "Senior physical adaptation still needs monitoring.",
    },
    roleFit: {
      verdict: "Fits the requested midfield role",
      confidence: "high",
      hypothesisIds: ["role-1"],
      acknowledgedUncertainty: "A higher-tempo context remains untested.",
    },
    characterRisk: {
      verdict: "Responds well to coaching",
      confidence: "medium",
      hypothesisIds: ["character-1"],
      acknowledgedUncertainty: "Longitudinal pressure evidence remains limited.",
    },
  },
} as ScoutReport;

const observations = ["schoolMatch", "trainingGround", "parentCoachMeeting"].map(
  (context, index) => ({
    id: `observation-${index}`,
    playerId: "player-1",
    scoutId: scout.id,
    week: index + 1,
    season: 1,
    context,
    attributeReadings: [],
    notes: [],
    flaggedMoments: [],
  }),
) as Observation[];

describe("stakeholder memory policy", () => {
  it("distinguishes positive, negative, and absent memories without changing actor scope", () => {
    const positive = policy([memory()]);
    const negative = policy([memory({ valence: -80, tags: ["academyReport", "evidenceWeak"] })]);
    const absent = policy([]);
    const anotherClub = policy([memory({ stakeholder: { kind: "club", id: "club-2" } })]);
    const anotherScout = policy([memory({ subject: { kind: "scout", id: "scout-2" } })]);

    expect(positive.scoreAdjustment).toBeGreaterThan(0);
    expect(negative.scoreAdjustment).toBeLessThan(0);
    expect(absent).toMatchObject({ scoreAdjustment: 0, probabilityAdjustment: 0 });
    expect(absent.reason).toBeUndefined();
    expect(anotherClub.scoreAdjustment).toBe(0);
    expect(anotherScout.scoreAdjustment).toBe(0);
  });

  it("decays deterministically and resolves conflicting memories and open obligations", () => {
    const fresh = evaluateStakeholderMemoryPolicy({
      memories: [memory({ createdAt: { season: 1, week: 1 }, halfLifeWeeks: 10 })],
      stakeholder: clubRef,
      subject: scoutRef,
      now: { season: 1, week: 1 },
      domain: "academyReport",
    });
    const decayed = evaluateStakeholderMemoryPolicy({
      memories: [memory({ createdAt: { season: 1, week: 1 }, halfLifeWeeks: 10 })],
      stakeholder: clubRef,
      subject: scoutRef,
      now: { season: 1, week: 11 },
      domain: "academyReport",
    });
    expect(decayed.scoreAdjustment).toBeLessThan(fresh.scoreAdjustment);
    expect(decayed).toEqual(evaluateStakeholderMemoryPolicy({
      memories: [memory({ createdAt: { season: 1, week: 1 }, halfLifeWeeks: 10 })],
      stakeholder: clubRef,
      subject: scoutRef,
      now: { season: 1, week: 11 },
      domain: "academyReport",
    }));

    const conflict = policy([
      memory({ id: "positive" }),
      memory({ id: "negative", valence: -80, tags: ["academyReport", "evidenceWeak"] }),
    ]);
    expect(Math.abs(conflict.scoreAdjustment)).toBeLessThanOrEqual(1);
    expect(conflict.reason).toContain("pull both ways");

    const obligation = evaluateStakeholderMemoryPolicy({
      memories: [],
      obligations: [activeObligation()],
      stakeholder: contactRef,
      subject: scoutRef,
      now,
      domain: "contactRelationship",
    });
    expect(obligation.scoreAdjustment).toBeLessThan(0);
    expect(obligation.activeObligationIds).toEqual(["obligation-1"]);
    expect(obligation.reason).toContain("active promise");
  });

  it("bounds stacked episodes so memory can influence but never dominate evidence", () => {
    const manyPositive = Array.from({ length: 30 }, (_, index) => memory({
      id: `positive-${index}`,
      valence: 100,
      intensity: 100,
      salience: 100,
      halfLifeWeeks: undefined,
    }));
    const manyNegative = manyPositive.map((episode, index) => ({
      ...episode,
      id: `negative-${index}`,
      valence: -100,
    }));
    expect(policy(manyPositive)).toMatchObject({
      scoreAdjustment: 12,
      probabilityAdjustment: 0.12,
    });
    expect(policy(manyNegative)).toMatchObject({
      scoreAdjustment: -12,
      probabilityAdjustment: -0.12,
    });
  });

  it("changes a future club decision's relationship and risk with a persisted-ready reason", () => {
    const common = {
      rng: new RNG("same-club-memory-decision"),
      report,
      brief,
      player: { id: "player-1", age: 16, position: "CM" as const, secondaryPositions: [] },
      observations,
      scout,
      club,
      relationshipScore: 40,
    };
    const positive = scoreAcademyClubDecision({
      ...common,
      stakeholderContext: {
        consequenceState: { memories: { positive: memory() }, obligations: {} },
        now,
      },
    });
    const negative = scoreAcademyClubDecision({
      ...common,
      rng: new RNG("same-club-memory-decision"),
      stakeholderContext: {
        consequenceState: {
          memories: { negative: memory({ valence: -80, tags: ["academyReport", "evidenceWeak"] }) },
          obligations: {},
        },
        now,
      },
    });

    expect(positive.breakdown.relationship).toBeGreaterThan(negative.breakdown.relationship);
    expect(positive.breakdown.risk).toBeGreaterThan(negative.breakdown.risk);
    expect(positive.reasons.at(-1)).toContain("memory effect");
  });

  it("changes a real future contact meeting and explains why", () => {
    const contact = {
      id: "contact-1",
      name: "Mara Ruiz",
      type: "academyCoach",
      organization: "Northbridge Academy",
      relationship: 50,
      reliability: 75,
      knownPlayerIds: ["player-1"],
      trustLevel: 60,
      loyalty: 65,
    } as Contact;
    const context = (episode: StakeholderMemory) => ({
      consequenceState: { memories: { [episode.id]: episode }, obligations: {} },
      now,
    });
    const positive = meetContact(
      new RNG("same-contact-meeting"),
      scout,
      contact,
      context(contactMemory()),
    );
    const negative = meetContact(
      new RNG("same-contact-meeting"),
      scout,
      contact,
      context(contactMemory({
        id: "broken-confidence",
        valence: -90,
        intensity: 100,
        salience: 100,
        tags: ["confidentiality", "promiseBroken", "informationLeak"],
      })),
    );

    expect(positive.relationshipChange).toBeGreaterThan(negative.relationshipChange);
    expect(positive.trustDelta).toBeGreaterThan(negative.trustDelta);
    expect(positive.stakeholderMemoryReason).toContain("reliable prior dealings");
    expect(negative.stakeholderMemoryReason).toContain("prior breach");
  });

  it("records each club process memory exactly once and survives serialization", () => {
    const decision = {
      id: "club-decision-1",
      caseId: "case-1",
      deliveryId: "delivery-1",
      reportId: report.id,
      clubId: club.id,
      outcome: "accepted",
      decidedWeek: 12,
      decidedSeason: 1,
      reasons: ["Evidence was clear."],
      scoreBreakdown: {
        evidence: 78,
        briefFit: 82,
        affordability: 90,
        conviction: 55,
        risk: 72,
        relationship: 50,
        competition: 50,
        presentation: 76,
        total: 72,
      },
    } as ClubDecision;
    const episode = createAcademyClubDecisionMemory({ decision, report, scoutId: scout.id });
    const first = recordStakeholderMemory(createConsequenceEngineState(), episode);
    const second = recordStakeholderMemory(first.state, episode);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.changed).toBe(false);
    expect(Object.keys(second.state.memories)).toEqual([episode.id]);
    expect(Object.keys(second.state.appliedEffects)).toEqual([`effect:${episode.id}`]);
    expect(second.state.memories[episode.id]?.stakeholder).toEqual(clubRef);

    const reloaded = JSON.parse(JSON.stringify(second.state)) as typeof second.state;
    expect(evaluateStakeholderMemoryPolicy({
      memories: reloaded.memories,
      obligations: reloaded.obligations,
      stakeholder: clubRef,
      subject: scoutRef,
      now: { season: 2, week: 12 },
      seasonLength: 38,
      domain: "academyReport",
    })).toEqual(evaluateStakeholderMemoryPolicy({
      memories: second.state.memories,
      obligations: second.state.obligations,
      stakeholder: clubRef,
      subject: scoutRef,
      now: { season: 2, week: 12 },
      seasonLength: 38,
      domain: "academyReport",
    }));
  });
});
