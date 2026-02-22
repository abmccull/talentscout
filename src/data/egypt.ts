/**
 * Static world data for the Egyptian football pyramid.
 *
 * All club names are clearly fictional but inspired by Egyptian football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. Egyptian Premier League clubs are 20-50.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Egyptian Premier League (12 clubs, reputation 20-50)
// ---------------------------------------------------------------------------

const EGYPTIAN_PREMIER_LEAGUE_CLUBS: ClubData[] = [
  {
    id: 'club-al-ahly-eagles',
    name: 'Al Ahly Eagles',
    shortName: 'AAE',
    reputation: 50,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 16,
    budget: 10_000_000,
  },
  {
    id: 'club-zamalek-whites',
    name: 'Zamalek Whites',
    shortName: 'ZAW',
    reputation: 47,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 15,
    budget: 8_000_000,
  },
  {
    id: 'club-pyramids-fc',
    name: 'Pyramids FC',
    shortName: 'PYR',
    reputation: 44,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 12,
    budget: 7_000_000,
  },
  {
    id: 'club-ismaily-yellow',
    name: 'Ismaily Yellow',
    shortName: 'ISY',
    reputation: 40,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 12,
    budget: 4_000_000,
  },
  {
    id: 'club-ittihad-alexandria',
    name: 'Ittihad Alexandria',
    shortName: 'ITA',
    reputation: 38,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 11,
    budget: 3_500_000,
  },
  {
    id: 'club-ceramica-cleopatra',
    name: 'Ceramica Cleopatra',
    shortName: 'CLC',
    reputation: 35,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 10,
    budget: 3_000_000,
  },
  {
    id: 'club-el-gouna-fc',
    name: 'El Gouna FC',
    shortName: 'EGF',
    reputation: 32,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 2_500_000,
  },
  {
    id: 'club-smouha-sc',
    name: 'Smouha SC',
    shortName: 'SMO',
    reputation: 30,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 2_000_000,
  },
  {
    id: 'club-national-bank-fc',
    name: 'National Bank FC',
    shortName: 'NBF',
    reputation: 28,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 1_500_000,
  },
  {
    id: 'club-future-fc-cairo',
    name: 'Future FC Cairo',
    shortName: 'FFC',
    reputation: 26,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 1_200_000,
  },
  {
    id: 'club-pharco-fc',
    name: 'Pharco FC',
    shortName: 'PHR',
    reputation: 23,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 700_000,
  },
  {
    id: 'club-eastern-company',
    name: 'Eastern Company',
    shortName: 'EAC',
    reputation: 20,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 500_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const EGYPT_LEAGUES: LeagueData[] = [
  {
    id: 'league-egyptian-pl',
    name: 'Egyptian Premier League',
    shortName: 'EPL',
    tier: 1,
    clubs: EGYPTIAN_PREMIER_LEAGUE_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const EGYPTIAN_FIRST_NAMES: string[] = [
  'Mohamed', 'Ahmed', 'Mahmoud', 'Omar', 'Hassan', 'Ali', 'Ibrahim', 'Amr',
  'Tarek', 'Mostafa', 'Salah', 'Trezeguet', 'Sobhi', 'Elneny', 'Hegazi',
  'Kamal', 'Nour', 'Wael', 'Hossam', 'Emad', 'Essam', 'Mido', 'Barakat',
  'Aboutrika', 'Zidan', 'Ghaly', 'Shikabala', 'Geddo', 'Gedo', 'Bassem',
  'Sherif', 'Ramadan', 'Kahraba', 'Afsha', 'Hamdi', 'Magdy', 'Mustafa',
  'Walid', 'Nabil', 'Osama', 'Khaled', 'Youssef', 'Tamer', 'Sami', 'Ashraf',
  'Ehab', 'Gamal', 'Adel', 'Farid', 'Hazem', 'Ismail', 'Saad', 'Samir',
  'Ramy', 'Fathy', 'Abdalla', 'Marwan', 'Ammar', 'Hany', 'Yahya', 'Nasser',
];

export const EGYPTIAN_LAST_NAMES: string[] = [
  'Salah', 'Aboutrika', 'Mido', 'Zidan', 'Ghaly', 'Hegazi', 'Elneny',
  'Hamdy', 'Mosallem', 'Sobhi', 'Trezeguet', 'Shikabala', 'Kahraba',
  'Afsha', 'Hassan', 'Ramadan', 'Farouk', 'Ibrahim', 'El-Neny', 'Geddo',
  'Gaber', 'Fathy', 'Ashour', 'Emam', 'Khalil', 'Kamal', 'Shobeir',
  'El-Hadary', 'Abdel-Shafy', 'Hossam', 'Moustafa', 'Gamal', 'Omar',
  'Wahid', 'Tarek', 'El-Sayed', 'Mahmoud', 'Adly', 'Shaalan', 'Bassem',
  'Mohsen', 'Nabil', 'Ismail', 'Samir', 'Youssef', 'Ahmed', 'Shalaby',
  'Zawawi', 'El-Zaher', 'Khaled', 'Abdel-Aziz', 'Hosny', 'Kassem',
  'El-Shenawy', 'Hamdan', 'Barakat', 'Metwally', 'Sorour', 'Mansour', 'Lotfy',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const EGYPT_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Moroccan: [
    'Hakim', 'Achraf', 'Youssef', 'Sofiane', 'Noureddine', 'Amine', 'Zakaria',
    'Ayoub', 'Abdelhamid', 'Mehdi', 'Munir', 'Noussair', 'Azzedine', 'Fayçal', 'Jawad',
  ],
  Tunisian: [
    'Wahbi', 'Hamza', 'Youssef', 'Dylan', 'Ellyes', 'Montassar', 'Hannibal',
    'Anis', 'Wajdi', 'Saif', 'Anas', 'Ghaylen', 'Moez', 'Naïm', 'Ferjani',
  ],
};

export const EGYPT_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Moroccan: [
    'Ziyech', 'Hakimi', 'En-Nesyri', 'Boufal', 'Amrabat', 'Ounahi', 'Bono',
    'Saïss', 'Mazraoui', 'Aguerd', 'Jabrane', 'Attiat-Allah', 'Sabiri', 'Zaïdouni', 'Cheddira',
  ],
  Tunisian: [
    'Khazri', 'Msakni', 'Ben Yedder', 'Skhiri', 'Talbi', 'Abdi', 'Drager',
    'Bronn', 'Khenissi', 'Sliti', 'Bedoui', 'Jaziri', 'Sassi', 'Chaalali', 'Meriah',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const EGYPT_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Egyptian', weight: 88 },
    { nationality: 'Moroccan', weight: 4 },
    { nationality: 'Tunisian', weight: 3 },
    { nationality: 'Nigerian', weight: 2 },
    { nationality: 'Sudanese', weight: 2 },
    { nationality: 'Algerian', weight: 1 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const EGYPT_DATA: CountryData = {
  key: 'egypt',
  name: 'Egypt',
  leagues: EGYPT_LEAGUES,
  nativeNamePool: {
    firstNames: EGYPTIAN_FIRST_NAMES,
    lastNames: EGYPTIAN_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(EGYPT_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: EGYPT_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: EGYPT_NATIONALITIES_BY_TIER,
  secondary: true,
};
