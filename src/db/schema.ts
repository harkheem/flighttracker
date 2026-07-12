export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS flights (
  id TEXT PRIMARY KEY NOT NULL,
  airline_name TEXT NOT NULL,
  airline_code TEXT,
  airline_logo_url TEXT,
  flight_number TEXT NOT NULL,
  confirmation_code TEXT,

  departure_airport_code TEXT NOT NULL,
  departure_airport_name TEXT,
  arrival_airport_code TEXT NOT NULL,
  arrival_airport_name TEXT,

  departure_time_local TEXT NOT NULL,
  departure_timezone TEXT NOT NULL,
  arrival_time_local TEXT NOT NULL,
  arrival_timezone TEXT NOT NULL,

  terminal TEXT,
  gate TEXT,
  seat TEXT,
  cabin_class TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  notes TEXT,

  source TEXT NOT NULL,
  source_ref TEXT,
  manually_edited INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flights_departure ON flights(departure_time_local);
CREATE INDEX IF NOT EXISTS idx_flights_dedupe ON flights(flight_number, departure_time_local, confirmation_code);

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  airline_code TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_synced_at TEXT,
  last_error TEXT
);
`;
