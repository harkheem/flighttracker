import { searchGmailMessages } from './gmailApi';
import { listGmailAccounts, ensureValidAccessToken } from './gmailAuth';
import { EMAIL_PARSERS } from '../parsers';
import { upsertFlight } from '../../db/flightsRepo';
import { upsertConnection } from '../../db/connectionsRepo';
import { scheduleFlightNotifications } from '../../notifications/scheduleFlightNotifications';
import type { Flight } from '../../types/flight';

// Runs every registered per-airline email parser against every connected Gmail account and
// upserts any flights found. Called from Settings ("Sync now"), and from the background task
// (see sync/backgroundSync.ts).
export async function syncGmail(): Promise<Flight[]> {
  const accounts = await listGmailAccounts();
  if (accounts.length === 0) {
    throw new Error('Gmail is not connected.');
  }

  const imported: Flight[] = [];

  for (const email of accounts) {
    let lastError: string | null = null;
    try {
      const accessToken = await ensureValidAccessToken(email);

      for (const parser of EMAIL_PARSERS) {
        try {
          const emails = await searchGmailMessages(parser.gmailQuery, accessToken);
          for (const rawEmail of emails) {
            if (!parser.matches(rawEmail)) continue;
            const flights = parser.parse(rawEmail);
            for (const flightInput of flights) {
              const saved = await upsertFlight(flightInput);
              await scheduleFlightNotifications(saved);
              imported.push(saved);
            }
          }
        } catch (e) {
          // One airline's parser/search failing shouldn't block the others.
          lastError = e instanceof Error ? e.message : String(e);
        }
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    await upsertConnection({
      id: `gmail:${email}`,
      type: 'gmail',
      label: email,
      airlineCode: null,
      status: lastError ? 'error' : 'connected',
      lastSyncedAt: new Date().toISOString(),
      lastError,
    });
  }

  return imported;
}
