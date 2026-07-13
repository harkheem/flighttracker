import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { WEBVIEW_ADAPTERS } from '../sync/tier2-webview/adapters';
import { processHarvestPayload } from '../sync/tier2-webview/processHarvest';
import { listConnections } from '../db/connectionsRepo';
import { useFlights } from '../state/FlightsContext';

// True background execution isn't possible for a WebView-based sync (iOS won't run a rendering
// context while backgrounded), so this is the closest practical substitute: whenever the app
// comes to the foreground, silently re-load each already-connected airline's "My Trips" page in a
// 1x1 invisible WebView, reusing the persisted login session cookies (WKWebView's cookie store
// survives app restarts), harvest the same way the interactive screen does, and save any new
// flights — no visible UI, no button tap. If the session has expired, extraction just comes back
// empty and the connection is marked 'error'; the user re-logs in via Settings when that happens.
const MIN_RESYNC_INTERVAL_MS = 4 * 60 * 60 * 1000; // don't hit the airline's site more than ~every 4h
const SYNC_TIMEOUT_MS = 15_000; // give up on a hung/never-loading page rather than block the queue

export function SilentAirlineSync() {
  const { refresh } = useFlights();
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(false);

  const runNext = () => {
    const next = queueRef.current.shift();
    setActiveCode(next ?? null);
    runningRef.current = next !== undefined;
  };

  const checkAndQueue = async () => {
    if (runningRef.current) return;
    const connections = await listConnections();
    const now = Date.now();
    const due = WEBVIEW_ADAPTERS.filter((adapter) => {
      const conn = connections.find((c) => c.id === `webview_${adapter.airlineCode}`);
      // Only auto-resync airlines the user has successfully connected at least once — this never
      // initiates a first-time login on its own.
      if (!conn || conn.status !== 'connected') return false;
      if (!conn.lastSyncedAt) return true;
      return now - new Date(conn.lastSyncedAt).getTime() > MIN_RESYNC_INTERVAL_MS;
    }).map((a) => a.airlineCode);

    queueRef.current = due;
    runNext();
  };

  useEffect(() => {
    checkAndQueue();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAndQueue();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!activeCode) return;
    const timeout = setTimeout(() => runNext(), SYNC_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [activeCode]);

  if (!activeCode) return null;
  const adapter = WEBVIEW_ADAPTERS.find((a) => a.airlineCode === activeCode);
  if (!adapter) {
    runNext();
    return null;
  }

  const handleMessage = async (event: WebViewMessageEvent) => {
    await processHarvestPayload(adapter, event.nativeEvent.data);
    await refresh();
    runNext();
  };

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        key={adapter.airlineCode}
        source={{ uri: adapter.myTripsUrl }}
        injectedJavaScriptBeforeContentLoaded={adapter.networkInterceptorScript}
        injectedJavaScript={adapter.extractionScript}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        style={styles.hidden}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
