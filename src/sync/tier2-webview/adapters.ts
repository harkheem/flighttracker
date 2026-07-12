import type { WebViewAirlineAdapter } from '../parsers/webviewTypes';

// TODO(real-world-testing, per ARCHITECTURE.md Tier 2): Every adapter below is a scaffold, not a
// working scraper. Each airline's "My Trips" page structure, login flow, and bot-detection
// posture (e.g. Akamai/PerimeterX challenges, which several major US airlines use) needs to be
// inspected against a real logged-in session before extractionScript/parseExtractedPayload can
// work. Treat this as the wiring for Tier 2, not a finished integration:
//   1. Load myTripsUrl in the WebView and manually verify login works without being blocked.
//   2. Inspect the DOM of the post-login trips page (Safari/Chrome remote debugging on the
//      WebView) to find stable selectors for flight number, route, date/time, seat, etc.
//   3. Update extractionScript to pull that data and postMessage it back as JSON.
//   4. Implement parseExtractedPayload to map that JSON into FlightInput[].
// Ship these disabled by default in Settings until a given airline's adapter is verified working.

const NOT_YET_IMPLEMENTED_SCRIPT = `
  // TODO: replace with real DOM extraction for this airline's My Trips page.
  window.ReactNativeWebView.postMessage(JSON.stringify({ status: 'not_implemented' }));
  true;
`;

function stubAdapter(airlineCode: string, airlineName: string, myTripsUrl: string): WebViewAirlineAdapter {
  return {
    airlineCode,
    airlineName,
    myTripsUrl,
    extractionScript: NOT_YET_IMPLEMENTED_SCRIPT,
    parseExtractedPayload(_payload: string) {
      // TODO: implement once extractionScript above is filled in for this airline.
      return [];
    },
  };
}

export const WEBVIEW_ADAPTERS: WebViewAirlineAdapter[] = [
  stubAdapter('DL', 'Delta Air Lines', 'https://www.delta.com/mytrips/'),
  stubAdapter('UA', 'United Airlines', 'https://www.united.com/en/us/manageres/mytrips'),
  stubAdapter('AA', 'American Airlines', 'https://www.aa.com/reservation/view/find-your-trip'),
  stubAdapter('WN', 'Southwest Airlines', 'https://www.southwest.com/air/manage-reservation/'),
];
