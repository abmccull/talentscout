"use client";

import Image from "next/image";
import { hashString } from "@/lib/avatarGenerator";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";

export const YOUTH_PORTRAIT_COUNT = 16;

export function youthPortraitSlot(playerId: string): number {
  return (hashString(playerId) % YOUTH_PORTRAIT_COUNT) + 1;
}

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

export function YouthPortrait({
  playerId,
  size = 48,
  nationality,
  age,
  className = "",
  alt = "Youth portrait",
}: YouthPortraitProps) {
  return (
    <Image
      src={youthPortraitSrc(playerId)}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      className={`rounded-full object-cover ${sizeClasses[size] ?? sizeClasses[48]} ${className}`}
      draggable={false}
      onError={(event) => {
        const target = event.currentTarget;
        target.style.display = "none";
        const fallback = target.nextElementSibling;
        if (fallback instanceof HTMLElement) fallback.hidden = false;
      }}
    />
  );
}

export function YouthPortraitWithFallback(props: YouthPortraitProps) {
  return (
    <span className="relative inline-flex">
      <YouthPortrait {...props} />
      <span hidden>
        <PlayerAvatar
          playerId={props.playerId}
          size={props.size === 32 ? 48 : props.size}
          nationality={props.nationality}
          age={props.age}
          className={props.className}
        />
      </span>
    </span>
  );
}
