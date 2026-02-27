"use client";

import { useState, useRef, useEffect } from "react";
import type { TargetOption } from "@/engine/core/types";
import { Search, User, Users, Star, Eye, X, ChevronRight } from "lucide-react";

interface TargetPickerProps {
  targets: TargetOption[];
  /** "player" for player-targeted, "contact" for network meetings, "option" for generic choices */
  mode: "player" | "contact" | "option";
  onSelect: (targetId: string) => void;
  onClose: () => void;
  /** Render inline (relative positioning) for use in modals instead of absolute overlay */
  inline?: boolean;
}

export function TargetPicker({ targets, mode, onSelect, onClose, inline }: TargetPickerProps) {
  const [search, setSearch] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const filtered = targets.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  const placeholder =
    mode === "player" ? "Search players..." :
    mode === "contact" ? "Search contacts..." :
    "Search options...";

  return (
    <div
      ref={overlayRef}
      className={`${inline ? "relative" : "absolute left-0 right-0 top-full mt-1"} z-50 rounded-lg border border-[#27272a] bg-[#0a0a0a] shadow-xl shadow-black/50`}
    >
      {/* Search bar */}
      <div className="flex items-center gap-2 border-b border-[#27272a] px-3 py-2">
        <Search size={12} className="text-zinc-500 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-xs text-zinc-300 placeholder-zinc-600 outline-none"
        />
        <button
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-[#27272a] hover:text-zinc-300"
        >
          <X size={12} />
        </button>
      </div>

      {/* Target list */}
      <div className="max-h-48 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-3 py-3 text-center text-[11px] text-zinc-600">
            No matches found
          </div>
        )}
        {filtered.map((target) => (
          <button
            key={target.id}
            onClick={() => onSelect(target.id)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-[#1a1a1a]"
          >
            {mode === "player" ? (
              <PlayerRow target={target} />
            ) : mode === "contact" ? (
              <ContactRow target={target} />
            ) : (
              <OptionRow target={target} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ target }: { target: TargetOption }) {
  return (
    <>
      <User size={12} className="shrink-0 text-zinc-500" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[11px] font-medium text-zinc-200">
            {target.name}
          </span>
          {target.position && (
            <span className="shrink-0 rounded bg-[#27272a] px-1 py-px text-[9px] font-medium text-zinc-400">
              {target.position}
            </span>
          )}
          {target.age != null && (
            <span className="shrink-0 text-[9px] text-zinc-500">
              {target.age}y
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {target.caStars != null && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-zinc-400">
              <Star size={8} className="text-amber-400" />
              {target.caStars.toFixed(1)}
            </span>
          )}
          {target.paStars && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-zinc-400">
              PA {target.paStars[0].toFixed(1)}-{target.paStars[1].toFixed(1)}
            </span>
          )}
          {target.observations != null && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-zinc-500">
              <Eye size={8} />
              {target.observations}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

function ContactRow({ target }: { target: TargetOption }) {
  return (
    <>
      <Users size={12} className="shrink-0 text-zinc-500" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[11px] font-medium text-zinc-200">
            {target.name}
          </span>
          {target.contactType && (
            <span className="shrink-0 rounded bg-[#27272a] px-1 py-px text-[9px] font-medium text-zinc-400">
              {target.contactType}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {target.organization && (
            <span className="text-[9px] text-zinc-500 truncate">
              {target.organization}
            </span>
          )}
          {target.relationship != null && (
            <span className="shrink-0 text-[9px] text-zinc-500">
              Trust {target.relationship}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

function OptionRow({ target }: { target: TargetOption }) {
  return (
    <>
      <ChevronRight size={12} className="shrink-0 text-zinc-500" />
      <div className="min-w-0 flex-1">
        <span className="truncate text-[11px] font-medium text-zinc-200">
          {target.name}
        </span>
        {target.description && (
          <p className="text-[9px] text-zinc-500 mt-0.5">
            {target.description}
          </p>
        )}
      </div>
    </>
  );
}
