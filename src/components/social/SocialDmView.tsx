"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle, AtSign, Camera, Check, Copy,
  MessageCircle, Send, Sparkles, UserPlus, Users,
} from "lucide-react";

/** lucide dropped brand marks, so platforms get evocative stand-ins. */
const Instagram = Camera;
const X = AtSign;
const LinkedIn = Users;

type Platform = "instagram" | "twitter" | "linkedin";

const PLATFORM_ICON: Record<Platform, React.ElementType> = {
  instagram: Instagram, twitter: X, linkedin: LinkedIn,
};

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram", twitter: "X", linkedin: "LinkedIn",
};

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { cn, formatNumber } from "@/lib/utils";

type Prospect = {
  id: string; fullName: string | null; companyName: string;
  industry: string | null; country: string | null; status: string;
  instagram: string | null;
  twitter: string | null; linkedin: string | null;
  runsAds: boolean; adPlatforms: string[];
  score: number | null; opportunities: string[];
  drafted: string[]; fromX: boolean;
};

type Draft = {
  id: string; contactId: string; platform: Platform;
  handle: string; connectionNote: string | null;
  firstMessage: string; secondMessage: string;
  basisUsed: string[]; generatedBy: string | null; offer: string | null;
  status: string; firstSentAt: string | null; secondSentAt: string | null;
  createdAt: string; fullName: string | null; companyName: string;
  country: string | null;
};

const STATUS_TONE: Record<string, "slate" | "blue" | "indigo" | "amber" | "green" | "red"> = {
  draft: "slate", connect_sent: "indigo", first_sent: "blue", second_sent: "amber",
  replied: "green", dismissed: "red",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "draft", connect_sent: "request sent", first_sent: "opener sent",
  second_sent: "follow-up sent", replied: "replied", dismissed: "dismissed",
};

const profileUrl = (platform: Platform, handle: string) => {
  switch (platform) {
    case "instagram": return `https://www.instagram.com/${handle}/`;
    case "twitter": return `https://x.com/${handle}`;
    // Newer scans store the path segment ("in/jane"); older rows hold a bare slug.
    case "linkedin": return `https://www.linkedin.com/${handle.includes("/") ? handle : `company/${handle}`}`;
  }
};

