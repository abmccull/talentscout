import type { Contact, GameState, Scout } from "@/engine/core/types";
import type {
  ConsequenceCondition,
  ConsequenceEffect,
  ConsequenceEngineState,
} from "./types";

export type ScoutConsequenceMetricKey =
  | "scout:reputation"
  | "scout:fatigue"
  | "scout:clubTrust"
  | "scout:specializationReputation";

export type ContactConsequenceMetricName = "relationship" | "trust" | "loyalty";
export type ContactConsequenceMetricKey =
  `contact:${string}:${ContactConsequenceMetricName}`;
export type KnownConsequenceMetricKey =
  | ScoutConsequenceMetricKey
  | ContactConsequenceMetricKey;

const SCOUT_METRICS: Record<
  ScoutConsequenceMetricKey,
  keyof Pick<Scout, "reputation" | "fatigue" | "clubTrust" | "specializationReputation">
> = {
  "scout:reputation": "reputation",
  "scout:fatigue": "fatigue",
  "scout:clubTrust": "clubTrust",
  "scout:specializationReputation": "specializationReputation",
};

interface ContactMetricTarget {
  contactId: string;
  metric: ContactConsequenceMetricName;
}

function contactMetricTarget(metricKey: string): ContactMetricTarget | undefined {
  const match = /^contact:(.+):(relationship|trust|loyalty)$/.exec(metricKey);
  if (!match) return undefined;
  return {
    contactId: match[1],
    metric: match[2] as ContactConsequenceMetricName,
  };
}

function isScoutMetricKey(metricKey: string): metricKey is ScoutConsequenceMetricKey {
  return Object.prototype.hasOwnProperty.call(SCOUT_METRICS, metricKey);
}

function boundedMetric(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

function authoritativeContactMetric(
  contact: Contact,
  metric: ContactConsequenceMetricName,
): number {
  switch (metric) {
    case "relationship":
      return contact.relationship;
    case "trust":
      return contact.trustLevel ?? contact.relationship;
    case "loyalty":
      return contact.loyalty ?? 50;
  }
}

function metricKeysInEffect(effect: ConsequenceEffect): string[] {
  return effect.type === "adjustMetric" ? [effect.metricKey] : [];
}

function metricKeysInCondition(condition: ConsequenceCondition): string[] {
  return condition.type === "metricAtLeast" || condition.type === "metricAtMost"
    ? [condition.metricKey]
    : [];
}

/**
 * Include metrics already present in the projection plus those referenced by
 * pending work. The latter is important for delayed effects which were
 * scheduled without first seeding a metric value.
 */
function referencedMetricKeys(state: ConsequenceEngineState): Set<string> {
  const keys = new Set(Object.keys(state.metrics));
  for (const consequence of Object.values(state.consequences)) {
    if (consequence.status !== "pending") continue;
    for (const effect of consequence.effects) {
      for (const key of metricKeysInEffect(effect)) keys.add(key);
    }
    for (const condition of consequence.conditions) {
      for (const key of metricKeysInCondition(condition)) keys.add(key);
    }
  }
  return keys;
}

/**
 * Rebase known domain metrics on the current authoritative GameState before a
 * due consequence is processed. Unknown engine-local metrics remain intact.
 */
export function synchronizeConsequenceMetrics(
  gameState: GameState,
  consequenceState: ConsequenceEngineState = gameState.consequenceState,
): ConsequenceEngineState {
  let changed = false;
  const metrics = { ...consequenceState.metrics };

  for (const metricKey of referencedMetricKeys(consequenceState)) {
    let authoritativeValue: number | undefined;
    if (isScoutMetricKey(metricKey)) {
      authoritativeValue = gameState.scout[SCOUT_METRICS[metricKey]];
    } else {
      const target = contactMetricTarget(metricKey);
      const contact = target ? gameState.contacts[target.contactId] : undefined;
      if (target && contact) {
        authoritativeValue = authoritativeContactMetric(contact, target.metric);
      }
    }
    if (authoritativeValue === undefined || metrics[metricKey] === authoritativeValue) {
      continue;
    }
    metrics[metricKey] = authoritativeValue;
    changed = true;
  }

  return changed ? { ...consequenceState, metrics } : consequenceState;
}

/**
 * Apply the normalized consequence metric projection to real gameplay state.
 * Only explicitly typed keys are allowed to mutate GameState.
 */
export function projectConsequenceMetrics(
  gameState: GameState,
  consequenceState: ConsequenceEngineState,
): GameState {
  let scout = gameState.scout;
  let contacts = gameState.contacts;

  for (const [metricKey, rawValue] of Object.entries(consequenceState.metrics)) {
    if (!Number.isFinite(rawValue)) continue;
    const value = boundedMetric(rawValue);
    if (isScoutMetricKey(metricKey)) {
      const field = SCOUT_METRICS[metricKey];
      if (scout[field] !== value) {
        scout = { ...scout, [field]: value };
      }
      continue;
    }

    const target = contactMetricTarget(metricKey);
    if (!target) continue;
    const contact = contacts[target.contactId];
    if (!contact) continue;
    const field: "relationship" | "trustLevel" | "loyalty" = target.metric === "trust"
      ? "trustLevel"
      : target.metric;
    const relationship = target.metric === "relationship" ? value : contact.relationship;
    if (contact[field] === value && contact.dormant === (relationship <= 20)) continue;
    const updatedContact: Contact = {
      ...contact,
      [field]: value,
      dormant: relationship <= 20,
    };
    if (contacts === gameState.contacts) contacts = { ...contacts };
    contacts[target.contactId] = updatedContact;
  }

  if (
    consequenceState === gameState.consequenceState
    && scout === gameState.scout
    && contacts === gameState.contacts
  ) return gameState;

  return {
    ...gameState,
    consequenceState,
    scout,
    contacts,
  };
}
