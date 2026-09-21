"use client";

import { X } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { useQueryState } from "@/hooks/useQueryState";
import { LEAD_STATUSES } from "@/lib/constants";
import type { Lookups } from "@/lib/services/lookups";
import { cn } from "@/lib/utils";

/** Query keys the filter panel owns — used for "clear all" and the active count. */
export const FILTER_KEYS = [
  "nicheIds",
  "statuses",
  "sourceIds",
  "tagIds",
  "ownerIds",
  "industry",
  "country",
  "city",
  "jobTitle",
  "minEmployees",
  "maxEmployees",
  "minRevenue",
  "maxRevenue",
  "minScore",
  "maxScore",
  "contacted",
  "hasEmail",
  "hasPhone",
  "researched",
  "createdFrom",
  "createdTo",
  "lastContactedFrom",
  "lastContactedTo",
  "followUpFrom",
  "followUpTo",
  "archived",
];

export function countActiveFilters(searchParams: URLSearchParams): number {
  return FILTER_KEYS.filter((key) => {
    const value = searchParams.get(key);
    return value !== null && value !== "";
  }).length;
}

export function FilterPanel({ lookups, onClose }: { lookups: Lookups; onClose: () => void }) {
  const { searchParams, setParam, toggleMulti, getMulti, clearAll } = useQueryState();

  const activeNiches = getMulti("nicheIds");
  const activeStatuses = getMulti("statuses");
  const activeSources = getMulti("sourceIds");
  const activeTags = getMulti("tagIds");
  const activeCount = countActiveFilters(searchParams);

  return (
    <div className="animate-in border-b border-line bg-canvas px-4 py-4 sm:px-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">Filters</h3>
          {activeCount > 0 && <Badge tone="blue">{activeCount} active</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Button size="sm" variant="ghost" onClick={() => clearAll(["sortBy", "sortDir", "pageSize"])}>
              Clear all
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close filters">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <ChipRow
          label="Niche"
          options={[
            ...lookups.niches.map((n) => ({ value: n.id, label: n.name, color: n.color })),
            { value: "none", label: "No niche" },
          ]}
          active={activeNiches}
          onToggle={(value) => toggleMulti("nicheIds", value)}
        />

        <ChipRow
          label="Status"
          options={LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
          active={activeStatuses}
          onToggle={(value) => toggleMulti("statuses", value)}
        />

        <ChipRow
          label="Source"
          options={lookups.sources.map((s) => ({ value: s.id, label: s.name }))}
          active={activeSources}
          onToggle={(value) => toggleMulti("sourceIds", value)}
        />

        {lookups.tags.length > 0 && (
          <ChipRow
            label="Tags"
            options={lookups.tags.map((t) => ({ value: t.id, label: t.name, color: t.color }))}
            active={activeTags}
            onToggle={(value) => toggleMulti("tagIds", value)}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Industry">
            <Input
              defaultValue={searchParams.get("industry") ?? ""}
              onBlur={(e) => setParam("industry", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setParam("industry", e.currentTarget.value)}
              placeholder="Contains…"
            />
          </Field>
          <Field label="Country">
            <Input
              defaultValue={searchParams.get("country") ?? ""}
              onBlur={(e) => setParam("country", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setParam("country", e.currentTarget.value)}
              placeholder="United States"
            />
          </Field>
          <Field label="City">
            <Input
              defaultValue={searchParams.get("city") ?? ""}
              onBlur={(e) => setParam("city", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setParam("city", e.currentTarget.value)}
              placeholder="Austin"
            />
          </Field>
          <Field label="Job title">
            <Input
              defaultValue={searchParams.get("jobTitle") ?? ""}
              onBlur={(e) => setParam("jobTitle", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setParam("jobTitle", e.currentTarget.value)}
              placeholder="Founder"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <RangeField
            label="Company size"
            minKey="minEmployees"
            maxKey="maxEmployees"
            placeholderMin="10"
            placeholderMax="50"
          />
          <RangeField
            label="Revenue (USD)"
            minKey="minRevenue"
            maxKey="maxRevenue"
            placeholderMin="500000"
            placeholderMax="5000000"
          />
          <RangeField
            label="Lead score"
            minKey="minScore"
            maxKey="maxScore"
            placeholderMin="70"
            placeholderMax="100"
          />
          <Field label="Owner">
            <Select
              value={getMulti("ownerIds")[0] ?? ""}
              onChange={(e) =>
                e.target.value ? toggleMultiSingle("ownerIds", e.target.value) : setParam("ownerIds", null)
              }
            >
              <option value="">Anyone</option>
              {lookups.owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Contacted">
            <Select
              value={searchParams.get("contacted") ?? ""}
              onChange={(e) => setParam("contacted", e.target.value)}
            >
              <option value="">Any</option>
              <option value="no">Not contacted</option>
              <option value="yes">Contacted</option>
            </Select>
          </Field>
          <Field label="Has email">
            <Select
              value={searchParams.get("hasEmail") ?? ""}
              onChange={(e) => setParam("hasEmail", e.target.value)}
            >
              <option value="">Any</option>
              <option value="yes">Has email</option>
              <option value="no">Missing email</option>
            </Select>
          </Field>
          <Field label="Has phone">
            <Select
              value={searchParams.get("hasPhone") ?? ""}
              onChange={(e) => setParam("hasPhone", e.target.value)}
            >
              <option value="">Any</option>
              <option value="yes">Has phone</option>
              <option value="no">Missing phone</option>
            </Select>
          </Field>
          <Field label="AI research">
            <Select
              value={searchParams.get("researched") ?? ""}
              onChange={(e) => setParam("researched", e.target.value)}
            >
              <option value="">Any</option>
              <option value="yes">Researched</option>
              <option value="no">Not researched</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DateRangeField label="Created" fromKey="createdFrom" toKey="createdTo" />
          <DateRangeField label="Last contacted" fromKey="lastContactedFrom" toKey="lastContactedTo" />
          <DateRangeField label="Next follow-up" fromKey="followUpFrom" toKey="followUpTo" />
          <Field label="Archived">
            <Select
              value={searchParams.get("archived") ?? ""}
              onChange={(e) => setParam("archived", e.target.value)}
            >
              <option value="">Hide archived</option>
              <option value="yes">Only archived</option>
              <option value="any">Include archived</option>
            </Select>
          </Field>
        </div>
      </div>
    </div>
  );

  function toggleMultiSingle(key: string, value: string) {
    setParam(key, value);
  }
}

function ChipRow({
  label,
  options,
  active,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string; color?: string }[];
  active: string[];
  onToggle: (value: string) => void;
}) {
  if (!options.length) return null;

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink-soft">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const isActive = active.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                isActive
                  ? "border-brand bg-brand-soft font-medium text-brand-ink"
                  : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink",
              )}
            >
              {option.color && (
                <span className="h-2 w-2 rounded-full" style={{ background: option.color }} />
              )}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RangeField({
  label,
  minKey,
  maxKey,
  placeholderMin,
  placeholderMax,
}: {
  label: string;
  minKey: string;
  maxKey: string;
  placeholderMin: string;
  placeholderMax: string;
}) {
  const { searchParams, setParam } = useQueryState();
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          defaultValue={searchParams.get(minKey) ?? ""}
          onBlur={(e) => setParam(minKey, e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setParam(minKey, e.currentTarget.value)}
          placeholder={placeholderMin}
        />
        <span className="text-xs text-ink-faint">to</span>
        <Input
          type="number"
          defaultValue={searchParams.get(maxKey) ?? ""}
          onBlur={(e) => setParam(maxKey, e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setParam(maxKey, e.currentTarget.value)}
          placeholder={placeholderMax}
        />
      </div>
    </Field>
  );
}

function DateRangeField({
  label,
  fromKey,
  toKey,
}: {
  label: string;
  fromKey: string;
  toKey: string;
}) {
  const { searchParams, setParam } = useQueryState();
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={searchParams.get(fromKey) ?? ""}
          onChange={(e) => setParam(fromKey, e.target.value)}
        />
        <span className="text-xs text-ink-faint">to</span>
        <Input
          type="date"
          value={searchParams.get(toKey) ?? ""}
          onChange={(e) => setParam(toKey, e.target.value)}
        />
      </div>
    </Field>
  );
}
