"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, MoreHorizontal, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Dropdown, MenuDivider, MenuItem } from "@/components/ui/Dropdown";
import { Select } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { LeadStatus } from "@/db/schema";
import { LEAD_STATUSES } from "@/lib/constants";

export function LeadActions({
  leadId,
  status,
  archived,
  hasResearch,
}: {
  leadId: string;
  status: LeadStatus;
  archived: boolean;
  hasResearch: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<null | "status" | "research" | "other">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function patch(body: Record<string, unknown>, kind: "status" | "other" = "other") {
    setBusy(kind);
    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        toast(data.error ?? "Update failed", "error");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      toast("Network error — nothing was changed", "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function research() {
    setBusy("research");
    toast("Researching — reading the website and scoring the lead…", "info");
    try {
      const response = await fetch(`/api/leads/${leadId}/research`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        toast(data.error ?? "Research failed", "error");
        return;
      }
      toast(
        `Research complete — score ${data.score}/100 via ${data.provider}` +
          (data.websiteRead ? " (website read)" : " (website unavailable)"),
      );
      router.refresh();
    } catch {
      toast("Network error — research did not run", "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("other");
    try {
      const response = await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
      if (!response.ok) {
        toast("Delete failed", "error");
        return;
      }
      toast("Lead deleted");
      router.push("/leads");
    } finally {
      setBusy(null);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          disabled={busy === "status"}
          onChange={(e) => patch({ status: e.target.value }, "status")}
          className="w-44"
          aria-label="Lead status"
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <Button variant="primary" onClick={research} disabled={busy !== null}>
          <Sparkles className="h-3.5 w-3.5" />
          {busy === "research" ? "Researching…" : hasResearch ? "Re-run research" : "Research lead"}
        </Button>

        <Dropdown
          trigger={({ toggle }) => (
            <Button size="icon" onClick={toggle} aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          )}
        >
          {({ close }) => (
            <>
              <MenuItem
                icon={<Archive className="h-3.5 w-3.5" />}
                onClick={() => {
                  close();
                  void patch({ archived: !archived });
                }}
              >
                {archived ? "Restore from archive" : "Archive lead"}
              </MenuItem>
              <MenuDivider />
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" />}
                destructive
                onClick={() => {
                  close();
                  setConfirmDelete(true);
                }}
              >
                Delete lead
              </MenuItem>
            </>
          )}
        </Dropdown>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete this lead?"
        message="The contact, its notes, activities and follow-ups are permanently removed. The company record is kept."
        confirmLabel="Delete permanently"
        destructive
        busy={busy === "other"}
      />
    </>
  );
}
