/**
 * T040: SSE Router integration tests (Constitution §IV)
 *
 * Covers:
 *  - Missing token → 401 MISSING_TOKEN
 *  - Invalid token → 401 INVALID_TOKEN
 *  - Token for a different channel → 401 TOKEN_CHANNEL_MISMATCH
 *  - Valid token for per-channel endpoint → 200 text/event-stream + calls sseManager
 *  - Valid token for global endpoint → 200 text/event-stream + calls sseManager
 */
import express from 'express';
import request from 'supertest';

// ── Mocks (must be declared before any imports of the modules they replace) ─────

const mockAddConnection = jest.fn().mockImplementation((_channelId, res: any) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.flushHeaders();
  // End AFTER the route handler has had a chance to write its initial frame
  setImmediate(() => { try { res.end(); } catch { /* already ended */ } });
  return { id: 'sse-mock-id', channelId: _channelId, seq: 0, connectedAt: Date.now(), res };
});

jest.mock('../http/sseManager', () => ({
  sseManager: {
    addConnection: mockAddConnection,
    destroy: jest.fn(),
  },
}));

const VALID_TOKEN = 'wh_valid_test_token';
const VALID_CHANNEL_ID = 'ch-test-001';

jest.mock('../db/channelStore', () => ({
  channelStore: {
    getByAccessToken: jest.fn((token: string) => {
      if (token === VALID_TOKEN) {
        return { id: VALID_CHANNEL_ID, accessToken: VALID_TOKEN, name: 'Test Channel' };
      }
      return null;
    }),
  },
}));

// ── Import AFTER mocks are set up ───────────────────────────────────────────────

import sseRouter from './sseRouter';

describe('SSE Router (T040)', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(sseRouter);
    mockAddConnection.mockClear();
  });

  // ── Per-channel endpoint ───────────────────────────────────────────────────

  describe(`GET /api/webhub/channel/:channelId/events`, () => {
    it('returns 401 when ?token is missing', async () => {
      const res = await request(app)
        .get(`/api/webhub/channel/${VALID_CHANNEL_ID}/events`)
        .expect(401);

      expect(res.body.error).toBe('MISSING_TOKEN');
    });

    it('returns 401 when ?token is unknown', async () => {
      const res = await request(app)
        .get(`/api/webhub/channel/${VALID_CHANNEL_ID}/events?token=invalid`)
        .expect(401);

      expect(res.body.error).toBe('INVALID_TOKEN');
    });

    it('returns 401 when valid token belongs to a different channel', async () => {
      const res = await request(app)
        .get(`/api/webhub/channel/different-channel/events?token=${VALID_TOKEN}`)
        .expect(401);

      expect(res.body.error).toBe('TOKEN_CHANNEL_MISMATCH');
    });

    it('returns 200 text/event-stream and calls sseManager.addConnection for valid token', async () => {
      const res = await request(app)
        .get(`/api/webhub/channel/${VALID_CHANNEL_ID}/events?token=${VALID_TOKEN}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(mockAddConnection).toHaveBeenCalledWith(
        VALID_CHANNEL_ID,
        expect.anything(),
        undefined, // no Last-Event-ID header in this request
      );
    });
  });

  // ── Global endpoint ─────────────────────────────────────────────────────────

  describe(`GET /api/webhub/events/global`, () => {
    it('returns 401 when ?token is missing', async () => {
      const res = await request(app)
        .get('/api/webhub/events/global')
        .expect(401);

      expect(res.body.error).toBe('MISSING_TOKEN');
    });

    it('returns 401 when ?token is invalid', async () => {
      const res = await request(app)
        .get('/api/webhub/events/global?token=garbage')
        .expect(401);

      expect(res.body.error).toBe('INVALID_TOKEN');
    });

    it('returns 200 text/event-stream and calls sseManager.addConnection for valid token', async () => {
      const res = await request(app)
        .get(`/api/webhub/events/global?token=${VALID_TOKEN}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(mockAddConnection).toHaveBeenCalledWith(
        'global',
        expect.anything(),
      );
    });
  });
});
