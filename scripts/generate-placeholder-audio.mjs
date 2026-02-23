#!/usr/bin/env node
/**
 * Generate placeholder WAV audio files for TalentScout.
 *
 * Creates minimal synthesized audio so the audio system works out of the box.
 * Replace these with professionally produced audio before shipping.
 *
 * Usage: node scripts/generate-placeholder-audio.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const PUBLIC = join(import.meta.dirname, "..", "public", "audio");

// ---------------------------------------------------------------------------
// WAV helpers
// ---------------------------------------------------------------------------

/**
 * Create a WAV file buffer from raw 16-bit PCM samples.
 */
function createWav(samples, sampleRate = 44100) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const val = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(val * 32767), 44 + i * 2);
  }

  return buffer;
}

/**
 * Generate a sine wave tone.
 */
function sine(freq, durationSec, sampleRate = 44100, volume = 0.5) {
  const len = Math.floor(sampleRate * durationSec);
  const samples = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, Math.min(t * 20, (durationSec - t) * 20));
    samples[i] = Math.sin(2 * Math.PI * freq * t) * volume * envelope;
  }
  return samples;
}

/**
 * Generate white noise.
 */
function noise(durationSec, sampleRate = 44100, volume = 0.3) {
  const len = Math.floor(sampleRate * durationSec);
  const samples = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, Math.min(t * 5, (durationSec - t) * 5));
    samples[i] = (Math.random() * 2 - 1) * volume * envelope;
  }
  return samples;
}

/**
 * Mix multiple sample arrays together.
 */
function mix(...arrays) {
  const maxLen = Math.max(...arrays.map((a) => a.length));
  const result = new Float64Array(maxLen);
  for (const arr of arrays) {
    for (let i = 0; i < arr.length; i++) {
      result[i] += arr[i];
    }
  }
  return result;
}

/**
 * Concatenate sample arrays.
 */
function concat(...arrays) {
  const totalLen = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Float64Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Generate a simple ascending arpeggio.
 */
function arpeggio(freqs, noteDuration, sampleRate = 44100, volume = 0.4) {
  return concat(...freqs.map((f) => sine(f, noteDuration, sampleRate, volume)));
}

/**
 * Generate ambient drone with layered sine waves.
 */
function ambientDrone(durationSec, baseFreq = 110, sampleRate = 44100) {
  return mix(
    sine(baseFreq, durationSec, sampleRate, 0.15),
    sine(baseFreq * 1.5, durationSec, sampleRate, 0.08),
    sine(baseFreq * 2, durationSec, sampleRate, 0.05),
    sine(baseFreq * 3, durationSec, sampleRate, 0.03),
    noise(durationSec, sampleRate, 0.02),
  );
}

// ---------------------------------------------------------------------------
// File definitions
// ---------------------------------------------------------------------------

function writeAudio(subdir, filename, samples) {
  const dir = join(PUBLIC, subdir);
  mkdirSync(dir, { recursive: true });
  // Write as .mp3 extension but WAV content — Howler handles both
  // In production, replace with actual MP3 files
  const path = join(dir, filename);
  writeFileSync(path, createWav(Array.from(samples)));
  console.log(`  ${subdir}/${filename} (${(samples.length / 44100).toFixed(1)}s)`);
}

// ---------------------------------------------------------------------------
// Generate all files
// ---------------------------------------------------------------------------

console.log("Generating placeholder audio files...\n");

// SFX
writeAudio("sfx", "click.mp3", sine(800, 0.05));
writeAudio("sfx", "page-turn.mp3", concat(sine(400, 0.05), sine(600, 0.05), sine(500, 0.1)));
writeAudio("sfx", "notification.mp3", arpeggio([523, 659, 784], 0.1));
writeAudio("sfx", "whistle.mp3", sine(2200, 0.5, 44100, 0.4));
writeAudio("sfx", "crowd-goal.mp3", mix(noise(1.0, 44100, 0.5), sine(200, 1.0, 44100, 0.2)));
writeAudio("sfx", "crowd-miss.mp3", mix(noise(0.5, 44100, 0.3), sine(150, 0.5, 44100, 0.15)));
writeAudio("sfx", "report-submit.mp3", arpeggio([440, 554, 659], 0.08));
writeAudio("sfx", "level-up.mp3", arpeggio([262, 330, 392, 523], 0.12));
writeAudio("sfx", "job-offer.mp3", arpeggio([330, 440, 554], 0.1));
writeAudio("sfx", "season-end-whistle.mp3", concat(sine(2200, 0.3), sine(2200, 0.3), sine(2200, 0.5)));
writeAudio("sfx", "error.mp3", sine(150, 0.2, 44100, 0.5));
writeAudio("sfx", "save.mp3", arpeggio([440, 523], 0.08));
writeAudio("sfx", "achievement.mp3", arpeggio([523, 659, 784, 1047], 0.1, 44100, 0.5));
writeAudio("sfx", "discovery.mp3", arpeggio([392, 494, 587], 0.1));
writeAudio("sfx", "promotion.mp3", arpeggio([262, 330, 392, 494, 587], 0.1));

// Music (30-second loops)
writeAudio("music", "menu.mp3", ambientDrone(30, 110));
writeAudio("music", "scouting.mp3", ambientDrone(30, 130));
writeAudio("music", "matchday.mp3", ambientDrone(30, 165));
writeAudio("music", "season-end.mp3", ambientDrone(30, 98));

// Ambience (15-second loops)
writeAudio("ambience", "stadium-crowd.mp3", mix(noise(15, 44100, 0.25), sine(120, 15, 44100, 0.05)));
writeAudio("ambience", "office.mp3", mix(noise(15, 44100, 0.04), sine(60, 15, 44100, 0.02)));

console.log("\nDone! Generated all placeholder audio files.");
console.log("Replace these with professionally produced audio before shipping.");
