import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and set it " +
      "(local dev: postgresql://localhost:5432/ai_lead_engine).",
  );
}

/**
 * Reuse the pool across HMR reloads in dev, otherwise every edit leaks a pool
 * and Postgres runs out of connections within a few minutes.
 */
const globalForDb = globalThis as unknown as { __leadEnginePool?: Pool };

export const pool =
  globalForDb.__leadEnginePool ??
  new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    // Supabase and most hosted Postgres require TLS; local dev does not.
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? undefined
      : { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") globalForDb.__leadEnginePool = pool;

export const db = drizzle(pool, { schema, casing: "snake_case" });

export { schema };
