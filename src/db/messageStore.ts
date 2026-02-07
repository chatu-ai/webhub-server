import { v4 as uuidv4 } from 'uuid';
import db from './schema.js';
import { Message } from './types.js';

export class MessageStore {
  create(tenantId: string, data: Omit<Message, 'id' | 'tenantId' | 'createdAt'>): Message {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO messages (id, tenant_id, channel_id, direction, message_type, content, metadata, sender_id, sender_name, target_id, reply_to, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      tenantId,
      data.channelId,
      data.direction,
      data.messageType,
      data.content,
      JSON.stringify(data.metadata),
      data.senderId || null,
      data.senderName || null,
      data.targetId || null,
      data.replyTo || null,
      data.status,
      now
    );

    return this.getById(tenantId, id)!;
  }

  getById(tenantId: string, id: string): Message | null {
    const stmt = db.prepare('SELECT * FROM messages WHERE tenant_id = ? AND id = ?');
    const row = stmt.get(tenantId, id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(tenantId, row) : null;
  }

  listByChannel(
    tenantId: string,
    channelId: string,
    limit = 100,
    offset = 0
  ): Message[] {
    const stmt = db.prepare(`
      SELECT * FROM messages
      WHERE tenant_id = ? AND channel_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(tenantId, channelId, limit, offset) as Record<string, unknown>[];
    return rows.map(row => this.mapRow(tenantId, row));
  }

  listByDateRange(
    tenantId: string,
    channelId: string,
    startDate: Date,
    endDate: Date,
    limit = 1000
  ): Message[] {
    const stmt = db.prepare(`
      SELECT * FROM messages
      WHERE tenant_id = ? AND channel_id = ?
      AND created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(
      tenantId,
      channelId,
      startDate.toISOString(),
      endDate.toISOString(),
      limit
    ) as Record<string, unknown>[];
    return rows.map(row => this.mapRow(tenantId, row));
  }

  countByChannelToday(tenantId: string, channelId: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM messages
      WHERE tenant_id = ? AND channel_id = ? AND created_at >= ?
    `);
    const row = stmt.get(tenantId, channelId, today.toISOString()) as { count: number };
    return row.count;
  }

  delete(tenantId: string, id: string): boolean {
    const stmt = db.prepare('DELETE FROM messages WHERE tenant_id = ? AND id = ?');
    const result = stmt.run(tenantId, id);
    return result.changes > 0;
  }

  deleteByChannel(tenantId: string, channelId: string): number {
    const stmt = db.prepare('DELETE FROM messages WHERE tenant_id = ? AND channel_id = ?');
    const result = stmt.run(tenantId, channelId);
    return result.changes;
  }

  private mapRow(tenantId: string, row: Record<string, unknown>): Message {
    return {
      id: row.id as string,
      tenantId,
      channelId: row.channel_id as string,
      direction: row.direction as 'inbound' | 'outbound',
      messageType: row.message_type as 'text' | 'image' | 'audio' | 'video' | 'file' | 'system',
      content: row.content as string,
      metadata: JSON.parse((row.metadata as string) || '{}'),
      senderId: row.sender_id as string | undefined,
      senderName: row.sender_name as string | undefined,
      targetId: row.target_id as string | undefined,
      replyTo: row.reply_to as string | undefined,
      status: row.status as Message['status'],
      createdAt: new Date(row.created_at as string),
    };
  }
}

export const messageStore = new MessageStore();
