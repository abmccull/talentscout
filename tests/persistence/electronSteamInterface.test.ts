import { afterEach, describe, expect, it, vi } from "vitest";

import { ElectronSteamInterface } from "@/lib/steam/electronSteamInterface";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("ElectronSteamInterface cloud lifecycle", () => {
  it("bridges save, load, and delete through the same slot contract", async () => {
    const setCloudSave = vi.fn(async () => undefined);
    const getCloudSave = vi.fn(async () => "save-data");
    const deleteCloudSave = vi.fn(async () => undefined);

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        electronAPI: {
          steam: {
            isAvailable: async () => true,
            unlockAchievement: async () => undefined,
            setCloudSave,
            getCloudSave,
            deleteCloudSave,
            getPlayerName: async () => "Steam Scout",
            setRichPresence: async () => undefined,
            resetAllAchievements: async () => undefined,
          },
        },
      },
    });

    const steam = new ElectronSteamInterface();
    await vi.waitFor(() => expect(steam.isAvailable()).toBe(true));

    await steam.setCloudSave(3, "save-data");
    await expect(steam.getCloudSave(3)).resolves.toBe("save-data");
    await steam.deleteCloudSave(3);

    expect(setCloudSave).toHaveBeenCalledWith("3", "save-data");
    expect(getCloudSave).toHaveBeenCalledWith("3");
    expect(deleteCloudSave).toHaveBeenCalledWith("3");
  });
});
