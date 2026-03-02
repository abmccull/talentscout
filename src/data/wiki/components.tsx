"use client";

// ─── Shared content helpers for wiki articles ────────────────────────────────
// Extracted from HandbookScreen.tsx — same styling, reusable across all articles.

export function SectionBlock({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3 text-sm text-zinc-300">{children}</div>;
}

export function Subheading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
      {children}
    </h4>
  );
}

export function Para({ children }: { children: React.ReactNode }) {
  return <p className="leading-relaxed text-zinc-300">{children}</p>;
}

export function Tag({
  children,
  color = "zinc",
}: {
  children: React.ReactNode;
  color?: "emerald" | "amber" | "zinc" | "blue" | "rose";
}) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    zinc: "bg-zinc-800 text-zinc-400 border-zinc-700",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium ${colors[color]}`}
    >
      {children}
    </span>
  );
}

export function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800">
            {headers.map((h) => (
              <th
                key={h}
                className="pb-1.5 pr-4 text-left font-semibold text-zinc-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-800/50">
              {row.map((cell, j) => (
                <td key={j} className="py-1.5 pr-4 text-zinc-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PerkCard({
  name,
  level,
  description,
}: {
  name: string;
  level: number;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-zinc-200">{name}</span>
        <span className="ml-auto rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
          Lv {level}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-zinc-400">{description}</p>
    </div>
  );
}

export function InfoCard({
  title,
  color = "emerald",
  children,
}: {
  title: string;
  color?: "emerald" | "amber" | "blue" | "rose";
  children: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    blue: "text-blue-400",
    rose: "text-rose-400",
  };
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <p className={`mb-1 text-xs font-semibold ${colors[color]}`}>{title}</p>
      <p className="text-xs text-zinc-400">{children}</p>
    </div>
  );
}

export function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="ml-4 list-disc space-y-1 text-zinc-300">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function NumberedList({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="ml-4 list-decimal space-y-1 text-zinc-300">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

export function GridCards({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
  );
}
