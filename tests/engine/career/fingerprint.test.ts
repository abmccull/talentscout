import { describe, expect, it } from 'vitest';

import type { GameState } from '@/engine/core/types';
import {
  deriveCareerFingerprintAuthority,
  deriveCareerFingerprintProjection,
} from '@/engine/career/fingerprint';

describe('career fingerprint projection', () => {
  it('builds a stable, player-facing projection from narrow authority', () => {
    const projection = deriveCareerFingerprintProjection({
      careerPath: 'club',
      careerTier: 3,
      originId: 'former-player',
      doctrineIds: ['contrarian-eye'],
      worldTraitIds: ['thin-crop', 'scout-wars', 'cautious-market'],
      currentEra: {
        theme: 'territoryBuild',
        title: 'Earn the territory',
        primaryCountryId: 'brazil',
      },
      territory: {
        posture: 'specialist',
        primaryCountryId: 'brazil',
        coveredCountryCount: 1,
        deepCountryCount: 1,
        contestedCountryIds: ['brazil'],
        staleCountryIds: [],
      },
      rivalry: {
        organizationName: 'Future XI Alliance',
        pressureBand: 'closing',
        momentum: 4,
      },
      relationships: {
        activeObligationCount: 1,
        dominantStakeholderKind: 'family',
        persistentStakeholderKinds: ['family', 'journalist'],
      },
    });

    expect(projection.title).toBe('Contrarian Eye');
    expect(projection.labels.find((label) => label.id === 'territory')?.value).toBe('Specialist in Brazil');
    expect(projection.labels.find((label) => label.id === 'pressure')?.value).toContain('Future XI Alliance');
    expect(projection.summary).toContain('earn the territory');
    expect(projection.comparisonKey).toContain('contrarian-eye');
    expect(projection.fingerprintId).toHaveLength(16);
    expect(projection.summary).not.toMatch(/seed|true ability|hidden/i);
  });

  it('derives stakeholder and territorial fronts from visible game state', () => {
    const state = {
      runManifest: {
        originId: 'grassroots-organizer',
        doctrineIds: ['relationships-first'],
        worldTraitIds: ['golden-generation', 'trusted-circuit', 'boom-bust-market'],
      },
      scout: {
        careerPath: 'independent',
        careerTier: 4,
      },
      careerEraDirectorState: {
        current: {
          theme: 'relationshipDebt',
          title: 'Promises are becoming leverage',
          primaryCountryId: 'portugal',
        },
      },
      careerRecovery: undefined,
      consequenceState: {
        obligations: {
          one: {
            id: 'one',
            status: 'active',
            debtor: { kind: 'scout', id: 'you' },
            creditor: { kind: 'family', id: 'family-1' },
          },
          two: {
            id: 'two',
            status: 'fulfilled',
            debtor: { kind: 'scout', id: 'you' },
            creditor: { kind: 'journalist', id: 'press-1' },
          },
        },
        memories: {
          one: {
            id: 'memory-1',
            stakeholder: { kind: 'family', id: 'family-1' },
            salience: 64,
          },
          two: {
            id: 'memory-2',
            stakeholder: { kind: 'journalist', id: 'press-1' },
            salience: 51,
          },
        },
      },
      rivalOrganizationState: {
        currentPressure: {},
        organizations: {},
      },
      currentSeason: 4,
      currentWeek: 12,
      regionalKnowledge: {
        portugal: { countryId: 'portugal', knowledgeLevel: 72, knowledgeLedger: [] },
      },
      countries: ['portugal', 'spain'],
      contacts: {},
      finances: {
        employees: [],
      },
      assistantScouts: [],
      npcScouts: {},
    } as unknown as Pick<
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
    >;

    const authority = deriveCareerFingerprintAuthority(state);

    expect(authority.careerPath).toBe('independent');
    expect(authority.currentEra?.title).toBe('Promises are becoming leverage');
    expect(authority.relationships?.activeObligationCount).toBe(1);
    expect(authority.relationships?.dominantStakeholderKind).toBe('family');
    expect(authority.relationships?.persistentStakeholderKinds).toEqual(['family', 'journalist']);
  });

  it('lets recovery override the normal career thread label', () => {
    const projection = deriveCareerFingerprintProjection({
      careerPath: 'club',
      careerTier: 5,
      activeRecovery: true,
      territory: {
        posture: 'network',
        primaryCountryId: 'england',
        coveredCountryCount: 3,
        deepCountryCount: 1,
        contestedCountryIds: [],
        staleCountryIds: ['spain'],
      },
      relationships: {
        activeObligationCount: 0,
        persistentStakeholderKinds: [],
      },
    });

    expect(projection.labels.find((label) => label.id === 'thread')).toMatchObject({
      value: 'Comeback chapter',
      tone: 'red',
    });
  });
});
