#!/usr/bin/env node

/**
 * TalentScout Music Track Generator
 *
 * Generates 10 thematic vocal tracks using the ElevenLabs Music API
 * with structured composition plans (lyrics, sections, style directives).
 *
 * Run: node scripts/generate-music.mjs
 *
 * Requires ELEVENLABS_API_KEY in .env.local
 *
 * Options:
 *   --only=id1,id2      Generate only specific track IDs
 *   --skip-existing      Skip tracks whose files already exist
 *   --dry-run            Print what would be generated without calling API
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MUSIC_DIR = path.join(ROOT, "public", "audio", "music");

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
// API helper
// ---------------------------------------------------------------------------

const MUSIC_URL = "https://api.elevenlabs.io/v1/music";

async function generateTrack(apiKey, compositionPlan) {
  const body = {
    model_id: "music_v1",
    composition_plan: compositionPlan,
    respect_sections_durations: false,
  };

  const res = await fetch(`${MUSIC_URL}?output_format=mp3_44100_128`, {
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
// Retry / rate-limit helper
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runWithRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.message.includes("429") && attempt < maxRetries) {
        const wait = attempt * 30000;
        console.log(`  Rate limited — waiting ${wait / 1000}s before retry ${attempt + 1}/${maxRetries}...`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Track definitions — 10 thematic vocal songs
// ---------------------------------------------------------------------------

const TRACKS = [
  // =========================================================================
  // 1. TITLE ANTHEM — Main Menu
  // =========================================================================
  {
    id: "title-anthem",
    description: "Main menu — cinematic indie rock anthem, 125 BPM",
    plan: {
      positive_global_styles: [
        "cinematic indie rock", "anthemic", "arena-ready indie rock with orchestral swells and powerful vocal hooks",
        "big drums", "swelling strings", "emotional and epic", "125 BPM",
        "male vocalist", "powerful and earnest",
      ],
      negative_global_styles: [
        "harsh noise", "death metal", "screaming", "lo-fi recording quality",
        "midi sounds", "cheesy", "generic stock music",
      ],
      sections: [
        {
          section_name: "Intro",
          positive_local_styles: ["building orchestral", "atmospheric", "cinematic swell"],
          negative_local_styles: ["vocals", "lyrics"],
          duration_ms: 15000,
          lines: ["[instrumental intro building with orchestral swell]"],
        },
        {
          section_name: "Verse 1",
          positive_local_styles: ["melodic", "storytelling", "restrained energy"],
          negative_local_styles: ["full band blast", "screaming"],
          duration_ms: 38000,
          lines: [
            "Empty grounds on a Tuesday morning",
            "Notebook open, coffee going cold",
            "Every player tells a different story",
            "Every match reveals what can't be told",
            "I've been watching from the touchline shadows",
            "Learning things that numbers never show",
            "There's a kid out here nobody's seen yet",
            "And I'm the one who's going to let them know",
          ],
        },
        {
          section_name: "Chorus",
          positive_local_styles: ["anthemic", "powerful", "big hook", "stadium singalong"],
          negative_local_styles: ["quiet", "whispered"],
          duration_ms: 30000,
          lines: [
            "This is where it starts",
            "In the mud and the rain and the dark",
            "Finding gold where nobody looks",
            "This is where it starts",
            "Before the headlines and the spotlight marks",
            "I saw it first",
            "I saw it first",
          ],
        },
        {
          section_name: "Verse 2",
          positive_local_styles: ["confident", "building energy", "melodic"],
          negative_local_styles: ["dropping energy"],
          duration_ms: 28000,
          lines: [
            "From the non-league grounds to San Siro",
            "Every step was earned not handed down",
            "Built a reputation observation by observation",
            "Turned the eye for talent to a crown",
          ],
        },
        {
          section_name: "Chorus 2",
          positive_local_styles: ["anthemic", "powerful", "bigger than first chorus"],
          negative_local_styles: ["quiet"],
          duration_ms: 30000,
          lines: [
            "This is where it starts",
            "In the mud and the rain and the dark",
            "Finding gold where nobody looks",
            "This is where it starts",
            "Before the headlines and the spotlight marks",
            "I saw it first",
            "I saw it first",
          ],
        },
        {
          section_name: "Bridge",
          positive_local_styles: ["emotional build", "dynamic shift", "big swell"],
          negative_local_styles: ["calm", "static"],
          duration_ms: 25000,
          lines: [
            "They'll say it was luck",
            "They'll say anyone could see",
            "But I was there at sixteen",
            "When no one else believed",
          ],
        },
        {
          section_name: "Final Chorus",
          positive_local_styles: ["full band", "maximum energy", "triumphant", "all instruments"],
          negative_local_styles: ["quiet", "stripped back"],
          duration_ms: 30000,
          lines: [
            "This is where it starts",
            "In the mud and the rain and the dark",
            "Finding gold where nobody looks",
            "This is where it starts",
            "Before the headlines and the spotlight marks",
            "I saw it first",
            "I saw it first",
          ],
        },
        {
          section_name: "Outro",
          positive_local_styles: ["fading", "resolving", "cinematic"],
          negative_local_styles: ["abrupt ending"],
          duration_ms: 14000,
          lines: ["[instrumental fade with strings and drums resolving]"],
        },
      ],
    },
  },

  // =========================================================================
  // 2. CAREER HUB — Dashboard / Calendar / Inbox
  // =========================================================================
  {
    id: "career-hub",
    description: "Dashboard — hip hop boom bap, 93 BPM",
    plan: {
      positive_global_styles: [
        "modern hip hop", "boom bap meets trap hi-hats", "confident swagger",
        "intelligent and smooth hip hop flow with cinematic undertones", "93 BPM",
        "male rapper", "smooth and intelligent", "cinematic beat underneath",
      ],
      negative_global_styles: [
        "aggressive", "mumble rap", "death metal", "screaming",
        "lo-fi recording quality", "midi sounds",
      ],
      sections: [
        {
          section_name: "Intro",
          positive_local_styles: ["atmospheric beat drop", "cinematic"],
          negative_local_styles: ["full vocals"],
          duration_ms: 10000,
          lines: ["Yeah... let's get to work"],
        },
        {
          section_name: "Verse 1",
          positive_local_styles: ["rhythmic flow", "storytelling rap", "confident delivery"],
          negative_local_styles: ["singing", "yelling"],
          duration_ms: 48000,
          lines: [
            "Monday morning and I'm mapping out the week",
            "Seven slots to fill and there's no time to sleep",
            "Got a youth game Tuesday out in Hertfordshire",
            "Heard about a winger that nobody knows is here",
            "Wednesday I'm meeting with a contact at the club",
            "Thursday video analysis back at the hub",
            "Friday's for the report, got to get the wording right",
            "Saturday I'm watching three matches through the night",
          ],
        },
        {
          section_name: "Chorus",
          positive_local_styles: ["melodic hook", "anthemic", "catchy"],
          negative_local_styles: ["monotone"],
          duration_ms: 35000,
          lines: [
            "Every day is a decision",
            "Every hour is a move",
            "Building something from nothing",
            "Brick by brick proving what I can do",
            "They don't see the hours behind the scenes",
            "Every name in my book was a moment I believed",
            "This is the work",
            "This is the work",
          ],
        },
        {
          section_name: "Verse 2",
          positive_local_styles: ["confident flow", "building intensity", "storytelling"],
          negative_local_styles: ["dropping energy"],
          duration_ms: 48000,
          lines: [
            "Started freelance with a car and a camera",
            "Now I'm getting calls from directors in the Premier",
            "Built my network contact by contact",
            "Relationship by relationship",
            "Turned my eye into a business this is more than just a gift",
            "Data on the screen but I validate it live",
            "Numbers tell you what happened, watching tells you why",
            "My rival's cutting corners rushing every single call",
            "I take the time I need because the right call beats them all",
          ],
        },
        {
          section_name: "Chorus 2",
          positive_local_styles: ["melodic hook", "anthemic", "bigger energy"],
          negative_local_styles: ["monotone"],
          duration_ms: 35000,
          lines: [
            "Every day is a decision",
            "Every hour is a move",
            "Building something from nothing",
            "Brick by brick proving what I can do",
            "They don't see the hours behind the scenes",
            "Every name in my book was a moment I believed",
            "This is the work",
            "This is the work",
          ],
        },
        {
          section_name: "Outro",
          positive_local_styles: ["fading", "reflective", "beat continues"],
          negative_local_styles: ["abrupt ending"],
          duration_ms: 24000,
          lines: [
            "This is the work... yeah",
            "Every week... every call",
            "This is the work",
          ],
        },
      ],
    },
  },

  // =========================================================================
  // 3. OBSERVATION — Match Screen
  // =========================================================================
  {
    id: "observation",
    description: "Match screen — driving indie rock, 120 BPM",
    plan: {
      positive_global_styles: [
        "indie rock", "propulsive British indie rock with urgent driving guitars and energetic drums",
        "propulsive and urgent", "driving rhythm guitar", "strong drumming", "male vocalist",
        "slightly breathless energy", "120 BPM", "feels like something is about to happen",
      ],
      negative_global_styles: [
        "slow", "ballad", "acoustic only", "death metal",
        "lo-fi recording quality", "midi sounds",
      ],
      sections: [
        {
          section_name: "Intro",
          positive_local_styles: ["building guitar riff", "anticipation", "driving rhythm"],
          negative_local_styles: ["vocals"],
          duration_ms: 10000,
          lines: ["[driving guitar riff building with drums]"],
        },
        {
          section_name: "Verse 1",
          positive_local_styles: ["urgent storytelling", "slightly breathless", "rhythmic"],
          negative_local_styles: ["relaxed", "laid back"],
          duration_ms: 42000,
          lines: [
            "Forty-seventh minute, notepad on my knee",
            "Watching number seven like he doesn't know I'm here",
            "Third time he's dropped into that pocket of space",
            "Third time the midfielder's ignored him again",
            "But I see it",
            "I see the run before he makes it",
            "I see the player underneath the player",
            "That nobody else is watching today",
          ],
        },
        {
          section_name: "Chorus",
          positive_local_styles: ["powerful hook", "driving energy", "anthemic"],
          negative_local_styles: ["quiet", "whispered"],
          duration_ms: 30000,
          lines: [
            "Every touch tells me something",
            "Every movement a word",
            "I'm reading the language",
            "That the cameras never heard",
            "You can have your statistics",
            "Your heat maps and your charts",
            "I'm here in the cold and the rain",
            "Reading hearts",
          ],
        },
        {
          section_name: "Verse 2",
          positive_local_styles: ["detailed observation", "building conviction", "urgent"],
          negative_local_styles: ["calm"],
          duration_ms: 42000,
          lines: [
            "Left side's stronger but he hides it professionally",
            "Composure under pressure, that's the hardest thing to teach",
            "Saw him get fouled hard in the thirty-second minute",
            "Didn't react, just got up, picked the ball and kept going",
            "That's character",
            "That's the thing you can't manufacture",
            "The data won't show you what I just saw",
            "Three seconds told me more than thirty matches in a database",
          ],
        },
        {
          section_name: "Chorus 2",
          positive_local_styles: ["powerful", "driving", "bigger energy"],
          negative_local_styles: ["quiet"],
          duration_ms: 30000,
          lines: [
            "Every touch tells me something",
            "Every movement a word",
            "I'm reading the language",
            "That the cameras never heard",
            "You can have your statistics",
            "Your heat maps and your charts",
            "I'm here in the cold and the rain",
            "Reading hearts",
          ],
        },
        {
          section_name: "Bridge",
          positive_local_styles: ["building tension", "anticipation", "dynamic shift"],
          negative_local_styles: ["static"],
          duration_ms: 22000,
          lines: [
            "Phase by phase it builds",
            "The picture getting clearer",
            "One more session and I'll know",
            "One more session and I'll stake my name on this",
          ],
        },
        {
          section_name: "Final Chorus",
          positive_local_styles: ["climactic", "full band", "maximum drive"],
          negative_local_styles: ["fading", "quiet"],
          duration_ms: 28000,
          lines: [
            "Every touch tells me something",
            "Every movement a word",
            "I'm reading the language",
            "That the cameras never heard",
            "I'm here in the cold and the rain",
            "Reading hearts",
          ],
        },
        {
          section_name: "Outro",
          positive_local_styles: ["resolving guitar riff", "fading energy"],
          negative_local_styles: ["abrupt"],
          duration_ms: 10000,
          lines: ["[guitar riff fading with drums]"],
        },
      ],
    },
  },

  // =========================================================================
  // 4. REPORT WRITING — Report Writer / History / Analytics
  // =========================================================================
  {
    id: "report-writing",
    description: "Report writing — neo soul R&B lo-fi, 78 BPM",
    plan: {
      positive_global_styles: [
        "neo soul R&B", "mellow energy blending smooth, soulful vocals with introspective lyricism",
        "soft female or androgynous vocalist", "introspective and warm", "78 BPM",
        "late night feel", "Rhodes piano prominent", "brushed drums",
        "emotional but calm",
      ],
      negative_global_styles: [
        "upbeat party", "aggressive", "heavy rock", "harsh",
        "lo-fi recording quality", "midi sounds",
      ],
      sections: [
        {
          section_name: "Intro",
          positive_local_styles: ["Rhodes piano", "atmospheric", "late night"],
          negative_local_styles: ["loud", "drums"],
          duration_ms: 10000,
          lines: ["[Rhodes piano intro, soft and warm]"],
        },
        {
          section_name: "Verse 1",
          positive_local_styles: ["intimate", "storytelling", "soft vocals", "confessional"],
          negative_local_styles: ["belting", "loud"],
          duration_ms: 45000,
          lines: [
            "It's midnight and I'm choosing every word",
            "Because my reputation lives in what gets heard",
            "Note or recommend or do I pound the table",
            "Is my conviction strong enough or am I just enabling",
            "Doubt",
            "Three sessions wasn't enough I know it",
            "But my rival's going to move and I'm going to blow it",
            "So here I am at midnight writing carefully",
            "Staking something real on what I think I see",
          ],
        },
        {
          section_name: "Chorus",
          positive_local_styles: ["warm hook", "emotional", "soulful", "slightly bigger"],
          negative_local_styles: ["screaming", "aggressive"],
          duration_ms: 30000,
          lines: [
            "This is my word on the line",
            "Every syllable mine",
            "I could play it safe and say maybe",
            "Or I could trust what I know",
            "Let the confidence show",
            "Strong recommend",
            "And sign my name to it baby",
          ],
        },
        {
          section_name: "Verse 2",
          positive_local_styles: ["detailed", "introspective", "building slightly"],
          negative_local_styles: ["dropping energy completely"],
          duration_ms: 48000,
          lines: [
            "Four stars potential with a question mark on mental",
            "The hidden attributes are where it gets sentimental",
            "His agent said he's professional but agents always say that",
            "The academy coach implied there's something more",
            "Behind that",
            "I noted it, I can't prove it but I noted it",
            "There's a flag in my gut and I've learned to follow",
            "This feeling before",
            "Six hits from six when I trusted this",
            "Let's go seven",
          ],
        },
        {
          section_name: "Chorus 2",
          positive_local_styles: ["warm", "emotional", "soulful", "confident"],
          negative_local_styles: ["screaming"],
          duration_ms: 30000,
          lines: [
            "This is my word on the line",
            "Every syllable mine",
            "I could play it safe and say maybe",
            "Or I could trust what I know",
            "Let the confidence show",
            "Strong recommend",
            "And sign my name to it baby",
          ],
        },
        {
          section_name: "Outro",
          positive_local_styles: ["soft", "fading", "intimate", "resolving"],
          negative_local_styles: ["building", "loud"],
          duration_ms: 22000,
          lines: [
            "Strong recommend",
            "I saw something real",
            "Strong recommend",
            "This is how careers are built",
          ],
        },
      ],
    },
  },

  // =========================================================================
  // 5. AGENCY THEME — Agency / Finances / Equipment
  // =========================================================================
  {
    id: "agency-theme",
    description: "Agency/finances — UK pop urban, 112 BPM",
    plan: {
      positive_global_styles: [
        "UK pop with urban influence", "energetic and smooth vocal delivery combining contemporary pop and R&B vibes",
        "polished and confident", "upbeat and aspirational", "112 BPM",
        "modern and clean production", "hit record energy",
      ],
      negative_global_styles: [
        "acoustic folk", "death metal", "sad ballad",
        "lo-fi recording quality", "midi sounds", "cheesy",
      ],
      sections: [
        {
          section_name: "Intro",
          positive_local_styles: ["polished beat drop", "modern", "confident"],
          negative_local_styles: ["acoustic", "sparse"],
          duration_ms: 10000,
          lines: ["[polished modern beat intro]"],
        },
        {
          section_name: "Verse 1",
          positive_local_styles: ["confident delivery", "rhythmic", "aspirational"],
          negative_local_styles: ["melancholy", "slow"],
          duration_ms: 35000,
          lines: [
            "Started with a laptop and a contact in my phone",
            "First retainer contract and a tiny office loan",
            "Three clubs on my books now and a roster of scouts",
            "Built the whole thing from a reputation and a doubt",
            "That I could make it independent make it on my own",
            "Every club that doubted me is calling my phone",
          ],
        },
        {
          section_name: "Pre-Chorus",
          positive_local_styles: ["building anticipation", "rhythmic escalation"],
          negative_local_styles: ["dropping energy"],
          duration_ms: 12000,
          lines: [
            "It wasn't given",
            "It was built",
            "Every handshake every deal",
            "Every late night every thrill",
          ],
        },
        {
          section_name: "Chorus",
          positive_local_styles: ["massive hook", "anthemic", "pop chorus", "sing-along"],
          negative_local_styles: ["quiet", "mumbled"],
          duration_ms: 32000,
          lines: [
            "This is my agency",
            "This is what I built from nothing",
            "Nobody handed me the keys",
            "I earned every meeting every club every fee",
            "This is my agency",
            "And we're only getting started",
            "Watch the name get bigger",
            "Watch the dream get sharper",
            "This is mine",
          ],
        },
        {
          section_name: "Verse 2",
          positive_local_styles: ["confident", "building", "business swagger"],
          negative_local_styles: ["uncertain"],
          duration_ms: 35000,
          lines: [
            "Signed a sporting director in the summer window",
            "Now the bigger clubs are knocking and I'm letting them in slow",
            "Marketplace report sold to four clubs in a week",
            "The data package consulting now is reaching its peak",
            "Hiring junior scouts expanding to the continent",
            "Building something serious something permanent",
          ],
        },
        {
          section_name: "Pre-Chorus 2",
          positive_local_styles: ["building", "rhythmic"],
          negative_local_styles: ["dropping"],
          duration_ms: 12000,
          lines: [
            "It wasn't given",
            "It was built",
            "Every handshake every deal",
            "Every late night every thrill",
          ],
        },
        {
          section_name: "Chorus 2",
          positive_local_styles: ["massive hook", "bigger than first chorus"],
          negative_local_styles: ["quiet"],
          duration_ms: 32000,
          lines: [
            "This is my agency",
            "This is what I built from nothing",
            "Nobody handed me the keys",
            "I earned every meeting every club every fee",
            "This is my agency",
            "And we're only getting started",
            "Watch the name get bigger",
            "Watch the dream get sharper",
            "This is mine",
          ],
        },
        {
          section_name: "Bridge",
          positive_local_styles: ["dynamic shift", "reflective then building"],
          negative_local_styles: ["static"],
          duration_ms: 22000,
          lines: [
            "From freelance to a full operation",
            "Every contact every conversation",
            "Paid off",
            "Paid off",
            "This is what the long game looks like",
            "Paid off",
          ],
        },
        {
          section_name: "Outro",
          positive_local_styles: ["triumphant fade", "resolving"],
          negative_local_styles: ["abrupt"],
          duration_ms: 12000,
          lines: ["[beat resolving with confidence]"],
        },
      ],
    },
  },

  // =========================================================================
  // 6. YOUTH SCOUTING — Youth Hub / Alumni
  // =========================================================================
  {
    id: "youth-scouting",
    description: "Youth scouting — indie folk pop, 95 BPM",
    plan: {
      positive_global_styles: [
        "indie folk pop", "early 2010s folk revival style with energetic acoustic instrumentation and heartfelt vocals",
        "warm and earnest", "male vocalist with slight rasp", "acoustic led",
        "emotionally genuine", "95 BPM", "hand claps and stomps",
        "feels like community and possibility",
      ],
      negative_global_styles: [
        "electronic", "heavy distortion", "aggressive",
        "lo-fi recording quality", "midi sounds", "saccharine",
      ],
      sections: [
        {
          section_name: "Verse 1",
          positive_local_styles: ["acoustic guitar", "warm", "storytelling", "intimate"],
          negative_local_styles: ["loud", "electric"],
          duration_ms: 42000,
          lines: [
            "Muddy pitch on a Saturday morning",
            "Parents on the touchline keeping warm",
            "There's a kid out here who doesn't know it yet",
            "But I've been watching for an hour and I'm certain in my bones",
            "Sixteen years old with something different",
            "The way he scans before he gets the ball",
            "The coaches here are good but they can't see it",
            "The ceiling on this kid I can't define at all",
          ],
        },
        {
          section_name: "Chorus",
          positive_local_styles: ["full folk band", "hand claps", "warm hook", "emotional"],
          negative_local_styles: ["quiet", "sparse"],
          duration_ms: 35000,
          lines: [
            "I'm going to tell them about you",
            "I'm going to make the call",
            "I'm going to put my name beside your name",
            "And back you down the hall",
            "You don't know me yet but that's okay",
            "Give it three more years",
            "I'll be watching from the stands",
            "When the crowd is on its feet",
            "Remembering this field",
          ],
        },
        {
          section_name: "Verse 2",
          positive_local_styles: ["storytelling", "building gently", "warm"],
          negative_local_styles: ["aggressive"],
          duration_ms: 38000,
          lines: [
            "Wrote the placement report on a Tuesday",
            "Third club showed genuine interest by the week",
            "Recommended for a trial the following Friday",
            "Signed at seventeen by the following spring",
            "I filed it and forgot it the way you have to",
            "Forty players in the pipeline at a time",
            "But eighteen months later came a notification",
            "Alumni milestone first professional game first time",
          ],
        },
        {
          section_name: "Chorus 2",
          positive_local_styles: ["bigger folk arrangement", "hand claps", "stomps"],
          negative_local_styles: ["sparse"],
          duration_ms: 35000,
          lines: [
            "I'm going to tell them about you",
            "I'm going to make the call",
            "I'm going to put my name beside your name",
            "And back you down the hall",
            "You don't know me yet but that's okay",
            "Give it three more years",
            "I'll be watching from the stands",
            "When the crowd is on its feet",
            "Remembering this field",
          ],
        },
        {
          section_name: "Bridge",
          positive_local_styles: ["stripped back", "just acoustic guitar and voice", "intimate"],
          negative_local_styles: ["full band", "loud"],
          duration_ms: 22000,
          lines: [
            "This is why I do it",
            "Not the salary not the title",
            "This is the moment",
            "A muddy pitch and a feeling",
            "That changed everything",
          ],
        },
        {
          section_name: "Final Chorus",
          positive_local_styles: ["full band", "emotional climax", "all instruments"],
          negative_local_styles: ["stripped back"],
          duration_ms: 32000,
          lines: [
            "I'm going to tell them about you",
            "I'm going to make the call",
            "I'm going to put my name beside your name",
            "And back you down the hall",
            "You don't know me yet but that's okay",
            "I'll be watching from the stands",
            "Remembering this field",
          ],
        },
        {
          section_name: "Outro",
          positive_local_styles: ["acoustic fading", "warm resolution"],
          negative_local_styles: ["abrupt"],
          duration_ms: 12000,
          lines: ["[acoustic guitar fading warmly]"],
        },
      ],
    },
  },

  // =========================================================================
  // 7. TRANSFER PRESSURE — Fixture Browser / Tension
  // =========================================================================
  {
    id: "transfer-pressure",
    description: "Fixtures/tension — alt rock electronic, 128 BPM",
    plan: {
      positive_global_styles: [
        "alt rock with electronic elements", "intense alternative rock fused with electronic production elements",
        "urgent and propulsive", "male vocalist with intensity", "128 BPM",
        "tension is the whole point", "big dynamic drop into chorus",
        "clock is ticking energy",
      ],
      negative_global_styles: [
        "relaxed", "acoustic folk", "ballad", "peaceful",
        "lo-fi recording quality", "midi sounds",
      ],
      sections: [
        {
          section_name: "Intro",
          positive_local_styles: ["tense electronic build", "ticking rhythm", "urgent"],
          negative_local_styles: ["calm", "peaceful"],
          duration_ms: 10000,
          lines: ["[tense electronic build with ticking percussion]"],
        },
        {
          section_name: "Verse 1",
          positive_local_styles: ["urgent delivery", "tension building", "rhythmic"],
          negative_local_styles: ["relaxed", "calm"],
          duration_ms: 38000,
          lines: [
            "Forty eight hours and the window closes",
            "Three positions the manager needs filled",
            "I've got seven reports half finished sitting",
            "And a rival who filed on the same shortlist",
            "Two clubs have bid on the winger I flagged up",
            "The director wants answers by tonight",
            "My confidence interval is still too wide",
            "But there's no time left to get it right",
          ],
        },
        {
          section_name: "Pre-Chorus",
          positive_local_styles: ["building tension", "escalating", "anticipation"],
          negative_local_styles: ["resolving", "calm"],
          duration_ms: 15000,
          lines: [
            "Do I wait or do I move",
            "Do I trust the four sessions or lose",
            "The window to a scout who pulled the trigger",
            "Before the evidence was bigger",
          ],
        },
        {
          section_name: "Chorus",
          positive_local_styles: ["massive drop", "explosive", "anthemic", "urgent chorus"],
          negative_local_styles: ["quiet", "gentle"],
          duration_ms: 30000,
          lines: [
            "This is the pressure this is the moment",
            "When the work becomes the gamble",
            "When the deadline makes you honest",
            "Table pound or stay silent",
            "This is the call that defines you",
            "Transfer window closing",
            "What do you do",
            "What do you do",
          ],
        },
        {
          section_name: "Verse 2",
          positive_local_styles: ["driving urgency", "intense storytelling"],
          negative_local_styles: ["relaxed"],
          duration_ms: 38000,
          lines: [
            "Phone is ringing it's the sporting director",
            "Wants my top three priorities ranked",
            "I've got one certain two possibles",
            "And a hunch that I haven't banked",
            "The methodical scout waits for certainty",
            "The great ones know when certainty's a lie",
            "Forty seven hours and the window's closing",
            "Time to bet on what I know and why",
          ],
        },
        {
          section_name: "Pre-Chorus 2",
          positive_local_styles: ["building", "escalating"],
          negative_local_styles: ["calm"],
          duration_ms: 15000,
          lines: [
            "Do I wait or do I move",
            "Do I trust the four sessions or lose",
            "The window to a scout who pulled the trigger",
            "Before the evidence was bigger",
          ],
        },
        {
          section_name: "Chorus 2",
          positive_local_styles: ["massive", "explosive", "urgent"],
          negative_local_styles: ["quiet"],
          duration_ms: 30000,
          lines: [
            "This is the pressure this is the moment",
            "When the work becomes the gamble",
            "When the deadline makes you honest",
            "Table pound or stay silent",
            "This is the call that defines you",
            "Transfer window closing",
            "What do you do",
            "What do you do",
          ],
        },
        {
          section_name: "Bridge",
          positive_local_styles: ["urgent build", "spoken intensity", "ticking clock"],
          negative_local_styles: ["calm resolution"],
          duration_ms: 18000,
          lines: [
            "File the report",
            "Make the call",
            "Back yourself or back down",
            "Back yourself or back down",
            "The window closes in forty hours",
          ],
        },
        {
          section_name: "Outro",
          positive_local_styles: ["tension resolving", "fading urgency"],
          negative_local_styles: ["building"],
          duration_ms: 10000,
          lines: ["[electronic tension fading with final drum hits]"],
        },
      ],
    },
  },

  // =========================================================================
  // 8. NETWORK GROOVE — Network / Contacts
  // =========================================================================
  {
    id: "network-groove",
    description: "Network — neo soul acid jazz, 100 BPM",
    plan: {
      positive_global_styles: [
        "neo soul meets acid jazz", "smooth and sophisticated",
        "soulful and funky with a blend of vintage and modern influences",
        "warm and charismatic", "female vocalist preferred", "confident and knowing",
        "100 BPM", "groove is everything", "wah guitar", "jazz chords",
        "feels like you own every room",
      ],
      negative_global_styles: [
        "heavy rock", "aggressive", "punk", "harsh",
        "lo-fi recording quality", "midi sounds",
      ],
      sections: [
        {
          section_name: "Intro",
          positive_local_styles: ["groove bass line", "wah guitar", "jazzy"],
          negative_local_styles: ["harsh", "abrupt"],
          duration_ms: 12000,
          lines: ["[smooth groove intro with wah guitar and bass]"],
        },
        {
          section_name: "Verse 1",
          positive_local_styles: ["smooth delivery", "confident", "storytelling groove"],
          negative_local_styles: ["rushed", "aggressive"],
          duration_ms: 42000,
          lines: [
            "Every name in this book is a conversation",
            "A coffee a favour a trust built over time",
            "The agent who tipped me on the Lisbon midfielder",
            "The academy coach who called me first in line",
            "Information moves through people not through systems",
            "The real intel lives behind closed doors",
            "You can run your algorithms all you like",
            "But the network is the edge that opens floors",
          ],
        },
        {
          section_name: "Chorus",
          positive_local_styles: ["groovy hook", "warm", "soulful", "confident"],
          negative_local_styles: ["monotone", "flat"],
          duration_ms: 35000,
          lines: [
            "It's who you know and how you know them",
            "How long you've kept the relationship warm",
            "It's the call at midnight from the contact",
            "Who heard something before the storm",
            "I built this one handshake at a time",
            "Every dinner every flight",
            "The network is the difference",
            "Between average and the ones who get it right",
          ],
        },
        {
          section_name: "Verse 2",
          positive_local_styles: ["smooth", "confident", "building"],
          negative_local_styles: ["dropping energy"],
          duration_ms: 42000,
          lines: [
            "Reliability is everything in this business",
            "A contact who burns you once is never called again",
            "But the ones who've proved their intel over seasons",
            "Those relationships are worth more than a salary trend",
            "The journalist who knows the boardroom tensions",
            "The grassroots coach who sees the talent young",
            "The sporting director in a second division",
            "Who trusts me when I say I've found the one",
          ],
        },
        {
          section_name: "Chorus 2",
          positive_local_styles: ["groovy hook", "bigger arrangement"],
          negative_local_styles: ["flat"],
          duration_ms: 35000,
          lines: [
            "It's who you know and how you know them",
            "How long you've kept the relationship warm",
            "It's the call at midnight from the contact",
            "Who heard something before the storm",
            "I built this one handshake at a time",
            "Every dinner every flight",
            "The network is the difference",
            "Between average and the ones who get it right",
          ],
        },
        {
          section_name: "Bridge",
          positive_local_styles: ["groove breakdown", "bass focused", "rhythmic"],
          negative_local_styles: ["full vocals"],
          duration_ms: 22000,
          lines: [
            "Maintain it",
            "Don't neglect it",
            "A relationship decays without attention",
            "Maintain it",
            "Every contact is an asset",
            "Every asset needs investment",
          ],
        },
        {
          section_name: "Outro",
          positive_local_styles: ["groove fading", "jazzy resolution"],
          negative_local_styles: ["abrupt"],
          duration_ms: 14000,
          lines: ["[wah guitar and bass groove fading out]"],
        },
      ],
    },
  },

  // =========================================================================
  // 9. WONDERKID — Discoveries / Achievements
  // =========================================================================
  {
    id: "wonderkid",
    description: "Discoveries — euphoric pop rock, 127 BPM",
    plan: {
      positive_global_styles: [
        "anthemic pop rock", "euphoric and explosive",
        "energetic British indie rock fusion", "huge chorus", "male vocalist with real energy",
        "this is the payoff song", "127 BPM", "massive dynamic drop into chorus",
        "arms in the air moment", "production should feel enormous",
      ],
      negative_global_styles: [
        "quiet", "mellow", "acoustic only", "death metal",
        "lo-fi recording quality", "midi sounds",
      ],
      sections: [
        {
          section_name: "Intro",
          positive_local_styles: ["building anticipation", "guitar swell", "euphoric build"],
          negative_local_styles: ["full blast immediately"],
          duration_ms: 10000,
          lines: ["[building guitar and synth swell]"],
        },
        {
          section_name: "Verse 1",
          positive_local_styles: ["storytelling", "building energy", "conviction"],
          negative_local_styles: ["mellow", "laid back"],
          duration_ms: 35000,
          lines: [
            "Saw him first at a regional qualifier",
            "Sixteen years old in the pouring rain",
            "Technically perfect composure under pressure",
            "Potential ability I can barely explain",
            "Three sessions in I'm already convinced",
            "But I wanted one more before I stake my name",
            "Table pound",
            "This is the one",
            "This is the generational talent game",
          ],
        },
        {
          section_name: "Pre-Chorus",
          positive_local_styles: ["building euphoria", "anticipation", "swelling"],
          negative_local_styles: ["calm"],
          duration_ms: 18000,
          lines: [
            "Six months later he signs for the first team",
            "Eight months later he's starting every week",
            "A year from now his name is everywhere",
            "And I knew it",
            "Standing in the rain",
          ],
        },
        {
          section_name: "Chorus",
          positive_local_styles: ["massive drop", "euphoric", "arms in the air", "enormous"],
          negative_local_styles: ["quiet", "restrained"],
          duration_ms: 32000,
          lines: [
            "I found him",
            "I found him",
            "Before the cameras before the money before the name",
            "I found him",
            "In a non-league ground with mud on my trainers",
            "When he was no one and I staked my claim",
            "I found him",
            "And the world caught up eventually",
            "But I was there first",
            "I was there first",
            "I found him",
          ],
        },
        {
          section_name: "Verse 2",
          positive_local_styles: ["confident", "triumphant storytelling", "building"],
          negative_local_styles: ["uncertain"],
          duration_ms: 35000,
          lines: [
            "Discovery credit on the system logged forever",
            "The reputation points came flooding in for days",
            "But the real reward is something harder to articulate",
            "The vindication of the eye that never wavers",
            "Table pound paid off in full",
            "Six stars current and still growing",
            "The alumni notification came at midnight",
            "Your player just scored his Champions League goal",
          ],
        },
        {
          section_name: "Pre-Chorus 2",
          positive_local_styles: ["building", "euphoric anticipation"],
          negative_local_styles: ["dropping"],
          duration_ms: 18000,
          lines: [
            "This is why the cold touchlines matter",
            "This is why the long hours matter",
            "This is why the methodology matters",
            "This is why",
          ],
        },
        {
          section_name: "Final Chorus",
          positive_local_styles: ["maximum intensity", "euphoric", "every instrument", "enormous"],
          negative_local_styles: ["restrained"],
          duration_ms: 35000,
          lines: [
            "I found him",
            "I found him",
            "Before the cameras before the money before the name",
            "I found him",
            "In a non-league ground with mud on my trainers",
            "When he was no one and I staked my claim",
            "I found him",
            "But I was there first",
            "I was there first",
            "I found him",
          ],
        },
        {
          section_name: "Outro",
          positive_local_styles: ["euphoric fading", "triumphant resolution"],
          negative_local_styles: ["abrupt"],
          duration_ms: 15000,
          lines: [
            "Before anyone",
            "I was there",
            "I found him",
          ],
        },
      ],
    },
  },

  // =========================================================================
  // 10. SEASON REVIEW — Hall of Fame / Career
  // =========================================================================
  {
    id: "season-review",
    description: "Season review — post rock, 85 BPM",
    plan: {
      positive_global_styles: [
        "post rock with vocals", "atmospheric instrumental build-up with emotive indie rock vocals",
        "slow building", "emotionally honest and earned", "male vocalist",
        "slightly weathered tone", "reflective and proud not sad", "85 BPM",
        "starts sparse builds to enormous", "season montage song",
      ],
      negative_global_styles: [
        "upbeat party", "electronic dance", "aggressive", "harsh",
        "lo-fi recording quality", "midi sounds",
      ],
      sections: [
        {
          section_name: "Verse 1",
          positive_local_styles: ["sparse", "just guitar and voice", "intimate", "vulnerable"],
          negative_local_styles: ["loud", "full band", "drums"],
          duration_ms: 30000,
          lines: [
            "Three years ago I was filing reports",
            "That nobody read",
            "Building a reputation",
            "From nothing",
            "From a notebook and a car",
            "And a belief that the eye",
            "Doesn't lie",
          ],
        },
        {
          section_name: "Verse 2",
          positive_local_styles: ["drums entering slowly", "building gently", "warm"],
          negative_local_styles: ["full blast", "aggressive"],
          duration_ms: 32000,
          lines: [
            "Twenty contacts now who pick up when I call",
            "Forty alumni tracked across four countries",
            "Six table pounds and five of them were hits",
            "A career built on standards",
            "Not on luck",
          ],
        },
        {
          section_name: "Pre-Chorus",
          positive_local_styles: ["building momentum", "emotional swell", "strings entering"],
          negative_local_styles: ["static", "flat"],
          duration_ms: 25000,
          lines: [
            "You don't see the work",
            "You see the outcome",
            "You see the signing",
            "Not the touchline",
            "You see the player",
            "Not the scout who found him",
            "Three years ago in the rain",
          ],
        },
        {
          section_name: "Chorus",
          positive_local_styles: ["full band", "enormous", "triumphant", "strings", "all instruments"],
          negative_local_styles: ["sparse", "quiet"],
          duration_ms: 38000,
          lines: [
            "This is what it looks like",
            "When patience becomes something",
            "When the long game finally pays",
            "When every boring Tuesday",
            "Every cold November",
            "Every doubt becomes a season",
            "That you're proud of",
            "This is what it looks like",
            "From the other side",
          ],
        },
        {
          section_name: "Verse 3",
          positive_local_styles: ["pulling back", "sparse again", "reflective", "quiet"],
          negative_local_styles: ["loud", "full band"],
          duration_ms: 18000,
          lines: [
            "Next season starts on Monday",
            "New notebook",
            "Same eye",
            "Same belief",
          ],
        },
        {
          section_name: "Final Chorus",
          positive_local_styles: ["building again", "strings entering", "enormous climax", "post rock crescendo"],
          negative_local_styles: ["staying quiet"],
          duration_ms: 40000,
          lines: [
            "This is what it looks like",
            "When patience becomes something",
            "When the long game finally pays",
            "When every boring Tuesday",
            "Every cold November",
            "Every doubt becomes a season",
            "That you're proud of",
            "This is what it looks like",
            "From the other side",
          ],
        },
        {
          section_name: "Outro",
          positive_local_styles: ["just voice and piano", "fading", "intimate resolution", "emotional"],
          negative_local_styles: ["loud", "drums"],
          duration_ms: 25000,
          lines: [
            "I saw it first",
            "I always see it first",
            "That's the job",
            "That's everything",
          ],
        },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// CLI arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flags = {};
for (const arg of args) {
  if (arg.startsWith("--")) {
    const [key, val] = arg.slice(2).split("=");
    flags[key] = val ?? true;
  }
}

const onlyIds = flags.only ? flags.only.split(",") : null;
const skipExisting = !!flags["skip-existing"];
const dryRun = !!flags["dry-run"];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const apiKey = loadApiKey();
  fs.mkdirSync(MUSIC_DIR, { recursive: true });

  const tracksToGenerate = onlyIds
    ? TRACKS.filter((t) => onlyIds.includes(t.id))
    : TRACKS;

  console.log(`\n🎵 TalentScout Music Generator`);
  console.log(`   ${tracksToGenerate.length} tracks to generate\n`);

  let completed = 0;
  let skipped = 0;

  for (const track of tracksToGenerate) {
    const outPath = path.join(MUSIC_DIR, `${track.id}.mp3`);

    if (skipExisting && fs.existsSync(outPath)) {
      console.log(`⏭  [${track.id}] Already exists — skipping`);
      skipped++;
      continue;
    }

    if (dryRun) {
      const totalMs = track.plan.sections.reduce((s, sec) => s + sec.duration_ms, 0);
      console.log(`🔍 [${track.id}] Would generate: ${track.description} (${(totalMs / 1000).toFixed(0)}s)`);
      completed++;
      continue;
    }

    const totalMs = track.plan.sections.reduce((s, sec) => s + sec.duration_ms, 0);
    console.log(`🎶 [${completed + 1}/${tracksToGenerate.length}] Generating: ${track.id}`);
    console.log(`   ${track.description} — ${(totalMs / 1000).toFixed(0)}s total`);
    console.log(`   ${track.plan.sections.length} sections`);

    const start = Date.now();
    try {
      const buffer = await runWithRetry(() => generateTrack(apiKey, track.plan));
      fs.writeFileSync(outPath, buffer);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);
      console.log(`   ✅ Saved ${outPath} (${sizeMB} MB, ${elapsed}s)\n`);
      completed++;

      // Brief pause between tracks to avoid rate limits
      if (completed < tracksToGenerate.length) {
        console.log(`   ⏳ Waiting 5s before next track...\n`);
        await sleep(5000);
      }
    } catch (err) {
      console.error(`   ❌ FAILED: ${err.message}\n`);
      // Continue with remaining tracks
    }
  }

  console.log(`\n✨ Done! ${completed} generated, ${skipped} skipped.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
