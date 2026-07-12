import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import type { Connection } from '../types/flight';

interface ConnectionRow {
  id: string;
  type: string;
  label: string;
  airline_code: string | null;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
}

function rowToConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    type: row.type as Connection['type'],
    label: row.label,
    airlineCode: row.airline_code,
    status: row.status as Connection['status'],
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
  };
}

export async function listConnections(): Promise<Connection[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ConnectionRow>('SELECT * FROM connections ORDER BY label ASC');
  return rows.map(rowToConnection);
}

export async function upsertConnection(
  input: Omit<Connection, 'id'> & { id?: string }
): Promise<Connection> {
  const db = await getDb();
  const id = input.id ?? Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO connections (id, type, label, airline_code, status, last_synced_at, last_error)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type, label = excluded.label, airline_code = excluded.airline_code,
       status = excluded.status, last_synced_at = excluded.last_synced_at, last_error = excluded.last_error`,
    [id, input.type, input.label, input.airlineCode, input.status, input.lastSyncedAt, input.lastError]
  );
  const db2 = await getDb();
  const row = await db2.getFirstAsync<ConnectionRow>('SELECT * FROM connections WHERE id = ?', [id]);
  return rowToConnection(row!);
}

export async function deleteConnection(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM connections WHERE id = ?', [id]);
}
