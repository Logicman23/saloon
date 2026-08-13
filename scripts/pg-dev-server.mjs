/**
 * Serves an in-process Postgres over TCP for local testing.
 *
 *   node scripts/pg-dev-server.mjs [port]
 *
 * Exposes PGlite (real Postgres, compiled to WASM) on the wire protocol, so
 * Prisma, `prisma migrate deploy` and the running app all connect to it as if
 * it were a normal database — no Docker or installed server required.
 *
 * Data lives in ./.pgdata so it survives restarts. Intended for local
 * development and CI only; use Supabase or a managed Postgres in production.
 */

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.argv[2] ?? 5432);

const db = await PGlite.create({ dataDir: "./.pgdata" });
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1" });

await server.start();
console.log(`postgres listening on 127.0.0.1:${port}`);
console.log(`DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${port}/postgres"`);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
