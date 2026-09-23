import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { XLeadsView } from "@/components/x/XLeadsView";
import type { XLeadStatus } from "@/db/schema";
import {
  getXStats, getXStatus, listRecentXPosts, listXAuthors, listXSearches,
} from "@/lib/services/x-leads";
import { listNichesSimple } from "@/lib/services/niches";

export const metadata = { title: "X Leads" };
export const dynamic = "force-dynamic";

const STATUSES: XLeadStatus[] = ["new", "qualified", "converted", "dismissed"];

export default async function XLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const page = Math.max(1, Number(p.page ?? 1) || 1);
  const pageSize = Math.min(Math.max(Number(p.pageSize ?? 50) || 50, 10), 200);
  // Default view is the review queue; "all" shows every status.
  const status = p.status === "all" ? undefined
    : STATUSES.includes(p.status as XLeadStatus) ? (p.status as XLeadStatus) : "qualified";

  const [status_, stats, searches, authors, posts, niches] = await Promise.all([
    getXStatus(),
    getXStats(),
    listXSearches(),
    listXAuthors({
      status,
      minScore: p.minScore ? Number(p.minScore) : undefined,
      intent: p.intent || undefined,
      nicheId: p.niche || undefined,
      q: p.q?.trim() || undefined,
      page, pageSize,
    }),
    listRecentXPosts(150),
    listNichesSimple(),
  ]);

  return (
    <>
      <PageHeader
        title="X Leads"
        description="Saved searches run on X's official API on a schedule. Every post is scored against your business, and people who are asking for what you sell become leads."
      />
      <PageBody>
        <XLeadsView
          status={JSON.parse(JSON.stringify(status_))}
          stats={stats}
          searches={JSON.parse(JSON.stringify(searches))}
          authors={JSON.parse(JSON.stringify(authors.rows))}
          authorTotal={authors.total}
          page={page}
          pageSize={pageSize}
          posts={JSON.parse(JSON.stringify(posts))}
          niches={niches.filter((n) => !n.archived).map((n) => ({ id: n.id, name: n.name }))}
        />
      </PageBody>
    </>
  );
}
