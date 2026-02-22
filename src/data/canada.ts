/**
 * Static world data for the Canadian football pyramid.
 *
 * All club names are clearly fictional but inspired by Canadian cities and
 * football geography. No real club names are used.
 *
 * Reputation scale: 1–100. CPL clubs are 15-35.
 * secondary: true — generates clubs and players but does NOT simulate fixtures.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Canadian Premier League (8 clubs, reputation 15-35)
// ---------------------------------------------------------------------------

const CPL_CLUBS: ClubData[] = [
  {
    id: 'club-pacific-coast-fc',
    name: 'Pacific Coast FC',
    shortName: 'PCF',
    reputation: 35,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 5_000_000,
  },
  {
    id: 'club-prairie-fire',
    name: 'Prairie Fire',
    shortName: 'PRF',
    reputation: 30,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 3_500_000,
  },
  {
    id: 'club-ottawa-capitals',
    name: 'Ottawa Capitals',
    shortName: 'OTC',
    reputation: 32,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 9,
    budget: 4_000_000,
  },
  {
    id: 'club-forge-hamilton',
    name: 'Forge Hamilton',
    shortName: 'FGH',
    reputation: 34,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 10,
    budget: 4_500_000,
  },
  {
    id: 'club-cavalry-calgary',
    name: 'Cavalry Calgary',
    shortName: 'CVC',
    reputation: 28,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 2_500_000,
  },
  {
    id: 'club-york-lions',
    name: 'York Lions',
    shortName: 'YKL',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 2_000_000,
  },
  {
    id: 'club-halifax-wanderers',
    name: 'Halifax Wanderers',
    shortName: 'HFX',
    reputation: 20,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 6,
    budget: 1_000_000,
  },
  {
    id: 'club-valour-winnipeg',
    name: 'Valour Winnipeg',
    shortName: 'VLW',
    reputation: 15,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 500_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const CANADA_LEAGUES: LeagueData[] = [
  {
    id: 'league-cpl',
    name: 'Canadian Premier League',
    shortName: 'CPL',
    tier: 1,
    clubs: CPL_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools (English and French Canadian names)
// ---------------------------------------------------------------------------

export const CANADIAN_FIRST_NAMES: string[] = [
  // English Canadian
  'Alphonso', 'Jonathan', 'Cyle', 'Scott', 'Liam', 'Lucas', 'Richie',
  'Sam', 'David', 'Tajon', 'Derek', 'Marcus', 'Stephen', 'Ike', 'Ali',
  'Theo', 'Jacob', 'Nathan', 'Tyler', 'Ryan',
  // French Canadian
  'Jean-Philippe', 'Antoine', 'Nicolas', 'François', 'Marc', 'Pierre',
  'Olivier', 'Mathieu', 'Simon', 'Maxime', 'Guillaume', 'Alexis', 'Étienne',
  'Charles', 'Vincent', 'Hugo', 'Raphaël', 'Gabriel', 'Benjamin', 'Julien',
  // Diverse Canadian
  'Ballou', 'Milan', 'Kamal', 'Mark-Anthony', 'Tesho', 'Doneil', 'Mauro',
  'Junior', 'Marco', 'Raheem', 'Tristan', 'Kareem', 'Omar', 'Andre', 'Patrick',
  'James', 'Connor', 'Kyle', 'Blake', 'Aidan',
];

export const CANADIAN_LAST_NAMES: string[] = [
  // Anglo Canadian
  'Davies', 'David', 'Larin', 'Arfield', 'Millar', 'Cavallini', 'Hutchinson',
  'Eustaquio', 'Kaye', 'Buchanan', 'Johnston', 'Murray', 'Wilson', 'Fraser',
  'Campbell', 'MacKenzie', 'MacDonald', 'Stewart', 'Thomson', 'Reid',
  // French Canadian
  'Tremblay', 'Gagnon', 'Roy', 'Côté', 'Bouchard', 'Gauthier', 'Morin',
  'Lavoie', 'Fortin', 'Gagné', 'Pelletier', 'Ouellet', 'Bélanger', 'Leblanc',
  'Lapointe', 'Perron', 'Paradis', 'Bergeron', 'Desrosiers', 'Mercier',
  // Diverse Canadian
  'Tabla', 'Godinho', 'Cornelius', 'Osorio', 'Anthony', 'Kone', 'Vitoria',
  'Akindele', 'Henry', 'James', 'Charles', 'Thomas', 'Harris', 'Scott',
  'Walker', 'Brown', 'Clark', 'Lewis', 'Taylor', 'White',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const CANADA_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  American: [
    'Tyler', 'Jordan', 'Kyle', 'Landon', 'Cody', 'Ryan', 'Ethan', 'Logan',
    'Mason', 'Caleb', 'Aaron', 'Brandon', 'Dylan', 'Cameron', 'Nathan',
    'Christian', 'Hunter', 'Connor', 'Zachary', 'Trevor',
  ],
  Jamaican: [
    'Leon', 'Shaun', 'Jobi', 'Rolando', 'Damion', 'Lamar', 'Ravel',
    'Kemar', 'Bobby', 'Jermaine', 'Oniel', 'Je-Vaughn', 'Alvas',
    'Daniel', 'Romario',
  ],
  English: [
    'Harry', 'Jack', 'James', 'George', 'Oliver', 'Liam', 'Noah',
    'William', 'Alfie', 'Charlie', 'Thomas', 'Ethan', 'Mason', 'Logan',
    'Lucas',
  ],
};

export const CANADA_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  American: [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller',
    'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White',
    'Harris', 'Martin', 'Thompson', 'Garcia', 'Martinez', 'Robinson',
  ],
  Jamaican: [
    'Bailey', 'Morrison', 'Lowe', 'Ricketts', 'Donaldson', 'Palmer', 'McAnuff',
    'Ferguson', 'Watson', 'Campbell', 'Stewart', 'Brown', 'Allen', 'King',
    'Powell',
  ],
  English: [
    'Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson',
    'Davies', 'Robinson', 'Wright', 'Thompson', 'Evans', 'Walker', 'White',
    'Roberts',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const CANADA_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Canadian', weight: 80 },
    { nationality: 'American', weight: 6 },
    { nationality: 'Jamaican', weight: 4 },
    { nationality: 'English', weight: 3 },
    { nationality: 'French', weight: 3 },
    { nationality: 'Haitian', weight: 2 },
    { nationality: 'Nigerian', weight: 2 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const CANADA_DATA: CountryData = {
  key: 'canada',
  name: 'Canada',
  leagues: CANADA_LEAGUES,
  nativeNamePool: {
    firstNames: CANADIAN_FIRST_NAMES,
    lastNames: CANADIAN_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(CANADA_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: CANADA_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: CANADA_NATIONALITIES_BY_TIER,
  secondary: true,
};
