import Link from "next/link";

import { PageBody, PageHeader } from "@/components/layout/PageHeader";
import { ImportWizard } from "@/components/import/ImportWizard";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { listImports } from "@/lib/services/import";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const metadata = { title: "Import" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const history = await listImports(10);

  return (
    <>
      <PageHeader
        title="Import leads"
        description="Upload a CSV, map the columns, and import. Duplicates are detected on email, LinkedIn and company domain before anything is written."
      />
      <PageBody className="space-y-4">
        <ImportWizard />

        <Card padded={false}>
          <div className="p-4">
            <CardHeader title="Import history" description="Every batch, with its real outcome." />
          </div>
          {history.length === 0 ? (
            <p className="px-4 pb-5 text-xs text-ink-faint">No imports yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-y border-line bg-canvas text-[11px] tracking-wide text-ink-faint uppercase">
                    <th className="px-4 py-2 text-left font-semibold">File</th>
                    <th className="px-3 py-2 text-left font-semibold">Niche</th>
                    <th className="px-3 py-2 text-left font-semibold">Source</th>
                    <th className="px-3 py-2 text-right font-semibold">Rows</th>
                    <th className="px-3 py-2 text-right font-semibold">Imported</th>
                    <th className="px-3 py-2 text-right font-semibold">Duplicates</th>
                    <th className="px-3 py-2 text-right font-semibold">Invalid</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-4 py-2 text-left font-semibold">When</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 font-medium text-ink">
                        <Link href={`/leads?importId=${item.id}`} className="hover:text-brand hover:underline">
                          {item.filename}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-ink-soft">{item.nicheName ?? "—"}</td>
                      <td className="px-3 py-2 text-ink-soft">{item.sourceName ?? "—"}</td>
                      <td className="tabular px-3 py-2 text-right text-ink-soft">
                        {formatNumber(item.totalRows)}
                      </td>
                      <td className="tabular px-3 py-2 text-right font-medium text-positive">
                        {formatNumber(item.importedCount)}
                      </td>
                      <td className="tabular px-3 py-2 text-right text-warning">
                        {formatNumber(item.duplicateCount)}
                      </td>
                      <td className="tabular px-3 py-2 text-right text-danger">
                        {formatNumber(item.invalidCount)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={item.status === "completed" ? "green" : item.status === "failed" ? "red" : "amber"}>
                          {item.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-ink-soft">{formatDateTime(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PageBody>
    </>
  );
}
