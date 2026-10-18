import { createVisualIdentity, validateVisualIdentity } from "./identity";
import type { PlayerVisualIdentity } from "./types";

/** Pin this version in a saved binding; changing it changes a person's face. */
export const PROCEDURAL_VERSION = "ts-human-v1" as const;
export const FACE_CHANNELS = [
  "headWidth", "headHeight", "faceDepth", "foreheadHeight", "browProminence",
  "cheekboneWidth", "cheekFullness", "jawWidth", "jawAngle", "chinWidth", "chinProjection",
  "eyeSpacing", "eyeSize", "eyeTilt", "upperEyelidFold", "eyeDepth",
  "noseWidth", "noseLength", "noseBridge", "noseTip", "nostrilWidth",
  "mouthWidth", "upperLipFullness", "lowerLipFullness", "earSize", "earProjection",
  "browHeight", "browAngle", "facialAsymmetry",
] as const;
export type FaceChannel = typeof FACE_CHANNELS[number];
export const IRIS_COLORS = {
  darkBrown: "#332017", brown: "#65442c", hazel: "#817344", amber: "#a87831",
  green: "#6b8057", blue: "#68879a", gray: "#818c8d",
} as const;
export const HAIR_COLORS = {
  black: "#151312", darkBrown: "#30231b", brown: "#60432b",
  auburn: "#79432e", darkBlond: "#877144", blond: "#b8a06c",
} as const;
export const SKIN_COLORS = [
  "#f0d6c4", "#e8c6ae", "#dab294", "#cb9a78", "#bc8865", "#aa7553",
  "#976447", "#835339", "#70452f", "#5c3828", "#492d23", "#37241f",
] as const;
export const HAIR_TEXTURES = ["straight", "wavy", "curly", "coily"] as const;
export const HAIR_STYLES = ["cropped", "short", "medium", "long"] as const;
export const MATERIAL_CHANNELS = [
  "skinColor", "undertone", "irisColor", "irisRing", "hairColor", "browDensity",
  "freckles", "moles", "skinRoughness", "poreDetail", "grayHair", "wrinkles", "beardDensity",
] as const;
export const AGE_CHANNELS = ["adolescent", "adultMaturity", "hairlineRecession"] as const;

export interface ProceduralFace {
  schemaVersion: 1;
  generatorVersion: typeof PROCEDURAL_VERSION;
  identity: PlayerVisualIdentity;
  geometry: Record<FaceChannel, number>;
  skin: { tone: number; undertone: number; color: string; freckles: number; moles: number; roughness: number; poreDetail: number };
  eyes: { colorName: keyof typeof IRIS_COLORS; color: string; irisRing: number };
  hair: { texture: typeof HAIR_TEXTURES[number]; style: typeof HAIR_STYLES[number]; colorName: keyof typeof HAIR_COLORS; color: string; browDensity: number; beardPotential: number };
  aging: { grayOnset: number; recessionOnset: number; recessionPotential: number };
}
export interface ProceduralPortraitRequest {
  schemaVersion: 1;
  generatorVersion: typeof PROCEDURAL_VERSION;
  face: ProceduralFace;
  age: number;
  morphs: Record<FaceChannel | typeof AGE_CHANNELS[number], number>;
  materials: Record<typeof MATERIAL_CHANNELS[number], number | string>;
  assets: { hair: string; facialHair: "clean-shaven" | "stubble" | "short-beard" };
  render: { width: 512; height: 640; transparent: true };
}

const rounded = (value: number) => Math.round(value * 1000000) / 1000000;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
/** Independent appearance stream: no shared football RNG, country, name or ability. */
function unit(seed: string, channel: string): number {
  // Four coupled lanes retain more than 32 bits of identity state. A single
  // 32-bit prefix hash risks whole-face collisions over a multi-decade career.
  let a = 1779033703, b = 3144134277, c = 1013904242, d = 2773480762;
  const text = `${PROCEDURAL_VERSION}:${seed}:${channel}`;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    a = b ^ Math.imul(a ^ k, 597399067);
    b = c ^ Math.imul(b ^ k, 2869860233);
    c = d ^ Math.imul(c ^ k, 951274213);
    d = a ^ Math.imul(d ^ k, 2716044179);
  }
  a = Math.imul(c ^ (a >>> 18), 597399067);
  b = Math.imul(d ^ (b >>> 22), 2869860233);
  c = Math.imul(a ^ (c >>> 17), 951274213);
  d = Math.imul(b ^ (d >>> 19), 2716044179);
  return ((a ^ b ^ c ^ d) >>> 0) / 4294967296;
}

