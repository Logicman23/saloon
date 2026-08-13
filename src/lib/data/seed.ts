/**
 * Deterministic demo dataset.
 *
 * Everything is generated from a fixed PRNG seed and anchored to *today's
 * local midnight*, so the server render and the client hydration produce
 * byte-identical output while the data still looks "live" every day.
 *
 * Replace this module with Prisma queries to go to production — the shapes
 * are already the ones in `src/lib/types.ts`.
 */

import { addDays, addMinutes, dateKey, startOfDay } from "@/lib/date";
import { computeTotals, formatInvoiceNumber, invoiceStatusFor } from "@/lib/billing";
import { round2 } from "@/lib/utils";
import type {
  Appointment,
  AppointmentStatus,
  Client,
  Expense,
  ExpenseCategory,
  Invoice,
  InvoiceLine,
  Payment,
  PaymentMode,
  Product,
  PromoCode,
  Service,
  ServiceCategory,
  ServicePackage,
  Staff,
  StockMovement,
} from "@/lib/types";

/* --------------------------------------------------------- Seeded random */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260813);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p: number) => rand() < p;

/** Today at 00:00 local — the anchor every generated date hangs off. */
export const TODAY = startOfDay(new Date());

/* ------------------------------------------------------------------ Staff */

export const staff: Staff[] = [
  {
    id: "stf_sana",
    name: "Sana Malik",
    role: "Owner",
    phone: "0300-1234567",
    commissionRate: 0.0,
    specialties: ["Hair", "Makeup", "Skin"],
    monthlySalary: 0,
    active: true,
    joinedAt: "2018-03-01T00:00:00.000Z",
  },
  {
    id: "stf_ayesha",
    name: "Ayesha Khan",
    role: "Senior Stylist",
    phone: "0301-2345678",
    commissionRate: 0.15,
    specialties: ["Hair"],
    monthlySalary: 65000,
    active: true,
    joinedAt: "2019-07-15T00:00:00.000Z",
  },
  {
    id: "stf_hina",
    name: "Hina Raza",
    role: "Beautician",
    phone: "0302-3456789",
    commissionRate: 0.12,
    specialties: ["Skin", "Spa"],
    monthlySalary: 52000,
    active: true,
    joinedAt: "2020-01-20T00:00:00.000Z",
  },
  {
    id: "stf_mehwish",
    name: "Mehwish Ali",
    role: "Makeup Artist",
    phone: "0303-4567890",
    commissionRate: 0.18,
    specialties: ["Makeup"],
    monthlySalary: 58000,
    active: true,
    joinedAt: "2021-05-10T00:00:00.000Z",
  },
  {
    id: "stf_zoya",
    name: "Zoya Iqbal",
    role: "Nail Technician",
    phone: "0304-5678901",
    commissionRate: 0.14,
    specialties: ["Nails"],
    monthlySalary: 45000,
    active: true,
    joinedAt: "2022-02-01T00:00:00.000Z",
  },
  {
    id: "stf_farah",
    name: "Farah Nadeem",
    role: "Stylist",
    phone: "0305-6789012",
    commissionRate: 0.12,
    specialties: ["Hair", "Nails"],
    monthlySalary: 42000,
    active: true,
    joinedAt: "2023-09-05T00:00:00.000Z",
  },
  {
    id: "stf_rabia",
    name: "Rabia Sattar",
    role: "Receptionist",
    phone: "0306-7890123",
    commissionRate: 0.02,
    specialties: [],
    monthlySalary: 35000,
    active: true,
    joinedAt: "2023-11-11T00:00:00.000Z",
  },
];

/** Staff who actually perform chargeable services. */
export const serviceStaff = staff.filter((s) => s.specialties.length > 0);

/* --------------------------------------------------------------- Services */

