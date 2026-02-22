/**
 * Static world data for the Chinese football pyramid.
 *
 * All club names are clearly fictional but inspired by Chinese football
 * geography and naming conventions. No real club names are used.
 *
 * Reputation scale: 1–100. Chinese Super League clubs are 20-45.
 * Secondary country: generates clubs and players but does NOT simulate
 * fixtures or offer career positions.
 */

import type { ClubData, LeagueData, CountryData } from '@/data/types';

// ---------------------------------------------------------------------------
// Chinese Super League (12 clubs, reputation 20-45)
// ---------------------------------------------------------------------------

const CSL_CLUBS: ClubData[] = [
  {
    id: 'club-shanghai-port-fc',
    name: 'Shanghai Port FC',
    shortName: 'SHP',
    reputation: 45,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 11,
    budget: 20_000_000,
  },
  {
    id: 'club-beijing-guoan',
    name: 'Beijing Guoan',
    shortName: 'BJG',
    reputation: 43,
    scoutingPhilosophy: 'globalRecruiter',
    youthAcademyRating: 11,
    budget: 18_000_000,
  },
  {
    id: 'club-guangzhou-fc',
    name: 'Guangzhou FC',
    shortName: 'GZF',
    reputation: 40,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 10,
    budget: 15_000_000,
  },
  {
    id: 'club-shandong-taishan',
    name: 'Shandong Taishan',
    shortName: 'SDT',
    reputation: 38,
    scoutingPhilosophy: 'winNow',
    youthAcademyRating: 9,
    budget: 12_000_000,
  },
  {
    id: 'club-wuhan-three-towns',
    name: 'Wuhan Three Towns',
    shortName: 'WHT',
    reputation: 36,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 9,
    budget: 10_000_000,
  },
  {
    id: 'club-chengdu-rongcheng',
    name: 'Chengdu Rongcheng',
    shortName: 'CDR',
    reputation: 33,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 8,
    budget: 8_000_000,
  },
  {
    id: 'club-zhejiang-fc',
    name: 'Zhejiang FC',
    shortName: 'ZJF',
    reputation: 31,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 7,
    budget: 7_000_000,
  },
  {
    id: 'club-changchun-yatai',
    name: 'Changchun Yatai',
    shortName: 'CCY',
    reputation: 28,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 7,
    budget: 6_000_000,
  },
  {
    id: 'club-tianjin-jinmen-tiger',
    name: 'Tianjin Jinmen Tiger',
    shortName: 'TJT',
    reputation: 26,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 6,
    budget: 5_000_000,
  },
  {
    id: 'club-dalian-pro-fc',
    name: 'Dalian Pro FC',
    shortName: 'DLP',
    reputation: 24,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 6,
    budget: 4_000_000,
  },
  {
    id: 'club-shenzhen-fc',
    name: 'Shenzhen FC',
    shortName: 'SZF',
    reputation: 22,
    scoutingPhilosophy: 'marketSmart',
    youthAcademyRating: 5,
    budget: 3_500_000,
  },
  {
    id: 'club-henan-songshan',
    name: 'Henan Songshan',
    shortName: 'HNS',
    reputation: 20,
    scoutingPhilosophy: 'academyFirst',
    youthAcademyRating: 5,
    budget: 3_000_000,
  },
];

// ---------------------------------------------------------------------------
// League definitions
// ---------------------------------------------------------------------------

export const CHINA_LEAGUES: LeagueData[] = [
  {
    id: 'league-csl',
    name: 'Chinese Super League',
    shortName: 'CSL',
    tier: 1,
    clubs: CSL_CLUBS,
  },
];

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

export const CHINESE_FIRST_NAMES: string[] = [
  'Wei', 'Jun', 'Hao', 'Lei', 'Tao', 'Lin', 'Peng', 'Long', 'Yang', 'Ming',
  'Bo', 'Jian', 'Kai', 'Fei', 'Gang', 'Jie', 'Liang', 'Rui', 'Shan', 'Tian',
  'Bin', 'Chao', 'Dong', 'Feng', 'Guang', 'Hao', 'Jing', 'Kun', 'Li', 'Nan',
  'Qiang', 'Sheng', 'Teng', 'Wen', 'Xiang', 'Yong', 'Zhen', 'Hui', 'Cheng', 'Da',
  'Haoran', 'Junhao', 'Wenhao', 'Ziyang', 'Xudong', 'Yifan', 'Zijun', 'Haoyu', 'Lexun', 'Zekai',
  'Junning', 'Guanyu', 'Tianao', 'Pengfei', 'Jianlong', 'Bolin', 'Chengjie', 'Shuhao', 'Mingzhi', 'Yuchen',
];

