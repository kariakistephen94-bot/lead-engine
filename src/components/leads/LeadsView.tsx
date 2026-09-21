"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Columns3, Download, Filter, Plus, Search, Upload, X } from "lucide-react";

import { QuickAddLead } from "@/components/leads/QuickAddLead";
import { Button } from "@/components/ui/Button";
import { Dropdown, MenuLabel } from "@/components/ui/Dropdown";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Checkbox } from "@/components/ui/Table";
import { useQueryState } from "@/hooks/useQueryState";
import type { LeadRow } from "@/lib/services/leads";
import type { Lookups } from "@/lib/services/lookups";
import { cn, formatNumber } from "@/lib/utils";
import type { LeadSortColumn } from "@/lib/validation";
import {
  LEAD_COLUMNS,
  saveVisibleColumns,
  visibleColumnsStore,
  type LeadColumnKey,
} from "./columns";
import { countActiveFilters, FilterPanel } from "./FilterPanel";
import { BulkBar } from "./BulkBar";
import { LeadTable } from "./LeadTable";

export function LeadsView({
  rows,
  total,
  page,
  pageSize,
  sortBy,
  sortDir,
  lookups,
  allMatchingIds,
}: {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  sortBy: LeadSortColumn;
  sortDir: "asc" | "desc";
  lookups: Lookups;
  /** Ids for "select all matching", resolved on the server so no client scan is needed. */
  allMatchingIds: string[];
}) {
  const { searchParams, setParam, clearAll, pending } = useQueryState();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);

  // Persisted in localStorage, which is only readable after hydration.
  const visibleColumns = useSyncExternalStore(
    visibleColumnsStore.subscribe,
    visibleColumnsStore.getSnapshot,
    visibleColumnsStore.getServerSnapshot,
  );

  const currentQuery = searchParams.toString();

  // Selecting rows then changing the filter would apply actions to leads that
  // are no longer on screen — so the selection resets whenever the query does,
  // and the search box re-syncs with the URL. Adjusting during render rather
  // than in an effect avoids rendering one frame with the stale selection.
  const [renderedQuery, setRenderedQuery] = useState(currentQuery);
  if (renderedQuery !== currentQuery) {
    setRenderedQuery(currentQuery);
    setSelected(new Set());
    setAllMatchingSelected(false);
    setSearchValue(searchParams.get("q") ?? "");
  }

  // Debounce search so typing doesn't fire a query per keystroke.
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (searchValue === current) return;
    const timer = window.setTimeout(() => setParam("q", searchValue || null), 300);
    return () => window.clearTimeout(timer);
  }, [searchValue, searchParams, setParam]);

  const activeFilters = countActiveFilters(searchParams);

  const onSort = useCallback(
    (key: string) => {
      const nextDir = sortBy === key && sortDir === "desc" ? "asc" : "desc";
      setParam("sortBy", key, { resetPage: false });
      setParam("sortDir", nextDir, { resetPage: false });
    },
    [setParam, sortBy, sortDir],
  );

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAllMatchingSelected(false);
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelected((current) => {
        const next = new Set(current);
        for (const row of rows) {
          if (checked) next.add(row.id);
          else next.delete(row.id);
        }
        return next;
      });
      setAllMatchingSelected(false);
    },
    [rows],
  );

  const exportHref = useMemo(() => {
    const params = new URLSearchParams(currentQuery);
    params.delete("page");
    params.delete("pageSize");
    if (selected.size && !allMatchingSelected) params.set("ids", [...selected].join(","));
    return `/api/leads/export?${params.toString()}`;
  }, [currentQuery, selected, allMatchingSelected]);

  const toggleColumn = (key: LeadColumnKey) => {
    const next = visibleColumns.includes(key)
      ? visibleColumns.filter((c) => c !== key)
      : LEAD_COLUMNS.map((c) => c.key).filter((c) => visibleColumns.includes(c) || c === key);
    // The store is the source of truth; writing to it re-renders subscribers.
    saveVisibleColumns(next);
  };

  return (
    <div className="flex min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search this table…"
            className="h-8 w-full rounded-md border border-line bg-canvas pr-7 pl-8 text-sm text-ink placeholder:text-ink-faint hover:border-line-strong focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/15 focus:outline-none"
          />
          {searchValue && (
            <button
              onClick={() => setSearchValue("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-ink-faint hover:text-ink"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button
          size="sm"
          variant={showFilters || activeFilters ? "primary" : "secondary"}
          onClick={() => setShowFilters((v) => !v)}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeFilters > 0 && (
            <span className="tabular ml-0.5 rounded-full bg-white/25 px-1.5 text-[11px]">
              {activeFilters}
            </span>
          )}
        </Button>

        {activeFilters > 0 && (
          <Button size="sm" variant="ghost" onClick={() => clearAll(["sortBy", "sortDir", "pageSize"])}>
            Reset
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {pending && <Spinner className="h-3.5 w-3.5" />}

          <Dropdown
            trigger={({ toggle: t }) => (
              <Button size="sm" onClick={t}>
                <Columns3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Columns</span>
              </Button>
            )}
          >
            {() => (
              <div className="max-h-80 overflow-y-auto">
                <MenuLabel>Visible columns</MenuLabel>
                {LEAD_COLUMNS.map((column) => (
                  <label
                    key={column.key}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-ink-soft hover:bg-muted"
                  >
                    <Checkbox
                      checked={visibleColumns.includes(column.key)}
                      onChange={() => toggleColumn(column.key)}
                      label={column.label}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            )}
          </Dropdown>

          <a
            href={exportHref}
            className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </a>

          <Link
            href="/import"
            className="inline-flex h-8.5 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-muted"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Import</span>
          </Link>

          <QuickAddLead
            trigger={(open) => (
              <Button size="sm" variant="primary" onClick={open}>
                <Plus className="h-3.5 w-3.5" />
                Add lead
              </Button>
            )}
          />
        </div>
      </div>

      {showFilters && <FilterPanel lookups={lookups} onClose={() => setShowFilters(false)} />}

      {selected.size > 0 && (
        <BulkBar
          selectedIds={[...selected]}
          totalMatching={total}
          selectableCount={allMatchingIds.length}
          allMatchingSelected={allMatchingSelected}
          onClear={() => {
            setSelected(new Set());
            setAllMatchingSelected(false);
          }}
          onSelectAllMatching={() => {
            setSelected(new Set(allMatchingIds));
            setAllMatchingSelected(true);
          }}
          lookups={lookups}
          exportHref={exportHref}
        />
      )}

      <div className={cn("min-h-0 flex-1", pending && "opacity-60 transition-opacity")}>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title={activeFilters || searchValue ? "No leads match these filters" : "No leads yet"}
            description={
              activeFilters || searchValue
                ? "Try widening the filters, or reset them to see the whole database."
                : "Add your first lead with Quick add, import a CSV export from Apollo, or generate prospects from Find Leads."
            }
            action={
              activeFilters || searchValue ? (
                <Button onClick={() => clearAll(["sortBy", "sortDir", "pageSize"])}>Reset filters</Button>
              ) : (
                <QuickAddLead
                  trigger={(open) => (
                    <Button variant="primary" onClick={open}>
                      <Plus className="h-3.5 w-3.5" />
                      Add your first lead
                    </Button>
                  )}
                />
              )
            }
          />
        ) : (
          <LeadTable
            rows={rows}
            visibleColumns={visibleColumns}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={onSort}
          />
        )}
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(next) => setParam("page", next, { resetPage: false })}
        onPageSizeChange={(size) => setParam("pageSize", size)}
      />

      <p className="px-4 pb-3 text-[11px] text-ink-faint sm:px-6">
        Filtering, sorting and paging all run in Postgres — only the {formatNumber(rows.length)} rows
        on this page are sent to the browser.
      </p>
    </div>
  );
}
