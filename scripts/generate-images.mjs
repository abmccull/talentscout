#!/usr/bin/env node

/**
 * TalentScout Visual Asset Generator
 *
 * Uses Meshy AI Text-to-Image API to generate game artwork.
 * Run: node scripts/generate-images.mjs
 *
 * Requires MESHY_API_KEY in .env.local
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_IMAGES = path.join(ROOT, "public", "images");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_KEY = "msy_8fPmcptT1MyzpUiQC6LvcnpMMxygkBiE7GXG";
const BASE_URL = "https://api.meshy.ai/openapi/v1";
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // 5 min max wait

// Brand notes: dark theme, emerald (#10b981) accents, scouting notebook aesthetic
const BRAND = "dark moody atmosphere, emerald green accent lighting, cinematic, photorealistic, high quality";

// ---------------------------------------------------------------------------
// Asset definitions
// ---------------------------------------------------------------------------

const ASSETS = [
  // ── APP ICON ──────────────────────────────────────────────────────────────
  {
    id: "icon-notebook",
    filename: "icon-notebook.png",
    subdir: "branding",
    aspect: "1:1",
    model: "nano-banana-pro",
    prompt: `A leather-bound football scout's notebook viewed from above on a dark wooden desk, emerald green bookmark ribbon, vintage fountain pen beside it, a small pair of binoculars, dramatic overhead spotlight, ${BRAND}`,
  },
  {
    id: "icon-binoculars",
    filename: "icon-binoculars.png",
    subdir: "branding",
    aspect: "1:1",
    model: "nano-banana-pro",
    prompt: `A pair of premium binoculars on a dark surface with a football pitch reflection visible in one lens, emerald green light rim, dramatic lighting from above, minimalist composition, ${BRAND}`,
  },
  {
    id: "icon-whistle-badge",
    filename: "icon-whistle-badge.png",
    subdir: "branding",
    aspect: "1:1",
    model: "nano-banana-pro",
    prompt: `A golden football scout credential badge with an emerald gemstone center, lying on dark leather, dramatic spotlight, premium and luxurious feel, sharp detail, ${BRAND}`,
  },

  // ── MAIN MENU BACKGROUND ─────────────────────────────────────────────────
  {
    id: "menu-bg-1",
    filename: "menu-bg-1.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `A scout's private office overlooking a football stadium at dusk through large windows, rain drops on glass, worn leather chair, desk covered in player reports and notebooks, old radio on shelf, emerald desk lamp casting warm glow, volumetric light rays, ${BRAND}`,
  },
  {
    id: "menu-bg-2",
    filename: "menu-bg-2.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Empty football stadium tunnel looking out toward a pristine green pitch at twilight, dramatic perspective, wet concrete, emerald LED strip lights along the tunnel walls, fog drifting in from the pitch, ${BRAND}`,
  },

  // ── STEAM STORE CAPSULE ART ──────────────────────────────────────────────
  {
    id: "steam-hero",
    filename: "steam-hero.png",
    subdir: "steam",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Wide cinematic shot of a solitary figure in a dark coat standing in the rain at an empty football stadium, holding a notebook, distant floodlights creating dramatic god-rays through the rain, emerald glow from the pitch, ultra-wide panoramic composition, epic scale, ${BRAND}`,
  },
  {
    id: "steam-capsule",
    filename: "steam-capsule.png",
    subdir: "steam",
    aspect: "3:4",
    model: "nano-banana-pro",
    prompt: `A scout's leather notebook cover with handwritten notes visible, a fountain pen, and a magnifying glass over a player profile photograph, all on a dark wooden desk, dramatic overhead lighting, emerald accent strip, vertical composition, ${BRAND}`,
  },

  // ── SEASON END / HALL OF FAME ────────────────────────────────────────────
  {
    id: "season-end",
    filename: "season-end.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `An empty football stadium at golden hour sunset, pristine pitch glowing amber and gold, long shadows across the grass, confetti scattered on the ground from a celebration, a single scout's notebook left on a seat in the stands, bittersweet nostalgic atmosphere, ${BRAND}`,
  },

  // ── MATCH ATMOSPHERE ─────────────────────────────────────────────────────
  {
    id: "match-atmosphere",
    filename: "match-atmosphere.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `View from the press box of a packed football stadium during a night match, floodlights blazing, crowd creating a wall of noise visible as motion blur, the green pitch glowing below, a scout's open notebook and pen in the foreground on the press box ledge, tense atmosphere, ${BRAND}`,
  },

  // ── SCOUTING / REPORTS ───────────────────────────────────────────────────
  {
    id: "reports-desk",
    filename: "reports-desk.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Overhead view of a scout's organized desk late at night, player profile photos spread out, handwritten scouting reports with ratings, a laptop showing video analysis, coffee mug, emerald desk lamp, dark atmosphere, detective investigation board feel, ${BRAND}`,
  },

  // ── LOADING SCREEN ───────────────────────────────────────────────────────
  {
    id: "loading",
    filename: "loading.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Extreme close-up of a fountain pen nib writing on cream paper, ink flowing from the tip forming cursive text, shallow depth of field, dark background with soft emerald bokeh circles, intimate and focused, ${BRAND}`,
  },

  // ── INTERNATIONAL SCOUTING ───────────────────────────────────────────────
  {
    id: "international",
    filename: "international.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `An airport departure gate at dawn, a scout sitting alone with a worn leather bag and notebook, flight information board showing destinations of football cities (Madrid, Milan, Munich, Rio), emerald light from outside, contemplative mood, ${BRAND}`,
  },
];

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function createImageTask(asset) {
  const body = {
    ai_model: asset.model,
    prompt: asset.prompt,
    aspect_ratio: asset.aspect,
  };

  const res = await fetch(`${BASE_URL}/text-to-image`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create task failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.result; // task ID
}

async function pollTask(taskId) {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${BASE_URL}/text-to-image/${taskId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Poll failed ${res.status}: ${text}`);
    }

    const data = await res.json();

    if (data.status === "SUCCEEDED") {
      return data.image_urls;
    }
    if (data.status === "FAILED") {
      throw new Error(`Task ${taskId} failed`);
    }

    process.stdout.write(` ${data.progress}%`);
  }
  throw new Error(`Task ${taskId} timed out`);
}

async function downloadImage(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buffer);
  return buffer.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const onlyIds = args.find((a) => a.startsWith("--only="))?.split("=")[1]?.split(",");
  const skipExisting = args.includes("--skip-existing");

  let assets = ASSETS;
  if (onlyIds) {
    assets = assets.filter((a) => onlyIds.includes(a.id));
  }

  console.log(`\nTalentScout Image Generator`);
  console.log(`===========================`);
  console.log(`Assets: ${assets.length}`);
  if (skipExisting) console.log(`Skipping: existing files`);

  // Filter out existing
  const plan = [];
  for (const asset of assets) {
    const outDir = path.join(PUBLIC_IMAGES, asset.subdir);
    const outPath = path.join(outDir, asset.filename);
    if (skipExisting && fs.existsSync(outPath)) {
      console.log(`  SKIP ${asset.id} (exists)`);
      continue;
    }
    plan.push({ asset, outDir, outPath });
  }

  if (dryRun) {
    console.log(`\nDRY RUN — would generate:\n`);
    for (const { asset } of plan) {
      console.log(`  ${asset.id.padEnd(22)} ${asset.aspect.padEnd(5)} → ${asset.subdir}/${asset.filename}`);
    }
    console.log(`\nTotal: ${plan.length} images`);
    return;
  }

  if (plan.length === 0) {
    console.log("\nNothing to generate.");
    return;
  }

  // Check balance
  const balRes = await fetch(`${BASE_URL}/balance`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const bal = await balRes.json();
  console.log(`Credits available: ${bal.balance}\n`);

  let completed = 0;
  let failed = 0;

  for (const { asset, outDir, outPath } of plan) {
    fs.mkdirSync(outDir, { recursive: true });

    const progress = `[${completed + failed + 1}/${plan.length}]`;
    process.stdout.write(`${progress} ${asset.id}...`);

    try {
      const taskId = await createImageTask(asset);
      process.stdout.write(` task=${taskId}`);

      const imageUrls = await pollTask(taskId);

      if (!imageUrls || imageUrls.length === 0) {
        throw new Error("No image URLs in response");
      }

      const bytes = await downloadImage(imageUrls[0], outPath);
      const sizeKB = (bytes / 1024).toFixed(1);
      console.log(` ✓ (${sizeKB} KB)`);
      completed++;
    } catch (err) {
      console.log(` ✗ ${err.message}`);
      failed++;
    }

    // Brief pause between requests
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Final balance
  const finalBal = await fetch(`${BASE_URL}/balance`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const fb = await finalBal.json();

  console.log(`\n===========================`);
  console.log(`Completed: ${completed}/${plan.length}`);
  if (failed > 0) console.log(`Failed: ${failed}`);
  console.log(`Credits remaining: ${fb.balance}`);
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
