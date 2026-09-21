"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, RotateCcw, Upload } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, SectionTitle } from "@/components/ui/Card";
import { Field, Select } from "@/components/ui/Input";
import { TableShell, Td, Th, Tr } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { useLookups } from "@/hooks/useLookups";
import { applyMapping, autoMapHeaders, IMPORT_FIELDS, parseCsv } from "@/lib/csv";
import { cn, formatNumber } from "@/lib/utils";

const CHUNK_SIZE = 200;

type Step = "upload" | "map" | "importing" | "done";

type Summary = {
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
  merged: number;
  samples: { rowNumber: number; status: string; reason: string }[];
  importId: string | null;
};

const EMPTY_SUMMARY: Summary = {
  total: 0,
  imported: 0,
  duplicates: 0,
  invalid: 0,
  merged: 0,
  samples: [],
  importId: null,
};

export function ImportWizard() {
  const router = useRouter();
  const toast = useToast();
  const { lookups } = useLookups();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [nicheId, setNicheId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [dragging, setDragging] = useState(false);

  // Default the source to "CSV Import" so provenance is right without a click.
  const csvSourceId = lookups.sources.find((s) => s.slug === "csv-import")?.id ?? "";

  async function handleFile(file: File) {
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
      toast("Please choose a .csv file", "error");
      return;
    }

    const text = await file.text();
    const table = parseCsv(text);

    if (!table.headers.length || !table.rows.length) {
      toast("That file has no readable rows", "error");
      return;
    }

    setFilename(file.name);
    setHeaders(table.headers);
    setRows(table.rows);
    setMapping(autoMapHeaders(table.headers));
    setSourceId((current) => current || csvSourceId);
    setStep("map");
  }

  const mappedFields = new Set(Object.values(mapping).filter((f) => f !== "__ignore__"));
  const canImport = mappedFields.has("companyName") || mappedFields.has("website");

  async function runImport() {
    setStep("importing");
    setProgress(0);

    const totals = { ...EMPTY_SUMMARY, total: rows.length };

    try {
      const startResponse = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          filename,
          totalRows: rows.length,
          mapping,
          nicheId: nicheId || null,
          sourceId: sourceId || null,
        }),
      });
      const startData = await startResponse.json();
      if (!startResponse.ok) {
        toast(startData.error ?? "Could not start the import", "error");
        setStep("map");
        return;
      }
      totals.importId = startData.importId;

      for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
        const chunk = rows.slice(offset, offset + CHUNK_SIZE).map((row, index) => ({
          // +2 so the number matches the spreadsheet: 1-based, plus the header row.
          rowNumber: offset + index + 2,
          data: applyMapping(headers, row, mapping),
        }));

        const response = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "chunk",
            importId: startData.importId,
            nicheId: nicheId || null,
            sourceId: sourceId || null,
            rows: chunk,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          toast(error.error ?? "A chunk failed — stopping the import", "error");
          break;
        }

        const result = await response.json();
        totals.imported += result.imported;
        totals.duplicates += result.duplicates;
        totals.invalid += result.invalid;
        totals.merged += result.merged;
        totals.samples = [...totals.samples, ...result.samples].slice(0, 10);

        setProgress(Math.min(rows.length, offset + CHUNK_SIZE));
        setSummary({ ...totals });
      }

      await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish", importId: startData.importId }),
      });

      setSummary({ ...totals });
      setStep("done");
      toast(`Imported ${formatNumber(totals.imported)} leads`);
      router.refresh();
    } catch {
      toast("Network error during import", "error");
      setStep("map");
    }
  }

  function reset() {
    setStep("upload");
    setFilename("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setProgress(0);
    setSummary(EMPTY_SUMMARY);
    if (fileInput.current) fileInput.current.value = "";
  }

  /* ------------------------------- Upload ------------------------------- */

  if (step === "upload") {
    return (
      <Card>
        <CardHeader
          title="Upload a CSV"
          description="Apollo, Sales Navigator, Google Maps scrapes and hand-built sheets all work. Column names are auto-detected."
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            "mt-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 transition-colors",
            dragging ? "border-brand bg-brand-soft" : "border-line-strong bg-canvas",
          )}
        >
          <FileUp className="mb-3 h-7 w-7 text-ink-faint" />
          <p className="text-sm font-medium text-ink">Drop a CSV here</p>
          <p className="mt-1 text-xs text-ink-soft">or choose a file from your computer</p>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button variant="primary" className="mt-4" onClick={() => fileInput.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Choose file
          </Button>
        </div>
      </Card>
    );
  }

  /* -------------------------------- Map --------------------------------- */

  if (step === "map") {
    const previewRows = rows.slice(0, 5);

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader
            title={`Map columns — ${filename}`}
            description={`${formatNumber(rows.length)} data rows found. Fields set to "Ignore" are not imported.`}
            action={
              <Button size="sm" onClick={reset}>
                <RotateCcw className="h-3.5 w-3.5" />
                Choose another file
              </Button>
            }
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label="Assign every imported lead to a niche"
              hint="Optional, but it makes AI research far more accurate."
            >
              <Select value={nicheId} onChange={(e) => setNicheId(e.target.value)}>
                <option value="">No niche</option>
                {lookups.niches.map((niche) => (
                  <option key={niche.id} value={niche.id}>
                    {niche.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Lead source" hint="Recorded on every row so you can measure this source later.">
              <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Unspecified</option>
                {lookups.sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-4">
            <SectionTitle>Column mapping</SectionTitle>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {headers.map((header) => (
                <label key={header} className="rounded-md border border-line bg-canvas p-2">
                  <span className="mb-1 block truncate text-xs font-medium text-ink" title={header}>
                    {header}
                  </span>
                  <Select
                    value={mapping[header] ?? "__ignore__"}
                    onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}
                    className="h-7 text-xs"
                  >
                    {IMPORT_FIELDS.map((field) => (
                      <option key={field.value} value={field.value}>
                        {field.group ? `${field.group} · ${field.label}` : field.label}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
          </div>

          {!canImport && (
            <p className="mt-3 flex items-center gap-2 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Map at least a company name or a website column before importing.
            </p>
          )}
        </Card>

        <Card padded={false}>
          <div className="p-4">
            <CardHeader title="Preview" description="The first five rows, as they will be read." />
          </div>
          <TableShell>
            <thead>
              <tr>
                {headers.map((header) => (
                  <Th key={header}>
                    <span className="block">{header}</span>
                    <span className="block font-normal text-brand normal-case">
                      {mapping[header] === "__ignore__" || !mapping[header]
                        ? "ignored"
                        : (IMPORT_FIELDS.find((f) => f.value === mapping[header])?.label ?? "")}
                    </span>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, index) => (
                <Tr key={index}>
                  {headers.map((header, columnIndex) => (
                    <Td
                      key={header}
                      className={cn(
                        "truncate-cell",
                        mapping[header] === "__ignore__" && "text-ink-faint line-through",
                      )}
                      style={{ maxWidth: "200px" }}
                    >
                      {row[columnIndex] ?? ""}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </TableShell>
        </Card>

        <div className="flex justify-end gap-2">
          <Button onClick={reset}>Cancel</Button>
          <Button variant="primary" size="lg" onClick={runImport} disabled={!canImport}>
            Import {formatNumber(rows.length)} rows
          </Button>
        </div>
      </div>
    );
  }

  /* ----------------------------- Importing ------------------------------ */

  if (step === "importing") {
    const percent = rows.length ? Math.round((progress / rows.length) * 100) : 0;
    return (
      <Card>
        <CardHeader
          title="Importing…"
          description="Each row is checked against the database for duplicates before anything is created."
        />
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-ink-soft">
            <span className="tabular">
              {formatNumber(progress)} / {formatNumber(rows.length)} rows
            </span>
            <span className="tabular">{percent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-300"
              style={{ width: `${Math.max(percent, 2)}%` }}
            />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="Imported" value={summary.imported} tone="positive" />
            <Stat label="Duplicates" value={summary.duplicates} tone="warning" />
            <Stat label="Invalid" value={summary.invalid} tone="danger" />
          </div>
        </div>
      </Card>
    );
  }

  /* -------------------------------- Done -------------------------------- */

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-positive" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-ink">Import complete</h3>
            <p className="mt-0.5 text-xs text-ink-soft">{filename}</p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Rows uploaded" value={summary.total} />
              <Stat label="Imported" value={summary.imported} tone="positive" />
              <Stat label="Duplicates" value={summary.duplicates} tone="warning" />
              <Stat label="Invalid" value={summary.invalid} tone="danger" />
            </div>

            {summary.merged > 0 && (
              <p className="mt-3 text-xs text-ink-soft">
                {formatNumber(summary.merged)} of the duplicates had missing fields filled in from
                the CSV. Existing values were never overwritten.
              </p>
            )}

            {summary.samples.length > 0 && (
              <div className="mt-4">
                <SectionTitle>Why rows were skipped</SectionTitle>
                <ul className="mt-1.5 space-y-1">
                  {summary.samples.map((sample) => (
                    <li key={sample.rowNumber} className="flex gap-2 text-xs">
                      <Badge tone={sample.status === "invalid" ? "red" : "amber"}>
                        Row {sample.rowNumber}
                      </Badge>
                      <span className="text-ink-soft">{sample.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={summary.importId ? `/leads?importId=${summary.importId}` : "/leads"}
                className="inline-flex h-8.5 items-center rounded-md bg-brand px-3 text-sm font-medium text-white hover:bg-brand-ink"
              >
                View imported leads
              </Link>
              <Button onClick={reset}>Import another file</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "positive" | "warning" | "danger";
}) {
  return (
    <div className="rounded-md border border-line bg-canvas px-3 py-2">
      <p className="text-[11px] tracking-wide text-ink-faint uppercase">{label}</p>
      <p
        className={cn(
          "tabular text-lg font-semibold",
          tone === "positive" && "text-positive",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
          tone === "default" && "text-ink",
        )}
      >
        {formatNumber(value)}
      </p>
    </div>
  );
}
