import "server-only";

import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { contacts, contactTags, deals, followUps, notes, tags, users } from "@/db/schema";

/** Everything the lead detail page needs beyond the lead row itself. */
export async function getLeadContext(contactId: string, companyId: string) {
  const [noteRows, followUpRows, tagRows, dealRows, siblingContacts] = await Promise.all([
    db
      .select({
        id: notes.id,
        body: notes.body,
        createdAt: notes.createdAt,
        author: users.name,
      })
      .from(notes)
      .leftJoin(users, eq(notes.userId, users.id))
      .where(eq(notes.contactId, contactId))
      .orderBy(desc(notes.createdAt)),

    db
      .select({
        id: followUps.id,
        dueAt: followUps.dueAt,
        type: followUps.type,
        priority: followUps.priority,
        notes: followUps.notes,
        completedAt: followUps.completedAt,
      })
      .from(followUps)
      .where(eq(followUps.contactId, contactId))
      .orderBy(asc(followUps.completedAt), asc(followUps.dueAt)),

    db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(contactTags)
      .innerJoin(tags, eq(contactTags.tagId, tags.id))
      .where(eq(contactTags.contactId, contactId))
      .orderBy(asc(tags.name)),

    db
      .select({
        id: deals.id,
        name: deals.name,
        value: deals.value,
        currency: deals.currency,
        stage: deals.stage,
        probability: deals.probability,
        expectedCloseDate: deals.expectedCloseDate,
      })
      .from(deals)
      .where(eq(deals.companyId, companyId))
      .orderBy(desc(deals.createdAt)),

    // Other people at the same company — one company, many contacts.
    db
      .select({
        id: contacts.id,
        fullName: contacts.fullName,
        jobTitle: contacts.jobTitle,
        email: contacts.email,
        status: contacts.status,
      })
      .from(contacts)
      .where(eq(contacts.companyId, companyId))
      .orderBy(asc(contacts.createdAt)),
  ]);

  return {
    notes: noteRows,
    followUps: followUpRows,
    tags: tagRows,
    deals: dealRows,
    siblingContacts: siblingContacts.filter((c) => c.id !== contactId),
  };
}

export type LeadContext = Awaited<ReturnType<typeof getLeadContext>>;
