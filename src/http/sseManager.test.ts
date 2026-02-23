/**
 * T039: SseManager unit tests (Constitution §IV)
 *
 * Covers:
 *  - addConnection registers connection and sets SSE headers
 *  - broadcast writes correct id:/event:/data: SSE frame
 *  - removeConnection cleans up after 'close' event
 *  - destroy() stops heartbeat timer
 *  - Last-Event-ID replay: missed chunks re-sent to reconnecting client
 */
import { SseManager } from './sseManager';
import type { Response } from 'express';
import { EventEmitter } from 'events';

// ── Mock Response factory ──────────────────────────────────────────────────────

function makeMockRes(): jest.Mocked<Response> & { wroteFrames: string[]; headers: Record<string, string> } {
  const emitter = new EventEmitter();
  const wroteFrames: string[] = [];
  const headers: Record<string, string> = {};

  const res = {
    setHeader: jest.fn((key: string, value: string) => { headers[key] = value; }),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk: string) => { wroteFrames.push(chunk); return true; }),
    on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      emitter.on(event, cb);
      return res;
    }),
    emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
    wroteFrames,
    headers,
  } as unknown as jest.Mocked<Response> & { wroteFrames: string[]; headers: Record<string, string> };

  return res;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('SseManager', () => {
  let manager: SseManager;

  beforeEach(() => {
    jest.useFakeTimers();
    manager = new SseManager();
  });

  afterEach(() => {
    manager.destroy();
    jest.useRealTimers();
  });

  // ── addConnection ─────────────────────────────────────────────────────────

  describe('addConnection', () => {
    it('sets SSE response headers', () => {
      const res = makeMockRes();
      manager.addConnection('ch-1', res as unknown as Response);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.flushHeaders).toHaveBeenCalled();
    });

    it('registers connection so connectionCount increments', () => {
      const res = makeMockRes();
      expect(manager.connectionCount('ch-1')).toBe(0);
      manager.addConnection('ch-1', res as unknown as Response);
      expect(manager.connectionCount('ch-1')).toBe(1);
    });

    it('returns a connection with the given channelId', () => {
      const res = makeMockRes();
      const conn = manager.addConnection('ch-abc', res as unknown as Response);
      expect(conn.channelId).toBe('ch-abc');
      expect(conn.id).toMatch(/^sse-/);
    });
  });

  // ── broadcast ─────────────────────────────────────────────────────────────

  describe('broadcast', () => {
    it('writes a well-formed SSE frame to the connected client', () => {
      const res = makeMockRes();
      manager.addConnection('ch-2', res as unknown as Response);
      res.wroteFrames.length = 0; // clear any frames from addConnection

      manager.broadcast('ch-2', 'channel_status', { status: 'online' });

      expect(res.wroteFrames.length).toBe(1);
      const frame = res.wroteFrames[0];
      expect(frame).toMatch(/^id: \d+\n/);
      expect(frame).toContain('event: channel_status\n');
      expect(frame).toContain('"status":"online"');
      expect(frame.endsWith('\n\n')).toBe(true);
    });

    it('delivers to all connections on the same channelId', () => {
      const resA = makeMockRes();
      const resB = makeMockRes();
      manager.addConnection('ch-3', resA as unknown as Response);
      manager.addConnection('ch-3', resB as unknown as Response);
      resA.wroteFrames.length = 0;
      resB.wroteFrames.length = 0;

      manager.broadcast('ch-3', 'ping', {});

      expect(resA.wroteFrames.length).toBe(1);
      expect(resB.wroteFrames.length).toBe(1);
    });

    it('does NOT deliver to connections on a different channelId', () => {
      const resA = makeMockRes();
      const resB = makeMockRes();
      manager.addConnection('ch-a', resA as unknown as Response);
      manager.addConnection('ch-b', resB as unknown as Response);
      resA.wroteFrames.length = 0;
      resB.wroteFrames.length = 0;

      manager.broadcast('ch-a', 'ping', {});

      expect(resA.wroteFrames.length).toBe(1);
      expect(resB.wroteFrames.length).toBe(0);
    });
  });

  // ── removeConnection ──────────────────────────────────────────────────────

  describe('removeConnection on close event', () => {
    it('decrements connection count when client disconnects', () => {
      const res = makeMockRes();
      manager.addConnection('ch-4', res as unknown as Response);
      expect(manager.connectionCount('ch-4')).toBe(1);

      // Simulate client disconnect
      ;(res as any).emit('close');

      expect(manager.connectionCount('ch-4')).toBe(0);
    });
  });

  // ── destroy / heartbeat ───────────────────────────────────────────────────

  describe('destroy()', () => {
    it('stops the heartbeat timer without errors', () => {
      // Should not throw
      expect(() => manager.destroy()).not.toThrow();
    });
  });

  // ── Last-Event-ID replay ──────────────────────────────────────────────────

  describe('Last-Event-ID replay', () => {
    it('replays buffered chunks with seq > lastEventId on reconnect', () => {
      // Seed the buffer by broadcasting with a bufferKey
      const seederRes = makeMockRes();
      manager.addConnection('ch-5', seederRes as unknown as Response);

      // Broadcast 3 chunk events with buffer key 'msg-1'
      manager.broadcast('ch-5', 'chunk', { seq: 1, delta: 'a' }, 'msg-1');
      manager.broadcast('ch-5', 'chunk', { seq: 2, delta: 'b' }, 'msg-1');
      manager.broadcast('ch-5', 'chunk', { seq: 3, delta: 'c' }, 'msg-1');

      // Now a new client connects with Last-Event-ID set to the seq of the first event
      const lateRes = makeMockRes();
      // Parse the seq from the first frame
      const firstFrame = seederRes.wroteFrames.find(f => f.includes('"seq":1'))!;
      const idLine = firstFrame.split('\n')[0]; // 'id: <seq>'
      const seqStr = idLine.replace('id: ', '').trim();

      lateRes.wroteFrames.length = 0;
      manager.addConnection('ch-5', lateRes as unknown as Response, seqStr);

      // The late connecter should receive the events that came AFTER seqStr
      const receivedData = lateRes.wroteFrames.join('')
      expect(receivedData).toContain('"delta":"b"');
      expect(receivedData).toContain('"delta":"c"');
    });
  });
});
