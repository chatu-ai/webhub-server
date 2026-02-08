import { v4 as uuidv4 } from 'uuid';
import db from './schema.js';
import { Channel, ChannelStatus, ChannelMetrics } from './types.js';

export class ChannelStore {
  create(data: Omit<Channel, 'id' | 'createdAt' | 'updatedAt'>): Channel {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO channels (id, name, webhub_url, description, status, secret, access_token, config, metrics, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.webhubUrl,
      data.description || null,
      data.status,
      data.secret,
      data.accessToken,
      JSON.stringify(data.config),
      JSON.stringify(data.metrics),
      now,
      now
    );

    return this.getById(id)!;
  }

  getById(id: string): Channel | null {
    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  getByName(name: string): Channel | null {
    const row = db.prepare('SELECT * FROM channels WHERE name = ?').get(name) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  getBySecret(secret: string): Channel | null {
    const row = db.prepare('SELECT * FROM channels WHERE secret = ?').get(secret) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  getByAccessToken(token: string): Channel | null {
    const row = db.prepare('SELECT * FROM channels WHERE access_token = ?').get(token) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  updateStatus(id: string, status: ChannelStatus): Channel | null {
    db.prepare('UPDATE channels SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
    return this.getById(id);
  }

  updateLastHeartbeat(id: string): void {
    db.prepare('UPDATE channels SET last_heartbeat = ?, updated_at = ? WHERE id = ?').run(new Date().toISOString(), new Date().toISOString(), id);
  }

  incrementMetrics(id: string): void {
    const channel = this.getById(id);
    if (!channel) return;

    const metrics: ChannelMetrics = {
      ...channel.metrics,
      totalMessages: channel.metrics.totalMessages + 1,
      messagesToday: channel.metrics.messagesToday + 1,
      lastMessageAt: new Date(),
    };

    db.prepare('UPDATE channels SET metrics = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(metrics), new Date().toISOString(), id);
  }

  delete(id: string): boolean {
    db.prepare('DELETE FROM channels WHERE id = ?').run(id);
    return true;
  }

  list(limit = 100, offset = 0): Channel[] {
    const rows = db.prepare('SELECT * FROM channels ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as Record<string, unknown>[];
    return rows.map(row => this.mapRow(row));
  }

  count(): number {
    const row = db.prepare('SELECT COUNT(*) as count FROM channels').get() as { count: number };
    return row?.count || 0;
  }

  private mapRow(row: Record<string, unknown>): Channel {
    return {
      id: row.id as string,
      name: row.name as string,
      webhubUrl: row.webhub_url as string,
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
