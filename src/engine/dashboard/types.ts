export type DashboardPriorityCategory =
  | "required_action"
  | "deadline"
  | "opportunity"
  | "risk"
  | "career_story";

export type DashboardPrioritySeverity = "critical" | "high" | "medium" | "low";

export type DashboardPrioritySourceSystem =
  | "inbox"
  | "planner"
  | "reports"
  | "career"
  | "agency"
  | "relationships"
  | "rivals"
  | "scouting";

export type DashboardActionScreen =
  | "inbox"
  | "calendar"
  | "reportWriter"
  | "reportHistory"
  | "playerProfile"
  | "rivals"
  | "career"
  | "network"
  | "alumniDashboard"
  | "performance"
  | "agency"
  | "internationalView"
  | "npcManagement"
  | "youthScouting";

export type DashboardActionTarget =
  | {
      screen: "inbox";
      messageId?: string;
      decisionId?: string;
      narrativeEventId?: string;
      relatedId?: string;
    }
  | {
      screen: "calendar";
      week: number;
      season: number;
      playerId?: string;
      contactId?: string;
      briefId?: string;
      focusActivityType?: string;
    }
  | {
      screen: "reportWriter";
      playerId: string;
      briefId?: string;
      reportWorkItemId?: string;
    }
  | {
      screen: "reportHistory";
      reportId?: string;
      caseId?: string;
      decisionId?: string;
      deliveryId?: string;
      pendingListingReportId?: string;
      playerId?: string;
    }
  | {
      screen: "playerProfile";
      playerId: string;
    }
  | {
      screen: "rivals";
      campaignId?: string;
      opportunityId?: string;
      playerId?: string;
    }
  | {
      screen: "career";
      momentId?: string;
      reviewId?: string;
      focus?: "overview" | "skills" | "perks" | "moments" | "recovery";
    }
  | {
      screen: "network";
      contactId?: string;
      gossipId?: string;
      playerId?: string;
    }
  | {
      screen: "alumniDashboard";
      alumniRecordId?: string;
      playerId?: string;
      caseId?: string;
    }
  | {
      screen: "performance";
      metricId?: string;
      season?: number;
      reportId?: string;
    }
  | {
      screen: "agency";
      focus?:
        | "overview"
        | "infrastructure"
        | "assistants"
        | "clients"
        | "events"
        | "offices"
        | "legacy"
        | "strategy";
      clientId?: string;
      employeeId?: string;
      officeId?: string;
    }
  | {
      screen: "internationalView";
      countryId?: string;
      assignmentId?: string;
      playerId?: string;
    }
  | {
      screen: "npcManagement";
      scoutId?: string;
      delegationId?: string;
      focus?: "staff" | "delegation" | "coverage";
    }
  | {
      screen: "youthScouting";
      playerId?: string;
      caseId?: string;
      tournamentId?: string;
      focus?: "desk" | "pipeline" | "tournaments" | "alumni";
    };

export interface DashboardPriorityItem {
  id: string;
  category: DashboardPriorityCategory;
  severity: DashboardPrioritySeverity;
  title: string;
  explanation: string;
  consequence?: string;
  deadlineWeek?: number;
  relatedEntityIds: string[];
  sourceSystem: DashboardPrioritySourceSystem;
  actionLabel: string;
  actionTarget: DashboardActionTarget;
  outcomeExplanation?: OutcomeExplanation;
  fingerprint?: string;
  dismissible?: boolean;
  snoozable?: boolean;
  pinnable?: boolean;
}

export interface DashboardPriorityScoreFactor {
  factor:
    | "base_priority"
    | "must_resolve_before_advance"
    | "deadline_this_week"
    | "deadline_next_week"
    | "relationship_at_risk"
    | "player_significance"
    | "rival_active"
    | "scarce_opening"
    | "already_scheduled"
    | "career_stage_fit"
    | "pinned"
    | "viewed_this_week";
  score: number;
  note: string;
}

export type DashboardPriorityCollector =
  | "inbox"
  | "offered_decision"
  | "narrative_event"
  | "relationships"
  | "career"
  | "reports"
  | "planner"
  | "rivals";

export interface DashboardPriorityCandidate extends DashboardPriorityItem {
  canonicalKey: string;
  aliasKeys: string[];
  score: number;
  scoreBreakdown: DashboardPriorityScoreFactor[];
  collector: DashboardPriorityCollector;
  deadlineSeason?: number;
  dueInWeeks?: number | null;
  careerTrack?: DashboardCareerTrack;
  fingerprint?: string;
  outcomeExplanation?: OutcomeExplanation;
  dismissible?: boolean;
  snoozable?: boolean;
  pinnable?: boolean;
  mustResolve?: boolean;
}

