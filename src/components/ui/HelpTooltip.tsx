"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";

interface HelpTooltipProps {
  text: string;
  /** Icon size in pixels. Defaults to 13. */
  size?: number;
  /** Extra class names applied to the wrapper span. */
  className?: string;
}

/**
 * A small "?" icon that reveals an explanatory tooltip on hover.
 * Dark-themed, max-width 250px, with a fade-in animation and arrow.
 */
export function HelpTooltip({ text, size = 13, className = "" }: HelpTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<"top" | "bottom">("top");
  const iconRef = useRef<HTMLSpanElement>(null);

  const recalcPosition = useCallback(() => {
    if (!iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    // If too close to the top of the viewport, flip to bottom
    setPosition(rect.top < 80 ? "bottom" : "top");
  }, []);

  useEffect(() => {
    if (visible) recalcPosition();
  }, [visible, recalcPosition]);

  return (
    <span
      ref={iconRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      tabIndex={0}
      role="note"
      aria-label={text}
    >
      <HelpCircle
        size={size}
        className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-help"
        aria-hidden="true"
      />

      {visible && (
        <span
          className={`
            absolute z-50 max-w-[250px] px-3 py-2
            rounded-md border border-zinc-700 bg-zinc-800 text-zinc-200
            text-xs leading-relaxed shadow-lg
            tooltip-fade-in
            ${position === "top" ? "bottom-full mb-2" : "top-full mt-2"}
            left-1/2 -translate-x-1/2
          `}
          role="tooltip"
        >
          {text}
          {/* Arrow */}
          <span
            className={`
              absolute left-1/2 -translate-x-1/2
              border-[5px] border-transparent
              ${
                position === "top"
                  ? "top-full border-t-zinc-700"
                  : "bottom-full border-b-zinc-700"
              }
            `}
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
}

// ─── Attribute value tooltip ──────────────────────────────────────────────────

function ratingLabel(value: number): string {
  if (value >= 16) return "Excellent";
  if (value >= 11) return "Good";
  if (value >= 6) return "Average";
  return "Poor";
}

interface AttributeValueTooltipProps {
  value: number;
  confidence: number;
  children: ReactNode;
}

/**
 * Wraps an attribute value element and shows a contextual tooltip on hover
 * with the rating description and confidence level.
 */
export function AttributeValueTooltip({
  value,
  confidence,
  children,
}: AttributeValueTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<"top" | "bottom">("top");
  const ref = useRef<HTMLSpanElement>(null);

  const recalcPosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPosition(rect.top < 80 ? "bottom" : "top");
  }, []);

  useEffect(() => {
    if (visible) recalcPosition();
  }, [visible, recalcPosition]);

  const label = ratingLabel(value);
  const confidencePct = Math.round(confidence * 100);
  const tooltipText = `${value}/20 \u2014 ${label}. Confidence: ${confidencePct}%\n1-5: Poor, 6-10: Average, 11-15: Good, 16-20: Excellent`;

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center cursor-help"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          className={`
            absolute z-50 w-[220px] px-3 py-2
            rounded-md border border-zinc-700 bg-zinc-800 text-zinc-200
            text-xs leading-relaxed shadow-lg whitespace-pre-line
            tooltip-fade-in
            ${position === "top" ? "bottom-full mb-2" : "top-full mt-2"}
            left-1/2 -translate-x-1/2
          `}
          role="tooltip"
        >
          {tooltipText}
          <span
            className={`
              absolute left-1/2 -translate-x-1/2
              border-[5px] border-transparent
              ${
                position === "top"
                  ? "top-full border-t-zinc-700"
                  : "bottom-full border-b-zinc-700"
              }
            `}
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
}
