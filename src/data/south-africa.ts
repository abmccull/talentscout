/**
 * Static world data for the South African football pyramid.
 *
 * All club names are clearly fictional but inspired by South African football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. DStv Premiership clubs are 15-40.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// DStv Premiership (12 clubs, reputation 15-40)
// ---------------------------------------------------------------------------

const DSTV_PREMIERSHIP_CLUBS: ClubData[] = [
  {
    id: 'club-kaizer-chiefs-gold',
    name: 'Kaizer Chiefs Gold',
    shortName: 'KCG',
    reputation: 40,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 13,
    budget: 6_000_000,
  },
  {
    id: 'club-orlando-pirates',
    name: 'Orlando Pirates',
    shortName: 'ORP',
    reputation: 38,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 12,
    budget: 5_000_000,
  },
  {
    id: 'club-mamelodi-sundowns',
    name: 'Mamelodi Sundowns',
    shortName: 'MSD',
    reputation: 40,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 14,
    budget: 6_000_000,
  },
  {
    id: 'club-supersport-united',
    name: 'SuperSport United',
    shortName: 'SSU',
    reputation: 35,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 12,
    budget: 3_500_000,
  },
  {
    id: 'club-cape-town-city',
    name: 'Cape Town City',
    shortName: 'CTC',
    reputation: 33,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 11,
    budget: 3_000_000,
  },
  {
    id: 'club-stellenbosch-fc',
    name: 'Stellenbosch FC',
    shortName: 'STL',
    reputation: 30,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 2_000_000,
  },
  {
    id: 'club-royal-am-durban',
    name: 'Royal AM Durban',
    shortName: 'RAD',
    reputation: 28,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 9,
    budget: 1_800_000,
  },
  {
    id: 'club-sekhukhune-united',
    name: 'Sekhukhune United',
    shortName: 'SKU',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 1_200_000,
  },
  {
    id: 'club-amazulu-fc',
    name: 'AmaZulu FC',
    shortName: 'AZU',
    reputation: 27,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 1_500_000,
  },
  {
    id: 'club-ts-galaxy',
    name: 'TS Galaxy',
    shortName: 'TSG',
    reputation: 20,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 800_000,
  },
  {
    id: 'club-golden-arrows',
    name: 'Golden Arrows',
    shortName: 'GAR',
    reputation: 18,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 500_000,
  },
  {
    id: 'club-chippa-united',
    name: 'Chippa United',
    shortName: 'CHU',
    reputation: 15,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 5,
    budget: 300_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const SOUTH_AFRICA_LEAGUES: LeagueData[] = [
  {
    id: 'league-dstv-premiership',
    name: 'DStv Premiership',
    shortName: 'DSP',
    tier: 1,
    clubs: DSTV_PREMIERSHIP_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const SOUTH_AFRICAN_FIRST_NAMES: string[] = [
  'Siyanda', 'Themba', 'Bongani', 'Keagan', 'Percy', 'Pitso', 'Hlompho',
  'Teko', 'Sibusiso', 'Benni', 'Lucas', 'Aaron', 'Bradley', 'Itumeleng',
  'Andile', 'Lyle', 'Dean', 'Thabo', 'Sifiso', 'Lehlohonolo', 'Aubrey',
  'Nhlanhla', 'Lungisa', 'Sfiso', 'Mothiba', 'Tokelo', 'Lebo', 'Victor',
  'Patrick', 'Kamohelo', 'Deon', 'Siphelele', 'Mduduzi', 'Siyabonga',
  'Ramahlwe', 'Kermit', 'Dolly', 'Thamsanqa', 'Lebohang', 'Rivaldo',
  'Yusuf', 'Haashim', 'Roland', 'Emile', 'Iqraam', 'Riyaad', 'Grant',
  'Abbubaker', 'Ethan', 'Luther', 'Given', 'Innocent', 'Evidence', 'Divine',
  'Talent', 'Brian', 'Fortune', 'Willard', 'Knowledge', 'Wonder', 'Happy',
];

export const SOUTH_AFRICAN_LAST_NAMES: string[] = [
  'Tau', 'Zwane', 'Mokwena', 'Mkhize', 'Zungu', 'Modise', 'Zuma', 'Radebe',
  'Baxter', 'Parker', 'Foster', 'Gordinho', 'Furman', 'Khumalo', 'Bafana',
  'Vilakazi', 'Dlamini', 'Ngcongca', 'Ntanzi', 'Mothiba', 'Hlongwane',
  'Sithole', 'Mabunda', 'Billiat', 'Kutumela', 'Nodada', 'Makgopa',
  'Modiba', 'Phiri', 'Ndlovu', 'Hadebe', 'Shalulile', 'Mnyamane',
  'Mthethwa', 'Jali', 'Dolly', 'Rayners', 'Mosele', 'Nkosi', 'Mathiane',
  'Mahlangu', 'Winfaar', 'Isaacs', 'Christians', 'Booysen', 'Petersen',
  'Fortuin', 'Barker', 'Adams', 'Williams', 'Plaatjies', 'Hendricks',
  'Josephs', 'Damons', 'Maart', 'Mthethwa', 'Shabalala', 'Zulu', 'Mthembu',
  'Ngubane', 'Buthelezi',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const SOUTH_AFRICA_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Zimbabwean: [
    'Knowledge', 'Talent', 'Ovidy', 'Khama', 'Gerald', 'Teenage', 'Knox',
    'Method', 'Divine', 'Rainford', 'Farai', 'Tafadzwa', 'Tinotenda', 'Takudzwa', 'Tonderai',
  ],
  Zambian: [
    'Patson', 'Fashion', 'Enock', 'Augustine', 'Lubambe', 'Kings', 'Mwenya',
    'Kelvin', 'Collins', 'Emmanuel', 'Boyd', 'Lazarous', 'Justin', 'Nathan', 'Isaac',
  ],
};

export const SOUTH_AFRICA_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Zimbabwean: [
    'Musona', 'Billiat', 'Karuru', 'Hadebe', 'Mavhungu', 'Ekhator', 'Mutizwa',
    'Murwira', 'Moyo', 'Mugari', 'Chikwanda', 'Mhango', 'Rusike', 'Katsande', 'Ndlovu',
  ],
  Zambian: [
    'Daka', 'Sakala', 'Mwepu', 'Mbesuma', 'Chibwe', 'Musonda', 'Zimba',
    'Mutale', 'Phiri', 'Njobvu', 'Lungu', 'Silavwe', 'Banda', 'Chitundu', 'Chamanga',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const SOUTH_AFRICA_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'South African', weight: 85 },
    { nationality: 'Zimbabwean', weight: 4 },
    { nationality: 'Zambian', weight: 3 },
    { nationality: 'Mozambican', weight: 3 },
    { nationality: 'Ghanaian', weight: 2 },
    { nationality: 'Nigerian', weight: 2 },
    { nationality: 'Congolese', weight: 1 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const SOUTH_AFRICA_DATA: CountryData = {
  key: 'southafrica',
  name: 'South Africa',
  leagues: SOUTH_AFRICA_LEAGUES,
  nativeNamePool: {
    firstNames: SOUTH_AFRICAN_FIRST_NAMES,
    lastNames: SOUTH_AFRICAN_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(SOUTH_AFRICA_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: SOUTH_AFRICA_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: SOUTH_AFRICA_NATIONALITIES_BY_TIER,
  secondary: true,
};
