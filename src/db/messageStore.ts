import { v4 as uuidv4 } from 'uuid';
import db from './schema';
import { Message } from './types';

export class MessageStore {
  create(data: Omit<Message, 'id' | 'createdAt'>): Message {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO messages (id, channel_id, direction, message_type, content, metadata, sender_id, sender_name, target_id, reply_to, thread_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.threadId || null,
      data.status,
      now
    );

    return this.getById(id)!;
  }

  getById(id: string): Message | null {
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  listByChannel(channelId: string, limit = 100, offset = 0, threadId?: string): Message[] {
    let sql = 'SELECT * FROM messages WHERE channel_id = ? AND status != \'deleted\'';
    const params: (string | number | null)[] = [channelId];
    if (threadId) {
      sql += ' AND thread_id = ?';
      params.push(threadId);
    } else {
      sql += ' AND thread_id IS NULL';
    }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(row => this.mapRow(row));
  }

  findByThread(channelId: string, threadId: string): Message[] {
    const rows = db.prepare(
      `SELECT * FROM messages WHERE channel_id = ? AND thread_id = ? AND status != 'deleted' ORDER BY created_at ASC`
    ).all(channelId, threadId) as Record<string, unknown>[];
    return rows.map(row => this.mapRow(row));
  }

  softDelete(id: string, requesterId: string, accessToken: string | null, channelAccessToken: string | null): boolean {
    const msg = this.getById(id);
    if (!msg) return false;
    // Admin (valid channel accessToken) or sender can delete
    const isAdmin = channelAccessToken != null && accessToken === channelAccessToken;
    const isSender = msg.senderId != null && msg.senderId === requesterId;
    if (!isAdmin && !isSender) return false;
    db.prepare(`UPDATE messages SET status = 'deleted' WHERE id = ?`).run(id);
    return true;
  }

  updateContent(id: string, content: string, senderId: string): Message | null {
    const msg = this.getById(id);
    if (!msg) return null;
    if (msg.senderId !== senderId) return null; // 403
    db.prepare(`UPDATE messages SET content = ? WHERE id = ? AND sender_id = ?`).run(content, id, senderId);
    return this.getById(id);
  }

  search(channelId: string, term: string, limit = 20, after?: string): Message[] {
    const pattern = `%${term}%`;
    let sql = `SELECT * FROM messages WHERE channel_id = ? AND content LIKE ? COLLATE NOCASE AND status != 'deleted'`;
    const params: (string | number | null)[] = [channelId, pattern];
    if (after) {
      sql += ` AND created_at < ?`;
      params.push(after);
    }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
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

  listPendingUserMessages(channelId: string, after: string | null, limit: number): Message[] {
    let sql = `SELECT * FROM messages WHERE channel_id = ? AND direction = 'outbound' AND status IN ('sent', 'pending')`;
    const params: (string | number | null)[] = [channelId];
    if (after) {
      sql += ` AND created_at > ?`;
      params.push(after);
    }
    sql += ` ORDER BY created_at ASC LIMIT ?`;
    params.push(limit);
    const rows = (db.prepare(sql).all(...params)) as Record<string, unknown>[];
    return rows.map(row => this.mapRow(row));
  }

  markProcessed(id: string): void {
    db.prepare(`UPDATE messages SET status = 'delivered' WHERE id = ? AND status != 'delivered'`).run(id);
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
      messageType: row.message_type as Message['messageType'],
      content: row.content as string,
      metadata: JSON.parse((row.metadata as string) || '{}'),
      senderId: row.sender_id as string | undefined,
      senderName: row.sender_name as string | undefined,
      targetId: row.target_id as string | undefined,
      replyTo: row.reply_to as string | undefined,
      threadId: row.thread_id as string | undefined,
      status: row.status as Message['status'],
      createdAt: new Date(row.created_at as string),
    };
  }
}

export const messageStore = new MessageStore();
