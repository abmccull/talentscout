/**
 * Static world data for the Nigerian football pyramid.
 *
 * All club names are clearly fictional but inspired by Nigerian football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. NPFL clubs are 15-40.
 * Secondary country: generates clubs and players but does not simulate
 * fixtures or offer career positions.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Nigerian Professional Football League (12 clubs, reputation 15-40)
// ---------------------------------------------------------------------------

const NPFL_CLUBS: ClubData[] = [
  {
    id: 'club-enyimba-warriors',
    name: 'Enyimba Warriors',
    shortName: 'ENW',
    reputation: 40,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 5_000_000,
  },
  {
    id: 'club-kano-pillars',
    name: 'Kano Pillars',
    shortName: 'KNP',
    reputation: 38,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 9,
    budget: 4_500_000,
  },
  {
    id: 'club-rangers-international',
    name: 'Rangers International',
    shortName: 'RGI',
    reputation: 36,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 3_500_000,
  },
  {
    id: 'club-plateau-united-fc',
    name: 'Plateau United FC',
    shortName: 'PLU',
    reputation: 33,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 2_800_000,
  },
  {
    id: 'club-rivers-dolphins',
    name: 'Rivers Dolphins',
    shortName: 'RVD',
    reputation: 32,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 2_500_000,
  },
  {
    id: 'club-shooting-stars',
    name: 'Shooting Stars',
    shortName: 'SHS',
    reputation: 30,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 7,
    budget: 2_000_000,
  },
  {
    id: 'club-heartland-fc',
    name: 'Heartland FC',
    shortName: 'HTL',
    reputation: 28,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 1_800_000,
  },
  {
    id: 'club-sunshine-stars',
    name: 'Sunshine Stars',
    shortName: 'SST',
    reputation: 26,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 6,
    budget: 1_400_000,
  },
  {
    id: 'club-kwara-united',
    name: 'Kwara United',
    shortName: 'KWU',
    reputation: 24,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_000_000,
  },
  {
    id: 'club-akwa-starlets',
    name: 'Akwa Starlets',
    shortName: 'AKS',
    reputation: 21,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 700_000,
  },
  {
    id: 'club-lobi-stars',
    name: 'Lobi Stars',
    shortName: 'LBS',
    reputation: 18,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 4,
    budget: 400_000,
  },
  {
    id: 'club-abia-warriors',
    name: 'Abia Warriors',
    shortName: 'ABW',
    reputation: 15,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 200_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const NIGERIA_LEAGUES: LeagueData[] = [
  {
    id: 'league-npfl',
    name: 'Nigerian Professional Football League',
    shortName: 'NPF',
    tier: 1,
    clubs: NPFL_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const NIGERIAN_FIRST_NAMES: string[] = [
  'Adebayo', 'Chukwueze', 'Musa', 'Oluwaseun', 'Iheanacho', 'Osimhen',
  'Ndidi', 'Onyeka', 'Bassey', 'Awoniyi', 'Chidozie', 'Sadiq', 'Shehu',
  'Etebo', 'Okocha', 'Babangida', 'Finidi', 'Amokachi', 'Babayaro',
  'Aghahowa', 'Obinna', 'Kanu', 'Yobo', 'Mikel', 'Emenike', 'Ideye',
  'Ighalo', 'Iwobi', 'Ejuke', 'Simon', 'Asisat', 'Chiamaka', 'Rasheedat',
  'Tochukwu', 'Chisom', 'Emeka', 'Nnamdi', 'Ikechukwu', 'Uche', 'Kelechi',
  'Taiwo', 'Tunde', 'Segun', 'Gbenga', 'Biodun', 'Kunle', 'Dayo',
  'Femi', 'Lekan', 'Tobi', 'Kayode', 'Rilwan', 'Sani', 'Aliyu',
  'Ibrahim', 'Abubakar', 'Garba', 'Lawal', 'Umar', 'Yakubu',
];

export const NIGERIAN_LAST_NAMES: string[] = [
  'Okonkwo', 'Adeyemi', 'Musa', 'Ibrahim', 'Eze', 'Nwosu', 'Okafor',
  'Adesanya', 'Balogun', 'Chukwu', 'Obi', 'Nwachukwu', 'Adeleke',
  'Oladele', 'Taiwo', 'Bakare', 'Salami', 'Badmus', 'Lawal', 'Sani',
  'Yusuf', 'Garba', 'Aliyu', 'Abubakar', 'Usman', 'Mohammed', 'Hassan',
  'Abdullahi', 'Shehu', 'Danjuma', 'Idowu', 'Akindele', 'Olawale',
  'Fashola', 'Sanwo', 'Amaechi', 'Wike', 'Obaseki', 'Makinde', 'Fayemi',
  'Onyema', 'Udeze', 'Uchenna', 'Obiora', 'Chinedu', 'Ifeanyi', 'Ugwu',
  'Agu', 'Ogbu', 'Nkemdirim', 'Ajibo', 'Oghenekaro', 'Efeobe', 'Otele',
  'Okereke', 'Awuah', 'Azubuike', 'Chigozie', 'Ekwueme', 'Obasi',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const NIGERIAN_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Ghanaian: [
    'Kwame', 'Kofi', 'Kwesi', 'Yaw', 'Kojo', 'Asamoah', 'Gyan',
    'Essien', 'Ayew', 'Partey', 'Wakaso', 'Atsu', 'Baba', 'Amartey', 'Schlupp',
  ],
  Cameroonian: [
    'Samuel', 'Roger', 'Patrick', 'Karl', 'Vincent', 'André', 'Clinton',
    'Stéphane', 'Pierre', 'Jean', 'Collins', 'Éric', 'Alexandre', 'Nicolas', 'Franck',
  ],
};

export const NIGERIAN_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Ghanaian: [
    'Mensah', 'Boateng', 'Appiah', 'Asante', 'Owusu', 'Acheampong',
    'Amoah', 'Gyasi', 'Sarfo', 'Annan', 'Quaye', 'Nkrumah', 'Ofori', 'Badu', 'Dauda',
  ],
  Cameroonian: [
    "Eto'o", 'Mboma', 'Song', 'Milla', "N'Koulou", 'Matip', 'Choupo-Moting',
    'Onana', 'Toko Ekambi', 'Ngamaleu', 'Aboubakar', 'Bassogog', 'Moumi', 'Oum', 'Fai',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const NIGERIA_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Nigerian', weight: 90 },
    { nationality: 'Ghanaian', weight: 4 },
    { nationality: 'Cameroonian', weight: 3 },
    { nationality: 'Ivorian', weight: 2 },
    { nationality: 'Beninese', weight: 1 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const NIGERIA_DATA: CountryData = {
  key: 'nigeria',
  name: 'Nigeria',
  leagues: NIGERIA_LEAGUES,
  nativeNamePool: {
    firstNames: NIGERIAN_FIRST_NAMES,
    lastNames: NIGERIAN_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(NIGERIAN_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: NIGERIAN_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: NIGERIA_NATIONALITIES_BY_TIER,
  secondary: true,
};
