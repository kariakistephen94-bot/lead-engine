/**
 * Migration runner. `npm run db:migrate`
 *
 * Uses a dedicated single connection rather than the app pool so it can be run
 * from CI or a release step without importing the Next.js server bundle.
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

config({ path: ".env.local" });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({
    connectionString,
    max: 1,
    ssl:
      connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
        ? undefined
        : { rejectUnauthorized: false },
  });

  console.log("Running migrations…");
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  await pool.end();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
