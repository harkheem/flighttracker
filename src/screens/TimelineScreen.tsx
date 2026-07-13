import React, { useMemo } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFlights } from '../state/FlightsContext';
import { FlightCard } from '../components/FlightCard';
import { isUpcoming } from '../utils/format';
import type { RootStackParamList } from '../navigation/types';
import type { Flight } from '../types/flight';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function TimelineScreen() {
  const navigation = useNavigation<Nav>();
  const { flights, loading, refresh } = useFlights();
  const insets = useSafeAreaInsets();

  const sections = useMemo(() => {
    const upcoming = flights.filter(isUpcoming).sort((a, b) =>
      a.departureTimeLocal.localeCompare(b.departureTimeLocal)
    );
    const past = flights
      .filter((f) => !isUpcoming(f))
      .sort((a, b) => b.departureTimeLocal.localeCompare(a.departureTimeLocal));

    const result = [];
    if (upcoming.length) result.push({ title: 'Upcoming', data: upcoming });
    if (past.length) result.push({ title: 'Past', data: past });
    return result;
  }, [flights]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Flights</Text>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item: Flight) => item.id}
        renderItem={({ item }) => (
          <FlightCard
            flight={item}
            onPress={() => navigation.navigate('FlightDetail', { flightId: item.id })}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        contentContainerStyle={sections.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No flights yet</Text>
            <Text style={styles.emptySubtitle}>
              Add a flight manually or connect Gmail from Settings to import your trips.
            </Text>
          </View>
        }
      />
      <Pressable
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => navigation.navigate('AddEditFlight', {})}
        accessibilityLabel="Add flight"
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#111827' },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 4,
    marginHorizontal: 16,
  },
  emptyContainer: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
});
