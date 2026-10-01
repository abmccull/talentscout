import { describe, expect, it } from "vitest";
import type {
  ActivityType,
  Contact,
  Player,
  Scout,
  UnsignedYouth,
} from "@/engine/core/types";
import { populateAnalysisPhases } from "@/engine/observation/analysis";
import { populateFullObservationPhases } from "@/engine/observation/fullObservation";
import { populateInvestigationPhases } from "@/engine/observation/investigation";
import { createSession } from "@/engine/observation/session";
import type { ObservationSession } from "@/engine/observation/types";
import { createRNG } from "@/engine/rng";
import { resolveDialogueOptionSelection } from "@/engine/observation/interactionSelection";
import { generateSessionSummary } from "@/engine/observation/reflection";
import {
  VETERAN_PROLOGUE_TEMPLATES,
  createVeteranPrologueCase,
  selectVeteranPrologueTemplate,
  shapeVeteranPrologueSession,
  type VeteranPrologueCase,
  type VeteranPrologueTemplateId,
} from "@/engine/youth/veteranPrologue";

function player(id: string, potentialAbility: number): Player {
  return {
    id,
    firstName: id === "lead" ? "Micah" : "Youth",
    lastName: id === "lead" ? "Vale" : id,
    age: 16,
    dateOfBirth: { day: 1, month: 1, year: 2009 },
    nationality: "English",
    position: "CM",
    secondaryPositions: [],
    preferredFoot: "right",
    currentAbility: 45,
    potentialAbility,
    clubId: "",
    contractExpiry: 0,
    wage: 0,
    marketValue: 0,
    attributes: {
      firstTouch: 10,
      passing: 10,
      dribbling: 10,
      crossing: 10,
      shooting: 10,
      heading: 10,
      tackling: 10,
      finishing: 10,
      pace: 10,
      strength: 10,
      stamina: 10,
      agility: 10,
      jumping: 10,
      balance: 10,
      composure: 10,
      positioning: 10,
      workRate: 10,
      decisionMaking: 10,
      leadership: 10,
      anticipation: 10,
      offTheBall: 10,
      pressing: 10,
      defensiveAwareness: 10,
      vision: 10,
      marking: 10,
      teamwork: 10,
      injuryProneness: 10,
      consistency: 10,
      bigGameTemperament: 10,
      professionalism: 10,
    },
    developmentProfile: "normal",
    wonderkidTier: "none",
    form: 0,
    morale: 5,
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: [],
    personalityRevealed: [],
    playerTraits: [],
    playerTraitsRevealed: [],
    recentMatchRatings: [],
    seasonRatings: [],
  } as unknown as Player;
}

function youth(id: string, potentialAbility: number): UnsignedYouth {
  return {
    id: `youth-${id}`,
    player: player(id, potentialAbility),
    visibility: 0,
    buzzLevel: 0,
    discoveredBy: [],
    regionId: "north",
    country: "england",
    venueAppearances: [],
    generatedSeason: 1,
    placed: false,
    retired: false,
  };
}

const scout = {
  id: "scout-1",
  primarySpecialization: "youth",
  careerPath: "independent",
} as Scout;

const contacts = {
  tommy: {
    id: "tommy",
    name: "Tommy Reyes",
    type: "schoolCoach",
    organization: "Northside School Football",
    relationship: 60,
    reliability: 75,
    knownPlayerIds: [],
    trustLevel: 55,
  } as Contact,
};

const unsignedYouth: Record<string, UnsignedYouth> = Object.fromEntries([
  ["lead", 190],
  ["two", 145],
  ["three", 135],
  ["four", 125],
  ["five", 115],
  ["six", 105],
].map(([id, potential]) => [`youth-${id}`, youth(id as string, potential as number)]));

function makePrologue(
  templateId: VeteranPrologueTemplateId,
  seed = `prologue-${templateId}`,
): VeteranPrologueCase {
  const result = createVeteranPrologueCase({
    seed,
    scout,
    unsignedYouth,
    contacts,
    youthRecruitmentBriefs: {},
    preferredCountry: "england",
    week: 1,
    season: 1,
    persona: {
      specialization: "youth",
      careerPath: "independent",
      originId: "grassroots-organizer",
      doctrineIds: ["relationships-first"],
    },
    templateId,
  });
  if (!result) throw new Error(`Expected prologue ${templateId}`);
  return result;
}

