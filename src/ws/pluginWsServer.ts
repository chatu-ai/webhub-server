/******************************************************************
 * Plugin WebSocket Server
 *
 * Handles persistent WebSocket connections from OpenClaw channel
 * plugins at the endpoint `/api/channel/ws?channelId=X&token=Y`.
 *
 * Protocol:
 *   - Plugin connects with valid accessToken + matching channelId
 *   - On connect: pending queue items are replayed to the plugin
 *   - Each frame is validated: channelId must match auth context
 *   - On disconnect: broadcasts channel_status=reconnecting; transitions
 *     to offline after 30 s of inactivity
 *
 * @see specs/001-plugin-channel-realtime/tasks.md T010
 ******************************************************************/

import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { Logger } from 'pino';
import { channelStore } from '../db/channelStore';
import { queueStore } from '../db/queueStore';
import { broadcaster } from './broadcaster';

export interface PluginWsServerOptions {
  logger?: Logger;
}

/**
 * A single active plugin connection context.
 */
interface PluginConnection {
  ws: WebSocket;
  channelId: string;
  offlineTimer: ReturnType<typeof setTimeout> | null;
}

/** Delay (ms) before broadcasting channel_status=offline after a disconnect. */
const OFFLINE_DELAY_MS = 30_000;

/**
 * PluginWsServer — manages plugin-side WebSocket connections.
 *
 * Attach it to an existing http.Server via `attach(server)`.
 * The WebSocket server runs with `noServer: true` so the HTTP Upgrade
 * can be selectively routed in server.ts (T011).
 */
export class PluginWsServer {
  private wss: WebSocketServer;
  private logger: Logger | undefined;

  /** channelId → active plugin connection */
  private connections: Map<string, PluginConnection> = new Map();

  constructor(options: PluginWsServerOptions = {}) {
    this.logger = options.logger;
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on('connection', this.handleConnection.bind(this));
  }

  /**
   * Route an incoming HTTP Upgrade request for `/api/channel/ws` to this server.
   * Call this from the http.Server `upgrade` event in server.ts (T011).
   */
  handleUpgrade(req: http.IncomingMessage, socket: import('net').Socket, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }

  /**
   * Returns the number of currently connected plugin clients.
   * Used in tests and health checks.
   */
  connectedCount(): number {
    return this.connections.size;
  }

  /**
   * Returns the active WebSocket for a given channelId, if any.
   */
  getConnection(channelId: string): WebSocket | undefined {
    return this.connections.get(channelId)?.ws;
  }

