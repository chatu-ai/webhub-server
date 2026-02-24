import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import localFileRouter from './localFileRouter';

function buildApp(): express.Application {
  const app = express();
  app.use('/api/webhub', localFileRouter);
  return app;
}
function enc(p: string): string { return encodeURIComponent(p); }

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lfr-test-'));
  process.env.WEBHUB_FILE_ROOTS = tmpDir;
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.WEBHUB_FILE_ROOTS;
});

// ── 200 responses ────────────────────────────────────────────────────────────

describe('GET /api/webhub/files — 200 responses', () => {
  const cases: [string, string, string][] = [
    ['PNG',        'image.png',  'image/png'],
    ['JPEG jpg',   'photo.jpg',  'image/jpeg'],
    ['JPEG jpeg',  'photo.jpeg', 'image/jpeg'],
    ['GIF',        'anim.gif',   'image/gif'],
    ['WebP',       'pic.webp',   'image/webp'],
    ['SVG',        'icon.svg',   'image/svg+xml'],
  ];

  test.each(cases)('%s returns correct Content-Type', async (_label, filename, expectedCt) => {
    const fp = path.join(tmpDir, filename);
    fs.writeFileSync(fp, 'data');
    const res = await request(buildApp()).get(`/api/webhub/files?path=${enc(fp)}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(expectedCt.split(';')[0]);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.headers['etag']).toBeDefined();
  });

  it('returns inline Content-Disposition for images', async () => {
    const fp = path.join(tmpDir, 'img.png');
    fs.writeFileSync(fp, 'pngdata');
    const res = await request(buildApp()).get(`/api/webhub/files?path=${enc(fp)}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('inline');
  });
});

// ── 304 ETag ─────────────────────────────────────────────────────────────────

describe('GET /api/webhub/files — 304 ETag', () => {
  it('returns 304 when If-None-Match matches the ETag', async () => {
    const fp = path.join(tmpDir, 'cached.png');
    fs.writeFileSync(fp, 'content');
    const app = buildApp();
    const first = await request(app).get(`/api/webhub/files?path=${enc(fp)}`);
    expect(first.status).toBe(200);
    const etag = first.headers['etag'] as string;
    expect(etag).toBeDefined();
    const second = await request(app)
      .get(`/api/webhub/files?path=${enc(fp)}`)
      .set('If-None-Match', etag);
    expect(second.status).toBe(304);
  });
});

// ── error responses ───────────────────────────────────────────────────────────

describe('GET /api/webhub/files — error responses', () => {
  it('returns 400 when path param is missing', async () => {
    const res = await request(buildApp()).get('/api/webhub/files');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_PATH');
  });

  it('returns 403 for path outside allowed root', async () => {
    const res = await request(buildApp()).get(`/api/webhub/files?path=${enc('/etc/hosts')}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 403 or 404 for path traversal resolving outside root', async () => {
    const evil = `${tmpDir}/../../etc/passwd`;
    const res = await request(buildApp()).get(`/api/webhub/files?path=${enc(evil)}`);
    expect([403, 404]).toContain(res.status);
  });

  it('returns 404 for non-existent file', async () => {
    const missing = path.join(tmpDir, 'does-not-exist.png');
    const res = await request(buildApp()).get(`/api/webhub/files?path=${enc(missing)}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('throws 413 at the security layer for oversized file', () => {
    const fp = path.join(tmpDir, 'big.bin');
    fs.writeFileSync(fp, Buffer.alloc(1024));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { validateFilePath, FileAccessError } = require('../utils/localFileSecurity');
    const cfg = { allowedRoots: [tmpDir], maxSizeBytes: 512 };
    expect(() => validateFilePath(fp, cfg)).toThrow(
      expect.objectContaining({ statusCode: 413, code: 'FILE_TOO_LARGE' }),
    );
  });

  it('returns 503 when WEBHUB_FILE_ROOTS is not set', async () => {
    delete process.env.WEBHUB_FILE_ROOTS;
    const res = await request(buildApp()).get(`/api/webhub/files?path=${enc('/tmp/any.png')}`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('FILE_ACCESS_DISABLED');
  });
});

// ── octet-stream fallback ─────────────────────────────────────────────────────

describe('GET /api/webhub/files — unknown file type', () => {
  it('returns octet-stream with attachment disposition', async () => {
    const fp = path.join(tmpDir, 'data.xyz');
    fs.writeFileSync(fp, 'binary stuff');
    const res = await request(buildApp()).get(`/api/webhub/files?path=${enc(fp)}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/octet-stream');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('data.xyz');
  });
});

// ── T012 US3: PDF / TXT / octet-stream MIME types ────────────────────────────

describe('GET /api/webhub/files — T012 US3 MIME types', () => {
  beforeEach(() => {
    process.env.WEBHUB_FILE_ROOTS = tmpDir;
  });

  it('returns application/pdf with inline disposition for .pdf file', async () => {
    const fp = path.join(tmpDir, 'document.pdf');
    fs.writeFileSync(fp, '%PDF-1.4 fake content');
    const res = await request(buildApp()).get(`/api/webhub/files?path=${enc(fp)}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe('inline');
  });

  it('returns text/plain with inline disposition for .txt file', async () => {
    const fp = path.join(tmpDir, 'notes.txt');
    fs.writeFileSync(fp, 'hello world');
    const res = await request(buildApp()).get(`/api/webhub/files?path=${enc(fp)}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toBe('inline');
  });

  it('returns application/octet-stream with attachment disposition for unknown extension', async () => {
    const fp = path.join(tmpDir, 'archive.bin');
    fs.writeFileSync(fp, Buffer.from([0x00, 0x01, 0x02]));
    const res = await request(buildApp()).get(`/api/webhub/files?path=${enc(fp)}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/octet-stream');
    expect(res.headers['content-disposition']).toMatch(/attachment.*archive\.bin/);
  });
});

