import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Users,
} from "lucide-react";

import { PageBody } from "@/components/layout/PageHeader";
import { LeadActions } from "@/components/leads/detail/LeadActions";
import {
  FollowUpPanel,
  LogActivityPanel,
  NotesPanel,
  TagPanel,
} from "@/components/leads/detail/SidePanels";
import { Badge, ScorePill } from "@/components/ui/Badge";
import { Card, CardHeader, SectionTitle } from "@/components/ui/Card";
import { getLatestResearch } from "@/lib/ai/research";
import { DEAL_STAGE_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/constants";
import { listActivitiesForLead } from "@/lib/services/activities";
import { getLeadContext } from "@/lib/services/lead-detail";
import { getLead } from "@/lib/services/leads";
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPhone, formatRelative, toTitleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const lead = await getLead((await params).id);
  return { title: lead ? `${lead.fullName?.trim() || lead.companyName}` : "Lead" };
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const [context, activities, research] = await Promise.all([
    getLeadContext(lead.id, lead.companyId),
    listActivitiesForLead(lead.id, lead.companyId),
    getLatestResearch(lead.companyId),
  ]);

  const displayName = lead.fullName?.trim() || lead.email || "Unnamed contact";

  return (
    <>
      <div className="border-b border-line bg-surface px-4 py-3.5 sm:px-6">
        <Link
          href="/leads"
          className="mb-2 inline-flex items-center gap-1 text-xs text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" />
          All leads
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold text-ink">{displayName}</h1>
              <Badge tone={STATUS_TONE[lead.status]} dot>
                {STATUS_LABEL[lead.status]}
              </Badge>
              <ScorePill score={lead.leadScore} />
              {lead.archived && <Badge tone="slate">Archived</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-ink-soft">
              {[lead.jobTitle, lead.companyName].filter(Boolean).join(" at ")}
              {lead.nicheName && ` · ${lead.nicheName}`}
            </p>
          </div>

          <LeadActions
            leadId={lead.id}
            status={lead.status}
            archived={lead.archived}
            hasResearch={Boolean(research)}
          />
        </div>
      </div>

      <PageBody className="grid gap-4 lg:grid-cols-3">
        {/* Left: the record */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Company"
              action={
                <Link
                  href={`/companies/${lead.companyId}`}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Company page
                </Link>
              }
            />
            <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label="Name" value={lead.companyName} icon={<Building2 className="h-3 w-3" />} />
              <Detail
                label="Website"
                value={
                  lead.website ? (
                    <a
                      href={lead.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-brand hover:underline"
                    >
                      {lead.domain ?? lead.website}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null
                }
              />
              <Detail label="Industry" value={lead.industry} />
              <Detail
                label="Niche"
                value={
                  lead.nicheName ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: lead.nicheColor ?? "var(--color-ink-faint)" }}
                      />
                      {lead.nicheName}
                    </span>
                  ) : null
                }
              />
              <Detail label="Location" value={lead.location} icon={<MapPin className="h-3 w-3" />} />
              <Detail
                label="Employees"
                value={lead.employeeCount ? formatNumber(lead.employeeCount) : null}
                icon={<Users className="h-3 w-3" />}
              />
              <Detail label="Revenue" value={lead.revenue ? formatCurrency(lead.revenue) : null} />
              <Detail
                label="Company LinkedIn"
                value={
                  lead.companyLinkedin ? (
                    <a
                      href={lead.companyLinkedin}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-brand hover:underline"
                    >
                      View profile
                    </a>
                  ) : null
                }
              />
              <Detail label="Description" value={lead.companyDescription} className="sm:col-span-2" />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Contact" />
            <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label="Name" value={lead.fullName?.trim() || null} />
              <Detail label="Job title" value={lead.jobTitle} />
              <Detail
                label="Email"
                icon={<Mail className="h-3 w-3" />}
                value={
                  lead.email ? (
                    <a href={`mailto:${lead.email}`} className="text-brand hover:underline">
                      {lead.email}
                    </a>
                  ) : null
                }
              />
              <Detail
                label="Phone"
                icon={<Phone className="h-3 w-3" />}
                value={
                  lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="text-brand hover:underline">
                      {formatPhone(lead.phone)}
                    </a>
                  ) : null
                }
              />
              <Detail
                label="LinkedIn"
                icon={<Globe className="h-3 w-3" />}
                value={
                  lead.linkedinUrl ? (
                    <a
                      href={lead.linkedinUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-brand hover:underline"
                    >
                      View profile
                    </a>
                  ) : null
                }
              />
              <Detail label="Owner" value={lead.ownerName} />
              <Detail label="Last contacted" value={lead.lastContactedAt ? formatDate(lead.lastContactedAt) : null} />
              <Detail label="Next follow-up" value={lead.nextFollowUpAt ? formatDate(lead.nextFollowUpAt) : null} />
            </dl>

            {context.siblingContacts.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <SectionTitle>Other contacts at {lead.companyName}</SectionTitle>
                <ul className="mt-2 space-y-1">
                  {context.siblingContacts.map((sibling) => (
                    <li key={sibling.id}>
                      <Link
                        href={`/leads/${sibling.id}`}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted"
                      >
                        <span className="truncate text-ink">
                          {sibling.fullName?.trim() || sibling.email}
                          {sibling.jobTitle && (
                            <span className="text-ink-faint"> · {sibling.jobTitle}</span>
                          )}
                        </span>
                        <Badge tone={STATUS_TONE[sibling.status]}>{STATUS_LABEL[sibling.status]}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="AI research"
              description={
                research
                  ? `${research.provider} · ${research.model ?? "unknown model"} · ${formatRelative(research.createdAt)}`
                  : "Not researched yet."
              }
            />

            {!research ? (
              <div className="mt-3 rounded-md border border-dashed border-line-strong bg-canvas px-4 py-6 text-center">
                <Sparkles className="mx-auto mb-2 h-5 w-5 text-ink-faint" />
                <p className="text-sm font-medium text-ink">No research on file</p>
                <p className="mt-1 text-xs text-ink-soft">
                  Use <span className="font-medium">Research lead</span> above. The engine reads the
                  company website, combines it with the niche definition, and returns a scored
                  assessment.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-4">
                <div className="flex items-start gap-4 rounded-md border border-line bg-canvas p-3">
                  <div className="text-center">
                    <p className="tabular text-2xl font-semibold text-ink">{research.score ?? "—"}</p>
                    <p className="text-[11px] text-ink-faint">/ 100</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <SectionTitle>Why this score</SectionTitle>
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft">{research.scoreReason}</p>
                    {research.confidence && (
                      <p className="mt-1.5 text-[11px] text-ink-faint">
                        Confidence {(Number(research.confidence) * 100).toFixed(0)}%
                        {research.sourcesUsed?.length
                          ? ` · sources: ${research.sourcesUsed.join(", ")}`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <SectionTitle>Summary</SectionTitle>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{research.summary}</p>
                </div>

                {research.whatTheyDo && (
                  <div>
                    <SectionTitle>What they do</SectionTitle>
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft">{research.whatTheyDo}</p>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <BulletList title="Likely pain points" items={research.painPoints} />
                  <BulletList
                    title="Automation opportunities"
                    items={research.automationOpportunities}
                  />
                </div>

                {research.recommendedOffer && (
                  <div className="rounded-md border border-brand/20 bg-brand-soft p-3">
                    <SectionTitle>Recommended offer</SectionTitle>
                    <p className="mt-1 text-xs leading-relaxed text-brand-ink">
                      {research.recommendedOffer}
                    </p>
                  </div>
                )}

                <BulletList title="Personalization ideas" items={research.personalization} />
              </div>
            )}
          </Card>

          <Card padded={false}>
            <div className="p-4">
              <CardHeader title="Activity timeline" description="Append-only audit trail." />
            </div>
            {activities.length === 0 ? (
              <p className="px-4 pb-5 text-xs text-ink-faint">Nothing recorded yet.</p>
            ) : (
              <ol className="border-t border-line">
                {activities.map((activity) => (
                  <li key={activity.id} className="flex gap-3 border-b border-line px-4 py-2.5 last:border-0">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: activityColor(activity.type) }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-ink">
                        {activity.subject ?? toTitleCase(activity.type)}
                      </p>
                      {activity.body && (
                        <p className="mt-0.5 text-xs whitespace-pre-wrap text-ink-soft">
                          {activity.body}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        {toTitleCase(activity.type)}
                        {activity.userName && ` · ${activity.userName}`} ·{" "}
                        {formatDateTime(activity.occurredAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        {/* Right: the work */}
        <div className="space-y-4">
          <TagPanel leadId={lead.id} tags={context.tags} />
          <FollowUpPanel leadId={lead.id} followUps={context.followUps} />
          <LogActivityPanel leadId={lead.id} />
          <NotesPanel leadId={lead.id} notes={context.notes} />

          <Card>
            <CardHeader
              title="Deals"
              action={
                <Link href="/deals" className="text-xs font-medium text-brand hover:underline">
                  All deals
                </Link>
              }
            />
            <ul className="mt-2.5 space-y-2">
              {context.deals.map((deal) => (
                <li key={deal.id} className="rounded-md border border-line px-2.5 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-ink">{deal.name}</span>
                    <span className="tabular shrink-0 text-xs text-ink">
                      {formatCurrency(deal.value, deal.currency)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    {DEAL_STAGE_LABEL[deal.stage]} · {deal.probability}% ·{" "}
                    {deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "no close date"}
                  </p>
                </li>
              ))}
              {context.deals.length === 0 && (
                <li className="text-xs text-ink-faint">No deals for this company yet.</li>
              )}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Source & provenance" />
            <dl className="mt-2.5 space-y-2">
              <Detail label="Source" value={lead.sourceName} compact />
              <Detail
                label="Source URL"
                compact
                value={
                  lead.sourceUrl ? (
                    <a
                      href={lead.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="break-all text-brand hover:underline"
                    >
                      {lead.sourceUrl}
                    </a>
                  ) : null
                }
              />
              <Detail label="Date sourced" value={lead.sourcedAt ? formatDate(lead.sourcedAt) : null} compact />
              <Detail
                label="Import batch"
                compact
                value={
                  lead.importId ? (
                    <Link href={`/import?importId=${lead.importId}`} className="text-brand hover:underline">
                      View import
                    </Link>
                  ) : null
                }
              />
              <Detail label="Created" value={formatDateTime(lead.createdAt)} compact />
              <Detail label="Updated" value={formatDateTime(lead.updatedAt)} compact />
            </dl>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function Detail({
  label,
  value,
  icon,
  className,
  compact,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={className}>
      <dt className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-ink-faint uppercase">
        {icon}
        {label}
      </dt>
      <dd className={compact ? "text-xs text-ink" : "mt-0.5 text-sm text-ink"}>
        {value || <span className="text-ink-faint">—</span>}
      </dd>
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] | null }) {
  if (!items?.length) return null;
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <ul className="mt-1 space-y-1">
        {items.map((item, index) => (
          <li key={index} className="flex gap-1.5 text-xs leading-relaxed text-ink-soft">
            <span className="text-ink-faint">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function activityColor(type: string): string {
  if (type.startsWith("deal_won") || type === "meeting_booked") return "var(--color-positive)";
  if (type === "deal_lost") return "var(--color-danger)";
  if (type === "email_replied") return "var(--color-warning)";
  if (type === "research_completed") return "var(--color-info)";
  if (type.startsWith("email") || type === "call_made" || type === "linkedin_message")
    return "var(--color-brand)";
  return "var(--color-line-strong)";
}
