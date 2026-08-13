"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  BadgePercent,
  CalendarClock,
  CreditCard,
  Percent,
  RotateCcw,
  ShoppingBag,
  Ticket,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Label, Separator } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Catalog, type CatalogPick } from "@/components/pos/catalog";
import { CartLine } from "@/components/pos/cart";
import { PaymentDialog } from "@/components/pos/payment-dialog";
import { ReceiptDialog } from "@/components/pos/receipt";
import { ClientPicker } from "@/components/pos/client-picker";
import { useSalon } from "@/lib/data/store";
import { ProtectedRoute, useAuth } from "@/lib/auth/context";
import { useAdminOverride } from "@/components/auth/admin-override";
import { applyPromo, computeTotals } from "@/lib/billing";
import { appointmentsOn } from "@/lib/data/analytics";
import { formatTime, startOfDay } from "@/lib/date";
import { cn, formatMoney } from "@/lib/utils";
import type { Client, DiscountState, Invoice, InvoiceLine, Payment } from "@/lib/types";

const TAX_RATE = 0; // Services are un-taxed here; set to 16 for GST-registered salons.

export default function PosPage() {
  return (
    <ProtectedRoute requires={["pos.operate"]}>
      <PosTerminal />
    </ProtectedRoute>
  );
}

/** Discounts above this need a manager PIN when the operator is a cashier. */
const DISCOUNT_THRESHOLD_PERCENT = 15;

