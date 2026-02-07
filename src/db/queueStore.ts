import { v4 as uuidv4 } from 'uuid';
import db from './schema.js';
import { MessageQueueItem } from './types.js';

export class QueueStore {
  create(
    tenantId: string,
    data: Omit<MessageQueueItem, 'id' | 'tenantId' | 'createdAt'>
  ): MessageQueueItem {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO message_queue (
        id, tenant_id, channel_id, message_id, message_type, content,
        priority, retry_count, max_retries, status, scheduled_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      tenantId,
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

    return this.getById(tenantId, id)!;
  }

  getById(tenantId: string, id: string): MessageQueueItem | null {
    const stmt = db.prepare('SELECT * FROM message_queue WHERE tenant_id = ? AND id = ?');
    const row = stmt.get(tenantId, id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(tenantId, row) : null;
  }

  getByMessageId(tenantId: string, messageId: string): MessageQueueItem | null {
    const stmt = db.prepare('SELECT * FROM message_queue WHERE tenant_id = ? AND message_id = ?');
    const row = stmt.get(tenantId, messageId) as Record<string, unknown> | undefined;
    return row ? this.mapRow(tenantId, row) : null;
  }

  listPending(
    tenantId: string,
    channelId?: string,
    limit = 100
  ): MessageQueueItem[] {
    let query = `
      SELECT * FROM message_queue
      WHERE tenant_id = ? AND status = 'pending'
    `;
    const params: unknown[] = [tenantId];

    if (channelId) {
      query += ' AND channel_id = ?';
      params.push(channelId);
    }

    query += ' ORDER BY priority DESC, created_at ASC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map(row => this.mapRow(tenantId, row));
  }

  updateStatus(
    tenantId: string,
    id: string,
    status: MessageQueueItem['status'],
    error?: string
  ): void {
    const updates: string[] = ['status = ?'];
    const values: unknown[] = [status];

    if (status === 'processing') {
      updates.push('processed_at = ?');
      values.push(new Date().toISOString());
    }

    if (error) {
      updates.push('error = ?');
      values.push(error);
    }

    values.push(tenantId, id);

    const stmt = db.prepare(`
      UPDATE message_queue SET ${updates.join(', ')} WHERE tenant_id = ? AND id = ?
    `);
    stmt.run(...values);
  }

  incrementRetry(tenantId: string, id: string): boolean {
    const item = this.getById(tenantId, id);
    if (!item) return false;

    const newRetryCount = item.retryCount + 1;
    const stmt = db.prepare(`
      UPDATE message_queue SET retry_count = ? WHERE tenant_id = ? AND id = ?
    `);
    stmt.run(newRetryCount, tenantId, id);

    return newRetryCount < item.maxRetries;
  }

  delete(tenantId: string, id: string): boolean {
    const stmt = db.prepare('DELETE FROM message_queue WHERE tenant_id = ? AND id = ?');
    const result = stmt.run(tenantId, id);
    return result.changes > 0;
  }

  deleteByChannel(tenantId: string, channelId: string): number {
    const stmt = db.prepare('DELETE FROM message_queue WHERE tenant_id = ? AND channel_id = ?');
    const result = stmt.run(tenantId, channelId);
    return result.changes;
  }

  cleanupExpired(): number {
    const stmt = db.prepare(`
      DELETE FROM message_queue
      WHERE status = 'pending'
      AND created_at < datetime('now', '-1 day')
    `);
    const result = stmt.run();
    return result.changes;
  }

  countPending(tenantId: string, channelId?: string): number {
    let query = 'SELECT COUNT(*) as count FROM message_queue WHERE tenant_id = ? AND status = ?';
    const params: unknown[] = [tenantId, 'pending'];

    if (channelId) {
      query += ' AND channel_id = ?';
      params.push(channelId);
    }

    const stmt = db.prepare(query);
    const row = stmt.get(...params) as { count: number };
    return row.count;
  }

  private mapRow(tenantId: string, row: Record<string, unknown>): MessageQueueItem {
    return {
      id: row.id as string,
      tenantId,
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
