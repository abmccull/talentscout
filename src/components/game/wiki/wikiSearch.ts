import type { WikiArticle } from "./wikiTypes";

// ─── Types ───────────────────────────────────────────────────────────────────

interface IndexEntry {
  slug: string;
  titleTokens: string[];
  summaryTokens: string[];
  tagTokens: string[];
  contentTokens: string[];
  /** Original strings for snippet extraction */
  title: string;
  summary: string;
  searchText: string;
}

export interface SearchResult {
  slug: string;
  title: string;
  category: string;
  summary: string;
  matchType: "title" | "summary" | "tag" | "content";
  snippet?: string;
}

export type SearchIndex = IndexEntry[];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function extractSnippet(text: string, query: string, radius = 50): string {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text.slice(0, 100) + "…";
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + q.length + radius);
  let snippet = "";
  if (start > 0) snippet += "…";
  snippet += text.slice(start, end);
  if (end < text.length) snippet += "…";
  return snippet;
}

// ─── Build index ─────────────────────────────────────────────────────────────

export function buildSearchIndex(articles: WikiArticle[]): SearchIndex {
  return articles.map((a) => ({
    slug: a.slug,
    titleTokens: tokenize(a.title),
    summaryTokens: tokenize(a.summary),
    tagTokens: (a.tags ?? []).flatMap((t) => tokenize(t)),
    contentTokens: tokenize(a.searchText),
    title: a.title,
    summary: a.summary,
    searchText: a.searchText,
  }));
}

// ─── Search ──────────────────────────────────────────────────────────────────

export function searchWiki(
  index: SearchIndex,
  articles: WikiArticle[],
  rawQuery: string,
): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const articleMap = new Map(articles.map((a) => [a.slug, a]));

  const scored: { entry: IndexEntry; score: number; matchType: SearchResult["matchType"] }[] = [];

  for (const entry of index) {
    let score = 0;
    let matchType: SearchResult["matchType"] = "content";

    // Title match (highest weight)
    if (entry.title.toLowerCase().includes(query)) {
      score += 100;
      matchType = "title";
    } else if (queryTokens.every((qt) => entry.titleTokens.some((t) => t.includes(qt)))) {
      score += 80;
      matchType = "title";
    }

    // Summary match
    if (entry.summary.toLowerCase().includes(query)) {
      score += 50;
      if (matchType !== "title") matchType = "summary";
    } else if (queryTokens.every((qt) => entry.summaryTokens.some((t) => t.includes(qt)))) {
      score += 30;
      if (matchType !== "title") matchType = "summary";
    }

    // Tag match
    if (queryTokens.some((qt) => entry.tagTokens.some((t) => t.includes(qt)))) {
      score += 40;
      if (matchType !== "title" && matchType !== "summary") matchType = "tag";
    }

    // Content match
    if (entry.searchText.toLowerCase().includes(query)) {
      score += 10;
    } else if (queryTokens.some((qt) => entry.contentTokens.some((t) => t.includes(qt)))) {
      score += 5;
    }

    if (score > 0) {
      scored.push({ entry, score, matchType });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 20).map(({ entry, matchType }) => {
    const article = articleMap.get(entry.slug)!;
    return {
      slug: entry.slug,
      title: entry.title,
      category: article.category,
      summary: entry.summary,
      matchType,
      snippet:
        matchType === "content"
          ? extractSnippet(entry.searchText, rawQuery.trim())
          : undefined,
    };
  });
}
