/**
 * Generate all 69 Steam achievement icons (unlocked + locked variants).
 *
 * Output: build/achievements/{API_NAME}.png (unlocked)
 *         build/achievements/{API_NAME}_locked.png (locked/greyscale)
 *
 * Style: Dark rounded square with category-colored accent, white geometric symbol.
 * Size: 256x256 PNG (Steam displays at 64x64, recommends 256x256).
 *
 * Usage: node scripts/generate-achievement-icons.mjs
 */

import sharp from "sharp";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "build", "achievements");

const SIZE = 256;
const HALF = SIZE / 2;
const R = 40; // corner radius

// ---------------------------------------------------------------------------
// Category colors
// ---------------------------------------------------------------------------

const COLORS = {
  gettingStarted: { bg: "#064e3b", accent: "#10b981", ring: "#34d399" },
  careerMilestones: { bg: "#78350f", accent: "#f59e0b", ring: "#fbbf24" },
  scoutingExcellence: { bg: "#1e3a5f", accent: "#3b82f6", ring: "#60a5fa" },
  specializationMastery: { bg: "#4c1d95", accent: "#8b5cf6", ring: "#a78bfa" },
  worldExplorer: { bg: "#164e63", accent: "#06b6d4", ring: "#22d3ee" },
  matchAnalysis: { bg: "#1e3a5f", accent: "#3b82f6", ring: "#60a5fa" },
  financial: { bg: "#4a3728", accent: "#d97706", ring: "#f59e0b" },
  hidden: { bg: "#7f1d1d", accent: "#ef4444", ring: "#f87171" },
};

const LOCKED = { bg: "#1f2937", accent: "#4b5563", ring: "#6b7280", symbol: "#9ca3af" };

// ---------------------------------------------------------------------------
// Symbol SVG paths for each achievement
// ---------------------------------------------------------------------------

