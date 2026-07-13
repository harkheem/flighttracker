import type { FlightInput } from '../../types/flight';
import type { EmailParser, RawEmail } from './types';
import { timezoneForAirport, utcToLocalIsoWithOffset } from '../../utils/timezone';

// Built against several real "Your Flight Receipt" emails spanning Delta's template history
// (2021, 2022, 2024, 2026 — pulled from this user's Gmail, 2026-07-13). The confirmation-code
// markup changed across that history (see CONFIRMATION_PATTERNS), and the newest template adds a
// baggage-fees table giving the full date + real IATA route per leg (e.g. "Thu 05 Nov 2026",
// "ATL-LHR") that older templates lack — those older ones only give city names (e.g. "ATLANTA",
// "HOUSTON-HOBBY") in the DEPART/ARRIVE table, so a DELTA_CITY_CODES lookup resolves those to IATA
// codes as a fallback. Subject line for this email type is "Your Flight Receipt - <name>
// <DDMMMYY>", not "confirmation"/"itinerary" — see EMAIL_PARSERS query below.

const CONFIRMATION_PATTERNS = [
  // Current (2026) template.
  /Confirmation Number<\/b><\/span>[\s\S]{0,1200}?>([A-Z0-9]{5,8})<\/span>/,
  // 2021-2022 template: code appears as both the link title and its text.
  /Confirmation #:[\s\S]{0,400}?title="([A-Z0-9]{5,8})"/,
  // 2024 template: plain inline text, no link.
  /CONFIRMATION #:\s*([A-Z0-9]{5,8})/i,
];
const PASSENGER_NAME_RE = /Passenger Info<\/strong><br><br>\s*Name:\s*([^<]+?)\s*<br>/;
const ROUTE_DATE_RE = /<b>[A-Za-z]{3} (\d{2}) ([A-Za-z]{3}) (\d{4})<\/b>[\s\S]{0,500}?<b>([A-Z]{3})-([A-Z]{3})<\/b>/g;
const FLIGHT_BLOCK_RE =
  /DELTA\s+(\d+)<br>[\s\S]{0,600}?(\d{1,2}:\d{2}\s*[AP]M)[\s\S]{0,600}?(\d{1,2}:\d{2}\s*[AP]M)(?:\s*<br>\*\*[A-Za-z]{3}\s*(\d{2})([A-Z]{3}))?/gi;
const DATE_HEADER_RE = /<b>[A-Za-z]{3}, (\d{2})([A-Z]{3})<\/b>/g;
const SUBJECT_YEAR_RE = /(\d{2})([A-Z]{3})(\d{2})\s*$/i; // e.g. "08JAN22" at the end of the subject

// City names as Delta's receipt emails render them, for templates old enough to lack the
// IATA-route summary table. Extend as new cities show up in real emails.
const DELTA_CITY_CODES: Record<string, string> = {
  ATLANTA: 'ATL',
  'HOUSTON-HOBBY': 'HOU',
  MIAMI: 'MIA',
  LAGOS: 'LOS',
  'LONDON-HEATHROW': 'LHR',
};

