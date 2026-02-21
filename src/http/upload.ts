import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import { getLogger } from '../utils/logger';

const logger = getLogger();

function getUploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), 'data/uploads');
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: (req: Request, _file, cb) => {
      const channelId = req.params.id || 'unknown';
      const dir = path.join(getUploadDir(), channelId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const uniqueName = `${uuidv4()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

export function handleUpload(req: Request, res: Response): void {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, error: 'No file uploaded' });
    return;
  }
  const channelId = req.params.id;
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
