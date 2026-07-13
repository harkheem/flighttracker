import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import type { Flight, FlightInput } from '../types/flight';

interface FlightRow {
  id: string;
  airline_name: string;
  airline_code: string | null;
  airline_logo_url: string | null;
  flight_number: string;
  confirmation_code: string | null;
  passenger_name: string | null;
  departure_airport_code: string;
  departure_airport_name: string | null;
  arrival_airport_code: string;
  arrival_airport_name: string | null;
  departure_time_local: string;
  departure_timezone: string;
  arrival_time_local: string;
  arrival_timezone: string;
  terminal: string | null;
  gate: string | null;
  seat: string | null;
  cabin_class: string | null;
  status: string;
  notes: string | null;
  source: string;
  source_ref: string | null;
  manually_edited: number;
  created_at: string;
  updated_at: string;
}

function rowToFlight(row: FlightRow): Flight {
  return {
    id: row.id,
    airlineName: row.airline_name,
    airlineCode: row.airline_code,
    airlineLogoUrl: row.airline_logo_url,
    flightNumber: row.flight_number,
    confirmationCode: row.confirmation_code,
    passengerName: row.passenger_name,
    departureAirport: { code: row.departure_airport_code, name: row.departure_airport_name },
    arrivalAirport: { code: row.arrival_airport_code, name: row.arrival_airport_name },
    departureTimeLocal: row.departure_time_local,
    departureTimezone: row.departure_timezone,
    arrivalTimeLocal: row.arrival_time_local,
    arrivalTimezone: row.arrival_timezone,
    terminal: row.terminal,
    gate: row.gate,
    seat: row.seat,
    cabinClass: row.cabin_class as Flight['cabinClass'],
    status: row.status as Flight['status'],
    notes: row.notes,
    source: row.source as Flight['source'],
    sourceRef: row.source_ref,
    manuallyEdited: row.manually_edited === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listFlights(): Promise<Flight[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FlightRow>(
    'SELECT * FROM flights ORDER BY departure_time_local ASC'
  );
  return rows.map(rowToFlight);
}

export async function getFlight(id: string): Promise<Flight | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<FlightRow>('SELECT * FROM flights WHERE id = ?', [id]);
  return row ? rowToFlight(row) : null;
}

// Same person's name is often spelled differently across airlines/sources — dropped middle
// names, hyphens, spacing, or sometimes just a single first name. Two names are only treated as
// genuinely different travelers when both are multi-word names with a clearly different last
// token (surname) and no other overlapping token — a bare single-word fragment like "Hakeem" or
// "Abdul" is too ambiguous to safely flag as a conflict, so it defaults to "same person" rather
// than risking a spurious duplicate row.
function nameTokens(name: string): string[] {
  return name.toUpperCase().replace(/[^A-Z]+/g, ' ').split(' ').filter(Boolean);
}

function namesLikelyMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return true; // missing name on either side shouldn't block a match
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return true;
  if (ta.length === 1 || tb.length === 1) return true; // a bare fragment can't confirm a conflict
  if (ta[ta.length - 1] === tb[tb.length - 1]) return true; // shared surname
  return ta.some((t) => tb.includes(t)); // any shared token (first/middle name overlap)
}

// Finds an existing flight matching the dedupe key, if any.
// Primary key: flight_number + departure_time_local (day) + confirmation_code, refined by a fuzzy
// passenger-name match — this is included so multiple travelers on the same booking (e.g. a
// flight booked for someone else) land as distinct rows rather than colliding into one, without
// being thrown off by cross-airline name-spelling differences (see namesLikelyMatch).
// Falls back to flight_number + departure day if either side lacks a confirmation code.
export async function findDuplicate(input: FlightInput): Promise<Flight | null> {
  const db = await getDb();
  const departureDay = input.departureTimeLocal.slice(0, 10);

  if (input.confirmationCode) {
    const rows = await db.getAllAsync<FlightRow>(
      `SELECT * FROM flights
       WHERE flight_number = ?
         AND substr(departure_time_local, 1, 10) = ?
         AND (confirmation_code = ? OR confirmation_code IS NULL)`,
      [input.flightNumber, departureDay, input.confirmationCode]
    );
    const match = rows.find((row) => namesLikelyMatch(row.passenger_name, input.passengerName));
    if (match) return rowToFlight(match);
  }

  const rows = await db.getAllAsync<FlightRow>(
    `SELECT * FROM flights WHERE flight_number = ? AND substr(departure_time_local, 1, 10) = ?`,
    [input.flightNumber, departureDay]
  );
  const match = rows.find((row) => namesLikelyMatch(row.passenger_name, input.passengerName));
  return match ? rowToFlight(match) : null;
}