  /**
   * Phase 11 T046: Push a downlink frame to the connected plugin for the given channelId.
   * No-ops silently when the plugin is offline or has no active connection.
   */
  pushToChannel(channelId: string, frame: Record<string, unknown>): void {
    const conn = this.connections.get(channelId);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return;
    try {
      conn.ws.send(JSON.stringify(frame));
    } catch (err) {
      this.logger?.warn(
        { event: 'plugin_ws_push_error', channelId, error: String(err) },
        `Failed to push frame to plugin (channelId=${channelId})`,
      );
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const rawUrl = req.url ?? '';

    // Parse query params from the upgrade URL
    const parsed = new URL(rawUrl, 'http://localhost');
    const channelId = parsed.searchParams.get('channelId') ?? '';
    const token = parsed.searchParams.get('token') ?? '';

    if (!channelId || !token) {
      ws.close(4001, 'Missing channelId or token');
      return;
    }

    // Validate token — synchronous DB lookup
    const channel = channelStore.getByAccessToken(token);
    if (!channel || channel.id !== channelId) {
      this.logger?.warn(
        { event: 'plugin_ws_auth_failed', channelId, hasChannel: !!channel },
        'Plugin WS auth failed: token/channelId mismatch',
      );
      ws.close(4001, 'Unauthorized');
      return;
    }

    // If an existing connection exists for this channel, close it gracefully
    const existing = this.connections.get(channelId);
    if (existing) {
      existing.ws.close(4000, 'Replaced by new connection');
      this.cleanupConnection(channelId, false);
    }

    const conn: PluginConnection = { ws, channelId, offlineTimer: null };
    this.connections.set(channelId, conn);

    this.logger?.info(
      { event: 'plugin_ws_connected', channelId },
      `Plugin connected (channelId=${channelId})`,
    );

    // Broadcast online status to subscribed frontend clients
    broadcaster.broadcastChannelStatus(channelId, 'online');

    // Replay pending queue items to the plugin
    this.replayPendingQueue(channelId, ws).catch((err) => {
      this.logger?.error(
        { event: 'plugin_ws_replay_error', channelId, error: String(err) },
        `Failed to replay pending queue for channelId=${channelId}`,
      );
    });

    ws.on('message', (data) => {
      this.handleFrame(channelId, data);
    });

    ws.on('close', () => {
      this.logger?.info(
        { event: 'plugin_ws_disconnected', channelId },
        `Plugin disconnected (channelId=${channelId})`,
      );

      // Broadcast reconnecting immediately, then offline after timeout
      broadcaster.broadcastChannelStatus(channelId, 'reconnecting');

      const timer = setTimeout(() => {
        broadcaster.broadcastChannelStatus(channelId, 'offline');
        this.connections.delete(channelId);
      }, OFFLINE_DELAY_MS);

      const c = this.connections.get(channelId);
      if (c) c.offlineTimer = timer;
    });

    ws.on('error', (err) => {
      this.logger?.warn(
        { event: 'plugin_ws_error', channelId, error: String(err) },
        `Plugin WS error (channelId=${channelId})`,
      );
    });
  }

  /**
   * Validate every incoming frame's channelId against the authenticated context.
   * Discard and WARN on mismatch (spec §security per-frame validation).
   */
  private handleFrame(authChannelId: string, data: WebSocket.RawData): void {
    try {
      const text = data.toString();
      const frame = JSON.parse(text) as Record<string, unknown>;
      const frameChannelId = frame.channelId as string | undefined;

      if (frameChannelId && frameChannelId !== authChannelId) {
        this.logger?.warn(
          { event: 'plugin_ws_frame_mismatch', authChannelId, frameChannelId },
          `Plugin frame channelId mismatch: expected=${authChannelId} got=${frameChannelId} — dropped`,
        );
        return;
      }

      // Forward plugin-originated messages (e.g. ACKs) handled downstream
      // by the message routing layer (out of T010 scope).
    } catch (err) {
      this.logger?.warn(
        { event: 'plugin_ws_parse_error', authChannelId, error: String(err) },
        `Plugin frame parse error (channelId=${authChannelId})`,
      );
    }
  }

  /**
   * Replay all pending queue items for the channel to the newly-connected plugin.
   * Items are sent in priority DESC + created_at ASC order (per queueStore.listPending).
   */
  private async replayPendingQueue(channelId: string, ws: WebSocket): Promise<void> {
    const items = queueStore.listPending(channelId);
    if (items.length === 0) return;

    this.logger?.info(
      { event: 'plugin_ws_replay', channelId, count: items.length },
      `Replaying ${items.length} pending queue items to plugin (channelId=${channelId})`,
    );

    for (const item of items) {
      if (ws.readyState !== WebSocket.OPEN) break;

      const frame = {
        type: 'message',
        channelId,
        timestamp: Date.now(),
        payload: {
          messageId: item.messageId,
          messageType: item.messageType,
          content: item.content,
          priority: item.priority,
        },
      };

      ws.send(JSON.stringify(frame), (err) => {
        if (err) {
          this.logger?.warn(
            { event: 'plugin_ws_replay_send_error', channelId, itemId: item.id, error: String(err) },
            `Failed to replay item ${item.id} to plugin (channelId=${channelId})`,
          );
          queueStore.updateStatus(item.id, 'failed', String(err));
        } else {
          queueStore.updateStatus(item.id, 'processing');
        }
      });
    }
  }

  /**
   * Clean up a connection entry and cancel its offline timer.
   */
  private cleanupConnection(channelId: string, broadcastOffline: boolean): void {
    const conn = this.connections.get(channelId);
    if (!conn) return;
    if (conn.offlineTimer) clearTimeout(conn.offlineTimer);
    if (broadcastOffline) {
      broadcaster.broadcastChannelStatus(channelId, 'offline');
    }
    this.connections.delete(channelId);
  }
}

/** Singleton used by server.ts (T011). */
export const pluginWsServer = new PluginWsServer();
