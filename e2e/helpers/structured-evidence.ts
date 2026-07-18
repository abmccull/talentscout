import type { Page } from "@playwright/test";

/**
 * Adds the durable evidence output that a completed live observation would
 * normally write. Synthetic E2E fixtures call this explicitly so report tests
 * exercise the production evidence contract without pretending legacy notes
 * are reportable claims.
 */
export async function seedStructuredEvidenceForPlayer(
  page: Page,
  requestedPlayerId?: string,
): Promise<void> {
  await page.evaluate((playerIdOverride) => {
    const store = (window as any).__GAME_STORE__;
    const storeState = store.getState();
    const state = storeState.gameState;
    const playerId = playerIdOverride ?? storeState.selectedPlayerId;
    const returnScreen = storeState.currentScreen;
    if (!playerId) throw new Error("Structured evidence fixture needs a selected player");

    const observations = Object.values(state.observations)
      .filter((observation: any) => observation.playerId === playerId)
      .sort((left: any, right: any) =>
        left.season - right.season
        || left.week - right.week
        || left.id.localeCompare(right.id),
      ) as any[];
    if (observations.length === 0) {
      throw new Error(`Structured evidence fixture has no observation for ${playerId}`);
    }

    const sessionId = `e2e_structured_session_${playerId}`;
    const specs = [
      {
        classification: "technicalExecution",
        questionId: "execution",
        lens: "technical",
        summary: "The player controlled a difficult pass and completed the next action cleanly.",
        detail: "A composed first touch created time for a forward action in a crowded passage.",
        attributesHinted: ["firstTouch", "technique"],
        pressureContext: false,
      },
      {
        classification: "offBallMovement",
        questionId: "movement",
        lens: "tactical",
        summary: "The player moved before the passing lane became obvious.",
        detail: "The run changed the defender's position and opened a useful option between lines.",
        attributesHinted: ["offTheBall", "anticipation"],
        pressureContext: false,
      },
      {
        classification: "pressureResponse",
        questionId: "pressure",
        lens: "mental",
        summary: "The player recovered calmly after losing the ball under pressure.",
        detail: "The response to a mistake stayed composed and helped the team regain its shape.",
        attributesHinted: ["composure", "determination"],
        pressureContext: true,
      },
    ] as const;

    const cards = specs.map((spec, index) => {
      const observation = observations[Math.min(index, observations.length - 1)];
      const id = `e2e_evidence_${playerId}_${index}`;
      return {
        id,
        sessionId,
        momentId: `e2e_moment_${playerId}_${index}`,
        playerId,
        phaseIndex: index,
        minute: 18 + index * 24,
        questionId: spec.questionId,
        lens: spec.lens,
        clarity: "strong",
        score: 0.78,
        confidence: 0.76,
        confidenceBand: "supported",
        direction: "positive",
        summary: spec.summary,
        detail: spec.detail,
        suggestedClassifications: [spec.classification, "noConclusion"],
        attributesHinted: [...spec.attributesHinted],
        pressureContext: spec.pressureContext,
        contextKey: String(observation.context ?? "schoolMatch"),
        regionalContext: "A familiar youth context provided a useful, but still bounded, read.",
        factors: {
          domainSkill: 0.18,
          judgment: 0.08,
          focus: 0.18,
          questionAlignment: 0.15,
          eventSignal: 0.12,
          regionalContext: 0.03,
          fatigue: 0,
          conditions: 0,
          boundedUncertainty: 0.02,
        },
        version: 1,
        sourceType: "liveObservation",
        classification: spec.classification,
        independenceKey: `observation:${observation.id}:${spec.classification}`,
      };
    });

    const journalId = `e2e_structured_journal_${playerId}`;
    store.getState().loadGame({
      ...state,
      reflectionJournal: {
        ...(state.reflectionJournal ?? {}),
        [journalId]: {
          id: journalId,
          sessionId,
          activityType: "attendMatch",
          week: state.currentWeek,
          season: state.currentSeason,
          playerIds: [playerId],
          notes: [],
          hypotheses: [],
          observationIds: observations.map((observation) => observation.id),
          evidenceVersion: 1,
          scoutingQuestionId: "projection",
          evidenceCards: cards,
          evidenceDecisions: Object.fromEntries(
            cards.map((card) => [card.id, {
              cueId: card.id,
              classification: card.classification,
            }]),
          ),
          createdAt: Date.now(),
        },
      },
    });
    store.getState().selectPlayer(playerId);
    if (returnScreen && returnScreen !== "mainMenu") {
      store.getState().setScreen(returnScreen);
    }
  }, requestedPlayerId);
}
