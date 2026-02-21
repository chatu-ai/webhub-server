import db from './schema';
import { ReadReceipt } from './types';

export class ReadReceiptStore {
  markRead(messageId: string, channelId: string, userId: string): ReadReceipt {
    const now = Date.now();
    db.prepare(`
      INSERT OR REPLACE INTO read_receipts (message_id, channel_id, user_id, ts)
      VALUES (?, ?, ?, ?)
    `).run(messageId, channelId, userId, now);
    return { messageId, channelId, userId, ts: now };
  }

  getByMessage(messageId: string): ReadReceipt[] {
    const rows = db.prepare(`
      SELECT * FROM read_receipts WHERE message_id = ? ORDER BY ts ASC
    `).all(messageId) as Record<string, unknown>[];
    return rows.map(r => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): ReadReceipt {
    return {
      messageId: row.message_id as string,
      channelId: row.channel_id as string,
      userId: row.user_id as string,
      ts: row.ts as number,
    };
  }
}

export const readReceiptStore = new ReadReceiptStore();
