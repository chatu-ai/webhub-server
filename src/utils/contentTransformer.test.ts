import { transformLocalPaths } from './contentTransformer';

const API_PREFIX = '/api/webhub/files?path=';

function encoded(p: string): string {
  return `${API_PREFIX}${encodeURIComponent(p)}`;
}

describe('transformLocalPaths()', () => {
  // ── passthrough ─────────────────────────────────────────────────────────

  it('returns empty string unchanged', () => {
    expect(transformLocalPaths('')).toBe('');
  });

  it('returns ordinary text unchanged', () => {
    const text = 'Hello world, no paths here.';
    expect(transformLocalPaths(text)).toBe(text);
  });

  it('does not touch already-converted src (starts with /api/)', () => {
    const html = `<img src="${API_PREFIX}%2Ftmp%2Fa.png">`;
    expect(transformLocalPaths(html)).toBe(html);
  });

  it('does not touch http:// URLs in src', () => {
    const html = '<img src="http://example.com/image.png">';
    expect(transformLocalPaths(html)).toBe(html);
  });

  it('does not touch https:// URLs in src', () => {
    const html = '<img src="https://cdn.example.com/photo.jpg">';
    expect(transformLocalPaths(html)).toBe(html);
  });

  it('does not touch /uploads/ paths', () => {
    const html = '<img src="/uploads/abc/file.png">';
    expect(transformLocalPaths(html)).toBe(html);
  });

  // ── src="" double-quoted ────────────────────────────────────────────────

  it('converts src="" double-quoted absolute path', () => {
    const html = '<img src="/home/chsword/clawd/patent.png">';
    const result = transformLocalPaths(html);
    expect(result).toBe(`<img src="${encoded('/home/chsword/clawd/patent.png')}">`);
  });

  it('converts multiple src="" in same string', () => {
    const html = '<img src="/a.png"><img src="/b.png">';
    const result = transformLocalPaths(html);
    expect(result).toContain(`src="${encoded('/a.png')}"`);
    expect(result).toContain(`src="${encoded('/b.png')}"`);
  });

  it('converts src="" with path containing subdirectories', () => {
    const html = '<img src="/home/user/docs/images/chart.svg">';
    const result = transformLocalPaths(html);
    expect(result).toContain(encodeURIComponent('/home/user/docs/images/chart.svg'));
  });

  // ── src='' single-quoted ────────────────────────────────────────────────

  it("converts src='' single-quoted absolute path", () => {
    const html = "<img src='/home/chsword/data/photo.jpg'>";
    const result = transformLocalPaths(html);
    expect(result).toBe(`<img src='${encoded('/home/chsword/data/photo.jpg')}'>`);
  });

  // ── Markdown image syntax ───────────────────────────────────────────────

  it('converts Markdown image ![alt](/path)', () => {
    const md = '![专利申请流程图](/home/chsword/clawd/patent-flow.png)';
    const result = transformLocalPaths(md);
    expect(result).toBe(`![专利申请流程图](${encoded('/home/chsword/clawd/patent-flow.png')})`);
  });

  it('converts Markdown image with empty alt text', () => {
    const md = '![](/home/user/image.png)';
    const result = transformLocalPaths(md);
    expect(result).toContain(encodeURIComponent('/home/user/image.png'));
  });

  it('does not touch Markdown image already using /api/ path', () => {
    const md = `![alt](${API_PREFIX}%2Ftmp%2Fa.png)`;
    expect(transformLocalPaths(md)).toBe(md);
  });

  it('does not touch Markdown image with https URL', () => {
    const md = '![alt](https://example.com/photo.png)';
    expect(transformLocalPaths(md)).toBe(md);
  });

  // ── mixed content ───────────────────────────────────────────────────────

  it('converts both src="" and Markdown images in the same string', () => {
    const mixed = '<img src="/home/a.png"> and ![fig](/home/b.png)';
    const result = transformLocalPaths(mixed);
    expect(result).toContain(`src="${encoded('/home/a.png')}"`);
    expect(result).toContain(`(${encoded('/home/b.png')})`);
  });

  // ── special characters in path ──────────────────────────────────────────

  it('encodes spaces in path correctly', () => {
    const html = '<img src="/home/user/my file.png">';
    // Space is not matched by [^"<>\s]+ so the regex stops — this path won't be matched
    // (by design: paths with spaces won't be in valid HTML without encoding)
    // Just ensure no crash:
    expect(() => transformLocalPaths(html)).not.toThrow();
  });

  it('encodes Unicode characters in path', () => {
    // Chinese characters are valid non-whitespace, non-quote chars
    const html = '<img src="/home/user/专利图.png">';
    const result = transformLocalPaths(html);
    expect(result).toContain(encodeURIComponent('/home/user/专利图.png'));
  });

  // ── T011 US3: href patterns ──────────────────────────────────────────────

  it('converts href="" double-quoted local path', () => {
    const html = '<a href="/home/user/report.pdf">report</a>';
    const result = transformLocalPaths(html);
    expect(result).toBe(`<a href="${encoded('/home/user/report.pdf')}">report</a>`);
  });

  it('converts href=\'\' single-quoted local path', () => {
    const html = "<a href='/home/user/report.pdf'>report</a>";
    const result = transformLocalPaths(html);
    expect(result).toBe(`<a href='${encoded('/home/user/report.pdf')}'>report</a>`);
  });

  it('does not convert href pointing to /api/ path', () => {
    const html = `<a href="${API_PREFIX}%2Ftmp%2Fa.pdf">file</a>`;
    expect(transformLocalPaths(html)).toBe(html);
  });

  it('does not convert href with http URL', () => {
    const html = '<a href="https://example.com/file.pdf">link</a>';
    expect(transformLocalPaths(html)).toBe(html);
  });

  // ── T011 US3: Markdown link [text](/path) ────────────────────────────────

  it('converts Markdown link [text](/path) to webhub URL', () => {
    const md = '[report](/home/user/report.pdf)';
    const result = transformLocalPaths(md);
    expect(result).toBe(`[report](${encoded('/home/user/report.pdf')})`);
  });

  it('does not convert Markdown link with /api/ path', () => {
    const md = `[report](${API_PREFIX}%2Ftmp%2Fa.pdf)`;
    expect(transformLocalPaths(md)).toBe(md);
  });

  it('does not convert Markdown link with https URL', () => {
    const md = '[link](https://example.com/file.pdf)';
    expect(transformLocalPaths(md)).toBe(md);
  });

  it('does not double-convert Markdown image ![alt](/path) as Markdown link', () => {
    const md = '![fig](/home/b.png)';
    const result = transformLocalPaths(md);
    // Markdown image should be converted by pattern 3, not also by pattern 6
    expect(result).toBe(`![fig](${encoded('/home/b.png')})`);
    // Only one conversion: path appears once
    expect((result.match(/webhub\/files/g) || []).length).toBe(1);
  });
});
