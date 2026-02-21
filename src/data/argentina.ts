/**
 * Static world data for the Argentine football pyramid.
 *
 * All club names are clearly fictional but inspired by Argentine football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. Primera División clubs are 35-78; Nacional B 12-33.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Primera División (20 clubs, reputation 35-78)
// ---------------------------------------------------------------------------

const PRIMERA_DIVISION_CLUBS: ClubData[] = [
  {
    id: 'club-river-plate-reds',
    name: 'River Plate Reds',
    shortName: 'RPR',
    reputation: 78,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 18,
    budget: 40_000_000,
  },
  {
    id: 'club-boca-blues',
    name: 'Boca Blues',
    shortName: 'BCB',
    reputation: 76,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 16,
    budget: 38_000_000,
  },
  {
    id: 'club-racing-whites',
    name: 'Racing Whites',
    shortName: 'RCW',
    reputation: 68,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 15,
    budget: 20_000_000,
  },
  {
    id: 'club-independiente-reds',
    name: 'Independiente Reds',
    shortName: 'IDR',
    reputation: 65,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 15,
    budget: 18_000_000,
  },
  {
    id: 'club-san-lorenzo-crows',
    name: 'San Lorenzo Crows',
    shortName: 'SLC',
    reputation: 64,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 14,
    budget: 17_000_000,
  },
  {
    id: 'club-huracan-balloon',
    name: 'Huracán Balloon',
    shortName: 'HUB',
    reputation: 58,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 12,
    budget: 10_000_000,
  },
  {
    id: 'club-lanus-pomegranates',
    name: 'Lanús Pomegranates',
    shortName: 'LNP',
    reputation: 60,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 12,
    budget: 12_000_000,
  },
  {
    id: 'club-estudiantes-pinchas',
    name: 'Estudiantes Pinchas',
    shortName: 'ESP',
    reputation: 62,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 14,
    budget: 15_000_000,
  },
  {
    id: 'club-banfield-greens',
    name: 'Banfield Greens',
    shortName: 'BFG',
    reputation: 56,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 11,
    budget: 9_000_000,
  },
  {
    id: 'club-arsenal-sarandi-reds',
    name: 'Arsenal Sarandí Reds',
    shortName: 'ASR',
    reputation: 52,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 10,
    budget: 7_000_000,
  },
  {
    id: 'club-godoy-cruz-tombinos',
    name: 'Godoy Cruz Tombinos',
    shortName: 'GCT',
    reputation: 55,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 11,
    budget: 8_000_000,
  },
  {
    id: 'club-talleres-cordoba-talleres',
    name: 'Talleres Córdoba',
    shortName: 'TLC',
    reputation: 59,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 12,
    budget: 11_000_000,
  },
  {
    id: 'club-atletico-tucuman-decano',
    name: 'Atlético Tucumán Decano',
    shortName: 'ATD',
    reputation: 54,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 7_500_000,
  },
  {
    id: 'club-belgrano-pirates',
    name: 'Belgrano Pirates',
    shortName: 'BLP',
    reputation: 50,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 6_000_000,
  },
  {
    id: 'club-velez-sarsfield-whites',
    name: 'Vélez Sarsfield Whites',
    shortName: 'VSW',
    reputation: 63,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 15,
    budget: 16_000_000,
  },
  {
    id: 'club-colon-santa-fe-sabaleros',
    name: 'Colón Santa Fé Sabaleros',
    shortName: 'CSS',
    reputation: 48,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 9,
    budget: 5_500_000,
  },
  {
    id: 'club-union-santa-fe-tatengues',
    name: 'Unión Santa Fé Tatengues',
    shortName: 'UST',
    reputation: 46,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 5_000_000,
  },
  {
    id: 'club-central-cordoba-ferroviarios',
    name: 'Central Córdoba Ferroviarios',
    shortName: 'CCF',
    reputation: 42,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 4_000_000,
  },
  {
    id: 'club-platense-calamares',
    name: 'Platense Calamares',
    shortName: 'PLC',
    reputation: 38,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 3_000_000,
  },
  {
    id: 'club-tigre-matadores',
    name: 'Tigre Matadores',
    shortName: 'TGM',
    reputation: 35,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 7,
    budget: 2_500_000,
  },
];

// ---------------------------------------------------------------------------
// Nacional B (24 clubs, reputation 12-33)
// ---------------------------------------------------------------------------

const NACIONAL_B_CLUBS: ClubData[] = [
  {
    id: 'club-chacarita-juniors-funebres',
    name: 'Chacarita Juniors Fúnebres',
    shortName: 'CJF',
    reputation: 33,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 7,
    budget: 2_000_000,
  },
  {
    id: 'club-atlanta-bohemians',
    name: 'Atlanta Bohemians',
    shortName: 'ATB',
    reputation: 28,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_500_000,
  },
  {
    id: 'club-all-boys-albos',
    name: 'All Boys Albos',
    shortName: 'ABA',
    reputation: 30,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_700_000,
  },
  {
    id: 'club-almagro-tricolores',
    name: 'Almagro Tricolores',
    shortName: 'ALT',
    reputation: 26,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_200_000,
  },
  {
    id: 'club-san-martin-tucuman-santos',
    name: 'San Martín Tucumán Santos',
    shortName: 'SMS',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_100_000,
  },
  {
    id: 'club-deportivo-riestra-whites',
    name: 'Deportivo Riestra Whites',
    shortName: 'DRW',
    reputation: 20,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 700_000,
  },
  {
    id: 'club-san-martin-san-juan-verdes',
    name: 'San Martín San Juan Verdes',
    shortName: 'SSV',
    reputation: 22,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 850_000,
  },
  {
    id: 'club-instituto-cordoba-gloria',
    name: 'Instituto Córdoba Gloria',
    shortName: 'ICG',
    reputation: 27,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_300_000,
  },
  {
    id: 'club-deportivo-madryn-patagonia',
    name: 'Deportivo Madryn Patagonia',
    shortName: 'DMP',
    reputation: 14,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 400_000,
  },
  {
    id: 'club-santamarina-tandil-springs',
    name: 'Santamarina Tandil Springs',
    shortName: 'STS',
    reputation: 16,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 500_000,
  },
  {
    id: 'club-ferro-carril-oeste-greens',
    name: 'Ferro Carril Oeste Greens',
    shortName: 'FCG',
    reputation: 29,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_600_000,
  },
  {
    id: 'club-brown-adrogue-bears',
    name: 'Brown Adrogué Bears',
    shortName: 'BAB',
    reputation: 18,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 600_000,
  },
  {
    id: 'club-chaco-for-ever-tropics',
    name: 'Chaco For Ever Tropics',
    shortName: 'CFT',
    reputation: 19,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 650_000,
  },
  {
    id: 'club-gimnasia-mendoza-blues',
    name: 'Gimnasia Mendoza Blues',
    shortName: 'GMB',
    reputation: 21,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 800_000,
  },
  {
    id: 'club-los-andes-blues',
    name: 'Los Andes Blues',
    shortName: 'LAB',
    reputation: 24,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_000_000,
  },
  {
    id: 'club-quilmes-cerveceros',
    name: 'Quilmes Cerveceros',
    shortName: 'QLC',
    reputation: 30,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 6,
    budget: 1_800_000,
  },
  {
    id: 'club-flandria-canarios',
    name: 'Flandria Canarios',
    shortName: 'FLC',
    reputation: 13,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 380_000,
  },
  {
    id: 'club-villa-dalmine-greens',
    name: 'Villa Dalmíne Greens',
    shortName: 'VDG',
    reputation: 15,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 450_000,
  },
  {
    id: 'club-guarani-del-port',
    name: 'Guaraní del Port',
    shortName: 'GDP',
    reputation: 12,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 350_000,
  },
  {
    id: 'club-sp-de-belgrano-pioneers',
    name: 'Sp. de Belgrano Pioneers',
    shortName: 'SBP',
    reputation: 17,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 4,
    budget: 550_000,
  },
  {
    id: 'club-deportivo-armenio-reds',
    name: 'Deportivo Armenio Reds',
    shortName: 'DAR',
    reputation: 13,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 380_000,
  },
  {
    id: 'club-union-sunchales-greens',
    name: 'Unión Sunchales Greens',
    shortName: 'USG',
    reputation: 14,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 400_000,
  },
  {
    id: 'club-deportivo-morron-blacks',
    name: 'Deportivo Morrón Blacks',
    shortName: 'DMB',
    reputation: 16,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 480_000,
  },
  {
    id: 'club-guemes-santiago',
    name: 'Güemes Santiago',
    shortName: 'GST',
    reputation: 15,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 3,
    budget: 420_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const ARGENTINA_LEAGUES: LeagueData[] = [
  {
    id: 'league-primera-division',
    name: 'Primera División',
    shortName: 'PD',
    tier: 1,
    clubs: PRIMERA_DIVISION_CLUBS,
  },
  {
    id: 'league-nacional-b',
    name: 'Nacional B',
    shortName: 'NB',
    tier: 2,
    clubs: NACIONAL_B_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const ARGENTINE_FIRST_NAMES: string[] = [
  'Lionel', 'Angel', 'Gonzalo', 'Ezequiel', 'Maxi', 'Juan', 'Sergio',
  'Alejandro', 'Rodrigo', 'Lautaro', 'Joaquin', 'Nicolas', 'Paulo',
  'Franco', 'Facundo', 'Germán', 'Diego', 'Erik', 'Valentín', 'Thiago',
  'Julián', 'Leandro', 'Cristian', 'Guido', 'Santiago', 'Enzo', 'Mauro',
  'Federico', 'Matías', 'Ramiro', 'Mariano', 'Hernán', 'Lucas', 'Ignacio',
  'Sebastián', 'Gustavo', 'Marcelo', 'Daniel', 'Gabriel', 'Eduardo',
  'Carlos', 'Roberto', 'Luis', 'Claudio', 'Ricardo', 'Ariel', 'Mario',
  'Jorge', 'Andrés', 'Martín', 'Pablo', 'Oscar', 'Víctor', 'Emiliano',
  'Nahuel', 'Exequiel', 'Marcos', 'Lisandro', 'Alexis', 'Braian', 'Tomas',
  'Thiago', 'Agustín', 'Franco', 'Alan', 'Ulises', 'Bruno', 'Elián',
  'Mateo', 'Gino', 'Agustín', 'Renzo', 'Valentino', 'Bautista', 'Luca',
];

export const ARGENTINE_LAST_NAMES: string[] = [
  'Messi', 'Agüero', 'Higuaín', 'Di María', 'Dybala', 'Paredes',
  'Otamendi', 'Tagliafico', 'Acuña', 'Molina', 'Montiel', 'Martínez',
  'Mac Allister', 'Fernández', 'de Paul', 'Palacios', 'Correa', 'González',
  'Romero', 'Lisandro', 'Soulé', 'Garnacho', 'Alario', 'Beltrán',
  'García', 'López', 'Rodríguez', 'Sánchez', 'Pérez', 'Gómez',
  'Castro', 'Torres', 'Flores', 'Díaz', 'Vega', 'Herrera', 'Medina',
  'Morales', 'Suárez', 'Rojas', 'Reyes', 'Blanco', 'Ríos', 'Vargas',
  'Navarro', 'Ibáñez', 'Guerrero', 'Soto', 'Benítez', 'Alvarez',
  'Pereyra', 'Banega', 'Pratto', 'Kranevitter', 'Driussi', 'Borré',
  'Montoya', 'Calleri', 'Girotti', 'Bou', 'Juárez', 'Pérez', 'Almada',
  'Barco', 'Zeballos', 'Carboni', 'Equi', 'Gondou', 'Viatri', 'Castellanos',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const ARGENTINE_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Brazilian: [
    'Gabriel', 'Lucas', 'Thiago', 'Felipe', 'Rodrigo', 'Matheus', 'Bruno',
    'Vinicius', 'Richarlison', 'Casemiro', 'Fabinho', 'Everton', 'Antony',
    'Raphinha', 'Fred', 'Ederson', 'Endrick', 'Igor', 'Guilherme', 'Renan',
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
  Paraguayan: [
    'Roque', 'Miguel', 'José', 'Carlos', 'Nelson', 'Óscar', 'Jorge',
    'Raúl', 'Cristian', 'Nildo', 'Darío', 'Andrés', 'Marcos', 'Diego',
    'Pablo', 'César', 'Ernesto', 'Federico', 'Rodrigo', 'Antolín',
  ],
  Chilean: [
    'Alexis', 'Arturo', 'Charles', 'Eduardo', 'Mauricio', 'Gary', 'Jean',
    'Erick', 'Felipe', 'Claudio', 'Ben', 'Fabián', 'Paulo', 'Gabriel',
    'Ivan', 'Diego', 'César', 'José', 'Leonardo', 'Rodrigo',
  ],
};

export const ARGENTINE_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Brazilian: [
    'Silva', 'Santos', 'Oliveira', 'Costa', 'Souza', 'Pereira', 'Lima',
    'Ferreira', 'Rodrigues', 'Alves', 'Júnior', 'Neres', 'Militão',
    'Marquinhos', 'Paquetá', 'Arthur', 'Barbosa', 'Araújo', 'Nascimento', 'Luiz',
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
  Paraguayan: [
    'Santa Cruz', 'Cardozo', 'Alcaraz', 'Bareiro', 'Romero', 'Valdez',
    'Estigarribia', 'Vera', 'Martínez', 'Benítez', 'Bobadilla', 'Gamarra',
    'Paredes', 'Arzamendia', 'Alderete', 'Sanabria', 'Giménez', 'Montiel', 'Meza', 'Balbuena',
  ],
  Chilean: [
    'Sánchez', 'Vidal', 'Bravo', 'Medel', 'Isla', 'Vargas', 'Alexis',
    'Beausejour', 'Aranguiz', 'Pulgar', 'Brereton', 'Assadi', 'Mena', 'Gutierrez',
    'Osorio', 'Castillo', 'Fuenzalida', 'Mora', 'Rojas', 'Suazo',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const ARGENTINA_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Argentine', weight: 82 },
    { nationality: 'Brazilian', weight: 5 },
    { nationality: 'Uruguayan', weight: 4 },
    { nationality: 'Colombian', weight: 3 },
    { nationality: 'Paraguayan', weight: 3 },
    { nationality: 'Chilean', weight: 2 },
    { nationality: 'Spanish', weight: 1 },
  ],
  2: [
    { nationality: 'Argentine', weight: 90 },
    { nationality: 'Uruguayan', weight: 4 },
    { nationality: 'Brazilian', weight: 2 },
    { nationality: 'Paraguayan', weight: 2 },
    { nationality: 'Colombian', weight: 1 },
    { nationality: 'Chilean', weight: 1 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const ARGENTINA_DATA: CountryData = {
  key: 'argentina',
  name: 'Argentina',
  leagues: ARGENTINA_LEAGUES,
  nativeNamePool: {
    firstNames: ARGENTINE_FIRST_NAMES,
    lastNames: ARGENTINE_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(ARGENTINE_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: ARGENTINE_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: ARGENTINA_NATIONALITIES_BY_TIER,
};
