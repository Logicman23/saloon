"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { nextInvoiceNumber } from "@/lib/db/queries";
import { computeTotals, formatInvoiceNumber, invoiceStatusFor, lineCommission, lineNet } from "@/lib/billing";
import { round2 } from "@/lib/utils";
import { failure, recordAudit, requirePermission, type ActionResult } from "@/lib/actions/guard";
import type { InvoiceLine } from "@/lib/types";

const LineSchema = z.object({
  kind: z.enum(["SERVICE", "PRODUCT", "PACKAGE"]),
  refId: z.string().min(1),
  name: z.string().min(1),
  unitPrice: z.number().nonnegative(),
  qty: z.number().int().positive().max(999),
  staffId: z.string().optional(),
  commissionRate: z.number().min(0).max(1),
  lineDiscount: z.number().nonnegative(),
});

const PaymentSchema = z.object({
  mode: z.enum(["CASH", "CARD", "WALLET", "TRANSFER"]),
  amount: z.number().positive(),
  reference: z.string().max(120).optional(),
});

const CheckoutSchema = z.object({
  clientId: z.string().min(1),
  appointmentId: z.string().optional(),
  lines: z.array(LineSchema).min(1),
  discount: z.object({
    kind: z.enum(["NONE", "FLAT", "PERCENT", "CODE"]),
    value: z.number().nonnegative(),
    code: z.string().max(40).optional(),
  }),
  payments: z.array(PaymentSchema),
  taxRate: z.number().min(0).max(100),
  note: z.string().max(500).optional(),
});

export type CheckoutInput = z.infer<typeof CheckoutSchema>;

/**
 * Commits a POS ticket.
 *
 * Runs as a single transaction so an invoice can never exist without its
 * lines, or stock be decremented for a sale that failed to record. Prices are
 * re-read from the catalogue rather than trusted from the client: otherwise
 * anyone could POST a bridal package at Rs 1.
 */
