"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Book, ArrowLeft, Menu } from "lucide-react";
import { GameLayout } from "../GameLayout";
import { WikiSidebar } from "./WikiSidebar";
import { WikiArticlePage } from "./WikiArticlePage";
import { WikiSearchResults } from "./WikiSearchResults";
import { buildSearchIndex, searchWiki, type SearchIndex } from "./wikiSearch";
import type { WikiArticle, WikiCategory, WikiView } from "./wikiTypes";
import { WIKI_CATEGORIES } from "@/data/wiki/categories";
import { ALL_ARTICLES, CATEGORY_BY_SLUG } from "@/data/wiki";
import { IS_YOUTH_EARLY_ACCESS } from "@/lib/demo";
import {
  YOUTH_EARLY_ACCESS_HIDDEN_WIKI_CATEGORY_SLUGS,
  YOUTH_EARLY_ACCESS_SEARCH_TEXT_OVERRIDES,
  isWikiArticleAvailableForBuild,
} from "./wikiScope";

const CHAPTER_TO_SLUG: Record<string, string> = {
  "getting-started": "the-game-loop",
  activities: "scouting-activities",
  "scouting-reports": "perception-model",
  "match-observation": "match-phases",
  career: "career-tiers",
  specializations: "youth-scout-spec",
  equipment: "equipment-overview",
  contacts: "contact-types",
  youth: "unsigned-youth",
  tips: "choosing-the-right-lens",
  scheduling: "scheduling-your-week",
  "career-progression": "career-tiers",
  finances: "income-sources",
  fatigue: "fatigue",
  reports: "perception-model",
  networking: "contact-types",
};

let navigateToArticleRef: ((slug: string) => void) | null = null;

export function navigateToWikiArticle(slugOrChapterId: string): void {
  const slug = CHAPTER_TO_SLUG[slugOrChapterId] ?? slugOrChapterId;
  if (navigateToArticleRef) {
    navigateToArticleRef(slug);
  }
}

export function scrollToChapter(chapterId: string): void {
  navigateToWikiArticle(chapterId);
}

export const HANDBOOK_CHAPTERS = Object.keys(CHAPTER_TO_SLUG);

function buildArticlesByCategory(articles: WikiArticle[]): Map<string, WikiArticle[]> {
  const map = new Map<string, WikiArticle[]>();
  for (const article of articles) {
    const list = map.get(article.category) ?? [];
    list.push(article);
    map.set(article.category, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.order - b.order);
  }
  return map;
}

function ScopeNotice({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <p className="text-sm font-semibold text-amber-200">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-300">{body}</p>
    </div>
  );
}

