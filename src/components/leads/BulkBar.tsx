"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, Download, Sparkles, Tag, Trash2, UserCheck, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Dropdown, MenuDivider, MenuItem, MenuLabel } from "@/components/ui/Dropdown";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { LEAD_STATUSES } from "@/lib/constants";
import type { Lookups } from "@/lib/services/lookups";
import { formatNumber } from "@/lib/utils";

type BulkPayload = Record<string, unknown> & { action: string };

export function BulkBar({
  selectedIds,
  totalMatching,
  selectableCount,
  onClear,
  onSelectAllMatching,
  allMatchingSelected,
  lookups,
  exportHref,
}: {
  selectedIds: string[];
  /** Everything matching the current filter. */
  totalMatching: number;
  /** How many of those can actually be selected — bulk actions are capped. */
  selectableCount: number;
  onClear: () => void;
  onSelectAllMatching: () => void;
  allMatchingSelected: boolean;
  lookups: Lookups;
  exportHref: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(payload: BulkPayload) {
    setBusy(true);
    try {
      const response = await fetch("/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, ids: selectedIds }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast(data.error ?? "Bulk action failed", "error");
        return;
      }
      toast(data.message ?? "Done");
      onClear();
      router.refresh();
    } catch {
      toast("Network error — nothing was changed", "error");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const count = selectedIds.length;

  return (
    <>
      <div className="animate-in flex flex-wrap items-center gap-2 border-b border-brand/20 bg-brand-soft px-4 py-2 sm:px-6">
        <span className="text-xs font-medium text-brand-ink">
          {formatNumber(count)} selected
        </span>

        {!allMatchingSelected && selectableCount > count && (
          <button
            onClick={onSelectAllMatching}
            className="text-xs font-medium text-brand underline-offset-2 hover:underline"
          >
            {selectableCount < totalMatching
              ? `Select first ${formatNumber(selectableCount)} of ${formatNumber(totalMatching)} matching`
              : `Select all ${formatNumber(totalMatching)} matching this filter`}
          </button>
        )}

        {allMatchingSelected && selectableCount < totalMatching && (
          <span className="text-xs text-ink-soft">
            Bulk actions apply to {formatNumber(selectableCount)} leads at a time — narrow the filter
            or repeat to cover all {formatNumber(totalMatching)}. Export is not capped.
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Dropdown
            trigger={({ toggle }) => (
              <Button size="sm" onClick={toggle} disabled={busy}>
                Set status
              </Button>
            )}
            width="w-52"
          >
            {({ close }) => (
              <div className="max-h-72 overflow-y-auto">
                {LEAD_STATUSES.map((status) => (
                  <MenuItem
                    key={status.value}
                    onClick={() => {
                      close();
                      void run({ action: "set_status", status: status.value });
                    }}
                  >
                    {status.label}
                  </MenuItem>
                ))}
              </div>
            )}
          </Dropdown>

          <Dropdown
            trigger={({ toggle }) => (
              <Button size="sm" onClick={toggle} disabled={busy}>
                Set niche
              </Button>
            )}
          >
            {({ close }) => (
              <div className="max-h-72 overflow-y-auto">
                <MenuItem
                  onClick={() => {
                    close();
                    void run({ action: "set_niche", nicheId: null });
                  }}
                >
                  No niche
                </MenuItem>
                <MenuDivider />
                {lookups.niches.map((niche) => (
                  <MenuItem
                    key={niche.id}
                    onClick={() => {
                      close();
                      void run({ action: "set_niche", nicheId: niche.id });
                    }}
                  >
                    {niche.name}
                  </MenuItem>
                ))}
              </div>
            )}
          </Dropdown>

          <Dropdown
            trigger={({ toggle }) => (
              <Button size="sm" onClick={toggle} disabled={busy}>
                <Tag className="h-3.5 w-3.5" />
                Tag
              </Button>
            )}
          >
            {({ close }) => (
              <div className="max-h-72 overflow-y-auto">
                <MenuLabel>Add tag</MenuLabel>
                {lookups.tags.map((tag) => (
                  <MenuItem
                    key={tag.id}
                    onClick={() => {
                      close();
                      void run({ action: "add_tag", tagId: tag.id });
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: tag.color }} />
                      {tag.name}
                    </span>
                  </MenuItem>
                ))}
                <MenuDivider />
                <MenuLabel>Remove tag</MenuLabel>
                {lookups.tags.map((tag) => (
                  <MenuItem
                    key={`remove-${tag.id}`}
                    onClick={() => {
                      close();
                      void run({ action: "remove_tag", tagId: tag.id });
                    }}
                  >
                    {tag.name}
                  </MenuItem>
                ))}
              </div>
            )}
          </Dropdown>

          <Button size="sm" onClick={() => run({ action: "mark_contacted" })} disabled={busy}>
            <UserCheck className="h-3.5 w-3.5" />
            Mark contacted
          </Button>

          <Button size="sm" onClick={() => run({ action: "queue_research" })} disabled={busy}>
            <Sparkles className="h-3.5 w-3.5" />
            Queue research
          </Button>

          <Button size="sm" onClick={() => run({ action: "archive", archived: true })} disabled={busy}>
            <Archive className="h-3.5 w-3.5" />
            Archive
          </Button>

          <a
            href={exportHref}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-ink transition-colors hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </a>

          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>

          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClear} aria-label="Clear selection">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => run({ action: "delete" })}
        title={`Delete ${formatNumber(count)} leads?`}
        message="This permanently removes the contacts and their notes, activities and follow-ups. Companies are kept. This cannot be undone — archive instead if you only want them out of the way."
        confirmLabel="Delete permanently"
        destructive
        busy={busy}
      />
    </>
  );
}
