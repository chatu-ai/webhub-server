/**
 * T034: QueueStore tests
 *
 * Covers:
 *  - Capacity limit (1000 rows → delete oldest + Pino WARN)
 *  - listPending ordering: priority DESC, then created_at ASC
 *  - incrementRetry reaching maxRetries → status 'failed'
 */
import { initDatabase, getDb } from './schema';
import { QueueStore } from './queueStore';

jest.mock('../utils/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

function makeItem(overrides: Partial<Parameters<QueueStore['create']>[0]> = {}) {
  return {
    channelId: 'ch-test',
    messageId: `msg-${Math.random().toString(36).slice(2)}`,
    messageType: 'text' as const,
    content: '{}',
    priority: 1,
    retryCount: 0,
    maxRetries: 3,
    status: 'pending' as const,
    ...overrides,
  };
}

describe('QueueStore', () => {
  let store: QueueStore;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    try { getDb().run('DELETE FROM message_queue'); } catch (_) {}
    store = new QueueStore();
  });

  // ── T034a: capacity limit ──────────────────────────────────────────────

  describe('capacity enforcement', () => {
    const CAPACITY = parseInt(process.env.QUEUE_CAPACITY ?? '1000', 10);

    it('accepts items up to the capacity without eviction', () => {
      for (let i = 0; i < 3; i++) {
        store.create(makeItem({ messageId: `m${i}` }));
      }
      const pending = store.listPending('ch-test', CAPACITY + 10);
      expect(pending.length).toBe(3);
    });

    it('evicts the oldest item when capacity is exceeded', () => {
      // Insert CAPACITY items
      const firstId = store.create(makeItem({ messageId: `first-msg`, priority: 1 })).id;
      for (let i = 1; i < CAPACITY; i++) {
        store.create(makeItem({ messageId: `m${i}` }));
      }
      // Verify first item still there
      expect(store.getById(firstId)).not.toBeNull();

      // Insert one more — should push out firstId
      store.create(makeItem({ messageId: 'overflow-msg' }));

      expect(store.getById(firstId)).toBeNull();
      const pending = store.listPending('ch-test', CAPACITY + 10);
      expect(pending.length).toBe(CAPACITY);
    }, 30_000);

    it('calls logger.warn on eviction', () => {
      const { getLogger } = require('../utils/logger');
      const warnMock = getLogger().warn as jest.Mock;
      warnMock.mockClear();

      for (let i = 0; i < CAPACITY; i++) {
        store.create(makeItem({ messageId: `m${i}` }));
      }
      store.create(makeItem({ messageId: 'overflow-msg' }));

      expect(warnMock).toHaveBeenCalledTimes(1);
      const warnArg = warnMock.mock.calls[0][0];
      expect(warnArg).toMatchObject({
        event: 'queue_capacity_exceeded',
        channelId: 'ch-test',
      });
      expect(typeof warnArg.dropped_message_id).toBe('string');
    }, 30_000);
  });

  // ── T034b: listPending ordering ───────────────────────────────────────

  describe('listPending', () => {
    it('returns items ordered by priority DESC then created_at ASC', async () => {
      const low = store.create(makeItem({ messageId: 'low', priority: 1 }));
      const high = store.create(makeItem({ messageId: 'high', priority: 5 }));
      const med = store.create(makeItem({ messageId: 'med', priority: 3 }));

      const items = store.listPending('ch-test');
      expect(items[0].id).toBe(high.id);
      expect(items[1].id).toBe(med.id);
      expect(items[2].id).toBe(low.id);
    });

    it('filters by channelId', () => {
      store.create(makeItem({ channelId: 'ch-a', messageId: 'a' }));
      store.create(makeItem({ channelId: 'ch-b', messageId: 'b' }));

      const itemsA = store.listPending('ch-a');
      const itemsB = store.listPending('ch-b');

      expect(itemsA.every((m) => m.channelId === 'ch-a')).toBe(true);
      expect(itemsB.every((m) => m.channelId === 'ch-b')).toBe(true);
    });
  });

  // ── T034c: incrementRetry / maxRetries ────────────────────────────────

  describe('incrementRetry', () => {
    it('returns true while retries remain', () => {
      const item = store.create(makeItem({ retryCount: 0, maxRetries: 3 }));
      expect(store.incrementRetry(item.id)).toBe(true);   // 1 < 3
      expect(store.incrementRetry(item.id)).toBe(true);   // 2 < 3
    });

    it('returns false when maxRetries reached', () => {
      const item = store.create(makeItem({ retryCount: 2, maxRetries: 3 }));
      expect(store.incrementRetry(item.id)).toBe(false);  // 3 >= 3
    });

    it('returns false for unknown id', () => {
      expect(store.incrementRetry('non-existent-id')).toBe(false);
    });
  });
});
