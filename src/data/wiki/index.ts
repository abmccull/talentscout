import type { WikiArticle } from "@/components/game/wiki/wikiTypes";
import { WIKI_CATEGORIES } from "./categories";

// ─── Content imports ─────────────────────────────────────────────────────────

import { gettingStartedArticles } from "./getting-started";
import { activitiesArticles } from "./activities";
import { scoutingReportsArticles } from "./scouting-reports";
import { matchObservationArticles } from "./match-observation";
import { careerProgressionArticles } from "./career-progression";
import { specializationsArticles } from "./specializations";
import { equipmentArticles } from "./equipment";
import { contactsNetworkArticles } from "./contacts-network";
import { youthScoutingArticles } from "./youth-scouting";
import { playersArticles } from "./players";
import { financesArticles } from "./finances";
import { agencyArticles } from "./agency";
import { insightPointsArticles } from "./insight-points";
import { worldTravelArticles } from "./world-travel";
import { matchSystemsArticles } from "./match-systems";
import { achievementsArticles } from "./achievements";
import { tipsStrategyArticles } from "./tips-strategy";

// ─── Aggregate ───────────────────────────────────────────────────────────────

export const ALL_ARTICLES: WikiArticle[] = [
  ...gettingStartedArticles,
  ...activitiesArticles,
  ...scoutingReportsArticles,
  ...matchObservationArticles,
  ...careerProgressionArticles,
  ...specializationsArticles,
  ...equipmentArticles,
  ...contactsNetworkArticles,
  ...youthScoutingArticles,
  ...playersArticles,
  ...financesArticles,
  ...agencyArticles,
  ...insightPointsArticles,
  ...worldTravelArticles,
  ...matchSystemsArticles,
  ...achievementsArticles,
  ...tipsStrategyArticles,
];

// ─── Lookup maps ─────────────────────────────────────────────────────────────

export const ARTICLE_BY_SLUG = new Map(ALL_ARTICLES.map((a) => [a.slug, a]));

export const ARTICLES_BY_CATEGORY = new Map<string, WikiArticle[]>();
for (const article of ALL_ARTICLES) {
  const list = ARTICLES_BY_CATEGORY.get(article.category) ?? [];
  list.push(article);
  ARTICLES_BY_CATEGORY.set(article.category, list);
}
// Sort each category list by order
for (const [, list] of ARTICLES_BY_CATEGORY) {
  list.sort((a, b) => a.order - b.order);
}

export const CATEGORY_BY_SLUG = new Map(
  WIKI_CATEGORIES.map((c) => [c.slug, c]),
);

export { WIKI_CATEGORIES };
