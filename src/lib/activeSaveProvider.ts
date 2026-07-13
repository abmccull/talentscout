import { BETA_CLOUD_SAVES_ENABLED } from "@/config/beta";

export async function getActiveSaveProvider() {
  const [{ useAuthStore }, { createSaveProvider }] = await Promise.all([
    import("@/stores/authStore"),
    import("@/lib/saveProvider"),
  ]);
  const { isAuthenticated, userId, cloudSaveEnabled } = useAuthStore.getState();

  return createSaveProvider({
    userId:
      BETA_CLOUD_SAVES_ENABLED && isAuthenticated && cloudSaveEnabled
        ? userId
        : null,
    includeSteam: true,
  });
}

export async function isSupabaseCloudSaveActive(): Promise<boolean> {
  const { useAuthStore } = await import("@/stores/authStore");
  const { isAuthenticated, userId, cloudSaveEnabled } = useAuthStore.getState();
  return Boolean(
    BETA_CLOUD_SAVES_ENABLED && isAuthenticated && userId && cloudSaveEnabled,
  );
}
