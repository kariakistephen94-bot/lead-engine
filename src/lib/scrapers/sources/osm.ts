import { ScrapeError } from "../types";
import { USER_AGENT } from "../http";

/**
 * OpenStreetMap / Overpass — the engine's business-directory source.
 *
 * Unlike the job-board scrapers, this finds *businesses* rather than postings,
 * so it does not implement `LeadScraper`. What it returns is a candidate: a
 * real, mapped premises with a website. Whether that candidate becomes a lead
 * is decided later by actually reading the site (see `services/harvest.ts`) —
 * a stale OSM entry pointing at a dead domain is not a lead.
 *
 * OSM data is ODbL-licensed and public. Every record keeps its permalink in
 * `sourceUrl`, so any field can be traced back to the element it came from.
 *
 * Queries are bounding-box, never `area[...]`: the area lookup goes through
 * Overpass's dispatcher and is the first thing to time out when the public
 * instances are busy, while a bbox query over the same ground answers in
 * seconds.
 */

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

/** [south, west, north, east] */
export type BBox = [number, number, number, number];

export type OsmArea = {
  city: string;
  /** State/province code, or region name — goes into `location`. */
  region: string;
  country:
    | "United States"
    | "United Kingdom"
    | "Canada"
    | "Germany"
    | "France"
    | "Australia";
  bbox: BBox;
};

export type OsmCategory = {
  /** Niche slug in the `niches` table. */
  niche: string;
  /** Human industry label stored on the company. */
  industry: string;
  /** Overpass tag filters, each applied to nodes, ways and relations. */
  selectors: string[];
};

export type OsmPlace = {
  osmType: string;
  osmId: number;
  /** `way/123456` — stable identity for de-duplicating a harvest. */
  osmRef: string;
  sourceUrl: string;
  name: string;
  website: string;
  phone: string | null;
  email: string | null;
  street: string | null;
  city: string;
  region: string;
  postcode: string | null;
  country: string;
  niche: string;
  industry: string;
  lat: number | null;
  lon: number | null;
};

/**
 * Categories map onto the five starter niches. Each selector is a tag
 * combination that reliably identifies that trade in OSM — `craft=*` covers the
 * home-service trades, `office=*` the professional services.
 */
export const OSM_CATEGORIES: OsmCategory[] = [
  {
    niche: "dental-practices",
    industry: "Healthcare / Dental",
    selectors: [`["amenity"="dentist"]`, `["healthcare"="dentist"]`, `["healthcare:speciality"="orthodontics"]`],
  },
  {
    niche: "real-estate-agencies",
    industry: "Real Estate",
    selectors: [`["office"="estate_agent"]`, `["shop"="estate_agent"]`, `["office"="property_management"]`],
  },
  {
    niche: "marketing-agencies",
    industry: "Marketing & Advertising",
    selectors: [
      `["office"="advertising_agency"]`,
      `["office"="marketing"]`,
      `["office"="graphic_design"]`,
      `["office"="web_design"]`,
      `["craft"="photographer"]`,
      `["office"="video_production"]`,
    ],
  },
  {
    niche: "recruiting-agencies",
    industry: "Staffing & Recruiting",
    selectors: [`["office"="employment_agency"]`, `["office"="recruitment"]`, `["office"="staffing_agency"]`],
  },
  {
    niche: "home-service-businesses",
    industry: "Construction & Home Services",
    selectors: [
      `["craft"~"^(plumber|electrician|hvac|roofer|carpenter|painter|builder|gardener|landscaper|window_construction|floorer|tiler|glaziery|stonemason|joiner|locksmith|insulation|pest_control|chimney_sweeper)$"]`,
      `["shop"="hvac"]`,
      `["shop"="doityourself"]["website"]`,
      `["office"="construction_company"]`,
      `["trade"="hvac"]`,
    ],
  },
];

