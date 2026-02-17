import { v4 as uuidv4 } from 'uuid';
import db from './schema';
import { Message } from './types';

export class MessageStore {
  create(data: Omit<Message, 'id' | 'createdAt'>): Message {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO messages (id, channel_id, direction, message_type, content, metadata, sender_id, sender_name, target_id, reply_to, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
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

    return this.getById(id)!;
  }

  getById(id: string): Message | null {
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  listByChannel(channelId: string, limit = 100, offset = 0): Message[] {
    const rows = db.prepare('SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(channelId, limit, offset) as Record<string, unknown>[];
    return rows.map(row => this.mapRow(row));
  }

  listByDateRange(channelId: string, startDate: Date, endDate: Date, limit = 1000): Message[] {
    const rows = db.prepare('SELECT * FROM messages WHERE channel_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC LIMIT ?').all(channelId, startDate.toISOString(), endDate.toISOString(), limit) as Record<string, unknown>[];
    return rows.map(row => this.mapRow(row));
  }

  countByChannelToday(channelId: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const row = db.prepare('SELECT COUNT(*) as count FROM messages WHERE channel_id = ? AND created_at >= ?').get(channelId, today.toISOString()) as { count: number };
    return row?.count || 0;
  }

  delete(id: string): boolean {
    db.prepare('DELETE FROM messages WHERE id = ?').run(id);
    return true;
  }

  deleteByChannel(channelId: string): void {
    db.prepare('DELETE FROM messages WHERE channel_id = ?').run(channelId);
  }

  private mapRow(row: Record<string, unknown>): Message {
    return {
      id: row.id as string,
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
