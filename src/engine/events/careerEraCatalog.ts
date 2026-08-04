import type { StoryCandidateKind } from "./storyDirectorV2";

export const CAREER_ERA_THEME_IDS = Object.freeze([
  "proveJudgment",
  "territoryBuild",
  "relationshipDebt",
  "rivalPressure",
  "careerLeverage",
  "recovery",
  "leadershipQuality",
  "agencyRunway",
] as const);

export type CareerEraTheme = (typeof CAREER_ERA_THEME_IDS)[number];

export interface CareerEraDefinition {
  theme: CareerEraTheme;
  title: string;
  premise: string;
  deskPrompt: string;
  boostedCategoryTokens: readonly string[];
  boostedKinds: readonly StoryCandidateKind[];
  suppressedCategoryTokens: readonly string[];
}

export const CAREER_ERA_DEFINITIONS: Readonly<Record<CareerEraTheme, CareerEraDefinition>> = Object.freeze({
  proveJudgment: {
    theme: "proveJudgment",
    title: "A judgment worth defending",
    premise: "Your next reports will define whether decision-makers trust your eye or merely tolerate your paperwork.",
    deskPrompt: "Find the case where stronger evidence could turn an opinion into a career-defining recommendation.",
    boostedCategoryTokens: ["report", "recommend", "discovery", "prospect", "vindication"],
    boostedKinds: ["callback"],
    suppressedCategoryTokens: ["finance", "operating"],
  },
  territoryBuild: {
    theme: "territoryBuild",
    title: "Earn the territory",
    premise: "A region is opening, but access and interpretation must be earned before competitors establish the story first.",
    deskPrompt: "Choose whether to deepen one local network or chase broader coverage before the window closes.",
    boostedCategoryTokens: ["access", "regional", "territory", "travel", "world-pulse"],
    boostedKinds: ["worldArc", "worldPulse"],
    suppressedCategoryTokens: ["job", "finance"],
  },
  relationshipDebt: {
    theme: "relationshipDebt",
    title: "Promises are becoming leverage",
    premise: "People remember who received access, credit and protection. Existing obligations are starting to collide.",
    deskPrompt: "Decide which promise deserves scarce attention before someone else defines your priorities for you.",
    boostedCategoryTokens: ["relationship", "media", "ethics", "welfare", "gossip", "callback"],
    boostedKinds: ["relationshipConflict", "callback"],
    suppressedCategoryTokens: ["market-shock"],
  },
  rivalPressure: {
    theme: "rivalPressure",
    title: "Someone else is working the same lead",
    premise: "A rival network is closing distance, turning information control and timing into part of the scouting judgment.",
    deskPrompt: "Protect the lead, accelerate the evidence or accept that another scout may act first.",
    boostedCategoryTokens: ["rival", "poach", "counterplay", "market", "discovery"],
    boostedKinds: ["rivalOpportunity", "rivalCampaign"],
    suppressedCategoryTokens: ["training"],
  },
  careerLeverage: {
    theme: "careerLeverage",
    title: "Authority has a price",
    premise: "Your growing standing creates openings, but every step upward comes with a mandate and political cost.",
    deskPrompt: "Build leverage for the role you want without neglecting the work that made your reputation.",
    boostedCategoryTokens: ["career", "politic", "board", "performance", "job", "leadership"],
    boostedKinds: ["special", "callback"],
    suppressedCategoryTokens: ["world-pulse"],
  },
  recovery: {
    theme: "recovery",
    title: "The comeback must be earned",
    premise: "A setback has changed how the football world reads your work. New evidence matters more than old status.",
    deskPrompt: "Choose the piece of work that proves what has changed since the failure.",
    boostedCategoryTokens: ["recovery", "failure", "vindication", "career", "report"],
    boostedKinds: ["callback", "special"],
    suppressedCategoryTokens: ["prestige"],
  },
  leadershipQuality: {
    theme: "leadershipQuality",
    title: "Your name is on other people's work",
    premise: "Delegation creates scale, but staff judgment and missed context now carry your reputation.",
    deskPrompt: "Decide where your own attention is indispensable and where the team must be trusted.",
    boostedCategoryTokens: ["staff", "delegat", "leadership", "quality", "career"],
    boostedKinds: ["callback", "relationshipConflict"],
    suppressedCategoryTokens: ["standalone"],
  },
  agencyRunway: {
    theme: "agencyRunway",
    title: "Independence needs a business model",
    premise: "Cash runway, client concentration and reputation exposure are pulling the practice in different directions.",
    deskPrompt: "Choose between dependable work now and the speculative case that could transform the practice.",
    boostedCategoryTokens: ["finance", "agency", "client", "market", "contract", "operating"],
    boostedKinds: ["special", "callback"],
    suppressedCategoryTokens: ["world-pulse"],
  },
});
