"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useLookups } from "@/hooks/useLookups";

const BLANK = {
  companyName: "",
  website: "",
  firstName: "",
  lastName: "",
  jobTitle: "",
  email: "",
  phone: "",
  linkedinUrl: "",
  nicheId: "",
  sourceId: "",
  sourceUrl: "",
  industry: "",
  location: "",
  notes: "",
};

type Duplicate = {
  contactId: string;
  matchedOn: string;
  existing: { companyName: string; fullName: string | null; email: string | null };
};

/**
 * Optimised for volume entry: opens focused on the company field, submits with
 * ⌘/Ctrl+Enter, and "Save & add another" keeps the niche and source so a run of
 * leads from the same list can be typed without re-picking them.
 */
export function QuickAddLead({
  trigger,
  defaultNicheId,
  onCreated,
}: {
  trigger: (open: () => void) => React.ReactNode;
  defaultNicheId?: string;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { lookups } = useLookups();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...BLANK, nicheId: defaultNicheId ?? "" });
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  function set<K extends keyof typeof BLANK>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(addAnother: boolean) {
    if (!form.companyName.trim()) {
      setErrors({ companyName: ["Company name is required"] });
      return;
    }
    setBusy(true);
    setDuplicate(null);
    setErrors({});

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();

      if (response.status === 409) {
        setDuplicate(data as Duplicate);
        return;
      }
      if (!response.ok) {
        setErrors(data.issues ?? {});
        toast(data.error ?? "Could not save the lead", "error");
        return;
      }

      toast(
        data.companyReused
          ? `Lead added to existing company ${form.companyName}`
          : `Lead ${form.companyName} added`,
      );

      if (addAnother) {
        // Keep niche + source: consecutive leads usually share both.
        setForm({ ...BLANK, nicheId: form.nicheId, sourceId: form.sourceId });
      } else {
        setOpen(false);
        setForm({ ...BLANK, nicheId: defaultNicheId ?? "" });
      }
      onCreated?.();
      router.refresh();
    } catch {
      toast("Network error — the lead was not saved", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {trigger(() => setOpen(true))}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Quick add lead"
        description="Company name is the only required field. Everything else can be filled in later or by AI research."
        size="lg"
        footer={
          <>
            <span className="mr-auto text-[11px] text-ink-faint">⌘↵ to save</span>
            <Button onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => submit(true)} disabled={busy}>
              Save &amp; add another
            </Button>
            <Button variant="primary" onClick={() => submit(false)} disabled={busy}>
              {busy ? "Saving…" : "Save lead"}
            </Button>
          </>
        }
      >
        <form
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void submit(false);
            }
          }}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
          className="space-y-4"
        >
          {duplicate && (
            <div className="rounded-md border border-warning/25 bg-warning-soft px-3 py-2.5">
              <p className="text-xs font-medium text-warning">
                Duplicate detected — matched on {duplicate.matchedOn}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {duplicate.existing.fullName || duplicate.existing.email} at{" "}
                {duplicate.existing.companyName} already exists. Nothing was created.
              </p>
              <Button
                size="sm"
                className="mt-2"
                onClick={() => {
                  setOpen(false);
                  router.push(`/leads/${duplicate.contactId}`);
                }}
              >
                Open existing lead <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company" required error={errors.companyName?.[0]} className="sm:col-span-2">
              <Input
                data-autofocus
                autoFocus
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                placeholder="Northline Media"
              />
            </Field>
            <Field label="Website" hint="Used as the duplicate key for the company">
              <Input
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
                placeholder="northlinemedia.com"
              />
            </Field>
            <Field label="Industry">
              <Input
                value={form.industry}
                onChange={(e) => set("industry", e.target.value)}
                placeholder="Marketing & Advertising"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name">
              <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </Field>
            <Field label="Last name">
              <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </Field>
            <Field label="Job title">
              <Input
                value={form.jobTitle}
                onChange={(e) => set("jobTitle", e.target.value)}
                placeholder="Head of Operations"
              />
            </Field>
            <Field label="Email" hint="Duplicate key for the contact">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="name@company.com"
              />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="LinkedIn">
              <Input
                value={form.linkedinUrl}
                onChange={(e) => set("linkedinUrl", e.target.value)}
                placeholder="linkedin.com/in/…"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Niche">
              <Select value={form.nicheId} onChange={(e) => set("nicheId", e.target.value)}>
                <option value="">No niche</option>
                {lookups.niches.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Source">
              <Select value={form.sourceId} onChange={(e) => set("sourceId", e.target.value)}>
                <option value="">Unspecified</option>
                {lookups.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Location">
              <Input
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Austin, United States"
              />
            </Field>
          </div>

          <Field label="Source URL" hint="Where you found this lead — kept for source attribution">
            <Input
              value={form.sourceUrl}
              onChange={(e) => set("sourceUrl", e.target.value)}
              placeholder="https://…"
            />
          </Field>

          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </form>
      </Modal>
    </>
  );
}