export interface OutcomeExplanation {
  headline: string;
  causeLines: string[];
  affectedSystems: string[];
  relatedDecisionIds: string[];
  occurredWeek: number;
  season?: number;
  evidenceIds?: string[];
  confidence?: number;
  actionTarget?: DashboardActionTarget;
  neutral?: boolean;
}

export type DashboardInsightType =
  | "priority"
  | "storyline"
  | "relationship"
  | "market"
  | "world"
  | "performance";

export type DashboardInsightEvidenceBand = "thin" | "moderate" | "strong";

export interface DashboardInsight {
  id: string;
  type: DashboardInsightType;
  title: string;
  summary: string;
  confidence: number;
  evidenceIds: string[];
  suggestedAction?: DashboardActionTarget;
  generatedWeek: number;
  expiresWeek?: number;
  generatedSeason?: number;
  expiresSeason?: number;
  evidenceBand?: DashboardInsightEvidenceBand;
  fingerprint?: string;
  supportingExamples?: string[];
  cooldownWeeks?: number;
  outcomeExplanation?: OutcomeExplanation;
}

export interface DashboardReferencePoint {
  season: number;
  week: number;
}

export interface DashboardCareerThread {
  id: string;
  type: string;
  legacyRecordId?: string;
  primaryItemId?: string;
  relatedItemIds: string[];
  playerId?: string;
  alumniRecordId?: string;
  caseId?: string;
  decisionId?: string;
  reportId?: string;
  title: string;
  summary: string;
  whatHappened: string[];
  careerImpact?: string;
  originalVerdict?: string;
  significance?: number;
  tone?: "positive" | "neutral" | "negative";
  actionTarget?: DashboardActionTarget;
  evidenceIds: string[];
  lastUpdatedAt: DashboardReferencePoint;
  archived: boolean;
}

export interface DashboardCareerThreadLegacyRecord {
  id?: string;
  legacyRecordId?: string;
  primaryItemId?: string;
  relatedItemIds?: string[];
  playerId?: string;
  caseId?: string;
  decisionId?: string;
  reportId?: string;
  title?: string;
  summary?: string;
  whatHappened?: string | string[];
  careerImpact?: string;
  originalVerdict?: string;
  type?: string;
  alumniRecordId?: string;
  significance?: number;
  tone?: "positive" | "neutral" | "negative";
  actionTarget?: DashboardActionTarget;
  evidenceIds?: string[];
  lastTouchedSeason?: number;
  lastTouchedWeek?: number;
  archived?: boolean;
}

export type DashboardItemDispositionState =
  | "new"
  | "viewed"
  | "snoozed"
  | "resolved"
  | "dismissed";

export interface DashboardItemDisposition {
  itemId: string;
  state: DashboardItemDispositionState;
  changedWeek: number;
  changedSeason?: number;
  snoozedUntilWeek?: number;
  snoozedUntilSeason?: number;
  pinned?: boolean;
  fingerprint?: string;
  threadId?: string | null;
}

export type DashboardCareerTrack =
  | "craft"
  | "territory"
  | "relationship"
  | "rival"
  | "leadership"
  | "politics"
  | "agency"
  | "legacy";

export type DashboardCareerStage = "early" | "mid" | "late";

export type DashboardOperatingPath =
  | "apprentice"
  | "specialist"
  | "territoryOwner"
  | "independentBuilder"
  | "leader"
  | "executive"
  | "agencyLeader";

export interface DashboardResolvedReference {
  itemId: string;
  resolvedWeek: number;
  resolvedSeason?: number;
  threadId?: string | null;
}

export interface DashboardInsightLedgerEntry {
  insightId: string;
  firstGeneratedWeek: number;
  lastGeneratedWeek: number;
  firstGeneratedSeason?: number;
  lastGeneratedSeason?: number;
  lastViewedWeek?: number;
  lastViewedSeason?: number;
  dismissedWeek?: number;
  dismissedSeason?: number;
  fingerprint?: string;
}

export interface DashboardSurfacingMetadata {
  lastVisibleItemIds: string[];
  lastVisibleInsightIds: string[];
  lastGeneratedWeek?: number;
  lastGeneratedSeason?: number;
  activeInsightId?: string | null;
}

export interface DashboardState {
  version: 1;
  focusedItemId: string | null;
  focusedThreadId: string | null;
  recentItemIds: string[];
  itemDispositions: Record<string, DashboardItemDisposition>;
  recentlyResolved: DashboardResolvedReference[];
  insightLedger: Record<string, DashboardInsightLedgerEntry>;
  surfacing: DashboardSurfacingMetadata;
  legacyRecordIds: string[];
  careerThreads: Record<string, DashboardCareerThread>;
}
