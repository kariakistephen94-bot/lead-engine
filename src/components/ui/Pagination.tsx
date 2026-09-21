"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { PAGE_SIZES } from "@/lib/constants";
import { formatNumber } from "@/lib/utils";
import { Button } from "./Button";
import { Select } from "./Input";

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  label = "leads",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  label?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2">
      <p className="text-xs text-ink-soft">
        {total === 0 ? (
          <>No {label}</>
        ) : (
          <>
            <span className="tabular font-medium text-ink">
              {formatNumber(from)}–{formatNumber(to)}
            </span>{" "}
            of <span className="tabular font-medium text-ink">{formatNumber(total)}</span> {label}
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          Rows
          <Select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-7 w-18 text-xs"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </label>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            className="h-7 w-7"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="tabular px-1 text-xs text-ink-soft">
            {formatNumber(page)} / {formatNumber(pageCount)}
          </span>
          <Button
            size="icon"
            className="h-7 w-7"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
