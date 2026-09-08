import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90",
        destructive: "bg-[var(--destructive)] text-white shadow-sm hover:bg-[var(--destructive)]/90",
        outline: "border border-[var(--border)] bg-transparent hover:bg-[var(--secondary)] hover:text-[var(--foreground)]",
        secondary: "bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--secondary)]/80",
        ghost: "hover:bg-[var(--secondary)] hover:text-[var(--foreground)]",
        link: "text-[var(--primary)] underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-11 px-5 py-2.5",
        sm: "min-h-11 px-3 py-2 text-xs",
        lg: "min-h-12 px-7 py-3",
        icon: "h-11 w-11 shrink-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
