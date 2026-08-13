"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 ease-[var(--ease-luxury)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        /** Primary call-to-action — brushed gold. */
        default:
          "bg-gradient-to-b from-gold-light to-gold text-obsidian font-semibold shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_6px_18px_-8px_rgba(212,175,55,0.7)] hover:brightness-110",
        /** Quiet action on a charcoal card. */
        secondary:
          "bg-charcoal-hover text-ink border border-hairline-strong hover:border-gold/40 hover:bg-[#262626]",
        outline:
          "border border-gold/45 text-gold bg-transparent hover:bg-gold/10 hover:border-gold",
        ghost: "text-muted hover:bg-white/5 hover:text-ink",
        destructive:
          "bg-danger text-white font-semibold hover:brightness-110 shadow-[0_6px_18px_-8px_rgba(225,29,72,0.8)]",
        success:
          "bg-success text-obsidian font-semibold hover:brightness-110 shadow-[0_6px_18px_-8px_rgba(16,185,129,0.8)]",
        link: "text-gold underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
        default: "h-10 px-4 [&_svg]:size-4",
        lg: "h-12 px-6 text-base [&_svg]:size-5",
        xl: "h-14 px-8 text-lg [&_svg]:size-5",
        icon: "h-10 w-10 [&_svg]:size-4",
        "icon-sm": "h-8 w-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
