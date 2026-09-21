"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Check, Inbox, Send, Sparkles, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { cn, formatNumber } from "@/lib/utils";

type Account = {
  id: string; label: string; domain: string; fromEmail: string;
  cap: number; dailyCap: number; sentToday: number; remaining: number;
  configured: boolean; warmup: boolean; blockedReason: string | null;
};
type Candidate = {
  id: string; email: string | null; fullName: string | null;
  companyName: string; industry: string | null; country: string | null;
  score: number | null; opportunities: string[] | null;
};
type Message = {
  id: string; toEmail: string; toName: string | null; subject: string;
  bodyText: string; status: string; error: string | null;
  campaignName: string | null; campaignId: string | null;
  basis: string[]; personalisedBy: string | null;
  sentAt: string | null; fromEmail: string | null; companyName: string | null;
};

const TONE: Record<string, "slate" | "blue" | "amber" | "green" | "red"> = {
  draft: "slate", queued: "blue", sending: "amber", sent: "green",
  delivered: "green", opened: "green", replied: "green",
  bounced: "red", complained: "red", failed: "red", skipped: "slate",
};

export function OutreachView({
  accounts, candidates, messages, stats, providerName, senderConfigured,
}: {
  accounts: Account[];
  candidates: Candidate[];
  messages: Message[];
  stats: { statuses: Record<string, number>; suppressed: number };
  providerName: string;
  senderConfigured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"compose" | "outbox" | "accounts">("compose");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [campaignName, setCampaignName] = useState("");
  const [offer, setOffer] = useState("AI automation and short-form video for small businesses");
  const [busy, setBusy] = useState<string | null>(null);

  const capacityToday = accounts.filter((a) => !a.blockedReason).reduce((s, a) => s + a.remaining, 0);
  const drafts = messages.filter((m) => m.status === "draft");
  const liveAccounts = accounts.filter((a) => a.configured).length;

  async function post(url: string, body: unknown, label: string) {
    setBusy(label);
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? "Something went wrong", "error"); return null; }
      router.refresh();
      return data;
    } catch { toast("Request failed", "error"); return null; }
    finally { setBusy(null); }
  }

  async function draft() {
    if (!campaignName.trim()) { toast("Give the campaign a name", "error"); return; }
    if (!selected.size) { toast("Pick at least one lead", "error"); return; }
    const data = await post("/api/outreach/draft",
      { contactIds: [...selected], campaignName: campaignName.trim(), offer: offer.trim() }, "draft");
    if (data) {
      toast(`${formatNumber(data.created)} drafts written${data.skipped.length ? `, ${data.skipped.length} skipped` : ""}`);
      setSelected(new Set());
      setTab("outbox");
    }
  }

  async function approveAndSend(campaignId: string) {
    const approved = await post("/api/outreach/approve", { campaignId }, `approve:${campaignId}`);
    if (!approved) return;
    toast(`${approved.queued} queued`);
    const sent = await post("/api/outreach/send", { limit: capacityToday || 1 }, `send:${campaignId}`);
    if (sent) {
      toast(sent.sent > 0
        ? `${sent.sent} sent${sent.capped ? " — daily cap reached" : ""}`
        : sent.capped ? "No capacity left today" : "Nothing sent", sent.sent > 0 ? "success" : "error");
    }
  }

  return (
    <div className="space-y-4">
      {/* Capacity strip — the number that governs everything else */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Can send today" value={capacityToday} tone="text-ink" big />
        <Stat label="Drafts waiting" value={drafts.length} />
        <Stat label="Sent (all time)" value={(stats.statuses.sent ?? 0) + (stats.statuses.delivered ?? 0) + (stats.statuses.opened ?? 0)} />
        <Stat label="Unsubscribed / bounced" value={stats.suppressed} tone="text-warning" />
      </div>

      {providerName === "mock" && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-ink-soft">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p>
            Personalisation is running on the <strong className="text-ink">mock</strong> writer, so previews are
            template-shaped rather than written. Set <code className="font-mono">AI_PROVIDER=gemini</code> and{" "}
            <code className="font-mono">GEMINI_API_KEY</code> in <code className="font-mono">.env.local</code> for real copy.
          </p>
        </div>
      )}
      {liveAccounts === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-xs text-ink-soft">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
          <p>
            No sending account has a key yet, so nothing can leave. Add your two Resend domains under{" "}
            <button className="font-medium text-brand underline" onClick={() => setTab("accounts")}>Accounts</button>{" "}
            — you can still draft and review copy in the meantime.
          </p>
        </div>
      )}

      {!senderConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-xs text-ink-soft">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
          <p>
            <code className="font-mono">SENDER_NAME</code> and{" "}
            <code className="font-mono">SENDER_POSTAL_ADDRESS</code> aren&apos;t set, so emails go out with no
            sender identity in the footer. A cold email without a real postal address breaks anti-spam law in
            the UK, EU and US — set both in <code className="font-mono">.env.local</code> before sending.
          </p>
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "compose", label: "Compose", count: candidates.length },
          { value: "outbox", label: "Outbox", count: messages.length },
          { value: "accounts", label: "Accounts", count: accounts.length },
        ]}
      />

      {tab === "compose" && (
        <div className="space-y-3">
          <Card>
            <CardHeader title="Campaign" description="What you're selling, in your words. The writer builds each opener from that plus what the scan found on their website." />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Campaign name" required>
                <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)}
                       placeholder="Dentists — no booking, running ads" />
              </Field>
              <Field label="What you're offering">
                <Input value={offer} onChange={(e) => setOffer(e.target.value)} />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-ink-faint">
                {selected.size > 0
                  ? `${formatNumber(selected.size)} selected · you can send ${formatNumber(capacityToday)} today`
                  : "Select leads below — highest opportunity score first."}
              </p>
              <Button variant="primary" onClick={draft} disabled={busy !== null || !selected.size}>
                {busy === "draft" ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Sparkles className="h-3.5 w-3.5" />}
                {busy === "draft" ? "Writing…" : `Write ${selected.size || ""} draft${selected.size === 1 ? "" : "s"}`}
              </Button>
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex items-center justify-between p-4">
              <CardHeader title="Who to email" description="Leads with a real address, not unsubscribed, ranked by how much their site is missing." />
              <Button size="sm" onClick={() =>
                setSelected(selected.size === candidates.length ? new Set() : new Set(candidates.map((c) => c.id)))}>
                {selected.size === candidates.length ? "Clear" : "Select all"}
              </Button>
            </div>
            {candidates.length === 0 ? (
              <EmptyState icon={<Users className="h-5 w-5" />} title="No sendable leads yet"
                          description="Run a website scan from the Lead Engine so the writer has something specific to work from." />
            ) : (
              <ul className="border-t border-line">
                {candidates.map((c) => {
                  const on = selected.has(c.id);
                  return (
                    <li key={c.id} className={cn("flex gap-3 border-b border-line px-4 py-2.5 last:border-0", on && "bg-brand/4")}>
                      <input type="checkbox" checked={on} aria-label={`Select ${c.companyName}`}
                             className="mt-1 h-3.5 w-3.5 shrink-0 accent-brand"
                             onChange={() => setSelected((s) => {
                               const next = new Set(s);
                               if (next.has(c.id)) next.delete(c.id);
                               else next.add(c.id);
                               return next;
                             })} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">{c.companyName}</span>
                          {c.industry && <Badge tone="slate">{c.industry}</Badge>}
                          {c.score != null && (
                            <span className="tabular rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft">{c.score}</span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-soft">
                          {c.email}{c.country ? ` · ${c.country}` : ""}
                        </p>
                        {c.opportunities?.length ? (
                          <p className="mt-1 truncate text-[11px] text-ink-faint">{c.opportunities.slice(0, 3).join(" · ")}</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "outbox" && (
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 p-4">
            <CardHeader title="Outbox" description="Read the copy before it goes. Every draft shows the evidence it was built from." />
            {drafts.length > 0 && drafts[0].campaignId && (
              <Button variant="primary" size="sm" disabled={busy !== null || capacityToday === 0}
                      onClick={() => approveAndSend(drafts[0].campaignId!)}>
                {busy?.startsWith("send") || busy?.startsWith("approve")
                  ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Send className="h-3.5 w-3.5" />}
                Approve &amp; send {drafts.length}
              </Button>
            )}
          </div>
          {messages.length === 0 ? (
            <EmptyState icon={<Inbox className="h-5 w-5" />} title="Nothing drafted yet"
                        description="Pick leads on the Compose tab and write your first batch." />
          ) : (
            <ul className="border-t border-line">
              {messages.map((m) => (
                <li key={m.id} className="border-b border-line px-4 py-3 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[m.status] ?? "slate"}>{m.status}</Badge>
                    <span className="text-sm font-medium text-ink">{m.subject}</span>
                    <span className="text-xs text-ink-faint">
                      → {m.toEmail}{m.companyName ? ` · ${m.companyName}` : ""}
                    </span>
                  </div>
                  <pre className="mt-2 max-h-44 overflow-y-auto rounded border border-line bg-canvas p-2.5 text-xs leading-relaxed whitespace-pre-wrap text-ink-soft">
{m.bodyText}
                  </pre>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                    {m.personalisedBy && <span>written by {m.personalisedBy}</span>}
                    {m.basis?.length > 0 && <span>· based on: {m.basis.slice(0, 3).join("; ")}</span>}
                    {m.fromEmail && <span>· from {m.fromEmail}</span>}
                    {m.error && <span className="text-danger">· {m.error}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "accounts" && <AccountsTab accounts={accounts} onSaved={() => router.refresh()} />}
    </div>
  );
}

function AccountsTab({ accounts, onSaved }: { accounts: Account[]; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    label: "", domain: "", fromEmail: "", fromName: "",
    apiKeyEnv: "RESEND_API_KEY_A", dailyCap: "75",
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/outreach/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dailyCap: Number(form.dailyCap) }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? "Could not save", "error"); return; }
      toast(`${form.label} saved`);
      setForm({ ...form, label: "", domain: "", fromEmail: "", fromName: "" });
      onSaved();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <Card padded={false}>
        <div className="p-4">
          <CardHeader title="Sending domains" description="Volume is split across these. Each has its own key, allowance and reputation." />
        </div>
        {accounts.length === 0 ? (
          <p className="px-4 pb-5 text-xs text-ink-faint">No accounts yet — add your first below.</p>
        ) : (
          <ul className="border-t border-line">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{a.label}</span>
                    {a.warmup && <Badge tone="amber">warming up</Badge>}
                    {!a.configured && <Badge tone="red">no key</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-soft">{a.fromEmail}</p>
                  {a.blockedReason && <p className="mt-0.5 text-[11px] text-warning">{a.blockedReason}</p>}
                </div>
                <div className="text-right">
                  <p className="tabular text-sm font-semibold text-ink">{a.sentToday} / {a.cap}</p>
                  <p className="text-[11px] text-ink-faint">sent today</p>
                </div>
                <div className="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-brand"
                       style={{ width: `${Math.min(100, (a.sentToday / Math.max(1, a.cap)) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Add a sending domain"
                    description="Verify the domain in Resend first (SPF, DKIM and DMARC), or every send is rejected." />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Label" required><Input value={form.label} placeholder="Domain A"
            onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
          <Field label="Domain" required><Input value={form.domain} placeholder="outreach.mysite.com"
            onChange={(e) => setForm({ ...form, domain: e.target.value })} /></Field>
          <Field label="From name" required><Input value={form.fromName} placeholder="Your Name"
            onChange={(e) => setForm({ ...form, fromName: e.target.value })} /></Field>
          <Field label="From email" required><Input value={form.fromEmail} placeholder="you@outreach.mysite.com"
            onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} /></Field>
          <Field label="API key variable" hint="The env var name — never paste the key itself">
            <Select value={form.apiKeyEnv} onChange={(e) => setForm({ ...form, apiKeyEnv: e.target.value })}>
              <option value="RESEND_API_KEY_A">RESEND_API_KEY_A</option>
              <option value="RESEND_API_KEY_B">RESEND_API_KEY_B</option>
            </Select>
          </Field>
          <Field label="Daily cap" hint="75 each across two domains = 150 a day">
            <Input type="number" min={1} value={form.dailyCap}
                   onChange={(e) => setForm({ ...form, dailyCap: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={save} disabled={busy || !form.label || !form.fromEmail}>
            {busy ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Check className="h-3.5 w-3.5" />} Save domain
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: number; tone?: string; big?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5 shadow-xs">
      <p className="text-[11px] tracking-wide text-ink-faint uppercase">{label}</p>
      <p className={cn("tabular mt-0.5 font-semibold", big ? "text-2xl" : "text-lg", tone ?? "text-ink")}>
        {formatNumber(value)}
      </p>
    </div>
  );
}
