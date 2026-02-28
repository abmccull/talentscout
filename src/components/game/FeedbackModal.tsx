"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useGameStore } from "@/stores/gameStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  X,
  Loader2,
  Check,
  Bug,
  Lightbulb,
  Gamepad2,
  MessageSquare,
} from "lucide-react";
import {
  submitFeedback,
  type FeedbackCategory,
} from "@/lib/feedbackService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CategoryConfig {
  id: FeedbackCategory;
  label: string;
  icon: typeof Bug;
  titlePlaceholder: string;
  descPlaceholder: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    id: "bug",
    label: "Bug Report",
    icon: Bug,
    titlePlaceholder: "Game freezes when advancing week",
    descPlaceholder: "What happened? What did you expect?",
  },
  {
    id: "feature",
    label: "Feature Request",
    icon: Lightbulb,
    titlePlaceholder: "Add scout comparison view",
    descPlaceholder:
      "Describe the feature and why it would improve the game",
  },
  {
    id: "gameplay",
    label: "Gameplay",
    icon: Gamepad2,
    titlePlaceholder: "Hard difficulty feels too punishing",
    descPlaceholder: "What feels off?",
  },
  {
    id: "other",
    label: "Other",
    icon: MessageSquare,
    titlePlaceholder: "General feedback",
    descPlaceholder: "Tell us what's on your mind",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const gameState = useGameStore((s) => s.gameState);

  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(autoCloseTimerRef.current), []);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCategory("bug");
      setTitle("");
      setDescription("");
      setEmail("");
      setError(null);
      setShowSuccess(false);
    }
  }, [isOpen]);

  // Escape key closes the modal
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [isOpen, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !description.trim()) return;
    setIsSubmitting(true);
    setError(null);

    const result = await submitFeedback({
      category,
      title: title.trim(),
      description: description.trim(),
      contactEmail: email.trim() || undefined,
    });

    setIsSubmitting(false);

    if (result.success) {
      setShowSuccess(true);
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = setTimeout(() => {
        onClose();
      }, 2000);
    } else {
      setError(result.error ?? "Something went wrong");
    }
  }, [category, title, description, email, onClose]);

  if (!isOpen) return null;

  const activeCfg = CATEGORIES.find((c) => c.id === category)!;

  // Build context summary for display
  const contextParts: string[] = [];
  if (gameState) {
    contextParts.push(`Week ${gameState.currentWeek}`);
    contextParts.push(`Season ${gameState.currentSeason}`);
    contextParts.push(gameState.difficulty ?? "Normal");
    const spec = gameState.scout.primarySpecialization;
    contextParts.push(spec.charAt(0).toUpperCase() + spec.slice(1));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Send Feedback"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="w-full max-w-lg border-[#27272a] bg-[#141414]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg font-bold text-white">
            Send Feedback
          </CardTitle>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="Close feedback dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </CardHeader>

        <CardContent className="space-y-4">
          {showSuccess ? (
            /* ── Success state ─────────────────────────────────────── */
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                <Check
                  size={24}
                  className="text-emerald-400"
                  aria-hidden="true"
                />
              </div>
              <p className="text-sm font-medium text-emerald-400">
                Thanks! Your feedback helps us improve TalentScout.
              </p>
            </div>
          ) : (
            <>
              {/* ── Category tabs ───────────────────────────────────── */}
              <div
                className="flex gap-1 rounded-md bg-[#0c0c0c] p-1"
                role="tablist"
              >
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      role="tab"
                      aria-selected={category === cat.id}
                      onClick={() => setCategory(cat.id)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-2 text-xs font-medium transition ${
                        category === cat.id
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      <Icon size={13} aria-hidden="true" />
                      <span className="hidden sm:inline">{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* ── Title ───────────────────────────────────────────── */}
              <div className="space-y-1.5">
                <label
                  htmlFor="feedback-title"
                  className="text-sm font-medium text-zinc-300"
                >
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  id="feedback-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={activeCfg.titlePlaceholder}
                  className="w-full rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  maxLength={200}
                />
              </div>

              {/* ── Description ─────────────────────────────────────── */}
              <div className="space-y-1.5">
                <label
                  htmlFor="feedback-desc"
                  className="text-sm font-medium text-zinc-300"
                >
                  Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  id="feedback-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={activeCfg.descPlaceholder}
                  rows={4}
                  className="w-full rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  maxLength={2000}
                />
              </div>

              {/* ── Email (optional) ────────────────────────────────── */}
              <div className="space-y-1.5">
                <label
                  htmlFor="feedback-email"
                  className="text-sm font-medium text-zinc-300"
                >
                  Email{" "}
                  <span className="text-xs text-zinc-500">(optional)</span>
                </label>
                <input
                  id="feedback-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
              </div>

              {/* ── Auto-context banner ─────────────────────────────── */}
              {contextParts.length > 0 && (
                <p className="text-xs text-zinc-600">
                  We&apos;ll auto-attach: {contextParts.join(", ")}
                </p>
              )}

              {/* ── Error ───────────────────────────────────────────── */}
              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}

              {/* ── Submit button ───────────────────────────────────── */}
              <Button
                className="w-full"
                onClick={() => void handleSubmit()}
                disabled={
                  isSubmitting || !title.trim() || !description.trim()
                }
              >
                {isSubmitting ? (
                  <Loader2
                    size={14}
                    className="mr-2 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                {isSubmitting ? "Submitting..." : "Submit Feedback"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
