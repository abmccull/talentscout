"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Circle, FileText, ArrowLeft, TrendingUp, TrendingDown, Minus, Lightbulb, Target, DollarSign, X } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type {
  ConvictionLevel,
  AttributeReading,
  EvidenceConfidenceBand,
  InitialAssessmentInput,
  JudgmentCategory,
  PlayerAttribute,
  PlayerRole,
  ReportRiskAssessment,
  StructuredReportInput,
  ScoutingEvidenceCard,
  SystemFitResult,
  YouthPresentationApproach,
} from "@/engine/core/types";
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";
import {
  describePresentationRoom,
  evaluatePresentationStrategy,
  generateReportContent,
  PRESENTATION_APPROACHES,
  prepareReportSubmission,
} from "@/engine/reports";
import {
  calculateInfrastructureEffects,
  estimateReportPriceRange,
  formatAnalystEvidenceCategory,
  formatAnalystReviewBias,
  getActiveEquipmentBonuses,
  getApplicableAnalystReview,
} from "@/engine/finance";
import type { QualityBreakdown } from "@/engine/reports";
import { StarRating, StarRatingRange } from "@/components/ui/StarRating";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { useAudio } from "@/lib/audio/useAudio";
import { ScreenBackground } from "@/components/ui/screen-background";
import { useTranslations } from "next-intl";
import { ARCHETYPE_LABELS, ARCHETYPE_DESCRIPTIONS } from "@/engine/players/personalityEffects";
import { resolvePlayerEntity } from "@/lib/playerResolution";
import { useTutorialStore } from "@/stores/tutorialStore";
import { ROLE_DEFINITIONS } from "@/engine/players/roles";
import { validateStructuredReportInput } from "@/engine/reports/structuredYouthReport";
import { getRemainingTablePounds } from "@/engine/reports/conviction";
import {
  getFreshReportObservationIds,
  getLatestReportInScope,
} from "@/engine/reports/reportAccountability";
import { InitialAssessmentBuilder } from "@/components/game/InitialAssessmentBuilder";
import {
  addGameWeeks,
  gameWeeksBetween,
} from "@/engine/core/gameDate";
import { getDifficultyChallengeProfile } from "@/engine/core/difficulty";
import { deriveBriefRecruitmentIdentity } from "@/engine/world/recruitmentIdentity";
import { getPendingInsightReportQualityEffect } from "@/engine/insight/effects";
import {
  canOpenReportWorkflowStep,
  isConciseOpeningReportMode,
  resolveReportWorkflow,
  type ReportWorkflowStep,
} from "@/components/game/reportWriterMode";
import {
  buildFormalAssessment,
  buildInitialAssessment,
  FORMAL_CATEGORY_UNKNOWN_OPTIONS,
  getEvidenceClaimOptions,
  getEvidenceUnknownOptions,
  YOUTH_REPORT_RISK_OPTIONS,
} from "@/engine/scout/evidenceModel";

const CONVICTION_KEYS: ConvictionLevel[] = ["note", "recommend", "strongRecommend", "tablePound"];

function initialAssessmentConviction(
  confidence: EvidenceConfidenceBand | undefined,
): ConvictionLevel {
  if (confidence === "robust") return "strongRecommend";
  if (confidence === "supported") return "recommend";
  return "note";
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.7) return "text-emerald-400";
  if (confidence >= 0.4) return "text-amber-400";
  return "text-red-400";
}

function qualityScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function qualityScoreBg(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function qualityScoreBorder(score: number): string {
  if (score >= 70) return "border-emerald-500/30";
  if (score >= 40) return "border-amber-500/30";
  return "border-red-500/30";
}

function describeReportCraft(score: number): {
  label: string;
  representativeScore: number;
} {
  if (score >= 85) return { label: "Boardroom ready", representativeScore: 90 };
  if (score >= 70) return { label: "Credible", representativeScore: 77 };
  if (score >= 40) return { label: "Developing", representativeScore: 55 };
  return { label: "Fragile", representativeScore: 25 };
}

const BREAKDOWN_LABELS: Record<keyof QualityBreakdown, { label: string; max: number }> = {
  observationDepth: { label: "Observation depth", max: 25 },
  confidenceLevel: { label: "Evidence confidence", max: 20 },
  convictionFit: { label: "Conviction calibration", max: 15 },
  detail: { label: "Evidence-backed detail", max: 20 },
  scoutSkill: { label: "Scout technique", max: 20 },
};

function formatValue(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${n}`;
}

function attrLabel(attr: string): string {
  return attr.replace(/([A-Z])/g, " $1").trim();
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

interface DescriptorOption {
  attributes: PlayerAttribute[];
  descriptor: string;
  estimatedValue: number;
  confidence: number;
}

const MAX_STRENGTHS = 3;
const MAX_WEAKNESSES = 2;
const JUDGMENT_CATEGORIES: JudgmentCategory[] = ["potential", "roleFit", "characterRisk"];
const JUDGMENT_LABELS: Record<JudgmentCategory, string> = {
  potential: "Development potential",
  roleFit: "Tactical role fit",
  characterRisk: "Character and adaptation risk",
};

interface CategoryDraft {
  status: "unselected" | "assessed" | "notAssessed";
  evidenceCardId: string;
  claimOptionId: string;
  unknownOptionId: string;
  confidence: "low" | "medium" | "high";
}

interface RiskDraft {
  status: "observed" | "untested" | "noSignal";
  evidenceCardId?: string;
}

interface SectionNavigatorItem extends ReportWorkflowStep {
  targetId: string;
  label: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Form display helpers (A1 — Form Visibility)
// ---------------------------------------------------------------------------

interface FormDisplay {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: "up" | "down" | "neutral";
}

const FORM_MAP: Record<number, FormDisplay> = {
  3:  { label: "Exceptional Form", color: "text-emerald-400", bgColor: "bg-emerald-500/15", borderColor: "border-emerald-500/40", icon: "up" },
  2:  { label: "Good Form",        color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30", icon: "up" },
  1:  { label: "Decent Form",      color: "text-emerald-300", bgColor: "bg-emerald-500/5",  borderColor: "border-emerald-500/20", icon: "up" },
  0:  { label: "Average Form",     color: "text-zinc-400",    bgColor: "bg-zinc-500/10",    borderColor: "border-zinc-500/20",    icon: "neutral" },
};
FORM_MAP[-1] = { label: "Below Average",  color: "text-red-300",  bgColor: "bg-red-500/5",  borderColor: "border-red-500/20",  icon: "down" };
FORM_MAP[-2] = { label: "Poor Form",      color: "text-red-400",  bgColor: "bg-red-500/10", borderColor: "border-red-500/30",  icon: "down" };
FORM_MAP[-3] = { label: "Terrible Form",  color: "text-red-400",  bgColor: "bg-red-500/15", borderColor: "border-red-500/40",  icon: "down" };

function getFormDisplay(form: number): FormDisplay {
  const clamped = Math.max(-3, Math.min(3, Math.round(form)));
  return FORM_MAP[clamped] ?? FORM_MAP[0];
}

function FormIndicator({ form }: { form: number }) {
  const display = getFormDisplay(form);
  const IconComponent =
    display.icon === "up" ? TrendingUp :
    display.icon === "down" ? TrendingDown :
    Minus;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${display.bgColor} ${display.borderColor}`}
    >
      <IconComponent size={14} className={display.color} aria-hidden="true" />
      <span className={`text-xs font-medium ${display.color}`}>
        {display.label}
      </span>
    </div>
  );
}

