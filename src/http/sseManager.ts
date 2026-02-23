/******************************************************************
 * T019 Plugin-Channel SSE: SSE Connection Manager
 *
 * Manages per-channel and global Server-Sent Events connections.
 *
 * Each frontend client opens one EventSource per channel
 * (GET /api/webhub/channel/:id/events).  A "global" slot
 * (GET /api/webhub/events/global) receives cross-channel status events.
 *
 * Features:
 *   - Per-connection seq counter for Last-Event-ID resumption
 *   - 60-second rolling chunk buffer per messageId for replay on reconnect
 *   - 25-second keep-alive heartbeat to all connections
 *   - Automatic cleanup on client close
 ******************************************************************/

import type { Response } from 'express';
import { getLogger } from '../utils/logger';

/** In-memory description of one SSE connection. */
export interface SseConnection {
  id: string;
  channelId: string | 'global';
  res: Response;
  seq: number;
  connectedAt: number;
}

/** A single chunk stored in the rolling buffer for Last-Event-ID replay. */
interface ChunkBufferEntry {
  seq: number;
  eventType: string;
  data: unknown;
  ts: number;
}

const HEARTBEAT_INTERVAL_MS = 25_000;
const CHUNK_BUFFER_TTL_MS = 60_000;
/** Max buffer entries per channelId (prevents unbounded memory growth). */
const MAX_BUFFER_ENTRIES = 500;

/**
 * SseManager — singleton that keeps track of all active EventSource connections
 * and provides channel-scoped / global broadcast helpers.
 */
export class SseManager {
  /** channelId (or 'global') → set of active connections */
  private connections: Map<string, Set<SseConnection>> = new Map();

  /** messageId → rolling chunk buffer (TTL 60 s) */
  private chunkBuffer: Map<string, ChunkBufferEntry[]> = new Map();

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private seqCounter = 0;

  constructor() {
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      HEARTBEAT_INTERVAL_MS,
    );
  }

  /** Stop the heartbeat timer — for test teardown only. */
  destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Register a new SSE connection.
   *
   * @param channelId  The channel (or 'global') this connection subscribes to.
   * @param res        Express Response that has already been configured for SSE.
   * @param lastEventId  Value of the Last-Event-ID header (for chunk replay).
   */
  addConnection(
    channelId: string,
    res: Response,
    lastEventId?: string | string[],
  ): SseConnection {
    const id = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const conn: SseConnection = {
      id,
      channelId,
      res,
      seq: this.seqCounter++,
      connectedAt: Date.now(),
    };

    // Configure SSE headers (must be set before any write)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    // Flush headers immediately so the client receives the 200 response quickly
    res.flushHeaders();

    if (!this.connections.has(channelId)) {
      this.connections.set(channelId, new Set());
    }
    this.connections.get(channelId)!.add(conn);

    // Cleanup on client disconnect
    res.on('close', () => {
      this.removeConnection(id, channelId);
    });

    // Replay missed chunks if Last-Event-ID was provided
    const lastSeq = this.parseLastEventId(lastEventId);
    if (lastSeq !== null) {
      this.replayMissedChunks(channelId, conn, lastSeq);
    }

    try {
      getLogger().info(
        { event: 'sse_connected', channelId, connId: id },
        `SSE client connected (channel=${channelId})`,
      );
    } catch { /* ignore during tests */ }

    return conn;
  }

  /** Remove a connection by its generated ID. */
  removeConnection(connId: string, channelId: string): void {
    const set = this.connections.get(channelId);
    if (!set) return;
    for (const conn of set) {
      if (conn.id === connId) {
        set.delete(conn);
        break;
      }
    }
    if (set.size === 0) this.connections.delete(channelId);
  }

  /**
   * Broadcast an SSE event to all connections for a specific channelId.
   * Also stores the event in the rolling chunk buffer for replay.
   */
  broadcast(
    channelId: string,
    eventType: string,
    data: unknown,
    bufferKey?: string,
  ): void {
    const seq = this.seqCounter++;
    const frame = this.formatFrame(seq, eventType, data);

    // Buffer for replay (keyed by bufferKey, falls back to channelId)
    if (bufferKey) {
      this.addToBuffer(bufferKey, { seq, eventType, data, ts: Date.now() });
    }

    const set = this.connections.get(channelId);
    if (!set || set.size === 0) return;
    for (const conn of set) {
      this.writeFrame(conn, frame);
    }
  }

  /**
   * Broadcast an SSE event to ALL connections (every channel + global).
   */
  broadcastGlobal(eventType: string, data: unknown): void {
    const seq = this.seqCounter++;
    const frame = this.formatFrame(seq, eventType, data);

    for (const set of this.connections.values()) {
      for (const conn of set) {
        this.writeFrame(conn, frame);
      }
    }
  }

  /** Number of active connections (for health checks / tests). */
  connectionCount(channelId?: string): number {
    if (channelId) return this.connections.get(channelId)?.size ?? 0;
    let total = 0;
    for (const s of this.connections.values()) total += s.size;
    return total;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private formatFrame(seq: number, eventType: string, data: unknown): string {
    return `id: ${seq}\nevent: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  private writeFrame(conn: SseConnection, frame: string): void {
    try {
      conn.res.write(frame);
    } catch {
      /* client already disconnected — cleanup handled by close event */
    }
  }

  private sendHeartbeat(): void {
    const seq = this.seqCounter++;
    const frame = this.formatFrame(seq, 'heartbeat', { ts: Date.now() });
    for (const set of this.connections.values()) {
      for (const conn of set) {
        this.writeFrame(conn, frame);
      }
    }
    // Prune expired chunk buffer entries
    this.pruneBuffer();
  }

  private addToBuffer(key: string, entry: ChunkBufferEntry): void {
    if (!this.chunkBuffer.has(key)) this.chunkBuffer.set(key, []);
    const buf = this.chunkBuffer.get(key)!;
    buf.push(entry);
    if (buf.length > MAX_BUFFER_ENTRIES) buf.shift();
  }

  private pruneBuffer(): void {
    const cutoff = Date.now() - CHUNK_BUFFER_TTL_MS;
    for (const [key, entries] of this.chunkBuffer) {
      const pruned = entries.filter((e) => e.ts > cutoff);
      if (pruned.length === 0) this.chunkBuffer.delete(key);
      else this.chunkBuffer.set(key, pruned);
    }
  }

  private replayMissedChunks(
    channelId: string,
    conn: SseConnection,
    lastSeq: number,
  ): void {
    // Collect missed entries from all buffer keys for this channel
    // (a channel's chunks are buffered under their messageId)
    const missed: ChunkBufferEntry[] = [];
    for (const entries of this.chunkBuffer.values()) {
      for (const e of entries) {
        if (e.seq > lastSeq) missed.push(e);
      }
    }
    missed.sort((a, b) => a.seq - b.seq);
    for (const e of missed) {
      this.writeFrame(conn, this.formatFrame(e.seq, e.eventType, e.data));
    }
  }

  private parseLastEventId(
    header: string | string[] | undefined,
  ): number | null {
    if (!header) return null;
    const raw = Array.isArray(header) ? header[0] : header;
    const n = parseInt(raw, 10);
    return isNaN(n) ? null : n;
  }
}

/** Module-level singleton — import this wherever you need SSE broadcast. */
export const sseManager = new SseManager();
