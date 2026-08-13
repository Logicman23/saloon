/**
 * Seeds the RBAC tables from the app's permission catalogue.
 *
 *   npx tsx prisma/seed-rbac.ts
 *
 * Idempotent — safe to re-run after adding a permission to
 * `src/lib/auth/permissions.ts`. New keys are inserted and granted to ADMIN;
 * existing grants are left alone so hand-tuned roles survive.
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes, pbkdf2Sync, createHash } from "node:crypto";
import {
  PERMISSIONS,
  ROLES,
  ROLE_META,
  ROLE_PERMISSIONS,
  type Permission,
} from "../src/lib/auth/permissions";

const prisma = new PrismaClient();

/** Human-readable grouping + label derived from the dotted key. */
function describe(key: Permission) {
  const [group, ...rest] = key.split(".");
  const category = group.charAt(0).toUpperCase() + group.slice(1);
  const label = `${category}: ${rest.join(" ").replace(/\b\w/g, (c) => c.toUpperCase())}`;
  return { category, label };
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 210_000, 64, "sha512").toString("hex");
  return { salt, hash };
}

async function main() {
  /* ------------------------------------------------------- Permissions */

  for (const key of PERMISSIONS) {
    const { category, label } = describe(key);
    await prisma.permission.upsert({
      where: { key },
      update: { label, category },
      create: { key, label, category },
    });
  }
  console.log(`✔ ${PERMISSIONS.length} permissions`);

  /* ------------------------------------------------------------- Roles */

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

    for (const permissionKey of ROLE_PERMISSIONS[roleKey]) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionKey: { roleId: role.id, permissionKey } },
        update: {},
        create: { roleId: role.id, permissionKey },
      });
    }
    console.log(`✔ role ${roleKey} — ${ROLE_PERMISSIONS[roleKey].length} grants`);
  }

  /* ------------------------------------------------------- Owner login */

  const adminRole = await prisma.userRole.findUniqueOrThrow({ where: { key: "ADMIN" } });

  // Set OWNER_EMAIL / OWNER_PASSWORD before running in any shared
  // environment. The fallback exists so a local `db:seed` just works.
  const email = process.env.OWNER_EMAIL ?? "owner@sanasbeauty.pk";
  const password = process.env.OWNER_PASSWORD ?? randomBytes(12).toString("base64url");
  const { salt, hash } = hashPassword(password);

  const pin = process.env.ADMIN_OVERRIDE_PIN;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`• owner ${email} already exists — password left unchanged`);
  } else {
    await prisma.user.create({
      data: {
        email,
        name: "Sana Malik",
        passwordHash: hash,
        passwordSalt: salt,
        overridePinHash: pin ? createHash("sha256").update(pin).digest("hex") : null,
        roleId: adminRole.id,
      },
    });
    console.log(`✔ owner account ${email}`);
    if (!process.env.OWNER_PASSWORD) {
      console.log(`  generated password: ${password}`);
      console.log("  ^ store this now; it is not recoverable.");
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