const serviceSeed: Array<[string, ServiceCategory, number, number, string]> = [
  ["Haircut & Blow Dry", "Hair", 45, 2500, "Consultation, precision cut and finish."],
  ["Layer Cut", "Hair", 60, 3200, "Soft layers with face framing."],
  ["Hair Wash & Blow Dry", "Hair", 30, 1500, "Deep-cleanse wash and salon blow dry."],
  ["Root Touch-Up", "Hair", 75, 4500, "Ammonia-free colour on regrowth."],
  ["Global Hair Colour", "Hair", 150, 12000, "Full-head colour with gloss finish."],
  ["Balayage Highlights", "Hair", 210, 22000, "Hand-painted dimensional highlights."],
  ["Keratin Treatment", "Hair", 180, 25000, "Frizz-control smoothing therapy."],
  ["Hair Spa & Deep Conditioning", "Hair", 60, 4000, "Steam-infused repair mask."],
  ["Protein Hair Treatment", "Hair", 90, 8500, "Bond-building strength therapy."],
  ["Bridal Hair Styling", "Hair", 120, 18000, "Structured bridal updo with accessories."],

  ["Classic Facial", "Skin", 60, 3500, "Cleanse, exfoliate, steam, mask."],
  ["Hydra Glow Facial", "Skin", 75, 7500, "Hydra-dermabrasion with serum infusion."],
  ["Gold Radiance Facial", "Skin", 90, 12000, "24k gold leaf brightening ritual."],
  ["Anti-Ageing Facial", "Skin", 90, 11000, "Collagen-boost lift and firm."],
  ["Acne Clarifying Facial", "Skin", 75, 6500, "Salicylic deep-clean and extraction."],
  ["Full Body Wax", "Skin", 90, 8000, "Premium warm wax, full body."],
  ["Half Body Wax", "Skin", 45, 4500, "Arms, underarms and half legs."],
  ["Threading (Eyebrows)", "Skin", 15, 500, "Precision brow shaping."],
  ["Whitening Facial", "Skin", 75, 8500, "Brightening peel and mask."],

  ["Party Makeup", "Makeup", 75, 9000, "Event-ready full-glam application."],
  ["Engagement Makeup", "Makeup", 120, 22000, "HD base with lashes and draping."],
  ["Bridal Makeup (HD)", "Makeup", 180, 45000, "Full bridal HD with trial-matched look."],
  ["Nikkah Makeup", "Makeup", 150, 32000, "Soft-glam nikkah look with dupatta setting."],
  ["Makeup Trial", "Makeup", 90, 12000, "Pre-event look test and photo review."],
  ["Saree / Dupatta Draping", "Makeup", 30, 3500, "Professional drape and pinning."],

  ["Classic Manicure", "Nails", 45, 2500, "Shape, cuticle care, buff and polish."],
  ["Classic Pedicure", "Nails", 60, 3500, "Soak, scrub, callus care and polish."],
  ["Gel Polish Application", "Nails", 45, 4000, "Long-wear cured gel colour."],
  ["Nail Extensions (Acrylic)", "Nails", 120, 9000, "Full-set sculpted acrylic extensions."],
  ["Nail Art (Per Hand)", "Nails", 30, 2000, "Hand-painted detail work."],

  ["Relaxing Body Massage", "Spa", 60, 7000, "Full-body aromatherapy massage."],
  ["Head & Shoulder Massage", "Spa", 30, 3000, "Tension-release scalp therapy."],
  ["Body Polish & Scrub", "Spa", 75, 9500, "Exfoliating polish with moisture wrap."],
];

export const services: Service[] = serviceSeed.map(
  ([name, category, durationMin, price, description], i) => ({
    id: `svc_${(i + 1).toString().padStart(3, "0")}`,
    name,
    category,
    durationMin,
    price,
    description,
    active: true,
  }),
);

const byName = (n: string) => services.find((s) => s.name === n)!.id;

/* --------------------------------------------------------------- Packages */

