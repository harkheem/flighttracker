import type { FlightInput } from '../../types/flight';

export interface WebViewAirlineAdapter {
  airlineCode: string;
  airlineName: string;
  // "My Trips" URL to load in the WebView; user logs in here directly with the airline.
  myTripsUrl: string;
  // JS injected into the WebView after load to serialize the trips list DOM and post it back
  // via `window.ReactNativeWebView.postMessage(...)`. Runs inside the airline's own page context.
  extractionScript: string;
  // Parses the HTML/JSON string posted back by extractionScript into normalized flights.
  parseExtractedPayload(payload: string): FlightInput[];
}
