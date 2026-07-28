import type {
  DashboardActionScreen,
  DashboardActionTarget,
  DashboardCareerThread,
  DashboardCareerThreadLegacyRecord,
  DashboardInsightLedgerEntry,
  DashboardItemDisposition,
  DashboardItemDispositionState,
  DashboardReferencePoint,
  DashboardResolvedReference,
  DashboardState,
  DashboardSurfacingMetadata,
} from "./types";

const MAX_RECENT_ITEM_IDS = 32;
const MAX_ITEM_DISPOSITIONS = 256;
const MAX_RECENTLY_RESOLVED = 50;
const MAX_INSIGHT_LEDGER_ENTRIES = 128;
const MAX_LEGACY_RECORD_IDS = 64;
const MAX_CAREER_THREADS = 64;

const DASHBOARD_ACTION_SCREENS = new Set<DashboardActionScreen>([
  "inbox",
  "calendar",
  "reportWriter",
  "reportHistory",
  "playerProfile",
  "rivals",
  "career",
  "network",
  "alumniDashboard",
  "performance",
  "agency",
  "internationalView",
  "npcManagement",
  "youthScouting",
]);

function normalizeId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function normalizePositiveInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 1 ? (value as number) : undefined;
}

function normalizePoint(value: unknown): DashboardReferencePoint | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const season = normalizePositiveInteger(candidate.season);
  const week = normalizePositiveInteger(candidate.week);
  return season && week ? { season, week } : null;
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of value) {
    const id = normalizeId(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

function normalizeActionTarget(value: unknown): DashboardActionTarget | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const screen = normalizeId(candidate.screen);
  if (!screen || !DASHBOARD_ACTION_SCREENS.has(screen as DashboardActionScreen)) {
    return undefined;
  }
  const targetScreen = screen as DashboardActionScreen;

  switch (targetScreen) {
    case "inbox":
      return {
        screen: targetScreen,
        ...(normalizeId(candidate.messageId) ? { messageId: normalizeId(candidate.messageId)! } : {}),
        ...(normalizeId(candidate.decisionId) ? { decisionId: normalizeId(candidate.decisionId)! } : {}),
        ...(normalizeId(candidate.narrativeEventId) ? { narrativeEventId: normalizeId(candidate.narrativeEventId)! } : {}),
        ...(normalizeId(candidate.relatedId) ? { relatedId: normalizeId(candidate.relatedId)! } : {}),
      };
    case "calendar": {
      const week = normalizePositiveInteger(candidate.week);
      const season = normalizePositiveInteger(candidate.season);
      if (!week || !season) return undefined;
      return {
        screen: targetScreen,
        week,
        season,
        ...(normalizeId(candidate.playerId) ? { playerId: normalizeId(candidate.playerId)! } : {}),
        ...(normalizeId(candidate.briefId) ? { briefId: normalizeId(candidate.briefId)! } : {}),
        ...(normalizeId(candidate.focusActivityType)
          ? { focusActivityType: normalizeId(candidate.focusActivityType)! }
          : {}),
      };
    }
    case "reportWriter": {
      const playerId = normalizeId(candidate.playerId);
      if (!playerId) return undefined;
      return {
        screen: targetScreen,
        playerId,
        ...(normalizeId(candidate.briefId) ? { briefId: normalizeId(candidate.briefId)! } : {}),
        ...(normalizeId(candidate.reportWorkItemId)
          ? { reportWorkItemId: normalizeId(candidate.reportWorkItemId)! }
          : {}),
      };
    }
    case "reportHistory":
      return {
        screen: targetScreen,
        ...(normalizeId(candidate.reportId) ? { reportId: normalizeId(candidate.reportId)! } : {}),
        ...(normalizeId(candidate.caseId) ? { caseId: normalizeId(candidate.caseId)! } : {}),
        ...(normalizeId(candidate.decisionId) ? { decisionId: normalizeId(candidate.decisionId)! } : {}),
        ...(normalizeId(candidate.deliveryId) ? { deliveryId: normalizeId(candidate.deliveryId)! } : {}),
        ...(normalizeId(candidate.pendingListingReportId)
          ? { pendingListingReportId: normalizeId(candidate.pendingListingReportId)! }
          : {}),
        ...(normalizeId(candidate.playerId) ? { playerId: normalizeId(candidate.playerId)! } : {}),
      };
    case "playerProfile": {
      const playerId = normalizeId(candidate.playerId);
      if (!playerId) return undefined;
      return { screen: targetScreen, playerId };
    }
    case "rivals":
      return {
        screen: targetScreen,
        ...(normalizeId(candidate.campaignId) ? { campaignId: normalizeId(candidate.campaignId)! } : {}),
        ...(normalizeId(candidate.opportunityId) ? { opportunityId: normalizeId(candidate.opportunityId)! } : {}),
        ...(normalizeId(candidate.playerId) ? { playerId: normalizeId(candidate.playerId)! } : {}),
      };
    case "career":
      return {
        screen: targetScreen,
        ...(normalizeId(candidate.momentId) ? { momentId: normalizeId(candidate.momentId)! } : {}),
        ...(normalizeId(candidate.reviewId) ? { reviewId: normalizeId(candidate.reviewId)! } : {}),
        ...(candidate.focus === "overview"
          || candidate.focus === "skills"
          || candidate.focus === "perks"
          || candidate.focus === "moments"
          || candidate.focus === "recovery"
          ? { focus: candidate.focus }
          : {}),
      };
    case "network":
      return {
        screen: targetScreen,
        ...(normalizeId(candidate.contactId) ? { contactId: normalizeId(candidate.contactId)! } : {}),
        ...(normalizeId(candidate.gossipId) ? { gossipId: normalizeId(candidate.gossipId)! } : {}),
        ...(normalizeId(candidate.playerId) ? { playerId: normalizeId(candidate.playerId)! } : {}),
      };
    case "alumniDashboard":
      return {
        screen: targetScreen,
        ...(normalizeId(candidate.alumniRecordId)
          ? { alumniRecordId: normalizeId(candidate.alumniRecordId)! }
          : {}),
        ...(normalizeId(candidate.playerId) ? { playerId: normalizeId(candidate.playerId)! } : {}),
        ...(normalizeId(candidate.caseId) ? { caseId: normalizeId(candidate.caseId)! } : {}),
      };
    case "performance":
      return {
        screen: targetScreen,
        ...(normalizeId(candidate.metricId) ? { metricId: normalizeId(candidate.metricId)! } : {}),
        ...(normalizePositiveInteger(candidate.season) ? { season: normalizePositiveInteger(candidate.season)! } : {}),
        ...(normalizeId(candidate.reportId) ? { reportId: normalizeId(candidate.reportId)! } : {}),
      };
    case "agency":
      return {
        screen: targetScreen,
        ...(candidate.focus === "overview"
          || candidate.focus === "infrastructure"
          || candidate.focus === "assistants"
          || candidate.focus === "clients"
          || candidate.focus === "events"
          || candidate.focus === "offices"
          || candidate.focus === "legacy"
          || candidate.focus === "strategy"
          ? { focus: candidate.focus }
          : {}),
        ...(normalizeId(candidate.clientId) ? { clientId: normalizeId(candidate.clientId)! } : {}),
        ...(normalizeId(candidate.employeeId) ? { employeeId: normalizeId(candidate.employeeId)! } : {}),
        ...(normalizeId(candidate.officeId) ? { officeId: normalizeId(candidate.officeId)! } : {}),
      };
    case "internationalView":
      return {
        screen: targetScreen,
        ...(normalizeId(candidate.countryId) ? { countryId: normalizeId(candidate.countryId)! } : {}),
        ...(normalizeId(candidate.assignmentId) ? { assignmentId: normalizeId(candidate.assignmentId)! } : {}),
        ...(normalizeId(candidate.playerId) ? { playerId: normalizeId(candidate.playerId)! } : {}),
      };
    case "npcManagement":
      return {
        screen: targetScreen,
        ...(normalizeId(candidate.scoutId) ? { scoutId: normalizeId(candidate.scoutId)! } : {}),
        ...(normalizeId(candidate.delegationId)
          ? { delegationId: normalizeId(candidate.delegationId)! }
          : {}),
        ...(candidate.focus === "staff"
        || candidate.focus === "delegation"
        || candidate.focus === "coverage"
          ? { focus: candidate.focus }
          : {}),
      };
    case "youthScouting":
      return {
        screen: targetScreen,
        ...(normalizeId(candidate.playerId) ? { playerId: normalizeId(candidate.playerId)! } : {}),
        ...(normalizeId(candidate.caseId) ? { caseId: normalizeId(candidate.caseId)! } : {}),
        ...(normalizeId(candidate.tournamentId)
          ? { tournamentId: normalizeId(candidate.tournamentId)! }
          : {}),
        ...(candidate.focus === "desk"
        || candidate.focus === "pipeline"
        || candidate.focus === "tournaments"
        || candidate.focus === "alumni"
          ? { focus: candidate.focus }
          : {}),
      };
  }
}

function normalizeDispositionState(candidate: Record<string, unknown>): {
  state: DashboardItemDispositionState;
  pinned: boolean | undefined;
} | null {
  if (
    candidate.state === "new"
    || candidate.state === "viewed"
    || candidate.state === "snoozed"
    || candidate.state === "resolved"
    || candidate.state === "dismissed"
  ) {
    return {
      state: candidate.state,
      pinned: typeof candidate.pinned === "boolean" ? candidate.pinned : undefined,
    };
  }
  if (candidate.kind === "dismissed") return { state: "dismissed", pinned: undefined };
  if (candidate.kind === "snoozed") return { state: "snoozed", pinned: undefined };
  if (candidate.kind === "pinned") return { state: "viewed", pinned: true };
  return null;
}

function normalizeDisposition(value: unknown): DashboardItemDisposition | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const itemId = normalizeId(candidate.itemId);
  const stateInfo = normalizeDispositionState(candidate);
  const legacyPoint = normalizePoint(candidate.updatedAt);
  const changedWeek = normalizePositiveInteger(candidate.changedWeek) ?? legacyPoint?.week;
  const changedSeason = normalizePositiveInteger(candidate.changedSeason) ?? legacyPoint?.season;
  if (!itemId || !stateInfo || !changedWeek) {
    return null;
  }
  const threadId = normalizeId(candidate.threadId);
  const snoozedUntilPoint = normalizePoint(candidate.snoozedUntil);
  const snoozedUntilWeek = normalizePositiveInteger(candidate.snoozedUntilWeek) ?? snoozedUntilPoint?.week;
  const snoozedUntilSeason = normalizePositiveInteger(candidate.snoozedUntilSeason) ?? snoozedUntilPoint?.season;
  return {
    itemId,
    state: stateInfo.state,
    changedWeek,
    ...(changedSeason ? { changedSeason } : {}),
    ...(stateInfo.state === "snoozed" && snoozedUntilWeek ? { snoozedUntilWeek } : {}),
    ...(stateInfo.state === "snoozed" && snoozedUntilSeason ? { snoozedUntilSeason } : {}),
    ...(typeof stateInfo.pinned === "boolean" ? { pinned: stateInfo.pinned } : {}),
    ...(normalizeId(candidate.fingerprint) ? { fingerprint: normalizeId(candidate.fingerprint)! } : {}),
    ...(threadId ? { threadId } : {}),
  };
}

