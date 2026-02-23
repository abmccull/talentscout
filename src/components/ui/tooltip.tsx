"use client";

import { useRef, useState } from "react";

export interface TooltipProps {
  content: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}

export function Tooltip({ content, side = "top", children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (immediate = false) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (immediate) {
      setVisible(true);
    } else {
      hoverTimerRef.current = setTimeout(() => setVisible(true), 300);
    }
  };

  const hide = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setVisible(false);
  };

  // Position classes for the tooltip card and arrow
  const positionClasses: Record<NonNullable<TooltipProps["side"]>, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  // Arrow position/shape classes
  const arrowClasses: Record<NonNullable<TooltipProps["side"]>, string> = {
    top: "top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-zinc-700",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-zinc-700",
    left: "left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-zinc-700",
    right: "right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-zinc-700",
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => show(false)}
      onMouseLeave={hide}
      onFocus={() => show(true)}
      onBlur={hide}
    >
      {children}
      <span
        role="tooltip"
        className={[
          "absolute z-50 w-max max-w-[240px] pointer-events-none",
          "bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-2 shadow-xl",
          "transition-opacity duration-150",
          visible ? "opacity-100" : "opacity-0",
          positionClasses[side],
        ].join(" ")}
      >
        {content}
        {/* Arrow */}
        <span
          aria-hidden="true"
          className={[
            "absolute w-0 h-0 border-4",
            arrowClasses[side],
          ].join(" ")}
        />
      </span>
    </span>
  );
}
