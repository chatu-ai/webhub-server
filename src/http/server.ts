import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { tenantStore, channelStore, messageStore, queueStore } from '../db/index.js';
import { Logger } from 'pino';
import { RequestContext, ApiResponse } from '../db/types.js';

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
    
    // Request ID middleware
    this.app.use((req, res, next) => {
      req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // ===== TENANT MANAGEMENT =====
    this.app.post('/api/admin/tenants', this.createTenant.bind(this));
    this.app.get('/api/admin/tenants', this.listTenants.bind(this));
    this.app.get('/api/admin/tenants/:id', this.getTenant.bind(this));
    this.app.put('/api/admin/tenants/:id', this.updateTenant.bind(this));
    this.app.delete('/api/admin/tenants/:id', this.deleteTenant.bind(this));

    // ===== CHANNEL MANAGEMENT =====
    this.app.post('/api/webhub/tenants/:tenantId/channels', this.createChannel.bind(this));
    this.app.get('/api/webhub/tenants/:tenantId/channels', this.listChannels.bind(this));
    this.app.get('/api/webhub/tenants/:tenantId/channels/:id', this.getChannel.bind(this));
    this.app.get('/api/webhub/tenants/:tenantId/channels/:id/status', this.getChannelStatus.bind(this));
    this.app.delete('/api/webhub/tenants/:tenantId/channels/:id', this.deleteChannel.bind(this));

    // ===== MESSAGE ROUTES =====
    this.app.post('/api/webhub/tenants/:tenantId/channels/:id/messages', this.sendMessage.bind(this));
    this.app.get('/api/webhub/tenants/:tenantId/channels/:id/messages', this.getMessages.bind(this));
    this.app.post('/api/webhub/tenants/:tenantId/channels/:id/heartbeat', this.sendHeartbeat.bind(this));

    // ===== OPENCLAW INTEGRATION =====
    this.app.post('/api/channel/messages', this.forwardToOpenClaw.bind(this));
    this.app.get('/api/channel/status', this.getOpenClawStatus.bind(this));
    this.app.post('/api/channel/verify', this.verifyChannel.bind(this));
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

  // ===== TENANT METHODS =====
  private async createTenant(req: Request, res: Response): Promise<void> {
    try {
      const { name, domain, plan, maxChannels, maxMessagesPerDay } = req.body;

      const tenant = tenantStore.create({
        name,
        domain,
        plan: plan || 'free',
        maxChannels: maxChannels || 10,
        maxMessagesPerDay: maxMessagesPerDay || 1000,
        settings: {},
      });

      this.options.logger?.info({ event: 'tenant_created', tenantId: tenant.id, name });
      res.json({ success: true, data: tenant });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.logger?.error({ event: 'tenant_create_error', error: err.message });
      res.status(500).json({ success: false, error: err.message, code: 'CREATE_FAILED' });
    }
  }

  private async listTenants(req: Request, res: Response): Promise<void> {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const tenants = tenantStore.list(limit, offset);
    res.json({ success: true, data: tenants });
  }

  private async getTenant(req: Request, res: Response): Promise<void> {
    const tenant = tenantStore.getById(req.params.id);
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: tenant });
  }

  private async updateTenant(req: Request, res: Response): Promise<void> {
    try {
      const { name, domain, plan, maxChannels, maxMessagesPerDay, settings } = req.body;
      const tenant = tenantStore.update(req.params.id, {
        name,
        domain,
        plan,
        maxChannels,
        maxMessagesPerDay,
        settings,
      });
      res.json({ success: true, data: tenant });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ success: false, error: err.message, code: 'UPDATE_FAILED' });
    }
  }

  private async deleteTenant(req: Request, res: Response): Promise<void> {
    const deleted = tenantStore.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Tenant not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true });
  }

  // ===== CHANNEL METHODS =====
  private async createChannel(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId } = req.params;
      const { name, serverUrl, description } = req.body;

      // Check channel limit
      const count = channelStore.count(tenantId);
      const tenant = tenantStore.getById(tenantId);
      if (tenant && count >= tenant.maxChannels) {
        res.status(403).json({
          success: false,
          error: 'Channel limit reached',
          code: 'QUOTA_EXCEEDED',
        });
        return;
      }

      const secret = `wh_secret_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
      const accessToken = `wh_${uuidv4().replace(/-/g, '')}`;

      const channel = channelStore.create(tenantId, {
        name,
        serverUrl,
        description,
        status: 'pending',
        secret,
        accessToken,
        config: {},
        metrics: { totalMessages: 0, messagesToday: 0, connections: 0 },
      });

      this.options.logger?.info({ event: 'channel_created', tenantId, channelId: channel.id });
      res.json({
        success: true,
        data: {
          channelId: channel.id,
          channelName: channel.name,
          registerCommand: `/webhub register ${channel.id} ${secret}`,
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
    const { tenantId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const channels = channelStore.list(tenantId, limit, offset);
    res.json({
      success: true,
      data: channels.map(ch => ({
        channelId: ch.id,
        name: ch.name,
        status: ch.status,
        createdAt: ch.createdAt,
      })),
    });
  }

  private async getChannel(req: Request, res: Response): Promise<void> {
    const { tenantId, id } = req.params;
    const channel = channelStore.getById(tenantId, id);
    if (!channel) {
      res.status(404).json({ success: false, error: 'Channel not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: channel });
  }

  private async getChannelStatus(req: Request, res: Response): Promise<void> {
    const { tenantId, id } = req.params;
    const channel = channelStore.getById(tenantId, id);
    if (!channel) {
      res.status(404).json({ success: false, error: 'Channel not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({
      success: true,
      data: {
        channelId: channel.id,
        status: channel.status,
        lastHeartbeat: channel.lastHeartbeat,
        metrics: channel.metrics,
      },
    });
  }

  private async deleteChannel(req: Request, res: Response): Promise<void> {
    const { tenantId, id } = req.params;
    const deleted = channelStore.delete(tenantId, id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Channel not found', code: 'NOT_FOUND' });
      return;
    }
    // Cleanup related data
    messageStore.deleteByChannel(tenantId, id);
    queueStore.deleteByChannel(tenantId, id);
    res.json({ success: true });
  }

  // ===== MESSAGE METHODS =====
  private async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { tenantId, id } = req.params;
      const { target, content, messageType, metadata } = req.body;

      const channel = channelStore.getById(tenantId, id);
      if (!channel || channel.status !== 'connected') {
        res.status(400).json({ success: false, error: 'Channel not connected', code: 'CHANNEL_OFFLINE' });
        return;
      }

      // Create message in queue
      const messageId = uuidv4();
      const queued = queueStore.create(tenantId, {
        channelId: id,
        messageId,
        messageType: messageType || 'text',
        content,
        priority: 0,
        retryCount: 0,
        maxRetries: 3,
        status: 'pending',
      });

      // Create message record
      messageStore.create(tenantId, {
        channelId: id,
        direction: 'outbound',
        messageType: messageType || 'text',
        content,
        metadata: metadata || {},
        senderId: 'system',
        targetId: target,
        status: 'pending',
      });

      channelStore.incrementMetrics(tenantId, id);

      res.json({
        success: true,
        data: { messageId, queuedAt: queued.createdAt },
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ success: false, error: err.message, code: 'SEND_FAILED' });
    }
  }

  private async getMessages(req: Request, res: Response): Promise<void> {
    const { tenantId, id } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const messages = messageStore.listByChannel(tenantId, id, limit, offset);
    res.json({ success: true, data: messages });
  }

  private async sendHeartbeat(req: Request, res: Response): Promise<void> {
    const { tenantId, id } = req.params;
    const channel = channelStore.getById(tenantId, id);
    if (!channel) {
      res.status(404).json({ success: false, error: 'Channel not found', code: 'NOT_FOUND' });
      return;
    }
    channelStore.updateLastHeartbeat(tenantId, id);
    res.json({ success: true, data: { status: channel.status } });
  }

  // ===== OPENCLAW INTEGRATION =====
  private async forwardToOpenClaw(req: Request, res: Response): Promise<void> {
    const { channelId, messageId, target, content } = req.body;
    
    // Get channel by access token from header
    const token = req.headers['x-channel-token'] as string;
    if (!token) {
      res.status(401).json({ success: false, error: 'Missing channel token', code: 'UNAUTHORIZED' });
      return;
    }

    // In production, this would forward to OpenClaw
    res.json({ success: true, messageId, deliveredAt: new Date().toISOString() });
  }

  private async getOpenClawStatus(req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: { status: 'connected', timestamp: new Date().toISOString() } });
  }

  private async verifyChannel(req: Request, res: Response): Promise<void> {
    const { channelId, secret } = req.body;
    // Implementation depends on token validation strategy
    res.json({ success: true, data: { channelId, verified: true } });
  }

  private async handleWebhook(req: Request, res: Response): Promise<void> {
    const tenantId = req.headers['x-tenant-id'] as string;
    const channelId = req.headers['x-channel-id'] as string;
    const message = req.body;

    if (!tenantId || !channelId) {
      res.status(400).json({ success: false, error: 'Missing tenant or channel ID', code: 'INVALID_REQUEST' });
      return;
    }

    // Store inbound message
    messageStore.create(tenantId, {
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
