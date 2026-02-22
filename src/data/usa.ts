/**
 * Static world data for the US football pyramid.
 *
 * All club names are clearly fictional but inspired by US soccer geography
 * and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. MLS clubs are 25-55.
 * secondary: true — generates clubs and players but does NOT simulate fixtures.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Major League Soccer (16 clubs, reputation 25-55)
// ---------------------------------------------------------------------------

const MLS_CLUBS: ClubData[] = [
  {
    id: 'club-liberty-fc',
    name: 'Liberty FC',
    shortName: 'LIB',
    reputation: 55,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 14,
    budget: 30_000_000,
  },
  {
    id: 'club-pacific-stars',
    name: 'Pacific Stars',
    shortName: 'PST',
    reputation: 52,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 13,
    budget: 26_000_000,
  },
  {
    id: 'club-capital-united',
    name: 'Capital United',
    shortName: 'CAP',
    reputation: 50,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 12,
    budget: 24_000_000,
  },
  {
    id: 'club-phoenix-rising',
    name: 'Phoenix Rising',
    shortName: 'PHR',
    reputation: 48,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 11,
    budget: 20_000_000,
  },
  {
    id: 'club-lone-star-fc',
    name: 'Lone Star FC',
    shortName: 'LSF',
    reputation: 46,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 10,
    budget: 18_000_000,
  },
  {
    id: 'club-empire-city-fc',
    name: 'Empire City FC',
    shortName: 'ECF',
    reputation: 53,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 13,
    budget: 28_000_000,
  },
  {
    id: 'club-great-lakes-united',
    name: 'Great Lakes United',
    shortName: 'GLU',
    reputation: 42,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 14_000_000,
  },
  {
    id: 'club-rocky-mountain-fc',
    name: 'Rocky Mountain FC',
    shortName: 'RMF',
    reputation: 40,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 12_000_000,
  },
  {
    id: 'club-bayou-storm',
    name: 'Bayou Storm',
    shortName: 'BYS',
    reputation: 38,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 10_000_000,
  },
  {
    id: 'club-golden-gate-fc',
    name: 'Golden Gate FC',
    shortName: 'GGF',
    reputation: 50,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 12,
    budget: 22_000_000,
  },
  {
    id: 'club-midwest-thunder',
    name: 'Midwest Thunder',
    shortName: 'MWT',
    reputation: 36,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 9_000_000,
  },
  {
    id: 'club-cascadia-wolves',
    name: 'Cascadia Wolves',
    shortName: 'CSW',
    reputation: 44,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 11,
    budget: 16_000_000,
  },
  {
    id: 'club-desert-coyotes',
    name: 'Desert Coyotes',
    shortName: 'DSC',
    reputation: 33,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 7,
    budget: 7_000_000,
  },
  {
    id: 'club-harbor-city-fc',
    name: 'Harbor City FC',
    shortName: 'HCF',
    reputation: 35,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 8_000_000,
  },
  {
    id: 'club-bluegrass-rovers',
    name: 'Bluegrass Rovers',
    shortName: 'BGR',
    reputation: 28,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 4_000_000,
  },
  {
    id: 'club-atlantic-wave',
    name: 'Atlantic Wave',
    shortName: 'ATW',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 2_000_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const USA_LEAGUES: LeagueData[] = [
  {
    id: 'league-mls',
    name: 'Major League Soccer',
    shortName: 'MLS',
    tier: 1,
    clubs: MLS_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools (diverse American names: Anglo, Hispanic, African-American)
// ---------------------------------------------------------------------------

export const AMERICAN_FIRST_NAMES: string[] = [
  // Anglo / general American
  'Tyler', 'Jordan', 'Kyle', 'Landon', 'Cody', 'Ryan', 'Ethan', 'Logan',
  'Mason', 'Caleb', 'Aaron', 'Brandon', 'Dylan', 'Cameron', 'Nathan',
  'Christian', 'Hunter', 'Connor', 'Zachary', 'Trevor',
  // Hispanic-American
  'Miguel', 'Carlos', 'Diego', 'Alejandro', 'Luis', 'Jorge', 'Ricardo',
  'Andres', 'Fernando', 'Jose', 'Angel', 'Hector', 'Ernesto', 'Marco',
  // African-American
  'DeAndre', 'Jozy', 'DaMarcus', 'Freddy', 'Oguchi', 'Clint', 'Eddie',
  'Terrence', 'Jermaine', 'Quincy', 'Dax', 'Reggie', 'Darlington', 'Gyasi',
  // Mixed / modern American
  'Tyler', 'Josh', 'Matt', 'Chris', 'Sean', 'Patrick', 'Michael', 'Kevin',
  'Timothy', 'Andrew', 'Nicholas', 'Jonathan', 'Daniel', 'Austin', 'Blake',
  'Carter', 'Weston', 'Brenden', 'Gio', 'Julian',
];

export const AMERICAN_LAST_NAMES: string[] = [
  // Anglo surnames
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller',
  'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White',
  'Harris', 'Martin', 'Thompson', 'Garcia', 'Martinez', 'Robinson',
  // Hispanic surnames
  'Rodriguez', 'Lopez', 'Gonzalez', 'Perez', 'Sanchez', 'Ramirez', 'Torres',
  'Flores', 'Rivera', 'Gomez', 'Diaz', 'Reyes', 'Cruz', 'Morales', 'Ortiz',
  // African-American surnames
  'Bradley', 'Onyewu', 'Beasley', 'Dempsey', 'Agudelo', 'Altidore', 'Davies',
  'Zardes', 'Pulisic', 'Adams', 'McKennie', 'Weah', 'Musah', 'Reyna',
  // General American
  'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Scott', 'Green',
  'Baker', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner',
  'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const USA_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Mexican: [
    'Hirving', 'Raúl', 'Guillermo', 'Javier', 'Andrés', 'Héctor', 'Carlos',
    'Rafael', 'Miguel', 'Luis', 'Jorge', 'José', 'Roberto', 'Diego', 'Erick',
    'Rodolfo', 'Eduardo', 'Víctor', 'Marco', 'Alan',
  ],
  Canadian: [
    'Alphonso', 'Jonathan', 'Cyle', 'Scott', 'Liam', 'Lucas', 'Richie',
    'Sam', 'David', 'Tajon', 'Derek', 'Milan', 'Kamal', 'Stephen', 'Marcus',
    'Ballou', 'Ali', 'Mark-Anthony', 'Theo', 'Ike',
  ],
  Brazilian: [
    'Gabriel', 'Lucas', 'Thiago', 'Felipe', 'Rodrigo', 'Matheus', 'Bruno',
    'Vinicius', 'Casemiro', 'Fabinho', 'Everton', 'Antony', 'Raphinha', 'Fred',
    'Ederson', 'Igor', 'Guilherme', 'Renan', 'Danilo', 'André',
  ],
};

export const USA_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Mexican: [
    'Lozano', 'Jiménez', 'Ochoa', 'Hernández', 'Guardado', 'Morales', 'Vela',
    'Corona', 'Alvarez', 'Rodríguez', 'Torres', 'Ramos', 'González', 'Sánchez',
    'Reyna', 'Flores', 'Herrera', 'Márquez', 'Araujo', 'Salcedo',
  ],
  Canadian: [
    'Davies', 'David', 'Larin', 'Arfield', 'Millar', 'Cavallini', 'Hutchinson',
    'Eustaquio', 'Kaye', 'Buchanan', 'Cornelius', 'Osorio', 'Anthony', 'Kone',
    'Johnston', 'Tabla', 'Godinho', 'McKenzie', 'Vitoria', 'Murray',
  ],
  Brazilian: [
    'Silva', 'Santos', 'Oliveira', 'Costa', 'Souza', 'Pereira', 'Lima',
    'Ferreira', 'Rodrigues', 'Alves', 'Militão', 'Marquinhos', 'Paquetá',
    'Arthur', 'Barbosa', 'Araújo', 'Nascimento', 'Luiz', 'Moura', 'Gomes',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const USA_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'American', weight: 78 },
    { nationality: 'Mexican', weight: 8 },
    { nationality: 'Brazilian', weight: 4 },
    { nationality: 'Argentine', weight: 3 },
    { nationality: 'Canadian', weight: 3 },
    { nationality: 'English', weight: 2 },
    { nationality: 'European', weight: 2 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const USA_DATA: CountryData = {
  key: 'usa',
  name: 'USA',
  leagues: USA_LEAGUES,
  nativeNamePool: {
    firstNames: AMERICAN_FIRST_NAMES,
    lastNames: AMERICAN_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(USA_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: USA_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: USA_NATIONALITIES_BY_TIER,
  secondary: true,
};
