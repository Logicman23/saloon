import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default: "border-gold/30 bg-gold/12 text-gold-light",
        neutral: "border-hairline-strong bg-white/5 text-muted",
        /** Paid / Completed */
        success: "border-success/30 bg-success/12 text-success",
        /** Pending / Partial / In-progress */
        warning: "border-warning/30 bg-warning/12 text-warning",
        /** Overdue / Cancelled / No-show */
        danger: "border-danger/30 bg-danger/12 text-danger",
        info: "border-info/30 bg-info/12 text-info",
        outline: "border-hairline-strong bg-transparent text-muted",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Small filled dot used inside badges and legends. */
function Dot({ className }: { className?: string }) {
  return <span className={cn("size-1.5 rounded-full bg-current", className)} />;
}

export { Badge, Dot, badgeVariants };
