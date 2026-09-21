"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Search, User } from "lucide-react";

import { Spinner } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

type SearchResult = {
  contacts: { id: string; name: string; jobTitle: string | null; email: string | null; company: string }[];
  companies: { id: string; name: string; domain: string | null; industry: string | null }[];
};

const EMPTY: SearchResult = { contacts: [], companies: [] };

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Results are stored alongside the term they belong to, so `loading` can be
  // derived rather than toggled from inside the effect.
  const [fetched, setFetched] = useState<{ term: string; data: SearchResult }>({
    term: "",
    data: EMPTY,
  });
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  const term = query.trim();
  const searching = term.length >= 2;
  // Anything not matching the current term is stale: show nothing and keep the
  // spinner up until the response for *this* term lands.
  const results = searching && fetched.term === term ? fetched.data : EMPTY;
  const loading = searching && fetched.term !== term;

  /* Debounced server search — never filters a client-side copy of the table. */
  useEffect(() => {
    if (term.length < 2) return;

    const id = ++requestId.current;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = await response.json();
        // Drop responses that arrived out of order.
        if (id === requestId.current) setFetched({ term, data: response.ok ? data : EMPTY });
      } catch {
        if (id === requestId.current) setFetched({ term, data: EMPTY });
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router],
  );

  const hasResults = results.contacts.length > 0 || results.companies.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search companies, contacts, email, phone…"
        className={cn(
          "h-8 w-full rounded-md border border-line bg-canvas pr-12 pl-8 text-sm text-ink placeholder:text-ink-faint",
          "transition-colors hover:border-line-strong focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/15 focus:outline-none",
        )}
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-line bg-surface px-1 text-[10px] text-ink-faint sm:block">
        ⌘K
      </kbd>

      {open && searching && (
        <div className="animate-in absolute top-full right-0 left-0 z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg">
          {loading && !hasResults ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-ink-faint">
              <Spinner className="h-3.5 w-3.5" /> Searching…
            </div>
          ) : !hasResults ? (
            <p className="px-3 py-3 text-xs text-ink-faint">No matches for “{term}”</p>
          ) : (
            <>
              {results.contacts.length > 0 && (
                <>
                  <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
                    Leads
                  </p>
                  {results.contacts.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => go(`/leads/${c.id}`)}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted"
                    >
                      <User className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">
                          {c.name || c.email || "Unnamed contact"}
                        </span>
                        <span className="block truncate text-xs text-ink-faint">
                          {[c.jobTitle, c.company].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  ))}
                </>
              )}

              {results.companies.length > 0 && (
                <>
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
                    Companies
                  </p>
                  {results.companies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => go(`/companies/${c.id}`)}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted"
                    >
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{c.name}</span>
                        <span className="block truncate text-xs text-ink-faint">
                          {[c.domain, c.industry].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
