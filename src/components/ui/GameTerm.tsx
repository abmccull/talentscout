"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  createContext,
  useContext,
} from "react";
import { getGameConcept, type GameConcept } from "@/data/gameConcepts";

// ---------------------------------------------------------------------------
// Nesting depth context — prevents infinite recursion
// ---------------------------------------------------------------------------

const NestingDepthContext = createContext(0);

const MAX_NESTING_DEPTH = 3;

// ---------------------------------------------------------------------------
// Concept reference parser
// ---------------------------------------------------------------------------

/**
 * Parses a definition string and replaces `[[concept-key]]` markers with
 * nested <GameTerm> components. This is how definitions can reference other
 * concepts to create CK3-style nested tooltips.
 *
 * Example: "Your [[reputation]] determines your [[career-tier]]."
 */
function renderDefinition(text: string): React.ReactNode {
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const match = part.match(/^\[\[([^\]]+)\]\]$/);
    if (match) {
      const key = match[1];
      const concept = getGameConcept(key);
      if (concept) {
        return <GameTerm key={i} conceptKey={key} />;
      }
      // Unknown concept key — render as plain text
      return key;
    }
    return part;
  });
}

// ---------------------------------------------------------------------------
// GameTerm component
// ---------------------------------------------------------------------------

export interface GameTermProps {
  /** The concept key to look up in gameConcepts.ts. */
  conceptKey: string;
  /** Optional override for the display text (defaults to concept.label). */
  children?: React.ReactNode;
}

export function GameTerm({ conceptKey, children }: GameTermProps) {
  const depth = useContext(NestingDepthContext);
  const concept = getGameConcept(conceptKey);

  const [visible, setVisible] = useState(false);
  const [locked, setLocked] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  // If nesting depth exceeded or concept not found, render as plain styled text.
  if (!concept || depth >= MAX_NESTING_DEPTH) {
    return (
      <span className="text-blue-400 font-medium">
        {children ?? concept?.label ?? conceptKey}
      </span>
    );
  }

  const show = () => {
    if (locked) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setVisible(true), 300);
  };

  const hide = () => {
    if (locked) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setVisible(false);
  };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (locked) {
      setLocked(false);
      setVisible(false);
    } else {
      setLocked(true);
      setVisible(true);
    }
  };

  // Escape key dismisses locked tooltip
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!locked) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLocked(false);
        setVisible(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setLocked(false);
        setVisible(false);
      }
    };

    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [locked]);

  return (
    <span className="relative inline">
      {/* Trigger text */}
      <span
        ref={triggerRef}
        className="text-blue-400 font-medium cursor-help border-b border-blue-400/30 hover:border-blue-400/60 transition-colors"
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-describedby={`game-term-${conceptKey}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle(e as unknown as React.MouseEvent);
          }
        }}
      >
        {children ?? concept.label}
      </span>

      {/* Tooltip card */}
      {visible && (
        <span
          ref={tooltipRef}
          id={`game-term-${conceptKey}`}
          role="tooltip"
          className={[
            "absolute z-[100] left-0 mt-1",
            "w-72 max-w-[90vw]",
            "bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl",
            "text-xs text-zinc-200",
            "pointer-events-auto",
            "animate-in fade-in-0 zoom-in-95 duration-150",
          ].join(" ")}
          style={{ top: "100%" }}
          onMouseEnter={() => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          }}
          onMouseLeave={() => {
            if (!locked) {
              setVisible(false);
            }
          }}
        >
          {/* Header */}
          <span className="flex items-center justify-between px-3 pt-2.5 pb-1">
            <span className="font-semibold text-blue-400 text-sm">
              {concept.label}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">
              {concept.category}
            </span>
          </span>

          {/* Definition */}
          <span className="block px-3 pb-2 leading-relaxed text-zinc-300">
            <NestingDepthContext.Provider value={depth + 1}>
              {renderDefinition(concept.definition)}
            </NestingDepthContext.Provider>
          </span>

          {/* Related concepts */}
          {concept.related && concept.related.length > 0 && (
            <span className="block px-3 pb-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 block mb-1">
                Related
              </span>
              <span className="flex flex-wrap gap-1">
                <NestingDepthContext.Provider value={depth + 1}>
                  {concept.related.map((key) => {
                    const rel = getGameConcept(key);
                    if (!rel) return null;
                    return (
                      <GameTerm key={key} conceptKey={key}>
                        {rel.label}
                      </GameTerm>
                    );
                  })}
                </NestingDepthContext.Provider>
              </span>
            </span>
          )}

          {/* Handbook link */}
          {concept.handbookChapter && (
            <span className="block border-t border-zinc-800 px-3 py-1.5">
              <span className="text-[10px] text-zinc-500">
                📖 See Handbook → {concept.handbookChapter}
              </span>
            </span>
          )}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Utility: parse text with concept markers
// ---------------------------------------------------------------------------

/**
 * Converts plain text containing `[[concept-key]]` markers into React nodes
 * with GameTerm components. Use this to render tutorial descriptions that
 * reference game concepts.
 *
 * Example: parseConceptText("Set your [[conviction-level]] carefully.")
 */
export function parseConceptText(text: string): React.ReactNode {
  return renderDefinition(text);
}
