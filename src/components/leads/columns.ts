import type { LeadSortColumn } from "@/lib/validation";

export type LeadColumnKey =
  | "company"
  | "contact"
  | "jobTitle"
  | "email"
  | "phone"
  | "website"
  | "niche"
  | "industry"
  | "location"
  | "employeeCount"
  | "revenue"
  | "leadScore"
  | "status"
  | "source"
  | "lastContacted"
  | "nextFollowUp"
  | "owner"
  | "createdAt";

export type LeadColumn = {
  key: LeadColumnKey;
  label: string;
  sortKey?: LeadSortColumn;
  align?: "left" | "right" | "center";
  /** Shown by default; the rest are opt-in via the Columns menu. */
  defaultVisible: boolean;
  width?: string;
};

export const LEAD_COLUMNS: LeadColumn[] = [
  { key: "company", label: "Company", sortKey: "company", defaultVisible: true, width: "220px" },
  { key: "contact", label: "Contact", sortKey: "contact", defaultVisible: true, width: "180px" },
  { key: "jobTitle", label: "Job title", sortKey: "job_title", defaultVisible: true, width: "170px" },
  { key: "email", label: "Email", defaultVisible: true, width: "220px" },
  { key: "phone", label: "Phone", defaultVisible: false, width: "140px" },
  { key: "website", label: "Website", defaultVisible: false, width: "180px" },
  { key: "niche", label: "Niche", sortKey: "niche", defaultVisible: true, width: "150px" },
  { key: "industry", label: "Industry", sortKey: "industry", defaultVisible: false, width: "170px" },
  { key: "location", label: "Location", sortKey: "location", defaultVisible: true, width: "170px" },
  {
    key: "employeeCount",
    label: "Size",
    sortKey: "employee_count",
    align: "right",
    defaultVisible: false,
    width: "70px",
  },
  {
    key: "revenue",
    label: "Revenue",
    sortKey: "revenue",
    align: "right",
    defaultVisible: false,
    width: "110px",
  },
  {
    key: "leadScore",
    label: "Score",
    sortKey: "lead_score",
    align: "center",
    defaultVisible: true,
    width: "70px",
  },
  { key: "status", label: "Status", sortKey: "status", defaultVisible: true, width: "150px" },
  { key: "source", label: "Source", sortKey: "source", defaultVisible: true, width: "140px" },
  {
    key: "lastContacted",
    label: "Last contacted",
    sortKey: "last_contacted_at",
    defaultVisible: true,
    width: "130px",
  },
  {
    key: "nextFollowUp",
    label: "Next follow-up",
    sortKey: "next_follow_up_at",
    defaultVisible: true,
    width: "130px",
  },
  { key: "owner", label: "Owner", defaultVisible: false, width: "120px" },
  { key: "createdAt", label: "Created", sortKey: "created_at", defaultVisible: true, width: "110px" },
];

export const DEFAULT_VISIBLE_COLUMNS = LEAD_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key);

const STORAGE_KEY = "lead-engine:columns:v1";

function readStorage(): LeadColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_COLUMNS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLUMNS;
    const parsed = JSON.parse(raw) as LeadColumnKey[];
    const valid = parsed.filter((key) => LEAD_COLUMNS.some((c) => c.key === key));
    return valid.length ? valid : DEFAULT_VISIBLE_COLUMNS;
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
}

/**
 * Column visibility lives in localStorage, which is an external store rather
 * than React state — so it is exposed as one. `getSnapshot` has to return a
 * stable reference between changes, hence the cache; and the server snapshot is
 * the defaults, so the server render and the hydration pass agree.
 */
let cachedColumns: LeadColumnKey[] = DEFAULT_VISIBLE_COLUMNS;
let hydrated = false;
const listeners = new Set<() => void>();

function refresh() {
  const next = readStorage();
  const changed =
    next.length !== cachedColumns.length || next.some((key, i) => key !== cachedColumns[i]);
  if (changed) cachedColumns = next;
  return changed;
}

export const visibleColumnsStore = {
  subscribe(onStoreChange: () => void) {
    listeners.add(onStoreChange);
    if (!hydrated) {
      hydrated = true;
      // First read happens after hydration, so the initial client render still
      // matches the server's defaults.
      if (refresh()) queueMicrotask(() => listeners.forEach((l) => l()));
    }
    // Keep other tabs in step.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && refresh()) listeners.forEach((l) => l());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(onStoreChange);
      window.removeEventListener("storage", onStorage);
    };
  },
  getSnapshot: (): LeadColumnKey[] => cachedColumns,
  getServerSnapshot: (): LeadColumnKey[] => DEFAULT_VISIBLE_COLUMNS,
};

export function saveVisibleColumns(columns: LeadColumnKey[]) {
  cachedColumns = columns;
  for (const listener of listeners) listener();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
  } catch {
    /* storage disabled — fall back to session-only visibility */
  }
}
