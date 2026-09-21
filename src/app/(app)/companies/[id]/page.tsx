import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { PageBody } from "@/components/layout/PageHeader";
import { Badge, ScorePill } from "@/components/ui/Badge";
import { Card, CardHeader, SectionTitle } from "@/components/ui/Card";
import { TableShell, Td, Th, Tr } from "@/components/ui/Table";
import { getLatestResearch } from "@/lib/ai/research";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/constants";
import { getCompany, listCompanyContacts } from "@/lib/services/companies";
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPhone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const company = await getCompany((await params).id);
  return { title: company?.name ?? "Company" };
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();

  const [people, research] = await Promise.all([listCompanyContacts(id), getLatestResearch(id)]);

  return (
    <>
      <div className="border-b border-line bg-surface px-4 py-3.5 sm:px-6">
        <Link
          href="/companies"
          className="mb-2 inline-flex items-center gap-1 text-xs text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" />
          All companies
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold text-ink">{company.name}</h1>
          {company.nicheName && (
            <Badge tone="blue" dot>
              {company.nicheName}
            </Badge>
          )}
          {company.researchMethod === "seed-demo" && <Badge tone="amber">Demo data</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-ink-soft">
          {[company.industry, company.location].filter(Boolean).join(" · ")}
        </p>
      </div>

      <PageBody className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card padded={false}>
            <div className="p-4">
              <CardHeader
                title={`Contacts (${people.length})`}
                description="Every person on file at this company."
              />
            </div>
            <TableShell>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Job title</Th>
                  <Th>Email</Th>
                  <Th align="center">Score</Th>
                  <Th>Status</Th>
                  <Th>Last contacted</Th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <Tr key={person.id}>
                    <Td className="font-medium text-ink">
                      <Link href={`/leads/${person.id}`} className="hover:text-brand hover:underline">
                        {person.fullName?.trim() || person.email || "Unnamed"}
                      </Link>
                    </Td>
                    <Td>{person.jobTitle ?? <span className="text-ink-faint">—</span>}</Td>
                    <Td>{person.email ?? <span className="text-ink-faint">—</span>}</Td>
                    <Td align="center">
                      <ScorePill score={person.leadScore} />
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[person.status]} dot>
                        {STATUS_LABEL[person.status]}
                      </Badge>
                    </Td>
                    <Td className="tabular">
                      {person.lastContactedAt ? (
                        formatDate(person.lastContactedAt)
                      ) : (
                        <span className="text-ink-faint">Never</span>
                      )}
                    </Td>
                  </Tr>
                ))}
                {people.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-xs text-ink-faint">
                      No contacts on this company yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </TableShell>
          </Card>

          {research && (
            <Card>
              <CardHeader
                title="Latest AI research"
                description={`${research.provider} · ${formatDateTime(research.createdAt)}`}
              />
              <div className="mt-3 space-y-3">
                <p className="text-xs leading-relaxed text-ink-soft">{research.summary}</p>
                {research.recommendedOffer && (
                  <div className="rounded-md border border-brand/20 bg-brand-soft p-3">
                    <SectionTitle>Recommended offer</SectionTitle>
                    <p className="mt-1 text-xs text-brand-ink">{research.recommendedOffer}</p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Company details" />
            <dl className="mt-3 space-y-2.5">
              <Row label="Website">
                {company.website ? (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-brand hover:underline"
                  >
                    {company.domain ?? company.website}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </Row>
              <Row label="Industry">{company.industry}</Row>
              <Row label="Location">{company.location}</Row>
              <Row label="City">{company.city}</Row>
              <Row label="Country">{company.country}</Row>
              <Row label="Employees">
                {company.employeeCount ? formatNumber(company.employeeCount) : null}
              </Row>
              <Row label="Revenue">{company.revenue ? formatCurrency(company.revenue) : null}</Row>
              <Row label="Phone">{formatPhone(company.phone)}</Row>
              <Row label="Email">{company.email}</Row>
              <Row label="LinkedIn">
                {company.linkedinUrl ? (
                  <a
                    href={company.linkedinUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-brand hover:underline"
                  >
                    View profile
                  </a>
                ) : null}
              </Row>
            </dl>
            {company.description && (
              <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-soft">
                {company.description}
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Provenance" />
            <dl className="mt-3 space-y-2.5">
              <Row label="Source">{company.sourceName}</Row>
              <Row label="Source URL">
                {company.sourceUrl ? (
                  <a
                    href={company.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="break-all text-brand hover:underline"
                  >
                    {company.sourceUrl}
                  </a>
                ) : null}
              </Row>
              <Row label="Research method">{company.researchMethod}</Row>
              <Row label="Date sourced">
                {company.sourcedAt ? formatDate(company.sourcedAt) : null}
              </Row>
              <Row label="Created">{formatDateTime(company.createdAt)}</Row>
            </dl>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[11px] font-medium tracking-wide text-ink-faint uppercase">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-xs text-ink">
        {children || <span className="text-ink-faint">—</span>}
      </dd>
    </div>
  );
}
