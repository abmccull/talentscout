/**
 * Static world data for the Ghanaian football pyramid.
 *
 * All club names are clearly fictional but inspired by Ghanaian football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. GPL clubs are 10-30.
 * Secondary country: generates clubs and players but does not simulate
 * fixtures or offer career positions.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Ghana Premier League (10 clubs, reputation 10-30)
// ---------------------------------------------------------------------------

const GPL_CLUBS: ClubData[] = [
  {
    id: 'club-accra-hearts-fc',
    name: 'Accra Hearts FC',
    shortName: 'AHF',
    reputation: 30,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 3_000_000,
  },
  {
    id: 'club-ashanti-gold-stars',
    name: 'Ashanti Gold Stars',
    shortName: 'AGS',
    reputation: 28,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 7,
    budget: 2_500_000,
  },
  {
    id: 'club-aduana-flames',
    name: 'Aduana Flames',
    shortName: 'ADF',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_800_000,
  },
  {
    id: 'club-medeama-sc',
    name: 'Medeama SC',
    shortName: 'MED',
    reputation: 23,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 6,
    budget: 1_500_000,
  },
  {
    id: 'club-dreams-fc-dawu',
    name: 'Dreams FC Dawu',
    shortName: 'DFD',
    reputation: 22,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_200_000,
  },
  {
    id: 'club-karela-united',
    name: 'Karela United',
    shortName: 'KRU',
    reputation: 20,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 5,
    budget: 900_000,
  },
  {
    id: 'club-legon-cities',
    name: 'Legon Cities',
    shortName: 'LGC',
    reputation: 19,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 5,
    budget: 750_000,
  },
  {
    id: 'club-berekum-chelsea',
    name: 'Berekum Chelsea',
    shortName: 'BRC',
    reputation: 17,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 500_000,
  },
  {
    id: 'club-asante-kotoko',
    name: 'Asante Kotoko',
    shortName: 'ASK',
    reputation: 14,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 300_000,
  },
  {
    id: 'club-liberty-professionals',
    name: 'Liberty Professionals',
    shortName: 'LBP',
    reputation: 10,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 100_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const GHANA_LEAGUES: LeagueData[] = [
  {
    id: 'league-gpl',
    name: 'Ghana Premier League',
    shortName: 'GPL',
    tier: 1,
    clubs: GPL_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const GHANAIAN_FIRST_NAMES: string[] = [
  'Kwame', 'Kofi', 'Kwesi', 'Yaw', 'Kojo', 'Ama', 'Asamoah', 'Appiah',
  'Gyan', 'Essien', 'Boateng', 'Mensah', 'Ayew', 'Partey', 'Schlupp',
  'Amartey', 'Baba', 'Wakaso', 'Waris', 'Atsu', 'Kwabena', 'Kwaku',
  'Fiifi', 'Nana', 'Ato', 'Ebow', 'Kwadwo', 'Kwofie', 'Kobina', 'Akwasi',
  'Abena', 'Akua', 'Adwoa', 'Araba', 'Efua', 'Maame', 'Afia', 'Adjoa',
  'Comfort', 'Grace', 'Emmanuel', 'Joshua', 'Daniel', 'Samuel', 'Joseph',
  'Isaac', 'Michael', 'Philip', 'Andrews', 'Francis', 'Bernard', 'Richmond',
  'Bright', 'Prince', 'Elvis', 'Godwin', 'Clifford', 'Kennedy', 'Harrison',
];

export const GHANAIAN_LAST_NAMES: string[] = [
  'Mensah', 'Boateng', 'Appiah', 'Asante', 'Owusu', 'Acheampong', 'Amoah',
  'Gyasi', 'Sarfo', 'Annan', 'Quaye', 'Nkrumah', 'Ofori', 'Badu', 'Dauda',
  'Ayew', 'Gyan', 'Essien', 'Partey', 'Amartey', 'Schlupp', 'Wakaso',
  'Atsu', 'Inkoom', 'Asamoah', 'Muntari', 'Paintsil', 'Addo', 'Acquah',
  'Asumah', 'Obeng', 'Agyemang', 'Darko', 'Afriyie', 'Kyereh', 'Paintsil',
  'Opoku', 'Diawusie', 'Lamptey', 'Sarpong', 'Ankrah', 'Bonsu', 'Forson',
  'Ampadu', 'Asante', 'Osei', 'Twumasi', 'Dede', 'Agyei', 'Domfeh',
  'Ackon', 'Koomson', 'Acheampong', 'Zutah', 'Dekpo', 'Agbeko', 'Adu',
  'Oduro', 'Armah', 'Nyarko',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const GHANAIAN_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Nigerian: [
    'Adebayo', 'Chukwueze', 'Musa', 'Iheanacho', 'Osimhen', 'Ndidi',
    'Onyeka', 'Bassey', 'Awoniyi', 'Sadiq', 'Etebo', 'Okocha', 'Babangida', 'Finidi', 'Kanu',
  ],
  Ivorian: [
    'Didier', 'Yaya', 'Kolo', 'Salomon', 'Gervinho', 'Serge', 'Wilfried',
    'Maxwel', 'Nicolas', 'Franck', 'Jean-Philippe', 'Emmanuel', 'Lacina', 'Sébastien', 'Cheick',
  ],
};

export const GHANAIAN_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Nigerian: [
    'Okonkwo', 'Adeyemi', 'Eze', 'Nwosu', 'Okafor', 'Adesanya', 'Balogun',
    'Chukwu', 'Obi', 'Nwachukwu', 'Adeleke', 'Oladele', 'Taiwo', 'Bakare', 'Salami',
  ],
  Ivorian: [
    'Drogba', 'Touré', 'Kalou', 'Zaha', 'Koné', 'Bamba', 'Traoré',
    'Bailly', 'Cornet', 'Haller', 'Diomandé', 'Seri', 'Gradel', 'Gervais', 'Coulibaly',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const GHANA_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Ghanaian', weight: 88 },
    { nationality: 'Nigerian', weight: 4 },
    { nationality: 'Ivorian', weight: 3 },
    { nationality: 'Burkinabe', weight: 3 },
    { nationality: 'Togolese', weight: 2 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const GHANA_DATA: CountryData = {
  key: 'ghana',
  name: 'Ghana',
  leagues: GHANA_LEAGUES,
  nativeNamePool: {
    firstNames: GHANAIAN_FIRST_NAMES,
    lastNames: GHANAIAN_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(GHANAIAN_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: GHANAIAN_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: GHANA_NATIONALITIES_BY_TIER,
  secondary: true,
};
