import { v4 as uuidv4 } from 'uuid';
import db from './schema';
import { Reaction } from './types';

export class ReactionStore {
  add(channelId: string, messageId: string, emoji: string, userId: string): Reaction {
    const id = uuidv4();
    const now = Date.now();
    db.prepare(`
      INSERT OR IGNORE INTO reactions (id, message_id, channel_id, emoji, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, messageId, channelId, emoji, userId, now);
    return this.getOne(messageId, emoji, userId)!;
  }

  remove(messageId: string, emoji: string, userId: string): boolean {
    db.prepare(`
      DELETE FROM reactions WHERE message_id = ? AND emoji = ? AND user_id = ?
    `).run(messageId, emoji, userId);
    return true;
  }

  getByMessage(messageId: string): Reaction[] {
    const rows = db.prepare(`
      SELECT * FROM reactions WHERE message_id = ? ORDER BY created_at ASC
    `).all(messageId) as Record<string, unknown>[];
    return rows.map(r => this.mapRow(r));
  }

  private getOne(messageId: string, emoji: string, userId: string): Reaction | null {
    const row = db.prepare(`
      SELECT * FROM reactions WHERE message_id = ? AND emoji = ? AND user_id = ?
    `).get(messageId, emoji, userId) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: Record<string, unknown>): Reaction {
    return {
      id: row.id as string,
      messageId: row.message_id as string,
      channelId: row.channel_id as string,
      emoji: row.emoji as string,
      userId: row.user_id as string,
      createdAt: new Date(row.created_at as number),
    };
  }
}

export const reactionStore = new ReactionStore();