/** Which niche a raw OSM tag set belongs to — an element only ever counts once. */
function classify(tags: Record<string, string>): OsmCategory | null {
  if (tags.amenity === "dentist" || tags.healthcare === "dentist" || tags["healthcare:speciality"] === "orthodontics")
    return OSM_CATEGORIES[0];
  if (tags.office === "estate_agent" || tags.shop === "estate_agent" || tags.office === "property_management")
    return OSM_CATEGORIES[1];
  if (["advertising_agency", "marketing", "graphic_design", "web_design"].includes(tags.office ?? "") || tags.craft === "photographer")
    return OSM_CATEGORIES[2];
  if (["employment_agency", "recruitment", "staffing_agency"].includes(tags.office ?? ""))
    return OSM_CATEGORIES[3];
  if (tags.craft || tags.shop === "hvac" || tags.shop === "doityourself" || tags.office === "construction_company" || tags.trade === "hvac")
    return OSM_CATEGORIES[4];
  return null;
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run one Overpass query, rotating endpoints on failure.
 *
 * The public instances routinely answer "too busy" mid-run, so a single failure
 * must not end a harvest: each attempt moves to the next mirror and waits
 * longer, and only an exhausted rotation is an error.
 */
async function overpass(query: string, options: { attempts?: number; startIndex?: number } = {}): Promise<OverpassElement[]> {
  const { attempts = 5, startIndex = 0 } = options;
  let lastError = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    const endpoint = ENDPOINTS[(startIndex + attempt) % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
        body: new URLSearchParams({ data: query }).toString(),
        // A bounding-box query that has not answered in a minute is queued
        // behind someone else's continental extract; the next mirror is faster
        // than waiting it out.
        signal: AbortSignal.timeout(60_000),
      });
      const body = await res.text();
      // Overpass reports load shedding as HTML with a 200, so status alone is not enough.
      if (!res.ok || body.trimStart().startsWith("<")) {
        lastError = `HTTP ${res.status} from ${endpoint}${/too busy/i.test(body) ? " (server busy)" : ""}`;
      } else {
        return (JSON.parse(body).elements ?? []) as OverpassElement[];
      }
    } catch (e) {
      lastError = `${endpoint}: ${e instanceof Error ? e.message : String(e)}`;
    }
    await sleep(Math.min(15_000, 2_000 * 2 ** attempt));
  }
  throw new ScrapeError(`Overpass failed after ${attempts} attempts — ${lastError}`, "openstreetmap");
}

const tag = (tags: Record<string, string>, ...keys: string[]): string | null => {
  for (const key of keys) {
    const value = tags[key]?.trim();
    if (value) return value;
  }
  return null;
};

/** Businesses of every target category inside one bounding box. */
export async function harvestArea(
  area: OsmArea,
  categories: OsmCategory[] = OSM_CATEGORIES,
  /*
   * Which mirror to start on. Two harvest workers running side by side pass
   * different offsets, so they never queue behind each other on the same
   * server — one request per mirror at a time is what the instances ask for.
   */
  endpointOffset = 0,
): Promise<OsmPlace[]> {
  const [s, w, n, e] = area.bbox;
  const filters = categories
    .flatMap((c) => c.selectors)
    // `website` is required at query time: a business with no site cannot be
    // qualified, and fetching them would multiply the result set for nothing.
    .flatMap((sel) => [`  nwr${sel}["website"];`, `  nwr${sel}["contact:website"];`])
    .join("\n");

  const query = `[out:json][timeout:120][bbox:${s},${w},${n},${e}];\n(\n${filters}\n);\nout center tags;`;
  const elements = await overpass(query, { startIndex: endpointOffset });

  const places: OsmPlace[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tag(tags, "name", "operator", "brand");
    const website = tag(tags, "website", "contact:website", "url");
    const category = classify(tags);
    if (!name || !website || !category) continue;

    const osmRef = `${el.type}/${el.id}`;
    if (seen.has(osmRef)) continue;
    seen.add(osmRef);

    // A branch of a national chain is not a small business to sell to, and its
    // marketing is not bought locally. `brand` set without `operator` is the
    // usual marker; keep independents that merely tagged their own brand name.
    if (tags.brand && tags["brand:wikidata"]) continue;

    places.push({
      osmType: el.type,
      osmId: el.id,
      osmRef,
      sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      name: name.slice(0, 200),
      website,
      phone: tag(tags, "contact:phone", "phone", "contact:mobile"),
      email: tag(tags, "contact:email", "email"),
      street: [tag(tags, "addr:housenumber"), tag(tags, "addr:street")].filter(Boolean).join(" ") || null,
      city: tag(tags, "addr:city") ?? area.city,
      region: tag(tags, "addr:state") ?? area.region,
      postcode: tag(tags, "addr:postcode"),
      country: area.country,
      niche: category.niche,
      industry: category.industry,
      lat: el.lat ?? el.center?.lat ?? null,
      lon: el.lon ?? el.center?.lon ?? null,
    });
  }

  return places;
}

/**
 * US metros, chosen for population spread rather than density of any one state,
 * so a run does not return four hundred dentists from the same city.
 */