function normalizeResolvedReference(value: unknown): DashboardResolvedReference | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const itemId = normalizeId(candidate.itemId);
  const resolvedWeek = normalizePositiveInteger(candidate.resolvedWeek) ?? normalizePositiveInteger(candidate.changedWeek);
  const resolvedSeason = normalizePositiveInteger(candidate.resolvedSeason) ?? normalizePositiveInteger(candidate.changedSeason);
  if (!itemId || !resolvedWeek) return null;
  const threadId = normalizeId(candidate.threadId);
  return {
    itemId,
    resolvedWeek,
    ...(resolvedSeason ? { resolvedSeason } : {}),
    ...(threadId ? { threadId } : {}),
  };
}

function normalizeInsightLedgerEntry(value: unknown): DashboardInsightLedgerEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const insightId = normalizeId(candidate.insightId);
  const firstGeneratedWeek =
    normalizePositiveInteger(candidate.firstGeneratedWeek)
    ?? normalizePositiveInteger(candidate.generatedWeek)
    ?? normalizePositiveInteger(candidate.lastGeneratedWeek);
  const lastGeneratedWeek =
    normalizePositiveInteger(candidate.lastGeneratedWeek)
    ?? firstGeneratedWeek;
  if (!insightId || !firstGeneratedWeek || !lastGeneratedWeek) {
    return null;
  }
  return {
    insightId,
    firstGeneratedWeek,
    lastGeneratedWeek,
    ...(normalizePositiveInteger(candidate.firstGeneratedSeason)
      ? { firstGeneratedSeason: normalizePositiveInteger(candidate.firstGeneratedSeason)! }
      : {}),
    ...(normalizePositiveInteger(candidate.lastGeneratedSeason)
      ? { lastGeneratedSeason: normalizePositiveInteger(candidate.lastGeneratedSeason)! }
      : {}),
    ...(normalizePositiveInteger(candidate.lastViewedWeek)
      ? { lastViewedWeek: normalizePositiveInteger(candidate.lastViewedWeek)! }
      : {}),
    ...(normalizePositiveInteger(candidate.lastViewedSeason)
      ? { lastViewedSeason: normalizePositiveInteger(candidate.lastViewedSeason)! }
      : {}),
    ...(normalizePositiveInteger(candidate.dismissedWeek)
      ? { dismissedWeek: normalizePositiveInteger(candidate.dismissedWeek)! }
      : {}),
    ...(normalizePositiveInteger(candidate.dismissedSeason)
      ? { dismissedSeason: normalizePositiveInteger(candidate.dismissedSeason)! }
      : {}),
    ...(normalizeId(candidate.fingerprint) ? { fingerprint: normalizeId(candidate.fingerprint)! } : {}),
  };
}

