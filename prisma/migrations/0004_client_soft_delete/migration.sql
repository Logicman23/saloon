-- Soft delete for clients, on the same reasoning as 0002 and 0003.
--
-- A client cannot be hard-deleted safely in either direction the schema
-- allows. `sales_invoices` references them ON DELETE RESTRICT, so Postgres
-- refuses outright for anyone who has ever been billed — which is every real
-- client. Where the delete would succeed, `appointments` cascades, silently
-- taking the person's entire booking history with it.
--
-- `archived_at` retires the record instead. Archived clients leave the client
-- list, the search and the booking picker, but stay READABLE: appointments,
-- invoices, the commission report and printed receipts all resolve a name
-- through the client id, and filtering them out of the read layer would blank
-- the name on every historical row. Same exception `services` makes.

-- AlterEnum
-- PostgreSQL 12+ permits more than one ADD VALUE inside the transaction Prisma
-- wraps a migration in, provided the new values are not used by that same
-- transaction — nothing here writes an audit row.
ALTER TYPE "AuditAction" ADD VALUE 'CLIENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CLIENT_ARCHIVED';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "archived_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "clients_archived_at_idx" ON "clients"("archived_at");
