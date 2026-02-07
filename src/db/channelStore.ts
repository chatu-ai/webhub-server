import { v4 as uuidv4 } from 'uuid';
import db from './schema.js';
import { Channel, ChannelStatus, ChannelMetrics } from './types.js';

export class ChannelStore {
  create(tenantId: string, data: Omit<Channel, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>): Channel {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO channels (id, tenant_id, name, server_url, description, status, secret, access_token, config, metrics, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      tenantId,
      data.name,
      data.serverUrl,
      data.description || null,
      data.status,
      data.secret,
      data.accessToken,
      JSON.stringify(data.config),
      JSON.stringify(data.metrics),
      now,
      now
    );

    return this.getById(tenantId, id)!;
  }

  getById(tenantId: string, id: string): Channel | null {
    const stmt = db.prepare('SELECT * FROM channels WHERE tenant_id = ? AND id = ?');
    const row = stmt.get(tenantId, id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(tenantId, row) : null;
  }

  getByName(tenantId: string, name: string): Channel | null {
    const stmt = db.prepare('SELECT * FROM channels WHERE tenant_id = ? AND name = ?');
    const row = stmt.get(tenantId, name) as Record<string, unknown> | undefined;
    return row ? this.mapRow(tenantId, row) : null;
  }

  getBySecret(tenantId: string, secret: string): Channel | null {
    const stmt = db.prepare('SELECT * FROM channels WHERE tenant_id = ? AND secret = ?');
    const row = stmt.get(tenantId, secret) as Record<string, unknown> | undefined;
    return row ? this.mapRow(tenantId, row) : null;
  }

  getByAccessToken(tenantId: string, token: string): Channel | null {
    const stmt = db.prepare('SELECT * FROM channels WHERE tenant_id = ? AND access_token = ?');
    const row = stmt.get(tenantId, token) as Record<string, unknown> | undefined;
    return row ? this.mapRow(tenantId, row) : null;
  }

  updateStatus(tenantId: string, id: string, status: ChannelStatus): Channel | null {
    const stmt = db.prepare(`
      UPDATE channels SET status = ?, updated_at = ? WHERE tenant_id = ? AND id = ?
    `);
    stmt.run(status, new Date().toISOString(), tenantId, id);
    return this.getById(tenantId, id);
  }

  updateLastHeartbeat(tenantId: string, id: string): void {
    const stmt = db.prepare(`
      UPDATE channels SET last_heartbeat = ?, updated_at = ? WHERE tenant_id = ? AND id = ?
    `);
    stmt.run(new Date().toISOString(), new Date().toISOString(), tenantId, id);
  }

  incrementMetrics(tenantId: string, id: string): void {
    const channel = this.getById(tenantId, id);
    if (!channel) return;

    const metrics: ChannelMetrics = {
      ...channel.metrics,
      totalMessages: channel.metrics.totalMessages + 1,
      messagesToday: channel.metrics.messagesToday + 1,
      lastMessageAt: new Date(),
    };

    const stmt = db.prepare(`
      UPDATE channels SET metrics = ?, updated_at = ? WHERE tenant_id = ? AND id = ?
    `);
    stmt.run(JSON.stringify(metrics), new Date().toISOString(), tenantId, id);
  }

  delete(tenantId: string, id: string): boolean {
    const stmt = db.prepare('DELETE FROM channels WHERE tenant_id = ? AND id = ?');
    const result = stmt.run(tenantId, id);
    return result.changes > 0;
  }

  list(tenantId: string, limit = 100, offset = 0): Channel[] {
    const stmt = db.prepare('SELECT * FROM channels WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?');
    const rows = stmt.all(tenantId, limit, offset) as Record<string, unknown>[];
    return rows.map(row => this.mapRow(tenantId, row));
  }

  count(tenantId: string): number {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM channels WHERE tenant_id = ?');
    const row = stmt.get(tenantId) as { count: number };
    return row.count;
  }

  private mapRow(tenantId: string, row: Record<string, unknown>): Channel {
    return {
      id: row.id as string,
      tenantId,
      name: row.name as string,
      serverUrl: row.server_url as string,
      description: row.description as string | undefined,
      status: row.status as ChannelStatus,
      secret: row.secret as string,
      accessToken: row.access_token as string,
      config: JSON.parse((row.config as string) || '{}'),
      metrics: JSON.parse((row.metrics as string) || '{}') as ChannelMetrics,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      lastHeartbeat: row.last_heartbeat ? new Date(row.last_heartbeat as string) : undefined,
    };
  }
}

export const channelStore = new ChannelStore();
