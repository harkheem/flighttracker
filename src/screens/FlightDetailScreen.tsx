import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import type { Flight } from '../types/flight';
import { getFlight, deleteFlight } from '../db/flightsRepo';
import { useFlights } from '../state/FlightsContext';
import { formatDateTime } from '../utils/format';
import { refreshFlight } from '../sync/refreshFlight';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type DetailRoute = RouteProp<RootStackParamList, 'FlightDetail'>;

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function FlightDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<DetailRoute>();
  const { refresh: refreshList } = useFlights();
  const [flight, setFlight] = useState<Flight | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getFlight(route.params.flightId).then(setFlight);
  }, [route.params.flightId]);

  if (!flight) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const dep = formatDateTime(flight.departureTimeLocal);
  const arr = formatDateTime(flight.arrivalTimeLocal);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const updated = await refreshFlight(flight);
      setFlight(updated);
      await refreshList();
    } catch (e) {
      Alert.alert('Refresh failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete flight?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteFlight(flight.id);
          await refreshList();
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.route}>
        {flight.departureAirport.code} → {flight.arrivalAirport.code}
      </Text>
      <Text style={styles.airline}>
        {flight.airlineName} {flight.flightNumber}
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Departure</Text>
        <Row label="Airport" value={`${flight.departureAirport.code} — ${flight.departureAirport.name ?? ''}`} />
        <Row label="Date" value={dep.date} />
        <Row label="Time" value={`${dep.time} (${flight.departureTimezone})`} />
        <Row label="Terminal" value={flight.terminal} />
        <Row label="Gate" value={flight.gate} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Arrival</Text>
        <Row label="Airport" value={`${flight.arrivalAirport.code} — ${flight.arrivalAirport.name ?? ''}`} />
        <Row label="Date" value={arr.date} />
        <Row label="Time" value={`${arr.time} (${flight.arrivalTimezone})`} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Booking</Text>
        <Row label="Confirmation" value={flight.confirmationCode} />
        <Row label="Seat" value={flight.seat} />
        <Row label="Cabin" value={flight.cabinClass} />
        <Row label="Status" value={flight.status} />
        <Row label="Source" value={`${flight.source}${flight.manuallyEdited ? ' (edited)' : ''}`} />
      </View>

      {flight.notes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.rowValue}>{flight.notes}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable style={styles.actionButton} onPress={handleRefresh} disabled={refreshing}>
          <Text style={styles.actionButtonText}>
            {refreshing ? 'Refreshing…' : 'Refresh this flight'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.actionButton}
          onPress={() => navigation.navigate('AddEditFlight', { flightId: flight.id })}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </Pressable>
        <Pressable style={[styles.actionButton, styles.deleteButton]} onPress={handleDelete}>
          <Text style={[styles.actionButtonText, styles.deleteButtonText]}>Delete</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 48 },
  route: { fontSize: 28, fontWeight: '800', color: '#111827' },
  airline: { fontSize: 15, color: '#6B7280', marginTop: 4, marginBottom: 20 },
  section: { marginBottom: 20, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB', paddingTop: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 14, color: '#6B7280' },
  rowValue: { fontSize: 14, color: '#111827', fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  actions: { marginTop: 8, gap: 10 },
  actionButton: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionButtonText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  deleteButton: { backgroundColor: '#FEE2E2' },
  deleteButtonText: { color: '#DC2626' },
});
