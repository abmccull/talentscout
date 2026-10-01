export interface MentorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface MentorPosition { top: number; left: number }
export interface MentorViewport { width: number; height: number }
export type MentorSide = "top" | "bottom" | "left" | "right";

const MARGIN = 8;
const GAP = 12;

export function mentorOverlapsTarget(card: MentorRect, target: MentorRect, pad = 8): boolean {
  return !(
    card.left + card.width + pad <= target.left ||
    target.left + target.width + pad <= card.left ||
    card.top + card.height + pad <= target.top ||
    target.top + target.height + pad <= card.top
  );
}

/** Return null when the card cannot fit without covering the player's target. */
export function placeMentorWithoutCoveringTarget(
  target: MentorRect,
  preferredSide: MentorSide,
  card: { width: number; height: number },
  viewport: MentorViewport,
): MentorPosition | null {
  if (card.width > viewport.width - MARGIN * 2 || card.height > viewport.height - MARGIN * 2) return null;
  for (const side of new Set([preferredSide, "bottom", "top", "right", "left"])) {
    let top = target.top + target.height / 2 - card.height / 2;
    let left = target.left + target.width / 2 - card.width / 2;
    if (side === "top") top = target.top - card.height - GAP;
    if (side === "bottom") top = target.top + target.height + GAP;
    if (side === "left") left = target.left - card.width - GAP;
    if (side === "right") left = target.left + target.width + GAP;
    const position = {
      top: Math.max(MARGIN, Math.min(top, viewport.height - card.height - MARGIN)),
      left: Math.max(MARGIN, Math.min(left, viewport.width - card.width - MARGIN)),
    };
    if (!mentorOverlapsTarget({ ...position, ...card }, target)) return position;
  }
  return null;
}

export function placeCompactMentor(target: MentorRect | null, viewport: MentorViewport): MentorPosition {
  const card = { width: Math.min(184, viewport.width - 16), height: 44 };
  const corners = [
    { top: MARGIN, left: Math.max(MARGIN, viewport.width - card.width - MARGIN) },
    { top: Math.max(MARGIN, viewport.height - card.height - MARGIN), left: Math.max(MARGIN, viewport.width - card.width - MARGIN) },
    { top: MARGIN, left: MARGIN },
    { top: Math.max(MARGIN, viewport.height - card.height - MARGIN), left: MARGIN },
  ];
  if (!target) return corners[0];
  const safe = corners.find((position) => !mentorOverlapsTarget({ ...position, ...card }, target));
  if (safe) return safe;
  const overlapArea = (position: MentorPosition) => Math.max(0,
    Math.min(position.left + card.width, target.left + target.width) - Math.max(position.left, target.left),
  ) * Math.max(0,
    Math.min(position.top + card.height, target.top + target.height) - Math.max(position.top, target.top),
  );
  // Oversized scrolling targets may occupy the whole viewport. Keep the control
  // small and choose the least obstructive corner instead of covering the form.
  return corners.sort((a, b) => overlapArea(a) - overlapArea(b))[0];
}
