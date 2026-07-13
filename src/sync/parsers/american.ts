import type { FlightInput } from '../../types/flight';
import type { EmailParser, RawEmail } from './types';
import { timezoneForAirport, utcToLocalIsoWithOffset } from '../../utils/timezone';

// Built against 3 real "trip confirmation" emails pulled from this user's Gmail
// (2026-07-12). 2 of the 3 embedded a schema.org `FlightReservation` JSON-LD block — a
// structured-data convention several airlines emit for Gmail's own itinerary highlights, and by
// far the most reliable source since it's real airline-emitted JSON, not scraped markup. The 3rd
// sample lacked that block entirely, so a DOM-regex fallback (against AA's `itinerary-*` CSS
// classes) covers that case. No native `DOMParser` exists in the RN/Hermes runtime, hence regex
// rather than real HTML parsing.

interface SchemaFlightReservation {
  '@type'?: string;
  reservationNumber?: string;
  reservationStatus?: string;
  underName?: { name?: string };
  reservationFor?: {
    flightNumber?: string;
    departureAirport?: { iataCode?: string; name?: string };
    departureTime?: string; // UTC ISO with Z
    arrivalAirport?: { iataCode?: string; name?: string };
    arrivalTime?: string; // UTC ISO with Z
  };
}

function extractJsonLdReservations(html: string): SchemaFlightReservation[] {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const reservations: SchemaFlightReservation[] = [];
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (item && typeof item === 'object' && (item as SchemaFlightReservation)['@type'] === 'FlightReservation') {
        reservations.push(item as SchemaFlightReservation);
      }
    }
  }
  return reservations;
}

// Finds the "Seat: 26F" / "Class: Economy" block AA renders near each flight number occurrence
// (present alongside both the JSON-LD and DOM-fallback layouts).
function findSeatAndCabin(html: string, flightNumber: string): { seat: string | null; cabin: FlightInput['cabinClass'] } {
  const idx = html.indexOf(`>${flightNumber}`);
  if (idx === -1) return { seat: null, cabin: null };
  const window = html.slice(idx, idx + 8000);

  const seatMatch = window.match(/Seat:<\/span>[\s\S]*?<span>([0-9]{1,3}[A-Z])<\/span>/);
  const cabinMatch = window.match(/Class:<\/span>[\s\S]*?>(First|Business|Premium Economy|Economy)<\/span>/);

  const cabinMap: Record<string, FlightInput['cabinClass']> = {
    First: 'first',
    Business: 'business',
    'Premium Economy': 'premium_economy',
    Economy: 'economy',
  };

  return {
    seat: seatMatch ? seatMatch[1] : null,
    cabin: cabinMatch ? cabinMap[cabinMatch[1]] ?? null : null,
  };
}

function fromJsonLd(email: RawEmail, html: string): FlightInput[] {
  const reservations = extractJsonLdReservations(html);
  const flights: FlightInput[] = [];

  for (const res of reservations) {
    const flight = res.reservationFor;
    const depCode = flight?.departureAirport?.iataCode;
    const arrCode = flight?.arrivalAirport?.iataCode;
    if (!flight?.flightNumber || !depCode || !arrCode || !flight.departureTime || !flight.arrivalTime) continue;

    const depTz = timezoneForAirport(depCode);
    const arrTz = timezoneForAirport(arrCode);
    if (!depTz || !arrTz) continue; // unknown airport tz — leave to tier2/3 rather than guess

    const flightNumber = flight.flightNumber.replace(/\s+/g, '');
    const { seat, cabin } = findSeatAndCabin(html, flight.flightNumber);

    flights.push({
      airlineName: 'American Airlines',
      airlineCode: 'AA',
      airlineLogoUrl: null,
      flightNumber,
      confirmationCode: res.reservationNumber ? res.reservationNumber.toUpperCase() : null,
      passengerName: res.underName?.name ?? null,
      departureAirport: { code: depCode, name: flight.departureAirport?.name ?? null },
      arrivalAirport: { code: arrCode, name: flight.arrivalAirport?.name ?? null },
      departureTimeLocal: utcToLocalIsoWithOffset(flight.departureTime, depTz),
      departureTimezone: depTz,
      arrivalTimeLocal: utcToLocalIsoWithOffset(flight.arrivalTime, arrTz),
      arrivalTimezone: arrTz,
      terminal: null,
      gate: null,
      seat,
      cabinClass: cabin,
      status: res.reservationStatus?.toLowerCase() === 'cancelled' ? 'cancelled' : 'confirmed',
      notes: null,
      source: 'gmail',
      sourceRef: `${email.id}:${flightNumber}`,
      manuallyEdited: false,
    });
  }

  return flights;
}

const DATE_HEADER_RE = /itinerary-header[^"]*">([^<]+)<\/span>/g;
const LEG_RE =
  /itinerary-iata itinerary-data-spacing">([A-Z]{3})<[\s\S]{0,2000}?itinerary-small-text itinerary-data-spacing">([^<]+)<[\s\S]{0,2000}?itinerary-text itinerary-data-spacing">([^<]+)<[\s\S]{0,2000}?itinerary-small-text">([A-Z]{2}\s*\d{2,5})\s*<\/span>[\s\S]{0,3000}?itinerary-iata itinerary-data-spacing">([A-Z]{3})<[\s\S]{0,2000}?itinerary-small-text(?: itinerary-data-spacing)?">([^<]+)<[\s\S]{0,2000}?itinerary-text itinerary-data-spacing">([^<]+)</g;

function parseDateHeader(dateStr: string): { year: number; month: number; day: number } | null {
  // e.g. "Friday, June 27, 2025"
  const m = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!m) return null;
  const month = new Date(`${m[1]} 1, 2000`).getMonth();
  if (isNaN(month)) return null;
  return { year: Number(m[3]), month: month + 1, day: Number(m[2]) };
}

