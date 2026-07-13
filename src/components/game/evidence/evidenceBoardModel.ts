import type {
  HiddenIntel,
  JudgmentCategory,
  NPCScoutReport,
  Observation,
  ReflectionFlaggedMomentRecord,
  ReflectionHypothesisRecord,
  ScoutReport,
  ScoutEvidenceClaim,
} from "@/engine/core/types";
import {
  formatEvidenceRange,
  getEffectiveClaimConfidence,
  MAX_COMPARABLE_EVIDENCE_SOURCES,
  neutralPlayerPerspective,
} from "@/engine/scout/sourcePerspectives";

export type EvidenceSourceKind = "observation" | "flaggedMoment" | "contactIntel" | "npcReport" | "messageIntel";

export interface EvidenceBoardIntelMessage {
  id: string;
  title: string;
  body: string;
  week: number;
  season: number;
}

export interface EvidenceBoardSource {
  id: string;
  kind: EvidenceSourceKind;
  title: string;
  detail: string;
  meta: string;
  confidence?: number;
  direction?: "for" | "against" | "neutral";
  attribution?: string;
  category?: string;
  range?: string;
  claimDirection?: ScoutEvidenceClaim["direction"];
  relation?: "agreement" | "conflict" | "single";
  explanation?: string;
  calibration?: ScoutEvidenceClaim["calibration"];
}

export interface EvidenceBoardHypothesis {
  id: string;
  text: string;
  domain: ReflectionHypothesisRecord["domain"];
  state: ReflectionHypothesisRecord["state"];
  category: JudgmentCategory;
  evidenceFor: number;
  evidenceAgainst: number;
  connectedSourceIds: string[];
  selectedForDraft: boolean;
}

export interface EvidenceBoardClaim {
  id: string;
  category: JudgmentCategory;
  label: string;
  verdict: string;
  confidence: "low" | "medium" | "high";
  source: "draft" | "submitted";
}

export interface EvidenceBoardModel {
  sources: EvidenceBoardSource[];
  hypotheses: EvidenceBoardHypothesis[];
  claims: EvidenceBoardClaim[];
  unknowns: string[];
  metrics: {
    sourceCount: number;
    contextCount: number;
    openQuestions: number;
    contradictions: number;
    draftClaims: number;
  };
}

export interface BuildEvidenceBoardModelInput {
  observations: Observation[];
  contactIntel?: HiddenIntel[];
  npcReports?: NPCScoutReport[];
  messages?: EvidenceBoardIntelMessage[];
  flaggedMoments?: ReflectionFlaggedMomentRecord[];
  hypotheses?: ReflectionHypothesisRecord[];
  reports?: ScoutReport[];
  unknowns?: string[];
  selectedHypothesisIds?: string[];
  now?: { week: number; season: number };
  seasonLength?: number;
}

/** Return hypotheses visibly connected to a selected source on the current capped board. */
export function getConnectedHypothesisIds(
  model: Pick<EvidenceBoardModel, "hypotheses">,
  sourceId: string | null,
): string[] {
  if (!sourceId) return [];
  return model.hypotheses
    .filter((hypothesis) => hypothesis.connectedSourceIds.includes(sourceId))
    .map((hypothesis) => hypothesis.id);
}

/** Ignore evidence links whose source card is not present on the capped board. */
export function getVisibleConnectedSourceIds(
  model: Pick<EvidenceBoardModel, "sources" | "hypotheses">,
  hypothesisId: string | null,
): string[] {
  if (!hypothesisId) return [];
  const visibleSourceIds = new Set(model.sources.map((source) => source.id));
  const hypothesis = model.hypotheses.find((candidate) => candidate.id === hypothesisId);
  return hypothesis?.connectedSourceIds.filter((sourceId) => visibleSourceIds.has(sourceId)) ?? [];
}

const CATEGORY_LABELS: Record<JudgmentCategory, string> = {
  potential: "Potential",
  roleFit: "Role fit",
  characterRisk: "Character risk",
};

