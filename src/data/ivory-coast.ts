/**
 * Static world data for the Ivorian football pyramid.
 *
 * All club names are clearly fictional but inspired by Ivorian football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. Ligue 1 Ivoirienne clubs are 10-30.
 * Secondary country: generates clubs and players but does not simulate
 * fixtures or offer career positions.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Ligue 1 Ivoirienne (10 clubs, reputation 10-30)
// ---------------------------------------------------------------------------

const LIGUE1_IVOIRE_CLUBS: ClubData[] = [
  {
    id: 'club-asec-mimosas',
    name: 'ASEC Mimosas',
    shortName: 'ASM',
    reputation: 30,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 3_000_000,
  },
  {
    id: 'club-africa-sports',
    name: 'Africa Sports',
    shortName: 'AFS',
    reputation: 28,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 7,
    budget: 2_500_000,
  },
  {
    id: 'club-stade-dabidjan',
    name: "Stade d'Abidjan",
    shortName: 'SDA',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_800_000,
  },
  {
    id: 'club-soa-bouake',
    name: 'SOA Bouaké',
    shortName: 'SOB',
    reputation: 23,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 6,
    budget: 1_500_000,
  },
  {
    id: 'club-sporting-club-gagnoa',
    name: 'Sporting Club Gagnoa',
    shortName: 'SCG',
    reputation: 21,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_000_000,
  },
  {
    id: 'club-racing-club-abidjan',
    name: 'Racing Club Abidjan',
    shortName: 'RCA',
    reputation: 19,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 5,
    budget: 750_000,
  },
  {
    id: 'club-stella-dadjame',
    name: "Stella d'Adjamé",
    shortName: 'STD',
    reputation: 17,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 4,
    budget: 500_000,
  },
  {
    id: 'club-issia-wazi',
    name: 'Issia Wazi',
    shortName: 'ISW',
    reputation: 15,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 350_000,
  },
  {
    id: 'club-san-pedro-fc',
    name: 'San Pedro FC',
    shortName: 'SPF',
    reputation: 13,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 200_000,
  },
  {
    id: 'club-moossou-fc',
    name: 'Moossou FC',
    shortName: 'MOS',
    reputation: 10,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 100_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const IVORY_COAST_LEAGUES: LeagueData[] = [
  {
    id: 'league-ligue1-ivoire',
    name: 'Ligue 1 Ivoirienne',
    shortName: 'L1I',
    tier: 1,
    clubs: LIGUE1_IVOIRE_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const IVORIAN_FIRST_NAMES: string[] = [
  'Didier', 'Yaya', 'Kolo', 'Salomon', 'Gervinho', 'Serge', 'Wilfried',
  'Maxwel', 'Nicolas', 'Franck', 'Jean-Philippe', 'Emmanuel', 'Lacina',
  'Sébastien', 'Cheick', 'Gnegneri', 'Arouna', 'Siaka', 'Ismaël', 'Romaric',
  'Willy', 'Oumar', 'Abdoul', 'Souleymane', 'Mamadou', 'Aboubacar',
  'Ibrahima', 'Seydou', 'Lassana', 'Bakary', 'Adama', 'Moussa', 'Fofana',
  'Amara', 'Ousmane', 'Tiémoué', 'Pape', 'Habib', 'Karim', 'Nassim',
  'Jean-Jacques', 'Arsène', 'Ghislain', 'Constant', 'Martial', 'Hervé',
  'Patrick', 'Stéphane', 'Pierre', 'Jean', 'Éric', 'André', 'Joël',
  'Boris', 'Dieumerci', 'Christ', 'Landry', 'Parfait', 'Roger', 'Sylvain',
];

export const IVORIAN_LAST_NAMES: string[] = [
  'Drogba', 'Touré', 'Kalou', 'Zaha', 'Koné', 'Bamba', 'Traoré',
  'Bailly', 'Cornet', 'Haller', 'Diomandé', 'Seri', 'Gradel', 'Gervais',
  'Coulibaly', 'Camara', 'Diallo', 'Kouyaté', 'Fofana', 'Sanogo',
  'Gbamin', 'Cissé', 'Doumbia', 'Cissoko', 'Dembélé', 'Baldé', 'Barry',
  'Keïta', 'Diatta', 'Kourouma', 'Sylla', 'Condé', 'Soumah', 'Bangoura',
  'N\'Diaye', 'Konaté', 'Sissoko', 'Diabaté', 'Kouyaté', 'Lamine',
  'Ouattara', 'Dosso', 'Silué', 'Gbagbo', 'Wattara', 'Pégatienan',
  'Tiéhi', 'Sagna', 'Boka', 'Zokora', 'Lolo', 'Aké', 'N\'Dri', 'Dao',
  'Gbakouah', 'Béké', 'Touré', 'Gneri', 'Yapo', 'Brou',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const IVORIAN_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Ghanaian: [
    'Kwame', 'Kofi', 'Kwesi', 'Yaw', 'Kojo', 'Asamoah', 'Gyan',
    'Essien', 'Ayew', 'Partey', 'Wakaso', 'Atsu', 'Baba', 'Amartey', 'Schlupp',
  ],
  Malian: [
    'Moussa', 'Seydou', 'Cheick', 'Fousseni', 'Adama', 'Kalilou', 'Hamari',
    'Mahamadou', 'Aliou', 'Bakary', 'Lassana', 'Mamadou', 'Ibrahima', 'Souleymane', 'Abdoul',
  ],
};

export const IVORIAN_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Ghanaian: [
    'Mensah', 'Boateng', 'Appiah', 'Asante', 'Owusu', 'Acheampong', 'Amoah',
    'Gyasi', 'Sarfo', 'Annan', 'Quaye', 'Nkrumah', 'Ofori', 'Badu', 'Dauda',
  ],
  Malian: [
    'Keïta', 'Sissoko', 'Coulibaly', 'Diarra', 'Traoré', 'Diallo', 'Kouyaté',
    'Cissé', 'Camara', 'Sanogo', 'Maïga', 'Diabaté', 'Touré', 'Konaté', 'Dembélé',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const IVORY_COAST_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Ivorian', weight: 88 },
    { nationality: 'Malian', weight: 4 },
    { nationality: 'Burkinabe', weight: 3 },
    { nationality: 'Ghanaian', weight: 3 },
    { nationality: 'Guinean', weight: 2 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const IVORY_COAST_DATA: CountryData = {
  key: 'ivorycoast',
  name: 'Ivory Coast',
  leagues: IVORY_COAST_LEAGUES,
  nativeNamePool: {
    firstNames: IVORIAN_FIRST_NAMES,
    lastNames: IVORIAN_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(IVORIAN_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: IVORIAN_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: IVORY_COAST_NATIONALITIES_BY_TIER,
  secondary: true,
};