export const US_METROS: OsmArea[] = ([
  ["New York", "NY", [40.55, -74.10, 40.92, -73.70]],
  ["Long Island", "NY", [40.62, -73.70, 40.85, -73.40]],
  ["Newark", "NJ", [40.66, -74.28, 40.82, -74.10]],
  ["Jersey City", "NJ", [40.68, -74.10, 40.79, -74.00]],
  ["Stamford", "CT", [41.02, -73.60, 41.15, -73.35]],
  ["Hartford", "CT", [41.68, -72.78, 41.83, -72.60]],
  ["Boston", "MA", [42.23, -71.19, 42.42, -70.98]],
  ["Providence", "RI", [41.76, -71.50, 41.90, -71.33]],
  ["Philadelphia", "PA", [39.87, -75.30, 40.14, -74.95]],
  ["Pittsburgh", "PA", [40.34, -80.12, 40.52, -79.84]],
  ["Baltimore", "MD", [39.18, -76.74, 39.40, -76.50]],
  ["Washington", "DC", [38.79, -77.14, 39.00, -76.88]],
  ["Arlington", "VA", [38.83, -77.18, 38.93, -77.05]],
  ["Richmond", "VA", [37.44, -77.58, 37.63, -77.38]],
  ["Virginia Beach", "VA", [36.70, -76.22, 36.93, -75.94]],
  ["Raleigh", "NC", [35.70, -78.78, 35.95, -78.50]],
  ["Charlotte", "NC", [35.08, -81.02, 35.42, -80.62]],
  ["Greenville", "SC", [34.76, -82.48, 34.92, -82.28]],
  ["Charleston", "SC", [32.70, -80.08, 32.92, -79.84]],
  ["Atlanta", "GA", [33.62, -84.58, 33.92, -84.24]],
  ["Savannah", "GA", [31.98, -81.20, 32.12, -81.03]],
  ["Jacksonville", "FL", [30.14, -81.86, 30.52, -81.38]],
  ["Orlando", "FL", [28.40, -81.50, 28.64, -81.22]],
  ["Tampa", "FL", [27.85, -82.58, 28.12, -82.33]],
  ["Miami", "FL", [25.63, -80.38, 25.92, -80.12]],
  ["Fort Lauderdale", "FL", [26.04, -80.28, 26.28, -80.08]],
  ["Birmingham", "AL", [33.40, -86.92, 33.62, -86.62]],
  ["Nashville", "TN", [36.03, -86.96, 36.32, -86.58]],
  ["Knoxville", "TN", [35.88, -84.08, 36.06, -83.82]],
  ["Memphis", "TN", [34.98, -90.18, 35.28, -89.72]],
  ["Louisville", "KY", [38.08, -85.92, 38.36, -85.52]],
  ["New Orleans", "LA", [29.88, -90.16, 30.05, -89.92]],
  ["Little Rock", "AR", [34.66, -92.45, 34.84, -92.18]],
  ["Columbus", "OH", [39.84, -83.22, 40.16, -82.78]],
  ["Cleveland", "OH", [41.38, -81.86, 41.62, -81.50]],
  ["Cincinnati", "OH", [39.04, -84.68, 39.25, -84.38]],
  ["Detroit", "MI", [42.23, -83.32, 42.47, -82.88]],
  ["Grand Rapids", "MI", [42.88, -85.74, 43.04, -85.52]],
  ["Indianapolis", "IN", [39.62, -86.38, 39.95, -85.92]],
  ["Chicago", "IL", [41.64, -87.94, 42.05, -87.50]],
  ["Milwaukee", "WI", [42.90, -88.10, 43.15, -87.84]],
  ["Madison", "WI", [43.00, -89.52, 43.16, -89.28]],
  ["Minneapolis", "MN", [44.86, -93.38, 45.06, -93.16]],
  ["Saint Paul", "MN", [44.88, -93.16, 45.02, -92.98]],
  ["Des Moines", "IA", [41.51, -93.74, 41.68, -93.52]],
  ["Omaha", "NE", [41.18, -96.18, 41.38, -95.88]],
  ["Kansas City", "MO", [38.90, -94.72, 39.22, -94.42]],
  ["Saint Louis", "MO", [38.52, -90.34, 38.78, -90.16]],
  ["Wichita", "KS", [37.60, -97.44, 37.80, -97.18]],
  ["Oklahoma City", "OK", [35.34, -97.72, 35.62, -97.38]],
  ["Tulsa", "OK", [36.01, -96.08, 36.24, -95.80]],
  ["Dallas", "TX", [32.62, -96.98, 33.02, -96.58]],
  ["Fort Worth", "TX", [32.62, -97.48, 32.92, -97.18]],
  ["Houston", "TX", [29.55, -95.66, 30.06, -95.10]],
  ["Austin", "TX", [30.14, -97.96, 30.54, -97.58]],
  ["San Antonio", "TX", [29.30, -98.72, 29.68, -98.30]],
  ["El Paso", "TX", [31.68, -106.58, 31.92, -106.26]],
  ["Denver", "CO", [39.60, -105.14, 39.92, -104.78]],
  ["Colorado Springs", "CO", [38.72, -104.92, 38.98, -104.68]],
  ["Albuquerque", "NM", [35.00, -106.78, 35.24, -106.48]],
  ["Salt Lake City", "UT", [40.64, -111.98, 40.86, -111.74]],
  ["Boise", "ID", [43.52, -116.34, 43.70, -116.12]],
  ["Phoenix", "AZ", [33.24, -112.36, 33.78, -111.80]],
  ["Tucson", "AZ", [32.08, -111.08, 32.36, -110.76]],
  ["Las Vegas", "NV", [35.98, -115.38, 36.32, -115.02]],
  ["Los Angeles", "CA", [33.70, -118.58, 34.32, -118.08]],
  ["Orange County", "CA", [33.58, -118.06, 33.92, -117.72]],
  ["Riverside", "CA", [33.82, -117.56, 34.02, -117.26]],
  ["San Diego", "CA", [32.60, -117.32, 33.06, -116.88]],
  ["Bakersfield", "CA", [35.26, -119.14, 35.46, -118.92]],
  ["Fresno", "CA", [36.66, -119.92, 36.90, -119.62]],
  ["San Jose", "CA", [37.18, -122.06, 37.46, -121.72]],
  ["San Francisco", "CA", [37.70, -122.52, 37.83, -122.35]],
  ["Oakland", "CA", [37.72, -122.35, 37.88, -122.12]],
  ["Sacramento", "CA", [38.42, -121.60, 38.70, -121.32]],
  ["Portland", "OR", [45.42, -122.82, 45.66, -122.46]],
  ["Seattle", "WA", [47.46, -122.46, 47.78, -122.20]],
  ["Tacoma", "WA", [47.16, -122.56, 47.32, -122.36]],
  ["Spokane", "WA", [47.58, -117.50, 47.75, -117.28]],
  ["Honolulu", "HI", [21.24, -157.92, 21.38, -157.72]],
  /*
   * Second tier. The metros above have been harvested repeatedly and now
   * return mostly businesses already in the database; these mid-size cities
   * are untouched ground, where the same trades are still unqualified.
   */
  ["Buffalo", "NY", [42.83, -78.95, 42.96, -78.79]],
  ["Rochester", "NY", [43.10, -77.70, 43.22, -77.52]],
  ["Syracuse", "NY", [43.00, -76.22, 43.10, -76.08]],
  ["Albany", "NY", [42.60, -73.85, 42.72, -73.70]],
  ["Allentown", "PA", [40.56, -75.55, 40.65, -75.42]],
  ["Harrisburg", "PA", [40.23, -76.95, 40.32, -76.81]],
  ["Scranton", "PA", [41.37, -75.73, 41.45, -75.60]],
  ["Wilmington", "DE", [39.70, -75.62, 39.80, -75.48]],
  ["Worcester", "MA", [42.22, -71.87, 42.31, -71.74]],
  ["Springfield", "MA", [42.06, -72.66, 42.15, -72.52]],
  ["Manchester", "NH", [42.94, -71.53, 43.04, -71.40]],
  ["Portland", "ME", [43.62, -70.34, 43.71, -70.20]],
  ["Burlington", "VT", [44.44, -73.27, 44.52, -73.15]],
  ["Columbia", "SC", [33.95, -81.10, 34.06, -80.95]],
  ["Augusta", "GA", [33.42, -82.05, 33.52, -81.90]],
  ["Columbus", "GA", [32.42, -85.06, 32.52, -84.92]],
  ["Tallahassee", "FL", [30.39, -84.35, 30.49, -84.21]],
  ["Sarasota", "FL", [27.29, -82.60, 27.39, -82.47]],
  ["Naples", "FL", [26.09, -81.85, 26.20, -81.72]],
  ["West Palm Beach", "FL", [26.65, -80.14, 26.78, -80.00]],
  ["Huntsville", "AL", [34.68, -86.68, 34.79, -86.50]],
  ["Mobile", "AL", [30.64, -88.12, 30.75, -87.97]],
  ["Jackson", "MS", [32.25, -90.26, 32.36, -90.11]],
  ["Chattanooga", "TN", [35.00, -85.38, 35.10, -85.23]],
  ["Lexington", "KY", [37.98, -84.58, 38.10, -84.42]],
  ["Dayton", "OH", [39.71, -84.26, 39.81, -84.12]],
  ["Toledo", "OH", [41.60, -83.63, 41.71, -83.47]],
  ["Akron", "OH", [41.03, -81.60, 41.13, -81.45]],
  ["Fort Wayne", "IN", [41.03, -85.22, 41.14, -85.06]],
  ["Lansing", "MI", [42.69, -84.62, 42.78, -84.48]],
  ["Ann Arbor", "MI", [42.24, -83.81, 42.32, -83.67]],
  ["Rockford", "IL", [42.22, -89.16, 42.32, -89.02]],
  ["Peoria", "IL", [40.65, -89.66, 40.75, -89.52]],
  ["Green Bay", "WI", [44.46, -88.09, 44.56, -87.94]],
  ["Cedar Rapids", "IA", [41.93, -91.74, 42.03, -91.60]],
  ["Lincoln", "NE", [40.76, -96.75, 40.86, -96.61]],
  ["Springfield", "MO", [37.16, -93.36, 37.26, -93.22]],
  ["Baton Rouge", "LA", [30.39, -91.22, 30.51, -91.07]],
  ["Shreveport", "LA", [32.47, -93.82, 32.57, -93.68]],
  ["Corpus Christi", "TX", [27.74, -97.48, 27.85, -97.32]],
  ["McAllen", "TX", [26.16, -98.30, 26.25, -98.17]],
  ["Lubbock", "TX", [33.53, -101.94, 33.63, -101.79]],
  ["Amarillo", "TX", [35.15, -101.92, 35.25, -101.75]],
  ["Reno", "NV", [39.48, -119.88, 39.58, -119.74]],
  ["Provo", "UT", [40.19, -111.73, 40.28, -111.60]],
  ["Santa Fe", "NM", [35.64, -106.00, 35.73, -105.88]],
  ["Eugene", "OR", [44.00, -123.16, 44.10, -123.02]],
  ["Salem", "OR", [44.90, -123.10, 44.99, -122.97]],
  ["Boulder", "CO", [39.97, -105.32, 40.06, -105.20]],
  ["Fort Collins", "CO", [40.53, -105.14, 40.64, -105.00]],
  ["Santa Barbara", "CA", [34.38, -119.76, 34.46, -119.64]],
  ["Modesto", "CA", [37.60, -121.06, 37.69, -120.94]],
  ["Stockton", "CA", [37.91, -121.36, 38.01, -121.22]],
  ["Santa Rosa", "CA", [38.40, -122.78, 38.49, -122.65]],
  ["Palm Springs", "CA", [33.78, -116.60, 33.87, -116.48]],
  ["Mesa", "AZ", [33.33, -111.90, 33.46, -111.70]],
  ["Scottsdale", "AZ", [33.48, -111.96, 33.62, -111.83]],
] as [string, string, BBox][]).map(([city, region, bbox]) => ({
  city,
  region,
  country: "United States" as const,
  bbox,
}));

