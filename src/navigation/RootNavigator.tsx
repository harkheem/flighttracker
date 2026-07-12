import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TimelineScreen } from '../screens/TimelineScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { FlightDetailScreen } from '../screens/FlightDetailScreen';
import { AddEditFlightScreen } from '../screens/AddEditFlightScreen';
import { AirlineWebViewScreen } from '../screens/AirlineWebViewScreen';
import type { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Timeline" component={TimelineScreen} options={{ title: 'Flights' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="FlightDetail" component={FlightDetailScreen} options={{ title: 'Flight' }} />
      <Stack.Screen
        name="AddEditFlight"
        component={AddEditFlightScreen}
        options={{ title: 'Add / Edit Flight', presentation: 'modal' }}
      />
      <Stack.Screen
        name="AirlineWebView"
        component={AirlineWebViewScreen}
        options={{ title: 'Connect Airline' }}
      />
    </Stack.Navigator>
  );
}
