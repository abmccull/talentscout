import type {
  CareerFingerprintLabel,
  CareerFingerprintProjection,
  CareerFingerprintTone,
} from "@/engine/career/fingerprint";

export type PlannerCareerPressureKind = "thread" | "pressure" | "territory" | "world";

export interface PlannerCareerPressure {
  kind: PlannerCareerPressureKind;
  eyebrow: string;
  value: string;
  detail: string;
  schedulingQuestion: string;
  opportunityCost: string;
  tone: CareerFingerprintTone;
  fingerprintId: string;
}

const TONE_WEIGHT: Record<CareerFingerprintTone, number> = {
  red: 50,
  amber: 35,
  violet: 18,
  sky: 10,
  emerald: 0,
};

const KIND_WEIGHT: Record<PlannerCareerPressureKind, number> = {
  thread: 12,
  pressure: 10,
  territory: 8,
  world: 0,
};

const SCHEDULING_QUESTION: Record<PlannerCareerPressureKind, string> = {
  thread: "Which appointment advances this career chapter instead of merely filling a day?",
  pressure: "Which appointment protects this relationship or rival front before you chase more breadth?",
  territory: "Do you deepen this territory now, or accept its decline while you pursue another lead?",
  world: "Which opportunity best fits the conditions shaping this particular football world?",
};

function isPressureKind(id: string): id is PlannerCareerPressureKind {
  return id === "thread" || id === "pressure" || id === "territory" || id === "world";
}

function rankLabel(label: CareerFingerprintLabel): number {
  const kind = isPressureKind(label.id) ? label.id : "world";
  return TONE_WEIGHT[label.tone] + KIND_WEIGHT[kind];
}

function findLabel(
  projection: CareerFingerprintProjection,
  id: PlannerCareerPressureKind,
): CareerFingerprintLabel | undefined {
  return projection.labels.find((label) => label.id === id);
}

function describeOpportunityCost(
  selected: CareerFingerprintLabel,
  projection: CareerFingerprintProjection,
): string {
  const pressure = findLabel(projection, "pressure");
  const territory = findLabel(projection, "territory");
  const thread = findLabel(projection, "thread");

  switch (selected.id) {
    case "thread":
      return pressure
        ? `Ignore it and ${pressure.value.toLowerCase()} can set next week's agenda for you.`
        : "Ignore it and the career chapter can pass without a decision that defines it.";
    case "pressure":
      return territory
        ? `Chase unrelated work and ${territory.value.toLowerCase()} receives no protection.`
        : "Chase unrelated work and someone else controls the tempo of this live front.";
    case "territory":
      return thread
        ? `Leave it unattended and ${thread.value.toLowerCase()} loses its strongest geographic edge.`
        : "Leave it unattended and hard-won access or intelligence can decay.";
    default:
      return thread
        ? `Treat every opportunity alike and ${thread.value.toLowerCase()} stops shaping the career.`
        : "Treat every opportunity alike and this world begins to feel interchangeable.";
  }
}

export function buildPlannerCareerPressure(
  projection: CareerFingerprintProjection,
): PlannerCareerPressure {
  const candidates = projection.labels
    .filter((label): label is CareerFingerprintLabel & { id: PlannerCareerPressureKind } =>
      isPressureKind(label.id),
    )
    .sort((left, right) => rankLabel(right) - rankLabel(left));

  const selected = candidates[0] ?? {
    id: "world",
    label: "World",
    value: projection.title,
    detail: projection.summary,
    tone: "violet" as const,
  };

  return {
    kind: selected.id,
    eyebrow: selected.label,
    value: selected.value,
    detail: selected.detail,
    schedulingQuestion: SCHEDULING_QUESTION[selected.id],
    opportunityCost: describeOpportunityCost(selected, projection),
    tone: selected.tone,
    fingerprintId: projection.fingerprintId,
  };
}
