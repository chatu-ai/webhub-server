/**
 * US3 Cross-Channel Relay Handler
 *
 * Accepts messages from non-ChatU OpenClaw channels (tui, whatsapp, telegram …)
 * relayed by the openclaw-web-hub-channel plugin via POST /api/channel/cross-channel-messages.
 *
 * Authentication: X-Access-Token header (same pattern as connectChannel / disconnectChannel).
 * Authorization:  token must match a registered channel; sourceChannel must not equal the
 *                 channel's own id or name (relay loop prevention).
 */

import type { Request, Response } from 'express';
import type { ChannelStore } from '../store/channelStore';
import { messageStore as dbMessageStore } from '../db/index';
import { broadcaster } from '../ws/broadcaster';
import type { Logger } from 'pino';

// Allowed characters for sourceChannel: lowercase letters, digits, hyphens, underscores (1–64 chars)
const SOURCE_CHANNEL_RE = /^[a-z0-9_-]{1,64}$/;

/** Factory — returns an Express route handler that delegates to the given stores/logger. */
export function makeCrossChannelHandler(channelStore: ChannelStore, logger?: Logger) {
  return async function handleCrossChannelMessage(req: Request, res: Response): Promise<void> {
    try {
      const token = req.headers['x-access-token'] as string | undefined;

      if (!token) {
        res.status(401).json({ error: 'Missing X-Access-Token header' });
        return;
      }

      const channel = await channelStore.getByAccessToken(token);
      if (!channel) {
        res.status(401).json({ error: 'Invalid or expired access token' });
        return;
      }

      const { sourceChannel, direction, senderName, content, sessionKey, metadata: extraMeta, raw } = req.body;

      // Validate required fields
      const missing = ['sourceChannel', 'direction', 'senderName', 'content', 'sessionKey']
        .filter(k => !req.body[k]);
      if (missing.length > 0) {
        res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
        return;
      }

      // Validate direction
      if (direction !== 'inbound' && direction !== 'outbound') {
        res.status(400).json({ error: 'direction must be "inbound" or "outbound"' });
        return;
      }

      // Validate sourceChannel format
      if (!SOURCE_CHANNEL_RE.test(sourceChannel)) {
        res.status(400).json({ error: 'Invalid sourceChannel: must match /^[a-z0-9_-]{1,64}$/' });
        return;
      }

      // Prevent relay loop: sourceChannel must not match the registered channel id or name
      const channelNameLower = (channel.name ?? '').toLowerCase().replace(/\s+/g, '-');
      if (sourceChannel === channel.id || sourceChannel === channelNameLower) {
        res.status(409).json({ error: 'sourceChannel conflicts with the registered ChatU channel (relay loop prevention)' });
        return;
      }

      // Dedup: if the same OpenClaw message ID (dedupId) was already stored via
      // the direct deliverOutbound path, skip this relay write entirely.
      // dedupId is the OpenClaw internal msg.id passed from before_message_write.
      const dedupId = extraMeta?.dedupId as string | undefined;
      if (dedupId) {
        const dedupNow = new Date();
        const dedupCutoff = new Date(dedupNow.getTime() - 30_000);
        const recentMessages = dbMessageStore.listByDateRange(channel.id, dedupCutoff, dedupNow, 20);
        const alreadyStored = recentMessages.some(
          (m) => (m.metadata as Record<string, unknown>)?.dedupId === dedupId,
        );
        if (alreadyStored) {
          logger?.info({ event: 'cross_channel_dedup_skip', channelId: channel.id, sourceChannel, direction, dedupId });
          res.status(200).json({ id: 'dedup', channelId: channel.id, createdAt: dedupNow.toISOString() });
          return;
        }
      }

      // Persist message to messages table with metadata.sourceChannel marker
      const stored = dbMessageStore.create({
        channelId: channel.id,
        direction: direction as 'inbound' | 'outbound',
        messageType: 'text',
        content: String(content),
        senderName: String(senderName),
        metadata: {
          sourceChannel: String(sourceChannel),
          sessionKey: String(sessionKey),
          ...(extraMeta && typeof extraMeta === 'object' ? extraMeta : {}),
          ...(raw !== undefined ? { raw } : {}),
        },
        role: direction === 'inbound' ? 'ai' : 'visitor',
        status: 'sent',
      });

      // Broadcast to all frontend WebSocket subscribers for this channel
      broadcaster.broadcast(channel.id, { type: 'message', data: stored });

      logger?.info({
        event: 'cross_channel_message_stored',
        channelId: channel.id,
        sourceChannel,
        direction,
        messageId: stored.id,
      });

      res.status(201).json({
        id: stored.id,
        channelId: channel.id,
        createdAt: stored.createdAt,
      });
    } catch (err) {
      logger?.error({ event: 'cross_channel_message_error', err: String(err) });
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
