-- Soft delete for the catalogue (products and service packages).
--
-- Neither row can be dropped safely: `stock_movements` and `package_services`
-- both cascade from their parent, so a DELETE takes the stock ledger or the
-- bundle contents with it. `archived_at` retires the record instead, and the
-- read layer in src/lib/db/queries.ts filters archived rows out of every
-- screen — POS catalogue, low-stock alerts and inventory valuation included.

-- AlterEnum
-- Adds more than one value to an enum. PostgreSQL 12+ permits this inside the
-- transaction Prisma wraps a migration in, provided the new values are not
-- used by the same transaction — nothing here writes an audit row.
ALTER TYPE "AuditAction" ADD VALUE 'CATALOG_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CATALOG_ARCHIVED';

-- AlterTable
ALTER TABLE "inventory" ADD COLUMN "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_packages" ADD COLUMN "archived_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "inventory_archived_at_idx" ON "inventory"("archived_at");

-- CreateIndex
CREATE INDEX "service_packages_archived_at_idx" ON "service_packages"("archived_at");