export const packages: ServicePackage[] = [
  {
    id: "pkg_bridal_glow",
    name: "Bridal Glow Package",
    description: "The complete bridal day: HD makeup, styling, facial and nails.",
    serviceIds: [
      byName("Bridal Makeup (HD)"),
      byName("Bridal Hair Styling"),
      byName("Gold Radiance Facial"),
      byName("Classic Manicure"),
      byName("Classic Pedicure"),
      byName("Saree / Dupatta Draping"),
    ],
    price: 74000,
    active: true,
  },
  {
    id: "pkg_glow_getter",
    name: "Glow Getter",
    description: "Monthly self-care reset — facial, spa and brows.",
    serviceIds: [
      byName("Hydra Glow Facial"),
      byName("Hair Spa & Deep Conditioning"),
      byName("Threading (Eyebrows)"),
    ],
    price: 10500,
    active: true,
  },
  {
    id: "pkg_hair_revival",
    name: "Hair Revival Ritual",
    description: "Colour refresh with bond-building repair.",
    serviceIds: [
      byName("Root Touch-Up"),
      byName("Protein Hair Treatment"),
      byName("Haircut & Blow Dry"),
    ],
    price: 13500,
    active: true,
  },
  {
    id: "pkg_party_ready",
    name: "Party Ready",
    description: "Evening event package with makeup and gel nails.",
    serviceIds: [byName("Party Makeup"), byName("Gel Polish Application"), byName("Hair Wash & Blow Dry")],
    price: 13000,
    active: true,
  },
  {
    id: "pkg_hands_feet",
    name: "Hands & Feet Deluxe",
    description: "Manicure, pedicure and nail art in one sitting.",
    serviceIds: [byName("Classic Manicure"), byName("Classic Pedicure"), byName("Nail Art (Per Hand)")],
    price: 6800,
    active: true,
  },
];

/* -------------------------------------------------------------- Inventory */

const productSeed: Array<[string, Product["type"], string, number, number, number, number, string]> = [
  ["Argan Repair Shampoo 500ml", "RETAIL", "Moroccanoil", 3200, 5200, 18, 6, "pc"],
  ["Argan Repair Conditioner 500ml", "RETAIL", "Moroccanoil", 3300, 5400, 14, 6, "pc"],
  ["Keratin Smoothing Serum 100ml", "RETAIL", "L'Oreal Pro", 2100, 3800, 9, 5, "pc"],
  ["Hydrating Face Serum 30ml", "RETAIL", "The Ordinary", 2600, 4500, 22, 8, "pc"],
  ["Vitamin C Brightening Cream", "RETAIL", "Olay", 1900, 3400, 4, 6, "pc"],
  ["Sunscreen SPF 50 PA+++", "RETAIL", "La Roche", 2800, 4800, 16, 6, "pc"],
  ["Nourishing Hair Mask 250ml", "RETAIL", "Wella", 2400, 4200, 11, 5, "pc"],
  ["Heat Protectant Spray", "RETAIL", "Tresemme", 1200, 2200, 3, 5, "pc"],
  ["Cuticle Oil Pen", "RETAIL", "OPI", 900, 1800, 25, 8, "pc"],
  ["Micellar Cleansing Water", "RETAIL", "Garnier", 800, 1500, 19, 8, "pc"],

  ["Hair Colour Tube - Natural Black", "CONSUMABLE", "Schwarzkopf", 950, 0, 30, 10, "tube"],
  ["Hair Colour Tube - Ash Brown", "CONSUMABLE", "Schwarzkopf", 950, 0, 12, 10, "tube"],
  ["Hair Colour Tube - Burgundy", "CONSUMABLE", "Schwarzkopf", 950, 0, 7, 10, "tube"],
  ["Bleach Powder 500g", "CONSUMABLE", "Wella", 1800, 0, 5, 6, "tub"],
  ["Developer 20 Vol 1L", "CONSUMABLE", "Wella", 1100, 0, 9, 6, "bottle"],
  ["Keratin Treatment Solution 1L", "CONSUMABLE", "Brazilian Blowout", 14000, 0, 2, 3, "bottle"],
  ["Warm Wax Beads 1kg", "CONSUMABLE", "Rica", 3200, 0, 8, 4, "pack"],
  ["Facial Gold Mask Kit", "CONSUMABLE", "Aroma", 2600, 0, 6, 5, "kit"],
  ["Acetone Remover 1L", "CONSUMABLE", "OPI", 1400, 0, 4, 4, "bottle"],
  ["Acrylic Powder 250g", "CONSUMABLE", "Kiara Sky", 4200, 0, 3, 4, "jar"],
  ["Disposable Towels (100pc)", "CONSUMABLE", "Generic", 1600, 0, 14, 6, "pack"],
  ["Nitrile Gloves (100pc)", "CONSUMABLE", "Generic", 1300, 0, 2, 5, "box"],
  ["Massage Oil 500ml", "CONSUMABLE", "Bio Oil", 2200, 0, 10, 4, "bottle"],
  ["Cotton Pads (Bulk)", "CONSUMABLE", "Generic", 700, 0, 21, 8, "pack"],
];

