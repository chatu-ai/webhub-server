import WebSocket from 'ws';
import { WebSocketFrame, HeartbeatPayload, ConnectionStatus } from '../types';
import { MessageQueue, MessageRouter } from '../router/messageRouter';

export interface HeartbeatConfig {
  interval: number;
  timeout: number;
  maxFailures: number;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  interval: 30000,  // 30 seconds
  timeout: 10000,   // 10 seconds
  maxFailures: 3,
};

export class WebSocketManager {
  private connections: Map<string, WebSocketState> = new Map();
  private heartbeatConfig: HeartbeatConfig;
  private messageQueue: MessageQueue;

  constructor(messageQueue: MessageQueue, config?: Partial<HeartbeatConfig>) {
    this.heartbeatConfig = { ...DEFAULT_HEARTBEAT_CONFIG, ...config };
    this.messageQueue = messageQueue;
  }

  addConnection(channelId: string, ws: WebSocket): void {
    const state: WebSocketState = {
      ws,
      channelId,
      status: 'connecting',
      lastHeartbeat: Date.now(),
      consecutiveFailures: 0,
    };

    this.connections.set(channelId, state);
    this.setupConnectionHandlers(channelId, ws);
  }

  removeConnection(channelId: string): void {
    const state = this.connections.get(channelId);
    if (state) {
      if (state.heartbeatTimer) {
        clearInterval(state.heartbeatTimer);
      }
      this.connections.delete(channelId);
    }
  }

  getConnection(channelId: string): WebSocketState | undefined {
    return this.connections.get(channelId);
  }

  getAllConnections(): Map<string, WebSocketState> {
    return this.connections;
  }

  private setupConnectionHandlers(channelId: string, ws: WebSocket): void {
    const state = this.connections.get(channelId)!;

    ws.on('open', () => {
      state.status = 'connected';
      this.sendOpenFrame(ws, channelId);
      this.startHeartbeat(channelId);
    });

    ws.on('message', (data: Buffer) => {
      try {
        const frame = JSON.parse(data.toString()) as WebSocketFrame;
        this.handleFrame(channelId, frame);
      } catch (error) {
        console.error('Invalid message format:', error);
      }
    });

    ws.on('close', () => {
      state.status = 'disconnected';
      this.removeConnection(channelId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for channel ${channelId}:`, error);
      state.status = 'error';
    });
  }

  private handleFrame(channelId: string, frame: WebSocketFrame): void {
    const state = this.connections.get(channelId);
    if (!state) return;

    switch (frame.type) {
      case 'heartbeat':
        this.handleHeartbeat(channelId, frame);
        break;
      case 'ack':
        this.handleAck(frame);
        break;
      case 'message':
        // Forward to message router
        break;
    }
  }

  private handleHeartbeat(channelId: string, frame: WebSocketFrame): void {
    const state = this.connections.get(channelId);
    if (!state) return;

    const payload = frame.payload as HeartbeatPayload;
    state.lastHeartbeat = Date.now();
    state.status = payload?.status || 'heartbeat_ok';
    state.consecutiveFailures = 0;
  }

  private handleAck(frame: WebSocketFrame): void {
    if (frame.payload && typeof frame.payload === 'object' && 'messageId' in frame.payload) {
      const messageId = (frame.payload as { messageId: string }).messageId;
      this.messageQueue.remove(messageId);
    }
  }

  private startHeartbeat(channelId: string): void {
    const state = this.connections.get(channelId);
    if (!state || state.heartbeatTimer) return;

    state.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat(channelId);
    }, this.heartbeatConfig.interval);
  }

  private sendHeartbeat(channelId: string): void {
    const state = this.connections.get(channelId);
    if (!state) return;

    const frame: WebSocketFrame = {
      type: 'heartbeat',
      channelId,
      timestamp: Date.now(),
      payload: {
        status: 'connected',
        nextHeartbeat: Date.now() + this.heartbeatConfig.interval,
      },
    };

    try {
      if (state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify(frame));
        // Check for timeout
        setTimeout(() => {
          this.checkHeartbeatTimeout(channelId);
        }, this.heartbeatConfig.timeout);
      } else {
        this.handleHeartbeatFailure(channelId);
      }
    } catch {
      this.handleHeartbeatFailure(channelId);
    }
  }

  private checkHeartbeatTimeout(channelId: string): void {
    const state = this.connections.get(channelId);
    if (!state) return;

    const now = Date.now();
    const elapsed = now - state.lastHeartbeat;

    if (elapsed > this.heartbeatConfig.timeout) {
      this.handleHeartbeatFailure(channelId);
    }
  }

  private handleHeartbeatFailure(channelId: string): void {
    const state = this.connections.get(channelId);
    if (!state) return;

    state.consecutiveFailures++;
    state.status = 'heartbeat_fail';

    if (state.consecutiveFailures >= this.heartbeatConfig.maxFailures) {
      state.status = 'disconnected';
      this.removeConnection(channelId);
      // Trigger reconnect logic here if needed
    }
  }

  private sendOpenFrame(ws: WebSocket, channelId: string): void {
    const frame: WebSocketFrame = {
      type: 'open',
      channelId,
      timestamp: Date.now(),
    };

    try {
      ws.send(JSON.stringify(frame));
    } catch (error) {
      console.error('Failed to send open frame:', error);
    }
  }

  // Utility methods
  isConnected(channelId: string): boolean {
    const state = this.connections.get(channelId);
    return state?.status === 'connected' || state?.status === 'heartbeat_ok';
  }

  getStatus(channelId: string): ConnectionStatus | undefined {
    return this.connections.get(channelId)?.status;
  }

  getLastHeartbeat(channelId: string): number | undefined {
    return this.connections.get(channelId)?.lastHeartbeat;
  }
}

export interface WebSocketState {
  ws: WebSocket;
  channelId: string;
  status: ConnectionStatus;
  lastHeartbeat: number;
  consecutiveFailures: number;
  heartbeatTimer?: ReturnType<typeof setInterval>;
}
