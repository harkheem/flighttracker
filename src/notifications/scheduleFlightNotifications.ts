import * as Notifications from 'expo-notifications';
import type { Flight } from '../types/flight';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function identifierFor(flightId: string, kind: string): string {
  return `flight_${flightId}_${kind}`;
}

// Cancels and re-schedules all local reminders for a flight. Call this after any create/update
// (manual edit or auto-sync) so notifications always reflect the latest known times.
export async function scheduleFlightNotifications(flight: Flight): Promise<void> {
  const kinds = ['checkin', 'departure'];
  for (const kind of kinds) {
    await Notifications.cancelScheduledNotificationAsync(identifierFor(flight.id, kind)).catch(() => {});
  }

  if (flight.status === 'cancelled') return;

  const departure = new Date(flight.departureTimeLocal);
  const now = Date.now();

  const checkinTime = new Date(departure.getTime() - 24 * 60 * 60 * 1000);
  if (checkinTime.getTime() > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: identifierFor(flight.id, 'checkin'),
      content: {
        title: 'Check-in opens soon',
        body: `${flight.airlineName} ${flight.flightNumber} to ${flight.arrivalAirport.code} departs in 24 hours.`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: checkinTime },
    });
  }

  const departureReminderTime = new Date(departure.getTime() - 2 * 60 * 60 * 1000);
  if (departureReminderTime.getTime() > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: identifierFor(flight.id, 'departure'),
      content: {
        title: 'Upcoming flight',
        body: `${flight.airlineName} ${flight.flightNumber} departs from ${flight.departureAirport.code} in 2 hours${
          flight.gate ? ` (Gate ${flight.gate})` : ''
        }.`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: departureReminderTime },
    });
  }
}

// Compares old vs new flight state and fires an immediate notification on gate/terminal/status
// changes detected during a sync (as opposed to the pre-scheduled reminders above).
export async function notifyIfChanged(previous: Flight | null, updated: Flight): Promise<void> {
  if (!previous) return;

  const gateChanged = previous.gate !== updated.gate || previous.terminal !== updated.terminal;
  const statusChanged = previous.status !== updated.status;

  if (gateChanged && updated.gate) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Gate/terminal change',
        body: `${updated.airlineName} ${updated.flightNumber} is now at Terminal ${updated.terminal ?? '?'}, Gate ${
          updated.gate ?? '?'
        }.`,
      },
      trigger: null,
    });
  }

  if (statusChanged && updated.status === 'cancelled') {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Flight cancelled',
        body: `${updated.airlineName} ${updated.flightNumber} on ${updated.departureTimeLocal.slice(0, 10)} was cancelled.`,
      },
      trigger: null,
    });
  }
}
