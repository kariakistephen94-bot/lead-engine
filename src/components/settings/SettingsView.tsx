"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

export function ProfileSettings({
  name,
  email,
  dailyTarget,
}: {
  name: string;
  email: string;
  dailyTarget: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ name, dailyTarget: String(dailyTarget) });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, dailyTarget: Number(form.dailyTarget) }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast(data.error ?? "Could not save settings", "error");
        return;
      }
      toast("Settings saved");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Your profile" description="Used for activity attribution and daily targets." />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email" hint="Changing the sign-in email is not supported yet.">
          <Input value={email} disabled />
        </Field>
        <Field label="Daily prospecting target" hint="Drives the progress bar on Today's Prospecting.">
          <Input
            type="number"
            min="1"
            value={form.dailyTarget}
            onChange={(e) => setForm({ ...form, dailyTarget: e.target.value })}
          />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </Card>
  );
}
