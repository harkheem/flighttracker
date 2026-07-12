import type { Flight } from '../types/flight';
import { getFlight } from '../db/flightsRepo';
import { lookupByConfirmationCode } from './parsers/manageBooking';

// Manual "refresh this flight" action from the detail screen.
// Routes by the flight's source tier; for gmail/airline_api flights this re-runs a
// best-effort manage-my-booking lookup keyed on the confirmation code (Tier 1 fallback,
// see ARCHITECTURE.md). Manually entered flights have nothing to refresh against.
export async function refreshFlight(flight: Flight): Promise<Flight> {
  if (flight.source === 'manual') {
    return flight;
  }

  if (flight.confirmationCode && flight.airlineCode) {
    await lookupByConfirmationCode(flight.airlineCode, flight.confirmationCode, flight.flightNumber);
  }

  // TODO(tier2): for webview-sourced flights, re-open the airline WebView sync
  // (src/sync/tier2-webview) to re-scrape "My Trips" rather than relying on manage-booking lookup.

  const latest = await getFlight(flight.id);
  return latest ?? flight;
}
