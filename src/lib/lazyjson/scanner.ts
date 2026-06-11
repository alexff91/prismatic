/**
 * Lazy structural JSON scanner.
 *
 * Classic viewers call JSON.parse on the whole payload and build a DOM
 * for every node — at 10 MB+ that means seconds of jank and hundreds of
 * megabytes of heap. This scanner never materializes the document:
 *
 *  - The payload stays as one immutable string.
 *  - `scanChildren(text, start, end)` walks ONLY the bytes of one
 *    container and returns the [start, end) offsets of each direct
 *    child, plus a cheap preview. Nested containers are skipped
 *    structurally (bracket counting through strings/escapes), not parsed.
 *  - A child's value is materialized with JSON.parse(slice) only when it
 *    is a primitive being rendered, or when the user expands it — and
 *    expansion again only scans, it doesn't parse.
 *
 * Net effect: opening a 50 MB document costs one pass over the root
 * container to find top-level boundaries (no allocation per node), and
 * each expansion costs a scan of just that subtree's span.
 */

export type JsonNodeKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export interface ChildSpan {
  /** Object key (undefined for array elements). */
  key?: string;
  /** Index within the parent container. */
  index: number;
  /** Offset of the first character of the value. */
  start: number;
  /** Offset one past the last character of the value. */
  end: number;
  kind: JsonNodeKind;
  /**
   * Number of direct children for containers (counted during the same
   * pass — free, since we had to skip the span anyway).
   */
  childCount: number;
}

export class JsonSyntaxError extends Error {
  constructor(
    message: string,
    public readonly offset: number,
  ) {
    super(`${message} (at offset ${offset})`);
    this.name = 'JsonSyntaxError';
  }
}

const WS = new Set([0x20, 0x09, 0x0a, 0x0d]);

function skipWs(text: string, i: number, end: number): number {
  while (i < end && WS.has(text.charCodeAt(i))) i++;
  return i;
}

/** Skip a string literal; `i` points at the opening quote. Returns offset past the closing quote. */
function skipString(text: string, i: number, end: number): number {
  i++; // opening quote
  while (i < end) {
    const c = text.charCodeAt(i);
    if (c === 0x5c /* \ */) {
      i += 2;
      continue;
    }
    if (c === 0x22 /* " */) return i + 1;
    i++;
  }
  throw new JsonSyntaxError('Unterminated string', i);
}

/** Skip a number/true/false/null literal. */
function skipScalar(text: string, i: number, end: number): number {
  while (i < end) {
    const c = text.charCodeAt(i);
    // Delimiters that can follow a scalar: , } ] and whitespace
    if (c === 0x2c || c === 0x7d || c === 0x5d || WS.has(c)) break;
    i++;
  }
  return i;
}

/**
 * Skip a whole value starting at `i`, returning [endOffset, kind, directChildCount].
 * Containers are skipped by bracket counting; only the top level of the
 * container contributes to childCount.
 */
export function skipValue(
  text: string,
  i: number,
  end: number,
): [number, JsonNodeKind, number] {
  const c = text.charCodeAt(i);
  if (c === 0x22) return [skipString(text, i, end), 'string', 0];
  if (c === 0x7b /* { */ || c === 0x5b /* [ */) {
    const kind: JsonNodeKind = c === 0x7b ? 'object' : 'array';
    let depth = 0;
    let children = 0;
    let sawValueAtDepth1 = false;
    let j = i;
    while (j < end) {
      const ch = text.charCodeAt(j);
      if (ch === 0x22) {
        if (depth === 1 && !sawValueAtDepth1) sawValueAtDepth1 = true;
        j = skipString(text, j, end);
        continue;
      }
      if (ch === 0x7b || ch === 0x5b) {
        depth++;
        if (depth === 1) sawValueAtDepth1 = false;
        else if (depth === 2 && !sawValueAtDepth1) sawValueAtDepth1 = true;
        j++;
        continue;
      }
      if (ch === 0x7d || ch === 0x5d) {
        depth--;
        if (depth === 0) {
          if (sawValueAtDepth1) children++;
          return [j + 1, kind, children];
        }
        j++;
        continue;
      }
      if (depth === 1) {
        if (ch === 0x2c /* , */) {
          children++;
          sawValueAtDepth1 = false;
        } else if (!WS.has(ch) && ch !== 0x3a /* : */) {
          sawValueAtDepth1 = true;
        }
      }
      j++;
    }
    throw new JsonSyntaxError(`Unterminated ${kind}`, i);
  }
  if (c === 0x74 /* t */ || c === 0x66 /* f */) return [skipScalar(text, i, end), 'boolean', 0];
  if (c === 0x6e /* n */) return [skipScalar(text, i, end), 'null', 0];
  return [skipScalar(text, i, end), 'number', 0];
}

