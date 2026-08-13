/**
 * Applies the migration to a real Postgres engine and exercises the
 * dashboard's aggregate queries against it.
 *
 *   node scripts/verify-sql.mjs
 *
 * Uses PGlite — genuine Postgres compiled to WASM — so enum types, Decimal
 * precision, foreign keys and window functions all behave exactly as they
 * will on Supabase. No server or Docker required.
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

let pass = 0;
let fail = 0;

function check(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${label}  --> ${detail}`);
  }
}

const db = new PGlite();

/* ------------------------------------------------------------- Migration */

const migration = readFileSync(join(root, "prisma/migrations/0001_init/migration.sql"), "utf8");

try {
  await db.exec(migration);
  check("migration applies to a clean Postgres database", true);
} catch (error) {
  check("migration applies to a clean Postgres database", false, error.message);
  console.error(error);
  process.exit(1);
}

/* --------------------------------------------------- Tables from the spec */

const expectedTables = [
  "users",
  "clients",
  "services",
  "appointments",
  "sales_invoices",
  "inventory",
  "expenses",
  "staff",
  "user_roles",
  "permissions",
  "role_permissions",
  "sessions",
  "audit_logs",
  "invoice_lines",
  "payments",
  "stock_movements",
  "appointment_services",
  "service_packages",
  "package_services",
  "promo_codes",
];

const { rows: tables } = await db.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
);
const present = new Set(tables.map((r) => r.table_name));

for (const table of expectedTables) {
  check(`table ${table} exists`, present.has(table), `missing`);
}

/* ------------------------------------------------- Spec column names ---- */

const { rows: invCols } = await db.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'inventory'`,
);
const invNames = new Set(invCols.map((r) => r.column_name));
for (const col of ["product_name", "stock_qty", "min_stock_alert", "cost_price", "retail_price"]) {
  check(`inventory.${col} exists`, invNames.has(col));
}

const { rows: invoiceCols } = await db.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'sales_invoices'`,
);
const invoiceNames = new Set(invoiceCols.map((r) => r.column_name));
for (const col of ["total_amount", "payment_status", "client_id", "created_at"]) {
  check(`sales_invoices.${col} exists`, invoiceNames.has(col));
}

/* ----------------------------------------------------------- Seed rows -- */

await db.exec(`
  INSERT INTO user_roles (id, key, label, landing_path, is_system)
  VALUES ('role_admin', 'ADMIN', 'Owner', '/', true),
         ('role_cashier', 'CASHIER', 'Cashier', '/pos', false),
         ('role_staff', 'STAFF', 'Beautician', '/my-schedule', false);

  INSERT INTO staff (id, name, role, phone, commission_rate, specialties, monthly_salary, active, joined_at)
  VALUES ('stf_sana',   'Sana Malik',   'OWNER',          '0300-1', 0.000, ARRAY['HAIR']::"ServiceCategory"[], 0,     true, NOW()),
         ('stf_ayesha', 'Ayesha Khan',  'SENIOR_STYLIST', '0301-2', 0.150, ARRAY['HAIR']::"ServiceCategory"[], 65000, true, NOW()),
         ('stf_rabia',  'Rabia Sattar', 'RECEPTIONIST',   '0306-7', 0.020, ARRAY[]::"ServiceCategory"[],       35000, true, NOW());

  INSERT INTO users (id, email, name, password_hash, password_salt, active, sessions_valid_from,
                     failed_login_count, created_at, updated_at, role_id, staff_id)
  VALUES ('usr_owner', 'owner@sanasbeauty.pk', 'Sana Malik', 'hash', 'salt', true, NOW(), 0, NOW(), NOW(), 'role_admin', 'stf_sana');

  INSERT INTO clients (id, name, phone, tags, created_at, updated_at)
  VALUES ('cli_1', 'Aiman Ahmed', '0300-1111111', ARRAY['VIP'], NOW(), NOW()),
         ('cli_2', 'Sadia Khan',  '0300-2222222', ARRAY['Regular'], NOW(), NOW());

  INSERT INTO services (id, title, category, duration_mins, price, active)
  VALUES ('svc_cut',    'Haircut & Blow Dry', 'HAIR',   45, 2500,  true),
         ('svc_facial', 'Hydra Glow Facial',  'SKIN',   75, 7500,  true),
         ('svc_bridal', 'Bridal Makeup (HD)', 'MAKEUP',180, 45000, true);

  INSERT INTO inventory (id, product_name, sku, type, brand, unit, cost_price, retail_price,
                         stock_qty, min_stock_alert, created_at)
  VALUES ('prd_1', 'Argan Repair Shampoo', 'SBS-R001', 'RETAIL',     'Moroccanoil', 'pc', 3200, 5200, 18, 6, NOW()),
         ('prd_2', 'Bleach Powder 500g',   'SBS-C001', 'CONSUMABLE', 'Wella',       'tub',1800,    0,  3, 6, NOW());
`);
check("seed rows insert (roles, staff, users, clients, services, inventory)", true);

