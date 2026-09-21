"use client";

import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Browser-side Supabase client. Only ever holds the publishable key, which is
 * designed to be public — row access is decided by RLS and by the server
 * guards, never by the secrecy of this value.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
