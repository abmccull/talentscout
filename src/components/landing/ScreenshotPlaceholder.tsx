interface ScreenshotPlaceholderProps {
  label: string;
  aspectRatio?: string;
}

export function ScreenshotPlaceholder({
  label,
  aspectRatio = "16/9",
}: ScreenshotPlaceholderProps) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50"
      style={{ aspectRatio }}
    >
      {/* Dot grid pattern */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgb(52 211 153 / 0.15) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      {/* Accent lines */}
      <div className="absolute left-6 top-6 h-px w-12 bg-emerald-500/30" />
      <div className="absolute left-6 top-6 h-12 w-px bg-emerald-500/30" />
      <div className="absolute bottom-6 right-6 h-px w-12 bg-emerald-500/30" />
      <div className="absolute bottom-6 right-6 h-12 w-px bg-emerald-500/30" />
      {/* Label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="rounded-full bg-zinc-800/80 px-4 py-1.5 text-sm text-zinc-400">
          {label}
        </span>
      </div>
    </div>
  );
}
