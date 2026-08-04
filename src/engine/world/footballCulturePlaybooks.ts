import {
  CONTENT_SCHEMA_VERSION,
  ContentValidationError,
  defineContentPack,
  hasNonBlankString,
  type ContentValidationIssue,
} from "@/engine/content/contracts";
import { getShippedCountryKeys } from "@/lib/country";
import {
  ATTRIBUTE_DOMAINS,
  DEFAULT_INSIGHT_ORDER,
  FOOTBALL_CULTURE_PLAYBOOK_CATALOG,
  canonicalCountry,
  type FootballCultureCalendarWindowDefinition,
  type FootballCulturePlaybook,
  type FootballCulturePlaybookInsightDefinition,
  type FootballCulturePlaybookNotes,
  type InsightType,
} from "./footballCulturePlaybookCatalog";

export type {
  FootballCultureCalendarWindowDefinition,
  FootballCulturePlaybook,
  FootballCulturePlaybookInsightDefinition,
  FootballCulturePlaybookNotes,
  InsightType,
} from "./footballCulturePlaybookCatalog";

const INSIGHT_TYPE_SET = new Set<InsightType>(DEFAULT_INSIGHT_ORDER);

function pushStringListIssues(
  issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">>,
  path: string,
  values: readonly string[],
  minimum: number,
): void {
  if (values.length < minimum) {
    issues.push({
      path,
      message: `must contain at least ${minimum} non-empty string${minimum === 1 ? "" : "s"}`,
    });
  }
  if (values.some((value) => !hasNonBlankString(value))) {
    issues.push({ path, message: "must contain only non-empty strings" });
  }
  if (new Set(values).size !== values.length) {
    issues.push({ path, message: "must not contain duplicates" });
  }
}

function pushInsightIssues(
  issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">>,
  insight: FootballCulturePlaybookInsightDefinition,
  index: number,
): void {
  if (!INSIGHT_TYPE_SET.has(insight.type)) {
    issues.push({
      path: `insightsByType[${index}].type`,
      message: "must be a supported football culture insight type",
    });
  }
  for (const [path, value] of [
    [`insightsByType[${index}].description`, insight.description],
    [`insightsByType[${index}].gameplayEffect`, insight.gameplayEffect],
  ] as const) {
    if (!hasNonBlankString(value)) {
      issues.push({ path, message: "must be a non-empty string" });
    }
  }
  const adjustment = insight.effectAdjustment;
  if (!adjustment) return;
  if (adjustment.signalByDomain) {
    for (const [domain, delta] of Object.entries(adjustment.signalByDomain)) {
      if (!ATTRIBUTE_DOMAINS.includes(domain as (typeof ATTRIBUTE_DOMAINS)[number])) {
        issues.push({
          path: `insightsByType[${index}].effectAdjustment.signalByDomain.${domain}`,
          message: "must target a supported attribute domain",
        });
      }
      if (!Number.isFinite(delta) || delta < -0.2 || delta > 0.2) {
        issues.push({
          path: `insightsByType[${index}].effectAdjustment.signalByDomain.${domain}`,
          message: "must be a finite adjustment between -0.2 and 0.2",
        });
      }
    }
  }
  if (
    adjustment.uncertaintyMultiplier !== undefined
    && (!Number.isFinite(adjustment.uncertaintyMultiplier) || adjustment.uncertaintyMultiplier <= 0)
  ) {
    issues.push({
      path: `insightsByType[${index}].effectAdjustment.uncertaintyMultiplier`,
      message: "must be a finite positive number",
    });
  }
  pushStringListIssues(
    issues,
    `insightsByType[${index}].effectAdjustment.contextTags`,
    adjustment.contextTags ?? [],
    0,
  );
  pushStringListIssues(
    issues,
    `insightsByType[${index}].effectAdjustment.biasWarnings`,
    adjustment.biasWarnings ?? [],
    0,
  );
}

