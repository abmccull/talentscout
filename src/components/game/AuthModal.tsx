"use client";

import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Mail, Github, Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthTab = "signIn" | "signUp";

// ─── AuthModal ────────────────────────────────────────────────────────────────

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { signInWithEmail, signUpWithEmail, signInWithOAuth } = useAuthStore();

  const [activeTab, setActiveTab] = useState<AuthTab>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const firstInputRef = useRef<HTMLInputElement>(null);

  // Focus the email field when the modal opens — all hooks must precede any
  // early return, so we guard with `isOpen` inside the effect body.
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => firstInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setError(null);
    setSuccessMessage(null);
  };

  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    resetForm();
  };

  const validateForm = (): string | null => {
    if (!email.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return "Please enter a valid email address.";
    if (!password) return "Password is required.";
    if (activeTab === "signUp" && password.length < 6)
      return "Password must be at least 6 characters.";
    return null;
  };

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      if (activeTab === "signIn") {
        await signInWithEmail(email, password);
        resetForm();
        onClose();
      } else {
        await signUpWithEmail(email, password);
        setSuccessMessage(
          "Account created! Check your email to confirm your account.",
        );
        resetForm();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOAuth = async (provider: "google" | "github") => {
    setError(null);
    try {
      await signInWithOAuth(provider);
      // OAuth redirects the browser away; the modal can close optimistically.
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "OAuth sign-in failed.";
      setError(message);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={activeTab === "signIn" ? "Sign in" : "Create account"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="relative w-full max-w-sm border-[#27272a] bg-[#141414]">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1.5 text-zinc-500 transition hover:bg-[#27272a] hover:text-white"
          aria-label="Close dialog"
        >
          <X size={16} aria-hidden="true" />
        </button>

        <CardHeader className="pb-4">
          <CardTitle className="text-xl">
            {activeTab === "signIn" ? "Sign In" : "Create Account"}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Tab switcher */}
          <div
            className="flex rounded-md border border-[#27272a] p-1"
            role="tablist"
          >
            <button
              role="tab"
              aria-selected={activeTab === "signIn"}
              onClick={() => switchTab("signIn")}
              className={`flex-1 rounded py-1.5 text-sm font-medium transition ${
                activeTab === "signIn"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "signUp"}
              onClick={() => switchTab("signUp")}
              className={`flex-1 rounded py-1.5 text-sm font-medium transition ${
                activeTab === "signUp"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Email / password form */}
          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
            <div className="space-y-3">
              {/* Email */}
              <div>
                <label
                  htmlFor="auth-email"
                  className="mb-1 block text-xs font-medium text-zinc-400"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-email"
                    ref={firstInputRef}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    aria-invalid={!!error}
                    aria-describedby={error ? "auth-error" : undefined}
                    className="w-full rounded-md border border-[#27272a] bg-[#0c0c0c] py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="auth-password"
                  className="mb-1 block text-xs font-medium text-zinc-400"
                >
                  Password
                  {activeTab === "signUp" && (
                    <span className="ml-1 text-zinc-600">(min. 6 chars)</span>
                  )}
                </label>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={
                    activeTab === "signIn" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-invalid={!!error}
                  aria-describedby={error ? "auth-error" : undefined}
                  className="w-full rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>

              {/* Error message */}
              {error && (
                <p
                  id="auth-error"
                  role="alert"
                  className="text-xs text-red-400"
                >
                  {error}
                </p>
              )}

              {/* Sign-up confirmation message */}
              {successMessage && (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-xs text-emerald-400"
                >
                  {successMessage}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2
                      size={14}
                      className="mr-2 animate-spin"
                      aria-hidden="true"
                    />
                    {activeTab === "signIn"
                      ? "Signing in…"
                      : "Creating account…"}
                  </>
                ) : activeTab === "signIn" ? (
                  "Sign In"
                ) : (
                  "Create Account"
                )}
              </Button>
            </div>
          </form>

          {/* Divider */}
          <div className="relative flex items-center gap-3">
            <div className="h-px flex-1 bg-[#27272a]" />
            <span className="text-xs text-zinc-600">or continue with</span>
            <div className="h-px flex-1 bg-[#27272a]" />
          </div>

          {/* OAuth buttons */}
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void handleOAuth("google")}
              disabled={isSubmitting}
            >
              {/* Inline Google wordmark icon — no external image dependency */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="mr-2"
              >
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void handleOAuth("github")}
              disabled={isSubmitting}
            >
              <Github size={14} className="mr-2" aria-hidden="true" />
              Sign in with GitHub
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
