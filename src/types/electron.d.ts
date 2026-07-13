interface ElectronAPI {
  steam: {
    isAvailable: () => Promise<boolean>;
    unlockAchievement: (name: string) => Promise<void>;
    setCloudSave: (slot: string, data: string) => Promise<void>;
    getCloudSave: (slot: string) => Promise<string | null>;
    deleteCloudSave: (slot: string) => Promise<void>;
    getPlayerName: () => Promise<string>;
    setRichPresence: (key: string, value: string) => Promise<void>;
    resetAllAchievements: () => Promise<void>;
  };
  dialog: {
    saveFile: (data: string, filename: string) => Promise<boolean>;
    openFile: () => Promise<string | null>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