function extractConfirmationCode(html: string): string | null {
  for (const pattern of CONFIRMATION_PATTERNS) {
    const m = html.match(pattern);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

function parseTimeOfDay(timeStr: string): { hour: number; minute: number } | null {
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (/PM/i.test(m[3])) hour += 12;
  return { hour, minute: Number(m[2]) };
}

function wallTimeToUtcIso(
  year: number,
  month: number,
  day: number,
  time: { hour: number; minute: number },
  timeZone: string
): string {
  const guess = Date.UTC(year, month - 1, day, time.hour, time.minute, 0);
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

function addDays(year: number, month: number, day: number, days: number) {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const MONTH_ABBR: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

// Older templates lack a per-leg year, but the subject line ends with it, e.g.
// "Your Flight Receipt - HAKEEM ADELEYE 08JAN22" -> 2022.
function yearFromSubject(subject: string): number | null {
  const m = subject.match(SUBJECT_YEAR_RE);
  if (!m) return null;
  return 2000 + Number(m[3]);
}

function buildFlight(
  flightNumRaw: string,
  confirmationCode: string | null,
  passengerName: string | null,
  depCode: string,
  arrCode: string,
  year: number,
  month: number,
  day: number,
  depTimeStr: string,
  arrTimeStr: string,
  rolloverDay: string | undefined,
  rolloverMonthAbbr: string | undefined,
  emailId: string
): FlightInput | null {
  const depTime = parseTimeOfDay(depTimeStr);
  const arrTime = parseTimeOfDay(arrTimeStr);
  const depTz = timezoneForAirport(depCode);
  const arrTz = timezoneForAirport(arrCode);
  if (!depTime || !arrTime || !depTz || !arrTz) return null;

  let arrYear = year;
  let arrMonth = month;
  let arrDay = day;
  if (rolloverDay && rolloverMonthAbbr) {
    arrDay = Number(rolloverDay);
    arrMonth = MONTH_ABBR[rolloverMonthAbbr] ?? month;
    if (arrMonth < month) arrYear = year + 1;
  } else if (arrTime.hour * 60 + arrTime.minute < depTime.hour * 60 + depTime.minute) {
    // No explicit rollover marker but arrival clock time is earlier than departure — best-effort
    // next-day assumption (matches the american.ts DOM-fallback heuristic).
    ({ year: arrYear, month: arrMonth, day: arrDay } = addDays(year, month, day, 1));
  }

  return {
    airlineName: 'Delta Air Lines',
    airlineCode: 'DL',
    airlineLogoUrl: null,
    flightNumber: `DL${flightNumRaw}`,
    confirmationCode,
    passengerName,
    departureAirport: { code: depCode, name: null },
    arrivalAirport: { code: arrCode, name: null },
    departureTimeLocal: utcToLocalIsoWithOffset(wallTimeToUtcIso(year, month, day, depTime, depTz), depTz),
    departureTimezone: depTz,
    arrivalTimeLocal: utcToLocalIsoWithOffset(wallTimeToUtcIso(arrYear, arrMonth, arrDay, arrTime, arrTz), arrTz),
    arrivalTimezone: arrTz,
    terminal: null,
    gate: null,
    seat: null,
    cabinClass: null,
    status: 'confirmed',
    notes: null,
    source: 'gmail',
    sourceRef: `${emailId}:DL${flightNumRaw}`,
    manuallyEdited: false,
  };
}

// Primary path: newer template with a baggage-fees table giving full date + real IATA route.
function fromRouteTable(html: string, confirmationCode: string | null, passengerName: string | null, emailId: string): FlightInput[] {
  const routeDates = [...html.matchAll(ROUTE_DATE_RE)];
  const flightBlocks = [...html.matchAll(FLIGHT_BLOCK_RE)];
  if (routeDates.length === 0 || routeDates.length !== flightBlocks.length) return [];

  const flights: FlightInput[] = [];
  for (let i = 0; i < routeDates.length; i++) {
    const [, dayStr, monthAbbr, yearStr, depCode, arrCode] = routeDates[i];
    const [, flightNumRaw, depTimeStr, arrTimeStr, rolloverDay, rolloverMonthAbbr] = flightBlocks[i];
    const month = MONTH_ABBR[monthAbbr];
    if (!month) continue;
    const flight = buildFlight(
      flightNumRaw, confirmationCode, passengerName, depCode, arrCode,
      Number(yearStr), month, Number(dayStr), depTimeStr, arrTimeStr,
      rolloverDay, rolloverMonthAbbr, emailId
    );
    if (flight) flights.push(flight);
  }
  return flights;
}

// Fallback for older templates lacking the IATA-route table: pull city names straight out of the
// DEPART/ARRIVE block and resolve them via DELTA_CITY_CODES, using the date header (day+month,
// no year) plus the subject line's year.
function fromCityNames(html: string, subject: string, confirmationCode: string | null, passengerName: string | null, emailId: string): FlightInput[] {
  const year = yearFromSubject(subject);
  if (!year) return [];

  const headers = [...html.matchAll(DATE_HEADER_RE)].map((m) => ({
    index: m.index ?? 0,
    month: MONTH_ABBR[m[2].charAt(0) + m[2].slice(1).toLowerCase()],
    day: Number(m[1]),
  }));
  if (headers.length === 0) return [];

  const LEG_RE =
    /DELTA\s+(\d+)<br>[\s\S]{0,700}?>\s*([A-Z][A-Z\- ]*)\s*<br>\s*(\d{1,2}:\d{2}\s*[ap]m)[\s\S]{0,700}?>\s*([A-Z][A-Z\- ]*)(?:<sup><\/sup>)?\s*<br>\s*(\d{1,2}:\d{2}\s*[ap]m)/gi;

  const flights: FlightInput[] = [];
  for (const leg of html.matchAll(LEG_RE)) {
    const [, flightNumRaw, depCityRaw, depTimeStr, arrCityRaw, arrTimeStr] = leg;
    const legIndex = leg.index ?? 0;
    const header = [...headers].reverse().find((h) => h.index <= legIndex);
    if (!header?.month) continue;

    const depCode = DELTA_CITY_CODES[depCityRaw.trim().toUpperCase()];
    const arrCode = DELTA_CITY_CODES[arrCityRaw.trim().toUpperCase()];
    if (!depCode || !arrCode) continue;

    const flight = buildFlight(
      flightNumRaw, confirmationCode, passengerName, depCode, arrCode,
      year, header.month, header.day, depTimeStr, arrTimeStr,
      undefined, undefined, emailId
    );
    if (flight) flights.push(flight);
  }
  return flights;
}

export const deltaParser: EmailParser = {
  airlineCode: 'DL',
  airlineName: 'Delta Air Lines',
  gmailQuery: 'from:(delta.com) subject:("flight receipt" OR confirmation OR itinerary OR "trip confirmation")',

  matches(email: RawEmail): boolean {
    if (!/delta\.com/i.test(email.from) || !email.bodyHtml) return false;
    return extractConfirmationCode(email.bodyHtml) !== null && /DELTA\s+\d+/.test(email.bodyHtml);
  },

  parse(email: RawEmail): FlightInput[] {
    const html = email.bodyHtml;
    if (!html) return [];

    const confirmationCode = extractConfirmationCode(html);
    const passengerMatch = html.match(PASSENGER_NAME_RE);
    const passengerName = passengerMatch ? passengerMatch[1].trim() : null;

    const viaRouteTable = fromRouteTable(html, confirmationCode, passengerName, email.id);
    if (viaRouteTable.length > 0) return viaRouteTable;

    return fromCityNames(html, email.subject, confirmationCode, passengerName, email.id);
  },
};
