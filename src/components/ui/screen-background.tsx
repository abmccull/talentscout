"use client";

/**
 * ScreenBackground — renders a full-bleed background image with a dark overlay.
 *
 * Place as the first child inside a `relative` container. The overlay ensures
 * text readability while the image adds atmosphere.
 */

interface ScreenBackgroundProps {
  src: string;
  /** Overlay opacity 0–1 (default 0.75 — quite dark, good for text readability). */
  opacity?: number;
  /** Optional CSS object-position (default "center"). */
  position?: string;
}

export function ScreenBackground({
  src,
  opacity = 0.75,
  position = "center",
}: ScreenBackgroundProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: position }}
        loading="eager"
      />
      <div
        className="absolute inset-0 bg-[#0a0a0a]"
        style={{ opacity }}
      />
    </div>
  );
}
