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

// Finds an existing flight matching the dedupe key, if any.
// Primary key: flight_number + departure_time_local (day) + confirmation_code.
// Falls back to flight_number + departure day if either side lacks a confirmation code.
export async function findDuplicate(input: FlightInput): Promise<Flight | null> {
  const db = await getDb();
  const departureDay = input.departureTimeLocal.slice(0, 10);

  if (input.confirmationCode) {
    const row = await db.getFirstAsync<FlightRow>(
      `SELECT * FROM flights
       WHERE flight_number = ?
         AND substr(departure_time_local, 1, 10) = ?
         AND (confirmation_code = ? OR confirmation_code IS NULL)
       LIMIT 1`,
      [input.flightNumber, departureDay, input.confirmationCode]
    );
    if (row) return rowToFlight(row);
  }

  const row = await db.getFirstAsync<FlightRow>(
    `SELECT * FROM flights
     WHERE flight_number = ? AND substr(departure_time_local, 1, 10) = ?
     LIMIT 1`,
    [input.flightNumber, departureDay]
  );
  return row ? rowToFlight(row) : null;
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
        id, airline_name, airline_code, airline_logo_url, flight_number, confirmation_code,
        departure_airport_code, departure_airport_name, arrival_airport_code, arrival_airport_name,
        departure_time_local, departure_timezone, arrival_time_local, arrival_timezone,
        terminal, gate, seat, cabin_class, status, notes,
        source, source_ref, manually_edited, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.airlineName,
        input.airlineCode,
        input.airlineLogoUrl,
        input.flightNumber,
        input.confirmationCode,
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
      airline_name = ?, airline_code = ?, airline_logo_url = ?, flight_number = ?, confirmation_code = ?,
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
