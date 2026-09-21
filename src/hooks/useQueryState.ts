"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

/**
 * The lead table's state lives in the URL, not in React state.
 *
 * That keeps filters shareable and bookmarkable, lets the server do the
 * filtering/paging, and means the back button behaves the way people expect.
 */
export function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = useCallback(
    (mutate: (params: URLSearchParams) => void, options?: { resetPage?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      // Any change to filters or sorting invalidates the current page number.
      if (options?.resetPage !== false) params.delete("page");

      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const setParam = useCallback(
    (key: string, value: string | number | null | undefined, options?: { resetPage?: boolean }) => {
      apply((params) => {
        if (value === null || value === undefined || value === "") params.delete(key);
        else params.set(key, String(value));
      }, options);
    },
    [apply],
  );

  const setMulti = useCallback(
    (key: string, values: string[]) => {
      apply((params) => {
        if (values.length) params.set(key, values.join(","));
        else params.delete(key);
      });
    },
    [apply],
  );

  const toggleMulti = useCallback(
    (key: string, value: string) => {
      apply((params) => {
        const current = (params.get(key) ?? "").split(",").filter(Boolean);
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        if (next.length) params.set(key, next.join(","));
        else params.delete(key);
      });
    },
    [apply],
  );

  const clearAll = useCallback(
    (keep: string[] = []) => {
      apply((params) => {
        for (const key of [...params.keys()]) {
          if (!keep.includes(key)) params.delete(key);
        }
      });
    },
    [apply],
  );

  const getMulti = useCallback(
    (key: string): string[] => (searchParams.get(key) ?? "").split(",").filter(Boolean),
    [searchParams],
  );

  return { searchParams, setParam, setMulti, toggleMulti, clearAll, getMulti, pending };
}