/** LinkedIn handles are a path, not an @name. */
const handleLabel = (platform: string, handle: string) =>
  platform === "linkedin" ? handle.replace(/^in\//, "") : `@${handle}`;

export function SocialDmView({
  prospects, drafts, stats, providerName,
}: {
  prospects: Prospect[];
  drafts: Draft[];
  stats: Partial<Record<string, number>>;
  providerName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"prospects" | "scripts">("prospects");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [offer, setOffer] = useState("AI automation and short-form video for small businesses");
  const [platform, setPlatform] = useState<Platform | "auto">("auto");
  const [busy, setBusy] = useState<string | null>(null);

  const inPlay = (stats.first_sent ?? 0) + (stats.second_sent ?? 0);

  async function writeScripts() {
    if (!selected.size) { toast("Pick at least one lead", "error"); return; }
    setBusy("draft");
    try {
      const res = await fetch("/api/dm/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: [...selected],
          offer: offer.trim(),
          ...(platform === "auto" ? {} : { platform }),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? "Something went wrong", "error"); return; }
      toast(`${formatNumber(data.created)} scripts written${data.skipped.length ? `, ${data.skipped.length} skipped` : ""}`);
      setSelected(new Set());
      setTab("scripts");
      router.refresh();
    } catch { toast("Request failed", "error"); }
    finally { setBusy(null); }
  }

  async function setStatus(id: string, status: string, label: string) {
    setBusy(`${status}:${id}`);
    try {
      const res = await fetch(`/api/dm/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error ?? "Something went wrong", "error"); return; }
      toast(label);
      router.refresh();
    } catch { toast("Request failed", "error"); }
    finally { setBusy(null); }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast(`${label} copied — paste it into the DM`),
      () => toast("Could not copy", "error"),
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="DM-able leads" value={prospects.length} big />
        <Stat label="Scripts drafted" value={stats.draft ?? 0} />
        <Stat label="Sequences in play" value={inPlay} />
        <Stat label="Replied" value={stats.replied ?? 0} tone="text-positive" />
      </div>

      {providerName === "mock" && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-ink-soft">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p>
            Scripts are coming from the <strong className="text-ink">mock</strong> writer, so they read
            template-shaped. Set <code className="font-mono">AI_PROVIDER=gemini</code> and{" "}
            <code className="font-mono">GEMINI_API_KEY</code> in <code className="font-mono">.env.local</code>{" "}
            for researched, lead-specific copy.
          </p>
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "prospects", label: "Prospects", count: prospects.length },
          { value: "scripts", label: "Scripts", count: drafts.length },
        ]}
      />

      {tab === "prospects" && (
        <div className="space-y-3">
          <Card>
            <CardHeader
              title="What you're offering"
              description="The writer builds the messages from this plus what the website scan observed. On LinkedIn it also writes the connection-request note, since that is the first thing they read."
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <Field label="Offer">
                <Input value={offer} onChange={(e) => setOffer(e.target.value)} />
              </Field>
              <Field label="Platform" hint="Auto picks the best handle on file">
                <Select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as Platform | "auto")}
                >
                  <option value="auto">Auto</option>
                  <option value="instagram">Instagram</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="twitter">X</option>
                </Select>
              </Field>
              <Button variant="primary" onClick={writeScripts} disabled={busy !== null || !selected.size}>
                {busy === "draft" ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Sparkles className="h-3.5 w-3.5" />}
                {busy === "draft" ? "Writing…" : `Write ${selected.size || ""} script${selected.size === 1 ? "" : "s"}`}
              </Button>
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex items-center justify-between p-4">
              <CardHeader
                title="Who to DM"
                description="Their own website links these accounts, so the handle is verified. Ads-running leads first — they're already spending."
              />
              <Button size="sm" onClick={() =>
                setSelected(selected.size === prospects.length ? new Set() : new Set(prospects.map((p) => p.id)))}>
                {selected.size === prospects.length ? "Clear" : "Select all"}
              </Button>
            </div>
            {prospects.length === 0 ? (
              <EmptyState icon={<Users className="h-5 w-5" />} title="No DM-able leads yet"
                          description="Run a website scan from the Lead Engine, or convert leads found on X — any lead whose site links an Instagram, LinkedIn or X account shows up here. LinkedIn company pages are excluded: they cannot accept a connection request." />
            ) : (
              <ul className="border-t border-line">
                {prospects.map((p) => {
                  const on = selected.has(p.id);
                  return (
                    <li key={p.id} className={cn("flex gap-3 border-b border-line px-4 py-2.5 last:border-0", on && "bg-brand/4")}>
                      <input type="checkbox" checked={on} aria-label={`Select ${p.companyName}`}
                             className="mt-1 h-3.5 w-3.5 shrink-0 accent-brand"
                             onChange={() => setSelected((s) => {
                               const next = new Set(s);
                               if (next.has(p.id)) next.delete(p.id);
                               else next.add(p.id);
                               return next;
                             })} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">{p.companyName}</span>
                          {p.industry && <Badge tone="slate">{p.industry}</Badge>}
                          {p.runsAds && <Badge tone="green">running ads</Badge>}
                          {p.fromX && <Badge tone="indigo">found on X</Badge>}
                          {p.drafted.length > 0 && <Badge tone="blue">scripted</Badge>}
                          {p.score != null && (
                            <span className="tabular rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft">{p.score}</span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                          {p.instagram && (
                            <a href={profileUrl("instagram", p.instagram)} target="_blank" rel="noreferrer"
                               className="inline-flex items-center gap-1 text-brand hover:underline">
                              <Instagram className="h-3 w-3" /> @{p.instagram}
                            </a>
                          )}
                          {p.linkedin && (
                            <a href={profileUrl("linkedin", p.linkedin)} target="_blank" rel="noreferrer"
                               className="inline-flex items-center gap-1 text-brand hover:underline">
                              <LinkedIn className="h-3 w-3" /> {handleLabel("linkedin", p.linkedin)}
                            </a>
                          )}
                          {p.twitter && (
                            <a href={profileUrl("twitter", p.twitter)} target="_blank" rel="noreferrer"
                               className="inline-flex items-center gap-1 text-brand hover:underline">
                              <X className="h-3 w-3" /> @{p.twitter}
                            </a>
                          )}
                          {p.country && <span className="text-ink-faint">{p.country}</span>}
                        </div>
                        {p.opportunities.length > 0 && (
                          <p className="mt-1 truncate text-[11px] text-ink-faint">{p.opportunities.slice(0, 3).join(" · ")}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "scripts" && (
        <Card padded={false}>
          <div className="p-4">
            <CardHeader
              title="Scripts"
              description="Copy message one into their DMs, warm the account first (like two posts, leave one real comment), then mark it sent. On LinkedIn the connection note goes first and the opener waits until they accept. Message two goes out 3–5 days later only if they stay quiet — a reminder is booked automatically."
            />
          </div>
          {drafts.length === 0 ? (
            <EmptyState icon={<MessageCircle className="h-5 w-5" />} title="Nothing written yet"
                        description="Pick leads on the Prospects tab and write your first batch of scripts." />
          ) : (
            <ul className="border-t border-line">
              {drafts.map((d) => (
                <li key={d.id} className="border-b border-line px-4 py-3 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[d.status] ?? "slate"}>{STATUS_LABEL[d.status] ?? d.status}</Badge>
                    <PlatformIcon platform={d.platform} />
                    <span className="text-sm font-medium text-ink">{d.companyName}</span>
                    <a href={profileUrl(d.platform, d.handle)} target="_blank" rel="noreferrer"
                       className="text-xs text-brand hover:underline">{handleLabel(d.platform, d.handle)}</a>
                    <span className="text-[11px] text-ink-faint">{PLATFORM_LABEL[d.platform]}</span>
                  </div>

                  {d.connectionNote && (
                    <MessageBlock
                      label={`Connection request note — ${d.connectionNote.length}/300 characters`}
                      text={d.connectionNote}
                      onCopy={() => copy(d.connectionNote!, "Connection note")}
                    />
                  )}
                  <MessageBlock
                    label={d.platform === "linkedin" ? "Message 1 — opener (after they accept)" : "Message 1 — opener"}
                    text={d.firstMessage}
                    onCopy={() => copy(d.firstMessage, "Opener")} />
                  <MessageBlock label="Message 2 — follow-up (3–5 days later, only if no reply)" text={d.secondMessage}
                                onCopy={() => copy(d.secondMessage, "Follow-up")} />

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {d.status === "draft" && d.platform === "linkedin" && (
                      <Button size="sm" variant="primary" disabled={busy !== null}
                              onClick={() => setStatus(d.id, "connect_sent", "Request sent — a check is booked for 3 days")}>
                        <UserPlus className="h-3 w-3" /> I sent the request
                      </Button>
                    )}
                    {(d.status === "draft" && d.platform !== "linkedin") || d.status === "connect_sent" ? (
                      <Button size="sm" variant="primary" disabled={busy !== null}
                              onClick={() => setStatus(d.id, "first_sent", "Marked opener as sent — follow-up booked for 3 days")}>
                        <Send className="h-3 w-3" /> I sent the opener
                      </Button>
                    ) : null}
                    {d.status === "first_sent" && (
                      <Button size="sm" variant="primary" disabled={busy !== null}
                              onClick={() => setStatus(d.id, "second_sent", "Marked follow-up as sent")}>
                        <Send className="h-3 w-3" /> I sent the follow-up
                      </Button>
                    )}
                    {(d.status === "connect_sent" || d.status === "first_sent" || d.status === "second_sent") && (
                      <Button size="sm" disabled={busy !== null}
                              onClick={() => setStatus(d.id, "replied", "Nice — lead moved to Replied")}>
                        <Check className="h-3 w-3" /> They replied
                      </Button>
                    )}
                    {d.status !== "dismissed" && d.status !== "replied" && (
                      <Button size="sm" variant="ghost" disabled={busy !== null}
                              onClick={() => setStatus(d.id, "dismissed", "Script dismissed")}>
                        Dismiss
                      </Button>
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-faint">
                    {d.generatedBy && <span>written by {d.generatedBy}</span>}
                    {d.basisUsed.length > 0 && <span>· based on: {d.basisUsed.slice(0, 3).join("; ")}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function PlatformIcon({ platform }: { platform: Platform }) {
  const Icon = PLATFORM_ICON[platform];
  return <Icon className="h-3.5 w-3.5 text-ink-faint" />;
}

function MessageBlock({ label, text, onCopy }: { label: string; text: string; onCopy: () => void }) {
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">{label}</p>
        <button onClick={onCopy}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-soft hover:bg-muted hover:text-ink">
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
      <pre className="mt-1 rounded border border-line bg-canvas p-2.5 text-xs leading-relaxed whitespace-pre-wrap text-ink-soft">
{text}
      </pre>
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
