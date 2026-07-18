"use client";

import type { PlayerProfileTab, PlayerProfileTabId } from "./playerProfilePresentation";

interface PlayerProfileTabBarProps {
  activeTab: PlayerProfileTabId;
  onChange: (tab: PlayerProfileTabId) => void;
  tabs: PlayerProfileTab[];
}

export function PlayerProfileTabBar({
  activeTab,
  onChange,
  tabs,
}: PlayerProfileTabBarProps) {
  return (
    <div className="mb-5 rounded-2xl border border-white/10 bg-[#10151b]/95 p-2 shadow-lg shadow-black/15">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" role="tablist" aria-label="Player profile views">
        {tabs.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              id={`player-profile-tab-${tab.id}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`player-profile-panel-${tab.id}`}
              onClick={() => onChange(tab.id)}
              className={`min-h-11 rounded-xl border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                selected
                  ? "border-emerald-400/50 bg-emerald-400/10 text-white"
                  : "border-white/10 bg-black/10 text-zinc-300 hover:border-white/20 hover:bg-white/[0.04]"
              }`}
            >
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className={`mt-1 hidden text-xs leading-5 sm:block ${selected ? "text-emerald-100/80" : "text-zinc-500"}`}>
                {tab.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
