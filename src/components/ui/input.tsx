import * as React from "react";
import { cn } from "@/lib/utils";

const inputBase =
  "flex h-10 w-full rounded-lg border border-hairline-strong bg-obsidian-elevated px-3 py-2 text-sm text-ink transition-colors placeholder:text-faint focus-visible:border-gold/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/40 disabled:cursor-not-allowed disabled:opacity-50";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(inputBase, className)} {...props} />
  ),
);
Input.displayName = "Input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(inputBase, "h-auto min-h-20 resize-y py-2.5", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Input, Textarea, inputBase };
