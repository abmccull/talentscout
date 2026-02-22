/**
 * Static world data for the New Zealand football pyramid.
 *
 * All club names are clearly fictional but inspired by New Zealand soccer
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. New Zealand Football Championship clubs are 10-25.
 * Secondary country: generates clubs and players but does NOT simulate
 * fixtures or offer career positions.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// New Zealand Football Championship (8 clubs, reputation 10-25)
// ---------------------------------------------------------------------------

const NZFC_CLUBS: ClubData[] = [
  {
    id: 'club-auckland-united-fc',
    name: 'Auckland United FC',
    shortName: 'AUF',
    reputation: 25,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 6,
    budget: 2_000_000,
  },
  {
    id: 'club-wellington-olympic',
    name: 'Wellington Olympic',
    shortName: 'WOL',
    reputation: 22,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_500_000,
  },
  {
    id: 'club-canterbury-united',
    name: 'Canterbury United',
    shortName: 'CAU',
    reputation: 20,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_200_000,
  },
  {
    id: 'club-christchurch-dragons',
    name: 'Christchurch Dragons',
    shortName: 'CDR',
    reputation: 18,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 4,
    budget: 900_000,
  },
  {
    id: 'club-hawkes-bay-united',
    name: "Hawke's Bay United",
    shortName: 'HBU',
    reputation: 16,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 700_000,
  },
  {
    id: 'club-tasman-united',
    name: 'Tasman United',
    shortName: 'TSU',
    reputation: 14,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 500_000,
  },
  {
    id: 'club-waikato-fc',
    name: 'Waikato FC',
    shortName: 'WKT',
    reputation: 12,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 350_000,
  },
  {
    id: 'club-southern-united-dunedin',
    name: 'Southern United Dunedin',
    shortName: 'SUD',
    reputation: 10,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 2,
    budget: 200_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const NEW_ZEALAND_LEAGUES: LeagueData[] = [
  {
    id: 'league-nzfc',
    name: 'New Zealand Football Championship',
    shortName: 'NZC',
    tier: 1,
    clubs: NZFC_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools (English / Maori / Pacific Islander diverse NZ names)
// ---------------------------------------------------------------------------

export const NEW_ZEALAND_FIRST_NAMES: string[] = [
  // English / Anglo NZ
  'Chris', 'Winston', 'Ryan', 'Marco', 'Liberato', 'Kosta', 'Michael', 'Joe',
  'Shane', 'Tommy', 'Ben', 'Sam', 'Alex', 'Jordan', 'Liam',
  'James', 'Oliver', 'Noah', 'William', 'Daniel', 'Thomas', 'Luke', 'Nathan',
  'Cameron', 'Dylan', 'Ethan', 'Logan', 'Mason', 'Connor', 'Tyler',
  // Maori names
  'Tane', 'Rangi', 'Hemi', 'Te Koha', 'Paora', 'Mere', 'Wiremu', 'Tipene',
  'Reuben', 'Matiu', 'Piripi', 'Tamati', 'Korey', 'Maia', 'Eru',
  // Pacific Islander NZ
  'Sione', 'Tevita', 'Isaia', 'Filipo', 'Manu', 'Tama', 'Vea', 'Josaia',
  'Salesi', 'Sefa', 'Ioane', 'Peni', 'Lima', 'Apo', 'Fiti',
];

export const NEW_ZEALAND_LAST_NAMES: string[] = [
  'Wood', 'Singh', 'Reid', 'Thomas', 'Cacace', 'Stamenic', 'Just', 'Bell',
  'Payne', 'James', 'Walker', 'Murphy', 'Martin', 'Lewis', 'Hill',
  'Smith', 'Jones', 'Brown', 'Taylor', 'Williams', 'Johnson', 'Wilson',
  'Anderson', 'Moore', 'Davis', 'Miller', 'White', 'Harris', 'Clark', 'Young',
  // Maori surnames
  'Tuilagi', 'Ngatai', 'Hapi', 'Parata', 'Ngata', 'Tane', 'Rangi', 'Waititi',
  'Takarangi', 'Puketapu', 'Ngarimu', 'Tūhoe', 'Heke', 'Tūhoe', 'Rewiti',
  // Pacific Islander surnames
  'Faleolo', 'Tofilau', 'Mafi', 'Taufa', 'Fifita', 'Latu', 'Vasilagi',
  'Sopoaga', 'Lomu', 'Umaga', 'Tuilagi', 'Naseri', 'Fono', 'Tama', 'Vaea',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const NEW_ZEALAND_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Australian: [
    'Ryan', 'Aaron', 'Mat', 'Jackson', 'Harry', 'Mathew', 'Thomas', 'Bailey',
    'Adam', 'Martin', 'Mitchell', 'Joel', 'Brandon', 'Jamie', 'Chris',
  ],
  Fijian: [
    'Roy', 'Simione', 'Setareki', 'Epeli', 'Waisea', 'Josua', 'Napolioni',
    'Jale', 'Radike', 'Leone',
  ],
};

export const NEW_ZEALAND_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Australian: [
    'Ryan', 'Mooy', 'Rogic', 'Leckie', 'Mabil', 'Souttar', 'Irvine', 'Wright',
    'Sainsbury', 'Degenek', 'Karacic', 'Smith', 'Jones', 'Brown', 'Taylor',
  ],
  Fijian: [
    'Krishna', 'Rokoduguni', 'Radrodro', 'Naseri', 'Kolinisau', 'Tailevu',
    'Donu', 'Goneva', 'Kunatani', 'Nakarawa',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const NEW_ZEALAND_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'NewZealander', weight: 82 },
    { nationality: 'Australian', weight: 5 },
    { nationality: 'Fijian', weight: 4 },
    { nationality: 'Samoan', weight: 3 },
    { nationality: 'English', weight: 3 },
    { nationality: 'Tongan', weight: 3 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const NEW_ZEALAND_DATA: CountryData = {
  key: 'newzealand',
  name: 'New Zealand',
  leagues: NEW_ZEALAND_LEAGUES,
  nativeNamePool: {
    firstNames: NEW_ZEALAND_FIRST_NAMES,
    lastNames: NEW_ZEALAND_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(NEW_ZEALAND_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: NEW_ZEALAND_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: NEW_ZEALAND_NATIONALITIES_BY_TIER,
  secondary: true,
};