export function WikiScreen() {
  const [history, setHistory] = useState<WikiView[]>([{ mode: "index" }]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mainRef = useRef<HTMLDivElement>(null);

  const visibleArticles = useMemo(
    () =>
      IS_YOUTH_EARLY_ACCESS
        ? ALL_ARTICLES.filter((article) =>
            isWikiArticleAvailableForBuild(article.slug, article.category),
          ).map((article) => ({
            ...article,
            searchText:
              YOUTH_EARLY_ACCESS_SEARCH_TEXT_OVERRIDES[article.slug] ??
              article.searchText,
          }))
        : ALL_ARTICLES,
    [],
  );

  const visibleCategories = useMemo<WikiCategory[]>(
    () =>
      WIKI_CATEGORIES.filter((category) =>
        visibleArticles.some((article) => article.category === category.slug),
      ),
    [visibleArticles],
  );

  const comingLaterCategories = useMemo(
    () =>
      IS_YOUTH_EARLY_ACCESS
        ? WIKI_CATEGORIES.filter((category) =>
            YOUTH_EARLY_ACCESS_HIDDEN_WIKI_CATEGORY_SLUGS.has(category.slug),
          )
        : [],
    [],
  );

  const visibleArticlesByCategory = useMemo(
    () => buildArticlesByCategory(visibleArticles),
    [visibleArticles],
  );

  const visibleArticleSlugs = useMemo(
    () => new Set(visibleArticles.map((article) => article.slug)),
    [visibleArticles],
  );

  const currentView = history[history.length - 1];

  const searchIndex = useMemo<SearchIndex>(
    () => buildSearchIndex(visibleArticles),
    [visibleArticles],
  );

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
  }, []);

  const searchResults = useMemo(
    () =>
      debouncedQuery
        ? searchWiki(searchIndex, visibleArticles, debouncedQuery)
        : [],
    [debouncedQuery, searchIndex, visibleArticles],
  );

  const navigate = useCallback((view: WikiView) => {
    setHistory((prev) => [...prev, view]);
    setMobileDrawerOpen(false);
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    navigateToArticleRef = (slug: string) => {
      navigate({ mode: "article", slug });
    };
    return () => {
      navigateToArticleRef = null;
    };
  }, [navigate]);

  const goBack = useCallback(() => {
    setHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    mainRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const effectiveView: WikiView = debouncedQuery
    ? { mode: "search", query: debouncedQuery }
    : currentView;

  const isVisibleArticle =
    effectiveView.mode === "article" &&
    visibleArticleSlugs.has(effectiveView.slug);

  return (
    <GameLayout>
      <div className="flex h-full">
        <div className="hidden lg:block">
          <WikiSidebar
            currentView={effectiveView}
            onNavigate={navigate}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            categories={visibleCategories}
            articlesByCategory={visibleArticlesByCategory}
            comingLaterCategories={comingLaterCategories}
          />
        </div>

        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 z-50 w-72">
              <WikiSidebar
                currentView={effectiveView}
                onNavigate={(view) => {
                  navigate(view);
                  setMobileDrawerOpen(false);
                }}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                categories={visibleCategories}
                articlesByCategory={visibleArticlesByCategory}
                comingLaterCategories={comingLaterCategories}
              />
            </div>
          </div>
        )}

        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto bg-zinc-950">
          <div className="p-4 sm:p-6">
            <div className="mb-4 flex items-center gap-3 lg:hidden">
              <button
                onClick={() => setMobileDrawerOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition hover:bg-zinc-800"
                aria-label="Open wiki sidebar"
              >
                <Menu size={16} />
              </button>
              <div className="relative flex-1">
                <input
                  type="search"
                  placeholder="Search Youth Scout guide..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  aria-label="Search Scout wiki"
                  className="min-h-11 w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-3 pr-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-emerald-500/50"
                />
              </div>
            </div>

            {effectiveView.mode !== "index" && effectiveView.mode !== "search" && (
              <button
                onClick={goBack}
                className="mb-4 flex min-h-11 items-center gap-1.5 text-sm text-zinc-400 transition hover:text-zinc-200"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}

            {effectiveView.mode === "search" ? (
              <>
                <ScopeNotice
                  title="Youth Scout Early Access scope"
                  body="Search results are filtered to systems available in this build so the handbook stays actionable."
                />
                <div className="mt-4">
                  <WikiSearchResults
                    query={effectiveView.query}
                    results={searchResults}
                    onNavigate={navigate}
                  />
                </div>
              </>
            ) : effectiveView.mode === "article" ? (
              <div className="space-y-4">
                {!isVisibleArticle ? (
                  <ScopeNotice
                    title="Full-game reference"
                    body="This article is preserved for a later build. Its systems are not available in Youth Scout Early Access, so the content is quarantined from browse, search, and direct links."
                  />
                ) : (
                  <WikiArticlePage slug={effectiveView.slug} onNavigate={navigate} />
                )}
              </div>
            ) : effectiveView.mode === "category" ? (
              <CategoryPage
                categorySlug={effectiveView.category}
                onNavigate={navigate}
                visibleArticlesByCategory={visibleArticlesByCategory}
              />
            ) : (
              <IndexPage
                onNavigate={navigate}
                categories={visibleCategories}
                visibleArticlesByCategory={visibleArticlesByCategory}
                comingLaterCategories={comingLaterCategories}
              />
            )}
          </div>
        </main>
      </div>
    </GameLayout>
  );
}

function IndexPage({
  onNavigate,
  categories,
  visibleArticlesByCategory,
  comingLaterCategories,
}: {
  onNavigate: (view: WikiView) => void;
  categories: WikiCategory[];
  visibleArticlesByCategory: Map<string, WikiArticle[]>;
  comingLaterCategories: WikiCategory[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
          <Book size={18} className="text-emerald-400" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Scout Handbook</h1>
          <p className="text-sm text-zinc-400">
            Youth Scout Early Access reference for the systems you can use right now.
          </p>
        </div>
      </div>

      <ScopeNotice
        title="Build-aware handbook"
        body="This view covers the complete Youth Scout career, including reports, world travel, relationships, equipment, training, agency growth, and regional offices. Other scouting specializations, first-team match control, and transfer negotiations remain held back."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => {
          const CategoryIcon = category.icon;
          const articleCount = visibleArticlesByCategory.get(category.slug)?.length ?? 0;
          return (
            <button
              key={category.slug}
              onClick={() => onNavigate({ mode: "category", category: category.slug })}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-left transition hover:border-zinc-700 hover:bg-zinc-800/50"
            >
              <div className="mb-2 flex items-center gap-2">
                <CategoryIcon
                  size={15}
                  className="text-emerald-400"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-zinc-100">
                  {category.title}
                </span>
              </div>
              <p className="mb-2 text-xs leading-relaxed text-zinc-400">
                {category.description}
              </p>
              <p className="text-[11px] text-zinc-500">
                {articleCount} article{articleCount === 1 ? "" : "s"}
              </p>
            </button>
          );
        })}
      </div>

      {comingLaterCategories.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Coming later
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {comingLaterCategories.map((category) => (
              <div
                key={category.slug}
                className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3"
              >
                <p className="text-sm font-semibold text-zinc-200">
                  {category.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  {category.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryPage({
  categorySlug,
  onNavigate,
  visibleArticlesByCategory,
}: {
  categorySlug: string;
  onNavigate: (view: WikiView) => void;
  visibleArticlesByCategory: Map<string, WikiArticle[]>;
}) {
  const category = CATEGORY_BY_SLUG.get(categorySlug);
  const articles = visibleArticlesByCategory.get(categorySlug) ?? [];

  if (!category) {
    return <div className="py-16 text-center text-sm text-zinc-500">Category not found.</div>;
  }

  if (articles.length === 0) {
    return (
      <div className="space-y-4">
        <ScopeNotice
          title="Held for a later build"
          body={`${category.title} is preserved for the full game, but its systems are not available in the current Youth Scout Early Access flow.`}
        />
      </div>
    );
  }

  const CategoryIcon = category.icon;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
          <CategoryIcon
            size={18}
            className="text-emerald-400"
            aria-hidden="true"
          />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">{category.title}</h1>
          <p className="text-xs text-zinc-500">{category.description}</p>
        </div>
      </div>

      <div className="space-y-2">
        {articles.map((article, index) => (
          <button
            key={article.slug}
            onClick={() => onNavigate({ mode: "article", slug: article.slug })}
            className="block w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-left transition hover:border-zinc-700 hover:bg-zinc-800/50"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] font-medium text-zinc-500">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-200">
                  {article.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-400">
                  {article.summary}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
