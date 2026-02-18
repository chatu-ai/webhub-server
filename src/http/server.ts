import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from 'pino';
import { ChannelStore } from '../store/channelStore';
import { MessageRouter } from '../router/messageRouter';

export interface WebHubServerOptions {
  port: number;
  logger?: Logger;
  channelStore?: ChannelStore;
  messageRouter?: MessageRouter;
}

export class WebHubServer {
  private app: Application;
  private options: WebHubServerOptions;
  private server: http.Server | null = null;
  private channelStore: ChannelStore;

  constructor(options: WebHubServerOptions) {
    this.options = options;

    if (options.channelStore) {
      this.channelStore = options.channelStore;
    } else {
      const { channelStore: dbChannelStore } = require('../db/index');
      // Wrap synchronous db store in async-compatible interface
      this.channelStore = {
        create: (data: Parameters<ChannelStore['create']>[0]) => Promise.resolve(dbChannelStore.create(data)),
        getById: (id: string) => Promise.resolve(dbChannelStore.getById(id)),
        getBySecret: (secret: string) => Promise.resolve(dbChannelStore.getBySecret(secret)),
        getByAccessToken: (token: string) => Promise.resolve(dbChannelStore.getByAccessToken(token)),
        updateStatus: (id: string, status: Parameters<ChannelStore['updateStatus']>[1]) =>
          Promise.resolve(dbChannelStore.updateStatus(id, status)),
        updateLastHeartbeat: (id: string) => {
          dbChannelStore.updateLastHeartbeat(id);
          return Promise.resolve(dbChannelStore.getById(id));
        },
        delete: (id: string) => {
          const r = dbChannelStore.delete(id);
          return Promise.resolve(typeof r === 'boolean' ? r : true);
        },
        list: () => Promise.resolve(dbChannelStore.list()),
        incrementMetrics: (id: string) => {
          if (dbChannelStore.incrementMetrics) dbChannelStore.incrementMetrics(id);
          return Promise.resolve();
        },
      } as unknown as ChannelStore;
    }

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Channel Management
    this.app.post('/api/webhub/channels/apply', this.applyChannel.bind(this));
    this.app.get('/api/webhub/channels', this.listChannels.bind(this));
    this.app.get('/api/webhub/channels/:id', this.getChannel.bind(this));
    this.app.get('/api/webhub/channels/:id/status', this.getChannelStatus.bind(this));
    this.app.delete('/api/webhub/channels/:id', this.deleteChannel.bind(this));

    // Message Routes
    this.app.post('/api/webhub/channels/:id/messages', this.sendMessage.bind(this));
    this.app.get('/api/webhub/channels/:id/messages', this.getMessages.bind(this));
    this.app.post('/api/webhub/channels/:id/heartbeat', this.sendHeartbeat.bind(this));

    // Channel Auth
    this.app.post('/api/channel/register', this.registerChannel.bind(this));
    this.app.post('/api/channel/verify', this.verifyChannel.bind(this));
    this.app.post('/api/channel/connect', this.connectChannel.bind(this));
    this.app.post('/api/channel/disconnect', this.disconnectChannel.bind(this));
    this.app.get('/api/channel/status', this.getOpenClawStatus.bind(this));

    // OpenClaw Integration
    this.app.post('/api/channel/messages', this.forwardToOpenClaw.bind(this));
    this.app.post('/api/channel/webhook', this.handleWebhook.bind(this));

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      this.options.logger?.error({
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
      });
      res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' });
    });
  }

  private async applyChannel(req: Request, res: Response): Promise<void> {
    try {
      const { serverName, serverUrl, description } = req.body;

      if (!serverName) {
        res.status(400).json({ success: false, error: 'serverName is required', code: 'INVALID_REQUEST' });
        return;
      }
      if (!serverUrl) {
        res.status(400).json({ success: false, error: 'serverUrl is required', code: 'INVALID_REQUEST' });
        return;
      }

      const secret = `wh_secret_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
      const accessToken = `wh_${uuidv4().replace(/-/g, '')}`;

      const channel = await this.channelStore.create({
        name: serverName,
        serverUrl,
        description,
        status: 'pending',
        secret,
        accessToken,
      });

      this.options.logger?.info({ event: 'channel_applied', channelId: channel.id, name: serverName });

      const registerCommand = `/webhub register ${channel.id} ${secret}`;

      res.json({
        success: true,
        data: {
          channelId: channel.id,
          channelName: channel.name,
          apiUrl: serverUrl,
          registerCommand,
          secret: channel.secret,
          createdAt: channel.createdAt,
        },
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.logger?.error({ event: 'channel_apply_error', error: err.message });
      res.status(500).json({ success: false, error: err.message, code: 'CREATE_FAILED' });
    }
  }

  private async listChannels(req: Request, res: Response): Promise<void> {
    const channels = await this.channelStore.list();
    res.json({
      success: true,
      data: channels.map(ch => ({
        id: ch.id,
        name: ch.name,
        serverUrl: ch.serverUrl,
        status: ch.status,
        secret: ch.secret,
        lastHeartbeat: ch.lastHeartbeat,
        createdAt: ch.createdAt,
      })),
    });
  }

  private async getChannel(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const channel = await this.channelStore.getById(id);
    if (!channel) {
      res.status(404).json({ success: false, error: 'Channel not found', code: 'CHANNEL_NOT_FOUND' });
      return;
    }
    res.json({
      success: true,
      data: {
        channelId: channel.id,
        name: channel.name,
        serverUrl: channel.serverUrl,
        status: channel.status,
        secret: channel.secret,
        description: channel.description,
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt,
        lastHeartbeat: channel.lastHeartbeat,
      },
    });
  }

  private async getChannelStatus(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const channel = await this.channelStore.getById(id);
    if (!channel) {
      res.status(404).json({ success: false, error: 'Channel not found', code: 'CHANNEL_NOT_FOUND' });
      return;
    }
    res.json({
      success: true,
      data: {
        id: channel.id,
        name: channel.name,
        status: channel.status,
        lastHeartbeat: channel.lastHeartbeat,
      },
    });
  }

  private async deleteChannel(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const deleted = await this.channelStore.delete(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Channel not found', code: 'CHANNEL_NOT_FOUND' });
      return;
    }
    res.json({ success: true });
  }

  private async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { id: channelId } = req.params;

      const channel = await this.channelStore.getById(channelId);
      if (!channel) {
        res.status(404).json({ success: false, error: 'Channel not found', code: 'CHANNEL_NOT_FOUND' });
        return;
      }

      if (channel.status !== 'connected') {
        res.status(400).json({ success: false, error: 'Channel not connected', code: 'CHANNEL_OFFLINE' });
        return;
      }

      const messageId = uuidv4();
      this.options.logger?.info({ event: 'message_sent', channelId, messageId });

      res.json({
        success: true,
        data: { messageId, deliveredAt: new Date().toISOString() },
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ success: false, error: err.message, code: 'SEND_FAILED' });
    }
  }

  private async getMessages(req: Request, res: Response): Promise<void> {
    const { id: channelId } = req.params;
    const channel = await this.channelStore.getById(channelId);
    if (!channel) {
      res.status(404).json({ success: false, error: 'Channel not found', code: 'CHANNEL_NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: [] });
  }

  private async sendHeartbeat(req: Request, res: Response): Promise<void> {
    const { id: channelId } = req.params;
    const channel = await this.channelStore.getById(channelId);
    if (!channel) {
      res.status(404).json({ success: false, error: 'Channel not found', code: 'CHANNEL_NOT_FOUND' });
      return;
    }
    await this.channelStore.updateLastHeartbeat(channelId);
    res.json({ success: true, data: { status: channel.status } });
  }

  private async registerChannel(req: Request, res: Response): Promise<void> {
    const { channelId, secret } = req.body;
    const channel = await this.channelStore.getBySecret(secret);

    if (!channel || channel.id !== channelId) {
      res.status(401).json({ success: false, error: 'Invalid credentials', code: 'UNAUTHORIZED' });
      return;
    }

    await this.channelStore.updateStatus(channelId, 'registered');
    this.options.logger?.info({ event: 'channel_registered', channelId });

    res.json({
      success: true,
      data: {
        channelId: channel.id,
        accessToken: channel.accessToken,
      },
    });
  }

  private async verifyChannel(req: Request, res: Response): Promise<void> {
    const { channelId, secret } = req.body;
    const channel = await this.channelStore.getBySecret(secret);

    if (!channel || channel.id !== channelId) {
      res.status(401).json({ success: false, error: 'Invalid credentials', code: 'UNAUTHORIZED' });
      return;
    }

    res.json({
      success: true,
      data: {
        verified: true,
        channelId: channel.id,
      },
    });
  }

  private async connectChannel(req: Request, res: Response): Promise<void> {
    const { channelId } = req.body;
    const token = req.headers['x-access-token'] as string;

    const channel = await this.channelStore.getByAccessToken(token);
    if (!channel || channel.id !== channelId) {
      res.status(401).json({ success: false, error: 'Invalid token', code: 'UNAUTHORIZED' });
      return;
    }

    await this.channelStore.updateStatus(channelId, 'connected');
    this.options.logger?.info({ event: 'channel_connected', channelId });
    res.json({ success: true, data: { status: 'connected' } });
  }

  private async disconnectChannel(req: Request, res: Response): Promise<void> {
    const { channelId } = req.body;
    const token = req.headers['x-access-token'] as string;

    const channel = await this.channelStore.getByAccessToken(token);
    if (!channel || channel.id !== channelId) {
      res.status(401).json({ success: false, error: 'Invalid token', code: 'UNAUTHORIZED' });
      return;
    }

    await this.channelStore.updateStatus(channelId, 'disconnected');
    this.options.logger?.info({ event: 'channel_disconnected', channelId });
    res.json({ success: true, data: { status: 'disconnected' } });
  }

  private async getOpenClawStatus(req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      data: {
        status: 'connected',
        timestamp: new Date().toISOString(),
      },
    });
  }

  private async forwardToOpenClaw(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.body;
      const token = req.headers['x-channel-token'] as string;
      const channelId = req.headers['x-channel-id'] as string;

      if (!token) {
        res.status(401).json({ success: false, error: 'Missing channel token', code: 'UNAUTHORIZED' });
        return;
      }

      if (!channelId) {
        res.status(400).json({ success: false, error: 'Missing channel ID', code: 'INVALID_REQUEST' });
        return;
      }

      const channel = await this.channelStore.getById(channelId);
      if (!channel) {
        res.status(404).json({ success: false, error: 'Channel not found', code: 'NOT_FOUND' });
        return;
      }

      if (channel.accessToken !== token) {
        res.status(401).json({ success: false, error: 'Invalid token', code: 'UNAUTHORIZED' });
        return;
      }

      const msgId = messageId || `msg_${Date.now()}`;

      res.json({
        success: true,
        messageId: msgId,
        deliveredAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ success: false, error: err.message, code: 'FORWARD_FAILED' });
    }
  }

  private async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const channelId = req.headers['x-channel-id'] as string;
      const token = req.headers['x-channel-token'] as string;
      const message = req.body;

      if (!channelId) {
        res.status(400).json({ success: false, error: 'Missing channel ID', code: 'INVALID_REQUEST' });
        return;
      }

      const channel = await this.channelStore.getById(channelId);
      if (!channel) {
        res.status(404).json({ success: false, error: 'Channel not found', code: 'NOT_FOUND' });
        return;
      }

      if (token && channel.accessToken !== token) {
        res.status(401).json({ success: false, error: 'Invalid token', code: 'UNAUTHORIZED' });
        return;
      }

      res.json({
        success: true,
        receivedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ success: false, error: err.message, code: 'WEBHOOK_FAILED' });
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.options.port, () => {
        this.options.logger?.info({
          event: 'started',
          port: this.options.port,
          message: 'WebHub HTTP server started',
        });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.options.logger?.info({ event: 'stopped', message: 'WebHub HTTP server stopped' });
          resolve();
        });
      });
    }
  }

  getApp(): Application {
    return this.app;
  }
}
