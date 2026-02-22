/**
 * Static world data for the Cameroonian football pyramid.
 *
 * All club names are clearly fictional but inspired by Cameroonian football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. Elite One clubs are 10-25.
 * Secondary country: generates clubs and players but does not simulate
 * fixtures or offer career positions.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Elite One (10 clubs, reputation 10-25)
// ---------------------------------------------------------------------------

const ELITE_ONE_CLUBS: ClubData[] = [
  {
    id: 'club-coton-sport-garoua',
    name: 'Coton Sport Garoua',
    shortName: 'CSG',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 2_000_000,
  },
  {
    id: 'club-canon-yaounde',
    name: 'Canon Yaoundé',
    shortName: 'CYD',
    reputation: 23,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 6,
    budget: 1_600_000,
  },
  {
    id: 'club-union-douala',
    name: 'Union Douala',
    shortName: 'UND',
    reputation: 22,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_400_000,
  },
  {
    id: 'club-tonnerre-yaounde',
    name: 'Tonnerre Yaoundé',
    shortName: 'TNY',
    reputation: 20,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 5,
    budget: 1_000_000,
  },
  {
    id: 'club-pwd-bamenda',
    name: 'PWD Bamenda',
    shortName: 'PWD',
    reputation: 18,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 750_000,
  },
  {
    id: 'club-fovu-baham',
    name: 'Fovu Baham',
    shortName: 'FVB',
    reputation: 17,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 600_000,
  },
  {
    id: 'club-bamboutos-fc',
    name: 'Bamboutos FC',
    shortName: 'BAM',
    reputation: 15,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 4,
    budget: 450_000,
  },
  {
    id: 'club-les-astres-douala',
    name: 'Les Astres Douala',
    shortName: 'LAD',
    reputation: 14,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 3,
    budget: 300_000,
  },
  {
    id: 'club-eding-sport',
    name: 'Eding Sport',
    shortName: 'EDS',
    reputation: 12,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 200_000,
  },
  {
    id: 'club-stade-renard',
    name: 'Stade Renard',
    shortName: 'STR',
    reputation: 10,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 100_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const CAMEROON_LEAGUES: LeagueData[] = [
  {
    id: 'league-elite-one',
    name: 'Elite One',
    shortName: 'EL1',
    tier: 1,
    clubs: ELITE_ONE_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const CAMEROONIAN_FIRST_NAMES: string[] = [
  'Samuel', 'Roger', 'Rigobert', 'Patrick', 'Alexandre', 'Pierre', 'Stéphane',
  'Jean', 'Éric', 'Collins', 'Vincent', 'Karl', 'André', 'Clinton', 'Nicolas',
  'Franck', 'Joël', 'Maxime', 'Martial', 'Bertrand', 'Landry', 'Parfait',
  'Ghislain', 'Boris', 'Hervé', 'Arsène', 'Constant', 'Christ', 'Valère',
  'Arnold', 'Alain', 'Guy', 'René', 'Théodore', 'Auguste', 'Sylvestre',
  'Désire', 'Blaise', 'Cédric', 'Aurélien', 'Loïc', 'Thomas', 'Gaëtan',
  'Fabrice', 'Roméo', 'Stève', 'Léandre', 'Apollinaire', 'Donatien', 'Firmin',
  'Rodrigue', 'Simplice', 'Serge', 'Basile', 'Achille', 'Léopold', 'Dieudonné',
  'Victorien', 'Théophile', 'Joëlle', 'Chancelle',
];

export const CAMEROONIAN_LAST_NAMES: string[] = [
  "Eto'o", 'Mboma', 'Song', 'Milla', "N'Koulou", 'Matip', 'Choupo-Moting',
  'Onana', 'Toko Ekambi', 'Ngamaleu', 'Aboubakar', 'Bassogog', 'Moumi',
  'Oum', 'Fai', 'Webo', 'Idrissou', 'Webó', 'Chedjou', 'Mbia',
  'Makoun', 'Enoh', 'Assou-Ekotto', 'Bikey', 'Kameni', 'Hamidou',
  'Njitap', 'Kalla', 'Billong', 'Tchakouté', 'Feudjio', 'Mbarga',
  'Nkufo', 'Ndtoungou', 'Oyongo', 'Ngom', 'Mbate', 'Manga',
  'Bong', 'Ndjock', 'Tchouaméni', 'Nkoudou', 'Mbeumo', 'Ganago',
  'Nsame', 'Nouhou', 'Tolo', 'Zobo', 'Aboa', 'Anguissa', 'Bahoken',
  'Feudjio', 'Siani', 'Ngalieu', 'Tchato', 'Sinkala', 'Djiomou', 'Tabi',
  'Nguemo', 'Neba', 'Yanga',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const CAMEROONIAN_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Nigerian: [
    'Adebayo', 'Chukwueze', 'Musa', 'Iheanacho', 'Osimhen', 'Ndidi',
    'Onyeka', 'Bassey', 'Awoniyi', 'Sadiq', 'Etebo', 'Okocha', 'Babangida', 'Finidi', 'Kanu',
  ],
  Chadian: [
    'Hassan', 'Ibrahim', 'Moussa', 'Mahamat', 'Abakar', 'Oumar', 'Ali',
    'Ahmat', 'Idriss', 'Brahim', 'Youssouf', 'Adoum', 'Abdelkerim',
  ],
};

export const CAMEROONIAN_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Nigerian: [
    'Okonkwo', 'Adeyemi', 'Eze', 'Nwosu', 'Okafor', 'Adesanya', 'Balogun',
    'Chukwu', 'Obi', 'Nwachukwu', 'Adeleke', 'Oladele', 'Taiwo', 'Bakare', 'Salami',
  ],
  Chadian: [
    'Hassane', 'Mahamat', 'Oumar', 'Abakar', 'Ibrahim', 'Ali', 'Moussa',
    'Ahmat', 'Brahim', 'Youssouf', 'Adoum', 'Abba', 'Saleh',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const CAMEROON_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Cameroonian', weight: 90 },
    { nationality: 'Nigerian', weight: 4 },
    { nationality: 'Chadian', weight: 3 },
    { nationality: 'Gabonese', weight: 2 },
    { nationality: 'Central African', weight: 1 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const CAMEROON_DATA: CountryData = {
  key: 'cameroon',
  name: 'Cameroon',
  leagues: CAMEROON_LEAGUES,
  nativeNamePool: {
    firstNames: CAMEROONIAN_FIRST_NAMES,
    lastNames: CAMEROONIAN_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(CAMEROONIAN_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: CAMEROONIAN_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: CAMEROON_NATIONALITIES_BY_TIER,
  secondary: true,
};
