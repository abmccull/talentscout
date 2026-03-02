"use client";

import { ChevronRight } from "lucide-react";
import { ARTICLE_BY_SLUG, CATEGORY_BY_SLUG, ARTICLES_BY_CATEGORY } from "@/data/wiki";
import type { WikiView } from "./wikiTypes";

interface WikiArticlePageProps {
  slug: string;
  onNavigate: (view: WikiView) => void;
}

export function WikiArticlePage({ slug, onNavigate }: WikiArticlePageProps) {
  const article = ARTICLE_BY_SLUG.get(slug);
  if (!article) {
    return (
      <div className="py-16 text-center text-sm text-zinc-500">
        Article not found.
      </div>
    );
  }

  const category = CATEGORY_BY_SLUG.get(article.category);
  const relatedArticles = article.related
    .map((r) => ARTICLE_BY_SLUG.get(r))
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl">
      {/* Breadcrumb */}
      <nav
        className="mb-4 flex items-center gap-1.5 text-xs text-zinc-500"
        aria-label="Breadcrumb"
      >
        <button
          onClick={() => onNavigate({ mode: "index" })}
          className="transition hover:text-zinc-300"
        >
          Wiki
        </button>
        <ChevronRight size={10} aria-hidden="true" />
        {category && (
          <>
            <button
              onClick={() =>
                onNavigate({ mode: "category", category: article.category })
              }
              className="transition hover:text-zinc-300"
            >
              {category.title}
            </button>
            <ChevronRight size={10} aria-hidden="true" />
          </>
        )}
        <span className="text-zinc-300">{article.title}</span>
      </nav>

      {/* Title */}
      <h1 className="mb-1 text-xl font-bold text-zinc-100">{article.title}</h1>
      <p className="mb-6 text-xs text-zinc-500">{article.summary}</p>

      {/* Content */}
      <div className="wiki-article-content">{article.content}</div>

      {/* Related articles */}
      {relatedArticles.length > 0 && (
        <div className="mt-8 border-t border-zinc-800 pt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Related Articles
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {relatedArticles.map((related) => {
              if (!related) return null;
              const relCat = CATEGORY_BY_SLUG.get(related.category);
              return (
                <button
                  key={related.slug}
                  onClick={() =>
                    onNavigate({ mode: "article", slug: related.slug })
                  }
                  className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-left transition hover:border-zinc-700 hover:bg-zinc-800/50"
                >
                  <p className="text-xs font-semibold text-zinc-200">
                    {related.title}
                  </p>
                  {relCat && (
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      {relCat.title}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                    {related.summary}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Prev/Next within category */}
      <CategoryNavigation
        currentSlug={slug}
        category={article.category}
        onNavigate={onNavigate}
      />
    </div>
  );
}

// ─── Prev/Next nav within a category ─────────────────────────────────────────

function CategoryNavigation({
  currentSlug,
  category,
  onNavigate,
}: {
  currentSlug: string;
  category: string;
  onNavigate: (view: WikiView) => void;
}) {
  const articles = ARTICLES_BY_CATEGORY.get(category) ?? [];
  const currentIndex = articles.findIndex((a) => a.slug === currentSlug);
  if (currentIndex === -1) return null;

  const prev = currentIndex > 0 ? articles[currentIndex - 1] : null;
  const next =
    currentIndex < articles.length - 1 ? articles[currentIndex + 1] : null;

  if (!prev && !next) return null;

  return (
    <div className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-4">
      {prev ? (
        <button
          onClick={() => onNavigate({ mode: "article", slug: prev.slug })}
          className="text-xs text-zinc-500 transition hover:text-emerald-400"
        >
          &larr; {prev.title}
        </button>
      ) : (
        <span />
      )}
      {next ? (
        <button
          onClick={() => onNavigate({ mode: "article", slug: next.slug })}
          className="text-xs text-zinc-500 transition hover:text-emerald-400"
        >
          {next.title} &rarr;
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
