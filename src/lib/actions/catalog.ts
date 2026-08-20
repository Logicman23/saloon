"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { SERVICE_CATEGORY_TO_DB } from "@/lib/db/queries";
import {
  diff,
  failure,
  recordAudit,
  requirePermission,
  type ActionResult,
} from "@/lib/actions/guard";
import { SERVICE_CATEGORIES } from "@/lib/types";
import type { Product, Service, ServicePackage } from "@/lib/types";

/**
 * Creating catalogue records: retail/back-bar products and bookable services.
 *
 * Kept apart from `salon.ts`, which mutates day-to-day operational records
 * (bookings, expenses, stock levels). These two write the *catalogue* that
 * those records point at, and they are the only actions here that a price
 * change ripples out from.
 *
 * Both start with `requirePermission`. A server action is a callable endpoint,
 * so hiding the button is presentation, not protection.
 */

/* -------------------------------------------------------------- Products */

const ProductSchema = z.object({
  name: z.string().trim().min(2, "must be at least 2 characters").max(160),
  sku: z
    .string()
    .trim()
    .min(2, "must be at least 2 characters")
    .max(60)
    // Left as a scannable code: barcode readers and CSV exports both choke on
    // embedded whitespace and quotes.
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "use letters, numbers, dot, dash, slash or underscore"),
  type: z.enum(["RETAIL", "CONSUMABLE"]),
  brand: z.string().trim().min(1, "is required").max(120),
  unit: z.string().trim().min(1).max(20),
  costPrice: z.number().nonnegative("cannot be negative").max(100_000_000),
  retailPrice: z.number().nonnegative("cannot be negative").max(100_000_000),
  stock: z.number().int("must be a whole number").min(0).max(1_000_000),
  lowStockThreshold: z.number().int("must be a whole number").min(0).max(100_000),
  supplier: z.string().trim().max(160).optional(),
});