// Each symbol is an SVG snippet centered at (128, 128) in a 256x256 viewBox
const SYMBOLS = {
  // Getting Started
  FIRST_OBSERVATION: /* eye */
    `<ellipse cx="128" cy="128" rx="52" ry="34" fill="none" stroke="white" stroke-width="8"/>
     <circle cx="128" cy="128" r="16" fill="white"/>`,

  FIRST_REPORT: /* pencil/document */
    `<rect x="88" y="68" width="80" height="110" rx="6" fill="none" stroke="white" stroke-width="7"/>
     <line x1="104" y1="100" x2="168" y2="100" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <line x1="104" y1="120" x2="156" y2="120" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <line x1="104" y1="140" x2="140" y2="140" stroke="white" stroke-width="5" stroke-linecap="round"/>`,

  FIRST_WEEK: /* calendar */
    `<rect x="80" y="78" width="96" height="90" rx="8" fill="none" stroke="white" stroke-width="7"/>
     <line x1="80" y1="106" x2="176" y2="106" stroke="white" stroke-width="7"/>
     <line x1="108" y1="66" x2="108" y2="86" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <line x1="148" y1="66" x2="148" y2="86" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <circle cx="112" cy="136" r="6" fill="white"/>`,

  FIRST_MATCH: /* football/soccer ball */
    `<circle cx="128" cy="128" r="44" fill="none" stroke="white" stroke-width="7"/>
     <polygon points="128,88 142,102 138,120 118,120 114,102" fill="white"/>
     <line x1="128" y1="88" x2="128" y2="68" stroke="white" stroke-width="4"/>
     <line x1="142" y1="102" x2="162" y2="92" stroke="white" stroke-width="4"/>
     <line x1="138" y1="120" x2="156" y2="140" stroke="white" stroke-width="4"/>
     <line x1="118" y1="120" x2="100" y2="140" stroke="white" stroke-width="4"/>
     <line x1="114" y1="102" x2="94" y2="92" stroke="white" stroke-width="4"/>`,

  FIRST_CONTACT: /* handshake */
    `<path d="M80,140 Q100,100 128,110 Q156,100 176,140" fill="none" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <circle cx="100" cy="100" r="14" fill="none" stroke="white" stroke-width="6"/>
     <circle cx="156" cy="100" r="14" fill="none" stroke="white" stroke-width="6"/>`,

  FIRST_PERK: /* star */
    `<polygon points="128,72 140,108 178,108 148,130 158,166 128,146 98,166 108,130 78,108 116,108" fill="white"/>`,

  FIRST_EQUIPMENT: /* wrench */
    `<path d="M160,80 Q180,80 184,100 Q188,120 172,128 L112,188 Q100,200 88,188 Q76,176 88,164 L148,104 Q140,88 160,80Z" fill="none" stroke="white" stroke-width="7"/>`,

  FIRST_YOUTH: /* small star with sparkle */
    `<polygon points="128,80 136,108 166,108 142,124 150,152 128,138 106,152 114,124 90,108 120,108" fill="white"/>
     <line x1="170" y1="76" x2="178" y2="68" stroke="white" stroke-width="4" stroke-linecap="round"/>
     <line x1="166" y1="68" x2="182" y2="76" stroke="white" stroke-width="4" stroke-linecap="round"/>`,

  // Career Milestones
  REACH_TIER_2: /* arrow up with 2 */
    `<polygon points="128,72 160,112 144,112 144,172 112,172 112,112 96,112" fill="white"/>
     <text x="128" y="156" text-anchor="middle" font-size="32" font-weight="bold" font-family="sans-serif" fill="${COLORS.careerMilestones.bg}">2</text>`,

  REACH_TIER_3: /* arrow up with 3 */
    `<polygon points="128,72 160,112 144,112 144,172 112,172 112,112 96,112" fill="white"/>
     <text x="128" y="156" text-anchor="middle" font-size="32" font-weight="bold" font-family="sans-serif" fill="${COLORS.careerMilestones.bg}">3</text>`,

  REACH_TIER_4: /* arrow up with 4 */
    `<polygon points="128,72 160,112 144,112 144,172 112,172 112,112 96,112" fill="white"/>
     <text x="128" y="156" text-anchor="middle" font-size="32" font-weight="bold" font-family="sans-serif" fill="${COLORS.careerMilestones.bg}">4</text>`,

  REACH_TIER_5: /* crown */
    `<polygon points="80,160 84,100 108,130 128,80 148,130 172,100 176,160" fill="white"/>
     <rect x="80" y="160" width="96" height="16" rx="4" fill="white"/>`,

  SEASON_1: /* checkmark badge */
    `<circle cx="128" cy="128" r="48" fill="none" stroke="white" stroke-width="7"/>
     <polyline points="104,128 122,146 156,108" fill="none" stroke="white" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`,

  SEASON_3: /* triple bar */
    `<rect x="88" y="88" width="80" height="16" rx="4" fill="white"/>
     <rect x="88" y="120" width="80" height="16" rx="4" fill="white"/>
     <rect x="88" y="152" width="80" height="16" rx="4" fill="white"/>`,

  SEASON_5: /* fist/strength */
    `<circle cx="128" cy="120" r="44" fill="none" stroke="white" stroke-width="7"/>
     <polyline points="108,120 120,132 148,100" fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
     <text x="128" y="190" text-anchor="middle" font-size="28" font-weight="bold" font-family="sans-serif" fill="white">5</text>`,

  SEASON_10: /* medal */
    `<circle cx="128" cy="140" r="36" fill="none" stroke="white" stroke-width="7"/>
     <text x="128" y="150" text-anchor="middle" font-size="28" font-weight="bold" font-family="sans-serif" fill="white">10</text>
     <line x1="108" y1="72" x2="128" y2="104" stroke="white" stroke-width="6" stroke-linecap="round"/>
     <line x1="148" y1="72" x2="128" y2="104" stroke="white" stroke-width="6" stroke-linecap="round"/>`,

  // Scouting Excellence
  REPORTS_10: /* stack of papers */
    `<rect x="92" y="76" width="72" height="92" rx="5" fill="none" stroke="white" stroke-width="6"/>
     <rect x="100" y="68" width="72" height="92" rx="5" fill="none" stroke="white" stroke-width="6" opacity="0.5"/>
     <line x1="108" y1="104" x2="152" y2="104" stroke="white" stroke-width="4"/>
     <line x1="108" y1="120" x2="148" y2="120" stroke="white" stroke-width="4"/>
     <line x1="108" y1="136" x2="136" y2="136" stroke="white" stroke-width="4"/>`,

  REPORTS_25: /* thick stack */
    `<rect x="88" y="80" width="72" height="88" rx="5" fill="none" stroke="white" stroke-width="6"/>
     <rect x="96" y="72" width="72" height="88" rx="5" fill="none" stroke="white" stroke-width="6" opacity="0.6"/>
     <rect x="104" y="64" width="72" height="88" rx="5" fill="none" stroke="white" stroke-width="6" opacity="0.3"/>
     <text x="128" y="140" text-anchor="middle" font-size="28" font-weight="bold" font-family="sans-serif" fill="white">25</text>`,

  REPORTS_50: /* printer */
    `<rect x="84" y="88" width="88" height="72" rx="6" fill="none" stroke="white" stroke-width="6"/>
     <rect x="100" y="68" width="56" height="28" rx="4" fill="none" stroke="white" stroke-width="6"/>
     <rect x="100" y="152" width="56" height="24" rx="3" fill="white" opacity="0.8"/>
     <text x="128" y="132" text-anchor="middle" font-size="24" font-weight="bold" font-family="sans-serif" fill="white">50</text>`,

  REPORTS_100: /* library/book stack */
    `<rect x="80" y="76" width="24" height="96" rx="3" fill="white"/>
     <rect x="112" y="76" width="24" height="96" rx="3" fill="white" opacity="0.8"/>
     <rect x="144" y="76" width="24" height="96" rx="3" fill="white" opacity="0.6"/>
     <text x="128" y="196" text-anchor="middle" font-size="24" font-weight="bold" font-family="sans-serif" fill="white">100</text>`,

  TABLE_POUND: /* fist on table */
    `<rect x="72" y="148" width="112" height="12" rx="3" fill="white"/>
     <path d="M116,148 L116,108 Q116,88 128,88 Q140,88 140,108 L140,120 L152,120 Q164,120 164,132 L164,148" fill="none" stroke="white" stroke-width="7" stroke-linejoin="round"/>`,

  WONDERKID_FOUND: /* diamond */
    `<polygon points="128,72 176,120 128,184 80,120" fill="none" stroke="white" stroke-width="7" stroke-linejoin="round"/>
     <line x1="80" y1="120" x2="176" y2="120" stroke="white" stroke-width="5"/>
     <line x1="128" y1="72" x2="108" y2="120" stroke="white" stroke-width="4"/>
     <line x1="128" y1="72" x2="148" y2="120" stroke="white" stroke-width="4"/>`,

  ALUMNI_5: /* seedling */
    `<line x1="128" y1="180" x2="128" y2="120" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <path d="M128,120 Q100,100 104,72 Q128,80 128,120" fill="white"/>
     <path d="M128,140 Q156,120 160,92 Q136,100 128,140" fill="white" opacity="0.7"/>`,

  ALUMNI_INTERNATIONAL: /* globe */
    `<circle cx="128" cy="128" r="46" fill="none" stroke="white" stroke-width="6"/>
     <ellipse cx="128" cy="128" rx="22" ry="46" fill="none" stroke="white" stroke-width="4"/>
     <line x1="82" y1="110" x2="174" y2="110" stroke="white" stroke-width="4"/>
     <line x1="82" y1="146" x2="174" y2="146" stroke="white" stroke-width="4"/>`,

  HIGH_ACCURACY: /* crosshair/target */
    `<circle cx="128" cy="128" r="44" fill="none" stroke="white" stroke-width="6"/>
     <circle cx="128" cy="128" r="24" fill="none" stroke="white" stroke-width="5"/>
     <circle cx="128" cy="128" r="6" fill="white"/>
     <line x1="128" y1="72" x2="128" y2="92" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <line x1="128" y1="164" x2="128" y2="184" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <line x1="72" y1="128" x2="92" y2="128" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <line x1="164" y1="128" x2="184" y2="128" stroke="white" stroke-width="5" stroke-linecap="round"/>`,

  GENERATIONAL_TALENT: /* shooting star */
    `<polygon points="128,72 136,100 166,100 142,118 150,148 128,132 106,148 114,118 90,100 120,100" fill="white"/>
     <line x1="160" y1="80" x2="188" y2="64" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <line x1="168" y1="96" x2="192" y2="88" stroke="white" stroke-width="4" stroke-linecap="round"/>
     <line x1="154" y1="68" x2="174" y2="52" stroke="white" stroke-width="4" stroke-linecap="round"/>`,

  // Specialization Mastery
  MAX_SPEC: /* graduation cap */
    `<polygon points="128,88 188,116 128,144 68,116" fill="white"/>
     <line x1="128" y1="144" x2="128" y2="178" stroke="white" stroke-width="5"/>
     <line x1="168" y1="128" x2="168" y2="168" stroke="white" stroke-width="5"/>
     <path d="M96,148 L96,168 Q128,188 160,168 L160,148" fill="none" stroke="white" stroke-width="5"/>`,

  ALL_PERKS_TREE: /* tree */
    `<line x1="128" y1="188" x2="128" y2="120" stroke="white" stroke-width="8" stroke-linecap="round"/>
     <polygon points="128,68 172,130 84,130" fill="white"/>`,

  MASTERY_PERK: /* sparkle star */
    `<polygon points="128,68 136,112 180,112 144,140 156,184 128,156 100,184 112,140 76,112 120,112" fill="white"/>`,

  DUAL_MASTERY: /* two interlocked circles */
    `<circle cx="108" cy="128" r="36" fill="none" stroke="white" stroke-width="7"/>
     <circle cx="148" cy="128" r="36" fill="none" stroke="white" stroke-width="7"/>`,

  EQUIPMENT_MAXED: /* toolbox */
    `<rect x="80" y="108" width="96" height="68" rx="6" fill="none" stroke="white" stroke-width="7"/>
     <path d="M108,108 L108,92 Q108,80 120,80 L136,80 Q148,80 148,92 L148,108" fill="none" stroke="white" stroke-width="6"/>
     <line x1="80" y1="132" x2="176" y2="132" stroke="white" stroke-width="5"/>
     <circle cx="128" cy="132" r="8" fill="white"/>`,

  SECONDARY_SPEC: /* two swords crossed */
    `<line x1="88" y1="80" x2="168" y2="176" stroke="white" stroke-width="8" stroke-linecap="round"/>
     <line x1="168" y1="80" x2="88" y2="176" stroke="white" stroke-width="8" stroke-linecap="round"/>
     <circle cx="128" cy="128" r="12" fill="white"/>`,

  ALL_ACTIVITIES: /* grid of dots */
    `<circle cx="96" cy="96" r="10" fill="white"/>
     <circle cx="128" cy="96" r="10" fill="white"/>
     <circle cx="160" cy="96" r="10" fill="white"/>
     <circle cx="96" cy="128" r="10" fill="white"/>
     <circle cx="128" cy="128" r="10" fill="white"/>
     <circle cx="160" cy="128" r="10" fill="white"/>
     <circle cx="96" cy="160" r="10" fill="white"/>
     <circle cx="128" cy="160" r="10" fill="white"/>
     <circle cx="160" cy="160" r="10" fill="white"/>`,

  REP_50: /* rising graph */
    `<polyline points="80,168 112,140 140,152 180,88" fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
     <polygon points="168,84 184,84 184,100" fill="white"/>`,

  // World Explorer
  COUNTRIES_3: /* airplane */
    `<path d="M128,80 L128,176" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <path d="M80,128 L128,112 L176,128" fill="none" stroke="white" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
     <path d="M104,164 L128,156 L152,164" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,

  COUNTRIES_6: /* compass */
    `<circle cx="128" cy="128" r="46" fill="none" stroke="white" stroke-width="6"/>
     <polygon points="128,84 136,124 128,116 120,124" fill="white"/>
     <polygon points="128,172 136,132 128,140 120,132" fill="white" opacity="0.5"/>
     <line x1="82" y1="128" x2="174" y2="128" stroke="white" stroke-width="3"/>`,

  COUNTRIES_10: /* globe with pin */
    `<circle cx="128" cy="132" r="44" fill="none" stroke="white" stroke-width="6"/>
     <ellipse cx="128" cy="132" rx="20" ry="44" fill="none" stroke="white" stroke-width="4"/>
     <line x1="84" y1="116" x2="172" y2="116" stroke="white" stroke-width="3"/>
     <line x1="84" y1="148" x2="172" y2="148" stroke="white" stroke-width="3"/>
     <circle cx="152" cy="92" r="10" fill="white"/>`,

  COUNTRIES_15: /* world network */
    `<circle cx="100" cy="100" r="10" fill="white"/>
     <circle cx="160" cy="96" r="10" fill="white"/>
     <circle cx="128" cy="148" r="10" fill="white"/>
     <circle cx="88" cy="160" r="8" fill="white" opacity="0.7"/>
     <circle cx="168" cy="152" r="8" fill="white" opacity="0.7"/>
     <line x1="100" y1="100" x2="160" y2="96" stroke="white" stroke-width="3"/>
     <line x1="100" y1="100" x2="128" y2="148" stroke="white" stroke-width="3"/>
     <line x1="160" y1="96" x2="128" y2="148" stroke="white" stroke-width="3"/>
     <line x1="88" y1="160" x2="128" y2="148" stroke="white" stroke-width="3"/>
     <line x1="168" y1="152" x2="128" y2="148" stroke="white" stroke-width="3"/>`,

  HOME_MASTERY: /* house */
    `<polygon points="128,72 180,120 172,120 172,176 84,176 84,120 76,120" fill="none" stroke="white" stroke-width="7" stroke-linejoin="round"/>
     <rect x="112" y="140" width="32" height="36" rx="3" fill="white"/>`,

  ALL_CONTINENTS: /* earth with check */
    `<circle cx="128" cy="128" r="46" fill="none" stroke="white" stroke-width="6"/>
     <ellipse cx="128" cy="128" rx="20" ry="46" fill="none" stroke="white" stroke-width="4"/>
     <line x1="82" y1="112" x2="174" y2="112" stroke="white" stroke-width="3"/>
     <line x1="82" y1="144" x2="174" y2="144" stroke="white" stroke-width="3"/>
     <polyline points="112,128 124,140 148,112" fill="none" stroke="white" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,

  // Hidden
  BLIND_FAITH: /* closed eyes */
    `<path d="M76,128 Q128,80 180,128" fill="none" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <line x1="100" y1="128" x2="88" y2="148" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <line x1="128" y1="128" x2="128" y2="152" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <line x1="156" y1="128" x2="168" y2="148" stroke="white" stroke-width="5" stroke-linecap="round"/>`,

  TRIPLE_STORYLINE: /* theater masks */
    `<circle cx="108" cy="116" r="28" fill="none" stroke="white" stroke-width="6"/>
     <circle cx="148" cy="116" r="28" fill="none" stroke="white" stroke-width="6"/>
     <path d="M96,124 Q108,140 120,124" fill="none" stroke="white" stroke-width="4"/>
     <path d="M136,124 Q148,108 160,124" fill="none" stroke="white" stroke-width="4"/>
     <text x="128" y="184" text-anchor="middle" font-size="24" font-weight="bold" font-family="sans-serif" fill="white">×3</text>`,

  SURVIVED_FIRING: /* phoenix/flame rising */
    `<path d="M128,180 Q108,140 120,120 Q108,100 128,72 Q148,100 136,120 Q148,140 128,180Z" fill="white"/>`,

  WATCHLIST_10: /* clipboard with list */
    `<rect x="88" y="72" width="80" height="104" rx="6" fill="none" stroke="white" stroke-width="6"/>
     <rect x="108" y="64" width="40" height="16" rx="4" fill="white"/>
     <line x1="104" y1="104" x2="120" y2="104" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <line x1="104" y1="124" x2="120" y2="124" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <line x1="104" y1="144" x2="120" y2="144" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <circle cx="152" cy="104" r="5" fill="white"/>
     <circle cx="152" cy="124" r="5" fill="white"/>
     <circle cx="152" cy="144" r="5" fill="white"/>`,

  MARATHON: /* running figure */
    `<circle cx="140" cy="80" r="14" fill="white"/>
     <line x1="132" y1="96" x2="120" y2="140" stroke="white" stroke-width="8" stroke-linecap="round"/>
     <line x1="120" y1="140" x2="100" y2="180" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <line x1="120" y1="140" x2="148" y2="176" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <line x1="128" y1="112" x2="96" y2="128" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <line x1="128" y1="112" x2="164" y2="104" stroke="white" stroke-width="7" stroke-linecap="round"/>`,

  // Scouting Excellence (new)
  DISCOVERIES_5: /* magnifying glass with small star */
    `<circle cx="116" cy="116" r="40" fill="none" stroke="white" stroke-width="7"/>
     <line x1="144" y1="144" x2="180" y2="180" stroke="white" stroke-width="8" stroke-linecap="round"/>
     <polygon points="116,96 120,108 132,108 122,116 126,128 116,120 106,128 110,116 100,108 112,108" fill="white"/>`,

  DISCOVERIES_15: /* magnifying glass with 3 stars */
    `<circle cx="116" cy="116" r="40" fill="none" stroke="white" stroke-width="7"/>
     <line x1="144" y1="144" x2="180" y2="180" stroke="white" stroke-width="8" stroke-linecap="round"/>
     <polygon points="100,104 103,112 111,112 105,117 107,125 100,120 93,125 95,117 89,112 97,112" fill="white"/>
     <polygon points="120,96 123,104 131,104 125,109 127,117 120,112 113,117 115,109 109,104 117,104" fill="white"/>
     <polygon points="132,116 135,124 143,124 137,129 139,137 132,132 125,137 127,129 121,124 129,124" fill="white"/>`,

  ALUMNI_15: /* mature plant (taller seedling) */
    `<line x1="128" y1="188" x2="128" y2="100" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <path d="M128,100 Q96,76 100,48 Q128,58 128,100" fill="white"/>
     <path d="M128,130 Q160,106 164,78 Q136,88 128,130" fill="white" opacity="0.8"/>
     <path d="M128,155 Q96,140 92,118 Q120,124 128,155" fill="white" opacity="0.6"/>`,

  ACADEMY_GOLD: /* trophy cup with star */
    `<path d="M100,80 L100,128 Q100,160 128,168 Q156,160 156,128 L156,80Z" fill="none" stroke="white" stroke-width="7"/>
     <line x1="128" y1="168" x2="128" y2="184" stroke="white" stroke-width="7"/>
     <line x1="104" y1="184" x2="152" y2="184" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <path d="M100,96 Q72,96 72,116 Q72,136 100,136" fill="none" stroke="white" stroke-width="5"/>
     <path d="M156,96 Q184,96 184,116 Q184,136 156,136" fill="none" stroke="white" stroke-width="5"/>
     <polygon points="128,96 132,108 144,108 134,116 138,128 128,120 118,128 122,116 112,108 124,108" fill="white"/>`,

  FULL_HOUSE: /* grid of position dots (3x3 + 2) */
    `<circle cx="92" cy="92" r="12" fill="white"/>
     <circle cx="128" cy="92" r="12" fill="white"/>
     <circle cx="164" cy="92" r="12" fill="white"/>
     <circle cx="92" cy="128" r="12" fill="white"/>
     <circle cx="128" cy="128" r="12" fill="white"/>
     <circle cx="164" cy="128" r="12" fill="white"/>
     <circle cx="92" cy="164" r="12" fill="white"/>
     <circle cx="128" cy="164" r="12" fill="white"/>
     <circle cx="164" cy="164" r="12" fill="white"/>
     <circle cx="110" cy="72" r="8" fill="white" opacity="0.6"/>
     <circle cx="146" cy="72" r="8" fill="white" opacity="0.6"/>`,

  PERFECT_RECORD: /* shield with checkmark */
    `<path d="M128,68 L176,92 L176,140 Q176,176 128,196 Q80,176 80,140 L80,92Z" fill="none" stroke="white" stroke-width="7" stroke-linejoin="round"/>
     <polyline points="104,132 120,150 156,110" fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,

  // Match Analysis
  MATCHES_25: /* stadium outline with "25" */
    `<path d="M72,148 Q72,88 128,80 Q184,88 184,148" fill="none" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <line x1="72" y1="148" x2="184" y2="148" stroke="white" stroke-width="7"/>
     <line x1="80" y1="148" x2="80" y2="168" stroke="white" stroke-width="5"/>
     <line x1="176" y1="148" x2="176" y2="168" stroke="white" stroke-width="5"/>
     <text x="128" y="140" text-anchor="middle" font-size="36" font-weight="bold" font-family="sans-serif" fill="white">25</text>`,

  MATCHES_50: /* stadium outline with "50" */
    `<path d="M72,148 Q72,88 128,80 Q184,88 184,148" fill="none" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <line x1="72" y1="148" x2="184" y2="148" stroke="white" stroke-width="7"/>
     <line x1="80" y1="148" x2="80" y2="168" stroke="white" stroke-width="5"/>
     <line x1="176" y1="148" x2="176" y2="168" stroke="white" stroke-width="5"/>
     <text x="128" y="140" text-anchor="middle" font-size="36" font-weight="bold" font-family="sans-serif" fill="white">50</text>`,

  MATCHES_100: /* stadium outline with "100" */
    `<path d="M72,148 Q72,88 128,80 Q184,88 184,148" fill="none" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <line x1="72" y1="148" x2="184" y2="148" stroke="white" stroke-width="7"/>
     <line x1="80" y1="148" x2="80" y2="168" stroke="white" stroke-width="5"/>
     <line x1="176" y1="148" x2="176" y2="168" stroke="white" stroke-width="5"/>
     <text x="128" y="138" text-anchor="middle" font-size="32" font-weight="bold" font-family="sans-serif" fill="white">100</text>`,

  OBSERVATIONS_50: /* binoculars */
    `<circle cx="104" cy="128" r="28" fill="none" stroke="white" stroke-width="7"/>
     <circle cx="152" cy="128" r="28" fill="none" stroke="white" stroke-width="7"/>
     <line x1="128" y1="116" x2="128" y2="140" stroke="white" stroke-width="6"/>
     <circle cx="104" cy="128" r="10" fill="white"/>
     <circle cx="152" cy="128" r="10" fill="white"/>`,

  OBSERVATIONS_200: /* eye with magnifying lens */
    `<ellipse cx="128" cy="128" rx="56" ry="36" fill="none" stroke="white" stroke-width="7"/>
     <circle cx="128" cy="128" r="18" fill="white"/>
     <circle cx="128" cy="128" r="8" fill="none" stroke="white" stroke-width="4"/>
     <circle cx="160" cy="108" r="20" fill="none" stroke="white" stroke-width="5"/>
     <line x1="174" y1="122" x2="188" y2="136" stroke="white" stroke-width="5" stroke-linecap="round"/>`,

  OBSERVATIONS_500: /* eye with radiating lines */
    `<ellipse cx="128" cy="128" rx="56" ry="36" fill="none" stroke="white" stroke-width="7"/>
     <circle cx="128" cy="128" r="16" fill="white"/>
     <line x1="128" y1="72" x2="128" y2="84" stroke="white" stroke-width="4" stroke-linecap="round"/>
     <line x1="128" y1="172" x2="128" y2="184" stroke="white" stroke-width="4" stroke-linecap="round"/>
     <line x1="68" y1="108" x2="56" y2="100" stroke="white" stroke-width="4" stroke-linecap="round"/>
     <line x1="188" y1="108" x2="200" y2="100" stroke="white" stroke-width="4" stroke-linecap="round"/>
     <line x1="68" y1="148" x2="56" y2="156" stroke="white" stroke-width="4" stroke-linecap="round"/>
     <line x1="188" y1="148" x2="200" y2="156" stroke="white" stroke-width="4" stroke-linecap="round"/>`,

  CONTACTS_5: /* two people silhouettes linked */
    `<circle cx="100" cy="104" r="18" fill="white"/>
     <path d="M72,168 Q72,140 100,136 Q128,140 128,168" fill="white"/>
     <circle cx="156" cy="104" r="18" fill="white"/>
     <path d="M128,168 Q128,140 156,136 Q184,140 184,168" fill="white"/>
     <line x1="118" y1="120" x2="138" y2="120" stroke="white" stroke-width="5" stroke-linecap="round"/>`,

  CONTACTS_15: /* network of 4 connected people */
    `<circle cx="96" cy="92" r="14" fill="white"/>
     <circle cx="160" cy="92" r="14" fill="white"/>
     <circle cx="96" cy="160" r="14" fill="white"/>
     <circle cx="160" cy="160" r="14" fill="white"/>
     <line x1="96" y1="106" x2="96" y2="146" stroke="white" stroke-width="4"/>
     <line x1="160" y1="106" x2="160" y2="146" stroke="white" stroke-width="4"/>
     <line x1="110" y1="92" x2="146" y2="92" stroke="white" stroke-width="4"/>
     <line x1="110" y1="160" x2="146" y2="160" stroke="white" stroke-width="4"/>
     <line x1="108" y1="104" x2="148" y2="148" stroke="white" stroke-width="3"/>
     <line x1="148" y1="104" x2="108" y2="148" stroke="white" stroke-width="3"/>`,

  REP_75: /* rising graph with "75" */
    `<polyline points="80,168 112,140 140,152 180,88" fill="none" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
     <polygon points="168,84 184,84 184,100" fill="white"/>
     <text x="128" y="196" text-anchor="middle" font-size="28" font-weight="bold" font-family="sans-serif" fill="white">75</text>`,

  REP_100: /* crown over "100" */
    `<polygon points="88,120 92,80 112,104 128,64 144,104 164,80 168,120" fill="white"/>
     <rect x="88" y="120" width="80" height="12" rx="3" fill="white"/>
     <text x="128" y="168" text-anchor="middle" font-size="32" font-weight="bold" font-family="sans-serif" fill="white">100</text>`,

  // Financial
  SAVINGS_100K: /* piggy bank */
    `<ellipse cx="128" cy="132" rx="48" ry="36" fill="none" stroke="white" stroke-width="7"/>
     <circle cx="152" cy="120" r="4" fill="white"/>
     <path d="M176,128 L192,120" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <line x1="108" y1="168" x2="108" y2="184" stroke="white" stroke-width="6" stroke-linecap="round"/>
     <line x1="148" y1="168" x2="148" y2="184" stroke="white" stroke-width="6" stroke-linecap="round"/>
     <path d="M80,128 Q72,108 80,96 Q88,84 100,92" fill="none" stroke="white" stroke-width="5"/>
     <line x1="116" y1="96" x2="140" y2="96" stroke="white" stroke-width="5" stroke-linecap="round"/>`,

  SAVINGS_500K: /* vault / safe door */
    `<rect x="80" y="72" width="96" height="112" rx="8" fill="none" stroke="white" stroke-width="7"/>
     <circle cx="128" cy="128" r="28" fill="none" stroke="white" stroke-width="6"/>
     <line x1="128" y1="100" x2="128" y2="128" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <line x1="128" y1="128" x2="148" y2="140" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <circle cx="128" cy="128" r="6" fill="white"/>
     <rect x="164" y="120" width="12" height="24" rx="3" fill="white"/>`,

  BIG_SPENDER: /* building with upward arrow */
    `<rect x="92" y="100" width="72" height="80" rx="4" fill="none" stroke="white" stroke-width="7"/>
     <rect x="108" y="120" width="16" height="16" rx="2" fill="white"/>
     <rect x="132" y="120" width="16" height="16" rx="2" fill="white"/>
     <rect x="108" y="148" width="16" height="16" rx="2" fill="white"/>
     <rect x="132" y="148" width="16" height="16" rx="2" fill="white"/>
     <polygon points="128,56 148,88 108,88" fill="white"/>`,

  FIRST_EMPLOYEE: /* person with plus sign */
    `<circle cx="120" cy="96" r="20" fill="white"/>
     <path d="M84,180 Q84,148 120,140 Q156,148 156,180" fill="white"/>
     <line x1="172" y1="100" x2="172" y2="132" stroke="white" stroke-width="7" stroke-linecap="round"/>
     <line x1="156" y1="116" x2="188" y2="116" stroke="white" stroke-width="7" stroke-linecap="round"/>`,

  AGENCY_EMPIRE: /* office building with people */
    `<rect x="96" y="72" width="64" height="104" rx="4" fill="none" stroke="white" stroke-width="7"/>
     <rect x="108" y="88" width="12" height="12" rx="2" fill="white"/>
     <rect x="136" y="88" width="12" height="12" rx="2" fill="white"/>
     <rect x="108" y="112" width="12" height="12" rx="2" fill="white"/>
     <rect x="136" y="112" width="12" height="12" rx="2" fill="white"/>
     <rect x="118" y="148" width="20" height="28" rx="3" fill="white"/>
     <circle cx="76" cy="156" r="8" fill="white" opacity="0.7"/>
     <circle cx="180" cy="156" r="8" fill="white" opacity="0.7"/>
     <line x1="76" y1="164" x2="76" y2="180" stroke="white" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
     <line x1="180" y1="164" x2="180" y2="180" stroke="white" stroke-width="4" stroke-linecap="round" opacity="0.7"/>`,

  // Hidden (new)
  SPEEDRUN: /* lightning bolt with clock */
    `<polygon points="136,64 108,132 128,132 120,192 152,120 132,120 144,64" fill="white"/>
     <circle cx="168" cy="84" r="20" fill="none" stroke="white" stroke-width="5"/>
     <line x1="168" y1="72" x2="168" y2="84" stroke="white" stroke-width="4" stroke-linecap="round"/>
     <line x1="168" y1="84" x2="178" y2="88" stroke="white" stroke-width="4" stroke-linecap="round"/>`,

  AGAINST_ALL_ODDS: /* mountain peak with flag */
    `<polygon points="128,68 180,180 76,180" fill="none" stroke="white" stroke-width="7" stroke-linejoin="round"/>
     <line x1="128" y1="68" x2="128" y2="44" stroke="white" stroke-width="5" stroke-linecap="round"/>
     <polygon points="128,44 156,52 128,60" fill="white"/>
     <line x1="100" y1="148" x2="156" y2="148" stroke="white" stroke-width="4" opacity="0.5"/>`,

  STREAK_5: /* five ascending checkmarks / fire */
    `<polyline points="72,148 82,160 96,136" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
     <polyline points="96,140 106,152 120,128" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
     <polyline points="120,132 130,144 144,120" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
     <polyline points="144,124 154,136 168,112" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
     <polyline points="168,116 178,128 192,104" fill="none" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
     <path d="M128,80 Q120,60 128,44 Q136,60 132,72 Q140,56 136,44 Q148,64 128,80Z" fill="white"/>`,
};

// ---------------------------------------------------------------------------
// Achievement metadata (API name → category)
// ---------------------------------------------------------------------------

const ACHIEVEMENTS = [
  { api: "FIRST_OBSERVATION", cat: "gettingStarted" },
  { api: "FIRST_REPORT", cat: "gettingStarted" },
  { api: "FIRST_WEEK", cat: "gettingStarted" },
  { api: "FIRST_MATCH", cat: "gettingStarted" },
  { api: "FIRST_CONTACT", cat: "gettingStarted" },
  { api: "FIRST_PERK", cat: "gettingStarted" },
  { api: "FIRST_EQUIPMENT", cat: "gettingStarted" },
  { api: "FIRST_YOUTH", cat: "gettingStarted" },
  { api: "REACH_TIER_2", cat: "careerMilestones" },
  { api: "REACH_TIER_3", cat: "careerMilestones" },
  { api: "REACH_TIER_4", cat: "careerMilestones" },
  { api: "REACH_TIER_5", cat: "careerMilestones" },
  { api: "SEASON_1", cat: "careerMilestones" },
  { api: "SEASON_3", cat: "careerMilestones" },
  { api: "SEASON_5", cat: "careerMilestones" },
  { api: "SEASON_10", cat: "careerMilestones" },
  { api: "REPORTS_10", cat: "scoutingExcellence" },
  { api: "REPORTS_25", cat: "scoutingExcellence" },
  { api: "REPORTS_50", cat: "scoutingExcellence" },
  { api: "REPORTS_100", cat: "scoutingExcellence" },
  { api: "TABLE_POUND", cat: "scoutingExcellence" },
  { api: "WONDERKID_FOUND", cat: "scoutingExcellence" },
  { api: "ALUMNI_5", cat: "scoutingExcellence" },
  { api: "ALUMNI_INTERNATIONAL", cat: "scoutingExcellence" },
  { api: "HIGH_ACCURACY", cat: "scoutingExcellence" },
  { api: "GENERATIONAL_TALENT", cat: "scoutingExcellence" },
  { api: "MAX_SPEC", cat: "specializationMastery" },
  { api: "ALL_PERKS_TREE", cat: "specializationMastery" },
  { api: "MASTERY_PERK", cat: "specializationMastery" },
  { api: "DUAL_MASTERY", cat: "specializationMastery" },
  { api: "EQUIPMENT_MAXED", cat: "specializationMastery" },
  { api: "SECONDARY_SPEC", cat: "specializationMastery" },
  { api: "ALL_ACTIVITIES", cat: "specializationMastery" },
  { api: "REP_50", cat: "specializationMastery" },
  { api: "COUNTRIES_3", cat: "worldExplorer" },
  { api: "COUNTRIES_6", cat: "worldExplorer" },
  { api: "COUNTRIES_10", cat: "worldExplorer" },
  { api: "COUNTRIES_15", cat: "worldExplorer" },
  { api: "HOME_MASTERY", cat: "worldExplorer" },
  { api: "ALL_CONTINENTS", cat: "worldExplorer" },
  { api: "BLIND_FAITH", cat: "hidden" },
  { api: "TRIPLE_STORYLINE", cat: "hidden" },
  { api: "SURVIVED_FIRING", cat: "hidden" },
  { api: "WATCHLIST_10", cat: "hidden" },
  { api: "MARATHON", cat: "hidden" },
  // Scouting Excellence (new)
  { api: "DISCOVERIES_5", cat: "scoutingExcellence" },
  { api: "DISCOVERIES_15", cat: "scoutingExcellence" },
  { api: "ALUMNI_15", cat: "scoutingExcellence" },
  { api: "ACADEMY_GOLD", cat: "scoutingExcellence" },
  { api: "FULL_HOUSE", cat: "scoutingExcellence" },
  { api: "PERFECT_RECORD", cat: "scoutingExcellence" },
  // Match Analysis
  { api: "MATCHES_25", cat: "matchAnalysis" },
  { api: "MATCHES_50", cat: "matchAnalysis" },
  { api: "MATCHES_100", cat: "matchAnalysis" },
  { api: "OBSERVATIONS_50", cat: "matchAnalysis" },
  { api: "OBSERVATIONS_200", cat: "matchAnalysis" },
  { api: "OBSERVATIONS_500", cat: "matchAnalysis" },
  { api: "CONTACTS_5", cat: "matchAnalysis" },
  { api: "CONTACTS_15", cat: "matchAnalysis" },
  { api: "REP_75", cat: "matchAnalysis" },
  { api: "REP_100", cat: "matchAnalysis" },
  // Financial
  { api: "SAVINGS_100K", cat: "financial" },
  { api: "SAVINGS_500K", cat: "financial" },
  { api: "BIG_SPENDER", cat: "financial" },
  { api: "FIRST_EMPLOYEE", cat: "financial" },
  { api: "AGENCY_EMPIRE", cat: "financial" },
  // Hidden (new)
  { api: "SPEEDRUN", cat: "hidden" },
  { api: "AGAINST_ALL_ODDS", cat: "hidden" },
  { api: "STREAK_5", cat: "hidden" },
];

// ---------------------------------------------------------------------------
// SVG generation
// ---------------------------------------------------------------------------

function buildSvg(apiName, category, locked) {
  const c = locked ? LOCKED : COLORS[category];
  const symbolColor = locked ? LOCKED.symbol : "white";
  const symbol = (SYMBOLS[apiName] || "").replace(/fill="white"/g, `fill="${symbolColor}"`).replace(/stroke="white"/g, `stroke="${symbolColor}"`);

  // Background gradient
  const gradId = locked ? "grad_locked" : `grad_${category}`;
  const gradTop = locked ? "#374151" : c.bg;
  const gradBot = locked ? "#1f2937" : adjustBrightness(c.bg, -20);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${gradTop}"/>
      <stop offset="100%" stop-color="${gradBot}"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect x="4" y="4" width="${SIZE - 8}" height="${SIZE - 8}" rx="${R}" fill="url(#${gradId})"/>
  <!-- Border ring -->
  <rect x="4" y="4" width="${SIZE - 8}" height="${SIZE - 8}" rx="${R}" fill="none" stroke="${c.ring || c.accent}" stroke-width="6" opacity="${locked ? 0.4 : 0.8}"/>
  <!-- Symbol -->
  ${symbol}
</svg>`;
}

function adjustBrightness(hex, amount) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let count = 0;
  for (const { api, cat } of ACHIEVEMENTS) {
    // Unlocked
    const unlockedSvg = buildSvg(api, cat, false);
    const unlockedPath = join(OUT_DIR, `${api}.png`);
    await sharp(Buffer.from(unlockedSvg)).resize(256, 256).png().toFile(unlockedPath);

    // Locked
    const lockedSvg = buildSvg(api, cat, true);
    const lockedPath = join(OUT_DIR, `${api}_locked.png`);
    await sharp(Buffer.from(lockedSvg)).resize(256, 256).png().toFile(lockedPath);

    count++;
  }

  console.log(`Generated ${count} achievement icons (${count * 2} PNG files) in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
