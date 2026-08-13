"use client";

import * as React from "react";
import { Minus, Plus, Tag, Trash2, UserCog, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { lineGross, lineNet } from "@/lib/billing";
import { cn, formatMoney } from "@/lib/utils";
import type { InvoiceLine, Staff } from "@/lib/types";

const KIND_LABEL: Record<InvoiceLine["kind"], string> = {
  SERVICE: "Service",
  PRODUCT: "Retail",
  PACKAGE: "Package",
};

/**
 * Cart line with inline staff attribution.
 *
 * Every line carries its own `staffId` + `commissionRate`, which is what
 * makes multi-stylist tickets work: a cut by Ayesha and a manicure by Zoya on
 * the same bill each pay the right person.
 */
export function CartLine({
  line,
  staff,
  onChange,
  onRemove,
}: {
  line: InvoiceLine;
  staff: Staff[];
  onChange: (patch: Partial<InvoiceLine>) => void;
  onRemove: () => void;
}) {
  const [showDiscount, setShowDiscount] = React.useState(line.lineDiscount > 0);
  const assigned = staff.find((s) => s.id === line.staffId);

  return (
    <div className="rounded-lg border border-hairline bg-obsidian-elevated p-3 transition-colors hover:border-hairline-strong">
      {/* Title row */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Badge variant={line.kind === "PACKAGE" ? "default" : "neutral"} className="text-[9px]">
              {KIND_LABEL[line.kind]}
            </Badge>
          </div>
          <p className="mt-1 text-sm font-medium leading-snug text-ink">{line.name}</p>
          <p className="tabular text-xs text-faint">{formatMoney(line.unitPrice)} each</p>
        </div>

        <button
          onClick={onRemove}
          className="shrink-0 rounded-md p-1.5 text-faint transition-colors hover:bg-danger/10 hover:text-danger"
          aria-label={`Remove ${line.name}`}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Qty + amount */}
      <div className="mt-2.5 flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-hairline-strong">
          <button
            onClick={() => onChange({ qty: Math.max(1, line.qty - 1) })}
            className="p-1.5 text-muted transition-colors hover:text-ink disabled:opacity-30"
            disabled={line.qty <= 1}
            aria-label="Decrease quantity"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="tabular w-8 text-center text-sm font-medium text-ink">{line.qty}</span>
          <button
            onClick={() => onChange({ qty: line.qty + 1 })}
            className="p-1.5 text-muted transition-colors hover:text-ink"
            aria-label="Increase quantity"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        <button
          onClick={() => {
            if (showDiscount) onChange({ lineDiscount: 0 });
            setShowDiscount((v) => !v);
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition-colors",
            line.lineDiscount > 0
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-hairline-strong text-faint hover:text-muted",
          )}
        >
          <Tag className="size-3" />
          {line.lineDiscount > 0 ? formatMoney(line.lineDiscount) : "Discount"}
        </button>

        <div className="ml-auto text-right">
          {line.lineDiscount > 0 && (
            <p className="tabular text-[11px] text-faint line-through">
              {formatMoney(lineGross(line))}
            </p>
          )}
          <p className="tabular text-sm font-semibold text-ink">{formatMoney(lineNet(line))}</p>
        </div>
      </div>

      {showDiscount && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={lineGross(line)}
            value={line.lineDiscount || ""}
            placeholder="Discount amount"
            onChange={(e) =>
              onChange({
                lineDiscount: Math.min(Math.max(Number(e.target.value) || 0, 0), lineGross(line)),
              })
            }
            className="h-8 text-xs"
          />
          <button
            onClick={() => {
              onChange({ lineDiscount: 0 });
              setShowDiscount(false);
            }}
            className="rounded-md p-1.5 text-faint hover:text-ink"
            aria-label="Clear line discount"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Staff attribution */}
      <div className="mt-2.5 flex items-center gap-2 border-t border-hairline pt-2.5">
        <UserCog className="size-3.5 shrink-0 text-faint" />
        <Select
          value={line.staffId ?? "none"}
          onValueChange={(value) => {
            const member = staff.find((s) => s.id === value);
            onChange({
              staffId: value === "none" ? undefined : value,
              // Retail carries a flat 5% spiff; services use the member's rate.
              commissionRate: member
                ? line.kind === "PRODUCT"
                  ? 0.05
                  : member.commissionRate
                : 0,
            });
          }}
        >
          <SelectTrigger className="h-8 border-none bg-transparent px-1 text-xs hover:bg-white/5">
            <SelectValue placeholder="Assign staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {staff.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {assigned && line.commissionRate > 0 && (
          <Badge variant="default" className="ml-auto shrink-0 text-[10px]">
            {(line.commissionRate * 100).toFixed(0)}% comm.
          </Badge>
        )}
      </div>
    </div>
  );
}
