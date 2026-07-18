"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ChevronRight, X } from "lucide-react";
import type { WikiArticle, WikiCategory, WikiView } from "./wikiTypes";

interface WikiSidebarProps {
  currentView: WikiView;
  onNavigate: (view: WikiView) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  categories: WikiCategory[];
  articlesByCategory: Map<string, WikiArticle[]>;
  comingLaterCategories: WikiCategory[];
}

export function WikiSidebar({
  currentView,
  onNavigate,
  searchQuery,
  onSearchChange,
  categories,
  articlesByCategory,
  comingLaterCategories,
}: WikiSidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentView.mode === "category") {
      setExpandedCategories((prev) => new Set([...prev, currentView.category]));
    }
    if (currentView.mode === "article") {
      for (const [cat, articles] of articlesByCategory) {
        if (articles.some((a) => a.slug === currentView.slug)) {
          setExpandedCategories((prev) => new Set([...prev, cat]));
          break;
        }
      }
    }
  }, [articlesByCategory, currentView]);

  function toggleCategory(slug: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 p-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            placeholder="Search handbook..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search handbook"
            className="min-h-11 w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-11 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2" aria-label="Handbook chapters">
        {categories.map((cat) => {
          const articles = articlesByCategory.get(cat.slug) ?? [];
          const isExpanded = expandedCategories.has(cat.slug);
          const isActiveCategory =
            currentView.mode === "category" && currentView.category === cat.slug;
          const CatIcon = cat.icon;

          return (
            <div key={cat.slug}>
              <button
                onClick={() => {
                  toggleCategory(cat.slug);
                  onNavigate({ mode: "category", category: cat.slug });
                }}
                aria-expanded={isExpanded}
                className={`flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-zinc-800/50 ${
                  isActiveCategory
                    ? "bg-zinc-800/50 text-emerald-400"
                    : "text-zinc-300"
                }`}
              >
                <CatIcon size={14} className="shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate font-medium">{cat.title}</span>
                <ChevronRight
                  size={13}
                  className={`shrink-0 text-zinc-600 transition-transform duration-150 ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>

              {isExpanded && articles.length > 0 && (
                <div className="pb-1">
                  {articles.map((article) => {
                    const isActive =
                      currentView.mode === "article" &&
                      currentView.slug === article.slug;
                    return (
                      <button
                        key={article.slug}
                        onClick={() =>
                          onNavigate({
                            mode: "article",
                            slug: article.slug,
                          })
                        }
                        className={`block min-h-10 w-full truncate py-2 pl-9 pr-3 text-left text-xs transition hover:bg-zinc-800/30 ${
                          isActive
                            ? "font-medium text-emerald-400"
                            : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        {article.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {comingLaterCategories.length > 0 && (
        <div className="border-t border-zinc-800 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Coming later
          </p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            {comingLaterCategories.map((category) => category.title).join(", ")}
          </p>
        </div>
      )}
    </aside>
  );
}
