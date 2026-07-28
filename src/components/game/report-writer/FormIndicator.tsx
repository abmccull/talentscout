"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { getFormDisplay } from "./shared";

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
