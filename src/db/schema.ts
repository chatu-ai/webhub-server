import DatabaseConstructor from 'better-sqlite3';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DatabaseType = any;

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data/webhub.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db: DatabaseType = new DatabaseConstructor(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  -- Channels table (each channel = a tenant unit)
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    server_url TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    secret TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL UNIQUE,
    config TEXT DEFAULT '{}',
    metrics TEXT DEFAULT '{"totalMessages":0,"messagesToday":0,"connections":0}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat DATETIME
  );

  -- Messages table (channel-scoped)
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
  );

  -- Message Queue table (channel-scoped)
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
  );

  -- WebSocket Connections table (channel-scoped)
  CREATE TABLE IF NOT EXISTS ws_connections (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    remote_addr TEXT,
    user_agent TEXT,
    status TEXT DEFAULT 'connected',
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    disconnected_at DATETIME,
    metadata TEXT DEFAULT '{}',
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
  );

  -- Audit Log table
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    channel_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details TEXT DEFAULT '{}',
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes
  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_queue_channel_status ON message_queue(channel_id, status);
  CREATE INDEX IF NOT EXISTS idx_ws_connections_channel ON ws_connections(channel_id, status);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
`);

export default db;
