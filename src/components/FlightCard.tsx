import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { Flight } from '../types/flight';
import { formatDateTime } from '../utils/format';
import { useDestinationImage } from '../utils/destinationImage';
import { cityForAirport, wikiTitleForAirport } from '../utils/airportCities';
import { AirlineLogo } from './AirlineLogo';

export function FlightCard({ flight, onPress }: { flight: Flight; onPress: () => void }) {
  const dep = formatDateTime(flight.departureTimeLocal);
  const isCancelled = flight.status === 'cancelled';
  const destinationCity = cityForAirport(flight.arrivalAirport.code, flight.arrivalAirport.name);
  const wikiTitle = wikiTitleForAirport(flight.arrivalAirport.code, flight.arrivalAirport.name);
  const imageUrl = useDestinationImage(wikiTitle);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.banner}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.bannerFallback]} />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(17,24,39,0.85)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.bannerContent}>
          <View style={styles.row}>
            <Text style={styles.route}>
              {flight.departureAirport.code} → {flight.arrivalAirport.code}
            </Text>
            {isCancelled && <Text style={styles.cancelledBadge}>Cancelled</Text>}
            {flight.status === 'changed' && <Text style={styles.changedBadge}>Changed</Text>}
          </View>
          <Text style={styles.destinationCity} numberOfLines={1}>
            {destinationCity ?? flight.arrivalAirport.code}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.logoWrapper}>
          <AirlineLogo airlineCode={flight.airlineCode} airlineName={flight.airlineName} size={36} />
        </View>
        <View style={styles.bodyText}>
          <Text style={styles.datetime}>
            {dep.date} · {dep.time}
          </Text>
          <Text style={styles.subline}>{flight.flightNumber}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  banner: { height: 120, justifyContent: 'flex-end' },
  bannerFallback: { backgroundColor: '#374151' },
  bannerContent: { padding: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  route: { fontSize: 17, fontWeight: '800', color: '#fff' },
  destinationCity: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 2, fontWeight: '500' },
  cancelledBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: 'rgba(220,38,38,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  changedBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
    backgroundColor: 'rgba(251,191,36,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  body: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  logoWrapper: { marginRight: 10 },
  bodyText: { flex: 1 },
  datetime: { fontSize: 14, fontWeight: '600', color: '#111827' },
  subline: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
});
