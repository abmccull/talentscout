import type { Locator, Page } from "@playwright/test";
import { expect } from "../fixtures";

export function observationRail(page: Page) {
  return page.getByRole("list", { name: "Players on the observation pitch", exact: true });
}

export async function expectUniquePlayerControls(page: Page, names: string[]) {
  const rail = observationRail(page);
  await expect(rail).toHaveCount(1);
  await expect(rail.getByRole("button")).toHaveCount(names.length);
  await expect(page.locator("button[data-observation-pitch-marker]")).toHaveCount(names.length);
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(page.getByRole("button", { name: new RegExp(`^Track ${escaped},`) })).toHaveCount(1);
  }
  await expect(rail.locator('button[tabindex="0"]')).toHaveCount(1);
}

/** Content coordinates remain stable while a horizontal rail scrolls. */
export async function readRailGeometry(rail: Locator, names: string[]) {
  return rail.evaluate((element, names) => {
    const bounds = element.getBoundingClientRect();
    const round = (value: number) => Number(value.toFixed(2));
    const box = (rect: DOMRect) => ({ x: round(rect.x - bounds.x + element.scrollLeft),
      y: round(rect.y - bounds.y), width: rect.width, height: rect.height });
    return { width: bounds.width, height: bounds.height, contentWidth: element.scrollWidth,
      targets: [...element.querySelectorAll<HTMLButtonElement>("button[data-observation-pitch-marker]")].map((marker, index) => {
        const caption = [...marker.querySelectorAll<HTMLElement>("span")].find(span => span.textContent === names[index]);
        return { name: marker.getAttribute("aria-label"), ...box(marker.getBoundingClientRect()),
          caption: caption ? { ...box(caption.getBoundingClientRect()), text: caption.textContent,
            clientWidth: caption.clientWidth, scrollWidth: caption.scrollWidth } : null };
      }) };
  }, names);
}

export function railGeometryProblems(geometry: Awaited<ReturnType<typeof readRailGeometry>>) {
  const problems: string[] = [];
  // The actual CSS ring is 2px plus its 4px offset. Neighbor gaps must protect it.
  const ring = 6;
  for (let index = 0; index < geometry.targets.length; index++) {
    const target = geometry.targets[index];
    if (target.width < 44 || target.height < 44) problems.push(`small:${index}`);
    if (target.x < -0.5 || target.x + target.width > geometry.contentWidth + 0.5
      || target.y < -0.5 || target.y + target.height > geometry.height + 0.5) problems.push(`content-clipped:${index}`);
    const caption = target.caption;
    if (!caption) problems.push(`missing-caption:${index}`);
    else if (caption.x < target.x - 0.5 || caption.y < target.y - 0.5
      || caption.x + caption.width > target.x + target.width + 0.5
      || caption.y + caption.height > target.y + target.height + 0.5
      || caption.scrollWidth > caption.clientWidth + 1) problems.push(`caption-clipped:${index}`);
    for (let otherIndex = index + 1; otherIndex < geometry.targets.length; otherIndex++) {
      const other = geometry.targets[otherIndex];
      const overlapX = Math.min(target.x + target.width + ring, other.x + other.width + ring)
        - Math.max(target.x - ring, other.x - ring);
      const overlapY = Math.min(target.y + target.height + ring, other.y + other.height + ring)
        - Math.max(target.y - ring, other.y - ring);
      if (overlapX > 0.5 && overlapY > 0.5) problems.push(`ring-overlap:${index}:${otherIndex}`);
    }
  }
  return problems;
}

/** No scrolling/focusing here: inspect what the preceding real action revealed. */
export async function readRailReveal(marker: Locator, name: string, keyboard = false) {
  return marker.evaluate((element, { name, keyboard }) => {
    const rail = element.closest("ul")!;
    const caption = [...element.querySelectorAll<HTMLElement>("span")].find(span => span.textContent === name);
    const controls = document.querySelector<HTMLElement>('[data-testid="mobile-observation-controls"]');
    const header = document.querySelector<HTMLElement>("header");
    if (!caption || !controls || !header) throw new Error("Watch visibility regions are missing");
    const rect = element.getBoundingClientRect(), text = caption.getBoundingClientRect();
    const port = rail.getBoundingClientRect(), footer = controls.getBoundingClientRect(), banner = header.getBoundingClientRect();
    const ring = keyboard ? 6 : 0;
    const left = Math.min(rect.left - ring, text.left), right = Math.max(rect.right + ring, text.right);
    const top = Math.min(rect.top - ring, text.top), bottom = Math.max(rect.bottom + ring, text.bottom);
    const visibleTop = Math.max(0, banner.bottom), visibleBottom = Math.min(innerHeight, footer.top);
    const centerHit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const range = document.createRange(); range.selectNodeContents(caption);
    const captionHits = [...range.getClientRects()].map(line => {
      const hit = document.elementFromPoint(line.left + line.width / 2, line.top + line.height / 2);
      return { left: line.left, right: line.right, top: line.top, bottom: line.bottom,
        owned: hit === element || Boolean(hit && element.contains(hit)) };
    });
    const problems: string[] = [];
    if (keyboard && document.activeElement !== element) problems.push("keyboard-focus-is-elsewhere");
    if (keyboard && !element.matches(":focus-visible")) problems.push("keyboard-ring-not-active");
    if (top < visibleTop - 0.5 || bottom > visibleBottom + 0.5) problems.push("target-hidden-under-fixed-chrome");
    if (left < Math.max(0, port.left) - 0.5 || right > Math.min(innerWidth, port.right) + 0.5
      || top < port.top - 0.5 || bottom > port.bottom + 0.5) problems.push("target-ring-or-caption-clipped-by-rail");
    if (!centerHit || !element.contains(centerHit)) problems.push("target-center-is-occluded");
    if (!captionHits.length || captionHits.some(hit => !hit.owned)) problems.push("caption-is-occluded");
    return { name, pressed: element.getAttribute("aria-pressed"), ariaLabel: element.getAttribute("aria-label"),
      caption: caption.textContent, left, right, top, bottom, visibleTop, visibleBottom, captionHits,
      rail: { left: port.left, right: port.right, top: port.top, bottom: port.bottom, scrollLeft: rail.scrollLeft },
      body: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: { width: innerWidth, height: innerHeight }, scrollY, problems };
  }, { name, keyboard });
}