/* ------------------------------------------- Invoices across two months - */

await db.exec(`
  INSERT INTO sales_invoices
    (id, number, client_id, discount_kind, discount_value, tax_rate,
     total_amount, paid_amount, service_revenue, retail_revenue, commission_total,
     payment_status, created_by_staff_id, created_at, updated_at)
  VALUES
    ('inv_1','INV-2026-0001','cli_1','NONE',0,0, 10000, 10000, 10000,    0,  1500,'PAID',   'stf_rabia', NOW(), NOW()),
    ('inv_2','INV-2026-0002','cli_2','PERCENT',10,0, 6750,  6750,  5200, 1550,   780,'PAID',   'stf_rabia', NOW(), NOW()),
    ('inv_3','INV-2026-0003','cli_1','NONE',0,0,  5000,  2000,  5000,    0,   750,'PARTIAL','stf_rabia', NOW(), NOW()),
    ('inv_4','INV-2026-0004','cli_2','NONE',0,0,  8000,     0,  8000,    0,  1200,'UNPAID', 'stf_rabia', NOW(), NOW()),
    ('inv_old','INV-2026-0000','cli_1','NONE',0,0,20000, 20000, 18000, 2000,  2700,'PAID',  'stf_rabia',
       NOW() - INTERVAL '1 month', NOW() - INTERVAL '1 month');

  INSERT INTO invoice_lines (id, invoice_id, kind, ref_id, name, unit_price, qty, staff_id, commission_rate, line_discount)
  VALUES ('ln_1','inv_1','SERVICE','svc_cut','Haircut & Blow Dry', 2500, 4, 'stf_ayesha', 0.150, 0),
         ('ln_2','inv_2','SERVICE','svc_facial','Hydra Glow Facial',7500, 1, 'stf_ayesha', 0.150, 0),
         ('ln_3','inv_2','PRODUCT','prd_1','Argan Repair Shampoo',  5200, 1, 'stf_ayesha', 0.050, 0);

  INSERT INTO payments (id, invoice_id, payment_method, amount, at)
  VALUES ('pay_1','inv_1','CASH',10000, NOW()),
         ('pay_2','inv_2','CARD', 6750, NOW()),
         ('pay_3','inv_3','CASH', 2000, NOW());

  INSERT INTO expenses (id, category, amount, expense_date, payment_method, recorded_by_staff_id, created_at)
  VALUES ('exp_1','RENT',        185000, NOW(), 'TRANSFER','stf_rabia', NOW()),
         ('exp_2','REFRESHMENTS',   1200, NOW(), 'CASH',    'stf_rabia', NOW()),
         ('exp_3','RENT',        185000, NOW() - INTERVAL '1 month','TRANSFER','stf_rabia', NOW() - INTERVAL '1 month');

  INSERT INTO appointments (id, client_id, staff_id, scheduled_at, duration_mins, status, created_at, updated_at)
  VALUES ('apt_1','cli_1','stf_ayesha', NOW(), 45,'COMPLETED', NOW(), NOW()),
         ('apt_2','cli_2','stf_ayesha', NOW() + INTERVAL '2 hours', 75,'SCHEDULED', NOW(), NOW()),
         ('apt_3','cli_1','stf_ayesha', NOW() - INTERVAL '1 day', 45,'NO_SHOW', NOW(), NOW());

  INSERT INTO appointment_services (appointment_id, service_id)
  VALUES ('apt_1','svc_cut'), ('apt_2','svc_facial');
`);
check("invoice / payment / expense / appointment rows insert", true);

