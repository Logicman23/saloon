-- ============================================================================
--  Sana's Beauty Saloon — Supabase bootstrap
--  Run this ONCE, whole, in the Supabase SQL Editor of an EMPTY database.
--
--  It is the exact DDL from prisma/migrations/0001_init/migration.sql, plus a
--  seed, plus the _prisma_migrations bookkeeping row so a later
--  `prisma migrate deploy` sees the migration as already applied instead of
--  trying to re-create every table.
--
--  Safe to re-run: every statement is IF NOT EXISTS / ON CONFLICT DO NOTHING.
--
--  This REPLACES `npm run db:seed` — do not run both. The seed script creates
--  its own accounts on different emails and would collide with these on the
--  users.staff_id unique index (one login per chair).
-- ============================================================================

BEGIN;

-- ############################################################################
-- # 1. ENUM TYPES
-- ############################################################################

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StaffRole') THEN
    CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'SENIOR_STYLIST', 'STYLIST', 'BEAUTICIAN', 'NAIL_TECHNICIAN', 'MAKEUP_ARTIST', 'RECEPTIONIST');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceCategory') THEN
    CREATE TYPE "ServiceCategory" AS ENUM ('HAIR', 'SKIN', 'MAKEUP', 'NAILS', 'SPA');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductType') THEN
    CREATE TYPE "ProductType" AS ENUM ('RETAIL', 'CONSUMABLE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StockMovementType') THEN
    CREATE TYPE "StockMovementType" AS ENUM ('STOCK_IN', 'SERVICE_USAGE', 'RETAIL_SALE', 'DAMAGED', 'EXPIRED', 'ADJUSTMENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AppointmentStatus') THEN
    CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LineKind') THEN
    CREATE TYPE "LineKind" AS ENUM ('SERVICE', 'PRODUCT', 'PACKAGE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DiscountKind') THEN
    CREATE TYPE "DiscountKind" AS ENUM ('NONE', 'FLAT', 'PERCENT', 'CODE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMode') THEN
    CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'CARD', 'WALLET', 'TRANSFER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceStatus') THEN
    CREATE TYPE "InvoiceStatus" AS ENUM ('PAID', 'PARTIAL', 'UNPAID', 'VOID');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseCategory') THEN
    CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'ELECTRICITY', 'UTILITIES', 'PRODUCT_PURCHASE', 'STAFF_SALARY', 'REFRESHMENTS', 'MARKETING', 'MAINTENANCE', 'MISCELLANEOUS');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditAction') THEN
    CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'ACCESS_DENIED', 'OVERRIDE_GRANTED', 'OVERRIDE_DENIED', 'ROLE_CHANGED', 'PASSWORD_CHANGED', 'USER_DEACTIVATED', 'INVOICE_VOIDED', 'DISCOUNT_OVERRIDE', 'PRICE_CHANGED', 'STOCK_ADJUSTED', 'EXPENSE_DELETED');
  END IF;
END $$;

-- ############################################################################
-- # 2. TABLES
-- ############################################################################

