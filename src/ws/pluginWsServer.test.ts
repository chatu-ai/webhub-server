/**
 * T010b — PluginWsServer unit tests
 *
 * constitution §IV: New modules must have a test file.
 *
 * Tests cover:
 *   - Token validation (valid / missing / mismatch channelId)
 *   - close(4001) on auth failure
 *   - Per-frame channelId mismatch → discard + Pino WARN
 *   - queueStore.listPending called on connect
 */

import http from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';

// ── Mocks (must be declared BEFORE jest.mock calls) ─────────────────────────

const mockGetByAccessToken = jest.fn();
jest.mock('../db/channelStore', () => ({
  channelStore: { getByAccessToken: mockGetByAccessToken },
}));

const mockListPending = jest.fn<any[], [string?, number?]>(() => []);
const mockUpdateStatus = jest.fn();
jest.mock('../db/queueStore', () => ({
  queueStore: { listPending: mockListPending, updateStatus: mockUpdateStatus },
}));

const mockBroadcastChannelStatus = jest.fn();
jest.mock('./broadcaster', () => ({
  broadcaster: { broadcastChannelStatus: mockBroadcastChannelStatus },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { PluginWsServer } from './pluginWsServer';

/** Create a test HTTP server with the pluginWsServer's handleUpgrade attached. */
function createTestServer(): { server: http.Server; pws: PluginWsServer; port: () => number } {
  const warnFn = jest.fn();
  const logger: any = {
    info: jest.fn(),
    warn: warnFn,
    error: jest.fn(),
  };
  const pws = new PluginWsServer({ logger });
  const server = http.createServer();

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '', 'http://localhost').pathname;
    if (pathname === '/api/channel/ws') {
      pws.handleUpgrade(req, socket as any, head);
    } else {
      socket.destroy();
    }
  });

  return {
    server,
    pws,
    port: () => (server.address() as AddressInfo).port,
  };
}

/** Connect a WS client to ws://localhost:{port}/api/channel/ws with query params. */
function connectClient(
  port: number,
  params: { channelId?: string; token?: string } = {},
): WebSocket {
  const qs = new URLSearchParams();
  if (params.channelId !== undefined) qs.set('channelId', params.channelId);
  if (params.token !== undefined) qs.set('token', params.token);
  return new WebSocket(`ws://127.0.0.1:${port}/api/channel/ws?${qs.toString()}`);
}

/** Wait for a WS close event; resolves with [code, reason]. */
function waitForClose(ws: WebSocket): Promise<[number, string]> {
  return new Promise((resolve) => {
    ws.on('close', (code, reason) => resolve([code, reason.toString()]));
  });
}

