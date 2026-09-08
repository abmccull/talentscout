"use client";

/**
 * SettingsApplier — zero-UI component that reflects settingsStore values onto
 * the <html> element as CSS classes. Colorblind modes remap semantic tokens
 * in globals.css; they do not simulate a deficiency.
 */

import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

export function SettingsApplier() {
  const fontSize = useSettingsStore((s) => s.fontSize);
  const colorblindMode = useSettingsStore((s) => s.colorblindMode);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const backgroundIntensity = useSettingsStore((s) => s.backgroundIntensity);
  const uiContrast = useSettingsStore((s) => s.uiContrast);
  const preferFullscreen = useSettingsStore((s) => s.preferFullscreen);
  const setSetting = useSettingsStore((s) => s.setSetting);

  useEffect(() => {
    const html = document.documentElement;

    html.classList.remove("font-small", "font-medium", "font-large");
    html.classList.add(`font-${fontSize}`);

    html.classList.remove("cb-protanopia", "cb-deuteranopia", "cb-tritanopia");
    if (colorblindMode !== "none") {
      html.classList.add(`cb-${colorblindMode}`);
    }

    html.classList.toggle("reduced-motion", reducedMotion);

    html.classList.remove("bg-intensity-low", "bg-intensity-medium", "bg-intensity-high");
    html.classList.add(`bg-intensity-${backgroundIntensity}`);

    html.classList.toggle("ui-contrast-high", uiContrast === "high");
  }, [fontSize, colorblindMode, reducedMotion, backgroundIntensity, uiContrast]);

  useEffect(() => {
    const desktopWindow = window.electronAPI?.window;
    if (desktopWindow?.onFullScreenChange) {
      return desktopWindow.onFullScreenChange((enabled) => {
        setSetting("preferFullscreen", enabled);
      });
    }
    const syncFullscreenPreference = () => {
      setSetting("preferFullscreen", Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", syncFullscreenPreference);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenPreference);
    };
  }, [setSetting]);

  useEffect(() => {
    const desktopWindow = window.electronAPI?.window;
    if (desktopWindow) {
      void desktopWindow.isFullScreen().then((isFullscreen) => {
        if (preferFullscreen === isFullscreen) return;
        void desktopWindow.setFullScreen(preferFullscreen);
      });
      return;
    }

    const isFullscreen = Boolean(document.fullscreenElement);
    if (preferFullscreen === isFullscreen) return;
    if (preferFullscreen) {
      void document.documentElement.requestFullscreen?.().catch(() => {
        // Browsers may block this without a recent gesture.
      });
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {
        // Ignore if the user already left fullscreen.
      });
    }
  }, [preferFullscreen]);

  return null;
}
