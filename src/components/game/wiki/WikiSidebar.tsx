"use client";

import { useState, useEffect, useRef } from "react";
import { Search, ChevronRight, X } from "lucide-react";
import { WIKI_CATEGORIES } from "@/data/wiki/categories";
import { ARTICLES_BY_CATEGORY } from "@/data/wiki";
import type { WikiView } from "./wikiTypes";

interface WikiSidebarProps {
  currentView: WikiView;
  onNavigate: (view: WikiView) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function WikiSidebar({
  currentView,
  onNavigate,
  searchQuery,
  onSearchChange,
}: WikiSidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-expand the active category
  useEffect(() => {
    if (currentView.mode === "category") {
      setExpandedCategories((prev) => new Set([...prev, currentView.category]));
    }
    if (currentView.mode === "article") {
      // Find article's category and expand it
      for (const [cat, articles] of ARTICLES_BY_CATEGORY) {
        if (articles.some((a) => a.slug === currentView.slug)) {
          setExpandedCategories((prev) => new Set([...prev, cat]));
          break;
        }
      }
    }
  }, [currentView]);

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
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      {/* Search input */}
      <div className="border-b border-zinc-800 p-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="search"
            placeholder="Search wiki…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search wiki"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-8 pr-8 text-xs text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Category tree */}
      <nav
        className="flex-1 overflow-y-auto py-2"
        aria-label="Wiki categories"
      >
        {WIKI_CATEGORIES.map((cat) => {
          const articles = ARTICLES_BY_CATEGORY.get(cat.slug) ?? [];
          const isExpanded = expandedCategories.has(cat.slug);
          const isActiveCategory =
            currentView.mode === "category" &&
            currentView.category === cat.slug;
          const CatIcon = cat.icon;

          return (
            <div key={cat.slug}>
              {/* Category header */}
              <button
                onClick={() => {
                  toggleCategory(cat.slug);
                  onNavigate({ mode: "category", category: cat.slug });
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-zinc-800/50 ${
                  isActiveCategory
                    ? "bg-zinc-800/50 text-emerald-400"
                    : "text-zinc-300"
                }`}
              >
                <CatIcon size={13} className="shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate font-medium">{cat.title}</span>
                <ChevronRight
                  size={12}
                  className={`shrink-0 text-zinc-600 transition-transform duration-150 ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>

              {/* Article list */}
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
                        className={`block w-full truncate py-1.5 pl-9 pr-3 text-left text-[11px] transition hover:bg-zinc-800/30 ${
                          isActive
                            ? "text-emerald-400 font-medium"
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
    </aside>
  );
}
