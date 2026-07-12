import { searchGmailMessages } from './gmailApi';
import { isGmailConnected } from './gmailAuth';
import { EMAIL_PARSERS } from '../parsers';
import { upsertFlight } from '../../db/flightsRepo';
import { upsertConnection } from '../../db/connectionsRepo';
import { scheduleFlightNotifications } from '../../notifications/scheduleFlightNotifications';
import type { Flight } from '../../types/flight';

// Runs every registered per-airline email parser against Gmail and upserts any flights found.
// Called from Settings ("Sync now"), and from the background task (see sync/backgroundSync.ts).
export async function syncGmail(): Promise<Flight[]> {
  if (!(await isGmailConnected())) {
    throw new Error('Gmail is not connected.');
  }

  const imported: Flight[] = [];
  let lastError: string | null = null;

  for (const parser of EMAIL_PARSERS) {
    try {
      const emails = await searchGmailMessages(parser.gmailQuery);
      for (const email of emails) {
        if (!parser.matches(email)) continue;
        const flights = parser.parse(email);
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

  await upsertConnection({
    id: 'gmail',
    type: 'gmail',
    label: 'Gmail',
    airlineCode: null,
    status: lastError ? 'error' : 'connected',
    lastSyncedAt: new Date().toISOString(),
    lastError,
  });

  return imported;
}
