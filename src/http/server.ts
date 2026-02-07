import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { ChannelStore } from '../store/channelStore';
import { MessageRouter } from '../router/messageRouter';
import {
  ApplyChannelRequest,
  ApplyChannelResponse,
  ChannelStatusResponse,
  SendMessageRequest,
  SendMessageResponse,
  ErrorResponse,
  InboundMessage,
  Channel,
  ChannelStatus,
} from '../types';

export interface WebHubServerOptions {
  port: number;
  channelStore: ChannelStore;
  messageRouter: MessageRouter;
}

export class WebHubServer {
  private app: express.Application;
  private options: WebHubServerOptions;
  private server: ReturnType<typeof express> | null = null;

  constructor(options: WebHubServerOptions) {
    this.options = options;
    this.app = express();

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Channel Management Routes
    this.app.post('/api/webhub/channels/apply', this.applyChannel.bind(this));
    this.app.get('/api/webhub/channels', this.listChannels.bind(this));
    this.app.get('/api/webhub/channels/:id', this.getChannel.bind(this));
    this.app.get('/api/webhub/channels/:id/status', this.getChannelStatus.bind(this));
    this.app.delete('/api/webhub/channels/:id', this.deleteChannel.bind(this));

    // Message Routes
    this.app.post('/api/webhub/channels/:id/messages', this.sendMessage.bind(this));
    this.app.post('/api/webhub/channels/:id/heartbeat', this.sendHeartbeat.bind(this));

    // OpenClaw Integration Routes
    this.app.post('/api/channel/messages', this.forwardToOpenClaw.bind(this));
    this.app.get('/api/channel/status', this.getOpenClawStatus.bind(this));
    this.app.post('/api/channel/verify', this.verifyChannel.bind(this));
    this.app.post('/api/channel/webhook', this.handleWebhook.bind(this));

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Server error:', err);
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      };
      res.status(500).json(errorResponse);
    });
  }

  // Channel Management Methods
  private async applyChannel(req: Request, res: Response): Promise<void> {
    try {
      const { serverName, serverUrl, description } = req.body as ApplyChannelRequest;

      if (!serverName || !serverUrl) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: 'serverName and serverUrl are required',
          code: 'INVALID_REQUEST',
        };
        res.status(400).json(errorResponse);
        return;
      }

      const secret = `wh_secret_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
      const accessToken = `wh_${uuidv4().replace(/-/g, '')}`;

      const channel = await this.options.channelStore.create({
        name: serverName,
        serverUrl,
        description: description || '',
        status: 'pending',
        secret,
        accessToken,
      });

      const response: ApplyChannelResponse = {
        success: true,
        data: {
          channelId: channel.id,
          channelName: channel.name,
          registerCommand: `/webhub register ${channel.id} ${secret}`,
          secret: channel.secret,
          createdAt: channel.createdAt.toISOString(),
        },
      };

      res.json(response);
    } catch (error) {
      console.error('Failed to apply channel:', error);
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'Failed to create channel',
        code: 'INTERNAL_ERROR',
      };
      res.status(500).json(errorResponse);
    }
  }

  private async listChannels(req: Request, res: Response): Promise<void> {
    try {
      const channels = await this.options.channelStore.list();
      res.json({
        success: true,
        data: channels.map((ch) => ({
          channelId: ch.id,
          name: ch.name,
          status: ch.status,
          createdAt: ch.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error('Failed to list channels:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list channels',
        code: 'INTERNAL_ERROR',
      });
    }
  }

  private async getChannel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const channel = await this.options.channelStore.getById(id);

      if (!channel) {
        res.status(404).json({
          success: false,
          error: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          channelId: channel.id,
          name: channel.name,
          serverUrl: channel.serverUrl,
          status: channel.status,
          createdAt: channel.createdAt.toISOString(),
          lastHeartbeat: channel.lastHeartbeat?.toISOString(),
        },
      });
    } catch (error) {
      console.error('Failed to get channel:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get channel',
        code: 'INTERNAL_ERROR',
      });
    }
  }

  private async getChannelStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const channel = await this.options.channelStore.getById(id);

      if (!channel) {
        res.status(404).json({
          success: false,
          error: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND',
        });
        return;
      }

      const response: ChannelStatusResponse = {
        success: true,
        data: {
          channelId: channel.id,
          status: channel.status,
          lastHeartbeat: channel.lastHeartbeat?.toISOString(),
          nextHeartbeat: channel.lastHeartbeat
            ? new Date(channel.lastHeartbeat.getTime() + 30000).toISOString()
            : undefined,
        },
      };

      res.json(response);
    } catch (error) {
      console.error('Failed to get channel status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get channel status',
        code: 'INTERNAL_ERROR',
      });
    }
  }

  private async deleteChannel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await this.options.channelStore.delete(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND',
        });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete channel:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete channel',
        code: 'INTERNAL_ERROR',
      });
    }
  }

  // Message Methods
  private async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const messageRequest = req.body as SendMessageRequest;

      const channel = await this.options.channelStore.getById(id);
      if (!channel) {
        res.status(404).json({
          success: false,
          error: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND',
        });
        return;
      }

      if (channel.status !== 'connected') {
        res.status(400).json({
          success: false,
          error: 'Channel is not connected',
          code: 'CHANNEL_DISABLED',
        });
        return;
      }

      // Route the message
      await this.options.messageRouter.routeOutbound(
        {
          messageId: messageRequest.messageId,
          target: messageRequest.target,
          content: messageRequest.content,
          replyTo: messageRequest.replyTo,
        },
        channel
      );

      const response: SendMessageResponse = {
        success: true,
        data: {
          messageId: messageRequest.messageId,
          deliveredAt: new Date().toISOString(),
        },
      };

      res.json(response);
    } catch (error) {
      console.error('Failed to send message:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send message',
        code: 'INTERNAL_ERROR',
      });
    }
  }

  private async sendHeartbeat(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { timestamp } = req.body;

      const channel = await this.options.channelStore.getById(id);
      if (!channel) {
        res.status(404).json({
          success: false,
          error: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND',
        });
        return;
      }

      await this.options.channelStore.updateLastHeartbeat(id);

      res.json({
        success: true,
        data: {
          status: channel.status,
          nextHeartbeat: Date.now() + 30000,
        },
      });
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process heartbeat',
        code: 'INTERNAL_ERROR',
      });
    }
  }

  // OpenClaw Integration Methods
  private async forwardToOpenClaw(req: Request, res: Response): Promise<void> {
    try {
      const { channelId, messageId, target, content } = req.body;

      const channel = await this.options.channelStore.getById(channelId);
      if (!channel) {
        res.status(404).json({
          success: false,
          error: 'Channel not found',
          code: 'CHANNEL_NOT_FOUND',
        });
        return;
      }

      // In a real implementation, this would forward to OpenClaw
      // For now, we just acknowledge receipt
      res.json({
        success: true,
        messageId,
        deliveredAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to forward message:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to forward message',
        code: 'INTERNAL_ERROR',
      });
    }
  }

  private async getOpenClawStatus(req: Request, res: Response): Promise<void> {
    try {
      res.json({
        success: true,
        data: {
          status: 'connected',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Failed to get OpenClaw status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get status',
        code: 'INTERNAL_ERROR',
      });
    }
  }

  private async verifyChannel(req: Request, res: Response): Promise<void> {
    try {
      const { channelId, secret } = req.body;

      const channel = await this.options.channelStore.getBySecret(secret);
      if (!channel || channel.id !== channelId) {
        res.status(401).json({
          success: false,
          error: 'Invalid channel credentials',
          code: 'UNAUTHORIZED',
        });
        return;
      }

      res.json({
        success: true,
        data: {
          channelId: channel.id,
          name: channel.name,
          verified: true,
        },
      });
    } catch (error) {
      console.error('Failed to verify channel:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify channel',
        code: 'INTERNAL_ERROR',
      });
    }
  }

  private async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const message = req.body as InboundMessage;

      // Route inbound message to connected WebSocket clients
      await this.options.messageRouter.routeInbound(message);

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to handle webhook:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process webhook',
        code: 'INTERNAL_ERROR',
      });
    }
  }

  // Server Lifecycle Methods
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.options.port, () => {
        console.log(`WebHub server listening on port ${this.options.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log('WebHub server stopped');
          resolve();
        });
      });
    }
  }

  getApp(): express.Application {
    return this.app;
  }
}