/* ------------------------------------------- Dashboard aggregate queries- */

// KPI: revenue this month vs last month
const kpi = await db.query(`
  SELECT
    COALESCE(SUM(service_revenue + retail_revenue) FILTER (
      WHERE created_at >= date_trunc('month', NOW())), 0)::numeric AS revenue_this_month,
    COALESCE(SUM(service_revenue + retail_revenue) FILTER (
      WHERE created_at >= date_trunc('month', NOW()) - INTERVAL '1 month'
        AND created_at <  date_trunc('month', NOW())), 0)::numeric AS revenue_last_month,
    COUNT(*) FILTER (WHERE payment_status IN ('UNPAID','PARTIAL')) AS pending_invoices,
    COALESCE(SUM(total_amount - paid_amount) FILTER (
      WHERE payment_status IN ('UNPAID','PARTIAL')), 0)::numeric AS outstanding
  FROM sales_invoices
  WHERE payment_status <> 'VOID'
`);
const k = kpi.rows[0];
// Revenue is ACCRUAL (billed), not cash collected: 10000 + 6750 + 5000 + 8000.
// inv_4 is unpaid but still earned — what has not been collected shows up in
// the separate "outstanding" figure below, so the two never double-count.
check("KPI revenue this month = 29750", Number(k.revenue_this_month) === 29750, `got ${k.revenue_this_month}`);
check("KPI revenue last month = 20000", Number(k.revenue_last_month) === 20000, `got ${k.revenue_last_month}`);
check("KPI pending invoice count = 2", Number(k.pending_invoices) === 2, `got ${k.pending_invoices}`);
check("KPI outstanding = 11000", Number(k.outstanding) === 11000, `got ${k.outstanding}`);

// Net profit: revenue minus expenses, this month
const profit = await db.query(`
  WITH rev AS (
    SELECT COALESCE(SUM(service_revenue + retail_revenue), 0) AS total
    FROM sales_invoices
    WHERE payment_status <> 'VOID' AND created_at >= date_trunc('month', NOW())
  ), spend AS (
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM expenses WHERE expense_date >= date_trunc('month', NOW())
  )
  SELECT rev.total::numeric AS revenue, spend.total::numeric AS expenses,
         (rev.total - spend.total)::numeric AS net_profit
  FROM rev, spend
`);
const p = profit.rows[0];
// 29750 revenue - (185000 rent + 1200 refreshments) = -156450
check("net profit = 29750 - 186200 = -156450", Number(p.net_profit) === -156450, `got ${p.net_profit}`);

// Revenue trend: daily buckets
const trend = await db.query(`
  SELECT date_trunc('day', created_at)::date AS day,
         COALESCE(SUM(service_revenue), 0)::numeric AS services,
         COALESCE(SUM(retail_revenue), 0)::numeric AS retail
  FROM sales_invoices
  WHERE payment_status <> 'VOID' AND created_at >= NOW() - INTERVAL '30 days'
  GROUP BY 1 ORDER BY 1
`);
check("revenue trend returns daily buckets", trend.rows.length >= 1, `rows=${trend.rows.length}`);