export const products: Product[] = productSeed.map(
  ([name, type, brand, costPrice, retailPrice, stock, lowStockThreshold, unit], i) => ({
    id: `prd_${(i + 1).toString().padStart(3, "0")}`,
    name,
    sku: `SBS-${type === "RETAIL" ? "R" : "C"}${(i + 1).toString().padStart(3, "0")}`,
    type,
    brand,
    unit,
    costPrice,
    retailPrice,
    stock,
    lowStockThreshold,
    supplier: type === "RETAIL" ? "Beauty Depot Lahore" : "Salon Supplies Co.",
  }),
);

export const retailProducts = products.filter((p) => p.type === "RETAIL");

/* ---------------------------------------------------------------- Clients */

const firstNames = [
  "Aiman", "Sadia", "Mahnoor", "Zainab", "Hafsa", "Anum", "Iqra", "Noor", "Rida", "Kanwal",
  "Sidra", "Maham", "Areeba", "Fatima", "Laiba", "Bushra", "Nimra", "Kiran", "Saba", "Amna",
  "Hira", "Tehmina", "Sundas", "Rimsha", "Zara", "Eman", "Mariam", "Alina", "Javeria", "Sehrish",
  "Warda", "Momina", "Ayesha", "Aqsa", "Bisma", "Sanam", "Neha", "Faiza", "Komal", "Shanza",
];
const lastNames = [
  "Ahmed", "Khan", "Malik", "Sheikh", "Butt", "Chaudhry", "Qureshi", "Siddiqui", "Raza", "Hussain",
  "Javed", "Aslam", "Nawaz", "Iqbal", "Rehman", "Farooq", "Tariq", "Bhatti", "Zafar", "Dar",
];
const clientTags = ["VIP", "Regular", "Bridal", "New", "Referral", "Membership"];

export const clients: Client[] = Array.from({ length: 46 }, (_, i) => {
  const name = `${firstNames[i % firstNames.length]} ${pick(lastNames)}`;
  const tags: string[] = [];
  if (chance(0.18)) tags.push("VIP");
  if (chance(0.3)) tags.push("Regular");
  if (chance(0.12)) tags.push("Bridal");
  if (chance(0.15)) tags.push("Membership");
  if (tags.length === 0) tags.push(pick(clientTags));

  return {
    id: `cli_${(i + 1).toString().padStart(3, "0")}`,
    name,
    phone: `03${int(0, 4)}${int(0, 9)}-${int(1000000, 9999999)}`,
    email: chance(0.45)
      ? `${name.split(" ")[0].toLowerCase()}${int(10, 99)}@gmail.com`
      : undefined,
    gender: "Female",
    notes: chance(0.3)
      ? pick([
          "Sensitive scalp — use ammonia-free colour only.",
          "Prefers Ayesha for all hair services.",
          "Allergic to fragrance-heavy products.",
          "Always books the 6 PM slot.",
          "Wants warm-toned base for makeup.",
          "Nail beds are brittle — no acrylic.",
        ])
      : undefined,
    tags,
    createdAt: addDays(TODAY, -int(20, 900)).toISOString(),
  };
});

