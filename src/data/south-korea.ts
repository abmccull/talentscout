/**
 * Static world data for the South Korean football pyramid.
 *
 * All club names are clearly fictional but inspired by South Korean football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. K League 1 clubs are 20-45.
 * Secondary country: generates clubs and players but does NOT simulate
 * fixtures or offer career positions.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// K League 1 (12 clubs, reputation 20-45)
// ---------------------------------------------------------------------------

const K1_CLUBS: ClubData[] = [
  {
    id: 'club-jeonbuk-hyundai-motors',
    name: 'Jeonbuk Hyundai Motors',
    shortName: 'JHM',
    reputation: 45,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 12,
    budget: 15_000_000,
  },
  {
    id: 'club-ulsan-hd-fc',
    name: 'Ulsan HD FC',
    shortName: 'UHD',
    reputation: 43,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 11,
    budget: 13_000_000,
  },
  {
    id: 'club-suwon-samsung',
    name: 'Suwon Samsung',
    shortName: 'SSB',
    reputation: 40,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 10,
    budget: 10_000_000,
  },
  {
    id: 'club-fc-seoul',
    name: 'FC Seoul',
    shortName: 'FCS',
    reputation: 38,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 10,
    budget: 9_000_000,
  },
  {
    id: 'club-pohang-steelers',
    name: 'Pohang Steelers',
    shortName: 'PHS',
    reputation: 36,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 10,
    budget: 7_000_000,
  },
  {
    id: 'club-daegu-fc',
    name: 'Daegu FC',
    shortName: 'DGF',
    reputation: 33,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 5_500_000,
  },
  {
    id: 'club-incheon-united',
    name: 'Incheon United',
    shortName: 'INU',
    reputation: 31,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 8,
    budget: 4_500_000,
  },
  {
    id: 'club-gangwon-fc',
    name: 'Gangwon FC',
    shortName: 'GWF',
    reputation: 28,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 3_500_000,
  },
  {
    id: 'club-jeju-united',
    name: 'Jeju United',
    shortName: 'JJU',
    reputation: 27,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 6,
    budget: 3_000_000,
  },
  {
    id: 'club-gwangju-fc',
    name: 'Gwangju FC',
    shortName: 'GWJ',
    reputation: 25,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 2_500_000,
  },
  {
    id: 'club-daejeon-hana-citizen',
    name: 'Daejeon Hana Citizen',
    shortName: 'DHC',
    reputation: 22,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 5,
    budget: 1_800_000,
  },
  {
    id: 'club-gimcheon-sangmu',
    name: 'Gimcheon Sangmu',
    shortName: 'GCS',
    reputation: 20,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 1_000_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const SOUTH_KOREA_LEAGUES: LeagueData[] = [
  {
    id: 'league-k1',
    name: 'K League 1',
    shortName: 'KL1',
    tier: 1,
    clubs: K1_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const KOREAN_FIRST_NAMES: string[] = [
  'Heung-min', 'Ji-sung', 'Young-gwon', 'Min-jae', 'Jae-sung', 'Woo-young',
  'In-beom', 'Hwang', 'Gue-sung', 'Sang-ho', 'Ui-jo', 'Dong-hyeon',
  'Chang-hoon', 'Hyun-soo', 'Seung-ho', 'Jun-ho', 'Tae-hwan', 'Beom-seok',
  'Ki-hun', 'Young-jae', 'Seung-min', 'Jin-su', 'Dae-wook', 'Min-hyeok',
  'Kyung-rok', 'Sung-yong', 'Yun-sung', 'Dong-wook', 'Joo-ho', 'Ju-young',
  'Nam-il', 'Jung-woo', 'Chan-dong', 'Sung-hoon', 'Jeong-ho', 'Tae-young',
  'Bo-kyung', 'Jae-won', 'Seong-jin', 'Yong-jae', 'Min-seo', 'Joon-ho',
  'Hyung-jin', 'Woo-hyun', 'Jun-seok', 'Ki-woon', 'Sang-woo', 'Young-sun',
  'Tae-uk', 'Se-jong', 'Hyeon-gyu', 'Su-hyun', 'Jun-ik', 'Young-kwon',
  'Geon-hee', 'Seong-ryong', 'Myung-jun', 'Tae-yeol', 'Deok-geun', 'Jun-hyeok',
];

export const KOREAN_LAST_NAMES: string[] = [
  'Son', 'Kim', 'Park', 'Lee', 'Cho', 'Jung', 'Hwang', 'Kwon', 'Hong',
  'Kang', 'Lim', 'Shin', 'Oh', 'Yoon', 'Bae', 'Han', 'Jeon', 'Cha',
  'Moon', 'Seo', 'Yang', 'Nam', 'Woo', 'Choi', 'Ryu', 'Yoo', 'Noh',
  'Ahn', 'Baek', 'Jang', 'Ji', 'Gi', 'Ku', 'Ma', 'Pyo', 'Seol',
  'Joo', 'Ha', 'Heo', 'Eom', 'Sim', 'Byun', 'Gong', 'Gang', 'Dam',
  'Do', 'Dong', 'Gi', 'Go', 'Im', 'In', 'Ja', 'Jeong', 'Jo', 'Jong',
  'Ju', 'Mun', 'Ngo', 'Ri', 'Sin', 'Ssang', 'Tak', 'Tong', 'Won', 'Ye',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const SOUTH_KOREA_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  Japanese: [
    'Takumi', 'Daichi', 'Wataru', 'Ritsu', 'Takehiro', 'Yuto', 'Keisuke',
    'Shinji', 'Genki', 'Takefusa', 'Junya', 'Hiroki', 'Ko', 'Ryo', 'Shoya',
  ],
  Brazilian: [
    'Gabriel', 'Lucas', 'Thiago', 'Felipe', 'Rodrigo', 'Matheus', 'Bruno',
    'Vinicius', 'Leandro', 'Fabinho', 'Everton', 'Antony', 'Raphinha', 'Fred',
    'Ederson',
  ],
};

export const SOUTH_KOREA_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  Japanese: [
    'Mitoma', 'Kubo', 'Kamada', 'Endo', 'Doan', 'Tomiyasu', 'Minamino',
    'Nakata', 'Kagawa', 'Honda', 'Suzuki', 'Tanaka', 'Nakamura', 'Watanabe', 'Ito',
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

export const SOUTH_KOREA_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'SouthKorean', weight: 85 },
    { nationality: 'Brazilian', weight: 5 },
    { nationality: 'Japanese', weight: 3 },
    { nationality: 'Australian', weight: 2 },
    { nationality: 'Croatian', weight: 2 },
    { nationality: 'Uzbek', weight: 2 },
    { nationality: 'Spanish', weight: 1 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const SOUTH_KOREA_DATA: CountryData = {
  key: 'southkorea',
  name: 'South Korea',
  leagues: SOUTH_KOREA_LEAGUES,
  nativeNamePool: {
    firstNames: KOREAN_FIRST_NAMES,
    lastNames: KOREAN_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(SOUTH_KOREA_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: SOUTH_KOREA_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: SOUTH_KOREA_NATIONALITIES_BY_TIER,
  secondary: true,
};
