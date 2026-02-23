/******************************************************************
 * T020 Plugin-Channel SSE: SSE Router
 *
 * Express routes for Server-Sent Events:
 *   GET /api/webhub/channel/:channelId/events?token=<accessToken>
 *     → Per-channel SSE stream (message, chunk, done, channel_status)
 *
 *   GET /api/webhub/events/global?token=<accessToken>
 *     → Global SSE stream (cross-channel status, heartbeat)
 *
 * Authentication: ?token=<accessToken> query param (EventSource cannot
 * set custom headers, so Bearer token is passed as a URL query parameter).
 ******************************************************************/

import { Router, Request, Response } from 'express';
import { channelStore } from '../db/channelStore';
import { sseManager } from '../http/sseManager';

const router = Router();

/**
 * Authenticate an SSE request via `?token=` query parameter.
 * Returns the validated channel on success, or writes a 401 and returns null.
 */
function authenticateToken(
  req: Request,
  res: Response,
  requiredChannelId?: string,
): { channelId: string; accessToken: string } | null {
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'MISSING_TOKEN' });
    return null;
  }

  const channel = channelStore.getByAccessToken(token);
  if (!channel) {
    res.status(401).json({ error: 'INVALID_TOKEN' });
    return null;
  }

  // For per-channel endpoints verify the token belongs to the requested channel
  if (requiredChannelId && channel.id !== requiredChannelId) {
    res.status(401).json({ error: 'TOKEN_CHANNEL_MISMATCH' });
    return null;
  }

  return { channelId: channel.id, accessToken: token };
}

/**
 * GET /api/webhub/channel/:channelId/events?token=<accessToken>
 *
 * Opens a per-channel Server-Sent Events stream.
 * The client should reconnect with Last-Event-ID for resumption.
 */
router.get('/api/webhub/channel/:channelId/events', (req: Request, res: Response) => {
  const { channelId } = req.params;
  const auth = authenticateToken(req, res, channelId);
  if (!auth) return;

  const lastEventId = req.headers['last-event-id'];
  const conn = sseManager.addConnection(channelId, res, lastEventId);

  // Send initial "connected" confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ channelId, connId: conn.id })}\n\n`);
});

/**
 * GET /api/webhub/events/global?token=<accessToken>
 *
 * Opens a global SSE stream that receives cross-channel status events.
 * Any valid accessToken can subscribe to the global stream.
 */
router.get('/api/webhub/events/global', (req: Request, res: Response) => {
  const auth = authenticateToken(req, res);
  if (!auth) return;

  const conn = sseManager.addConnection('global', res);

  // Send initial "connected" confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ connId: conn.id })}\n\n`);
});

export default router;
