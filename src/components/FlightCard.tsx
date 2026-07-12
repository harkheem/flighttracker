import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Flight } from '../types/flight';
import { airlineColor, airlineInitials, formatDateTime } from '../utils/format';

export function FlightCard({ flight, onPress }: { flight: Flight; onPress: () => void }) {
  const dep = formatDateTime(flight.departureTimeLocal);
  const isCancelled = flight.status === 'cancelled';

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.logo, { backgroundColor: airlineColor(flight.airlineCode) }]}>
        <Text style={styles.logoText}>{airlineInitials(flight.airlineName)}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.route}>
            {flight.departureAirport.code} → {flight.arrivalAirport.code}
          </Text>
          <Text style={styles.flightNumber}>{flight.flightNumber}</Text>
        </View>
        <Text style={styles.datetime}>
          {dep.date} · {dep.time}
        </Text>
        <View style={styles.row}>
          <Text style={styles.confCode}>
            {flight.confirmationCode ? `Conf: ${flight.confirmationCode}` : 'No confirmation code'}
          </Text>
          {isCancelled && <Text style={styles.cancelledBadge}>Cancelled</Text>}
          {flight.status === 'changed' && <Text style={styles.changedBadge}>Changed</Text>}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  body: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  route: { fontSize: 16, fontWeight: '700', color: '#111827' },
  flightNumber: { fontSize: 13, color: '#6B7280' },
  datetime: { fontSize: 14, color: '#374151', marginTop: 2 },
  confCode: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  cancelledBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  changedBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
