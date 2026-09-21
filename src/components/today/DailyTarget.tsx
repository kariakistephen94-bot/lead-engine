"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil } from "lucide-react";

import { ProgressBar } from "@/components/charts/StatCard";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

export function DailyTarget({ added, target }: { added: number; target: number }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(target));
  const [busy, setBusy] = useState(false);

  async function save() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      toast("Enter a whole number of prospects", "error");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyTarget: parsed }),
      });
      if (!response.ok) {
        toast("Could not save the target", "error");
        return;
      }
      toast(`Daily target set to ${parsed}`);
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Daily prospecting target"
        description="New leads added to the database today."
        action={
          editing ? null : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Change
            </Button>
          )
        }
      />

      {editing ? (
        <div className="mt-3 flex items-end gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Target per day</span>
            <Input
              type="number"
              min="1"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </label>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button
            onClick={() => {
              setValue(String(target));
              setEditing(false);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <ProgressBar value={added} target={target} />
          <p className="mt-2 text-xs text-ink-soft">
            {added >= target
              ? `Target hit — ${added - target} ahead.`
              : `${target - added} more to hit today's target.`}
          </p>
        </div>
      )}
    </Card>
  );
}
