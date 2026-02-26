import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import { getLogger } from '../utils/logger';

const logger = getLogger();

function getUploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), 'data/uploads');
}

/**
 * Sanitize channelId to prevent path traversal attacks.
 * Allows only alphanumeric characters, hyphens, and underscores.
 */
function sanitizeChannelId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 64);
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: (req: Request, _file, cb) => {
      const rawId = req.params.id || 'unknown';
      const channelId = sanitizeChannelId(rawId);
      const baseDir = path.resolve(getUploadDir());
      const dir = path.resolve(baseDir, channelId);
      // Guard: ensure resolved path is still inside baseDir
      if (!dir.startsWith(baseDir + path.sep) && dir !== baseDir) {
        cb(new Error('Invalid channel ID'), '');
        return;
      }
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const uniqueName = `${uuidv4()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // T027: 10 MB limit
});

/** T027: Handle multer FILE_TOO_LARGE error and return 413. */
export function handleUploadError(err: any, _req: Request, res: Response, next: NextFunction): void {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ success: false, error: 'FILE_TOO_LARGE', maxBytes: 10 * 1024 * 1024 });
    return;
  }
  next(err);
}

export function handleUpload(req: Request, res: Response): void {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, error: 'No file uploaded' });
    return;
  }
  const channelId = sanitizeChannelId(req.params.id || 'unknown');
  const relativePath = `/uploads/${channelId}/${file.filename}`;
  logger.info({ event: 'file_uploaded', channelId, filename: file.filename, size: file.size });
  res.json({
    success: true,
    data: {
      url: relativePath,
      size: file.size,
      mimeType: file.mimetype,
      filename: file.originalname,
    },
  });
}
