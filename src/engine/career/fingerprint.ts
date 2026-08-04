import type { CareerPath, GameState } from '@/engine/core/types';
import type { CareerEra } from '@/engine/events/careerEraDirector';
import { stableFingerprint } from '@/engine/run/runManifest';
import {
  getScoutDoctrineDefinitions,
  getScoutOriginDefinition,
} from '@/engine/run/scoutIdentity';
import { getWorldTraitDefinitions } from '@/engine/run/worldTraits';
import type { RivalMarketPressureBand } from '@/engine/rivals/organizations';
import {
  deriveTerritorialStrategy,
  type TerritorialStrategyPosture,
} from '@/engine/world/regionalPresence';
import { getCountryDisplayName } from '@/lib/country';

export type CareerFingerprintTone =
  | 'sky'
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'red';

export interface CareerFingerprintLabel {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: CareerFingerprintTone;
}

export interface CareerFingerprintProjection {
  title: string;
  summary: string;
  labels: CareerFingerprintLabel[];
  comparisonKey: string;
  fingerprintId: string;
}

export interface CareerFingerprintAuthority {
  careerPath: CareerPath;
  careerTier: number;
  originId?: string;
  doctrineIds?: readonly string[];
  worldTraitIds?: readonly string[];
  currentEra?: Pick<CareerEra, 'theme' | 'title' | 'primaryCountryId'>;
  activeRecovery?: boolean;
  territory?: {
    posture: TerritorialStrategyPosture;
    primaryCountryId?: string;
    coveredCountryCount: number;
    deepCountryCount: number;
    contestedCountryIds: readonly string[];
    staleCountryIds: readonly string[];
  };
  rivalry?: {
    organizationName?: string;
    pressureBand?: RivalMarketPressureBand;
    momentum?: number;
  };
  relationships?: {
    activeObligationCount: number;
    dominantStakeholderKind?: string;
    persistentStakeholderKinds: readonly string[];
  };
}

const PRESSURE_BAND_LABEL: Record<RivalMarketPressureBand, string> = {
  uncontested: 'quiet',
  watched: 'watched',
  contested: 'contested',
  closing: 'closing in',
};

const STAKEHOLDER_KIND_LABEL: Record<string, string> = {
  agent: 'Agent',
  board: 'Board',
  club: 'Club',
  contact: 'Contact',
  employee: 'Employee',
  executive: 'Executive',
  family: 'Family',
  journalist: 'Media',
  manager: 'Manager',
  player: 'Player',
  rival: 'Rival',
  scout: 'Your staff',
};

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function stakeholderLabel(kind?: string): string | undefined {
  if (!kind) return undefined;
  return STAKEHOLDER_KIND_LABEL[kind] ?? titleCase(kind);
}

function pathLabel(path: CareerPath): string {
  return path === 'independent' ? 'Own practice' : 'Club ladder';
}

function territoryValue(
  territory: NonNullable<CareerFingerprintAuthority['territory']> | undefined,
): { value: string; detail: string; tone: CareerFingerprintTone } {
  if (!territory) {
    return {
      value: 'Geography still forming',
      detail: 'The network has not yet separated into a clear territorial identity.',
      tone: 'sky',
    };
  }

  const country = territory.primaryCountryId
    ? getCountryDisplayName(territory.primaryCountryId)
    : undefined;
  const contested = territory.contestedCountryIds.length;
  const stale = territory.staleCountryIds.length;

  if (territory.posture === 'specialist') {
    return {
      value: country ? `Specialist in ${country}` : 'Specialist foothold',
      detail: contested > 0
        ? `${contested} watched market${contested === 1 ? '' : 's'} can still turn that edge into a race.`
        : 'Depth is concentrated enough to create a real local edge.',
      tone: 'emerald',
    };
  }

  if (territory.posture === 'network') {
    return {
      value: `Network across ${territory.coveredCountryCount} markets`,
      detail: stale > 0
        ? `${stale} market${stale === 1 ? ' is' : 's are'} already aging without follow-up.`
        : 'Breadth is now part of the career identity, not just a travel list.',
      tone: 'sky',
    };
  }

  if (territory.posture === 'overextended') {
    return {
      value: `Stretched across ${territory.coveredCountryCount} markets`,
      detail: `${stale} stale lane${stale === 1 ? '' : 's'} and ${contested} contested front${contested === 1 ? '' : 's'} are testing the network.`,
      tone: 'red',
    };
  }

  return {
    value: country
      ? `Selective around ${country}`
      : `Selective across ${territory.coveredCountryCount} markets`,
    detail: territory.deepCountryCount > 0
      ? 'The footprint is controlled, with room to either deepen or broaden next.'
      : 'Coverage remains flexible enough to pivot with the next opening.',
    tone: 'amber',
  };
}

