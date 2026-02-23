/**
 * T028: POST /api/webhub/channels — simplified key+URL channel registration tests
 * (Constitution §IV).
 *
 * Covers:
 *  - 201 success: valid key + valid URL → returns { channelId, key, accessToken }
 *  - 400 INVALID_KEY: malformed key
 *  - 400 INVALID_URL: non-http(s) URL / missing URL
 *  - 409 KEY_ALREADY_EXISTS: duplicate key
 */
import express from 'express';
import request from 'supertest';
import { WebHubServer } from './server';
import { InMemoryChannelStore } from '../store/channelStore';
import { WebSocketMessageRouter } from '../router/messageRouter';
import { initDatabase, getDb } from '../db/schema';

describe('POST /api/webhub/channels (T028)', () => {
  let app: express.Application;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    // Isolate each test: clear channels + offline_queue
    try { getDb().run('DELETE FROM offline_queue'); } catch (_) {}
    try { getDb().run('DELETE FROM messages'); } catch (_) {}
    try { getDb().run('DELETE FROM channels'); } catch (_) {}

    const channelStore = new InMemoryChannelStore();
    const messageRouter = new WebSocketMessageRouter();
    const server = new WebHubServer({ port: 3001, channelStore, messageRouter });
    app = server.getApp();
  });

  // ── 201 Success ─────────────────────────────────────────────────────────────

  describe('201 — successful registration', () => {
    it('returns channelId, key and accessToken on valid input', async () => {
      const res = await request(app)
        .post('/api/webhub/channels')
        .send({ key: 'my-channel', url: 'http://localhost:3000' });

      expect(res.status).toBe(201);
      expect(res.body.key).toBe('my-channel');
      expect(res.body.channelId).toBeDefined();
      expect(res.body.accessToken).toMatch(/^wh_/);
    });

    it('accepts keys with alphanumeric, hyphens, and underscores', async () => {
      const res = await request(app)
        .post('/api/webhub/channels')
        .send({ key: 'My_Channel-123', url: 'https://example.com' });

      expect(res.status).toBe(201);
      expect(res.body.key).toBe('My_Channel-123');
    });

    it('accepts an https URL', async () => {
      const res = await request(app)
        .post('/api/webhub/channels')
        .send({ key: 'secure-chan', url: 'https://secure.example.com/path' });

      expect(res.status).toBe(201);
    });
  });

  // ── 400 INVALID_KEY ────────────────────────────────────────────────────────

  describe('400 — INVALID_KEY', () => {
    const invalidKeys = [
      ['empty string', ''],
      ['contains space', 'bad key'],
      ['contains slash', 'bad/key'],
      ['too long (65 chars)', 'a'.repeat(65)],
    ];

    it.each(invalidKeys)('rejects key: %s', async (_label, key) => {
      const res = await request(app)
        .post('/api/webhub/channels')
        .send({ key, url: 'https://example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_KEY');
    });

    it('rejects missing key field', async () => {
      const res = await request(app)
        .post('/api/webhub/channels')
        .send({ url: 'https://example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_KEY');
    });
  });

  // ── 400 INVALID_URL ────────────────────────────────────────────────────────

  describe('400 — INVALID_URL', () => {
    it('rejects a non-URL string', async () => {
      const res = await request(app)
        .post('/api/webhub/channels')
        .send({ key: 'valid-key', url: 'not-a-url' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_URL');
    });

    it('rejects a non-http(s) URL (ftp://)', async () => {
      const res = await request(app)
        .post('/api/webhub/channels')
        .send({ key: 'valid-key', url: 'ftp://example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_URL');
    });

    it('rejects missing url field', async () => {
      const res = await request(app)
        .post('/api/webhub/channels')
        .send({ key: 'valid-key' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_URL');
    });
  });

  // ── 409 KEY_ALREADY_EXISTS ─────────────────────────────────────────────────

  describe('409 — KEY_ALREADY_EXISTS', () => {
    it('returns 409 when the same key is registered twice', async () => {
      // First registration — succeeds
      const first = await request(app)
        .post('/api/webhub/channels')
        .send({ key: 'duplicate-key', url: 'http://first.example.com' });
      expect(first.status).toBe(201);

      // Second registration with the same key — should conflict
      const second = await request(app)
        .post('/api/webhub/channels')
        .send({ key: 'duplicate-key', url: 'http://second.example.com' });
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('KEY_ALREADY_EXISTS');
    });
  });
});
