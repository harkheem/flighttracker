import type { FlightInput } from '../../types/flight';

// Raw shape posted back by the shared harvest script (see adapters.ts) — captured
// fetch/XHR responses from the airline's own SPA, plus a DOM text fallback.
export interface WebViewCapturedResponse {
  url: string;
  method: string;
  status: number;
  body: string;
}

export interface WebViewHarvestPayload {
  captured: WebViewCapturedResponse[];
  bodyTextSnippet: string;
  title: string;
}

export interface WebViewAirlineAdapter {
  airlineCode: string;
  airlineName: string;
  // "My Trips" URL to load in the WebView; user logs in here directly with the airline.
  myTripsUrl: string;
  // Installed via injectedJavaScriptBeforeContentLoaded, before the airline's own JS runs.
  // Monkey-patches fetch/XHR to record responses so real API JSON can be captured, since most
  // airline "My Trips" pages are JS SPAs that render from a background API call rather than
  // server-rendered HTML (confirmed against Delta/Southwest — view-source is empty on both).
  networkInterceptorScript: string;
  // Runs after the page loads; waits for the SPA to settle, then posts a WebViewHarvestPayload
  // back via window.ReactNativeWebView.postMessage(...).
  extractionScript: string;
  // Parses the JSON-stringified WebViewHarvestPayload into normalized flights. Returns [] if this
  // airline's real API response shape hasn't been reverse-engineered yet (see adapters.ts).
  parseExtractedPayload(payload: string): FlightInput[];
}
