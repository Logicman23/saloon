# Sana's Beauty Saloon — Management System

Enterprise salon management: point of sale, appointment scheduling, client CRM,
inventory, expenses and business analytics. Built as a dark, gold-accented
luxury dashboard.

**Stack** — Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
Radix UI primitives · Recharts · Lucide · Prisma / PostgreSQL

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts:

| Command            | What it does                          |
| ------------------ | ------------------------------------- |
| `npm run build`    | Production build                      |
| `npm run start`    | Serve the production build            |
| `npm run lint`     | ESLint (flat config, Next 16 rules)   |
| `npm run typecheck`| `tsc --noEmit`                        |
| `npm run db:push`  | Push the Prisma schema to PostgreSQL  |
| `npm run db:studio`| Prisma Studio                         |

The app ships with a **deterministic demo dataset** (46 clients, 33 services,
5 packages, 24 products, ~450 appointments, ~350 invoices, 3 months of
expenses) so every screen is populated on first run. No database is required
to explore the UI.

---

## Architecture

```
src/
  app/
    layout.tsx              Root layout — fonts, SalonProvider, AppShell
    page.tsx                Executive dashboard (KPIs + charts)
    pos/                    POS & quick billing
    appointments/           Calendar (day/week/month) + kanban board
    clients/                Client directory, history ledger, notes
    services/               Service catalogue + package deals
    inventory/              Stock levels, low-stock alerts, movement log
    expenses/               Expense ledger + category breakdown
    invoices/               All bills, payments, outstanding balances
    reports/                Sales, P&L and staff commission
    staff/                  Team performance and payroll

  components/
    ui/                     shadcn-style primitives (button, card, dialog, …)
    layout/                 Sidebar, topbar, Ctrl-K command palette
    dashboard/              KPI tiles and Recharts wrappers
    pos/                    Catalog, cart, client picker, payment, receipt
    appointments/           Calendar views, kanban, booking + detail dialogs
    brand/                  Wordmark and monogram

  lib/
    types.ts                Domain model (mirrors prisma/schema.prisma 1:1)
    billing.ts              Invoice arithmetic + commission engine
    analytics.ts (data/)    KPIs, time series, staff performance
    date.ts                 SSR-safe date formatting
    data/seed.ts            Deterministic demo dataset
    data/store.tsx          In-memory repository (swap for Prisma)
    pdf/receipt-pdf.ts      80mm thermal receipt as PDF
```

### The three core screens

**Dashboard** (`src/app/page.tsx`) — period-switchable KPIs (revenue, net
profit, appointments, pending invoices) each with a period-over-period delta,
a stacked services/retail revenue trend, a category donut, today's board,
a staff leaderboard and stock alerts.

**POS** (`src/app/pos/page.tsx`) — catalogue on the left (services / packages /
retail, filterable), ticket on the right. Client search or inline quick-add,
per-line staff attribution, line and invoice discounts, promo codes, split
payments across cash / card / wallet / transfer, then a printable 80mm receipt
and PDF download.

**Appointments** (`src/app/appointments/page.tsx`) — day view with a column per
specialist, week and month grids, and a drag-and-drop status board. Clicking an
empty slot opens the booking dialog pre-filled with that time and stylist.

### Money handling

All invoice arithmetic lives in `src/lib/billing.ts` as pure functions —
nothing derived is ever stored. The order of operations is fixed and
auditable:

```
line gross      = unitPrice × qty
line net        = gross − lineDiscount
netSubtotal     = Σ line net
invoiceDiscount = flat amount, or percent of netSubtotal
taxableBase     = netSubtotal − invoiceDiscount
tax             = taxableBase × taxRate%
total           = taxableBase + tax
```

Commission is earned on each line's share of `taxableBase`, so an
invoice-level discount is absorbed proportionally by every stylist on the
ticket rather than by the salon alone. Multi-stylist tickets work because each
line carries its own `staffId` and a snapshot of the `commissionRate` at sale
time.

Currency is PKR; change `CURRENCY` in `src/lib/utils.ts` to re-denominate.
Tax defaults to 0% — set `TAX_RATE` in `src/app/pos/page.tsx` for a
GST-registered salon.

---

## Connecting a real database

`prisma/schema.prisma` is the complete PostgreSQL/Supabase model for all six
modules — staff, clients, services, packages, products, stock movements,
appointments, invoices, invoice lines, payments, promo codes and expenses.
Money columns are `Decimal(12,2)`, never `Float`, so totals cannot drift.

```bash
cp .env.example .env       # fill in DATABASE_URL and DIRECT_URL
npm run db:push            # or: npm run db:migrate
```

The UI never touches persistence directly. Every read goes through
`useSalon()` and every write through one of the actions on
`src/lib/data/store.tsx`, and each of those actions maps to exactly one Prisma
write. Replacing the in-memory provider with server actions is a contained
change — no component needs to be touched.

---

## Design system

Tokens are defined once in `src/app/globals.css` under Tailwind v4's `@theme`:

| Role        | Token                        | Value              |
| ----------- | ---------------------------- | ------------------ |
| Canvas      | `obsidian`                   | `#0D0D0D`          |
| Elevated    | `obsidian-elevated`          | `#121212`          |
| Cards       | `charcoal`                   | `#1A1A1A`          |
| Accent      | `gold` / `gold-light`        | `#D4AF37` `#E5C158`|
| Text        | `ink` / `muted` / `faint`    | `#FFFFFF` `#A0A0A0`|
| Paid        | `success`                    | `#10B981`          |
| Pending     | `warning`                    | `#F59E0B`          |
| Overdue     | `danger`                     | `#E11D48`          |

Typography pairs Inter (UI) with Cormorant Garamond (`font-display`, used for
the wordmark and section headings). `.text-gilded` applies the brushed-metal
gold gradient; `.tabular` aligns figures in money columns.

Printing is scoped by `[data-print-root]` — a print stylesheet hides
everything else and formats the receipt to an 80mm roll, so Ctrl-P from the
POS emits only the slip.

---

## Notes

- Dates are formatted by hand in `src/lib/date.ts` rather than via
  `toLocaleString`, because Node and the browser can ship different ICU data
  and produce React hydration mismatches on SSR-rendered dates.
- The demo dataset is generated from a fixed PRNG seed anchored to today's
  local midnight, so the server render and client hydration always agree.
- Authentication is not included. Add your provider of choice (Supabase Auth,
  NextAuth) and gate the `(dashboard)` routes before deploying.