/**
 * UK areas, weighted towards cities under-represented in the existing database
 * so a run adds new businesses rather than re-finding London.
 */
export const UK_AREAS: OsmArea[] = ([
  ["Leeds", "England", [53.75, -1.62, 53.87, -1.44]],
  ["Sheffield", "England", [53.33, -1.55, 53.44, -1.40]],
  ["Liverpool", "England", [53.36, -3.02, 53.48, -2.87]],
  ["Leicester", "England", [52.58, -1.20, 52.68, -1.06]],
  ["Coventry", "England", [52.36, -1.58, 52.46, -1.42]],
  ["Bradford", "England", [53.75, -1.83, 53.85, -1.68]],
  ["Stoke-on-Trent", "England", [52.96, -2.24, 53.08, -2.10]],
  ["Wolverhampton", "England", [52.55, -2.20, 52.63, -2.06]],
  ["Plymouth", "England", [50.35, -4.20, 50.44, -4.05]],
  ["Southampton", "England", [50.88, -1.48, 50.96, -1.33]],
  ["Portsmouth", "England", [50.78, -1.12, 50.86, -1.00]],
  ["Brighton", "England", [50.80, -0.22, 50.88, -0.08]],
  ["Milton Keynes", "England", [52.00, -0.82, 52.08, -0.68]],
  ["Kingston upon Hull", "England", [53.72, -0.42, 53.80, -0.26]],
  ["Preston", "England", [53.73, -2.75, 53.82, -2.62]],
  ["Middlesbrough", "England", [54.53, -1.28, 54.60, -1.16]],
  ["York", "England", [53.92, -1.14, 54.00, -1.02]],
  ["Oxford", "England", [51.71, -1.30, 51.80, -1.18]],
  ["Cambridge", "England", [52.17, 0.08, 52.24, 0.19]],
  ["Swansea", "Wales", [51.58, -4.00, 51.68, -3.87]],
  ["Belfast", "Northern Ireland", [54.53, -6.03, 54.66, -5.85]],
  ["Exeter", "England", [50.69, -3.58, 50.75, -3.47]],
  ["Bournemouth", "England", [50.71, -1.92, 50.78, -1.78]],
  ["Luton", "England", [51.85, -0.48, 51.92, -0.37]],
  ["Sunderland", "England", [54.87, -1.44, 54.94, -1.32]],
  /*
   * Second tier. The database already holds most of the businesses the largest
   * cities have to give, so a UK run exhausts the list above quickly; these are
   * the next towns down, where the coverage is thinner but still real.
   */
  ["Newcastle upon Tyne", "England", [54.94, -1.68, 55.02, -1.55]],
  ["Nottingham", "England", [52.92, -1.22, 53.00, -1.09]],
  ["Derby", "England", [52.88, -1.52, 52.96, -1.42]],
  ["Bristol", "England", [51.42, -2.65, 51.50, -2.53]],
  ["Cardiff", "Wales", [51.44, -3.23, 51.53, -3.11]],
  ["Glasgow", "Scotland", [55.82, -4.33, 55.90, -4.20]],
  ["Aberdeen", "Scotland", [57.11, -2.17, 57.18, -2.05]],
  ["Dundee", "Scotland", [56.44, -3.05, 56.50, -2.93]],
  ["Norwich", "England", [52.60, 1.24, 52.66, 1.34]],
  ["Ipswich", "England", [52.03, 1.11, 52.09, 1.20]],
  ["Peterborough", "England", [52.55, -0.30, 52.62, -0.20]],
  ["Northampton", "England", [52.20, -0.94, 52.28, -0.83]],
  ["Reading", "England", [51.42, -1.03, 51.48, -0.93]],
  ["Swindon", "England", [51.53, -1.82, 51.60, -1.72]],
  ["Gloucester", "England", [51.83, -2.28, 51.89, -2.19]],
  ["Worcester", "England", [52.17, -2.26, 52.23, -2.17]],
  ["Telford", "England", [52.64, -2.53, 52.72, -2.41]],
  ["Warrington", "England", [53.36, -2.65, 53.43, -2.53]],
  ["Blackpool", "England", [53.78, -3.08, 53.86, -2.98]],
  ["Bolton", "England", [53.55, -2.48, 53.61, -2.38]],
  ["Stockport", "England", [53.38, -2.20, 53.44, -2.10]],
  ["Huddersfield", "England", [53.62, -1.83, 53.68, -1.74]],
  ["Doncaster", "England", [53.49, -1.17, 53.55, -1.08]],
  ["Colchester", "England", [51.86, 0.85, 51.92, 0.95]],
  ["Chester", "England", [53.17, -2.93, 53.23, -2.85]],
  ["Southend-on-Sea", "England", [51.52, 0.66, 51.57, 0.76]],
  ["Basingstoke", "England", [51.24, -1.13, 51.30, -1.04]],
  ["Wrexham", "Wales", [53.02, -3.03, 53.08, -2.95]],
  ["Inverness", "Scotland", [57.44, -4.28, 57.51, -4.17]],
  ["Lisburn", "Northern Ireland", [54.49, -6.10, 54.56, -6.00]],
] as [string, string, BBox][]).map(([city, region, bbox]) => ({
  city,
  region,
  country: "United Kingdom" as const,
  bbox,
}));

