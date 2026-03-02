"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Book, ArrowLeft, Menu } from "lucide-react";
import { GameLayout } from "../GameLayout";
import { WikiSidebar } from "./WikiSidebar";
import { WikiArticlePage } from "./WikiArticlePage";
import { WikiSearchResults } from "./WikiSearchResults";
import {
  buildSearchIndex,
  searchWiki,
  type SearchIndex,
} from "./wikiSearch";
import type { WikiView } from "./wikiTypes";
import { WIKI_CATEGORIES } from "@/data/wiki/categories";
import {
  ALL_ARTICLES,
  ARTICLES_BY_CATEGORY,
  CATEGORY_BY_SLUG,
} from "@/data/wiki";

// ─── Backward-compatible shim ────────────────────────────────────────────────

/** Maps old handbook chapter IDs to wiki article slugs */
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
  // Mismatched IDs from tutorial system
  scheduling: "scheduling-your-week",
  "career-progression": "career-tiers",
  finances: "income-sources",
  fatigue: "fatigue",
  reports: "perception-model",
  networking: "contact-types",
};

/**
 * Backward-compatible scrollToChapter replacement.
 * Tutorial system and hints call this — it maps the old chapter ID to a wiki article slug
 * and triggers navigation within the wiki.
 */
let _navigateToArticle: ((slug: string) => void) | null = null;

export function navigateToWikiArticle(slugOrChapterId: string): void {
  const slug = CHAPTER_TO_SLUG[slugOrChapterId] ?? slugOrChapterId;
  if (_navigateToArticle) {
    _navigateToArticle(slug);
  }
}

/** @deprecated Use navigateToWikiArticle instead */
export function scrollToChapter(chapterId: string): void {
  navigateToWikiArticle(chapterId);
}

export const HANDBOOK_CHAPTERS = Object.keys(CHAPTER_TO_SLUG);

// ─── Component ───────────────────────────────────────────────────────────────

export function WikiScreen() {
  const [history, setHistory] = useState<WikiView[]>([{ mode: "index" }]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mainRef = useRef<HTMLDivElement>(null);

  const currentView = history[history.length - 1];

  // Build search index once
  const searchIndex = useMemo<SearchIndex>(
    () => buildSearchIndex(ALL_ARTICLES),
    [],
  );

  // Debounced search
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
  }, []);

  // Search results
  const searchResults = useMemo(
    () =>
      debouncedQuery
        ? searchWiki(searchIndex, ALL_ARTICLES, debouncedQuery)
        : [],
    [searchIndex, debouncedQuery],
  );

  // Navigation
  const navigate = useCallback(
    (view: WikiView) => {
      setHistory((prev) => [...prev, view]);
      setMobileDrawerOpen(false);
      // Scroll to top
      mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
    },
    [],
  );

  // Register the navigation function for external callers
  useEffect(() => {
    _navigateToArticle = (slug: string) => {
      navigate({ mode: "article", slug });
    };
    return () => {
      _navigateToArticle = null;
    };
  }, [navigate]);

  const goBack = useCallback(() => {
    setHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  // Determine effective view (search overrides)
  const effectiveView: WikiView = debouncedQuery
    ? { mode: "search", query: debouncedQuery }
    : currentView;

  return (
    <GameLayout>
      <div className="flex h-full">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <WikiSidebar
            currentView={effectiveView}
            onNavigate={navigate}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
          />
        </div>

        {/* Mobile drawer overlay */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 z-50 w-64">
              <WikiSidebar
                currentView={effectiveView}
                onNavigate={(view) => {
                  navigate(view);
                  setMobileDrawerOpen(false);
                }}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
              />
            </div>
          </div>
        )}

        {/* Main content */}
        <main
          ref={mainRef}
          className="min-w-0 flex-1 overflow-y-auto bg-zinc-950"
        >
          <div className="p-6">
            {/* Mobile header + search */}
            <div className="mb-4 flex items-center gap-3 lg:hidden">
              <button
                onClick={() => setMobileDrawerOpen(true)}
                className="rounded-lg border border-zinc-800 p-2 text-zinc-400 transition hover:bg-zinc-800"
                aria-label="Open sidebar"
              >
                <Menu size={16} />
              </button>
              <div className="relative flex-1">
                <input
                  type="search"
                  placeholder="Search wiki…"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  aria-label="Search wiki"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-3 pr-3 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-emerald-500/50"
                />
              </div>
            </div>

            {/* Back button (when not on index) */}
            {effectiveView.mode !== "index" && effectiveView.mode !== "search" && (
              <button
                onClick={goBack}
                className="mb-4 flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-300"
              >
                <ArrowLeft size={12} />
                Back
              </button>
            )}

            {/* Content area */}
            {effectiveView.mode === "search" ? (
              <WikiSearchResults
                query={effectiveView.query}
                results={searchResults}
                onNavigate={navigate}
              />
            ) : effectiveView.mode === "article" ? (
              <WikiArticlePage
                slug={effectiveView.slug}
                onNavigate={navigate}
              />
            ) : effectiveView.mode === "category" ? (
              <CategoryPage
                categorySlug={effectiveView.category}
                onNavigate={navigate}
              />
            ) : (
              <IndexPage onNavigate={navigate} />
            )}
          </div>
        </main>
      </div>
    </GameLayout>
  );
}

// ─── Index page ──────────────────────────────────────────────────────────────

function IndexPage({
  onNavigate,
}: {
  onNavigate: (view: WikiView) => void;
}) {
  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
          <Book size={18} className="text-emerald-400" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">
            Scout&apos;s Wiki
          </h1>
          <p className="text-xs text-zinc-500">
            Complete reference guide to every game system
          </p>
        </div>
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WIKI_CATEGORIES.map((cat) => {
          const CatIcon = cat.icon;
          const articleCount = ARTICLES_BY_CATEGORY.get(cat.slug)?.length ?? 0;
          return (
            <button
              key={cat.slug}
              onClick={() =>
                onNavigate({ mode: "category", category: cat.slug })
              }
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left transition hover:border-zinc-700 hover:bg-zinc-800/50"
            >
              <div className="mb-2 flex items-center gap-2">
                <CatIcon
                  size={15}
                  className="text-emerald-400"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-zinc-100">
                  {cat.title}
                </span>
              </div>
              <p className="mb-2 text-xs leading-relaxed text-zinc-400">
                {cat.description}
              </p>
              <p className="text-[10px] text-zinc-600">
                {articleCount} article{articleCount !== 1 ? "s" : ""}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Category page ───────────────────────────────────────────────────────────

function CategoryPage({
  categorySlug,
  onNavigate,
}: {
  categorySlug: string;
  onNavigate: (view: WikiView) => void;
}) {
  const category = CATEGORY_BY_SLUG.get(categorySlug);
  const articles = ARTICLES_BY_CATEGORY.get(categorySlug) ?? [];

  if (!category) {
    return (
      <div className="py-16 text-center text-sm text-zinc-500">
        Category not found.
      </div>
    );
  }

  const CatIcon = category.icon;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
          <CatIcon size={18} className="text-emerald-400" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">{category.title}</h1>
          <p className="text-xs text-zinc-500">{category.description}</p>
        </div>
      </div>

      <div className="space-y-2">
        {articles.map((article, i) => (
          <button
            key={article.slug}
            onClick={() =>
              onNavigate({ mode: "article", slug: article.slug })
            }
            className="block w-full rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-left transition hover:border-zinc-700 hover:bg-zinc-800/50"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] font-medium text-zinc-500">
                {i + 1}
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
