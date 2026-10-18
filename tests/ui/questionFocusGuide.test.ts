import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestionFocusGuide, QuestionLensMatch } from "@/components/game/observation/QuestionFocusGuide";
import { SCOUTING_QUESTIONS } from "@/engine/scout/evidenceModel";
import { LENS_KEYS, LENS_VISUAL } from "@/components/game/observation/lensVisual";
import { createSession, setSessionScoutingQuestion } from "@/engine/observation/session";
import { createRNG } from "@/engine/rng";

describe("question and focus explanation", () => {
  it.each(SCOUTING_QUESTIONS)("uses the actual $id perception skill and marks only its matching lens", (question) => {
    const skillLabel = question.primarySkill.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
    const setup = renderToStaticMarkup(createElement(QuestionFocusGuide, { questionId: question.id, placement: "setup" }));
    const attention = renderToStaticMarkup(createElement(QuestionFocusGuide, { questionId: question.id, placement: "attention" }));
    expect(setup).toContain(`Uses your ${skillLabel}`);
    expect(attention).toContain(`Question: ${question.matchFocus}`);
    expect(attention).toContain(`${LENS_VISUAL[question.lens].label} focus fits this question.`);
    expect(setup + attention).not.toMatch(/0\.08|bonus|RNG|threshold|coefficient/);
    for (const lens of LENS_KEYS) {
      const marker = renderToStaticMarkup(createElement(QuestionLensMatch, { questionId: question.id, lens }));
      if (lens === question.lens) {
        expect(marker).toContain("Fits question");
        expect(marker).toContain('aria-hidden="true"');
      } else expect(marker).toBe("");
    }
  });

  it("explains Morgan's Mental/decisions mismatch without pretending Psychological Read is active", () => {
    const html = renderToStaticMarkup(createElement(QuestionFocusGuide, {
      questionId: "decisions", placement: "attention", currentLens: "mental",
    }));
    expect(html).toContain("Question: Speed of decision");
    expect(html).toContain("Uses your Tactical Understanding");
    expect(html).toContain("Tactical focus fits this question");
    expect(html).toContain("Mental focus does not change the question; it still uses Tactical Understanding.");
    expect(html).not.toContain("Psychological Read");
    const aligned = renderToStaticMarkup(createElement(QuestionFocusGuide, {
      questionId: "pressure", placement: "attention", currentLens: "mental",
    }));
    expect(aligned).toContain("Uses your Psychological Read");
    expect(aligned).not.toContain("does not change");
  });

  it("keeps the setup-only question authority and leaves saved actions and RNG untouched by rendering", () => {
    const rng = createRNG("question-guide-authority");
    const referenceRng = createRNG("question-guide-authority");
    const config = { activityType: "schoolMatch" as const, specialization: "youth" as const, seed: "question-guide",
      week: 1, season: 1, playerPool: [{ playerId: "lead", name: "Jesse Rowe", position: "GK" }] };
    const setup = createSession(config, rng);
    createSession(config, referenceRng);
    const changed = setSessionScoutingQuestion(setup, "pressure", []);
    expect(changed.scoutingQuestionId).toBe("pressure");
    const active = { ...changed, state: "active" as const };
    const snapshot = structuredClone(active);
    expect(setSessionScoutingQuestion(active, "decisions", [])).toBe(active);
    renderToStaticMarkup(createElement(QuestionFocusGuide, {
      questionId: active.scoutingQuestionId, placement: "attention", currentLens: "tactical",
    }));
    expect(active).toEqual(snapshot);
    expect(rng.next()).toBe(referenceRng.next());
  });

  it("does not invent a question or matching lens when legacy state has none", () => {
    expect(renderToStaticMarkup(createElement(QuestionFocusGuide, { placement: "attention" }))).toBe("");
    expect(renderToStaticMarkup(createElement(QuestionLensMatch, { lens: "general" }))).toBe("");
  });
});
