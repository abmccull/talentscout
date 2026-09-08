import { describe, expect, it } from "vitest";
import { mentorOverlapsTarget, placeCompactMentor, placeMentorWithoutCoveringTarget } from "@/components/game/tutorial/mentorPlacement";

describe("shared mentor placement", () => {
  it("tries an alternative side when clamping the preferred side covers Promising", () => {
    const target = { left: 16, top: 450, width: 625, height: 48 };
    const card = { width: 360, height: 320 };
    const viewport = { width: 1280, height: 720 };
    const position = placeMentorWithoutCoveringTarget(target, "left", card, viewport);
    expect(position).not.toBeNull();
    expect(mentorOverlapsTarget({ ...position!, ...card }, target)).toBe(false);
    expect(position!.top).toBeGreaterThanOrEqual(8);
  });

  it("requests compact help for a large discovery group at 806 by 691", () => {
    const target = { left: 24, top: 108, width: 758, height: 500 };
    const viewport = { width: 806, height: 691 };
    expect(placeMentorWithoutCoveringTarget(target, "left", { width: 360, height: 340 }, viewport)).toBeNull();
    const compact = placeCompactMentor(target, viewport);
    expect(mentorOverlapsTarget({ ...compact, width: 184, height: 44 }, target)).toBe(false);
  });

  it("keeps mobile help clear of the target when a full card cannot fit", () => {
    const target = { left: 12, top: 180, width: 366, height: 550 };
    const viewport = { width: 390, height: 844 };
    expect(placeMentorWithoutCoveringTarget(target, "bottom", { width: 360, height: 300 }, viewport)).toBeNull();
    const compact = placeCompactMentor(target, viewport);
    expect(mentorOverlapsTarget({ ...compact, width: 184, height: 44 }, target)).toBe(false);
  });

  it("keeps missing-target help at a viewport edge instead of covering the center", () => {
    expect(placeCompactMentor(null, { width: 806, height: 691 })).toEqual({ top: 8, left: 614 });
  });
});
