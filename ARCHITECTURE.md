# FlightTracker — Technical Plan

## Stack
- **Expo (dev client, SDK 57)** + TypeScript + React Navigation (native-stack + bottom-tabs)
- **expo-sqlite** for local-first storage (single on-device DB, no backend)
- **expo-secure-store** for all secrets (OAuth refresh tokens; airline credentials are *never* stored — see Tier 2)
- **expo-task-manager + expo-background-task** for periodic re-sync
- **expo-notifications** for local check-in/gate/departure reminders
- **react-native-webview** for Tier 2 authenticated "My Trips" scraping
- **expo-auth-session** for Google OAuth (Gmail readonly)

Dev-client (not Expo Go) from day one, since secure-store's Keychain/Keystore entitlements,
background-task, notifications, and Google Sign-In all need custom native config/entitlements
that Expo Go can't provide. Run via `npx expo run:ios` / `run:android` or an EAS dev build.

## Sync architecture — tiered fallback

Each source tier writes into the same `flights` table via a common `UpsertFlight` contract, tagged
with `source` (`gmail` | `airline_api` | `webview` | `manual`) and `source_ref` (a stable per-tier
key like a Gmail message id or PNR). A merge step (`src/sync/merge.ts`) then dedupes by
`(flight_number, departure_date, confirmation_code)` — see Duplicate Detection below.

### Tier 1 — Gmail parsing (primary)
1. User connects Gmail via Google Sign-In (`expo-auth-session`), scope `gmail.readonly` only.
2. Access/refresh tokens land in `expo-secure-store`, never in SQLite, never leave the device.
3. A sync job queries the Gmail API (`users.messages.list` with airline-specific search queries,
   e.g. `from:confirmation@delta.com`) and fetches matching message bodies.
4. Per-airline parser modules (`src/sync/parsers/{delta,united,american,southwest}.ts`) implement
   a shared `EmailParser` interface: given raw email HTML/text, return zero or more normalized
   `Flight` objects. Parsing is regex/DOM-pattern based against each airline's confirmation
   template — brittle by nature, isolated per-file so one airline's breakage doesn't affect others.
5. Where a parser can extract a PNR but not full itinerary detail, it can optionally call that
   airline's public "manage my booking" lookup (flight number/date + confirmation code, no login)
   to fill in gaps — implemented per-airline, best-effort.

### Tier 2 — Airline login (secondary, feasible airlines only)
- **Preferred:** official/partner API where available (rare — mostly corporate/GDS partnerships).
  None of the four prioritized airlines currently expose a public consumer booking-lookup API, so
  this path starts unimplemented with a typed adapter interface ready for one if it appears.
- **Fallback:** `react-native-webview` loads the airline's real "My Trips" login page. The user
  authenticates *inside the WebView* — credentials go directly to the airline's servers via the
  WebView's own network stack; the app never sees or stores them. After login, an injected content
  script (`injectedJavaScript`) or `onMessage` bridge extracts the rendered trip list HTML, which a
  per-airline DOM parser converts to normalized `Flight` records.
- This tier is explicitly best-effort: airline site markup changes, may trigger bot/fraud
  detection, and likely violates airline Terms of Service for automated use — flagged in code
  comments on every Tier 2 file. Ship it disabled by default; user opts in per airline.

### Tier 3 — Manual entry (fallback, always available)
Full CRUD form. Also serves as the correction path for any Tier 1/2 record — editing a
non-manual flight reclassifies it with `source: 'manual'` and locks it from being overwritten by
future auto-syncs (`manually_edited` flag).

## Duplicate detection
Merge key: normalized `flight_number + departure_date (local) + confirmation_code` (confirmation
code compared case-insensitively; falls back to flight_number + departure_date if no confirmation
code is present on one side, with a warning surfaced in Settings for manual review). On conflict,
higher-trust tier wins for display (manual > webview > gmail) but all contributing sources are
recorded for debugging.

## Credential/token storage
- **Airline username/password:** never stored by the app, period (Tier 2 uses a live WebView
  session only; no persisted cookies re-injected outside that WebView's own storage).
- **Gmail OAuth tokens:** `expo-secure-store` (iOS Keychain / Android Keystore-backed), keyed
  `gmail_access_token` / `gmail_refresh_token`. Never written to SQLite or logs.
- **SQLite database:** flight data only — no PII beyond what's already visible on a boarding pass.

## Data model
See `src/types/flight.ts` — normalized `Flight` record with airline, flight number, confirmation
code, origin/destination airport objects, timezone-aware departure/arrival, terminal/gate, seat,
cabin class, status, and `source`/`source_ref`/`manually_edited` for provenance.

## Build order (matches delivery plan)
1. Schema + navigation + screens (Timeline, Detail, Add/Edit, Settings)
2. Tier 3 manual entry, fully working end-to-end
3. Tier 1 Gmail OAuth + one parser (Delta) as proof of concept
4. Tier 2 WebView scraping scaffolded with TODOs (no live per-airline parser yet — needs testing
   against real accounts, flagged inline)
