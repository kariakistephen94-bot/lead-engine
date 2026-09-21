import { eq, inArray, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { companies, contacts, leadSources, niches, users } from "@/db/schema";
import { requireApiUser } from "@/lib/auth/guard";
import { MAX_EXPORT_ROWS } from "@/lib/constants";
import { toCsvRow } from "@/lib/csv";
import { buildLeadWhere } from "@/lib/services/leads";
import { parseLeadQuery } from "@/lib/validation";

const HEADERS = [
  "Company","Website","Domain","Industry","Niche","Location","City","Country",
  "Employees","Revenue","First name","Last name","Job title","Email","Phone",
  "LinkedIn","Status","Lead score","Source","Source URL","Owner",
  "Last contacted","Next follow-up","Created",
];

const BATCH = 1000;

/**
 * Streams the current filter selection as CSV.
 *
 * Rows are fetched in batches and pushed into the response as they arrive, so
 * exporting 50k leads never materialises 50k rows in memory at once.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const query = parseLeadQuery(params);

  // An explicit id list (from a manual selection) overrides the filters.
  const explicitIds = (params.get("ids") ?? "").split(",").filter(Boolean);
  const filterWhere = buildLeadWhere(query);
  const where: SQL | undefined = explicitIds.length
    ? inArray(contacts.id, explicitIds)
    : filterWhere;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`${toCsvRow(HEADERS)}\n`));

      let offset = 0;
      try {
        for (;;) {
          const rows = await db
            .select({
              companyName: companies.name,
              website: companies.website,
              domain: companies.domain,
              industry: companies.industry,
              niche: niches.name,
              location: companies.location,
              city: companies.city,
              country: companies.country,
              employeeCount: companies.employeeCount,
              revenue: companies.revenue,
              firstName: contacts.firstName,
              lastName: contacts.lastName,
              jobTitle: contacts.jobTitle,
              email: contacts.email,
              phone: contacts.phone,
              linkedinUrl: contacts.linkedinUrl,
              status: contacts.status,
              leadScore: contacts.leadScore,
              source: leadSources.name,
              sourceUrl: contacts.sourceUrl,
              owner: users.name,
              lastContactedAt: contacts.lastContactedAt,
              nextFollowUpAt: contacts.nextFollowUpAt,
              createdAt: contacts.createdAt,
            })
            .from(contacts)
            .innerJoin(companies, eq(contacts.companyId, companies.id))
            .leftJoin(niches, eq(companies.nicheId, niches.id))
            .leftJoin(leadSources, eq(contacts.sourceId, leadSources.id))
            .leftJoin(users, eq(contacts.ownerId, users.id))
            .where(where)
            .orderBy(contacts.createdAt)
            .limit(BATCH)
            .offset(offset);

          if (!rows.length) break;

          const chunk = rows.map((r) => toCsvRow(Object.values(r))).join("\n");
          controller.enqueue(encoder.encode(`${chunk}\n`));

          offset += rows.length;
          if (rows.length < BATCH || offset >= MAX_EXPORT_ROWS) break;
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`\n# export failed: ${(error as Error).message}\n`));
      }

      controller.close();
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
