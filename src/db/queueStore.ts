import { v4 as uuidv4 } from 'uuid';
import db from './schema';
import { MessageQueueItem } from './types';
import { getLogger } from '../utils/logger';

/** T014: Maximum number of pending queue items per channel before eviction. */
const QUEUE_CAPACITY = parseInt(process.env.QUEUE_CAPACITY ?? '1000', 10);

export class QueueStore {
  create(data: Omit<MessageQueueItem, 'id' | 'createdAt'>): MessageQueueItem {
    const id = uuidv4();
    const now = new Date().toISOString();

    // T014 Plugin-Channel Realtime: Enforce capacity limit per channel.
    // Count pending rows and evict the oldest if at limit.
    const countRow = db.prepare(
      `SELECT COUNT(*) as cnt FROM message_queue WHERE status = 'pending' AND channel_id = ?`,
    ).get(data.channelId) as { cnt: number } | undefined;

    if ((countRow?.cnt ?? 0) >= QUEUE_CAPACITY) {
      const oldestRow = db.prepare(
        `SELECT id FROM message_queue WHERE status = 'pending' AND channel_id = ? ORDER BY created_at ASC LIMIT 1`,
      ).get(data.channelId) as { id: string } | undefined;

      if (oldestRow) {
        db.prepare('DELETE FROM message_queue WHERE id = ?').run(oldestRow.id);
        try {
          getLogger().warn({
            event: 'queue_capacity_exceeded',
            channelId: data.channelId,
            dropped_message_id: oldestRow.id,
          });
        } catch {
          // logger not yet initialized (e.g., in tests) — safe to skip
        }
      }
    }

    db.prepare(`
      INSERT INTO message_queue (id, channel_id, message_id, message_type, content, priority, retry_count, max_retries, status, scheduled_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.channelId,
      data.messageId,
      data.messageType,
      data.content,
      data.priority,
      data.retryCount,
      data.maxRetries,
      data.status,
      data.scheduledAt?.toISOString() || null,
      now
    );

    return this.getById(id)!;
  }

  getById(id: string): MessageQueueItem | null {
    const row = db.prepare('SELECT * FROM message_queue WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  getByMessageId(messageId: string): MessageQueueItem | null {
    const row = db.prepare('SELECT * FROM message_queue WHERE message_id = ?').get(messageId) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  listPending(channelId?: string, limit = 100): MessageQueueItem[] {
    let sql = 'SELECT * FROM message_queue WHERE status = ?';
    const params: (string | number)[] = ['pending'];

    if (channelId) {
      sql += ' AND channel_id = ?';
      params.push(channelId);
    }

    sql += ' ORDER BY priority DESC, created_at ASC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(row => this.mapRow(row));
  }

  updateStatus(id: string, status: MessageQueueItem['status'], error?: string): void {
    if (status === 'processing') {
      db.prepare('UPDATE message_queue SET status = ?, processed_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
    } else if (error) {
      db.prepare('UPDATE message_queue SET status = ?, error = ? WHERE id = ?').run(status, error, id);
    } else {
      db.prepare('UPDATE message_queue SET status = ? WHERE id = ?').run(status, id);
    }
  }

  incrementRetry(id: string): boolean {
    const item = this.getById(id);
    if (!item) return false;

    const newRetryCount = item.retryCount + 1;
    db.prepare('UPDATE message_queue SET retry_count = ? WHERE id = ?').run(newRetryCount, id);
    return newRetryCount < item.maxRetries;
  }

  delete(id: string): boolean {
    db.prepare('DELETE FROM message_queue WHERE id = ?').run(id);
    return true;
  }

  deleteByChannel(channelId: string): void {
    db.prepare('DELETE FROM message_queue WHERE channel_id = ?').run(channelId);
  }

  private mapRow(row: Record<string, unknown>): MessageQueueItem {
    return {
      id: row.id as string,
      channelId: row.channel_id as string,
      messageId: row.message_id as string,
      messageType: row.message_type as MessageQueueItem['messageType'],
      content: row.content as string,
      priority: row.priority as number,
      retryCount: row.retry_count as number,
      maxRetries: row.max_retries as number,
      status: row.status as MessageQueueItem['status'],
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at as string) : undefined,
      processedAt: row.processed_at ? new Date(row.processed_at as string) : undefined,
      error: row.error as string | undefined,
      createdAt: new Date(row.created_at as string),
    };
  }
}

export const queueStore = new QueueStore();
