"use client";

import { useEffect, useState } from "react";

const STORAGE_PREFIX = "talentscout_ui_disclosure:";

/**
 * Remembers optional UI depth without putting presentation state into a career
 * save. Failure to access browser storage only falls back to the supplied
 * default; it never changes gameplay state.
 */
export function usePersistentDisclosure(
  id: string,
  defaultOpen = false,
): readonly [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(defaultOpen);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${id}`);
      if (stored === "true" || stored === "false") {
        setOpen(stored === "true");
      }
    } catch {
      // Browsers may deny storage in restricted modes; the UI still works.
    } finally {
      setReady(true);
    }
  }, [id]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, String(open));
    } catch {
      // Remembering disclosure is optional and must never block navigation.
    }
  }, [id, open, ready]);

  return [open, setOpen] as const;
}
