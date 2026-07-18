import type { ConsequenceEffect, EntityRef } from "@/engine/consequences";
import type { GameDate, GameState } from "@/engine/core/types";
import { addGameWeeksWithSeasonLength } from "@/engine/core/gameDate";
import type { AgencyDilemmaContext, AgencyDilemmaId, AgencyDilemmaOptionDefinition } from "./types";
import { clamp, createContextDecisionId, gameDate, seasonLength } from "./helpers";

function effectRecordFact(
  id: string,
  decisionId: string,
  kind: string,
  subject: EntityRef,
  value: Record<string, string | number | boolean | null>,
  observedAt: GameDate,
  visibility: "stakeholders" | "public" = "stakeholders",
): ConsequenceEffect {
  return {
    id: `effect:${id}:fact`,
    type: "recordFact",
    fact: {
      id: `fact:${id}`,
      kind,
      subject,
      value,
      observedAt,
      visibility,
      sourceDecisionId: decisionId,
    },
  };
}

function effectMemory(
  id: string,
  decisionId: string,
  stakeholder: EntityRef,
  subject: EntityRef,
  tag: string,
  valence: number,
  createdAt: GameDate,
): ConsequenceEffect {
  return {
    id: `effect:${id}:memory`,
    type: "addMemory",
    memory: {
      id: `memory:${id}`,
      stakeholder,
      subject,
      tags: ["agencyDilemma", tag],
      valence,
      intensity: clamp(48 + Math.abs(valence), 40, 90),
      salience: clamp(54 + Math.abs(valence), 44, 92),
      visibility: "stakeholders",
      createdAt,
      sourceDecisionId: decisionId,
      halfLifeWeeks: 78,
    },
  };
}

function effectMetric(id: string, metricKey: string, delta: number): ConsequenceEffect {
  return {
    id: `effect:${id}:metric:${metricKey}`,
    type: "adjustMetric",
    metricKey,
    delta,
    min: 0,
    max: 100,
  };
}

function optionEffects(input: {
  state: GameState;
  decisionId: string;
  dilemmaId: AgencyDilemmaId;
  optionId: string;
  stakeholders: readonly EntityRef[];
  premiseTag: string;
  immediateReputation?: number;
  callbackReputation?: number;
}): AgencyDilemmaOptionDefinition["scheduledConsequences"] {
  const offeredAt = gameDate(input.state);
  const reckoningAt = addGameWeeksWithSeasonLength(offeredAt, 6, seasonLength(input.state));
  const callbackAt = addGameWeeksWithSeasonLength(offeredAt, 24, seasonLength(input.state));
  return [
    {
      id: "reckoning",
      dueAt: reckoningAt,
      effects: [
        effectRecordFact(
          `${input.decisionId}:${input.optionId}:reckoning`,
          input.decisionId,
          "AgencyDilemmaReckoning",
          { kind: "agencyDilemma", id: input.dilemmaId },
          {
            dilemmaId: input.dilemmaId,
            optionId: input.optionId,
            stage: "reckoning",
          },
          reckoningAt,
        ),
      ],
      tags: ["agencyDilemma", input.dilemmaId, input.optionId, "reckoning"],
    },
    {
      id: "callback",
      dueAt: callbackAt,
      effects: [
        effectRecordFact(
          `${input.decisionId}:${input.optionId}:callback`,
          input.decisionId,
          "AgencyDilemmaCallback",
          { kind: "agencyDilemma", id: input.dilemmaId },
          {
            dilemmaId: input.dilemmaId,
            optionId: input.optionId,
            stage: "callback",
          },
          callbackAt,
          "public",
        ),
        ...(input.callbackReputation
          ? [effectMetric(`${input.decisionId}:${input.optionId}:callback`, "scout:reputation", input.callbackReputation)]
          : []),
        ...input.stakeholders.map((stakeholder, index) =>
          effectMemory(
            `${input.decisionId}:${input.optionId}:callback:${index}`,
            input.decisionId,
            stakeholder,
            { kind: "scout", id: input.state.scout.id },
            input.premiseTag,
            input.callbackReputation && input.callbackReputation > 0 ? 18 : -14,
            callbackAt,
          )),
      ],
      tags: ["agencyDilemma", input.dilemmaId, input.optionId, "callback"],
    },
  ];
}

export function buildImmediateOption(input: {
  state: GameState;
  context: AgencyDilemmaContext;
  optionId: string;
  label: string;
  knownTradeoffs: string[];
  premiseTag: string;
  immediateReputation?: number;
  callbackReputation?: number;
}): AgencyDilemmaOptionDefinition {
  const decisionId = createContextDecisionId(input.state, input.context);
  const offeredAt = gameDate(input.state);
  return {
    id: input.optionId,
    label: input.label,
    knownTradeoffs: input.knownTradeoffs,
    immediateEffects: [
      effectRecordFact(
        `${decisionId}:${input.optionId}:selected`,
        decisionId,
        "AgencyDilemmaSelection",
        { kind: "agencyDilemma", id: input.context.id },
        {
          dilemmaId: input.context.id,
          optionId: input.optionId,
          focusRegionId: input.context.policyFocusRegionId ?? null,
          anchorClientId: input.context.anchorClientId ?? null,
          deputyEmployeeId: input.context.deputyEmployeeId ?? null,
        },
        offeredAt,
      ),
      ...(input.immediateReputation
        ? [effectMetric(`${decisionId}:${input.optionId}:selected`, "scout:reputation", input.immediateReputation)]
        : []),
      ...input.context.cast.slice(0, 2).map((stakeholder, index) =>
        effectMemory(
          `${decisionId}:${input.optionId}:opening:${index}`,
          decisionId,
          stakeholder,
          { kind: "scout", id: input.state.scout.id },
          input.premiseTag,
          input.immediateReputation && input.immediateReputation > 0 ? 12 : -10,
          offeredAt,
        )),
    ],
    scheduledConsequences: optionEffects({
      state: input.state,
      decisionId,
      dilemmaId: input.context.id,
      optionId: input.optionId,
      stakeholders: input.context.cast.slice(0, 2),
      premiseTag: input.premiseTag,
      immediateReputation: input.immediateReputation,
      callbackReputation: input.callbackReputation,
    }),
  };
}
