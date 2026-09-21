import { eq } from "drizzle-orm";

import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { ProfileSettings } from "@/components/settings/SettingsView";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import { requireUser } from "@/lib/auth/guard";
import { getEmailProvider, getEnrichmentProvider, getLeadProvider, isLiveProvider } from "@/lib/integrations";
import { getLookups } from "@/lib/services/lookups";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireUser();

  const [[user], lookups] = await Promise.all([
    db
      .select({ name: users.name, email: users.email, dailyTarget: users.dailyTarget })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1),
    getLookups(),
  ]);

  const ai = getAIProvider();
  const leads = getLeadProvider();
  const enrichment = getEnrichmentProvider();
  const email = getEmailProvider();

  const providers = [
    {
      label: "AI research & scoring",
      name: ai.name,
      detail: ai.model,
      live: ai.name !== "mock",
      env: "AI_PROVIDER / ANTHROPIC_API_KEY",
    },
    {
      label: "Lead sourcing",
      name: leads.name,
      detail: `attributed to "${leads.sourceSlug}"`,
      live: isLiveProvider(leads),
      env: "LEAD_PROVIDER / APOLLO_API_KEY",
    },
    {
      label: "Enrichment",
      name: enrichment.name,
      detail: "fills missing company fields",
      live: isLiveProvider(enrichment),
      env: "ENRICHMENT_PROVIDER",
    },
    {
      label: "Email sending",
      name: email.name,
      detail: "outbound delivery",
      live: isLiveProvider(email),
      env: "EMAIL_PROVIDER",
    },
  ];

  return (
    <>
      <PageHeader title="Settings" description="Workspace configuration and integration status." />

      <PageBody className="max-w-4xl space-y-4">
        <ProfileSettings
          name={user?.name ?? session.name}
          email={user?.email ?? session.email}
          dailyTarget={user?.dailyTarget ?? 100}
        />

        <Card padded={false}>
          <div className="p-4">
            <CardHeader
              title="Integrations"
              description="Every provider is behind an interface. Adding credentials switches the adapter — no code changes."
            />
          </div>
          <ul className="border-t border-line">
            {providers.map((provider) => (
              <li
                key={provider.label}
                className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0"
              >
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-medium text-ink">{provider.label}</p>
                  <p className="text-xs text-ink-soft">
                    <span className="font-mono">{provider.name}</span> · {provider.detail}
                  </p>
                </div>
                <code className="rounded bg-muted px-2 py-0.5 text-[11px] text-ink-soft">
                  {provider.env}
                </code>
                <Badge tone={provider.live ? "green" : "amber"} dot>
                  {provider.live ? "Live" : "Offline adapter"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Reference data"
            description="Sources, tags and niches available across the workspace."
          />
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] tracking-wide text-ink-faint uppercase">
                Lead sources ({formatNumber(lookups.sources.length)})
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {lookups.sources.map((source) => (
                  <li key={source.id} className="text-xs text-ink-soft">
                    {source.name}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] tracking-wide text-ink-faint uppercase">
                Tags ({formatNumber(lookups.tags.length)})
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {lookups.tags.map((tag) => (
                  <li key={tag.id} className="flex items-center gap-1.5 text-xs text-ink-soft">
                    <span className="h-2 w-2 rounded-full" style={{ background: tag.color }} />
                    {tag.name}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] tracking-wide text-ink-faint uppercase">
                Niches ({formatNumber(lookups.niches.length)})
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {lookups.niches.map((niche) => (
                  <li key={niche.id} className="flex items-center gap-1.5 text-xs text-ink-soft">
                    <span className="h-2 w-2 rounded-full" style={{ background: niche.color }} />
                    {niche.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
