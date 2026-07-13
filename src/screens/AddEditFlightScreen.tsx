import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import type { CabinClass, Flight, FlightInput } from '../types/flight';
import { getFlight, upsertFlight } from '../db/flightsRepo';
import { useFlights } from '../state/FlightsContext';
import { scheduleFlightNotifications } from '../notifications/scheduleFlightNotifications';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type EditRoute = RouteProp<RootStackParamList, 'AddEditFlight'>;

interface FormState {
  airlineName: string;
  airlineCode: string;
  flightNumber: string;
  confirmationCode: string;
  passengerName: string;
  departureAirportCode: string;
  departureAirportName: string;
  arrivalAirportCode: string;
  arrivalAirportName: string;
  departureDate: string; // YYYY-MM-DD
  departureTime: string; // HH:MM
  arrivalDate: string;
  arrivalTime: string;
  terminal: string;
  gate: string;
  seat: string;
  cabinClass: CabinClass;
  notes: string;
}

const EMPTY_FORM: FormState = {
  airlineName: '',
  airlineCode: '',
  flightNumber: '',
  confirmationCode: '',
  passengerName: '',
  departureAirportCode: '',
  departureAirportName: '',
  arrivalAirportCode: '',
  arrivalAirportName: '',
  departureDate: '',
  departureTime: '',
  arrivalDate: '',
  arrivalTime: '',
  terminal: '',
  gate: '',
  seat: '',
  cabinClass: null,
  notes: '',
};

function flightToForm(f: Flight): FormState {
  const [depDate, depTimeFull] = f.departureTimeLocal.split('T');
  const [arrDate, arrTimeFull] = f.arrivalTimeLocal.split('T');
  return {
    airlineName: f.airlineName,
    airlineCode: f.airlineCode ?? '',
    flightNumber: f.flightNumber,
    confirmationCode: f.confirmationCode ?? '',
    passengerName: f.passengerName ?? '',
    departureAirportCode: f.departureAirport.code,
    departureAirportName: f.departureAirport.name ?? '',
    arrivalAirportCode: f.arrivalAirport.code,
    arrivalAirportName: f.arrivalAirport.name ?? '',
    departureDate: depDate ?? '',
    departureTime: (depTimeFull ?? '').slice(0, 5),
    arrivalDate: arrDate ?? '',
    arrivalTime: (arrTimeFull ?? '').slice(0, 5),
    terminal: f.terminal ?? '',
    gate: f.gate ?? '',
    seat: f.seat ?? '',
    cabinClass: f.cabinClass,
    notes: f.notes ?? '',
  };
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoCapitalize?: 'characters' | 'words' | 'none';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize ?? 'none'}
        placeholderTextColor="#9CA3AF"
      />
    </View>
  );
}

