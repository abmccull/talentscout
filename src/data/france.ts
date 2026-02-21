/**
 * Static world data for the French football pyramid.
 *
 * All club names are clearly fictional but inspired by French football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. Ligue 1 clubs are 45-90; Ligue 2 20-42.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Ligue 1 (20 clubs, reputation 45-90)
// ---------------------------------------------------------------------------

const LIGUE_1_CLUBS: ClubData[] = [
  {
    id: 'club-paris-sg-fc',
    name: 'Paris Saint-Germain FC',
    shortName: 'PSG',
    reputation: 90,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 18,
    budget: 300_000_000,
  },
  {
    id: 'club-marseille-blues',
    name: 'Marseille Blues',
    shortName: 'MSB',
    reputation: 82,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 14,
    budget: 70_000_000,
  },
  {
    id: 'club-lyon-lions',
    name: 'Lyon Lions',
    shortName: 'LYL',
    reputation: 80,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 18,
    budget: 60_000_000,
  },
  {
    id: 'club-monaco-princes',
    name: 'Monaco Princes',
    shortName: 'MNP',
    reputation: 78,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 16,
    budget: 75_000_000,
  },
  {
    id: 'club-lille-dogues',
    name: 'Lille Dogues',
    shortName: 'LLD',
    reputation: 76,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 15,
    budget: 50_000_000,
  },
  {
    id: 'club-nice-eagles',
    name: 'Nice Eagles',
    shortName: 'NCE',
    reputation: 72,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 13,
    budget: 40_000_000,
  },
  {
    id: 'club-lens-miners',
    name: 'Lens Miners',
    shortName: 'LNM',
    reputation: 70,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 13,
    budget: 35_000_000,
  },
  {
    id: 'club-rennes-bretons',
    name: 'Rennes Bretons',
    shortName: 'RNB',
    reputation: 71,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 14,
    budget: 38_000_000,
  },
  {
    id: 'club-strasbourg-storks',
    name: 'Strasbourg Storks',
    shortName: 'STS',
    reputation: 63,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 11,
    budget: 22_000_000,
  },
  {
    id: 'club-nantes-canaries',
    name: 'Nantes Canaries',
    shortName: 'NTC',
    reputation: 62,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 12,
    budget: 20_000_000,
  },
  {
    id: 'club-bordeaux-girondins',
    name: 'Bordeaux Girondins',
    shortName: 'BDG',
    reputation: 65,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 12,
    budget: 25_000_000,
  },
  {
    id: 'club-montpellier-paillade',
    name: 'Montpellier Paillade',
    shortName: 'MPP',
    reputation: 60,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 11,
    budget: 18_000_000,
  },
  {
    id: 'club-toulouse-violets',
    name: 'Toulouse Violets',
    shortName: 'TLV',
    reputation: 58,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 10,
    budget: 15_000_000,
  },
  {
    id: 'club-brest-pirates',
    name: 'Brest Pirates',
    shortName: 'BRP',
    reputation: 61,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 11,
    budget: 20_000_000,
  },
  {
    id: 'club-reims-champagne',
    name: 'Reims Champagne',
    shortName: 'RCH',
    reputation: 59,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 11,
    budget: 16_000_000,
  },
  {
    id: 'club-lorient-merlus',
    name: 'Lorient Merlus',
    shortName: 'LRM',
    reputation: 55,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 12_000_000,
  },
  {
    id: 'club-troyes-cotton',
    name: 'Troyes Cotton',
    shortName: 'TYC',
    reputation: 50,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 8,
    budget: 10_000_000,
  },
  {
    id: 'club-clermont-volcanoes',
    name: 'Clermont Volcanoes',
    shortName: 'CLV',
    reputation: 48,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 8_000_000,
  },
  {
    id: 'club-metz-moselle',
    name: 'Metz Moselle',
    shortName: 'MTM',
    reputation: 52,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 9,
    budget: 11_000_000,
  },
  {
    id: 'club-auxerre-abbey',
    name: 'Auxerre Abbey',
    shortName: 'AXA',
    reputation: 45,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 8_000_000,
  },
];

// ---------------------------------------------------------------------------
// Ligue 2 (20 clubs, reputation 20-42)
// ---------------------------------------------------------------------------

const LIGUE_2_CLUBS: ClubData[] = [
  {
    id: 'club-saint-etienne-greens',
    name: 'Saint-Etienne Greens',
    shortName: 'SEG',
    reputation: 42,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 9,
    budget: 5_000_000,
  },
  {
    id: 'club-guingamp-bretons',
    name: 'Guingamp Bretons',
    shortName: 'GGB',
    reputation: 36,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 3_000_000,
  },
  {
    id: 'club-caen-normans',
    name: 'Caen Normans',
    shortName: 'CAN',
    reputation: 38,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 3_500_000,
  },
  {
    id: 'club-grenoble-mountains',
    name: 'Grenoble Mountains',
    shortName: 'GRM',
    reputation: 32,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 2_500_000,
  },
  {
    id: 'club-angers-black-whites',
    name: 'Angers Black-Whites',
    shortName: 'ABW',
    reputation: 40,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 4_000_000,
  },
  {
    id: 'club-dijon-mustards',
    name: 'Dijon Mustards',
    shortName: 'DJM',
    reputation: 34,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 2_800_000,
  },
  {
    id: 'club-pau-bears',
    name: 'Pau Bears',
    shortName: 'PBR',
    reputation: 22,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_000_000,
  },
  {
    id: 'club-bastia-islanders',
    name: 'Bastia Islanders',
    shortName: 'BSI',
    reputation: 35,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 7,
    budget: 3_000_000,
  },
  {
    id: 'club-quevilly-rouen-shore',
    name: 'Quevilly Rouen Shore',
    shortName: 'QRS',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_200_000,
  },
  {
    id: 'club-valenciennes-miners',
    name: 'Valenciennes Miners',
    shortName: 'VNM',
    reputation: 33,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 2_500_000,
  },
  {
    id: 'club-laval-rouge',
    name: 'Laval Rouge',
    shortName: 'LVR',
    reputation: 28,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_500_000,
  },
  {
    id: 'club-amiens-white-black',
    name: 'Amiens White-Black',
    shortName: 'AWB',
    reputation: 37,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 3_200_000,
  },
  {
    id: 'club-ajaccio-corsicans',
    name: 'Ajaccio Corsicans',
    shortName: 'AJC',
    reputation: 30,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 2_000_000,
  },
  {
    id: 'club-niort-champagne',
    name: 'Niort Champagne',
    shortName: 'NRC',
    reputation: 23,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_000_000,
  },
  {
    id: 'club-dunkerque-harbour',
    name: 'Dunkerque Harbour',
    shortName: 'DKH',
    reputation: 26,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_300_000,
  },
  {
    id: 'club-concarneau-sardines',
    name: 'Concarneau Sardines',
    shortName: 'CCS',
    reputation: 20,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 800_000,
  },
  {
    id: 'club-rodez-aveyron',
    name: 'Rodez Aveyron',
    shortName: 'RAV',
    reputation: 24,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_100_000,
  },
  {
    id: 'club-paris-fc-reds',
    name: 'Paris FC Reds',
    shortName: 'PFR',
    reputation: 40,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 8,
    budget: 4_000_000,
  },
  {
    id: 'club-lyon-b-stars',
    name: 'Lyon B Stars',
    shortName: 'LBS',
    reputation: 29,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 1_600_000,
  },
  {
    id: 'club-sochaux-lions',
    name: 'Sochaux Lions',
    shortName: 'SXL',
    reputation: 38,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 3_500_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const FRANCE_LEAGUES: LeagueData[] = [
  {
    id: 'league-ligue-1',
    name: 'Ligue 1',
    shortName: 'L1',
    tier: 1,
    clubs: LIGUE_1_CLUBS,
  },
  {
    id: 'league-ligue-2',
    name: 'Ligue 2',
    shortName: 'L2',
    tier: 2,
    clubs: LIGUE_2_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const FRENCH_FIRST_NAMES: string[] = [
  'Lucas', 'Hugo', 'Louis', 'Antoine', 'Théo', 'Alexandre', 'Nicolas',
  'Kylian', 'Karim', 'Ousmane', 'Kingsley', 'Blaise', 'Paul', 'Raphael',
  'Benjamin', 'Jules', 'Mattéo', 'Timoué', 'Moussa', 'Corentin',
  'Rayan', 'Youssouf', 'Axel', 'Clément', 'Maxime', 'Léo', 'Tom',
  'Mathieu', 'Mathis', 'Enzo', 'Lorenzo', 'Julien', 'Sébastien', 'Baptiste',
  'Guillaume', 'Pierre', 'Florian', 'Rémi', 'Adrien', 'Quentin', 'François',
  'Jean', 'Marc', 'Philippe', 'Thierry', 'Laurent', 'Christophe', 'Patrick',
  'Michel', 'Gilles', 'Eric', 'David', 'Thomas', 'Arnaud', 'Cédric',
  'Dimitri', 'Jonathan', 'Kevin', 'Dylan', 'Yann', 'Killian', 'Loïc',
  'Wissam', 'Nabil', 'Bilal', 'Sofiane', 'Samir', 'Layvin', 'Presnel',
  'Ibrahima', 'Mamadou', 'Ferland', 'Samuel', 'Wendie', 'Amara', 'Cheick',
];

export const FRENCH_LAST_NAMES: string[] = [
  'Dupont', 'Martin', 'Bernard', 'Thomas', 'Petit', 'Leroy', 'Girard',
  'Mbappé', 'Benzema', 'Dembélé', 'Coman', 'Pogba', 'Lloris', 'Hernandez',
  'Pavard', 'Varane', 'Kimpembe', 'Upamecano', 'Camavinga', 'Tchouaméni',
  'Guendouzi', 'Maignan', 'Saliba', 'Konaté', 'Diallo', 'Caqueret',
  'Dubois', 'Laborde', 'Clauss', 'Fofana', 'Diaby', 'Mukiele', 'Thiaw',
  'Simon', 'Terrier', 'Bourigeaud', 'Truffert', 'Doue', 'Blas', 'Ganago',
  'Delort', 'Laborde', 'Thuram', 'Zidane', 'Henry', 'Desailly', 'Vieira',
  'Petit', 'Pires', 'Wiltord', 'Trezeguet', 'Anelka', 'Ribery', 'Nasri',
  'Evra', 'Abidal', 'Sagnol', 'Gallas', 'Makelele', 'Diarra', 'Sissoko',
  'Martial', 'Griezmann', 'Giroud', 'Benzema', 'Lacazette', 'Fekir', 'Aouar',
  'Nzonzi', 'Mandanda', 'Mitroglou', 'Benedetto', 'Thauvin', 'Payet', 'Sanson',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const FRENCH_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  African: [
    'Sadio', 'Riyad', 'Wilfried', 'Victor', 'Hakim', 'Youssef', 'Mohamed',
    'Naby', 'Sékou', 'Ismaïla', 'Sébastien', 'Amara', 'Ibrahim', 'Cheikhou',
    'Idrissa', 'Bamba', 'Ché', 'Samuel', 'Demba', 'Papiss',
  ],
  Brazilian: [
    'Gabriel', 'Lucas', 'Thiago', 'Felipe', 'Rodrigo', 'Matheus', 'Bruno',
    'Vinicius', 'Richarlison', 'Casemiro', 'Fabinho', 'Everton', 'Antony',
    'Raphinha', 'Fred', 'Ederson', 'Endrick', 'Igor', 'Guilherme', 'Renan',
  ],
  Argentine: [
    'Lionel', 'Angel', 'Gonzalo', 'Ezequiel', 'Lautaro', 'Joaquin', 'Nicolas',
    'Paulo', 'Franco', 'Facundo', 'Germán', 'Diego', 'Valentín', 'Julián',
    'Leandro', 'Cristian', 'Guido', 'Santiago', 'Enzo', 'Maxi',
  ],
  Spanish: [
    'Pablo', 'Álvaro', 'Sergio', 'Fernando', 'David', 'Diego', 'Marcos',
    'Carlos', 'Koke', 'Jordi', 'Mikel', 'Dani', 'Rodrigo', 'Ferran',
    'Pedri', 'Gavi', 'Ansu', 'Juan', 'José', 'Miguel',
  ],
  Portuguese: [
    'Cristiano', 'Rúben', 'João', 'Bernardo', 'Diogo', 'Rafa', 'André',
    'Bruno', 'William', 'Gonçalo', 'Ricardo', 'Vitinha', 'Neto', 'Gedson',
    'Renato', 'Nuno', 'Pepe', 'Nelson', 'Sérgio', 'Pizzi',
  ],
};

export const FRENCH_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  African: [
    'Mané', 'Mahrez', 'Zaha', 'Osimhen', 'Ziyech', 'En-Nesyri', 'Salah',
    'Keïta', 'Kouyaté', 'Sarr', 'Haller', 'Diallo', 'Sangaré', 'Gueye',
    'Mbaye', 'Cissé', 'Traoré', 'Diatta', 'Ndiaye', 'Diouf',
  ],
  Brazilian: [
    'Silva', 'Santos', 'Oliveira', 'Costa', 'Souza', 'Pereira', 'Lima',
    'Ferreira', 'Rodrigues', 'Alves', 'Júnior', 'Neres', 'Militão',
    'Marquinhos', 'Paquetá', 'Arthur', 'Barbosa', 'Araújo', 'Nascimento', 'Luiz',
  ],
  Argentine: [
    'Messi', 'Agüero', 'Higuaín', 'Di María', 'Dybala', 'Paredes',
    'Otamendi', 'Tagliafico', 'Acuña', 'Molina', 'Martínez', 'Mac Allister',
    'Fernández', 'de Paul', 'Palacios', 'Correa', 'Romero', 'Soulé', 'Garnacho', 'Beltrán',
  ],
  Spanish: [
    'García', 'Martínez', 'López', 'Sánchez', 'González', 'Fernández',
    'Pérez', 'Rodríguez', 'Torres', 'Ramos', 'Alba', 'Morata', 'Busquets',
    'Navas', 'Carvajal', 'Moreno', 'Oyarzabal', 'Merino', 'Sarabia', 'Canales',
  ],
  Portuguese: [
    'Ronaldo', 'Neves', 'Fernandes', 'Cancelo', 'Pepe', 'Dias', 'Mendes',
    'Moutinho', 'Guerreiro', 'Palhinha', 'Vitinha', 'Horta', 'Leão',
    'Semedo', 'Danilo', 'Gonçalves', 'Jota', 'Silva', 'Costa', 'Soares',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const FRANCE_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'French', weight: 50 },
    { nationality: 'African', weight: 15 },
    { nationality: 'Brazilian', weight: 8 },
    { nationality: 'Argentine', weight: 6 },
    { nationality: 'Spanish', weight: 6 },
    { nationality: 'Portuguese', weight: 5 },
    { nationality: 'English', weight: 4 },
    { nationality: 'German', weight: 3 },
    { nationality: 'Dutch', weight: 3 },
  ],
  2: [
    { nationality: 'French', weight: 68 },
    { nationality: 'African', weight: 12 },
    { nationality: 'Brazilian', weight: 5 },
    { nationality: 'Spanish', weight: 5 },
    { nationality: 'Portuguese', weight: 4 },
    { nationality: 'Argentine', weight: 3 },
    { nationality: 'English', weight: 2 },
    { nationality: 'German', weight: 1 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const FRANCE_DATA: CountryData = {
  key: 'france',
  name: 'France',
  leagues: FRANCE_LEAGUES,
  nativeNamePool: {
    firstNames: FRENCH_FIRST_NAMES,
    lastNames: FRENCH_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(FRENCH_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: FRENCH_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: FRANCE_NATIONALITIES_BY_TIER,
};
