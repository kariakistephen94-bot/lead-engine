/**
 * Seed script. `npm run db:seed [--demo] [--clear-demo]`
 *
 * Without flags it only seeds *reference* data that the app needs to work:
 * the owner account, lead sources, tags and the five starting niches.
 *
 * `--demo` additionally inserts a clearly-marked sample dataset. Every demo
 * company carries `research_method = 'seed-demo'` so it can be identified and
 * removed with `--clear-demo`. No demo data is ever presented as real.
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";

import { hashPassword } from "../lib/auth/password";
import { DEFAULT_TAGS, SYSTEM_SOURCES } from "../lib/constants";
import { fictionalPhone } from "../lib/fixtures/phone";
import * as schema from "./schema";

config({ path: ".env.local" });

const DEMO_MARKER = "seed-demo";

const STARTER_NICHES = [
  {
    name: "Marketing Agencies",
    slug: "marketing-agencies",
    color: "#2563eb",
    description: "Full-service and performance marketing agencies running client campaigns.",
    targetMarket: "US & UK agencies with 10–50 staff billing retainers",
    targetLocations: ["United States", "United Kingdom", "Canada"],
    idealCompanySize: "10-50",
    targetJobTitles: ["Founder", "CEO", "Head of Operations", "Account Director"],
    painPoints: "Manual reporting, slow client onboarding, lead follow-up falling through cracks.",
    offer: "Automated client reporting + lead qualification and follow-up workflows.",
  },
  {
    name: "Real Estate Agencies",
    slug: "real-estate-agencies",
    color: "#0891b2",
    description: "Residential and commercial brokerages with active agent teams.",
    targetMarket: "Brokerages with 5–100 agents and high inbound enquiry volume",
    targetLocations: ["United States", "United Arab Emirates", "Spain"],
    idealCompanySize: "5-100",
    targetJobTitles: ["Broker Owner", "Managing Director", "Head of Sales"],
    painPoints: "Inbound enquiries answered late, no consistent nurture, listings admin overhead.",
    offer: "Instant lead response + viewing scheduling + nurture sequences.",
  },
  {
    name: "Dental Practices",
    slug: "dental-practices",
    color: "#7c3aed",
    description: "Private dental clinics and multi-site dental groups.",
    targetMarket: "Private practices with 2+ chairs and paid patient acquisition",
    targetLocations: ["United Kingdom", "United States", "Australia"],
    idealCompanySize: "5-40",
    targetJobTitles: ["Practice Owner", "Practice Manager", "Principal Dentist"],
    painPoints: "No-shows, reception overloaded with calls, treatment plans not followed up.",
    offer: "Automated recall, reminders and treatment plan follow-up.",
  },
  {
    name: "Recruiting Agencies",
    slug: "recruiting-agencies",
    color: "#16a34a",
    description: "Staffing and executive search firms placing candidates at volume.",
    targetMarket: "Agencies with 5–60 recruiters working multiple live roles",
    targetLocations: ["United States", "United Kingdom", "Germany"],
    idealCompanySize: "5-60",
    targetJobTitles: ["Founder", "Managing Director", "Head of Talent"],
    painPoints: "CV screening time, candidate ghosting, slow client submittals.",
    offer: "Automated candidate screening, scheduling and client update workflows.",
  },
  {
    name: "Home Service Businesses",
    slug: "home-service-businesses",
    color: "#ea580c",
    description: "HVAC, plumbing, roofing, landscaping and similar field-service operators.",
    targetMarket: "Operators with 5–80 field staff and phone-driven booking",
    targetLocations: ["United States", "Canada"],
    idealCompanySize: "5-80",
    targetJobTitles: ["Owner", "General Manager", "Operations Manager"],
    painPoints: "Missed calls become lost jobs, manual quoting, no follow-up on estimates.",
    offer: "Missed-call capture, automated quoting and estimate follow-up.",
  },
];

/* ------------------------------ demo dataset ------------------------------ */