export function ReportWriter() {
  const gameState = useGameStore((state) => state.gameState);
  const selectedPlayerId = useGameStore((state) => state.selectedPlayerId);
  const setScreen = useGameStore((state) => state.setScreen);
  const submitReport = useGameStore((state) => state.submitReport);
  const getPlayerObservations = useGameStore(
    (state) => state.getPlayerObservations,
  );
  const getClub = useGameStore((state) => state.getClub);

  const { playSFX } = useAudio();
  const t = useTranslations("report");
  const tc = useTranslations("common");
  const [isDirty, setIsDirty] = useState(false);
  const [reviewSectionId, setReviewSectionId] = useState<string | null>(null);
  const [conviction, setConviction] = useState<ConvictionLevel>("note");
  const [summary, setSummary] = useState("");
  const [selectedStrengths, setSelectedStrengths] = useState<string[]>([]);
  const [selectedWeaknesses, setSelectedWeaknesses] = useState<string[]>([]);
  const [initialAssessmentInput, setInitialAssessmentInput] = useState<InitialAssessmentInput | null>(null);
  const [briefId, setBriefId] = useState("");
  const [intendedAudience, setIntendedAudience] = useState<StructuredReportInput["intendedAudience"]>("academyDirector");
  const [presentationApproach, setPresentationApproach] = useState<YouthPresentationApproach>("evidenceLed");
  const [recruitmentNeed, setRecruitmentNeed] = useState("");
  const [projectedRole, setProjectedRole] = useState<PlayerRole | "">("");
  const [recommendedAction, setRecommendedAction] = useState<StructuredReportInput["recommendedAction"]>("inviteForTrial");
  const [riskDrafts, setRiskDrafts] = useState<Partial<Record<string, RiskDraft>>>({});
  const [estimatedWeeklyWage, setEstimatedWeeklyWage] = useState(250);
  const [alternativePlayerId, setAlternativePlayerId] = useState("");
  const [categoryDrafts, setCategoryDrafts] = useState<Record<JudgmentCategory, CategoryDraft>>({
    potential: {
      status: "unselected",
      evidenceCardId: "",
      claimOptionId: "",
      unknownOptionId: "",
      confidence: "medium",
    },
    roleFit: {
      status: "unselected",
      evidenceCardId: "",
      claimOptionId: "",
      unknownOptionId: "",
      confidence: "medium",
    },
    characterRisk: {
      status: "unselected",
      evidenceCardId: "",
      claimOptionId: "",
      unknownOptionId: "",
      confidence: "low",
    },
  });
  const draftApplied = useRef(false);

  // Derive data before any early return
  const resolvedPlayer = gameState && selectedPlayerId
    ? resolvePlayerEntity(gameState, selectedPlayerId)
    : null;
  const player = resolvedPlayer?.player;
  const canonicalPlayerId = resolvedPlayer?.playerId ?? selectedPlayerId ?? undefined;
  const club = player ? getClub(player.clubId) : undefined;
  const observations = useMemo(
    () => (canonicalPlayerId ? getPlayerObservations(canonicalPlayerId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canonicalPlayerId, gameState?.observations]
  );

  // System fit data for first-team scouts
  const systemFit: SystemFitResult | undefined = useMemo(() => {
    if (!gameState || !canonicalPlayerId) return undefined;
    if (gameState.scout.primarySpecialization !== "firstTeam") return undefined;
    const clubId = gameState.scout.currentClubId ?? "";
    const key = `${canonicalPlayerId}:${clubId}`;
    return gameState.systemFitCache[key] ?? undefined;
  }, [canonicalPlayerId, gameState]);

  const merged = useMemo<Map<string, AttributeReading>>(() => {
    const map = new Map<string, AttributeReading>();
    for (const obs of observations) {
      for (const reading of obs.attributeReadings) {
        const key = String(reading.attribute);
        const existing = map.get(key);
        if (!existing || reading.confidence > existing.confidence) {
          map.set(key, reading);
        }
      }
    }
    return map;
  }, [observations]);

  const assessmentsByDomain = useMemo(() => {
    const map = new Map<string, Array<[string, AttributeReading]>>();
    for (const [attr, reading] of merged.entries()) {
      const domain = ATTRIBUTE_DOMAINS[attr as keyof typeof ATTRIBUTE_DOMAINS] ?? "technical";
      if (!map.has(domain)) map.set(domain, []);
      map.get(domain)!.push([attr, reading]);
    }
    return map;
  }, [merged]);

  const contexts = useMemo(
    () => [...new Set(observations.map((o) => o.context))],
    [observations]
  );

  // Generate the engine draft
  const draft = useMemo(() => {
    if (!player || !gameState || observations.length === 0) return null;
    return generateReportContent(player, observations, gameState.scout);
  }, [player, gameState, observations]);

  const equipmentReportQualityBonus = useMemo(() => {
    if (!gameState?.finances?.equipment) return 0;
    const bonuses = getActiveEquipmentBonuses(gameState.finances.equipment.loadout);
    return bonuses.reportQuality;
  }, [gameState?.finances?.equipment]);

  const infrastructureReportQualityBonus = useMemo(
    () => gameState
      ? calculateInfrastructureEffects(gameState.scoutingInfrastructure).reportQualityBonus
      : 0,
    [gameState],
  );
  const insightReportQualityEffect = useMemo(
    () => gameState && canonicalPlayerId
      ? getPendingInsightReportQualityEffect(
          gameState.scout.insightState,
          canonicalPlayerId,
        )
      : undefined,
    [canonicalPlayerId, gameState],
  );
  const unsignedYouth = useMemo(
    () => gameState && canonicalPlayerId
      ? Object.values(gameState.unsignedYouth).find((youth) => youth.player.id === canonicalPlayerId)
      : undefined,
    [canonicalPlayerId, gameState],
  );
  const isYouthCase = Boolean(
    gameState?.scout.primarySpecialization === "youth" && unsignedYouth,
  );
  const matchingBriefs = useMemo(() => {
    if (!gameState || !player || !isYouthCase) return [];
    return Object.values(gameState.youthRecruitmentBriefs)
      .filter((brief) =>
        brief.status === "open"
      )
      .sort((left, right) =>
        Number(
          right.requiredPositions.includes(player.position)
          || player.secondaryPositions.some((position) => right.requiredPositions.includes(position)),
        ) - Number(
          left.requiredPositions.includes(player.position)
          || player.secondaryPositions.some((position) => left.requiredPositions.includes(position)),
        )
        || right.competitionPressure - left.competitionPressure
        || left.expiresSeason - right.expiresSeason
        || left.expiresWeek - right.expiresWeek
      );
  }, [gameState, isYouthCase, player]);
  const activeBrief = matchingBriefs.find((brief) => brief.id === briefId);
  const activeBriefClub = activeBrief && gameState
    ? gameState.clubs[activeBrief.clubId]
    : undefined;
  const activeRecruitmentIdentity = activeBrief && activeBriefClub
    ? deriveBriefRecruitmentIdentity(activeBriefClub, activeBrief)
    : undefined;
  const verificationDeadline = useMemo(() => {
    if (!activeBrief || !gameState) return undefined;
    const current = {
      week: gameState.currentWeek,
      season: gameState.currentSeason,
    };
    const briefDeadline = {
      week: activeBrief.expiresWeek,
      season: activeBrief.expiresSeason,
    };
    const baseWindow = Math.max(
      0,
      gameWeeksBetween(gameState.fixtures, current, briefDeadline),
    );
    const offset = getDifficultyChallengeProfile(
      gameState.difficulty,
    ).verificationWindowOffsetWeeks;
    return addGameWeeks(
      gameState.fixtures,
      current,
      Math.max(0, baseWindow + offset),
    );
  }, [activeBrief, gameState]);
  const previousReport = useMemo(
    () => gameState && canonicalPlayerId
      ? getLatestReportInScope(
          Object.values(gameState.reports),
          gameState.scout.id,
          canonicalPlayerId,
          isYouthCase ? activeBrief?.id : undefined,
        )
      : undefined,
    [activeBrief?.id, canonicalPlayerId, gameState, isYouthCase],
  );
  const freshObservationIds = useMemo(
    () => getFreshReportObservationIds(observations, previousReport),
    [observations, previousReport],
  );
  const preparedWorkItem = useMemo(
    () => gameState && canonicalPlayerId
      ? Object.values(gameState.reportWorkItems ?? {})
          .filter((item) =>
            item.status === "ready"
            && item.scoutId === gameState.scout.id
            && item.playerId === canonicalPlayerId
            && item.freshObservationIds.some((id) => freshObservationIds.includes(id)),
          )
          .sort((left, right) =>
            right.createdSeason - left.createdSeason
            || right.createdWeek - left.createdWeek,
          )[0]
      : undefined,
    [canonicalPlayerId, freshObservationIds, gameState],
  );
  const conciseOpeningMode = isConciseOpeningReportMode({
    isYouthScout: gameState?.scout.primarySpecialization === "youth",
    openingStage: gameState?.openingCase?.stage ?? null,
    openingPlayerId: gameState?.openingCase?.playerId ?? null,
    selectedPlayerId: canonicalPlayerId ?? null,
    previousReportExists: previousReport !== undefined,
    observationCount: observations.length,
    contextCount: contexts.length,
  }) || (isYouthCase && matchingBriefs.length === 0);
  const analystReview = useMemo(
    () => gameState?.finances && canonicalPlayerId
      ? getApplicableAnalystReview(
          gameState.finances.analystReviews ?? [],
          canonicalPlayerId,
          previousReport,
        )
      : undefined,
    [canonicalPlayerId, gameState?.finances, previousReport],
  );
  const compatibleRoles = useMemo(
    () => player
      ? ROLE_DEFINITIONS.filter((definition) => definition.positions.includes(player.position))
          .map((definition) => definition.role)
      : [],
    [player],
  );
  const initialAssessmentCards = useMemo<ScoutingEvidenceCard[]>(() => {
    if (!gameState || !canonicalPlayerId) return [];
    const cards = Object.values(gameState.reflectionJournal ?? {})
      .flatMap((entry) => entry.evidenceCards ?? [])
      .filter((card) => card.playerId === canonicalPlayerId);
    return [...new Map(cards.map((card) => [card.id, card])).values()]
      .sort((left, right) => left.minute - right.minute || left.id.localeCompare(right.id));
  }, [canonicalPlayerId, gameState]);
  const alternativeCandidates = useMemo(() => {
    if (!gameState || !player) return [];
    return Object.values(gameState.unsignedYouth)
      .filter((youth) =>
        youth.player.id !== player.id
        && !youth.placed
        && !youth.retired
        && youth.player.position === player.position
        && Object.values(gameState.observations).some((observation) => observation.playerId === youth.player.id)
      )
      .slice(0, 8);
  }, [gameState, player]);
  const remainingTablePounds = gameState
    ? getRemainingTablePounds({
        reports: Object.values(gameState.reports),
        scoutId: gameState.scout.id,
        season: gameState.currentSeason,
        careerTier: gameState.scout.careerTier,
      })
    : 0;

  useEffect(() => {
    if (!isYouthCase || matchingBriefs.length === 0) return;
    if (!matchingBriefs.some((brief) => brief.id === briefId)) {
      setBriefId(matchingBriefs[0].id);
    }
  }, [briefId, isYouthCase, matchingBriefs]);

  useEffect(() => {
    if (!activeBrief || !player || !gameState) return;
    const receivingClub = gameState.clubs[activeBrief.clubId];
    setRecruitmentNeed(
      `${receivingClub?.name ?? "The academy"} needs a ${activeBrief.requiredPositions.join("/")} prospect for a ${activeBrief.developmentPriority.replace(/([A-Z])/g, " $1").toLowerCase()} pathway.`,
    );
    setProjectedRole(activeBrief.preferredRole ?? compatibleRoles[0] ?? "");
    setEstimatedWeeklyWage(Math.min(activeBrief.weeklyWageBudget, Math.max(150, Math.round(activeBrief.weeklyWageBudget * 0.75))));
  }, [activeBrief, compatibleRoles, gameState, player]);

  const selectedRiskAssessments = useMemo<ReportRiskAssessment[]>(() =>
    YOUTH_REPORT_RISK_OPTIONS.flatMap((option) => {
      const draft = riskDrafts[option.id];
      if (!draft) return [];
      return [{
        id: option.id,
        label: option.label,
        status: draft.status,
        evidenceIds: draft.evidenceCardId ? [draft.evidenceCardId] : [],
      }];
    }), [riskDrafts]);

  const structuredInput = useMemo<StructuredReportInput | undefined>(() => {
    if (conciseOpeningMode || !isYouthCase || !activeBrief || !projectedRole) return undefined;
    const categoryVerdicts = JUDGMENT_CATEGORIES.reduce<StructuredReportInput["categoryVerdicts"]>(
      (verdicts, category) => {
        const categoryDraft = categoryDrafts[category];
        const card = initialAssessmentCards.find(
          (candidate) => candidate.id === categoryDraft.evidenceCardId,
        );
        const claim = card
          ? getEvidenceClaimOptions(card).find(
              (option) => option.id === categoryDraft.claimOptionId,
            )
          : undefined;
        const unknownOptions = categoryDraft.status === "assessed" && card
          ? [
              ...FORMAL_CATEGORY_UNKNOWN_OPTIONS[category],
              ...getEvidenceUnknownOptions(card),
            ]
          : FORMAL_CATEGORY_UNKNOWN_OPTIONS[category];
        const unknown = unknownOptions.find(
          (option) => option.id === categoryDraft.unknownOptionId,
        );
        verdicts[category] = {
          verdict: categoryDraft.status === "notAssessed"
            ? "No reportable claim is being made from the available evidence."
            : claim?.statement ?? "",
          confidence: categoryDraft.confidence,
          hypothesisIds: [],
          acknowledgedUncertainty: unknown?.statement ?? "",
          status: categoryDraft.status === "unselected" ? undefined : categoryDraft.status,
          evidenceIds: categoryDraft.status === "assessed" && card ? [card.id] : [],
          classification: categoryDraft.status === "assessed" ? claim?.classification : undefined,
          claimSupport: categoryDraft.status === "assessed" ? claim?.support : undefined,
          unknownOptionId: unknown?.id,
        };
        return verdicts;
      },
      {} as StructuredReportInput["categoryVerdicts"],
    );
    const evidenceIds = [...new Set(
      Object.values(categoryVerdicts).flatMap((verdict) => verdict.evidenceIds ?? []),
    )];
    return {
      briefId: activeBrief.id,
      intendedClubId: activeBrief.clubId,
      intendedAudience,
      presentationApproach,
      recruitmentNeed,
      projectedRole,
      recommendedAction,
      riskFactors: selectedRiskAssessments
        .filter((risk) => risk.id !== "noMaterialSignal")
        .map((risk) => `${risk.label}${risk.status === "untested" ? " remains untested" : " observed"}`),
      estimatedWeeklyWage,
      decisionDeadlineWeek: verificationDeadline?.week ?? activeBrief.expiresWeek,
      decisionDeadlineSeason: verificationDeadline?.season ?? activeBrief.expiresSeason,
      categoryVerdicts,
      alternativePlayerIds: alternativePlayerId ? [alternativePlayerId] : [],
      evidenceVersion: 1,
      evidenceIds,
      riskAssessments: selectedRiskAssessments,
    };
  }, [
    activeBrief,
    alternativePlayerId,
    categoryDrafts,
    estimatedWeeklyWage,
    intendedAudience,
    isYouthCase,
    initialAssessmentCards,
    conciseOpeningMode,
    presentationApproach,
    projectedRole,
    recommendedAction,
    recruitmentNeed,
    selectedRiskAssessments,
    verificationDeadline,
  ]);
  const structuredValidation = useMemo(
    () => conciseOpeningMode
      ? { valid: true, errors: [] as string[] }
      : structuredInput
      ? validateStructuredReportInput(
          structuredInput,
          activeBrief,
          new Set(initialAssessmentCards.map((card) => card.id)),
        )
      : { valid: !isYouthCase, errors: isYouthCase ? ["Select a matching academy brief."] : [] },
    [activeBrief, conciseOpeningMode, initialAssessmentCards, isYouthCase, structuredInput],
  );
  const initialAssessmentResult = useMemo(
    () => conciseOpeningMode && initialAssessmentInput && player
      ? buildInitialAssessment(
          initialAssessmentInput,
          initialAssessmentCards,
          `${player.firstName} ${player.lastName}`,
        )
      : undefined,
    [conciseOpeningMode, initialAssessmentCards, initialAssessmentInput, player],
  );
  const formalAssessmentResult = useMemo(
    () => !conciseOpeningMode && structuredInput?.evidenceVersion === 1 && player
      ? buildFormalAssessment(
          structuredInput,
          initialAssessmentCards,
          `${player.firstName} ${player.lastName}`,
          activeBriefClub?.name ?? "the academy",
        )
      : undefined,
    [activeBriefClub?.name, conciseOpeningMode, initialAssessmentCards, player, structuredInput],
  );
  const effectiveSummary = conciseOpeningMode
    ? initialAssessmentResult?.assessment?.generatedSummary ?? ""
    : isYouthCase
      ? formalAssessmentResult?.assessment?.generatedSummary ?? ""
      : summary;
  const effectiveConviction = conciseOpeningMode
    ? initialAssessmentConviction(initialAssessmentInput?.confidence)
    : conviction;
  const totalReportQualityBonus =
    equipmentReportQualityBonus
    + infrastructureReportQualityBonus
    + (insightReportQualityEffect?.bonusPoints ?? 0) / 100;

  // The exact craft score stays authoritative for submission. The writer only
  // exposes a broad band so players improve the club report instead
  // of grinding individual inputs until a hidden formula moves by one point.
  const qualityPreview = useMemo(() => {
    if (!draft || !gameState || !player || !canonicalPlayerId) {
      return {
        score: 0,
        breakdown: {
          observationDepth: 0,
          confidenceLevel: 0,
          convictionFit: 0,
          detail: 0,
          scoutSkill: 0,
          equipmentBonus: 0,
          analystReviewBonus: 0,
        },
        hints: [] as string[],
      };
    }

    return prepareReportSubmission({
      draft,
      conviction: effectiveConviction,
      summary: effectiveSummary,
      strengths: selectedStrengths,
      weaknesses: selectedWeaknesses,
      scout: gameState.scout,
      week: gameState.currentWeek,
      season: gameState.currentSeason,
      playerId: canonicalPlayerId,
      observations,
      playerContext: player,
      reportQualityBonus: totalReportQualityBonus,
      analystReviewBonus: analystReview?.craftQualityBonus,
    }).quality;
  },
    [
      draft,
      gameState,
      player,
      canonicalPlayerId,
      effectiveConviction,
      effectiveSummary,
      selectedStrengths,
      selectedWeaknesses,
      observations,
      totalReportQualityBonus,
      analystReview,
    ],
  );
  const evidenceQualityScore = conciseOpeningMode
    ? initialAssessmentResult?.assessment?.score.total
    : formalAssessmentResult?.assessment?.score.total;
  const displayQualityScore = evidenceQualityScore ?? qualityPreview.score;
  const craftRead = describeReportCraft(displayQualityScore);

  const strengthOptions = useMemo<DescriptorOption[]>(
    () => draft?.suggestedStrengthClaims ?? [],
    [draft],
  );

  const weaknessOptions = useMemo<DescriptorOption[]>(
    () => draft?.suggestedWeaknessClaims ?? [],
    [draft],
  );

  const strengthClaimsByDescriptor = useMemo(
    () => new Map(strengthOptions.map((option) => [option.descriptor, option])),
    [strengthOptions],
  );

  const weaknessClaimsByDescriptor = useMemo(
    () => new Map(weaknessOptions.map((option) => [option.descriptor, option])),
    [weaknessOptions],
  );

  const selectedStrengthAttributes = useMemo(
    () => new Set(
      selectedStrengths
        .flatMap((descriptor) => strengthClaimsByDescriptor.get(descriptor)?.attributes ?? []),
    ),
    [selectedStrengths, strengthClaimsByDescriptor],
  );

  const selectedWeaknessAttributes = useMemo(
    () => new Set(
      selectedWeaknesses
        .flatMap((descriptor) => weaknessClaimsByDescriptor.get(descriptor)?.attributes ?? []),
    ),
    [selectedWeaknesses, weaknessClaimsByDescriptor],
  );

  // Live pricing estimate for independent scouts
  const isIndependent = gameState?.scout.careerPath === "independent";
  const priceEstimate = useMemo(() => {
    if (!isIndependent || !gameState?.finances) return null;
    return estimateReportPriceRange(
      effectiveConviction,
      craftRead.representativeScore,
      gameState.scout.reputation,
      gameState.finances.marketTemperature,
    );
  }, [isIndependent, effectiveConviction, craftRead.representativeScore, gameState?.scout.reputation, gameState?.finances]);

  // Pre-populate form state from draft (one-shot) and auto-generate summary
  useEffect(() => {
    if (!draft || draftApplied.current) return;
    draftApplied.current = true;
    const nextStrengths = draft.suggestedStrengthClaims
      .slice(0, MAX_STRENGTHS)
      .map((claim) => claim.descriptor);
    const selectedStrengthAttrs = new Set(
      nextStrengths
        .flatMap((descriptor) => strengthClaimsByDescriptor.get(descriptor)?.attributes ?? []),
    );
    const nextWeaknesses = draft.suggestedWeaknessClaims
      .filter((claim) => {
        return !claim.attributes.some((attribute) => selectedStrengthAttrs.has(attribute));
      })
      .slice(0, MAX_WEAKNESSES)
      .map((claim) => claim.descriptor);
      if (nextStrengths.length > 0) {
        setSelectedStrengths(nextStrengths);
      }
    if (nextWeaknesses.length > 0) {
      setSelectedWeaknesses(nextWeaknesses);
    }
    // Auto-generate summary
    const lines: string[] = [];
    lines.push(
      `Based on ${observations.length} observation${observations.length !== 1 ? "s" : ""}, ${player?.firstName} ${player?.lastName} presents as a ${draft.perceivedCAStars ? `${draft.perceivedCAStars}-star` : "developing"} ${player?.position}.`
    );
    if (nextStrengths.length > 0) {
      lines.push(`Key strengths include ${nextStrengths.slice(0, 2).map(s => {
        const attr = strengthClaimsByDescriptor.get(s)?.attributes[0];
        return attr ? attrLabel(attr).toLowerCase() : s.toLowerCase().split(" — ")[0];
      }).join(" and ")}.`);
    }
    if (nextWeaknesses.length > 0) {
      lines.push(`Areas of concern: ${nextWeaknesses.slice(0, 2).map(w => {
        const attr = weaknessClaimsByDescriptor.get(w)?.attributes[0];
        return attr ? attrLabel(attr).toLowerCase() : w.toLowerCase().split(" — ")[0];
      }).join(" and ")}.`);
    }
    const revealedTraits = player?.playerTraitsRevealed ?? [];
    if (revealedTraits.length > 0) {
      const traitStrs = revealedTraits.slice(0, 2).map(t => t.replace(/([A-Z])/g, " $1").trim().toLowerCase());
      lines.push(`Notable tendencies: ${traitStrs.join(", ")}.`);
    }
    if (player?.personalityProfile && !player.personalityProfile.hiddenUntilRevealed) {
      const archetypeLabel = ARCHETYPE_LABELS[player.personalityProfile.archetype];
      lines.push(`Character: ${archetypeLabel}.`);
      if (player.personalityProfile.dressingRoomImpact <= -2) {
        lines.push("Warning: potential dressing room disruption risk.");
      } else if (player.personalityProfile.dressingRoomImpact >= 2) {
        lines.push("Positive dressing room influence expected.");
      }
      if (player.personalityProfile.bigMatchModifier >= 2) {
        lines.push("Thrives in big-match scenarios.");
      } else if (player.personalityProfile.bigMatchModifier <= -1) {
        lines.push("May struggle in high-pressure fixtures.");
      }
    }
    if (draft.perceivedPARange) {
      lines.push(`Potential ceiling estimated at ${draft.perceivedPARange[0]}–${draft.perceivedPARange[1]} stars.`);
    }
    setSummary(lines.join(" "));
    playSFX("pen-scribble");
  }, [
    draft,
    player,
    observations.length,
    strengthClaimsByDescriptor,
    weaknessClaimsByDescriptor,
    playSFX,
  ]);

  // Warn the user if they try to close/reload the tab while the form is dirty
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  // Early return after all hooks — show a recoverable state instead of blank
  if (!gameState || !selectedPlayerId || !player) {
    return (
      <GameLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <AlertTriangle size={32} className="text-amber-400 mb-3" />
          <p className="text-sm text-zinc-400 mb-4">
            No player selected for the report. Please go back and select a player first.
          </p>
          <Button variant="outline" onClick={() => setScreen("dashboard")}>
            <ArrowLeft size={14} className="mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </GameLayout>
    );
  }

  if (isYouthCase && initialAssessmentCards.length === 0) {
    return (
      <GameLayout>
        <div className="relative flex min-h-[70vh] items-center justify-center p-4 sm:p-6">
          <ScreenBackground src="/images/backgrounds/reports-desk.png" opacity={0.82} />
          <Card className="relative z-10 w-full max-w-2xl border-amber-400/25 bg-[#10151b]/98 shadow-2xl shadow-black/40">
            <CardContent className="p-6 text-center sm:p-8">
              <Target className="mx-auto text-amber-300" size={30} aria-hidden="true" />
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">Evidence needed</p>
              <h1 className="mt-2 text-2xl font-bold text-white">Return with one question to answer</h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-300">
                Your existing view of {player.firstName} {player.lastName} did not leave a classified moment you can defend in a report. Plan a focused observation, choose what you are testing, and save the cue that changes your read.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Button variant="outline" className="min-h-11" onClick={() => setScreen("playerProfile")}>
                  <ArrowLeft size={14} className="mr-2" aria-hidden="true" />
                  Back to profile
                </Button>
                <Button className="min-h-11" onClick={() => setScreen("calendar")}>
                  Plan focused observation
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </GameLayout>
    );
  }

  const draftedEvidenceCount = new Set(
    JUDGMENT_CATEGORIES
      .map((category) => categoryDrafts[category].evidenceCardId)
      .filter(Boolean),
  ).size;
  const completedJudgmentCount = JUDGMENT_CATEGORIES.filter((category) => {
    const draft = categoryDrafts[category];
    if (draft.status === "unselected" || !draft.unknownOptionId) return false;
    if (draft.status === "notAssessed") return true;
    return Boolean(draft.evidenceCardId && draft.claimOptionId);
  }).length;
  const riskSignalCount = selectedRiskAssessments.filter(
    (risk) => risk.id !== "noMaterialSignal",
  ).length;
  const privateNarrativeNote = summary.trim();

  const updateCategoryDraft = (
    category: JudgmentCategory,
    update: Partial<CategoryDraft>,
  ) => {
    setIsDirty(true);
    setCategoryDrafts((current) => ({
      ...current,
      [category]: { ...current[category], ...update },
    }));
  };

  const toggleStrength = (option: DescriptorOption) => {
    const isSelected = selectedStrengths.includes(option.descriptor);
    const canAdd = isSelected || selectedStrengths.length < MAX_STRENGTHS;
    if (!canAdd) return;

    setIsDirty(true);
    useTutorialStore.getState().completeMilestone("wroteReport");
    setSelectedStrengths((current) =>
      isSelected
        ? current.filter((descriptor) => descriptor !== option.descriptor)
        : [...current, option.descriptor]
    );
    if (!isSelected) {
      setSelectedWeaknesses((current) =>
        current.filter((descriptor) => {
          const weakness = weaknessClaimsByDescriptor.get(descriptor);
          return !weakness?.attributes.some((attribute) => option.attributes.includes(attribute));
        }),
      );
    }
    playSFX("page-turn");
  };

  const toggleWeakness = (option: DescriptorOption) => {
    const isSelected = selectedWeaknesses.includes(option.descriptor);
    const canAdd = isSelected || selectedWeaknesses.length < MAX_WEAKNESSES;
    if (!canAdd) return;

    setIsDirty(true);
    useTutorialStore.getState().completeMilestone("wroteReport");
    setSelectedWeaknesses((current) =>
      isSelected
        ? current.filter((descriptor) => descriptor !== option.descriptor)
        : [...current, option.descriptor]
    );
    if (!isSelected) {
      setSelectedStrengths((current) =>
        current.filter((descriptor) => {
          const strength = strengthClaimsByDescriptor.get(descriptor);
          return !strength?.attributes.some((attribute) => option.attributes.includes(attribute));
        }),
      );
    }
    playSFX("page-turn");
  };

  const handleBack = () => {
    if (isDirty && !window.confirm(t("unsavedWarning"))) {
      return;
    }
    setScreen("playerProfile");
  };

  const handleSubmit = () => {
    if (!effectiveSummary.trim() || (isYouthCase && !structuredInput && !conciseOpeningMode)) return;
    setIsDirty(false);
    playSFX("report-submit");
    submitReport(
      effectiveConviction,
      effectiveSummary.trim(),
      selectedStrengths,
      selectedWeaknesses,
      isYouthCase && !conciseOpeningMode ? structuredInput : undefined,
      conciseOpeningMode ? initialAssessmentInput ?? undefined : undefined,
    );
  };

  const isTablePound = !conciseOpeningMode && conviction === "tablePound";
  const canSubmit = effectiveSummary.trim().length > 0
    && observations.length > 0
    && freshObservationIds.length > 0
    && (
      conciseOpeningMode
        ? Boolean(initialAssessmentInput && initialAssessmentResult?.valid)
        : (!isYouthCase || structuredValidation.valid)
    );
  const sectionNavigatorItems: SectionNavigatorItem[] = (() => {
    if (conciseOpeningMode) {
      return [
        {
          id: "assessment",
          targetId: "report-section-evidence",
          label: "Assessment",
          detail: initialAssessmentResult?.valid
            ? "Five decisions logged"
            : "Complete the five evidence decisions",
          complete: Boolean(initialAssessmentResult?.valid),
          decisionsRemaining: initialAssessmentResult?.valid ? 0 : 5,
        },
      ];
    }

    if (isYouthCase) {
      return [
        {
          id: "brief",
          targetId: "report-section-brief",
          label: "Brief",
          detail: activeBrief
            ? `${activeBriefClub?.name ?? "Club"} selected`
            : "Select a matching academy brief",
          complete: Boolean(activeBrief),
          decisionsRemaining: activeBrief ? 0 : 1,
        },
        {
          id: "case",
          targetId: "report-section-framing",
          label: "Build the case",
          detail: `${completedJudgmentCount}/${JUDGMENT_CATEGORIES.length} defended`,
          complete: completedJudgmentCount === JUDGMENT_CATEGORIES.length && estimatedWeeklyWage > 0,
          decisionsRemaining:
            JUDGMENT_CATEGORIES.length - completedJudgmentCount
            + (estimatedWeeklyWage > 0 ? 0 : 1),
        },
        {
          id: "risk",
          targetId: "report-section-risks",
          label: "Risk",
          detail: selectedRiskAssessments.length > 0
            ? `${riskSignalCount > 0 ? riskSignalCount : "No"} specific risk ${riskSignalCount === 1 ? "signal" : "signals"} logged`
            : "Record a risk stance",
          complete: selectedRiskAssessments.length > 0,
          decisionsRemaining: selectedRiskAssessments.length > 0 ? 0 : 1,
        },
        {
          id: "final",
          targetId: "report-section-file",
          label: "Final review",
          detail: canSubmit
            ? "Ready to file"
            : `${structuredValidation.errors.length} issue${structuredValidation.errors.length === 1 ? "" : "s"} to resolve`,
          complete: canSubmit,
          decisionsRemaining: 0,
        },
      ];
    }

    return [
      {
        id: "final",
        targetId: "report-section-file",
        label: "Final review",
        detail: privateNarrativeNote
          ? `${t(`convictions.${conviction}`)} conviction selected`
          : "Add your private note and check conviction",
        complete: canSubmit,
        decisionsRemaining: privateNarrativeNote ? 0 : 1,
      },
    ];
  })();
  const workflow = resolveReportWorkflow(sectionNavigatorItems, reviewSectionId);
  const requiredSectionCount = workflow.requiredSteps;
  const completedSectionCount = workflow.completedRequiredSteps;
  const decisionsRemaining = workflow.decisionsRemaining;
  const nextSectionTask = sectionNavigatorItems.find(
    (item) => item.id === workflow.nextRequiredStepId,
  );
  const activeSectionId = workflow.activeStepId;
  const isWorkflowSectionActive = (sectionId: string) => activeSectionId === sectionId;
  const openWorkflowSection = (item: SectionNavigatorItem) => {
    if (!canOpenReportWorkflowStep(item, workflow.nextRequiredStepId)) return;
    setReviewSectionId(item.id === workflow.nextRequiredStepId ? null : item.id);
    window.requestAnimationFrame(() => {
      document.getElementById(item.targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <GameLayout>
      <div className="relative min-h-full p-4 sm:p-6 lg:p-8 [&_.text-zinc-500]:text-zinc-400 [&_.text-zinc-600]:text-zinc-400">
        <ScreenBackground src="/images/backgrounds/reports-desk.png" opacity={0.82} />
        <div className="relative z-10 mx-auto max-w-6xl">
        <button
          onClick={handleBack}
          className="mb-4 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          aria-label="Back to player profile"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {t("backToProfile")}
        </button>

        <div className="mb-5 flex items-center gap-4 rounded-2xl border border-white/10 bg-[#10151b]/95 p-5 shadow-xl shadow-black/20 sm:p-6">
          <PlayerAvatar
            playerId={player.id}
            nationality={player.nationality}
            size={64}
          />
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Scouting judgment</p>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t("title")}</h1>
            <p className="text-sm text-zinc-400 mt-1">
              {player.firstName} {player.lastName} — {player.position}, Age {player.age}
              {club ? ` — ${club.name}` : ""}
            </p>
          </div>
        </div>

        <section className="sticky top-2 z-30 mb-4" aria-label="Report progress">
          <div className="rounded-2xl border border-white/10 bg-[#0d1216]/95 p-3 shadow-2xl shadow-black/45 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  Report progress
                </p>
                <Badge variant="outline" className={decisionsRemaining === 0 ? "border-emerald-400/30 text-emerald-100" : "border-amber-400/30 text-amber-100"}>
                  {decisionsRemaining} decision{decisionsRemaining === 1 ? "" : "s"} remaining
                </Badge>
                <span className="text-xs text-zinc-400">
                  {completedSectionCount}/{requiredSectionCount} ready
                </span>
                {previousReport && (
                  <span className="text-xs text-zinc-400">
                    Revision {(previousReport.revision ?? 1) + 1}
                  </span>
                )}
              </div>
              {nextSectionTask && activeSectionId !== nextSectionTask.id && (
                <button
                  type="button"
                  onClick={() => openWorkflowSection(nextSectionTask)}
                  className="min-h-10 rounded-lg border border-emerald-400/35 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/50 hover:bg-emerald-400/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
                >
                  Continue: {nextSectionTask.label}
                </button>
              )}
            </div>

            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Report steps">
              {sectionNavigatorItems.map((item) => {
                const Icon = item.complete ? CheckCircle2 : Circle;
                const canOpen = canOpenReportWorkflowStep(item, workflow.nextRequiredStepId);
                const active = item.id === activeSectionId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    onClick={() => openWorkflowSection(item)}
                    disabled={!canOpen}
                    aria-selected={active}
                    aria-current={active ? "step" : undefined}
                    aria-label={`${item.label}. ${item.detail}`}
                    className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 sm:gap-2 sm:px-3 ${
                      active
                        ? "border-emerald-300/55 bg-emerald-400/12 text-emerald-50"
                        : item.complete
                          ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200"
                          : "border-white/10 bg-white/[0.025] text-zinc-300 hover:border-white/20"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <Icon size={14} aria-hidden="true" />
                    <span className="sm:hidden">
                      {item.id === "case" ? "Case" : item.id === "final" ? "Review" : item.label}
                    </span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                );
              })}
            </div>
            {sectionNavigatorItems.find((item) => item.id === activeSectionId) && (
              <p className="mt-2 text-[11px] leading-4 text-zinc-400" aria-live="polite">
                {sectionNavigatorItems.find((item) => item.id === activeSectionId)?.detail}
              </p>
            )}
          </div>
        </section>

        {preparedWorkItem && (
          <details
            className="group mb-5 rounded-xl border border-sky-400/20 bg-sky-400/[0.07] px-4 py-3"
            data-testid="prepared-report-work"
          >
            <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
              <span>{preparedWorkItem.freshObservationIds.length} prepared evidence item{preparedWorkItem.freshObservationIds.length === 1 ? "" : "s"}</span>
              <span className="text-[10px] uppercase tracking-wider text-sky-300 group-open:hidden">Review</span>
              <span className="hidden text-[10px] uppercase tracking-wider text-sky-300 group-open:inline">Hide</span>
            </summary>
            <div className="mt-3 border-t border-sky-300/15 pt-3" aria-labelledby="prepared-report-work-heading">
              <h2 id="prepared-report-work-heading" className="text-sm font-bold text-white">
                {player.firstName} {player.lastName} is prepped for filing
              </h2>
              <p className="mt-2 text-xs leading-5 text-zinc-200">
                Your organized evidence adds +{preparedWorkItem.preparationQualityPoints} craft support and {formatPercent(preparedWorkItem.preparationQualityBonus)} stronger preparation to this report.
              </p>
              <p className="mt-2 text-[11px] leading-5 text-zinc-400">
                Prepared in S{preparedWorkItem.createdSeason} W{preparedWorkItem.createdWeek}. You still choose the verdict and file it yourself.
              </p>
            </div>
          </details>
        )}

        {isYouthCase && !conciseOpeningMode && (
          <details
            id="report-section-brief"
            open={isWorkflowSectionActive("brief") || isWorkflowSectionActive("case") || isWorkflowSectionActive("risk")}
            className="group mb-6 rounded-2xl border border-emerald-400/25 bg-[linear-gradient(145deg,rgba(16,185,129,0.11),rgba(16,21,27,0.98)_44%)] shadow-xl shadow-black/20"
            aria-labelledby="academy-case-heading"
          >
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 sm:px-6 [&::-webkit-details-marker]:hidden">
              <div>
                <span className="text-sm font-semibold text-white">Brief, fit, and professional context</span>
                <span className="mt-1 block text-xs text-zinc-400">Audience, pathway, primary risk, and the evidence framing the room will hear.</span>
              </div>
              <Badge variant={sectionNavigatorItems.find((step) => step.id === "brief")?.complete ? "success" : "warning"}>
                {sectionNavigatorItems.find((step) => step.id === "brief")?.complete ? "Complete" : "Open decisions"}
              </Badge>
            </summary>
            <div className="border-t border-white/10 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Academy placement case</p>
                <h2 id="academy-case-heading" className="mt-1 text-xl font-bold text-white">Answer a real club need</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-300">
                  The academy director will judge whether your case fits the pathway, budget, evidence, and risk appetite.
                </p>
              </div>
              {activeBrief && (
                <Badge variant="warning" className="w-fit text-[10px]">
                  Pressure {activeBrief.competitionPressure}/100
                </Badge>
              )}
            </div>

            {matchingBriefs.length === 0 ? (
              <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                No open brief currently accepts this player&apos;s age. Keep observing or wait for the next academy request.
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div
                  className="space-y-5"
                  hidden={!isWorkflowSectionActive("brief")}
                >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,0.65fr))]">
                  <label className="text-xs font-medium text-zinc-300">
                    Recruitment brief
                    <select
                      value={briefId}
                      onChange={(event) => {
                        setIsDirty(true);
                        setBriefId(event.target.value);
                      }}
                      className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-[#0b0f13] px-3 text-sm text-white outline-none focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/40"
                    >
                      {matchingBriefs.map((brief) => (
                        <option key={brief.id} value={brief.id}>
                          {gameState.clubs[brief.clubId]?.name ?? "Unknown club"} — {brief.requiredPositions.join("/")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Brief closes</p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      S{activeBrief?.expiresSeason} W{activeBrief?.expiresWeek}
                    </p>
                    {verificationDeadline && activeBrief && (
                      <p className="mt-1 text-[10px] leading-4 text-zinc-400">
                        Decision window S{verificationDeadline.season} W{verificationDeadline.week}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Wage ceiling</p>
                    <p className="mt-1 text-sm font-semibold text-white">£{activeBrief?.weeklyWageBudget.toLocaleString()}/wk</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Risk appetite</p>
                    <p className="mt-1 text-sm font-semibold capitalize text-white">{activeBrief?.riskTolerance}</p>
                  </div>
                </div>

                {activeRecruitmentIdentity && activeBrief && (
                  <div
                    className="rounded-xl border border-sky-400/20 bg-sky-400/[0.07] p-4"
                    data-testid="recruitment-identity-briefing"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">
                      Recruitment room identity
                    </p>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{activeRecruitmentIdentity.label}</p>
                        <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-300">
                          This club will weight {activeBrief.developmentPriority.replace(/([A-Z])/g, " $1").toLowerCase()} more heavily. Evidence, fit, price, risk, and your judgment still matter; the same case can land differently in another recruitment room.
                        </p>
                        <dl className="mt-3 flex flex-wrap gap-2 text-[11px] text-sky-100">
                          <div className="rounded-full border border-sky-300/20 bg-black/20 px-2.5 py-1">
                            <dt className="sr-only">Evidence preference</dt>
                            <dd className="capitalize">{activeRecruitmentIdentity.doctrine.evidencePreference} evidence</dd>
                          </div>
                          <div className="rounded-full border border-sky-300/20 bg-black/20 px-2.5 py-1">
                            <dt className="sr-only">Senior age window</dt>
                            <dd>Ages {activeRecruitmentIdentity.doctrine.preferredSeniorAgeRange.join("-")}</dd>
                          </div>
                          <div className="rounded-full border border-sky-300/20 bg-black/20 px-2.5 py-1">
                            <dt className="sr-only">Pathway patience</dt>
                            <dd>Pathway patience {activeRecruitmentIdentity.doctrine.pathwayPatience}/100</dd>
                          </div>
                          <div className="rounded-full border border-sky-300/20 bg-black/20 px-2.5 py-1">
                            <dt className="sr-only">Decision influence</dt>
                            <dd>{activeRecruitmentIdentity.doctrine.managerInfluence >= activeRecruitmentIdentity.doctrine.directorInfluence ? "Manager-led" : "Recruitment-led"}</dd>
                          </div>
                        </dl>
                      </div>
                      <Badge variant="outline" className="w-fit shrink-0 text-[10px]">
                        One lens, not the verdict
                      </Badge>
                    </div>
                  </div>
                )}

                </div>

                <div
                  className="space-y-5"
                  hidden={!isWorkflowSectionActive("case")}
                >

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="text-xs font-medium text-zinc-300 md:col-span-2">
                    Recruitment need
                    <p className="mt-2 min-h-20 rounded-lg border border-white/10 bg-black/25 p-3 text-sm leading-6 text-white">
                      {recruitmentNeed}
                    </p>
                    <span className="mt-1 block text-[11px] leading-4 text-zinc-400">
                      This comes from the selected club brief, so the report answers the actual assignment.
                    </span>
                  </div>
                  <label className="text-xs font-medium text-zinc-300">
                    Intended audience
                    <select
                      value={intendedAudience}
                      onChange={(event) => {
                        setIsDirty(true);
                        setIntendedAudience(event.target.value as StructuredReportInput["intendedAudience"]);
                      }}
                      className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-[#0b0f13] px-3 text-sm text-white"
                    >
                      <option value="academyDirector">Academy director</option>
                      <option value="headOfRecruitment">Head of recruitment</option>
                      <option value="sportingDirector">Sporting director</option>
                      <option value="client">Independent client</option>
                    </select>
                  </label>
                  <label className="text-xs font-medium text-zinc-300">
                    Projected role
                    <select
                      value={projectedRole}
                      onChange={(event) => {
                        setIsDirty(true);
                        setProjectedRole(event.target.value as PlayerRole);
                      }}
                      className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-[#0b0f13] px-3 text-sm capitalize text-white"
                    >
                      {compatibleRoles.map((role) => (
                        <option key={role} value={role}>{attrLabel(role)}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Recommended next step</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {([
                      ["monitor", "Monitor", "Preserve optionality and seek more evidence."],
                      ["inviteForTrial", "Invite for trial", "Ask the club to test the weakest part of the case."],
                      ["offerAcademyPlace", "Offer academy place", "Stand behind a signing recommendation now."],
                    ] as const).map(([value, label, description]) => (
                      <div key={value} className="relative">
                        <input
                          id={`recommended-action-${value}`}
                          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                          type="radio"
                          name="recommended-action"
                          value={value}
                          checked={recommendedAction === value}
                          onChange={() => {
                            setIsDirty(true);
                            setRecommendedAction(value);
                          }}
                        />
                        <label
                          htmlFor={`recommended-action-${value}`}
                          className={`block min-h-16 cursor-pointer rounded-xl border p-3 text-left transition hover:border-white/20 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-400 ${
                            recommendedAction === value
                              ? "border-emerald-400/55 bg-emerald-400/10"
                              : "border-white/10 bg-black/20"
                          }`}
                        >
                          <span className="block text-sm font-semibold text-white">{label}</span>
                          <span className="mt-1 block text-xs leading-4 text-zinc-400">{description}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>

                <section id="report-section-framing" data-testid="report-presentation-room" className="scroll-mt-28 overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#0d1519] shadow-[0_22px_70px_-45px_rgba(34,211,238,0.6)]" aria-labelledby="presentation-room-title">
                  <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_42%)] p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Boardroom step</p>
                        <h3 id="presentation-room-title" className="mt-1 text-lg font-bold text-white">Choose how you make the case</h3>
                        <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400">
                          Framing changes what the room notices. It cannot improve the underlying evidence, and every approach gives something up.
                        </p>
                      </div>
                      <Badge variant="outline" className="w-fit border-cyan-400/25 bg-cyan-400/5 text-cyan-200">Room influence: limited</Badge>
                    </div>
                  </div>

                  <fieldset className="p-3 sm:p-5">
                    <legend className="sr-only">Presentation approach</legend>
                    <div className="grid gap-3 lg:grid-cols-3">
                      {PRESENTATION_APPROACHES.map((approach) => {
                        const selected = presentationApproach === approach.id;
                        const preview = activeBrief ? evaluatePresentationStrategy({
                          approach: approach.id,
                          intendedAudience,
                          brief: activeBrief,
                          contextCount: contexts.length,
                          hypothesisCount: draftedEvidenceCount,
                          riskFactorCount: selectedRiskAssessments.filter((risk) => risk.id !== "noMaterialSignal").length,
                          roleMatch: !activeBrief.preferredRole || activeBrief.preferredRole === projectedRole,
                        }) : null;
                        const alignment = preview?.alignmentAdjustment ?? 0;
                        const roomRead = describePresentationRoom(alignment);
                        return (
                          <label
                            key={approach.id}
                            className={`relative min-h-48 cursor-pointer rounded-xl border p-4 text-left transition focus-within:outline-none focus-within:ring-2 focus-within:ring-cyan-300 ${
                              selected
                                ? "border-cyan-300/60 bg-cyan-300/10 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.12)]"
                                : "border-white/10 bg-black/20 hover:border-white/25"
                            }`}
                          >
                            <input
                              type="radio"
                              name="youth-presentation-approach"
                              value={approach.id}
                              checked={selected}
                              onChange={() => {
                                setIsDirty(true);
                                setPresentationApproach(approach.id);
                              }}
                              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                            />
                            <span className="flex items-start justify-between gap-3">
                              <span>
                                <span className="block text-sm font-bold text-white">{approach.label}</span>
                                <span className="mt-1 block text-[11px] leading-4 text-zinc-400">{approach.roomLine}</span>
                              </span>
                              <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                                roomRead.sentiment === "positive"
                                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                                  : roomRead.sentiment === "negative"
                                  ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                                  : "border-white/10 bg-white/5 text-zinc-400"
                              }`}>
                                {roomRead.label}
                              </span>
                            </span>
                            <span className="mt-4 block rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] p-2.5 text-[10px] leading-4 text-emerald-100/80">
                              <strong className="text-emerald-300">Emphasis:</strong> {approach.emphasis}
                            </span>
                            <span className="mt-2 block rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-2.5 text-[10px] leading-4 text-amber-100/75">
                              <strong className="text-amber-300">Tradeoff:</strong> {approach.tradeoff}
                            </span>
                            <span className="mt-3 block text-[10px] leading-4 text-zinc-500">
                              {roomRead.description}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {activeBrief && (() => {
                      const selectedImpact = evaluatePresentationStrategy({
                        approach: presentationApproach,
                        intendedAudience,
                        brief: activeBrief,
                        contextCount: contexts.length,
                        hypothesisCount: draftedEvidenceCount,
                        riskFactorCount: selectedRiskAssessments.filter((risk) => risk.id !== "noMaterialSignal").length,
                        roleMatch: !activeBrief.preferredRole || activeBrief.preferredRole === projectedRole,
                      });
                      const selectedRoomRead = describePresentationRoom(
                        selectedImpact.alignmentAdjustment,
                      );
                      return (
                        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4" aria-live="polite">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-white">Room read: {selectedImpact.label}</p>
                            <span className="text-xs font-bold text-cyan-200">{selectedRoomRead.label}</span>
                          </div>
                          <ul className="mt-2 grid gap-1 text-[11px] leading-4 text-zinc-400 sm:grid-cols-2">
                            {selectedImpact.reasons.slice(0, 4).map((reason) => <li key={reason} className="flex gap-2"><span className="text-cyan-300">•</span><span>{reason}</span></li>)}
                          </ul>
                        </div>
                      );
                    })()}
                  </fieldset>
                </section>

                <div id="report-section-judgments" className="scroll-mt-28 grid gap-3 lg:grid-cols-3">
                  {JUDGMENT_CATEGORIES.map((category) => {
                    const categoryCards = initialAssessmentCards.filter((card) =>
                      getEvidenceClaimOptions(card)[0]?.category === category,
                    );
                    const selectedCard = categoryCards.find(
                      (card) => card.id === categoryDrafts[category].evidenceCardId,
                    );
                    const claimOptions = selectedCard ? getEvidenceClaimOptions(selectedCard) : [];
                    const unknownOptions = categoryDrafts[category].status === "assessed" && selectedCard
                      ? [
                          ...FORMAL_CATEGORY_UNKNOWN_OPTIONS[category],
                          ...getEvidenceUnknownOptions(selectedCard),
                        ]
                      : FORMAL_CATEGORY_UNKNOWN_OPTIONS[category];
                    return (
                      <fieldset key={category} className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <legend className="px-1 text-sm font-semibold text-white">{JUDGMENT_LABELS[category]}</legend>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {(["assessed", "notAssessed"] as const).map((status) => (
                            <label
                              key={status}
                              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-center text-xs font-semibold transition focus-within:outline focus-within:outline-2 focus-within:outline-emerald-300 ${
                                categoryDrafts[category].status === status
                                  ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-100"
                                  : "border-white/10 bg-black/20 text-zinc-300"
                              } ${status === "assessed" && categoryCards.length === 0 ? "cursor-not-allowed opacity-45" : ""}`}
                            >
                              <input
                                type="radio"
                                name={`category-status-${category}`}
                                value={status}
                                checked={categoryDrafts[category].status === status}
                                disabled={status === "assessed" && categoryCards.length === 0}
                                onChange={() => updateCategoryDraft(category, {
                                  status,
                                  evidenceCardId: "",
                                  claimOptionId: "",
                                  unknownOptionId: "",
                                  confidence: status === "notAssessed" ? "low" : categoryDrafts[category].confidence,
                                })}
                                className="sr-only"
                              />
                              {status === "assessed" ? "Make a claim" : "Leave unassessed"}
                            </label>
                          ))}
                        </div>

                        {categoryDrafts[category].status === "unselected" && (
                          <p className="mt-3 rounded-lg border border-dashed border-white/10 p-3 text-[11px] leading-5 text-zinc-400">
                            Decide whether the current evidence supports this judgment or whether it should stay explicitly unassessed.
                          </p>
                        )}

                        {categoryDrafts[category].status === "assessed" && (
                          <div className="mt-3 space-y-3">
                            <label className="block text-[11px] font-medium text-zinc-400">
                              Supporting cue
                              <select
                                value={categoryDrafts[category].evidenceCardId}
                                onChange={(event) => updateCategoryDraft(category, {
                                  evidenceCardId: event.target.value,
                                  claimOptionId: "",
                                  unknownOptionId: "",
                                })}
                                className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-[#0b0f13] px-2 text-xs text-white"
                              >
                                <option value="">Choose saved evidence</option>
                                {categoryCards.map((card) => (
                                  <option key={card.id} value={card.id}>{card.minute}&apos; {card.summary}</option>
                                ))}
                              </select>
                            </label>
                            {selectedCard && (
                              <fieldset className="space-y-2">
                                <legend className="text-[11px] font-medium text-zinc-400">Interpretation</legend>
                                {claimOptions.map((option) => (
                                  <label key={option.id} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-white/10 p-2 text-[11px] leading-4 text-zinc-300 focus-within:outline focus-within:outline-2 focus-within:outline-emerald-300">
                                    <input
                                      type="radio"
                                      name={`category-claim-${category}`}
                                      checked={categoryDrafts[category].claimOptionId === option.id}
                                      onChange={() => updateCategoryDraft(category, { claimOptionId: option.id })}
                                      className="mt-0.5 h-4 w-4 accent-emerald-500"
                                    />
                                    <span><strong className="text-white">{option.label}:</strong> {option.statement}</span>
                                  </label>
                                ))}
                              </fieldset>
                            )}
                            <label className="block text-[11px] font-medium text-zinc-400">
                              Confidence
                              <select
                                value={categoryDrafts[category].confidence}
                                onChange={(event) => updateCategoryDraft(category, { confidence: event.target.value as CategoryDraft["confidence"] })}
                                className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-[#0b0f13] px-2 text-xs capitalize text-white"
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </select>
                            </label>
                          </div>
                        )}

                        {categoryDrafts[category].status !== "unselected" && (
                          <fieldset className="mt-3 space-y-2">
                            <legend className="text-[11px] font-medium text-zinc-400">What remains unknown</legend>
                            {unknownOptions.map((option) => (
                              <label key={option.id} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-white/10 p-2 text-[11px] leading-4 text-zinc-300 focus-within:outline focus-within:outline-2 focus-within:outline-amber-300">
                                <input
                                  type="radio"
                                  name={`category-unknown-${category}`}
                                  checked={categoryDrafts[category].unknownOptionId === option.id}
                                  onChange={() => updateCategoryDraft(category, { unknownOptionId: option.id })}
                                  className="mt-0.5 h-4 w-4 accent-amber-400"
                                />
                                <span><strong className="text-amber-100">{option.label}</strong><span className="mt-0.5 block text-zinc-400">{option.statement}</span></span>
                              </label>
                            ))}
                          </fieldset>
                        )}
                      </fieldset>
                    );
                  })}
                </div>

                </div>

                <fieldset
                  id="report-section-risks"
                  hidden={!isWorkflowSectionActive("risk")}
                  className="scroll-mt-28 rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <legend className="px-1 text-sm font-semibold text-white">Risk posture</legend>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Keep a concern untested, or flag it as observed only when you can attach a saved cue.
                  </p>
                  <label className={`mt-3 flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 focus-within:outline focus-within:outline-2 focus-within:outline-emerald-300 ${
                    riskDrafts.noMaterialSignal
                      ? "border-emerald-400/40 bg-emerald-400/[0.08]"
                      : "border-white/10 bg-black/20"
                  }`}>
                    <input
                      type="checkbox"
                      checked={Boolean(riskDrafts.noMaterialSignal)}
                      onChange={(event) => {
                        setIsDirty(true);
                        setRiskDrafts(event.target.checked
                          ? { noMaterialSignal: { status: "noSignal" } }
                          : {});
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
                    />
                    <span>
                      <strong className="block text-sm text-white">Make no specific risk claim</strong>
                      <span className="mt-0.5 block text-[11px] leading-4 text-zinc-400">
                        No material concern is supported yet; the report will preserve its separate uncertainties.
                      </span>
                    </span>
                  </label>
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    {YOUTH_REPORT_RISK_OPTIONS.filter((option) => option.id !== "noMaterialSignal").map((option) => {
                      const riskDraft = riskDrafts[option.id];
                      return (
                        <div key={option.id} className={`grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center ${riskDraft ? "border-amber-400/35 bg-amber-400/[0.07]" : "border-white/10 bg-black/20"}`}>
                          <div>
                            <p className="text-sm font-semibold text-white">{option.label}</p>
                            <p className="mt-1 text-[11px] leading-4 text-zinc-400">{option.description}</p>
                          </div>
                          <select
                            aria-label={`${option.label} assessment`}
                            value={riskDraft?.status ?? ""}
                            disabled={Boolean(riskDrafts.noMaterialSignal)}
                            onChange={(event) => {
                              setIsDirty(true);
                              const status = event.target.value as "" | "observed" | "untested";
                              setRiskDrafts((current) => {
                                const next = { ...current };
                                delete next.noMaterialSignal;
                                if (!status) delete next[option.id];
                                else next[option.id] = { status };
                                return next;
                              });
                            }}
                            className="min-h-11 w-full rounded-lg border border-white/10 bg-[#0b0f13] px-2 text-xs text-white disabled:opacity-40"
                          >
                            <option value="">Not included</option>
                            <option value="untested">Keep as untested</option>
                            <option value="observed">Flag from evidence</option>
                          </select>
                          {riskDraft?.status === "observed" && (
                            <label className="block text-[11px] font-medium text-zinc-400 sm:col-span-2">
                              Supporting cue
                              <select
                                value={riskDraft.evidenceCardId ?? ""}
                                onChange={(event) => {
                                  setIsDirty(true);
                                  setRiskDrafts((current) => ({
                                    ...current,
                                    [option.id]: { status: "observed", evidenceCardId: event.target.value || undefined },
                                  }));
                                }}
                                className="mt-1 min-h-11 w-full rounded-lg border border-white/10 bg-[#0b0f13] px-2 text-xs text-white"
                              >
                                <option value="">Choose saved evidence</option>
                                {initialAssessmentCards.map((card) => (
                                  <option key={card.id} value={card.id}>{card.minute}&apos; {card.summary}</option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>

                <div
                  id="report-section-terms"
                  hidden={!isWorkflowSectionActive("case")}
                  className="scroll-mt-28 grid gap-4 md:grid-cols-2"
                >
                  <label className="text-xs font-medium text-zinc-300">
                    Estimated weekly wage
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={estimatedWeeklyWage}
                      onChange={(event) => {
                        setIsDirty(true);
                        setEstimatedWeeklyWage(Number(event.target.value));
                      }}
                      className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-emerald-400/50"
                    />
                    {activeBrief && estimatedWeeklyWage > activeBrief.weeklyWageBudget && (
                      <span className="mt-1 block text-[11px] text-amber-300">Above the club&apos;s stated ceiling.</span>
                    )}
                  </label>
                  <label className="text-xs font-medium text-zinc-300">
                    Alternative target
                    <select
                      value={alternativePlayerId}
                      onChange={(event) => {
                        setIsDirty(true);
                        setAlternativePlayerId(event.target.value);
                      }}
                      className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-[#0b0f13] px-3 text-sm text-white"
                    >
                      <option value="">No credible alternative yet</option>
                      {alternativeCandidates.map((candidate) => (
                        <option key={candidate.player.id} value={candidate.player.id}>
                          {candidate.player.firstName} {candidate.player.lastName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {!conciseOpeningMode && !structuredValidation.valid && isWorkflowSectionActive("final") && (
                  <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
                    <p className="text-xs font-semibold text-amber-200">Complete the report before filing:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-100/80">
                      {structuredValidation.errors.map((error) => <li key={error}>{error}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
            </div>
          </details>
        )}

        {observations.length === 0 && (
          <div role="alert" className="mb-6 flex flex-col gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm leading-5 text-red-200">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{t("noObservations")} Return to the dossier and choose the context that can answer the open question.</span>
            </p>
            <Button className="min-h-11 shrink-0" variant="outline" onClick={handleBack}>
              Plan observation
            </Button>
          </div>
        )}
        {observations.length > 0 && previousReport && freshObservationIds.length === 0 && (
          <div role="status" className="mb-6 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
            <p className="flex items-start gap-2 text-sm leading-5 text-amber-200">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              This case already uses every available observation. Gather evidence in another match,
              training visit, video review, or meaningful context before filing revision {(previousReport.revision ?? 1) + 1}.
              Rewriting the same evidence does not earn reputation or performance credit.
            </p>
          </div>
        )}
        {analystReview && (
          <section
            aria-labelledby="analyst-review-heading"
            className="mb-6 rounded-xl border border-violet-400/30 bg-violet-400/10 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">
                  Analyst review ready
                </p>
                <h2 id="analyst-review-heading" className="mt-1 text-sm font-bold text-white">
                  {analystReview.analystName} · {formatAnalystEvidenceCategory(analystReview.evidenceCategory)}
                </h2>
              </div>
              <Badge variant="outline" className="border-violet-300/30 text-violet-200">
                +{analystReview.craftQualityBonus} craft · one use
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-violet-50/90">{analystReview.critique}</p>
            <p className="mt-3 text-xs leading-5 text-violet-100/70">
              Method bias — {formatAnalystReviewBias(analystReview.bias)}: {analystReview.biasDisclosure}
            </p>
            <p className="mt-2 text-[11px] text-zinc-400">
              The visible craft band includes this review. It is consumed exactly once when this eligible report is filed.
            </p>
          </section>
        )}

        <div id="report-section-evidence" className="scroll-mt-28 space-y-6">
          {conciseOpeningMode ? (
            <div data-tutorial-id="report-conviction" className="space-y-4">
              <InitialAssessmentBuilder
                key={canonicalPlayerId}
                cards={initialAssessmentCards}
                playerName={`${player.firstName} ${player.lastName}`}
                value={initialAssessmentInput}
                onChange={(nextValue) => {
                  setInitialAssessmentInput(nextValue);
                  setIsDirty(true);
                  if (nextValue) {
                    useTutorialStore.getState().completeMilestone("wroteReport");
                  }
                }}
              />
              <div
                className="sticky bottom-3 z-20 grid gap-3 rounded-2xl border border-white/10 bg-[#0d1216]/95 p-4 shadow-2xl shadow-black/45 backdrop-blur sm:grid-cols-[1fr_auto_auto] sm:items-center"
                data-tutorial-id="report-submit"
              >
                <p className={`text-sm ${canSubmit ? "text-emerald-200" : "text-amber-200"}`} aria-live="polite">
                  {canSubmit
                    ? "Your evidence, uncertainty, next test, and confidence are ready to file."
                    : initialAssessmentCards.length === 0
                      ? "Return to the observation and save at least one cue."
                      : "Complete the five assessment decisions to file this first read."}
                </p>
                <Button className="min-h-11" variant="outline" onClick={handleBack}>
                  {tc("cancel")}
                </Button>
                <Button className="min-h-11" onClick={handleSubmit} disabled={!canSubmit}>
                  <FileText size={14} className="mr-2" aria-hidden="true" />
                  File initial assessment
                </Button>
              </div>
            </div>
          ) : (
            <div hidden={isYouthCase && !isWorkflowSectionActive("final")}>
            <Card
              id="report-section-file"
              data-testid="report-final-review"
              data-tutorial-id="report-conviction"
              className={`scroll-mt-28 border ${qualityScoreBorder(displayQualityScore)} bg-[#10151b]/98 shadow-2xl shadow-black/25 lg:sticky lg:top-20 lg:z-20`}
            >
              <CardContent className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
                <div>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Final review</p>
                      <h2 className="mt-1 text-xl font-bold text-white">Check the case, then file it</h2>
                    </div>
                    <Badge
                      variant="outline"
                      aria-label={`Craft assessment: ${craftRead.label}`}
                      className={`${qualityScoreBorder(displayQualityScore)} ${qualityScoreColor(displayQualityScore)}`}
                    >
                      Craft: {craftRead.label}
                    </Badge>
                  </div>
                  {isYouthCase && (
                    <dl className="mb-4 grid gap-2 text-xs sm:grid-cols-2">
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <dt className="text-zinc-400">Club brief</dt>
                        <dd className="mt-1 font-semibold text-white">{activeBriefClub?.name ?? "No club selected"}</dd>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <dt className="text-zinc-400">Recommended action</dt>
                        <dd className="mt-1 font-semibold text-white">{attrLabel(recommendedAction)}</dd>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <dt className="text-zinc-400">Defended judgments</dt>
                        <dd className="mt-1 font-semibold text-white">{completedJudgmentCount}/{JUDGMENT_CATEGORIES.length}</dd>
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <dt className="text-zinc-400">Risk posture</dt>
                        <dd className="mt-1 font-semibold text-white">
                          {selectedRiskAssessments.some((risk) => risk.id === "noMaterialSignal")
                            ? "No specific signal claimed"
                            : `${riskSignalCount} signal${riskSignalCount === 1 ? "" : "s"} recorded`}
                        </dd>
                      </div>
                    </dl>
                  )}
                  {isYouthCase ? (
                    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">Filed recommendation</p>
                      <p className="mt-2 text-sm leading-6 text-zinc-100">
                        {effectiveSummary || "Complete the evidence judgments above to assemble the recommendation."}
                      </p>
                      <p className="mt-3 text-[11px] leading-5 text-zinc-400">
                        This recommendation reflects the evidence you selected, the uncertainties you left open, the role you projected, and the action you are prepared to defend in the recruitment room.
                      </p>
                    </div>
                  ) : (
                    <>
                      <label htmlFor="report-summary" className="text-sm font-semibold text-zinc-200">
                        Private scout&apos;s note
                      </label>
                      <p id="report-summary-help" className="mt-1 text-xs leading-5 text-zinc-400">
                        Keep any personal phrasing or nuance you want colleagues to read. The recommendation must still stand on the observations, strengths, concerns, and conviction recorded in the dossier.
                      </p>
                      <textarea
                        id="report-summary"
                        value={summary}
                        onChange={(event) => {
                          setIsDirty(true);
                          setSummary(event.target.value);
                        }}
                        aria-describedby="report-summary-help"
                        rows={5}
                        placeholder="Private wording for how you want this report to read"
                        className="mt-3 min-h-32 w-full resize-y rounded-xl border border-white/10 bg-black/25 p-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-400/40"
                      />
                    </>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Conviction</p>
                      <p className="mt-1 text-sm text-zinc-300">How much reputation belongs behind this call?</p>
                    </div>
                    <span className={`text-xs font-semibold ${canSubmit ? "text-emerald-300" : "text-amber-300"}`}>
                      {canSubmit ? "Ready to file" : "Needs judgment"}
                    </span>
                  </div>
                  <fieldset>
                    <legend className="sr-only">Report conviction</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {CONVICTION_KEYS.map((key) => {
                        const isDisabled = key === "tablePound" && remainingTablePounds <= 0;
                        return (
                          <div key={`decision-${key}`} className="relative">
                            <input
                              id={`report-conviction-${key}`}
                              className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                              type="radio"
                              name="report-conviction"
                              value={key}
                              checked={conviction === key}
                              disabled={isDisabled}
                              onChange={() => {
                                setIsDirty(true);
                                setConviction(key);
                                useTutorialStore.getState().completeMilestone("wroteReport");
                                playSFX("page-turn");
                              }}
                            />
                            <label
                              htmlFor={`report-conviction-${key}`}
                              className={`block min-h-12 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-400 ${
                                isDisabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:border-white/20"
                              } ${
                                conviction === key
                                  ? key === "tablePound"
                                    ? "border-red-400/60 bg-red-400/10 text-red-200"
                                    : "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
                                  : "border-white/10 bg-white/[0.025] text-zinc-300"
                              }`}
                            >
                              {t(`convictions.${key}`)}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>
                  {isTablePound && (
                    <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-xs leading-5 text-red-200">
                      This stakes meaningful reputation on the outcome. Use it only when the evidence deserves that risk.
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-zinc-400">
                    Table-pounds remaining this season: <span className="font-semibold text-white">{remainingTablePounds}</span>
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2" data-tutorial-id="report-submit">
                    <Button className="min-h-11" variant="outline" onClick={handleBack}>{tc("cancel")}</Button>
                    <Button
                      className={`min-h-11 ${isTablePound ? "bg-red-600 hover:bg-red-700" : ""}`}
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                    >
                      <FileText size={14} className="mr-2" aria-hidden="true" />
                      {previousReport ? `File revision ${(previousReport.revision ?? 1) + 1}` : t("submitReport")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
          )}

          <details id="report-dossier" className="group scroll-mt-24 rounded-2xl border border-white/10 bg-[#11161c]/95 p-4 sm:p-5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
              <div>
                <span className="text-sm font-semibold text-white">
                  {conciseOpeningMode ? "Optional evidence and expert depth" : isYouthCase ? "Scouting dossier" : "Scouting notes and supporting detail"}
                </span>
                <span className="mt-1 block text-xs text-zinc-400">
                  {conciseOpeningMode
                    ? "Open the deeper dossier only if you want to pressure-test the first read."
                    : isYouthCase
                      ? "Review the observation record, current ability ranges, context, and supporting detail behind your case."
                      : "Review observations, ability ranges, form, attributes, strengths, weaknesses, and character."}
                </span>
              </div>
              <span className="text-xs font-semibold text-emerald-300 group-open:hidden">
                {conciseOpeningMode ? "Open optional depth" : "Open evidence"}
              </span>
              <span className="hidden text-xs font-semibold text-emerald-300 group-open:inline">
                {conciseOpeningMode ? "Hide optional depth" : "Hide evidence"}
              </span>
            </summary>
            <div className="mt-5 space-y-6">
          {/* Observation summary */}
          <Card data-tutorial-id="report-observation-summary">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("observationSummary")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <div>
                <p className="text-xs text-zinc-500">{t("sessions")}</p>
                <p className="text-xl font-bold text-emerald-400">{observations.length}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">{t("attributesRead")}</p>
                <p className="text-xl font-bold">{merged.size}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">{t("contexts")}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {contexts.map((ctx) => (
                    <Badge key={ctx} variant="secondary" className="text-[10px] capitalize">
                      {ctx.replace(/([A-Z])/g, " $1").trim()}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ability Overview */}
          {draft && (draft.perceivedCAStars != null || draft.estimatedValue > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Ability Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-6">
                  {draft.perceivedCAStars != null && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1.5">Current Ability</p>
                      <StarRating rating={draft.perceivedCAStars} size="lg" />
                    </div>
                  )}
                  {draft.perceivedPARange && (
                    <div>
                      <Tooltip content="Estimated potential ceiling based on observed raw attributes and age profile" side="top">
                        <p className="text-xs text-zinc-500 mb-1.5 cursor-help underline decoration-dotted underline-offset-2">
                          Potential Range
                        </p>
                      </Tooltip>
                      <StarRatingRange
                        low={draft.perceivedPARange[0]}
                        high={draft.perceivedPARange[1]}
                        size="lg"
                      />
                    </div>
                  )}
                  {draft.estimatedValue > 0 && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1.5">Est. Market Value</p>
                      <p className="text-lg font-bold text-emerald-400">
                        {formatValue(draft.estimatedValue)}
                      </p>
                      {draft.estimatedValueRange && (
                        <p className="mt-1 text-xs text-zinc-500">
                          Plausible range {formatValue(draft.estimatedValueRange[0])}–{formatValue(draft.estimatedValueRange[1])}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {player.position === "GK" && player.age <= 20 && (
                  <p className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-200/80">
                    Youth Early Access keeps goalkeeper conclusions conservative: this report only claims observed general attributes and does not infer unobserved shot-stopping, handling, or command.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {draft && draft.comparisonSuggestions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Comparison Angles</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {draft.comparisonSuggestions.map((suggestion) => (
                    <li
                      key={suggestion}
                      className="flex items-start gap-2 text-sm leading-relaxed text-zinc-300"
                    >
                      <Lightbulb
                        size={14}
                        className="mt-0.5 shrink-0 text-amber-400"
                        aria-hidden="true"
                      />
                      <span>{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Current Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Current Form</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-3">
                <FormIndicator form={player.form} />
                <span className="text-xs text-zinc-500">
                  Recent performances are reflected in the valuation range.
                </span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Form can affect player valuation. Hot-form players may cost more.
              </p>
            </CardContent>
          </Card>

          {/* Attribute assessments */}
          {merged.size > 0 && (
            <Card data-tutorial-id="report-attributes">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t("attributeAssessments")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Array.from(assessmentsByDomain.entries()).map(([domain, attrs]) => (
                    <div key={domain}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 capitalize">
                        {domain}
                      </p>
                      <div className="space-y-1.5">
                        {attrs.map(([attr, reading]) => (
                          <div key={attr} className="flex items-center gap-3">
                            <span className="w-32 shrink-0 text-xs capitalize text-zinc-400">
                              {attrLabel(attr)}
                            </span>
                            <div className="flex-1 relative h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                              <div
                                className="absolute left-0 top-0 h-full rounded-full bg-emerald-500"
                                style={{ width: `${(reading.perceivedValue / 20) * 100}%` }}
                              />
                            </div>
                            <span className="w-10 shrink-0 text-right text-xs font-mono font-bold text-white">
                              {reading.perceivedValue}/20
                            </span>
                            <Tooltip
                              content="Confidence based on number and quality of observations for this attribute"
                              side="left"
                            >
                              <span
                                className={`shrink-0 text-xs cursor-help ${confidenceColor(reading.confidence)}`}
                              >
                                {Math.round(reading.confidence * 100)}% certainty
                              </span>
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Legacy descriptor controls remain available outside Youth Scout. */}
          {!isYouthCase && (
          <Card data-tutorial-id="report-strengths">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {t("strengths")} ({selectedStrengths.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200/80">
                Select up to {MAX_STRENGTHS} strengths from observed attributes. Removing a suggestion is allowed; adding one requires supporting evidence below.
              </div>
              {selectedStrengths.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedStrengths.map((s) => {
                    const claim = strengthClaimsByDescriptor.get(s);
                    return (
                      <div
                        key={s}
                        className="flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-2"
                      >
                        <span className="text-xs text-emerald-300">{s}</span>
                        {claim && (
                          <Badge variant="secondary" className="shrink-0 text-[10px] bg-emerald-500/20 text-emerald-400">
                            {claim.attributes.map(attrLabel).join(" + ")}
                          </Badge>
                        )}
                        <button
                          onClick={() => {
                            const option = strengthOptions.find((candidate) => candidate.descriptor === s);
                            if (option) {
                              toggleStrength(option);
                              return;
                            }
                            setIsDirty(true);
                            setSelectedStrengths((current) => current.filter((descriptor) => descriptor !== s));
                          }}
                          className="rounded p-0.5 text-emerald-300/70 transition hover:bg-emerald-500/20 hover:text-white"
                          aria-label={`Remove strength ${s}`}
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">
                  No standout strengths detected from observations.
                </p>
              )}
              {strengthOptions.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Evidence-backed options
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {strengthOptions.map((option) => {
                      const isSelected = selectedStrengths.includes(option.descriptor);
                      const blockedByWeakness = option.attributes.some((attribute) =>
                        selectedWeaknessAttributes.has(attribute)
                      ) && !isSelected;
                      const atLimit = selectedStrengths.length >= MAX_STRENGTHS && !isSelected;
                      return (
                        <button
                          key={option.descriptor}
                          onClick={() => toggleStrength(option)}
                          disabled={blockedByWeakness || atLimit}
                          className={`rounded-lg border px-3 py-3 text-left transition ${
                            isSelected
                              ? "border-emerald-500/60 bg-emerald-500/10"
                              : "border-[#27272a] bg-[#141414] hover:border-emerald-500/30"
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-sm font-medium ${isSelected ? "text-emerald-300" : "text-white"}`}>
                              {option.descriptor}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {option.attributes.map(attrLabel).join(" + ")}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {option.estimatedValue}/20 observed • {Math.round(option.confidence * 100)}% certainty
                          </p>
                          {blockedByWeakness && (
                            <p className="mt-1 text-[11px] text-amber-400">
                              Remove the weakness tag for this attribute first.
                            </p>
                          )}
                          {atLimit && !blockedByWeakness && (
                            <p className="mt-1 text-[11px] text-zinc-500">
                              Strength limit reached.
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {!isYouthCase && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {t("weaknesses")} ({selectedWeaknesses.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200/80">
                Select up to {MAX_WEAKNESSES} weaknesses from observed attributes. Unsupported concerns should stay out of the report.
              </div>
              {selectedWeaknesses.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedWeaknesses.map((w) => {
                    const claim = weaknessClaimsByDescriptor.get(w);
                    return (
                      <div
                        key={w}
                        className="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2"
                      >
                        <span className="text-xs text-red-300">{w}</span>
                        {claim && (
                          <Badge variant="secondary" className="shrink-0 text-[10px] bg-red-500/20 text-red-400">
                            {claim.attributes.map(attrLabel).join(" + ")}
                          </Badge>
                        )}
                        <button
                          onClick={() => {
                            const option = weaknessOptions.find((candidate) => candidate.descriptor === w);
                            if (option) {
                              toggleWeakness(option);
                              return;
                            }
                            setIsDirty(true);
                            setSelectedWeaknesses((current) => current.filter((descriptor) => descriptor !== w));
                          }}
                          className="rounded p-0.5 text-red-300/70 transition hover:bg-red-500/20 hover:text-white"
                          aria-label={`Remove weakness ${w}`}
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">
                  No notable weaknesses detected from observations.
                </p>
              )}
              {weaknessOptions.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Evidence-backed options
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {weaknessOptions.map((option) => {
                      const isSelected = selectedWeaknesses.includes(option.descriptor);
                      const blockedByStrength = option.attributes.some((attribute) =>
                        selectedStrengthAttributes.has(attribute)
                      ) && !isSelected;
                      const atLimit = selectedWeaknesses.length >= MAX_WEAKNESSES && !isSelected;
                      return (
                        <button
                          key={option.descriptor}
                          onClick={() => toggleWeakness(option)}
                          disabled={blockedByStrength || atLimit}
                          className={`rounded-lg border px-3 py-3 text-left transition ${
                            isSelected
                              ? "border-red-500/60 bg-red-500/10"
                              : "border-[#27272a] bg-[#141414] hover:border-red-500/30"
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-sm font-medium ${isSelected ? "text-red-300" : "text-white"}`}>
                              {option.descriptor}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {option.attributes.map(attrLabel).join(" + ")}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {option.estimatedValue}/20 observed • {Math.round(option.confidence * 100)}% certainty
                          </p>
                          {blockedByStrength && (
                            <p className="mt-1 text-[11px] text-amber-400">
                              Remove the strength tag for this attribute first.
                            </p>
                          )}
                          {atLimit && !blockedByStrength && (
                            <p className="mt-1 text-[11px] text-zinc-500">
                              Weakness limit reached.
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Character Assessment (F9) */}
          {!isYouthCase && player.personalityProfile && !player.personalityProfile.hiddenUntilRevealed && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Character Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Personality Type:</span>
                    <Tooltip content={ARCHETYPE_DESCRIPTIONS[player.personalityProfile.archetype]} side="top">
                      <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400 cursor-help underline decoration-dotted underline-offset-2">
                        {ARCHETYPE_LABELS[player.personalityProfile.archetype]}
                      </span>
                    </Tooltip>
                  </div>
                  {player.personalityProfile.revealedTraits.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {player.personalityProfile.revealedTraits.map((trait) => (
                        <Badge key={trait} variant="secondary" className="text-[10px] capitalize">
                          {trait.replace(/([A-Z])/g, " $1").trim()}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="rounded-lg border border-[#27272a] bg-[#141414] p-3">
                    <p className="text-xs font-semibold text-zinc-400 mb-2">Character Risk Assessment</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-zinc-500">Dressing Room: </span>
                        <span className={player.personalityProfile.dressingRoomImpact >= 2 ? "text-emerald-400" : player.personalityProfile.dressingRoomImpact <= -1 ? "text-red-400" : "text-zinc-300"}>
                          {player.personalityProfile.dressingRoomImpact >= 2 ? "Low Risk" : player.personalityProfile.dressingRoomImpact <= -1 ? "High Risk" : "Moderate"}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Form Stability: </span>
                        <span className={player.personalityProfile.formVolatility <= 0.3 ? "text-emerald-400" : player.personalityProfile.formVolatility >= 0.7 ? "text-red-400" : "text-amber-400"}>
                          {player.personalityProfile.formVolatility <= 0.3 ? "Stable" : player.personalityProfile.formVolatility >= 0.7 ? "Unpredictable" : "Variable"}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Retention: </span>
                        <span className={player.personalityProfile.transferWillingness <= 0.3 ? "text-emerald-400" : player.personalityProfile.transferWillingness >= 0.7 ? "text-red-400" : "text-amber-400"}>
                          {player.personalityProfile.transferWillingness <= 0.3 ? "Likely to Stay" : player.personalityProfile.transferWillingness >= 0.7 ? "Flight Risk" : "Moderate"}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Big Matches: </span>
                        <span className={player.personalityProfile.bigMatchModifier >= 1 ? "text-emerald-400" : player.personalityProfile.bigMatchModifier <= -1 ? "text-red-400" : "text-zinc-300"}>
                          {player.personalityProfile.bigMatchModifier >= 1 ? "Reliable" : player.personalityProfile.bigMatchModifier <= -1 ? "Concern" : "Average"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

            </div>
          </details>


          {/* Written summary */}
          <Card className="hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("scoutSummary")}</CardTitle>
            </CardHeader>
            <CardContent>
              {effectiveSummary.trim() ? (
                <div className="rounded-md border border-[#27272a] bg-[#141414] p-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {effectiveSummary}
                </div>
              ) : (
                <p className="text-xs text-zinc-600 italic">
                  Finish the case to prepare the recommendation for review.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Quality preview */}
          {observations.length > 0 && (
            <Card className="hidden">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp size={14} className="text-zinc-400" aria-hidden="true" />
                   Craft Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-6">
                  {/* Score circle */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div
                      className={`flex h-16 w-16 items-center justify-center rounded-full border-2 ${qualityScoreBorder(displayQualityScore)}`}
                    >
                      <span className={`text-2xl font-bold ${qualityScoreColor(displayQualityScore)}`}>
                        {displayQualityScore}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500">/ 100</span>
                  </div>

                  {/* Breakdown bars */}
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {(Object.keys(BREAKDOWN_LABELS) as Array<keyof QualityBreakdown>).map((key) => {
                      const { label, max } = BREAKDOWN_LABELS[key];
                      const value = qualityPreview.breakdown[key];
                      const pct = (value / max) * 100;
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 text-[11px] text-zinc-400 truncate">
                            {label}
                          </span>
                          <div className="flex-1 relative h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                            <div
                              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${qualityScoreBg(displayQualityScore)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-10 shrink-0 text-right text-[11px] font-mono text-zinc-400">
                            {value}/{max}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Improvement hints */}
                {qualityPreview.hints.length > 0 && (
                  <div className="mt-3 rounded-md border border-[#27272a] bg-[#141414] p-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 mb-1.5">
                      <Lightbulb size={12} aria-hidden="true" />
                      Tips to improve
                    </p>
                    <ul className="space-y-1">
                      {qualityPreview.hints.map((hint) => (
                        <li key={hint} className="text-[11px] text-zinc-400 leading-tight pl-3.5 relative">
                          <span className="absolute left-0 top-0 text-zinc-600" aria-hidden="true">
                            &bull;
                          </span>
                          {hint}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {equipmentReportQualityBonus + infrastructureReportQualityBonus > 0 && (
                  <p className="mt-2 text-[10px] text-emerald-500">
                    +{Math.round((equipmentReportQualityBonus + infrastructureReportQualityBonus) * 100)} points from infrastructure and equipment
                  </p>
                )}
                {insightReportQualityEffect && (
                  <p className="mt-1 text-[10px] text-amber-400">
                    +{insightReportQualityEffect.bonusPoints} points from The Verdict; consumed when this report is submitted
                  </p>
                )}

                <p className="mt-2 text-[10px] text-zinc-600 italic">
                  This grades report craft. Accuracy resolves later from the player&apos;s career.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Pricing Guidance (independent scouts only) */}
          {priceEstimate && (
            <details id="report-pricing" className="group rounded-2xl border border-emerald-500/20 bg-[#11161c]/95 p-4 sm:p-5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                <span>
                  <span className="text-sm font-semibold text-white">Optional pricing guidance</span>
                  <span className="mt-1 block text-xs text-zinc-400">
                    Review a market range without adding another required report decision.
                  </span>
                </span>
                <span className="text-xs font-semibold text-emerald-300 group-open:hidden">Review</span>
                <span className="hidden text-xs font-semibold text-emerald-300 group-open:inline">Hide</span>
              </summary>
            <Card className="mt-4 border-emerald-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <DollarSign size={14} className="text-emerald-400" aria-hidden="true" />
                  Price Estimate
                  <Badge
                    variant="outline"
                    className={`ml-auto text-[10px] ${
                      priceEstimate.marketTemperature === "hot" || priceEstimate.marketTemperature === "deadline"
                        ? "text-orange-400 border-orange-500/40"
                        : priceEstimate.marketTemperature === "cold"
                        ? "text-blue-400 border-blue-500/40"
                        : "text-zinc-400 border-zinc-500/40"
                    }`}
                  >
                    {priceEstimate.marketTemperature === "deadline" ? "Deadline day" : `${priceEstimate.marketTemperature} market`}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-[#27272a] bg-[#141414] p-2.5 text-center">
                    <p className="text-[10px] text-zinc-500 mb-1">Non-Exclusive</p>
                    <p className="text-lg font-bold text-emerald-400">{formatValue(priceEstimate.nonExclusive)}</p>
                  </div>
                  <div className="rounded-md border border-amber-500/20 bg-amber-950/10 p-2.5 text-center">
                    <p className="text-[10px] text-amber-400/70 mb-1">Exclusive</p>
                    <p className="text-lg font-bold text-amber-400">{formatValue(priceEstimate.exclusive)}</p>
                  </div>
                </div>

                {/* Range bar */}
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                    <span>{formatValue(priceEstimate.low)}</span>
                    <span>{formatValue(priceEstimate.high)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#27272a]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-amber-500 transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.round(((priceEstimate.nonExclusive - priceEstimate.low) / Math.max(1, priceEstimate.high - priceEstimate.low)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>

                {displayQualityScore < 40 && (
                  <p className="text-[10px] text-amber-400/80 italic">
                    Improve report craft to increase sale value
                  </p>
                )}
                <p className="text-[10px] text-zinc-600 italic">
                  Calibrated conviction &amp; stronger craft = higher sale price
                </p>
              </CardContent>
            </Card>
            </details>
          )}

          {/* System Fit compact display (first-team scouts only) */}
          {systemFit && (
            <Card className="border-blue-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Target size={14} className="text-blue-400" aria-hidden="true" />
                  System Fit
                  <span
                    className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      systemFit.overallFit >= 70
                        ? "bg-emerald-500/15 text-emerald-400"
                        : systemFit.overallFit >= 40
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-red-500/15 text-red-400"
                    }`}
                  >
                    {systemFit.overallFit}%
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Compact dimension bars */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {(
                    [
                      ["Position", systemFit.positionFit],
                      ["Role", systemFit.roleFit],
                      ["Tactical", systemFit.tacticalFit],
                      ["Age", systemFit.ageFit],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="w-14 shrink-0 text-[10px] text-zinc-500">{label}</span>
                      <div className="flex-1 h-1 rounded-full bg-[#27272a] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            value >= 70 ? "bg-emerald-500" : value >= 40 ? "bg-amber-500" : "bg-red-500"
                          }`}
                          style={{ width: `${value}%` }}
                        />
                      </div>
                      <span className={`w-8 text-right text-[10px] font-mono font-semibold ${
                        value >= 70 ? "text-emerald-400" : value >= 40 ? "text-amber-400" : "text-red-400"
                      }`}>
                        {value}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Top strengths & weaknesses */}
                <div className="flex gap-4 text-[11px] leading-tight">
                  {systemFit.fitStrengths.length > 0 && (
                    <div className="flex-1 min-w-0">
                      {systemFit.fitStrengths.slice(0, 2).map((s, i) => (
                        <p key={i} className="text-emerald-400 truncate">+ {s}</p>
                      ))}
                    </div>
                  )}
                  {systemFit.fitWeaknesses.length > 0 && (
                    <div className="flex-1 min-w-0">
                      {systemFit.fitWeaknesses.slice(0, 2).map((w, i) => (
                        <p key={i} className="text-red-400 truncate">- {w}</p>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submit */}
          <div className="hidden">
            <Button variant="ghost" onClick={handleBack}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={isTablePound ? "bg-red-600 hover:bg-red-700" : ""}
            >
              <FileText size={14} className="mr-2" />
              {t("submitReport")}
            </Button>
          </div>
        </div>
        </div>
      </div>
    </GameLayout>
  );
}
