import { round2 } from "@/lib/utils";
import type {
  DiscountState,
  InvoiceLine,
  InvoiceStatus,
  InvoiceTotals,
  Payment,
  PromoCode,
} from "@/lib/types";

/**
 * Single source of truth for invoice arithmetic.
 *
 * Order of operations (matters for auditability):
 *   1. line gross      = unitPrice x qty
 *   2. line net        = gross - lineDiscount
 *   3. netSubtotal     = sum(line net)
 *   4. invoiceDiscount = flat amount, or percent of netSubtotal
 *   5. taxableBase     = netSubtotal - invoiceDiscount
 *   6. tax             = taxableBase x taxRate%
 *   7. total           = taxableBase + tax
 *
 * Commission is earned on the line's share of `taxableBase`, so an
 * invoice-level discount is borne proportionally by every stylist on the
 * ticket rather than by the salon alone.
 */

export function lineGross(line: InvoiceLine) {
  return round2(line.unitPrice * line.qty);
}

export function lineNet(line: InvoiceLine) {
  return round2(Math.max(0, lineGross(line) - line.lineDiscount));
}

export function resolveInvoiceDiscount(discount: DiscountState, netSubtotal: number) {
  if (netSubtotal <= 0) return 0;
  switch (discount.kind) {
    case "FLAT":
      return round2(Math.min(Math.max(discount.value, 0), netSubtotal));
    case "PERCENT":
    case "CODE":
      return round2((netSubtotal * Math.min(Math.max(discount.value, 0), 100)) / 100);
    default:
      return 0;
  }
}

/** Per-line commission after proportionally absorbing the invoice discount. */
export function lineCommission(line: InvoiceLine, netSubtotal: number, invoiceDiscount: number) {
  if (!line.staffId || line.commissionRate <= 0) return 0;
  const net = lineNet(line);
  if (net <= 0 || netSubtotal <= 0) return 0;
  const share = net / netSubtotal;
  const afterDiscount = net - invoiceDiscount * share;
  return round2(Math.max(0, afterDiscount) * line.commissionRate);
}

export function computeTotals(
  lines: InvoiceLine[],
  discount: DiscountState,
  taxRate: number,
  payments: Payment[] = [],
): InvoiceTotals {
  const grossSubtotal = round2(lines.reduce((sum, l) => sum + lineGross(l), 0));
  const lineDiscountTotal = round2(lines.reduce((sum, l) => sum + Math.min(l.lineDiscount, lineGross(l)), 0));
  const netSubtotal = round2(grossSubtotal - lineDiscountTotal);

  const invoiceDiscount = resolveInvoiceDiscount(discount, netSubtotal);
  const taxableBase = round2(Math.max(0, netSubtotal - invoiceDiscount));
  const tax = round2((taxableBase * Math.max(0, taxRate)) / 100);
  const total = round2(taxableBase + tax);

  const paid = round2(payments.reduce((sum, p) => sum + p.amount, 0));
  const balance = round2(Math.max(0, total - paid));
  const changeDue = round2(Math.max(0, paid - total));

  const commissionTotal = round2(
    lines.reduce((sum, l) => sum + lineCommission(l, netSubtotal, invoiceDiscount), 0),
  );

  return {
    grossSubtotal,
    lineDiscountTotal,
    netSubtotal,
    invoiceDiscount,
    taxableBase,
    tax,
    total,
    paid,
    balance,
    changeDue,
    commissionTotal,
  };
}

export function invoiceStatusFor(total: number, paid: number): InvoiceStatus {
  if (total <= 0) return "UNPAID";
  if (paid <= 0) return "UNPAID";
  // Tolerate sub-rupee rounding so a fully-settled bill never reads as PARTIAL.
  if (paid + 0.01 >= total) return "PAID";
  return "PARTIAL";
}

/** Validates a typed promo code against the current cart value. */
export function applyPromo(
  code: string,
  netSubtotal: number,
  promos: PromoCode[],
): { ok: true; discount: DiscountState; promo: PromoCode } | { ok: false; reason: string } {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, reason: "Enter a promo code." };

  const promo = promos.find((p) => p.code === normalized);
  if (!promo) return { ok: false, reason: `"${normalized}" is not a valid code.` };
  if (!promo.active) return { ok: false, reason: `"${normalized}" is no longer active.` };
  if (netSubtotal < promo.minSpend) {
    return {
      ok: false,
      reason: `Requires a minimum bill of Rs ${promo.minSpend.toLocaleString("en-PK")}.`,
    };
  }

  return {
    ok: true,
    promo,
    discount: {
      kind: "CODE",
      // A FLAT promo is converted to its percentage equivalent so the
      // proportional commission split above stays consistent.
      value: promo.kind === "PERCENT" ? promo.value : (promo.value / netSubtotal) * 100,
      code: promo.code,
    },
  };
}

/** `INV-2026-0043` */
export function formatInvoiceNumber(sequence: number, year: number) {
  return `INV-${year}-${sequence.toString().padStart(4, "0")}`;
}
