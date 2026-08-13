import { jsPDF } from "jspdf";
import { computeTotals } from "@/lib/billing";
import { formatDateTime } from "@/lib/date";
import { formatAmount } from "@/lib/utils";
import { SALON } from "@/lib/nav";
import type { Client, Invoice, Staff } from "@/lib/types";

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Credit / Debit Card",
  WALLET: "Mobile Wallet",
  TRANSFER: "Bank Transfer",
};

/**
 * Renders an 80mm thermal-format receipt as a downloadable PDF.
 *
 * The page grows vertically with the line count so long bridal tickets are
 * never clipped — jsPDF needs the height up front, so it is estimated from
 * the content before the document is created.
 */
export function generateReceiptPdf(
  invoice: Invoice,
  client: Client | undefined,
  staffById: Map<string, Staff>,
) {
  const totals = computeTotals(invoice.lines, invoice.discount, invoice.taxRate, invoice.payments);

  const W = 80;
  const M = 5; // side margin
  const INNER = W - M * 2;

  // Height estimate: header + per-line rows + totals + payments + footer.
  const estimated =
    62 +
    invoice.lines.length * 9 +
    invoice.payments.length * 5 +
    (invoice.discount.kind !== "NONE" ? 5 : 0) +
    (invoice.taxRate > 0 ? 5 : 0) +
    34;

  const doc = new jsPDF({ unit: "mm", format: [W, Math.max(120, estimated)] });
  let y = 8;

  const line = (dash = false) => {
    doc.setLineWidth(0.15);
    if (dash) doc.setLineDashPattern([0.6, 0.6], 0);
    doc.line(M, y, W - M, y);
    doc.setLineDashPattern([], 0);
    y += 3.2;
  };

  const centre = (text: string, size: number, style: "normal" | "bold" = "normal", gap = 4) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.text(text, W / 2, y, { align: "center" });
    y += gap;
  };

  const row = (left: string, right: string, size = 8, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.text(left, M, y);
    doc.text(right, W - M, y, { align: "right" });
    y += size * 0.52;
  };

  /* ------------------------------------------------------------ Header */

  centre(SALON.name.toUpperCase(), 11, "bold", 4.6);
  centre(SALON.tagline, 7.5, "normal", 3.8);
  y += 0.4;
  doc.setFontSize(6.6);
  doc.setFont("helvetica", "normal");
  for (const text of doc.splitTextToSize(SALON.address, INNER) as string[]) {
    doc.text(text, W / 2, y, { align: "center" });
    y += 2.8;
  }
  centre(`Tel: ${SALON.phone}  ·  ${SALON.mobile}`, 6.6, "normal", 3.2);
  centre(`NTN: ${SALON.ntn}`, 6.6, "normal", 4);

  line();

  /* ------------------------------------------------------------- Meta */

  row("Invoice", invoice.number, 7.6, "bold");
  row("Date", formatDateTime(invoice.createdAt), 7);
  row("Client", client?.name ?? "Walk-in", 7);
  if (client?.phone) row("Phone", client.phone, 7);
  row("Billed by", staffById.get(invoice.createdByStaffId)?.name ?? "—", 7);
  y += 1.5;

  line(true);

  /* ------------------------------------------------------------ Lines */

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.text("ITEM", M, y);
  doc.text("QTY", W - M - 22, y, { align: "right" });
  doc.text("AMOUNT", W - M, y, { align: "right" });
  y += 2.6;
  line(true);

  for (const item of invoice.lines) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);

    const wrapped = doc.splitTextToSize(item.name, INNER - 26) as string[];
    const firstY = y;
    for (const text of wrapped) {
      doc.text(text, M, y);
      y += 3.1;
    }

    // Qty and amount align to the first line of a wrapped name.
    doc.text(String(item.qty), W - M - 22, firstY, { align: "right" });
    doc.text(formatAmount(item.unitPrice * item.qty), W - M, firstY, { align: "right" });

    // Attribution + per-line discount, in small grey type.
    const attributions: string[] = [];
    if (item.staffId) attributions.push(staffById.get(item.staffId)?.name ?? "");
    if (item.lineDiscount > 0) attributions.push(`less ${formatAmount(item.lineDiscount)}`);
    if (attributions.length) {
      doc.setFontSize(6.2);
      doc.setTextColor(110);
      doc.text(attributions.filter(Boolean).join("  ·  "), M + 1, y);
      doc.setTextColor(0);
      y += 2.8;
    }
    y += 0.8;
  }

  line(true);

  /* ----------------------------------------------------------- Totals */

  row("Subtotal", formatAmount(totals.grossSubtotal), 7.4);
  if (totals.lineDiscountTotal > 0) {
    row("Item discounts", `- ${formatAmount(totals.lineDiscountTotal)}`, 7.4);
  }
  if (totals.invoiceDiscount > 0) {
    const tag = invoice.discount.code
      ? `Discount (${invoice.discount.code})`
      : invoice.discount.kind === "PERCENT"
        ? `Discount (${invoice.discount.value}%)`
        : "Discount";
    row(tag, `- ${formatAmount(totals.invoiceDiscount)}`, 7.4);
  }
  if (invoice.taxRate > 0) {
    row(`Tax (${invoice.taxRate}%)`, formatAmount(totals.tax), 7.4);
  }

  y += 1.4;
  line();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL", M, y);
  doc.text(`Rs ${formatAmount(totals.total)}`, W - M, y, { align: "right" });
  y += 4.4;
  line();

  /* --------------------------------------------------------- Payments */

  for (const payment of invoice.payments) {
    row(
      PAYMENT_LABELS[payment.mode] ?? payment.mode,
      formatAmount(payment.amount),
      7.2,
    );
    if (payment.reference) {
      doc.setFontSize(6.2);
      doc.setTextColor(110);
      doc.text(`Ref: ${payment.reference}`, M + 1, y);
      doc.setTextColor(0);
      y += 2.8;
    }
  }

  if (totals.changeDue > 0) row("Change returned", formatAmount(totals.changeDue), 7.4, "bold");
  if (totals.balance > 0) row("BALANCE DUE", formatAmount(totals.balance), 8, "bold");

  y += 1.6;
  line(true);

  /* ------------------------------------------------------------ Footer */

  centre("Thank you for visiting", 8, "bold", 3.8);
  centre(SALON.instagram, 7, "normal", 3.6);
  doc.setFontSize(6);
  for (const text of doc.splitTextToSize(
    "Services once rendered are non-refundable. Retail products may be exchanged within 7 days with this receipt.",
    INNER,
  ) as string[]) {
    doc.text(text, W / 2, y, { align: "center" });
    y += 2.4;
  }

  doc.save(`${invoice.number}.pdf`);
}