/**
 * Canadian metros, spread across every province rather than concentrated in
 * the Toronto–Montreal–Vancouver triangle, so a run does not just re-find the
 * same three metro areas' businesses.
 */
export const CA_METROS: OsmArea[] = ([
  ["Toronto", "ON", [43.58, -79.64, 43.85, -79.12]],
  ["Mississauga", "ON", [43.53, -79.71, 43.63, -79.55]],
  ["Hamilton", "ON", [43.15, -80.05, 43.30, -79.75]],
  ["Ottawa", "ON", [45.25, -75.85, 45.53, -75.45]],
  ["London", "ON", [42.92, -81.35, 43.03, -81.15]],
  ["Kitchener", "ON", [43.40, -80.58, 43.50, -80.42]],
  ["Windsor", "ON", [42.25, -83.10, 42.36, -82.90]],
  ["Montreal", "QC", [45.40, -73.75, 45.70, -73.45]],
  ["Quebec City", "QC", [46.73, -71.35, 46.85, -71.15]],
  ["Gatineau", "QC", [45.42, -75.82, 45.52, -75.60]],
  ["Vancouver", "BC", [49.20, -123.25, 49.32, -123.00]],
  ["Surrey", "BC", [49.05, -122.90, 49.20, -122.65]],
  ["Victoria", "BC", [48.40, -123.42, 48.50, -123.30]],
  ["Kelowna", "BC", [49.83, -119.55, 49.93, -119.35]],
  ["Calgary", "AB", [50.90, -114.25, 51.15, -113.90]],
  ["Edmonton", "AB", [53.42, -113.65, 53.65, -113.30]],
  ["Winnipeg", "MB", [49.80, -97.30, 49.98, -97.00]],
  ["Saskatoon", "SK", [52.08, -106.75, 52.20, -106.55]],
  ["Regina", "SK", [50.40, -104.70, 50.50, -104.55]],
  ["Halifax", "NS", [44.60, -63.70, 44.72, -63.50]],
  ["Moncton", "NB", [46.05, -64.85, 46.15, -64.70]],
  ["Saint John", "NB", [45.24, -66.10, 45.30, -66.00]],
  ["St. John's", "NL", [47.53, -52.75, 47.60, -52.60]],
  ["Charlottetown", "PE", [46.20, -63.16, 46.28, -63.06]],
  /*
   * Second tier. The metros above are worked through quickly; these are the
   * next cities down — including the Toronto and Vancouver satellite cities,
   * which are separate municipalities with their own independent businesses
   * rather than more of the same downtown core.
   */
  ["Brampton", "ON", [43.63, -79.82, 43.75, -79.68]],
  ["Markham", "ON", [43.82, -79.40, 43.93, -79.22]],
  ["Vaughan", "ON", [43.78, -79.60, 43.90, -79.42]],
  ["Oakville", "ON", [43.40, -79.75, 43.50, -79.60]],
  ["Burlington", "ON", [43.28, -79.88, 43.40, -79.72]],
  ["Cambridge", "ON", [43.32, -80.38, 43.42, -80.25]],
  ["Waterloo", "ON", [43.44, -80.58, 43.52, -80.46]],
  ["Guelph", "ON", [43.50, -80.32, 43.58, -80.18]],
  ["Barrie", "ON", [44.34, -79.75, 44.44, -79.62]],
  ["Kingston", "ON", [44.19, -76.58, 44.28, -76.42]],
  ["Oshawa", "ON", [43.86, -78.93, 43.95, -78.80]],
  ["St. Catharines", "ON", [43.12, -79.32, 43.22, -79.18]],
  ["Niagara Falls", "ON", [43.05, -79.14, 43.15, -79.00]],
  ["Sudbury", "ON", [46.44, -81.08, 46.55, -80.90]],
  ["Thunder Bay", "ON", [48.34, -89.34, 48.45, -89.15]],
  ["Peterborough", "ON", [44.26, -78.38, 44.34, -78.25]],
  ["Laval", "QC", [45.53, -73.83, 45.68, -73.63]],
  ["Longueuil", "QC", [45.48, -73.56, 45.58, -73.43]],
  ["Sherbrooke", "QC", [45.35, -71.98, 45.45, -71.82]],
  ["Trois-Rivieres", "QC", [46.30, -72.62, 46.39, -72.47]],
  ["Burnaby", "BC", [49.20, -123.03, 49.30, -122.90]],
  ["Richmond", "BC", [49.12, -123.20, 49.20, -123.06]],
  ["Abbotsford", "BC", [49.00, -122.40, 49.10, -122.24]],
  ["Nanaimo", "BC", [49.12, -124.02, 49.22, -123.88]],
  ["Kamloops", "BC", [50.62, -120.42, 50.72, -120.24]],
  ["Prince George", "BC", [53.87, -122.83, 53.96, -122.66]],
  ["Red Deer", "AB", [52.22, -113.88, 52.32, -113.74]],
  ["Lethbridge", "AB", [49.65, -112.90, 49.74, -112.76]],
  ["Medicine Hat", "AB", [50.00, -110.75, 50.08, -110.62]],
  ["St. Albert", "AB", [53.59, -113.70, 53.68, -113.57]],
  ["Brandon", "MB", [49.81, -100.02, 49.89, -99.88]],
  ["Fredericton", "NB", [45.92, -66.72, 46.00, -66.57]],
  ["Sydney", "NS", [46.10, -60.26, 46.18, -60.12]],
  ["Whitehorse", "YT", [60.68, -135.14, 60.76, -134.98]],
] as [string, string, BBox][]).map(([city, region, bbox]) => ({
  city,
  region,
  country: "Canada" as const,
  bbox,
}));

