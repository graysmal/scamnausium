// Raw email (.eml / "Show original") → the compact form the analyzer reads.
// Pure: no Node APIs beyond atob/TextDecoder, which Node and browsers both provide.
//
// Output shape:
//   From: "PayPal" <service@paypa1-billing.example.com>
//   Reply-To: ...
//   Subject: ...
//   Auth: spf=fail dkim=none dmarc=fail
//
//   <plain-text body, links kept inline>

const RAW_HEADER = /^(received|return-path|authentication-results|mime-version|message-id|dkim-signature|content-type|content-transfer-encoding|delivered-to|arc-[\w-]+|x-[\w-]+):/im;
const KEEP = ['from', 'reply-to', 'subject'] as const;

/** True for a pasted raw email (transport headers present), not a short "From:/Subject:" paste. */
export function isRawEmail(text: string): boolean {
  const head = text.replace(/\r\n?/g, '\n').split('\n\n')[0] ?? '';
  return head.split('\n').filter(l => RAW_HEADER.test(l)).length >= 2;
}

interface Part { headers: Map<string, string[]>; body: string }

function splitHeaders(raw: string): Part {
  const text = raw.replace(/\r\n?/g, '\n');
  const gap = text.indexOf('\n\n');
  const head = gap < 0 ? text : text.slice(0, gap);
  const body = gap < 0 ? '' : text.slice(gap + 2);
  const headers = new Map<string, string[]>();
  for (const line of head.replace(/\n[ \t]+/g, ' ').split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    headers.set(key, [...(headers.get(key) ?? []), m[2].trim()]);
  }
  return {headers, body};
}

const first = (p: Part, key: string) => p.headers.get(key)?.[0] ?? '';

function decodeBytes(bytes: Uint8Array, charset = 'utf-8'): string {
  try { return new TextDecoder(charset.toLowerCase(), {fatal: false}).decode(bytes); } catch { return new TextDecoder().decode(bytes); }
}

function base64Bytes(s: string): Uint8Array {
  try { return Uint8Array.from(atob(s.replace(/[^A-Za-z0-9+/=]/g, '')), c => c.charCodeAt(0)); } catch { return new Uint8Array(); }
}

function quotedPrintableBytes(s: string): Uint8Array {
  const out: number[] = [];
  const text = s.replace(/=\n/g, '');
  for (let i = 0; i < text.length; i++) {
    const hex = text[i] === '=' ? text.slice(i + 1, i + 3) : '';
    if (/^[0-9A-F]{2}$/i.test(hex)) { out.push(parseInt(hex, 16)); i += 2; continue; }
    const code = text.charCodeAt(i);
    if (code < 128) out.push(code);
    else out.push(...new TextEncoder().encode(text[i]));
  }
  return Uint8Array.from(out);
}

/** RFC 2047 encoded words in headers: =?utf-8?B?...?= and =?utf-8?Q?...?= */
export function decodeHeader(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, charset: string, enc: string, data: string) =>
      decodeBytes(enc.toUpperCase() === 'B' ? base64Bytes(data) : quotedPrintableBytes(data.replace(/_/g, ' ')), charset));
}

const ENTITIES: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'"};

/** Removes comments and <style>/<script>/<head>/<title> blocks in one linear pass (lazy regexes are quadratic here). */
function stripBlocks(html: string): string {
  const lower = html.toLowerCase();
  const open = /<!--|<(style|script|head|title)\b/g;
  let out = '', i = 0;
  for (let m = open.exec(lower); m; open.lastIndex = i, m = open.exec(lower)) {
    out += html.slice(i, m.index) + ' ';
    const comment = m[0] === '<!--';
    const close = lower.indexOf(comment ? '-->' : `</${m[1]}`, m.index + m[0].length);
    if (close < 0) return out;
    const end = comment ? close + 3 : lower.indexOf('>', close) + 1;
    i = end > 0 ? end : html.length;
  }
  return out + html.slice(i);
}

