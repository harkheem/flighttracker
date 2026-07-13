// Display city name per IATA code, used when a sync tier didn't capture one (e.g. manual entry).
export const AIRPORT_CITIES: Record<string, string> = {
  ATL: 'Atlanta',
  MIA: 'Miami',
  CLT: 'Charlotte',
  JFK: 'New York City',
  LGA: 'New York City',
  EWR: 'Newark',
  BOS: 'Boston',
  DCA: 'Washington, D.C.',
  IAD: 'Washington, D.C.',
  FLL: 'Fort Lauderdale',
  MCO: 'Orlando',
  TPA: 'Tampa',
  IAH: 'Houston',
  HOU: 'Houston',
  DFW: 'Dallas',
  ORD: 'Chicago',
  MDW: 'Chicago',
  MSP: 'Minneapolis',
  BNA: 'Nashville',
  MSY: 'New Orleans',
  STL: 'St. Louis',
  DEN: 'Denver',
  SLC: 'Salt Lake City',
  PHX: 'Phoenix',
  PSP: 'Palm Springs',
  LAX: 'Los Angeles',
  SFO: 'San Francisco',
  SAN: 'San Diego',
  SEA: 'Seattle',
  PDX: 'Portland',
  LAS: 'Las Vegas',
  LHR: 'London',
  AUS: 'Austin',
  PUJ: 'Punta Cana',
  LOS: 'Lagos',
};

// Exact (disambiguated) Wikipedia article titles per IATA code, used only for photo lookups —
// separate from the display name above, since plain names like "Phoenix" or "Charlotte" resolve
// to Wikipedia disambiguation pages (no image) rather than the city article.
export const AIRPORT_WIKI_TITLES: Record<string, string> = {
  ATL: 'Atlanta',
  MIA: 'Miami',
  CLT: 'Charlotte, North Carolina',
  JFK: 'New York City',
  LGA: 'New York City',
  EWR: 'Newark, New Jersey',
  BOS: 'Boston',
  DCA: 'Washington, D.C.',
  IAD: 'Washington, D.C.',
  FLL: 'Fort Lauderdale, Florida',
  MCO: 'Orlando, Florida',
  TPA: 'Tampa, Florida',
  IAH: 'Houston',
  HOU: 'Houston',
  DFW: 'Dallas',
  ORD: 'Chicago',
  MDW: 'Chicago',
  MSP: 'Minneapolis',
  BNA: 'Nashville, Tennessee',
  MSY: 'New Orleans',
  STL: 'St. Louis',
  DEN: 'Denver',
  SLC: 'Salt Lake City',
  PHX: 'Phoenix, Arizona',
  PSP: 'Palm Springs, California',
  LAX: 'Los Angeles',
  SFO: 'San Francisco',
  SAN: 'San Diego',
  SEA: 'Seattle',
  PDX: 'Portland, Oregon',
  LAS: 'Las Vegas',
  LHR: 'London',
  AUS: 'Austin, Texas',
  PUJ: 'Punta Cana',
  LOS: 'Lagos',
};

export function cityForAirport(code: string, fallbackName: string | null): string | null {
  if (fallbackName) return fallbackName;
  return AIRPORT_CITIES[code.toUpperCase()] ?? null;
}

// Best-effort Wikipedia search title for a destination photo — prefers our curated disambiguated
// title (reliable), falling back to whatever plain name is available (may 404 on ambiguous names).
export function wikiTitleForAirport(code: string, fallbackName: string | null): string | null {
  return AIRPORT_WIKI_TITLES[code.toUpperCase()] ?? fallbackName ?? AIRPORT_CITIES[code.toUpperCase()] ?? null;
}
