/**
 * Proves that writes reach Postgres and that the dashboard aggregates move.
 * Exercises the server-action path indirectly by writing through Prisma the
 * same way checkoutAction does, then re-running the real KPI queries.
 */
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Point it at a migrated, seeded database.");
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url } } });

let pass = 0;
let fail = 0;
const check = (label, cond, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${label}  --> ${detail}`);
  }
};

const n = (v) => (v == null ? 0 : Number(v.toString()));

// --- Baseline ---------------------------------------------------------
const before = await prisma.$queryRawUnsafe(`
  SELECT COALESCE(SUM(service_revenue + retail_revenue),0)::numeric AS revenue,
         COUNT(*)::int AS invoices
  FROM sales_invoices WHERE payment_status <> 'VOID'
    AND created_at >= date_trunc('month', NOW())
`);
const baseRevenue = n(before[0].revenue);
const baseCount = before[0].invoices;
check("baseline reads cleanly", Number.isFinite(baseRevenue), `${baseRevenue}`);

// --- Create a client, book, then bill it ------------------------------
const client = await prisma.client.create({
  data: { name: "Test Walk-In", phone: "0399-9999999", tags: ["New"] },
});
check("client persisted", Boolean(client.id));

const service = await prisma.service.findFirstOrThrow({ where: { name: "Haircut & Blow Dry" } });
const stylist = await prisma.staff.findFirstOrThrow({ where: { id: "stf_ayesha" } });

const appointment = await prisma.appointment.create({
  data: {
    clientId: client.id,
    staffId: stylist.id,
    start: new Date(),
    durationMin: service.durationMin,
    services: { create: [{ serviceId: service.id }] },
  },
});
check("appointment persisted with service join", Boolean(appointment.id));

const shampoo = await prisma.product.findFirstOrThrow({ where: { sku: "SBS-R001" } });
const stockBefore = shampoo.stock;

const unit = Number(service.price);
const retail = Number(shampoo.retailPrice);
const gross = unit + retail;
const rate = Number(stylist.commissionRate);

const invoice = await prisma.$transaction(async (tx) => {
  const created = await tx.invoice.create({
    data: {
      number: "INV-TEST-0001",
      clientId: client.id,
      appointmentId: appointment.id,
      totalAmount: gross,
      paidAmount: gross,
      serviceRevenue: unit,
      retailRevenue: retail,
      commissionTotal: unit * rate + retail * 0.05,
      status: "PAID",
      createdByStaffId: stylist.id,
      lines: {
        create: [
          { kind: "SERVICE", refId: service.id, name: service.name, unitPrice: unit, qty: 1, staffId: stylist.id, commissionRate: rate, lineDiscount: 0 },
          { kind: "PRODUCT", refId: shampoo.id, name: shampoo.name, unitPrice: retail, qty: 1, staffId: stylist.id, commissionRate: 0.05, lineDiscount: 0 },
        ],
      },
      payments: { create: [{ mode: "CASH", amount: gross }] },
    },
    include: { lines: true, payments: true },
  });

  await tx.product.update({ where: { id: shampoo.id }, data: { stock: { decrement: 1 } } });
  await tx.stockMovement.create({
    data: { productId: shampoo.id, type: "RETAIL_SALE", qty: -1, note: `Sold on ${created.number}` },
  });
  await tx.appointment.update({ where: { id: appointment.id }, data: { status: "COMPLETED" } });

  return created;
});

check("invoice persisted with 2 lines", invoice.lines.length === 2, `${invoice.lines.length}`);
check("payment persisted", invoice.payments.length === 1);

// --- Stock decremented -------------------------------------------------
const after = await prisma.product.findUniqueOrThrow({ where: { id: shampoo.id } });
check("retail sale decremented stock", after.stock === stockBefore - 1, `${stockBefore} -> ${after.stock}`);

const movement = await prisma.stockMovement.findFirst({
  where: { productId: shampoo.id }, orderBy: { at: "desc" },
});
check("stock movement logged", movement?.qty === -1, `${movement?.qty}`);

// --- Appointment closed out -------------------------------------------
const closed = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
check("appointment marked COMPLETED by checkout", closed.status === "COMPLETED", closed.status);

// --- Dashboard aggregates moved ---------------------------------------
const afterKpi = await prisma.$queryRawUnsafe(`
  SELECT COALESCE(SUM(service_revenue + retail_revenue),0)::numeric AS revenue,
         COUNT(*)::int AS invoices
  FROM sales_invoices WHERE payment_status <> 'VOID'
    AND created_at >= date_trunc('month', NOW())
`);
check(
  `dashboard revenue rose by ${gross}`,
  n(afterKpi[0].revenue) === baseRevenue + gross,
  `${baseRevenue} -> ${n(afterKpi[0].revenue)}`,
);
check("invoice count incremented", afterKpi[0].invoices === baseCount + 1);

// --- Category ring picked it up ---------------------------------------
const ring = await prisma.$queryRawUnsafe(`
  SELECT CASE WHEN l.kind = 'PRODUCT' THEN 'RETAIL' ELSE COALESCE(s.category::text,'HAIR') END AS category,
         SUM(l.unit_price * l.qty - l.line_discount)::numeric AS revenue
  FROM invoice_lines l
  JOIN sales_invoices i ON i.id = l.invoice_id
  LEFT JOIN services s ON s.id = l.ref_id AND l.kind = 'SERVICE'
  WHERE i.payment_status <> 'VOID'
  GROUP BY 1
`);
const cats = Object.fromEntries(ring.map((r) => [r.category, n(r.revenue)]));
check("ring chart shows HAIR revenue", cats.HAIR === unit, `${cats.HAIR}`);
check("ring chart shows RETAIL revenue", cats.RETAIL === retail, `${cats.RETAIL}`);

// --- Commission report --------------------------------------------------
const comm = await prisma.$queryRawUnsafe(`
  SELECT SUM((l.unit_price * l.qty - l.line_discount) * l.commission_rate)::numeric AS commission
  FROM invoice_lines l JOIN sales_invoices i ON i.id = l.invoice_id
  WHERE l.staff_id = 'stf_ayesha' AND i.payment_status <> 'VOID'
`);
const expected = unit * rate + retail * 0.05;
check(
  `commission = ${expected}`,
  Math.abs(n(comm[0].commission) - expected) < 0.01,
  `${n(comm[0].commission)}`,
);

// --- Client lifetime spend ----------------------------------------------
const spend = await prisma.$queryRawUnsafe(`
  SELECT COALESCE(SUM(paid_amount),0)::numeric AS total
  FROM sales_invoices WHERE client_id = '${client.id}' AND payment_status <> 'VOID'
`);
check(`client total_spend = ${gross}`, n(spend[0].total) === gross, `${n(spend[0].total)}`);

// --- Constraint enforcement --------------------------------------------
try {
  await prisma.client.create({ data: { name: "Dup", phone: "0399-9999999", tags: [] } });
  check("duplicate phone rejected at the database", false, "insert succeeded");
} catch {
  check("duplicate phone rejected at the database", true);
}

console.log("");
console.log("==================================");
console.log(`PASSED: ${pass}    FAILED: ${fail}`);
console.log("==================================");

await prisma.$disconnect();
process.exit(fail === 0 ? 0 : 1);
