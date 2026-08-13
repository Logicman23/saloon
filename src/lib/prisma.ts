/**
 * Convenience alias.
 *
 * The singleton itself lives in `src/lib/db/client.ts` alongside the query and
 * metrics layers; this re-export exists so the conventional
 * `import { prisma } from "@/lib/prisma"` also resolves. There is deliberately
 * only ONE PrismaClient instance behind both paths — a second `new
 * PrismaClient()` would defeat the pooling this file exists to protect.
 */
export { prisma, Prisma, toNumber, isDatabaseConfigured } from "@/lib/db/client";
export { prisma as default } from "@/lib/db/client";
