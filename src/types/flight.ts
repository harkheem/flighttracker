export type BookingStatus = 'confirmed' | 'cancelled' | 'changed';

export type FlightSource = 'gmail' | 'airline_api' | 'webview' | 'manual';

export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first' | null;

export interface Airport {
  code: string; // IATA, e.g. "JFK"
  name: string | null;
}

export interface Flight {
  id: string; // uuid, primary key
  airlineName: string;
  airlineCode: string | null; // IATA, e.g. "DL"
  airlineLogoUrl: string | null;
  flightNumber: string; // e.g. "DL123"
  confirmationCode: string | null; // PNR

  departureAirport: Airport;
  arrivalAirport: Airport;

  // ISO 8601 with offset, e.g. "2026-08-01T14:30:00-04:00"
  departureTimeLocal: string;
  departureTimezone: string; // IANA, e.g. "America/New_York"
  arrivalTimeLocal: string;
  arrivalTimezone: string;

  terminal: string | null;
  gate: string | null;
  seat: string | null;
  cabinClass: CabinClass;
  status: BookingStatus;
  notes: string | null;

  source: FlightSource;
  sourceRef: string | null; // e.g. gmail message id, webview session id
  manuallyEdited: boolean;

  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// Fields a sync tier can populate; id/timestamps are assigned by the DB layer.
export type FlightInput = Omit<Flight, 'id' | 'createdAt' | 'updatedAt' | 'manuallyEdited'> & {
  manuallyEdited?: boolean;
};

export type ConnectionType = 'gmail' | 'airline_webview';

export interface Connection {
  id: string;
  type: ConnectionType;
  label: string; // e.g. "Gmail", "Delta"
  airlineCode: string | null; // set for airline_webview connections
  status: 'connected' | 'disconnected' | 'error';
  lastSyncedAt: string | null;
  lastError: string | null;
}
