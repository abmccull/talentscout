/**
 * Static world data for the Senegalese football pyramid.
 *
 * All club names are clearly fictional but inspired by Senegalese football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. Ligue 1 Sénégalaise clubs are 10-25.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Ligue 1 Sénégalaise (10 clubs, reputation 10-25)
// ---------------------------------------------------------------------------

const LIGUE1_SENEGAL_CLUBS: ClubData[] = [
  {
    id: 'club-asc-jaraaf',
    name: 'ASC Jaraaf',
    shortName: 'JAR',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 2_000_000,
  },
  {
    id: 'club-casa-sport-ziguinchor',
    name: 'Casa Sport Ziguinchor',
    shortName: 'CSZ',
    reputation: 23,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 1_500_000,
  },
  {
    id: 'club-teungueth-fc',
    name: 'Teungueth FC',
    shortName: 'TFC',
    reputation: 22,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 1_200_000,
  },
  {
    id: 'club-generation-foot',
    name: 'Génération Foot',
    shortName: 'GFO',
    reputation: 22,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 1_300_000,
  },
  {
    id: 'club-diambars-fc',
    name: 'Diambars FC',
    shortName: 'DFC',
    reputation: 20,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 1_000_000,
  },
  {
    id: 'club-us-goree',
    name: 'US Gorée',
    shortName: 'USG',
    reputation: 18,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 7,
    budget: 700_000,
  },
  {
    id: 'club-as-douanes',
    name: 'AS Douanes',
    shortName: 'ASD',
    reputation: 17,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 600_000,
  },
  {
    id: 'club-dakar-sacre-coeur',
    name: 'Dakar Sacré-Coeur',
    shortName: 'DSC',
    reputation: 16,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 500_000,
  },
  {
    id: 'club-mbour-pc',
    name: 'Mbour PC',
    shortName: 'MPC',
    reputation: 13,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 200_000,
  },
  {
    id: 'club-niary-tally',
    name: 'Niary Tally',
    shortName: 'NTA',
    reputation: 10,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 100_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const SENEGAL_LEAGUES: LeagueData[] = [
  {
    id: 'league-ligue1-senegal',
    name: 'Ligue 1 Sénégalaise',
    shortName: 'L1S',
    tier: 1,
    clubs: LIGUE1_SENEGAL_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const SENEGALESE_FIRST_NAMES: string[] = [
  'Sadio', 'Kalidou', 'Idrissa', 'Cheikh', 'Ismaïla', 'Pape', 'Moussa',
  'Abdoulaye', 'Habib', 'Famara', 'Boulaye', 'Edouard', 'Krépin', 'Nampalys',
  'Fodé', 'Keita', 'Lamine', 'Saliou', 'Henri', 'Nicolas', 'Ibrahima',
  'Mamadou', 'Demba', 'Papiss', 'Sidy', 'Modou', 'Oumar', 'Daouda',
  'Seydou', 'Babacar', 'Mbaye', 'Diafra', 'Souleymane', 'Aliou', 'Assane',
  'Malick', 'Youssouph', 'Amara', 'Baïla', 'Gana', 'Samba', 'Serigne',
  'Mame', 'Penda', 'Landing', 'Badou', 'Boubacar', 'Malang', 'Karamoko',
  'Mamadou Lamine', 'Alioune', 'Mamadou Ndiaye', 'Thierno', 'Elhadji',
  'Abdou', 'Djiby', 'Toure', 'Birame', 'Opa', 'Joseph', 'Alfred',
];

export const SENEGALESE_LAST_NAMES: string[] = [
  'Mané', 'Koulibaly', 'Gueye', 'Diallo', 'Sarr', 'Diédhiou', 'Dia',
  'Balde', 'Ndiaye', 'Cissé', 'Diouf', 'Camara', 'Sané', 'Kouyaté',
  'Ndoye', 'Badji', 'Wagué', 'Mbaye', 'Thiam', 'Sow', 'Fall', 'Sylla',
  'Coly', 'Ndoye', 'Sabaly', 'Dramé', 'Gomis', 'Guirassy', 'Faye',
  'Sène', 'Touré', 'Mendy', 'Diop', 'Kane', 'Traoré', 'Konaté',
  'Sidibé', 'Coulibaly', 'Keïta', 'Barry', 'Diatta', 'Badji', 'Ndao',
  'Thiaw', 'Sabaly', 'Dansoko', 'Mbodj', 'Sagna', 'Niasse', 'Ba',
  'Babacar', 'Bayo', 'Baldé', 'Ndom', 'Kébé', 'Diouf', 'Lopy',
  'Demba Ba', 'Mangane', 'Sakho', 'Aïdara',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const SENEGAL_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Guinean: [
    'Naby', 'Mohamed', 'Mamadou', 'Ibrahima', 'Sory', 'Seydouba', 'Alsény',
    'Bangaly', 'Oumar', 'Aboubacar', 'Mouctar', 'Issiaga', 'Djamel', 'Lansana', 'Fodé',
  ],
  Malian: [
    'Moussa', 'Yves', 'Kalifa', 'Abdoulaye', 'Mamoutou', 'Cheick', 'Lassana',
    'Amadou', 'Fousseni', 'Bakaye', 'Adama', 'Habib', 'Salif', 'Modibo', 'Ibrahim',
  ],
};

export const SENEGAL_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Guinean: [
    'Keïta', 'Camara', 'Diallo', 'Soumah', 'Conté', 'Sylla', 'Cissé',
    'Kourouma', 'Barry', 'Bangoura', 'Bah', 'Toure', 'Kouyaté', 'Konaté', 'Kanté',
  ],
  Malian: [
    'Sissoko', 'Maïga', 'Coulibaly', 'Diarra', 'Traoré', 'Sanogo', 'Kouyaté',
    'Dembélé', 'Ballo-Touré', 'Doumbia', 'Koné', 'Diabaté', 'Haïdara', 'Samaké', 'Camara',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const SENEGAL_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Senegalese', weight: 90 },
    { nationality: 'Guinean', weight: 4 },
    { nationality: 'Malian', weight: 3 },
    { nationality: 'Gambian', weight: 2 },
    { nationality: 'Mauritanian', weight: 1 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const SENEGAL_DATA: CountryData = {
  key: 'senegal',
  name: 'Senegal',
  leagues: SENEGAL_LEAGUES,
  nativeNamePool: {
    firstNames: SENEGALESE_FIRST_NAMES,
    lastNames: SENEGALESE_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(SENEGAL_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: SENEGAL_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: SENEGAL_NATIONALITIES_BY_TIER,
  secondary: true,
};
