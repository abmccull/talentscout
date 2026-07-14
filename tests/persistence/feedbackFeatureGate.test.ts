import { describe, expect, it, vi } from "vitest";

const feedbackBoundary = vi.hoisted(() => ({
  insert: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({ insert: feedbackBoundary.insert })),
  },
}));

vi.mock("@/stores/gameStore", () => ({
  useGameStore: {
    getState: () => ({ gameState: null }),
  },
}));

import {
  FEEDBACK_UNAVAILABLE_MESSAGE,
  isFeedbackSubmissionAvailable,
  submitFeedback,
} from "@/lib/feedbackService";

describe("online feedback release gate", () => {
  it("fails closed by default even when Supabase credentials are configured", async () => {
    expect(isFeedbackSubmissionAvailable()).toBe(false);
    await expect(
      submitFeedback({
        category: "bug",
        title: "Example",
        description: "Example details",
      }),
    ).resolves.toEqual({
      success: false,
      error: FEEDBACK_UNAVAILABLE_MESSAGE,
    });
    expect(feedbackBoundary.insert).not.toHaveBeenCalled();
  });
});
