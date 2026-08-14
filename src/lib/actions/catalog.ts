"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { SERVICE_CATEGORY_TO_DB } from "@/lib/db/queries";
import {
  failure,
  recordAudit,
  requirePermission,
  type ActionResult,
} from "@/lib/actions/guard";
import { SERVICE_CATEGORIES } from "@/lib/types";
import type { Product, Service } from "@/lib/types";

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
      select: { name: true },
    });
    if (clash) {
      return { ok: false, error: `SKU ${data.sku} already belongs to ${clash.name}.` };
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
      },
    };
  } catch (error) {
    return failure(error);
  }
}
