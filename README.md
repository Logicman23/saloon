# Sana's Beauty Saloon — Management System

Enterprise salon management: point of sale, appointment scheduling, client CRM,
inventory, expenses and business analytics. Built as a dark, gold-accented
luxury dashboard.

**Stack** — Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
Radix UI primitives · Recharts · Lucide · Prisma / PostgreSQL

---

## Running it

The app reads and writes a real PostgreSQL database — there is no mock data.

```bash
npm install
cp .env.example .env          # fill DATABASE_URL, DIRECT_URL, AUTH_SECRET
npx prisma migrate deploy     # create the tables
npm run db:seed               # roles, staff, catalogue + first accounts
npm run dev                   # http://localhost:3000
```

`db:seed` prints the generated account passwords once — store them. Set
`OWNER_PASSWORD` / `CASHIER_PASSWORD` / `STAFF_PASSWORD` beforehand to choose
your own.

**No database to hand?** `scripts/pg-dev-server.mjs` runs Postgres in-process
(PGlite, no Docker required):

```bash
node scripts/pg-dev-server.mjs 5433
# then, in another shell:
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1&pgbouncer=true"
```

That harness serves one connection at a time, hence `connection_limit=1`.
It is for local work only — use Supabase or a managed Postgres in production.

Other scripts:

| Command            | What it does                          |
| ------------------ | ------------------------------------- |
| `npm run build`    | Production build                      |
| `npm run start`    | Serve the production build            |
| `npm run lint`     | ESLint (flat config, Next 16 rules)   |
| `npm run typecheck`| `tsc --noEmit`                        |
| `npm run db:push`  | Push the Prisma schema to PostgreSQL  |
| `npm run db:studio`| Prisma Studio                         |

## Data flow

```
Postgres
   ↑ writes            ↓ reads
server actions      src/lib/db/queries.ts   (rows → domain types)
src/lib/actions/*   src/lib/db/metrics.ts   (SQL SUM/COUNT aggregates)
   ↑                    ↓
   └── SalonProvider ───┘   (render cache, never the source of truth)
```

Reads happen on the server in `(app)/layout.tsx` and are handed to the client
provider. Writes go to server actions, which re-check the caller's permission,
write to Postgres and `revalidatePath`; the client then refreshes.

**Dashboard figures are computed by SQL, not JavaScript.** Revenue, net
profit, appointment counts, the revenue trend and the sales-breakdown ring
are all `SUM`/`COUNT` aggregates in `src/lib/db/metrics.ts`, with the
previous period computed in the same round trip for the change indicators.
No invoice rows travel to the browser just to be totalled.

Revenue is **accrual** — what was billed. Money not yet collected appears
separately as *Pending Invoices*, so the two never double-count.

### Verifying the SQL

```bash
node scripts/verify-sql.mjs          # 49 assertions, no setup required
DATABASE_URL=... node scripts/verify-writes.mjs   # 15 assertions, needs a seeded DB
```

`verify-sql.mjs` applies `prisma/migrations/0001_init/migration.sql` to a real
Postgres engine, seeds rows and asserts every dashboard aggregate returns the
expected figure — so a broken query fails here rather than on the dashboard.

---

## Authentication & RBAC

Three roles, defined once in `src/lib/auth/permissions.ts`:

| Role | Sees | Cannot |
| --- | --- | --- |
| **ADMIN** (Owner) | Everything, including P&L, expenses, staff and pricing | — |
| **CASHIER** (Reception) | POS, calendar, client directory, invoices, read-only catalogue and stock | Financial dashboards, reports, expenses, staff, price edits, invoice voids, contact export |
| **STAFF** (Beautician) | Own schedule, own service statuses, own commission | POS, inventory edits, expenses, client directory, everything financial |

Permissions are **capabilities** (`finance.view`, `pos.operate`, …), not screens.
Screens map to the capability they need via `ROUTE_PERMISSIONS`, so middleware,
the sidebar and in-page guards all derive from one matrix and cannot drift.

**Where enforcement actually happens**

```
src/middleware.ts          ← the real boundary. Verifies the signed cookie and
                             the route permission before a page renders.
src/app/(app)/layout.tsx   ← re-verifies server-side; fails closed to /login.
<ProtectedRoute> / <Can>   ← UX only. Keeps the UI honest; never a security control.
```

The session is an HMAC-SHA256-signed token in an **httpOnly, SameSite=Lax,
Secure** cookie, so client JavaScript — including anything injected via XSS —
cannot read or forge it. Passwords are PBKDF2-HMAC-SHA512 at 210k iterations
with per-user salts, compared in constant time. Unknown emails still pay the
hashing cost so response timing cannot enumerate accounts.

**Required environment** (see `.env.example`):

```
AUTH_SECRET=…          # ≥32 chars. Production refuses to sign sessions without it.
ADMIN_OVERRIDE_PIN=…   # manager PIN for cashier discount/void escalation
```

Accounts live in the `users` table and are created by `npm run db:seed`.
`src/lib/auth/users.server.ts` carries `import "server-only"`, so it is a build
error if password handling ever reaches the client bundle. Nothing is
hard-coded: there are no demo credentials in the source or the login page.

Failed sign-ins are throttled twice over — per IP in the route handler, and
per account in the database (10 consecutive failures locks it for 15 minutes).

Verify the whole flow — 42 assertions covering redirects, role enforcement,
forged cookies, PIN override and logout:

```bash
npm run dev
pwsh scripts/auth-smoke.ps1
```

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

## Connecting Supabase

Supabase exposes three connection strings and Prisma needs **two of them**.
They are not interchangeable:

| Env var | Which string | Port | Used for |
| --- | --- | --- | --- |
| `DATABASE_URL` | Transaction pooler | **6543** | every runtime query |
| `DIRECT_URL` | Direct (or Session pooler) | **5432** | migrations only |

Dashboard → **Connect**. Two details cause most failures:

- **The usernames differ.** Pooled is `postgres.[PROJECT-REF]`; direct is plain
  `postgres`. Mixing them gives "Tenant or user not found".
- **`?pgbouncer=true` is required on the pooled URL.** Without it Prisma uses
  prepared statements, which pgbouncer's transaction mode can't carry, and you
  get `prepared statement "s0" already exists`.

`DIRECT_URL` must never be pooled: `prisma migrate` issues DDL and advisory
locks that a transaction pooler drops.

```bash
cp .env.example .env      # paste both strings + AUTH_SECRET
npm run db:check          # validates the URLs and connects before you migrate
npm run db:setup          # = prisma migrate deploy && prisma/seed.ts
npm run dev
```

`db:check` reports the specific fix for each failure rather than a Prisma
stack trace — wrong port, missing `pgbouncer=true`, unencoded password
character, IPv6-only direct host.

**If `DIRECT_URL` is unreachable** your network is probably IPv4-only while
Supabase's direct host is IPv6-only. Use the **Session pooler** instead: same
port 5432, but the pooler host and the `postgres.[PROJECT-REF]` username.

`db:seed` is idempotent — safe to re-run after adding a service or permission.
It tops the database up without duplicating rows, and never overwrites the
password of an account that already exists.

### Why `migrate deploy` rather than `db push`

This repo has a committed migration (`prisma/migrations/0001_init`).
`prisma db push` diffs the schema straight onto the database without recording
migration history, so a database created that way is out of sync with
`_prisma_migrations` and the next `migrate deploy` will fail. Use `db push`
only for throwaway prototyping against a scratch database.

## Reference: schema notes

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
