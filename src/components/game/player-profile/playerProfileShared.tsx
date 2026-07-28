import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { getFormDisplay } from "./playerProfileFormatting";

export function FormIndicator({ form }: { form: number }) {
  const display = getFormDisplay(form);
  const IconComponent =
    display.icon === "up"
      ? TrendingUp
      : display.icon === "down"
        ? TrendingDown
        : Minus;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${display.bgColor} ${display.borderColor}`}
    >
      <IconComponent size={14} className={display.color} aria-hidden="true" />
      <span className={`text-xs font-medium ${display.color}`}>
        {display.label}
      </span>
    </div>
  );
}

export function ReliabilityDots({ reliability }: { reliability: number }) {
  const total = 5;
  const filled = Math.round(reliability * total);
  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`Reliability: ${filled} out of ${total}`}
    >
      {Array.from({ length: total }).map((_, index) => (
        <div
          key={index}
          className={`h-1.5 w-1.5 rounded-full ${
            index < filled ? "bg-violet-400" : "bg-[#27272a]"
          }`}
        />
      ))}
    </div>
  );
}
