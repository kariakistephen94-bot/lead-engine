"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Pagination } from "@/components/ui/Pagination";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { TableShell, Td, Th, Tr } from "@/components/ui/Table";
import { useQueryState } from "@/hooks/useQueryState";
import type { CompanyRow } from "@/lib/services/companies";
import type { Lookups } from "@/lib/services/lookups";
import { cn, formatCompact, formatDate, formatNumber } from "@/lib/utils";

export function CompaniesView({
  rows,
  total,
  page,
  pageSize,
  sortBy,
  sortDir,
  lookups,
}: {
  rows: CompanyRow[];
  total: number;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: "asc" | "desc";
  lookups: Lookups;
}) {
  const { searchParams, setParam, toggleMulti, getMulti, pending } = useQueryState();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const activeNiches = getMulti("nicheIds");

  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (search === current) return;
    const timer = window.setTimeout(() => setParam("q", search || null), 300);
    return () => window.clearTimeout(timer);
  }, [search, searchParams, setParam]);

  function onSort(key: string) {
    const nextDir = sortBy === key && sortDir === "desc" ? "asc" : "desc";
    setParam("sortBy", key, { resetPage: false });
    setParam("sortDir", nextDir, { resetPage: false });
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies…"
            className="h-8 w-full rounded-md border border-line bg-canvas pr-7 pl-8 text-sm text-ink placeholder:text-ink-faint hover:border-line-strong focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/15 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-ink-faint hover:text-ink"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {lookups.niches.map((niche) => {
            const active = activeNiches.includes(niche.id);
            return (
              <button
                key={niche.id}
                onClick={() => toggleMulti("nicheIds", niche.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "border-brand bg-brand-soft font-medium text-brand-ink"
                    : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink",
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: niche.color }} />
                {niche.name}
              </button>
            );
          })}
        </div>

        {pending && <Spinner className="ml-auto h-3.5 w-3.5" />}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No companies match"
          description="Companies are created automatically whenever you add or import a lead."
        />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th sortKey="name" activeSort={sortBy} direction={sortDir} onSort={onSort}>
                Company
              </Th>
              <Th>Domain</Th>
              <Th>Industry</Th>
              <Th>Niche</Th>
              <Th>Location</Th>
              <Th
                sortKey="employee_count"
                activeSort={sortBy}
                direction={sortDir}
                onSort={onSort}
                align="right"
              >
                Size
              </Th>
              <Th align="right">Revenue</Th>
              <Th sortKey="contacts" activeSort={sortBy} direction={sortDir} onSort={onSort} align="right">
                Contacts
              </Th>
              <Th>Source</Th>
              <Th sortKey="created_at" activeSort={sortBy} direction={sortDir} onSort={onSort}>
                Created
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td className="font-medium text-ink">
                  <Link href={`/companies/${row.id}`} className="hover:text-brand hover:underline">
                    {row.name}
                  </Link>
                </Td>
                <Td>
                  {row.website ? (
                    <a
                      href={row.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="hover:text-brand hover:underline"
                    >
                      {row.domain ?? row.website}
                    </a>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </Td>
                <Td>{row.industry ?? <span className="text-ink-faint">—</span>}</Td>
                <Td>
                  {row.nicheName ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: row.nicheColor ?? "var(--color-ink-faint)" }}
                      />
                      {row.nicheName}
                    </span>
                  ) : (
                    <span className="text-ink-faint">No niche</span>
                  )}
                </Td>
                <Td>{row.location ?? <span className="text-ink-faint">—</span>}</Td>
                <Td align="right" className="tabular">
                  {row.employeeCount ? formatNumber(row.employeeCount) : "—"}
                </Td>
                <Td align="right" className="tabular">
                  {row.revenue ? `$${formatCompact(row.revenue)}` : "—"}
                </Td>
                <Td align="right" className="tabular">
                  <Link href={`/leads?q=${encodeURIComponent(row.name)}`} className="hover:text-brand">
                    {formatNumber(row.contactCount)}
                  </Link>
                </Td>
                <Td>{row.sourceName ?? <span className="text-ink-faint">—</span>}</Td>
                <Td className="tabular">{formatDate(row.createdAt)}</Td>
              </Tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        label="companies"
        onPageChange={(next) => setParam("page", next, { resetPage: false })}
        onPageSizeChange={(size) => setParam("pageSize", size)}
      />
    </div>
  );
}
