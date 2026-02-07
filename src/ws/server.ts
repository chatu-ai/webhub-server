import WebSocket, { Server as WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { ChannelStore } from '../store/channelStore';
import { WebSocketManager, WebSocketState } from './websocketManager';
import { MessageRouter, MessageQueue } from '../router/messageRouter';
import { WebSocketFrame, ConnectionStatus } from '../types';
import { Logger } from 'pino';

export interface WebSocketServerOptions {
  port: number;
  channelStore: ChannelStore;
  messageRouter: MessageRouter;
  logger?: Logger;
}

export class WebSocketServerModule {
  private wss: WebSocketServer | null = null;
  private options: WebSocketServerOptions;
  private wsManager: WebSocketManager;

  constructor(options: WebSocketServerOptions) {
    this.options = options;
    const messageQueue = new MessageQueue();
    this.wsManager = new WebSocketManager(messageQueue, undefined, options.logger);

    // Register message router for outbound messages
    this.options.messageRouter.registerOutboundHandler(
      async (message, channel) => {
        await this.sendToChannel(channel.id, {
          type: 'message',
          channelId: channel.id,
          timestamp: Date.now(),
          payload: message,
        });
      }
    );
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.options.port });

      this.wss.on('listening', () => {
        this.options.logger?.info({ event: 'listening', port: this.options.port, message: 'WebSocket server started' });
        resolve();
      });

      this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
        this.handleConnection(ws, request);
      });

      this.wss.on('error', (error) => {
        this.options.logger?.error({ event: 'error', error: error.message });
      });
    });
  }

  private async handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    // Parse query parameters
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const channelId = url.searchParams.get('channelId');
    const token = url.searchParams.get('token');

    if (!channelId || !token) {
      ws.close(4001, 'Missing channelId or token');
      return;
    }

    // Verify channel and token
    const channel = await this.options.channelStore.getByAccessToken(token);
    if (!channel || channel.id !== channelId) {
      ws.close(4002, 'Invalid channel credentials');
      return;
    }

    // Check if channel is allowed to connect
    if (channel.status === 'disabled') {
      ws.close(4003, 'Channel is disabled');
      return;
    }

    // Update channel status to connected
    await this.options.channelStore.updateStatus(channelId, 'connected');

    // Register connection
    this.wsManager.addConnection(channelId, ws);
    this.options.messageRouter.registerConnection(channelId, ws);

    // Handle incoming messages
    ws.on('message', async (data: Buffer) => {
      try {
        const frame = JSON.parse(data.toString()) as WebSocketFrame;
        await this.handleMessage(channelId, frame);
      } catch (error) {
        this.options.logger?.error('Invalid message format:', error);
        ws.close(4004, 'Invalid message format');
      }
    });

    // Handle disconnection
    ws.on('close', async () => {
      await this.handleDisconnection(channelId, ws);
    });

    ws.on('error', (error) => {
      this.options.logger?.error(`WebSocket error for channel ${channelId}:`, error);
    });
  }

  private async handleMessage(channelId: string, frame: WebSocketFrame): Promise<void> {
    switch (frame.type) {
      case 'message':
        // Handle outbound message from client
        break;

      case 'heartbeat':
        this.wsManager.getConnection(channelId)!.lastHeartbeat = Date.now();
        break;

      case 'ack':
        // Handle acknowledgment
        break;
    }
  }

  private async handleDisconnection(channelId: string, ws: WebSocket): Promise<void> {
    this.options.messageRouter.unregisterConnection(channelId, ws);
    this.wsManager.removeConnection(channelId);

    // Update channel status
    await this.options.channelStore.updateStatus(channelId, 'disconnected');
  }

  private async sendToChannel(channelId: string, frame: WebSocketFrame): Promise<void> {
    const state = this.wsManager.getConnection(channelId);
    if (!state || state.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Channel ${channelId} is not connected`);
    }

    state.ws.send(JSON.stringify(frame));
  }

  async stop(): Promise<void> {
    if (this.wss) {
      return new Promise((resolve) => {
        this.wss!.close(() => {
          this.options.logger?.info('WebSocket server stopped');
          resolve();
        });
      });
    }
  }

  getManager(): WebSocketManager {
    return this.wsManager;
  }
}
