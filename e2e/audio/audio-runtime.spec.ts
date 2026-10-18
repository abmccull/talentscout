import { test, expect } from "../fixtures";
import { writeFile } from "node:fs/promises";

test("screen audio loads and starts after a real user gesture", async ({ gamePage }, info) => {
  const page = gamePage.page;
  const messages: { type: string; text: string }[] = [];
  const failures: { url: string; status: number }[] = [];
  page.on("console", message => {
    if (["warning", "error"].includes(message.type())) messages.push({ type: message.type(), text: message.text() });
  });
  page.on("response", response => {
    if (response.url().includes("/audio/") && response.status() >= 400) failures.push({ url: response.url(), status: response.status() });
  });
  // Observe native playback in this disposable browser context. Do not mock
  // media APIs, mute audio, or bypass the browser's autoplay policy.
  await page.addInitScript(() => {
    const probe = { elements: [] as HTMLMediaElement[], events: [] as { src: string; outcome: string }[] };
    (window as any).__AUDIO_PROBE__ = probe;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!probe.elements.includes(this)) probe.elements.push(this);
      const result = play.call(this);
      result?.then(() => probe.events.push({ src: this.currentSrc || this.src, outcome: "started" }),
        error => probe.events.push({ src: this.currentSrc || this.src, outcome: error.name }));
      return result;
    };
  });
  try {
    await gamePage.goto();
    // Let the menu request its stream before entering the career, so this
    // exercises release of the old stream as well as starting the new one.
    await expect.poll(() => page.evaluate(() => (window as any).__AUDIO_PROBE__.elements.some(
      (element: HTMLMediaElement) => element.src.includes("/audio/music/title-anthem"),
    )), { timeout: 15_000 }).toBe(true);
    await gamePage.injectState({ currentWeek: 3 });
    await gamePage.navigateTo("settings");
    await page.getByRole("button", { name: "Quick Save", exact: true }).click();
    await expect(page.getByText("Saved to slot 1", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__AUDIO_PROBE__.elements.some(
      (element: HTMLMediaElement) => element.currentSrc.includes("/audio/music/youth-scouting")
        && !element.paused && element.currentTime > 0.2 && element.volume > 0 && !element.muted && !element.error,
    )), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).__AUDIO_PROBE__.elements.some(
      (element: HTMLMediaElement) => element.currentSrc.includes("/audio/ambience/office_")
        && !element.paused && element.currentTime > 0.2 && element.volume > 0 && !element.muted && !element.error,
    )), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as any).__AUDIO_PROBE__.elements.some(
      (element: HTMLMediaElement) => element.src.startsWith("data:audio/wav"),
    )), { timeout: 15_000 }).toBe(true);
    expect(failures).toEqual([]);
    expect(messages.filter(message => /AudioEngine|Howler|audio pool|media-src|Loading media/i.test(message.text))).toEqual([]);
  } finally {
    const playback = await page.evaluate(() => {
      const probe = (window as any).__AUDIO_PROBE__;
      return { events: probe.events, media: probe.elements.map((element: HTMLMediaElement) => ({
        src: element.currentSrc, time: element.currentTime, paused: element.paused, readyState: element.readyState,
        volume: element.volume, muted: element.muted,
        error: element.error?.message,
      })) };
    });
    const path = info.outputPath("audio-runtime.json");
    await writeFile(path, JSON.stringify({ messages, failures, playback }, null, 2));
    await info.attach("audio-runtime", { path, contentType: "application/json" });
  }
});
