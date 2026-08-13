"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  sublabel,
  icon: Icon,
  /** Percentage change vs. the previous equal-length period. */
  delta,
  /** Set when a rising number is bad (e.g. expenses). */
  invertDelta,
  tone = "gold",
  className,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon: LucideIcon;
  delta?: number;
  invertDelta?: boolean;
  tone?: "gold" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    gold: "text-gold bg-gold/10 ring-gold/20",
    success: "text-success bg-success/10 ring-success/20",
    warning: "text-warning bg-warning/10 ring-warning/20",
    danger: "text-danger bg-danger/10 ring-danger/20",
  };

  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const positive = hasDelta && delta > 0;
  const flat = hasDelta && Math.abs(delta) < 0.05;
  const good = invertDelta ? !positive : positive;

  const DeltaIcon = flat ? Minus : positive ? ArrowUpRight : ArrowDownRight;

  return (
    <Card interactive className={cn("relative overflow-hidden p-5", className)}>
      {/* Corner gold wash */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full opacity-[0.07] blur-2xl"
        style={{ background: "radial-gradient(circle, #d4af37, transparent 70%)" }}
      />

      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</p>
        <span
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-lg ring-1",
            tones[tone],
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>

      <p className="tabular mt-3 text-2xl font-semibold tracking-tight text-ink xl:text-[28px]">
        {value}
      </p>

      <div className="mt-1.5 flex items-center gap-2">
        {hasDelta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium",
              flat ? "text-faint" : good ? "text-success" : "text-danger",
            )}
          >
            <DeltaIcon className="size-3.5" />
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {sublabel && <span className="truncate text-xs text-faint">{sublabel}</span>}
      </div>
    </Card>
  );
}
