import { APP_VERSION } from "@/config/version";

const STEAM_URL = "https://store.steampowered.com/app/4455570";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800/60 px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-zinc-500">
          <a
            href={STEAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-white"
          >
            Steam
          </a>
          <a href="/play" className="transition hover:text-white">
            Demo
          </a>
          <span className="cursor-default text-zinc-700">Discord</span>
          <span className="cursor-default text-zinc-700">Press Kit</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-600">
          <span>&copy; 2026 TalentScout. All rights reserved.</span>
          <span>v{APP_VERSION}</span>
        </div>
      </div>
    </footer>
  );
}