export async function createProductAction(
  input: z.infer<typeof ProductSchema>,
): Promise<ActionResult<Product>> {
  try {
    const session = await requirePermission("inventory.manage");
    const data = ProductSchema.parse(input);

    // SKU is the natural key staff search by. Checking first turns the unique
    // index into a sentence naming the clashing product rather than a 500.
    const clash = await prisma.product.findUnique({
      where: { sku: data.sku },
      select: { name: true, archivedAt: true },
    });
    if (clash) {
      // An archived product keeps its SKU — the unique index does not care
      // that the row is retired. Saying so is the difference between a
      // one-second fix and a hunt for a product that is nowhere on screen.
      return {
        ok: false,
        error: clash.archivedAt
          ? `SKU ${data.sku} is still held by ${clash.name}, which was removed from the catalogue. Use a different code.`
          : `SKU ${data.sku} already belongs to ${clash.name}.`,
      };
    }

    // Opening stock is written as a movement as well as a level. The inventory
    // page reconciles the ledger against the on-hand figure, so a product that
    // sprang into existence holding 24 units with nothing explaining it would
    // read as an unexplained discrepancy for as long as the product exists.
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: data.name,
          sku: data.sku,
          type: data.type,
          brand: data.brand,
          unit: data.unit,
          costPrice: data.costPrice,
          retailPrice: data.retailPrice,
          stock: data.stock,
          lowStockThreshold: data.lowStockThreshold,
          supplier: data.supplier || null,
        },
      });

      if (data.stock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: created.id,
            type: "STOCK_IN",
            qty: data.stock,
            note: "Opening stock",
            staffId: session.staffId,
          },
        });
      }

      return created;
    });

    await recordAudit("STOCK_ADJUSTED", session, {
      entityType: "Product",
      entityId: product.id,
      metadata: { created: true, sku: product.sku, openingStock: data.stock },
    });

    revalidatePath("/inventory");
    revalidatePath("/pos");

    return {
      ok: true,
      data: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        type: product.type,
        brand: product.brand,
        unit: product.unit,
        // Prisma hands back Decimal for money columns; the domain type is a
        // plain number and every component downstream assumes that.
        costPrice: Number(product.costPrice),
        retailPrice: Number(product.retailPrice),
        stock: product.stock,
        lowStockThreshold: product.lowStockThreshold,
        supplier: product.supplier ?? undefined,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateProductAction(
  productId: string,
  input: z.infer<typeof ProductSchema>,
): Promise<ActionResult<Product>> {
  try {
    const session = await requirePermission("inventory.manage");
    const data = ProductSchema.parse(input);

    const existing = await prisma.product.findUnique({ where: { id: productId } });
    // An archived product is gone as far as the application is concerned, so
    // it must not be editable back into circulation through a stale tab.
    if (!existing || existing.archivedAt) {
      return { ok: false, error: "That product no longer exists — it may have been removed." };
    }

    // Only worth a query when the code actually moved; unchanged, it clashes
    // with itself.
    if (data.sku !== existing.sku) {
      const clash = await prisma.product.findUnique({
        where: { sku: data.sku },
        select: { id: true, name: true, archivedAt: true },
      });
      if (clash && clash.id !== productId) {
        return {
          ok: false,
          error: clash.archivedAt
            ? `SKU ${data.sku} is still held by ${clash.name}, which was removed from the catalogue. Use a different code.`
            : `SKU ${data.sku} already belongs to ${clash.name}.`,
        };
      }
    }

    const before = {
      name: existing.name,
      sku: existing.sku,
      type: existing.type,
      brand: existing.brand,
      unit: existing.unit,
      costPrice: Number(existing.costPrice),
      retailPrice: Number(existing.retailPrice),
      lowStockThreshold: existing.lowStockThreshold,
      supplier: existing.supplier ?? undefined,
    };
    const after = {
      name: data.name,
      sku: data.sku,
      type: data.type,
      brand: data.brand,
      unit: data.unit,
      costPrice: data.costPrice,
      retailPrice: data.retailPrice,
      lowStockThreshold: data.lowStockThreshold,
      supplier: data.supplier || undefined,
    };
    const changes = diff(before, after);
    const stockDelta = data.stock - existing.stock;

    const product = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          ...after,
          supplier: data.supplier || null,
          stock: data.stock,
        },
      });

      // Stock is not an ordinary field. The inventory page reconciles the
      // movement ledger against the on-hand figure, so writing a new number
      // straight into the column would show up there as an unexplained
      // discrepancy for the rest of the product's life. Correcting it from
      // this form is legitimate — a miscount, a delivery keyed twice — but it
      // has to leave the same paper trail the Adjust dialog does.
      if (stockDelta !== 0) {
        await tx.stockMovement.create({
          data: {
            productId,
            type: "ADJUSTMENT",
            qty: stockDelta,
            note: `Corrected on the product form (${existing.stock} → ${data.stock} ${data.unit})`,
            staffId: session.staffId,
          },
        });
      }

      return updated;
    });

    // A price move is its own audit action rather than a line buried in a
    // generic "updated" entry, so "when did this price change and who signed
    // it off" stays a single-action query. The full diff rides along either
    // way, so nothing is lost by branching.
    const pricesMoved = "costPrice" in changes || "retailPrice" in changes;
    const otherMoved = Object.keys(changes).some(
      (key) => key !== "costPrice" && key !== "retailPrice",
    );

    if (pricesMoved || otherMoved) {
      await recordAudit(pricesMoved ? "PRICE_CHANGED" : "CATALOG_UPDATED", session, {
        entityType: "Product",
        entityId: productId,
        metadata: { sku: data.sku, changes },
      });
    }
    if (stockDelta !== 0) {
      await recordAudit("STOCK_ADJUSTED", session, {
        entityType: "Product",
        entityId: productId,
        metadata: {
          source: "product-edit",
          qty: stockDelta,
          from: existing.stock,
          resulting: data.stock,
        },
      });
    }

    revalidatePath("/inventory");
    revalidatePath("/pos");
    // Stock value and the low-stock banner both live on the dashboard.
    revalidatePath("/");

    return {
      ok: true,
      data: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        type: product.type,
        brand: product.brand,
        unit: product.unit,
        costPrice: Number(product.costPrice),
        retailPrice: Number(product.retailPrice),
        stock: product.stock,
        lowStockThreshold: product.lowStockThreshold,
        supplier: product.supplier ?? undefined,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Soft delete.
 *
 * `stock_movements` cascades from the product, so `DELETE` would silently
 * take every recorded delivery, sale and write-off with it — the ledger the
 * whole inventory report is reconciled against. Archiving retires the product
 * from every screen (the read layer filters `archivedAt`) while leaving the
 * history and any invoice line that referenced it intact.
 */
export async function archiveProductAction(
  productId: string,
): Promise<ActionResult<{ name: string }>> {
  try {
    const session = await requirePermission("inventory.manage");

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { name: true, sku: true, stock: true, unit: true, costPrice: true, archivedAt: true },
    });
    if (!product) return { ok: false, error: "That product no longer exists." };

    // Idempotent: a double-click, or two managers on the same row, should not
    // produce a second audit entry or an error the second person cannot act on.
    if (product.archivedAt) return { ok: true, data: { name: product.name } };

    await prisma.product.update({
      where: { id: productId },
      data: { archivedAt: new Date() },
    });

    await recordAudit("CATALOG_ARCHIVED", session, {
      entityType: "Product",
      entityId: productId,
      metadata: {
        name: product.name,
        sku: product.sku,
        // Stock still on hand leaves the valuation the moment this lands.
        // Recording it is what lets the drop be explained next month.
        stockOnHand: product.stock,
        unit: product.unit,
        stockValueRemoved: product.stock * Number(product.costPrice),
      },
    });

    revalidatePath("/inventory");
    revalidatePath("/pos");
    revalidatePath("/");

    return { ok: true, data: { name: product.name } };
  } catch (error) {
    return failure(error);
  }
}