function pushCalendarWindowIssues(
  issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">>,
  window: FootballCultureCalendarWindowDefinition,
  index: number,
): void {
  for (const [path, value] of [
    [`calendarWindows[${index}].id`, window.id],
    [`calendarWindows[${index}].label`, window.label],
  ] as const) {
    if (!hasNonBlankString(value)) {
      issues.push({ path, message: "must be a non-empty string" });
    }
  }
  for (const [path, value] of [
    [`calendarWindows[${index}].startWeek`, window.startWeek],
    [`calendarWindows[${index}].endWeek`, window.endWeek],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) {
      issues.push({ path, message: "must be a positive integer week" });
    }
  }
  if (window.endWeek < window.startWeek) {
    issues.push({
      path: `calendarWindows[${index}].endWeek`,
      message: "must be greater than or equal to startWeek",
    });
  }
  for (const [path, value, minimum] of [
    [`calendarWindows[${index}].maxWeekShift`, window.maxWeekShift, 0],
    [`calendarWindows[${index}].intensityVariance`, window.intensityVariance, 0],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < minimum)) {
      issues.push({
        path,
        message: `must be a finite number greater than or equal to ${minimum}`,
      });
    }
  }
  if (
    window.misleadingSignalRiskDelta !== undefined
    && (!Number.isFinite(window.misleadingSignalRiskDelta) || Math.abs(window.misleadingSignalRiskDelta) > 1)
  ) {
    issues.push({
      path: `calendarWindows[${index}].misleadingSignalRiskDelta`,
      message: "must be a finite number between -1 and 1",
    });
  }
  if (
    window.uncertaintyMultiplier !== undefined
    && (!Number.isFinite(window.uncertaintyMultiplier) || window.uncertaintyMultiplier <= 0)
  ) {
    issues.push({
      path: `calendarWindows[${index}].uncertaintyMultiplier`,
      message: "must be a finite positive number",
    });
  }
  if (window.signalByDomain) {
    for (const [domain, delta] of Object.entries(window.signalByDomain)) {
      if (!ATTRIBUTE_DOMAINS.includes(domain as (typeof ATTRIBUTE_DOMAINS)[number])) {
        issues.push({
          path: `calendarWindows[${index}].signalByDomain.${domain}`,
          message: "must target a supported attribute domain",
        });
      }
      if (!Number.isFinite(delta) || delta < -0.2 || delta > 0.2) {
        issues.push({
          path: `calendarWindows[${index}].signalByDomain.${domain}`,
          message: "must be a finite adjustment between -0.2 and 0.2",
        });
      }
    }
  }
  pushStringListIssues(issues, `calendarWindows[${index}].contextTags`, window.contextTags ?? [], 0);
  pushStringListIssues(issues, `calendarWindows[${index}].biasWarnings`, window.biasWarnings ?? [], 0);
  pushStringListIssues(issues, `calendarWindows[${index}].reasons`, window.reasons ?? [], 0);
}

function pushNotesIssues(
  issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">>,
  notes: FootballCulturePlaybookNotes,
): void {
  pushStringListIssues(issues, "notes.institutions", notes.institutions, 1);
  pushStringListIssues(issues, "notes.pathways", notes.pathways, 1);
  pushStringListIssues(issues, "notes.accessPoints", notes.accessPoints, 1);
  pushStringListIssues(issues, "notes.evidenceTraps", notes.evidenceTraps, 1);
}

function validateFootballCulturePlaybook(
  playbook: FootballCulturePlaybook,
): readonly Omit<ContentValidationIssue, "packId" | "definitionId">[] {
  const issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">> = [];
  const normalizedCountryId = canonicalCountry(playbook.countryId);
  if (!normalizedCountryId) {
    issues.push({
      path: "countryId",
      message: "must resolve to a canonical shipped country key",
    });
  } else if (normalizedCountryId !== playbook.countryId) {
    issues.push({
      path: "countryId",
      message: "must already use the canonical compact country key",
    });
  }
  if (!hasNonBlankString(playbook.displayName)) {
    issues.push({ path: "displayName", message: "must be a non-empty string" });
  }
  if (!playbook.explicit) {
    issues.push({
      path: "explicit",
      message: "must remain explicit in the authored catalog",
    });
  }
  pushNotesIssues(issues, playbook.notes);
  if (playbook.insightOrder.length !== DEFAULT_INSIGHT_ORDER.length) {
    issues.push({
      path: "insightOrder",
      message: `must contain exactly ${DEFAULT_INSIGHT_ORDER.length} insight types`,
    });
  }
  if (new Set(playbook.insightOrder).size !== playbook.insightOrder.length) {
    issues.push({ path: "insightOrder", message: "must not contain duplicates" });
  }
  if (playbook.insightOrder.some((type) => !INSIGHT_TYPE_SET.has(type))) {
    issues.push({
      path: "insightOrder",
      message: "must contain only supported insight types",
    });
  }
  const insightDefinitions = playbook.insightOrder.map((type) => playbook.insightsByType[type]);
  if (insightDefinitions.some((insight) => insight === undefined)) {
    issues.push({
      path: "insightsByType",
      message: "must define every insight referenced by insightOrder",
    });
  }
  insightDefinitions.forEach((insight, index) => {
    if (insight) pushInsightIssues(issues, insight, index);
  });
  if (Object.keys(playbook.insightsByType).length !== DEFAULT_INSIGHT_ORDER.length) {
    issues.push({
      path: "insightsByType",
      message: `must define exactly ${DEFAULT_INSIGHT_ORDER.length} unique insight entries`,
    });
  }
  if (playbook.calendarWindows.length === 0) {
    issues.push({
      path: "calendarWindows",
      message: "must contain at least one authored calendar window",
    });
  }
  if (new Set(playbook.calendarWindows.map((entry) => entry.id)).size !== playbook.calendarWindows.length) {
    issues.push({ path: "calendarWindows", message: "must not contain duplicate window IDs" });
  }
  playbook.calendarWindows.forEach((window, index) => {
    pushCalendarWindowIssues(issues, window, index);
  });
  return issues;
}

