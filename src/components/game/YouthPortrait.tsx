"use client";

import { hashString } from "@/lib/avatarGenerator";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";

export const YOUTH_PORTRAIT_COUNT = 16;

export function youthPortraitSlot(playerId: string): number {
  return (hashString(playerId) % YOUTH_PORTRAIT_COUNT) + 1;
}

/** @deprecated Adult bust sheets are not the youth identity. Kept for save-era callers. */
export function youthPortraitSrc(playerId: string): string {
  const slot = String(youthPortraitSlot(playerId)).padStart(2, "0");
  return `/images/avatars/youth-${slot}.png`;
}

interface YouthPortraitProps {
  playerId: string;
  size?: 32 | 48 | 64 | 96;
  nationality?: string;
  age?: number;
  className?: string;
  alt?: string;
}

const sizeClasses: Record<number, string> = {
  32: "h-8 w-8",
  48: "h-12 w-12",
  64: "h-16 w-16",
  96: "h-24 w-24",
};

/**
 * One youth identity for Watch, Discovery, Desk, Prospects, and Reports.
 * Stylized and age-aware — never the adult 3D bust sheet, never a locked cartoon fallback.
 */
export function YouthPortrait({
  playerId,
  size = 48,
  nationality,
  age = 16,
  className = "",
  alt = "Youth portrait",
}: YouthPortraitProps) {
  return (
    <span
      className={`inline-flex overflow-hidden rounded-full ring-2 ring-[color:var(--primary)]/45 ring-offset-2 ring-offset-[#0b0e12] ${sizeClasses[size] ?? sizeClasses[48]} ${className}`}
    >
      <PlayerAvatar
        playerId={playerId}
        size={size === 32 ? 48 : size}
        nationality={nationality}
        age={age < 21 ? age : 16}
        className="h-full w-full"
        alt={alt}
      />
    </span>
  );
}

export function YouthPortraitWithFallback(props: YouthPortraitProps) {
  return <YouthPortrait {...props} />;
}
