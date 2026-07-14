import { beforeEach, describe, expect, it, vi } from "vitest";

const feedbackBoundary = vi.hoisted(() => ({
  insert: vi.fn(),
}));

vi.mock("@/config/beta", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config/beta")>()),
  BETA_ONLINE_FEEDBACK_ENABLED: true,
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
  FEEDBACK_DESCRIPTION_MAX_LENGTH,
  FEEDBACK_EMAIL_MAX_LENGTH,
  FEEDBACK_TITLE_MAX_LENGTH,
  isFeedbackSubmissionAvailable,
  submitFeedback,
} from "@/lib/feedbackService";

describe("feedback service boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feedbackBoundary.insert.mockResolvedValue({ error: null });
  });

  it("trims bounded input before the anonymous insert", async () => {
    await expect(
      submitFeedback({
        category: "gameplay",
        title: "  Observation feedback  ",
        description: "  The evidence choice was clear.  ",
        contactEmail: "  scout@example.com  ",
      }),
    ).resolves.toEqual({ success: true });

    expect(isFeedbackSubmissionAvailable()).toBe(true);
    expect(feedbackBoundary.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "gameplay",
        title: "Observation feedback",
        description: "The evidence choice was clear.",
        contact_email: "scout@example.com",
      }),
    );
  });

  it("rejects empty, invalid, or oversized payloads before network access", async () => {
    await expect(
      submitFeedback({ category: "bug", title: " ", description: "Details" }),
    ).resolves.toMatchObject({ success: false });
    await expect(
      submitFeedback({
        category: "invalid" as "bug",
        title: "Title",
        description: "Details",
      }),
    ).resolves.toMatchObject({ success: false });
    await expect(
      submitFeedback({
        category: "bug",
        title: "x".repeat(FEEDBACK_TITLE_MAX_LENGTH + 1),
        description: "Details",
      }),
    ).resolves.toMatchObject({ success: false });
    await expect(
      submitFeedback({
        category: "bug",
        title: "Title",
        description: "x".repeat(FEEDBACK_DESCRIPTION_MAX_LENGTH + 1),
      }),
    ).resolves.toMatchObject({ success: false });
    await expect(
      submitFeedback({
        category: "bug",
        title: "Title",
        description: "Details",
        contactEmail: "x".repeat(FEEDBACK_EMAIL_MAX_LENGTH + 1),
      }),
    ).resolves.toMatchObject({ success: false });
    expect(feedbackBoundary.insert).not.toHaveBeenCalled();
  });

  it("does not expose backend errors to the player and handles thrown failures", async () => {
    feedbackBoundary.insert.mockResolvedValueOnce({
      error: { message: "relation public.feedback does not exist" },
    });
    const databaseFailure = await submitFeedback({
      category: "bug",
      title: "Title",
      description: "Details",
    });
    expect(databaseFailure).toEqual({
      success: false,
      error: "Feedback could not be submitted. Please try again later.",
    });
    expect(databaseFailure.error).not.toContain("public.feedback");

    feedbackBoundary.insert.mockRejectedValueOnce(new Error("network secret"));
    const thrownFailure = await submitFeedback({
      category: "bug",
      title: "Title",
      description: "Details",
    });
    expect(thrownFailure).toEqual({
      success: false,
      error: "Feedback could not be submitted. Please try again later.",
    });
  });
});
