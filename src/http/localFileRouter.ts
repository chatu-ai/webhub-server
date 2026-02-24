import path from 'path';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import { getFileAccessConfig, getFileAccessConfigForChannel, validateFilePath, FileAccessError } from '../utils/localFileSecurity';
import { channelStore } from '../db';
import { getLogger } from '../utils/logger';

const logger = getLogger();

/** MIME type map: extension → { contentType, disposition } */
const MIME_MAP: Record<string, { contentType: string; disposition: 'inline' | 'attachment' }> = {
  '.png':  { contentType: 'image/png',              disposition: 'inline' },
  '.jpg':  { contentType: 'image/jpeg',             disposition: 'inline' },
  '.jpeg': { contentType: 'image/jpeg',             disposition: 'inline' },
  '.gif':  { contentType: 'image/gif',              disposition: 'inline' },
  '.webp': { contentType: 'image/webp',             disposition: 'inline' },
  '.svg':  { contentType: 'image/svg+xml',          disposition: 'inline' },
  '.pdf':  { contentType: 'application/pdf',        disposition: 'inline' },
  '.txt':  { contentType: 'text/plain; charset=utf-8', disposition: 'inline' },
};

function getMime(filePath: string): { contentType: string; disposition: string } {
  const ext = path.extname(filePath).toLowerCase();
  const known = MIME_MAP[ext];
  if (known) return known;
  const basename = path.basename(filePath);
  return {
    contentType: 'application/octet-stream',
    disposition: `attachment; filename="${basename}"`,
  };
}

const router = Router();

/**
 * GET /api/webhub/files?path=<uri-encoded-absolute-path>
 *
 * Serves a local file from an allowed root directory.
 * Supports ETag-based conditional responses (304).
 */
router.get('/files', (req: Request, res: Response): void => {
  const rawPath = req.query.path as string | undefined;
  const channelId = req.query.channelId as string | undefined;

  // Use per-channel workingDir when channelId is provided; fall back to env var.
  const config = channelId
    ? getFileAccessConfigForChannel(channelId, channelStore)
    : getFileAccessConfig();

  try {
    const resolved = validateFilePath(rawPath ?? '', config);

    const stat = fs.statSync(resolved);
    const etag = `"${stat.mtimeMs}-${stat.size}"`;

    // Conditional GET — return 304 if ETag matches
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    const { contentType, disposition } = getMime(resolved);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', disposition);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('ETag', etag);
    res.setHeader('Content-Length', stat.size);

    logger.info({ event: 'file_access', path: resolved, status: 200 });

    fs.createReadStream(resolved).pipe(res);
  } catch (err: unknown) {
    if (err instanceof FileAccessError) {
      logger.info({ event: 'file_access_denied', path: rawPath, status: err.statusCode, code: err.code });
      const body: Record<string, unknown> = { success: false, error: err.code, message: err.message };
      if (err.statusCode === 413) {
        body.maxBytes = config.maxSizeBytes;
      }
      res.status(err.statusCode).json(body);
      return;
    }
    logger.error({ event: 'file_access_error', path: rawPath, err: String(err) });
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: 'Unexpected error' });
  }
});

export default router;
