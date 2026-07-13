import React, { useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WEBVIEW_ADAPTERS } from '../sync/tier2-webview/adapters';
import { processHarvestPayload } from '../sync/tier2-webview/processHarvest';
import { useFlights } from '../state/FlightsContext';
import type { WebViewHarvestPayload } from '../sync/parsers/webviewTypes';

type ParamList = { AirlineWebView: { airlineCode: string } };

// Tier 2 entry point: loads the airline's real "My Trips" page. The user authenticates directly
// with the airline inside this WebView — credentials go straight over the WebView's own network
// stack to the airline's servers and are never captured, read, or stored by this app.
//
// Extraction is manually triggered (the "Capture trip data" button) rather than fired
// automatically after the first page load, since login flows involve multiple page navigations
// (login -> MFA -> redirect to trips) and there's no reliable way to detect "the trips are now on
// screen" from outside the page. The user taps it once trips are actually visible.
//
// TODO(real-world-testing): see src/sync/tier2-webview/adapters.ts — parseExtractedPayload is
// still a stub per airline pending a real captured API response to build against.
export function AirlineWebViewScreen() {
  const route = useRoute<RouteProp<ParamList, 'AirlineWebView'>>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { refresh } = useFlights();
  const webViewRef = useRef<WebView>(null);

  const adapter = WEBVIEW_ADAPTERS.find((a) => a.airlineCode === route.params.airlineCode);
  if (!adapter) return null;

  const handleCapturePress = () => {
    webViewRef.current?.injectJavaScript(adapter.extractionScript);
  };

  const handleMessage = async (event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;

    if (__DEV__) {
      try {
        const parsed: WebViewHarvestPayload = JSON.parse(raw);
        console.log(
          `[webview:${adapter.airlineCode}] title="${parsed.title}" captured=${parsed.captured.length} bodyTextSnippetLen=${parsed.bodyTextSnippet.length}`
        );
        for (const res of parsed.captured) {
          console.log(`[webview:${adapter.airlineCode}] captured ${res.method} ${res.status} ${res.url} bodyLen=${res.body.length}`);
          console.log(`[webview:${adapter.airlineCode}] CAPTURED_BODY_START url=${res.url}`);
          console.log(res.body);
          console.log(`[webview:${adapter.airlineCode}] CAPTURED_BODY_END`);
        }
        console.log(`[webview:${adapter.airlineCode}] BODY_TEXT_SNIPPET_START`);
        console.log(parsed.bodyTextSnippet);
        console.log(`[webview:${adapter.airlineCode}] BODY_TEXT_SNIPPET_END`);
      } catch (e) {
        console.log(`[webview:${adapter.airlineCode}] failed to parse harvest payload`, e);
      }
    }

    const saved = await processHarvestPayload(adapter, raw);

    if (saved.length === 0) {
      Alert.alert(
        'No trips found',
        `Couldn't extract trip data from ${adapter.airlineName} — make sure you're logged in and your trips are visible on screen, then try again.`
      );
      return;
    }

    await refresh();
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: adapter.myTripsUrl }}
        injectedJavaScriptBeforeContentLoaded={adapter.networkInterceptorScript}
        onMessage={handleMessage}
        // Credentials are handled entirely by the airline's own page — this app never reads
        // form fields, only network responses/DOM text via the harvest script.
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
      />
      <Pressable
        style={[styles.captureButton, { bottom: insets.bottom + 16 }]}
        onPress={handleCapturePress}
      >
        <Text style={styles.captureButtonText}>Capture trip data</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  captureButton: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  captureButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
