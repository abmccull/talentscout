/**
 * feedbackService — submits player feedback to Supabase.
 *
 * Auto-collects game context (week, season, difficulty, specialization) so
 * the player doesn't have to provide it manually. Handles offline/missing
 * Supabase gracefully by returning an error result.
 */

import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/stores/gameStore";
import { APP_VERSION } from "@/config/version";
import {
  BETA_ONLINE_FEEDBACK_ENABLED,
  BETA_ONLINE_FEEDBACK_MESSAGE,
} from "@/config/beta";

export type FeedbackCategory = "bug" | "feature" | "gameplay" | "other";

export const FEEDBACK_TITLE_MAX_LENGTH = 200;
export const FEEDBACK_DESCRIPTION_MAX_LENGTH = 2_000;
export const FEEDBACK_EMAIL_MAX_LENGTH = 254;
export const FEEDBACK_UNAVAILABLE_MESSAGE = BETA_ONLINE_FEEDBACK_MESSAGE;
const FEEDBACK_FAILURE_MESSAGE =
  "Feedback could not be submitted. Please try again later.";
const FEEDBACK_CATEGORIES = new Set<FeedbackCategory>([
  "bug",
  "feature",
  "gameplay",
  "other",
]);

interface SubmitFeedbackInput {
  category: FeedbackCategory;
  title: string;
  description: string;
  contactEmail?: string;
}

interface SubmitFeedbackResult {
  success: boolean;
  error?: string;
}

function collectGameContext(): Record<string, unknown> | null {
  const gs = useGameStore.getState().gameState;
  if (!gs) return null;
  return {
    currentWeek: gs.currentWeek,
    currentSeason: gs.currentSeason,
    difficulty: gs.difficulty,
    primarySpecialization: gs.scout.primarySpecialization,
    specializationLevel: gs.scout.specializationLevel,
    version: APP_VERSION,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
  };
}

export function isFeedbackSubmissionAvailable(): boolean {
  return BETA_ONLINE_FEEDBACK_ENABLED && Boolean(supabase);
}

export async function submitFeedback(
  input: SubmitFeedbackInput,
): Promise<SubmitFeedbackResult> {
  if (!BETA_ONLINE_FEEDBACK_ENABLED || !supabase) {
    return { success: false, error: FEEDBACK_UNAVAILABLE_MESSAGE };
  }

  if (!FEEDBACK_CATEGORIES.has(input.category)) {
    return { success: false, error: "Choose a valid feedback category." };
  }

  const title = input.title.trim();
  const description = input.description.trim();
  const contactEmail = input.contactEmail?.trim() || null;
  if (!title || !description) {
    return { success: false, error: "Add a title and description." };
  }
  if (title.length > FEEDBACK_TITLE_MAX_LENGTH) {
    return { success: false, error: "The feedback title is too long." };
  }
  if (description.length > FEEDBACK_DESCRIPTION_MAX_LENGTH) {
    return { success: false, error: "The feedback description is too long." };
  }
  if (contactEmail && contactEmail.length > FEEDBACK_EMAIL_MAX_LENGTH) {
    return { success: false, error: "The contact email is too long." };
  }

  const gameContext = collectGameContext();

  try {
    const { error } = await supabase.from("feedback").insert({
      category: input.category,
      title,
      description,
      contact_email: contactEmail,
      game_context: gameContext,
    });

    if (error) {
      console.warn("Feedback submission failed:", error.message);
      return { success: false, error: FEEDBACK_FAILURE_MESSAGE };
    }
  } catch (error) {
    console.warn("Feedback submission failed:", error);
    return { success: false, error: FEEDBACK_FAILURE_MESSAGE };
  }

  return { success: true };
}
