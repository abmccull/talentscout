import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";

const loads = vi.hoisted(() => ({ supabase: 0, sentry: 0 }));
vi.mock("@supabase/supabase-js", () => {
  loads.supabase += 1;
  throw new Error("Optional Supabase SDK must stay unloaded during offline startup");
});
vi.mock("@sentry/nextjs", () => {
  loads.sentry += 1;
  throw new Error("Optional Sentry SDK must stay unloaded without a renderer DSN");
});

describe("offline optional-service loading", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("lists local saves and clears disabled cloud state without either network SDK", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const [{ createSaveProvider }, { useAuthStore }, { isFeedbackSubmissionAvailable }] = await Promise.all([
      import("@/lib/saveProvider"),
      import("@/stores/authStore"),
      import("@/lib/feedbackService"),
    ]);
    useAuthStore.getState().initialize();
    await expect(createSaveProvider({ userId: null, includeSteam: false }).listSaves())
      .resolves.toEqual([]);
    expect(useAuthStore.getState()).toMatchObject({ isLoading: false, isAuthenticated: false });
    expect(isFeedbackSubmissionAvailable()).toBe(false);
    expect(loads).toEqual({ supabase: 0, sentry: 0 });
  });

  it("does not import reporting for an unconfigured renderer error", async () => {
    vi.stubGlobal("window", {});
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const { reportRendererError } = await import("@/lib/reportRendererError");
    await expect(reportRendererError(new Error("local only"))).resolves.toBeUndefined();
    expect(loads.sentry).toBe(0);
  });
});