export const FOOTBALL_CULTURE_PLAYBOOK_CONTENT_PACK = defineContentPack({
  manifest: {
    id: "talentscout.football-culture-playbooks",
    kind: "football-culture-playbook",
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentVersion: "football-culture-playbooks.1",
  },
  entries: FOOTBALL_CULTURE_PLAYBOOK_CATALOG,
  getDefinitionId: (playbook) => playbook.countryId,
  validateDefinition: validateFootballCulturePlaybook,
});

const shippedCountries = getShippedCountryKeys();
const authoredCountries = FOOTBALL_CULTURE_PLAYBOOK_CONTENT_PACK.entries.map((playbook) => playbook.countryId);
const missingCountries = shippedCountries.filter((countryId) => !authoredCountries.includes(countryId));
const unexpectedCountries = authoredCountries.filter((countryId) => !shippedCountries.includes(countryId));

if (missingCountries.length > 0 || unexpectedCountries.length > 0) {
  throw new ContentValidationError([
    ...missingCountries.map((countryId) => ({
      packId: FOOTBALL_CULTURE_PLAYBOOK_CONTENT_PACK.manifest.id,
      definitionId: countryId,
      path: "countryId",
      message: "is missing an explicit authored football culture playbook",
    })),
    ...unexpectedCountries.map((countryId) => ({
      packId: FOOTBALL_CULTURE_PLAYBOOK_CONTENT_PACK.manifest.id,
      definitionId: countryId,
      path: "countryId",
      message: "is not part of the shipped country catalog",
    })),
  ]);
}

const PLAYBOOKS_BY_COUNTRY: Readonly<Record<string, FootballCulturePlaybook>> = Object.freeze(
  FOOTBALL_CULTURE_PLAYBOOK_CONTENT_PACK.byId,
);

const FALLBACK_PLAYBOOK: FootballCulturePlaybook = Object.freeze({
  countryId: "generic",
  displayName: "Local Market",
  explicit: false,
  notes: {
    institutions: ["Competition structure and local training norms still shape how evidence should be read."],
    pathways: ["Author a country-specific playbook to describe academies, schools, clubs, and informal routes here."],
    accessPoints: ["Use repeated live views, local contacts, and registration timing to build certainty."],
    evidenceTraps: ["Avoid generic national assumptions when no explicit authored playbook exists."],
  },
  insightOrder: DEFAULT_INSIGHT_ORDER,
  insightsByType: {
    playingStyle: {
      type: "playingStyle",
      description: "The local game has recurring tactical habits that change which actions appear often enough to trust.",
      gameplayEffect: "Understanding the local playing rhythm improves tactical interpretation.",
    },
    developmentCulture: {
      type: "developmentCulture",
      description: "The player pathway is shaped by local coaching access, competition density, and registration structure.",
      gameplayEffect: "Understanding the pathway reduces development-context guesswork.",
    },
    mentalityPattern: {
      type: "mentalityPattern",
      description: "Pressure, selection, and opportunity windows affect what behaviours a scout can really observe.",
      gameplayEffect: "Understanding the local pressure profile improves mental-context reads.",
    },
    physicalTrait: {
      type: "physicalTrait",
      description: "The competition environment changes how early physical samples map to adult football utility.",
      gameplayEffect: "Understanding the sample environment improves physical interpretation.",
    },
  } satisfies Record<InsightType, FootballCulturePlaybookInsightDefinition>,
  calendarWindows: [],
});

export function getFootballCulturePlaybook(countryId: string): FootballCulturePlaybook {
  const country = canonicalCountry(countryId);
  return (country && PLAYBOOKS_BY_COUNTRY[country]) || FALLBACK_PLAYBOOK;
}

export function getExplicitFootballCulturePlaybook(
  countryId: string,
): FootballCulturePlaybook | null {
  const playbook = getFootballCulturePlaybook(countryId);
  return playbook.explicit ? playbook : null;
}

export function listExplicitFootballCulturePlaybooks(): FootballCulturePlaybook[] {
  return getShippedCountryKeys()
    .map((countryId) => PLAYBOOKS_BY_COUNTRY[countryId])
    .filter((playbook): playbook is FootballCulturePlaybook => !!playbook);
}

export function listFootballCultureInsightDefinitions(
  countryId: string,
): FootballCulturePlaybookInsightDefinition[] {
  const playbook = getFootballCulturePlaybook(countryId);
  return playbook.insightOrder.map((type) => playbook.insightsByType[type]);
}

export function getFootballCultureInsightDefinition(
  countryId: string,
  type: InsightType,
): FootballCulturePlaybookInsightDefinition {
  return getFootballCulturePlaybook(countryId).insightsByType[type];
}

export function listFootballCultureCalendarWindows(
  countryId: string,
): FootballCultureCalendarWindowDefinition[] {
  return [...getFootballCulturePlaybook(countryId).calendarWindows];
}

export function getFootballCulturePlaybookCoverage(): Record<string, number> {
  return Object.fromEntries(
    Object.entries(PLAYBOOKS_BY_COUNTRY).map(([countryId, playbook]) => [
      countryId,
      ATTRIBUTE_DOMAINS.reduce((count, domain) => count + Number(
        playbook.calendarWindows.some((entry) => entry.signalByDomain?.[domain] !== undefined),
      ), 0),
    ]),
  );
}
