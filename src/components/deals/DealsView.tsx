"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { StatCard } from "@/components/charts/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { TableShell, Td, Th, Tr } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { useLookups } from "@/hooks/useLookups";
import { DEAL_STAGES } from "@/lib/constants";
import type { DealRow } from "@/lib/services/deals";
import type { DealMetrics } from "@/lib/services/analytics";
import { formatCurrency, formatDate, formatNumber, formatPercent } from "@/lib/utils";

const STAGE_TONE = Object.fromEntries(DEAL_STAGES.map((s) => [s.value, s.tone]));

export function DealsView({
  deals,
  metrics,
  targets,
}: {
  deals: DealRow[];
  metrics: DealMetrics;
  targets: { companyId: string; companyName: string; contactId: string | null }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { lookups } = useLookups();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<DealRow | null>(null);
  const [form, setForm] = useState({
    name: "",
    companyId: "",
    value: "",
    currency: "USD",
    stage: "lead",
    expectedCloseDate: "",
    nicheId: "",
    notes: "",
  });

  async function create() {
    if (!form.name.trim()) {
      toast("A deal needs a name", "error");
      return;
    }
    setBusy(true);
    try {
      const target = targets.find((t) => t.companyId === form.companyId);
      const response = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          companyId: form.companyId || undefined,
          contactId: target?.contactId ?? undefined,
          nicheId: form.nicheId || undefined,
          expectedCloseDate: form.expectedCloseDate || undefined,
          value: Number(form.value || 0),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast(data.error ?? "Could not create the deal", "error");
        return;
      }
      toast(`Deal "${form.name}" created`);
      setOpen(false);
      setForm({ ...form, name: "", value: "", notes: "" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function changeStage(deal: DealRow, stage: string) {
    const response = await fetch(`/api/deals/${deal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (!response.ok) {
      toast("Could not update the deal", "error");
      return;
    }
    toast(`${deal.name} → ${DEAL_STAGES.find((s) => s.value === stage)?.label}`);
    router.refresh();
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/deals/${deleting.id}`, { method: "DELETE" });
      if (!response.ok) {
        toast("Could not delete the deal", "error");
        return;
      }
      toast("Deal deleted");
      setDeleting(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open pipeline"
          value={formatCurrency(metrics.pipelineValue)}
          sub={`${formatCurrency(metrics.weightedValue)} weighted by probability`}
        />
        <StatCard label="Won revenue" value={formatCurrency(metrics.wonRevenue)} tone="positive" />
        <StatCard label="Average deal size" value={formatCurrency(metrics.averageDealSize)} />
        <StatCard
          label="Win rate"
          value={formatPercent(metrics.winRate)}
          sub="of closed deals"
          tone={metrics.winRate >= 50 ? "positive" : "default"}
        />
      </section>

      <Card padded={false}>
        <div className="flex items-start justify-between gap-3 p-4">
          <CardHeader
            title={`Deals (${formatNumber(deals.length)})`}
            description="Change a stage inline. Winning or losing a deal also updates the linked lead."
          />
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New deal
          </Button>
        </div>

        {deals.length === 0 ? (
          <EmptyState
            title="No deals yet"
            description="Create a deal when a qualified lead turns into a real opportunity. Deal revenue feeds the niche and source analytics."
            action={
              <Button variant="primary" onClick={() => setOpen(true)}>
                Create the first deal
              </Button>
            }
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Deal</Th>
                <Th>Company</Th>
                <Th>Contact</Th>
                <Th align="right">Value</Th>
                <Th>Stage</Th>
                <Th align="right">Probability</Th>
                <Th>Expected close</Th>
                <Th>Niche</Th>
                <Th>Source</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <Tr key={deal.id}>
                  <Td className="font-medium text-ink">{deal.name}</Td>
                  <Td>
                    {deal.companyId ? (
                      <Link
                        href={`/companies/${deal.companyId}`}
                        className="hover:text-brand hover:underline"
                      >
                        {deal.companyName}
                      </Link>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </Td>
                  <Td>
                    {deal.contactId ? (
                      <Link href={`/leads/${deal.contactId}`} className="hover:text-brand hover:underline">
                        {deal.contactName?.trim() || "View lead"}
                      </Link>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </Td>
                  <Td align="right" className="tabular font-medium text-ink">
                    {formatCurrency(deal.value, deal.currency)}
                  </Td>
                  <Td>
                    <Select
                      value={deal.stage}
                      onChange={(e) => changeStage(deal, e.target.value)}
                      className="h-7 w-32 text-xs"
                      aria-label={`Stage for ${deal.name}`}
                    >
                      {DEAL_STAGES.map((stage) => (
                        <option key={stage.value} value={stage.value}>
                          {stage.label}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td align="right" className="tabular">
                    {deal.probability}%
                  </Td>
                  <Td className="tabular">
                    {deal.expectedCloseDate ? (
                      formatDate(deal.expectedCloseDate)
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </Td>
                  <Td>
                    {deal.nicheName ? (
                      <Badge tone={STAGE_TONE[deal.stage] ?? "slate"}>{deal.nicheName}</Badge>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </Td>
                  <Td>{deal.sourceName ?? <span className="text-ink-faint">—</span>}</Td>
                  <Td align="right">
                    <button
                      onClick={() => setDeleting(deal)}
                      className="rounded p-1 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100"
                      aria-label={`Delete ${deal.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New deal"
        description="Niche and source are inherited from the company so revenue attribution works automatically."
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create} disabled={busy}>
              {busy ? "Creating…" : "Create deal"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Deal name" required>
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Northline Media — automation retainer"
            />
          </Field>
          <Field label="Company">
            <Select
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value })}
            >
              <option value="">No company</option>
              {targets.map((target) => (
                <option key={target.companyId} value={target.companyId}>
                  {target.companyName}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Value">
              <Input
                type="number"
                min="0"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder="5000"
              />
            </Field>
            <Field label="Currency">
              <Select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                {["USD", "EUR", "GBP", "AUD", "CAD", "AED"].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Stage">
              <Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                {DEAL_STAGES.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Expected close date">
              <Input
                type="date"
                value={form.expectedCloseDate}
                onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })}
              />
            </Field>
            <Field label="Niche" hint="Left blank, it is taken from the company">
              <Select value={form.nicheId} onChange={(e) => setForm({ ...form, nicheId: e.target.value })}>
                <option value="">Inherit from company</option>
                {lookups.niches.map((niche) => (
                  <option key={niche.id} value={niche.id}>
                    {niche.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={`Delete "${deleting?.name}"?`}
        message="The deal is removed permanently. The lead and company are untouched, but this revenue disappears from analytics."
        confirmLabel="Delete deal"
        destructive
        busy={busy}
      />
    </div>
  );
}
