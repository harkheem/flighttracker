import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES_SQL } from './schema';

const DB_NAME = 'flighttracker.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// expo-sqlite has no built-in migration system — CREATE TABLE IF NOT EXISTS won't add columns to
// an already-existing table, so new columns need an explicit ALTER TABLE guarded by a existence
// check (safe to re-run; does nothing once the column is present).
async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(flights)');
  const hasPassengerName = columns.some((c) => c.name === 'passenger_name');
  if (!hasPassengerName) {
    await db.execAsync('ALTER TABLE flights ADD COLUMN passenger_name TEXT');
  }
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(CREATE_TABLES_SQL);
      await runMigrations(db);
      return db;
    });
  }
  return dbPromise;
}
