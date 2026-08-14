"use client";

/**
 * SettingsApplier — zero-UI component that reflects settingsStore values onto
 * the <html> element as CSS classes, and renders the hidden SVG colorblind
 * simulation filters that those classes reference.
 *
 * Colorblind simulation matrices sourced from:
 *   Brettel, Viénot & Mollon (1997) and Machado, Oliveira & Fernandes (2009)
 *   as commonly used by browser accessibility tools.
 *
 * The SVG element is positioned off-screen (absolute, zero size) so it never
 * affects layout, but the filter definitions remain reachable by the CSS
 * `filter: url('#...')` rules in globals.css.
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

    // ── Font size ──────────────────────────────────────────────────────────
    html.classList.remove("font-small", "font-medium", "font-large");
    html.classList.add(`font-${fontSize}`);

    // ── Colorblind mode ────────────────────────────────────────────────────
    html.classList.remove("cb-protanopia", "cb-deuteranopia", "cb-tritanopia");
    if (colorblindMode !== "none") {
      html.classList.add(`cb-${colorblindMode}`);
    }

    // ── Reduced motion ─────────────────────────────────────────────────────
    html.classList.toggle("reduced-motion", reducedMotion);

    // ── Background intensity ───────────────────────────────────────────────
    html.classList.remove("bg-intensity-low", "bg-intensity-medium", "bg-intensity-high");
    html.classList.add(`bg-intensity-${backgroundIntensity}`);

    // ── Contrast ───────────────────────────────────────────────────────────
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

  // SVG filter definitions — hidden, zero-size, but present in the DOM so
  // the CSS url() references resolve. aria-hidden prevents screen readers
  // from announcing the decorative SVG content.
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        {/* Protanopia — reduced red sensitivity (red-green colour blindness) */}
        <filter id="protanopia-filter">
          <feColorMatrix
            type="matrix"
            values="0.567 0.433 0     0 0
                    0.558 0.442 0     0 0
                    0     0.242 0.758 0 0
                    0     0     0     1 0"
          />
        </filter>

        {/* Deuteranopia — reduced green sensitivity (most common form) */}
        <filter id="deuteranopia-filter">
          <feColorMatrix
            type="matrix"
            values="0.625 0.375 0   0 0
                    0.7   0.3   0   0 0
                    0     0.3   0.7 0 0
                    0     0     0   1 0"
          />
        </filter>

        {/* Tritanopia — reduced blue sensitivity (blue-yellow colour blindness) */}
        <filter id="tritanopia-filter">
          <feColorMatrix
            type="matrix"
            values="0.95 0.05  0     0 0
                    0    0.433 0.567 0 0
                    0    0.475 0.525 0 0
                    0    0     0     1 0"
          />
        </filter>
      </defs>
    </svg>
  );
}
