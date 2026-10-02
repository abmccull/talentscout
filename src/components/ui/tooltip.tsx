"use client";

import {
  cloneElement, Fragment, isValidElement, useCallback, useEffect,
  useId, useLayoutEffect, useRef, useState,
} from "react";
import { createPortal } from "react-dom";

export interface TooltipProps {
  content: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}

type Side = NonNullable<TooltipProps["side"]>;
type Bounds = { left: number; top: number; right: number; bottom: number };
type Position = {
  left: number; top: number; side: Side; arrow: number;
};

const GAP = 8;
const EDGE = 8;
const OPPOSITE: Record<Side, Side> = {
  top: "bottom", bottom: "top", left: "right", right: "left",
};
const CLIPPING = /^(auto|scroll|hidden|clip|overlay)$/;
const PAINT_CONTAINMENT = /(?:^|\s)(paint|strict|content)(?:\s|$)/;

function viewportBounds(): Bounds {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    right: Math.min(document.documentElement.clientWidth,
      (viewport?.offsetLeft ?? 0) + (viewport?.width ?? document.documentElement.clientWidth)),
    bottom: Math.min(window.innerHeight,
      (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)),
  };
}

function clippingBounds(trigger: HTMLElement): { bounds: Bounds; ancestors: HTMLElement[] } {
  const bounds = viewportBounds();
  const ancestors: HTMLElement[] = [];
  for (let parent = trigger.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const paint = PAINT_CONTAINMENT.test(style.contain);
    const clipsX = CLIPPING.test(style.overflowX) || paint;
    const clipsY = CLIPPING.test(style.overflowY) || paint;
    if (!clipsX && !clipsY) continue;
    ancestors.push(parent);
    const rect = parent.getBoundingClientRect();
    const sx = parent.offsetWidth ? rect.width / parent.offsetWidth : 1;
    const sy = parent.offsetHeight ? rect.height / parent.offsetHeight : 1;
    const left = rect.left + parent.clientLeft * sx;
    const top = rect.top + parent.clientTop * sy;
    if (clipsX) {
      bounds.left = Math.max(bounds.left, left);
      bounds.right = Math.min(bounds.right, left + parent.clientWidth * sx);
    }
    if (clipsY) {
      bounds.top = Math.max(bounds.top, top);
      bounds.bottom = Math.min(bounds.bottom, top + parent.clientHeight * sy);
    }
  }
  return { bounds, ancestors };
}

function samePosition(previous: Position | null, next: Position | null): boolean {
  return previous === next || !!previous && !!next
    && previous.left === next.left && previous.top === next.top
    && previous.side === next.side && previous.arrow === next.arrow;
}

