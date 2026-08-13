"use client";

import * as React from "react";
import {
  Banknote,
  CreditCard,
  Landmark,
  Plus,
  Smartphone,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/misc";
import { PAYMENT_MODES, type Payment, type PaymentMode } from "@/lib/types";
import { cn, formatMoney, round2 } from "@/lib/utils";

export const PAYMENT_META: Record<PaymentMode, { label: string; icon: LucideIcon }> = {
  CASH: { label: "Cash", icon: Banknote },
  CARD: { label: "Card", icon: CreditCard },
  WALLET: { label: "Wallet", icon: Smartphone },
  TRANSFER: { label: "Transfer", icon: Landmark },
};

interface Draft {
  key: string;
  mode: PaymentMode;
  amount: string;
  reference: string;
}

/**
 * Tender collection. Supports a single payment or an arbitrary split across
 * cash / card / wallet / bank transfer, and allows deliberate under-payment
 * so a bill can be left PARTIAL.
 */
export function PaymentDialog({
  open,
  onOpenChange,
  total,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  onConfirm: (payments: Payment[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {/* Radix unmounts Content when closed, so the form below starts fresh
            (and pre-filled with the current total) on every open. */}
        <PaymentForm total={total} onCancel={() => onOpenChange(false)} onConfirm={onConfirm} />
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({
  total,
  onCancel,
  onConfirm,
}: {
  total: number;
  onCancel: () => void;
  onConfirm: (payments: Payment[]) => void;
}) {
  const seq = React.useRef(0);

  const newDraft = React.useCallback((mode: PaymentMode, amount: number): Draft => {
    seq.current += 1;
    return {
      key: `d${seq.current}`,
      mode,
      amount: amount > 0 ? String(round2(amount)) : "",
      reference: "",
    };
  }, []);

  // Opens as a single cash tender pre-filled with the full amount.
  const [drafts, setDrafts] = React.useState<Draft[]>(() => [
    { key: "d0", mode: "CASH", amount: total > 0 ? String(round2(total)) : "", reference: "" },
  ]);

  const tendered = round2(drafts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0));
  const applied = Math.min(tendered, total);
  const remaining = round2(Math.max(0, total - tendered));
  const change = round2(Math.max(0, tendered - total));

  const patch = (key: string, next: Partial<Draft>) =>
    setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...next } : d)));

  const addSplit = () => setDrafts((current) => [...current, newDraft("CARD", remaining)]);

  const removeDraft = (key: string) =>
    setDrafts((current) => (current.length === 1 ? current : current.filter((d) => d.key !== key)));

  const confirm = () => {
    const payments: Payment[] = drafts
      .map((d, index) => ({
        id: `pay_${Date.now()}_${index}`,
        mode: d.mode,
        amount: round2(Number(d.amount) || 0),
        reference: d.reference.trim() || undefined,
        at: new Date().toISOString(),
      }))
      .filter((p) => p.amount > 0);

    // Never record more than the bill: overpayment is change, not revenue.
    let budget = total;
    const capped = payments.map((p) => {
      const amount = round2(Math.min(p.amount, Math.max(0, budget)));
      budget = round2(budget - amount);
      return { ...p, amount };
    }).filter((p) => p.amount > 0);

    onConfirm(capped);
    onCancel();
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>Collect payment</DialogTitle>
          <DialogDescription>
            Take the full amount on one tender, or split it across several.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Amount due */}
          <div className="rounded-xl border border-gold/25 bg-gradient-to-br from-gold/[0.08] to-transparent p-4 text-center">
            <p className="text-[11px] uppercase tracking-[0.16em] text-gold/70">Amount due</p>
            <p className="tabular mt-1 text-3xl font-semibold text-gilded">{formatMoney(total)}</p>
          </div>

          {/* Tenders */}
          <div className="space-y-3">
            {drafts.map((draft, index) => (
              <div key={draft.key} className="rounded-lg border border-hairline bg-obsidian-elevated p-3">
                <div className="mb-2.5 flex items-center justify-between">
                  <Label>Payment {index + 1}</Label>
                  {drafts.length > 1 && (
                    <button
                      onClick={() => removeDraft(draft.key)}
                      className="rounded-md p-1 text-faint transition-colors hover:bg-danger/10 hover:text-danger"
                      aria-label={`Remove payment ${index + 1}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {PAYMENT_MODES.map((mode) => {
                    const meta = PAYMENT_META[mode];
                    const active = draft.mode === mode;
                    return (
                      <button
                        key={mode}
                        onClick={() => patch(draft.key, { mode })}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-[11px] transition-colors",
                          active
                            ? "border-gold/50 bg-gold/12 text-gold-light"
                            : "border-hairline text-muted hover:border-hairline-strong hover:text-ink",
                        )}
                      >
                        <meta.icon className="size-4" />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">
                      Rs
                    </span>
                    <Input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      placeholder="0"
                      value={draft.amount}
                      onChange={(e) => patch(draft.key, { amount: e.target.value })}
                      className="tabular pl-9 text-right font-medium"
                    />
                  </div>
                  <Input
                    placeholder={draft.mode === "CASH" ? "Note (optional)" : "Txn / last 4 digits"}
                    value={draft.reference}
                    onChange={(e) => patch(draft.key, { reference: e.target.value })}
                  />
                </div>
              </div>
            ))}

            <Button variant="secondary" size="sm" className="w-full" onClick={addSplit}>
              <Plus /> Split across another payment method
            </Button>
          </div>

          {/* Running reconciliation */}
          <div className="space-y-1.5 rounded-lg border border-hairline p-3 text-sm">
            <Row label="Tendered" value={formatMoney(tendered)} />
            <Row label="Applied to bill" value={formatMoney(applied)} />
            {change > 0 && (
              <Row label="Change to return" value={formatMoney(change)} tone="warning" bold />
            )}
            {remaining > 0 && (
              <Row label="Still outstanding" value={formatMoney(remaining)} tone="danger" bold />
            )}
            {remaining === 0 && change === 0 && tendered > 0 && (
              <Row label="Settled in full" value="✓" tone="success" bold />
            )}
          </div>

          {remaining > 0 && tendered > 0 && (
            <p className="rounded-lg border border-warning/25 bg-warning/[0.06] p-3 text-xs text-warning">
              This invoice will be saved as <strong>Partially paid</strong> with a balance of{" "}
              {formatMoney(remaining)}.
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Badge variant="neutral" className="mr-auto self-center">
            {drafts.length} tender{drafts.length === 1 ? "" : "s"}
          </Badge>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="success" onClick={confirm} disabled={tendered <= 0}>
            Complete sale · {formatMoney(applied)}
          </Button>
        </DialogFooter>
    </>
  );
}

function Row({
  label,
  value,
  tone = "default",
  bold,
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
  bold?: boolean;
}) {
  const tones = {
    default: "text-muted",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  };
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-muted", tone !== "default" && tones[tone])}>{label}</span>
      <span className={cn("tabular", tones[tone], bold && "font-semibold")}>{value}</span>
    </div>
  );
}
