"use client";

const AVATAR_COUNT = 6;

interface ScoutAvatarProps {
  avatarId: number;
  size?: 32 | 48 | 64 | 96;
  className?: string;
}

const sizeClasses: Record<number, string> = {
  32: "h-8 w-8",
  48: "h-12 w-12",
  64: "h-16 w-16",
  96: "h-24 w-24",
};

export function ScoutAvatar({ avatarId, size = 48, className = "" }: ScoutAvatarProps) {
  const safeId = ((((avatarId ?? 1) - 1) % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT + 1;

  return (
    <img
      src={`/images/avatars/scout-${safeId}.png`}
      alt="Scout portrait"
      className={`rounded-full object-cover ${sizeClasses[size] ?? sizeClasses[48]} ${className}`}
      draggable={false}
    />
  );
}
