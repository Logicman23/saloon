/**
 * Domain model for Sana's Beauty Saloon.
 *
 * These types mirror `prisma/schema.prisma` 1:1 so the mock repository in
 * `src/lib/data/*` can be swapped for real Prisma queries without touching
 * a single component.
 */

/* ------------------------------------------------------------------ People */

export type StaffRole =
  | "Owner"
  | "Senior Stylist"
  | "Stylist"
  | "Beautician"
  | "Nail Technician"
  | "Makeup Artist"
  | "Receptionist";

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  phone: string;
  /** Default share of a service's net price earned as commission (0–1). */
  commissionRate: number;
  /** Service category slugs this member is booked for. */
  specialties: ServiceCategory[];
  monthlySalary: number;
  active: boolean;
  joinedAt: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email?: string;
  gender?: "Female" | "Male" | "Other";
  /** Free-text stylist notes: allergies, preferred formulas, etc. */
  notes?: string;
  tags: string[];
  createdAt: string;
}

/* ------------------------------------------------------- Services & bundles */

export const SERVICE_CATEGORIES = ["Hair", "Skin", "Makeup", "Nails", "Spa"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export interface Service {
  id: string;
  name: string;
  category: ServiceCategory;
  /** Chair time in minutes — drives calendar block height. */
  durationMin: number;
  price: number;
  description?: string;
  /** Bookable now. Switched off is a pause, not a removal. */
  active: boolean;
  /**
   * Soft-deleted. Unlike products and packages these are still delivered to
   * the client, because past appointments and invoice lines resolve their
   * name and category through the service id — dropping them from the list
   * would blank out history. Catalogue surfaces filter on this instead.
   */
  archived: boolean;
}

export interface ServicePackage {
  id: string;
  name: string;
  description?: string;
  serviceIds: string[];
  /** Bundled price; the UI derives savings vs. the sum of member services. */
  price: number;
  active: boolean;
}

/* -------------------------------------------------------------- Inventory */

export type ProductType = "RETAIL" | "CONSUMABLE";

export interface Product {
  id: string;
  name: string;
  sku: string;
  /** RETAIL is sellable at the counter; CONSUMABLE is back-bar stock. */
  type: ProductType;
  brand: string;
  unit: string;
  costPrice: number;
  retailPrice: number;
  stock: number;
  lowStockThreshold: number;
  supplier?: string;
}

export const STOCK_MOVEMENT_TYPES = [
  "STOCK_IN",
  "SERVICE_USAGE",
  "RETAIL_SALE",
  "DAMAGED",
  "EXPIRED",
  "ADJUSTMENT",
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  /** Signed: positive adds to stock, negative removes. */
  qty: number;
  note?: string;
  staffId?: string;
  at: string;
}

/* ------------------------------------------------------------ Appointments */

export const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export interface Appointment {
  id: string;
  clientId: string;
  staffId: string;
  serviceIds: string[];
  /** ISO datetime. */
  start: string;
  durationMin: number;
  status: AppointmentStatus;
  notes?: string;
  createdAt: string;
}

/* ---------------------------------------------------------------- Billing */

export type LineKind = "SERVICE" | "PRODUCT" | "PACKAGE";

export interface InvoiceLine {
  id: string;
  kind: LineKind;
  /** Service / Product / Package id this line was created from. */
  refId: string;
  name: string;
  unitPrice: number;
  qty: number;
  /** Per-line staff attribution — this is what drives commission reporting. */
  staffId?: string;
  /** Snapshot of the staff member's rate at sale time (0–1). */
  commissionRate: number;
  /** Line-level discount amount in currency, applied before invoice discount. */
  lineDiscount: number;
}

export type DiscountKind = "NONE" | "FLAT" | "PERCENT" | "CODE";

export interface DiscountState {
  kind: DiscountKind;
  /** Flat currency amount, or percent 0–100, depending on `kind`. */
  value: number;
  code?: string;
}

export interface PromoCode {
  code: string;
  label: string;
  kind: "FLAT" | "PERCENT";
  value: number;
  minSpend: number;
  active: boolean;
}

export const PAYMENT_MODES = ["CASH", "CARD", "WALLET", "TRANSFER"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export interface Payment {
  id: string;
  mode: PaymentMode;
  amount: number;
  /** Last-4, wallet txn id, or bank reference. */
  reference?: string;
  at: string;
}

export type InvoiceStatus = "PAID" | "PARTIAL" | "UNPAID" | "VOID";

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  appointmentId?: string;
  lines: InvoiceLine[];
  discount: DiscountState;
  payments: Payment[];
  /** Percentage, e.g. 0 for services-only salons or 16 for GST. */
  taxRate: number;
  status: InvoiceStatus;
  createdAt: string;
  createdByStaffId: string;
  note?: string;
}

/** Fully derived money figures — see `lib/billing.ts`. */
export interface InvoiceTotals {
  grossSubtotal: number;
  lineDiscountTotal: number;
  netSubtotal: number;
  invoiceDiscount: number;
  taxableBase: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  changeDue: number;
  commissionTotal: number;
}

/* --------------------------------------------------------------- Expenses */

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Utilities",
  "Product Purchase",
  "Staff Salary",
  "Refreshments",
  "Marketing",
  "Maintenance",
  "Miscellaneous",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  /** ISO date (no time component needed for the ledger). */
  date: string;
  vendor?: string;
  note?: string;
  paymentMode: PaymentMode;
  /** Filename of the attached receipt scan. */
  attachment?: string;
  recordedByStaffId: string;
}

/* -------------------------------------------------------------- Reporting */

export interface StaffPerformance {
  staff: Staff;
  serviceRevenue: number;
  retailRevenue: number;
  commission: number;
  invoiceCount: number;
  clientCount: number;
  appointmentsCompleted: number;
}

export interface RevenuePoint {
  label: string;
  services: number;
  retail: number;
  expenses: number;
}
