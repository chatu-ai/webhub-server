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
  -- Tenants table
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT UNIQUE,
    plan TEXT DEFAULT 'free',
    max_channels INTEGER DEFAULT 10,
    max_messages_per_day INTEGER DEFAULT 1000,
    settings TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Users table (tenant-scoped)
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    username TEXT NOT NULL,
    email TEXT,
    password_hash TEXT,
    role TEXT DEFAULT 'user',
    permissions TEXT DEFAULT '[]',
    metadata TEXT DEFAULT '{}',
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, username)
  );

  -- API Keys table
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    permissions TEXT DEFAULT '[]',
    last_used DATETIME,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  );

  -- Channels table (tenant-scoped)
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    server_url TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    secret TEXT NOT NULL,
    access_token TEXT NOT NULL,
    config TEXT DEFAULT '{}',
    metrics TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat DATETIME,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    UNIQUE(tenant_id, name)
  );

  -- Messages table (tenant-scoped, with channel scope)
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
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
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
  );

  -- Message Queue table (tenant-scoped)
  CREATE TABLE IF NOT EXISTS message_queue (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
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
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
  );

  -- WebSocket Connections table (tenant-scoped)
  CREATE TABLE IF NOT EXISTS ws_connections (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    remote_addr TEXT,
    user_agent TEXT,
    status TEXT DEFAULT 'connected',
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    disconnected_at DATETIME,
    metadata TEXT DEFAULT '{}',
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
  );

  -- Audit Log table (tenant-scoped)
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details TEXT DEFAULT '{}',
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  );

  -- Create indexes
  CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_channels_tenant ON channels(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_messages_tenant_channel ON messages(tenant_id, channel_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_queue_tenant_channel_status ON message_queue(tenant_id, channel_id, status);
  CREATE INDEX IF NOT EXISTS idx_ws_connections_tenant_channel ON ws_connections(tenant_id, channel_id, status);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
`);

export default db;
