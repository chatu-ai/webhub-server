/**
 * T041: POST /api/channel/stream/chunk  &  POST /api/channel/stream/done
 *
 * Covers (Constitution §IV):
 *  Chunk endpoint
 *  - 401 MISSING_TOKEN  (no Authorization header)
 *  - 401 INVALID_TOKEN  (bearer token not found)
 *  - 400 MISSING_FIELDS (missing messageId / seq / delta)
 *  - 200 stores delta in buffer and calls sseManager.broadcast('chunk', …)
 *
 *  Done endpoint
 *  - 401 MISSING_TOKEN
 *  - 401 INVALID_TOKEN
 *  - 400 MISSING_FIELDS (missing messageId / totalSeq)
 *  - 200 assembles all chunks, persists to DB and calls sseManager.broadcast('done', …)
 *  - 200 idempotent  (second done for same messageId succeeds, returns empty content)
 */

// ── Mock sseManager before any imports that pull it in ──────────────────────
jest.mock('./sseManager', () => ({
  sseManager: {
    broadcast: jest.fn(),
    addConnection: jest.fn(),
    removeConnection: jest.fn(),
    destroy: jest.fn(),
  },
}));

import express from 'express';
import request from 'supertest';
import { WebHubServer } from './server';
import { initDatabase, getDb } from '../db/schema';
import { sseManager } from './sseManager';

