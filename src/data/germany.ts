/**
 * Static world data for the German football pyramid.
 *
 * All club names are clearly fictional but inspired by German football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. Bundesliga clubs are 50-92; 2. Bundesliga 25-48.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Bundesliga (18 clubs, reputation 50-92)
// ---------------------------------------------------------------------------

const BUNDESLIGA_CLUBS: ClubData[] = [
  {
    id: 'club-munich-bayern-fc',
    name: 'Munich Bayern FC',
    shortName: 'MBF',
    reputation: 92,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 18,
    budget: 200_000_000,
  },
  {
    id: 'club-dortmund-bees',
    name: 'Dortmund Bees',
    shortName: 'DDB',
    reputation: 86,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 17,
    budget: 110_000_000,
  },
  {
    id: 'club-leipzig-bulls',
    name: 'Leipzig Bulls',
    shortName: 'LZB',
    reputation: 82,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 15,
    budget: 80_000_000,
  },
  {
    id: 'club-bayer-leverkusen-giants',
    name: 'Bayer Leverkusen Giants',
    shortName: 'BLG',
    reputation: 85,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 16,
    budget: 90_000_000,
  },
  {
    id: 'club-frankfurt-eagles',
    name: 'Frankfurt Eagles',
    shortName: 'FKE',
    reputation: 78,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 14,
    budget: 55_000_000,
  },
  {
    id: 'club-wolfsburg-wolves',
    name: 'Wolfsburg Wolves',
    shortName: 'WBW',
    reputation: 74,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 13,
    budget: 45_000_000,
  },
  {
    id: 'club-gladbach-foals',
    name: 'Gladbach Foals',
    shortName: 'GBF',
    reputation: 76,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 14,
    budget: 50_000_000,
  },
  {
    id: 'club-berlin-irons',
    name: 'Berlin Irons',
    shortName: 'BLI',
    reputation: 70,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 11,
    budget: 35_000_000,
  },
  {
    id: 'club-berlin-old-town',
    name: 'Berlin Old Town',
    shortName: 'BOT',
    reputation: 67,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 10,
    budget: 28_000_000,
  },
  {
    id: 'club-freiburg-blacks',
    name: 'Freiburg Blacks',
    shortName: 'FRB',
    reputation: 72,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 15,
    budget: 38_000_000,
  },
  {
    id: 'club-mainz-carnies',
    name: 'Mainz Carnies',
    shortName: 'MNZ',
    reputation: 65,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 12,
    budget: 22_000_000,
  },
  {
    id: 'club-hoffenheim-hopes',
    name: 'Hoffenheim Hopes',
    shortName: 'HFH',
    reputation: 66,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 13,
    budget: 25_000_000,
  },
  {
    id: 'club-bremen-anchors',
    name: 'Bremen Anchors',
    shortName: 'BMA',
    reputation: 68,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 13,
    budget: 30_000_000,
  },
  {
    id: 'club-augsburg-fuggars',
    name: 'Augsburg Fuggars',
    shortName: 'ABF',
    reputation: 58,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 14_000_000,
  },
  {
    id: 'club-koln-goats',
    name: 'Koln Goats',
    shortName: 'KGT',
    reputation: 62,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 11,
    budget: 18_000_000,
  },
  {
    id: 'club-stuttgart-swans',
    name: 'Stuttgart Swans',
    shortName: 'STS',
    reputation: 71,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 14,
    budget: 40_000_000,
  },
  {
    id: 'club-heidenheim-cannons',
    name: 'Heidenheim Cannons',
    shortName: 'HDC',
    reputation: 52,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 10_000_000,
  },
  {
    id: 'club-darmstadt-lilies',
    name: 'Darmstadt Lilies',
    shortName: 'DSL',
    reputation: 50,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 8_000_000,
  },
];

// ---------------------------------------------------------------------------
// 2. Bundesliga (18 clubs, reputation 25-48)
// ---------------------------------------------------------------------------

const ZWEITE_BUNDESLIGA_CLUBS: ClubData[] = [
  {
    id: 'club-hamburg-harbour',
    name: 'Hamburg Harbour',
    shortName: 'HBH',
    reputation: 48,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 10,
    budget: 8_000_000,
  },
  {
    id: 'club-hannover-reds',
    name: 'Hannover Reds',
    shortName: 'HNR',
    reputation: 46,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 7_000_000,
  },
  {
    id: 'club-schalke-miners',
    name: 'Schalke Miners',
    shortName: 'SKM',
    reputation: 47,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 10,
    budget: 7_500_000,
  },
  {
    id: 'club-nuremberg-emperors',
    name: 'Nuremberg Emperors',
    shortName: 'NRE',
    reputation: 44,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 6_000_000,
  },
  {
    id: 'club-kaiserslautern-red-devils',
    name: 'Kaiserslautern Red Devils',
    shortName: 'KRD',
    reputation: 45,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 9,
    budget: 6_500_000,
  },
  {
    id: 'club-hertha-old-lady',
    name: 'Hertha Old Lady',
    shortName: 'HOL',
    reputation: 46,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 10,
    budget: 7_000_000,
  },
  {
    id: 'club-greuther-fuerth-clover',
    name: 'Greuther Fuerth Clover',
    shortName: 'GFC',
    reputation: 38,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 3_500_000,
  },
  {
    id: 'club-magdeburg-knights',
    name: 'Magdeburg Knights',
    shortName: 'MGK',
    reputation: 36,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 3_000_000,
  },
  {
    id: 'club-rostock-seafarers',
    name: 'Rostock Seafarers',
    shortName: 'RSF',
    reputation: 33,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 2_500_000,
  },
  {
    id: 'club-paderborn-stalions',
    name: 'Paderborn Stallions',
    shortName: 'PBS',
    reputation: 40,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 4_000_000,
  },
  {
    id: 'club-karlsruhe-fanatics',
    name: 'Karlsruhe Fanatics',
    shortName: 'KRF',
    reputation: 37,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 3_000_000,
  },
  {
    id: 'club-fortuna-dusseldorf-reds',
    name: 'Fortuna Dusseldorf Reds',
    shortName: 'FDR',
    reputation: 43,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 5_000_000,
  },
  {
    id: 'club-braunschweig-lions',
    name: 'Braunschweig Lions',
    shortName: 'BNL',
    reputation: 30,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 2_000_000,
  },
  {
    id: 'club-osnabrueck-lila',
    name: 'Osnabrueck Lila',
    shortName: 'OSL',
    reputation: 27,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_500_000,
  },
  {
    id: 'club-aue-violets',
    name: 'Aue Violets',
    shortName: 'AUV',
    reputation: 28,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 1_600_000,
  },
  {
    id: 'club-elversberg-saar',
    name: 'Elversberg Saar',
    shortName: 'ESR',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_200_000,
  },
  {
    id: 'club-wiesbaden-swans',
    name: 'Wiesbaden Swans',
    shortName: 'WBS',
    reputation: 32,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 7,
    budget: 2_200_000,
  },
  {
    id: 'club-regensburg-jahn',
    name: 'Regensburg Jahn',
    shortName: 'RGJ',
    reputation: 34,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 2_500_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const GERMANY_LEAGUES: LeagueData[] = [
  {
    id: 'league-bundesliga',
    name: 'Bundesliga',
    shortName: 'BL',
    tier: 1,
    clubs: BUNDESLIGA_CLUBS,
  },
  {
    id: 'league-zweite-bundesliga',
    name: '2. Bundesliga',
    shortName: '2BL',
    tier: 2,
    clubs: ZWEITE_BUNDESLIGA_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const GERMAN_FIRST_NAMES: string[] = [
  'Thomas', 'Leon', 'Kai', 'Timo', 'Serge', 'Joshua', 'Leroy', 'Julian',
  'Jamal', 'Ilkay', 'Niklas', 'Mats', 'Manuel', 'Robin', 'Emre', 'Lukas',
  'Felix', 'Jonas', 'Florian', 'Christoph', 'Nico', 'Bernd', 'David', 'Sandro',
  'Max', 'Moritz', 'Hans', 'Klaus', 'Stefan', 'Andreas', 'Markus', 'Tobias',
  'Sebastian', 'Christian', 'Michael', 'Patrick', 'Oliver', 'Daniel', 'Frank',
  'Peter', 'Johannes', 'Martin', 'Marc', 'Philipp', 'Alexander', 'Benjamin',
  'Henrik', 'Lars', 'Sven', 'Jens', 'Thorsten', 'Rainer', 'Dirk', 'Uwe',
  'Toni', 'Luca', 'Noah', 'Elias', 'Paul', 'Finn', 'Jan', 'Tim', 'Nico',
  'Kevin', 'Simon', 'Fabian', 'Matthias', 'Erik', 'Lars', 'Anton', 'Bruno',
];

export const GERMAN_LAST_NAMES: string[] = [
  'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner',
  'Becker', 'Schulz', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter',
  'Werner', 'Havertz', 'Gnabry', 'Kimmich', 'Goretzka', 'Süle', 'Rüdiger',
  'Neuer', 'Brandt', 'Draxler', 'Can', 'Raum', 'Kehrer', 'Hofmann',
  'Arnold', 'Sané', 'Musiala', 'ter Stegen', 'Kroos', 'Schweinsteiger',
  'Lahm', 'Ballack', 'Klose', 'Podolski', 'Ozil', 'Götze', 'Khedira',
  'Hummels', 'Boateng', 'Badstuber', 'Mustafi', 'Draxler', 'Schürrle',
  'Klein', 'Groß', 'Stark', 'Wolf', 'Henrichs', 'Waldschmidt', 'Duda',
  'Delaney', 'Dahoud', 'Witsel', 'Nkunku', 'Kampl', 'Olmo', 'Szalai',
  'Haberer', 'Kübler', 'Petersen', 'Höler', 'Grifo', 'Sallai', 'Lienhart',
  'Demme', 'Poulsen', 'Forsberg', 'Werner', 'Simakan', 'Henrichs', 'Orban',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const GERMAN_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Austrian: [
    'David', 'Marcel', 'Marko', 'Stefan', 'Martin', 'Florian', 'Jakob',
    'Christoph', 'Andreas', 'Michael', 'Thomas', 'Kevin', 'Sebastian',
    'Daniel', 'Alexander', 'Konrad', 'Hannes', 'Lukas', 'Peter', 'Jonas',
  ],
  French: [
    'Lucas', 'Hugo', 'Louis', 'Antoine', 'Théo', 'Alexandre', 'Nicolas',
    'Kylian', 'Karim', 'Ousmane', 'Kingsley', 'Blaise', 'Paul', 'Raphael',
    'Benjamin', 'Jules', 'Mattéo', 'Moussa', 'Corentin', 'Rayan',
  ],
  Polish: [
    'Robert', 'Wojciech', 'Lukasz', 'Piotr', 'Jakub', 'Kamil', 'Artur',
    'Grzegorz', 'Maciej', 'Bartosz', 'Krzysztof', 'Michal', 'Rafal', 'Adam',
    'Szymon', 'Mateusz', 'Sebastian', 'Pawel', 'Tomasz', 'Marcin',
  ],
  Turkish: [
    'Emre', 'Hakan', 'Arda', 'Burak', 'Oguzhan', 'Cengiz', 'Okay',
    'Kenan', 'Ferdi', 'Zeki', 'Mert', 'Ozan', 'Merih', 'Yusuf',
    'Halil', 'Ridvan', 'Baris', 'Enes', 'Yunus', 'Dorukhan',
  ],
  Dutch: [
    'Virgil', 'Georginio', 'Memphis', 'Frenkie', 'Matthijs', 'Ryan',
    'Wout', 'Davy', 'Donny', 'Nathan', 'Cody', 'Donyell', 'Steven',
    'Quincy', 'Denzell', 'Justin', 'Kenny', 'Xavi', 'Arnaut', 'Jurrien',
  ],
};

export const GERMAN_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Austrian: [
    'Alaba', 'Sabitzer', 'Arnautovic', 'Baumgartner', 'Grillitsch',
    'Lainer', 'Trauner', 'Wöber', 'Laimer', 'Entrup', 'Gregoritsch',
    'Kalajdzic', 'Seiwald', 'Danso', 'Prass', 'Wimmer', 'Posch', 'Hofmann', 'Schmid', 'Trimmel',
  ],
  French: [
    'Dupont', 'Martin', 'Bernard', 'Thomas', 'Petit', 'Leroy', 'Girard',
    'Mbappé', 'Benzema', 'Dembélé', 'Coman', 'Pogba', 'Lloris', 'Hernandez',
    'Pavard', 'Varane', 'Kimpembe', 'Upamecano', 'Camavinga', 'Tchouaméni',
  ],
  Polish: [
    'Lewandowski', 'Szczęsny', 'Milik', 'Zieliński', 'Klich', 'Błaszczykowski',
    'Piszczek', 'Glik', 'Linetty', 'Frankowski', 'Puchacz', 'Bednarek',
    'Szymański', 'Buksa', 'Piątek', 'Skóraś', 'Kaminski', 'Placheta', 'Kapustka', 'Grosicki',
  ],
  Turkish: [
    'Çalhanoğlu', 'Çalhanoglu', 'Demiral', 'Ayhan', 'Güler', 'Yazıcı',
    'Aktürkoğlu', 'Kabak', 'Söyüncü', 'Özkaçar', 'Salih', 'Kadioglu',
    'Müldür', 'Konak', 'Tufan', 'Ozcan', 'Toköz', 'Yokuslu', 'Karaman', 'Akturkoglu',
  ],
  Dutch: [
    'van Dijk', 'Wijnaldum', 'Depay', 'de Jong', 'de Ligt', 'Gravenberch',
    'Weghorst', 'Klaassen', 'van de Beek', 'Ake', 'Gakpo', 'Malen',
    'Bergwijn', 'Promes', 'Dumfries', 'Blind', 'de Vrij', 'Timber', 'Frimpong', 'Hateboer',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const GERMANY_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'German', weight: 60 },
    { nationality: 'French', weight: 8 },
    { nationality: 'Austrian', weight: 5 },
    { nationality: 'Dutch', weight: 5 },
    { nationality: 'Polish', weight: 5 },
    { nationality: 'Turkish', weight: 5 },
    { nationality: 'Brazilian', weight: 4 },
    { nationality: 'Spanish', weight: 3 },
    { nationality: 'English', weight: 3 },
    { nationality: 'Argentine', weight: 2 },
  ],
  2: [
    { nationality: 'German', weight: 72 },
    { nationality: 'Austrian', weight: 6 },
    { nationality: 'French', weight: 5 },
    { nationality: 'Polish', weight: 5 },
    { nationality: 'Turkish', weight: 5 },
    { nationality: 'Dutch', weight: 4 },
    { nationality: 'Brazilian', weight: 2 },
    { nationality: 'Spanish', weight: 1 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const GERMANY_DATA: CountryData = {
  key: 'germany',
  name: 'Germany',
  leagues: GERMANY_LEAGUES,
  nativeNamePool: {
    firstNames: GERMAN_FIRST_NAMES,
    lastNames: GERMAN_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(GERMAN_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: GERMAN_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: GERMANY_NATIONALITIES_BY_TIER,
};