export function Tooltip({ content, side = "top", children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLSpanElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();
  const interactionRef = useRef({ hovered: false, focused: false, dismissed: false });

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearHoverTimer();
    setVisible(false);
    setPosition(null);
  }, [clearHoverTimer]);

  const startHover = () => {
    const interaction = interactionRef.current;
    interaction.hovered = true;
    clearHoverTimer();
    if (interaction.dismissed) return;
    if (interaction.focused) {
      setVisible(true);
      return;
    }
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      if (interactionRef.current.hovered && !interactionRef.current.dismissed) {
        setVisible(true);
      }
    }, 300);
  };

  const endInteraction = (kind: "hovered" | "focused") => {
    const interaction = interactionRef.current;
    interaction[kind] = false;
    clearHoverTimer();
    if (!interaction.hovered && !interaction.focused) {
      interaction.dismissed = false;
      hide();
    } else if (interaction.focused && !interaction.dismissed) {
      setVisible(true);
    }
  };

  useEffect(() => clearHoverTimer, [clearHoverTimer]);

  useLayoutEffect(() => {
    if (!visible || !triggerRef.current || !cardRef.current) return;
    const trigger = triggerRef.current;
    const card = cardRef.current;
    let frame: number | null = null;
    const update = () => {
      const { bounds: triggerBounds } = clippingBounds(trigger);
      const bounds = viewportBounds();
      const anchor = trigger.getBoundingClientRect();
      const inner: Bounds = {
        left: bounds.left + EDGE, top: bounds.top + EDGE,
        right: bounds.right - EDGE, bottom: bounds.bottom - EDGE,
      };
      const availableWidth = inner.right - inner.left;
      const intersects = anchor.right > triggerBounds.left && anchor.left < triggerBounds.right
        && anchor.bottom > triggerBounds.top && anchor.top < triggerBounds.bottom;
      if (!intersects) {
        setPosition((previous) => previous === null ? previous : null);
        return;
      }

      // Keep authored width/typography while permitting a narrower clipping box.
      card.style.maxWidth = "min(20rem, " + Math.max(1, availableWidth) + "px)";
      const inherited = getComputedStyle(trigger);
      card.style.fontFamily = inherited.fontFamily;
      card.style.fontWeight = inherited.fontWeight;
      card.style.letterSpacing = inherited.letterSpacing;
      const size = card.getBoundingClientRect();
      const centerX = (anchor.left + anchor.right) / 2;
      const centerY = (anchor.top + anchor.bottom) / 2;
      const clamp = (value: number, start: number, end: number) =>
        Math.max(start, Math.min(value, end));
      const sides: Side[] = [side, OPPOSITE[side],
        ...(side === "top" || side === "bottom" ? ["left", "right"] as const : ["top", "bottom"] as const)];
      let next: Position | null = null;
      for (const candidate of sides) {
        const horizontal = candidate === "top" || candidate === "bottom";
        const left = horizontal
          ? clamp(centerX - size.width / 2, inner.left, inner.right - size.width)
          : candidate === "left" ? anchor.left - GAP - size.width : anchor.right + GAP;
        const top = horizontal
          ? candidate === "top" ? anchor.top - GAP - size.height : anchor.bottom + GAP
          : clamp(centerY - size.height / 2, inner.top, inner.bottom - size.height);
        if (left < inner.left || left + size.width > inner.right + 0.5
          || top < inner.top || top + size.height > inner.bottom + 0.5) continue;
        next = {
          left, top, side: candidate,
          arrow: horizontal
            ? clamp(centerX - left, EDGE, size.width - EDGE)
            : clamp(centerY - top, EDGE, size.height - EDGE),
        };
        break;
      }
      if (!next) {
        // In a constrained viewport keep the complete card; never discard readable help.
        const left = clamp(centerX - size.width / 2, inner.left, Math.max(inner.left, inner.right - size.width));
        const top = clamp(anchor.bottom + GAP, inner.top, Math.max(inner.top, inner.bottom - size.height));
        next = { left, top, side: "bottom", arrow: clamp(centerX - left, EDGE, Math.max(EDGE, size.width - EDGE)) };
      }
      setPosition((previous) => samePosition(previous, next) ? previous : next);
    };
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        update();
      });
    };

    update();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(trigger);
    observer.observe(card);
    for (const ancestor of clippingBounds(trigger).ancestors) observer.observe(ancestor);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, { capture: true, passive: true });
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [visible, content, side]);

  const associated = visible && position !== null;

  useEffect(() => {
    if (!associated) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || interactionRef.current.dismissed) return;
      const trigger = triggerRef.current;
      if (!trigger) return;
      // Background help must not take Escape from an open modal.
      const backgroundToModal = [...document.querySelectorAll<HTMLElement>(
        '[role="dialog"][aria-modal="true"]',
      )].some((dialog) => {
        const style = getComputedStyle(dialog);
        return !dialog.contains(trigger) && dialog.getClientRects().length > 0
          && style.display !== "none" && style.visibility !== "hidden";
      });
      if (backgroundToModal) return;
      interactionRef.current.dismissed = true;
      hide();
      // This Escape dismisses help. Later Escapes retain screen navigation;
      // existing capture overlays and other listeners at this node keep priority.
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", dismissOnEscape, true);
    return () => window.removeEventListener("keydown", dismissOnEscape, true);
  }, [associated, hide]);
  const child = isValidElement<{ "aria-describedby"?: string }>(children)
    && children.type !== Fragment
    ? cloneElement(children, {
      "aria-describedby": [children.props["aria-describedby"], associated ? tooltipId : null]
        .filter(Boolean).join(" ") || undefined,
    })
    : children;
  const arrowClasses: Record<Side, string> = {
    top: "top-full -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-zinc-700",
    bottom: "bottom-full -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-zinc-700",
    left: "left-full -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-zinc-700",
    right: "right-full -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-zinc-700",
  };
  const resolvedSide = position?.side ?? side;
  const horizontalArrow = resolvedSide === "top" || resolvedSide === "bottom";

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      aria-describedby={child === children && associated ? tooltipId : undefined}
      onMouseEnter={startHover}
      onMouseLeave={() => endInteraction("hovered")}
      onFocus={() => {
        interactionRef.current.focused = true;
        clearHoverTimer();
        if (!interactionRef.current.dismissed) setVisible(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          endInteraction("focused");
        }
      }}
    >
      {child}
      {visible && createPortal(
        <span
          ref={cardRef}
          id={tooltipId}
          role="tooltip"
          className={[
            "fixed z-50 w-max max-w-xs pointer-events-none whitespace-normal [overflow-wrap:anywhere]",
            "bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-2 shadow-xl",
            "animate-in fade-in-0 duration-150",
          ].join(" ")}
          style={{
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            visibility: position ? "visible" : "hidden",
          }}
        >
          {content}
          <span
            aria-hidden="true"
            className={["absolute w-0 h-0 border-4", arrowClasses[resolvedSide]].join(" ")}
            style={horizontalArrow ? { left: position?.arrow } : { top: position?.arrow }}
          />
        </span>,
        document.body,
      )}
    </span>
  );
}
