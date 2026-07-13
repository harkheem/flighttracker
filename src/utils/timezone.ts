// IANA timezone for major US airports (extend as new airports show up in real itineraries).
export const AIRPORT_TIMEZONES: Record<string, string> = {
  ATL: 'America/New_York',
  MIA: 'America/New_York',
  CLT: 'America/New_York',
  JFK: 'America/New_York',
  LGA: 'America/New_York',
  EWR: 'America/New_York',
  BOS: 'America/New_York',
  DCA: 'America/New_York',
  IAD: 'America/New_York',
  FLL: 'America/New_York',
  MCO: 'America/New_York',
  TPA: 'America/New_York',
  IAH: 'America/Chicago',
  HOU: 'America/Chicago',
  DFW: 'America/Chicago',
  ORD: 'America/Chicago',
  MDW: 'America/Chicago',
  MSP: 'America/Chicago',
  BNA: 'America/Chicago',
  MSY: 'America/Chicago',
  STL: 'America/Chicago',
  DEN: 'America/Denver',
  SLC: 'America/Denver',
  PHX: 'America/Phoenix',
  PSP: 'America/Los_Angeles',
  LAX: 'America/Los_Angeles',
  SFO: 'America/Los_Angeles',
  SAN: 'America/Los_Angeles',
  SEA: 'America/Los_Angeles',
  PDX: 'America/Los_Angeles',
  LAS: 'America/Los_Angeles',
  LHR: 'Europe/London',
  AUS: 'America/Chicago',
  PUJ: 'America/Santo_Domingo',
  LOS: 'Africa/Lagos',
};

export function timezoneForAirport(iataCode: string): string | null {
  return AIRPORT_TIMEZONES[iataCode.toUpperCase()] ?? null;
}

function offsetMinutesAt(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(utcDate);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asUtc - utcDate.getTime()) / 60_000;
}

// Converts a UTC instant into an ISO 8601 string with the wall-clock time and numeric offset for
// `timeZone`, e.g. "2026-06-24T14:54:00-04:00".
export function utcToLocalIsoWithOffset(utcIso: string, timeZone: string): string {
  const utcDate = new Date(utcIso);
  const offsetMin = offsetMinutesAt(utcDate, timeZone);
  const local = new Date(utcDate.getTime() + offsetMin * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offsetStr = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T` +
    `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}${offsetStr}`
  );
}
