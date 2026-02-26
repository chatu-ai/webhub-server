import express, { Application, Request, Response, NextFunction } from 'express';
import path from 'path';
import http from 'http';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from 'pino';
import WebSocket, { WebSocketServer } from 'ws';
import { ChannelStore } from '../store/channelStore';
import { MessageRouter } from '../router/messageRouter';
import { messageStore as dbMessageStore, channelStore as dbChannelStoreRaw, reactionStore, readReceiptStore, directoryStore } from '../db/index';
import { sessionCommandStore } from '../db/sessionCommandStore';
import { broadcaster } from '../ws/broadcaster';
import { pluginWsServer } from '../ws/pluginWsServer';
import { upload, handleUpload, handleUploadError } from './upload';
import { sseManager } from './sseManager';
import sseRouter from '../router/sseRouter';
import localFileRouter from './localFileRouter';
import { transformLocalPaths } from '../utils/contentTransformer';
import { makeCrossChannelHandler } from './crossChannelHandler';
import authRouter from './authRouter';
import { authMiddleware } from '../middleware/authMiddleware';

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
  private wsServer: WebSocketServer | null = null;
  private channelStore: ChannelStore;
  /** T015: last plugin version reported via POST /api/channel/connect */
  private pluginVersion: string | null = null;
  /** ID of the channel currently connected by the openclaw plugin (null when disconnected) */
  private connectedChannelId: string | null = null;

  /** T022 Plugin-Channel Realtime: in-memory rate-limit map for quick-register endpoint.
   *  Maps IP -> array of request timestamps (ms). */
  private quickRegRateMap: Map<string, number[]> = new Map();

  constructor(options: WebHubServerOptions) {
    this.options = options;

    if (options.channelStore) {
      this.channelStore = options.channelStore;
    } else {
      const { channelStore: dbChannelStore } = require('../db/index');
      // Wrap synchronous db store in async-compatible interface.
      // NOTE: src/types Channel uses `serverUrl`; src/db/types Channel uses `webhubUrl`.
      // The adapter translates between the two and injects default config/metrics.
      this.channelStore = {
        create: (data: Parameters<ChannelStore['create']>[0]) => {
          const dbData = {
            ...data,
            webhubUrl: (data as any).serverUrl ?? (data as any).webhubUrl ?? '',
            config: (data as any).config ?? {},
            metrics: (data as any).metrics ?? {
              totalMessages: 0, messagesToday: 0, connections: 0,
            },
          };
          const result = dbChannelStore.create(dbData);
          // Normalise back to store Channel shape (serverUrl)
          return Promise.resolve({ ...result, serverUrl: result.webhubUrl ?? result.serverUrl });
        },
        getById: (id: string) => {
          const r = dbChannelStore.getById(id);
          return Promise.resolve(r ? { ...r, serverUrl: r.webhubUrl ?? r.serverUrl } : null);
        },
        getBySecret: (secret: string) => {
          const r = dbChannelStore.getBySecret(secret);
          return Promise.resolve(r ? { ...r, serverUrl: r.webhubUrl ?? r.serverUrl } : null);
        },
        getByAccessToken: (token: string) => {
          const r = dbChannelStore.getByAccessToken(token);
          return Promise.resolve(r ? { ...r, serverUrl: r.webhubUrl ?? r.serverUrl } : null);
        },
        updateStatus: (id: string, status: Parameters<ChannelStore['updateStatus']>[1]) => {
          const r = dbChannelStore.updateStatus(id, status);
          return Promise.resolve(r ? { ...r, serverUrl: r.webhubUrl ?? r.serverUrl } : null);
        },
        updateLastHeartbeat: (id: string) => {
          dbChannelStore.updateLastHeartbeat(id);
          const r = dbChannelStore.getById(id);
          return Promise.resolve(r ? { ...r, serverUrl: r.webhubUrl ?? r.serverUrl } : null);
        },
        delete: (id: string) => {
          const r = dbChannelStore.delete(id);
          return Promise.resolve(typeof r === 'boolean' ? r : true);
        },
        list: () => {
          const rows = dbChannelStore.list();
          return Promise.resolve(rows.map((r: any) => ({ ...r, serverUrl: r.webhubUrl ?? r.serverUrl })));
        },
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
    // Serve uploaded files statically
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'data/uploads');
    this.app.use('/uploads', express.static(uploadDir));
  }

  private setupRoutes(): void {
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Auth routes (public — must be mounted BEFORE the authMiddleware layer)
    this.app.use('/api/webhub/auth', authRouter);

    // Protect all /api/webhub/* routes (except /auth/* which are already handled above)
    this.app.use('/api/webhub', authMiddleware);

    // Channel Management
    this.app.post('/api/webhub/channels/apply', this.applyChannel.bind(this));
    // T026: Simplified key+url channel registration (must precede /:id routes)
    this.app.post('/api/webhub/channels', this.registerChannelByKey.bind(this));
    this.app.get('/api/webhub/channels', this.listChannels.bind(this));
    this.app.get('/api/webhub/channels/:id', this.getChannel.bind(this));
    this.app.get('/api/webhub/channels/:id/status', this.getChannelStatus.bind(this));
    this.app.delete('/api/webhub/channels/:id', this.deleteChannel.bind(this));

    // Message Routes
    this.app.post('/api/webhub/channels/:id/messages', this.sendMessage.bind(this));
    this.app.get('/api/webhub/channels/:id/messages', this.getMessages.bind(this));
    this.app.post('/api/webhub/channels/:id/heartbeat', this.sendHeartbeat.bind(this));

    // P4: File upload (T027: 10 MB limit enforced in upload.ts; multer errors caught via callback)
    this.app.post('/api/webhub/channels/:id/upload', (req: Request, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, (err: any) => {
        if (err) return handleUploadError(err, req, res, next);
        handleUpload(req, res);
      });
    });

    // P4: Message search (must be before /:msgId routes)
    this.app.get('/api/webhub/channels/:id/messages/search', this.searchMessages.bind(this));

    // P4: Per-message operations
    this.app.get('/api/webhub/channels/:id/messages/:msgId/stream', this.streamMessage.bind(this));
    this.app.patch('/api/webhub/channels/:id/messages/:msgId', this.editMessage.bind(this));
    this.app.delete('/api/webhub/channels/:id/messages/:msgId', this.deleteMessage.bind(this));

    // P4: Reactions
    this.app.post('/api/webhub/channels/:id/messages/:msgId/reactions/:emoji', this.addReaction.bind(this));
    this.app.delete('/api/webhub/channels/:id/messages/:msgId/reactions/:emoji', this.removeReaction.bind(this));

    // P4: Read receipts
    this.app.post('/api/webhub/channels/:id/messages/:msgId/read', this.markRead.bind(this));

    // P4: Directory
    this.app.get('/api/webhub/channels/:id/directory', this.listDirectory.bind(this));

    // Channel Auth
    this.app.post('/api/channel/register', this.registerChannel.bind(this));
    this.app.post('/api/channel/verify', this.verifyChannel.bind(this));
    this.app.post('/api/channel/connect', this.connectChannel.bind(this));
    this.app.post('/api/channel/disconnect', this.disconnectChannel.bind(this));
    this.app.get('/api/channel/status', this.getOpenClawStatus.bind(this));
    // T022 Plugin-Channel Realtime: 2-step quick registration (key + url → credentials)
    this.app.post('/api/channel/quick-register', this.quickRegisterChannel.bind(this));
    // P4: Typing indicator
    this.app.post('/api/channel/typing', this.handleTyping.bind(this));
    this.app.post('/api/webhub/channel/typing', this.handleTyping.bind(this));
    this.app.post('/api/channel/messages', this.forwardToOpenClaw.bind(this));
    this.app.get('/api/channel/messages/pending', this.getPendingMessages.bind(this));
    this.app.post('/api/channel/messages/:id/ack', this.ackMessage.bind(this));

    // T016 Plugin-Channel SSE: streaming chunk relay endpoints (plugin → API → SSE)
    this.app.post('/api/channel/stream/chunk', this.handleStreamChunk.bind(this));
    this.app.post('/api/channel/stream/done', this.handleStreamDone.bind(this));

    // US3: Cross-channel relay (TUI, WhatsApp, Telegram → ChatU frontend)
    this.app.post('/api/channel/cross-channel-messages', makeCrossChannelHandler(this.channelStore, this.options.logger));

    // T021 Plugin-Channel SSE: mount SSE event-stream router
    this.app.use(sseRouter);

    // T008/T009 Local file access: serve validated local files
    this.app.use('/api/webhub', localFileRouter);

    // T008-T010 display-sender-session: session reset & command relay
    this.app.post('/api/webhub/channels/:channelId/sessions/reset', this.resetSession.bind(this));
    this.app.get('/api/channel/commands', this.getPendingCommands.bind(this));
    this.app.post('/api/channel/commands/:commandId/ack', this.ackCommand.bind(this));

    // Commands catalogue (slash-command intellisense)
    this.app.get('/api/webhub/commands', this.listCommands.bind(this));

    // T017-T018 display-sender-session: session list & switch
    this.app.get('/api/webhub/channels/:channelId/sessions', this.listSessions.bind(this));
    this.app.post('/api/webhub/channels/:channelId/sessions/switch', this.switchSession.bind(this));

    // T011: register handleWebhook route (BUG-02 fix)
    this.app.post('/api/webhooks/:channelId', this.handleWebhook.bind(this));

    // T014: version endpoint
    this.app.get('/api/channel/version', this.getChannelVersion.bind(this));
    this.app.get('/api/channel/active', this.getActiveChannel.bind(this));
    this.app.get('/api/webhub/channel/active', this.getActiveChannel.bind(this));

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

      // T032: Notify all SSE clients that the channel list changed
      sseManager.broadcastChannelListChanged('created', channel.id);

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

  /**
   * T026: POST /api/webhub/channels — simplified key+URL channel registration.
   * Accepts { key, url, mode? }; validates key format and URL; enforces key uniqueness.
   * Returns 201 { channelId, key, accessToken } on success.
   */
  private async registerChannelByKey(req: Request, res: Response): Promise<void> {
    try {
      const { key, url, mode } = req.body as { key?: string; url?: string; mode?: string };

      const keyRegex = /^[a-zA-Z0-9_-]{1,64}$/;
      if (!key || !keyRegex.test(key)) {
        res.status(400).json({ error: 'INVALID_KEY', message: 'key must match ^[a-zA-Z0-9_-]{1,64}$' });
        return;
      }

      try {
        const parsed = new URL(url ?? '');
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
      } catch {
        res.status(400).json({ error: 'INVALID_URL', message: 'url must be a valid http/https URL' });
        return;
      }

      // Key uniqueness check via the raw db store (has getByKey() from T006)
      const existing = dbChannelStoreRaw.getByKey(key);
      if (existing) {
        res.status(409).json({ error: 'KEY_ALREADY_EXISTS' });
        return;
      }

      const accessToken = `wh_${uuidv4().replace(/-/g, '')}`;
      const secret = `wh_secret_${uuidv4().replace(/-/g, '').substring(0, 16)}`;

      // Use the DB store directly so getByKey() / setKey() operate on the same DB row.
      const channel = dbChannelStoreRaw.create({
        name: key,
        webhubUrl: url!,
        description: mode ?? 'user',
        mode: mode ?? 'user',
        status: 'pending',
        secret,
        accessToken,
        config: {},
        metrics: { totalMessages: 0, messagesToday: 0, connections: 0 },
      });

      // Persist key on the db channel row (T026/T006)
      dbChannelStoreRaw.setKey(channel.id, key);

      this.options.logger?.info({ event: 'channel_registered_by_key', channelId: channel.id, key });

      // T032: Notify all SSE clients that the channel list changed
      sseManager.broadcastChannelListChanged('created', channel.id);

      res.status(201).json({ channelId: channel.id, key, accessToken });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.logger?.error({ event: 'channel_register_key_error', error: err.message });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
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
        accessToken: ch.accessToken,
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
        accessToken: channel.accessToken,
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
    // Read fresh metrics from db layer
    const dbChannel = dbChannelStoreRaw.getById(id);
    res.json({
      success: true,
      data: {
        id: channel.id,
        name: channel.name,
        status: channel.status,
        lastHeartbeat: channel.lastHeartbeat,
        metrics: dbChannel?.metrics ?? null,
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
    // T032: Notify all SSE clients that the channel list changed
    sseManager.broadcastChannelListChanged('deleted', id);
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

      const { target, content, messageType, metadata } = req.body;

      // Determine message type from media
      let msgType: 'text' | 'image' | 'audio' | 'video' | 'file' | 'system' = messageType || 'text';
      if (metadata?.media && metadata.media.length > 0) {
        const mt = metadata.media[0]?.type;
        if (mt === 'image' || mt === 'audio' || mt === 'video' || mt === 'file') {
          msgType = mt;
        }
      }

      // Persist outbound message (sent by frontend/admin)
      const stored = dbMessageStore.create({
        channelId,
        direction: 'outbound',
        messageType: msgType,
        content: content?.text || '',
        metadata: { target, media: metadata?.media, ...metadata },
        sender: { id: 'webhub' },
        replyTo: metadata?.replyTo && typeof metadata.replyTo === 'object' ? metadata.replyTo as { id: string; quoteText?: string } : undefined,
        targetId: target?.id,
        role: 'agent',
        status: 'sent',
      });

      dbChannelStoreRaw.incrementMetrics(channelId);
      this.options.logger?.info({ event: 'message_sent', channelId, messageId: stored.id });

      // Phase 11 T046: push agent message down the plugin WS so OpenClaw sees it
      pluginWsServer.pushToChannel(channelId, {
        type: 'message',
        channelId,
        timestamp: Date.now(),
        payload: {
          id: stored.id,
          role: 'agent',
          content: { text: stored.content },
          sender: { id: 'webhub', displayName: 'Agent' },
          timestamp: Date.now(),
          metadata: stored.metadata,
        },
      });

      // Also broadcast to frontend WS subscribers so other tabs/users see it
      broadcaster.broadcast(channelId, { type: 'message', data: stored });

      res.json({
        success: true,
        data: { messageId: stored.id, deliveredAt: stored.createdAt },
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
    const limit = parseInt(req.query.limit as string || '50', 10);
    const offset = parseInt(req.query.offset as string || '0', 10);
    const threadId = req.query.threadId as string | undefined;
    const messages = dbMessageStore.listByChannel(channelId, limit, offset, threadId);
    res.json({
      success: true,
      data: messages.map(m => ({
        id: m.id,
        channelId: m.channelId,
        direction: m.direction,          // 'inbound' = 插件推送的用户消息; 'outbound' = 前端/系统发出
        messageType: m.messageType,
        content: m.content,
        metadata: m.metadata,
        sender: m.sender,               // { id, name?, avatar? }
        targetId: m.targetId,
        replyTo: m.replyTo,
        role: m.role ?? 'visitor',       // Phase 11 T046: role field
        status: m.status,
        createdAt: m.createdAt,
      })),
    });
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

  /**
   * T022 Plugin-Channel Realtime: POST /api/channel/quick-register
   * Accepts { key, url, mode? } — automatically creates/retrieves a channel.
   * No pre-existing channelId or secret required (2-step setup).
   *
   * Responses:
   *   200 OK              – key already registered, returning existing credentials (idempotent)
   *   201 Created         – new channel created
   *   400 Bad Request     – missing key or url
   *   409 Conflict        – key registered with a different url
   *   422 Unprocessable   – url format invalid
   *   429 Too Many Requests – rate limit exceeded (10 req/min per IP)
   */
  private async quickRegisterChannel(req: Request, res: Response): Promise<void> {
    // ── Rate limit (10 req/min per IP) ──────────────────────────────────────
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || 'unknown';

    const now = Date.now();
    const windowMs = 60_000;
    const maxRequests = 10;

    const ipTimes = (this.quickRegRateMap.get(ip) ?? []).filter(t => now - t < windowMs);

    if (ipTimes.length >= maxRequests) {
      const oldest = ipTimes[0];
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
        retryAfter,
      });
      return;
    }

    ipTimes.push(now);
    this.quickRegRateMap.set(ip, ipTimes);

    // ── Input validation ─────────────────────────────────────────────────────
    const { key, url, mode } = req.body as { key?: string; url?: string; mode?: string };

    if (!key || !url) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: key, url',
        code: 'MISSING_FIELDS',
      });
      return;
    }

    try {
      new URL(url); // validates URL format
    } catch {
      res.status(422).json({
        success: false,
        error: 'Invalid url format',
        code: 'INVALID_URL',
      });
      return;
    }

    // ── Upsert channel ───────────────────────────────────────────────────────
    const existing = await this.channelStore.getBySecret(key);

    if (existing) {
      // Key already registered — check URL conflict
      if (existing.serverUrl && existing.serverUrl !== url) {
        res.status(409).json({
          success: false,
          error: 'Key already registered with a different url',
          code: 'KEY_CONFLICT',
        });
        return;
      }
      // Idempotent: return existing credentials
      res.status(200).json({
        success: true,
        data: {
          channelId: existing.id,
          accessToken: existing.accessToken,
        },
      });
      return;
    }

    // Create new channel
    const channelName = 'channel-' + key.slice(0, 8);
    const newChannel = await this.channelStore.create({
      name: channelName,
      serverUrl: url,
      description: 'Quick-registered via /api/channel/quick-register',
      status: 'registered',
      secret: key,
      accessToken: uuidv4(),
      mode: mode ?? 'user',
    });

    this.options.logger?.info({
      event: 'channel_quick_registered',
      channelId: newChannel.id,
      name: channelName,
      ip,
    });

    // T032: Notify all SSE clients
    sseManager.broadcastChannelListChanged('created', newChannel.id);

    res.status(201).json({
      success: true,
      data: {
        channelId: newChannel.id,
        accessToken: newChannel.accessToken,
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
    const { channelId, pluginVersion, workingDir } = req.body;
    const token = req.headers['x-access-token'] as string;

    const channel = await this.channelStore.getByAccessToken(token);
    if (!channel || channel.id !== channelId) {
      res.status(401).json({ success: false, error: 'Invalid token', code: 'UNAUTHORIZED' });
      return;
    }

    // T015: capture optional plugin version reported by the plugin
    if (typeof pluginVersion === 'string' && pluginVersion) {
      this.pluginVersion = pluginVersion;
    }

    // 001-local-file-access: persist the plugin's working directory for per-channel file serving
    if (typeof workingDir === 'string' && workingDir) {
      dbChannelStoreRaw.updateWorkingDir(channelId, workingDir);
    }

    await this.channelStore.updateStatus(channelId, 'connected');
    this.connectedChannelId = channelId;
    this.options.logger?.info({ event: 'channel_connected', channelId, pluginVersion: this.pluginVersion });
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
    if (this.connectedChannelId === channelId) this.connectedChannelId = null;
    this.options.logger?.info({ event: 'channel_disconnected', channelId });
    res.json({ success: true, data: { status: 'disconnected' } });
  }

  /** Return the channelId currently connected by the plugin (null when none) */
  private getActiveChannel(_req: Request, res: Response): void {
    res.json({ success: true, data: { channelId: this.connectedChannelId } });
  }

  /** T007: return real channel status from DB instead of hardcoded 'connected' (BUG-01 fix) */
  private async getOpenClawStatus(req: Request, res: Response): Promise<void> {
    const channelId = req.headers['x-channel-id'] as string | undefined;
    if (channelId) {
      const ch = await this.channelStore.getById(channelId);
      if (ch) {
        res.json({
          success: true,
          data: {
            status: ch.status,
            channelId: ch.id,
            lastHeartbeat: ch.lastHeartbeat ?? null,
          },
        });
        return;
      }
    }
    // No channelId provided — return generic service status
    res.json({
      success: true,
      data: {
        status: 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
  }

  /** T014: version endpoint — returns service + optional plugin version (FR-006) */
  private async getChannelVersion(_req: Request, res: Response): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../package.json') as { version: string };
    res.json({
      success: true,
      data: {
        serviceVersion: pkg.version,
        buildTime: process.env.BUILD_TIME ?? null,
        nodeVersion: process.versions.node,
        pluginVersion: this.pluginVersion,
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
      const body = req.body;

      // Determine message type from media
      let messageType: 'text' | 'image' | 'audio' | 'video' | 'file' | 'system' | 'richCard' | 'poll' = 'text';
      if (body.messageType && body.messageType !== 'text') {
        messageType = body.messageType;
      } else if (body.media && body.media.length > 0) {
        const mt = body.media[0]?.type;
        if (mt === 'image' || mt === 'audio' || mt === 'video' || mt === 'file') {
          messageType = mt;
        }
      }

      // Persist message to database (T009: transform local file paths to webhub URLs)
      const transformedContent = transformLocalPaths(body.content?.text || '', channelId);

      // Dedup: if a dedupId is present and a message with the same dedupId was
      // already stored via the relay path, skip this write.
      // dedupId is the OpenClaw internal msg.id set by the plugin's before_message_write hook.
      const dedupId = body.metadata?.dedupId as string | undefined;
      if (dedupId) {
        const dedupNow = new Date();
        const dedupCutoff = new Date(dedupNow.getTime() - 30_000);
        const recentMsgs = dbMessageStore.listByDateRange(channelId, dedupCutoff, dedupNow, 20);
        const alreadyStored = recentMsgs.some(
          (m) => (m.metadata as Record<string, unknown>)?.dedupId === dedupId,
        );
        if (alreadyStored) {
          this.options.logger?.info({ event: 'message_dedup_skip', channelId, msgId, dedupId });
          res.json({ success: true, messageId: msgId, deliveredAt: dedupNow.toISOString() });
          return;
        }
      }

      const stored = dbMessageStore.create({
        channelId,
        direction: 'inbound',
        messageType,
        content: transformedContent,
        metadata: {
          target: body.target,
          media: body.media,
          replyTo: body.replyTo,
          ...(body.metadata ?? {}),
          ...(body.raw !== undefined ? { raw: body.raw } : {}),
        },
        targetId: body.target?.id,
        role: (body.role as 'visitor' | 'agent' | 'ai' | undefined) ?? 'ai', // Phase 11 T047
        status: 'sent',
      });

      // Notify WebSocket subscribers of new message
      broadcaster.broadcast(channelId, { type: 'message', data: stored });

      // Update channel metrics
      dbChannelStoreRaw.incrementMetrics(channelId);

      this.options.logger?.info({ event: 'message_stored', channelId, msgId, messageType });

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
      // T011: channelId from URL param (primary) or header (fallback for backward compat)
      const channelId = (req.params.channelId as string | undefined) || (req.headers['x-channel-id'] as string);
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

      // Determine message type
      let messageType: 'text' | 'image' | 'audio' | 'video' | 'file' | 'system' = 'text';
      if (message.media && message.media.length > 0) {
        const mt = message.media[0]?.type;
        if (mt === 'image' || mt === 'audio' || mt === 'video' || mt === 'file') {
          messageType = mt;
        }
      }

      // Parse inbound replyTo — may be a string (legacy) or {id, quoteText?} object
      let inboundReplyTo: { id: string; quoteText?: string } | undefined;
      if (message.replyTo) {
        if (typeof message.replyTo === 'string') {
          inboundReplyTo = { id: message.replyTo };
        } else if (typeof message.replyTo === 'object' && message.replyTo.id) {
          inboundReplyTo = message.replyTo as { id: string; quoteText?: string };
        }
      }

      // Persist inbound message (from user via webhub plugin)
      const stored = dbMessageStore.create({
        channelId,
        direction: 'inbound',
        messageType,
        content: message.content?.text || message.text || '',
        metadata: {
          messageId: message.messageId || message.id,
          timestamp: message.timestamp || Date.now(),
          media: message.media,
        },
        sender: {
          id: message.sender?.id || message.from?.id || 'unknown',
          name: message.sender?.name || message.from?.name,
        },
        replyTo: inboundReplyTo,
        targetId: message.target?.id,
        status: 'delivered',
      });

      dbChannelStoreRaw.incrementMetrics(channelId);

      // Notify WebSocket subscribers of new webhook message
      broadcaster.broadcast(channelId, { type: 'message', data: stored });

      this.options.logger?.info({
        event: 'webhook_received',
        channelId,
        messageId: stored.id,
        senderId: stored.sender?.id,
      });

      res.json({
        success: true,
        id: stored.id,
        receivedAt: stored.createdAt,
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ success: false, error: err.message, code: 'WEBHOOK_FAILED' });
    }
  }

  private async getPendingMessages(req: Request, res: Response): Promise<void> {
    try {
      const token = req.headers['x-channel-token'] as string;
      const channelId = req.query['channelId'] as string;
      const after = (req.query['after'] as string) || null;
      const limit = Math.min(parseInt((req.query['limit'] as string) || '20', 10), 100);

      if (!token) {
        res.status(401).json({ success: false, error: 'Missing channel token', code: 'UNAUTHORIZED' });
        return;
      }
      if (!channelId) {
        res.status(400).json({ success: false, error: 'Missing channelId', code: 'INVALID_REQUEST' });
        return;
      }

      const channel = await this.channelStore.getById(channelId);
      if (!channel || channel.accessToken !== token) {
        res.status(401).json({ success: false, error: 'Invalid token', code: 'UNAUTHORIZED' });
        return;
      }

      const messages = dbMessageStore.listPendingUserMessages(channelId, after, limit);
      res.json({ success: true, data: messages });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ success: false, error: err.message, code: 'INTERNAL_ERROR' });
    }
  }

  private async ackMessage(req: Request, res: Response): Promise<void> {
    try {
      const token = req.headers['x-channel-token'] as string;
      const channelId = req.headers['x-channel-id'] as string;
      const { id } = req.params;

      if (!token) {
        res.status(401).json({ success: false, error: 'Missing channel token', code: 'UNAUTHORIZED' });
        return;
      }

      if (channelId) {
        const channel = await this.channelStore.getById(channelId);
        if (!channel || channel.accessToken !== token) {
          res.status(401).json({ success: false, error: 'Invalid token', code: 'UNAUTHORIZED' });
          return;
        }
      }

      dbMessageStore.markProcessed(id);
      res.json({ success: true });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ success: false, error: err.message, code: 'INTERNAL_ERROR' });
    }
  }

  // P4 — Search messages by content
  private async searchMessages(req: Request, res: Response): Promise<void> {
    const { id: channelId } = req.params;
    const q = (req.query.q as string || '').trim();
    const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 100);
    const after = req.query.after as string | undefined;
    if (!q) {
      res.status(400).json({ success: false, error: 'q parameter is required' });
      return;
    }
    const results = dbMessageStore.search(channelId, q, limit, after);
    res.json({ success: true, data: results });
  }

  // P4 — SSE stream for a single message (streaming AI reply)
  private async streamMessage(req: Request, res: Response): Promise<void> {
    const { id: channelId, msgId } = req.params;
    const msg = dbMessageStore.getById(msgId);
    if (!msg || msg.channelId !== channelId) {
      res.status(404).json({ success: false, error: 'Message not found' });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    // Deliver current content as a single chunk (already complete)
    const chunk = JSON.stringify({ chunk: msg.content, done: true });
    res.write(`data: ${chunk}\n\n`);
    res.end();
  }

  // P4 — Edit message content (sender.id auth)
  private async editMessage(req: Request, res: Response): Promise<void> {
    const { id: channelId, msgId } = req.params;
    const { content, sender } = req.body;
    const senderId = sender?.id;
    if (!content || !senderId) {
      res.status(400).json({ success: false, error: 'content and sender.id are required' });
      return;
    }
    const updated = dbMessageStore.updateContent(msgId, content, senderId);
    if (!updated) {
      // Could be not found or sender.id mismatch
      const existing = dbMessageStore.getById(msgId);
      if (!existing || existing.channelId !== channelId) {
        res.status(404).json({ success: false, error: 'Message not found' });
      } else {
        res.status(403).json({ success: false, error: 'Forbidden: sender.id does not match' });
      }
      return;
    }
    broadcaster.broadcast(channelId, { type: 'message_updated', data: updated });
    res.json({ success: true, data: updated });
  }

  // P4 — Soft-delete message (admin or sender)
  private async deleteMessage(req: Request, res: Response): Promise<void> {
    const { id: channelId, msgId } = req.params;
    // Accept sender.id (new) or senderId (legacy query param for CLI tools)
    const requesterId = (req.body?.sender?.id as string) || (req.query.senderId as string) || (req.body?.senderId as string) || '';
    const providedToken = (req.headers.authorization?.replace('Bearer ', '') || '') as string;

    const channel = await this.channelStore.getById(channelId);
    const channelAccessToken = channel?.accessToken || null;

    const ok = dbMessageStore.softDelete(msgId, requesterId, providedToken || null, channelAccessToken);
    if (!ok) {
      const existing = dbMessageStore.getById(msgId);
      if (!existing || existing.channelId !== channelId) {
        res.status(404).json({ success: false, error: 'Message not found' });
      } else {
        res.status(403).json({ success: false, error: 'Forbidden' });
      }
      return;
    }
    const updated = dbMessageStore.getById(msgId);
    broadcaster.broadcast(channelId, { type: 'message_updated', data: updated });
    res.json({ success: true });
  }

  // P4 — Add reaction
  private async addReaction(req: Request, res: Response): Promise<void> {
    const { id: channelId, msgId, emoji } = req.params;
    const userId = (req.query.userId as string) || (req.body?.userId as string);
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }
    const reaction = reactionStore.add(channelId, msgId, emoji, userId);
    broadcaster.broadcast(channelId, { type: 'reaction_added', data: reaction });
    res.json({ success: true, data: reaction });
  }

  // P4 — Remove reaction
  private async removeReaction(req: Request, res: Response): Promise<void> {
    const { id: channelId, msgId, emoji } = req.params;
    const userId = (req.query.userId as string) || (req.body?.userId as string);
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }
    reactionStore.remove(msgId, emoji, userId);
    broadcaster.broadcast(channelId, { type: 'reaction_removed', data: { messageId: msgId, emoji, userId, channelId } });
    res.json({ success: true });
  }

  // P4 — Mark message as read (read receipt)
  private async markRead(req: Request, res: Response): Promise<void> {
    const { id: channelId, msgId } = req.params;
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }
    const receipt = readReceiptStore.markRead(msgId, channelId, userId);
    broadcaster.broadcast(channelId, { type: 'read', data: { messageId: msgId, userId, ts: receipt.ts } });
    res.json({ success: true, data: receipt });
  }

  // P4 — List directory entries (participants)
  private async listDirectory(req: Request, res: Response): Promise<void> {
    const { id: channelId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
    const after = req.query.after as string | undefined;
    const entries = directoryStore.list(channelId, limit, after);
    res.json({ success: true, data: entries });
  }

  // P4 — Plugin typing indicator
  private async handleTyping(req: Request, res: Response): Promise<void> {
    const { channelId, username } = req.body;
    if (!channelId || !username) {
      res.status(400).json({ success: false, error: 'channelId and username are required' });
      return;
    }

    // /api/webhub/channel/typing is already protected by authMiddleware (JWT).
    // /api/channel/typing is the plugin-facing route and authenticates via channel access token.
    const isAdminRoute = req.path === '/api/webhub/channel/typing' || req.originalUrl.startsWith('/api/webhub/');
    if (!isAdminRoute) {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '').trim();
      if (token) {
        const channel = await this.channelStore.getById(channelId);
        if (!channel || channel.accessToken !== token) {
          res.status(401).json({ success: false, error: 'Unauthorized' });
          return;
        }
      }
    }

    const ts = Date.now();
    broadcaster.broadcast(channelId, { type: 'typing', data: { channelId, username, ts } });
    res.json({ success: true });
  }

  // ── T016: AI Streaming chunk relay ─────────────────────────────────────────
  /** In-memory buffer: messageId → { channelId, chunks: Map<seq, delta> } */
  private streamChunkBuffer: Map<string, { channelId: string; chunks: Map<number, string>; startedAt: number }> = new Map();

  /** POST /api/channel/stream/chunk  — plugin sends a delta chunk for an AI reply */
  private async handleStreamChunk(req: Request, res: Response): Promise<void> {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) { res.status(401).json({ error: 'MISSING_TOKEN' }); return; }

    const channel = await this.channelStore.getByAccessToken(token);
    if (!channel) { res.status(401).json({ error: 'INVALID_TOKEN' }); return; }

    const { messageId, seq, delta } = req.body as { messageId?: string; seq?: number; delta?: string };
    if (!messageId || seq === undefined || delta === undefined) {
      res.status(400).json({ error: 'MISSING_FIELDS', required: ['messageId', 'seq', 'delta'] });
      return;
    }

    // Store in buffer
    if (!this.streamChunkBuffer.has(messageId)) {
      this.streamChunkBuffer.set(messageId, { channelId: channel.id, chunks: new Map(), startedAt: Date.now() });
    }
    const buf = this.streamChunkBuffer.get(messageId)!;
    buf.chunks.set(seq, delta);

    // Broadcast SSE event:chunk to frontend
    const chunkPayload = { messageId, seq, delta };
    sseManager.broadcast(channel.id, 'chunk', chunkPayload, messageId);

    res.status(200).json({ ok: true });
  }

  /** POST /api/channel/stream/done  — plugin signals streaming completion */
  private async handleStreamDone(req: Request, res: Response): Promise<void> {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) { res.status(401).json({ error: 'MISSING_TOKEN' }); return; }

    const channel = await this.channelStore.getByAccessToken(token);
    if (!channel) { res.status(401).json({ error: 'INVALID_TOKEN' }); return; }

    const { messageId, totalSeq } = req.body as { messageId?: string; totalSeq?: number };
    if (!messageId || totalSeq === undefined) {
      res.status(400).json({ error: 'MISSING_FIELDS', required: ['messageId', 'totalSeq'] });
      return;
    }

    // Retrieve buffer and assemble full content
    const buf = this.streamChunkBuffer.get(messageId);
    let fullContent = '';
    if (buf) {
      const seqKeys = Array.from(buf.chunks.keys()).sort((a, b) => a - b);
      fullContent = seqKeys.map((k) => buf.chunks.get(k)).join('');
      this.streamChunkBuffer.delete(messageId);
    }

    // Persist the assembled AI message to DB
    try {
      dbMessageStore.create({
        channelId: channel.id,
        direction: 'inbound',
        messageType: 'text',
        content: fullContent,
        metadata: { streaming: true, sourceMessageId: messageId },
        role: 'ai',
        streamingState: 'complete',
        status: 'delivered',
      });
    } catch (err) {
      this.options.logger?.warn(
        { event: 'stream_done_db_error', messageId, error: String(err) },
        'Failed to persist streaming message',
      );
    }

    // Broadcast SSE event:done — frontend uses this to finalise the streaming bubble
    sseManager.broadcast(channel.id, 'done', { messageId, totalSeq, content: fullContent });

    res.status(200).json({ ok: true });
  }

  // ── Commands catalogue: GET /api/webhub/commands ──────────────────────────

  private listCommands(_req: Request, res: Response): void {
    /** Slash-command catalogue sourced from OpenClaw ACP commands list (read-only research). */
    const commands: Array<{ name: string; description: string; inputHint?: string }> = [
      { name: 'help',       description: 'Show help and common commands.' },
      { name: 'commands',   description: 'List available commands.' },
      { name: 'status',     description: 'Show current status.' },
      { name: 'context',    description: 'Explain context usage (list|detail|json).', inputHint: 'list | detail | json' },
      { name: 'whoami',     description: 'Show sender id (alias: /id).' },
      { name: 'id',         description: 'Alias for /whoami.' },
      { name: 'stop',       description: 'Stop the current run.' },
      { name: 'reset',      description: 'Reset the session (/new).' },
      { name: 'new',        description: 'Reset the session (/reset).' },
      { name: 'model',      description: 'Select a model (list|status|<name>).', inputHint: 'list | status | <name>' },
      { name: 'think',      description: 'Set thinking level (off|minimal|low|medium|high|xhigh).', inputHint: 'off | minimal | low | medium | high | xhigh' },
      { name: 'verbose',    description: 'Set verbose mode (on|full|off).', inputHint: 'on | full | off' },
      { name: 'reasoning',  description: 'Toggle reasoning output (on|off|stream).', inputHint: 'on | off | stream' },
      { name: 'usage',      description: 'Toggle usage footer (off|tokens|full).', inputHint: 'off | tokens | full' },
      { name: 'config',     description: 'Read or write config (owner-only).' },
      { name: 'debug',      description: 'Set runtime-only overrides (owner-only).' },
      { name: 'compact',    description: 'Compact the session history.' },
      { name: 'elevated',   description: 'Toggle elevated mode (on|off).', inputHint: 'on | off' },
      { name: 'subagents',  description: 'List or manage sub-agents.' },
      { name: 'queue',      description: 'Adjust queue mode and options.' },
      { name: 'send',       description: 'Set send mode (on|off|inherit).', inputHint: 'on | off | inherit' },
      { name: 'activation', description: 'Set group activation (mention|always).', inputHint: 'mention | always' },
    ];
    res.json({ success: true, data: commands });
  }

  // ── T008 display-sender-session: POST /api/webhub/channels/:channelId/sessions/reset ──

  private async resetSession(req: Request, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;
      const { senderId, reason } = req.body as { senderId?: string; reason?: string };

      if (!senderId) {
        res.status(400).json({ success: false, error: 'senderId is required', code: 'INVALID_REQUEST' });
        return;
      }

      const channel = await this.channelStore.getById(channelId);
      if (!channel) {
        res.status(404).json({ success: false, error: 'Channel not found', code: 'CHANNEL_NOT_FOUND' });
        return;
      }

      // authMiddleware already validated the admin JWT; no second token check needed.

      // 409 dedup: don't queue another reset if one is already pending for this sender
      if (sessionCommandStore.hasPending(channelId, senderId)) {
        res.status(409).json({ success: false, error: 'A session reset is already pending', code: 'CONFLICT' });
        return;
      }

      const cmd = sessionCommandStore.enqueue(channelId, senderId, 'reset', reason ? { reason } : undefined);
      this.options.logger?.info({ event: 'session_reset_queued', channelId, senderId, commandId: cmd.id });

      res.status(202).json({ success: true, data: { commandId: cmd.id, status: 'pending' } });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ success: false, error: error.message, code: 'INTERNAL_ERROR' });
    }
  }

  // ── T017 display-sender-session: GET /api/webhub/channels/:channelId/sessions ──

  private async listSessions(req: Request, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;
      // senderId filter removed: return all sessions for the channel

      const channel = await this.channelStore.getById(channelId);
      if (!channel) {
        res.status(404).json({ success: false, error: 'Channel not found', code: 'CHANNEL_NOT_FOUND' });
        return;
      }

      // authMiddleware already validated the admin JWT; no second token check needed.

      // Derive sessions from completed reset+switch commands as session boundaries
      const allCmds = sessionCommandStore.listByChannel(channelId)
        .filter(c => c.status === 'done')
        .sort((a, b) => a.createdAt - b.createdAt);

      // Build session entries: each reset creates a new session period
      const sessions: Array<{
        sessionKey: string;
        senderId: string;
        createdAt: number;
        lastActivityAt: number;
        isCurrent: boolean;
        label: string | null;
      }> = [];

      // Group by senderId to find the most recent session per sender
      const senderMap = new Map<string, typeof allCmds>();
      for (const cmd of allCmds) {
        if (!senderMap.has(cmd.senderId)) senderMap.set(cmd.senderId, []);
        senderMap.get(cmd.senderId)!.push(cmd);
      }

      for (const [sid, cmds] of senderMap) {
        cmds.forEach((cmd, idx) => {
          sessions.push({
            sessionKey: `session-${cmd.id.slice(0, 8)}`,
            senderId: sid,
            createdAt: cmd.createdAt,
            lastActivityAt: cmd.ackedAt ?? cmd.createdAt,
            isCurrent: idx === cmds.length - 1,
            label: cmd.commandType === 'switch' ? 'Switched' : `Session ${idx + 1}`,
          });
        });
      }

      res.json({ success: true, data: { sessions } });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ success: false, error: error.message, code: 'INTERNAL_ERROR' });
    }
  }

  // ── T018 display-sender-session: POST /api/webhub/channels/:channelId/sessions/switch ──

  private async switchSession(req: Request, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;
      const { senderId, targetSessionKey } = req.body as {
        senderId?: string;
        targetSessionKey?: string;
      };

      if (!senderId) {
        res.status(400).json({ success: false, error: 'senderId is required', code: 'INVALID_REQUEST' });
        return;
      }
      if (!targetSessionKey) {
        res.status(400).json({ success: false, error: 'targetSessionKey is required', code: 'INVALID_REQUEST' });
        return;
      }

      const channel = await this.channelStore.getById(channelId);
      if (!channel) {
        res.status(404).json({ success: false, error: 'Channel not found', code: 'CHANNEL_NOT_FOUND' });
        return;
      }

      // authMiddleware already validated the admin JWT; no second token check needed.

      if (sessionCommandStore.hasPending(channelId, senderId)) {
        res.status(409).json({ success: false, error: 'A session command is already pending', code: 'CONFLICT' });
        return;
      }

      const cmd = sessionCommandStore.enqueue(channelId, senderId, 'switch', { targetSessionKey });
      this.options.logger?.info({ event: 'session_switch_queued', channelId, senderId, targetSessionKey, commandId: cmd.id });

      res.status(202).json({ success: true, data: { commandId: cmd.id, status: 'pending' } });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ success: false, error: error.message, code: 'INTERNAL_ERROR' });
    }
  }

  // ── T009 display-sender-session: GET /api/channel/commands ───────────────

  private async getPendingCommands(req: Request, res: Response): Promise<void> {
    try {
      const token = req.headers['x-channel-token'] as string;
      const channelId = req.query['channelId'] as string;

      if (!token) {
        res.status(401).json({ success: false, error: 'Missing channel token', code: 'UNAUTHORIZED' });
        return;
      }
      if (!channelId) {
        res.status(400).json({ success: false, error: 'Missing channelId', code: 'INVALID_REQUEST' });
        return;
      }

      const channel = await this.channelStore.getById(channelId);
      if (!channel || channel.accessToken !== token) {
        res.status(401).json({ success: false, error: 'Invalid token', code: 'UNAUTHORIZED' });
        return;
      }

      const commands = sessionCommandStore.getPending(channelId);
      res.json({
        success: true,
        data: {
          commands: commands.map((c) => ({
            id: c.id,
            commandType: c.commandType,
            senderId: c.senderId,
            payload: c.payload ?? null,
            createdAt: c.createdAt,
          })),
        },
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ success: false, error: error.message, code: 'INTERNAL_ERROR' });
    }
  }

  // ── T010 display-sender-session: POST /api/channel/commands/:commandId/ack ──

  private async ackCommand(req: Request, res: Response): Promise<void> {
    try {
      const { commandId } = req.params;
      const { success: ackSuccess, error: ackError, channelId: bodyChannelId } = req.body as {
        success: boolean;
        error?: string;
        channelId?: string;
      };

      const token = req.headers['x-channel-token'] as string;
      const channelId = (bodyChannelId || req.query['channelId']) as string;

      if (!token) {
        res.status(401).json({ success: false, error: 'Missing channel token', code: 'UNAUTHORIZED' });
        return;
      }

      if (channelId) {
        const channel = await this.channelStore.getById(channelId);
        if (!channel || channel.accessToken !== token) {
          res.status(401).json({ success: false, error: 'Invalid token', code: 'UNAUTHORIZED' });
          return;
        }
      }

      sessionCommandStore.ack(commandId, !!ackSuccess, ackError);

      // On successful reset/switch: persist system message so frontend sees confirmation
      const cmd = sessionCommandStore.getById(commandId);
      if (ackSuccess && cmd) {
        const msgChannelId = cmd.channelId;
        const label = cmd.commandType === 'switch' ? 'Session switched' : 'New session started';
        const systemMsg = dbMessageStore.create({
          channelId: msgChannelId,
          direction: 'outbound',
          messageType: 'text',
          content: label,
          role: 'agent',
          sender: { id: 'system' },
          status: 'delivered',
          metadata: { isSystem: true, commandId, commandType: cmd.commandType },
        });
        broadcaster.broadcast(msgChannelId, { type: 'message', data: systemMsg });
        this.options.logger?.info({
          event: 'session_command_acked',
          commandId,
          commandType: cmd.commandType,
          channelId: msgChannelId,
        });
      }

      res.json({ success: true });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ success: false, error: error.message, code: 'INTERNAL_ERROR' });
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.options.port, () => {
        // T011: Use noServer:true so the upgrade event is fully controlled here,
        // preventing the ws library from rejecting /api/channel/ws with 400.
        this.wsServer = new WebSocketServer({ noServer: true });
        this.wsServer.on('connection', async (ws: WebSocket, req: http.IncomingMessage) => {
          const url = new URL(req.url ?? '', `http://localhost:${this.options.port}`);
          const channelId = url.searchParams.get('channelId') ?? '';
          const token = url.searchParams.get('token') ?? '';

          if (!channelId || !token) {
            ws.close(4001, 'Missing channelId or token');
            return;
          }

          const channel = await this.channelStore.getById(channelId);
          if (!channel || channel.accessToken !== token) {
            ws.close(4001, 'Unauthorized');
            return;
          }

          broadcaster.subscribe(channelId, ws);
          this.options.logger?.info({ event: 'ws_connected', channelId });

          ws.on('close', () => {
            broadcaster.unsubscribe(channelId, ws);
            this.options.logger?.info({ event: 'ws_disconnected', channelId });
          });
          ws.on('error', () => {
            broadcaster.unsubscribe(channelId, ws);
          });
        });

        this.options.logger?.info({
          event: 'started',
          port: this.options.port,
          message: 'WebHub HTTP server started',
        });

        // T011 Plugin-Channel Realtime: Route HTTP Upgrade requests by pathname.
        // Using a single upgrade listener avoids the ws library rejecting
        // non-matching paths with 400 when path: option is used.
        this.server!.on('upgrade', (req: http.IncomingMessage, socket, head) => {
          const pathname = new URL(req.url ?? '', `http://localhost`).pathname;
          if (pathname === '/api/channel/ws') {
            pluginWsServer.handleUpgrade(req, socket as import('net').Socket, head);
          } else if (pathname === '/api/webhub/ws') {
            this.wsServer!.handleUpgrade(req, socket as import('net').Socket, head, (ws) => {
              this.wsServer!.emit('connection', ws, req);
            });
          } else {
            // Unknown upgrade path — reject
            socket.destroy();
          }
        });

        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }
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
