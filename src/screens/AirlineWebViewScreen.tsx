import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import { WEBVIEW_ADAPTERS } from '../sync/tier2-webview/adapters';
import { upsertFlight } from '../db/flightsRepo';
import { upsertConnection } from '../db/connectionsRepo';
import { useFlights } from '../state/FlightsContext';
import { scheduleFlightNotifications } from '../notifications/scheduleFlightNotifications';

type ParamList = { AirlineWebView: { airlineCode: string } };

// Tier 2 entry point: loads the airline's real "My Trips" page. The user authenticates directly
// with the airline inside this WebView — credentials go straight over the WebView's own network
// stack to the airline's servers and are never captured, read, or stored by this app.
//
// TODO(real-world-testing): see src/sync/tier2-webview/adapters.ts — the extraction scripts here
// are unimplemented stubs and need per-airline work against a real logged-in session.
export function AirlineWebViewScreen() {
  const route = useRoute<RouteProp<ParamList, 'AirlineWebView'>>();
  const navigation = useNavigation();
  const { refresh } = useFlights();
  const [loaded, setLoaded] = useState(false);

  const adapter = WEBVIEW_ADAPTERS.find((a) => a.airlineCode === route.params.airlineCode);
  if (!adapter) return null;

  const handleMessage = async (event: WebViewMessageEvent) => {
    const payload = event.nativeEvent.data;
    let parsedFlights: ReturnType<typeof adapter.parseExtractedPayload>;
    try {
      parsedFlights = adapter.parseExtractedPayload(payload);
    } catch {
      parsedFlights = [];
    }

    if (parsedFlights.length === 0) {
      await upsertConnection({
        id: `webview_${adapter.airlineCode}`,
        type: 'airline_webview',
        label: adapter.airlineName,
        airlineCode: adapter.airlineCode,
        status: 'error',
        lastSyncedAt: new Date().toISOString(),
        lastError: 'Extraction not yet implemented for this airline (see adapters.ts TODO).',
      });
      Alert.alert(
        'Not yet supported',
        `${adapter.airlineName} trip extraction isn't implemented yet — this connection type is scaffolded but needs per-airline testing. Use manual entry for now.`
      );
      navigation.goBack();
      return;
    }

    for (const flight of parsedFlights) {
      const saved = await upsertFlight(flight);
      await scheduleFlightNotifications(saved);
    }
    await upsertConnection({
      id: `webview_${adapter.airlineCode}`,
      type: 'airline_webview',
      label: adapter.airlineName,
      airlineCode: adapter.airlineCode,
      status: 'connected',
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });
    await refresh();
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: adapter.myTripsUrl }}
        onLoadEnd={() => setLoaded(true)}
        injectedJavaScript={loaded ? adapter.extractionScript : undefined}
        onMessage={handleMessage}
        // Credentials are handled entirely by the airline's own page — this app never reads
        // form fields, only the post-login trips DOM via extractionScript.
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