const mockBroadcast = sseManager.broadcast as jest.Mock;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a fresh server and returns { app, channelId, token }. */
async function makeApp(): Promise<{ app: express.Application; channelId: string; token: string }> {
  // Do NOT pass channelStore — WebHubServer defaults to the DB adapter, which is
  // the same store used by registerChannelByKey → tokens are visible to handleStreamChunk/Done.
  const server = new WebHubServer({ port: 3002 });
  const app = server.getApp();

  // Register a channel to obtain a real accessToken
  const res = await request(app)
    .post('/api/webhub/channels')
    .send({ key: `test-key-${Date.now()}`, url: 'http://localhost:3000' });

  return { app, channelId: res.body.channelId, token: res.body.accessToken };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('POST /api/channel/stream/chunk  &  /api/channel/stream/done (T041)', () => {
  let app: express.Application;
  let channelId: string;
  let token: string;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(async () => {
    // Reset DB tables so tests are isolated
    try { getDb().run('DELETE FROM offline_queue'); } catch (_) {}
    try { getDb().run('DELETE FROM messages'); } catch (_) {}
    try { getDb().run('DELETE FROM channels'); } catch (_) {}

    mockBroadcast.mockClear();

    const ctx = await makeApp();
    app = ctx.app;
    channelId = ctx.channelId;
    token = ctx.token;
  });

  // ── POST /api/channel/stream/chunk ────────────────────────────────────────

  describe('POST /api/channel/stream/chunk', () => {
    it('returns 401 MISSING_TOKEN when no Authorization header', async () => {
      const res = await request(app)
        .post('/api/channel/stream/chunk')
        .send({ messageId: 'msg-1', seq: 0, delta: 'Hello' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('MISSING_TOKEN');
    });

    it('returns 401 INVALID_TOKEN when bearer token is unknown', async () => {
      const res = await request(app)
        .post('/api/channel/stream/chunk')
        .set('Authorization', 'Bearer wh_totally_invalid_token')
        .send({ messageId: 'msg-1', seq: 0, delta: 'Hello' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('INVALID_TOKEN');
    });

    it('returns 400 MISSING_FIELDS when body fields are absent', async () => {
      const res = await request(app)
        .post('/api/channel/stream/chunk')
        .set('Authorization', `Bearer ${token}`)
        .send({ messageId: 'msg-1' }); // missing seq and delta

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MISSING_FIELDS');
    });

    it('returns 200 and calls sseManager.broadcast("chunk") with correct payload', async () => {
      const res = await request(app)
        .post('/api/channel/stream/chunk')
        .set('Authorization', `Bearer ${token}`)
        .send({ messageId: 'msg-stream-1', seq: 0, delta: 'Hello ' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      expect(mockBroadcast).toHaveBeenCalledWith(
        channelId,
        'chunk',
        { messageId: 'msg-stream-1', seq: 0, delta: 'Hello ' },
        'msg-stream-1',
      );
    });

    it('stores multiple sequential chunks independently', async () => {
      await request(app)
        .post('/api/channel/stream/chunk')
        .set('Authorization', `Bearer ${token}`)
        .send({ messageId: 'msg-multi', seq: 0, delta: 'A' });

      await request(app)
        .post('/api/channel/stream/chunk')
        .set('Authorization', `Bearer ${token}`)
        .send({ messageId: 'msg-multi', seq: 1, delta: 'B' });

      expect(mockBroadcast).toHaveBeenCalledTimes(2);
      expect(mockBroadcast).toHaveBeenNthCalledWith(
        1, channelId, 'chunk', { messageId: 'msg-multi', seq: 0, delta: 'A' }, 'msg-multi',
      );
      expect(mockBroadcast).toHaveBeenNthCalledWith(
        2, channelId, 'chunk', { messageId: 'msg-multi', seq: 1, delta: 'B' }, 'msg-multi',
      );
    });
  });

  // ── POST /api/channel/stream/done ─────────────────────────────────────────

  describe('POST /api/channel/stream/done', () => {
    it('returns 401 MISSING_TOKEN when no Authorization header', async () => {
      const res = await request(app)
        .post('/api/channel/stream/done')
        .send({ messageId: 'msg-1', totalSeq: 1 });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('MISSING_TOKEN');
    });

    it('returns 401 INVALID_TOKEN when bearer token is unknown', async () => {
      const res = await request(app)
        .post('/api/channel/stream/done')
        .set('Authorization', 'Bearer wh_bad_token')
        .send({ messageId: 'msg-1', totalSeq: 1 });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('INVALID_TOKEN');
    });

    it('returns 400 MISSING_FIELDS when body fields are absent', async () => {
      const res = await request(app)
        .post('/api/channel/stream/done')
        .set('Authorization', `Bearer ${token}`)
        .send({ messageId: 'msg-1' }); // missing totalSeq

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MISSING_FIELDS');
    });

    it('assembles chunks, calls sseManager.broadcast("done") with full content', async () => {
      const msgId = 'msg-assemble';

      // Send 3 chunks out of order
      await request(app)
        .post('/api/channel/stream/chunk')
        .set('Authorization', `Bearer ${token}`)
        .send({ messageId: msgId, seq: 2, delta: 'World' });
      await request(app)
        .post('/api/channel/stream/chunk')
        .set('Authorization', `Bearer ${token}`)
        .send({ messageId: msgId, seq: 0, delta: 'Hello' });
      await request(app)
        .post('/api/channel/stream/chunk')
        .set('Authorization', `Bearer ${token}`)
        .send({ messageId: msgId, seq: 1, delta: ' ' });

      mockBroadcast.mockClear(); // only care about the done broadcast

      const doneRes = await request(app)
        .post('/api/channel/stream/done')
        .set('Authorization', `Bearer ${token}`)
        .send({ messageId: msgId, totalSeq: 3 });

      expect(doneRes.status).toBe(200);
      expect(doneRes.body.ok).toBe(true);

      expect(mockBroadcast).toHaveBeenCalledWith(
        channelId,
        'done',
        { messageId: msgId, totalSeq: 3, content: 'Hello World' },
      );
    });

    it('is idempotent: second done for same messageId succeeds (empty content, no buffer)', async () => {
      const msgId = 'msg-idempotent';

      // First done (no prior chunks — empty content)
      await request(app)
        .post('/api/channel/stream/done')
        .set('Authorization', `Bearer ${token}`)
        .send({ messageId: msgId, totalSeq: 0 });

      mockBroadcast.mockClear();

      // Second done succeeds gracefully
      const second = await request(app)
        .post('/api/channel/stream/done')
        .set('Authorization', `Bearer ${token}`)
        .send({ messageId: msgId, totalSeq: 0 });

      expect(second.status).toBe(200);
      expect(second.body.ok).toBe(true);
      // broadcast called again with empty content
      expect(mockBroadcast).toHaveBeenCalledWith(
        channelId,
        'done',
        { messageId: msgId, totalSeq: 0, content: '' },
      );
    });
  });
});
