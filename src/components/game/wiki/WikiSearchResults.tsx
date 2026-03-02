"use client";

import { FileText, Tag, BookOpen, AlignLeft } from "lucide-react";
import type { SearchResult } from "./wikiSearch";
import { CATEGORY_BY_SLUG } from "@/data/wiki";
import type { WikiView } from "./wikiTypes";

interface WikiSearchResultsProps {
  query: string;
  results: SearchResult[];
  onNavigate: (view: WikiView) => void;
}

const MATCH_TYPE_CONFIG: Record<
  SearchResult["matchType"],
  { label: string; icon: React.ElementType; color: string }
> = {
  title: {
    label: "Title",
    icon: BookOpen,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  summary: {
    label: "Summary",
    icon: FileText,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  tag: {
    label: "Tag",
    icon: Tag,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  content: {
    label: "Content",
    icon: AlignLeft,
    color: "text-zinc-400 bg-zinc-800 border-zinc-700",
  },
};

export function WikiSearchResults({
  query,
  results,
  onNavigate,
}: WikiSearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-zinc-500">
          No results for &ldquo;{query}&rdquo;
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          Try different keywords or browse the categories in the sidebar.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-xs text-zinc-500">
        {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;
        {query}&rdquo;
      </p>
      <div className="space-y-2">
        {results.map((result) => {
          const category = CATEGORY_BY_SLUG.get(result.category);
          const matchConfig = MATCH_TYPE_CONFIG[result.matchType];
          const MatchIcon = matchConfig.icon;

          return (
            <button
              key={result.slug}
              onClick={() =>
                onNavigate({ mode: "article", slug: result.slug })
              }
              className="block w-full rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-left transition hover:border-zinc-700 hover:bg-zinc-800/50"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-200">
                  {result.title}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${matchConfig.color}`}
                >
                  <MatchIcon size={9} />
                  {matchConfig.label}
                </span>
              </div>
              {category && (
                <p className="mb-1 text-[10px] text-zinc-500">
                  {category.title}
                </p>
              )}
              <p className="text-xs leading-relaxed text-zinc-400">
                {result.snippet ?? result.summary}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
