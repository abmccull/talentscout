"use client";

import { useEffect, type RefObject } from "react";
import { cycleDialogTab, getDialogFocusable, isElementVisible } from "./dialogFocus";

export function useDialogFocusTrap(
  rootRef: RefObject<HTMLElement | null>,
  active: boolean,
  options?: {
    onClose?: () => void;
    initialFocusRef?: RefObject<HTMLElement | null>;
    restoreFocus?: boolean;
  },
): void {
  const onClose = options?.onClose;
  const initialFocusRef = options?.initialFocusRef;
  const restoreFocus = options?.restoreFocus ?? true;

  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root || !isElementVisible(root)) return;

    const previous = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const focusStart = () => {
      const preferred = initialFocusRef?.current;
      if (preferred && root.contains(preferred)) {
        preferred.focus();
        return;
      }
      getDialogFocusable(root)[0]?.focus();
    };
    const frame = window.requestAnimationFrame(focusStart);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isElementVisible(root)) return;
      if (event.key === "Escape") {
        if (!onClose) return;
        event.preventDefault();
        onClose();
        return;
      }
      cycleDialogTab(event, root);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      if (restoreFocus && previous && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [active, initialFocusRef, onClose, restoreFocus, rootRef]);
}
