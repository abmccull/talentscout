/**
 * Static world data for the Saudi Arabian football pyramid.
 *
 * All club names are clearly fictional but inspired by Saudi Arabian football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. Saudi Pro League clubs are 25-60.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Saudi Pro League (14 clubs, reputation 25-60)
// ---------------------------------------------------------------------------

const SAUDI_PRO_LEAGUE_CLUBS: ClubData[] = [
  {
    id: 'club-al-hilal-crescent',
    name: 'Al-Hilal Crescent',
    shortName: 'AHC',
    reputation: 60,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 15,
    budget: 50_000_000,
  },
  {
    id: 'club-al-nassr-victory',
    name: 'Al-Nassr Victory',
    shortName: 'ANV',
    reputation: 57,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 14,
    budget: 45_000_000,
  },
  {
    id: 'club-al-ittihad-tigers',
    name: 'Al-Ittihad Tigers',
    shortName: 'AIT',
    reputation: 55,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 14,
    budget: 40_000_000,
  },
  {
    id: 'club-al-ahli-green',
    name: 'Al-Ahli Green',
    shortName: 'AAG',
    reputation: 53,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 13,
    budget: 35_000_000,
  },
  {
    id: 'club-al-shabab-youth',
    name: 'Al-Shabab Youth',
    shortName: 'ASY',
    reputation: 48,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 12,
    budget: 20_000_000,
  },
  {
    id: 'club-al-taawoun-stars',
    name: 'Al-Taawoun Stars',
    shortName: 'ATS',
    reputation: 43,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 11,
    budget: 15_000_000,
  },
  {
    id: 'club-al-faisaly-harmony',
    name: 'Al-Faisaly Harmony',
    shortName: 'AFH',
    reputation: 40,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 11,
    budget: 12_000_000,
  },
  {
    id: 'club-al-raed-lightning',
    name: 'Al-Raed Lightning',
    shortName: 'ARL',
    reputation: 37,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 10_000_000,
  },
  {
    id: 'club-al-ettifaq-greens',
    name: 'Al-Ettifaq Greens',
    shortName: 'AEG',
    reputation: 38,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 10,
    budget: 11_000_000,
  },
  {
    id: 'club-abha-fc',
    name: 'Abha FC',
    shortName: 'ABH',
    reputation: 33,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 8_000_000,
  },
  {
    id: 'club-al-fateh-stars',
    name: 'Al-Fateh Stars',
    shortName: 'AFS',
    reputation: 35,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 10,
    budget: 9_000_000,
  },
  {
    id: 'club-damac-fc',
    name: 'Damac FC',
    shortName: 'DAM',
    reputation: 30,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 7_000_000,
  },
  {
    id: 'club-al-khaleej-dolphins',
    name: 'Al-Khaleej Dolphins',
    shortName: 'AKD',
    reputation: 28,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 6_000_000,
  },
  {
    id: 'club-al-riyadh-fc',
    name: 'Al-Riyadh FC',
    shortName: 'ARF',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 5_000_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const SAUDI_ARABIA_LEAGUES: LeagueData[] = [
  {
    id: 'league-saudi-pro',
    name: 'Saudi Pro League',
    shortName: 'SPL',
    tier: 1,
    clubs: SAUDI_PRO_LEAGUE_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const SAUDI_FIRST_NAMES: string[] = [
  'Salem', 'Fahad', 'Yasser', 'Nawaf', 'Sami', 'Abdullah', 'Khalid',
  'Sultan', 'Talal', 'Faisal', 'Saad', 'Abdulrahman', 'Hattan', 'Saleh',
  'Turki', 'Bandar', 'Hamad', 'Mishaal', 'Nasser', 'Osama', 'Mohammed',
  'Ahmed', 'Ali', 'Omar', 'Ibrahim', 'Hassan', 'Majed', 'Waleed',
  'Ziyad', 'Yasir', 'Taisir', 'Raed', 'Rayan', 'Saif', 'Waled',
  'Adnan', 'Hasan', 'Jaber', 'Abdulaziz', 'Abdulmalik', 'Muhannad',
  'Khaled', 'Mansour', 'Marwan', 'Fahid', 'Ayman', 'Badr', 'Hatim',
  'Mazen', 'Yazeed', 'Aqeel', 'Motaz', 'Zaid', 'Tariq', 'Fouad',
  'Emad', 'Adel', 'Hussain', 'Monif', 'Daoud', 'Rashid',
];

export const SAUDI_LAST_NAMES: string[] = [
  'Al-Dawsari', 'Al-Shahrani', 'Al-Bishi', 'Al-Faraj', 'Al-Muwallad',
  'Al-Abed', 'Al-Shehri', 'Al-Malki', 'Al-Ghannam', 'Al-Tambakti',
  'Al-Nemer', 'Al-Zahrani', 'Al-Dosari', 'Al-Harbi', 'Al-Otaibi',
  'Al-Qahtani', 'Al-Buainain', 'Al-Khaldi', 'Al-Habsi', 'Al-Jalal',
  'Al-Khaibari', 'Al-Mousa', 'Al-Dossary', 'Al-Obaid', 'Al-Bulayhi',
  'Al-Hamdan', 'Al-Salim', 'Al-Rashidi', 'Al-Mutairi', 'Al-Jadaan',
  'Al-Assiri', 'Al-Jassam', 'Al-Yahya', 'Al-Mayouf', 'Al-Rashid',
  'Al-Shalhoub', 'Al-Amri', 'Al-Shamrani', 'Al-Balhmar', 'Al-Rubei',
  'Al-Ghareeb', 'Al-Zaid', 'Al-Breik', 'Al-Thiyabi', 'Al-Omari',
  'Al-Khairi', 'Al-Saqer', 'Al-Karbi', 'Al-Sultani', 'Al-Ghamdi',
  'Al-Muammar', 'Al-Kuwari', 'Al-Shammari', 'Khojah', 'Sulimani',
  'Khashoggi', 'Shoura', 'Mishal', 'Beidas', 'Tashan', 'Shuaibi',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const SAUDI_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Egyptian: [
    'Mohamed', 'Ahmed', 'Mahmoud', 'Omar', 'Hassan', 'Ali', 'Ibrahim', 'Amr',
    'Tarek', 'Mostafa', 'Salah', 'Essam', 'Wael', 'Karim', 'Sherif',
  ],
  Moroccan: [
    'Hakim', 'Achraf', 'Youssef', 'Sofiane', 'Noureddine', 'Amine', 'Zakaria',
    'Ayoub', 'Abdelhamid', 'Mehdi', 'Munir', 'Noussair', 'Azzedine', 'Fayçal', 'Jawad',
  ],
  Jordanian: [
    'Ahmad', 'Baha', 'Khalil', 'Nour', 'Yazan', 'Rami', 'Tariq',
    'Zaid', 'Bilal', 'Muath', 'Samer', 'Khaled', 'Firas', 'Nidal', 'Mousa',
  ],
};

export const SAUDI_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Egyptian: [
    'Salah', 'Aboutrika', 'Mido', 'Zidan', 'Ghaly', 'Hegazi', 'Elneny',
    'Hamdy', 'Mosallem', 'Sobhi', 'Trezeguet', 'Shikabala', 'Kahraba', 'Afsha', 'Hassan',
  ],
  Moroccan: [
    'Ziyech', 'Hakimi', 'En-Nesyri', 'Boufal', 'Amrabat', 'Ounahi', 'Bono',
    'Saïss', 'Mazraoui', 'Aguerd', 'Jabrane', 'Attiat-Allah', 'Sabiri', 'Zaïdouni', 'Cheddira',
  ],
  Jordanian: [
    'Bani Yaseen', 'Al-Rawabdeh', 'Al-Shagran', 'Hamdan', 'Al-Dardour',
    'Mustafa', 'Al-Shalabi', 'Khrisat', 'Hyasat', 'Saleh',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const SAUDI_ARABIA_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Saudi', weight: 70 },
    { nationality: 'Egyptian', weight: 7 },
    { nationality: 'Moroccan', weight: 5 },
    { nationality: 'Brazilian', weight: 5 },
    { nationality: 'Argentine', weight: 4 },
    { nationality: 'Jordanian', weight: 3 },
    { nationality: 'Tunisian', weight: 3 },
    { nationality: 'French', weight: 3 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const SAUDI_ARABIA_DATA: CountryData = {
  key: 'saudiarabia',
  name: 'Saudi Arabia',
  leagues: SAUDI_ARABIA_LEAGUES,
  nativeNamePool: {
    firstNames: SAUDI_FIRST_NAMES,
    lastNames: SAUDI_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(SAUDI_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: SAUDI_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: SAUDI_ARABIA_NATIONALITIES_BY_TIER,
  secondary: true,
};
