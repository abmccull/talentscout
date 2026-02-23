#!/usr/bin/env node

/**
 * TalentScout Audio Asset Generator
 *
 * Uses ElevenLabs Sound Generation API + Music API to create all game audio.
 * Run: node scripts/generate-audio.mjs
 *
 * Requires ELEVENLABS_API_KEY in .env.local
 *
 * Options:
 *   --category=sfx|ambience|music|all   Generate specific category (default: all)
 *   --only=id1,id2                       Generate only specific asset IDs
 *   --skip-existing                      Skip files that already exist
 *   --dry-run                            Print what would be generated without calling API
 *   --variants=N                         Generate N variants per asset (default: per-asset config)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_AUDIO = path.join(ROOT, "public", "audio");

// ---------------------------------------------------------------------------
// Load API key from .env.local
// ---------------------------------------------------------------------------

function loadApiKey() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("ERROR: .env.local not found. Create it with ELEVENLABS_API_KEY=your_key");
    process.exit(1);
  }
  const envContent = fs.readFileSync(envPath, "utf8");
  const match = envContent.match(/^ELEVENLABS_API_KEY=(.+)$/m);
  if (!match || !match[1].trim()) {
    console.error("ERROR: ELEVENLABS_API_KEY not found or empty in .env.local");
    process.exit(1);
  }
  return match[1].trim();
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const SFX_URL = "https://api.elevenlabs.io/v1/sound-generation";
const MUSIC_URL = "https://api.elevenlabs.io/v1/music";

async function generateSFX(apiKey, { prompt, duration, promptInfluence = 0.8, loop = false }) {
  const body = {
    text: prompt,
    model_id: "eleven_text_to_sound_v2",
    prompt_influence: promptInfluence,
    loop,
  };
  if (duration) body.duration_seconds = duration;

  const res = await fetch(`${SFX_URL}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SFX API ${res.status}: ${text}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function generateMusic(apiKey, { prompt, durationMs, forceInstrumental = true }) {
  const body = {
    prompt,
    model_id: "music_v1",
    music_length_ms: durationMs,
    force_instrumental: forceInstrumental,
    output_format: "mp3_44100_128",
  };

  const res = await fetch(MUSIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Music API ${res.status}: ${text}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Rate-limit-aware sequential runner
// ---------------------------------------------------------------------------

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runWithRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.message.includes("429") && attempt < maxRetries) {
        const wait = attempt * 15000;
        console.log(`  Rate limited — waiting ${wait / 1000}s before retry ${attempt + 1}/${maxRetries}...`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Asset definitions
// ---------------------------------------------------------------------------

/** @type {Array<{id: string, category: "sfx"|"ambience"|"music", subdir: string, filename: string, variants: number, generate: (apiKey: string, variant: number) => Promise<Buffer>}>} */
const ASSETS = [
  // =========================================================================
  // SFX — UI INTERACTIONS
  // =========================================================================
  {
    id: "click",
    category: "sfx",
    subdir: "sfx",
    filename: "click",
    variants: 3,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Crisp satisfying mechanical button click, warm tone with slight low-mid body, dry studio recording, single clean click like a quality pen click, no reverb",
          "Soft tactile UI click sound, like pressing a premium toggle switch, close-mic, dry, warm wood tone, very short",
          "Clean subtle mouse click or trackpad tap, digital interface sound, precise and minimal, warm not harsh",
        ][v],
        duration: 0.5,
        promptInfluence: 0.9,
      }),
  },
  {
    id: "page-turn",
    category: "sfx",
    subdir: "sfx",
    filename: "page-turn",
    variants: 5,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Soft paper page flip, moleskin notebook page turn, gentle and quick, foley close-up recording, no background noise",
          "Paper turning sound, single page flip of a small leather-bound notebook, quiet and intimate",
          "Quick notebook page turn, slightly rough paper texture, foley sound, dry recording",
          "Thin paper page flip, like a scout's field notebook, fast and light, close microphone",
          "Journal page turning, soft papery swoosh, single page, no echo",
        ][v],
        duration: 0.5,
        promptInfluence: 0.9,
      }),
  },
  {
    id: "notification",
    category: "sfx",
    subdir: "sfx",
    filename: "notification",
    variants: 3,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Gentle two-tone ascending notification chime, marimba or wooden bell, bright but soft, pleasant alert ding-ding",
          "Soft pleasant notification sound, two quick ascending notes like a xylophone tap, warm and friendly",
          "Brief gentle bell chime notification, two ascending tones, clean and non-alarming, warm wood instrument",
        ][v],
        duration: 0.6,
        promptInfluence: 0.8,
      }),
  },
  {
    id: "error",
    category: "sfx",
    subdir: "sfx",
    filename: "error",
    variants: 2,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Soft low descending two-note error sound, woody bonk, muted and non-punishing, gentle negative feedback",
          "Short muted descending tone, gentle error buzz, not harsh or alarming, like a polite 'nope' sound",
        ][v],
        duration: 0.5,
        promptInfluence: 0.8,
      }),
  },
  {
    id: "save",
    category: "sfx",
    subdir: "sfx",
    filename: "save",
    variants: 2,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Quick confirmation swoosh upward with soft click at the end, document being filed away, satisfying and clean",
          "Short subtle save confirmation sound, soft upward sweep with gentle resolution, like a file sliding into a folder",
        ][v],
        duration: 0.5,
        promptInfluence: 0.8,
      }),
  },

  // =========================================================================
  // SFX — MATCH EVENTS
  // =========================================================================
  {
    id: "whistle",
    category: "sfx",
    subdir: "sfx",
    filename: "whistle",
    variants: 3,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Single sharp referee whistle blast, real Fox 40 referee whistle, rising pitch held for half a second, clean decay, outdoor sports field",
          "Football referee whistle, one strong blast, authentic sports whistle sound, sharp and clear, slight outdoor reverb",
          "Sharp sports referee whistle blow, single blast for kick-off, metallic pea whistle, crisp and authoritative",
        ][v],
        duration: 1.0,
        promptInfluence: 0.9,
      }),
  },
  {
    id: "season-end-whistle",
    category: "sfx",
    subdir: "sfx",
    filename: "season-end-whistle",
    variants: 2,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Triple referee whistle blast, two short blasts then one long final blast, peep-peep-PEEEEP pattern, football match ending signal, authentic referee whistle",
          "Three referee whistle blows signaling end of football match, two quick short blasts followed by one sustained long blast, classic full-time whistle pattern",
        ][v],
        duration: 2.0,
        promptInfluence: 0.9,
      }),
  },
  {
    id: "crowd-goal",
    category: "sfx",
    subdir: "sfx",
    filename: "crowd-goal",
    variants: 8,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Explosive football stadium crowd roar erupting after a goal, sudden burst from murmur to full roar, 30000 fans going wild, sustained celebration with cheering",
          "Massive stadium crowd explosion of joy, goal celebration, fans erupting in unison, loud sustained roar with clapping and cheering",
          "Football crowd erupts after scoring a goal, explosive cheer from thousands of fans, crescendo of excitement, stadium atmosphere",
          "Soccer stadium goal celebration crowd noise, sudden volcanic eruption of 40000 fans screaming with joy, sustained roar",
          "Huge sports crowd explosive cheer, goal scored moment, thunderous roar building and sustaining, football stadium atmosphere",
          "Intense football crowd celebration, fans jumping and screaming after a goal, massive wall of sound, euphoric crowd roar",
          "Stadium crowd going absolutely crazy after a goal, deafening roar of tens of thousands, pure euphoria and celebration noise",
          "Big football match goal celebration, crowd eruption from nervous tension to explosive joy, sustained screaming and cheering fans",
        ][v],
        duration: 4.0,
        promptInfluence: 0.8,
      }),
  },
  {
    id: "crowd-miss",
    category: "sfx",
    subdir: "sfx",
    filename: "crowd-miss",
    variants: 5,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Football stadium crowd groan and collective sigh, shot just missed the goal, rising anticipation that deflates into disappointed 'ohhh', thousands of fans",
          "Stadium crowd collective groan of disappointment, near miss in football, crowd rises in hope then sighs in unison, deflating energy",
          "Thirty thousand football fans groaning in unison as a shot goes wide, collective disappointed 'awww' sound, stadium atmosphere",
          "Sports crowd reaction to a near miss, building excitement that suddenly deflates into mass groan and sighing, football stadium",
          "Football crowd disappointed reaction, rising anticipation peaking then collapsing into collective sigh, close miss at goal",
        ][v],
        duration: 3.0,
        promptInfluence: 0.8,
      }),
  },

  // =========================================================================
  // SFX — CAREER & PROGRESSION
  // =========================================================================
  {
    id: "report-submit",
    category: "sfx",
    subdir: "sfx",
    filename: "report-submit",
    variants: 3,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Paper rubber stamp hitting paper with authority, official document stamp sound, thud with slight reverb, foley close-up",
          "Heavy ink stamp on paper, bureaucratic approval stamp, satisfying thump of rubber on page, official and final sounding",
          "Scouting report being stamped, rubber stamp impact on thick paper, authoritative thud with paper resonance, official document seal",
        ][v],
        duration: 0.5,
        promptInfluence: 0.9,
      }),
  },
  {
    id: "level-up",
    category: "sfx",
    subdir: "sfx",
    filename: "level-up",
    variants: 3,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Triumphant ascending musical arpeggio for level up, bright brass fanfare fragment with shimmer, heroic and earned feeling, game progression sound",
          "Ascending triumphant chime sequence, four notes going up with sparkle on the top note, rewarding level-up jingle, brass and bells",
          "Victorious ascending arpeggio with gentle sustain, promotion fanfare, bright and uplifting 4-note climb, golden achievement feeling",
        ][v],
        duration: 1.5,
        promptInfluence: 0.7,
      }),
  },
  {
    id: "promotion",
    category: "sfx",
    subdir: "sfx",
    filename: "promotion",
    variants: 3,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Epic cinematic orchestral achievement fanfare, timpani roll into brass fanfare, dramatic and goosebump-inducing, once in a lifetime reward jingle",
          "Grand orchestral celebration fanfare, short triumphant brass melody with timpani, dramatic cinematic achievement sound, majestic and powerful",
          "Dramatic epic achievement jingle, orchestral hit followed by soaring brass fanfare with shimmering resolution, a truly special moment sound",
        ][v],
        duration: 3.5,
        promptInfluence: 0.7,
      }),
  },
  {
    id: "achievement",
    category: "sfx",
    subdir: "sfx",
    filename: "achievement",
    variants: 3,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Achievement unlock chime, metallic ping followed by ascending three-note bell chime with sparkle decay, distinctive and memorable, cuts through music",
          "Steam achievement notification sound, bright metallic ding with ascending shimmer, clean and distinctive, high register bell-like chime",
          "Game achievement unlocked jingle, clear bright ping with two ascending follow-up notes, crystalline and satisfying, sparkle tail",
        ][v],
        duration: 1.2,
        promptInfluence: 0.8,
      }),
  },
  {
    id: "discovery",
    category: "sfx",
    subdir: "sfx",
    filename: "discovery",
    variants: 3,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Mysterious exciting discovery reveal sound, low mysterious tone rising into bright shimmer, like finding hidden treasure, wonder and excitement",
          "Magical discovery sound effect, deep tone transforming into ascending bright sparkle, revelatory moment, something special has been found",
          "Wonderkid talent discovery sound, mysterious low note blooming into bright ascending chime, awe and excitement, a diamond found in the rough",
        ][v],
        duration: 1.5,
        promptInfluence: 0.7,
      }),
  },
  {
    id: "job-offer",
    category: "sfx",
    subdir: "sfx",
    filename: "job-offer",
    variants: 2,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Vintage telephone ring fragment, two rings of an old rotary phone, important call incoming, slightly warm and nostalgic, office setting",
          "Old-fashioned phone ringing twice, classic telephone bell, important incoming call sound, retro office atmosphere, warm analog feel",
        ][v],
        duration: 1.5,
        promptInfluence: 0.9,
      }),
  },

  // =========================================================================
  // SFX — NEW ADDITIONS
  // =========================================================================
  {
    id: "pen-scribble",
    category: "sfx",
    subdir: "sfx",
    filename: "pen-scribble",
    variants: 5,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Quick pen scribbling on paper, 2-3 fast strokes of a ballpoint pen writing a note, foley close-up, dry recording",
          "Fast pen writing on notebook paper, brief scratchy handwriting sound, scout jotting down notes, foley",
          "Short ballpoint pen scratching on paper, quick annotation, two strokes, close microphone, no reverb",
          "Rapid fountain pen strokes on paper, brief note-taking sound, scratchy and organic, foley recording",
          "Quick pen on paper, three fast scribble strokes, note-jotting sound, intimate foley, dry",
        ][v],
        duration: 0.5,
        promptInfluence: 0.9,
      }),
  },
  {
    id: "calendar-slide",
    category: "sfx",
    subdir: "sfx",
    filename: "calendar-slide",
    variants: 3,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Quick soft whoosh left to right, calendar page flipping forward, light airy transition, time passing",
          "Gentle paper swoosh, light page flip transition, calendar advancing one week, soft and quick",
          "Soft quick transition whoosh, like flipping a desk calendar page, light and airy paper movement",
        ][v],
        duration: 0.5,
        promptInfluence: 0.8,
      }),
  },
  {
    id: "travel",
    category: "sfx",
    subdir: "sfx",
    filename: "travel",
    variants: 3,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Brief distant airplane flyover, jet passing overhead, travel departure sound, the scout is heading somewhere new, fading away",
          "Quick airport departure chime followed by distant jet engine, travel and journey sound, brief and evocative",
          "Short airplane taking off in the distance, wheels up, brief travel departure sound, fading into sky",
        ][v],
        duration: 1.5,
        promptInfluence: 0.8,
      }),
  },
  {
    id: "camera-shutter",
    category: "sfx",
    subdir: "sfx",
    filename: "camera-shutter",
    variants: 3,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "SLR camera shutter click, single crisp mechanical click-clack, observation captured, close-up foley",
          "Digital camera shutter sound, clean single click, crisp mechanical photography sound, close microphone",
          "Camera shutter actuating once, precise mechanical click, DSLR photograph being taken, dry foley recording",
        ][v],
        duration: 0.5,
        promptInfluence: 0.9,
      }),
  },
  {
    id: "crowd-chant",
    category: "sfx",
    subdir: "sfx",
    filename: "crowd-chant",
    variants: 5,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Football stadium rhythmic crowd chanting, duh-duh-duh-DUH-DUH pattern, wordless rhythmic fans chant, big match atmosphere, thousands of voices",
          "Rhythmic football crowd chant, clap-clap-clapclapclap pattern, stadium fans in unison, energetic and driving, no words",
          "Football terrace chanting, rhythmic wordless crowd singing in unison, drums and voices, passionate supporters, stadium atmosphere",
          "Stadium crowd rhythmic clapping and chanting, football supporters in unison, driving beat, no distinguishable words, raw energy",
          "Football fans unified rhythmic shout, short repeating chant pattern, passionate crowd, stadium echo, thunderous and tribal",
        ][v],
        duration: 5.0,
        promptInfluence: 0.8,
      }),
  },

  // =========================================================================
  // AMBIENCE — LOOPING BACKGROUNDS
  // =========================================================================
  {
    id: "stadium-crowd",
    category: "ambience",
    subdir: "ambience",
    filename: "stadium-crowd",
    variants: 6,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Football stadium crowd ambient noise, 30000 fans murmuring and chatting, occasional clapping waves, distant chanting, natural dynamics, outdoor sports atmosphere",
          "Live football match crowd atmosphere, steady crowd murmur with sporadic cheering swells, distant drum, spectators talking, authentic stadium ambience",
          "Stadium crowd ambience during a football match, base layer of thousands murmuring, sporadic clapping, isolated shouts, natural ebb and flow",
          "Football ground atmosphere, crowd of twenty thousand, general chatter and murmur, occasional collective gasp, distant singing, match day feeling",
          "Soccer match crowd ambient sound, large stadium filled with fans, steady drone of voices with periodic excitement waves, authentic and natural",
          "Big football stadium atmosphere, pre-match buzz of excitement, crowd filling seats, murmuring and anticipation, occasional cheer, building energy",
        ][v],
        duration: 25,
        promptInfluence: 0.8,
        loop: true,
      }),
  },
  {
    id: "office",
    category: "ambience",
    subdir: "ambience",
    filename: "office",
    variants: 4,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Very quiet office ambience, faint keyboard typing in the distance, occasional paper rustle, subtle room tone, gentle air conditioning hum, calm workspace",
          "Subtle scout's office atmosphere, quiet room with distant keyboard clicks, paper shuffling, muffled voices from another room, clock ticking softly",
          "Quiet workspace ambience, very gentle room tone, sporadic paper sounds, distant muffled phone, soft rain against window, cozy office atmosphere",
          "Minimal office background ambience, gentle air movement, occasional distant typing, paper being shuffled, quiet and focused workspace, late evening work",
        ][v],
        duration: 20,
        promptInfluence: 0.7,
        loop: true,
      }),
  },
  {
    id: "rain-stadium",
    category: "ambience",
    subdir: "ambience",
    filename: "rain-stadium",
    variants: 4,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Football stadium crowd in the rain, crowd noise slightly muffled by rainfall, rain hitting stadium roof and seats, damp atmosphere with cheering fans",
          "Rainy football match atmosphere, steady rainfall on metal stadium roof mixed with crowd murmur, fans in the rain, splashing and dripping",
          "Stadium crowd ambience during heavy rain, rain drumming on roof, muffled crowd sounds underneath, wet match atmosphere, dripping water",
          "Football match in the rain, crowd noise dampened by rainfall, water hitting stadium surfaces, soggy match day, fans still cheering despite rain",
        ][v],
        duration: 25,
        promptInfluence: 0.8,
        loop: true,
      }),
  },
  {
    id: "rain",
    category: "ambience",
    subdir: "ambience",
    filename: "rain",
    variants: 3,
    generate: (key, v) =>
      generateSFX(key, {
        prompt: [
          "Steady medium rain falling, outdoor rainfall ambience, natural rain sounds without thunder, consistent and calming, no wind",
          "Rainfall ambience, moderate steady rain, water dripping and splashing, natural outdoor rain, peaceful and consistent",
          "Rain falling steadily, close recording of rain hitting ground and surfaces, medium intensity, no thunder, gentle and steady",
        ][v],
        duration: 20,
        promptInfluence: 0.8,
        loop: true,
      }),
  },

  // =========================================================================
  // MUSIC — BACKGROUND TRACKS
  // =========================================================================
  {
    id: "music-menu",
    category: "music",
    subdir: "music",
    filename: "menu",
    variants: 3,
    generate: (key, v) =>
      generateMusic(key, {
        prompt: [
          "Warm inviting acoustic piano melody over soft ambient pads, calm and aspirational, no percussion, slow gentle builds, like a Sunday morning newspaper, 75 BPM, peaceful and hopeful, ambient minimalist piano",
          "Gentle piano and soft strings ambient piece, warm and welcoming, slow contemplative melody, feeling of possibility and new beginnings, 70 BPM, no drums, cinematic calm",
          "Soft acoustic guitar with warm pad textures, calm reflective ambient piece, aspirational and gentle, sparse arrangement, 80 BPM, no percussion, dawn of a new journey feeling",
        ][v],
        durationMs: 100000,
      }),
  },
  {
    id: "music-scouting",
    category: "music",
    subdir: "music",
    filename: "scouting",
    variants: 3,
    generate: (key, v) =>
      generateMusic(key, {
        prompt: [
          "Lo-fi hip hop beat with mellow Rhodes piano, soft brushed drums, subtle jazz bass, focused and contemplative, late night studying vibe, vinyl warmth, 85 BPM, perfect for background concentration, not distracting, minimal melodic hooks",
          "Jazzy lo-fi ambient beat, warm Fender Rhodes chords, gentle brush kit drums, walking bass, relaxed and focused, 90 BPM, office late at night reviewing footage, subdued and comfortable, minimal arrangement",
          "Chill lo-fi instrumental, muted drums with brushes, warm keys and soft bass, subtle jazz harmony, 80 BPM, study music vibe, pleasant at low volume for hours, minimal variation, smooth and unobtrusive",
        ][v],
        durationMs: 160000,
      }),
  },
  {
    id: "music-matchday",
    category: "music",
    subdir: "music",
    filename: "matchday",
    variants: 3,
    generate: (key, v) =>
      generateMusic(key, {
        prompt: [
          "Tense building electronic soundtrack, pulsing synth bass with restrained percussion, string stabs, Champions League broadcast pre-match feeling, 110 BPM, building anticipation, not overwhelming, cinematic sports tension",
          "Dramatic building sports soundtrack, deep pulsing bass with tight percussion, synth strings creating tension, football match atmosphere, 105 BPM, anticipation and focus, cinematic and driven",
          "Intense atmospheric electronic piece, driving pulse with building layers, dramatic strings over minimal beat, football match tension, 115 BPM, concentration under pressure, escalating energy",
        ][v],
        durationMs: 130000,
      }),
  },
  {
    id: "music-season-end",
    category: "music",
    subdir: "music",
    filename: "season-end",
    variants: 3,
    generate: (key, v) =>
      generateMusic(key, {
        prompt: [
          "Reflective bittersweet solo piano with gradual orchestral string swell joining midway, emotional and proud, looking back at memories, 65 BPM, memorable 4-bar melody, cinematic end credits feeling, key change lift in second half",
          "Emotional reflective piano piece, starts solo then strings slowly join, nostalgic and proud, end of a journey, 70 BPM, beautiful melody, bittersweet, orchestral swell in final third, cinematic",
          "Poignant solo piano melody building to full orchestral arrangement, reflective and deeply emotional, looking back on a career, 60 BPM, memorable theme, strings and woodwinds gradually entering, triumphant yet wistful",
        ][v],
        durationMs: 100000,
      }),
  },
  {
    id: "music-tension",
    category: "music",
    subdir: "music",
    filename: "tension",
    variants: 3,
    generate: (key, v) =>
      generateMusic(key, {
        prompt: [
          "Tense suspenseful underscore, sustained low string drone, sparse anxious piano notes, subtle dark pulse, unresolved harmony, dramatic narrative moment, no melody, pure tension and uncertainty, 70 BPM",
          "Dark atmospheric tension music, deep cello drone with scattered dissonant piano notes, anxious and unresolved, suspenseful narrative moment, minimal and unsettling, 65 BPM",
          "Suspenseful ambient drone, low strings creating unease, occasional sparse piano, building dread, dramatic turning point in a story, no resolution, pure tension, 75 BPM",
        ][v],
        durationMs: 70000,
      }),
  },
];

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    category: "all",
    only: null,
    skipExisting: false,
    dryRun: false,
    variantsOverride: null,
  };

  for (const arg of args) {
    if (arg.startsWith("--category=")) opts.category = arg.split("=")[1];
    else if (arg.startsWith("--only=")) opts.only = arg.split("=")[1].split(",");
    else if (arg === "--skip-existing") opts.skipExisting = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--variants=")) opts.variantsOverride = parseInt(arg.split("=")[1], 10);
    else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: node scripts/generate-audio.mjs [options]

Options:
  --category=sfx|ambience|music|all   Generate specific category (default: all)
  --only=id1,id2                       Generate only specific asset IDs
  --skip-existing                      Skip files that already exist
  --dry-run                            Print what would be generated
  --variants=N                         Override variant count for all assets
`);
      process.exit(0);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const apiKey = opts.dryRun ? "DRY_RUN" : loadApiKey();

  // Filter assets
  let assets = ASSETS;
  if (opts.category !== "all") {
    assets = assets.filter((a) => a.category === opts.category);
  }
  if (opts.only) {
    assets = assets.filter((a) => opts.only.includes(a.id));
  }

  // Calculate total generations
  let totalGenerations = 0;
  const plan = [];

  for (const asset of assets) {
    const variants = opts.variantsOverride ?? asset.variants;
    for (let v = 0; v < variants; v++) {
      const suffix = variants === 1 ? "" : `_${v + 1}`;
      const filename = `${asset.filename}${suffix}.mp3`;
      const outDir = path.join(PUBLIC_AUDIO, asset.subdir);
      const outPath = path.join(outDir, filename);

      if (opts.skipExisting && fs.existsSync(outPath)) {
        continue;
      }

      plan.push({ asset, variant: v, filename, outDir, outPath });
      totalGenerations++;
    }
  }

  console.log(`\nTalentScout Audio Generator`);
  console.log(`===========================`);
  console.log(`Assets:      ${assets.length}`);
  console.log(`Generations: ${totalGenerations}`);
  console.log(`Category:    ${opts.category}`);
  if (opts.skipExisting) console.log(`Skipping:    existing files`);
  console.log();

  if (opts.dryRun) {
    console.log("DRY RUN — would generate:\n");
    for (const item of plan) {
      console.log(`  ${item.asset.category.padEnd(9)} ${item.asset.id.padEnd(20)} → ${item.filename}`);
    }
    console.log(`\nTotal: ${totalGenerations} files`);
    return;
  }

  if (totalGenerations === 0) {
    console.log("Nothing to generate. All files exist or no matching assets.");
    return;
  }

  // Generate sequentially to respect rate limits
  let completed = 0;
  let failed = 0;
  const errors = [];

  for (const item of plan) {
    const { asset, variant, filename, outDir, outPath } = item;

    // Ensure directory exists
    fs.mkdirSync(outDir, { recursive: true });

    const progress = `[${completed + failed + 1}/${totalGenerations}]`;
    process.stdout.write(`${progress} ${asset.category}/${filename}...`);

    try {
      const buffer = await runWithRetry(() => asset.generate(apiKey, variant));
      fs.writeFileSync(outPath, buffer);
      const sizeKB = (buffer.length / 1024).toFixed(1);
      console.log(` ✓ (${sizeKB} KB)`);
      completed++;
    } catch (err) {
      console.log(` ✗ ${err.message}`);
      errors.push({ id: asset.id, variant, error: err.message });
      failed++;
    }

    // Small delay between requests to be polite to the API
    await sleep(1500);
  }

  console.log(`\n===========================`);
  console.log(`Completed: ${completed}/${totalGenerations}`);
  if (failed > 0) {
    console.log(`Failed:    ${failed}`);
    console.log(`\nFailed items:`);
    for (const e of errors) {
      console.log(`  ${e.id} (variant ${e.variant}): ${e.error}`);
    }
  }
  console.log();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
