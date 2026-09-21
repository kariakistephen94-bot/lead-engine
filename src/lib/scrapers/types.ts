import type { LeadBucket } from "@/db/schema";

/** One posting/opportunity as a scraper found it, before it is stored. */
export type ScrapedJob = {
  source: string;
  sourceId?: string | null;
  /** Canonical permalink — this is the dedupe key. */
  url: string;
  title: string;
  companyName?: string | null;
  location?: string | null;
  remote?: boolean;
  salary?: string | null;
  description?: string | null;
  contactEmail?: string | null;
  postedAt?: Date | null;
  bucket: LeadBucket;
  raw?: unknown;
};

export type ScrapeOptions = {
  /** Search terms to match. Defaults to the engine's own keyword list. */
  terms?: string[];
  /** Upper bound on rows returned, so one run cannot flood the database. */
  limit?: number;
  /** Ignore anything older than this. */
  since?: Date;
};

export interface LeadScraper {
  readonly name: string;
  readonly label: string;
  readonly bucket: LeadBucket;
  /** Where the data comes from, shown in the UI so the origin is never a mystery. */
  readonly origin: string;
  /** False when the adapter needs a key it has not been given. */
  isConfigured(): boolean;
  scrape(options?: ScrapeOptions): Promise<ScrapedJob[]>;
}

export class ScrapeError extends Error {
  constructor(message: string, readonly source: string, readonly cause?: unknown) {
    super(message);
    this.name = "ScrapeError";
  }
}
