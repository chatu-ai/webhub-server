import WebSocket from 'ws';
import { Server as HTTPServer } from 'http';
import { Logger } from '../utils/logger';

const logger = new Logger('WebSocket');

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

export class WebSocketService {
  private wss: WebSocket.Server | null = null;
  private clients: Set<WebSocket> = new Set();

  initialize(server: HTTPServer): void {
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('New WebSocket connection established');
      this.clients.add(ws);

      // Send welcome message
      this.sendToClient(ws, {
        type: 'connected',
        data: { message: 'Connected to Chatu Web Hub' },
        timestamp: new Date().toISOString(),
      });

      // Handle incoming messages
      ws.on('message', (message: string) => {
        try {
          const parsed = JSON.parse(message.toString());
          logger.info('Received message:', parsed);
          this.handleMessage(ws, parsed);
        } catch (error) {
          logger.error('Failed to parse message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        logger.info('WebSocket connection closed');
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error: Error) => {
        logger.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });

    logger.info('WebSocket server initialized');
  }

  private handleMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'ping':
        this.sendToClient(ws, {
          type: 'pong',
          data: { timestamp: new Date().toISOString() },
          timestamp: new Date().toISOString(),
        });
        break;
      case 'broadcast':
        this.broadcast(message.data);
        break;
      case 'echo':
        this.sendToClient(ws, {
          type: 'echo',
          data: message.data,
          timestamp: new Date().toISOString(),
        });
        break;
      default:
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  private sendToClient(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string): void {
    this.sendToClient(ws, {
      type: 'error',
      data: { error },
      timestamp: new Date().toISOString(),
    });
  }

  broadcast(data: any): void {
    const message: WebSocketMessage = {
      type: 'broadcast',
      data,
      timestamp: new Date().toISOString(),
    };

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });

    logger.info(`Broadcast message to ${this.clients.size} clients`);
  }

  getConnectedClientsCount(): number {
    return this.clients.size;
  }
}

export default new WebSocketService();