/* ----------------------------------------------------------- Appointments */

export const OPEN_HOUR = 10;
export const CLOSE_HOUR = 20;

/** Minutes-since-midnight treated as "now" when seeding today's board (3:00 PM). */
const TODAY_PIVOT_MIN = 15 * 60;

function staffForCategory(category: ServiceCategory) {
  const eligible = serviceStaff.filter((s) => s.specialties.includes(category));
  return eligible.length ? pick(eligible) : pick(serviceStaff);
}

export const appointments: Appointment[] = [];

{
  let seq = 0;
  // 45 days back through 14 days forward.
  for (let offset = -45; offset <= 14; offset++) {
    const day = addDays(TODAY, offset);
    const isSunday = day.getDay() === 0;
    const bookings = isSunday ? int(0, 3) : int(4, 11);

    for (let b = 0; b < bookings; b++) {
      seq += 1;
      const primary = pick(services);
      const extra = chance(0.28) ? pick(services.filter((s) => s.category === primary.category)) : null;
      const serviceIds = extra && extra.id !== primary.id ? [primary.id, extra.id] : [primary.id];
      const durationMin = serviceIds
        .map((id) => services.find((s) => s.id === id)!.durationMin)
        .reduce((a, c) => a + c, 0);

      const hour = int(OPEN_HOUR, CLOSE_HOUR - 2);
      const minute = pick([0, 15, 30, 45]);
      const start = new Date(day);
      start.setHours(hour, minute, 0, 0);

      let status: AppointmentStatus;
      if (offset < 0) {
        status = chance(0.86) ? "COMPLETED" : chance(0.55) ? "CANCELLED" : "NO_SHOW";
      } else if (offset === 0) {
        // Deliberately pivoted on a FIXED hour rather than the wall clock:
        // reading `new Date()` here would make the server render and the
        // client hydration disagree whenever they fall either side of a slot.
        const startMins = hour * 60 + minute;
        if (startMins + durationMin < TODAY_PIVOT_MIN) status = chance(0.9) ? "COMPLETED" : "NO_SHOW";
        else if (startMins <= TODAY_PIVOT_MIN) status = "IN_PROGRESS";
        else status = "SCHEDULED";
      } else {
        status = chance(0.05) ? "CANCELLED" : "SCHEDULED";
      }

      appointments.push({
        id: `apt_${seq.toString().padStart(4, "0")}`,
        clientId: pick(clients).id,
        staffId: staffForCategory(primary.category).id,
        serviceIds,
        start: start.toISOString(),
        durationMin,
        status,
        notes: chance(0.15)
          ? pick([
              "Client running 10 mins late.",
              "Requested quiet room.",
              "Photoshoot right after — keep it camera ready.",
              "Bringing reference photos.",
            ])
          : undefined,
        createdAt: addDays(start, -int(1, 12)).toISOString(),
      });
    }
  }
}

/* --------------------------------------------------------------- Invoices */

const paymentModes: PaymentMode[] = ["CASH", "CARD", "WALLET", "TRANSFER"];

export const promoCodes: PromoCode[] = [
  { code: "GLOW10", label: "Glow Up — 10% off", kind: "PERCENT", value: 10, minSpend: 3000, active: true },
  { code: "BRIDAL15", label: "Bridal Season — 15% off", kind: "PERCENT", value: 15, minSpend: 25000, active: true },
  { code: "WEEKDAY500", label: "Weekday Treat — Rs 500 off", kind: "FLAT", value: 500, minSpend: 3500, active: true },
  { code: "NEWCLIENT", label: "First Visit — 20% off", kind: "PERCENT", value: 20, minSpend: 2000, active: true },
  { code: "EIDSPECIAL", label: "Eid Special — expired", kind: "PERCENT", value: 25, minSpend: 5000, active: false },
];

export const invoices: Invoice[] = [];

