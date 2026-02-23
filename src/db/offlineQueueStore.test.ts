/**
 * T018: OfflineQueueStore tests (Constitution §IV — new module must have tests)
 *
 * Covers:
 *  - create() persists items
 *  - listPending() returns FIFO order (oldest first)
 *  - Capacity enforcement: oldest item evicted + logger.warn called
 *  - incrementAttempt() increments attempt_count
 *  - delete() removes an item
 *  - deleteByChannel() removes all items for a channel
 */
import { initDatabase, getDb } from './schema';
import { OfflineQueueStore } from './offlineQueueStore';

jest.mock('../utils/logger', () => ({
  getLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

let _seq = 0;
function makeItem(overrides: Partial<{
  channelId: string;
  messageId: string;
  payload: string;
  createdAt: number;
}> = {}) {
  _seq++;
  return {
    channelId: 'ch-test',
    messageId: `msg-${_seq}`,
    payload: JSON.stringify({ text: `hello ${_seq}` }),
    createdAt: Date.now() + _seq, // ensure strictly increasing
    ...overrides,
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('OfflineQueueStore', () => {
  let store: OfflineQueueStore;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    // Wipe the table before each test so tests are isolated
    try { getDb().run('DELETE FROM offline_queue'); } catch (_) {}
    store = new OfflineQueueStore();
  });

  // ── Basic CRUD ─────────────────────────────────────────────────────────────

  describe('create / getById', () => {
    it('persists an item and returns it with id and attemptCount = 0', () => {
      const item = store.create(makeItem());
      expect(item.id).toBeDefined();
      expect(item.channelId).toBe('ch-test');
      expect(item.attemptCount).toBe(0);
    });

    it('getById returns the stored item', () => {
      const created = store.create(makeItem());
      const found = store.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('getById returns null for unknown id', () => {
      expect(store.getById('does-not-exist')).toBeNull();
    });
  });

  // ── listPending ────────────────────────────────────────────────────────────

  describe('listPending', () => {
    it('returns items in FIFO order (oldest createdAt first)', () => {
      const base = Date.now();
      store.create(makeItem({ messageId: 'oldest', createdAt: base }));
      store.create(makeItem({ messageId: 'middle', createdAt: base + 100 }));
      store.create(makeItem({ messageId: 'newest', createdAt: base + 200 }));

      const pending = store.listPending('ch-test');
      expect(pending[0].messageId).toBe('oldest');
      expect(pending[1].messageId).toBe('middle');
      expect(pending[2].messageId).toBe('newest');
    });

    it('only returns items for the specified channel', () => {
      store.create(makeItem({ channelId: 'ch-a', messageId: 'a1' }));
      store.create(makeItem({ channelId: 'ch-b', messageId: 'b1' }));

      expect(store.listPending('ch-a').length).toBe(1);
      expect(store.listPending('ch-b').length).toBe(1);
      expect(store.listPending('ch-c').length).toBe(0);
    });
  });

  // ── Capacity enforcement ───────────────────────────────────────────────────

  describe('capacity enforcement', () => {
    // Use a small capacity override for the test (normally 1000)
    const CAPACITY = parseInt(process.env.QUEUE_CAPACITY ?? '1000', 10);

    it('accepts items up to capacity without eviction', () => {
      for (let i = 0; i < 3; i++) {
        store.create(makeItem());
      }
      expect(store.listPending('ch-test', CAPACITY + 10).length).toBe(3);
    });

    it('evicts the oldest item when capacity is exceeded', () => {
      const firstItem = store.create(makeItem({ messageId: 'first-msg', createdAt: 1 }));
      for (let i = 1; i < CAPACITY; i++) {
        store.create(makeItem({ createdAt: 100 + i }));
      }
      // firstItem should still be there (CAPACITY items total)
      expect(store.getById(firstItem.id)).not.toBeNull();

      // Insert one more — first item should be evicted
      store.create(makeItem({ messageId: 'overflow', createdAt: 100 + CAPACITY }));

      expect(store.getById(firstItem.id)).toBeNull();
      expect(store.listPending('ch-test', CAPACITY + 10).length).toBe(CAPACITY);
    }, 30_000);

    it('calls logger.warn with queue_capacity_exceeded on eviction', () => {
      const { getLogger } = require('../utils/logger');
      const warnMock = getLogger().warn as jest.Mock;
      warnMock.mockClear();

      // Fill to capacity, then push one more
      store.create(makeItem({ messageId: 'seed', createdAt: 1 }));
      for (let i = 1; i < CAPACITY; i++) {
        store.create(makeItem({ createdAt: 100 + i }));
      }
      store.create(makeItem({ messageId: 'trigger-eviction', createdAt: 100 + CAPACITY }));

      expect(warnMock).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'queue_capacity_exceeded' }),
      );
    }, 30_000);
  });

  // ── incrementAttempt ───────────────────────────────────────────────────────

  describe('incrementAttempt', () => {
    it('increments attempt_count by 1 each call', () => {
      const item = store.create(makeItem());
      expect(store.getById(item.id)!.attemptCount).toBe(0);

      store.incrementAttempt(item.id);
      expect(store.getById(item.id)!.attemptCount).toBe(1);

      store.incrementAttempt(item.id);
      expect(store.getById(item.id)!.attemptCount).toBe(2);
    });

    it('sets lastAttemptAt to a recent timestamp', () => {
      const item = store.create(makeItem());
      const before = Date.now();
      store.incrementAttempt(item.id);
      const after = Date.now();

      const updated = store.getById(item.id)!;
      expect(updated.lastAttemptAt).not.toBeNull();
      expect(updated.lastAttemptAt!).toBeGreaterThanOrEqual(before);
      expect(updated.lastAttemptAt!).toBeLessThanOrEqual(after);
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('removes the item from the store', () => {
      const item = store.create(makeItem());
      expect(store.getById(item.id)).not.toBeNull();
      store.delete(item.id);
      expect(store.getById(item.id)).toBeNull();
    });
  });

  // ── deleteByChannel ────────────────────────────────────────────────────────

  describe('deleteByChannel', () => {
    it('removes all items for the given channel', () => {
      store.create(makeItem({ channelId: 'ch-to-delete' }));
      store.create(makeItem({ channelId: 'ch-to-delete' }));
      store.create(makeItem({ channelId: 'ch-keep' }));

      store.deleteByChannel('ch-to-delete');

      expect(store.listPending('ch-to-delete').length).toBe(0);
      expect(store.listPending('ch-keep').length).toBe(1);
    });
  });
});
