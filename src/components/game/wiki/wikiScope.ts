import { IS_YOUTH_EARLY_ACCESS } from "@/lib/demo";

export const YOUTH_EARLY_ACCESS_HIDDEN_WIKI_CATEGORY_SLUGS = new Set([
  "match-observation",
  "match-systems",
]);

export const YOUTH_EARLY_ACCESS_HIDDEN_WIKI_ARTICLE_SLUGS = new Set([
  "first-team-scout-spec",
  "regional-expert-spec",
  "data-scout-spec",
  "specialization-depth",
  "specialization-exclusive-activities",
  "phase-matching",
]);

export const YOUTH_EARLY_ACCESS_SEARCH_TEXT_OVERRIDES: Readonly<
  Record<string, string>
> = {
  "scouting-activities":
    "Youth Scout observation contexts include live matches, video, training and academy visits, youth tournaments, school and grassroots football, trial days, festivals, and follow-up sessions. Each context answers different questions. Changed context tests a hypothesis; repeating the same easy observation has diminishing returns.",
  "achievement-categories":
    "Youth Scout Early Access achievements track attainable first steps, career milestones, distinct report cases, genuine wonderkid discoveries, alumni, observation contexts, relationships, regional knowledge, finances, leadership, and recovery.",
  "hidden-achievements":
    "Hidden Youth Scout achievements reward career speed, narrative pressure, recovery after firing, a serious prospect shortlist, long careers, and consistent positive report outcomes.",
};

export function isWikiCategoryAvailableForBuild(categorySlug: string): boolean {
  return (
    !IS_YOUTH_EARLY_ACCESS ||
    !YOUTH_EARLY_ACCESS_HIDDEN_WIKI_CATEGORY_SLUGS.has(categorySlug)
  );
}

export function isWikiArticleAvailableForBuild(
  articleSlug: string,
  categorySlug: string,
): boolean {
  return (
    isWikiCategoryAvailableForBuild(categorySlug) &&
    (!IS_YOUTH_EARLY_ACCESS ||
      !YOUTH_EARLY_ACCESS_HIDDEN_WIKI_ARTICLE_SLUGS.has(articleSlug))
  );
}
