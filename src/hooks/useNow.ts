"use client";

import { useSyncExternalStore } from "react";

/**
 * The wall clock as an external store.
 *
 * Reading `Date.now()` straight from a render body is impure — it makes the
 * output depend on when React happened to re-render, and it desynchronises the
 * server and client passes during hydration. Modelling the clock as a store
 * keeps render pure: the snapshot is a cached value that only changes through
 * the subscription.
 *
 * The snapshot starts at 0 on both server and client, so hydration matches;
 * subscribing swaps in the real time on the first commit and ticks it
 * afterwards. A minute of granularity is plenty for "is this date overdue".
 */
const TICK_MS = 60_000;

let snapshot = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (timer === null) {
    snapshot = Date.now();
    timer = setInterval(() => {
      snapshot = Date.now();
      emit();
    }, TICK_MS);
    // The first real reading has to reach anyone who subscribed this commit.
    queueMicrotask(emit);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => 0;

/**
 * Current time in epoch milliseconds — `0` for the server render and the
 * hydration pass, the real clock from the first commit onwards.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** True once the clock is live and `iso` is in the past. */
export function isOverdue(iso: string | Date | null | undefined, now: number): boolean {
  if (!iso || now === 0) return false;
  return new Date(iso).getTime() < now;
}
