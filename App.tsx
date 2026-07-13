import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { FlightsProvider } from './src/state/FlightsContext';
import { requestNotificationPermissions } from './src/notifications/scheduleFlightNotifications';
import { registerBackgroundSync } from './src/sync/backgroundSync';
import { SilentAirlineSync } from './src/components/SilentAirlineSync';

export default function App() {
  useEffect(() => {
    requestNotificationPermissions();
    registerBackgroundSync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <FlightsProvider>
          <NavigationContainer>
            <RootNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
          <SilentAirlineSync />
        </FlightsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