function parseTimeOfDay(timeStr: string): { hour: number; minute: number } | null {
  const m = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (/PM/i.test(m[3])) hour += 12;
  return { hour, minute: Number(m[2]) };
}

// Fallback for emails without the JSON-LD block: regex against AA's `itinerary-*` DOM classes.
function fromDomFallback(email: RawEmail, html: string): FlightInput[] {
  const headers = [...html.matchAll(DATE_HEADER_RE)]
    .map((m) => ({ index: m.index ?? 0, date: parseDateHeader(m[1]) }))
    .filter((h) => h.date !== null) as { index: number; date: { year: number; month: number; day: number } }[];

  if (headers.length === 0) return [];

  const flights: FlightInput[] = [];

  for (const leg of html.matchAll(LEG_RE)) {
    const [, depCode, depCity, depTimeStr, flightNumberRaw, arrCode, arrCity, arrTimeStr] = leg;
    const legIndex = leg.index ?? 0;

    // Associate this leg with the closest preceding date header.
    const header = [...headers].reverse().find((h) => h.index <= legIndex);
    if (!header) continue;

    const depTime = parseTimeOfDay(depTimeStr);
    const arrTime = parseTimeOfDay(arrTimeStr);
    const depTz = timezoneForAirport(depCode);
    const arrTz = timezoneForAirport(arrCode);
    if (!depTime || !arrTime || !depTz || !arrTz) continue;

    const flightNumber = flightNumberRaw.replace(/\s+/g, '');
    const { seat, cabin } = findSeatAndCabin(html, flightNumberRaw);

    // Build departure/arrival as UTC instants (via each airport's offset at that wall-clock date)
    // so both go through the same local-with-offset formatter as the JSON-LD path.
    const depIso = wallTimeToUtcIso(header.date, depTime, depTz);
    // Arrival may roll over to the next calendar day; nudge forward if arrival clock time
    // appears earlier than departure clock time (best-effort — no explicit date given for arrival).
    const arrRolledOver = arrTime.hour * 60 + arrTime.minute < depTime.hour * 60 + depTime.minute;
    const arrDate = arrRolledOver ? addDays(header.date, 1) : header.date;
    const arrIso = wallTimeToUtcIso(arrDate, arrTime, arrTz);

    flights.push({
      airlineName: 'American Airlines',
      airlineCode: 'AA',
      airlineLogoUrl: null,
      flightNumber,
      confirmationCode: extractConfirmationCode(html),
      passengerName: null, // not reliably present in this DOM-fallback layout
      departureAirport: { code: depCode, name: depCity.trim() },
      arrivalAirport: { code: arrCode, name: arrCity.trim() },
      departureTimeLocal: utcToLocalIsoWithOffset(depIso, depTz),
      departureTimezone: depTz,
      arrivalTimeLocal: utcToLocalIsoWithOffset(arrIso, arrTz),
      arrivalTimezone: arrTz,
      terminal: null,
      gate: null,
      seat,
      cabinClass: cabin,
      status: 'confirmed',
      notes: null,
      source: 'gmail',
      sourceRef: `${email.id}:${flightNumber}`,
      manuallyEdited: false,
    });
  }

  return flights;
}

function addDays(date: { year: number; month: number; day: number }, days: number) {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// Converts a wall-clock date+time known to be in `timeZone` into a real UTC ISO instant.
function wallTimeToUtcIso(
  date: { year: number; month: number; day: number },
  time: { hour: number; minute: number },
  timeZone: string
): string {
  // Guess UTC = wall clock, then correct by the zone's offset at that instant (accurate outside
  // the rare DST-transition minute).
  const guess = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, 0);
  const asLocalOffsetIso = utcToLocalIsoWithOffset(new Date(guess).toISOString(), timeZone);
  const offsetMatch = asLocalOffsetIso.match(/([+-]\d{2}:\d{2})$/);
  const offsetMinutes = offsetMatch ? offsetStringToMinutes(offsetMatch[1]) : 0;
  return new Date(guess - offsetMinutes * 60_000).toISOString();
}

function offsetStringToMinutes(offset: string): number {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  return sign * (h * 60 + m);
}

function extractConfirmationCode(html: string): string | null {
  const m = html.match(/Confirmation code:\s*<\/span>\s*<span[^>]*>([A-Z0-9]{5,8})<\/span>/i);
  return m ? m[1].toUpperCase() : null;
}

export const americanParser: EmailParser = {
  airlineCode: 'AA',
  airlineName: 'American Airlines',
  gmailQuery: 'from:(aa.com) subject:(confirmation OR itinerary OR "trip confirmation")',

  matches(email: RawEmail): boolean {
    if (!/aa\.com/i.test(email.from) || !email.bodyHtml) return false;
    return email.bodyHtml.includes('FlightReservation') || email.bodyHtml.includes('itinerary-iata');
  },

  parse(email: RawEmail): FlightInput[] {
    if (!email.bodyHtml) return [];
    const viaJsonLd = fromJsonLd(email, email.bodyHtml);
    if (viaJsonLd.length > 0) return viaJsonLd;
    return fromDomFallback(email, email.bodyHtml);
  },
};