/** Deterministic PRNG so repeated demo seeds produce the same dataset. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const DEMO_COMPANY_PARTS: Record<string, { prefixes: string[]; suffixes: string[]; industry: string }> = {
  "marketing-agencies": {
    prefixes: ["Northline", "Bright", "Kestrel", "Vantage", "Loop", "Harbor", "Signal", "Ampersand"],
    suffixes: ["Media", "Marketing", "Digital", "Collective", "Studio", "Growth"],
    industry: "Marketing & Advertising",
  },
  "real-estate-agencies": {
    prefixes: ["Cedar", "Summit", "Coastline", "Ironwood", "Meridian", "Blackstone", "Aurora"],
    suffixes: ["Realty", "Properties", "Estates", "Property Group", "Homes"],
    industry: "Real Estate",
  },
  "dental-practices": {
    prefixes: ["Riverside", "Elmwood", "Clearview", "Parkside", "Whitfield", "Bayside"],
    suffixes: ["Dental", "Dental Care", "Orthodontics", "Dental Studio", "Smile Clinic"],
    industry: "Healthcare / Dental",
  },
  "recruiting-agencies": {
    prefixes: ["Talentbridge", "Kingsford", "Apex", "Redwood", "Sterling", "Northgate"],
    suffixes: ["Recruitment", "Search", "Talent", "Staffing", "Partners"],
    industry: "Staffing & Recruiting",
  },
  "home-service-businesses": {
    prefixes: ["Allstate", "Prime", "Trueline", "Homestead", "Rapid", "Copperfield"],
    suffixes: ["Plumbing", "HVAC", "Roofing", "Home Services", "Electric"],
    industry: "Construction & Home Services",
  },
};

const FIRST_NAMES = ["James","Maria","Daniel","Aisha","Tom","Priya","Lucas","Chen","Sofia","Noah","Amara","Ethan","Grace","Omar","Hannah","Leo","Nadia","Marcus","Elena","Kwame"];
const LAST_NAMES = ["Whitfield","Okafor","Reyes","Nakamura","Bergman","Sharma","Kowalski","Dubois","Ferrari","Andersen","Mensah","O'Connor","Silva","Haddad","Novak","Lindqvist","Ibrahim","Petrov","Costa","Fischer"];
const TITLES = ["Founder","CEO","Managing Director","Head of Operations","Operations Manager","Head of Sales","Practice Manager","General Manager","Marketing Director","Owner"];
const CITIES: [string, string][] = [["Austin","United States"],["Chicago","United States"],["Denver","United States"],["London","United Kingdom"],["Manchester","United Kingdom"],["Toronto","Canada"],["Sydney","Australia"],["Berlin","Germany"],["Madrid","Spain"],["Dubai","United Arab Emirates"]];
const STATUSES = ["new","new","new","researched","researched","qualified","ready_to_contact","contacted","contacted","follow_up","replied","positive_reply","meeting_booked","proposal_sent","negotiation","won","lost","not_interested"] as const;
const SOURCE_SLUGS = ["apollo","apollo","manual-research","google-maps","linkedin","ai-research","csv-import","referral","website-research"];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool, { schema });

  const wantsDemo = process.argv.includes("--demo");
  const clearDemo = process.argv.includes("--clear-demo");

  if (clearDemo) {
    // Deals reference companies with ON DELETE SET NULL — which is right for
    // real data (deleting a company must not erase revenue history) but would
    // leave demo deals behind as orphans that still count in analytics. So
    // remove the demo deals explicitly, before the companies disappear.
    const deals = await db.execute(
      sql`delete from deals
          where company_id in (select id from companies where research_method = ${DEMO_MARKER})`,
    );
    const companiesRemoved = await db.execute(
      sql`delete from companies where research_method = ${DEMO_MARKER}`,
    );
    console.log(
      `Removed ${companiesRemoved.rowCount ?? 0} demo companies (with their contacts) and ${deals.rowCount ?? 0} demo deals.`,
    );
    await pool.end();
    return;
  }

  /* ---------------------------- reference data ---------------------------- */

  const email = (process.env.SEED_USER_EMAIL ?? "owner@leadengine.local").toLowerCase();
  const password = process.env.SEED_USER_PASSWORD ?? "leadengine123";

  const [existingUser] = await db
    .select()
    .from(schema.users)
    .where(eq(sql`lower(${schema.users.email})`, email))
    .limit(1);

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    console.log(`User ${email} already exists — left untouched.`);
  } else {
    const [created] = await db
      .insert(schema.users)
      .values({
        email,
        name: process.env.SEED_USER_NAME ?? "Owner",
        passwordHash: await hashPassword(password),
        role: "owner",
      })
      .returning({ id: schema.users.id });
    userId = created.id;
    console.log(`Created owner account: ${email} / ${password}`);
  }

  await db
    .insert(schema.leadSources)
    .values(SYSTEM_SOURCES.map((s) => ({ ...s, isSystem: true })))
    .onConflictDoNothing();

  await db.insert(schema.tags).values(DEFAULT_TAGS).onConflictDoNothing();

  await db
    .insert(schema.niches)
    .values(STARTER_NICHES)
    .onConflictDoNothing();

  console.log(
    `Reference data ready: ${SYSTEM_SOURCES.length} sources, ${DEFAULT_TAGS.length} tags, ${STARTER_NICHES.length} niches.`,
  );

  if (!wantsDemo) {
    console.log("Done. Re-run with --demo to add a sample dataset.");
    await pool.end();
    return;
  }

  /* ------------------------------- demo data ------------------------------ */

  const nicheRows = await db.select().from(schema.niches);
  const sourceRows = await db.select().from(schema.leadSources);
  const tagRows = await db.select().from(schema.tags);
  const sourceBySlug = new Map(sourceRows.map((s) => [s.slug, s.id]));

  const random = makeRandom(20260820);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)];

  const existingDemo = await db.execute<{ count: string }>(
    sql`select count(*)::text as count from companies where research_method = ${DEMO_MARKER}`,
  );
  if (Number(existingDemo.rows[0]?.count ?? 0) > 0) {
    console.log("Demo data already present — run with --clear-demo first to reseed.");
    await pool.end();
    return;
  }

  let companyCount = 0;
  let contactCount = 0;

  for (const niche of nicheRows) {
    const parts = DEMO_COMPANY_PARTS[niche.slug];
    if (!parts) continue;

    const used = new Set<string>();
    for (let i = 0; i < 26; i++) {
      const name = `${pick(parts.prefixes)} ${pick(parts.suffixes)}`;
      if (used.has(name)) continue;
      used.add(name);

      const domain = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`;
      const [city, country] = pick(CITIES);
      const sourceId = sourceBySlug.get(pick(SOURCE_SLUGS)) ?? null;
      const createdAt = new Date(Date.now() - Math.floor(random() * 60) * 86_400_000);

      const [company] = await db
        .insert(schema.companies)
        .values({
          name,
          website: `https://${domain}`,
          domain,
          industry: parts.industry,
          nicheId: niche.id,
          location: `${city}, ${country}`,
          city,
          country,
          employeeCount: 5 + Math.floor(random() * 80),
          revenue: String((500_000 + Math.floor(random() * 40) * 250_000).toFixed(2)),
          description: `${name} is a ${parts.industry.toLowerCase()} business serving clients in ${city}.`,
          linkedinUrl: `https://www.linkedin.com/company/${domain.replace(".com", "")}`,
          phone: fictionalPhone(country, random),
          sourceId,
          sourceUrl: `https://${domain}`,
          sourcedAt: createdAt,
          researchMethod: DEMO_MARKER,
          ownerId: userId,
          createdAt,
        })
        .returning({ id: schema.companies.id });
      companyCount++;

      const contactsPerCompany = random() > 0.75 ? 2 : 1;
      for (let c = 0; c < contactsPerCompany; c++) {
        const firstName = pick(FIRST_NAMES);
        const lastName = pick(LAST_NAMES);
        const status = pick(STATUSES);
        const contacted = !["new", "researched", "qualified", "ready_to_contact"].includes(status);
        // Contact happens after creation but never in the future — a demo row
        // with a future "last contacted" would poison the today/trend metrics.
        const lastContactedAt = contacted
          ? new Date(
              Math.min(
                Date.now(),
                createdAt.getTime() + Math.floor(random() * 20) * 86_400_000,
              ),
            )
          : null;

        const [contact] = await db
          .insert(schema.contacts)
          .values({
            companyId: company.id,
            firstName,
            lastName,
            jobTitle: pick(TITLES),
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, "")}${c || ""}@${domain}`,
            phone: fictionalPhone(country, random),
            linkedinUrl: `https://www.linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase().replace(/[^a-z]/g, "")}-${Math.floor(random() * 9000) + 1000}`,
            status,
            leadScore: random() > 0.25 ? 35 + Math.floor(random() * 62) : null,
            sourceId,
            sourceUrl: `https://${domain}`,
            sourcedAt: createdAt,
            ownerId: userId,
            lastContactedAt,
            nextFollowUpAt:
              contacted && random() > 0.55
                ? new Date(Date.now() + Math.floor(random() * 14 - 4) * 86_400_000)
                : null,
            createdAt,
          })
          .returning({ id: schema.contacts.id });
        contactCount++;

        await db.insert(schema.activities).values({
          contactId: contact.id,
          companyId: company.id,
          type: "lead_created",
          subject: "Lead created (demo dataset)",
          occurredAt: createdAt,
          userId,
        });

        if (lastContactedAt) {
          await db.insert(schema.activities).values({
            contactId: contact.id,
            companyId: company.id,
            type: "email_sent",
            direction: "outbound",
            subject: "Initial outreach email sent",
            occurredAt: lastContactedAt,
            userId,
          });
        }

        if (random() > 0.7) {
          await db
            .insert(schema.contactTags)
            .values({ contactId: contact.id, tagId: pick(tagRows).id })
            .onConflictDoNothing();
        }

        if (random() > 0.8) {
          await db.insert(schema.followUps).values({
            contactId: contact.id,
            dueAt: new Date(Date.now() + Math.floor(random() * 10 - 3) * 86_400_000),
            type: pick(["email", "call", "linkedin"] as const),
            priority: pick(["low", "normal", "high"] as const),
            notes: "Demo follow-up",
            userId,
          });
        }

        if (["proposal_sent", "negotiation", "won", "lost"].includes(status)) {
          const won = status === "won";
          await db.insert(schema.deals).values({
            name: `${name} — automation retainer`,
            companyId: company.id,
            contactId: contact.id,
            value: String((2500 + Math.floor(random() * 12) * 1250).toFixed(2)),
            currency: "USD",
            stage: won ? "won" : status === "lost" ? "lost" : status === "negotiation" ? "negotiation" : "proposal",
            probability: won ? 100 : status === "lost" ? 0 : 60,
            nicheId: niche.id,
            sourceId,
            ownerId: userId,
            closedAt: won || status === "lost" ? new Date() : null,
            createdAt,
          });
        }
      }
    }
  }

  console.log(`Demo dataset inserted: ${companyCount} companies, ${contactCount} leads.`);
  console.log(`Remove it any time with: npm run db:seed -- --clear-demo`);
  await pool.end();
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