// Sales breakdown by service category (the ring chart)
const breakdown = await db.query(`
  SELECT COALESCE(s.category::text, 'RETAIL') AS category,
         SUM(l.unit_price * l.qty - l.line_discount)::numeric AS revenue
  FROM invoice_lines l
  JOIN sales_invoices i ON i.id = l.invoice_id
  LEFT JOIN services s ON s.id = l.ref_id AND l.kind = 'SERVICE'
  WHERE i.payment_status <> 'VOID'
  GROUP BY 1 ORDER BY revenue DESC
`);
const cats = Object.fromEntries(breakdown.rows.map((r) => [r.category, Number(r.revenue)]));
check("breakdown HAIR = 10000", cats.HAIR === 10000, `got ${cats.HAIR}`);
check("breakdown SKIN = 7500", cats.SKIN === 7500, `got ${cats.SKIN}`);
check("breakdown RETAIL = 5200", cats.RETAIL === 5200, `got ${cats.RETAIL}`);

// Appointment counts by status
const appts = await db.query(`
  SELECT status::text, COUNT(*)::int AS n FROM appointments GROUP BY 1
`);
const byStatus = Object.fromEntries(appts.rows.map((r) => [r.status, r.n]));
check("appointments COMPLETED = 1", byStatus.COMPLETED === 1, `got ${byStatus.COMPLETED}`);
check("appointments SCHEDULED = 1", byStatus.SCHEDULED === 1, `got ${byStatus.SCHEDULED}`);

// Staff commission report
const commission = await db.query(`
  SELECT st.name, SUM(l.unit_price * l.qty * l.commission_rate)::numeric AS commission
  FROM invoice_lines l
  JOIN staff st ON st.id = l.staff_id
  JOIN sales_invoices i ON i.id = l.invoice_id
  WHERE i.payment_status <> 'VOID'
  GROUP BY st.name
`);
check(
  "commission for Ayesha = 1500 + 1125 + 260 = 2885",
  Number(commission.rows[0]?.commission) === 2885,
  `got ${commission.rows[0]?.commission}`,
);

// Low stock alert
const low = await db.query(
  `SELECT product_name FROM inventory WHERE stock_qty <= min_stock_alert ORDER BY stock_qty`,
);
check("low-stock query finds the bleach powder", low.rows[0]?.product_name === "Bleach Powder 500g", JSON.stringify(low.rows));

// Client total spend (the spec's clients.total_spend, computed)
const spend = await db.query(`
  SELECT c.name, COALESCE(SUM(i.paid_amount), 0)::numeric AS total_spend
  FROM clients c LEFT JOIN sales_invoices i
    ON i.client_id = c.id AND i.payment_status <> 'VOID'
  GROUP BY c.name ORDER BY total_spend DESC
`);
check("client total_spend aggregates payments", Number(spend.rows[0].total_spend) === 32000, JSON.stringify(spend.rows));

/* ------------------------------------------------- Constraint behaviour - */

try {
  await db.query(`INSERT INTO clients (id, name, phone, tags, created_at, updated_at)
                  VALUES ('cli_dup','Dup','0300-1111111', ARRAY[]::text[], NOW(), NOW())`);
  check("duplicate client phone rejected", false, "insert succeeded");
} catch {
  check("duplicate client phone rejected", true);
}

try {
  await db.query(`INSERT INTO sales_invoices
    (id, number, client_id, discount_kind, discount_value, tax_rate, total_amount, paid_amount,
     service_revenue, retail_revenue, commission_total, payment_status, created_by_staff_id, created_at, updated_at)
    VALUES ('inv_bad','INV-X','cli_missing','NONE',0,0,0,0,0,0,0,'UNPAID','stf_rabia',NOW(),NOW())`);
  check("invoice with unknown client rejected by FK", false, "insert succeeded");
} catch {
  check("invoice with unknown client rejected by FK", true);
}

// Deleting a client cascades its appointments but is restricted by invoices.
try {
  await db.query(`DELETE FROM clients WHERE id = 'cli_1'`);
  check("client with invoices cannot be deleted (Restrict)", false, "delete succeeded");
} catch {
  check("client with invoices cannot be deleted (Restrict)", true);
}

console.log("");
console.log("==================================");
console.log(`PASSED: ${pass}    FAILED: ${fail}`);
console.log("==================================");

await db.close();
process.exit(fail === 0 ? 0 : 1);
