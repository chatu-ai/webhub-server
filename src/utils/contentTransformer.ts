/** Rewrite local absolute paths embedded in AI message content into
 *  browser-accessible URLs served by /api/webhub/files.
 *
 *  Patterns handled:
 *    1.  src="/absolute/path"    (double-quoted HTML attribute)
 *    2.  src='/absolute/path'    (single-quoted HTML attribute)
 *    3.  ![alt](/absolute/path)  (Markdown image syntax)
 *    4.  href="/absolute/path"   (double-quoted HTML attribute, US3)
 *    5.  href='/absolute/path'   (single-quoted HTML attribute, US3)
 *    6.  [text](/absolute/path)  (Markdown link syntax, US3)
 *
 *  Paths that already point to an API route or an HTTP URL are skipped to
 *  prevent double-encoding on repeated transformations.
 */

const SKIP_PREFIXES = ['/api/', '/uploads/', 'http://', 'https://'];

function shouldSkip(p: string): boolean {
  return SKIP_PREFIXES.some((prefix) => p.startsWith(prefix));
}

function encode(localPath: string, channelId?: string): string {
  const base = `/api/webhub/files?path=${encodeURIComponent(localPath)}`;
  return channelId ? `${base}&channelId=${encodeURIComponent(channelId)}` : base;
}

export function transformLocalPaths(content: string, channelId?: string): string {
  if (!content) return content;

  let result = content;

  // 1. src="..." double-quoted
  result = result.replace(/src="(\/[^"<>\s]+)"/g, (_match, p) =>
    shouldSkip(p) ? _match : `src="${encode(p, channelId)}"`,
  );

  // 2. src='...' single-quoted
  result = result.replace(/src='(\/[^'<>\s]+)'/g, (_match, p) =>
    shouldSkip(p) ? _match : `src='${encode(p, channelId)}'`,
  );

  // 3. Markdown image ![alt](/path)
  result = result.replace(/!\[([^\]]*)\]\((\/[^)<>\s]+)\)/g, (_match, alt, p) =>
    shouldSkip(p) ? _match : `![${alt}](${encode(p, channelId)})`,
  );

  // 4. href="..." double-quoted (US3)
  result = result.replace(/href="(\/[^"<>\s]+)"/g, (_match, p) =>
    shouldSkip(p) ? _match : `href="${encode(p, channelId)}"`,
  );

  // 5. href='...' single-quoted (US3)
  result = result.replace(/href='(\/[^'<>\s]+)'/g, (_match, p) =>
    shouldSkip(p) ? _match : `href='${encode(p, channelId)}'`,
  );

  // 6. Markdown link [text](/path) — negative lookbehind to avoid re-matching images (US3)
  result = result.replace(/(?<!!)(\[([^\]]*)\])\((\/[^)<>\s]+)\)/g, (_match, bracket, _text, p) =>
    shouldSkip(p) ? _match : `${bracket}(${encode(p, channelId)})`,
  );

  return result;
}
