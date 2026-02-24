import path from 'path';
import fs from 'fs';
import type { ChannelStore } from '../db/channelStore';

export interface FileAccessConfig {
  /** Resolved absolute directory paths; only files under these roots are served. */
  allowedRoots: string[];
  /** Maximum file size in bytes. Requests exceeding this are rejected with 413. Default 50 MB. */
  maxSizeBytes: number;
}

export class FileAccessError extends Error {
  constructor(
    public readonly statusCode: 400 | 403 | 404 | 413 | 503,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FileAccessError';
  }
}

/**
 * Read file-access configuration from environment variables.
 * WEBHUB_FILE_ROOTS — colon-separated list of allowed root directories.
 * Used as fallback when a channel has no workingDir set.
 */
export function getFileAccessConfig(): FileAccessConfig {
  const raw = process.env.WEBHUB_FILE_ROOTS ?? '';
  const allowedRoots = raw
    .split(':')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));

  return {
    allowedRoots,
    maxSizeBytes: 50 * 1024 * 1024, // 50 MB
  };
}

/**
 * Read file-access configuration for a specific channel.
 * Uses the channel's workingDir (set when the plugin connects).
 * Falls back to the global WEBHUB_FILE_ROOTS env var if the channel
 * has no workingDir configured.
 */
export function getFileAccessConfigForChannel(
  channelId: string,
  channelStore: ChannelStore,
): FileAccessConfig {
  const channel = channelStore.getById(channelId);
  const workingDir = channel?.workingDir;
  if (workingDir) {
    return {
      allowedRoots: [path.resolve(workingDir)],
      maxSizeBytes: 50 * 1024 * 1024,
    };
  }
  // Fallback: global env var
  return getFileAccessConfig();
}

/**
 * Validate that the requested path is safe and within an allowed root.
 *
 * @returns The resolved absolute path if valid.
 * @throws FileAccessError for any invalid/forbidden/missing/oversized situation.
 */
export function validateFilePath(reqPath: string, config: FileAccessConfig): string {
  // 503 — file access not configured
  if (config.allowedRoots.length === 0) {
    throw new FileAccessError(503, 'FILE_ACCESS_DISABLED', 'WEBHUB_FILE_ROOTS is not configured');
  }

  // 400 — missing or non-absolute path
  if (!reqPath || !reqPath.startsWith('/')) {
    throw new FileAccessError(400, 'INVALID_PATH', 'path must be an absolute path starting with /');
  }

  // Resolve the real path — throws ENOENT if the file does not exist
  let resolved: string;
  try {
    resolved = fs.realpathSync(reqPath);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
      throw new FileAccessError(404, 'NOT_FOUND', 'File not found');
    }
    throw new FileAccessError(404, 'NOT_FOUND', `Cannot resolve path: ${e.message}`);
  }

  // 403 — resolved path not within any allowed root
  const allowed = config.allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
  if (!allowed) {
    throw new FileAccessError(403, 'FORBIDDEN', 'Access to the requested path is not permitted');
  }

  // 413 — file too large
  try {
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      throw new FileAccessError(400, 'INVALID_PATH', 'Path points to a directory, not a file');
    }
    if (stat.size > config.maxSizeBytes) {
      throw new FileAccessError(413, 'FILE_TOO_LARGE', `File size ${stat.size} exceeds limit ${config.maxSizeBytes}`);
    }
  } catch (err: unknown) {
    if (err instanceof FileAccessError) throw err;
    throw new FileAccessError(404, 'NOT_FOUND', 'Cannot stat file');
  }

  return resolved;
}
