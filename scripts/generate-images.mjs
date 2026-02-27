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
    prompt: `Overhead view of a football scout's organized desk late at night, printed photos of soccer players in jerseys spread out, handwritten scouting reports with player ratings and tactical formation diagrams, a leather-bound notebook open with notes, pen and reading glasses, coffee mug, emerald desk lamp casting warm light, dark moody atmosphere, no basketball, ${BRAND}`,
  },
  {
    id: "report-writer",
    filename: "report-writer.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Dimly lit football analyst workspace, tactical board with formation magnets on the wall, projected player stats on a glowing screen, scattered dossier folders and player photographs on the desk, emerald accent lighting from a desk lamp, top-down perspective looking at the workspace, cinematic intelligence briefing aesthetic, ${BRAND}`,
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

  // ── WORLD MAP ──────────────────────────────────────────────────────────
  {
    id: "world-map",
    filename: "world-map.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Equirectangular flat world map projection showing all continents and oceans, dark navy ocean (#0f172a), dark landmasses with subtle emerald topographic contour lines, no text or labels, no borders, satellite imagery style, night view from space with subtle city lights, ${BRAND}`,
  },

  // ── ACTIVITY BACKGROUNDS (Week Simulation) ────────────────────────────
  {
    id: "sim-school-match",
    filename: "school-match.png",
    subdir: "backgrounds/activities",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Muddy school playing fields with portable goalposts, kids in numbered bibs playing a match, a scout in dark coat watching from the touchline with notebook, autumn afternoon, overcast sky, ${BRAND}`,
  },
  {
    id: "sim-grassroots",
    filename: "grassroots.png",
    subdir: "backgrounds/activities",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Community recreation ground with multiple mini-pitches, portable goals, colorful team pennants and bunting strung between posts, parents on folding chairs, scout watching from behind a chain-link fence, ${BRAND}`,
  },
  {
    id: "sim-street-football",
    filename: "street-football.png",
    subdir: "backgrounds/activities",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Urban concrete futsal cage at dusk, tall metal fencing, graffiti on surrounding walls, orange sodium street lights casting long shadows, a few teenagers playing with a worn ball, ${BRAND}`,
  },
  {
    id: "sim-youth-festival",
    filename: "youth-festival.png",
    subdir: "backgrounds/activities",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Large outdoor youth football festival with multiple full-size pitches, sponsor banners, team tents and gazebos, busy atmosphere with hundreds of players, tournament bracket boards visible, ${BRAND}`,
  },
  {
    id: "sim-academy",
    filename: "academy.png",
    subdir: "backgrounds/activities",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Modern football academy interior, pristine indoor pitch with perfect markings, glass-walled observation gallery above, youth players in training kit doing drills, professional lighting rigs, ${BRAND}`,
  },
  {
    id: "sim-training",
    filename: "training.png",
    subdir: "backgrounds/activities",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `First-team training ground at dawn, dewy grass with training cones and mannequins, a touchline bench with tactics board, coaching staff in tracksuits in the distance, floodlights still on, ${BRAND}`,
  },
  {
    id: "sim-video",
    filename: "video-room.png",
    subdir: "backgrounds/activities",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Dark video analysis room, large wall-mounted screen showing frozen match footage with tactical arrows overlaid, magnetic tactics board on the wall, desk with laptop showing heatmaps, ${BRAND}`,
  },
  {
    id: "sim-meeting",
    filename: "meeting.png",
    subdir: "backgrounds/activities",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Private corner booth in a dimly lit upscale sports bar, two coffee cups on dark wooden table, leather portfolio with player photographs peeking out, TV showing football in the background, ${BRAND}`,
  },
  {
    id: "sim-data",
    filename: "data-room.png",
    subdir: "backgrounds/activities",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Dark analytics room with triple monitor setup showing scatter plots and player radar charts, mechanical keyboard, coffee mug, spreadsheets printed on desk, screen glow illuminating the space, ${BRAND}`,
  },
  {
    id: "sim-conference",
    filename: "conference.png",
    subdir: "backgrounds/activities",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Modern conference hall with large presentation screen showing a football analytics dashboard, rows of dark seats, podium with microphone, dramatic stage lighting, ${BRAND}`,
  },
  {
    id: "sim-rest",
    filename: "rest.png",
    subdir: "backgrounds/activities",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Cozy hotel room at evening, unmade bed with a scout's leather bag on it, window overlooking a football stadium in the distance with its lights still on, warm lamp light, relaxed atmosphere, ${BRAND}`,
  },
  {
    id: "sim-free-day",
    filename: "free-day.png",
    subdir: "backgrounds/activities",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Empty park bench on a hill overlooking a city skyline at twilight, distant football stadium visible, quiet contemplative atmosphere, soft golden-hour lighting fading to blue dusk, ${BRAND}`,
  },

  // ── SCOUT AVATARS ────────────────────────────────────────────────────────
  {
    id: "avatar-1",
    filename: "scout-1.png",
    subdir: "avatars",
    aspect: "1:1",
    model: "nano-banana-pro",
    prompt: `Bust portrait of a male football scout in his 30s, short dark hair, dark coat with collar turned up, confident expression, dramatic side-lighting, dark background (#1c1c1e), slightly stylized 3D render, no text, no logos, ${BRAND}`,
  },
  {
    id: "avatar-2",
    filename: "scout-2.png",
    subdir: "avatars",
    aspect: "1:1",
    model: "nano-banana-pro",
    prompt: `Bust portrait of a female football scout in her late 20s, hair pulled back in a ponytail, puffer jacket and lanyard credential, professional focused expression, dramatic side-lighting, dark background (#1c1c1e), slightly stylized 3D render, no text, no logos, ${BRAND}`,
  },
  {
    id: "avatar-3",
    filename: "scout-3.png",
    subdir: "avatars",
    aspect: "1:1",
    model: "nano-banana-pro",
    prompt: `Bust portrait of a male football scout in his 40s, salt-and-pepper beard, flat cap and wool scarf, weathered veteran appearance, knowing expression, dramatic side-lighting, dark background (#1c1c1e), slightly stylized 3D render, no text, no logos, ${BRAND}`,
  },
  {
    id: "avatar-4",
    filename: "scout-4.png",
    subdir: "avatars",
    aspect: "1:1",
    model: "nano-banana-pro",
    prompt: `Bust portrait of a female data analyst scout in her 30s, curly hair, glasses, blazer over turtleneck sweater, intellectual sharp expression, dramatic side-lighting, dark background (#1c1c1e), slightly stylized 3D render, no text, no logos, ${BRAND}`,
  },
  {
    id: "avatar-5",
    filename: "scout-5.png",
    subdir: "avatars",
    aspect: "1:1",
    model: "nano-banana-pro",
    prompt: `Bust portrait of a male football scout in his late 20s, athletic build, modern fade haircut, wearing a tracksuit, ex-player turned scout energy, confident expression, dramatic side-lighting, dark background (#1c1c1e), slightly stylized 3D render, no text, no logos, ${BRAND}`,
  },
  {
    id: "avatar-6",
    filename: "scout-6.png",
    subdir: "avatars",
    aspect: "1:1",
    model: "nano-banana-pro",
    prompt: `Bust portrait of a senior male football scout director in his 50s, bald head, strong features, long wool overcoat, authoritative distinguished presence, dramatic side-lighting, dark background (#1c1c1e), slightly stylized 3D render, no text, no logos, ${BRAND}`,
  },

  // ── SCREEN BACKGROUNDS ───────────────────────────────────────────────────
  {
    id: "dashboard-office",
    filename: "dashboard-office.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Scout's personal office at dusk, wooden desk with open laptop, scattered papers and scouting reports, coffee mug, window behind showing blurry football pitch with floodlights, warm desk lamp, no people visible, very dark overall exposure, cinematic wide-angle, muted atmospheric color palette, ${BRAND}`,
  },
  {
    id: "career-journey",
    filename: "career-journey.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Football stadium players' tunnel viewed from inside looking toward the pitch, dramatic light flooding in from the pitch end, framed photos and plaques on the concrete tunnel walls, no people visible, very dark overall exposure, cinematic wide-angle, muted atmospheric color palette, ${BRAND}`,
  },
  {
    id: "network-lounge",
    filename: "network-lounge.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Dimly-lit private members' lounge, dark leather armchairs, low table with whisky glasses, football memorabilia on wood-paneled walls including scarves and signed photographs, warm amber wall sconces, no people visible, very dark overall exposure, cinematic wide-angle, muted atmospheric color palette, ${BRAND}`,
  },
  {
    id: "discoveries-trophy",
    filename: "discoveries-trophy.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Trophy display case in a prestigious football club, glass shelves with dramatic spotlighting, golden trophies, medals, and plaques, deep navy background, no people visible, very dark overall exposure, cinematic wide-angle, muted atmospheric color palette, ${BRAND}`,
  },
  {
    id: "rivals-binoculars",
    filename: "rivals-binoculars.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `View across a rainy football training ground from behind a chain-link fence at twilight, distant floodlights creating halos in mist, cold blue-grey tones, tense surveillance feel, no people visible, very dark overall exposure, cinematic wide-angle, muted atmospheric color palette, ${BRAND}`,
  },
  {
    id: "negotiation-boardroom",
    filename: "negotiation-boardroom.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Sleek corporate boardroom with long dark table and leather chairs, glass windows showing nighttime city skyline, subtle club badges and football memorabilia on wall, cool blue and grey tones, no people visible, very dark overall exposure, cinematic wide-angle, muted atmospheric color palette, ${BRAND}`,
  },
  {
    id: "training-classroom",
    filename: "training-classroom.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Modern sports analysis classroom, large screens showing tactical diagrams and formation overlays, tiered seating in semi-darkness, podium with laptop, blue and white screen glow illuminating the room, no people visible, very dark overall exposure, cinematic wide-angle, muted atmospheric color palette, ${BRAND}`,
  },
  {
    id: "agency-office",
    filename: "agency-office.png",
    subdir: "backgrounds",
    aspect: "16:9",
    model: "nano-banana-pro",
    prompt: `Large modern scouting agency office, multiple workstations with monitors, wall-mounted world map with colored pins marking locations, filing cabinets, dark wood and glass decor, overhead warm lighting, no people visible, very dark overall exposure, cinematic wide-angle, muted atmospheric color palette, ${BRAND}`,
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