function normalizeThreadRecord(
  key: string,
  value: unknown,
): DashboardCareerThread | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const legacy = candidate as DashboardCareerThreadLegacyRecord;
  const currentPoint = normalizePoint(candidate.lastUpdatedAt);
  const legacySeason = normalizePositiveInteger(legacy.lastTouchedSeason);
  const legacyWeek = normalizePositiveInteger(legacy.lastTouchedWeek);
  const lastUpdatedAt = currentPoint ?? (legacySeason && legacyWeek
    ? { season: legacySeason, week: legacyWeek }
    : null);
  if (!lastUpdatedAt) return null;

  const id = normalizeId(candidate.id) ?? key;
  const primaryItemId = normalizeId(candidate.primaryItemId);
  const legacyRecordId = normalizeId(candidate.legacyRecordId);
  const actionTarget = normalizeActionTarget(candidate.actionTarget);

  const rawWhatHappened = Array.isArray(candidate.whatHappened)
    ? candidate.whatHappened
    : typeof candidate.whatHappened === "string"
      ? [candidate.whatHappened]
      : [];
  const whatHappened = rawWhatHappened
    .map((line) => normalizeText(line))
    .filter((line): line is string => Boolean(line));
  const tone =
    candidate.tone === "positive"
    || candidate.tone === "neutral"
    || candidate.tone === "negative"
      ? candidate.tone
      : undefined;
  const significance =
    typeof candidate.significance === "number" && Number.isFinite(candidate.significance)
      ? Math.max(0, Math.min(1, candidate.significance))
      : undefined;

  return {
    id,
    type: normalizeText(candidate.type) ?? "career_story",
    ...(legacyRecordId ? { legacyRecordId } : {}),
    ...(primaryItemId ? { primaryItemId } : {}),
    relatedItemIds: normalizeIdList(candidate.relatedItemIds),
    ...(normalizeId(candidate.playerId) ? { playerId: normalizeId(candidate.playerId)! } : {}),
    ...(normalizeId(candidate.alumniRecordId)
      ? { alumniRecordId: normalizeId(candidate.alumniRecordId)! }
      : {}),
    ...(normalizeId(candidate.caseId) ? { caseId: normalizeId(candidate.caseId)! } : {}),
    ...(normalizeId(candidate.decisionId) ? { decisionId: normalizeId(candidate.decisionId)! } : {}),
    ...(normalizeId(candidate.reportId) ? { reportId: normalizeId(candidate.reportId)! } : {}),
    title: normalizeText(candidate.title) ?? "Career thread",
    summary: normalizeText(candidate.summary) ?? "",
    whatHappened,
    ...(normalizeText(candidate.careerImpact)
      ? { careerImpact: normalizeText(candidate.careerImpact)! }
      : {}),
    ...(normalizeText(candidate.originalVerdict)
      ? { originalVerdict: normalizeText(candidate.originalVerdict)! }
      : {}),
    ...(significance !== undefined ? { significance } : {}),
    ...(tone ? { tone } : {}),
    ...(actionTarget ? { actionTarget } : {}),
    evidenceIds: normalizeIdList(candidate.evidenceIds),
    lastUpdatedAt,
    archived: Boolean(candidate.archived),
  };
}

