/**
 * Static world data for the Mexican football pyramid.
 *
 * All club names are clearly fictional but inspired by Mexican football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. Liga MX clubs are 30-65.
 * secondary: true — generates clubs and players but does NOT simulate fixtures.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Liga MX (18 clubs, reputation 30-65)
// ---------------------------------------------------------------------------

const LIGA_MX_CLUBS: ClubData[] = [
  {
    id: 'club-azteca-fc',
    name: 'Azteca FC',
    shortName: 'AZT',
    reputation: 65,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 14,
    budget: 40_000_000,
  },
  {
    id: 'club-monterrey-rayados',
    name: 'Monterrey Rayados',
    shortName: 'MNR',
    reputation: 63,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 13,
    budget: 36_000_000,
  },
  {
    id: 'club-guadalajara-flames',
    name: 'Guadalajara Flames',
    shortName: 'GDF',
    reputation: 62,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 15,
    budget: 34_000_000,
  },
  {
    id: 'club-cdmx-pumas',
    name: 'CDMX Pumas',
    shortName: 'CDP',
    reputation: 60,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 14,
    budget: 30_000_000,
  },
  {
    id: 'club-tigres-del-norte',
    name: 'Tigres del Norte',
    shortName: 'TGN',
    reputation: 62,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 13,
    budget: 35_000_000,
  },
  {
    id: 'club-santos-laguna-verde',
    name: 'Santos Laguna Verde',
    shortName: 'SLV',
    reputation: 58,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 12,
    budget: 25_000_000,
  },
  {
    id: 'club-toluca-reds',
    name: 'Club Toluca Reds',
    shortName: 'CTR',
    reputation: 56,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 12,
    budget: 22_000_000,
  },
  {
    id: 'club-pachuca-tuzos',
    name: 'Pachuca Tuzos',
    shortName: 'PCT',
    reputation: 55,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 13,
    budget: 20_000_000,
  },
  {
    id: 'club-cruz-azul-stars',
    name: 'Cruz Azul Stars',
    shortName: 'CZS',
    reputation: 58,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 12,
    budget: 24_000_000,
  },
  {
    id: 'club-leon-emeralds',
    name: 'Leon Emeralds',
    shortName: 'LNE',
    reputation: 52,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 11,
    budget: 16_000_000,
  },
  {
    id: 'club-atlas-rojinegro',
    name: 'Atlas Rojinegro',
    shortName: 'ATR',
    reputation: 50,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 11,
    budget: 14_000_000,
  },
  {
    id: 'club-puebla-stripe',
    name: 'Puebla Stripe',
    shortName: 'PBS',
    reputation: 48,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 10,
    budget: 12_000_000,
  },
  {
    id: 'club-tijuana-xolos',
    name: 'Tijuana Xolos',
    shortName: 'TJX',
    reputation: 46,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 9,
    budget: 10_000_000,
  },
  {
    id: 'club-necaxa-lightning',
    name: 'Necaxa Lightning',
    shortName: 'NXL',
    reputation: 44,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 9,
    budget: 9_000_000,
  },
  {
    id: 'club-queretaro-whites',
    name: 'Queretaro Whites',
    shortName: 'QTW',
    reputation: 40,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 7_000_000,
  },
  {
    id: 'club-mazatlan-cannoneers',
    name: 'Mazatlan Cannoneers',
    shortName: 'MZC',
    reputation: 36,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 7,
    budget: 5_000_000,
  },
  {
    id: 'club-juarez-bravos',
    name: 'Juarez Bravos',
    shortName: 'JZB',
    reputation: 33,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 4_000_000,
  },
  {
    id: 'club-san-luis-tuneros',
    name: 'San Luis Tuneros',
    shortName: 'SLT',
    reputation: 30,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 3_000_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const MEXICO_LEAGUES: LeagueData[] = [
  {
    id: 'league-liga-mx',
    name: 'Liga MX',
    shortName: 'LMX',
    tier: 1,
    clubs: LIGA_MX_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools (common Mexican Spanish names)
// ---------------------------------------------------------------------------

export const MEXICAN_FIRST_NAMES: string[] = [
  // Common Mexican given names
  'Carlos', 'Luis', 'Miguel', 'Jorge', 'José', 'Alejandro', 'Fernando',
  'Rafael', 'Diego', 'Erick', 'Eduardo', 'Ricardo', 'Marco', 'Víctor',
  'Guillermo', 'Héctor', 'Andrés', 'Roberto', 'Javier', 'Raúl',
  'Hirving', 'Rodolfo', 'Alan', 'Jesús', 'Uriel', 'Sebastián', 'Emilio',
  'Ernesto', 'Gilberto', 'Gerardo', 'Alfredo', 'Arturo', 'Enrique', 'Iván',
  'César', 'Daniel', 'Manuel', 'Pablo', 'Gustavo', 'Rolando',
  'Adrián', 'Santiago', 'Jesús', 'Mario', 'Armando', 'Jaime', 'Hugo',
  'Oscar', 'Pedro', 'Alberto', 'Rubén', 'Alejandro', 'Francisco', 'Cristian',
  'Jonathan', 'Efraín', 'Ronaldo', 'Brandon', 'Yahir', 'Óscar', 'Ulises',
  'Benigno', 'Lozano', 'Alvarado', 'Pizarro', 'Romo', 'Reyes', 'Jiménez',
  'Morales', 'Vega', 'Zavala', 'Quiroga', 'Barreto', 'Espinoza', 'Trejo',
];

export const MEXICAN_LAST_NAMES: string[] = [
  'García', 'Martínez', 'López', 'González', 'Pérez', 'Sánchez', 'Ramírez',
  'Torres', 'Flores', 'Rivera', 'Gómez', 'Díaz', 'Reyes', 'Cruz', 'Morales',
  'Ortiz', 'Hernández', 'Rojas', 'Jiménez', 'Lozano',
  'Vela', 'Guardado', 'Salcedo', 'Araujo', 'Ochoa', 'Corona', 'Álvarez',
  'Ramos', 'Domínguez', 'Vargas', 'Aguilar', 'Castillo', 'Ríos', 'Medina',
  'Miranda', 'Mendoza', 'Navarro', 'Ibáñez', 'Delgado', 'Fuentes',
  'Vásquez', 'Herrera', 'Ruiz', 'Acosta', 'Pacheco', 'Nuñez', 'Cabrera',
  'Campos', 'Espinosa', 'Gutiérrez', 'Avila', 'Montes', 'Serrano', 'Castro',
  'Mora', 'Maldonado', 'Luna', 'Peña', 'Trujillo', 'Ávila', 'Cisneros',
  'Osorio', 'Villanueva', 'Méndez', 'Ponce', 'Guerrero', 'Rentería', 'Nava',
  'Muñoz', 'Padilla', 'Contreras', 'Valdez', 'Carrillo', 'Zúñiga', 'Becerra',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const MEXICO_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
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
  Brazilian: [
    'Gabriel', 'Lucas', 'Thiago', 'Felipe', 'Rodrigo', 'Matheus', 'Bruno',
    'Vinicius', 'Casemiro', 'Fabinho', 'Everton', 'Antony', 'Raphinha', 'Fred',
    'Ederson', 'Igor', 'Guilherme', 'Renan', 'Danilo', 'André',
  ],
};

export const MEXICO_FOREIGN_LAST_NAMES: Record<string, string[]> = {
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
  Brazilian: [
    'Silva', 'Santos', 'Oliveira', 'Costa', 'Souza', 'Pereira', 'Lima',
    'Ferreira', 'Rodrigues', 'Alves', 'Militão', 'Marquinhos', 'Paquetá',
    'Arthur', 'Barbosa', 'Araújo', 'Nascimento', 'Luiz', 'Moura', 'Gomes',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const MEXICO_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Mexican', weight: 82 },
    { nationality: 'Argentine', weight: 5 },
    { nationality: 'Brazilian', weight: 4 },
    { nationality: 'Colombian', weight: 3 },
    { nationality: 'Uruguayan', weight: 2 },
    { nationality: 'American', weight: 2 },
    { nationality: 'Spanish', weight: 2 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const MEXICO_DATA: CountryData = {
  key: 'mexico',
  name: 'Mexico',
  leagues: MEXICO_LEAGUES,
  nativeNamePool: {
    firstNames: MEXICAN_FIRST_NAMES,
    lastNames: MEXICAN_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(MEXICO_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: MEXICO_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: MEXICO_NATIONALITIES_BY_TIER,
  secondary: true,
};