export function AddEditFlightScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<EditRoute>();
  const { refresh } = useFlights();
  const editingId = route.params?.flightId;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [existing, setExisting] = useState<Flight | null>(null);

  useEffect(() => {
    if (editingId) {
      getFlight(editingId).then((f) => {
        if (f) {
          setExisting(f);
          setForm(flightToForm(f));
        }
      });
    }
  }, [editingId]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (
      !form.airlineName ||
      !form.flightNumber ||
      !form.departureAirportCode ||
      !form.arrivalAirportCode ||
      !form.departureDate ||
      !form.departureTime ||
      !form.arrivalDate ||
      !form.arrivalTime
    ) {
      Alert.alert('Missing info', 'Airline, flight number, airports, and dates/times are required.');
      return;
    }

    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const input: FlightInput = {
      airlineName: form.airlineName.trim(),
      airlineCode: form.airlineCode.trim() || null,
      airlineLogoUrl: null,
      flightNumber: form.flightNumber.trim().toUpperCase(),
      confirmationCode: form.confirmationCode.trim() || null,
      passengerName: form.passengerName.trim() || null,
      departureAirport: {
        code: form.departureAirportCode.trim().toUpperCase(),
        name: form.departureAirportName.trim() || null,
      },
      arrivalAirport: {
        code: form.arrivalAirportCode.trim().toUpperCase(),
        name: form.arrivalAirportName.trim() || null,
      },
      departureTimeLocal: `${form.departureDate}T${form.departureTime}:00`,
      departureTimezone: existing?.departureTimezone ?? localTz,
      arrivalTimeLocal: `${form.arrivalDate}T${form.arrivalTime}:00`,
      arrivalTimezone: existing?.arrivalTimezone ?? localTz,
      terminal: form.terminal.trim() || null,
      gate: form.gate.trim() || null,
      seat: form.seat.trim() || null,
      cabinClass: form.cabinClass,
      status: existing?.status ?? 'confirmed',
      notes: form.notes.trim() || null,
      source: 'manual',
      sourceRef: existing?.sourceRef ?? null,
      manuallyEdited: true,
    };

    const saved = await upsertFlight(input);
    await scheduleFlightNotifications(saved);
    await refresh();
    navigation.navigate('FlightDetail', { flightId: saved.id });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Airline & Flight</Text>
        <Field label="Airline name" value={form.airlineName} onChangeText={set('airlineName')} placeholder="Delta Air Lines" autoCapitalize="words" />
        <Field label="Airline code (IATA)" value={form.airlineCode} onChangeText={set('airlineCode')} placeholder="DL" autoCapitalize="characters" />
        <Field label="Flight number" value={form.flightNumber} onChangeText={set('flightNumber')} placeholder="DL123" autoCapitalize="characters" />
        <Field label="Confirmation code" value={form.confirmationCode} onChangeText={set('confirmationCode')} placeholder="ABC123" autoCapitalize="characters" />
        <Field label="Passenger name" value={form.passengerName} onChangeText={set('passengerName')} placeholder="Who is this flight for?" autoCapitalize="words" />

        <Text style={styles.sectionTitle}>Departure</Text>
        <Field label="Airport code" value={form.departureAirportCode} onChangeText={set('departureAirportCode')} placeholder="JFK" autoCapitalize="characters" />
        <Field label="Airport name" value={form.departureAirportName} onChangeText={set('departureAirportName')} placeholder="John F. Kennedy Intl" autoCapitalize="words" />
        <Field label="Date (YYYY-MM-DD)" value={form.departureDate} onChangeText={set('departureDate')} placeholder="2026-08-01" />
        <Field label="Time (HH:MM, 24h)" value={form.departureTime} onChangeText={set('departureTime')} placeholder="14:30" />
        <Field label="Terminal" value={form.terminal} onChangeText={set('terminal')} placeholder="4" />
        <Field label="Gate" value={form.gate} onChangeText={set('gate')} placeholder="B12" autoCapitalize="characters" />

        <Text style={styles.sectionTitle}>Arrival</Text>
        <Field label="Airport code" value={form.arrivalAirportCode} onChangeText={set('arrivalAirportCode')} placeholder="LAX" autoCapitalize="characters" />
        <Field label="Airport name" value={form.arrivalAirportName} onChangeText={set('arrivalAirportName')} placeholder="Los Angeles Intl" autoCapitalize="words" />
        <Field label="Date (YYYY-MM-DD)" value={form.arrivalDate} onChangeText={set('arrivalDate')} placeholder="2026-08-01" />
        <Field label="Time (HH:MM, 24h)" value={form.arrivalTime} onChangeText={set('arrivalTime')} placeholder="17:45" />

        <Text style={styles.sectionTitle}>Booking</Text>
        <Field label="Seat" value={form.seat} onChangeText={set('seat')} placeholder="14C" autoCapitalize="characters" />
        <Field label="Cabin class" value={form.cabinClass ?? ''} onChangeText={(v) => setForm((p) => ({ ...p, cabinClass: (v || null) as CabinClass }))} placeholder="economy" />
        <Field label="Notes" value={form.notes} onChangeText={set('notes')} placeholder="Optional notes" autoCapitalize="none" />

        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>{editingId ? 'Save changes' : 'Add flight'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 48 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
  },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  saveButton: {
    marginTop: 24,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
