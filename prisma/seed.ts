/**
 * Seeds a fresh database.
 *
 *   npm run db:seed
 *
 * Idempotent: every write is an upsert keyed on a natural identifier, so
 * re-running after adding a service or permission tops the database up
 * without duplicating or clobbering live rows.
 *
 * Set OWNER_PASSWORD / CASHIER_PASSWORD / STAFF_PASSWORD to choose the
 * initial credentials. Anything left unset gets a random password, printed
 * once at the end.
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import { createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import {
  PERMISSIONS,
  ROLES,
  ROLE_META,
  ROLE_PERMISSIONS,
  type Permission,
} from "../src/lib/auth/permissions";

const prisma = new PrismaClient();

/* -------------------------------------------------------------- Helpers */

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 210_000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function describe(key: Permission) {
  const [group, ...rest] = key.split(".");
  const category = group.charAt(0).toUpperCase() + group.slice(1);
  const label = `${category}: ${rest.join(" ").replace(/\b\w/g, (c) => c.toUpperCase())}`;
  return { category, label };
}

const generated: Array<{ label: string; email: string; password: string }> = [];

/** A password explicitly supplied through the environment, if any. */
function suppliedPassword(envKey: string): string | undefined {
  const value = process.env[envKey]?.trim();
  return value ? value : undefined;
}

/** Invents a strong password and records it for the summary printed at the end. */
function generatePassword(label: string, email: string) {
  const password = `${randomBytes(9).toString("base64url")}!Aa1`;
  generated.push({ label, email, password });
  return password;
}

/* ------------------------------------------------------------------ Main */