function formatToken(value: string): string {
  const spaced = value.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function categoryForHypothesis(
  hypothesis: Pick<ReflectionHypothesisRecord, "domain">,
): JudgmentCategory {
  if (hypothesis.domain === "tactical") return "roleFit";
  if (hypothesis.domain === "mental" || hypothesis.domain === "hidden") return "characterRisk";
  return "potential";
}

function averageConfidence(observation: Observation): number | undefined {
  if (observation.attributeReadings.length === 0) return undefined;
  return observation.attributeReadings.reduce((sum, reading) => sum + reading.confidence, 0)
    / observation.attributeReadings.length;
}

function uniqueTrimmed(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function latestHypotheses(records: ReflectionHypothesisRecord[]): ReflectionHypothesisRecord[] {
  const byId = new Map<string, ReflectionHypothesisRecord>();
  for (const record of records) byId.set(record.id, record);
  return [...byId.values()];
}

function directionFromReading(category: string, value: number): ScoutEvidenceClaim["direction"] {
  const direction = value >= 13 ? "positive" : value <= 8 ? "negative" : "mixed";
  if (category !== "injuryProneness") return direction;
  return direction === "positive" ? "negative" : direction === "negative" ? "positive" : "mixed";
}

function claimDirectionToEvidence(direction: ScoutEvidenceClaim["direction"]): EvidenceBoardSource["direction"] {
  return direction === "positive" ? "for" : direction === "negative" ? "against" : "neutral";
}

function buildObservationSources(
  observations: Observation[],
  now?: { week: number; season: number },
  seasonLength?: number,
): EvidenceBoardSource[] {
  return [...observations]
    .sort((left, right) => right.season - left.season || right.week - left.week)
    .slice(0, 6)
    .map((observation) => {
      const leadingReading = [...observation.attributeReadings]
        .sort((left, right) => right.confidence - left.confidence)[0];
      const direction = leadingReading
        ? directionFromReading(leadingReading.attribute, leadingReading.perceivedValue)
        : undefined;
      const claim: ScoutEvidenceClaim | undefined = leadingReading ? {
        id: `${observation.id}-claim-${leadingReading.attribute}`,
        playerId: observation.playerId,
        sourceId: observation.id,
        sourceName: "Your live observation",
        sourceKind: "liveObservation",
        category: leadingReading.attribute,
        direction: direction!,
        range: {
          scale: "attribute20",
          low: leadingReading.rangeLow ?? Math.max(1, leadingReading.perceivedValue - 2),
          high: leadingReading.rangeHigh ?? Math.min(20, leadingReading.perceivedValue + 2),
        },
        confidence: leadingReading.confidence,
        statement: observation.notes[0]
          ?? `${formatToken(leadingReading.attribute)} was assessed live.`,
        explanation: `${formatToken(observation.context)} context with your selected focus. A different role, reference standard, or second-hand account may produce a conflicting interpretation.`,
        recordedWeek: observation.week,
        recordedSeason: observation.season,
        perspective: neutralPlayerPerspective(observation.scoutId),
        calibration: {
          status: "uncalibrated",
          note: "An observation is evidence, not a resolved career outcome.",
        },
      } : undefined;
      return {
        id: observation.id,
        kind: "observation" as const,
        title: formatToken(observation.context),
        detail: claim?.statement
          ?? observation.notes[0]
          ?? `${observation.attributeReadings.length} attribute reading${observation.attributeReadings.length === 1 ? "" : "s"} recorded.`,
        meta: `S${observation.season} W${observation.week} · First-hand`,
        confidence: claim
          ? getEffectiveClaimConfidence(claim, now, seasonLength)
          : averageConfidence(observation),
        direction: direction ? claimDirectionToEvidence(direction) : "neutral" as const,
        attribution: "You · live observation",
        category: claim ? formatToken(String(claim.category)) : undefined,
        range: claim ? formatEvidenceRange(claim.range) : undefined,
        claimDirection: claim?.direction,
        explanation: claim?.explanation,
        calibration: claim?.calibration,
      };
    });
}

function buildFlaggedSources(flaggedMoments: ReflectionFlaggedMomentRecord[]): EvidenceBoardSource[] {
  return flaggedMoments.slice(-4).reverse().map((moment) => ({
    id: moment.id,
    kind: "flaggedMoment" as const,
    title: `${moment.minute}' ${formatToken(moment.momentType)}`,
    detail: moment.note?.trim() || moment.description,
    meta: moment.pressureContext ? "Pressure moment" : "Flagged moment",
    direction: moment.reaction === "concerning" ? "against" as const
      : moment.reaction === "promising" ? "for" as const
      : "neutral" as const,
  }));
}

function buildContactSources(
  contactIntel: HiddenIntel[],
  now?: { week: number; season: number },
  seasonLength?: number,
): EvidenceBoardSource[] {
  return [...contactIntel]
    .sort((left, right) =>
      (right.recordedSeason ?? -1) - (left.recordedSeason ?? -1)
      || (right.recordedWeek ?? -1) - (left.recordedWeek ?? -1),
    )
    .slice(0, 4)
    .map((intel, index) => ({
      id: `contact-${intel.playerId}-${intel.attribute}-${index}`,
      kind: "contactIntel" as const,
      title: intel.evidenceClaim?.sourceName ?? intel.sourceName ?? `Contact: ${formatToken(intel.attribute)}`,
      detail: intel.evidenceClaim?.statement ?? intel.hint,
      meta: intel.evidenceClaim
        ? `${intel.evidenceClaim.perspective.reliabilityBand} reliability · ${formatToken(intel.evidenceClaim.perspective.lens)} lens`
        : "Legacy second-hand intelligence · Perspective unknown",
      confidence: intel.evidenceClaim
        ? getEffectiveClaimConfidence(intel.evidenceClaim, now, seasonLength)
        : undefined,
      direction: intel.evidenceClaim
        ? claimDirectionToEvidence(intel.evidenceClaim.direction)
        : "neutral" as const,
      attribution: intel.evidenceClaim?.sourceName ?? intel.sourceName ?? "Unattributed contact",
      category: intel.evidenceClaim ? formatToken(String(intel.evidenceClaim.category)) : formatToken(intel.attribute),
      range: intel.evidenceClaim ? formatEvidenceRange(intel.evidenceClaim.range) : undefined,
      claimDirection: intel.evidenceClaim?.direction,
      explanation: intel.evidenceClaim?.explanation
        ?? "This legacy claim has no stored lens, date, or calibration. Treat it as uncalibrated rather than inventing accuracy.",
      calibration: intel.evidenceClaim?.calibration ?? {
        status: "uncalibrated" as const,
        note: "Legacy source calibration is unavailable.",
      },
    }));
}

function buildNPCReportSources(
  reports: NPCScoutReport[],
  now?: { week: number; season: number },
  seasonLength?: number,
): EvidenceBoardSource[] {
  return [...reports]
    .sort((left, right) => right.season - left.season || right.week - left.week)
    .flatMap((report): EvidenceBoardSource[] => {
      if (!report.evidenceClaims || report.evidenceClaims.length === 0) {
        const direction: EvidenceBoardSource["direction"] = report.recommendation === "pursue" ? "for"
          : report.recommendation === "monitor" ? "against"
          : "neutral";
        return [{
          id: `npc-legacy-${report.id}`,
          kind: "npcReport" as const,
          title: "Legacy NPC report",
          detail: report.summary,
          meta: `S${report.season} W${report.week} · Perspective unknown`,
          confidence: Math.max(0.1, Math.min(0.95, report.quality / 100 * 0.85)),
          direction,
          attribution: "Unattributed legacy scout",
          category: "Readiness",
          claimDirection: direction === "for" ? "positive" as const
            : direction === "against" ? "negative" as const
            : "mixed" as const,
          explanation: "This legacy report predates source lenses. It remains uncalibrated and should not be treated as objective truth.",
          calibration: {
            status: "uncalibrated" as const,
            note: "Legacy source calibration is unavailable.",
          },
        }];
      }
      return report.evidenceClaims.map((claim) => ({
        id: claim.id,
        kind: "npcReport" as const,
        title: claim.sourceName,
        detail: claim.statement,
        meta: `${claim.perspective.reliabilityBand} reliability · ${formatToken(claim.perspective.lens)} lens`,
        confidence: getEffectiveClaimConfidence(claim, now, seasonLength),
        direction: claimDirectionToEvidence(claim.direction),
        attribution: `${claim.sourceName} · NPC scout`,
        category: formatToken(String(claim.category)),
        range: formatEvidenceRange(claim.range),
        claimDirection: claim.direction,
        explanation: claim.explanation,
        calibration: claim.calibration,
      }));
    });
}

function annotateSourceRelations(sources: EvidenceBoardSource[]): EvidenceBoardSource[] {
  return sources.map((source) => {
    if (!source.category || !source.claimDirection || source.claimDirection === "mixed") {
      return { ...source, relation: "single" as const };
    }
    const comparable = sources.filter((candidate) =>
      candidate.id !== source.id
      && candidate.category === source.category
      && candidate.claimDirection
      && candidate.claimDirection !== "mixed",
    );
    if (comparable.length === 0) return { ...source, relation: "single" as const };
    const conflicts = comparable.some((candidate) => candidate.claimDirection !== source.claimDirection);
    return { ...source, relation: conflicts ? "conflict" as const : "agreement" as const };
  });
}

function buildMessageSources(messages: EvidenceBoardIntelMessage[]): EvidenceBoardSource[] {
  return [...messages]
    .sort((left, right) => right.season - left.season || right.week - left.week)
    .slice(0, 3)
    .map((message) => ({
      id: message.id,
      kind: "messageIntel" as const,
      title: message.title,
      detail: message.body,
      meta: `S${message.season} W${message.week} · Network intel`,
      direction: "neutral" as const,
    }));
}

function buildClaims(
  reports: ScoutReport[],
  hypotheses: EvidenceBoardHypothesis[],
): EvidenceBoardClaim[] {
  const latestReport = [...reports]
    .sort((left, right) => right.submittedSeason - left.submittedSeason || right.submittedWeek - left.submittedWeek)[0];
  const submittedClaims: EvidenceBoardClaim[] = latestReport?.categoryVerdicts
    ? Object.entries(latestReport.categoryVerdicts).flatMap(([category, verdict]) => verdict ? [{
        id: `report-${latestReport.id}-${category}`,
        category: category as JudgmentCategory,
        label: CATEGORY_LABELS[category as JudgmentCategory],
        verdict: verdict.verdict,
        confidence: verdict.confidence,
        source: "submitted" as const,
      }] : [])
    : [];

  const draftClaims = hypotheses
    .filter((hypothesis) => hypothesis.selectedForDraft)
    .map((hypothesis) => ({
      id: `draft-${hypothesis.id}`,
      category: hypothesis.category,
      label: CATEGORY_LABELS[hypothesis.category],
      verdict: hypothesis.text,
      confidence: hypothesis.state === "confirmed" || hypothesis.state === "supported"
        ? "high" as const
        : hypothesis.state === "open" ? "low" as const : "medium" as const,
      source: "draft" as const,
    }));

  return [...draftClaims, ...submittedClaims].slice(0, 8);
}

export function buildEvidenceBoardModel(input: BuildEvidenceBoardModelInput): EvidenceBoardModel {
  const selectedIds = new Set(input.selectedHypothesisIds ?? []);
  const sources = annotateSourceRelations([
    ...buildObservationSources(input.observations, input.now, input.seasonLength),
    ...buildFlaggedSources(input.flaggedMoments ?? []),
    ...buildContactSources(input.contactIntel ?? [], input.now, input.seasonLength),
    ...buildNPCReportSources(input.npcReports ?? [], input.now, input.seasonLength),
    ...buildMessageSources(input.messages ?? []),
  ].slice(0, MAX_COMPARABLE_EVIDENCE_SOURCES));
  const hypotheses = latestHypotheses(input.hypotheses ?? []).map((hypothesis) => {
    const evidence = hypothesis.evidence ?? [];
    return {
      id: hypothesis.id,
      text: hypothesis.text,
      domain: hypothesis.domain,
      state: hypothesis.state,
      category: categoryForHypothesis(hypothesis),
      evidenceFor: evidence.filter((item) => item.direction === "for").length,
      evidenceAgainst: evidence.filter((item) => item.direction === "against").length,
      connectedSourceIds: uniqueTrimmed(evidence.flatMap((item) => item.sourceId ? [item.sourceId] : [])),
      selectedForDraft: selectedIds.has(hypothesis.id),
    };
  });
  const reportUnknowns = input.reports?.flatMap((report) =>
    Object.values(report.categoryVerdicts ?? {}).flatMap((verdict) =>
      verdict?.acknowledgedUncertainty ? [verdict.acknowledgedUncertainty] : [],
    ),
  ) ?? [];
  const unknowns = uniqueTrimmed([...(input.unknowns ?? []), ...reportUnknowns]).slice(0, 8);
  const claims = buildClaims(input.reports ?? [], hypotheses);
  const contexts = new Set(input.observations.map((observation) => observation.context));

  return {
    sources,
    hypotheses,
    claims,
    unknowns,
    metrics: {
      sourceCount: sources.length,
      contextCount: contexts.size,
      openQuestions: hypotheses.filter((hypothesis) =>
        hypothesis.state !== "confirmed" && hypothesis.state !== "debunked",
      ).length,
      contradictions: hypotheses.filter((hypothesis) =>
        hypothesis.state === "contradicted"
        || hypothesis.state === "debunked"
        || (hypothesis.evidenceFor > 0 && hypothesis.evidenceAgainst > 0),
      ).length + sources.filter((source) => source.relation === "conflict").length,
      draftClaims: hypotheses.filter((hypothesis) => hypothesis.selectedForDraft).length,
    },
  };
}
