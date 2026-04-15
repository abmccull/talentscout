import { useAuthStore } from "@/stores/authStore";
import { createSaveProvider } from "@/lib/saveProvider";
import { BETA_CLOUD_SAVES_ENABLED } from "@/config/beta";

export function getActiveSaveProvider() {
  const { isAuthenticated, userId, cloudSaveEnabled } = useAuthStore.getState();

  return createSaveProvider({
    userId:
      BETA_CLOUD_SAVES_ENABLED && isAuthenticated && cloudSaveEnabled
        ? userId
        : null,
    includeSteam: false,
  });
}

export function isSupabaseCloudSaveActive(): boolean {
  const { isAuthenticated, userId, cloudSaveEnabled } = useAuthStore.getState();
  return Boolean(
    BETA_CLOUD_SAVES_ENABLED && isAuthenticated && userId && cloudSaveEnabled,
  );
}
