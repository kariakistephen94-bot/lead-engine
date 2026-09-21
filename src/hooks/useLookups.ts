"use client";

import { useEffect, useState } from "react";

import type { Lookups } from "@/lib/services/lookups";

const EMPTY: Lookups = { niches: [], sources: [], tags: [], owners: [] };

/**
 * Reference lists are small and change rarely, so they are cached for the
 * lifetime of the tab rather than refetched per component.
 */
let cache: Lookups | null = null;
let inflight: Promise<Lookups> | null = null;

export function invalidateLookups() {
  cache = null;
  inflight = null;
}

async function load(): Promise<Lookups> {
  if (cache) return cache;
  inflight ??= fetch("/api/lookups")
    .then((r) => (r.ok ? r.json() : EMPTY))
    .then((data: Lookups) => {
      cache = data;
      return data;
    })
    .catch(() => EMPTY)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useLookups(): { lookups: Lookups; loading: boolean; reload: () => void } {
  const [lookups, setLookups] = useState<Lookups>(cache ?? EMPTY);
  const [loading, setLoading] = useState(!cache);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    load().then((data) => {
      if (active) {
        setLookups(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [nonce]);

  return {
    lookups,
    loading,
    reload: () => {
      invalidateLookups();
      // Flipped here rather than in the effect so the effect never sets state
      // synchronously on mount (where `loading` already starts correct).
      setLoading(true);
      setNonce((n) => n + 1);
    },
  };
}
