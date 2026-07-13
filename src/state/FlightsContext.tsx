import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Flight } from '../types/flight';
import { listFlights } from '../db/flightsRepo';

interface FlightsContextValue {
  flights: Flight[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const FlightsContext = createContext<FlightsContextValue | undefined>(undefined);

export function FlightsProvider({ children }: { children: React.ReactNode }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const rows = await listFlights();
    console.log(
      `[FlightsContext] loaded ${rows.length} flight(s) from DB: ${rows
        .map((f) => `${f.flightNumber}@${f.departureTimeLocal.slice(0, 10)}`)
        .join(', ')}`
    );
    setFlights(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <FlightsContext.Provider value={{ flights, loading, refresh }}>
      {children}
    </FlightsContext.Provider>
  );
}

export function useFlights(): FlightsContextValue {
  const ctx = useContext(FlightsContext);
  if (!ctx) throw new Error('useFlights must be used within a FlightsProvider');
  return ctx;
}
