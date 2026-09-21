import { eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { requireApiUser } from "@/lib/auth/guard";

/** Global search — trigram-indexed ILIKE across the columns people actually type. */
export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const raw = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (raw.length < 2) return Response.json({ contacts: [], companies: [] });

  const term = `%${raw.replace(/[%_]/g, (m) => `\\${m}`)}%`;

  const [contactRows, companyRows] = await Promise.all([
    db
      .select({
        id: contacts.id,
        name: contacts.fullName,
        jobTitle: contacts.jobTitle,
        email: contacts.email,
        company: companies.name,
      })
      .from(contacts)
      .innerJoin(companies, eq(contacts.companyId, companies.id))
      .where(
        or(
          ilike(contacts.fullName, term),
          ilike(contacts.email, term),
          ilike(contacts.phone, term),
          ilike(contacts.linkedinUrl, term),
          ilike(contacts.jobTitle, term),
        ),
      )
      .orderBy(sql`length(${contacts.fullName})`)
      .limit(6),
    db
      .select({
        id: companies.id,
        name: companies.name,
        domain: companies.domain,
        industry: companies.industry,
      })
      .from(companies)
      .where(
        or(
          ilike(companies.name, term),
          ilike(companies.domain, term),
          ilike(companies.website, term),
          ilike(companies.phone, term),
        ),
      )
      .orderBy(sql`length(${companies.name})`)
      .limit(6),
  ]);

  return Response.json({
    contacts: contactRows.map((c) => ({ ...c, name: c.name ?? "" })),
    companies: companyRows,
  });
}
