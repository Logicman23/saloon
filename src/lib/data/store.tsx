"use client";

import * as React from "react";
import { computeTotals, formatInvoiceNumber, invoiceStatusFor } from "@/lib/billing";
import * as seed from "@/lib/data/seed";
import { round2 } from "@/lib/utils";
import type {
  Appointment,
  AppointmentStatus,
  Client,
  DiscountState,
  Expense,
  Invoice,
  InvoiceLine,
  Payment,
  Product,
  PromoCode,
  Service,
  ServicePackage,
  Staff,
  StockMovement,
  StockMovementType,
} from "@/lib/types";

/**
 * In-memory repository backing the whole UI.
 *
 * Every mutation here maps to exactly one Prisma write in production; the
 * component tree never touches persistence directly, so swapping this
 * provider for server actions is a contained change.
 */

interface SalonState {
  staff: Staff[];
  clients: Client[];
  services: Service[];
  packages: ServicePackage[];
  products: Product[];
  appointments: Appointment[];
  invoices: Invoice[];
  expenses: Expense[];
  stockMovements: StockMovement[];
  promoCodes: PromoCode[];
  invoiceSequence: number;
}

interface SalonActions {
  addClient: (input: Omit<Client, "id" | "createdAt" | "tags"> & { tags?: string[] }) => Client;
  updateClient: (id: string, patch: Partial<Client>) => void;

  bookAppointment: (input: Omit<Appointment, "id" | "createdAt">) => Appointment;
  updateAppointment: (id: string, patch: Partial<Appointment>) => void;
  setAppointmentStatus: (id: string, status: AppointmentStatus) => void;

  /** Commits a POS ticket: writes the invoice and decrements retail stock. */
  checkout: (input: {
    clientId: string;
    lines: InvoiceLine[];
    discount: DiscountState;
    payments: Payment[];
    taxRate: number;
    createdByStaffId: string;
    appointmentId?: string;
    note?: string;
  }) => Invoice;

  addExpense: (input: Omit<Expense, "id">) => Expense;
  deleteExpense: (id: string) => void;

  adjustStock: (input: {
    productId: string;
    type: StockMovementType;
    qty: number;
    note?: string;
    staffId?: string;
  }) => void;
  upsertProduct: (product: Product) => void;

  upsertService: (service: Service) => void;
  upsertPackage: (pkg: ServicePackage) => void;

  resetDemoData: () => void;
}

type SalonContextValue = SalonState & { actions: SalonActions };

const SalonContext = React.createContext<SalonContextValue | null>(null);

function initialState(): SalonState {
  return {
    staff: seed.staff,
    clients: seed.clients,
    services: seed.services,
    packages: seed.packages,
    products: seed.products,
    appointments: seed.appointments,
    invoices: seed.invoices,
    expenses: seed.expenses,
    stockMovements: seed.stockMovements,
    promoCodes: seed.promoCodes,
    invoiceSequence: seed.nextInvoiceSequence,
  };
}

