"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useLookups } from "@/hooks/useLookups";
import type { LeadContext } from "@/lib/services/lead-detail";
import { cn, formatDate, formatDateTime, formatRelative, toTitleCase } from "@/lib/utils";
import { isOverdue, useNow } from "@/hooks/useNow";

/* ------------------------------- Tags ---------------------------------- */

export function TagPanel({ leadId, tags }: { leadId: string; tags: LeadContext["tags"] }) {
  const router = useRouter();
  const toast = useToast();
  const { lookups } = useLookups();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const available = lookups.tags.filter((t) => !tags.some((existing) => existing.id === t.id));

  async function mutate(method: "POST" | "DELETE", tagId: string) {
    setBusy(true);
    try {
      const url =
        method === "POST" ? `/api/leads/${leadId}/tags` : `/api/leads/${leadId}/tags?tagId=${tagId}`;
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify({ tagId }) } : {}),
      });
      if (!response.ok) {
        toast("Could not update tags", "error");
        return;
      }
      setAdding(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Tags" />
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-0.5 pr-1 pl-2 text-xs text-ink"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: tag.color }} />
            {tag.name}
            <button
              onClick={() => mutate("DELETE", tag.id)}
              disabled={busy}
              className="rounded-full p-0.5 text-ink-faint hover:bg-muted hover:text-danger"
              aria-label={`Remove ${tag.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {tags.length === 0 && !adding && <p className="text-xs text-ink-faint">No tags yet.</p>}

        {adding ? (
          <Select
            autoFocus
            className="h-7 w-44 text-xs"
            defaultValue=""
            disabled={busy}
            onChange={(e) => e.target.value && mutate("POST", e.target.value)}
            onBlur={() => setAdding(false)}
          >
            <option value="">Choose a tag…</option>
            {available.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
        ) : (
          available.length > 0 && (
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2 py-0.5 text-xs text-ink-soft hover:border-brand hover:text-brand"
            >
              <Plus className="h-3 w-3" />
              Add tag
            </button>
          )
        )}
      </div>
    </Card>
  );
}

/* ---------------------------- Follow-ups -------------------------------- */

export function FollowUpPanel({
  leadId,
  followUps,
}: {
  leadId: string;
  followUps: LeadContext["followUps"];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const [form, setForm] = useState({
    dueAt: "",
    type: "email",
    priority: "normal",
    notes: "",
  });

  /** Default the due date to three days out, filled in when the form opens. */
  function openForm() {
    setForm((current) => ({
      ...current,
      dueAt: current.dueAt || new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
    }));
    setOpen((v) => !v);
  }

  const openItems = followUps.filter((f) => !f.completedAt);
  const doneItems = followUps.filter((f) => f.completedAt);

  async function create() {
    setBusy(true);
    try {
      const response = await fetch("/api/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, contactId: leadId }),
      });
      if (!response.ok) {
        toast("Could not schedule the follow-up", "error");
        return;
      }
      toast("Follow-up scheduled");
      setOpen(false);
      setForm({ ...form, notes: "" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function complete(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/follow-ups/${id}`, { method: "PATCH" });
      if (!response.ok) {
        toast("Could not complete the follow-up", "error");
        return;
      }
      toast("Follow-up completed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Follow-ups"
        action={
          <Button size="sm" onClick={openForm}>
            <Plus className="h-3.5 w-3.5" />
            Schedule
          </Button>
        }
      />

      {open && (
        <div className="animate-in mt-3 space-y-2.5 rounded-md border border-line bg-canvas p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Due">
              <Input
                type="date"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="email">Email</option>
                <option value="call">Call</option>
                <option value="linkedin">LinkedIn</option>
                <option value="meeting">Meeting</option>
                <option value="task">Task</option>
              </Select>
            </Field>
            <Field label="Priority">
              <Select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </Select>
            </Field>
          </div>
          <Field label="Notes">
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="What is this follow-up for?"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={create} disabled={busy}>
              {busy ? "Saving…" : "Schedule"}
            </Button>
          </div>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {openItems.map((item) => {
          const overdue = isOverdue(item.dueAt, now);
          return (
            <li key={item.id} className="flex items-start gap-2 rounded-md border border-line px-2.5 py-2">
              <button
                onClick={() => complete(item.id)}
                disabled={busy}
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-line-strong text-transparent hover:border-positive hover:text-positive"
                aria-label="Mark follow-up complete"
              >
                <Check className="h-3 w-3" />
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn("text-xs font-medium", overdue ? "text-danger" : "text-ink")}>
                  {toTitleCase(item.type)} · {formatDate(item.dueAt)}
                  {overdue && " · overdue"}
                </p>
                {item.notes && <p className="mt-0.5 text-xs text-ink-soft">{item.notes}</p>}
              </div>
              {item.priority === "high" && (
                <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-medium text-danger">
                  High
                </span>
              )}
            </li>
          );
        })}

        {openItems.length === 0 && (
          <li className="text-xs text-ink-faint">No follow-ups scheduled.</li>
        )}

        {doneItems.slice(0, 3).map((item) => (
          <li key={item.id} className="flex items-center gap-2 px-2.5 text-xs text-ink-faint">
            <Check className="h-3 w-3 text-positive" />
            <span className="line-through">
              {toTitleCase(item.type)} · {formatDate(item.dueAt)}
            </span>
            <span className="ml-auto">{formatRelative(item.completedAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------- Log activity ------------------------------ */

const ACTIVITY_OPTIONS = [
  { value: "email_sent", label: "Email sent" },
  { value: "email_opened", label: "Email opened" },
  { value: "email_replied", label: "Reply received" },
  { value: "call_made", label: "Call made" },
  { value: "linkedin_message", label: "LinkedIn message" },
  { value: "meeting_booked", label: "Meeting booked" },
  { value: "proposal_sent", label: "Proposal sent" },
];

export function LogActivityPanel({ leadId }: { leadId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ type: "email_sent", subject: "", body: "" });

  async function submit() {
    setBusy(true);
    try {
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, contactId: leadId }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast(data.error ?? "Could not log the activity", "error");
        return;
      }
      toast("Outreach logged");
      setForm({ type: form.type, subject: "", body: "" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Log outreach"
        description="Recording outreach also advances the lead's status and last-contacted date."
      />
      <div className="mt-3 space-y-2.5">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {ACTIVITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subject">
            <Input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Quick question about your intake process"
            />
          </Field>
        </div>
        <Field label="Details">
          <Textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={2}
            placeholder="What was said?"
          />
        </Field>
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={submit} disabled={busy}>
            {busy ? "Logging…" : "Log activity"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------- Notes ---------------------------------- */

export function NotesPanel({ leadId, notes }: { leadId: string; notes: LeadContext["notes"] }) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: leadId, body }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast(data.error ?? "Could not save the note", "error");
        return;
      }
      setBody("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Notes" />
      <div className="mt-3 space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
          }}
          rows={2}
          placeholder="Add a note… (⌘↵ to save)"
        />
        <div className="flex justify-end">
          <Button size="sm" variant="primary" onClick={submit} disabled={busy || !body.trim()}>
            {busy ? "Saving…" : "Add note"}
          </Button>
        </div>
      </div>

      <ul className="mt-3 space-y-2.5">
        {notes.map((note) => (
          <li key={note.id} className="rounded-md border border-line bg-canvas px-3 py-2">
            <p className="text-xs whitespace-pre-wrap text-ink">{note.body}</p>
            <p className="mt-1 text-[11px] text-ink-faint">
              {note.author ?? "Unknown"} · {formatDateTime(note.createdAt)}
            </p>
          </li>
        ))}
        {notes.length === 0 && <li className="text-xs text-ink-faint">No notes yet.</li>}
      </ul>
    </Card>
  );
}
