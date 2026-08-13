"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Banknote,
  CalendarDays,
  Paperclip,
  Plus,
  Receipt,
  Search,
  Trash2,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label, SectionHeading } from "@/components/ui/misc";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PAYMENT_META } from "@/components/pos/payment-dialog";
import { useLookups, useSalon } from "@/lib/data/store";
import { percentChange, periodRange, previousRange, summarize } from "@/lib/data/analytics";
import { dateKey, formatDate, startOfMonth } from "@/lib/date";
import { cn, formatMoney, formatMoneyCompact } from "@/lib/utils";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_MODES,
  type ExpenseCategory,
  type PaymentMode,
} from "@/lib/types";

export default function ExpensesPage() {
  const { expenses, invoices, appointments, staff, actions } = useSalon();
  const { staffById } = useLookups();

  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [addOpen, setAddOpen] = React.useState(false);

  const now = React.useMemo(() => new Date(), []);
  const range = React.useMemo(() => periodRange("month", now), [now]);
  const prev = React.useMemo(() => previousRange(range.from, range.to), [range]);

  const current = React.useMemo(
    () => summarize({ invoices, expenses, appointments }, range.from, range.to),
    [invoices, expenses, appointments, range],
  );
  const previous = React.useMemo(
    () => summarize({ invoices, expenses, appointments }, prev.from, prev.to),
    [invoices, expenses, appointments, prev],
  );

  const q = query.trim().toLowerCase();

  const filtered = React.useMemo(
    () =>
      expenses
        .filter(
          (e) =>
            (category === "all" || e.category === category) &&
            (!q ||
              e.category.toLowerCase().includes(q) ||
              (e.vendor ?? "").toLowerCase().includes(q) ||
              (e.note ?? "").toLowerCase().includes(q)),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, category, q],
  );

  // This month's spend per category, for the breakdown panel.
  const monthStart = startOfMonth(now);
  const byCategory = React.useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of expenses) {
      if (new Date(expense.date) < monthStart) continue;
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
    }
    return [...totals.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, monthStart]);

  const monthTotal = byCategory.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Expenses this month"
          value={formatMoney(current.expenses)}
          icon={TrendingDown}
          delta={percentChange(current.expenses, previous.expenses)}
          invertDelta
          tone="danger"
        />
        <KpiCard
          label="Revenue this month"
          value={formatMoney(current.revenue)}
          icon={Banknote}
          delta={percentChange(current.revenue, previous.revenue)}
          tone="gold"
        />
        <KpiCard
          label="Net profit"
          value={formatMoney(current.netProfit)}
          icon={Receipt}
          delta={percentChange(current.netProfit, previous.netProfit)}
          tone={current.netProfit >= 0 ? "success" : "danger"}
        />
        <KpiCard
          label="Expense ratio"
          value={
            current.revenue > 0
              ? `${((current.expenses / current.revenue) * 100).toFixed(0)}%`
              : "—"
          }
          icon={CalendarDays}
          sublabel="of revenue"
          tone={current.expenses > current.revenue ? "danger" : "warning"}
        />
      </div>

      {/* Category breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>This month by category</CardTitle>
          <p className="text-sm text-muted">
            {formatMoney(monthTotal)} across {byCategory.length} categories
          </p>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {byCategory.map((entry) => (
            <div key={entry.name}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-muted">{entry.name}</span>
                <span className="tabular text-ink">
                  {formatMoney(entry.amount)}
                  <span className="ml-2 text-xs text-faint">
                    {monthTotal ? ((entry.amount / monthTotal) * 100).toFixed(0) : 0}%
                  </span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-danger/70 to-warning"
                  style={{ width: `${monthTotal ? (entry.amount / monthTotal) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
          {byCategory.length === 0 && (
            <p className="py-6 text-center text-sm text-faint">
              No expenses recorded this month yet.
            </p>
          )}
        </CardContent>
      </Card>

      <SectionHeading
        title="Expense ledger"
        description="Rent, utilities, salaries, stock purchases and daily running costs."
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <Input
                className="w-52 pl-9"
                placeholder="Vendor or note…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <Plus /> Record expense
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {["all", ...EXPENSE_CATEGORIES].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              category === cat
                ? "border-gold/50 bg-gold/12 text-gold-light"
                : "border-hairline text-muted hover:border-hairline-strong hover:text-ink",
            )}
          >
            {cat === "all" ? "All" : cat}
          </button>
        ))}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Paid via</TableHead>
              <TableHead>Recorded by</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableEmpty colSpan={8}>No expenses found.</TableEmpty>}
            {filtered.slice(0, 80).map((expense) => (
              <TableRow key={expense.id}>
                <TableCell className="tabular whitespace-nowrap text-muted">
                  {formatDate(expense.date)}
                </TableCell>
                <TableCell>
                  <Badge variant="neutral">{expense.category}</Badge>
                </TableCell>
                <TableCell className="text-ink">{expense.vendor ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate text-xs text-faint">
                  <span className="flex items-center gap-1.5">
                    {expense.attachment && <Paperclip className="size-3 shrink-0 text-gold/60" />}
                    {expense.note ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted">
                  {PAYMENT_META[expense.paymentMode].label}
                </TableCell>
                <TableCell className="text-xs text-muted">
                  {staffById.get(expense.recordedByStaffId)?.name ?? "—"}
                </TableCell>
                <TableCell className="tabular text-right font-medium text-danger">
                  {formatMoney(expense.amount)}
                </TableCell>
                <TableCell className="text-right">
                  <button
                    onClick={() => {
                      actions.deleteExpense(expense.id);
                      toast.success("Expense removed.");
                    }}
                    className="rounded-md p-1.5 text-faint transition-colors hover:bg-danger/10 hover:text-danger"
                    aria-label="Delete expense"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length > 80 && (
          <p className="border-t border-hairline px-4 py-2.5 text-xs text-faint">
            Showing 80 of {filtered.length} matching entries.
          </p>
        )}
      </Card>

      <AddExpenseDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        staff={staff}
        onSubmit={actions.addExpense}
      />
    </div>
  );
}

/* --------------------------------------------------------- Add expense */

function AddExpenseDialog({
  open,
  onOpenChange,
  staff,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: ReturnType<typeof useSalon>["staff"];
  onSubmit: ReturnType<typeof useSalon>["actions"]["addExpense"];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="default">
        {/* Unmounted while closed, so every open starts from a blank form
            dated today. */}
        <ExpenseForm staff={staff} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} />
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  staff,
  onCancel,
  onSubmit,
}: {
  staff: ReturnType<typeof useSalon>["staff"];
  onCancel: () => void;
  onSubmit: ReturnType<typeof useSalon>["actions"]["addExpense"];
}) {
  const [category, setCategory] = React.useState<ExpenseCategory>("Refreshments");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(() => dateKey(new Date()));
  const [vendor, setVendor] = React.useState("");
  const [note, setNote] = React.useState("");
  const [mode, setMode] = React.useState<PaymentMode>("CASH");
  const [staffId, setStaffId] = React.useState("stf_rabia");
  const [attachment, setAttachment] = React.useState("");

  const value = Number(amount) || 0;

  return (
    <>
        <DialogHeader>
          <DialogTitle>Record an expense</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">
                  Rs
                </span>
                <Input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="tabular pl-9 text-right"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="[color-scheme:dark]"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Paid via</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {PAYMENT_META[option].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Vendor / payee</Label>
            <Input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="LESCO, Beauty Depot, staff name…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was this for?"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Receipt attachment</Label>
            <Input
              value={attachment}
              onChange={(e) => setAttachment(e.target.value)}
              placeholder="receipt-aug-2026.jpg"
            />
            <p className="text-[11px] text-faint">
              Filename reference. Wire this to Supabase Storage or S3 in production.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Recorded by</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {staff.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={value <= 0}
            onClick={() => {
              onSubmit({
                category,
                amount: value,
                date: new Date(`${date}T12:00:00`).toISOString(),
                vendor: vendor.trim() || undefined,
                note: note.trim() || undefined,
                paymentMode: mode,
                attachment: attachment.trim() || undefined,
                recordedByStaffId: staffId,
              });
              toast.success(`${formatMoneyCompact(value)} logged under ${category}.`);
              onCancel();
            }}
          >
            Save expense
          </Button>
        </DialogFooter>
    </>
  );
}
