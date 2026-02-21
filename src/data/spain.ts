/**
 * Static world data for the Spanish football pyramid.
 *
 * All club names are clearly fictional but inspired by Spanish football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. La Liga clubs are 55-95; Segunda 25-50.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// La Liga (20 clubs, reputation 55-95)
// ---------------------------------------------------------------------------

const LA_LIGA_CLUBS: ClubData[] = [
  {
    id: 'club-royal-madrid-fc',
    name: 'Royal Madrid FC',
    shortName: 'RMD',
    reputation: 95,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 17,
    budget: 300_000_000,
  },
  {
    id: 'club-barcelona-eagles',
    name: 'Barcelona Eagles',
    shortName: 'BCE',
    reputation: 93,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 19,
    budget: 250_000_000,
  },
  {
    id: 'club-atletico-reds',
    name: 'Atletico Reds',
    shortName: 'ATR',
    reputation: 88,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 14,
    budget: 120_000_000,
  },
  {
    id: 'club-sevilla-toreros',
    name: 'Sevilla Toreros',
    shortName: 'SVT',
    reputation: 82,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 15,
    budget: 70_000_000,
  },
  {
    id: 'club-valencia-bats',
    name: 'Valencia Bats',
    shortName: 'VLB',
    reputation: 79,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 13,
    budget: 50_000_000,
  },
  {
    id: 'club-real-sociedad-north',
    name: 'Real Sociedad North',
    shortName: 'RSN',
    reputation: 75,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 16,
    budget: 40_000_000,
  },
  {
    id: 'club-bilbao-lions',
    name: 'Bilbao Lions',
    shortName: 'BLL',
    reputation: 74,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 17,
    budget: 38_000_000,
  },
  {
    id: 'club-betis-greens',
    name: 'Betis Greens',
    shortName: 'BTG',
    reputation: 72,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 12,
    budget: 35_000_000,
  },
  {
    id: 'club-villarreal-yellows',
    name: 'Villarreal Yellows',
    shortName: 'VLY',
    reputation: 76,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 14,
    budget: 45_000_000,
  },
  {
    id: 'club-osasuna-reds',
    name: 'Osasuna Reds',
    shortName: 'OSR',
    reputation: 62,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 18_000_000,
  },
  {
    id: 'club-celta-vigo-blues',
    name: 'Celta Vigo Blues',
    shortName: 'CVB',
    reputation: 65,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 11,
    budget: 22_000_000,
  },
  {
    id: 'club-granada-pomegranates',
    name: 'Granada Pomegranates',
    shortName: 'GRD',
    reputation: 58,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 12_000_000,
  },
  {
    id: 'club-getafe-blues',
    name: 'Getafe Blues',
    shortName: 'GTB',
    reputation: 60,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 9,
    budget: 15_000_000,
  },
  {
    id: 'club-mallorca-islands',
    name: 'Mallorca Islands',
    shortName: 'MLI',
    reputation: 57,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 10_000_000,
  },
  {
    id: 'club-alaves-cats',
    name: 'Alaves Cats',
    shortName: 'ALC',
    reputation: 55,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 9_000_000,
  },
  {
    id: 'club-rayo-vallecano-rays',
    name: 'Rayo Vallecano Rays',
    shortName: 'RVR',
    reputation: 61,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 10,
    budget: 14_000_000,
  },
  {
    id: 'club-almeria-reds',
    name: 'Almeria Reds',
    shortName: 'ALR',
    reputation: 56,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 8,
    budget: 11_000_000,
  },
  {
    id: 'club-cadiz-yellows',
    name: 'Cadiz Yellows',
    shortName: 'CDZ',
    reputation: 55,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 8_000_000,
  },
  {
    id: 'club-girona-reds',
    name: 'Girona Reds',
    shortName: 'GNR',
    reputation: 68,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 11,
    budget: 25_000_000,
  },
  {
    id: 'club-las-palmas-canaries',
    name: 'Las Palmas Canaries',
    shortName: 'LPC',
    reputation: 58,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 12_000_000,
  },
];

// ---------------------------------------------------------------------------
// Segunda División (22 clubs, reputation 25-50)
// ---------------------------------------------------------------------------

const SEGUNDA_CLUBS: ClubData[] = [
  {
    id: 'club-zaragoza-kings',
    name: 'Zaragoza Kings',
    shortName: 'ZRK',
    reputation: 50,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 10,
    budget: 7_000_000,
  },
  {
    id: 'club-sporting-gijon-miners',
    name: 'Sporting Gijon Miners',
    shortName: 'SGM',
    reputation: 48,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 6_000_000,
  },
  {
    id: 'club-racing-santander-anchors',
    name: 'Racing Santander Anchors',
    shortName: 'RSA',
    reputation: 46,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 5_500_000,
  },
  {
    id: 'club-valladolid-purples',
    name: 'Valladolid Purples',
    shortName: 'VLP',
    reputation: 47,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 9,
    budget: 6_000_000,
  },
  {
    id: 'club-tenerife-blues',
    name: 'Tenerife Blues',
    shortName: 'TNB',
    reputation: 44,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 4_500_000,
  },
  {
    id: 'club-leganes-cucumbers',
    name: 'Leganes Cucumbers',
    shortName: 'LGC',
    reputation: 45,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 5_000_000,
  },
  {
    id: 'club-mirandes-red-whites',
    name: 'Mirandes Red-Whites',
    shortName: 'MRW',
    reputation: 38,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 3_000_000,
  },
  {
    id: 'club-burgos-whites',
    name: 'Burgos Whites',
    shortName: 'BRW',
    reputation: 36,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 2_800_000,
  },
  {
    id: 'club-eldense-greens',
    name: 'Eldense Greens',
    shortName: 'ELG',
    reputation: 28,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_500_000,
  },
  {
    id: 'club-huesca-mountains',
    name: 'Huesca Mountains',
    shortName: 'HMT',
    reputation: 40,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 3_500_000,
  },
  {
    id: 'club-eibar-hammers',
    name: 'Eibar Hammers',
    shortName: 'EBH',
    reputation: 43,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 4_000_000,
  },
  {
    id: 'club-levante-frogs',
    name: 'Levante Frogs',
    shortName: 'LVF',
    reputation: 46,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 9,
    budget: 5_500_000,
  },
  {
    id: 'club-cordoba-caliphs',
    name: 'Cordoba Caliphs',
    shortName: 'CRC',
    reputation: 33,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 2_000_000,
  },
  {
    id: 'club-andorra-eagles',
    name: 'Andorra Eagles',
    shortName: 'ANE',
    reputation: 25,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 5,
    budget: 1_000_000,
  },
  {
    id: 'club-malaga-suns',
    name: 'Malaga Suns',
    shortName: 'MLG',
    reputation: 45,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 9,
    budget: 5_000_000,
  },
  {
    id: 'club-ferrol-sailors',
    name: 'Ferrol Sailors',
    shortName: 'FRS',
    reputation: 30,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_800_000,
  },
  {
    id: 'club-oviedo-blues',
    name: 'Oviedo Blues',
    shortName: 'OVB',
    reputation: 42,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 4_000_000,
  },
  {
    id: 'club-sestao-river',
    name: 'Sestao River',
    shortName: 'STR',
    reputation: 27,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_200_000,
  },
  {
    id: 'club-alcorcon-blues',
    name: 'Alcorcon Blues',
    shortName: 'ACB',
    reputation: 32,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 7,
    budget: 2_000_000,
  },
  {
    id: 'club-cartagena-navy',
    name: 'Cartagena Navy',
    shortName: 'CTN',
    reputation: 35,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 7,
    budget: 2_500_000,
  },
  {
    id: 'club-ponferradina-miners',
    name: 'Ponferradina Miners',
    shortName: 'PFM',
    reputation: 29,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_600_000,
  },
  {
    id: 'club-lugo-romans',
    name: 'Lugo Romans',
    shortName: 'LGR',
    reputation: 26,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_100_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const SPAIN_LEAGUES: LeagueData[] = [
  {
    id: 'league-la-liga',
    name: 'La Liga',
    shortName: 'LL',
    tier: 1,
    clubs: LA_LIGA_CLUBS,
  },
  {
    id: 'league-segunda',
    name: 'Segunda División',
    shortName: 'SD',
    tier: 2,
    clubs: SEGUNDA_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const SPANISH_FIRST_NAMES: string[] = [
  'Alejandro', 'Pablo', 'Sergio', 'Carlos', 'Diego', 'Marcos', 'Álvaro',
  'Fernando', 'Adrián', 'David', 'Javier', 'Miguel', 'Rafael', 'Manuel',
  'Antonio', 'Jorge', 'Roberto', 'Óscar', 'Víctor', 'Rubén', 'Raúl',
  'Iván', 'Rodrigo', 'Borja', 'Isco', 'Koke', 'Pedri', 'Gavi', 'Ansu',
  'Ferran', 'Dani', 'Jordi', 'Mikel', 'Ander', 'Aritz', 'Asier',
  'Unai', 'Iker', 'Jon', 'Aitor', 'Xabi', 'Andoni', 'Julen', 'Gaizka',
  'Santi', 'Nacho', 'Cesc', 'Paco', 'Lolo', 'Toni', 'Cesc', 'Pepe',
  'Juanmi', 'Juanma', 'Joselu', 'Dani', 'Brahim', 'Yeremi', 'Bryan',
  'Eric', 'Marc', 'Gerard', 'Riqui', 'Aleix', 'Oriol', 'Sergi', 'Arnau',
  'Abel', 'Aitor', 'Inigo', 'Oihan', 'Javi', 'Fran', 'Alberto', 'Alvaro',
];

export const SPANISH_LAST_NAMES: string[] = [
  'García', 'Martínez', 'López', 'Sánchez', 'González', 'Fernández',
  'Pérez', 'Rodríguez', 'Jiménez', 'Torres', 'Ramos', 'Alba', 'Morata',
  'Busquets', 'Azpilicueta', 'Laporte', 'Navas', 'Carvajal', 'Piqué',
  'Xavi', 'Iniesta', 'Villa', 'Fabregas', 'Alonso', 'Casillas',
  'Moreno', 'Marcos', 'Bernat', 'Bartra', 'Puyol', 'Reina', 'Soria',
  'Muñoz', 'Rubio', 'Blanco', 'Castro', 'Romero', 'Vega', 'Diaz',
  'Monreal', 'Bellerin', 'Deulofeu', 'Denis', 'Sarabia', 'Oyarzabal',
  'Isak', 'Merino', 'Zubimendi', 'Elustondo', 'Barrenetxea', 'Sorloth',
  'Villarreal', 'Parejo', 'Capoue', 'Chukwueze', 'Kubo', 'Guerreiro',
  'Augusto', 'Matias', 'Herrera', 'Vidal', 'Riquelme', 'Acosta',
  'Gomez', 'Suarez', 'Valencia', 'Arango', 'Pizarro', 'Gallardo',
  'Canales', 'Joaquin', 'Guardado', 'Fekir', 'William', 'Coelho',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const SPANISH_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
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
  French: [
    'Lucas', 'Hugo', 'Louis', 'Antoine', 'Théo', 'Alexandre', 'Nicolas',
    'Kylian', 'Karim', 'Ousmane', 'Kingsley', 'Blaise', 'Paul', 'Raphael',
    'Benjamin', 'Jules', 'Mattéo', 'Moussa', 'Corentin', 'Rayan',
  ],
  Portuguese: [
    'Cristiano', 'Rúben', 'João', 'Bernardo', 'Diogo', 'Rafa', 'André',
    'Bruno', 'William', 'Gonçalo', 'Ricardo', 'Vitinha', 'Neto', 'Gedson',
    'Renato', 'Nuno', 'Pepe', 'Nelson', 'Sérgio', 'João Felix',
  ],
  African: [
    'Sadio', 'Riyad', 'Wilfried', 'Victor', 'Achraf', 'Hakim', 'Youssef',
    'Mohamed', 'Naby', 'Sékou', 'Ismaïla', 'Sébastien', 'Amara', 'Ibrahim',
    'Cheikhou', 'Idrissa', 'Bamba', 'Kévin', 'Ché', 'Samuel',
  ],
};

export const SPANISH_FOREIGN_LAST_NAMES: Record<string, string[]> = {
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
  French: [
    'Dupont', 'Martin', 'Bernard', 'Thomas', 'Petit', 'Leroy', 'Girard',
    'Mbappé', 'Benzema', 'Dembélé', 'Coman', 'Pogba', 'Lloris', 'Hernandez',
    'Pavard', 'Varane', 'Kimpembe', 'Upamecano', 'Camavinga', 'Tchouaméni',
  ],
  Portuguese: [
    'Ronaldo', 'Neves', 'Fernandes', 'Cancelo', 'Pepe', 'Dias', 'Mendes',
    'Moutinho', 'Guerreiro', 'Palhinha', 'Vitinha', 'Horta', 'Leão',
    'Semedo', 'Danilo', 'Gonçalves', 'Jota', 'Silva', 'Costa', 'Soares',
  ],
  African: [
    'Mané', 'Mahrez', 'Zaha', 'Osimhen', 'Hakimi', 'Ziyech', 'En-Nesyri',
    'Salah', 'Keïta', 'Kouyaté', 'Sarr', 'Haller', 'Diallo', 'Sangaré',
    'Kouyaté', 'Gueye', 'Mbaye', 'Cissé', 'Traoré', 'Diatta',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const SPAIN_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Spanish', weight: 55 },
    { nationality: 'Brazilian', weight: 12 },
    { nationality: 'Argentine', weight: 10 },
    { nationality: 'French', weight: 7 },
    { nationality: 'Portuguese', weight: 6 },
    { nationality: 'African', weight: 5 },
    { nationality: 'German', weight: 3 },
    { nationality: 'English', weight: 2 },
  ],
  2: [
    { nationality: 'Spanish', weight: 75 },
    { nationality: 'Brazilian', weight: 6 },
    { nationality: 'Argentine', weight: 5 },
    { nationality: 'French', weight: 5 },
    { nationality: 'Portuguese', weight: 4 },
    { nationality: 'African', weight: 3 },
    { nationality: 'English', weight: 2 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const SPAIN_DATA: CountryData = {
  key: 'spain',
  name: 'Spain',
  leagues: SPAIN_LEAGUES,
  nativeNamePool: {
    firstNames: SPANISH_FIRST_NAMES,
    lastNames: SPANISH_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(SPANISH_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: SPANISH_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: SPAIN_NATIONALITIES_BY_TIER,
};
