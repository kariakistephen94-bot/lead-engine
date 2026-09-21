import { sql } from "drizzle-orm";

import { db } from "@/db";

/** Liveness + database reachability, used by the dev harness and deploys. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, database: "up" });
  } catch (error) {
    return Response.json(
      { ok: false, database: "down", error: (error as Error).message },
      { status: 503 },
    );
  }
}