function PosTerminal() {
  const { staff, services, clients, appointments, promoCodes, actions } = useSalon();
  const { user, can } = useAuth();
  const { authorize, dialog: overrideDialog } = useAdminOverride();

  const [client, setClient] = React.useState<Client | null>(null);
  const [lines, setLines] = React.useState<InvoiceLine[]>([]);
  const [discount, setDiscount] = React.useState<DiscountState>({ kind: "NONE", value: 0 });
  const [promoInput, setPromoInput] = React.useState("");
  const [promoError, setPromoError] = React.useState("");
  // The operator bills as themselves; only an admin may bill as someone else.
  const [cashierId, setCashierId] = React.useState(user.staffId ?? "stf_rabia");
  const [linkedAppointmentId, setLinkedAppointmentId] = React.useState<string | undefined>();

  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [receipt, setReceipt] = React.useState<Invoice | null>(null);
  const [receiptOpen, setReceiptOpen] = React.useState(false);

  const lineSeq = React.useRef(0);
  const activeStaff = React.useMemo(() => staff.filter((s) => s.active), [staff]);
  const serviceStaff = React.useMemo(
    () => activeStaff.filter((s) => s.specialties.length > 0),
    [activeStaff],
  );

  const totals = React.useMemo(
    () => computeTotals(lines, discount, TAX_RATE),
    [lines, discount],
  );

  /* -------------------------------------------------- Today's open tickets */

  const today = React.useMemo(() => startOfDay(new Date()), []);
  const openTickets = React.useMemo(
    () =>
      appointmentsOn(appointments, today).filter(
        (a) => a.status === "IN_PROGRESS" || a.status === "SCHEDULED",
      ),
    [appointments, today],
  );

  /* ------------------------------------------------------------ Cart ops */

  const addLine = React.useCallback(
    (pick: CatalogPick) => {
      lineSeq.current += 1;
      const id = `ln_${lineSeq.current}`;

      setLines((current) => {
        // Same item + same staff => bump quantity instead of a duplicate row.
        const existing = current.find(
          (l) => l.refId === (pick.kind === "SERVICE" ? pick.item.id : pick.item.id) && l.kind === pick.kind,
        );
        if (existing && pick.kind === "PRODUCT") {
          return current.map((l) => (l.id === existing.id ? { ...l, qty: l.qty + 1 } : l));
        }

        if (pick.kind === "PRODUCT") {
          return [
            ...current,
            {
              id,
              kind: "PRODUCT",
              refId: pick.item.id,
              name: pick.item.name,
              unitPrice: pick.item.retailPrice,
              qty: 1,
              staffId: undefined,
              commissionRate: 0,
              lineDiscount: 0,
            },
          ];
        }

        if (pick.kind === "PACKAGE") {
          return [
            ...current,
            {
              id,
              kind: "PACKAGE",
              refId: pick.item.id,
              name: pick.item.name,
              unitPrice: pick.item.price,
              qty: 1,
              staffId: undefined,
              commissionRate: 0,
              lineDiscount: 0,
            },
          ];
        }

        return [
          ...current,
          {
            id,
            kind: "SERVICE",
            refId: pick.item.id,
            name: pick.item.name,
            unitPrice: pick.item.price,
            qty: 1,
            staffId: undefined,
            commissionRate: 0,
            lineDiscount: 0,
          },
        ];
      });
    },
    [],
  );

  const patchLine = (id: string, patch: Partial<InvoiceLine>) =>
    setLines((current) => current.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const removeLine = (id: string) => setLines((current) => current.filter((l) => l.id !== id));

  const resetTicket = React.useCallback(() => {
    setClient(null);
    setLines([]);
    setDiscount({ kind: "NONE", value: 0 });
    setPromoInput("");
    setPromoError("");
    setLinkedAppointmentId(undefined);
  }, []);

  /** Pull an existing booking onto the ticket, pre-filling client + services. */
  const loadAppointment = (appointmentId: string) => {
    const appointment = appointments.find((a) => a.id === appointmentId);
    if (!appointment) return;

    const member = staff.find((s) => s.id === appointment.staffId);
    const nextLines: InvoiceLine[] = appointment.serviceIds.flatMap((sid) => {
      const service = services.find((s) => s.id === sid);
      if (!service) return [];
      lineSeq.current += 1;
      return [
        {
          id: `ln_${lineSeq.current}`,
          kind: "SERVICE" as const,
          refId: service.id,
          name: service.name,
          unitPrice: service.price,
          qty: 1,
          staffId: member?.id,
          commissionRate: member?.commissionRate ?? 0,
          lineDiscount: 0,
        },
      ];
    });

    setLines(nextLines);
    setLinkedAppointmentId(appointment.id);
    setClient(clients.find((c) => c.id === appointment.clientId) ?? null);
    toast.success("Appointment loaded onto the ticket.");
  };

  /* ----------------------------------------------------------- Discounts */

  const setDiscountKind = (kind: DiscountState["kind"]) => {
    setPromoError("");
    setDiscount(kind === "NONE" ? { kind: "NONE", value: 0 } : { kind, value: 0 });
  };

  /**
   * Applies a manual discount, escalating to a manager PIN once it exceeds
   * the standard threshold. `authorize` resolves instantly for roles that
   * already hold `pos.discount.override`.
   */
  const applyManualDiscount = async (value: number) => {
    const asPercent =
      discount.kind === "PERCENT"
        ? value
        : totals.netSubtotal > 0
          ? (value / totals.netSubtotal) * 100
          : 0;

    if (asPercent > DISCOUNT_THRESHOLD_PERCENT) {
      const granted = await authorize(
        "pos.discount.override",
        `Discount of ${asPercent.toFixed(0)}% exceeds the ${DISCOUNT_THRESHOLD_PERCENT}% limit for your role.`,
      );
      if (!granted) return;
    }

    setDiscount((current) => ({ ...current, value: Math.max(0, value) }));
  };

  const redeemPromo = () => {
    const result = applyPromo(promoInput, totals.netSubtotal, promoCodes);
    if (!result.ok) {
      setPromoError(result.reason);
      return;
    }
    setDiscount(result.discount);
    setPromoError("");
    toast.success(`${result.promo.label} applied.`);
  };

  /* ------------------------------------------------------------ Checkout */

  const canCheckout = client !== null && lines.length > 0 && totals.total > 0;

  const unassigned = lines.filter((l) => l.kind !== "PRODUCT" && !l.staffId).length;

  const completeSale = async (payments: Payment[]) => {
    if (!client) return;

    // The server re-prices every line from the catalogue and attributes the
    // sale to the signed-in operator, so nothing here is trusted.
    const invoice = await actions.checkout({
      clientId: client.id,
      lines,
      discount,
      payments,
      taxRate: TAX_RATE,
      appointmentId: linkedAppointmentId,
    });

    if (!invoice) {
      toast.error("Checkout failed", {
        description: actions.lastError ?? "The sale was not recorded. Please try again.",
      });
      return;
    }

    setReceipt(invoice);
    setReceiptOpen(true);
    resetTicket();
  };

  return (
    <div className="grid gap-4 xl:h-[calc(100vh-7rem)] xl:grid-cols-[1fr_400px]">
      {/* ------------------------------------------------------- Catalogue */}
      <Card className="flex min-h-[520px] flex-col overflow-hidden xl:min-h-0">
        <Catalog onPick={addLine} />
      </Card>

      {/* ------------------------------------------------------------ Cart */}
      <Card className="flex min-h-0 flex-col overflow-hidden">
        {/* Client */}
        <div className="space-y-3 border-b border-hairline p-4">
          <div className="flex items-center justify-between">
            <Label>Client</Label>
            {lines.length > 0 && (
              <button
                onClick={resetTicket}
                className="inline-flex items-center gap-1 text-xs text-faint transition-colors hover:text-danger"
              >
                <RotateCcw className="size-3" /> Clear ticket
              </button>
            )}
          </div>

          <ClientPicker clientId={client?.id ?? null} onSelect={setClient} />

          {openTickets.length > 0 && lines.length === 0 && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <CalendarClock className="size-3" /> Today&apos;s open tickets
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {openTickets.slice(0, 4).map((appointment) => (
                  <button
                    key={appointment.id}
                    onClick={() => loadAppointment(appointment.id)}
                    className="rounded-full border border-hairline px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-gold/40 hover:text-gold"
                  >
                    {formatTime(appointment.start)} ·{" "}
                    {clients.find((c) => c.id === appointment.clientId)?.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Lines */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {lines.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="Ticket is empty"
              description="Tap any service, package or product on the left to start the bill."
            />
          ) : (
            <div className="space-y-2">
              {lines.map((line) => (
                <CartLine
                  key={line.id}
                  line={line}
                  staff={line.kind === "PRODUCT" ? activeStaff : serviceStaff}
                  onChange={(patch) => patchLine(line.id, patch)}
                  onRemove={() => removeLine(line.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Discount + totals */}
        {lines.length > 0 && (
          <div className="shrink-0 space-y-3 border-t border-hairline p-4">
            {/* Discount engine */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <BadgePercent className="size-3" /> Discount
                </Label>
                {discount.kind !== "NONE" && (
                  <button
                    onClick={() => setDiscountKind("NONE")}
                    className="inline-flex items-center gap-1 text-[11px] text-faint hover:text-danger"
                  >
                    <X className="size-3" /> Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { kind: "FLAT", label: "Flat", icon: Ticket },
                    { kind: "PERCENT", label: "Percent", icon: Percent },
                    { kind: "CODE", label: "Promo code", icon: BadgePercent },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.kind}
                    onClick={() => setDiscountKind(option.kind)}
                    className={cn(
                      "flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors",
                      discount.kind === option.kind
                        ? "border-gold/50 bg-gold/12 text-gold-light"
                        : "border-hairline text-muted hover:border-hairline-strong hover:text-ink",
                    )}
                  >
                    <option.icon className="size-3" />
                    {option.label}
                  </button>
                ))}
              </div>

              {(discount.kind === "FLAT" || discount.kind === "PERCENT") && (
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-faint">
                    {discount.kind === "FLAT" ? "Rs" : "%"}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={discount.kind === "PERCENT" ? 100 : totals.netSubtotal}
                    value={discount.value || ""}
                    placeholder="0"
                    onChange={(e) =>
                      setDiscount({ ...discount, value: Math.max(0, Number(e.target.value) || 0) })
                    }
                    // Escalation happens on commit, not on every keystroke,
                    // so the PIN prompt cannot fire mid-typing.
                    onBlur={(e) => void applyManualDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="tabular h-9 pl-9 text-right"
                  />
                </div>
              )}

              {discount.kind === "CODE" && (
                <>
                  <div className="flex gap-1.5">
                    <Input
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && redeemPromo()}
                      placeholder="Enter code"
                      className="h-9 uppercase"
                    />
                    <Button size="sm" variant="secondary" onClick={redeemPromo} className="h-9">
                      Apply
                    </Button>
                  </div>
                  {promoError && <p className="text-[11px] text-danger">{promoError}</p>}
                  {discount.code && (
                    <Badge variant="success" className="text-[10px]">
                      {discount.code} applied
                    </Badge>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {promoCodes
                      .filter((p) => p.active)
                      .slice(0, 3)
                      .map((promo) => (
                        <button
                          key={promo.code}
                          onClick={() => setPromoInput(promo.code)}
                          className="rounded border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-faint hover:border-gold/40 hover:text-gold"
                        >
                          {promo.code}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>

            <Separator />

            {/* Totals */}
            <div className="space-y-1 text-sm">
              <TotalRow label="Subtotal" value={formatMoney(totals.grossSubtotal)} />
              {totals.lineDiscountTotal > 0 && (
                <TotalRow
                  label="Item discounts"
                  value={`- ${formatMoney(totals.lineDiscountTotal)}`}
                  tone="warning"
                />
              )}
              {totals.invoiceDiscount > 0 && (
                <TotalRow
                  label={discount.code ? `Discount (${discount.code})` : "Discount"}
                  value={`- ${formatMoney(totals.invoiceDiscount)}`}
                  tone="warning"
                />
              )}
              {TAX_RATE > 0 && (
                <TotalRow label={`Tax (${TAX_RATE}%)`} value={formatMoney(totals.tax)} />
              )}
              {/* Commission is salon cost data — cashiers don't see it. */}
              {totals.commissionTotal > 0 && can("commissions.view.all") && (
                <TotalRow
                  label="Staff commission"
                  value={formatMoney(totals.commissionTotal)}
                  tone="muted"
                />
              )}

              <div className="flex items-end justify-between border-t border-hairline pt-2">
                <span className="text-sm text-muted">Total payable</span>
                <span className="tabular text-2xl font-semibold text-gilded">
                  {formatMoney(totals.total)}
                </span>
              </div>
            </div>

            {/* Cashier — only an admin may attribute a bill to someone else. */}
            <div className="flex items-center gap-2">
              <Label className="shrink-0">Billed by</Label>
              {can("staff.manage") ? (
                <Select value={cashierId} onValueChange={setCashierId}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeStaff.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="flex-1 truncate rounded-lg border border-hairline bg-obsidian-elevated px-3 py-1.5 text-xs text-muted">
                  {user.name}
                </span>
              )}
            </div>

            {unassigned > 0 && (
              <p className="rounded-md border border-warning/25 bg-warning/[0.06] p-2 text-[11px] text-warning">
                {unassigned} service line{unassigned === 1 ? " has" : "s have"} no staff assigned —
                commission won&apos;t be credited.
              </p>
            )}

            <Button
              size="lg"
              className="w-full"
              disabled={!canCheckout}
              onClick={() => setPaymentOpen(true)}
            >
              <CreditCard />
              {client ? `Charge ${formatMoney(totals.total)}` : "Select a client to continue"}
            </Button>
          </div>
        )}
      </Card>

      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        total={totals.total}
        onConfirm={completeSale}
      />

      <ReceiptDialog
        invoice={receipt}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        onNewSale={resetTicket}
      />

      {overrideDialog}
    </div>
  );
}

function TotalRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning" | "muted";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-muted", tone === "muted" && "text-faint")}>{label}</span>
      <span
        className={cn(
          "tabular",
          tone === "warning" ? "text-warning" : tone === "muted" ? "text-faint" : "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}
