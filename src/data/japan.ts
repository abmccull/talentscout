/**
 * Static world data for the Japanese football pyramid.
 *
 * All club names are clearly fictional but inspired by Japanese football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. J1 League clubs are 25-55.
 * Secondary country: generates clubs and players but does NOT simulate
 * fixtures or offer career positions.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// J1 League (14 clubs, reputation 25-55)
// ---------------------------------------------------------------------------

const J1_CLUBS: ClubData[] = [
  {
    id: 'club-vissel-kobe',
    name: 'Vissel Kobe',
    shortName: 'VKB',
    reputation: 55,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 13,
    budget: 25_000_000,
  },
  {
    id: 'club-yokohama-marinos',
    name: 'Yokohama Marinos',
    shortName: 'YMR',
    reputation: 52,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 13,
    budget: 22_000_000,
  },
  {
    id: 'club-kawasaki-frontale',
    name: 'Kawasaki Frontale',
    shortName: 'KWF',
    reputation: 50,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 14,
    budget: 18_000_000,
  },
  {
    id: 'club-kashima-antlers',
    name: 'Kashima Antlers',
    shortName: 'KSA',
    reputation: 48,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 12,
    budget: 16_000_000,
  },
  {
    id: 'club-urawa-red-diamonds',
    name: 'Urawa Red Diamonds',
    shortName: 'URD',
    reputation: 46,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 12,
    budget: 15_000_000,
  },
  {
    id: 'club-fc-tokyo-eagles',
    name: 'FC Tokyo Eagles',
    shortName: 'FTE',
    reputation: 44,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 11,
    budget: 13_000_000,
  },
  {
    id: 'club-nagoya-grampus',
    name: 'Nagoya Grampus',
    shortName: 'NGG',
    reputation: 42,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 11,
    budget: 11_000_000,
  },
  {
    id: 'club-sanfrecce-hiroshima',
    name: 'Sanfrecce Hiroshima',
    shortName: 'SFH',
    reputation: 40,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 11,
    budget: 9_000_000,
  },
  {
    id: 'club-gamba-osaka',
    name: 'Gamba Osaka',
    shortName: 'GMB',
    reputation: 38,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 8_000_000,
  },
  {
    id: 'club-sagan-tosu',
    name: 'Sagan Tosu',
    shortName: 'SGT',
    reputation: 34,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 5_000_000,
  },
  {
    id: 'club-cerezo-osaka',
    name: 'Cerezo Osaka',
    shortName: 'CRZ',
    reputation: 36,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 9,
    budget: 6_000_000,
  },
  {
    id: 'club-consadole-sapporo',
    name: 'Consadole Sapporo',
    shortName: 'CSP',
    reputation: 30,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 4_000_000,
  },
  {
    id: 'club-kashiwa-reysol',
    name: 'Kashiwa Reysol',
    shortName: 'KSR',
    reputation: 28,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 7,
    budget: 3_000_000,
  },
  {
    id: 'club-jubilo-iwata',
    name: 'Jubilo Iwata',
    shortName: 'JBI',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 2_000_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const JAPAN_LEAGUES: LeagueData[] = [
  {
    id: 'league-j1',
    name: 'J1 League',
    shortName: 'J1L',
    tier: 1,
    clubs: J1_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const JAPANESE_FIRST_NAMES: string[] = [
  'Takumi', 'Kaoru', 'Daichi', 'Wataru', 'Ritsu', 'Takehiro', 'Yuto',
  'Keisuke', 'Shinji', 'Makoto', 'Shuichi', 'Genki', 'Takefusa', 'Ao',
  'Junya', 'Hiroki', 'Ayase', 'Ko', 'Maya', 'Eiji', 'Gaku', 'Atsuto',
  'Nagatomo', 'Koji', 'Yuki', 'Ryo', 'Hotaru', 'Manabu', 'Kengo', 'Shoya',
  'Ryota', 'Koki', 'Sota', 'Yuma', 'Haruki', 'Kenta', 'Shun', 'Taichi',
  'Naoki', 'Sho', 'Yuya', 'Kei', 'Masato', 'Hayato', 'Kohei', 'Tatsuya',
  'Toshihiro', 'Ryusei', 'Kaito', 'Keita', 'Jumpei', 'Shintaro', 'Yusuke',
  'Daisuke', 'Hidetoshi', 'Kazuyoshi', 'Shunsuke', 'Junichi', 'Yasuhito', 'Shinya',
];

export const JAPANESE_LAST_NAMES: string[] = [
  'Mitoma', 'Kubo', 'Kamada', 'Endo', 'Doan', 'Tomiyasu', 'Minamino',
  'Nakata', 'Kagawa', 'Honda', 'Iniesta', 'Suzuki', 'Tanaka', 'Nakamura',
  'Watanabe', 'Ito', 'Yamamoto', 'Kobayashi', 'Sato', 'Kato', 'Yoshida',
  'Hasebe', 'Saito', 'Iwata', 'Matsui', 'Ogura', 'Furuhashi', 'Ueda',
  'Abe', 'Hayashi', 'Imai', 'Nishino', 'Morishima', 'Kawabe', 'Zenga',
  'Maeda', 'Osako', 'Asano', 'Onaiwu', 'Hatanaka', 'Iwasaki', 'Machida',
  'Fujio', 'Sugimoto', 'Kinoshita', 'Muto', 'Usami', 'Higashiguchi', 'Gonda',
  'Ogawa', 'Shimizu', 'Tsunoda', 'Harakawa', 'Nishi', 'Nonaka', 'Okano',
  'Furuya', 'Shibasaki', 'Otsu', 'Sakai',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const JAPAN_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  SouthKorean: [
    'Heung-min', 'Ji-sung', 'Young-gwon', 'Min-jae', 'Jae-sung', 'Woo-young',
    'In-beom', 'Gue-sung', 'Sang-ho', 'Ui-jo', 'Dong-hyeon', 'Hwang', 'Hyun-soo',
    'Seung-ho', 'Chang-hoon',
  ],
  Brazilian: [
    'Gabriel', 'Lucas', 'Thiago', 'Felipe', 'Rodrigo', 'Matheus', 'Bruno',
    'Vinicius', 'Leandro', 'Fabinho', 'Everton', 'Antony', 'Raphinha', 'Fred',
    'Ederson',
  ],
};

export const JAPAN_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  SouthKorean: [
    'Son', 'Park', 'Kim', 'Lee', 'Cho', 'Jung', 'Hwang', 'Kwon', 'Hong',
    'Kang', 'Lim', 'Shin', 'Oh', 'Yoon', 'Bae',
  ],
  Brazilian: [
    'Silva', 'Santos', 'Oliveira', 'Costa', 'Souza', 'Pereira', 'Lima',
    'Ferreira', 'Rodrigues', 'Alves', 'Militão', 'Marquinhos', 'Paquetá',
    'Arthur', 'Barbosa',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const JAPAN_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Japanese', weight: 85 },
    { nationality: 'Brazilian', weight: 5 },
    { nationality: 'SouthKorean', weight: 4 },
    { nationality: 'Australian', weight: 2 },
    { nationality: 'Thai', weight: 2 },
    { nationality: 'Spanish', weight: 2 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const JAPAN_DATA: CountryData = {
  key: 'japan',
  name: 'Japan',
  leagues: JAPAN_LEAGUES,
  nativeNamePool: {
    firstNames: JAPANESE_FIRST_NAMES,
    lastNames: JAPANESE_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(JAPAN_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: JAPAN_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: JAPAN_NATIONALITIES_BY_TIER,
  secondary: true,
};
