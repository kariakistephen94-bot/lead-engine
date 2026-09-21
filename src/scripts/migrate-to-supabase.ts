/**
 * Copy the whole database into Supabase. `npm run db:transfer`
 *
 *   npm run db:transfer -- --dry-run          # plan only, writes nothing
 *   npm run db:transfer -- --truncate         # clear target tables first
 *   npm run db:transfer                       # append, skipping rows already there
 *
 * Source is `DATABASE_URL`, target is `SUPABASE_DATABASE_URL` — both read from
 * `.env.local`, so the transfer runs before `DATABASE_URL` is repointed and can
 * be re-run afterwards without editing anything.
 *
 * Table order is computed from the live foreign keys rather than hard-coded: a
 * fixed list silently rots the first time a column is added, and inserting a
 * child before its parent fails in a way that is tedious to unpick halfway
 * through 25,000 rows.
 */
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const BATCH = 500;

/** Tables that belong to tooling rather than the product. */
const SKIP = new Set(["__drizzle_migrations"]);

function makePool(connectionString: string) {
  return new Pool({
    connectionString,
    max: 4,
    ssl:
      connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
        ? undefined
        : { rejectUnauthorized: false },
  });
}

/** Every base table in `public`, minus tooling. */
async function listTables(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  return rows.map((r) => r.table_name).filter((t) => !SKIP.has(t));
}

/**
 * Columns that can actually be written.
 *
 * Generated columns are excluded: `contacts.full_name` is computed from the
 * name parts, and Postgres rejects any insert that names it at all — including
 * one that supplies the value it would have produced itself.
 */
async function insertableColumns(pool: Pool, table: string): Promise<string[]> {
  const { rows } = await pool.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1
        and is_generated = 'NEVER' and identity_generation is null
      order by ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name);
}

/**
 * Order tables so a row's parents are always inserted first.
 *
 * Self-references are ignored — a table pointing at itself does not need to
 * come after itself, and treating it as a dependency would deadlock the sort.
 * Any true cycle between two tables is reported rather than silently dropped.
 */
async function topoSort(pool: Pool, tables: string[]): Promise<string[]> {
  /*
   * Read from `pg_constraint` rather than `information_schema`. The
   * information_schema views only show constraints on tables the connecting
   * role has privileges for, and list a multi-column foreign key once per
   * column — either of which quietly yields an order that inserts a child
   * before its parent.
   */
  const { rows } = await pool.query<{ child: string; parent: string }>(
    `select con.conrelid::regclass::text as child,
            con.confrelid::regclass::text as parent
       from pg_constraint con
       join pg_namespace ns on ns.oid = con.connamespace
      where con.contype = 'f' and ns.nspname = 'public'`,
  );

  const set = new Set(tables);
  const parents = new Map<string, Set<string>>(tables.map((t) => [t, new Set()]));
  for (const { child, parent } of rows) {
    if (child === parent || !set.has(child) || !set.has(parent)) continue;
    parents.get(child)!.add(parent);
  }

  const ordered: string[] = [];
  const done = new Set<string>();
  while (ordered.length < tables.length) {
    const ready = tables.filter(
      (t) => !done.has(t) && [...parents.get(t)!].every((p) => done.has(p)),
    );
    if (ready.length === 0) {
      const stuck = tables.filter((t) => !done.has(t));
      throw new Error(`Circular foreign keys between: ${stuck.join(", ")}`);
    }
    for (const t of ready) {
      ordered.push(t);
      done.add(t);
    }
  }
  return ordered;
}

async function main() {
  const sourceUrl = arg("source") ?? process.env.DATABASE_URL;
  const targetUrl = arg("target") ?? process.env.SUPABASE_DATABASE_URL;
  const dryRun = flag("dry-run");
  const truncate = flag("truncate");

  if (!sourceUrl) throw new Error("No source: set DATABASE_URL or pass --source=");
  if (!targetUrl) {
    throw new Error(
      "No target: set SUPABASE_DATABASE_URL in .env.local, or pass --target=\n" +
        "  Supabase dashboard -> Connect -> Session pooler -> URI",
    );
  }
  if (sourceUrl === targetUrl) throw new Error("Source and target are the same database.");

  const source = makePool(sourceUrl);
  const target = makePool(targetUrl);

  const tables = await listTables(source);
  const order = await topoSort(source, tables);

  console.log(`\nTransferring ${order.length} tables\n  ${order.join(" -> ")}\n`);

  if (truncate && !dryRun) {
    // One statement so it is a single transaction, and CASCADE because the
    // tables reference each other; truncating them one at a time would fail.
    console.log("Clearing target tables…");
    await target.query(`truncate table ${order.map((t) => `"${t}"`).join(", ")} cascade`);
  }

  let grandTotal = 0;

  for (const table of order) {
    const columns = await insertableColumns(source, table);
    const { rows: countRows } = await source.query<{ n: string }>(`select count(*)::text as n from "${table}"`);
    const total = Number(countRows[0].n);

    if (total === 0) {
      console.log(`  ${table.padEnd(22)} empty`);
      continue;
    }
    if (dryRun) {
      console.log(`  ${table.padEnd(22)} ${String(total).padStart(6)} rows (dry run)`);
      grandTotal += total;
      continue;
    }

    const quoted = columns.map((c) => `"${c}"`).join(", ");
    let copied = 0;

    for (let offset = 0; offset < total; offset += BATCH) {
      // Ordered by ctid so paging is stable — without an ORDER BY, Postgres may
      // return the same row on two pages and miss another entirely.
      const { rows } = await source.query(
        `select ${quoted} from "${table}" order by ctid limit ${BATCH} offset ${offset}`,
      );
      if (rows.length === 0) break;

      const values: unknown[] = [];
      const tuples = rows.map((row, r) => {
        const placeholders = columns.map((c, i) => {
          values.push((row as Record<string, unknown>)[c]);
          return `$${r * columns.length + i + 1}`;
        });
        return `(${placeholders.join(", ")})`;
      });

      // Idempotent: re-running after an interrupted transfer tops up the
      // target instead of erroring on every row that already arrived.
      await target.query(
        `insert into "${table}" (${quoted}) values ${tuples.join(", ")} on conflict do nothing`,
        values,
      );
      copied += rows.length;
      process.stdout.write(`\r  ${table.padEnd(22)} ${String(copied).padStart(6)}/${total}`);
    }

    console.log(`\r  ${table.padEnd(22)} ${String(copied).padStart(6)}/${total} ✓`);
    grandTotal += copied;
  }

  console.log(`\n${dryRun ? "Would transfer" : "Transferred"} ${grandTotal} rows.`);

  if (!dryRun) {
    console.log("\nVerifying row counts against the source…");
    let mismatch = 0;
    for (const table of order) {
      const [{ rows: a }, { rows: b }] = await Promise.all([
        source.query<{ n: string }>(`select count(*)::text as n from "${table}"`),
        target.query<{ n: string }>(`select count(*)::text as n from "${table}"`),
      ]);
      if (a[0].n !== b[0].n) {
        console.log(`  ! ${table}: source ${a[0].n}, target ${b[0].n}`);
        mismatch++;
      }
    }
    console.log(mismatch === 0 ? "  every table matches." : `  ${mismatch} table(s) differ.`);
  }

  await source.end();
  await target.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
