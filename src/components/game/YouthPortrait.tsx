"use client";

import { PlayerAvatar, type PlayerAvatarProps } from "./PlayerAvatar";

/** Youth, professional and historical views use one canonical portrait resolver. */
export function YouthPortrait(props: PlayerAvatarProps) {
  return <PlayerAvatar {...props} />;
}

export function YouthPortraitWithFallback(props: PlayerAvatarProps) {
  return <YouthPortrait {...props} />;
}

