/**
 * Static world data for the Brazilian football pyramid.
 *
 * All club names are clearly fictional but inspired by Brazilian football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. Série A clubs are 40-80; Série B 15-38.
 * Brazilian players commonly go by single names or short nicknames.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Série A (20 clubs, reputation 40-80)
// ---------------------------------------------------------------------------

const SERIE_A_CLUBS: ClubData[] = [
  {
    id: 'club-flamengo-reds',
    name: 'Flamengo Reds',
    shortName: 'FLR',
    reputation: 80,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 16,
    budget: 60_000_000,
  },
  {
    id: 'club-palmeiras-greens',
    name: 'Palmeiras Greens',
    shortName: 'PLG',
    reputation: 78,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 15,
    budget: 55_000_000,
  },
  {
    id: 'club-atletico-mineiro-roosters',
    name: 'Atletico Mineiro Roosters',
    shortName: 'AMR',
    reputation: 76,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 14,
    budget: 45_000_000,
  },
  {
    id: 'club-sao-paulo-tricolor',
    name: 'São Paulo Tricolor',
    shortName: 'SPT',
    reputation: 74,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 16,
    budget: 40_000_000,
  },
  {
    id: 'club-corinthians-faithful',
    name: 'Corinthians Faithful',
    shortName: 'CRF',
    reputation: 73,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 14,
    budget: 38_000_000,
  },
  {
    id: 'club-santos-fish',
    name: 'Santos Fish',
    shortName: 'SNF',
    reputation: 68,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 17,
    budget: 25_000_000,
  },
  {
    id: 'club-fluminense-tricolor',
    name: 'Fluminense Tricolor',
    shortName: 'FLC',
    reputation: 70,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 15,
    budget: 30_000_000,
  },
  {
    id: 'club-internacional-colorados',
    name: 'Internacional Colorados',
    shortName: 'INC',
    reputation: 72,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 14,
    budget: 35_000_000,
  },
  {
    id: 'club-gremio-grizzlies',
    name: 'Grêmio Grizzlies',
    shortName: 'GGZ',
    reputation: 71,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 15,
    budget: 32_000_000,
  },
  {
    id: 'club-botafogo-star',
    name: 'Botafogo Star',
    shortName: 'BTS',
    reputation: 66,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 12,
    budget: 22_000_000,
  },
  {
    id: 'club-vasco-crosses',
    name: 'Vasco Crosses',
    shortName: 'VSC',
    reputation: 64,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 12,
    budget: 20_000_000,
  },
  {
    id: 'club-cruzeiro-foxes',
    name: 'Cruzeiro Foxes',
    shortName: 'CZF',
    reputation: 67,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 13,
    budget: 24_000_000,
  },
  {
    id: 'club-athletico-paranaense-hurricane',
    name: 'Athletico Paranaense Hurricane',
    shortName: 'APH',
    reputation: 65,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 13,
    budget: 21_000_000,
  },
  {
    id: 'club-fortaleza-lions',
    name: 'Fortaleza Lions',
    shortName: 'FTL',
    reputation: 60,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 11,
    budget: 15_000_000,
  },
  {
    id: 'club-bahia-sailors',
    name: 'Bahia Sailors',
    shortName: 'BHS',
    reputation: 58,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 11,
    budget: 14_000_000,
  },
  {
    id: 'club-goias-esmeraldino',
    name: 'Goias Esmeraldino',
    shortName: 'GES',
    reputation: 52,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 9,
    budget: 9_000_000,
  },
  {
    id: 'club-sport-recife-lions',
    name: 'Sport Recife Lions',
    shortName: 'SRL',
    reputation: 50,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 8_000_000,
  },
  {
    id: 'club-cuiaba-golden',
    name: 'Cuiabá Golden',
    shortName: 'CUG',
    reputation: 45,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 6_000_000,
  },
  {
    id: 'club-ceara-sharks',
    name: 'Ceará Sharks',
    shortName: 'CES',
    reputation: 48,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 7_000_000,
  },
  {
    id: 'club-america-mineiro-rabbits',
    name: 'América Mineiro Rabbits',
    shortName: 'AMB',
    reputation: 40,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 5_000_000,
  },
];

// ---------------------------------------------------------------------------
// Série B (20 clubs, reputation 15-38)
// ---------------------------------------------------------------------------

const SERIE_B_CLUBS: ClubData[] = [
  {
    id: 'club-santos-b-beach',
    name: 'Santos B Beach',
    shortName: 'SBB',
    reputation: 38,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 3_500_000,
  },
  {
    id: 'club-ponte-preta-macaques',
    name: 'Ponte Preta Macaques',
    shortName: 'PPM',
    reputation: 36,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 3_000_000,
  },
  {
    id: 'club-guarani-indians',
    name: 'Guarani Indians',
    shortName: 'GND',
    reputation: 32,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 2_500_000,
  },
  {
    id: 'club-sampaio-correa-blues',
    name: 'Sampaio Corrêa Blues',
    shortName: 'SCB',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_200_000,
  },
  {
    id: 'club-tombense-reds',
    name: 'Tombense Reds',
    shortName: 'TBR',
    reputation: 20,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 800_000,
  },
  {
    id: 'club-coritiba-greens',
    name: 'Coritiba Greens',
    shortName: 'CTG',
    reputation: 35,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 8,
    budget: 3_000_000,
  },
  {
    id: 'club-ituano-roosters',
    name: 'Ituano Roosters',
    shortName: 'ITR',
    reputation: 22,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 900_000,
  },
  {
    id: 'club-chapecoense-greens',
    name: 'Chapecoense Greens',
    shortName: 'CHG',
    reputation: 30,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 2_000_000,
  },
  {
    id: 'club-operario-ferroviario-iron',
    name: 'Operário Ferroviário Iron',
    shortName: 'OFI',
    reputation: 24,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_000_000,
  },
  {
    id: 'club-abc-troopers',
    name: 'ABC Troopers',
    shortName: 'ABT',
    reputation: 18,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 600_000,
  },
  {
    id: 'club-paysandu-remo',
    name: 'Paysandu Remo',
    shortName: 'PYR',
    reputation: 26,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_300_000,
  },
  {
    id: 'club-figueirense-sharks',
    name: 'Figueirense Sharks',
    shortName: 'FGS',
    reputation: 28,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_500_000,
  },
  {
    id: 'club-criciuma-tigers',
    name: 'Criciúma Tigers',
    shortName: 'CRT',
    reputation: 33,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 7,
    budget: 2_500_000,
  },
  {
    id: 'club-novorizontino-red',
    name: 'Novorizontino Red',
    shortName: 'NVR',
    reputation: 21,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 850_000,
  },
  {
    id: 'club-vila-nova-tigers',
    name: 'Vila Nova Tigers',
    shortName: 'VNT',
    reputation: 23,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 950_000,
  },
  {
    id: 'club-londrina-tubarao',
    name: 'Londrina Tubarão',
    shortName: 'LDT',
    reputation: 19,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 700_000,
  },
  {
    id: 'club-botafogo-sp-stars',
    name: 'Botafogo SP Stars',
    shortName: 'BSS',
    reputation: 29,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 6,
    budget: 1_700_000,
  },
  {
    id: 'club-avai-seagulls',
    name: 'Avaí Seagulls',
    shortName: 'AVS',
    reputation: 27,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_400_000,
  },
  {
    id: 'club-nautico-sailors',
    name: 'Náutico Sailors',
    shortName: 'NTS',
    reputation: 17,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 550_000,
  },
  {
    id: 'club-confianca-confidence',
    name: 'Confiança Confidence',
    shortName: 'CCF',
    reputation: 15,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 400_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const BRAZIL_LEAGUES: LeagueData[] = [
  {
    id: 'league-serie-a',
    name: 'Série A',
    shortName: 'SA',
    tier: 1,
    clubs: SERIE_A_CLUBS,
  },
  {
    id: 'league-serie-b',
    name: 'Série B',
    shortName: 'SB',
    tier: 2,
    clubs: SERIE_B_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools (Brazilian players often use single names or short nicknames)
// ---------------------------------------------------------------------------

export const BRAZILIAN_FIRST_NAMES: string[] = [
  // Common given names and nicknames used in Brazilian football
  'Gabriel', 'Lucas', 'Thiago', 'Felipe', 'Rodrigo', 'Matheus', 'Bruno',
  'Vinicius', 'Richarlison', 'Casemiro', 'Fabinho', 'Everton', 'Antony',
  'Raphinha', 'Fred', 'Ederson', 'Endrick', 'Igor', 'Guilherme', 'Renan',
  'Danilo', 'André', 'Éder', 'Malcom', 'Willian', 'Douglas', 'Alex',
  'Neymar', 'Ronaldo', 'Ronaldinho', 'Adriano', 'Robinho', 'Kaka', 'Hulk',
  'Diego', 'Pato', 'Deco', 'Denilson', 'Rivaldo', 'Roberto', 'Elano',
  'Leonardo', 'Anderson', 'Marcelo', 'Alisson', 'David', 'Arthur', 'Luan',
  'Gerson', 'Evanilson', 'Pedri', 'Yuri', 'Brenner', 'Marquinhos', 'Militão',
  'Pedro', 'Coutinho', 'Firmino', 'Neres', 'Paulinho', 'Fernandinho', 'Ramires',
  'Oscar', 'Willian', 'Bernard', 'Taison', 'Julio', 'Carlos', 'Eduardo',
  'Rafael', 'Filipe', 'Jonas', 'Hulk', 'Leandro', 'Romulo', 'Giovanni',
];

export const BRAZILIAN_LAST_NAMES: string[] = [
  'Silva', 'Santos', 'Oliveira', 'Costa', 'Souza', 'Pereira', 'Lima',
  'Ferreira', 'Rodrigues', 'Alves', 'Júnior', 'Neres', 'Coutinho',
  'Militão', 'Marquinhos', 'Paquetá', 'Arthur', 'Douglas', 'Willian', 'David',
  'Barbosa', 'Araújo', 'Nascimento', 'Conceição', 'Luiz', 'Roberto',
  'Moura', 'Gomes', 'Carvalho', 'Dias', 'Neto', 'Lopes', 'Mendes',
  'Ribeiro', 'Teixeira', 'Monteiro', 'Freitas', 'Rocha', 'Cardoso', 'Martins',
  'Borges', 'Correia', 'Machado', 'Ramos', 'Campos', 'Castro', 'Cruz',
  'Cunha', 'Figueiredo', 'Gonçalves', 'Jesus', 'Marques', 'Medeiros', 'Miranda',
  'Moreira', 'Nunes', 'Pacheco', 'Pinto', 'Rezende', 'Ribas', 'Siqueira',
  'Soares', 'Tavares', 'Vieira', 'Xavier', 'Zanella', 'Andrade', 'Azevedo',
  'Batista', 'Bezerra', 'Bittencourt', 'Cavalcanti', 'Dantas', 'Farias', 'Guimarães',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const BRAZILIAN_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Argentine: [
    'Lionel', 'Angel', 'Gonzalo', 'Ezequiel', 'Lautaro', 'Joaquin', 'Nicolas',
    'Paulo', 'Franco', 'Facundo', 'Germán', 'Diego', 'Valentín', 'Julián',
    'Leandro', 'Cristian', 'Guido', 'Santiago', 'Enzo', 'Maxi',
  ],
  Colombian: [
    'James', 'Falcao', 'Juan', 'Carlos', 'Luis', 'Miguel', 'Yerry',
    'Davinson', 'Cucho', 'Rafael', 'Juan Fernando', 'Wilmar', 'Camilo',
    'Jorge', 'Jhon', 'Bernardo', 'Mateus', 'Andres', 'Sebastian', 'Freddy',
  ],
  Uruguayan: [
    'Luis', 'Diego', 'Edinson', 'Fernando', 'José', 'Rodrigo', 'Matías',
    'Nahitan', 'Maxi', 'Federico', 'Nicolas', 'Jonathan', 'Giorgian', 'Darwin',
    'Facundo', 'Sebastián', 'Marcelo', 'Gastón', 'Ezequiel', 'Álvaro',
  ],
  Chilean: [
    'Alexis', 'Arturo', 'Charles', 'Eduardo', 'Mauricio', 'Gary', 'Jean',
    'Erick', 'Felipe', 'Claudio', 'Ben', 'Fabián', 'Paulo', 'Gabriel',
    'Ivan', 'Diego', 'César', 'José', 'Leonardo', 'Rodrigo',
  ],
  Venezuelan: [
    'Tomás', 'Josef', 'Jhon', 'Darwin', 'Adalberto', 'Yangel', 'Yeferson',
    'Salomón', 'Wuilker', 'Ronaldo', 'Luis', 'Roberto', 'Rolf', 'Jan',
    'Alejandro', 'Christian', 'Eduardo', 'Rony', 'Sergio', 'Jefferson',
  ],
};

export const BRAZILIAN_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Argentine: [
    'Messi', 'Agüero', 'Higuaín', 'Di María', 'Dybala', 'Paredes',
    'Otamendi', 'Tagliafico', 'Acuña', 'Molina', 'Martínez', 'Mac Allister',
    'Fernández', 'de Paul', 'Palacios', 'Correa', 'Romero', 'Soulé', 'Garnacho', 'Beltrán',
  ],
  Colombian: [
    'Rodríguez', 'Falcao', 'Cuadrado', 'Zapata', 'Mina', 'Sánchez', 'Lerma',
    'Quintero', 'Arias', 'Córdoba', 'Díaz', 'Borre', 'Cárdenas', 'Mojica',
    'Muñoz', 'Peñaloza', 'Ramos', 'Torres', 'Uribe', 'Valencia',
  ],
  Uruguayan: [
    'Suárez', 'Forlán', 'Cavani', 'Muslera', 'Godín', 'Bentancur',
    'Nández', 'Vietto', 'Valverde', 'Araújo', 'Torreira', 'Olivera',
    'Marichal', 'Coates', 'Giménez', 'Matías', 'Cáceres', 'Stuani', 'Pellistri', 'Ugarte',
  ],
  Chilean: [
    'Sánchez', 'Vidal', 'Bravo', 'Medel', 'Isla', 'Vargas', 'Alexis',
    'Beausejour', 'Aranguiz', 'Pulgar', 'Brereton', 'Assadi', 'Mena', 'Gutierrez',
    'Osorio', 'Castillo', 'Fuenzalida', 'Mora', 'Rojas', 'Suazo',
  ],
  Venezuelan: [
    'Rondón', 'Hernández', 'Martínez', 'Soteldo', 'Cordova', 'Rincón',
    'Osorio', 'Murillo', 'Castellanos', 'Savarino', 'Nández', 'Vizcarrondo',
    'González', 'Mago', 'Peñaranda', 'Arango', 'Sánchez', 'Silva', 'Torres', 'Reyes',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const BRAZIL_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Brazilian', weight: 85 },
    { nationality: 'Argentine', weight: 5 },
    { nationality: 'Colombian', weight: 3 },
    { nationality: 'Uruguayan', weight: 3 },
    { nationality: 'Chilean', weight: 2 },
    { nationality: 'Venezuelan', weight: 1 },
    { nationality: 'Portuguese', weight: 1 },
  ],
  2: [
    { nationality: 'Brazilian', weight: 92 },
    { nationality: 'Argentine', weight: 3 },
    { nationality: 'Colombian', weight: 2 },
    { nationality: 'Uruguayan', weight: 2 },
    { nationality: 'Chilean', weight: 1 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const BRAZIL_DATA: CountryData = {
  key: 'brazil',
  name: 'Brazil',
  leagues: BRAZIL_LEAGUES,
  nativeNamePool: {
    firstNames: BRAZILIAN_FIRST_NAMES,
    lastNames: BRAZILIAN_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(BRAZILIAN_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: BRAZILIAN_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: BRAZIL_NATIONALITIES_BY_TIER,
};