/**
 * German cities. The niche selectors are OSM tags, not English words, so they
 * identify the same trades here as anywhere else; qualification reads the
 * business's own site, and a social link or ad pixel is language-independent.
 */
export const DE_AREAS: OsmArea[] = ([
  ["Berlin", "Berlin", [52.45, 13.25, 52.60, 13.55]],
  ["Hamburg", "Hamburg", [53.50, 9.85, 53.63, 10.10]],
  ["Munich", "Bavaria", [48.08, 11.45, 48.20, 11.68]],
  ["Cologne", "North Rhine-Westphalia", [50.88, 6.85, 51.00, 7.05]],
  ["Frankfurt", "Hesse", [50.05, 8.58, 50.19, 8.78]],
  ["Stuttgart", "Baden-Wuerttemberg", [48.70, 9.05, 48.83, 9.25]],
  ["Duesseldorf", "North Rhine-Westphalia", [51.16, 6.70, 51.29, 6.88]],
  ["Dortmund", "North Rhine-Westphalia", [51.45, 7.35, 51.58, 7.60]],
  ["Essen", "North Rhine-Westphalia", [51.39, 6.90, 51.52, 7.15]],
  ["Leipzig", "Saxony", [51.28, 12.28, 51.40, 12.48]],
  ["Bremen", "Bremen", [53.02, 8.68, 53.16, 8.95]],
  ["Dresden", "Saxony", [50.99, 13.63, 51.12, 13.86]],
  ["Hannover", "Lower Saxony", [52.31, 9.63, 52.44, 9.85]],
  ["Nuremberg", "Bavaria", [49.39, 10.98, 49.51, 11.18]],
  ["Duisburg", "North Rhine-Westphalia", [51.37, 6.68, 51.50, 6.85]],
  ["Bochum", "North Rhine-Westphalia", [51.43, 7.13, 51.53, 7.32]],
  ["Wuppertal", "North Rhine-Westphalia", [51.21, 7.05, 51.31, 7.25]],
  ["Bielefeld", "North Rhine-Westphalia", [51.96, 8.43, 52.08, 8.65]],
  ["Bonn", "North Rhine-Westphalia", [50.67, 7.02, 50.78, 7.20]],
  ["Muenster", "North Rhine-Westphalia", [51.90, 7.55, 52.02, 7.72]],
  ["Karlsruhe", "Baden-Wuerttemberg", [48.96, 8.32, 49.06, 8.50]],
  ["Mannheim", "Baden-Wuerttemberg", [49.44, 8.40, 49.55, 8.55]],
  ["Augsburg", "Bavaria", [48.32, 10.82, 48.42, 10.98]],
  ["Wiesbaden", "Hesse", [50.03, 8.15, 50.13, 8.33]],
] as [string, string, BBox][]).map(([city, region, bbox]) => ({
  city,
  region,
  country: "Germany" as const,
  bbox,
}));