function threadValue(
  authority: CareerFingerprintAuthority,
): { value: string; detail: string; tone: CareerFingerprintTone } {
  if (authority.activeRecovery) {
    return {
      value: 'Comeback chapter',
      detail: 'This career is currently being judged by what has changed since the setback.',
      tone: 'red',
    };
  }

  if (authority.currentEra?.title) {
    return {
      value: authority.currentEra.title,
      detail: authority.currentEra.primaryCountryId
        ? `The live thread is currently anchored in ${getCountryDisplayName(authority.currentEra.primaryCountryId)}.`
        : 'The active career thread is shaping which work matters most right now.',
      tone: authority.currentEra.theme === 'rivalPressure' || authority.currentEra.theme === 'relationshipDebt'
        ? 'amber'
        : authority.currentEra.theme === 'recovery'
          ? 'red'
          : 'violet',
    };
  }

  return {
    value: authority.careerTier >= 4 ? 'Leadership chapter' : 'Build the record',
    detail: authority.careerTier >= 4
      ? 'Other people and wider strategy now sit inside your weekly responsibility.'
      : 'The career is still being shaped by which recommendations become remembered outcomes.',
    tone: authority.careerTier >= 4 ? 'violet' : 'sky',
  };
}

function pressureValue(
  authority: CareerFingerprintAuthority,
): { value: string; detail: string; tone: CareerFingerprintTone } {
  const pressureBand = authority.rivalry?.pressureBand;
  const rivalName = authority.rivalry?.organizationName?.trim();
  if (
    rivalName
    && pressureBand
    && (pressureBand === 'contested' || pressureBand === 'closing')
  ) {
    return {
      value: `${rivalName} ${PRESSURE_BAND_LABEL[pressureBand]}`,
      detail: authority.rivalry?.momentum && authority.rivalry.momentum > 0
        ? 'Rival momentum is building around the same football space.'
        : 'The same lead is no longer yours to develop in peace.',
      tone: pressureBand === 'closing' ? 'red' : 'amber',
    };
  }

  const activeObligations = authority.relationships?.activeObligationCount ?? 0;
  const dominantStakeholder = stakeholderLabel(
    authority.relationships?.dominantStakeholderKind,
  );
  if (activeObligations > 0) {
    return {
      value: dominantStakeholder
        ? `${dominantStakeholder} promises live`
        : `${activeObligations} live promise${activeObligations === 1 ? '' : 's'}`,
      detail: `${activeObligations} active obligation${activeObligations === 1 ? '' : 's'} can still redirect future access and trust.`,
      tone: activeObligations >= 3 ? 'red' : 'amber',
    };
  }

  const persistentKinds = authority.relationships?.persistentStakeholderKinds ?? [];
  if (persistentKinds.length > 0) {
    const lead = stakeholderLabel(persistentKinds[0]);
    return {
      value: lead ? `${lead} memory still matters` : 'Stakeholder memory active',
      detail: `Persistent reactions are currently strongest around ${persistentKinds
        .slice(0, 2)
        .map((kind) => stakeholderLabel(kind) ?? titleCase(kind))
        .join(' and ')}.`,
      tone: 'violet',
    };
  }

  return {
    value: authority.careerPath === 'independent' ? 'Autonomy intact' : 'Trust currently stable',
    detail: authority.careerPath === 'independent'
      ? 'No single rival or promise is forcing the next move yet.'
      : 'The next pressure point is still something you can choose rather than merely absorb.',
    tone: 'emerald',
  };
}

function normalizeLabelValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function summarizeIdentity(authority: CareerFingerprintAuthority): {
  title: string;
  detail: string;
} {
  const origin = getScoutOriginDefinition(authority.originId)?.name;
  const doctrine = getScoutDoctrineDefinitions(authority.doctrineIds ?? []).map(
    (entry) => entry.name,
  );
  const leadDoctrine = doctrine[0];
  const title = leadDoctrine
    ?? origin
    ?? (authority.careerPath === 'independent' ? 'Independent scout' : 'Club scout');

  const detailParts = [
    origin && leadDoctrine ? `${origin} background` : origin,
    leadDoctrine && origin ? `${leadDoctrine} lens` : leadDoctrine,
    `${pathLabel(authority.careerPath)} · Tier ${authority.careerTier}`,
  ].filter((value): value is string => Boolean(value));

  return {
    title,
    detail: detailParts.join(' · '),
  };
}

function summarizeWorld(
  authority: CareerFingerprintAuthority,
): { value: string; detail: string } {
  const traits = getWorldTraitDefinitions(authority.worldTraitIds ?? []);
  if (traits.length === 0) {
    return {
      value: 'Standard world cycle',
      detail: 'No special world conditions are recorded for this career.',
    };
  }
  const primary = traits.slice(0, 2).map((trait) => trait.name).join(' · ');
  return {
    value: primary,
    detail: traits.map((trait) => trait.name).join(' · '),
  };
}

function stakeholderCounts(state: Pick<GameState, 'consequenceState'>): {
  activeObligationCount: number;
  dominantStakeholderKind?: string;
  persistentStakeholderKinds: string[];
} {
  const kindCounts = new Map<string, number>();
  for (const obligation of Object.values(state.consequenceState.obligations ?? {})) {
    if (obligation.status !== 'active') continue;
    for (const entity of [obligation.creditor, obligation.debtor]) {
      if (!entity?.kind || entity.kind === 'scout') continue;
      kindCounts.set(entity.kind, (kindCounts.get(entity.kind) ?? 0) + 1);
    }
  }

  for (const memory of Object.values(state.consequenceState.memories ?? {})) {
    if ((memory.salience ?? 0) < 40) continue;
    const kind = memory.stakeholder?.kind;
    if (!kind || kind === 'scout') continue;
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }

  const ordered = [...kindCounts.entries()].sort((left, right) =>
    right[1] - left[1] || left[0].localeCompare(right[0]),
  );

  return {
    activeObligationCount: Object.values(state.consequenceState.obligations ?? {}).filter(
      (obligation) => obligation.status === 'active',
    ).length,
    dominantStakeholderKind: ordered[0]?.[0],
    persistentStakeholderKinds: ordered.slice(0, 3).map(([kind]) => kind),
  };
}

function safeTerritorySnapshot(
  state: Pick<
    GameState,
    | 'assistantScouts'
    | 'contacts'
    | 'countries'
    | 'currentSeason'
    | 'currentWeek'
    | 'finances'
    | 'npcScouts'
    | 'regionalKnowledge'
    | 'rivalOrganizationState'
    | 'scout'
  >,
): CareerFingerprintAuthority['territory'] | undefined {
  try {
    const territory = deriveTerritorialStrategy(state as GameState);
    return {
      posture: territory.posture,
      primaryCountryId: territory.primaryCountryId,
      coveredCountryCount: territory.coveredCountryCount,
      deepCountryCount: territory.deepCountryCount,
      contestedCountryIds: territory.contestedCountryIds,
      staleCountryIds: territory.staleCountryIds,
    };
  } catch {
    return undefined;
  }
}

