import type { FlightInput } from '../../types/flight';
import type { WebViewHarvestPayload } from '../parsers/webviewTypes';
import { timezoneForAirport, utcToLocalIsoWithOffset } from '../../utils/timezone';

// Built against a real capture from this user's logged-in United "My Trips" session
// (2026-07-13). Unlike every other airline captured so far, United's
// `mytrips/MyTripsByMileagePlus` API gives BOTH local and UTC timestamps directly per segment —
// no wall-clock/offset inference needed, just look up the IANA zone name for display.

interface UnitedAirport {
  IATACode?: string;
}

interface UnitedFlightSegment {
  DepartureAirport?: UnitedAirport;
  ArrivalAirport?: UnitedAirport;
  DepartureUTCDateTime?: string; // "5/26/2026 4:55:00 PM" (US format, already UTC)
  ArrivalUTCDateTime?: string;
  FlightNumber?: string;
  OperatingAirlineCode?: string;
}

interface UnitedSegmentEntry {
  FlightSegment?: UnitedFlightSegment;
  Seat?: { SeatClass?: string };
}

interface UnitedTraveler {
  Person?: { GivenName?: string; Surname?: string };
}

interface UnitedTrip {
  ConfirmationID?: string;
  FlightSegments?: UnitedSegmentEntry[];
  Travelers?: UnitedTraveler[];
}

interface UnitedTripsResponse {
  Data?: UnitedTrip[];
}

// Parses United's US-format "M/D/YYYY h:mm:ss AM/PM" UTC timestamp into a real ISO instant.
function parseUnitedUtcDateTime(value: string): string | null {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/);
  if (!m) return null;
  const [, moStr, dStr, yStr, hStr, miStr, sStr, ampm] = m;
  let hour = Number(hStr) % 12;
  if (ampm === 'PM') hour += 12;
  const utcMs = Date.UTC(Number(yStr), Number(moStr) - 1, Number(dStr), hour, Number(miStr), Number(sStr));
  return new Date(utcMs).toISOString();
}

function extractSeat(seatClass: string | undefined): string | null {
  if (!seatClass) return null;
  const m = seatClass.match(/^(\d{1,3}[A-Z])/);
  return m ? m[1] : null;
}

export function parseUnitedPayload(rawPayload: string): FlightInput[] {
  let payload: WebViewHarvestPayload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return [];
  }

  const tripsResponse = payload.captured.find((r) => r.url.includes('mytrips/MyTripsByMileagePlus'));
  if (!tripsResponse) return [];

  let body: UnitedTripsResponse;
  try {
    body = JSON.parse(tripsResponse.body);
  } catch {
    return [];
  }

  const flights: FlightInput[] = [];

  for (const trip of body.Data ?? []) {
    const passengerName = (trip.Travelers ?? [])
      .map((t) => [t.Person?.GivenName, t.Person?.Surname].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(' & ') || null;

    for (const segEntry of trip.FlightSegments ?? []) {
      const seg = segEntry.FlightSegment;
      const depCode = seg?.DepartureAirport?.IATACode;
      const arrCode = seg?.ArrivalAirport?.IATACode;
      if (!seg?.FlightNumber || !depCode || !arrCode || !seg.DepartureUTCDateTime || !seg.ArrivalUTCDateTime) {
        continue;
      }

      const depTz = timezoneForAirport(depCode);
      const arrTz = timezoneForAirport(arrCode);
      if (!depTz || !arrTz) continue;

      const depUtcIso = parseUnitedUtcDateTime(seg.DepartureUTCDateTime);
      const arrUtcIso = parseUnitedUtcDateTime(seg.ArrivalUTCDateTime);
      if (!depUtcIso || !arrUtcIso) continue;

      flights.push({
        airlineName: 'United Airlines',
        airlineCode: 'UA',
        airlineLogoUrl: null,
        flightNumber: `UA${seg.FlightNumber.trim()}`,
        confirmationCode: trip.ConfirmationID ? trip.ConfirmationID.toUpperCase() : null,
        passengerName,
        departureAirport: { code: depCode, name: null },
        arrivalAirport: { code: arrCode, name: null },
        departureTimeLocal: utcToLocalIsoWithOffset(depUtcIso, depTz),
        departureTimezone: depTz,
        arrivalTimeLocal: utcToLocalIsoWithOffset(arrUtcIso, arrTz),
        arrivalTimezone: arrTz,
        terminal: null,
        gate: null,
        seat: extractSeat(segEntry.Seat?.SeatClass),
        cabinClass: null, // United's fare-class letter code isn't a reliable cabin-name mapping
        status: 'confirmed',
        notes: null,
        source: 'webview',
        sourceRef: `webview_UA:${trip.ConfirmationID ?? seg.FlightNumber}:${depCode}${arrCode}`,
        manuallyEdited: false,
      });
    }
  }

  return flights;
}
