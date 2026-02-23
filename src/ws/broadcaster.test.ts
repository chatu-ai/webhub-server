import WebSocket from 'ws';
import { WebSocketBroadcaster } from './broadcaster';

/**
 * T050 — WebSocketBroadcaster unit tests
 */

function mockWs(readyState: number = WebSocket.OPEN): jest.Mocked<WebSocket> {
  return {
    readyState,
    send: jest.fn(),
  } as unknown as jest.Mocked<WebSocket>;
}

describe('WebSocketBroadcaster', () => {
  let broadcaster: WebSocketBroadcaster;

  beforeEach(() => {
    broadcaster = new WebSocketBroadcaster();
  });

  // ─── subscribe ─────────────────────────────────────────────────────────────

  describe('subscribe', () => {
    it('adds the client to the channel subscriber set', () => {
      const ws = mockWs();
      broadcaster.subscribe('chan-1', ws);
      expect(broadcaster.clientCount('chan-1')).toBe(1);
    });

    it('allows multiple clients per channel', () => {
      const ws1 = mockWs();
      const ws2 = mockWs();
      broadcaster.subscribe('chan-1', ws1);
      broadcaster.subscribe('chan-1', ws2);
      expect(broadcaster.clientCount('chan-1')).toBe(2);
    });

    it('isolates clients across different channels', () => {
      const ws = mockWs();
      broadcaster.subscribe('chan-1', ws);
      expect(broadcaster.clientCount('chan-2')).toBe(0);
    });

    it('subscribing the same client twice does not duplicate', () => {
      const ws = mockWs();
      broadcaster.subscribe('chan-1', ws);
      broadcaster.subscribe('chan-1', ws);
      expect(broadcaster.clientCount('chan-1')).toBe(1);
    });
  });

  // ─── unsubscribe ────────────────────────────────────────────────────────────

  describe('unsubscribe', () => {
    it('removes the client from the channel subscriber set', () => {
      const ws = mockWs();
      broadcaster.subscribe('chan-1', ws);
      broadcaster.unsubscribe('chan-1', ws);
      expect(broadcaster.clientCount('chan-1')).toBe(0);
    });

    it('cleans up empty subscriber sets', () => {
      const ws = mockWs();
      broadcaster.subscribe('chan-1', ws);
      broadcaster.unsubscribe('chan-1', ws);
      // clientCount should return 0 (no crash, no residual set)
      expect(broadcaster.clientCount('chan-1')).toBe(0);
    });

    it('unsubscribing a non-existent client does not throw', () => {
      const ws = mockWs();
      expect(() => broadcaster.unsubscribe('unknown-channel', ws)).not.toThrow();
    });

    it('only removes the specified client, leaves others intact', () => {
      const ws1 = mockWs();
      const ws2 = mockWs();
      broadcaster.subscribe('chan-1', ws1);
      broadcaster.subscribe('chan-1', ws2);
      broadcaster.unsubscribe('chan-1', ws1);
      expect(broadcaster.clientCount('chan-1')).toBe(1);
    });
  });

  // ─── broadcast ─────────────────────────────────────────────────────────────

  describe('broadcast', () => {
    it('sends JSON payload to OPEN subscriber', () => {
      const ws = mockWs(WebSocket.OPEN);
      broadcaster.subscribe('chan-1', ws);
      broadcaster.broadcast('chan-1', { type: 'message', data: 'hello' });
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'message', data: 'hello' })
      );
    });

    it('sends to all OPEN subscribers of the channel', () => {
      const ws1 = mockWs(WebSocket.OPEN);
      const ws2 = mockWs(WebSocket.OPEN);
      broadcaster.subscribe('chan-1', ws1);
      broadcaster.subscribe('chan-1', ws2);
      broadcaster.broadcast('chan-1', { type: 'ping' });
      expect(ws1.send).toHaveBeenCalledTimes(1);
      expect(ws2.send).toHaveBeenCalledTimes(1);
    });

    it('skips clients that are not in OPEN state', () => {
      const closingWs = mockWs(WebSocket.CLOSING);
      const closedWs = mockWs(WebSocket.CLOSED);
      const openWs = mockWs(WebSocket.OPEN);
      broadcaster.subscribe('chan-1', closingWs);
      broadcaster.subscribe('chan-1', closedWs);
      broadcaster.subscribe('chan-1', openWs);
      broadcaster.broadcast('chan-1', { type: 'test' });
      expect(closingWs.send).not.toHaveBeenCalled();
      expect(closedWs.send).not.toHaveBeenCalled();
      expect(openWs.send).toHaveBeenCalledTimes(1);
    });

    it('does not throw when broadcasting to a channel with no subscribers', () => {
      expect(() =>
        broadcaster.broadcast('empty-channel', { type: 'test' })
      ).not.toThrow();
    });

    it('does not send to subscribers of a different channel', () => {
      const ws1 = mockWs(WebSocket.OPEN);
      const ws2 = mockWs(WebSocket.OPEN);
      broadcaster.subscribe('chan-1', ws1);
      broadcaster.subscribe('chan-2', ws2);
      broadcaster.broadcast('chan-1', { type: 'msg' });
      expect(ws1.send).toHaveBeenCalledTimes(1);
      expect(ws2.send).not.toHaveBeenCalled();
    });

    it('serializes payload as JSON', () => {
      const ws = mockWs(WebSocket.OPEN);
      const payload = { type: 'message', id: 42, text: 'hi', nested: { a: 1 } };
      broadcaster.subscribe('chan-1', ws);
      broadcaster.broadcast('chan-1', payload);
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(payload));
    });
  });

  // ─── clientCount ───────────────────────────────────────────────────────────

  describe('clientCount', () => {
    it('returns 0 for a channel with no subscribers', () => {
      expect(broadcaster.clientCount('no-such-channel')).toBe(0);
    });

    it('returns accurate count after subscribe and unsubscribe', () => {
      const ws1 = mockWs();
      const ws2 = mockWs();
      broadcaster.subscribe('chan-1', ws1);
      broadcaster.subscribe('chan-1', ws2);
      expect(broadcaster.clientCount('chan-1')).toBe(2);
      broadcaster.unsubscribe('chan-1', ws1);
      expect(broadcaster.clientCount('chan-1')).toBe(1);
      broadcaster.unsubscribe('chan-1', ws2);
      expect(broadcaster.clientCount('chan-1')).toBe(0);
    });
  });

  // ─── T035: broadcastChannelStatus ──────────────────────────────────────────

  describe('broadcastChannelStatus', () => {
    it('broadcasts online status to subscribers of the given channel', () => {
      const ws = mockWs(WebSocket.OPEN);
      broadcaster.subscribe('chan-1', ws);

      broadcaster.broadcastChannelStatus('chan-1', 'online');

      expect(ws.send).toHaveBeenCalledTimes(1);
      const payload = JSON.parse((ws.send as jest.Mock).mock.calls[0][0]);
      expect(payload.type).toBe('channel_status');
      expect(payload.channelId).toBe('chan-1');
      expect(payload.status).toBe('online');
      expect(typeof payload.timestamp).toBe('number');
    });

    it('broadcasts reconnecting status correctly', () => {
      const ws = mockWs(WebSocket.OPEN);
      broadcaster.subscribe('ch-x', ws);

      broadcaster.broadcastChannelStatus('ch-x', 'reconnecting');

      const payload = JSON.parse((ws.send as jest.Mock).mock.calls[0][0]);
      expect(payload.status).toBe('reconnecting');
    });

    it('broadcasts offline status correctly', () => {
      const ws = mockWs(WebSocket.OPEN);
      broadcaster.subscribe('ch-y', ws);

      broadcaster.broadcastChannelStatus('ch-y', 'offline');

      const payload = JSON.parse((ws.send as jest.Mock).mock.calls[0][0]);
      expect(payload.status).toBe('offline');
    });

    it('includes pluginVersion when provided', () => {
      const ws = mockWs(WebSocket.OPEN);
      broadcaster.subscribe('chan-v', ws);

      broadcaster.broadcastChannelStatus('chan-v', 'online', '1.2.3');

      const payload = JSON.parse((ws.send as jest.Mock).mock.calls[0][0]);
      expect(payload.pluginVersion).toBe('1.2.3');
    });

    it('omits pluginVersion when not provided', () => {
      const ws = mockWs(WebSocket.OPEN);
      broadcaster.subscribe('chan-nv', ws);

      broadcaster.broadcastChannelStatus('chan-nv', 'online');

      const payload = JSON.parse((ws.send as jest.Mock).mock.calls[0][0]);
      expect(payload.pluginVersion).toBeUndefined();
    });

    it('does not send to subscribers of other channels', () => {
      const wsA = mockWs(WebSocket.OPEN);
      const wsB = mockWs(WebSocket.OPEN);
      broadcaster.subscribe('chan-a', wsA);
      broadcaster.subscribe('chan-b', wsB);

      broadcaster.broadcastChannelStatus('chan-a', 'online');

      expect(wsA.send).toHaveBeenCalledTimes(1);
      expect(wsB.send).not.toHaveBeenCalled();
    });

    it('does not throw when there are no subscribers', () => {
      expect(() =>
        broadcaster.broadcastChannelStatus('empty-ch', 'offline')
      ).not.toThrow();
    });
  });
});
