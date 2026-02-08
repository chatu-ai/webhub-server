import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { channelStore, messageStore, queueStore } from '../db/index.js';
import { Logger } from 'pino';

export interface WebHubServerOptions {
  port: number;
  logger?: Logger;
}

export class WebHubServer {
  private app: Application;
  private options: WebHubServerOptions;
  private server: http.Server | null = null;

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

    // ===== CHANNEL MANAGEMENT =====
    this.app.post('/api/webhub/channels', this.createChannel.bind(this));
    this.app.get('/api/webhub/channels', this.listChannels.bind(this));
    this.app.get('/api/webhub/channels/:id', this.getChannel.bind(this));
    this.app.get('/api/webhub/channels/:id/status', this.getChannelStatus.bind(this));
    this.app.delete('/api/webhub/channels/:id', this.deleteChannel.bind(this));

    // ===== MESSAGE ROUTES =====
    this.app.post('/api/webhub/channels/:id/messages', this.sendMessage.bind(this));
    this.app.get('/api/webhub/channels/:id/messages', this.getMessages.bind(this));
    this.app.post('/api/webhub/channels/:id/heartbeat', this.sendHeartbeat.bind(this));

    // ===== CHANNEL AUTH (from channel side) =====
    this.app.post('/api/channel/register', this.registerChannel.bind(this));
    this.app.post('/api/channel/connect', this.connectChannel.bind(this));
    this.app.post('/api/channel/disconnect', this.disconnectChannel.bind(this));

