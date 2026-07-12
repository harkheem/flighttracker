import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { isGmailConnected } from './tier1-gmail/gmailAuth';
import { syncGmail } from './tier1-gmail/gmailSync';

export const BACKGROUND_SYNC_TASK = 'flighttracker-background-sync';

// Tier 2 (WebView) intentionally does not run in the background — it requires an interactive
// login session and can't run headlessly. Only Tier 1 (Gmail, token-based) is safe to refresh here.
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    if (await isGmailConnected()) {
      await syncGmail();
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Registers the periodic background sync. Actual run interval is governed by the OS
// (iOS BGTaskScheduler / Android WorkManager) and is a minimum, not a guarantee.
export async function registerBackgroundSync(): Promise<void> {
  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
  if (alreadyRegistered) return;

  await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
    minimumInterval: 240, // minutes (4h); OS treats this as a floor, not a guarantee
  });
}