/**
 * Scan the direct children of the container occupying text[start, end).
 * Cost is O(end - start) with zero per-node JSON.parse.
 */
export function scanChildren(text: string, start: number, end: number): ChildSpan[] {
  let i = skipWs(text, start, end);
  const opener = text.charCodeAt(i);
  if (opener !== 0x7b && opener !== 0x5b) {
    throw new JsonSyntaxError('Not a container', i);
  }
  const isObject = opener === 0x7b;
  const closer = isObject ? 0x7d : 0x5d;
  const children: ChildSpan[] = [];
  i = skipWs(text, i + 1, end);

  let index = 0;
  while (i < end && text.charCodeAt(i) !== closer) {
    let key: string | undefined;
    if (isObject) {
      if (text.charCodeAt(i) !== 0x22) throw new JsonSyntaxError('Expected object key', i);
      const keyEnd = skipString(text, i, end);
      key = JSON.parse(text.slice(i, keyEnd)) as string;
      i = skipWs(text, keyEnd, end);
      if (text.charCodeAt(i) !== 0x3a) throw new JsonSyntaxError('Expected ":"', i);
      i = skipWs(text, i + 1, end);
    }
    const valueStart = i;
    const [valueEnd, kind, childCount] = skipValue(text, i, end);
    children.push({ key, index, start: valueStart, end: valueEnd, kind, childCount });
    index++;
    i = skipWs(text, valueEnd, end);
    if (i < end && text.charCodeAt(i) === 0x2c) {
      i = skipWs(text, i + 1, end);
    } else {
      break;
    }
  }
  if (i >= end || text.charCodeAt(i) !== closer) {
    throw new JsonSyntaxError('Unterminated container', i);
  }
  return children;
}

/** Kind + span of the root value of a JSON document. */
export function scanRoot(text: string): ChildSpan {
  const end = text.length;
  const i = skipWs(text, 0, end);
  if (i >= end) throw new JsonSyntaxError('Empty document', 0);
  const [valueEnd, kind, childCount] = skipValue(text, i, end);
  return { index: 0, start: i, end: valueEnd, kind, childCount };
}

const PREVIEW_MAX = 120;

/**
 * Cheap single-line preview of a span without parsing it.
 * For long strings/containers we slice a bounded window only.
 */
export function previewSpan(text: string, span: ChildSpan): string {
  const len = span.end - span.start;
  if (span.kind === 'object') return `{…} ${span.childCount} ${span.childCount === 1 ? 'key' : 'keys'}`;
  if (span.kind === 'array') return `[…] ${span.childCount} ${span.childCount === 1 ? 'item' : 'items'}`;
  if (len <= PREVIEW_MAX) return text.slice(span.start, span.end);
  return `${text.slice(span.start, span.start + PREVIEW_MAX)}… (${formatBytes(len)})`;
}

/** Parse a primitive span. Strings over `maxChars` are truncated before parse. */
export function parsePrimitive(text: string, span: ChildSpan, maxChars = 10_000): unknown {
  const len = span.end - span.start;
  if (span.kind === 'string' && len > maxChars) {
    // Slice inside the literal and close the quote — fine for display.
    return text.slice(span.start + 1, span.start + maxChars) + '…';
  }
  return JSON.parse(text.slice(span.start, span.end));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