    // ===== OPENCLAW INTEGRATION =====
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
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    });
  }

  // ===== CHANNEL METHODS =====
  private async createChannel(req: Request, res: Response): Promise<void> {
    try {
      const { name, webhubUrl: reqWebhubUrl, description } = req.body;

      const secret = `wh_secret_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
      const accessToken = `wh_${uuidv4().replace(/-/g, '')}`;

      const channel = channelStore.create({
        name,
        webhubUrl: reqWebhubUrl,
        description,
        status: 'pending',
        secret,
        accessToken,
        config: {},
        metrics: { totalMessages: 0, messagesToday: 0, connections: 0 },
      });

      this.options.logger?.info({ event: 'channel_created', channelId: channel.id, name });
      
      const apiUrl = channel.webhubUrl || 'http://localhost:3000';
      
      // 构建完整的安装和注册脚本
      const envSetupCmd = `# 环境变量设置（可选）
export WEBHUB_CHANNEL_ID="${channel.id}"
export WEBHUB_SECRET="${secret}"
export WEBHUB_API_URL="${apiUrl}"`;

      const cloneAndInstallCmd = `# 1. 克隆插件仓库并安装
git clone https://github.com/chatu-ai/chatu-web-hub-service.git && cd chatu-web-hub-service
openclaw plugins install .`;

      const registerCmd = `# 2. 注册 Channel
npm run register ${channel.id} ${secret} --api-url ${apiUrl}`;

      // 单行版本
      const singleLineInstall = `git clone https://github.com/chatu-ai/chatu-web-hub-service.git && cd chatu-web-hub-service && openclaw plugins install . && npm run register ${channel.id} ${secret} --api-url ${apiUrl}`;
      
      // 添加 Channel 命令
      const addChannelCmd = `# 3. 添加 Channel 到 OpenClaw
openclaw channels add`;
      
      res.json({
        success: true,
        data: {
          channelId: channel.id,
          channelName: channel.name,
          envSetupCommand: envSetupCmd,
          cloneCommand: cloneAndInstallCmd,
          registerCommand: registerCmd,
          addChannelCommand: addChannelCmd,
          singleLineCommand: singleLineInstall,
          secret: channel.secret,
          createdAt: channel.createdAt,
        },
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.logger?.error({ event: 'channel_create_error', error: err.message });
      res.status(500).json({ success: false, error: err.message, code: 'CREATE_FAILED' });
    }
  }

  private async listChannels(req: Request, res: Response): Promise<void> {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const channels = channelStore.list(limit, offset);
    res.json({
      success: true,
      data: channels.map(ch => ({
        id: ch.id,
        name: ch.name,
        webhubUrl: ch.webhubUrl,
        status: ch.status,
        createdAt: ch.createdAt,
      })),
    });
  }

  private async getChannel(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const channel = channelStore.getById(id);
    if (!channel) {
      res.status(404).json({ success: false, error: 'Channel not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: channel });
  }

  private async getChannelStatus(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const channel = channelStore.getById(id);
    if (!channel) {
      res.status(404).json({ success: false, error: 'Channel not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({
      success: true,
      data: {
        id: channel.id,
        name: channel.name,
        status: channel.status,
        lastHeartbeat: channel.lastHeartbeat,
        metrics: channel.metrics,
      },
    });
  }

  private async deleteChannel(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const deleted = channelStore.delete(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Channel not found', code: 'NOT_FOUND' });
      return;
    }
    // Cleanup related data
    messageStore.deleteByChannel(id);
    queueStore.deleteByChannel(id);
    res.json({ success: true });
  }

  // ===== MESSAGE METHODS =====
  private async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { id: channelId } = req.params;
      const { target, content, messageType, metadata } = req.body;

      const channel = channelStore.getById(channelId);
      if (!channel || channel.status !== 'connected') {
        res.status(400).json({ success: false, error: 'Channel not connected', code: 'CHANNEL_OFFLINE' });
        return;
      }

      // Create message record
      messageStore.create({
        channelId,
        direction: 'outbound',
        messageType: messageType || 'text',
        content,
        metadata: metadata || {},
        senderId: 'system',
        targetId: target?.id,
        status: 'pending',
      });

      channelStore.incrementMetrics(channelId);

      res.json({
        success: true,
        data: { messageId: uuidv4(), deliveredAt: new Date().toISOString() },
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ success: false, error: err.message, code: 'SEND_FAILED' });
    }
  }

  private async getMessages(req: Request, res: Response): Promise<void> {
    const { id: channelId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const messages = messageStore.listByChannel(channelId, limit, offset);
    res.json({ success: true, data: messages });
  }

  private async sendHeartbeat(req: Request, res: Response): Promise<void> {
    const { id: channelId } = req.params;
    const channel = channelStore.getById(channelId);
    if (!channel) {
      res.status(404).json({ success: false, error: 'Channel not found', code: 'NOT_FOUND' });
      return;
    }
    channelStore.updateLastHeartbeat(channelId);
    res.json({ success: true, data: { status: channel.status } });
  }

  // ===== CHANNEL AUTH (from channel side) =====
  private async registerChannel(req: Request, res: Response): Promise<void> {
    const { channelId, secret } = req.body;
    const channel = channelStore.getBySecret(secret);
    
    if (!channel || channel.id !== channelId) {
      res.status(401).json({ success: false, error: 'Invalid credentials', code: 'UNAUTHORIZED' });
      return;
    }

    channelStore.updateStatus(channelId, 'registered');
    this.options.logger?.info({ event: 'channel_registered', channelId });
    
    res.json({ 
      success: true, 
      data: { 
        channelId: channel.id,
        accessToken: channel.accessToken,
      } 
    });
  }

  private async connectChannel(req: Request, res: Response): Promise<void> {
    const { channelId } = req.body;
    const token = req.headers['x-access-token'] as string;
    
    const channel = channelStore.getByAccessToken(token);
    if (!channel || channel.id !== channelId) {
      res.status(401).json({ success: false, error: 'Invalid token', code: 'UNAUTHORIZED' });
      return;
    }

    channelStore.updateStatus(channelId, 'connected');
    this.options.logger?.info({ event: 'channel_connected', channelId });
    
    res.json({ success: true, data: { status: 'connected' } });
  }

  private async disconnectChannel(req: Request, res: Response): Promise<void> {
    const { channelId } = req.body;
    const token = req.headers['x-access-token'] as string;
    
    const channel = channelStore.getByAccessToken(token);
    if (!channel || channel.id !== channelId) {
      res.status(401).json({ success: false, error: 'Invalid token', code: 'UNAUTHORIZED' });
      return;
    }

    channelStore.updateStatus(channelId, 'disconnected');
    this.options.logger?.info({ event: 'channel_disconnected', channelId });
    
    res.json({ success: true, data: { status: 'disconnected' } });
  }

  // ===== OPENCLAW INTEGRATION =====
  private async forwardToOpenClaw(req: Request, res: Response): Promise<void> {
    const { channelId, messageId, target, content } = req.body;
    
    const token = req.headers['x-channel-token'] as string;
    if (!token) {
      res.status(401).json({ success: false, error: 'Missing channel token', code: 'UNAUTHORIZED' });
      return;
    }

    // Store outbound message
    messageStore.create({
      channelId,
      direction: 'outbound',
      messageType: 'text',
      content,
      metadata: { messageId },
      senderId: 'system',
      targetId: target?.id,
      status: 'sent',
    });

    res.json({ success: true, messageId, deliveredAt: new Date().toISOString() });
  }

  private async handleWebhook(req: Request, res: Response): Promise<void> {
    const channelId = req.headers['x-channel-id'] as string;
    const message = req.body;

    if (!channelId) {
      res.status(400).json({ success: false, error: 'Missing channel ID', code: 'INVALID_REQUEST' });
      return;
    }

    // Store inbound message
    messageStore.create({
      channelId,
      direction: 'inbound',
      messageType: 'text',
      content: JSON.stringify(message),
      metadata: {},
      status: 'delivered',
    });

    res.json({ success: true });
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
