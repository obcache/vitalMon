import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import type { ExportPayload, LogEvent, LoggedReading, MonitorSettings } from '../src/shared/types';

export class MetricsDatabase {
  private constructor(
    private readonly SQL: SqlJsStatic,
    private readonly db: Database,
    private readonly dbPath: string
  ) {}

  static async open(userDataPath: string): Promise<MetricsDatabase> {
    const dbDir = path.join(userDataPath, 'data');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'vitals-monitor.sqlite3');
    const localWasmPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist');
    const wasmPath = fs.existsSync(path.join(localWasmPath, 'sql-wasm.wasm'))
      ? localWasmPath
      : path.join(process.resourcesPath, 'sql.js');

    const SQL = await initSqlJs({ locateFile: (file) => path.join(wasmPath, file) });
    const db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
    const store = new MetricsDatabase(SQL, db, dbPath);
    store.initialize();
    return store;
  }

  get path(): string {
    return this.dbPath;
  }

  loadSettings<T extends MonitorSettings>(fallback: T): T {
    const row = this.db.exec("SELECT value FROM settings WHERE key = 'monitorSettings' LIMIT 1")[0]?.values[0]?.[0];
    if (typeof row !== 'string') {
      return fallback;
    }

    try {
      return { ...fallback, ...JSON.parse(row), thresholds: { ...fallback.thresholds, ...JSON.parse(row).thresholds } };
    } catch {
      return fallback;
    }
  }

  saveSettings(settings: MonitorSettings): void {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run(['monitorSettings', JSON.stringify(settings)]);
    stmt.free();
    this.persist();
  }

  insertReading(reading: Omit<LoggedReading, 'id'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO readings
      (timestamp, hostname, ip_address, system_json, metrics_json, logging_reason, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      reading.timestamp,
      reading.hostname,
      reading.ipAddress,
      JSON.stringify(reading.system),
      JSON.stringify(reading.metrics),
      reading.loggingReason,
      reading.sessionId ?? null
    ]);
    stmt.free();
    this.persist();
  }

  insertEvent(event: Omit<LogEvent, 'id'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO events (timestamp, type, source, message, session_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run([event.timestamp, event.type, event.source, event.message, event.sessionId ?? null]);
    stmt.free();
    this.persist();
  }

  getRecentReadings(limit = 240): LoggedReading[] {
    const result = this.db.exec(`
      SELECT id, timestamp, hostname, ip_address, system_json, metrics_json, logging_reason, session_id
      FROM readings
      ORDER BY timestamp DESC
      LIMIT ${Number(limit)}
    `)[0];
    if (!result) {
      return [];
    }

    return result.values
      .map((row) => this.rowToReading(row))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  getReadingsInRange(from: number, to: number): LoggedReading[] {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, hostname, ip_address, system_json, metrics_json, logging_reason, session_id
      FROM readings
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `);
    stmt.bind([from, to]);
    const readings: LoggedReading[] = [];
    while (stmt.step()) {
      readings.push(this.rowToReading(stmt.get()));
    }
    stmt.free();
    return readings;
  }

  getEvents(limit = 120): LogEvent[] {
    const result = this.db.exec(`
      SELECT id, timestamp, type, source, message, session_id
      FROM events
      ORDER BY timestamp DESC
      LIMIT ${Number(limit)}
    `)[0];
    if (!result) {
      return [];
    }

    return result.values
      .map((row) => this.rowToEvent(row))
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  getEventsInRange(from: number, to: number): LogEvent[] {
    const stmt = this.db.prepare(`
      SELECT id, timestamp, type, source, message, session_id
      FROM events
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `);
    stmt.bind([from, to]);
    const events: LogEvent[] = [];
    while (stmt.step()) {
      events.push(this.rowToEvent(stmt.get()));
    }
    stmt.free();
    return events;
  }

  importPayload(payload: ExportPayload): void {
    this.db.run('BEGIN TRANSACTION');
    try {
      for (const reading of payload.readings) {
        this.insertReading({
          timestamp: reading.timestamp,
          hostname: reading.hostname,
          ipAddress: reading.ipAddress,
          system: reading.system,
          metrics: reading.metrics,
          loggingReason: 'imported',
          sessionId: reading.sessionId
        });
      }
      this.insertEvent({
        timestamp: Date.now(),
        type: 'import',
        source: 'Import',
        message: `Imported ${payload.readings.length} readings from JSON`,
        sessionId: undefined
      });
      this.db.run('COMMIT');
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    } finally {
      this.persist();
    }
  }

  close(): void {
    this.persist();
    this.db.close();
  }

  private initialize(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        hostname TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        system_json TEXT NOT NULL,
        metrics_json TEXT NOT NULL,
        logging_reason TEXT NOT NULL,
        session_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON readings(timestamp);
      CREATE INDEX IF NOT EXISTS idx_readings_session ON readings(session_id);

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        session_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    `);
    this.persist();
  }

  private persist(): void {
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }

  private rowToReading(row: (string | number | Uint8Array | null)[]): LoggedReading {
    return {
      id: Number(row[0]),
      timestamp: Number(row[1]),
      hostname: String(row[2]),
      ipAddress: String(row[3]),
      system: JSON.parse(String(row[4])),
      metrics: JSON.parse(String(row[5])),
      loggingReason: row[6] as LoggedReading['loggingReason'],
      sessionId: typeof row[7] === 'string' ? row[7] : undefined
    };
  }

  private rowToEvent(row: (string | number | Uint8Array | null)[]): LogEvent {
    return {
      id: Number(row[0]),
      timestamp: Number(row[1]),
      type: row[2] as LogEvent['type'],
      source: String(row[3]),
      message: String(row[4]),
      sessionId: typeof row[5] === 'string' ? row[5] : undefined
    };
  }
}