CREATE TABLE IF NOT EXISTS "user_roles" (
    "id"           TEXT    NOT NULL,
    "key"          TEXT    NOT NULL,
    "label"        TEXT    NOT NULL,
    "description"  TEXT,
    "landing_path" TEXT    NOT NULL DEFAULT '/',
    "is_system"    BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "permissions" (
    "key"         TEXT NOT NULL,
    "label"       TEXT NOT NULL,
    "category"    TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "role_permissions" (
    "role_id"        TEXT         NOT NULL,
    "permission_key" TEXT         NOT NULL,
    "granted_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);

CREATE TABLE IF NOT EXISTS "staff" (
    "id"              TEXT          NOT NULL,
    "name"            TEXT          NOT NULL,
    "role"            "StaffRole"   NOT NULL DEFAULT 'STYLIST',
    "phone"           TEXT          NOT NULL,
    "email"           TEXT,
    "commission_rate" DECIMAL(4,3)  NOT NULL DEFAULT 0.10,
    "specialties"     "ServiceCategory"[],
    "monthly_salary"  DECIMAL(12,2) NOT NULL DEFAULT 0,
    "active"          BOOLEAN       NOT NULL DEFAULT true,
    "joined_at"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- NOTE: the login table. `password_hash` + `password_salt` are PBKDF2-HMAC-SHA512,
-- 210,000 iterations, 64-byte key, both stored as lowercase hex. NOT bcrypt.
CREATE TABLE IF NOT EXISTS "users" (
    "id"                  TEXT         NOT NULL,
    "email"               TEXT         NOT NULL,
    "name"                TEXT         NOT NULL,
    "password_hash"       TEXT         NOT NULL,
    "password_salt"       TEXT         NOT NULL,
    "override_pin_hash"   TEXT,
    "active"              BOOLEAN      NOT NULL DEFAULT true,
    "last_login_at"       TIMESTAMP(3),
    "sessions_valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failed_login_count"  INTEGER      NOT NULL DEFAULT 0,
    "locked_until"        TIMESTAMP(3),
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,
    "role_id"             TEXT         NOT NULL,
    "staff_id"            TEXT,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sessions" (
    "id"           TEXT         NOT NULL,
    "user_id"      TEXT         NOT NULL,
    "token_hash"   TEXT         NOT NULL,
    "user_agent"   TEXT,
    "ip"           TEXT,
    "expires_at"   TIMESTAMP(3) NOT NULL,
    "revoked_at"   TIMESTAMP(3),
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id"          TEXT          NOT NULL,
    "action"      "AuditAction" NOT NULL,
    "user_id"     TEXT,
    "actor_email" TEXT,
    "actor_role"  TEXT,
    "entity_type" TEXT,
    "entity_id"   TEXT,
    "metadata"    JSONB,
    "ip"          TEXT,
    "user_agent"  TEXT,
    "at"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "clients" (
    "id"         TEXT         NOT NULL,
    "name"       TEXT         NOT NULL,
    "phone"      TEXT         NOT NULL,
    "email"      TEXT,
    "gender"     TEXT,
    "notes"      TEXT,
    "tags"       TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "services" (
    "id"            TEXT              NOT NULL,
    "title"         TEXT              NOT NULL,
    "category"      "ServiceCategory" NOT NULL,
    "duration_mins" INTEGER           NOT NULL,
    "price"         DECIMAL(12,2)     NOT NULL,
    "description"   TEXT,
    "active"        BOOLEAN           NOT NULL DEFAULT true,
    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "service_packages" (
    "id"          TEXT          NOT NULL,
    "name"        TEXT          NOT NULL,
    "description" TEXT,
    "price"       DECIMAL(12,2) NOT NULL,
    "active"      BOOLEAN       NOT NULL DEFAULT true,
    CONSTRAINT "service_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "package_services" (
    "package_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    CONSTRAINT "package_services_pkey" PRIMARY KEY ("package_id","service_id")
);

CREATE TABLE IF NOT EXISTS "inventory" (
    "id"              TEXT          NOT NULL,
    "product_name"    TEXT          NOT NULL,
    "sku"             TEXT          NOT NULL,
    "type"            "ProductType" NOT NULL DEFAULT 'RETAIL',
    "brand"           TEXT          NOT NULL,
    "unit"            TEXT          NOT NULL DEFAULT 'pc',
    "cost_price"      DECIMAL(12,2) NOT NULL,
    "retail_price"    DECIMAL(12,2) NOT NULL,
    "stock_qty"       INTEGER       NOT NULL DEFAULT 0,
    "min_stock_alert" INTEGER       NOT NULL DEFAULT 5,
    "supplier"        TEXT,
    "created_at"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id"         TEXT                NOT NULL,
    "product_id" TEXT                NOT NULL,
    "type"       "StockMovementType" NOT NULL,
    "qty"        INTEGER             NOT NULL,
    "note"       TEXT,
    "staff_id"   TEXT,
    "at"         TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "appointments" (
    "id"            TEXT                NOT NULL,
    "client_id"     TEXT                NOT NULL,
    "staff_id"      TEXT                NOT NULL,
    "scheduled_at"  TIMESTAMP(3)        NOT NULL,
    "duration_mins" INTEGER             NOT NULL,
    "status"        "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes"         TEXT,
    "created_at"    TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3)        NOT NULL,
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "appointment_services" (
    "appointment_id" TEXT NOT NULL,
    "service_id"     TEXT NOT NULL,
    CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("appointment_id","service_id")
);

CREATE TABLE IF NOT EXISTS "sales_invoices" (
    "id"                  TEXT            NOT NULL,
    "number"              TEXT            NOT NULL,
    "client_id"           TEXT            NOT NULL,
    "appointment_id"      TEXT,
    "discount_kind"       "DiscountKind"  NOT NULL DEFAULT 'NONE',
    "discount_value"      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "discount_code"       TEXT,
    "tax_rate"            DECIMAL(5,2)    NOT NULL DEFAULT 0,
    "total_amount"        DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "paid_amount"         DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "service_revenue"     DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "retail_revenue"      DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "commission_total"    DECIMAL(12,2)   NOT NULL DEFAULT 0,
    "payment_status"      "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "note"                TEXT,
    "created_by_staff_id" TEXT            NOT NULL,
    "created_at"          TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3)    NOT NULL,
    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "invoice_lines" (
    "id"              TEXT          NOT NULL,
    "invoice_id"      TEXT          NOT NULL,
    "kind"            "LineKind"    NOT NULL,
    "ref_id"          TEXT          NOT NULL,
    "name"            TEXT          NOT NULL,
    "unit_price"      DECIMAL(12,2) NOT NULL,
    "qty"             INTEGER       NOT NULL DEFAULT 1,
    "staff_id"        TEXT,
    "commission_rate" DECIMAL(4,3)  NOT NULL DEFAULT 0,
    "line_discount"   DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payments" (
    "id"             TEXT          NOT NULL,
    "invoice_id"     TEXT          NOT NULL,
    "payment_method" "PaymentMode" NOT NULL,
    "amount"         DECIMAL(12,2) NOT NULL,
    "reference"      TEXT,
    "at"             TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "promo_codes" (
    "code"       TEXT           NOT NULL,
    "label"      TEXT           NOT NULL,
    "kind"       "DiscountKind" NOT NULL DEFAULT 'PERCENT',
    "value"      DECIMAL(12,2)  NOT NULL,
    "min_spend"  DECIMAL(12,2)  NOT NULL DEFAULT 0,
    "active"     BOOLEAN        NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("code")
);

CREATE TABLE IF NOT EXISTS "expenses" (
    "id"                   TEXT              NOT NULL,
    "category"             "ExpenseCategory" NOT NULL,
    "amount"               DECIMAL(12,2)     NOT NULL,
    "expense_date"         TIMESTAMP(3)      NOT NULL,
    "vendor"               TEXT,
    "note"                 TEXT,
    "payment_method"       "PaymentMode"     NOT NULL DEFAULT 'CASH',
    "attachment"           TEXT,
    "recorded_by_staff_id" TEXT              NOT NULL,
    "created_at"           TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- ############################################################################
-- # 3. INDEXES & UNIQUE CONSTRAINTS
-- ############################################################################

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key"                     ON "users"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "users_staff_id_key"                  ON "users"("staff_id");
CREATE        INDEX IF NOT EXISTS "users_active_idx"                    ON "users"("active");
CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_key_key"                  ON "user_roles"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_hash_key"             ON "sessions"("token_hash");
CREATE        INDEX IF NOT EXISTS "sessions_user_id_idx"                ON "sessions"("user_id");
CREATE        INDEX IF NOT EXISTS "sessions_expires_at_idx"             ON "sessions"("expires_at");
CREATE        INDEX IF NOT EXISTS "audit_logs_at_idx"                   ON "audit_logs"("at");
CREATE        INDEX IF NOT EXISTS "audit_logs_action_at_idx"            ON "audit_logs"("action", "at");
CREATE        INDEX IF NOT EXISTS "audit_logs_user_id_idx"              ON "audit_logs"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "staff_email_key"                     ON "staff"("email");
CREATE        INDEX IF NOT EXISTS "staff_active_idx"                    ON "staff"("active");
CREATE UNIQUE INDEX IF NOT EXISTS "clients_phone_key"                   ON "clients"("phone");
CREATE        INDEX IF NOT EXISTS "clients_name_idx"                    ON "clients"("name");
CREATE        INDEX IF NOT EXISTS "services_category_active_idx"        ON "services"("category", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_sku_key"                   ON "inventory"("sku");
CREATE        INDEX IF NOT EXISTS "inventory_type_idx"                  ON "inventory"("type");
CREATE        INDEX IF NOT EXISTS "stock_movements_product_id_at_idx"   ON "stock_movements"("product_id", "at");
CREATE        INDEX IF NOT EXISTS "appointments_scheduled_at_idx"       ON "appointments"("scheduled_at");
CREATE        INDEX IF NOT EXISTS "appointments_staff_id_scheduled_at_idx" ON "appointments"("staff_id", "scheduled_at");
CREATE        INDEX IF NOT EXISTS "appointments_status_idx"             ON "appointments"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_invoices_number_key"           ON "sales_invoices"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_invoices_appointment_id_key"   ON "sales_invoices"("appointment_id");
CREATE        INDEX IF NOT EXISTS "sales_invoices_created_at_idx"       ON "sales_invoices"("created_at");
CREATE        INDEX IF NOT EXISTS "sales_invoices_payment_status_idx"   ON "sales_invoices"("payment_status");
CREATE        INDEX IF NOT EXISTS "sales_invoices_client_id_idx"        ON "sales_invoices"("client_id");
CREATE        INDEX IF NOT EXISTS "invoice_lines_invoice_id_idx"        ON "invoice_lines"("invoice_id");
CREATE        INDEX IF NOT EXISTS "invoice_lines_staff_id_idx"          ON "invoice_lines"("staff_id");
CREATE        INDEX IF NOT EXISTS "payments_invoice_id_idx"             ON "payments"("invoice_id");
CREATE        INDEX IF NOT EXISTS "expenses_expense_date_idx"           ON "expenses"("expense_date");
CREATE        INDEX IF NOT EXISTS "expenses_category_idx"               ON "expenses"("category");

-- ############################################################################
-- # 4. FOREIGN KEYS
-- ############################################################################

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_id_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "user_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_staff_id_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_role_id_fkey') THEN
    ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "user_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_permission_key_fkey') THEN
    ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_fkey') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_user_id_fkey') THEN
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'package_services_package_id_fkey') THEN
    ALTER TABLE "package_services" ADD CONSTRAINT "package_services_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "service_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'package_services_service_id_fkey') THEN
    ALTER TABLE "package_services" ADD CONSTRAINT "package_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_product_id_fkey') THEN
    ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_staff_id_fkey') THEN
    ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_client_id_fkey') THEN
    ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_staff_id_fkey') THEN
    ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointment_services_appointment_id_fkey') THEN
    ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointment_services_service_id_fkey') THEN
    ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_invoices_client_id_fkey') THEN
    ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_invoices_appointment_id_fkey') THEN
    ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_invoices_created_by_staff_id_fkey') THEN
    ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_lines_invoice_id_fkey') THEN
    ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_lines_staff_id_fkey') THEN
    ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_invoice_id_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_recorded_by_staff_id_fkey') THEN
    ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_staff_id_fkey" FOREIGN KEY ("recorded_by_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ############################################################################
-- # 5. PERMISSION CATALOGUE  (mirrors src/lib/auth/permissions.ts)
-- ############################################################################

INSERT INTO "permissions" ("key", "label", "category") VALUES
  ('finance.view',             'Finance: View',              'Finance'),
  ('reports.view',             'Reports: View',              'Reports'),
  ('expenses.view',            'Expenses: View',             'Expenses'),
  ('expenses.manage',          'Expenses: Manage',           'Expenses'),
  ('pos.operate',              'Pos: Operate',               'Pos'),
  ('pos.discount.override',    'Pos: Discount Override',     'Pos'),
  ('register.view',            'Register: View',             'Register'),
  ('invoice.view',             'Invoice: View',              'Invoice'),
  ('invoice.void',             'Invoice: Void',              'Invoice'),
  ('appointments.view.all',    'Appointments: View All',     'Appointments'),
  ('appointments.view.own',    'Appointments: View Own',     'Appointments'),
  ('appointments.manage',      'Appointments: Manage',       'Appointments'),
  ('appointments.status.own',  'Appointments: Status Own',   'Appointments'),
  ('clients.view',             'Clients: View',              'Clients'),
  ('clients.manage',           'Clients: Manage',            'Clients'),
  ('clients.export',           'Clients: Export',            'Clients'),
  ('services.view',            'Services: View',             'Services'),
  ('services.manage',          'Services: Manage',           'Services'),
  ('inventory.view',           'Inventory: View',            'Inventory'),
  ('inventory.manage',         'Inventory: Manage',          'Inventory'),
  ('staff.view',               'Staff: View',                'Staff'),
  ('staff.manage',             'Staff: Manage',              'Staff'),
  ('commissions.view.own',     'Commissions: View Own',      'Commissions'),
  ('commissions.view.all',     'Commissions: View All',      'Commissions')
ON CONFLICT ("key") DO NOTHING;

-- ############################################################################
-- # 6. ROLES  — `key` MUST be one of ADMIN | CASHIER | STAFF (the app's Role union)
-- ############################################################################

INSERT INTO "user_roles" ("id", "key", "label", "description", "landing_path", "is_system") VALUES
  ('role_admin',   'ADMIN',   'Owner / Super Admin',     'Unrestricted access to every module, including financials.', '/',            true),
  ('role_cashier', 'CASHIER', 'Cashier / Receptionist',  'Front desk: billing, bookings and the client directory.',    '/pos',         false),
  ('role_staff',   'STAFF',   'Beautician / Staff',      'Personal portal: today''s chair, service status and commission.', '/my-schedule', false)
ON CONFLICT ("id") DO NOTHING;

-- ADMIN: every capability.
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT 'role_admin', "key" FROM "permissions"
ON CONFLICT DO NOTHING;

-- CASHIER: front desk only. No finance, no voids, no overrides.
INSERT INTO "role_permissions" ("role_id", "permission_key") VALUES
  ('role_cashier', 'pos.operate'),
  ('role_cashier', 'register.view'),
  ('role_cashier', 'invoice.view'),
  ('role_cashier', 'appointments.view.all'),
  ('role_cashier', 'appointments.manage'),
  ('role_cashier', 'clients.view'),
  ('role_cashier', 'clients.manage'),
  ('role_cashier', 'services.view'),
  ('role_cashier', 'inventory.view')
ON CONFLICT DO NOTHING;

-- STAFF: own chair only.
INSERT INTO "role_permissions" ("role_id", "permission_key") VALUES
  ('role_staff', 'appointments.view.own'),
  ('role_staff', 'appointments.status.own'),
  ('role_staff', 'commissions.view.own')
ON CONFLICT DO NOTHING;

-- ############################################################################
-- # 7. STAFF (chairs / job titles — distinct from login roles above)
-- ############################################################################

INSERT INTO "staff" ("id", "name", "role", "phone", "email", "commission_rate", "specialties", "monthly_salary", "active") VALUES
  ('stf_sana',    'Sana Malik',    'OWNER',           '0300-1234567', 'admin@sana.com',   0.000, ARRAY['HAIR','MAKEUP','SKIN']::"ServiceCategory"[],     0, true),
  ('stf_ayesha',  'Ayesha Khan',   'BEAUTICIAN',      '0301-2345678', 'ayesha@sana.com',  0.150, ARRAY['HAIR','SKIN']::"ServiceCategory"[],          65000, true),
  ('stf_hina',    'Hina Raza',     'BEAUTICIAN',      '0302-3456789', NULL,               0.120, ARRAY['SKIN','SPA']::"ServiceCategory"[],           52000, true),
  ('stf_mehwish', 'Mehwish Ali',   'MAKEUP_ARTIST',   '0303-4567890', NULL,               0.180, ARRAY['MAKEUP']::"ServiceCategory"[],               58000, true),
  ('stf_zoya',    'Zoya Iqbal',    'NAIL_TECHNICIAN', '0304-5678901', NULL,               0.140, ARRAY['NAILS']::"ServiceCategory"[],                45000, true),
  ('stf_farah',   'Farah Nadeem',  'STYLIST',         '0305-6789012', NULL,               0.120, ARRAY['HAIR','NAILS']::"ServiceCategory"[],         42000, true),
  ('stf_rabia',   'Rabia Sattar',  'RECEPTIONIST',    '0306-7890123', 'cashier@sana.com', 0.020, ARRAY[]::"ServiceCategory"[],                       35000, true)
ON CONFLICT ("id") DO NOTHING;

-- ############################################################################
-- # 8. LOGIN ACCOUNTS
-- #
-- #    password_hash = pbkdf2_hmac_sha512(password, password_salt, 210000, 64) as hex
-- #    The salt is used as a UTF-8 STRING (not decoded from hex) — matches
-- #    node:crypto pbkdf2Sync(password, salt, ...) in src/lib/auth/users.server.ts.
-- #
-- #    admin@sana.com    ->  SanaAdmin#2026
-- #    ayesha@sana.com   ->  Ayesha#2026
-- #    cashier@sana.com  ->  Cashier#2026
-- #
-- #    Emails MUST be lowercase: findUserByEmail() lowercases the input before
-- #    the lookup, so a capitalised row here would never match.
-- ############################################################################

INSERT INTO "users" (
  "id", "email", "name", "password_hash", "password_salt", "override_pin_hash",
  "active", "failed_login_count", "sessions_valid_from", "created_at", "updated_at",
  "role_id", "staff_id"
) VALUES
  (
    'usr_admin',
    'admin@sana.com',
    'Sana Malik',
    'fa9151a9d1f1b3c50aa0b5877ca018b443cc14dae7b90f1ec34c07479927dca80c7510adc0a23ce868ab7b21a1e14965fc87e5d64d7cff9ca2e2b16091404855',
    '2e9123536619a31477d9991a5f8a9410',
    -- SHA-256 of manager override PIN 4826
    '0a4e3e70597a358b9447fa8a647aadf5b76dde95c8e4ab02e5f8cee6caa1cd28',
    true, 0, now(), now(), now(),
    'role_admin', 'stf_sana'
  ),
  (
    -- Not 'usr_ayesha': prisma/seed.ts reserves that id for its own account.
    'usr_ayesha_login',
    'ayesha@sana.com',
    'Ayesha Khan',
    '9ff6f488e8da5616ec4a5a0a4a57cc6068ea1e35470d5bc6f59dd03f5364b6dce900811703a9533db5b43955af11965ec144359c90702efda9065412aed6b1f8',
    '166d3160ae6f6cb193c03d144afd1941',
    NULL,
    true, 0, now(), now(), now(),
    'role_staff', 'stf_ayesha'
  ),
  (
    'usr_cashier',
    'cashier@sana.com',
    'Front Desk Cashier',
    'bc938e4726f4e6f1bbcc5920cb1cc875d820096eea84001b2a65f0af74a304d0fe2d1ed3394062184f443c68b4f01eb67d80cb579e67487f58041056cafed869',
    '9c94b6b01450f3e59669405a7101de94',
    NULL,
    true, 0, now(), now(), now(),
    'role_cashier', 'stf_rabia'
  )
ON CONFLICT ("email") DO NOTHING;

-- ############################################################################
-- # 9. SERVICE CATALOGUE
-- #    `category` is a Postgres ENUM (HAIR/SKIN/MAKEUP/NAILS/SPA) — the four
-- #    business categories map onto it as:
-- #      Hair Care -> HAIR   Skin & Facial -> SKIN
-- #      Bridal Makeup -> MAKEUP   Nail Bar -> NAILS
-- ############################################################################

INSERT INTO "services" ("id", "title", "category", "duration_mins", "price", "description", "active") VALUES
  -- Hair Care
  ('svc_haircut',    'Haircut & Blow Dry',        'HAIR',   45,  2500.00, 'Consultation, cut and finish.',              true),
  ('svc_hairwash',   'Hair Wash & Deep Condition','HAIR',   30,  1500.00, 'Wash with deep conditioning mask.',          true),
  ('svc_haircolor',  'Global Hair Colour',        'HAIR',  120,  9500.00, 'Full-head ammonia-free colour.',             true),
  ('svc_keratin',    'Keratin Smoothing',         'HAIR',  180, 18000.00, 'Frizz control, lasts 3-4 months.',           true),
  ('svc_headmasage', 'Hot Oil Head Massage',      'HAIR',   30,  1800.00, 'Relaxing scalp treatment.',                  true),
  -- Skin & Facial
  ('svc_facial',     'Signature Glow Facial',     'SKIN',   60,  4500.00, 'Cleanse, exfoliate, mask and massage.',      true),
  ('svc_whitening',  'Whitening Facial',          'SKIN',   75,  6000.00, 'Brightening treatment for dull skin.',       true),
  ('svc_hydra',      'Hydrafacial',               'SKIN',   60, 12000.00, 'Medical-grade deep cleanse and hydration.',  true),
  ('svc_threading',  'Eyebrow Threading',         'SKIN',   15,   500.00, 'Shaping and clean-up.',                      true),
  ('svc_fullwax',    'Full Body Waxing',          'SKIN',   90,  7500.00, 'Full body, honey or chocolate wax.',         true),
  -- Bridal Makeup
  ('svc_bridal',     'Bridal Makeup (Full)',      'MAKEUP',240, 65000.00, 'Complete bridal look with hair styling.',    true),
  ('svc_engagement', 'Engagement Makeup',         'MAKEUP',150, 35000.00, 'Party-ready HD makeup and hair.',            true),
  ('svc_party',      'Party Makeup',              'MAKEUP', 90, 12000.00, 'Evening event makeup.',                      true),
  ('svc_mehndi',     'Mehndi Night Makeup',       'MAKEUP',120, 22000.00, 'Traditional mehndi function look.',          true),
  -- Nail Bar
  ('svc_manicure',   'Classic Manicure',          'NAILS',  45,  2200.00, 'Shape, cuticle care and polish.',            true),
  ('svc_pedicure',   'Spa Pedicure',              'NAILS',  60,  3000.00, 'Soak, scrub, massage and polish.',           true),
  ('svc_gel',        'Gel Nail Extensions',       'NAILS',  90,  6500.00, 'Full set with gel overlay.',                 true),
  ('svc_nailart',    'Nail Art (per hand)',       'NAILS',  30,  1500.00, 'Freehand or stencil designs.',               true),
  -- Spa
  ('svc_bodymassage','Full Body Relaxation Massage','SPA',   60,  8000.00, 'Aromatherapy oil massage.',                 true),
  ('svc_bodypolish', 'Body Polish & Scrub',       'SPA',    75,  9500.00, 'Exfoliating full-body polish.',              true)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "service_packages" ("id", "name", "description", "price", "active") VALUES
  ('pkg_bridal',  'Complete Bridal Package', 'Bridal makeup + hydrafacial + gel nails + body polish.', 85000.00, true),
  ('pkg_pamper',  'Weekend Pamper Package',  'Signature facial + spa pedicure + head massage.',        8500.00,  true)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "package_services" ("package_id", "service_id") VALUES
  ('pkg_bridal', 'svc_bridal'),
  ('pkg_bridal', 'svc_hydra'),
  ('pkg_bridal', 'svc_gel'),
  ('pkg_bridal', 'svc_bodypolish'),
  ('pkg_pamper', 'svc_facial'),
  ('pkg_pamper', 'svc_pedicure'),
  ('pkg_pamper', 'svc_headmasage')
ON CONFLICT DO NOTHING;

INSERT INTO "promo_codes" ("code", "label", "kind", "value", "min_spend", "active") VALUES
  ('WELCOME10', 'First visit — 10% off', 'PERCENT', 10.00, 2000.00, true),
  ('BRIDAL5000','Bridal booking — Rs 5,000 off', 'FLAT', 5000.00, 50000.00, true)
ON CONFLICT ("code") DO NOTHING;

-- ############################################################################
-- # 10. INVENTORY
-- ############################################################################

INSERT INTO "inventory" ("id", "product_name", "sku", "type", "brand", "unit", "cost_price", "retail_price", "stock_qty", "min_stock_alert", "supplier") VALUES
  ('inv_shampoo',  'Argan Oil Shampoo 500ml',   'SKU-SHM-500', 'RETAIL',     'L''Oreal Pro', 'pc', 1800.00, 3200.00, 24, 6,  'Beauty Depot Lahore'),
  ('inv_cond',     'Argan Oil Conditioner 500ml','SKU-CND-500','RETAIL',     'L''Oreal Pro', 'pc', 1900.00, 3400.00, 18, 6,  'Beauty Depot Lahore'),
  ('inv_serum',    'Vitamin C Face Serum 30ml', 'SKU-SRM-030', 'RETAIL',     'The Ordinary', 'pc', 2400.00, 4500.00, 12, 4,  'Glow Imports'),
  ('inv_haircolor','Hair Colour Tube 60ml',     'SKU-CLR-060', 'CONSUMABLE', 'Wella',        'pc',  900.00, 1600.00, 40, 10, 'Wella Distributor'),
  ('inv_developer','Cream Developer 1L',        'SKU-DEV-1L',  'CONSUMABLE', 'Wella',        'ltr', 1200.00, 2000.00,  8, 3,  'Wella Distributor'),
  ('inv_wax',      'Chocolate Wax 800g',        'SKU-WAX-800', 'CONSUMABLE', 'Rica',         'pc',  1500.00, 2600.00,  5, 5,  'Glow Imports'),
  ('inv_gelkit',   'Gel Nail Kit',              'SKU-GEL-KIT', 'CONSUMABLE', 'OPI',          'pc',  3500.00, 5800.00,  3, 4,  'Nail Supplies Co'),
  ('inv_facemask', 'Gold Facial Mask 250g',     'SKU-MSK-250', 'CONSUMABLE', 'Janssen',      'pc',  2800.00, 4800.00, 10, 3,  'Glow Imports')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "stock_movements" ("id", "product_id", "type", "qty", "note", "staff_id", "at") VALUES
  ('mov_1', 'inv_shampoo',  'STOCK_IN',    24, 'Opening stock', 'stf_sana', now() - interval '20 days'),
  ('mov_2', 'inv_haircolor','STOCK_IN',    40, 'Opening stock', 'stf_sana', now() - interval '20 days'),
  ('mov_3', 'inv_wax',      'SERVICE_USAGE', -3, 'Waxing appointments', 'stf_hina', now() - interval '3 days'),
  ('mov_4', 'inv_gelkit',   'SERVICE_USAGE', -2, 'Gel extensions',      'stf_zoya', now() - interval '2 days')
ON CONFLICT ("id") DO NOTHING;

-- ############################################################################
-- # 11. CLIENTS
-- ############################################################################

INSERT INTO "clients" ("id", "name", "phone", "email", "gender", "notes", "tags", "created_at", "updated_at") VALUES
  ('cli_maria',  'Maria Sheikh',   '0321-1112233', 'maria@example.com',  'Female', 'Prefers Ayesha. Sensitive scalp.',      ARRAY['regular','vip'],   now() - interval '90 days', now()),
  ('cli_fatima', 'Fatima Noor',    '0322-2223344', 'fatima@example.com', 'Female', 'Bridal booking for December.',          ARRAY['bridal'],          now() - interval '45 days', now()),
  ('cli_sadia',  'Sadia Rehman',   '0333-3334455', NULL,                 'Female', 'Allergic to ammonia-based colour.',     ARRAY['regular'],         now() - interval '30 days', now()),
  ('cli_hira',   'Hira Aslam',     '0345-4445566', 'hira@example.com',   'Female', 'Monthly facial package.',               ARRAY['regular','vip'],   now() - interval '20 days', now()),
  ('cli_nida',   'Nida Tariq',     '0300-5556677', NULL,                 'Female', 'Walk-in.',                              ARRAY[]::text[],          now() - interval '7 days',  now())
ON CONFLICT ("id") DO NOTHING;

-- ############################################################################
-- # 12. APPOINTMENTS
-- ############################################################################

INSERT INTO "appointments" ("id", "client_id", "staff_id", "scheduled_at", "duration_mins", "status", "notes", "created_at", "updated_at") VALUES
  ('apt_1', 'cli_maria',  'stf_ayesha',  now() - interval '2 days',  75,  'COMPLETED', 'Cut plus deep conditioning.', now() - interval '5 days', now()),
  ('apt_2', 'cli_hira',   'stf_hina',    now() - interval '1 day',   60,  'COMPLETED', 'Monthly facial.',             now() - interval '4 days', now()),
  ('apt_3', 'cli_sadia',  'stf_zoya',    now() + interval '4 hours', 105, 'SCHEDULED', 'Gel set plus nail art.',      now() - interval '1 day',  now()),
  ('apt_4', 'cli_fatima', 'stf_mehwish', now() + interval '3 days',  240, 'SCHEDULED', 'Bridal trial run.',           now() - interval '2 days', now()),
  ('apt_5', 'cli_nida',   'stf_farah',   now() + interval '1 day',   45,  'SCHEDULED', 'Walk-in follow-up.',          now() - interval '1 day',  now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "appointment_services" ("appointment_id", "service_id") VALUES
  ('apt_1', 'svc_haircut'),
  ('apt_1', 'svc_hairwash'),
  ('apt_2', 'svc_facial'),
  ('apt_3', 'svc_gel'),
  ('apt_3', 'svc_nailart'),
  ('apt_4', 'svc_bridal'),
  ('apt_5', 'svc_haircut')
ON CONFLICT DO NOTHING;

-- ############################################################################
-- # 13. INVOICES + PAYMENTS  (so the dashboard has revenue to chart)
-- ############################################################################

INSERT INTO "sales_invoices" (
  "id", "number", "client_id", "appointment_id", "discount_kind", "discount_value",
  "tax_rate", "total_amount", "paid_amount", "service_revenue", "retail_revenue",
  "commission_total", "payment_status", "created_by_staff_id", "created_at", "updated_at"
) VALUES
  ('inv_0001', 'INV-0001', 'cli_maria', 'apt_1', 'NONE',    0.00, 0.00, 4000.00, 4000.00, 4000.00,    0.00, 600.00, 'PAID', 'stf_rabia', now() - interval '2 days', now()),
  ('inv_0002', 'INV-0002', 'cli_hira',  'apt_2', 'PERCENT',10.00, 0.00, 7250.00, 7250.00, 4500.00, 3200.00, 540.00, 'PAID', 'stf_rabia', now() - interval '1 day',  now()),
  ('inv_0003', 'INV-0003', 'cli_nida',   NULL,   'NONE',    0.00, 0.00,  500.00,    0.00,  500.00,    0.00,   0.00, 'UNPAID','stf_rabia', now() - interval '6 hours', now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "invoice_lines" ("id", "invoice_id", "kind", "ref_id", "name", "unit_price", "qty", "staff_id", "commission_rate") VALUES
  ('lin_1', 'inv_0001', 'SERVICE', 'svc_haircut',  'Haircut & Blow Dry',         2500.00, 1, 'stf_ayesha', 0.150),
  ('lin_2', 'inv_0001', 'SERVICE', 'svc_hairwash', 'Hair Wash & Deep Condition', 1500.00, 1, 'stf_ayesha', 0.150),
  ('lin_3', 'inv_0002', 'SERVICE', 'svc_facial',   'Signature Glow Facial',      4500.00, 1, 'stf_hina',   0.120),
  ('lin_4', 'inv_0002', 'PRODUCT', 'inv_shampoo',  'Argan Oil Shampoo 500ml',    3200.00, 1, 'stf_rabia',  0.020),
  ('lin_5', 'inv_0003', 'SERVICE', 'svc_threading','Eyebrow Threading',           500.00, 1, 'stf_farah',  0.120)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "payments" ("id", "invoice_id", "payment_method", "amount", "reference", "at") VALUES
  ('pay_1', 'inv_0001', 'CASH', 4000.00, NULL,           now() - interval '2 days'),
  ('pay_2', 'inv_0002', 'CARD', 7250.00, 'AUTH-889231',  now() - interval '1 day')
ON CONFLICT ("id") DO NOTHING;

-- ############################################################################
-- # 14. EXPENSES
-- ############################################################################

INSERT INTO "expenses" ("id", "category", "amount", "expense_date", "vendor", "note", "payment_method", "recorded_by_staff_id", "created_at") VALUES
  ('exp_1', 'RENT',             180000.00, date_trunc('month', now()),                'Property Owner',     'Monthly salon rent.',        'TRANSFER', 'stf_sana',  now()),
  ('exp_2', 'ELECTRICITY',       42000.00, date_trunc('month', now()) + interval '4 days','LESCO',          'Electricity bill.',          'TRANSFER', 'stf_sana',  now()),
  ('exp_3', 'PRODUCT_PURCHASE',  86000.00, now() - interval '12 days',                'Beauty Depot Lahore','Restocked hair care line.',  'CASH',     'stf_sana',  now()),
  ('exp_4', 'STAFF_SALARY',     337000.00, date_trunc('month', now()) + interval '1 day','Payroll',         'Monthly salaries.',          'TRANSFER', 'stf_sana',  now()),
  ('exp_5', 'REFRESHMENTS',       6500.00, now() - interval '3 days',                 'Local Cafe',         'Client refreshments.',       'CASH',     'stf_rabia', now()),
  ('exp_6', 'MARKETING',          25000.00, now() - interval '9 days',                'Meta Ads',           'Instagram promotion.',       'CARD',     'stf_sana',  now())
ON CONFLICT ("id") DO NOTHING;

-- ############################################################################
-- # 15. PRISMA MIGRATION BOOKKEEPING
-- #     Records 0001_init as applied, so a later `prisma migrate deploy` from
-- #     Vercel or your machine does not try to re-create these tables.
-- #     The checksum is the real SHA-256 of prisma/migrations/0001_init/migration.sql.
-- ############################################################################

CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                  VARCHAR(36)  PRIMARY KEY,
    "checksum"            VARCHAR(64)  NOT NULL,
    "finished_at"         TIMESTAMPTZ,
    "migration_name"      VARCHAR(255) NOT NULL,
    "logs"                TEXT,
    "rolled_back_at"      TIMESTAMPTZ,
    "started_at"          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER      NOT NULL DEFAULT 0
);

INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at", "finished_at", "applied_steps_count")
SELECT
  'a1b2c3d4-0001-4000-8000-000000000001',
  '5f33d62ddf1933623a4d02040736853b6d927979b80475f5ccc5d1155fe93533',
  '0001_init',
  now(), now(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '0001_init'
);

-- ############################################################################
-- # 16. LOCK DOWN THE PUBLIC API SURFACE
-- #
-- #     Supabase auto-exposes every table in `public` through PostREST to the
-- #     anon key. These tables hold password hashes and financials and are only
-- #     ever reached through Prisma over the direct Postgres connection, so
-- #     enable RLS with no policies and revoke the API roles. The table owner
-- #     (the `postgres` role your DATABASE_URL uses) bypasses RLS, so the app
-- #     is unaffected.
-- ############################################################################

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ############################################################################
-- # 17. VERIFY
-- ############################################################################

SELECT u.email, u.name, r.key AS role, r.landing_path, s.name AS staff_chair,
       length(u.password_hash) AS hash_len, u.active
FROM users u
JOIN user_roles r ON r.id = u.role_id
LEFT JOIN staff s ON s.id = u.staff_id
ORDER BY r.key;