function populatedSession(prologue: VeteranPrologueCase): ObservationSession {
  const rng = createRNG(`session-${prologue.variationKey}`);
  let session = createSession({
    activityType: prologue.activityType,
    activityInstanceId: prologue.activityInstanceId,
    specialization: "youth",
    targetPlayerId: prologue.playerId,
    playerPool: prologue.playerPoolIds.map((playerId) => ({
      playerId,
      name: playerId === prologue.playerId ? prologue.player.name : playerId,
      position: "CM",
    })),
    seed: `session-${prologue.variationKey}`,
    week: 1,
    season: 1,
    careerPath: "independent",
    sourceContactId: prologue.sourceContactId,
    sourceContactName: prologue.sourceContactName,
    sourceRelationshipScore: 60,
  }, rng);

  if (session.mode === "fullObservation") {
    session = populateFullObservationPhases(session, rng);
  } else if (session.mode === "investigation") {
    session = populateInvestigationPhases(session, rng);
  } else if (session.mode === "analysis") {
    session = populateAnalysisPhases(session, rng);
  }
  return session;
}

describe("veteran prologue director", () => {
  it.each([
    ["contradictory-sources", "Define what the next observation must test"],
    ["family-discretion", "Mark response to setbacks as the next question"],
    ["agent-exaggeration", "Define an independent repeatability check"],
  ] as const)("gives %s relevant inquiry choices that survive play and serialization", (templateId, finalQuestion) => {
    const prologue = makePrologue(templateId);
    const original = populatedSession(prologue);
    const shaped = shapeVeteranPrologueSession(
      original, unsignedYouth[prologue.openingCase.youthId].player, prologue,
    );
    expect(shaped.mode).toBe("investigation");
    for (const [index, phase] of shaped.phases.entries()) {
      const node = phase.dialogueNodes![0];
      expect(node.speaker).toBe(prologue.sourceContactName);
      expect(node.options).toHaveLength(3);
      expect(node.options.map((option) => option.riskLevel)).toEqual(["safe", "moderate", "bold"]);
      for (const option of node.options) {
        expect(option.text).not.toMatch(/financial package|facilities|clients|tour/i);
        expect(option.outcome.narrativeText).toContain(prologue.evidenceBeats[index].focused);
      }
    }
    expect(shaped.phases[2].dialogueNodes![0].options[1].text).toBe(finalQuestion);
    expect(JSON.parse(JSON.stringify(shaped)).phases).toEqual(shaped.phases);
    let played = { ...shaped, state: "active" as const } as ObservationSession;
    for (let index = 0; index < played.phases.length; index++) {
      played = { ...played, currentPhaseIndex: index };
      const node = played.phases[index].dialogueNodes![0];
      const choice = resolveDialogueOptionSelection(played, node.id, node.options[1].id);
      expect(choice.applied).toBe(true);
      played = choice.session;
    }
    const restored = JSON.parse(JSON.stringify(played)) as ObservationSession;
    expect(generateSessionSummary(restored)).toContain("3 conversation decisions");
    expect(generateSessionSummary(restored)).not.toContain("nothing concrete");
    expect(restored.phases[2].dialogueChoiceResolutions).toEqual(played.phases[2].dialogueChoiceResolutions);
  });

  it("is deterministic for the same seed and persona", () => {
    const input = {
      worldSeed: "same-world",
      persona: {
        specialization: "youth" as const,
        careerPath: "independent" as const,
        originId: "video-analyst",
        doctrineIds: ["evidence-first"],
      },
    };

    expect(selectVeteranPrologueTemplate(input)).toBe(selectVeteranPrologueTemplate(input));
    const first = createVeteranPrologueCase({
      seed: input.worldSeed,
      scout,
      unsignedYouth,
      contacts,
      youthRecruitmentBriefs: {},
      week: 1,
      season: 1,
      persona: input.persona,
    });
    const second = createVeteranPrologueCase({
      seed: input.worldSeed,
      scout,
      unsignedYouth,
      contacts,
      youthRecruitmentBriefs: {},
      week: 1,
      season: 1,
      persona: input.persona,
    });
    expect(second).toEqual(first);
  });

  it("covers all ten structural templates across a broad deterministic seed sample", () => {
    const selected = new Set(
      Array.from({ length: 1_000 }, (_, index) => selectVeteranPrologueTemplate({
        worldSeed: `coverage-${index}`,
        persona: {
          specialization: "youth",
          originId: index % 2 === 0 ? "academy-apprentice" : "video-analyst",
          doctrineIds: [index % 3 === 0 ? "contrarian-eye" : "move-before-market"],
        },
      })),
    );

    expect(VETERAN_PROLOGUE_TEMPLATES).toHaveLength(10);
    expect(selected).toEqual(new Set(VETERAN_PROLOGUE_TEMPLATES.map((template) => template.id)));
  });

  it("excludes recently played templates when enough alternatives remain", () => {
    const recent = VETERAN_PROLOGUE_TEMPLATES.slice(0, 3).map((template) => template.id);
    for (let index = 0; index < 100; index += 1) {
      expect(recent).not.toContain(selectVeteranPrologueTemplate({
        worldSeed: `recent-${index}`,
        recentTemplateIds: recent,
      }));
    }
  });

  it("creates breakout, ambiguous, and false-positive career truths without projecting the band", () => {
    const outcomeBands = new Set<string>();
    for (let index = 0; index < 600; index += 1) {
      const prologue = createVeteranPrologueCase({
        seed: `lead-outcome-${index}`,
        scout,
        unsignedYouth,
        contacts,
        youthRecruitmentBriefs: {},
        preferredCountry: "england",
        week: 1,
        season: 1,
        templateId: index % 2 === 0 ? "agent-exaggeration" : "school-tournament-tip",
      });
      if (!prologue) throw new Error("Expected a veteran prologue");
      const hiddenPotential = unsignedYouth[prologue.openingCase.youthId].player.potentialAbility;
      outcomeBands.add(
        hiddenPotential >= 145 ? "breakout"
          : hiddenPotential >= 120 ? "ambiguous"
            : "false-positive",
      );
    }

    expect(outcomeBands).toEqual(new Set(["breakout", "ambiguous", "false-positive"]));
  });

  it("defines materially distinct source, pressure, evidence, deadline, conflict, and choice frames", () => {
    expect(new Set(VETERAN_PROLOGUE_TEMPLATES.map((template) => template.sourceArchetype)).size).toBe(10);
    expect(new Set(VETERAN_PROLOGUE_TEMPLATES.flatMap((template) =>
      template.venues.map((venue) => venue.activityType as ActivityType),
    )).size).toBeGreaterThanOrEqual(10);

    for (const template of VETERAN_PROLOGUE_TEMPLATES) {
      expect(template.pressures.length).toBeGreaterThanOrEqual(2);
      expect(template.evidenceFrames.length).toBeGreaterThanOrEqual(2);
      expect(template.evidenceFrames.every((evidenceFrame) => evidenceFrame.length === 3)).toBe(true);
      expect(template.contradictions.length).toBeGreaterThanOrEqual(2);
      expect(template.deadlines.length).toBeGreaterThanOrEqual(2);
      expect(template.stakeholderConflicts.length).toBeGreaterThanOrEqual(2);
      expect(template.choices.map((option) => option.id)).toEqual(["protect", "callClub", "verify"]);
    }
  });

  it("keeps the complete projection player-safe", () => {
    const prologue = makePrologue("data-anomaly");
    const serialized = JSON.stringify(prologue);
    expect(serialized).not.toContain("potentialAbility");
    expect(serialized).not.toContain("currentAbility");
    expect(serialized).not.toContain('"attributes"');
    expect(serialized).not.toContain('"pa"');
    expect(serialized).not.toContain('"ca"');
    expect(serialized).not.toContain("false-positive");
    expect(serialized).not.toContain("breakout");
    expect(serialized).not.toContain("ambiguous");
  });

  it("shapes every template through a real normal-mode ObservationSession", () => {
    const modes = new Set<string>();
    for (const template of VETERAN_PROLOGUE_TEMPLATES) {
      const prologue = makePrologue(template.id);
      const original = populatedSession(prologue);
      const shaped = shapeVeteranPrologueSession(
        original,
        unsignedYouth[prologue.openingCase.youthId].player,
        prologue,
      );
      modes.add(shaped.mode);

      expect(shaped).not.toBe(original);
      expect(shaped.phases).toHaveLength(3);
      expect(shaped.currentPhaseIndex).toBe(0);
      expect(shaped.players[0].playerId).toBe(prologue.playerId);
      expect(shaped.phases[2].description).toContain(prologue.deadline);
      if (shaped.mode === "fullObservation") {
        expect(shaped.phases.every((phase) => phase.moments[0]?.playerId === prologue.playerId)).toBe(true);
      } else if (shaped.mode === "analysis") {
        expect(shaped.phases.every((phase) => phase.dataPoints?.[0]?.playerId === prologue.playerId)).toBe(true);
      } else if (shaped.mode === "investigation") {
        expect(shaped.phases.every((phase) => phase.dialogueNodes?.[0]?.text.length)).toBeTruthy();
      }
    }

    expect(modes).toEqual(new Set(["fullObservation", "investigation", "analysis"]));
  });
});
