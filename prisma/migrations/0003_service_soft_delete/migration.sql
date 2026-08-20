-- Soft delete for services, completing the catalogue set started in 0002.
--
-- A service cannot be hard-deleted at all: `appointment_services` references
-- it with ON DELETE RESTRICT, so Postgres refuses the delete for any service
-- that has ever been booked. Where the delete would succeed — a service used
-- only inside a bundle — `package_services` cascades, quietly shrinking every
-- deal that contained it. `archived_at` retires the row instead.
--
-- Unlike products and packages, archived services are still READ by the
-- application: past appointments and historical invoice lines resolve their
-- category and name through the service id. See src/lib/db/queries.ts.

-- AlterTable
ALTER TABLE "services" ADD COLUMN "archived_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "services_archived_at_idx" ON "services"("archived_at");
