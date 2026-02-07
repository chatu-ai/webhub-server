import { InboundMessage, OutboundMessage, Channel } from '../types';

export interface MessageRouter {
  routeInbound(message: InboundMessage): Promise<void>;
  routeOutbound(message: OutboundMessage, channel: Channel): Promise<void>;
  broadcast(channelId: string, message: InboundMessage): Promise<void>;
}

export class WebSocketMessageRouter implements MessageRouter {
  private wsConnections: Map<string, Set<WebSocket>> = new Map();
  private outboundHandlers: Array<(message: OutboundMessage, channel: Channel) => Promise<void>> = [];

  constructor() {}

  registerOutboundHandler(
    handler: (message: OutboundMessage, channel: Channel) => Promise<void>
  ): void {
    this.outboundHandlers.push(handler);
  }

  registerConnection(channelId: string, ws: WebSocket): void {
    if (!this.wsConnections.has(channelId)) {
      this.wsConnections.set(channelId, new Set());
    }
    this.wsConnections.get(channelId)!.add(ws);
  }

  unregisterConnection(channelId: string, ws: WebSocket): void {
    const connections = this.wsConnections.get(channelId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        this.wsConnections.delete(channelId);
      }
    }
  }

  async routeInbound(message: InboundMessage): Promise<void> {
    const connections = this.wsConnections.get(message.channelId);
    if (connections) {
      const frame = {
        type: 'message' as const,
        channelId: message.channelId,
        timestamp: Date.now(),
        payload: message,
      };

      const deadConnections: Set<WebSocket> = new Set();

      for (const ws of connections) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(frame));
          } else if (ws.readyState === WebSocket.CLOSED) {
            deadConnections.add(ws);
          }
        } catch {
          deadConnections.add(ws);
        }
      }

      // Clean up dead connections
      for (const ws of deadConnections) {
        this.unregisterConnection(message.channelId, ws);
      }
    }
  }

  async routeOutbound(message: OutboundMessage, channel: Channel): Promise<void> {
    for (const handler of this.outboundHandlers) {
      try {
        await handler(message, channel);
      } catch (error) {
        console.error('Outbound handler error:', error);
      }
    }
  }

  async broadcast(channelId: string, message: InboundMessage): Promise<void> {
    await this.routeInbound(message);
  }
}

// Message queue for reliability
export class MessageQueue {
  private pendingMessages: Map<string, { message: OutboundMessage; timestamp: number; retryCount: number }> = new Map();
  private readonly MAX_RETRIES = 3;
  private readonly TIMEOUT = 30000; // 30 seconds

  add(message: OutboundMessage): void {
    this.pendingMessages.set(message.messageId, {
      message,
      timestamp: Date.now(),
      retryCount: 0,
    });
  }

  remove(messageId: string): void {
    this.pendingMessages.delete(messageId);
  }

  getPending(): Map<string, { message: OutboundMessage; timestamp: number; retryCount: number }> {
    return this.pendingMessages;
  }

  getExpired(): string[] {
    const now = Date.now();
    const expired: string[] = [];

    for (const [messageId, { timestamp, retryCount }] of this.pendingMessages) {
      if (now - timestamp > this.TIMEOUT && retryCount < this.MAX_RETRIES) {
        expired.push(messageId);
      }
    }

    return expired;
  }

  incrementRetry(messageId: string): boolean {
    const entry = this.pendingMessages.get(messageId);
    if (!entry) return false;

    entry.retryCount++;
    entry.timestamp = Date.now();
    return entry.retryCount < this.MAX_RETRIES;
  }
}
