import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';

// Global database instance
let db: Database | null = null;
let dbPath: string;

// Initialize synchronously
async function initDatabase(): Promise<Database> {
  if (db) return db;
  
  const SQL = await initSqlJs();
  dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data/webhub.db');
  
  // Ensure data directory exists
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      webhub_url TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      secret TEXT NOT NULL UNIQUE,
      access_token TEXT NOT NULL UNIQUE,
      config TEXT DEFAULT '{}',
      metrics TEXT DEFAULT '{"totalMessages":0,"messagesToday":0,"connections":0}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_heartbeat DATETIME
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      sender_id TEXT,
      sender_name TEXT,
      target_id TEXT,
      reply_to TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS message_queue (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      message_type TEXT DEFAULT 'text',
      content TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      status TEXT DEFAULT 'pending',
      scheduled_at DATETIME,
      processed_at DATETIME,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    )
  `);

  // P4: add thread_id column to messages (idempotent via try/catch)
  try { db.run(`ALTER TABLE messages ADD COLUMN thread_id TEXT`); } catch (_) { /* already exists */ }

  // P4: reactions table
  db.run(`
    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(message_id, emoji, user_id)
    )
  `);

  // P4: read receipts table
  db.run(`
    CREATE TABLE IF NOT EXISTS read_receipts (
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      PRIMARY KEY (message_id, user_id)
    )
  `);

  // P4: directory table
  db.run(`
    CREATE TABLE IF NOT EXISTS directory (
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT,
      avatar TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (channel_id, user_id)
    )
  `);

  // Save database
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  
  return db;
}

// Helper functions
function runDb(sql: string, params: (string | number | null)[] = []): void {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function getDb(): Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

// Export for use
export { initDatabase, runDb, getDb };

// Export a wrapper that initializes on first use
const _initPromise = initDatabase();

export default {
  prepare: (sql: string) => {
    const database = getDb();
    return {
      run: (...params: (string | number | null)[]) => {
        database.run(sql, params);
        const data = database.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
      },
      get: (...params: (string | number | null)[]) => {
        const stmt = database.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
          const result = stmt.getAsObject();
          stmt.free();
          return result;
        }
        stmt.free();
        return undefined;
      },
      all: (...params: (string | number | null)[]) => {
        const results: Record<string, unknown>[] = [];
        const stmt = database.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      }
    };
  }
};
