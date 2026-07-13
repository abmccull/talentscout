"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";

/**
 * Initializes the optional Supabase session without making the Supabase client
 * part of the /play route's first-load JavaScript.
 */
export function AuthRuntime() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return null;
}