export function deriveCareerFingerprintAuthority(
  state: Pick<
    GameState,
    | 'careerEraDirectorState'
    | 'careerRecovery'
    | 'consequenceState'
    | 'currentSeason'
    | 'currentWeek'
    | 'regionalKnowledge'
    | 'rivalOrganizationState'
    | 'runManifest'
    | 'scout'
    | 'countries'
    | 'contacts'
    | 'finances'
    | 'assistantScouts'
    | 'npcScouts'
  >,
): CareerFingerprintAuthority {
  const territory = safeTerritorySnapshot(state);
  const activeOrganizationId = state.rivalOrganizationState.currentPressure.sourceOrganizationId;
  const activeOrganization = activeOrganizationId
    ? state.rivalOrganizationState.organizations[activeOrganizationId]
    : undefined;
  const relationshipFront = stakeholderCounts(state);
  const currentRecovery = state.careerRecovery?.current;

  return {
    careerPath: state.scout.careerPath,
    careerTier: state.scout.careerTier,
    originId: state.runManifest.originId,
    doctrineIds: state.runManifest.doctrineIds,
    worldTraitIds: state.runManifest.worldTraitIds,
    currentEra: state.careerEraDirectorState?.current
      ? {
          theme: state.careerEraDirectorState.current.theme,
          title: state.careerEraDirectorState.current.title,
          primaryCountryId: state.careerEraDirectorState.current.primaryCountryId,
        }
      : undefined,
    activeRecovery: currentRecovery
      ? currentRecovery.status === 'awaitingChoice' || currentRecovery.status === 'active'
      : false,
    territory,
    rivalry: activeOrganization
      ? {
          organizationName: activeOrganization.name,
          pressureBand: territory?.contestedCountryIds.includes(territory.primaryCountryId ?? '')
            ? 'contested'
            : 'watched',
          momentum: activeOrganization.momentum,
        }
      : undefined,
    relationships: relationshipFront,
  };
}

export function deriveCareerFingerprintProjection(
  authority: CareerFingerprintAuthority,
): CareerFingerprintProjection {
  const identity = summarizeIdentity(authority);
  const world = summarizeWorld(authority);
  const thread = threadValue(authority);
  const territory = territoryValue(authority.territory);
  const pressure = pressureValue(authority);

  const labels: CareerFingerprintLabel[] = [
    {
      id: 'identity',
      label: 'Identity',
      value: identity.title,
      detail: identity.detail,
      tone: 'sky',
    },
    {
      id: 'world',
      label: 'World',
      value: world.value,
      detail: world.detail,
      tone: 'violet',
    },
    {
      id: 'thread',
      label: 'Current thread',
      value: thread.value,
      detail: thread.detail,
      tone: thread.tone,
    },
    {
      id: 'territory',
      label: 'Territory',
      value: territory.value,
      detail: territory.detail,
      tone: territory.tone,
    },
    {
      id: 'pressure',
      label: 'Live front',
      value: pressure.value,
      detail: pressure.detail,
      tone: pressure.tone,
    },
  ];

  const comparisonKey = [
    authority.careerPath,
    authority.careerTier,
    authority.originId ?? 'no-origin',
    ...(authority.doctrineIds ?? []),
    ...(authority.worldTraitIds ?? []),
    authority.currentEra?.theme ?? (authority.activeRecovery ? 'recovery' : 'open'),
    authority.territory?.posture ?? 'unformed',
    authority.territory?.primaryCountryId ?? 'no-primary-country',
    authority.rivalry?.organizationName ?? 'no-rival-front',
    authority.relationships?.dominantStakeholderKind ?? 'no-stakeholder-front',
  ]
    .map((value) => normalizeLabelValue(String(value)))
    .join('|');

  return {
    title: identity.title,
    summary: `${identity.title} operating through ${territory.value.toLowerCase()}, with ${thread.value.toLowerCase()} defining the current chapter and ${pressure.value.toLowerCase()} shaping the pressure.`,
    labels,
    comparisonKey,
    fingerprintId: stableFingerprint(comparisonKey),
  };
}