/** HTML → readable text. Link targets are kept next to their text so link checks still see them. */
export function htmlToText(html: string): string {
  // Capped: the lazy tag patterns below are quadratic on adversarial input, and the stored summary is short anyway.
  return stripBlocks(html.slice(0, 100_000))
    // Bounded inner text keeps this linear when many <a> tags are left unclosed.
    .replace(/<a\b[^>]{0,500}?href\s*=\s*["']?([^"'\s>]+)["']?[^>]{0,500}>([\s\S]{0,2000}?)<\/a>/gi, (_, href: string, inner: string) => {
      const label = inner.replace(/<[^>]+>/g, '').trim();
      return /^https?:/i.test(href) && !label.includes(href) ? `${label} (${href})` : label;
    })
    .replace(/<(br|\/p|\/div|\/tr|\/h\d|\/li)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (/^#\d+$/.test(e) ? String.fromCharCode(Number(e.slice(1))) : m))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodePart(p: Part): {type: string; text: string} {
  const contentType = first(p, 'content-type') || 'text/plain';
  const type = contentType.split(';')[0].trim().toLowerCase();
  const charset = contentType.match(/charset="?([\w-]+)"?/i)?.[1] ?? 'utf-8';
  const encoding = first(p, 'content-transfer-encoding').toLowerCase();
  const bytes = encoding === 'base64' ? base64Bytes(p.body) : encoding === 'quoted-printable' ? quotedPrintableBytes(p.body) : null;
  return {type, text: bytes ? decodeBytes(bytes, charset) : p.body};
}

/** Depth-first search for the most readable body: text/plain wins, then text/html. */
function readableBody(p: Part, depth = 0): string {
  const contentType = first(p, 'content-type');
  const boundary = contentType.match(/boundary="?([^";]+)"?/i)?.[1];
  if (/^multipart\//i.test(contentType) && boundary && depth < 5) {
    const parts = p.body.split(`--${boundary}`).slice(1).filter(s => !s.startsWith('--')).map(s => splitHeaders(s.replace(/^\n/, '')));
    const plain = parts.find(x => /^text\/plain/i.test(first(x, 'content-type') || 'text/plain') && !/attachment/i.test(first(x, 'content-disposition')));
    if (plain) return decodePart(plain).text;
    for (const x of parts) {
      const nested = /^(multipart|text\/html)/i.test(first(x, 'content-type')) ? readableBody(x, depth + 1) : '';
      if (nested) return nested;
    }
    return '';
  }
  const {type, text} = decodePart(p);
  return type === 'text/html' ? htmlToText(text) : type.startsWith('text/') ? text : '';
}

/** Results from the receiving server's Authentication-Results header (the topmost one). */
export function authResults(raw: string): Partial<Record<'spf' | 'dkim' | 'dmarc', string>> {
  const header = first(splitHeaders(raw), 'authentication-results');
  const out: Partial<Record<'spf' | 'dkim' | 'dmarc', string>> = {};
  for (const key of ['spf', 'dkim', 'dmarc'] as const) {
    const v = header.match(new RegExp(`\\b${key}=(\\w+)`, 'i'))?.[1]?.toLowerCase();
    if (v) out[key] = v;
  }
  return out;
}

/** Converts a raw email into the compact header+body form; returns other text unchanged. */
export function compactEmail(raw: string): string {
  if (!isRawEmail(raw)) return raw;
  const top = splitHeaders(raw);
  const lines: string[] = [];
  for (const key of KEEP) {
    const v = first(top, key);
    if (v) lines.push(`${key === 'reply-to' ? 'Reply-To' : key[0].toUpperCase() + key.slice(1)}: ${decodeHeader(v)}`);
  }
  const auth = authResults(raw);
  const authLine = Object.entries(auth).map(([k, v]) => `${k}=${v}`).join(' ');
  if (authLine) lines.push(`Auth: ${authLine}`);
  const body = readableBody(top).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return `${lines.join('\n')}\n\n${body}`;
}
