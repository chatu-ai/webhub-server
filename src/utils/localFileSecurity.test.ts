import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  FileAccessConfig,
  FileAccessError,
  getFileAccessConfig,
  validateFilePath,
} from './localFileSecurity';

// ─── helpers ───────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lfs-test-'));
}

function writeTmpFile(dir: string, name: string, content = 'hello', sizeBytes?: number): string {
  const filePath = path.join(dir, name);
  if (sizeBytes !== undefined) {
    const buf = Buffer.alloc(sizeBytes, 0x41);
    fs.writeFileSync(filePath, buf);
  } else {
    fs.writeFileSync(filePath, content);
  }
  return filePath;
}

// ─── getFileAccessConfig ────────────────────────────────────────────────────

describe('getFileAccessConfig()', () => {
  const original = process.env.WEBHUB_FILE_ROOTS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.WEBHUB_FILE_ROOTS;
    } else {
      process.env.WEBHUB_FILE_ROOTS = original;
    }
  });

  it('returns empty allowedRoots when env var is unset', () => {
    delete process.env.WEBHUB_FILE_ROOTS;
    const cfg = getFileAccessConfig();
    expect(cfg.allowedRoots).toEqual([]);
    expect(cfg.maxSizeBytes).toBe(50 * 1024 * 1024);
  });

  it('parses a single root', () => {
    process.env.WEBHUB_FILE_ROOTS = '/tmp/testdir';
    const cfg = getFileAccessConfig();
    expect(cfg.allowedRoots).toHaveLength(1);
    expect(cfg.allowedRoots[0]).toBe(path.resolve('/tmp/testdir'));
  });

  it('parses multiple colon-separated roots', () => {
    process.env.WEBHUB_FILE_ROOTS = '/tmp/a:/tmp/b:/tmp/c';
    const cfg = getFileAccessConfig();
    expect(cfg.allowedRoots).toHaveLength(3);
  });

  it('ignores empty segments', () => {
    process.env.WEBHUB_FILE_ROOTS = ':/tmp/a::';
    const cfg = getFileAccessConfig();
    expect(cfg.allowedRoots).toHaveLength(1);
  });
});

// ─── validateFilePath ───────────────────────────────────────────────────────

describe('validateFilePath()', () => {
  let tmpDir: string;
  let cfg: FileAccessConfig;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    cfg = { allowedRoots: [tmpDir], maxSizeBytes: 50 * 1024 * 1024 };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── happy path ──────────────────────────────────────────────────────────

  it('returns the resolved path for a valid file inside the root', () => {
    const file = writeTmpFile(tmpDir, 'image.png');
    const result = validateFilePath(file, cfg);
    expect(result).toBe(fs.realpathSync(file));
  });

  // ── 503: file access disabled ───────────────────────────────────────────

  it('throws 503 when allowedRoots is empty', () => {
    const file = writeTmpFile(tmpDir, 'test.txt');
    expect(() => validateFilePath(file, { allowedRoots: [], maxSizeBytes: 10 })).toThrow(
      expect.objectContaining({ statusCode: 503, code: 'FILE_ACCESS_DISABLED' }),
    );
  });

  // ── 400: invalid path ───────────────────────────────────────────────────

  it('throws 400 for a relative path', () => {
    expect(() => validateFilePath('relative/path.txt', cfg)).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'INVALID_PATH' }),
    );
  });

  it('throws 400 for an empty path', () => {
    expect(() => validateFilePath('', cfg)).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('throws 400 when path points to a directory', () => {
    expect(() => validateFilePath(tmpDir, cfg)).toThrow(
      expect.objectContaining({ statusCode: 400, code: 'INVALID_PATH' }),
    );
  });

  // ── 403: path traversal / outside allowed root ──────────────────────────

  it('throws 403 for a path outside all allowed roots', () => {
    expect(() => validateFilePath('/etc/hosts', cfg)).toThrow(
      expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' }),
    );
  });

  it('throws 403 for a path traversal attempt that resolves outside root', () => {
    // /etc/passwd written as a literal does not traverse, but does resolve outside root
    expect(() => validateFilePath('/etc/passwd', cfg)).toThrow(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  it('throws 403 for symlink that points outside allowed root', () => {
    const outside = writeTmpFile(fs.mkdtempSync(path.join(os.tmpdir(), 'outside-')), 'secret.txt', 'TOP SECRET');
    const symlink = path.join(tmpDir, 'link.txt');
    fs.symlinkSync(outside, symlink);
    // realpathSync resolves the symlink's real location — outside tmpDir
    expect(() => validateFilePath(symlink, cfg)).toThrow(
      expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' }),
    );
  });

  // ── 404: file not found ─────────────────────────────────────────────────

  it('throws 404 for a non-existent file', () => {
    expect(() => validateFilePath(path.join(tmpDir, 'missing.png'), cfg)).toThrow(
      expect.objectContaining({ statusCode: 404, code: 'NOT_FOUND' }),
    );
  });

  // ── 413: file too large ─────────────────────────────────────────────────

  it('throws 413 when file size exceeds maxSizeBytes', () => {
    const bigFile = writeTmpFile(tmpDir, 'big.bin', '', 1024);
    const smallCfg: FileAccessConfig = { allowedRoots: [tmpDir], maxSizeBytes: 512 };
    expect(() => validateFilePath(bigFile, smallCfg)).toThrow(
      expect.objectContaining({ statusCode: 413, code: 'FILE_TOO_LARGE' }),
    );
  });

  it('does NOT throw for a file exactly at the size limit', () => {
    const file = writeTmpFile(tmpDir, 'exact.bin', '', 512);
    const exactCfg: FileAccessConfig = { allowedRoots: [tmpDir], maxSizeBytes: 512 };
    expect(() => validateFilePath(file, exactCfg)).not.toThrow();
  });

  // ── FileAccessError is instance of Error ───────────────────────────────

  it('throws FileAccessError instances', () => {
    expect(() => validateFilePath('/etc/passwd', cfg)).toThrow(FileAccessError);
  });
});
