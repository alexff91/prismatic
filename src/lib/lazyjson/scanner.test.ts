import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  parsePrimitive,
  previewSpan,
  scanChildren,
  scanRoot,
} from './scanner';

describe('scanRoot', () => {
  it('identifies the root container and counts direct children', () => {
    const root = scanRoot('  {"a": 1, "b": [1,2,3]}  ');
    expect(root.kind).toBe('object');
    expect(root.childCount).toBe(2);
  });

  it('handles primitive roots', () => {
    expect(scanRoot('42').kind).toBe('number');
    expect(scanRoot('"hi"').kind).toBe('string');
    expect(scanRoot('null').kind).toBe('null');
    expect(scanRoot('true').kind).toBe('boolean');
  });

  it('throws on empty input', () => {
    expect(() => scanRoot('   ')).toThrow();
  });
});

describe('scanChildren', () => {
  it('returns spans for object entries without parsing values', () => {
    const text = '{"name": "kibana", "count": 12, "tags": ["a", "b"], "meta": null}';
    const kids = scanChildren(text, 0, text.length);
    expect(kids.map((k) => k.key)).toEqual(['name', 'count', 'tags', 'meta']);
    expect(kids.map((k) => k.kind)).toEqual(['string', 'number', 'array', 'null']);
    expect(text.slice(kids[1]!.start, kids[1]!.end)).toBe('12');
    expect(kids[2]!.childCount).toBe(2);
  });

  it('returns spans for array elements', () => {
    const text = '[10, {"x": 1}, "s", [true, false, null]]';
    const kids = scanChildren(text, 0, text.length);
    expect(kids).toHaveLength(4);
    expect(kids[1]!.kind).toBe('object');
    expect(kids[1]!.childCount).toBe(1);
    expect(kids[3]!.childCount).toBe(3);
  });

  it('handles empty containers', () => {
    expect(scanChildren('{}', 0, 2)).toEqual([]);
    expect(scanChildren('[]', 0, 2)).toEqual([]);
  });

  it('handles escaped quotes and braces inside strings', () => {
    const text = '{"a": "he said \\"}{[\\" ok", "b": 2}';
    const kids = scanChildren(text, 0, text.length);
    expect(kids).toHaveLength(2);
    expect(kids[0]!.key).toBe('a');
    expect(JSON.parse(text.slice(kids[0]!.start, kids[0]!.end))).toBe('he said "}{[" ok');
    expect(kids[1]!.key).toBe('b');
  });

  it('handles unicode keys and deep nesting', () => {
    const text = '{"ключ": {"内側": [[[1]]]}}';
    const kids = scanChildren(text, 0, text.length);
    expect(kids[0]!.key).toBe('ключ');
    const inner = scanChildren(text, kids[0]!.start, kids[0]!.end);
    expect(inner[0]!.key).toBe('内側');
    expect(inner[0]!.kind).toBe('array');
  });

  it('counts children of nested containers correctly', () => {
    const text = '{"a": {"x": 1, "y": 2, "z": 3}, "b": []}';
    const kids = scanChildren(text, 0, text.length);
    expect(kids[0]!.childCount).toBe(3);
    expect(kids[1]!.childCount).toBe(0);
  });

  it('scans a large synthetic document quickly and lazily', () => {
    // ~12 MB document: 50k rows of ~250 bytes
    const row = JSON.stringify({
      id: 'x'.repeat(64),
      ts: 1718000000000,
      msg: 'm'.repeat(120),
      nested: { a: [1, 2, 3], b: { c: true } },
    });
    const text = `{"hits": [${Array.from({ length: 50_000 }, () => row).join(',')}], "total": 50000}`;
    expect(text.length).toBeGreaterThan(10 * 1024 * 1024);

    const started = performance.now();
    const top = scanChildren(text, 0, text.length);
    const elapsed = performance.now() - started;

    expect(top.map((k) => k.key)).toEqual(['hits', 'total']);
    expect(top[0]!.childCount).toBe(50_000);
    // Structural scan of 12 MB should be near-instant (no JSON.parse).
    expect(elapsed).toBeLessThan(2000);

    // Expanding one element scans only that element's span.
    const hits = scanChildren(text, top[0]!.start, top[0]!.end);
    expect(hits).toHaveLength(50_000);
    const one = scanChildren(text, hits[123]!.start, hits[123]!.end);
    expect(one.map((k) => k.key)).toEqual(['id', 'ts', 'msg', 'nested']);
  });
});

describe('previewSpan / parsePrimitive', () => {
  it('previews containers without slicing their contents', () => {
    const text = '{"a": {"x": 1, "y": 2}}';
    const kids = scanChildren(text, 0, text.length);
    expect(previewSpan(text, kids[0]!)).toBe('{…} 2 keys');
  });

  it('truncates very long strings instead of parsing them', () => {
    const big = `"${'a'.repeat(100_000)}"`;
    const root = scanRoot(big);
    const val = parsePrimitive(big, root, 100) as string;
    expect(val.length).toBeLessThan(200);
    expect(val.endsWith('…')).toBe(true);
  });

  it('parses normal primitives exactly', () => {
    const text = '[3.14, "ok", true, null]';
    const kids = scanChildren(text, 0, text.length);
    expect(parsePrimitive(text, kids[0]!)).toBe(3.14);
    expect(parsePrimitive(text, kids[1]!)).toBe('ok');
    expect(parsePrimitive(text, kids[2]!)).toBe(true);
    expect(parsePrimitive(text, kids[3]!)).toBe(null);
  });
});

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(12 * 1024 * 1024)).toBe('12.0 MB');
  });
});
