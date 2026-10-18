import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  indicatorClassName?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, indicatorClassName, ...props }, ref) => {
    const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
    const safeValue = Number.isFinite(value) ? Math.min(safeMax, Math.max(0, value)) : 0;
    const percentage = (safeValue / safeMax) * 100;
    const named = Boolean(props["aria-label"] || props["aria-labelledby"]);
    return (
      <div
        ref={ref}
        className={cn("relative h-2 w-full overflow-hidden rounded-full bg-[var(--secondary)]", className)}
        {...props}
        role={named ? "progressbar" : undefined}
        aria-hidden={named ? props["aria-hidden"] : true}
        aria-valuemin={named ? 0 : undefined}
        aria-valuemax={named ? safeMax : undefined}
        aria-valuenow={named ? safeValue : undefined}
      >
        <div
          aria-hidden="true"
          className={cn("h-full rounded-full bg-[var(--primary)] transition-all", indicatorClassName)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };
