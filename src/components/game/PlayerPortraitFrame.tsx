"use client";
/* eslint-disable @next/next/no-img-element -- Local immutable image packs are shared by static web and offline desktop. */
import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { PortraitResolution } from "@/engine/players/portraits/types";

export interface PlayerPortraitFrameProps {
  portrait?: PortraitResolution;
  size?: number;
  name: string;
  className?: string;
  eager?: boolean;
}

function PortraitPhoto({ path, name, size, eager, fallback }: { path: string; name: string; size: number; eager: boolean; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  return <img src={path} width={size} height={size} alt={name}
    className="h-full w-full object-cover object-top" decoding="async" loading={eager ? "eager" : "lazy"}
    onError={() => setFailed(true)} />;
}

/** Pure photographic presentation. Image failure never allocates or changes a face. */
export function PlayerPortraitFrame({ portrait, size = 48, name, className = "", eager = false }: PlayerPortraitFrameProps) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "—";
  const fallback = <span role="img" aria-label={name + " — photograph unavailable"}
    className="flex h-full w-full items-center justify-center bg-[#222827] font-medium tracking-widest text-[#b7c0b8]"
    style={{ fontSize: Math.max(11, Math.round(size * 0.24)) }}>{initials}</span>;
  return <span
    className={cn("inline-block h-[var(--portrait-size)] w-[var(--portrait-size)] shrink-0 overflow-hidden rounded-sm bg-[#171d1b] align-middle", className)}
    style={{ "--portrait-size": `${size}px` } as CSSProperties}
    data-portrait-identity={portrait?.identityId}
    data-portrait-age={portrait?.checkpoint}
    data-portrait-status={portrait?.status ?? "unavailable"}
  >
    {portrait?.status === "available"
      ? <PortraitPhoto key={portrait.asset.path} path={portrait.asset.path} name={name} size={size} eager={eager} fallback={fallback} />
      : fallback}
  </span>;
}
