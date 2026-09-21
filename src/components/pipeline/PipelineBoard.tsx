"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ScorePill } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useQueryState } from "@/hooks/useQueryState";
import type { LeadStatus } from "@/db/schema";
import { CARDS_PER_COLUMN, STATUS_LABEL } from "@/lib/constants";
import type { Lookups } from "@/lib/services/lookups";
import type { PipelineColumn } from "@/lib/services/pipeline";

import { cn, formatDate, formatNumber } from "@/lib/utils";

/**
 * Kanban with native HTML5 drag and drop — no DnD library.
 *
 * The move is applied optimistically so dragging feels instant, then reconciled
 * against the server; a failed move snaps back rather than lying about state.
 */
export function PipelineBoard({
  columns: initialColumns,
  lookups,
}: {
  columns: PipelineColumn[];
  lookups: Lookups;
}) {
  const router = useRouter();
  const toast = useToast();
  const { toggleMulti, getMulti, pending } = useQueryState();

  const [columns, setColumns] = useState(initialColumns);
  const [lastServerColumns, setLastServerColumns] = useState(initialColumns);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<LeadStatus | null>(null);
  const [saving, setSaving] = useState(false);

  const activeNiches = getMulti("nicheIds");

  // Server data wins whenever the page re-renders with fresh props. This is
  // React's "adjust state during render" pattern — it re-renders immediately
  // without the extra paint an effect would cause.
  if (initialColumns !== lastServerColumns) {
    setLastServerColumns(initialColumns);
    setColumns(initialColumns);
  }

  async function move(cardId: string, to: LeadStatus) {
    const from = columns.find((c) => c.cards.some((card) => card.id === cardId));
    if (!from || from.status === to) return;

    const card = from.cards.find((c) => c.id === cardId)!;
    const snapshot = columns;

    setColumns((current) =>
      current.map((column) => {
        if (column.status === from.status) {
          return {
            ...column,
            total: column.total - 1,
            cards: column.cards.filter((c) => c.id !== cardId),
          };
        }
        if (column.status === to) {
          return {
            ...column,
            total: column.total + 1,
            cards: [{ ...card, status: to }, ...column.cards],
          };
        }
        return column;
      }),
    );

    setSaving(true);
    try {
      const response = await fetch(`/api/leads/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      if (!response.ok) {
        setColumns(snapshot);
        toast("Could not move the lead", "error");
        return;
      }
      toast(`${card.fullName?.trim() || card.companyName} → ${STATUS_LABEL[to]}`);
      router.refresh();
    } catch {
      setColumns(snapshot);
      toast("Network error — the lead was not moved", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <span className="mr-1 text-xs font-medium text-ink-soft">Niche</span>
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
        {(pending || saving) && <Spinner className="ml-auto h-3.5 w-3.5" />}
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto p-4 sm:p-6">
        <div className="flex gap-3">
          {columns.map((column) => {
            const isTarget = dropTarget === column.status;
            const hidden = column.total - column.cards.length;

            return (
              <div
                key={column.status}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(column.status);
                }}
                onDragLeave={() => setDropTarget((t) => (t === column.status ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropTarget(null);
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) void move(id, column.status);
                  setDragging(null);
                }}
                className={cn(
                  "flex w-64 shrink-0 flex-col rounded-lg border bg-canvas transition-colors",
                  isTarget ? "border-brand bg-brand-soft" : "border-line",
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
                  <span className="truncate text-xs font-semibold text-ink">
                    {STATUS_LABEL[column.status]}
                  </span>
                  <span className="tabular shrink-0 rounded-full bg-muted px-1.5 text-[11px] text-ink-soft">
                    {formatNumber(column.total)}
                  </span>
                </div>

                <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
                  {column.cards.map((card) => (
                    <article
                      key={card.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", card.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragging(card.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={cn(
                        "cursor-grab rounded-md border border-line bg-surface p-2.5 shadow-xs transition-opacity active:cursor-grabbing",
                        dragging === card.id && "opacity-40",
                      )}
                    >
                      <Link href={`/leads/${card.id}`} className="block">
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate text-xs font-medium text-ink">
                            {card.companyName}
                          </span>
                          <ScorePill score={card.leadScore} />
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-ink-soft">
                          {[card.fullName?.trim(), card.jobTitle].filter(Boolean).join(" · ") ||
                            "No contact"}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          {card.nicheName && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-ink-faint">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: card.nicheColor ?? "var(--color-ink-faint)" }}
                              />
                              {card.nicheName}
                            </span>
                          )}
                          {card.nextFollowUpAt && (
                            <span
                              className={cn(
                                "tabular ml-auto text-[10px]",
                                new Date(card.nextFollowUpAt) < new Date()
                                  ? "font-medium text-danger"
                                  : "text-ink-faint",
                              )}
                            >
                              {formatDate(card.nextFollowUpAt)}
                            </span>
                          )}
                        </div>
                      </Link>
                    </article>
                  ))}

                  {column.cards.length === 0 && (
                    <p className="px-1 py-3 text-center text-[11px] text-ink-faint">
                      Drop a lead here
                    </p>
                  )}

                  {hidden > 0 && (
                    <Link
                      href={`/leads?statuses=${column.status}`}
                      className="rounded-md border border-dashed border-line-strong px-2 py-1.5 text-center text-[11px] text-ink-soft hover:border-brand hover:text-brand"
                    >
                      +{formatNumber(hidden)} more — open in table
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[11px] text-ink-faint">
          Each column shows the top {CARDS_PER_COLUMN} leads by score. Totals are the real counts
          from the database.
        </p>
      </div>
    </div>
  );
}
