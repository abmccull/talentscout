import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authBoundary = vi.hoisted(() => ({
  clearStorage: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  clearSupabaseAuthSessionStorage: authBoundary.clearStorage,
  supabase: {
    auth: {
      getSession: authBoundary.getSession,
      onAuthStateChange: authBoundary.onAuthStateChange,
      signInWithPassword: authBoundary.signInWithPassword,
      signUp: authBoundary.signUp,
      signInWithOAuth: authBoundary.signInWithOAuth,
      signOut: authBoundary.signOut,
    },
  },
}));

import { BETA_CLOUD_SAVES_MESSAGE } from "@/config/beta";
import { useAuthStore } from "@/stores/authStore";

describe("disabled cloud feature boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      isLoading: true,
      isAuthenticated: true,
      userId: "legacy-user",
      displayName: "Legacy Scout",
      cloudSaveEnabled: true,
    });
  });

  it("clears legacy auth state without restoring or listening for sessions", () => {
    useAuthStore.getState().initialize();

    expect(authBoundary.clearStorage).toHaveBeenCalledOnce();
    expect(authBoundary.getSession).not.toHaveBeenCalled();
    expect(authBoundary.onAuthStateChange).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      isLoading: false,
      isAuthenticated: false,
      userId: null,
      displayName: null,
      cloudSaveEnabled: false,
    });
  });

  it("refuses dormant sign-in entry points and cannot enable sync indirectly", async () => {
    await expect(
      useAuthStore.getState().signInWithEmail("scout@example.com", "secret"),
    ).rejects.toThrow(BETA_CLOUD_SAVES_MESSAGE);
    await expect(
      useAuthStore.getState().signUpWithEmail("scout@example.com", "secret"),
    ).rejects.toThrow(BETA_CLOUD_SAVES_MESSAGE);
    await expect(
      useAuthStore.getState().signInWithOAuth("google"),
    ).rejects.toThrow(BETA_CLOUD_SAVES_MESSAGE);

    useAuthStore.getState().toggleCloudSave(true);
    expect(useAuthStore.getState().cloudSaveEnabled).toBe(false);
    expect(authBoundary.signInWithPassword).not.toHaveBeenCalled();
    expect(authBoundary.signUp).not.toHaveBeenCalled();
    expect(authBoundary.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("configures the shared Supabase client without browser auth persistence", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/supabase.ts"),
      "utf8",
    );
    expect(source).toContain("persistSession: BETA_CLOUD_SAVES_ENABLED");
    expect(source).toContain("autoRefreshToken: BETA_CLOUD_SAVES_ENABLED");
    expect(source).toContain("detectSessionInUrl: BETA_CLOUD_SAVES_ENABLED");
  });
});