function normalizeDispositions(value: unknown): Record<string, DashboardItemDisposition> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const normalized: Record<string, DashboardItemDisposition> = {};
  for (const [key, entry] of Object.entries(value).slice(-MAX_ITEM_DISPOSITIONS)) {
    const disposition = normalizeDisposition(entry);
    if (!disposition) continue;
    normalized[normalizeId(key) ?? disposition.itemId] = disposition;
  }
  return normalized;
}

function normalizeResolvedList(value: unknown): DashboardResolvedReference[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeResolvedReference(entry))
    .filter((entry): entry is DashboardResolvedReference => entry !== null)
    .slice(-MAX_RECENTLY_RESOLVED);
}

function normalizeInsightLedger(value: unknown): Record<string, DashboardInsightLedgerEntry> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const normalized: Record<string, DashboardInsightLedgerEntry> = {};
  for (const [key, entry] of Object.entries(value).slice(-MAX_INSIGHT_LEDGER_ENTRIES)) {
    const ledgerEntry = normalizeInsightLedgerEntry(entry);
    if (!ledgerEntry) continue;
    normalized[normalizeId(key) ?? ledgerEntry.insightId] = ledgerEntry;
  }
  return normalized;
}

function normalizeSurfacing(value: unknown): DashboardSurfacingMetadata {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      lastVisibleItemIds: [],
      lastVisibleInsightIds: [],
    };
  }
  const candidate = value as Record<string, unknown>;
  return {
    lastVisibleItemIds: normalizeIdList(candidate.lastVisibleItemIds),
    lastVisibleInsightIds: normalizeIdList(candidate.lastVisibleInsightIds),
    ...(normalizePositiveInteger(candidate.lastGeneratedWeek)
      ? { lastGeneratedWeek: normalizePositiveInteger(candidate.lastGeneratedWeek)! }
      : {}),
    ...(normalizePositiveInteger(candidate.lastGeneratedSeason)
      ? { lastGeneratedSeason: normalizePositiveInteger(candidate.lastGeneratedSeason)! }
      : {}),
    ...(normalizeId(candidate.activeInsightId) ? { activeInsightId: normalizeId(candidate.activeInsightId)! } : {}),
  };
}