export async function checkoutAction(input: CheckoutInput): Promise<ActionResult<{ invoiceId: string; number: string }>> {
  try {
    const session = await requirePermission("pos.operate");
    const parsed = CheckoutSchema.parse(input);

    // --- Re-price from the database -------------------------------------
    const serviceIds = parsed.lines.filter((l) => l.kind === "SERVICE").map((l) => l.refId);
    const productIds = parsed.lines.filter((l) => l.kind === "PRODUCT").map((l) => l.refId);
    const packageIds = parsed.lines.filter((l) => l.kind === "PACKAGE").map((l) => l.refId);

    const [services, products, packages, staff] = await Promise.all([
      prisma.service.findMany({ where: { id: { in: serviceIds }, archivedAt: null } }),
      // `archivedAt` is part of the lookup, not just the catalogue screen: a
      // POS tab left open before the item was removed would otherwise still
      // ring it up, and the line would land on a real invoice.
      prisma.product.findMany({ where: { id: { in: productIds }, archivedAt: null } }),
      prisma.servicePackage.findMany({ where: { id: { in: packageIds }, archivedAt: null } }),
      prisma.staff.findMany({ select: { id: true, commissionRate: true } }),
    ]);

    const priceOf = new Map<string, { price: number; name: string }>();
    for (const s of services) priceOf.set(s.id, { price: Number(s.price), name: s.name });
    for (const p of products) priceOf.set(p.id, { price: Number(p.retailPrice), name: p.name });
    for (const p of packages) priceOf.set(p.id, { price: Number(p.price), name: p.name });

    const rateOf = new Map(staff.map((s) => [s.id, Number(s.commissionRate)]));

    const lines: InvoiceLine[] = parsed.lines.map((line, index) => {
      const catalogue = priceOf.get(line.refId);
      if (!catalogue) throw new Error(`Unknown catalogue item: ${line.refId}`);

      // The staff member's own rate wins over anything the client sent, so a
      // tampered request cannot inflate someone's commission.
      const rate = line.staffId
        ? line.kind === "PRODUCT"
          ? 0.05
          : (rateOf.get(line.staffId) ?? 0)
        : 0;

      return {
        id: `line_${index}`,
        kind: line.kind,
        refId: line.refId,
        name: catalogue.name,
        unitPrice: catalogue.price,
        qty: line.qty,
        staffId: line.staffId,
        commissionRate: rate,
        lineDiscount: Math.min(line.lineDiscount, catalogue.price * line.qty),
      };
    });

    // --- Guard the discount ---------------------------------------------
    const totals = computeTotals(lines, parsed.discount, parsed.taxRate);
    const discountPercent =
      totals.netSubtotal > 0 ? (totals.invoiceDiscount / totals.netSubtotal) * 100 : 0;

    // Matches the POS threshold. A cashier who bypassed the PIN dialog in the
    // browser still cannot land an oversized discount here.
    if (discountPercent > 15) {
      const { roleCan } = await import("@/lib/auth/permissions");
      if (!roleCan(session.role, "pos.discount.override")) {
        return { ok: false, error: "That discount needs manager authorisation." };
      }
      await recordAudit("DISCOUNT_OVERRIDE", session, {
        entityType: "Invoice",
        metadata: { discountPercent: round2(discountPercent) },
      });
    }

    const paid = round2(parsed.payments.reduce((sum, p) => sum + p.amount, 0));
    const applied = Math.min(paid, totals.total);

    // --- Persist ---------------------------------------------------------
    const { sequence, year } = await nextInvoiceNumber();
    const number = formatInvoiceNumber(sequence, year);

    const created = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          number,
          clientId: parsed.clientId,
          appointmentId: parsed.appointmentId,
          discountKind: parsed.discount.kind,
          discountValue: parsed.discount.value,
          discountCode: parsed.discount.code,
          taxRate: parsed.taxRate,
          totalAmount: totals.total,
          paidAmount: applied,
          serviceRevenue: round2(
            lines
              .filter((l) => l.kind !== "PRODUCT")
              .reduce((sum, l) => {
                const net = lineNet(l);
                return sum + net - totals.invoiceDiscount * (net / (totals.netSubtotal || 1));
              }, 0),
          ),
          retailRevenue: round2(
            lines
              .filter((l) => l.kind === "PRODUCT")
              .reduce((sum, l) => {
                const net = lineNet(l);
                return sum + net - totals.invoiceDiscount * (net / (totals.netSubtotal || 1));
              }, 0),
          ),
          commissionTotal: round2(
            lines.reduce(
              (sum, l) => sum + lineCommission(l, totals.netSubtotal, totals.invoiceDiscount),
              0,
            ),
          ),
          status: invoiceStatusFor(totals.total, applied),
          note: parsed.note,
          createdByStaffId: session.staffId ?? staff[0]?.id ?? "",
          lines: {
            create: lines.map((l) => ({
              kind: l.kind,
              refId: l.refId,
              name: l.name,
              unitPrice: l.unitPrice,
              qty: l.qty,
              staffId: l.staffId,
              commissionRate: l.commissionRate,
              lineDiscount: l.lineDiscount,
            })),
          },
          payments: {
            create: parsed.payments.map((p) => ({
              mode: p.mode,
              amount: Math.min(p.amount, totals.total),
              reference: p.reference,
            })),
          },
        },
        select: { id: true, number: true },
      });

      // Retail lines consume stock and leave an audit trail.
      const sold = new Map<string, number>();
      for (const line of lines) {
        if (line.kind === "PRODUCT") sold.set(line.refId, (sold.get(line.refId) ?? 0) + line.qty);
      }

      for (const [productId, qty] of sold) {
        await tx.product.update({
          where: { id: productId },
          data: { stock: { decrement: qty } },
        });
        await tx.stockMovement.create({
          data: {
            productId,
            type: "RETAIL_SALE",
            qty: -qty,
            note: `Sold on ${invoice.number}`,
            staffId: session.staffId,
          },
        });
      }

      if (parsed.appointmentId) {
        await tx.appointment.update({
          where: { id: parsed.appointmentId },
          data: { status: "COMPLETED" },
        });
      }

      return invoice;
    });

    revalidatePath("/pos");
    revalidatePath("/invoices");
    revalidatePath("/");

    return { ok: true, data: { invoiceId: created.id, number: created.number } };
  } catch (error) {
    return failure(error);
  }
}

/** Voids an invoice. Admin-only; the row is never deleted. */
export async function voidInvoiceAction(invoiceId: string): Promise<ActionResult> {
  try {
    const session = await requirePermission("invoice.void");

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "VOID" },
    });

    await recordAudit("INVOICE_VOIDED", session, { entityType: "Invoice", entityId: invoiceId });

    revalidatePath("/invoices");
    revalidatePath("/");
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error);
  }
}
