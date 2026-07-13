import type { WebViewAirlineAdapter } from '../parsers/webviewTypes';
import { parseSouthwestPayload } from './southwest';
import { parseUnitedPayload } from './united';

// TODO(real-world-testing, per ARCHITECTURE.md Tier 2): This captures real network traffic from
// each airline's "My Trips" SPA — see NETWORK_INTERCEPTOR_SCRIPT below — which is far more
// reliable than DOM scraping since it's the airline's own API JSON, not markup that changes on
// every redesign. But parseExtractedPayload below is still a stub per airline: the exact response
// shape (URL pattern, JSON structure) has to be observed from a real logged-in session before it
// can be parsed. Workflow to finish an airline:
//   1. Log in via this screen with a real account.
//   2. The harvested payload (captured fetch/XHR responses + a DOM text fallback) gets posted
//      back; wire up a temporary console.log of it (see AirlineWebViewScreen) to inspect via
//      Metro logs, the same way the Gmail parsers were built against real email samples.
//   3. Find the response containing trip/reservation data, then fill in parseExtractedPayload.
// Ship an airline disabled/hidden in Settings until its adapter is verified against a real trip.

// Installed before the page's own JS runs. Patches fetch/XHR to record any response whose URL
// looks trip/reservation-related, capped to avoid unbounded memory growth on a chatty SPA.
const NETWORK_INTERCEPTOR_SCRIPT = `
(function() {
  if (window.__ftInterceptorInstalled) { return true; }
  window.__ftInterceptorInstalled = true;
  window.__ftCaptured = [];

  var KEYWORDS = ['trip', 'reservation', 'booking', 'itinerary', 'pnr', 'mytrips', 'my-trips', 'findyourtrip', 'air-reservation', 'manage'];

  function isInteresting(url) {
    try {
      var lower = String(url).toLowerCase();
      return KEYWORDS.some(function(k) { return lower.indexOf(k) !== -1; });
    } catch (e) {
      return false;
    }
  }

  function record(url, method, status, bodyText) {
    try {
      if (!isInteresting(url)) return;
      if (window.__ftCaptured.length >= 20) return;
      window.__ftCaptured.push({ url: String(url), method: String(method || 'GET'), status: Number(status) || 0, body: String(bodyText || '').slice(0, 20000) });
    } catch (e) {}
  }

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function(input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = (init && init.method) || (input && input.method) || 'GET';
      return origFetch.apply(this, arguments).then(function(res) {
        try {
          res.clone().text().then(function(text) { record(url, method, res.status, text); }).catch(function() {});
        } catch (e) {}
        return res;
      });
    };
  }

  var OrigXHR = window.XMLHttpRequest;
  if (OrigXHR) {
    var origOpen = OrigXHR.prototype.open;
    var origSend = OrigXHR.prototype.send;
    OrigXHR.prototype.open = function(method, url) {
      this.__ftUrl = url;
      this.__ftMethod = method;
      return origOpen.apply(this, arguments);
    };
    OrigXHR.prototype.send = function() {
      var self = this;
      this.addEventListener('loadend', function() {
        try { record(self.__ftUrl, self.__ftMethod, self.status, self.responseText); } catch (e) {}
      });
      return origSend.apply(this, arguments);
    };
  }
  true;
})();
`;

// Runs after the page finishes loading. Waits for the SPA to settle (background API calls fire
// after initial render), then posts back everything captured plus a DOM text fallback.
const HARVEST_SCRIPT = `
(function() {
  setTimeout(function() {
    var payload = {
      captured: window.__ftCaptured || [],
      bodyTextSnippet: (document.body && document.body.innerText || '').slice(0, 8000),
      title: document.title || ''
    };
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }, 5000);
  true;
})();
`;

function stubAdapter(airlineCode: string, airlineName: string, myTripsUrl: string): WebViewAirlineAdapter {
  return {
    airlineCode,
    airlineName,
    myTripsUrl,
    networkInterceptorScript: NETWORK_INTERCEPTOR_SCRIPT,
    extractionScript: HARVEST_SCRIPT,
    parseExtractedPayload(_payload: string) {
      // TODO: implement once a real captured response has been inspected for this airline.
      return [];
    },
  };
}

export const WEBVIEW_ADAPTERS: WebViewAirlineAdapter[] = [
  stubAdapter('DL', 'Delta Air Lines', 'https://www.delta.com/mytrips/'),
  {
    airlineCode: 'UA',
    airlineName: 'United Airlines',
    myTripsUrl: 'https://www.united.com/en/us/manageres/mytrips',
    networkInterceptorScript: NETWORK_INTERCEPTOR_SCRIPT,
    extractionScript: HARVEST_SCRIPT,
    parseExtractedPayload: parseUnitedPayload,
  },
  stubAdapter('AA', 'American Airlines', 'https://www.aa.com/reservation/view/find-your-trip'),
  {
    airlineCode: 'WN',
    airlineName: 'Southwest Airlines',
    myTripsUrl: 'https://www.southwest.com/my-account/upcoming-trips',
    networkInterceptorScript: NETWORK_INTERCEPTOR_SCRIPT,
    extractionScript: HARVEST_SCRIPT,
    parseExtractedPayload: parseSouthwestPayload,
  },
];
