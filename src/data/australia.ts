/**
 * Static world data for the Australian football pyramid.
 *
 * All club names are clearly fictional but inspired by Australian soccer
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. A-League Men clubs are 20-40.
 * Secondary country: generates clubs and players but does NOT simulate
 * fixtures or offer career positions.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// A-League Men (12 clubs, reputation 20-40)
// ---------------------------------------------------------------------------

const A_LEAGUE_CLUBS: ClubData[] = [
  {
    id: 'club-sydney-fc',
    name: 'Sydney FC',
    shortName: 'SYD',
    reputation: 40,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 10,
    budget: 10_000_000,
  },
  {
    id: 'club-melbourne-victory',
    name: 'Melbourne Victory',
    shortName: 'MLV',
    reputation: 38,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 10,
    budget: 9_000_000,
  },
  {
    id: 'club-western-sydney-wanderers',
    name: 'Western Sydney Wanderers',
    shortName: 'WSW',
    reputation: 36,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 8_000_000,
  },
  {
    id: 'club-melbourne-city',
    name: 'Melbourne City',
    shortName: 'MLC',
    reputation: 38,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 10,
    budget: 9_500_000,
  },
  {
    id: 'club-brisbane-roar',
    name: 'Brisbane Roar',
    shortName: 'BRR',
    reputation: 33,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 6_000_000,
  },
  {
    id: 'club-central-coast-mariners',
    name: 'Central Coast Mariners',
    shortName: 'CCM',
    reputation: 30,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 4_500_000,
  },
  {
    id: 'club-adelaide-united',
    name: 'Adelaide United',
    shortName: 'ADU',
    reputation: 31,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 5_000_000,
  },
  {
    id: 'club-perth-glory',
    name: 'Perth Glory',
    shortName: 'PGL',
    reputation: 29,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 7,
    budget: 4_000_000,
  },
  {
    id: 'club-wellington-phoenix',
    name: 'Wellington Phoenix',
    shortName: 'WPN',
    reputation: 27,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 7,
    budget: 3_500_000,
  },
  {
    id: 'club-newcastle-jets-au',
    name: 'Newcastle Jets AU',
    shortName: 'NJA',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 2_500_000,
  },
  {
    id: 'club-macarthur-fc',
    name: 'Macarthur FC',
    shortName: 'MAC',
    reputation: 23,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 6,
    budget: 2_000_000,
  },
  {
    id: 'club-western-united',
    name: 'Western United',
    shortName: 'WUN',
    reputation: 20,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_000_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const AUSTRALIA_LEAGUES: LeagueData[] = [
  {
    id: 'league-a-league',
    name: 'A-League Men',
    shortName: 'ALM',
    tier: 1,
    clubs: A_LEAGUE_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools (diverse Australian names: Anglo, Celtic, multicultural)
// ---------------------------------------------------------------------------

export const AUSTRALIAN_FIRST_NAMES: string[] = [
  // Anglo / general Australian
  'Ryan', 'Aaron', 'Mat', 'Jackson', 'Harry', 'Mathew', 'Awer', 'Thomas',
  'Bailey', 'Kye', 'Adam', 'Martin', 'Mitchell', 'Joel', 'Nikita',
  'Brandon', 'Jamie', 'Chris', 'Nathan', 'Scott',
  // Celtic / European-Australian
  'Rhyan', 'Patrick', 'Liam', 'Sean', 'Brendan', 'Callum', 'Kyle', 'Angus',
  'Duncan', 'Hamish', 'James', 'Daniel', 'Luke', 'Andrew', 'Mark',
  // Multicultural Australian
  'Aziz', 'Kusini', 'Denis', 'Nestory', 'Emmanuel', 'Jamie', 'Kwame', 'Socceroo',
  'Vince', 'Marco', 'Ivan', 'Nikola', 'Stefan', 'Bojan', 'Tomi',
  // Modern Australian soccer generation
  'Riley', 'Corey', 'Keanu', 'Tyler', 'Jordan', 'Dylan', 'Ethan', 'Connor',
  'Logan', 'Mason', 'Caleb', 'Hunter', 'Cameron', 'Blake', 'Austin',
];

export const AUSTRALIAN_LAST_NAMES: string[] = [
  'Ryan', 'Mooy', 'Rogic', 'Leckie', 'Mabil', 'Souttar', 'Irvine', 'Wright',
  'Sainsbury', 'Degenek', 'Karacic', 'Smith', 'Jones', 'Brown', 'Taylor',
  'Williams', 'Johnson', 'Wilson', 'Anderson', 'Thomas', 'Jackson', 'White',
  'Harris', 'Martin', 'Thompson', 'Robinson', 'Walker', 'Hall', 'Allen',
  'Young', 'King', 'Scott', 'Green', 'Baker', 'Nelson', 'Carter',
  'Tillio', 'Nabbout', 'Vidosic', 'Jedinak', 'Cahill', 'Kewell', 'Schwarzer',
  'Chipperfield', 'Emerton', 'Neill', 'Muscat', 'Popovic', 'Skoko', 'Aloisi',
  'Kennedy', 'Bresciano', 'Valeri', 'Troisi', 'Duke', 'Burns', 'MacLaren',
  'Boyle', 'Elsey', 'Petratos', 'McGree',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const AUSTRALIA_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  English: [
    'Jack', 'Harry', 'James', 'Oliver', 'George', 'Charlie', 'William', 'Noah',
    'Alfie', 'Freddie', 'Archie', 'Oscar', 'Henry', 'Leo', 'Theo',
  ],
  NewZealander: [
    'Chris', 'Winston', 'Ryan', 'Marco', 'Liberato', 'Kosta', 'Michael', 'Joe',
    'Shane', 'Tommy', 'Ben', 'Liam', 'Sam', 'Alex', 'Jordan',
  ],
};

export const AUSTRALIA_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  English: [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller',
    'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris',
  ],
  NewZealander: [
    'Wood', 'Singh', 'Reid', 'Thomas', 'Cacace', 'Stamenic', 'Just', 'Bell',
    'Payne', 'James', 'Walker', 'Murphy', 'Martin', 'Lewis', 'Hill',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const AUSTRALIA_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Australian', weight: 78 },
    { nationality: 'English', weight: 6 },
    { nationality: 'NewZealander', weight: 4 },
    { nationality: 'Serbian', weight: 3 },
    { nationality: 'Scottish', weight: 3 },
    { nationality: 'Japanese', weight: 3 },
    { nationality: 'Croatian', weight: 3 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const AUSTRALIA_DATA: CountryData = {
  key: 'australia',
  name: 'Australia',
  leagues: AUSTRALIA_LEAGUES,
  nativeNamePool: {
    firstNames: AUSTRALIAN_FIRST_NAMES,
    lastNames: AUSTRALIAN_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(AUSTRALIA_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: AUSTRALIA_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: AUSTRALIA_NATIONALITIES_BY_TIER,
  secondary: true,
};
