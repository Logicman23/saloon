import { cn } from "@/lib/utils";
import { SALON } from "@/lib/nav";

/**
 * Salon wordmark. The monogram is drawn inline as SVG so it stays crisp,
 * themable and asset-free.
 */
export function Logo({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Monogram />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-[17px] font-semibold tracking-wide text-gilded">
            {SALON.name}
          </p>
          <p className="truncate text-[10px] uppercase tracking-[0.2em] text-faint">
            {SALON.tagline}
          </p>
        </div>
      )}
    </div>
  );
}

export function Monogram({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
        "bg-gradient-to-br from-gold-light/25 via-gold/10 to-transparent",
        "ring-1 ring-gold/35",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <defs>
          <linearGradient id="sbs-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f4e2a1" />
            <stop offset="50%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#a8862a" />
          </linearGradient>
        </defs>
        {/* Stylised "S" with a scissor-blade flourish */}
        <path
          d="M16.5 6.2c-1.1-1.1-2.7-1.7-4.4-1.7-2.6 0-4.6 1.4-4.6 3.5 0 4.4 9.3 2.6 9.3 7.4 0 2.3-2.2 4-5.2 4-2 0-3.8-.7-5-1.9"
          fill="none"
          stroke="url(#sbs-gold)"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <circle cx="18.4" cy="17.9" r="1.5" fill="none" stroke="url(#sbs-gold)" strokeWidth="1.5" />
      </svg>
    </span>
  );
}
