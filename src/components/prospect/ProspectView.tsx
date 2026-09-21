"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Check, Search, Sparkles, Users, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { invalidateLookups } from "@/hooks/useLookups";
import type { ProspectCompany } from "@/lib/integrations/types";
import type { Lookups } from "@/lib/services/lookups";
import { cn, formatCompact, formatNumber } from "@/lib/utils";
import { MAX_PROSPECT_RESULTS } from "@/lib/validation";

type SearchResponse = { provider: string; live: boolean; companies: ProspectCompany[] };
type SaveResponse = {
  importId: string;
  imported: number;
  duplicates: number;
  invalid: number;
  merged: number;
};

const BLANK = {
  description: "",
  locations: "",
  industries: "",
  jobTitles: "",
  keywords: "",
  minEmployees: "",
  maxEmployees: "",
  limit: "25",
  nicheId: "",
};

/** "a, b , c" -> ["a","b","c"]; empty input stays undefined, not [""]. */
function toList(value: string): string[] | undefined {
  const items = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function keyOf(company: ProspectCompany, index: number) {
  return company.domain ?? `${company.name}:${index}`;
}

/**
 * Search-then-review prospecting.
 *
 * The two steps are deliberately separate: a search writes nothing, and only
 * the rows the user ticks are saved. Saving runs through the CSV import
 * pipeline, so duplicates against the existing database are caught server-side
 * and reported back rather than silently creating second copies.
 */
export function ProspectView({
  lookups,
  provider,
}: {
  lookups: Lookups;
  provider: { name: string; live: boolean; requested: string };
}) {
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [searching, setSearching] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<SaveResponse | null>(null);

  function set<K extends keyof typeof BLANK>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /**
   * Let the AI provider turn the free-text description into structured fields.
   * The result fills the form rather than searching directly, so the user can
   * correct a bad guess before it costs a provider call.
   */
  async function fillFromDescription() {
    if (form.description.trim().length < 3) {
      setErrors({ description: ["Describe who you are looking for"] });
      return;
    }
    setParsing(true);
    setErrors({});

    try {
      const response = await fetch("/api/prospect/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: form.description }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast(data.error ?? "Could not read that description", "error");
        return;
      }

      // Only overwrite a field the parser actually had an opinion about.
      setForm((f) => ({
        ...f,
        locations: data.locations?.length ? data.locations.join(", ") : f.locations,
        industries: data.industries?.length ? data.industries.join(", ") : f.industries,
        jobTitles: data.jobTitles?.length ? data.jobTitles.join(", ") : f.jobTitles,
        minEmployees: data.minEmployees != null ? String(data.minEmployees) : f.minEmployees,
        maxEmployees: data.maxEmployees != null ? String(data.maxEmployees) : f.maxEmployees,
        limit: data.limit ? String(data.limit) : f.limit,
      }));
      toast("Criteria filled in — check them before searching");
    } catch {
      toast("Could not read that description", "error");
    } finally {
      setParsing(false);
    }
  }

  async function search() {
    if (form.description.trim().length < 3) {
      setErrors({ description: ["Describe who you are looking for"] });
      return;
    }
    setSearching(true);
    setErrors({});
    setSummary(null);

    try {
      const response = await fetch("/api/prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description,
          locations: toList(form.locations),
          industries: toList(form.industries),
          jobTitles: toList(form.jobTitles),
          keywords: toList(form.keywords),
          minEmployees: form.minEmployees ? Number(form.minEmployees) : null,
          maxEmployees: form.maxEmployees ? Number(form.maxEmployees) : null,
          limit: Number(form.limit),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErrors(data.issues ?? {});
        toast(data.error ?? "Search failed", "error");
        return;
      }

      setResults(data);
      // Everything starts ticked — the common case is keeping the whole batch.
      setSelected(new Set(data.companies.map((c: ProspectCompany, i: number) => keyOf(c, i))));
      if (!data.companies.length) toast("No prospects matched those criteria");
    } catch {
      toast("Could not reach the lead provider", "error");
    } finally {
      setSearching(false);
    }
  }

  async function save() {
    if (!results) return;
    const chosen = results.companies.filter((c, i) => selected.has(keyOf(c, i)));
    if (!chosen.length) {
      toast("Select at least one prospect", "error");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/prospect/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description,
          nicheId: form.nicheId || undefined,
          companies: chosen,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        toast(data.error ?? "Could not save the prospects", "error");
        return;
      }

      setSummary(data);
      setResults(null);
      setSelected(new Set());
      invalidateLookups();
      router.refresh();
      toast(`${formatNumber(data.imported)} leads added`);
    } catch {
      toast("Could not save the prospects", "error");
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const contactCount = results?.companies.reduce((sum, c) => sum + c.contacts.length, 0) ?? 0;

  return (
    <div className="space-y-4">
      {!provider.live && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-ink-soft">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p>
            Running on the <strong className="font-medium text-ink">mock</strong> lead provider —
            results are generated offline on <code className="font-mono">.example</code> domains and
            are not real companies.
            {provider.requested !== "mock" && (
              <>
                {" "}
                <code className="font-mono">LEAD_PROVIDER={provider.requested}</code> is selected but
                its API key is missing.
              </>
            )}{" "}
            Set <code className="font-mono">LEAD_PROVIDER</code> and the matching key in{" "}
            <code className="font-mono">.env.local</code> to search live data.
          </p>
        </div>
      )}

      <Card>
        <CardHeader
          title="Search criteria"
          description="Describe the prospect. Comma-separate list fields; leave anything blank to leave it unconstrained."
        />
        <div className="mt-3 space-y-3">
          <Field label="Who are you looking for" required error={errors.description?.[0]}>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Dental practices in the UK with 10–50 staff, looking for the practice owner"
              rows={2}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Locations" hint="e.g. United Kingdom, Ireland">
              <Input
                value={form.locations}
                onChange={(e) => set("locations", e.target.value)}
                placeholder="United Kingdom, Ireland"
              />
            </Field>
            <Field label="Industries" hint="e.g. Healthcare / Dental">
              <Input
                value={form.industries}
                onChange={(e) => set("industries", e.target.value)}
                placeholder="Healthcare / Dental"
              />
            </Field>
            <Field label="Job titles">
              <Input
                value={form.jobTitles}
                onChange={(e) => set("jobTitles", e.target.value)}
                placeholder="Founder, Practice Manager"
              />
            </Field>
            <Field label="Keywords">
              <Input
                value={form.keywords}
                onChange={(e) => set("keywords", e.target.value)}
                placeholder="invisalign, private practice"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Min headcount">
              <Input
                type="number"
                min={0}
                value={form.minEmployees}
                onChange={(e) => set("minEmployees", e.target.value)}
                placeholder="10"
              />
            </Field>
            <Field label="Max headcount" error={errors.maxEmployees?.[0]}>
              <Input
                type="number"
                min={0}
                value={form.maxEmployees}
                onChange={(e) => set("maxEmployees", e.target.value)}
                placeholder="50"
              />
            </Field>
            <Field label="Results" hint={`Up to ${MAX_PROSPECT_RESULTS}`}>
              <Input
                type="number"
                min={1}
                max={MAX_PROSPECT_RESULTS}
                value={form.limit}
                onChange={(e) => set("limit", e.target.value)}
              />
            </Field>
            <Field label="Assign to niche" hint="Applied to everything saved">
              <Select value={form.nicheId} onChange={(e) => set("nicheId", e.target.value)}>
                <option value="">No niche</option>
                {lookups.niches.map((niche) => (
                  <option key={niche.id} value={niche.id}>
                    {niche.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={fillFromDescription} disabled={parsing || searching}>
              {parsing ? <Spinner className="h-3.5 w-3.5" /> : <Wand2 className="h-3.5 w-3.5" />}
              {parsing ? "Reading…" : "Fill from description"}
            </Button>
            <Button variant="primary" onClick={search} disabled={searching || parsing}>
              {searching ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Search className="h-3.5 w-3.5" />}
              {searching ? "Searching…" : "Search prospects"}
            </Button>
          </div>
        </div>
      </Card>

      {summary && (
        <Card>
          <CardHeader
            title="Saved"
            description="Duplicates were matched against the existing database and filled in rather than re-created."
            action={
              <Button size="sm" onClick={() => router.push(`/leads?importId=${summary.importId}`)}>
                View the new leads
              </Button>
            }
          />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Imported" value={summary.imported} tone="text-positive" />
            <Stat label="Duplicates" value={summary.duplicates} tone="text-warning" />
            <Stat label="Merged" value={summary.merged} tone="text-ink" />
            <Stat label="Invalid" value={summary.invalid} tone="text-danger" />
          </div>
        </Card>
      )}

      {results && (
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <CardHeader
              title={`${formatNumber(results.companies.length)} companies · ${formatNumber(contactCount)} contacts`}
              description={`Returned by the ${results.provider} provider. Untick anything you do not want saved.`}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() =>
                  setSelected(
                    selected.size === results.companies.length
                      ? new Set()
                      : new Set(results.companies.map((c, i) => keyOf(c, i))),
                  )
                }
              >
                {selected.size === results.companies.length ? "Clear all" : "Select all"}
              </Button>
              <Button variant="primary" size="sm" onClick={save} disabled={saving || !selected.size}>
                {saving ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Check className="h-3.5 w-3.5" />}
                {saving ? "Saving…" : `Save ${formatNumber(selected.size)} as leads`}
              </Button>
            </div>
          </div>

          {results.companies.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              title="No prospects matched"
              description="Widen the criteria — fewer job titles or a broader headcount range usually helps."
            />
          ) : (
            <ul className="border-t border-line">
              {results.companies.map((company, index) => {
                const key = keyOf(company, index);
                const checked = selected.has(key);
                return (
                  <li
                    key={key}
                    className={cn(
                      "flex gap-3 border-b border-line px-4 py-3 last:border-0",
                      checked ? "bg-surface" : "bg-canvas/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(key)}
                      aria-label={`Select ${company.name}`}
                      className="mt-1 h-3.5 w-3.5 shrink-0 accent-brand"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">{company.name}</span>
                        {company.industry && <Badge tone="slate">{company.industry}</Badge>}
                        {company.employeeCount != null && (
                          <span className="text-xs text-ink-faint">
                            <Users className="mr-1 inline h-3 w-3" />
                            {formatNumber(company.employeeCount)}
                          </span>
                        )}
                        {company.revenue != null && (
                          <span className="text-xs text-ink-faint">
                            ${formatCompact(company.revenue)}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {[company.location, company.domain].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <ul className="mt-1.5 space-y-0.5">
                        {company.contacts.map((contact, i) => (
                          <li key={i} className="truncate text-xs text-ink-soft">
                            <span className="text-ink">
                              {[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
                                "Unnamed contact"}
                            </span>
                            {contact.jobTitle && <span> · {contact.jobTitle}</span>}
                            {contact.email && <span className="text-ink-faint"> · {contact.email}</span>}
                          </li>
                        ))}
                        {company.contacts.length === 0 && (
                          <li className="text-xs text-ink-faint">
                            No contact returned — this company will be skipped.
                          </li>
                        )}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {!results && !summary && !searching && (
        <EmptyState
          icon={<Sparkles className="h-5 w-5" />}
          title="Describe your ideal customer"
          description="Run a search to pull matching companies and their decision-makers. Nothing is saved until you review the results."
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-line bg-canvas px-3 py-2">
      <p className="text-[11px] tracking-wide text-ink-faint uppercase">{label}</p>
      <p className={cn("tabular mt-0.5 text-lg font-semibold", tone)}>{formatNumber(value)}</p>
    </div>
  );
}
