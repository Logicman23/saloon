"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { computeTotals } from "@/lib/billing";
import { round2 } from "@/lib/utils";
import {
  createAppointmentAction,
  createClientAction,
  createExpenseAction,
  deleteExpenseAction,
  adjustStockAction,
  setAppointmentStatusAction,
  updateAppointmentAction,
  updateClientNotesAction,
  createStaffAction,
} from "@/lib/actions/salon";
import {
  archivePackageAction,
  archiveProductAction,
  archiveServiceAction,
  createPackageAction,
  createProductAction,
  createServiceAction,
  updatePackageAction,
  updateProductAction,
  updateServiceAction,
} from "@/lib/actions/catalog";
import { checkoutAction } from "@/lib/actions/pos";
import type {
  Appointment,
  AppointmentStatus,
  Client,
  ServiceCategory,
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
 * Client-side view of the salon, hydrated from the database.
 *
 * The provider no longer *generates* anything — `(app)/layout.tsx` reads the
 * data on the server and passes it in. Mutations go to server actions, which
 * write to Postgres and call `revalidatePath`; `router.refresh()` then pulls
 * the updated snapshot back down. React state is a render cache here, never
 * the source of truth.
 */

/**
 * Outcome of a write. Structurally identical to the server's `ActionResult`,
 * redeclared here so this client module never imports from a `server-only`
 * file — even for a type.
 */
export type SaveResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Create and edit send the same payload, so the forms take one shape and the
 * id is what decides which action runs.
 */
export interface ProductInput {
  name: string;
  sku: string;
  type: Product["type"];
  brand: string;
  unit: string;
  costPrice: number;
  retailPrice: number;
  stock: number;
  lowStockThreshold: number;
  supplier?: string;
}

export interface ServiceInput {
  name: string;
  category: ServiceCategory;
  durationMin: number;
  price: number;
  description?: string;
  active: boolean;
}

export interface PackageInput {
  name: string;
  description?: string;
  price: number;
  serviceIds: string[];
  active: boolean;
}

export interface SalonData {
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
}

interface SalonActions {
  addClient: (input: {
    name: string;
    phone: string;
    email?: string;
    notes?: string;
    gender?: Client["gender"];
  }) => Promise<Client | null>;
  updateClient: (id: string, patch: { notes?: string }) => Promise<void>;

  bookAppointment: (input: {
    clientId: string;
    staffId: string;
    serviceIds: string[];
    start: string;
    durationMin: number;
    status?: AppointmentStatus;
    notes?: string;
  }) => Promise<void>;
  updateAppointment: (
    id: string,
    patch: {
      clientId: string;
      staffId: string;
      serviceIds: string[];
      start: string;
      notes?: string;
    },
  ) => Promise<void>;
  setAppointmentStatus: (id: string, status: AppointmentStatus) => Promise<void>;

  checkout: (input: {
    clientId: string;
    lines: InvoiceLine[];
    discount: DiscountState;
    payments: Payment[];
    taxRate: number;
    appointmentId?: string;
    note?: string;
  }) => Promise<Invoice | null>;

  addExpense: (input: Omit<Expense, "id">) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;

  adjustStock: (input: {
    productId: string;
    type: StockMovementType;
    qty: number;
    note?: string;
  }) => Promise<void>;

  addProduct: (input: ProductInput) => Promise<SaveResult<Product>>;
  updateProduct: (id: string, input: ProductInput) => Promise<SaveResult<Product>>;
  /**
   * Named for what it does. The button says "Delete", but the row is retired
   * rather than dropped — deleting it would cascade the stock ledger away.
   */
  archiveProduct: (id: string) => Promise<SaveResult<{ name: string }>>;

  addService: (input: ServiceInput) => Promise<SaveResult<Service>>;
  updateService: (id: string, input: ServiceInput) => Promise<SaveResult<Service>>;
  /** Soft delete — see `archiveProduct`. Refused if bookings or deals need it. */
  archiveService: (id: string) => Promise<SaveResult<{ name: string }>>;

  addPackage: (input: PackageInput) => Promise<SaveResult<ServicePackage>>;
  updatePackage: (id: string, input: PackageInput) => Promise<SaveResult<ServicePackage>>;
  /** Soft delete — see `archiveProduct`. */
  archivePackage: (id: string) => Promise<SaveResult<{ name: string }>>;

  addStaff: (input: {
    name: string;
    role: Staff["role"];
    phone: string;
    email?: string;
    commissionRate: number;
    specialties: ServiceCategory[];
    monthlySalary: number;
    active: boolean;
  }) => Promise<SaveResult<{ id: string }>>;

  /** Last error from a server action, for surfacing in the UI. */
  lastError: string | null;
}

type SalonContextValue = SalonData & { actions: SalonActions; pending: boolean };

const SalonContext = React.createContext<SalonContextValue | null>(null);

export function SalonProvider({
  data,
  children,
}: {
  data: SalonData;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [lastError, setLastError] = React.useState<string | null>(null);

  /** Re-fetches the server snapshot after a successful write. */
  const refresh = React.useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  /**
   * Records the outcome and hands the result straight back to the caller.
   *
   * Returning the error rather than only parking it in `lastError` matters:
   * `actions` is memoised, so a form that awaits an action and then reads
   * `actions.lastError` reads the copy captured in its own render — which is
   * still the previous value. Every failure then shows a stale or generic
   * message, which is precisely when an accurate one is worth most.
   */
  const finish = React.useCallback(
    <T,>(result: SaveResult<T>): SaveResult<T> => {
      if (result.ok) {
        setLastError(null);
        refresh();
      } else {
        setLastError(result.error);
      }
      return result;
    },
    [refresh],
  );

  const actions = React.useMemo<SalonActions>(
    () => ({
      lastError,

      addClient: async (input) => {
        const result = await createClientAction(input);
        if (!result.ok) {
          setLastError(result.error);
          return null;
        }
        setLastError(null);
        refresh();
        return {
          id: result.data.id,
          name: result.data.name,
          phone: result.data.phone,
          tags: ["New"],
          createdAt: new Date().toISOString(),
        };
      },

      updateClient: async (id, patch) => {
        const result = await updateClientNotesAction(id, patch.notes ?? "");
        if (!result.ok) setLastError(result.error);
        else {
          setLastError(null);
          refresh();
        }
      },

      bookAppointment: async (input) => {
        const result = await createAppointmentAction({
          clientId: input.clientId,
          staffId: input.staffId,
          serviceIds: input.serviceIds,
          start: input.start,
          notes: input.notes,
        });
        if (!result.ok) setLastError(result.error);
        else {
          setLastError(null);
          refresh();
        }
      },

      updateAppointment: async (id, patch) => {
        const result = await updateAppointmentAction(id, {
          clientId: patch.clientId,
          staffId: patch.staffId,
          serviceIds: patch.serviceIds,
          start: patch.start,
          notes: patch.notes,
        });
        if (!result.ok) setLastError(result.error);
        else {
          setLastError(null);
          refresh();
        }
      },

      setAppointmentStatus: async (id, status) => {
        const result = await setAppointmentStatusAction(id, status);
        if (!result.ok) setLastError(result.error);
        else {
          setLastError(null);
          refresh();
        }
      },

      checkout: async (input) => {
        const result = await checkoutAction({
          clientId: input.clientId,
          appointmentId: input.appointmentId,
          lines: input.lines.map((l) => ({
            kind: l.kind,
            refId: l.refId,
            name: l.name,
            unitPrice: l.unitPrice,
            qty: l.qty,
            staffId: l.staffId,
            commissionRate: l.commissionRate,
            lineDiscount: l.lineDiscount,
          })),
          discount: input.discount,
          payments: input.payments.map((p) => ({
            mode: p.mode,
            amount: p.amount,
            reference: p.reference,
          })),
          taxRate: input.taxRate,
          note: input.note,
        });

        if (!result.ok) {
          setLastError(result.error);
          return null;
        }
        setLastError(null);
        refresh();

        // Enough of the invoice to render the receipt immediately, without
        // waiting for the refresh to land.
        const totals = computeTotals(input.lines, input.discount, input.taxRate, input.payments);
        return {
          id: result.data.invoiceId,
          number: result.data.number,
          clientId: input.clientId,
          appointmentId: input.appointmentId,
          lines: input.lines,
          discount: input.discount,
          payments: input.payments,
          taxRate: input.taxRate,
          status: totals.paid + 0.01 >= totals.total ? "PAID" : totals.paid > 0 ? "PARTIAL" : "UNPAID",
          createdAt: new Date().toISOString(),
          createdByStaffId: "",
          note: input.note,
        };
      },

      addExpense: async (input) => {
        const result = await createExpenseAction({
          category: input.category,
          amount: input.amount,
          date: input.date,
          vendor: input.vendor,
          note: input.note,
          paymentMode: input.paymentMode,
          attachment: input.attachment,
        });
        if (!result.ok) setLastError(result.error);
        else {
          setLastError(null);
          refresh();
        }
      },

      deleteExpense: async (id) => {
        const result = await deleteExpenseAction(id);
        if (!result.ok) setLastError(result.error);
        else {
          setLastError(null);
          refresh();
        }
      },

      adjustStock: async (input) => {
        const result = await adjustStockAction({
          productId: input.productId,
          type: input.type,
          qty: input.qty,
          note: input.note,
        });
        if (!result.ok) setLastError(result.error);
        else {
          setLastError(null);
          refresh();
        }
      },

      addProduct: async (input) => finish(await createProductAction(input)),
      updateProduct: async (id, input) => finish(await updateProductAction(id, input)),
      archiveProduct: async (id) => finish(await archiveProductAction(id)),

      addService: async (input) => finish(await createServiceAction(input)),
      updateService: async (id, input) => finish(await updateServiceAction(id, input)),
      archiveService: async (id) => finish(await archiveServiceAction(id)),

      addPackage: async (input) => finish(await createPackageAction(input)),
      updatePackage: async (id, input) => finish(await updatePackageAction(id, input)),
      archivePackage: async (id) => finish(await archivePackageAction(id)),

      addStaff: async (input) => finish(await createStaffAction(input)),
    }),
    [refresh, finish, lastError],
  );

  const value = React.useMemo<SalonContextValue>(
    () => ({ ...data, actions, pending }),
    [data, actions, pending],
  );

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

export function useInvoiceTotals(invoice: Invoice) {
  return React.useMemo(
    () => computeTotals(invoice.lines, invoice.discount, invoice.taxRate, invoice.payments),
    [invoice],
  );
}

export function totalsOf(invoice: Invoice) {
  return computeTotals(invoice.lines, invoice.discount, invoice.taxRate, invoice.payments);
}

export function collectedOf(invoice: Invoice) {
  if (invoice.status === "VOID") return 0;
  return round2(invoice.payments.reduce((sum, p) => sum + p.amount, 0));
}