/** French cities, spread across the regions rather than centred on Paris. */
export const FR_AREAS: OsmArea[] = ([
  ["Paris", "Ile-de-France", [48.81, 2.22, 48.91, 2.47]],
  ["Marseille", "Provence-Alpes-Cote d'Azur", [43.24, 5.30, 43.39, 5.45]],
  ["Lyon", "Auvergne-Rhone-Alpes", [45.71, 4.78, 45.81, 4.90]],
  ["Toulouse", "Occitanie", [43.55, 1.38, 43.66, 1.50]],
  ["Nice", "Provence-Alpes-Cote d'Azur", [43.65, 7.20, 43.74, 7.32]],
  ["Nantes", "Pays de la Loire", [47.18, -1.61, 47.27, -1.50]],
  ["Montpellier", "Occitanie", [43.56, 3.83, 43.65, 3.94]],
  ["Strasbourg", "Grand Est", [48.53, 7.68, 48.63, 7.80]],
  ["Bordeaux", "Nouvelle-Aquitaine", [44.79, -0.66, 44.89, -0.53]],
  ["Lille", "Hauts-de-France", [50.60, 3.02, 50.67, 3.12]],
  ["Rennes", "Bretagne", [48.07, -1.72, 48.15, -1.61]],
  ["Reims", "Grand Est", [49.22, 3.99, 49.29, 4.09]],
  ["Toulon", "Provence-Alpes-Cote d'Azur", [43.10, 5.88, 43.16, 5.98]],
  ["Saint-Etienne", "Auvergne-Rhone-Alpes", [45.41, 4.35, 45.48, 4.44]],
  ["Le Havre", "Normandie", [49.46, 0.06, 49.55, 0.20]],
  ["Grenoble", "Auvergne-Rhone-Alpes", [45.15, 5.68, 45.21, 5.77]],
  ["Dijon", "Bourgogne-Franche-Comte", [47.29, 5.00, 47.36, 5.09]],
  ["Angers", "Pays de la Loire", [47.44, -0.60, 47.51, -0.51]],
  ["Nimes", "Occitanie", [43.79, 4.32, 43.86, 4.40]],
  ["Clermont-Ferrand", "Auvergne-Rhone-Alpes", [45.75, 3.05, 45.81, 3.15]],
  ["Tours", "Centre-Val de Loire", [47.36, 0.65, 47.42, 0.74]],
  ["Aix-en-Provence", "Provence-Alpes-Cote d'Azur", [43.50, 5.42, 43.56, 5.49]],
] as [string, string, BBox][]).map(([city, region, bbox]) => ({
  city,
  region,
  country: "France" as const,
  bbox,
}));