function normalizeCareerThreads(value: unknown): Record<string, DashboardCareerThread> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const normalized: Record<string, DashboardCareerThread> = {};
  for (const [key, entry] of Object.entries(value).slice(-MAX_CAREER_THREADS)) {
    const threadKey = normalizeId(key);
    if (!threadKey) continue;
    const thread = normalizeThreadRecord(threadKey, entry);
    if (!thread) continue;
    normalized[threadKey] = thread;
  }
  return normalized;
}

export function createDashboardState(
  partial: Partial<DashboardState> = {},
): DashboardState {
  return {
    version: 1,
    focusedItemId: partial.focusedItemId ?? null,
    focusedThreadId: partial.focusedThreadId ?? null,
    recentItemIds: partial.recentItemIds ?? [],
    itemDispositions: partial.itemDispositions ?? {},
    recentlyResolved: partial.recentlyResolved ?? [],
    insightLedger: partial.insightLedger ?? {},
    surfacing: partial.surfacing ?? {
      lastVisibleItemIds: [],
      lastVisibleInsightIds: [],
    },
    legacyRecordIds: partial.legacyRecordIds ?? [],
    careerThreads: partial.careerThreads ?? {},
  };
}

export function cleanupDashboardState(state: DashboardState): DashboardState {
  return createDashboardState({
    focusedItemId: normalizeId(state.focusedItemId) ?? null,
    focusedThreadId: normalizeId(state.focusedThreadId) ?? null,
    recentItemIds: normalizeIdList(state.recentItemIds).slice(-MAX_RECENT_ITEM_IDS),
    itemDispositions: normalizeDispositions(state.itemDispositions),
    recentlyResolved: normalizeResolvedList(state.recentlyResolved),
    insightLedger: normalizeInsightLedger(state.insightLedger),
    surfacing: normalizeSurfacing(state.surfacing),
    legacyRecordIds: normalizeIdList(state.legacyRecordIds).slice(-MAX_LEGACY_RECORD_IDS),
    careerThreads: normalizeCareerThreads(state.careerThreads),
  });
}

export function migrateDashboardState(raw: unknown): DashboardState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return createDashboardState();
  }
  const candidate = raw as Record<string, unknown>;
  return cleanupDashboardState(
    createDashboardState({
      focusedItemId: normalizeId(candidate.focusedItemId) ?? null,
      focusedThreadId: normalizeId(candidate.focusedThreadId) ?? null,
      recentItemIds: normalizeIdList(candidate.recentItemIds),
      itemDispositions: normalizeDispositions(candidate.itemDispositions),
      recentlyResolved: normalizeResolvedList(candidate.recentlyResolved),
      insightLedger: normalizeInsightLedger(candidate.insightLedger),
      surfacing: normalizeSurfacing(candidate.surfacing),
      legacyRecordIds: normalizeIdList(candidate.legacyRecordIds),
      careerThreads: normalizeCareerThreads(candidate.careerThreads),
    }),
  );
}
