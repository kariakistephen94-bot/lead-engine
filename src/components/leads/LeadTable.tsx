"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Badge, ScorePill } from "@/components/ui/Badge";
import { Checkbox, Td, Th, TableShell, Tr } from "@/components/ui/Table";
import { isOverdue, useNow } from "@/hooks/useNow";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/constants";
import type { LeadRow } from "@/lib/services/leads";
import { cn, formatCompact, formatDate, formatNumber, formatPhone } from "@/lib/utils";
import type { LeadSortColumn } from "@/lib/validation";
import { LEAD_COLUMNS, type LeadColumnKey } from "./columns";

export function LeadTable({
  rows,
  visibleColumns,
  selected,
  onToggle,
  onToggleAll,
  sortBy,
  sortDir,
  onSort,
}: {
  rows: LeadRow[];
  visibleColumns: LeadColumnKey[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  sortBy: LeadSortColumn;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
}) {
  // Read once here rather than per-cell so the whole table shares one clock
  // subscription.
  const now = useNow();
  const columns = LEAD_COLUMNS.filter((c) => visibleColumns.includes(c.key));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = rows.some((r) => selected.has(r.id));

  return (
    <TableShell>
      <thead>
        <tr>
          <Th className="w-9 pr-0" sticky>
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected}
              onChange={onToggleAll}
              label="Select all rows on this page"
            />
          </Th>
          {columns.map((column) => (
            <Th
              key={column.key}
              sortKey={column.sortKey}
              activeSort={sortBy}
              direction={sortDir}
              onSort={column.sortKey ? onSort : undefined}
              align={column.align}
              style={column.width ? { width: column.width, maxWidth: column.width } : undefined}
            >
              {column.label}
            </Th>
          ))}
          <Th className="w-10" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <Tr key={row.id} selected={selected.has(row.id)}>
            <Td className="pr-0" sticky>
              <Checkbox
                checked={selected.has(row.id)}
                onChange={() => onToggle(row.id)}
                label={`Select ${row.companyName}`}
              />
            </Td>

            {columns.map((column) => (
              <Td
                key={column.key}
                align={column.align}
                className={cn("truncate-cell", column.key === "company" && "font-medium text-ink")}
                // Fixed widths keep columns from jumping between pages.
                style={column.width ? { width: column.width, maxWidth: column.width } : undefined}
              >
                <Cell row={row} column={column.key} now={now} />
              </Td>
            ))}

            <Td align="right">
              <Link
                href={`/leads/${row.id}`}
                className="rounded px-1.5 py-0.5 text-xs font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                Open
              </Link>
            </Td>
          </Tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function Cell({ row, column, now }: { row: LeadRow; column: LeadColumnKey; now: number }) {
  switch (column) {
    case "company":
      return (
        <Link href={`/leads/${row.id}`} className="hover:text-brand hover:underline">
          {row.companyName}
        </Link>
      );

    case "contact": {
      const name = row.fullName?.trim();
      return name ? <span className="text-ink">{name}</span> : <Muted />;
    }

    case "jobTitle":
      return row.jobTitle ? <>{row.jobTitle}</> : <Muted />;

    case "email":
      return row.email ? (
        <a href={`mailto:${row.email}`} className="hover:text-brand hover:underline">
          {row.email}
        </a>
      ) : (
        <Muted />
      );

    case "phone":
      return row.phone ? <span className="tabular">{formatPhone(row.phone)}</span> : <Muted />;

    case "website":
      return row.website ? (
        <a
          href={row.website}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 hover:text-brand hover:underline"
        >
          {row.domain ?? row.website}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <Muted />
      );

    case "niche":
      return row.nicheName ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: row.nicheColor ?? "var(--color-ink-faint)" }}
          />
          {row.nicheName}
        </span>
      ) : (
        <Muted label="No niche" />
      );

    case "industry":
      return row.industry ? <>{row.industry}</> : <Muted />;

    case "location":
      return row.location ? <>{row.location}</> : <Muted />;

    case "employeeCount":
      return row.employeeCount ? <span className="tabular">{formatNumber(row.employeeCount)}</span> : <Muted />;

    case "revenue":
      return row.revenue ? <span className="tabular">${formatCompact(row.revenue)}</span> : <Muted />;

    case "leadScore":
      return <ScorePill score={row.leadScore} />;

    case "status":
      return (
        <Badge tone={STATUS_TONE[row.status]} dot>
          {STATUS_LABEL[row.status]}
        </Badge>
      );

    case "source":
      return row.sourceName ? <>{row.sourceName}</> : <Muted />;

    case "lastContacted":
      return row.lastContactedAt ? (
        <span className="tabular">{formatDate(row.lastContactedAt)}</span>
      ) : (
        <Muted label="Never" />
      );

    case "nextFollowUp": {
      if (!row.nextFollowUpAt) return <Muted />;
      const overdue = isOverdue(row.nextFollowUpAt, now);
      return (
        <span className={cn("tabular", overdue && "font-medium text-danger")}>
          {formatDate(row.nextFollowUpAt)}
        </span>
      );
    }

    case "owner":
      return row.ownerName ? <>{row.ownerName}</> : <Muted label="Unassigned" />;

    case "createdAt":
      return <span className="tabular">{formatDate(row.createdAt)}</span>;
  }
}

function Muted({ label = "—" }: { label?: string }) {
  return <span className="text-ink-faint">{label}</span>;
}
