import { describe, expect, it } from "vitest";

import {
  buildCareerStoryReel,
  type ConsequenceCinemaSource,
} from "@/components/game/consequence-cinema/consequenceCinemaModel";
import {
  archiveMaterialCareerStories,
  createCareerStoryArchiveState,
} from "@/engine/consequences/careerStoryArchive";
import { createConsequenceEngineState } from "@/engine/consequences/decisionLedger";
import { maintainConsequenceLifecycle } from "@/engine/consequences/lifecycle";
import type { DecisionRecord, WorldFact } from "@/engine/consequences/types";

function cinemaSource(
  consequenceState: ConsequenceCinemaSource["consequenceState"],
  careerStoryArchive: NonNullable<ConsequenceCinemaSource["careerStoryArchive"]>,
): ConsequenceCinemaSource {
  return {
    rootSeed: "archive-ui-regression",
    players: {},
    retiredPlayers: {},
    clubs: {},
    contacts: {},
    rivalOrganizations: {},
    reports: {},
    recommendationReviews: {},
    discoveryRecords: [],
    playerMovementHistory: [],
    consequenceState,
    careerStoryArchive,
  };
}

describe("career story archive and consequence cinema", () => {
  it("renders a permanent story after the live decision has been compacted", () => {
    const decision: DecisionRecord = {
      id: "decision:archive-cinema",
      source: { kind: "report", id: "report:archive-cinema" },
      offeredAt: { season: 1, week: 2 },
      deadlineAt: { season: 1, week: 3 },
      status: "resolved",
      visibility: "public",
      stakeholders: [{ kind: "club", id: "club:archive-cinema" }],
      options: [{
        id: "back-player",
        label: "Back the player",
        knownTradeoffs: ["Your reputation is attached", "The club commits resources"],
        immediateEffects: [],
        scheduledConsequences: [],
      }],
      selectedOptionId: "back-player",
      selectedAt: { season: 1, week: 2 },
      selectionKind: "player",
      resolvedAt: { season: 1, week: 4 },
      outcomeRoll: 0.42,
      consequenceIds: [],
      metadata: {
        title: "The Call on Jo Silva",
        relatedPlayerId: "player:jo-silva",
        reportId: "report:archive-cinema",
      },
    };
    const fact: WorldFact = {
      id: "fact:archive-cinema",
      kind: "recommendationOutcome",
      subject: { kind: "player", id: "player:jo-silva" },
      value: "signed",
      observedAt: { season: 1, week: 4 },
      visibility: "public",
      sourceDecisionId: decision.id,
    };
    const live = createConsequenceEngineState({
      decisions: { [decision.id]: decision },
      facts: { [fact.id]: fact },
    });
    const entityNames: Record<string, string> = {
      "report:report:archive-cinema": "Original scouting report",
      "club:club:archive-cinema": "Northbridge Academy",
    };
    const archived = archiveMaterialCareerStories({
      state: live,
      archive: createCareerStoryArchiveState(),
      rootSeed: "archive-ui-regression",
      resolveEntityName: (entity) => entityNames[`${entity.kind}:${entity.id}`],
    }).archive;
    const compacted = maintainConsequenceLifecycle(live, { season: 5, week: 1 }).state;

    expect(compacted.decisions[decision.id]).toBeUndefined();
    const story = buildCareerStoryReel(cinemaSource(compacted, archived)).find(
      (candidate) => candidate.id === `decision:${decision.id}`,
    );

    expect(story).toMatchObject({
      kind: "resolvedDecision",
      eyebrow: "Career archive",
      title: "The Call on Jo Silva",
      reportId: "report:archive-cinema",
      original: {
        headline: "Back the player",
        details: ["Your reputation is attached", "The club commits resources"],
      },
    });
    expect(story?.outcome.body).toContain("1 outcome note");
    expect(buildCareerStoryReel(cinemaSource(compacted, archived))).toEqual(
      buildCareerStoryReel(cinemaSource(compacted, archived)),
    );
  });
});