/* -------------------------------------------------------------- Services */

const ServiceSchema = z.object({
  name: z.string().trim().min(2, "must be at least 2 characters").max(160),
  category: z.enum(SERVICE_CATEGORIES),
  durationMin: z
    .number()
    .int("must be a whole number of minutes")
    .min(5, "must be at least 5 minutes")
    .max(600, "cannot exceed 10 hours"),
  price: z.number().nonnegative("cannot be negative").max(100_000_000),
  description: z.string().trim().max(500).optional(),
  active: z.boolean(),
});

export async function createServiceAction(
  input: z.infer<typeof ServiceSchema>,
): Promise<ActionResult<Service>> {
  try {
    const session = await requirePermission("services.manage");
    const data = ServiceSchema.parse(input);

    const dbCategory = SERVICE_CATEGORY_TO_DB[data.category];
    if (!dbCategory) return { ok: false, error: "Unknown service category." };

    // Service names are not unique in the schema, and legitimately so — but
    // the same name twice in one category is a duplicate entry, and it makes
    // the POS catalogue ambiguous for whoever is ringing up the ticket.
    const duplicate = await prisma.service.findFirst({
      where: {
        category: dbCategory,
        name: { equals: data.name, mode: "insensitive" },
        // Archived services do not reserve their name. Re-adding a service
        // that was removed last season is a normal thing to want, and there
        // is no unique index to protect here — only the ambiguity of two live
        // entries reading identically in the POS.
        archivedAt: null,
      },
      select: { id: true },
    });
    if (duplicate) {
      return { ok: false, error: `“${data.name}” already exists under ${data.category}.` };
    }

    const service = await prisma.service.create({
      data: {
        name: data.name,
        category: dbCategory,
        durationMin: data.durationMin,
        price: data.price,
        description: data.description || null,
        active: data.active,
      },
    });

    await recordAudit("PRICE_CHANGED", session, {
      entityType: "Service",
      entityId: service.id,
      metadata: { created: true, name: data.name, price: data.price, category: data.category },
    });

    revalidatePath("/services");
    revalidatePath("/pos");
    revalidatePath("/appointments");

    return {
      ok: true,
      data: {
        id: service.id,
        name: service.name,
        category: data.category,
        durationMin: service.durationMin,
        price: Number(service.price),
        description: service.description ?? undefined,
        active: service.active,
        archived: false,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateServiceAction(
  serviceId: string,
  input: z.infer<typeof ServiceSchema>,
): Promise<ActionResult<Service>> {
  try {
    const session = await requirePermission("services.manage");
    const data = ServiceSchema.parse(input);

    const dbCategory = SERVICE_CATEGORY_TO_DB[data.category];
    if (!dbCategory) return { ok: false, error: "Unknown service category." };

    const existing = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!existing || existing.archivedAt) {
      return { ok: false, error: "That service no longer exists — it may have been removed." };
    }

    // Same rule as create, minus itself: two live entries reading identically
    // in one category make the POS catalogue ambiguous.
    const duplicate = await prisma.service.findFirst({
      where: {
        id: { not: serviceId },
        category: dbCategory,
        name: { equals: data.name, mode: "insensitive" },
        archivedAt: null,
      },
      select: { id: true },
    });
    if (duplicate) {
      return { ok: false, error: `“${data.name}” already exists under ${data.category}.` };
    }

    const changes = diff(
      {
        name: existing.name,
        category: existing.category,
        durationMin: existing.durationMin,
        price: Number(existing.price),
        description: existing.description ?? undefined,
        active: existing.active,
      },
      {
        name: data.name,
        category: dbCategory,
        durationMin: data.durationMin,
        price: data.price,
        description: data.description || undefined,
        active: data.active,
      },
    );

    const service = await prisma.service.update({
      where: { id: serviceId },
      data: {
        name: data.name,
        category: dbCategory,
        durationMin: data.durationMin,
        price: data.price,
        description: data.description || null,
        active: data.active,
      },
    });

    // Neither a repricing nor a retimed service rewrites history: invoice
    // lines snapshot `unitPrice`, and an appointment's `durationMin` is summed
    // from the catalogue at booking time and stored on the row. Both changes
    // apply to what happens next, which is why this needs no backfill.
    if (Object.keys(changes).length > 0) {
      await recordAudit("price" in changes ? "PRICE_CHANGED" : "CATALOG_UPDATED", session, {
        entityType: "Service",
        entityId: serviceId,
        metadata: { name: data.name, category: data.category, changes },
      });
    }

    revalidatePath("/services");
    revalidatePath("/pos");
    revalidatePath("/appointments");

    return {
      ok: true,
      data: {
        id: service.id,
        name: service.name,
        category: data.category,
        durationMin: service.durationMin,
        price: Number(service.price),
        description: service.description ?? undefined,
        active: service.active,
        archived: false,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Soft delete, with the two dependency checks the database cannot express as
 * a useful error.
 *
 * Postgres would refuse a hard delete outright — `appointment_services` is
 * ON DELETE RESTRICT — and the P2003 that surfaces names a constraint, not the
 * three bookings on Thursday that are the actual problem. Archiving sidesteps
 * the constraint entirely, which is precisely why the checks have to be made
 * deliberately here: nothing else will stop a service vanishing out from under
 * a booked appointment or a live deal.
 */
export async function archiveServiceAction(
  serviceId: string,
): Promise<ActionResult<{ name: string }>> {
  try {
    const session = await requirePermission("services.manage");

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { name: true, category: true, price: true, active: true, archivedAt: true },
    });
    if (!service) return { ok: false, error: "That service no longer exists." };
    // Idempotent, so a double-click or a second manager on the same row is a
    // no-op rather than an error neither of them can act on.
    if (service.archivedAt) return { ok: true, data: { name: service.name } };

    const [upcoming, bundled] = await Promise.all([
      prisma.appointmentService.count({
        where: {
          serviceId,
          appointment: {
            start: { gte: new Date() },
            status: { in: ["SCHEDULED", "IN_PROGRESS"] },
          },
        },
      }),
      prisma.packageService.findMany({
        where: { serviceId, package: { archivedAt: null } },
        select: { package: { select: { name: true } } },
      }),
    ]);

    if (upcoming > 0) {
      return {
        ok: false,
        error:
          upcoming === 1
            ? "One upcoming booking still includes this service. Complete or cancel it first, or switch the service off instead of removing it."
            : `${upcoming} upcoming bookings still include this service. Complete or cancel them first, or switch the service off instead of removing it.`,
      };
    }

    if (bundled.length > 0) {
      // Naming the deals turns this from a refusal into an instruction. The
      // alternative — archiving anyway — leaves a sellable bundle quietly
      // missing a member, with its "saves 15%" maths computed against a list
      // price that no longer includes it.
      const names = bundled.map((b) => b.package.name);
      const shown = names.slice(0, 3).join(", ");
      return {
        ok: false,
        error: `This service is bundled into ${names.length === 1 ? "the deal" : "deals"}: ${shown}${
          names.length > 3 ? ` and ${names.length - 3} more` : ""
        }. Remove it from ${names.length === 1 ? "that deal" : "those deals"} first.`,
      };
    }

    await prisma.service.update({
      where: { id: serviceId },
      data: { archivedAt: new Date() },
    });

    await recordAudit("CATALOG_ARCHIVED", session, {
      entityType: "Service",
      entityId: serviceId,
      metadata: {
        name: service.name,
        category: service.category,
        price: Number(service.price),
        wasBookable: service.active,
      },
    });

    revalidatePath("/services");
    revalidatePath("/pos");
    revalidatePath("/appointments");

    return { ok: true, data: { name: service.name } };
  } catch (error) {
    return failure(error);
  }
}

/* -------------------------------------------------------------- Packages */

const PackageSchema = z.object({
  name: z.string().trim().min(2, "must be at least 2 characters").max(160),
  description: z.string().trim().max(500).optional(),
  price: z.number().nonnegative("cannot be negative").max(100_000_000),
  serviceIds: z
    .array(z.string().min(1))
    .min(2, "a package needs at least two services")
    .max(20, "cannot bundle more than 20 services"),
  active: z.boolean(),
});

export async function createPackageAction(
  input: z.infer<typeof PackageSchema>,
): Promise<ActionResult<ServicePackage>> {
  try {
    const session = await requirePermission("services.manage");
    const data = PackageSchema.parse(input);

    // Duplicate ids would silently collapse into one row on the composite
    // primary key, so a package would quietly hold fewer services than the
    // person building it selected.
    const serviceIds = [...new Set(data.serviceIds)];

    // Verify every id before writing. A missing one would otherwise surface as
    // a foreign-key violation halfway through the transaction, naming a column
    // rather than the service that has since been deleted.
    const found = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true, price: true },
    });
    if (found.length !== serviceIds.length) {
      return { ok: false, error: "One of those services no longer exists. Reopen and reselect." };
    }

    const pkg = await prisma.$transaction(async (tx) => {
      const created = await tx.servicePackage.create({
        data: {
          name: data.name,
          description: data.description || null,
          price: data.price,
          active: data.active,
        },
      });

      await tx.packageService.createMany({
        data: serviceIds.map((serviceId) => ({ packageId: created.id, serviceId })),
      });

      return created;
    });

    const fullPrice = found.reduce((sum, s) => sum + Number(s.price), 0);

    await recordAudit("PRICE_CHANGED", session, {
      entityType: "ServicePackage",
      entityId: pkg.id,
      metadata: {
        created: true,
        name: data.name,
        price: data.price,
        fullPrice,
        services: serviceIds.length,
      },
    });

    revalidatePath("/services");
    revalidatePath("/pos");

    return {
      ok: true,
      data: {
        id: pkg.id,
        name: pkg.name,
        description: pkg.description ?? undefined,
        price: Number(pkg.price),
        serviceIds,
        active: pkg.active,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updatePackageAction(
  packageId: string,
  input: z.infer<typeof PackageSchema>,
): Promise<ActionResult<ServicePackage>> {
  try {
    const session = await requirePermission("services.manage");
    const data = PackageSchema.parse(input);

    const existing = await prisma.servicePackage.findUnique({
      where: { id: packageId },
      include: { services: { select: { serviceId: true } } },
    });
    if (!existing || existing.archivedAt) {
      return { ok: false, error: "That deal no longer exists — it may have been removed." };
    }

    // Same reasoning as the create path: duplicates would collapse on the
    // composite key, leaving the deal quietly holding fewer services than the
    // person editing it selected.
    const serviceIds = [...new Set(data.serviceIds)];

    const found = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true, price: true },
    });
    if (found.length !== serviceIds.length) {
      return { ok: false, error: "One of those services no longer exists. Reopen and reselect." };
    }

    const previousIds = existing.services.map((s) => s.serviceId);
    const changes = diff(
      {
        name: existing.name,
        description: existing.description ?? undefined,
        price: Number(existing.price),
        active: existing.active,
        // Compared as a sorted string: the join table has no ordering, so
        // [a,b] and [b,a] are the same bundle and must not read as an edit.
        services: [...previousIds].sort().join(","),
      },
      {
        name: data.name,
        description: data.description || undefined,
        price: data.price,
        active: data.active,
        services: [...serviceIds].sort().join(","),
      },
    );

    // Replace-then-write in one transaction. Contents are a set, not a list to
    // be patched, and a half-applied bundle is worse than a rejected edit.
    const [, pkg] = await prisma.$transaction([
      prisma.packageService.deleteMany({ where: { packageId } }),
      prisma.servicePackage.update({
        where: { id: packageId },
        data: {
          name: data.name,
          description: data.description || null,
          price: data.price,
          active: data.active,
          services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
        },
      }),
    ]);

    if (Object.keys(changes).length > 0) {
      await recordAudit("price" in changes ? "PRICE_CHANGED" : "CATALOG_UPDATED", session, {
        entityType: "ServicePackage",
        entityId: packageId,
        metadata: {
          name: data.name,
          changes,
          fullPrice: found.reduce((sum, s) => sum + Number(s.price), 0),
        },
      });
    }

    revalidatePath("/services");
    revalidatePath("/pos");

    return {
      ok: true,
      data: {
        id: pkg.id,
        name: pkg.name,
        description: pkg.description ?? undefined,
        price: Number(pkg.price),
        serviceIds,
        active: pkg.active,
      },
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Soft delete, deliberately distinct from switching `active` off.
 *
 * `package_services` cascades from the deal, so `DELETE` would drop the record
 * of what was actually bundled — the only thing that explains a historical
 * invoice line reading "Complete Bridal Package · 85,000". Archiving keeps it
 * and takes the deal off every screen.
 */
export async function archivePackageAction(
  packageId: string,
): Promise<ActionResult<{ name: string }>> {
  try {
    const session = await requirePermission("services.manage");

    const pkg = await prisma.servicePackage.findUnique({
      where: { id: packageId },
      select: {
        name: true,
        price: true,
        active: true,
        archivedAt: true,
        services: { select: { serviceId: true } },
      },
    });
    if (!pkg) return { ok: false, error: "That deal no longer exists." };
    if (pkg.archivedAt) return { ok: true, data: { name: pkg.name } };

    await prisma.servicePackage.update({
      where: { id: packageId },
      data: { archivedAt: new Date() },
    });

    await recordAudit("CATALOG_ARCHIVED", session, {
      entityType: "ServicePackage",
      entityId: packageId,
      metadata: {
        name: pkg.name,
        price: Number(pkg.price),
        wasSellable: pkg.active,
        serviceIds: pkg.services.map((s) => s.serviceId),
      },
    });

    revalidatePath("/services");
    revalidatePath("/pos");

    return { ok: true, data: { name: pkg.name } };
  } catch (error) {
    return failure(error);
  }
}