const SOURCE_TRUST: Record<Flight['source'], number> = {
  manual: 3,
  webview: 2,
  airline_api: 2,
  gmail: 1,
};

// Inserts a new flight, or merges into an existing duplicate (see findDuplicate).
// A manually-edited flight is never overwritten by an auto-sync tier.
export async function upsertFlight(input: FlightInput): Promise<Flight> {
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = await findDuplicate(input);

  if (!existing) {
    const id = Crypto.randomUUID();
    await db.runAsync(
      `INSERT INTO flights (
        id, airline_name, airline_code, airline_logo_url, flight_number, confirmation_code, passenger_name,
        departure_airport_code, departure_airport_name, arrival_airport_code, arrival_airport_name,
        departure_time_local, departure_timezone, arrival_time_local, arrival_timezone,
        terminal, gate, seat, cabin_class, status, notes,
        source, source_ref, manually_edited, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.airlineName,
        input.airlineCode,
        input.airlineLogoUrl,
        input.flightNumber,
        input.confirmationCode,
        input.passengerName,
        input.departureAirport.code,
        input.departureAirport.name,
        input.arrivalAirport.code,
        input.arrivalAirport.name,
        input.departureTimeLocal,
        input.departureTimezone,
        input.arrivalTimeLocal,
        input.arrivalTimezone,
        input.terminal,
        input.gate,
        input.seat,
        input.cabinClass,
        input.status,
        input.notes,
        input.source,
        input.sourceRef,
        input.manuallyEdited ? 1 : 0,
        now,
        now,
      ]
    );
    return (await getFlight(id))!;
  }

  // Don't let a lower-trust auto-sync clobber a manual correction.
  if (existing.manuallyEdited && input.source !== 'manual') {
    return existing;
  }
  if (SOURCE_TRUST[input.source] < SOURCE_TRUST[existing.source] && input.source !== 'manual') {
    return existing;
  }

  await db.runAsync(
    `UPDATE flights SET
      airline_name = ?, airline_code = ?, airline_logo_url = ?, flight_number = ?, confirmation_code = ?, passenger_name = ?,
      departure_airport_code = ?, departure_airport_name = ?, arrival_airport_code = ?, arrival_airport_name = ?,
      departure_time_local = ?, departure_timezone = ?, arrival_time_local = ?, arrival_timezone = ?,
      terminal = ?, gate = ?, seat = ?, cabin_class = ?, status = ?, notes = ?,
      source = ?, source_ref = ?, manually_edited = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.airlineName,
      input.airlineCode,
      input.airlineLogoUrl,
      input.flightNumber,
      input.confirmationCode,
      input.passengerName,
      input.departureAirport.code,
      input.departureAirport.name,
      input.arrivalAirport.code,
      input.arrivalAirport.name,
      input.departureTimeLocal,
      input.departureTimezone,
      input.arrivalTimeLocal,
      input.arrivalTimezone,
      input.terminal,
      input.gate,
      input.seat,
      input.cabinClass,
      input.status,
      input.notes,
      input.source,
      input.sourceRef,
      input.manuallyEdited ? 1 : 0,
      now,
      existing.id,
    ]
  );
  return (await getFlight(existing.id))!;
}

export async function deleteFlight(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM flights WHERE id = ?', [id]);
}
