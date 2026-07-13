import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { Connection } from '../types/flight';
import { listConnections } from '../db/connectionsRepo';
import { connectGmail, disconnectGmail, listGmailAccounts } from '../sync/tier1-gmail/gmailAuth';
import { syncGmail } from '../sync/tier1-gmail/gmailSync';
import { WEBVIEW_ADAPTERS } from '../sync/tier2-webview/adapters';
import { useFlights } from '../state/FlightsContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function ConnectionRow({
  title,
  subtitle,
  status,
  actionLabel,
  onPress,
  busy,
}: {
  title: string;
  subtitle: string;
  status: Connection['status'] | 'not_connected';
  actionLabel: string;
  onPress: () => void;
  busy?: boolean;
}) {
  const statusColor =
    status === 'connected' ? '#059669' : status === 'error' ? '#DC2626' : '#9CA3AF';
  const statusLabel =
    status === 'connected' ? 'Connected' : status === 'error' ? 'Error' : 'Not connected';

  return (
    <View style={styles.connectionRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.connectionTitle}>{title}</Text>
        <Text style={styles.connectionSubtitle}>{subtitle}</Text>
        <Text style={[styles.connectionStatus, { color: statusColor }]}>{statusLabel}</Text>
      </View>
      <Pressable style={styles.connectionAction} onPress={onPress} disabled={busy}>
        <Text style={styles.connectionActionText}>{busy ? '…' : actionLabel}</Text>
      </Pressable>
    </View>
  );
}

export function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { refresh: refreshFlights } = useFlights();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [gmailAccounts, setGmailAccounts] = useState<string[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setConnections(await listConnections());
    setGmailAccounts(await listGmailAccounts());
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const connectionFor = (id: string) => connections.find((c) => c.id === id) ?? null;

  const handleSyncAllGmail = async () => {
    setBusyKey('gmail-sync-all');
    try {
      await syncGmail();
      await refreshFlights();
      await reload();
    } catch (e) {
      Alert.alert('Gmail sync', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddGmailAccount = async () => {
    setBusyKey('gmail-add');
    try {
      await connectGmail();
      await syncGmail();
      await refreshFlights();
      await reload();
    } catch (e) {
      Alert.alert('Gmail sign-in', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleGmailDisconnect = (email: string) => {
    Alert.alert(`Disconnect ${email}?`, 'Imported flights will remain, but auto-sync for this account will stop.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await disconnectGmail(email);
          await reload();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
    >
      <Text style={styles.screenTitle}>Settings</Text>
      <Text style={styles.sectionTitle}>Email (Tier 1)</Text>
      {gmailAccounts.map((email) => {
        const conn = connectionFor(`gmail:${email}`);
        return (
          <View key={email}>
            <ConnectionRow
              title={email}
              subtitle={`Last synced: ${conn?.lastSyncedAt?.slice(0, 16).replace('T', ' ') ?? 'never'}`}
              status={conn?.status ?? 'connected'}
              actionLabel="Sync now"
              onPress={handleSyncAllGmail}
              busy={busyKey === 'gmail-sync-all'}
            />
            <Pressable onPress={() => handleGmailDisconnect(email)}>
              <Text style={styles.disconnectLink}>Disconnect</Text>
            </Pressable>
          </View>
        );
      })}
      <Pressable style={styles.manualButton} onPress={handleAddGmailAccount} disabled={busyKey === 'gmail-add'}>
        <Text style={styles.manualButtonText}>
          {busyKey === 'gmail-add'
            ? 'Connecting…'
            : gmailAccounts.length === 0
              ? 'Connect Gmail'
              : 'Add another Gmail account'}
        </Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Airline logins (Tier 2, best-effort)</Text>
      {WEBVIEW_ADAPTERS.map((adapter) => {
        const conn = connectionFor(`webview_${adapter.airlineCode}`);
        return (
          <ConnectionRow
            key={adapter.airlineCode}
            title={adapter.airlineName}
            subtitle="Logs in via the airline's own site inside the app — your password is never stored"
            status={conn?.status ?? 'not_connected'}
            actionLabel={conn?.status === 'connected' ? 'Re-sync' : 'Connect'}
            onPress={() => navigation.navigate('AirlineWebView', { airlineCode: adapter.airlineCode })}
          />
        );
      })}

      <Text style={styles.sectionTitle}>Manual (Tier 3)</Text>
      <Pressable style={styles.manualButton} onPress={() => navigation.navigate('AddEditFlight', {})}>
        <Text style={styles.manualButtonText}>Add a flight by hand</Text>
      </Pressable>

      <Text style={styles.footerNote}>
        All flight data and any stored tokens live only on this device. Airline passwords are
        never captured or stored by this app.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 48 },
  screenTitle: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 8,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  connectionTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  connectionSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  connectionStatus: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  connectionAction: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  connectionActionText: { fontSize: 13, fontWeight: '600', color: '#111827' },
  disconnectLink: { fontSize: 13, color: '#DC2626', marginTop: -4, marginBottom: 4 },
  manualButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  manualButtonText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  footerNote: { fontSize: 12, color: '#9CA3AF', marginTop: 32, textAlign: 'center' },
});