/** Australian cities. Southern-hemisphere latitudes are negative, so the
 *  bbox "south" value is the more negative of the pair. */
export const AU_AREAS: OsmArea[] = ([
  ["Sydney", "NSW", [-33.95, 151.10, -33.80, 151.30]],
  ["Melbourne", "VIC", [-37.88, 144.90, -37.75, 145.05]],
  ["Brisbane", "QLD", [-27.55, 152.95, -27.40, 153.10]],
  ["Perth", "WA", [-32.00, 115.78, -31.88, 115.95]],
  ["Adelaide", "SA", [-34.98, 138.55, -34.87, 138.68]],
  ["Gold Coast", "QLD", [-28.08, 153.36, -27.92, 153.46]],
  ["Newcastle", "NSW", [-32.95, 151.70, -32.87, 151.80]],
  ["Canberra", "ACT", [-35.36, 149.05, -35.24, 149.18]],
  ["Sunshine Coast", "QLD", [-26.72, 152.95, -26.58, 153.12]],
  ["Wollongong", "NSW", [-34.45, 150.85, -34.37, 150.93]],
  ["Hobart", "TAS", [-42.92, 147.28, -42.85, 147.37]],
  ["Geelong", "VIC", [-38.18, 144.32, -38.10, 144.40]],
  ["Townsville", "QLD", [-19.30, 146.75, -19.22, 146.85]],
  ["Cairns", "QLD", [-16.95, 145.72, -16.87, 145.80]],
  ["Darwin", "NT", [-12.48, 130.80, -12.38, 130.90]],
  ["Toowoomba", "QLD", [-27.60, 151.90, -27.52, 152.00]],
  ["Ballarat", "VIC", [-37.60, 143.80, -37.52, 143.90]],
  ["Bendigo", "VIC", [-36.80, 144.24, -36.72, 144.32]],
] as [string, string, BBox][]).map(([city, region, bbox]) => ({
  city,
  region,
  country: "Australia" as const,
  bbox,
}));
