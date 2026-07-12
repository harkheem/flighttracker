import type { FlightInput } from '../../types/flight';
import type { EmailParser, RawEmail } from './types';

// TODO(real-world-testing): This parser is a best-effort proof of concept built from Delta's
// publicly documented confirmation-email format as of this writing. It has NOT been run against
// a real Delta confirmation email from this user's account. Before relying on it:
//   1. Connect Gmail (Settings > Connections) and let a sync run against real Delta emails.
//   2. Log/inspect `email.bodyText` for a real message and adjust the regexes below to match.
// Delta confirmation emails historically include lines like:
//   "Confirmation #: ABC123"
//   "Flight 1234  Delta"
//   "New York (JFK) to Los Angeles (LAX)"
//   "Mon, Aug 1, 2026   2:30 PM - 5:45 PM"
//   "Seat: 14C   Class: Main Cabin"
// These patterns are illustrative and will likely need adjustment per real sample.

const CONFIRMATION_RE = /Confirmation\s*#?:?\s*([A-Z0-9]{5,8})/i;
const FLIGHT_NUMBER_RE = /Flight\s+(\d{1,4})/i;
const ROUTE_RE = /([A-Za-z .'-]+)\s*\(([A-Z]{3})\)\s*to\s*([A-Za-z .'-]+)\s*\(([A-Z]{3})\)/;
const SEAT_RE = /Seat:?\s*([0-9]{1,3}[A-Z])/i;
const CABIN_RE = /Class:?\s*(Main Cabin|Comfort\+|First|Delta One|Premium Select)/i;
// e.g. "Mon, Aug 1, 2026   2:30 PM - 5:45 PM"
const DATE_TIME_RE =
  /([A-Za-z]{3}),?\s+([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})\D+(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i;

function parseDateTime(monthStr: string, day: string, year: string, timeStr: string): string | null {
  const parsed = new Date(`${monthStr} ${day}, ${year} ${timeStr}`);
  if (isNaN(parsed.getTime())) return null;
  // Store as naive local ISO (no offset) — timezone is tracked separately per Flight;
  // for a real implementation this should be resolved via an airport->timezone lookup.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(
    parsed.getHours()
  )}:${pad(parsed.getMinutes())}:00`;
}

export const deltaParser: EmailParser = {
  airlineCode: 'DL',
  airlineName: 'Delta Air Lines',
  gmailQuery: 'from:(delta.com) subject:(confirmation OR itinerary OR "trip confirmation")',

  matches(email: RawEmail): boolean {
    return /delta\.com/i.test(email.from) && CONFIRMATION_RE.test(email.bodyText);
  },

  parse(email: RawEmail): FlightInput[] {
    const text = email.bodyText;

    const confirmationMatch = text.match(CONFIRMATION_RE);
    const flightMatch = text.match(FLIGHT_NUMBER_RE);
    const routeMatch = text.match(ROUTE_RE);
    const dateTimeMatch = text.match(DATE_TIME_RE);
    const seatMatch = text.match(SEAT_RE);
    const cabinMatch = text.match(CABIN_RE);

    if (!flightMatch || !routeMatch || !dateTimeMatch) {
      // Can't confidently extract a full itinerary — leave it to Tier 2/3.
      return [];
    }

    const [, , month, day, year, depTime, arrTime] = dateTimeMatch;
    const departureTimeLocal = parseDateTime(month, day, year, depTime);
    const arrivalTimeLocal = parseDateTime(month, day, year, arrTime);
    if (!departureTimeLocal || !arrivalTimeLocal) return [];

    const flight: FlightInput = {
      airlineName: 'Delta Air Lines',
      airlineCode: 'DL',
      airlineLogoUrl: null,
      flightNumber: `DL${flightMatch[1]}`,
      confirmationCode: confirmationMatch ? confirmationMatch[1].toUpperCase() : null,
      departureAirport: { code: routeMatch[2].toUpperCase(), name: routeMatch[1].trim() },
      arrivalAirport: { code: routeMatch[4].toUpperCase(), name: routeMatch[3].trim() },
      departureTimeLocal,
      // TODO: resolve real IANA timezone from departure airport code instead of device timezone.
      departureTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      arrivalTimeLocal,
      arrivalTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      terminal: null,
      gate: null,
      seat: seatMatch ? seatMatch[1].toUpperCase() : null,
      cabinClass: cabinMatch ? 'economy' : null,
      status: 'confirmed',
      notes: null,
      source: 'gmail',
      sourceRef: email.id,
      manuallyEdited: false,
    };

    return [flight];
  },
};
