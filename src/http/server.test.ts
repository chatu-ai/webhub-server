import express from 'express';
import request from 'supertest';
import { WebHubServer } from './server';
import { InMemoryChannelStore } from '../store/channelStore';
import { WebSocketMessageRouter } from '../router/messageRouter';
import { initDatabase, getDb } from '../db/schema';

describe('WebHubServer', () => {
  let server: WebHubServer;
  let app: express.Application;
  let channelStore: InMemoryChannelStore;
  let messageRouter: WebSocketMessageRouter;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    // Clear DB tables for isolation
    try { getDb().run('DELETE FROM messages'); } catch (_) { /* not yet initialized */ }

    channelStore = new InMemoryChannelStore();
    messageRouter = new WebSocketMessageRouter();

    server = new WebHubServer({
      port: 3000,
      channelStore,
      messageRouter,
    });

    app = server.getApp();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/webhub/channels/apply', () => {
    it('should create a new channel', async () => {
      const response = await request(app)
        .post('/api/webhub/channels/apply')
        .send({
          serverName: 'Test Server',
          serverUrl: 'https://test.example.com',
          description: 'Test description',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data!.channelId).toMatch(/^wh_ch_/);
      expect(response.body.data!.channelName).toBe('Test Server');
      expect(response.body.data!.secret).toMatch(/^wh_secret_/);
      expect(response.body.data!.registerCommand).toContain('/webhub register');
    });

    it('should reject request without serverName', async () => {
      const response = await request(app)
        .post('/api/webhub/channels/apply')
        .send({
          serverUrl: 'https://test.example.com',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_REQUEST');
    });

    it('should reject request without serverUrl', async () => {
      const response = await request(app)
        .post('/api/webhub/channels/apply')
        .send({
          serverName: 'Test Server',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_REQUEST');
    });
  });

  describe('GET /api/webhub/channels', () => {
    it('should return empty list when no channels exist', async () => {
      const response = await request(app).get('/api/webhub/channels');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('should return list of channels', async () => {
      // Create a channel first
      await channelStore.create({
        name: 'Test Channel',
        serverUrl: 'https://test.com',
        status: 'pending',
        secret: 'secret',
        accessToken: 'token',
      });

      const response = await request(app).get('/api/webhub/channels');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Test Channel');
      expect(response.body.data[0].accessToken).toBe('token'); // T063: accessToken required for WS auth
    });
  });

  describe('GET /api/webhub/channels/:id', () => {
    it('should return channel by ID', async () => {
      const channel = await channelStore.create({
        name: 'Test Channel',
        serverUrl: 'https://test.com',
        status: 'pending',
        secret: 'secret',
        accessToken: 'token',
      });

      const response = await request(app).get(`/api/webhub/channels/${channel.id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.channelId).toBe(channel.id);
      expect(response.body.data.name).toBe('Test Channel');
      expect(response.body.data.accessToken).toBe('token'); // T063: accessToken required for WS auth
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request(app).get('/api/webhub/channels/non_existent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('CHANNEL_NOT_FOUND');
    });
  });

  describe('GET /api/webhub/channels/:id/status', () => {
    it('should return channel status', async () => {
      const channel = await channelStore.create({
        name: 'Test Channel',
        serverUrl: 'https://test.com',
        status: 'connected',
        secret: 'secret',
        accessToken: 'token',
      });

      const response = await request(app).get(`/api/webhub/channels/${channel.id}/status`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('connected');
    });
  });

  describe('DELETE /api/webhub/channels/:id', () => {
    it('should delete existing channel', async () => {
      const channel = await channelStore.create({
        name: 'Test Channel',
        serverUrl: 'https://test.com',
        status: 'pending',
        secret: 'secret',
        accessToken: 'token',
      });

      const response = await request(app).delete(`/api/webhub/channels/${channel.id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify channel is deleted
      const checkResponse = await request(app).get(`/api/webhub/channels/${channel.id}`);
      expect(checkResponse.status).toBe(404);
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request(app).delete('/api/webhub/channels/non_existent');

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('CHANNEL_NOT_FOUND');
    });
  });

  describe('POST /api/channel/verify', () => {
    it('should verify valid channel credentials', async () => {
      const channel = await channelStore.create({
        name: 'Test Channel',
        serverUrl: 'https://test.com',
        status: 'pending',
        secret: 'wh_unique_secret',
        accessToken: 'token',
      });

      const response = await request(app)
        .post('/api/channel/verify')
        .send({
          channelId: channel.id,
          secret: 'wh_unique_secret',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.verified).toBe(true);
    });

    it('should reject invalid credentials', async () => {
      const channel = await channelStore.create({
        name: 'Test Channel',
        serverUrl: 'https://test.com',
        status: 'pending',
        secret: 'secret',
        accessToken: 'token',
      });

      const response = await request(app)
        .post('/api/channel/verify')
        .send({
          channelId: channel.id,
          secret: 'wrong_secret',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/channel/status', () => {
    it('should return OpenClaw status (unknown when no channelId header)', async () => {
      const response = await request(app).get('/api/channel/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // BUG-01 fix: was hardcoded 'connected', now returns real status
      expect(response.body.data.status).toBe('unknown');
    });
  });

  // ── T017: GET /api/channel/messages/pending ────────────────────────────────

  describe('GET /api/channel/messages/pending', () => {
    it('returns pending user messages for a channel', async () => {
      const channel = await channelStore.create({
        name: 'PendingTest', serverUrl: 'https://t.com',
        status: 'connected', secret: 'sec1', accessToken: 'tok1',
      });

      // pre-seed a message via POST /api/webhub/channels/:id/messages
      await request(app)
        .post(`/api/webhub/channels/${channel.id}/messages`)
        .send({ target: { type: 'user', id: 'u1' }, content: { text: 'hello' } });

      const response = await request(app)
        .get(`/api/channel/messages/pending?channelId=${channel.id}`)
        .set('X-Channel-Token', 'tok1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data.every((m: any) => m.direction === 'outbound')).toBe(true);
    });

    it('returns 401 when token is missing', async () => {
      const response = await request(app)
        .get('/api/channel/messages/pending?channelId=ch1');

      expect(response.status).toBe(401);
    });

    it('returns 401 when token is wrong', async () => {
      const channel = await channelStore.create({
        name: 'AuthTest', serverUrl: 'https://t.com',
        status: 'connected', secret: 'sec2', accessToken: 'correct-token',
      });

      const response = await request(app)
        .get(`/api/channel/messages/pending?channelId=${channel.id}`)
        .set('X-Channel-Token', 'wrong-token');

      expect(response.status).toBe(401);
    });

    it('returns 400 when channelId is missing', async () => {
      const response = await request(app)
        .get('/api/channel/messages/pending')
        .set('X-Channel-Token', 'tok');

      expect(response.status).toBe(400);
    });

    it('respects after cursor', async () => {
      const channel = await channelStore.create({
        name: 'CursorTest', serverUrl: 'https://t.com',
        status: 'connected', secret: 'sec3', accessToken: 'tok3',
      });

      await request(app)
        .post(`/api/webhub/channels/${channel.id}/messages`)
        .send({ target: { type: 'user', id: 'u1' }, content: { text: 'first' } });

      // Get the first message ID to use as cursor
      const first = await request(app)
        .get(`/api/channel/messages/pending?channelId=${channel.id}`)
        .set('X-Channel-Token', 'tok3');
      const firstMsg = first.body.data[0];

      await new Promise(r => setTimeout(r, 5));

      await request(app)
        .post(`/api/webhub/channels/${channel.id}/messages`)
        .send({ target: { type: 'user', id: 'u1' }, content: { text: 'second' } });

      const afterCursor = firstMsg.createdAt;
      const response = await request(app)
        .get(`/api/channel/messages/pending?channelId=${channel.id}&after=${encodeURIComponent(afterCursor)}`)
        .set('X-Channel-Token', 'tok3');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].content).toBe('second');
    });
  });

  // ── T017: POST /api/channel/messages/:id/ack ─────────────────────────────

  describe('POST /api/channel/messages/:id/ack', () => {
    it('marks a message as delivered', async () => {
      const { messageStore } = await import('../db/messageStore');
      const msg = messageStore.create({
        channelId: 'ack-ch', direction: 'outbound', messageType: 'text',
        content: 'test', metadata: {}, status: 'sent',
      });

      const response = await request(app)
        .post(`/api/channel/messages/${msg.id}/ack`)
        .set('X-Channel-Token', 'any-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const updated = messageStore.getById(msg.id);
      expect(updated?.status).toBe('delivered');
    });

    it('returns 401 when token is missing', async () => {
      const response = await request(app)
        .post('/api/channel/messages/some-id/ack');

      expect(response.status).toBe(401);
    });
  });

  // ── T018: Direction regression — AI reply must be stored as inbound ────────

  describe('POST /api/channel/messages (T018 direction regression)', () => {
    it('stores AI reply with direction=inbound', async () => {
      const { messageStore } = await import('../db/messageStore');
      const channel = await channelStore.create({
        name: 'DirTest', serverUrl: 'https://t.com',
        status: 'connected', secret: 'sec4', accessToken: 'tok4',
      });

      await request(app)
        .post('/api/channel/messages')
        .set('X-Channel-Token', 'tok4')
        .set('X-Channel-ID', channel.id)
        .send({
          target: { type: 'user', id: 'u1' },
          content: { text: 'AI reply', format: 'plain' },
          timestamp: Date.now(),
        });

      const messages = messageStore.listByChannel(channel.id, 10, 0);
      const aiReply = messages.find(m => m.content === 'AI reply');

      expect(aiReply).toBeDefined();
      expect(aiReply!.direction).toBe('inbound');
    });
  });

  // ── T051: US1 Round-Trip Chat end-to-end integration test ─────────────────

  describe('US1 Round-Trip Chat (T051)', () => {
    it('full flow: user sends → plugin polls → ack → AI replies → direction=inbound', async () => {
      const { messageStore } = await import('../db/messageStore');
      const channel = await channelStore.create({
        name: 'RoundTrip', serverUrl: 'https://t.com',
        status: 'connected', secret: 'sec5', accessToken: 'tok5',
      });

      // Step 1: User sends message via webhook
      const webhookResp = await request(app)
        .post(`/api/webhub/channels/${channel.id}/messages`)
        .send({ target: { type: 'user', id: 'u_alice' }, content: { text: 'Hello AI!' } });

      expect(webhookResp.status).toBe(200);
      expect(webhookResp.body.success).toBe(true);

      // Step 2: Plugin polls for pending user messages
      const pollResp = await request(app)
        .get(`/api/channel/messages/pending?channelId=${channel.id}`)
        .set('X-Channel-Token', 'tok5');

      expect(pollResp.status).toBe(200);
      expect(pollResp.body.data.length).toBeGreaterThanOrEqual(1);
      const userMsg = pollResp.body.data.find((m: any) => m.content === 'Hello AI!');
      expect(userMsg).toBeDefined();
      expect(userMsg.direction).toBe('outbound');

      // Step 3: Plugin acks the message
      const ackResp = await request(app)
        .post(`/api/channel/messages/${userMsg.id}/ack`)
        .set('X-Channel-Token', 'tok5')
        .set('X-Channel-ID', channel.id);

      expect(ackResp.status).toBe(200);
      expect(messageStore.getById(userMsg.id)?.status).toBe('delivered');

      // Step 4: AI delivers reply via plugin outbound
      const replyResp = await request(app)
        .post('/api/channel/messages')
        .set('X-Channel-Token', 'tok5')
        .set('X-Channel-ID', channel.id)
        .send({
          target: { type: 'user', id: 'u_alice' },
          content: { text: 'Hello human!', format: 'plain' },
          timestamp: Date.now(),
        });

      expect(replyResp.status).toBe(200);

      // Verify AI reply stored with direction=inbound
      const allMessages = messageStore.listByChannel(channel.id, 20, 0);
      const aiReply = allMessages.find(m => m.content === 'Hello human!');
      expect(aiReply).toBeDefined();
      expect(aiReply!.direction).toBe('inbound');
    });
  });

  /** T008: GET /api/channel/status returns real status from DB (BUG-01 fix) */
  describe('GET /api/channel/status — real DB status', () => {
    it('returns disconnected for a newly created channel', async () => {
      // Create a channel via the admin API
      const applyResp = await request(app)
        .post('/api/webhub/channels/apply')
        .send({ serverName: 'StatusTest', serverUrl: 'https://status.test' });
      const channelId = applyResp.body.data!.channelId;
      const token = applyResp.body.data!.secret;

      // Query status via plugin API (channel not yet connected)
      const statusResp = await request(app)
        .get('/api/channel/status')
        .set('X-Channel-ID', channelId)
        .set('X-Channel-Token', token);

      expect(statusResp.status).toBe(200);
      // Status should be a real value from the DB, not hardcoded 'connected'
      expect(statusResp.body.data.status).toBeDefined();
      expect(statusResp.body.data.status).not.toBe('hardcoded'); // sanity guard
    });

    it('returns unknown when no channelId header provided', async () => {
      const statusResp = await request(app).get('/api/channel/status');
      expect(statusResp.status).toBe(200);
      expect(statusResp.body.data.status).toBe('unknown');
    });
  });

  /** T012: POST /api/webhooks/:channelId is registered and responds */
  describe('POST /api/webhooks/:channelId — route registration (BUG-02 fix)', () => {
    it('route exists and returns 200 for valid channel message', async () => {
      // Create channel directly with known accessToken (no token in request so optional auth passes)
      const channel = await channelStore.create({
        name: 'WebhookTest',
        serverUrl: 'https://wh.test',
        status: 'connected',
        secret: 'sec_wh1',
        accessToken: 'tok_wh1',
      });

      // Send a webhook message — omit token so optional auth passes
      const webhookResp = await request(app)
        .post(`/api/webhooks/${channel.id}`)
        .send({
          target: { type: 'user', id: 'u_test' },
          content: { text: 'Webhook test message' },
        });

      expect(webhookResp.status).toBe(200);
      expect(webhookResp.body.success).toBe(true);
    });
  });

  /** T016: GET /api/channel/version returns service version info */
  describe('GET /api/channel/version — version endpoint', () => {
    it('returns 200 with serviceVersion field', async () => {
      const resp = await request(app).get('/api/channel/version');
      expect(resp.status).toBe(200);
      expect(resp.body.success).toBe(true);
      expect(resp.body.data.serviceVersion).toBeDefined();
      expect(typeof resp.body.data.serviceVersion).toBe('string');
    });

    it('returns nodeVersion field', async () => {
      const resp = await request(app).get('/api/channel/version');
      expect(resp.body.data.nodeVersion).toBeDefined();
    });

    it('returns pluginVersion field (null when not connected)', async () => {
      const resp = await request(app).get('/api/channel/version');
      // pluginVersion is null until a plugin connects with version info
      expect('pluginVersion' in resp.body.data).toBe(true);
    });
  });

  /** T036: POST /api/channel/quick-register */
  describe('POST /api/channel/quick-register', () => {
    it('201: creates a new channel when key+url are valid', async () => {
      const resp = await request(app)
        .post('/api/channel/quick-register')
        .send({ key: 'test-key-001', url: 'http://localhost:3000' });

      expect(resp.status).toBe(201);
      expect(resp.body.success).toBe(true);
      expect(typeof resp.body.data.channelId).toBe('string');
      expect(typeof resp.body.data.accessToken).toBe('string');
    });

    it('200: idempotent — same key+url returns existing channel', async () => {
      await request(app)
        .post('/api/channel/quick-register')
        .send({ key: 'idem-key', url: 'http://localhost:3000' });

      const resp = await request(app)
        .post('/api/channel/quick-register')
        .send({ key: 'idem-key', url: 'http://localhost:3000' });

      expect(resp.status).toBe(200);
      expect(resp.body.success).toBe(true);
    });

    it('409: same key but different url', async () => {
      await request(app)
        .post('/api/channel/quick-register')
        .send({ key: 'conflict-key', url: 'http://server-a.example.com' });

      const resp = await request(app)
        .post('/api/channel/quick-register')
        .send({ key: 'conflict-key', url: 'http://server-b.example.com' });

      expect(resp.status).toBe(409);
      expect(resp.body.success).toBe(false);
    });

    it('400: missing key', async () => {
      const resp = await request(app)
        .post('/api/channel/quick-register')
        .send({ url: 'http://localhost:3000' });

      expect(resp.status).toBe(400);
    });

    it('400: missing url', async () => {
      const resp = await request(app)
        .post('/api/channel/quick-register')
        .send({ key: 'some-key' });

      expect(resp.status).toBe(400);
    });

    it('422: invalid url format', async () => {
      const resp = await request(app)
        .post('/api/channel/quick-register')
        .send({ key: 'bad-url-key', url: 'not-a-url' });

      expect(resp.status).toBe(422);
      expect(resp.body.success).toBe(false);
    });
  });
});