export const CHINESE_LAST_NAMES: string[] = [
  'Wu', 'Zhang', 'Li', 'Wang', 'Liu', 'Chen', 'Zhao', 'Huang', 'Zhou', 'Xu',
  'Lin', 'He', 'Guo', 'Ma', 'Luo', 'Liang', 'Song', 'Zheng', 'Xie', 'Han',
  'Tang', 'Feng', 'Yu', 'Dong', 'Cao', 'Cheng', 'Yuan', 'Deng', 'Xu', 'Fu',
  'Shen', 'Zeng', 'Peng', 'Xiao', 'Cai', 'Pan', 'Du', 'Jiang', 'Dai', 'Fang',
  'Shao', 'Gu', 'Meng', 'Ding', 'Wei', 'Shi', 'Mo', 'Qiu', 'Qin', 'Yin',
  'Yi', 'Yan', 'Tian', 'Ren', 'Jia', 'Lv', 'Su', 'Ye', 'Hua', 'Xia',
];

// ---------------------------------------------------------------------------
// Foreign name pools
// ---------------------------------------------------------------------------

export const CHINA_FOREIGN_FIRST_NAMES: Record<string, string[]> = {
  SouthKorean: [
    'Heung-min', 'Ji-sung', 'Young-gwon', 'Min-jae', 'Jae-sung', 'Woo-young',
    'In-beom', 'Gue-sung', 'Sang-ho', 'Ui-jo', 'Dong-hyeon', 'Chang-hoon',
    'Hyun-soo', 'Seung-ho', 'Jun-ho',
  ],
  Japanese: [
    'Takumi', 'Daichi', 'Wataru', 'Ritsu', 'Takehiro', 'Yuto', 'Keisuke',
    'Shinji', 'Genki', 'Takefusa',
  ],
};

export const CHINA_FOREIGN_LAST_NAMES: Record<string, string[]> = {
  SouthKorean: [
    'Son', 'Park', 'Kim', 'Lee', 'Cho', 'Jung', 'Hwang', 'Kwon', 'Hong',
    'Kang', 'Lim', 'Shin', 'Oh', 'Yoon', 'Bae',
  ],
  Japanese: [
    'Mitoma', 'Kubo', 'Kamada', 'Endo', 'Doan', 'Tomiyasu', 'Minamino',
    'Nakata', 'Kagawa', 'Honda',
  ],
};

// ---------------------------------------------------------------------------
// Nationality weights per league tier
// ---------------------------------------------------------------------------

export const CHINA_NATIONALITIES_BY_TIER: Record<
  number,
  { nationality: string; weight: number }[]
> = {
  1: [
    { nationality: 'Chinese', weight: 88 },
    { nationality: 'SouthKorean', weight: 3 },
    { nationality: 'Brazilian', weight: 3 },
    { nationality: 'Japanese', weight: 2 },
    { nationality: 'Serbian', weight: 2 },
    { nationality: 'Australian', weight: 2 },
  ],
};

// ---------------------------------------------------------------------------
// CountryData export
// ---------------------------------------------------------------------------

export const CHINA_DATA: CountryData = {
  key: 'china',
  name: 'China',
  leagues: CHINA_LEAGUES,
  nativeNamePool: {
    firstNames: CHINESE_FIRST_NAMES,
    lastNames: CHINESE_LAST_NAMES,
  },
  foreignNamePools: Object.fromEntries(
    Object.entries(CHINA_FOREIGN_FIRST_NAMES).map(([nat, firsts]) => [
      nat,
      { firstNames: firsts, lastNames: CHINA_FOREIGN_LAST_NAMES[nat] ?? [] },
    ])
  ),
  nationalitiesByTier: CHINA_NATIONALITIES_BY_TIER,
  secondary: true,
};
