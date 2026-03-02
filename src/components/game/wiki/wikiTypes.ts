import type { LucideIcon } from "lucide-react";

// ─── View state ──────────────────────────────────────────────────────────────

export type WikiView =
  | { mode: "index" }
  | { mode: "category"; category: string }
  | { mode: "article"; slug: string }
  | { mode: "search"; query: string };

// ─── Data model ──────────────────────────────────────────────────────────────

export interface WikiCategory {
  slug: string;
  title: string;
  icon: LucideIcon;
  description: string;
  order: number;
}

export interface WikiArticle {
  slug: string;
  title: string;
  category: string;
  order: number;
  summary: string;
  searchText: string;
  content: React.ReactNode;
  related: string[];
  tags?: string[];
}
