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

export type FeedbackCategory = "bug" | "feature" | "gameplay" | "other";

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

export async function submitFeedback(
  input: SubmitFeedbackInput,
): Promise<SubmitFeedbackResult> {
  if (!supabase) {
    return { success: false, error: "Feedback unavailable in offline mode" };
  }

  const gameContext = collectGameContext();

  const { error } = await supabase.from("feedback").insert({
    category: input.category,
    title: input.title,
    description: input.description,
    contact_email: input.contactEmail || null,
    game_context: gameContext,
  });

  if (error) {
    console.warn("Feedback submission failed:", error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}
