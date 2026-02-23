/**
 * T005 display-sender-session: sessionCommandStore tests
 *
 * Covers:
 *  - enqueue → status 'pending'
 *  - hasPending → true after enqueue, false before
 *  - getPending → returns only pending, ordered oldest-first
 *  - ack success → status 'done', ackedAt set
 *  - ack failure → status 'failed', error populated
 *  - listByChannel → returns all commands for channel
 */
import { initDatabase, getDb } from './schema';
import { sessionCommandStore } from './sessionCommandStore';

describe('sessionCommandStore', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    try {
      getDb().run('DELETE FROM session_commands');
    } catch (_) {}
  });

  // ── enqueue ─────────────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('creates a command with status pending', () => {
      const cmd = sessionCommandStore.enqueue('ch1', 'user1', 'reset');
      expect(cmd.id).toBeTruthy();
      expect(cmd.channelId).toBe('ch1');
      expect(cmd.senderId).toBe('user1');
      expect(cmd.commandType).toBe('reset');
      expect(cmd.status).toBe('pending');
      expect(cmd.payload).toBeNull();
      expect(typeof cmd.createdAt).toBe('number');
      expect(cmd.ackedAt).toBeNull();
    });

    it('stores optional payload', () => {
      const cmd = sessionCommandStore.enqueue('ch1', 'user1', 'switch', {
        targetSessionKey: 'sess-abc',
      });
      expect(cmd.payload).toEqual({ targetSessionKey: 'sess-abc' });
    });
  });

  // ── hasPending ───────────────────────────────────────────────────────────

  describe('hasPending', () => {
    it('returns false when no pending commands exist', () => {
      expect(sessionCommandStore.hasPending('ch99', 'user99')).toBe(false);
    });

    it('returns true after enqueue', () => {
      sessionCommandStore.enqueue('ch1', 'user1', 'reset');
      expect(sessionCommandStore.hasPending('ch1', 'user1')).toBe(true);
    });

    it('returns false for a different sender in the same channel', () => {
      sessionCommandStore.enqueue('ch1', 'user1', 'reset');
      expect(sessionCommandStore.hasPending('ch1', 'user2')).toBe(false);
    });

    it('returns false once the command is acked', () => {
      const cmd = sessionCommandStore.enqueue('ch1', 'user1', 'reset');
      sessionCommandStore.ack(cmd.id, true);
      expect(sessionCommandStore.hasPending('ch1', 'user1')).toBe(false);
    });
  });

  // ── getPending ───────────────────────────────────────────────────────────

  describe('getPending', () => {
    it('returns only pending commands', () => {
      const c1 = sessionCommandStore.enqueue('ch1', 'u1', 'reset');
      const c2 = sessionCommandStore.enqueue('ch1', 'u2', 'reset');
      sessionCommandStore.ack(c1.id, true); // done

      const pending = sessionCommandStore.getPending('ch1');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(c2.id);
    });

    it('orders by created_at ascending (oldest first)', async () => {
      // Stagger timestamps by a millisecond
      const c1 = sessionCommandStore.enqueue('ch2', 'u1', 'reset');
      await new Promise((r) => setTimeout(r, 2));
      const c2 = sessionCommandStore.enqueue('ch2', 'u2', 'reset');

      const pending = sessionCommandStore.getPending('ch2');
      expect(pending[0].id).toBe(c1.id);
      expect(pending[1].id).toBe(c2.id);
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        sessionCommandStore.enqueue('ch3', `u${i}`, 'reset');
      }
      const pending = sessionCommandStore.getPending('ch3', 3);
      expect(pending).toHaveLength(3);
    });

    it('returns empty array for unknown channel', () => {
      expect(sessionCommandStore.getPending('ch-none')).toHaveLength(0);
    });
  });

  // ── ack ──────────────────────────────────────────────────────────────────

  describe('ack', () => {
    it('marks a command as done on success', () => {
      const cmd = sessionCommandStore.enqueue('ch1', 'u1', 'reset');
      sessionCommandStore.ack(cmd.id, true);

      const updated = sessionCommandStore.getById(cmd.id)!;
      expect(updated.status).toBe('done');
      expect(updated.error).toBeNull();
      expect(typeof updated.ackedAt).toBe('number');
      expect(updated.ackedAt).toBeGreaterThan(0);
    });

    it('marks a command as failed on error', () => {
      const cmd = sessionCommandStore.enqueue('ch1', 'u1', 'reset');
      sessionCommandStore.ack(cmd.id, false, 'file not found');

      const updated = sessionCommandStore.getById(cmd.id)!;
      expect(updated.status).toBe('failed');
      expect(updated.error).toBe('file not found');
    });
  });

  // ── listByChannel ────────────────────────────────────────────────────────

  describe('listByChannel', () => {
    it('returns all commands for a channel regardless of status', () => {
      const c1 = sessionCommandStore.enqueue('chX', 'u1', 'reset');
      const c2 = sessionCommandStore.enqueue('chX', 'u2', 'switch', { targetSessionKey: 's1' });
      sessionCommandStore.ack(c1.id, true);

      const list = sessionCommandStore.listByChannel('chX');
      expect(list).toHaveLength(2);
      const ids = list.map((c) => c.id);
      expect(ids).toContain(c1.id);
      expect(ids).toContain(c2.id);
    });

    it('does not return commands from other channels', () => {
      sessionCommandStore.enqueue('chA', 'u1', 'reset');
      sessionCommandStore.enqueue('chB', 'u1', 'reset');

      expect(sessionCommandStore.listByChannel('chA')).toHaveLength(1);
      expect(sessionCommandStore.listByChannel('chB')).toHaveLength(1);
    });
  });
});
