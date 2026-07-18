import type {
  GameState,
  ReflectionJournalEntry,
  ScoutReport,
  StructuredScoutingAssessment,
} from "@/engine/core/types";
import type { ObservationSession } from "@/engine/observation/types";
import { getDefaultScoutingQuestion } from "@/engine/observation/session";
import { resolveSessionCueReadings } from "@/engine/scout/evidenceModel";

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function migrateActiveSession(
  state: GameState,
  session: ObservationSession | null,
): ObservationSession | null {
  if (!session || session.mode !== "fullObservation") return session;
  const questionId = session.scoutingQuestionId
    ?? getDefaultScoutingQuestion(session.specialization);
  const hasMoments = session.phases.some((phase) => phase.moments.length > 0);
  const cueReadings = (session.cueReadings?.length ?? 0) > 0 || !hasMoments
    ? session.cueReadings ?? []
    : resolveSessionCueReadings({
        session: { ...session, scoutingQuestionId: questionId },
        scout: state.scout,
        questionId,
        regionalKnowledgeLevel: session.countryId
          ? state.regionalKnowledge?.[session.countryId]?.knowledgeLevel ?? 0
          : 0,
      });
  return {
    ...session,
    scoutingQuestionId: questionId,
    cueReadings,
    evidenceDecisions: { ...(session.evidenceDecisions ?? {}) },
  };
}

function migrateJournalEntry(entry: ReflectionJournalEntry): ReflectionJournalEntry {
  if (!entry.evidenceCards?.length) return entry;
  const evidenceCards = [...new Map(
    entry.evidenceCards.map((card) => [card.id, { ...card, version: 1 as const }]),
  ).values()];
  return {
    ...entry,
    evidenceVersion: 1,
    evidenceCards,
    evidenceDecisions: { ...(entry.evidenceDecisions ?? {}) },
  };
}

function migrateAssessment(
  assessment: StructuredScoutingAssessment,
): StructuredScoutingAssessment {
  return {
    ...assessment,
    version: 1,
    evidenceIds: unique(assessment.evidenceIds),
    claims: assessment.claims.map((claim) => ({
      ...claim,
      evidenceIds: unique(claim.evidenceIds),
      hypothesisIds: unique(claim.hypothesisIds),
    })),
    unknowns: assessment.unknowns.map((unknown) => ({
      ...unknown,
      sourceEvidenceIds: unique(unknown.sourceEvidenceIds),
    })),
  };
}

function migrateReport(report: ScoutReport): ScoutReport {
  const riskAssessments = report.riskAssessments
    ? [...new Map(report.riskAssessments.map((risk) => [risk.id, {
        ...risk,
        evidenceIds: unique(risk.evidenceIds),
      }])).values()]
    : undefined;
  return {
    ...report,
    ...(report.evidenceAssessment
      ? { evidenceAssessment: migrateAssessment(report.evidenceAssessment) }
      : {}),
    ...(riskAssessments ? { riskAssessments } : {}),
  };
}

/**
 * Add only deterministic evidence state that can be reconstructed safely.
 * Legacy prose remains intact and is never promoted into certainty or claims.
 */
export function migrateStructuredScoutingEvidence(state: GameState): GameState {
  return {
    ...state,
    activeObservationSession: migrateActiveSession(state, state.activeObservationSession ?? null),
    reflectionJournal: Object.fromEntries(
      Object.entries(state.reflectionJournal ?? {}).map(([id, entry]) => [id, migrateJournalEntry(entry)]),
    ),
    reports: Object.fromEntries(
      Object.entries(state.reports ?? {}).map(([id, report]) => [id, migrateReport(report)]),
    ),
  };
}