async function main() {
  /* ---------------------------------------------------- Permissions */

  for (const key of PERMISSIONS) {
    const { category, label } = describe(key);
    await prisma.permission.upsert({
      where: { key },
      update: { label, category },
      create: { key, label, category },
    });
  }
  console.log(`✔ ${PERMISSIONS.length} permissions`);

  /* ---------------------------------------------------------- Roles */

  const roleIds = new Map<string, string>();
  for (const roleKey of ROLES) {
    const meta = ROLE_META[roleKey];
    const role = await prisma.userRole.upsert({
      where: { key: roleKey },
      update: { label: meta.label, description: meta.blurb, landingPath: meta.landing },
      create: {
        key: roleKey,
        label: meta.label,
        description: meta.blurb,
        landingPath: meta.landing,
        isSystem: roleKey === "ADMIN",
      },
    });
    roleIds.set(roleKey, role.id);

    for (const permissionKey of ROLE_PERMISSIONS[roleKey]) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionKey: { roleId: role.id, permissionKey } },
        update: {},
        create: { roleId: role.id, permissionKey },
      });
    }
    console.log(`✔ role ${roleKey} — ${ROLE_PERMISSIONS[roleKey].length} grants`);
  }

  /* ---------------------------------------------------------- Staff */

  const staffSeed: Array<{
    id: string;
    name: string;
    role: Prisma.StaffCreateInput["role"];
    phone: string;
    commissionRate: number;
    specialties: Prisma.StaffCreateInput["specialties"];
    monthlySalary: number;
  }> = [
    { id: "stf_sana", name: "Sana Malik", role: "OWNER", phone: "0300-1234567", commissionRate: 0, specialties: ["HAIR", "MAKEUP", "SKIN"], monthlySalary: 0 },
    { id: "stf_ayesha", name: "Ayesha Khan", role: "SENIOR_STYLIST", phone: "0301-2345678", commissionRate: 0.15, specialties: ["HAIR"], monthlySalary: 65000 },
    { id: "stf_hina", name: "Hina Raza", role: "BEAUTICIAN", phone: "0302-3456789", commissionRate: 0.12, specialties: ["SKIN", "SPA"], monthlySalary: 52000 },
    { id: "stf_mehwish", name: "Mehwish Ali", role: "MAKEUP_ARTIST", phone: "0303-4567890", commissionRate: 0.18, specialties: ["MAKEUP"], monthlySalary: 58000 },
    { id: "stf_zoya", name: "Zoya Iqbal", role: "NAIL_TECHNICIAN", phone: "0304-5678901", commissionRate: 0.14, specialties: ["NAILS"], monthlySalary: 45000 },
    { id: "stf_farah", name: "Farah Nadeem", role: "STYLIST", phone: "0305-6789012", commissionRate: 0.12, specialties: ["HAIR", "NAILS"], monthlySalary: 42000 },
    { id: "stf_rabia", name: "Rabia Sattar", role: "RECEPTIONIST", phone: "0306-7890123", commissionRate: 0.02, specialties: [], monthlySalary: 35000 },
  ];

  for (const s of staffSeed) {
    await prisma.staff.upsert({
      where: { id: s.id },
      update: { name: s.name, role: s.role, phone: s.phone },
      create: {
        id: s.id,
        name: s.name,
        role: s.role,
        phone: s.phone,
        commissionRate: s.commissionRate,
        specialties: s.specialties,
        monthlySalary: s.monthlySalary,
      },
    });
  }
  console.log(`✔ ${staffSeed.length} staff`);

  /* ---------------------------------------------------------- Users */

  const overridePin = process.env.ADMIN_OVERRIDE_PIN;

  const accounts = [
    {
      id: "usr_owner",
      email: process.env.OWNER_EMAIL ?? "admin@sana.com",
      name: "Sana Malik",
      roleKey: "ADMIN" as const,
      staffId: "stf_sana",
      envKey: "OWNER_PASSWORD",
      label: "Owner / Super Admin",
      withPin: true,
    },
    {
      id: "usr_reception",
      email: process.env.CASHIER_EMAIL ?? "cashier@sana.com",
      name: "Rabia Sattar",
      roleKey: "CASHIER" as const,
      staffId: "stf_rabia",
      envKey: "CASHIER_PASSWORD",
      label: "Cashier / Receptionist",
      withPin: false,
    },
    {
      id: "usr_ayesha",
      email: process.env.STAFF_EMAIL ?? "ayesha@sana.com",
      name: "Ayesha Khan",
      roleKey: "STAFF" as const,
      staffId: "stf_ayesha",
      envKey: "STAFF_PASSWORD",
      label: "Senior Beautician / Staff",
      withPin: false,
    },
  ];

  for (const account of accounts) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    const supplied = suppliedPassword(account.envKey);

    if (existing) {
      // Never overwrite a live password with a randomly generated one — that
      // would lock the owner out of their own salon on any re-run. But when a
      // password was named explicitly, resetting it is the whole intent.
      if (!supplied) {
        console.log(`• ${account.email} already exists — password left unchanged`);
        continue;
      }

      const { salt, hash } = hashPassword(supplied);
      await prisma.user.update({
        where: { email: account.email },
        data: {
          passwordHash: hash,
          passwordSalt: salt,
          name: account.name,
          active: true,
          // Clear any lockout, so a forgotten password cannot leave the
          // account unreachable after the reset.
          failedLoginCount: 0,
          lockedUntil: null,
          roleId: roleIds.get(account.roleKey)!,
        },
      });
      console.log(`✔ ${account.email} password reset from ${account.envKey}`);
      continue;
    }

    const password = supplied ?? generatePassword(account.label, account.email);
    const { salt, hash } = hashPassword(password);

    await prisma.user.create({
      data: {
        id: account.id,
        email: account.email,
        name: account.name,
        passwordHash: hash,
        passwordSalt: salt,
        overridePinHash:
          account.withPin && overridePin
            ? createHash("sha256").update(overridePin).digest("hex")
            : null,
        roleId: roleIds.get(account.roleKey)!,
        staffId: account.staffId,
      },
    });
    console.log(`✔ user ${account.email} (${account.roleKey})`);
  }

  /* ------------------------------------------------------- Services */

  const services: Array<[string, string, Prisma.ServiceCreateInput["category"], number, number]> = [
    ["svc_cut", "Haircut & Blow Dry", "HAIR", 45, 2500],
    ["svc_layer", "Layer Cut", "HAIR", 60, 3200],
    ["svc_wash", "Hair Wash & Blow Dry", "HAIR", 30, 1500],
    ["svc_roots", "Root Touch-Up", "HAIR", 75, 4500],
    ["svc_colour", "Global Hair Colour", "HAIR", 150, 12000],
    ["svc_balayage", "Balayage Highlights", "HAIR", 210, 22000],
    ["svc_keratin", "Keratin Treatment", "HAIR", 180, 25000],
    ["svc_hairspa", "Hair Spa & Deep Conditioning", "HAIR", 60, 4000],
    ["svc_protein", "Protein Hair Treatment", "HAIR", 90, 8500],
    ["svc_bridalhair", "Bridal Hair Styling", "HAIR", 120, 18000],
    ["svc_facial", "Classic Facial", "SKIN", 60, 3500],
    ["svc_hydra", "Hydra Glow Facial", "SKIN", 75, 7500],
    ["svc_gold", "Gold Radiance Facial", "SKIN", 90, 12000],
    ["svc_antiage", "Anti-Ageing Facial", "SKIN", 90, 11000],
    ["svc_acne", "Acne Clarifying Facial", "SKIN", 75, 6500],
    ["svc_fullwax", "Full Body Wax", "SKIN", 90, 8000],
    ["svc_halfwax", "Half Body Wax", "SKIN", 45, 4500],
    ["svc_thread", "Threading (Eyebrows)", "SKIN", 15, 500],
    ["svc_party", "Party Makeup", "MAKEUP", 75, 9000],
    ["svc_engagement", "Engagement Makeup", "MAKEUP", 120, 22000],
    ["svc_bridal", "Bridal Makeup (HD)", "MAKEUP", 180, 45000],
    ["svc_nikkah", "Nikkah Makeup", "MAKEUP", 150, 32000],
    ["svc_trial", "Makeup Trial", "MAKEUP", 90, 12000],
    ["svc_drape", "Saree / Dupatta Draping", "MAKEUP", 30, 3500],
    ["svc_mani", "Classic Manicure", "NAILS", 45, 2500],
    ["svc_pedi", "Classic Pedicure", "NAILS", 60, 3500],
    ["svc_gel", "Gel Polish Application", "NAILS", 45, 4000],
    ["svc_ext", "Nail Extensions (Acrylic)", "NAILS", 120, 9000],
    ["svc_art", "Nail Art (Per Hand)", "NAILS", 30, 2000],
    ["svc_massage", "Relaxing Body Massage", "SPA", 60, 7000],
    ["svc_head", "Head & Shoulder Massage", "SPA", 30, 3000],
    ["svc_polish", "Body Polish & Scrub", "SPA", 75, 9500],
  ];

  for (const [id, name, category, durationMin, price] of services) {
    await prisma.service.upsert({
      where: { id },
      update: { name, category, durationMin, price },
      create: { id, name, category, durationMin, price },
    });
  }
  console.log(`✔ ${services.length} services`);

  /* ------------------------------------------------------- Packages */

  const packages: Array<[string, string, string, number, string[]]> = [
    ["pkg_bridal", "Bridal Glow Package", "The complete bridal day.", 74000,
      ["svc_bridal", "svc_bridalhair", "svc_gold", "svc_mani", "svc_pedi", "svc_drape"]],
    ["pkg_glow", "Glow Getter", "Monthly self-care reset.", 10500,
      ["svc_hydra", "svc_hairspa", "svc_thread"]],
    ["pkg_revival", "Hair Revival Ritual", "Colour refresh with repair.", 13500,
      ["svc_roots", "svc_protein", "svc_cut"]],
    ["pkg_party", "Party Ready", "Evening event package.", 13000,
      ["svc_party", "svc_gel", "svc_wash"]],
    ["pkg_hands", "Hands & Feet Deluxe", "Manicure, pedicure and art.", 6800,
      ["svc_mani", "svc_pedi", "svc_art"]],
  ];

  for (const [id, name, description, price, serviceIds] of packages) {
    await prisma.servicePackage.upsert({
      where: { id },
      update: { name, description, price },
      create: { id, name, description, price },
    });
    for (const serviceId of serviceIds) {
      await prisma.packageService.upsert({
        where: { packageId_serviceId: { packageId: id, serviceId } },
        update: {},
        create: { packageId: id, serviceId },
      });
    }
  }
  console.log(`✔ ${packages.length} packages`);

  /* ------------------------------------------------------ Inventory */

  const products: Array<
    [string, string, string, Prisma.ProductCreateInput["type"], string, string, number, number, number, number]
  > = [
    ["prd_shampoo", "Argan Repair Shampoo 500ml", "SBS-R001", "RETAIL", "Moroccanoil", "pc", 3200, 5200, 18, 6],
    ["prd_cond", "Argan Repair Conditioner 500ml", "SBS-R002", "RETAIL", "Moroccanoil", "pc", 3300, 5400, 14, 6],
    ["prd_serum", "Keratin Smoothing Serum 100ml", "SBS-R003", "RETAIL", "L'Oreal Pro", "pc", 2100, 3800, 9, 5],
    ["prd_face", "Hydrating Face Serum 30ml", "SBS-R004", "RETAIL", "The Ordinary", "pc", 2600, 4500, 22, 8],
    ["prd_vitc", "Vitamin C Brightening Cream", "SBS-R005", "RETAIL", "Olay", "pc", 1900, 3400, 4, 6],
    ["prd_spf", "Sunscreen SPF 50 PA+++", "SBS-R006", "RETAIL", "La Roche", "pc", 2800, 4800, 16, 6],
    ["prd_mask", "Nourishing Hair Mask 250ml", "SBS-R007", "RETAIL", "Wella", "pc", 2400, 4200, 11, 5],
    ["prd_heat", "Heat Protectant Spray", "SBS-R008", "RETAIL", "Tresemme", "pc", 1200, 2200, 3, 5],
    ["prd_cuticle", "Cuticle Oil Pen", "SBS-R009", "RETAIL", "OPI", "pc", 900, 1800, 25, 8],
    ["prd_micellar", "Micellar Cleansing Water", "SBS-R010", "RETAIL", "Garnier", "pc", 800, 1500, 19, 8],
    ["prd_black", "Hair Colour Tube - Natural Black", "SBS-C001", "CONSUMABLE", "Schwarzkopf", "tube", 950, 0, 30, 10],
    ["prd_ash", "Hair Colour Tube - Ash Brown", "SBS-C002", "CONSUMABLE", "Schwarzkopf", "tube", 950, 0, 12, 10],
    ["prd_burg", "Hair Colour Tube - Burgundy", "SBS-C003", "CONSUMABLE", "Schwarzkopf", "tube", 950, 0, 7, 10],
    ["prd_bleach", "Bleach Powder 500g", "SBS-C004", "CONSUMABLE", "Wella", "tub", 1800, 0, 5, 6],
    ["prd_dev", "Developer 20 Vol 1L", "SBS-C005", "CONSUMABLE", "Wella", "bottle", 1100, 0, 9, 6],
    ["prd_ker", "Keratin Treatment Solution 1L", "SBS-C006", "CONSUMABLE", "Brazilian Blowout", "bottle", 14000, 0, 2, 3],
    ["prd_wax", "Warm Wax Beads 1kg", "SBS-C007", "CONSUMABLE", "Rica", "pack", 3200, 0, 8, 4],
    ["prd_goldkit", "Facial Gold Mask Kit", "SBS-C008", "CONSUMABLE", "Aroma", "kit", 2600, 0, 6, 5],
    ["prd_acetone", "Acetone Remover 1L", "SBS-C009", "CONSUMABLE", "OPI", "bottle", 1400, 0, 4, 4],
    ["prd_acrylic", "Acrylic Powder 250g", "SBS-C010", "CONSUMABLE", "Kiara Sky", "jar", 4200, 0, 3, 4],
    ["prd_towels", "Disposable Towels (100pc)", "SBS-C011", "CONSUMABLE", "Generic", "pack", 1600, 0, 14, 6],
    ["prd_gloves", "Nitrile Gloves (100pc)", "SBS-C012", "CONSUMABLE", "Generic", "box", 1300, 0, 2, 5],
    ["prd_oil", "Massage Oil 500ml", "SBS-C013", "CONSUMABLE", "Bio Oil", "bottle", 2200, 0, 10, 4],
    ["prd_cotton", "Cotton Pads (Bulk)", "SBS-C014", "CONSUMABLE", "Generic", "pack", 700, 0, 21, 8],
  ];

  for (const [id, name, sku, type, brand, unit, costPrice, retailPrice, stock, lowStockThreshold] of products) {
    await prisma.product.upsert({
      where: { id },
      update: { name, brand, costPrice, retailPrice, lowStockThreshold },
      create: { id, name, sku, type, brand, unit, costPrice, retailPrice, stock, lowStockThreshold,
        supplier: type === "RETAIL" ? "Beauty Depot Lahore" : "Salon Supplies Co." },
    });
  }
  console.log(`✔ ${products.length} inventory items`);

  /* ----------------------------------------------------- Promo codes */

  const promos: Array<[string, string, Prisma.PromoCodeCreateInput["kind"], number, number, boolean]> = [
    ["GLOW10", "Glow Up — 10% off", "PERCENT", 10, 3000, true],
    ["BRIDAL15", "Bridal Season — 15% off", "PERCENT", 15, 25000, true],
    ["WEEKDAY500", "Weekday Treat — Rs 500 off", "FLAT", 500, 3500, true],
    ["NEWCLIENT", "First Visit — 20% off", "PERCENT", 20, 2000, true],
  ];

  for (const [code, label, kind, value, minSpend, active] of promos) {
    await prisma.promoCode.upsert({
      where: { code },
      update: { label, kind, value, minSpend, active },
      create: { code, label, kind, value, minSpend, active },
    });
  }
  console.log(`✔ ${promos.length} promo codes`);

  /* --------------------------------------------------------- Report */

  if (generated.length) {
    console.log("\n" + "=".repeat(64));
    console.log("GENERATED CREDENTIALS — store these now, they are not recoverable");
    console.log("=".repeat(64));
    for (const account of generated) {
      console.log(`  ${account.label}`);
      console.log(`    email:    ${account.email}`);
      console.log(`    password: ${account.password}`);
    }
    console.log("=".repeat(64));
    console.log("Set OWNER_PASSWORD / CASHIER_PASSWORD / STAFF_PASSWORD to choose your own.\n");
  }

  if (!overridePin) {
    console.log("! ADMIN_OVERRIDE_PIN was not set, so no manager override PIN was stored.");
    console.log("  Cashier discount/void escalation will be unavailable until you set it.\n");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
