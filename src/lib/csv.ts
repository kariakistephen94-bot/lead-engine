/**
 * RFC 4180 CSV parser and serialiser.
 *
 * Written by hand rather than pulled from npm because the import path needs
 * quoted-field, embedded-newline and BOM handling and nothing else — and it
 * must run identically on the server (import) and in the browser (preview).
 */

export type CsvTable = { headers: string[]; rows: string[][] };

export function parseCsv(input: string, options?: { maxRows?: number }): CsvTable {
  // Strip UTF-8 BOM — Excel exports include it and it corrupts the first header.
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // Swallow the \n of a \r\n pair.
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      if (options?.maxRows && rows.length > options.maxRows) break;
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }

  const [headerRow = [], ...dataRows] = rows;
  return {
    headers: headerRow.map((h) => h.trim()),
    rows: dataRows,
  };
}

/** Apollo exports are comma-separated; some European tools use semicolons. */
function detectDelimiter(text: string): string {
  const sample = text.slice(0, 4000).split(/\r?\n/).slice(0, 5).join("\n");
  const counts = [",", ";", "\t"].map((d) => ({
    delimiter: d,
    count: sample.split(d).length - 1,
  }));
  return counts.sort((a, b) => b.count - a.count)[0].count > 0
    ? counts.sort((a, b) => b.count - a.count)[0].delimiter
    : ",";
}

export function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  // Quote when the value contains a delimiter, quote or newline.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsvRow(values: unknown[]): string {
  return values.map(toCsvValue).join(",");
}

/** Map a CSV row onto an object using a header -> field mapping. */
export function applyMapping(
  headers: string[],
  row: string[],
  mapping: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((header, index) => {
    const field = mapping[header];
    if (!field || field === "__ignore__") return;
    const value = (row[index] ?? "").trim();
    // Never let a later blank column clobber an earlier populated one.
    if (value && !result[field]) result[field] = value;
  });
  return result;
}

/**
 * Best-effort auto-mapping of common CSV headers, including Apollo's export
 * column names, so the mapping step usually needs no manual work.
 */
const HEADER_ALIASES: Record<string, string[]> = {
  companyName: ["company", "company name", "organization", "organization name", "account name", "employer"],
  website: ["website", "company website", "website url", "domain", "company domain", "url"],
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  jobTitle: ["title", "job title", "position", "role", "headline"],
  email: ["email", "email address", "work email", "primary email", "contact email"],
  // "corporate phone" is deliberately NOT here: it is the company switchboard,
  // and mapping it onto a person would put the wrong number on a direct dial.
  phone: ["phone", "phone number", "mobile", "mobile phone", "work direct phone", "direct phone"],
  linkedinUrl: ["linkedin", "linkedin url", "person linkedin url", "linkedin profile"],
  companyLinkedin: ["company linkedin url", "company linkedin", "organization linkedin"],
  industry: ["industry", "company industry", "sector"],
  location: ["location", "address", "company address"],
  city: ["city", "company city", "contact city"],
  country: ["country", "company country", "contact country"],
  employeeCount: ["employees", "employee count", "# employees", "num employees", "company size", "headcount"],
  revenue: ["revenue", "annual revenue", "company revenue"],
  companyDescription: ["description", "company description", "short description", "seo description"],
  companyPhone: ["company phone", "corporate phone", "organization phone"],
  sourceUrl: ["source url", "source", "lead source url"],
  notes: ["notes", "note", "comments"],
};

export function autoMapHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  for (const header of headers) {
    const normalized = header.trim().toLowerCase();
    const match = Object.entries(HEADER_ALIASES).find(
      ([field, aliases]) => !used.has(field) && aliases.includes(normalized),
    );
    if (match) {
      mapping[header] = match[0];
      used.add(match[0]);
    } else {
      mapping[header] = "__ignore__";
    }
  }

  return mapping;
}

/** Fields an imported row can be mapped onto, shown in the mapping dropdowns. */
export const IMPORT_FIELDS: { value: string; label: string; group: string }[] = [
  { value: "__ignore__", label: "— Ignore this column —", group: "" },
  { value: "companyName", label: "Company name", group: "Company" },
  { value: "website", label: "Website / domain", group: "Company" },
  { value: "industry", label: "Industry", group: "Company" },
  { value: "location", label: "Location", group: "Company" },
  { value: "city", label: "City", group: "Company" },
  { value: "country", label: "Country", group: "Company" },
  { value: "employeeCount", label: "Employee count", group: "Company" },
  { value: "revenue", label: "Revenue", group: "Company" },
  { value: "companyDescription", label: "Company description", group: "Company" },
  { value: "companyPhone", label: "Company phone", group: "Company" },
  { value: "companyLinkedin", label: "Company LinkedIn", group: "Company" },
  { value: "firstName", label: "First name", group: "Contact" },
  { value: "lastName", label: "Last name", group: "Contact" },
  { value: "jobTitle", label: "Job title", group: "Contact" },
  { value: "email", label: "Email", group: "Contact" },
  { value: "phone", label: "Phone", group: "Contact" },
  { value: "linkedinUrl", label: "LinkedIn URL", group: "Contact" },
  { value: "sourceUrl", label: "Source URL", group: "Meta" },
  { value: "notes", label: "Notes", group: "Meta" },
];