export function SalonProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<SalonState>(initialState);

  // Client-side sequence for generated ids. Kept in a ref so it never
  // triggers a render and never diverges during hydration.
  const idRef = React.useRef(0);
  const newId = React.useCallback((prefix: string) => {
    idRef.current += 1;
    return `${prefix}_n${idRef.current}`;
  }, []);

  const actions = React.useMemo<SalonActions>(
    () => ({
      addClient: (input) => {
        const client: Client = {
          ...input,
          tags: input.tags ?? ["New"],
          id: newId("cli"),
          createdAt: new Date().toISOString(),
        };
        setState((s) => ({ ...s, clients: [client, ...s.clients] }));
        return client;
      },

      updateClient: (id, patch) =>
        setState((s) => ({
          ...s,
          clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      bookAppointment: (input) => {
        const appointment: Appointment = {
          ...input,
          id: newId("apt"),
          createdAt: new Date().toISOString(),
        };
        setState((s) => ({ ...s, appointments: [...s.appointments, appointment] }));
        return appointment;
      },

      updateAppointment: (id, patch) =>
        setState((s) => ({
          ...s,
          appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),

      setAppointmentStatus: (id, status) =>
        setState((s) => ({
          ...s,
          appointments: s.appointments.map((a) => (a.id === id ? { ...a, status } : a)),
        })),

      checkout: ({
        clientId,
        lines,
        discount,
        payments,
        taxRate,
        createdByStaffId,
        appointmentId,
        note,
      }) => {
        const totals = computeTotals(lines, discount, taxRate, payments);
        const now = new Date();

        let created!: Invoice;
        setState((s) => {
          const invoice: Invoice = {
            id: newId("inv"),
            number: formatInvoiceNumber(s.invoiceSequence, now.getFullYear()),
            clientId,
            appointmentId,
            lines,
            discount,
            payments,
            taxRate,
            status: invoiceStatusFor(totals.total, totals.paid),
            createdAt: now.toISOString(),
            createdByStaffId,
            note,
          };
          created = invoice;

          // Retail lines consume stock and leave an audit trail.
          const soldQty = new Map<string, number>();
          for (const line of lines) {
            if (line.kind === "PRODUCT") {
              soldQty.set(line.refId, (soldQty.get(line.refId) ?? 0) + line.qty);
            }
          }

          const movements: StockMovement[] = [];
          soldQty.forEach((qty, productId) => {
            idRef.current += 1;
            movements.push({
              id: `stk_n${idRef.current}`,
              productId,
              type: "RETAIL_SALE",
              qty: -qty,
              note: `Sold on ${invoice.number}`,
              staffId: createdByStaffId,
              at: now.toISOString(),
            });
          });

          return {
            ...s,
            invoiceSequence: s.invoiceSequence + 1,
            invoices: [invoice, ...s.invoices],
            products: s.products.map((p) =>
              soldQty.has(p.id) ? { ...p, stock: p.stock - (soldQty.get(p.id) ?? 0) } : p,
            ),
            stockMovements: [...movements, ...s.stockMovements],
            appointments: appointmentId
              ? s.appointments.map((a) =>
                  a.id === appointmentId ? { ...a, status: "COMPLETED" as AppointmentStatus } : a,
                )
              : s.appointments,
          };
        });

        return created;
      },

      addExpense: (input) => {
        const expense: Expense = { ...input, id: newId("exp") };
        setState((s) => ({ ...s, expenses: [expense, ...s.expenses] }));
        return expense;
      },

      deleteExpense: (id) =>
        setState((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) })),

      adjustStock: ({ productId, type, qty, note, staffId }) => {
        // `qty` arrives unsigned from the UI; direction is implied by type.
        const signed = type === "STOCK_IN" || type === "ADJUSTMENT" ? Math.abs(qty) : -Math.abs(qty);
        setState((s) => {
          idRef.current += 1;
          const movement: StockMovement = {
            id: `stk_n${idRef.current}`,
            productId,
            type,
            qty: signed,
            note,
            staffId,
            at: new Date().toISOString(),
          };
          return {
            ...s,
            stockMovements: [movement, ...s.stockMovements],
            products: s.products.map((p) =>
              p.id === productId ? { ...p, stock: Math.max(0, p.stock + signed) } : p,
            ),
          };
        });
      },

      upsertProduct: (product) =>
        setState((s) => ({
          ...s,
          products: s.products.some((p) => p.id === product.id)
            ? s.products.map((p) => (p.id === product.id ? product : p))
            : [product, ...s.products],
        })),

      upsertService: (service) =>
        setState((s) => ({
          ...s,
          services: s.services.some((x) => x.id === service.id)
            ? s.services.map((x) => (x.id === service.id ? service : x))
            : [service, ...s.services],
        })),

      upsertPackage: (pkg) =>
        setState((s) => ({
          ...s,
          packages: s.packages.some((x) => x.id === pkg.id)
            ? s.packages.map((x) => (x.id === pkg.id ? pkg : x))
            : [pkg, ...s.packages],
        })),

      resetDemoData: () => setState(initialState()),
    }),
    [newId],
  );

  const value = React.useMemo<SalonContextValue>(() => ({ ...state, actions }), [state, actions]);

  return <SalonContext.Provider value={value}>{children}</SalonContext.Provider>;
}

export function useSalon() {
  const ctx = React.useContext(SalonContext);
  if (!ctx) throw new Error("useSalon must be used inside <SalonProvider>.");
  return ctx;
}

/* ------------------------------------------------------------- Selectors */

export function useLookups() {
  const { staff, clients, services, products, packages } = useSalon();
  return React.useMemo(
    () => ({
      staffById: new Map(staff.map((s) => [s.id, s])),
      clientById: new Map(clients.map((c) => [c.id, c])),
      serviceById: new Map(services.map((s) => [s.id, s])),
      productById: new Map(products.map((p) => [p.id, p])),
      packageById: new Map(packages.map((p) => [p.id, p])),
    }),
    [staff, clients, services, products, packages],
  );
}

/** Invoice totals are derived, never stored — this memoises them per invoice. */
export function useInvoiceTotals(invoice: Invoice) {
  return React.useMemo(
    () => computeTotals(invoice.lines, invoice.discount, invoice.taxRate, invoice.payments),
    [invoice],
  );
}

export function totalsOf(invoice: Invoice) {
  return computeTotals(invoice.lines, invoice.discount, invoice.taxRate, invoice.payments);
}

/** Money actually collected on an invoice (used for revenue, not billed value). */
export function collectedOf(invoice: Invoice) {
  if (invoice.status === "VOID") return 0;
  return round2(invoice.payments.reduce((sum, p) => sum + p.amount, 0));
}
