"use client";

import * as React from "react";
import { CheckCircle2, Download, Printer, Receipt as ReceiptIcon } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { computeTotals } from "@/lib/billing";
import { formatDateTime } from "@/lib/date";
import { generateReceiptPdf } from "@/lib/pdf/receipt-pdf";
import { useLookups } from "@/lib/data/store";
import { SALON } from "@/lib/nav";
import { formatAmount } from "@/lib/utils";
import { PAYMENT_META } from "@/components/pos/payment-dialog";
import type { Invoice } from "@/lib/types";

/**
 * Post-checkout confirmation showing an on-screen facsimile of the 80mm
 * thermal receipt. `data-print-root` scopes the print stylesheet in
 * globals.css so Ctrl-P emits only this slip.
 */
export function ReceiptDialog({
  invoice,
  open,
  onOpenChange,
  onNewSale,
}: {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewSale: () => void;
}) {
  const { clientById, staffById } = useLookups();
  if (!invoice) return null;

  const client = clientById.get(invoice.clientId);
  const totals = computeTotals(invoice.lines, invoice.discount, invoice.taxRate, invoice.payments);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className="max-h-[92vh]">
        <DialogHeader data-print-hide>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-success" />
            Sale completed
          </DialogTitle>
          <p className="text-sm text-muted">
            {invoice.number} · {formatAmount(totals.total)} PKR
            {totals.balance > 0 && (
              <span className="text-warning"> · {formatAmount(totals.balance)} outstanding</span>
            )}
          </p>
        </DialogHeader>

        <DialogBody className="bg-obsidian/60 p-4">
          <ThermalReceipt invoice={invoice} />
        </DialogBody>

        <DialogFooter data-print-hide>
          <Button
            variant="secondary"
            onClick={() => generateReceiptPdf(invoice, client, staffById)}
          >
            <Download /> PDF
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onNewSale();
            }}
          >
            <ReceiptIcon /> New sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The receipt itself — also used standalone from the invoices module. */
export function ThermalReceipt({ invoice }: { invoice: Invoice }) {
  const { clientById, staffById } = useLookups();
  const client = clientById.get(invoice.clientId);
  const totals = computeTotals(invoice.lines, invoice.discount, invoice.taxRate, invoice.payments);

  const dashed = "my-2 border-t border-dashed border-black/25";

  return (
    <div
      data-print-root
      className="mx-auto w-[302px] bg-white px-4 py-5 font-mono text-[11px] leading-tight text-black shadow-2xl"
    >
      {/* Header */}
      <div className="text-center">
        <p className="text-[15px] font-bold uppercase tracking-wide">{SALON.name}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.15em]">{SALON.tagline}</p>
        <p className="mt-1.5 text-[9px] leading-snug">{SALON.address}</p>
        <p className="text-[9px]">Tel: {SALON.phone}</p>
        {SALON.ntn && <p className="text-[9px]">NTN: {SALON.ntn}</p>}
      </div>

      <div className="my-2 border-t border-black/40" />

      {/* Meta */}
      <div className="space-y-0.5">
        <Line label="Invoice" value={invoice.number} bold />
        <Line label="Date" value={formatDateTime(invoice.createdAt)} />
        <Line label="Client" value={client?.name ?? "Walk-in"} />
        {client?.phone && <Line label="Phone" value={client.phone} />}
        <Line label="Billed by" value={staffById.get(invoice.createdByStaffId)?.name ?? "—"} />
      </div>

      <div className={dashed} />

      {/* Column heads */}
      <div className="flex text-[9px] font-bold uppercase tracking-wide">
        <span className="flex-1">Item</span>
        <span className="w-8 text-right">Qty</span>
        <span className="w-16 text-right">Amount</span>
      </div>

      <div className={dashed} />

      {/* Lines */}
      <div className="space-y-1.5">
        {invoice.lines.map((line) => (
          <div key={line.id}>
            <div className="flex items-start">
              <span className="flex-1 pr-1">{line.name}</span>
              <span className="w-8 text-right">{line.qty}</span>
              <span className="w-16 text-right">{formatAmount(line.unitPrice * line.qty)}</span>
            </div>
            {(line.staffId || line.lineDiscount > 0) && (
              <p className="pl-1 text-[9px] text-black/55">
                {[
                  line.staffId ? staffById.get(line.staffId)?.name : null,
                  line.lineDiscount > 0 ? `less ${formatAmount(line.lineDiscount)}` : null,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className={dashed} />

      {/* Totals */}
      <div className="space-y-0.5">
        <Line label="Subtotal" value={formatAmount(totals.grossSubtotal)} />
        {totals.lineDiscountTotal > 0 && (
          <Line label="Item discounts" value={`- ${formatAmount(totals.lineDiscountTotal)}`} />
        )}
        {totals.invoiceDiscount > 0 && (
          <Line
            label={
              invoice.discount.code
                ? `Discount (${invoice.discount.code})`
                : invoice.discount.kind === "PERCENT"
                  ? `Discount (${invoice.discount.value}%)`
                  : "Discount"
            }
            value={`- ${formatAmount(totals.invoiceDiscount)}`}
          />
        )}
        {invoice.taxRate > 0 && (
          <Line label={`Tax (${invoice.taxRate}%)`} value={formatAmount(totals.tax)} />
        )}
      </div>

      <div className="my-2 border-t border-black/40" />

      <div className="flex items-center justify-between text-[15px] font-bold">
        <span>TOTAL</span>
        <span>Rs {formatAmount(totals.total)}</span>
      </div>

      <div className="my-2 border-t border-black/40" />

      {/* Payments */}
      <div className="space-y-0.5">
        {invoice.payments.map((payment) => (
          <div key={payment.id}>
            <Line label={PAYMENT_META[payment.mode].label} value={formatAmount(payment.amount)} />
            {payment.reference && (
              <p className="pl-1 text-[9px] text-black/55">Ref: {payment.reference}</p>
            )}
          </div>
        ))}
        {invoice.payments.length === 0 && (
          <p className="text-center text-[10px] font-bold">** UNPAID **</p>
        )}
        {totals.changeDue > 0 && (
          <Line label="Change returned" value={formatAmount(totals.changeDue)} bold />
        )}
        {totals.balance > 0 && (
          <Line label="BALANCE DUE" value={formatAmount(totals.balance)} bold />
        )}
      </div>

      <div className={dashed} />

      {/* Footer */}
      <div className="space-y-1 text-center">
        <p className="text-[11px] font-bold">Thank you for visiting</p>
        {SALON.instagram && <p className="text-[10px]">{SALON.instagram}</p>}
        <p className="mt-1.5 text-[8px] leading-snug text-black/60">
          Services once rendered are non-refundable. Retail products may be exchanged within 7 days
          with this receipt.
        </p>
      </div>
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span className="shrink-0">{label}</span>
      <span className="truncate text-right">{value}</span>
    </div>
  );
}