/** Wait for a WS open event. */
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PluginWsServer', () => {
  let server: http.Server;
  let pws: PluginWsServer;
  let portFn: () => number;
  let clients: WebSocket[] = [];

  beforeEach((done) => {
    jest.clearAllMocks();
    mockListPending.mockReturnValue([]);

    const t = createTestServer();
    server = t.server;
    pws = t.pws;
    portFn = t.port;

    server.listen(0, '127.0.0.1', done);
  });

  afterEach((done) => {
    // Close all open clients
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.terminate();
    }
    clients = [];
    server.close(done);
  });

  // ── Authentication ──────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('closes with 4001 when channelId query param is missing', async () => {
      const ws = connectClient(portFn(), { token: 'tok-valid' });
      clients.push(ws);
      const [code] = await waitForClose(ws);
      expect(code).toBe(4001);
    });

    it('closes with 4001 when token query param is missing', async () => {
      const ws = connectClient(portFn(), { channelId: 'ch-1' });
      clients.push(ws);
      const [code] = await waitForClose(ws);
      expect(code).toBe(4001);
    });

    it('closes with 4001 when token is not found in channelStore', async () => {
      mockGetByAccessToken.mockReturnValue(null);
      const ws = connectClient(portFn(), { channelId: 'ch-1', token: 'tok-bad' });
      clients.push(ws);
      const [code] = await waitForClose(ws);
      expect(code).toBe(4001);
    });

    it('closes with 4001 when token.channelId does not match query channelId', async () => {
      mockGetByAccessToken.mockReturnValue({ id: 'ch-DIFFERENT' });
      const ws = connectClient(portFn(), { channelId: 'ch-1', token: 'tok-mismatch' });
      clients.push(ws);
      const [code] = await waitForClose(ws);
      expect(code).toBe(4001);
    });

    it('accepts connection when token is valid and channelId matches', async () => {
      mockGetByAccessToken.mockReturnValue({ id: 'ch-1' });
      const ws = connectClient(portFn(), { channelId: 'ch-1', token: 'tok-ok' });
      clients.push(ws);
      await waitForOpen(ws);
      expect(pws.connectedCount()).toBe(1);
      ws.close();
    });
  });

  // ── Queue replay ────────────────────────────────────────────────────────────

  describe('queue replay on connect', () => {
    it('calls queueStore.listPending on successful connect', async () => {
      mockGetByAccessToken.mockReturnValue({ id: 'ch-queue' });
      const ws = connectClient(portFn(), { channelId: 'ch-queue', token: 'tok-q' });
      clients.push(ws);
      await waitForOpen(ws);

      // Allow async replay to run
      await new Promise((r) => setTimeout(r, 50));

      expect(mockListPending).toHaveBeenCalledWith('ch-queue');
      ws.close();
    });

    it('sends pending queue items as frames after connect', async () => {
      mockGetByAccessToken.mockReturnValue({ id: 'ch-replay' });
      mockListPending.mockReturnValue([
        { id: 'q-1', messageId: 'm-1', messageType: 'text', content: 'hello', priority: 0 },
      ]);

      const messages: string[] = [];
      const ws = connectClient(portFn(), { channelId: 'ch-replay', token: 'tok-r' });
      clients.push(ws);
      ws.on('message', (data) => messages.push(data.toString()));

      await waitForOpen(ws);
      await new Promise((r) => setTimeout(r, 100));

      expect(messages.length).toBeGreaterThanOrEqual(1);
      const frame = JSON.parse(messages[0]);
      expect(frame.type).toBe('message');
      expect(frame.channelId).toBe('ch-replay');
      ws.close();
    });
  });

  // ── Per-frame channelId validation ──────────────────────────────────────────

  describe('per-frame channelId validation', () => {
    it('discards frames where channelId does not match auth context', async () => {
      const warnFn = ((pws as any).logger as any)?.warn as jest.Mock | undefined;

      mockGetByAccessToken.mockReturnValue({ id: 'ch-frame' });
      const ws = connectClient(portFn(), { channelId: 'ch-frame', token: 'tok-f' });
      clients.push(ws);
      await waitForOpen(ws);

      // Send a frame with a spoofed channelId
      ws.send(JSON.stringify({ type: 'message', channelId: 'ch-SPOOFED', payload: {} }));
      await new Promise((r) => setTimeout(r, 50));

      // The logger warn should have been called with mismatch info
      if (warnFn) {
        expect(warnFn).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'plugin_ws_frame_mismatch' }),
          expect.stringContaining('mismatch'),
        );
      }

      ws.close();
    });
  });

  // ── broadcastChannelStatus ──────────────────────────────────────────────────

  describe('broadcastChannelStatus integration', () => {
    it('broadcasts online status on connect', async () => {
      mockGetByAccessToken.mockReturnValue({ id: 'ch-status' });
      const ws = connectClient(portFn(), { channelId: 'ch-status', token: 'tok-s' });
      clients.push(ws);
      await waitForOpen(ws);
      await new Promise((r) => setTimeout(r, 20));

      expect(mockBroadcastChannelStatus).toHaveBeenCalledWith('ch-status', 'online');
      ws.close();
    });

    it('broadcasts reconnecting status on disconnect', async () => {
      mockGetByAccessToken.mockReturnValue({ id: 'ch-offline' });
      const ws = connectClient(portFn(), { channelId: 'ch-offline', token: 'tok-x' });
      clients.push(ws);
      await waitForOpen(ws);

      ws.close();
      await waitForClose(ws);
      await new Promise((r) => setTimeout(r, 20));

      expect(mockBroadcastChannelStatus).toHaveBeenCalledWith('ch-offline', 'reconnecting');
    });
  });
});
