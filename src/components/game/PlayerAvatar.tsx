"use client";

/**
 * PlayerAvatar — procedural SVG avatar component.
 *
 * Renders a simple, distinctive head portrait derived entirely from the
 * player's ID string.  The same player always gets the same avatar.
 * No image assets required.
 *
 * Usage:
 *   <PlayerAvatar playerId={player.id} size={64} nationality={player.nationality} />
 */

import { generateAvatarParams } from "@/lib/avatarGenerator";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PlayerAvatarProps {
  playerId: string;
  size?: 48 | 64 | 96;
  nationality?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Shape data tables
// ---------------------------------------------------------------------------

// Head shapes: [rx, ry] ellipse radii as fractions of the 100-unit viewBox
const HEAD_SHAPES: Array<[number, number]> = [
  [38, 42], // round
  [34, 44], // oval
  [40, 38], // wide
  [32, 44], // narrow-tall
  [36, 40], // slightly wide oval
  [38, 40], // near-circle
  [34, 42], // slightly narrow
  [40, 42], // broad oval
];

// Eye shapes: described as [width, height] of each eye ellipse (half-sizes)
const EYE_SHAPES: Array<[number, number]> = [
  [6, 3.5],  // normal almond
  [7, 4],    // wide
  [5, 3],    // narrow
  [6, 5],    // round
  [8, 3],    // hooded / sleepy
  [5, 4],    // soft round
];

// Eyebrow arcs: y-offset above the eye center
const EYEBROW_OFFSETS: number[] = [10, 11, 9, 12, 8, 10, 11, 9];

// Nose shapes: [width, height] of the nose indicator lines
const NOSE_SHAPES: Array<{ w: number; h: number }> = [
  { w: 6, h: 6 },   // button
  { w: 8, h: 8 },   // medium
  { w: 5, h: 7 },   // narrow tall
  { w: 9, h: 6 },   // wide flat
  { w: 7, h: 9 },   // prominent
];

// Mouth styles: y offset from center and width
const MOUTH_STYLES: Array<{ w: number; dy: number; curved: boolean }> = [
  { w: 14, dy: 0,  curved: true  },  // neutral smile
  { w: 18, dy: 1,  curved: true  },  // wide smile
  { w: 12, dy: -1, curved: false },  // straight / serious
  { w: 14, dy: 0,  curved: false },  // flat neutral
];

// Hair style paths (relative to head center 50,50, viewBox 100x100)
// Each style is described as a set of SVG path data strings rendered with the hair color.
// The hair is always drawn behind the face (rendered first).
type HairStyle = {
  paths: string[];
  /** Whether this style has side hair that frames the face */
  hasSides: boolean;
};

const HAIR_STYLES: HairStyle[] = [
  // 0: short crew cut
  { paths: ["M 14 44 Q 50 -2 86 44 Q 80 32 50 28 Q 20 32 14 44 Z"], hasSides: false },
  // 1: medium parted
  { paths: ["M 12 46 Q 50 0 88 46 Q 82 30 50 26 Q 18 30 12 46 Z", "M 50 26 L 50 35"], hasSides: false },
  // 2: long flowing (sides included)
  { paths: ["M 12 46 Q 50 -4 88 46 Q 86 60 88 76 Q 72 80 62 72 Q 50 68 38 72 Q 28 80 12 76 Q 14 60 12 46 Z"], hasSides: true },
  // 3: afro
  { paths: ["M 50 50 m -32 -4 a 32 32 0 1 1 64 0 a 32 32 0 1 1 -64 0 Z"], hasSides: false },
  // 4: slicked back
  { paths: ["M 14 46 Q 28 16 50 18 Q 72 16 86 46 Q 74 28 50 26 Q 26 28 14 46 Z"], hasSides: false },
  // 5: curly medium
  { paths: ["M 14 46 Q 16 18 36 16 Q 42 10 50 10 Q 58 10 64 16 Q 84 18 86 46 Q 80 34 66 28 Q 56 22 50 24 Q 44 22 34 28 Q 20 34 14 46 Z"], hasSides: false },
  // 6: mohawk
  { paths: ["M 42 44 Q 44 12 50 10 Q 56 12 58 44 Z"], hasSides: false },
  // 7: buzz cut (very close)
  { paths: ["M 16 48 Q 50 10 84 48 Q 78 36 50 32 Q 22 36 16 48 Z"], hasSides: false },
  // 8: side swept
  { paths: ["M 12 46 Q 18 12 60 14 Q 80 14 86 44 Q 78 28 56 24 Q 28 24 12 46 Z"], hasSides: false },
  // 9: braids (represented as parallel lines overlay)
  { paths: ["M 14 46 Q 50 -2 86 46 Q 80 30 50 26 Q 20 30 14 46 Z", "M 30 36 L 28 46", "M 40 30 L 38 42", "M 50 28 L 50 40", "M 60 30 L 62 42", "M 70 36 L 72 46"], hasSides: false },
  // 10: dreads long
  { paths: ["M 12 46 Q 50 -4 88 46 Q 86 60 84 76", "M 16 46 Q 14 60 12 76"], hasSides: true },
  // 11: cornrows
  { paths: ["M 14 44 Q 50 2 86 44 Q 80 28 50 24 Q 20 28 14 44 Z", "M 32 32 L 30 44", "M 44 26 L 42 40", "M 56 26 L 58 40", "M 68 32 L 70 44"], hasSides: false },
  // 12: messy / textured
  { paths: ["M 16 48 Q 22 14 38 12 Q 44 8 50 10 Q 56 8 62 12 Q 78 14 84 48 Q 76 30 62 24 Q 56 20 50 22 Q 44 20 38 24 Q 24 30 16 48 Z", "M 36 18 Q 38 14 42 16", "M 58 18 Q 62 14 64 16"], hasSides: false },
  // 13: top knot / bun
  { paths: ["M 14 46 Q 50 22 86 46 Q 80 34 50 30 Q 20 34 14 46 Z", "M 44 24 Q 50 14 56 24 Q 54 20 50 18 Q 46 20 44 24 Z"], hasSides: false },
  // 14: wavy long
  { paths: ["M 12 46 Q 14 20 30 14 Q 50 6 70 14 Q 86 20 88 46 Q 86 60 84 74 Q 70 80 60 72 Q 50 66 40 72 Q 30 80 16 74 Q 14 60 12 46 Z"], hasSides: true },
];

// Facial hair options (0 = none)
const FACIAL_HAIR: Array<string | null> = [
  null, // 0: none
  // 1: thin mustache
  "M 40 63 Q 50 60 60 63",
  // 2: full beard (chin strap)
  "M 24 68 Q 28 82 50 86 Q 72 82 76 68 Q 66 76 50 78 Q 34 76 24 68 Z",
  // 3: goatee
  "M 42 66 Q 50 62 58 66 Q 60 70 56 76 Q 50 80 44 76 Q 40 70 42 66 Z",
];

// Accessories (0 = none)
type Accessory = null | "glasses" | "headband";
const ACCESSORIES: Accessory[] = [null, "glasses", "headband"];

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function getEyebrowY(headY: number, eyeY: number, style: number): number {
  return eyeY - (EYEBROW_OFFSETS[style % EYEBROW_OFFSETS.length] ?? 10);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlayerAvatar({
  playerId,
  size = 48,
  nationality,
  className,
}: PlayerAvatarProps) {
  const params = generateAvatarParams(playerId, nationality);

  const cx = 50;
  const cy = 50;

  const headShape = HEAD_SHAPES[params.headShape % HEAD_SHAPES.length] ?? HEAD_SHAPES[0];
  const [hrx, hry] = headShape;

  // Derived face landmark positions (all in 0–100 viewBox units)
  const eyeY = cy - 4;
  const eyeOffsetX = 12;
  const noseY = cy + 6;
  const mouthY = cy + 18;
  const browY = getEyebrowY(cy, eyeY, params.headShape);

  const eyeShape = EYE_SHAPES[params.eyeShape % EYE_SHAPES.length] ?? EYE_SHAPES[0];
  const [erx, ery] = eyeShape;

  const nose = NOSE_SHAPES[params.noseType % NOSE_SHAPES.length] ?? NOSE_SHAPES[0];
  const mouth = MOUTH_STYLES[params.mouthType % MOUTH_STYLES.length] ?? MOUTH_STYLES[0];
  const hairStyle = HAIR_STYLES[params.hairStyle % HAIR_STYLES.length] ?? HAIR_STYLES[0];
  const facialHairPath = FACIAL_HAIR[params.facialHair % FACIAL_HAIR.length] ?? null;
  const accessoryType = ACCESSORIES[params.accessory % ACCESSORIES.length] ?? null;

  // Darken skin tone slightly for outlines
  const skinTone = params.skinTone;
  const hairColor = params.hairColor;

  // Mouth path
  const mouthCY = mouthY + mouth.dy;
  const mouthPath = mouth.curved
    ? `M ${cx - mouth.w / 2} ${mouthCY} Q ${cx} ${mouthCY + 5} ${cx + mouth.w / 2} ${mouthCY}`
    : `M ${cx - mouth.w / 2} ${mouthCY} L ${cx + mouth.w / 2} ${mouthCY}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Player avatar"
      role="img"
    >
      {/* Background */}
      <circle cx={50} cy={50} r={50} fill="#1c1c1e" />

      {/* Hair (back layer — rendered before face) */}
      {hairStyle.paths.map((d, i) => (
        <path
          key={`hair-back-${i}`}
          d={d}
          fill={hairStyle.hasSides && i === 0 ? hairColor : hairColor}
          stroke={hairColor}
          strokeWidth={0.5}
          opacity={0.95}
        />
      ))}

      {/* Head / face */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={hrx}
        ry={hry}
        fill={skinTone}
        stroke="#0004"
        strokeWidth={1}
      />

      {/* Eyebrows */}
      <line
        x1={cx - eyeOffsetX - erx}
        y1={browY}
        x2={cx - eyeOffsetX + erx}
        y2={browY - 1.5}
        stroke={hairColor}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <line
        x1={cx + eyeOffsetX - erx}
        y1={browY - 1.5}
        x2={cx + eyeOffsetX + erx}
        y2={browY}
        stroke={hairColor}
        strokeWidth={2}
        strokeLinecap="round"
      />

      {/* Eyes */}
      {/* Left eye */}
      <ellipse
        cx={cx - eyeOffsetX}
        cy={eyeY}
        rx={erx}
        ry={ery}
        fill="white"
        stroke="#0003"
        strokeWidth={0.5}
      />
      <circle
        cx={cx - eyeOffsetX}
        cy={eyeY}
        r={ery * 0.65}
        fill="#2a1800"
      />
      <circle
        cx={cx - eyeOffsetX + 1}
        cy={eyeY - 1}
        r={1}
        fill="white"
        opacity={0.7}
      />

      {/* Right eye */}
      <ellipse
        cx={cx + eyeOffsetX}
        cy={eyeY}
        rx={erx}
        ry={ery}
        fill="white"
        stroke="#0003"
        strokeWidth={0.5}
      />
      <circle
        cx={cx + eyeOffsetX}
        cy={eyeY}
        r={ery * 0.65}
        fill="#2a1800"
      />
      <circle
        cx={cx + eyeOffsetX + 1}
        cy={eyeY - 1}
        r={1}
        fill="white"
        opacity={0.7}
      />

      {/* Nose */}
      <path
        d={`M ${cx - nose.w / 2} ${noseY + nose.h / 2} Q ${cx} ${noseY - nose.h / 2} ${cx + nose.w / 2} ${noseY + nose.h / 2}`}
        fill="none"
        stroke="#0003"
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {/* Mouth */}
      <path
        d={mouthPath}
        fill="none"
        stroke="#0005"
        strokeWidth={1.8}
        strokeLinecap="round"
      />

      {/* Facial hair */}
      {facialHairPath !== null && (
        <path
          d={facialHairPath}
          fill={hairColor}
          stroke={hairColor}
          strokeWidth={0.5}
          opacity={0.85}
        />
      )}

      {/* Accessory: glasses */}
      {accessoryType === "glasses" && (
        <g stroke="#555" strokeWidth={1.5} fill="none" opacity={0.9}>
          <ellipse cx={cx - eyeOffsetX} cy={eyeY} rx={erx + 2} ry={ery + 2} />
          <ellipse cx={cx + eyeOffsetX} cy={eyeY} rx={erx + 2} ry={ery + 2} />
          <line x1={cx - eyeOffsetX + erx + 2} y1={eyeY} x2={cx + eyeOffsetX - erx - 2} y2={eyeY} />
        </g>
      )}

      {/* Accessory: headband */}
      {accessoryType === "headband" && (
        <path
          d={`M ${cx - hrx + 4} ${cy - hry + 14} Q ${cx} ${cy - hry - 2} ${cx + hrx - 4} ${cy - hry + 14}`}
          fill="none"
          stroke="#e63946"
          strokeWidth={5}
          strokeLinecap="round"
          opacity={0.9}
        />
      )}

      {/* Hair front overlay (for styles where hair overlaps the forehead edge) */}
      {params.hairStyle % HAIR_STYLES.length === 3 /* afro */ && (
        <ellipse
          cx={cx}
          cy={cy - hry + 4}
          rx={hrx - 2}
          ry={6}
          fill={hairColor}
          opacity={0.4}
        />
      )}
    </svg>
  );
}

export default PlayerAvatar;
