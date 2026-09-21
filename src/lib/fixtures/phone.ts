/**
 * Phone numbers for generated records (the seed dataset and the mock lead
 * provider).
 *
 * Two requirements pull against each other. The numbers must be *complete* and
 * correctly formatted for the record's own country — a database full of
 * seven-digit stubs never exercises real phone handling, and a UK company
 * showing a +1 number is simply wrong data. But they must also be impossible to
 * dial by accident, because demo data has a habit of being treated as real.
 *
 * So every number here comes from a range a regulator has formally set aside
 * for fiction:
 *
 *  - NANP (US / Canada) — the 555-0100…555-0199 block is reserved for fictional
 *    use, so `+1 <real area code> 555 01XX` cannot reach a subscriber.
 *  - United Kingdom (Ofcom) — 020 7946 0XXX for London landlines and
 *    07700 900XXX for mobiles are reserved for drama.
 *  - Australia (ACMA) — the 5550 XXXX block within each geographic area code is
 *    reserved for film and television.
 *
 * Countries with no reservation this file can point to deliberately return
 * `null`. A blank phone is honest and shows as "—" in the UI; a plausible
 * looking +49, +34 or +971 number is a cold call to a real business.
 */

/** Real area codes, paired to the cities the generators actually use. */
const NANP_AREA_CODES: Record<string, string[]> = {
  "United States": ["212", "312", "512", "303", "404", "206"],
  Canada: ["416", "604", "403"],
};

/** Australian geographic area codes (ACMA reserves 5550 XXXX in each). */
const AU_AREA_CODES = ["2", "3", "7"];

type Random = () => number;

const pick = <T>(list: readonly T[], random: Random): T =>
  list[Math.floor(random() * list.length)];

/** Zero-padded integer in [0, max). */
const digits = (random: Random, count: number, max: number): string =>
  String(Math.floor(random() * max)).padStart(count, "0");

/**
 * A complete, correctly formatted, non-routable number for `country`, in
 * compact E.164 so it stores and dedupes consistently. Returns null when this
 * file has no reserved range for that country — callers should leave the field
 * empty rather than substitute something else.
 */
export function fictionalPhone(country: string | null | undefined, random: Random): string | null {
  if (!country) return null;

  const nanp = NANP_AREA_CODES[country];
  if (nanp) {
    // +1 (NPA) 555-01XX
    return `+1${pick(nanp, random)}555 01${digits(random, 2, 100)}`.replace(" ", "");
  }

  if (country === "United Kingdom") {
    // Roughly a third mobile, matching how a real contact list looks.
    return random() < 0.34
      ? `+447700900${digits(random, 3, 1000)}` // Ofcom drama mobile
      : `+442079460${digits(random, 3, 1000)}`; // Ofcom drama London landline
  }

  if (country === "Australia") {
    // +61 <area> 5550 XXXX
    return `+61${pick(AU_AREA_CODES, random)}5550${digits(random, 4, 10000)}`;
  }

  return null;
}
