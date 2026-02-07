import express from 'express';
import request from 'supertest';
import { WebHubServer } from '../../http/server';
import { InMemoryChannelStore } from '../../store/channelStore';
import { WebSocketMessageRouter } from '../../router/messageRouter';

describe('WebHubServer', () => {
  let server: WebHubServer;
  let app: express.Application;
  let channelStore: InMemoryChannelStore;
  let messageRouter: WebSocketMessageRouter;

  beforeEach(() => {
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
    it('should return OpenClaw status', async () => {
      const response = await request(app).get('/api/channel/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('connected');
    });
  });
});
