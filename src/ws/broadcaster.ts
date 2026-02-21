import WebSocket from 'ws';

/**
 * WebSocketBroadcaster
 *
 * Manages per-channel WebSocket subscribers and broadcasts messages to them.
 * Used to push real-time events (e.g. new AI replies) to connected frontend clients.
 */
export class WebSocketBroadcaster {
  private subscribers: Map<string, Set<WebSocket>> = new Map();

  /**
   * Subscribe a WebSocket client to events for the given channelId.
   */
  subscribe(channelId: string, ws: WebSocket): void {
    if (!this.subscribers.has(channelId)) {
      this.subscribers.set(channelId, new Set());
    }
    this.subscribers.get(channelId)!.add(ws);
  }

  /**
   * Unsubscribe a WebSocket client from events for the given channelId.
   * Cleans up empty sets automatically.
   */
  unsubscribe(channelId: string, ws: WebSocket): void {
    const subs = this.subscribers.get(channelId);
    if (!subs) return;
    subs.delete(ws);
    if (subs.size === 0) {
      this.subscribers.delete(channelId);
    }
  }

  /**
   * Broadcast a JSON payload to all OPEN WebSocket clients subscribed to channelId.
   * Silently skips clients that are not in OPEN state.
   */
  broadcast(channelId: string, payload: unknown): void {
    const subs = this.subscribers.get(channelId);
    if (!subs || subs.size === 0) return;

    const message = JSON.stringify(payload);
    for (const ws of subs) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  /**
   * Returns the number of subscribers for the given channelId.
   */
  clientCount(channelId: string): number {
    return this.subscribers.get(channelId)?.size ?? 0;
  }
}

export const broadcaster = new WebSocketBroadcaster();