{
  let seq = 0;
  const completed = appointments
    .filter((a) => a.status === "COMPLETED")
    .sort((a, b) => a.start.localeCompare(b.start));

  for (const apt of completed) {
    seq += 1;
    const created = addMinutes(apt.start, apt.durationMin + int(2, 20));
    const staffMember = staff.find((s) => s.id === apt.staffId)!;

    const lines: InvoiceLine[] = apt.serviceIds.map((sid, idx) => {
      const svc = services.find((s) => s.id === sid)!;
      // Occasionally a second stylist finishes the ticket — this is what the
      // multi-staff commission tagging in the POS produces.
      const lineStaff = idx > 0 && chance(0.35) ? staffForCategory(svc.category) : staffMember;
      return {
        id: `iln_${seq}_${idx}`,
        kind: "SERVICE",
        refId: svc.id,
        name: svc.name,
        unitPrice: svc.price,
        qty: 1,
        staffId: lineStaff.id,
        commissionRate: lineStaff.commissionRate,
        lineDiscount: 0,
      };
    });

    // ~22% of tickets attach a retail product.
    if (chance(0.22)) {
      const prod = pick(retailProducts);
      lines.push({
        id: `iln_${seq}_p`,
        kind: "PRODUCT",
        refId: prod.id,
        name: prod.name,
        unitPrice: prod.retailPrice,
        qty: chance(0.15) ? 2 : 1,
        staffId: staffMember.id,
        commissionRate: 0.05,
        lineDiscount: 0,
      });
    }

    const discount = chance(0.18)
      ? chance(0.5)
        ? { kind: "PERCENT" as const, value: pick([5, 10, 15]) }
        : { kind: "FLAT" as const, value: pick([300, 500, 1000]) }
      : { kind: "NONE" as const, value: 0 };

    const totals = computeTotals(lines, discount, 0, []);

    // A small slice of historical bills are left part-paid so the
    // "pending invoices" KPI and the overdue badge have real data.
    const unpaid = chance(0.07);
    const partial = !unpaid && chance(0.05);
    const paidAmount = unpaid ? 0 : partial ? round2(totals.total * 0.5) : totals.total;

    const payments: Payment[] = [];
    if (paidAmount > 0) {
      if (chance(0.14)) {
        // Split payment across two tenders.
        const first = round2(paidAmount * 0.6);
        payments.push({ id: `pay_${seq}_1`, mode: "CASH", amount: first, at: created.toISOString() });
        payments.push({
          id: `pay_${seq}_2`,
          mode: pick(["CARD", "WALLET", "TRANSFER"] as PaymentMode[]),
          amount: round2(paidAmount - first),
          reference: `TXN${int(100000, 999999)}`,
          at: created.toISOString(),
        });
      } else {
        const mode = pick(paymentModes);
        payments.push({
          id: `pay_${seq}_1`,
          mode,
          amount: paidAmount,
          reference: mode === "CASH" ? undefined : `TXN${int(100000, 999999)}`,
          at: created.toISOString(),
        });
      }
    }

    invoices.push({
      id: `inv_${seq.toString().padStart(4, "0")}`,
      number: formatInvoiceNumber(seq, created.getFullYear()),
      clientId: apt.clientId,
      appointmentId: apt.id,
      lines,
      discount,
      payments,
      taxRate: 0,
      status: invoiceStatusFor(totals.total, paidAmount),
      createdAt: created.toISOString(),
      createdByStaffId: chance(0.6) ? "stf_rabia" : staffMember.id,
    });
  }
}

export const nextInvoiceSequence = invoices.length + 1;

/* --------------------------------------------------------------- Expenses */

export const expenses: Expense[] = [];