export function createProceduralFace(identity: PlayerVisualIdentity): ProceduralFace {
  const playerId = identity.identityId.slice("person:v1:".length);
  validateVisualIdentity(identity, playerId);
  createVisualIdentity(playerId); // Validate bounded, nonempty player ID too.
  const sample = (key: string) => unit(identity.seed, key);
  const pick = <T,>(list: readonly T[], key: string): T => list[Math.floor(sample(key) * list.length)]!;
  // Average samples so simultaneous extreme deformations are uncommon.
  const geometry = Object.fromEntries(FACE_CHANNELS.map((key) => [key,
    rounded(((sample(key + ":a") + sample(key + ":b") + sample(key + ":c")) / 3 - 0.5)
      * (key === "facialAsymmetry" ? 0.32 : 1.5)),
  ])) as Record<FaceChannel, number>;
  const tone = Math.floor(sample("skin") * SKIN_COLORS.length);
  const eye = pick(Object.keys(IRIS_COLORS) as (keyof typeof IRIS_COLORS)[], "eyes");
  const hair = pick(Object.keys(HAIR_COLORS) as (keyof typeof HAIR_COLORS)[], "hair-color");
  return {
    schemaVersion: 1, generatorVersion: PROCEDURAL_VERSION, identity: { ...identity }, geometry,
    skin: { tone, color: SKIN_COLORS[tone]!, undertone: rounded(sample("undertone") * 2 - 1),
      freckles: rounded(sample("freckles") > 0.7 ? sample("freckle-density") * 0.65 : 0),
      moles: rounded(sample("moles") > 0.55 ? sample("mole-density") * 0.4 : 0),
      roughness: rounded(0.36 + sample("roughness") * 0.2), poreDetail: rounded(0.3 + sample("pores") * 0.4) },
    eyes: { colorName: eye, color: IRIS_COLORS[eye], irisRing: rounded(0.2 + sample("iris-ring") * 0.6) },
    hair: { texture: pick(HAIR_TEXTURES, "hair-texture"), style: pick(HAIR_STYLES, "hair-style"),
      colorName: hair, color: HAIR_COLORS[hair], browDensity: rounded(0.35 + sample("brows") * 0.65),
      beardPotential: rounded(sample("beard")) },
    aging: { grayOnset: 36 + Math.floor(sample("gray-onset") * 25),
      recessionOnset: 24 + Math.floor(sample("recession-onset") * 30),
      recessionPotential: rounded(sample("recession") > 0.4 ? sample("recession-amount") * 0.65 : 0) },
  };
}

/** Reject corrupted or silently edited recipes; v1 is entirely reproducible. */
export function validateProceduralFace(raw: unknown): ProceduralFace {
  if (!raw || typeof raw !== "object") throw new Error("Invalid procedural face");
  const face = raw as ProceduralFace;
  if (face.schemaVersion !== 1 || face.generatorVersion !== PROCEDURAL_VERSION || !face.identity) {
    throw new Error("Unsupported procedural face version");
  }
  const expected = createProceduralFace(face.identity);
  if (stablePortraitJSON(raw) !== stablePortraitJSON(expected)) throw new Error("Procedural face differs from its pinned identity");
  return expected;
}

export function portraitRequest(raw: ProceduralFace, age: number): ProceduralPortraitRequest {
  const face = validateProceduralFace(raw);
  if (!Number.isInteger(age) || age < 14 || age > 100) throw new Error("Portrait age must be an integer from 14 through 100");
  const beard = rounded(face.hair.beardPotential * clamp((age - 17) / 9));
  return {
    schemaVersion: 1, generatorVersion: PROCEDURAL_VERSION, face, age,
    morphs: { ...face.geometry, adolescent: rounded(clamp((24 - age) / 10)),
      adultMaturity: rounded(clamp((age - 24) / 30) * 0.45),
      hairlineRecession: rounded(clamp((age - face.aging.recessionOnset) / 25) * face.aging.recessionPotential) },
    materials: { skinColor: face.skin.color, undertone: face.skin.undertone, irisColor: face.eyes.color,
      irisRing: face.eyes.irisRing, hairColor: face.hair.color, browDensity: face.hair.browDensity,
      freckles: face.skin.freckles, moles: face.skin.moles, skinRoughness: face.skin.roughness,
      poreDetail: face.skin.poreDetail, grayHair: rounded(clamp((age - face.aging.grayOnset) / 30)),
      wrinkles: rounded(clamp((age - 28) / 55) * 0.65), beardDensity: beard },
    assets: { hair: `${face.hair.texture}-${face.hair.style}`,
      facialHair: beard < 0.15 ? "clean-shaven" : beard < 0.55 ? "stubble" : "short-beard" },
    render: { width: 512, height: 640, transparent: true },
  };
}

/** Stable serialization also supplies the browser/Blender cache digest input. */
export function stablePortraitJSON(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, normalize(entry)]));
    return input;
  };
  return JSON.stringify(normalize(value));
}
