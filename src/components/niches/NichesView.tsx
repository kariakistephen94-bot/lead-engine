"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArrowUpRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Dropdown, MenuDivider, MenuItem } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { invalidateLookups } from "@/hooks/useLookups";
import type { NicheStats } from "@/lib/services/niches";
import { formatCurrency, formatNumber, formatPercent, rate } from "@/lib/utils";

const BLANK = {
  name: "",
  description: "",
  targetMarket: "",
  targetLocations: "",
  idealCompanySize: "",
  targetJobTitles: "",
  painPoints: "",
  offer: "",
  notes: "",
  color: "#2563eb",
};

const SWATCHES = ["#2563eb", "#7c3aed", "#0891b2", "#ea580c", "#16a34a", "#db2777", "#ca8a04", "#4f46e5"];

export function NichesView({ niches }: { niches: NicheStats[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<NicheStats | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<NicheStats | null>(null);

  function openCreate() {
    setForm(BLANK);
    setEditing(null);
    setCreating(true);
  }

  function openEdit(niche: NicheStats) {
    setForm({
      name: niche.name,
      description: niche.description ?? "",
      targetMarket: niche.targetMarket ?? "",
      targetLocations: (niche.targetLocations ?? []).join(", "),
      idealCompanySize: niche.idealCompanySize ?? "",
      targetJobTitles: (niche.targetJobTitles ?? []).join(", "),
      painPoints: niche.painPoints ?? "",
      offer: niche.offer ?? "",
      notes: niche.notes ?? "",
      color: niche.color,
    });
    setEditing(niche);
    setCreating(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast("A niche needs a name", "error");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        targetLocations: splitList(form.targetLocations),
        targetJobTitles: splitList(form.targetJobTitles),
      };
      const response = await fetch(editing ? `/api/niches/${editing.id}` : "/api/niches", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        toast(data.error ?? "Could not save the niche", "error");
        return;
      }
      toast(editing ? `Updated ${form.name}` : `Created ${form.name}`);
      setCreating(false);
      invalidateLookups();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function mutate(niche: NicheStats, body: Record<string, unknown>, message: string) {
    const response = await fetch(`/api/niches/${niche.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      toast("Update failed", "error");
      return;
    }
    toast(message);
    invalidateLookups();
    router.refresh();
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/niches/${deleting.id}`, { method: "DELETE" });
      if (!response.ok) {
        toast("Could not delete the niche", "error");
        return;
      }
      toast(`Deleted ${deleting.name}. Its ${deleting.leadCount} leads are now unassigned.`);
      setDeleting(null);
      invalidateLookups();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          New niche
        </Button>
      </div>

      {niches.length === 0 ? (
        <Card>
          <EmptyState
            title="No niches yet"
            description="Niches group your prospecting by target market. Each one holds its own ICP definition, offer and performance stats."
            action={
              <Button variant="primary" onClick={openCreate}>
                Create your first niche
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {niches.map((niche) => (
            <Card key={niche.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: niche.color }}
                    />
                    <h3 className="truncate text-sm font-semibold text-ink">{niche.name}</h3>
                    {niche.archived && <Badge tone="slate">Archived</Badge>}
                  </div>
                  {niche.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{niche.description}</p>
                  )}
                </div>

                <Dropdown
                  trigger={({ toggle }) => (
                    <Button size="icon" variant="ghost" onClick={toggle} aria-label="Niche actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  )}
                >
                  {({ close }) => (
                    <>
                      <MenuItem
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => {
                          close();
                          openEdit(niche);
                        }}
                      >
                        Edit niche
                      </MenuItem>
                      <MenuItem
                        icon={<Archive className="h-3.5 w-3.5" />}
                        onClick={() => {
                          close();
                          void mutate(
                            niche,
                            { archived: !niche.archived },
                            niche.archived ? `Restored ${niche.name}` : `Archived ${niche.name}`,
                          );
                        }}
                      >
                        {niche.archived ? "Restore" : "Archive"}
                      </MenuItem>
                      <MenuDivider />
                      <MenuItem
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        destructive
                        onClick={() => {
                          close();
                          setDeleting(niche);
                        }}
                      >
                        Delete niche
                      </MenuItem>
                    </>
                  )}
                </Dropdown>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="Leads" value={formatNumber(niche.leadCount)} />
                <Metric label="Contacted" value={formatPercent(rate(niche.contactedCount, niche.leadCount), 0)} />
                <Metric label="Replies" value={formatNumber(niche.replyCount)} />
                <Metric label="Positive" value={formatNumber(niche.positiveCount)} />
                <Metric label="Meetings" value={formatNumber(niche.meetingCount)} />
                <Metric
                  label="Revenue"
                  value={niche.revenue > 0 ? formatCurrency(niche.revenue) : "—"}
                  tone={niche.revenue > 0 ? "positive" : "default"}
                />
              </div>

              {(niche.offer || niche.targetMarket) && (
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  {niche.targetMarket && (
                    <div>
                      <SectionTitle>Target market</SectionTitle>
                      <p className="mt-0.5 text-xs text-ink-soft">{niche.targetMarket}</p>
                    </div>
                  )}
                  {niche.offer && (
                    <div>
                      <SectionTitle>Offer</SectionTitle>
                      <p className="mt-0.5 text-xs text-ink-soft">{niche.offer}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                <Link
                  href={`/leads?nicheIds=${niche.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                  View {formatNumber(niche.leadCount)} leads
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
                <Link
                  href={`/analytics?nicheId=${niche.id}`}
                  className="ml-auto text-xs text-ink-soft hover:text-ink"
                >
                  Performance
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={editing ? `Edit ${editing.name}` : "New niche"}
        description="The ICP fields here are fed to the AI research engine, so the more specific they are the better the scoring."
        size="lg"
        footer={
          <>
            <Button onClick={() => setCreating(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create niche"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required>
              <Input
                value={form.name}
                autoFocus
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Marketing Agencies"
              />
            </Field>
            <Field label="Colour" hint="Used to identify this niche across charts and tables">
              <div className="flex items-center gap-1.5">
                {SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setForm({ ...form, color: swatch })}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${
                      form.color === swatch ? "scale-110 border-ink" : "border-transparent"
                    }`}
                    style={{ background: swatch }}
                    aria-label={`Use colour ${swatch}`}
                  />
                ))}
              </div>
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Target market">
              <Input
                value={form.targetMarket}
                onChange={(e) => setForm({ ...form, targetMarket: e.target.value })}
                placeholder="US agencies with 10–50 staff on retainers"
              />
            </Field>
            <Field label="Ideal company size">
              <Input
                value={form.idealCompanySize}
                onChange={(e) => setForm({ ...form, idealCompanySize: e.target.value })}
                placeholder="10-50"
              />
            </Field>
            <Field label="Target locations" hint="Comma separated">
              <Input
                value={form.targetLocations}
                onChange={(e) => setForm({ ...form, targetLocations: e.target.value })}
                placeholder="United States, United Kingdom"
              />
            </Field>
            <Field label="Target job titles" hint="Comma separated">
              <Input
                value={form.targetJobTitles}
                onChange={(e) => setForm({ ...form, targetJobTitles: e.target.value })}
                placeholder="Founder, Head of Operations"
              />
            </Field>
          </div>

          <Field label="Pain points" hint="What hurts in this niche — the AI uses this when scoring">
            <Textarea
              value={form.painPoints}
              onChange={(e) => setForm({ ...form, painPoints: e.target.value })}
              rows={2}
            />
          </Field>

          <Field label="Offer" hint="What you sell them">
            <Textarea
              value={form.offer}
              onChange={(e) => setForm({ ...form, offer: e.target.value })}
              rows={2}
            />
          </Field>

          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete ${deleting?.name}?`}
        message={`Its ${formatNumber(deleting?.leadCount ?? 0)} leads are kept and become unassigned — no lead data is lost. Archive instead if you may use this niche again.`}
        confirmLabel="Delete niche"
        destructive
        busy={busy}
      />
    </>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive";
}) {
  return (
    <div className="rounded-md bg-canvas px-2 py-1.5">
      <p className="text-[10px] tracking-wide text-ink-faint uppercase">{label}</p>
      <p
        className={`tabular text-sm font-semibold ${
          tone === "positive" ? "text-positive" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
