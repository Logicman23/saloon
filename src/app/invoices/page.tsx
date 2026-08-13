"use client";

import * as React from "react";
import { Download, Eye, Printer, Receipt, Search, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/misc";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ThermalReceipt } from "@/components/pos/receipt";
import { InvoiceStatusBadge } from "@/components/appointments/status";
import { PAYMENT_META } from "@/components/pos/payment-dialog";
import { useLookups, useSalon, totalsOf } from "@/lib/data/store";
import { collected, outstanding } from "@/lib/data/analytics";
import { generateReceiptPdf } from "@/lib/pdf/receipt-pdf";
import { formatDateTime } from "@/lib/date";
import { cn, formatMoney, formatMoneyCompact } from "@/lib/utils";
import type { Invoice, InvoiceStatus } from "@/lib/types";

const FILTERS: Array<{ key: InvoiceStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "PAID", label: "Paid" },
  { key: "PARTIAL", label: "Partial" },
  { key: "UNPAID", label: "Unpaid" },
];

export default function InvoicesPage() {
  const { invoices } = useSalon();
  const { clientById, staffById } = useLookups();

  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<InvoiceStatus | "all">("all");
  const [preview, setPreview] = React.useState<Invoice | null>(null);

  const q = query.trim().toLowerCase();

  const rows = React.useMemo(
    () =>
      invoices
        .filter((invoice) => {
          if (status !== "all" && invoice.status !== status) return false;
          if (!q) return true;
          const client = clientById.get(invoice.clientId);
          return (
            invoice.number.toLowerCase().includes(q) ||
            (client?.name.toLowerCase().includes(q) ?? false) ||
            (client?.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "")) ?? false)
          );
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [invoices, status, q, clientById],
  );

  const totalBilled = invoices.reduce((sum, i) => sum + totalsOf(i).total, 0);
  const totalCollected = invoices.reduce((sum, i) => sum + collected(i), 0);
  const totalOutstanding = invoices.reduce((sum, i) => sum + outstanding(i), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Invoices" value={String(invoices.length)} icon={Receipt} tone="gold" />
        <KpiCard
          label="Total billed"
          value={formatMoneyCompact(totalBilled)}
          icon={Receipt}
          tone="gold"
        />
        <KpiCard
          label="Collected"
          value={formatMoneyCompact(totalCollected)}
          icon={Wallet}
          tone="success"
        />
        <KpiCard
          label="Outstanding"
          value={formatMoneyCompact(totalOutstanding)}
          icon={Wallet}
          tone={totalOutstanding > 0 ? "danger" : "success"}
        />
      </div>

      <SectionHeading
        title="Invoices"
        description="Every bill raised, what was collected and what is still owed."
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              className="w-56 pl-9"
              placeholder="Invoice no. or client…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setStatus(filter.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              status === filter.key
                ? "border-gold/50 bg-gold/12 text-gold-light"
                : "border-hairline text-muted hover:border-hairline-strong hover:text-ink",
            )}
          >
            {filter.label}
            <span className="ml-1.5 text-faint">
              {filter.key === "all"
                ? invoices.length
                : invoices.filter((i) => i.status === filter.key).length}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableEmpty colSpan={9}>No invoices match.</TableEmpty>}
            {rows.slice(0, 60).map((invoice) => {
              const totals = totalsOf(invoice);
              const balance = outstanding(invoice);
              const client = clientById.get(invoice.clientId);

              return (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-xs text-ink">{invoice.number}</TableCell>
                  <TableCell className="tabular whitespace-nowrap text-xs text-muted">
                    {formatDateTime(invoice.createdAt)}
                  </TableCell>
                  <TableCell>
                    <p className="text-ink">{client?.name ?? "Walk-in"}</p>
                    <p className="text-xs text-faint">{client?.phone}</p>
                  </TableCell>
                  <TableCell className="tabular text-right text-muted">
                    {invoice.lines.length}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {invoice.payments.length === 0 && (
                        <span className="text-xs text-faint">—</span>
                      )}
                      {invoice.payments.map((payment) => (
                        <Badge key={payment.id} variant="neutral" className="text-[10px]">
                          {PAYMENT_META[payment.mode].label}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="tabular text-right font-medium text-ink">
                    {formatMoney(totals.total)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {balance > 0 ? (
                      <span className="text-danger">{formatMoney(balance)}</span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={invoice.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setPreview(invoice)}
                        className="rounded-md p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-gold"
                        aria-label="View receipt"
                      >
                        <Eye className="size-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          generateReceiptPdf(invoice, clientById.get(invoice.clientId), staffById)
                        }
                        className="rounded-md p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-gold"
                        aria-label="Download PDF"
                      >
                        <Download className="size-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {rows.length > 60 && (
          <p className="border-t border-hairline px-4 py-2.5 text-xs text-faint">
            Showing the 60 most recent of {rows.length} matching invoices.
          </p>
        )}
      </Card>

      {/* Receipt preview */}
      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent size="sm">
          <DialogHeader data-print-hide>
            <DialogTitle>{preview?.number}</DialogTitle>
          </DialogHeader>
          <DialogBody className="bg-obsidian/60 p-4">
            {preview && <ThermalReceipt invoice={preview} />}
          </DialogBody>
          <DialogFooter data-print-hide>
            <Button
              variant="secondary"
              onClick={() =>
                preview &&
                generateReceiptPdf(preview, clientById.get(preview.clientId), staffById)
              }
            >
              <Download /> PDF
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
            <Button onClick={() => setPreview(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
