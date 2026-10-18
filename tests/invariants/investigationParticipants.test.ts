import { describe, expect, it } from "vitest";
import { createSession } from "@/engine/observation/session";
import { generateSessionSummary } from "@/engine/observation/reflection";
import { getInvestigationSpeakers } from "@/engine/observation/investigationParticipants";
import { createRNG } from "@/engine/rng";
import { populateInvestigationPhases } from "@/engine/observation/investigation";

function conversation() {
  const session = createSession({
    activityType: "parentCoachMeeting",
    specialization: "youth",
    playerPool: [
      { playerId: "lead", name: "Theo Trippier", position: "LB" },
      { playerId: "other", name: "Dominic Parker", position: "CM" },
    ],
    seed: "speaker-continuity", week: 1, season: 1,
  }, createRNG("speaker-continuity"));
  session.phases = ["Roberto Müller", "Your notes", "Roberto Müller"].map((speaker, index) => ({
    index, minute: index + 1, description: "Compare the accounts.", moments: [],
    dialogueNodes: [{ id: `node-${index}`, speaker, text: "The accounts overlap.", options: [] }],
  }));
  session.currentPhaseIndex = 2;
  return session;
}

describe("investigation participant continuity", () => {
  it("generates dialogue from the named contact rather than a second prospect", () => {
    const session = conversation();
    session.sourceContactId = "coach-1";
    session.sourceContactName = "Maya Ellis";
    const populated = populateInvestigationPhases(session, createRNG("named-coach"));
    const dialogue = JSON.stringify(populated.phases.map((phase) => phase.dialogueNodes));
    expect(dialogue).toContain("Maya Ellis");
    expect(dialogue).not.toContain("Dominic Parker");
    expect(getInvestigationSpeakers(populated)).toContain("Maya Ellis");
    expect(session.phases[0].dialogueNodes![0].speaker).toBe("Roberto Müller");

    const unnamed = populateInvestigationPhases({ ...session, sourceContactId: undefined,
      sourceContactName: undefined }, createRNG("named-coach"));
    expect(JSON.stringify(unnamed.phases)).not.toContain("Dominic Parker");
    expect(getInvestigationSpeakers(unnamed)).toContain("the parent");
  });
  it("uses the actual dialogue source in the sidebar and completed reflection", () => {
    const session = conversation();
    expect(getInvestigationSpeakers(session, 0)).toEqual(["Roberto Müller"]);
    expect(getInvestigationSpeakers(session, 1)).toEqual([]);
    const summary = generateSessionSummary(session);
    expect(summary).toContain("Theo Trippier");
    expect(summary).toContain("Roberto Müller");
    expect(summary).not.toContain("Dominic Parker");
    expect(summary).not.toContain("Your notes shaping");
    session.phases[1].dialogueNodes![0].speaker = "You";
    expect(getInvestigationSpeakers(session, 1)).toEqual([]);
    expect(generateSessionSummary(session)).not.toContain("with You");
  });

  it("preserves multiple real sources across save serialization without inventing a source", () => {
    const session = conversation();
    session.phases[2].dialogueNodes![0].speaker = "Community organizer";
    const restored = JSON.parse(JSON.stringify(session));
    expect(getInvestigationSpeakers(restored)).toEqual(["Roberto Müller", "Community organizer"]);
    restored.phases = [];
    expect(getInvestigationSpeakers(restored)).toEqual([]);
  });
});
