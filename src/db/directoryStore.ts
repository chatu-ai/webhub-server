import db from './schema';
import { DirectoryEntry } from './types';

export class DirectoryStore {
  upsert(channelId: string, userId: string, displayName?: string, avatar?: string): DirectoryEntry {
    const now = Date.now();
    db.prepare(`
      INSERT OR REPLACE INTO directory (channel_id, user_id, display_name, avatar, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(channelId, userId, displayName ?? null, avatar ?? null, now);
    return { channelId, userId, displayName, avatar, updatedAt: new Date(now) };
  }

  list(channelId: string, limit = 50, after?: string): DirectoryEntry[] {
    let sql = `SELECT * FROM directory WHERE channel_id = ?`;
    const params: (string | number | null)[] = [channelId];
    if (after) {
      sql += ` AND user_id > ?`;
      params.push(after);
    }
    sql += ` ORDER BY user_id ASC LIMIT ?`;
    params.push(limit);
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(r => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown>): DirectoryEntry {
    return {
      channelId: row.channel_id as string,
      userId: row.user_id as string,
      displayName: row.display_name as string | undefined,
      avatar: row.avatar as string | undefined,
      updatedAt: new Date(row.updated_at as number),
    };
  }
}

export const directoryStore = new DirectoryStore();
