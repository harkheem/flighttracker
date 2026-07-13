import type { WebViewAirlineAdapter } from '../parsers/webviewTypes';
import type { Flight } from '../../types/flight';
import { upsertFlight } from '../../db/flightsRepo';
import { upsertConnection } from '../../db/connectionsRepo';
import { scheduleFlightNotifications } from '../../notifications/scheduleFlightNotifications';

// Shared by the interactive AirlineWebViewScreen (manual capture) and SilentAirlineSync
// (automatic, on app foreground) — parses a harvested payload, saves any flights found, and
// records connection status. Returns the saved flights (empty if extraction found nothing).
export async function processHarvestPayload(
  adapter: WebViewAirlineAdapter,
  rawPayload: string
): Promise<Flight[]> {
  let parsedFlights: ReturnType<typeof adapter.parseExtractedPayload>;
  try {
    parsedFlights = adapter.parseExtractedPayload(rawPayload);
  } catch {
    parsedFlights = [];
  }

  if (parsedFlights.length === 0) {
    await upsertConnection({
      id: `webview_${adapter.airlineCode}`,
      type: 'airline_webview',
      label: adapter.airlineName,
      airlineCode: adapter.airlineCode,
      status: 'error',
      lastSyncedAt: new Date().toISOString(),
      lastError: 'No trips extracted (not logged in, no upcoming trips, or extraction not yet implemented for this airline).',
    });
    return [];
  }

  const saved: Flight[] = [];
  for (const flight of parsedFlights) {
    const savedFlight = await upsertFlight(flight);
    await scheduleFlightNotifications(savedFlight);
    saved.push(savedFlight);
  }
  await upsertConnection({
    id: `webview_${adapter.airlineCode}`,
    type: 'airline_webview',
    label: adapter.airlineName,
    airlineCode: adapter.airlineCode,
    status: 'connected',
    lastSyncedAt: new Date().toISOString(),
    lastError: null,
  });
  return saved;
}
