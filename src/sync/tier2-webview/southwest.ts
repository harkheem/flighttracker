import type { FlightInput } from '../../types/flight';
import type { WebViewHarvestPayload } from '../parsers/webviewTypes';
import { timezoneForAirport, utcToLocalIsoWithOffset } from '../../utils/timezone';

// Built against a real capture from this user's logged-in Southwest "My Account" session
// (2026-07-13). Southwest's upcoming-trips widget is backed by a clean JSON API — no scraping
// needed. The interesting response comes from `mobile-misc/v1/mobile-misc/page/upcoming-trips`;
// see adapters.ts's NETWORK_INTERCEPTOR_SCRIPT for how it gets captured.
//
// Known limitation: this endpoint only surfaces the *next upcoming segment* per reservation (a
// "next trip" widget), not a full multi-leg itinerary — so a round trip only yields one leg here.
// The other direction would need a different endpoint/page, not seen in this capture.

interface UpcomingTripEntry {
  flightNumber?: string;
  departureAirportCode?: string;
  arrivalAirportCode?: string;
  departureTime?: string; // "18:15" 24h, local to departure airport
  arrivalTime?: string; // "19:20" 24h, local to arrival airport
  dates?: { first?: string }; // "2026-08-13" — this leg's departure date
  originDescription?: string;
  destinationDescription?: string;
  confirmationNumber?: string;
  tripSeatText?: string;
  _links?: {
    viewReservationViewPage?: {
      query?: { 'first-name'?: string; 'last-name'?: string };
    };
  };
}

function extractPassengerName(entry: UpcomingTripEntry): string | null {
  const query = entry._links?.viewReservationViewPage?.query;
  if (!query?.['first-name'] && !query?.['last-name']) return null;
  return [query?.['first-name'], query?.['last-name']].filter(Boolean).join(' ');
}

function extractSeat(tripSeatText: string | undefined): string | null {
  if (!tripSeatText) return null;
  const m = tripSeatText.match(/\b(\d{1,3}[A-Z])\b/);
  return m ? m[1] : null;
}

// Converts a wall-clock date+"HH:MM" time known to be in `timeZone` into a local-with-offset ISO
// string. Guesses the instant as if the wall-clock were UTC, corrects using the zone's offset at
// that instant (accurate outside the rare DST-transition minute), then formats via
// utcToLocalIsoWithOffset — mirrors the approach in american.ts's wallTimeToUtcIso.
function localDateTimeToIso(dateStr: string, timeStr: string, timeZone: string): string | null {
  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const [, y, mo, d] = dateMatch;
  const [, h, mi] = timeMatch;
  const guessUtcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0);

  const asGuessLocalIso = utcToLocalIsoWithOffset(new Date(guessUtcMs).toISOString(), timeZone);
  const offsetMatch = asGuessLocalIso.match(/([+-]\d{2}:\d{2})$/);
  const offsetMinutes = offsetMatch ? offsetStringToMinutes(offsetMatch[1]) : 0;
  const trueUtcMs = guessUtcMs - offsetMinutes * 60_000;

  return utcToLocalIsoWithOffset(new Date(trueUtcMs).toISOString(), timeZone);
}

function offsetStringToMinutes(offset: string): number {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  return sign * (h * 60 + m);
}

export function parseSouthwestPayload(rawPayload: string): FlightInput[] {
  let payload: WebViewHarvestPayload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return [];
  }

  const upcomingTripsResponse = payload.captured.find((r) => r.url.includes('mobile-misc/page/upcoming-trips'));
  if (!upcomingTripsResponse) return [];

  let body: { upcomingTripsPage?: UpcomingTripEntry[] };
  try {
    body = JSON.parse(upcomingTripsResponse.body);
  } catch {
    return [];
  }

  const entries = body.upcomingTripsPage ?? [];
  const flights: FlightInput[] = [];

  for (const entry of entries) {
    const depCode = entry.departureAirportCode;
    const arrCode = entry.arrivalAirportCode;
    const departureDate = entry.dates?.first;
    if (!entry.flightNumber || !depCode || !arrCode || !departureDate || !entry.departureTime || !entry.arrivalTime) {
      continue;
    }

    const depTz = timezoneForAirport(depCode);
    const arrTz = timezoneForAirport(arrCode);
    if (!depTz || !arrTz) continue;

    const departureTimeLocal = localDateTimeToIso(departureDate, entry.departureTime, depTz);
    // Arrival date isn't given explicitly; assume same calendar date as departure (true for the
    // short domestic hops Southwest flies — no overnight service).
    const arrivalTimeLocal = localDateTimeToIso(departureDate, entry.arrivalTime, arrTz);
    if (!departureTimeLocal || !arrivalTimeLocal) continue;

    flights.push({
      airlineName: 'Southwest Airlines',
      airlineCode: 'WN',
      airlineLogoUrl: null,
      flightNumber: entry.flightNumber.replace(/\s+/g, ''),
      confirmationCode: entry.confirmationNumber ? entry.confirmationNumber.toUpperCase() : null,
      passengerName: extractPassengerName(entry),
      departureAirport: { code: depCode, name: entry.originDescription ?? null },
      arrivalAirport: { code: arrCode, name: entry.destinationDescription ?? null },
      departureTimeLocal,
      departureTimezone: depTz,
      arrivalTimeLocal,
      arrivalTimezone: arrTz,
      terminal: null,
      gate: null,
      seat: extractSeat(entry.tripSeatText),
      cabinClass: null, // Southwest has open seating, no cabin classes
      status: 'confirmed',
      notes: null,
      source: 'webview',
      sourceRef: `webview_WN:${entry.confirmationNumber ?? entry.flightNumber}`,
      manuallyEdited: false,
    });
  }

  return flights;
}
