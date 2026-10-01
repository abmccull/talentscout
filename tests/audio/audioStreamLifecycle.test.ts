import { afterEach, expect, it, vi } from "vitest";

const live = vi.hoisted(() => new Set<unknown>());
const behavior = vi.hoisted(() => ({ blockNext: false }));
vi.mock("howler", () => ({ Howl: class {
  active = false;
  gain = 1;
  unloaded = false;
  events = new Map<string, Set<() => void>>();
  constructor() { live.add(this); }
  volume(value?: number) { if (value !== undefined) this.gain = value; return this.gain; }
  fade(_from: number, to: number) { this.gain = to; }
  play() {
    if (this.unloaded) throw new Error("Reused an unloaded stream");
    if (behavior.blockNext) { behavior.blockNext = false; this.emit("playerror"); return; }
    this.active = true; this.emit("play");
  }
  playing() { return this.active; }
  stop() { this.active = false; }
  once(event: string, callback: () => void) {
    const callbacks = this.events.get(event) ?? new Set();
    callbacks.add(callback); this.events.set(event, callbacks);
  }
  off(event: string, callback: () => void) { this.events.get(event)?.delete(callback); }
  emit(event: string) {
    const callbacks = [...(this.events.get(event) ?? [])];
    this.events.delete(event); callbacks.forEach(callback => callback());
  }
  unload() { this.unloaded = true; live.delete(this); }
} }));

import { AudioEngine } from "@/lib/audio/audioEngine";

afterEach(() => {
  AudioEngine.getInstance().stopMusic();
  AudioEngine.getInstance().stopAmbience();
  vi.runAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("retries a blocked stream on unlock but cancels abandoned playback", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", {});
  const audio = AudioEngine.getInstance();
  behavior.blockNext = true;
  audio.playMusic("title-anthem");
  await vi.dynamicImportSettled();
  const blocked = [...live][0] as {
    active: boolean; emit: (event: string) => void; gain: number;
    events: Map<string, Set<() => void>>;
  };
  expect(blocked.active).toBe(false);
  blocked.emit("unlock");
  expect(blocked.active).toBe(true);
  expect(blocked.gain).toBeGreaterThan(0);
  audio.stopMusic();
  vi.advanceTimersByTime(1001);
  behavior.blockNext = true;
  audio.playMusic("title-anthem");
  const abandoned = [...live][0] as typeof blocked;
  const queuedUnlock = [...abandoned.events.get("unlock")!][0]!;
  audio.stopMusic();
  // Howler callbacks already queued before off() can still arrive afterward.
  queuedUnlock();
  abandoned.emit("unlock");
  expect(abandoned.active).toBe(false);
});

it("releases old streams across repeated scene changes and preserves a rapid return", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", {});
  const audio = AudioEngine.getInstance();
  audio.playMusic("career-hub");
  await vi.dynamicImportSettled();
  audio.playAmbience("office");
  expect(live.size).toBe(2);
  for (let index = 0; index < 30; index++) {
    audio.playMusic(index % 2 ? "career-hub" : "report-writing");
    audio.playAmbience(index % 2 ? "office" : "stadium-crowd");
    vi.advanceTimersByTime(1001);
    expect(live.size).toBe(2);
  }
  audio.playMusic("report-writing");
  vi.advanceTimersByTime(200);
  audio.playMusic("career-hub");
  vi.advanceTimersByTime(1001);
  expect(live.size).toBe(2);
  audio.playMusic("career-hub");
  expect(live.size).toBe(2);
  audio.stopMusic();
  audio.stopAmbience();
  vi.advanceTimersByTime(1001);
  expect(live.size).toBe(0);
});