{
  let seq = 0;
  const add = (
    category: ExpenseCategory,
    amount: number,
    date: Date,
    vendor?: string,
    note?: string,
    paymentMode: PaymentMode = "CASH",
  ) => {
    seq += 1;
    expenses.push({
      id: `exp_${seq.toString().padStart(4, "0")}`,
      category,
      amount,
      date: date.toISOString(),
      vendor,
      note,
      paymentMode,
      attachment: chance(0.35) ? `receipt-${dateKey(date)}-${seq}.jpg` : undefined,
      recordedByStaffId: chance(0.7) ? "stf_rabia" : "stf_sana",
    });
  };

  // Three months of books.
  for (let m = 2; m >= 0; m--) {
    const monthStart = new Date(TODAY.getFullYear(), TODAY.getMonth() - m, 1);
    if (monthStart > TODAY) continue;

    add("Rent", 185000, new Date(monthStart.getFullYear(), monthStart.getMonth(), 3),
      "Gulberg Properties", "Salon premises — monthly rent", "TRANSFER");
    add("Electricity", int(48000, 96000), new Date(monthStart.getFullYear(), monthStart.getMonth(), 9),
      "LESCO", "Monthly electricity bill", "TRANSFER");
    add("Utilities", int(9000, 16000), new Date(monthStart.getFullYear(), monthStart.getMonth(), 11),
      "Sui Gas / Water", "Gas and water charges", "TRANSFER");
    add("Marketing", int(15000, 45000), new Date(monthStart.getFullYear(), monthStart.getMonth(), 14),
      "Meta Ads", "Instagram promotion campaign", "CARD");

    for (const member of staff.filter((s) => s.monthlySalary > 0)) {
      add("Staff Salary", member.monthlySalary,
        new Date(monthStart.getFullYear(), monthStart.getMonth(), 1),
        member.name, `Monthly salary — ${member.role}`, "TRANSFER");
    }

    for (let i = 0; i < int(2, 4); i++) {
      add("Product Purchase", int(25000, 120000),
        new Date(monthStart.getFullYear(), monthStart.getMonth(), int(2, 27)),
        pick(["Beauty Depot Lahore", "Salon Supplies Co.", "Wella Distributor"]),
        "Stock replenishment", pick(paymentModes));
    }

    if (chance(0.7)) {
      add("Maintenance", int(4000, 25000),
        new Date(monthStart.getFullYear(), monthStart.getMonth(), int(5, 26)),
        pick(["AC Services", "Electrician", "Plumber"]),
        pick(["AC servicing", "Steamer repair", "Chair upholstery"]));
    }
  }

  // Daily tea / refreshments for the last 45 days.
  for (let offset = -45; offset <= 0; offset++) {
    const day = addDays(TODAY, offset);
    if (day.getDay() === 0) continue;
    add("Refreshments", int(600, 2200), day, "Local Cafe", "Tea, snacks and client refreshments");
  }
}

/* -------------------------------------------------------- Stock movements */

export const stockMovements: StockMovement[] = [];

{
  let seq = 0;
  for (let offset = -40; offset <= 0; offset++) {
    const day = addDays(TODAY, offset);
    for (let i = 0; i < int(1, 4); i++) {
      seq += 1;
      const product = pick(products);
      const type =
        product.type === "RETAIL"
          ? pick(["STOCK_IN", "RETAIL_SALE", "RETAIL_SALE", "DAMAGED"] as const)
          : pick(["STOCK_IN", "SERVICE_USAGE", "SERVICE_USAGE", "EXPIRED"] as const);
      const magnitude = type === "STOCK_IN" ? int(6, 24) : int(1, 4);

      stockMovements.push({
        id: `stk_${seq.toString().padStart(4, "0")}`,
        productId: product.id,
        type,
        qty: type === "STOCK_IN" ? magnitude : -magnitude,
        note:
          type === "SERVICE_USAGE"
            ? "Consumed during service"
            : type === "STOCK_IN"
              ? "Purchase order received"
              : type === "DAMAGED"
                ? "Damaged in handling"
                : type === "EXPIRED"
                  ? "Past expiry — discarded"
                  : "Counter sale",
        staffId: pick(staff).id,
        at: addMinutes(day, int(600, 1180)).toISOString(),
      });
    }
  }
  stockMovements.sort((a, b) => b.at.localeCompare(a.at));
}
