"use client";
import type { PlayerProfileTab, PlayerProfileTabId } from "./playerProfilePresentation";
interface PlayerProfileTabBarProps {
  activeTab: PlayerProfileTabId;
  onChange: (tab: PlayerProfileTabId) => void;
  tabs: PlayerProfileTab[];
}
export function PlayerProfileTabBar({ activeTab, onChange, tabs }: PlayerProfileTabBarProps) {
  return (
    <div className="mb-6 border-b border-[var(--border)] bg-[var(--background)]">
      <div className="flex gap-1 sm:gap-6" role="tablist" aria-label="Player profile views">
        {tabs.map((tab, index) => {
          const selected = tab.id === activeTab;
          return (
            <button key={tab.id} type="button" id={`player-profile-tab-${tab.id}`} role="tab" aria-selected={selected} aria-controls={`player-profile-panel-${tab.id}`} tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => {
                const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
                if (next === null) return;
                event.preventDefault();
                onChange(tabs[next].id);
                document.getElementById(`player-profile-tab-${tabs[next].id}`)?.focus();
              }}
              className={`min-h-12 flex-1 border-b-2 px-1 text-sm transition-colors sm:flex-none sm:px-2 ${selected ? "border-[var(--primary)] font-semibold text-[var(--foreground)]" : "border-transparent text-quiet hover:text-[var(--foreground)]"}`}>
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
