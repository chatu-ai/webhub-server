/******************************************************************
 * T013 Plugin-Channel SSE: Offline Queue Store
 *
 * API-side inbound message queue: messages received from the frontend
 * while the plugin is offline.  Uses the `offline_queue` SQLite table
 * created by schema.ts (T002).
 *
 * Capacity: QUEUE_CAPACITY env (default 1000 per channel, oldest evicted).
 ******************************************************************/

import { v4 as uuidv4 } from 'uuid';
import db from './schema';
import { OfflineQueueItem } from './types';
import { getLogger } from '../utils/logger';

const QUEUE_CAPACITY = parseInt(process.env.QUEUE_CAPACITY ?? '1000', 10);

export class OfflineQueueStore {
  /**
   * Enqueue an inbound message for delivery to the plugin once it reconnects.
   * If the per-channel capacity is reached the oldest item is evicted first.
   */
  create(item: Omit<OfflineQueueItem, 'id' | 'attemptCount'>): OfflineQueueItem {
    const id = uuidv4();
    const now = Date.now();

    // Enforce capacity limit per channel
    const countRow = db
      .prepare(`SELECT COUNT(*) as cnt FROM offline_queue WHERE channel_id = ?`)
      .get(item.channelId) as { cnt: number } | undefined;

    if ((countRow?.cnt ?? 0) >= QUEUE_CAPACITY) {
      const oldest = db
        .prepare(
          `SELECT id FROM offline_queue WHERE channel_id = ? ORDER BY created_at ASC LIMIT 1`,
        )
        .get(item.channelId) as { id: string } | undefined;

      if (oldest) {
        db.prepare('DELETE FROM offline_queue WHERE id = ?').run(oldest.id);
        try {
          getLogger().warn({
            event: 'queue_capacity_exceeded',
            channelId: item.channelId,
            dropped_id: oldest.id,
          });
        } catch {
          /* logger not initialised in tests — safe to skip */
        }
      }
    }

    db.prepare(
      `INSERT INTO offline_queue (id, channel_id, message_id, payload, created_at, attempt_count)
       VALUES (?, ?, ?, ?, ?, 0)`,
    ).run(id, item.channelId, item.messageId, item.payload, item.createdAt ?? now);

    return this.getById(id)!;
  }

  getById(id: string): OfflineQueueItem | null {
    const row = db
      .prepare('SELECT * FROM offline_queue WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  /** Return all pending items for a channel in FIFO order (oldest first). */
  listPending(channelId: string, limit = 500): OfflineQueueItem[] {
    const rows = db
      .prepare(
        `SELECT * FROM offline_queue WHERE channel_id = ? ORDER BY created_at ASC LIMIT ?`,
      )
      .all(channelId, limit) as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  /** Remove a successfully delivered item. */
  delete(id: string): boolean {
    db.prepare('DELETE FROM offline_queue WHERE id = ?').run(id);
    return true;
  }

  /** Increment the delivery attempt counter and record the timestamp. */
  incrementAttempt(id: string): void {
    const now = Date.now();
    db.prepare(
      `UPDATE offline_queue SET attempt_count = attempt_count + 1, last_attempt_at = ? WHERE id = ?`,
    ).run(now, id);
  }

  /** Delete all items for a channel (e.g. on channel deletion). */
  deleteByChannel(channelId: string): void {
    db.prepare('DELETE FROM offline_queue WHERE channel_id = ?').run(channelId);
  }

  private mapRow(row: Record<string, unknown>): OfflineQueueItem {
    return {
      id: row.id as string,
      channelId: row.channel_id as string,
      messageId: row.message_id as string,
      payload: row.payload as string,
      createdAt: row.created_at as number,
      attemptCount: row.attempt_count as number,
      lastAttemptAt: row.last_attempt_at as number | undefined,
    };
  }
}

export const offlineQueueStore = new OfflineQueueStore();
