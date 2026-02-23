/**
 * Deterministic procedural avatar parameter generator.
 *
 * Converts a string seed (player ID) + optional nationality into a stable set
 * of avatar parameters.  The same seed always produces the same avatar —
 * there is no runtime randomness.
 *
 * All parameters are integer indices into their respective style arrays.
 * The actual SVG shapes are defined in the PlayerAvatar component.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AvatarParams {
  /** Head shape index, 0–7 */
  headShape: number;
  /** Skin tone as a hex color string */
  skinTone: string;
  /** Hair style index, 0–14 */
  hairStyle: number;
  /** Hair color as a hex color string */
  hairColor: string;
  /** Eye shape index, 0–5 */
  eyeShape: number;
  /** Nose type index, 0–4 */
  noseType: number;
  /** Mouth type index, 0–3 */
  mouthType: number;
  /** Facial hair index, 0–3 (0 = none) */
  facialHair: number;
  /** Accessory index, 0–2 (0 = none) */
  accessory: number;
}

// ---------------------------------------------------------------------------
// Deterministic hash
// ---------------------------------------------------------------------------

/**
 * Convert a string to a stable 32-bit unsigned integer via a djb2-style hash.
 * The same string always produces the same integer across all environments.
 */
export function hashString(str: string): number {
  let h = 0x12345678;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x9e3779b9);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/**
 * Derive a sequence of pseudo-random values from a seed string.
 * Uses a simple LCG progression so each call advances independently.
 */
function makeSeededValues(seed: number): (max: number) => number {
  let state = seed;
  return function nextInt(max: number): number {
    // Lehmer LCG: multiplier 1664525, increment 1013904223 (Numerical Recipes)
    state = ((Math.imul(state, 1664525) + 1013904223) | 0) >>> 0;
    return state % max;
  };
}

// ---------------------------------------------------------------------------
// Skin tone palettes
// ---------------------------------------------------------------------------

/**
 * Nationality → skin tone bucket mapping.
 * Each bucket contains multiple hex tones so the seed can introduce variety
 * within the same region.
 */
const SKIN_TONES_BY_REGION: Record<string, string[]> = {
  european: [
    "#FDDBB4", "#F5C89A", "#EDB882", "#E8A870",
    "#FFCBA4", "#F0C090", "#DDA070",
  ],
  african: [
    "#8D5524", "#7B4A1E", "#6B3A10", "#C68642",
    "#A0522D", "#B5651D", "#9E5120",
  ],
  southAmerican: [
    "#C68642", "#B8734A", "#D2956B", "#C8805A",
    "#CC7A50", "#BA6A3A",
  ],
  asian: [
    "#F1C27D", "#E8B86D", "#FFDAB9", "#F5D09A",
    "#ECC590", "#F0BE80",
  ],
  middleEastern: [
    "#D2956B", "#C8805A", "#E0A070", "#C07850",
  ],
  default: [
    "#C68642", "#D2956B", "#E8B86D", "#F1C27D", "#8D5524",
  ],
};

/**
 * Map nationality strings to skin tone buckets.
 * Partial match — the lookup is case-insensitive prefix/contains.
 */
const NATIONALITY_SKIN_MAP: Array<{ keywords: string[]; bucket: string }> = [
  { keywords: ["english", "scottish", "welsh", "irish", "french", "german", "spanish", "italian", "dutch", "portuguese", "belgian", "swiss", "swedish", "norwegian", "danish", "finnish", "polish", "czech", "austrian", "greek", "russian"], bucket: "european" },
  { keywords: ["nigerian", "ghanaian", "senegalese", "ivorian", "cameroonian", "south african", "kenyan", "ethiopian", "congolese", "malian", "guinean", "gambian", "sierra leonean", "liberian"], bucket: "african" },
  { keywords: ["brazilian", "argentinian", "colombian", "uruguayan", "chilean", "peruvian", "venezuelan", "ecuadorian", "paraguayan", "bolivian"], bucket: "southAmerican" },
  { keywords: ["japanese", "south korean", "chinese", "thai", "vietnamese", "indonesian", "malaysian", "filipin"], bucket: "asian" },
  { keywords: ["moroccan", "tunisian", "algerian", "egyptian", "saudi", "emirati", "turkish", "iranian"], bucket: "middleEastern" },
];

function getSkinTones(nationality?: string): string[] {
  if (!nationality) return SKIN_TONES_BY_REGION.default;
  const lower = nationality.toLowerCase();
  for (const { keywords, bucket } of NATIONALITY_SKIN_MAP) {
    if (keywords.some((k) => lower.includes(k))) {
      return SKIN_TONES_BY_REGION[bucket] ?? SKIN_TONES_BY_REGION.default;
    }
  }
  return SKIN_TONES_BY_REGION.default;
}

// ---------------------------------------------------------------------------
// Hair color palettes
// ---------------------------------------------------------------------------

const HAIR_COLORS: string[] = [
  "#1A1A1A", // black
  "#2C1B0E", // dark brown
  "#5C3317", // medium brown
  "#8B5E3C", // light brown
  "#C4922A", // golden brown / dark blonde
  "#E8C46A", // blonde
  "#D13B2A", // red / auburn
  "#A0A0A0", // grey
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate stable avatar parameters from a seed string and optional nationality.
 *
 * All outputs are deterministic — the same (seed, nationality) pair always
 * produces the same AvatarParams.
 */
export function generateAvatarParams(seed: string, nationality?: string): AvatarParams {
  const hash = hashString(seed);
  const next = makeSeededValues(hash);

  const skinTones = getSkinTones(nationality);

  return {
    headShape:  next(8),        // 0–7
    skinTone:   skinTones[next(skinTones.length)]!,
    hairStyle:  next(15),       // 0–14
    hairColor:  HAIR_COLORS[next(HAIR_COLORS.length)]!,
    eyeShape:   next(6),        // 0–5
    noseType:   next(5),        // 0–4
    mouthType:  next(4),        // 0–3
    facialHair: next(4),        // 0–3 (0 = none)
    accessory:  next(3),        // 0–2 (0 = none)
  };
}
