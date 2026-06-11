/**
 * Virtualized lazy JSON tree.
 *
 * Works directly on the raw response text via the structural scanner:
 * no full JSON.parse, no DOM node per JSON node. Only the ~40 rows in
 * the viewport exist in the DOM regardless of document size, and a
 * node's children are scanned the first time it is expanded.
 */
import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  formatBytes,
  parsePrimitive,
  previewSpan,
  scanChildren,
  scanRoot,
  type ChildSpan,
} from '../lib/lazyjson/scanner';

const ROW_HEIGHT = 22;
const OVERSCAN = 12;

interface Row {
  span: ChildSpan;
  depth: number;
  /** Unique id: byte offset of the value is unique within one document. */
  id: number;
  expanded: boolean;
  expandable: boolean;
}

interface JsonTreeProps {
  text: string;
  /** Max height of the scroll viewport in px. */
  height?: number;
}

export function JsonTree({ text, height = 480 }: JsonTreeProps) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([-1]));
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(height);
  const childCache = useRef(new Map<number, ChildSpan[]>());
  const textRef = useRef(text);

  // New document: drop all offsets-based state.
  if (textRef.current !== text) {
    textRef.current = text;
    childCache.current.clear();
    if (expanded.size !== 1 || !expanded.has(-1)) setExpanded(new Set([-1]));
  }

  const root = useMemo(() => {
    try {
      return scanRoot(text);
    } catch {
      return null;
    }
  }, [text]);

  const childrenOf = useCallback(
    (span: ChildSpan): ChildSpan[] => {
      let kids = childCache.current.get(span.start);
      if (!kids) {
        kids = scanChildren(text, span.start, span.end);
        childCache.current.set(span.start, kids);
      }
      return kids;
    },
    [text],
  );

  const rows: Row[] = useMemo(() => {
    if (!root) return [];
    const out: Row[] = [];
    const pushNode = (span: ChildSpan, depth: number) => {
      const expandable = span.kind === 'object' || span.kind === 'array';
      const isOpen = expandable && (depth === 0 ? expanded.has(-1) : expanded.has(span.start));
      out.push({ span, depth, id: depth === 0 ? -1 : span.start, expanded: isOpen, expandable });
      if (isOpen) {
        for (const child of childrenOf(span)) pushNode(child, depth + 1);
      }
    };
    pushNode(root, 0);
    return out;
  }, [root, expanded, childrenOf]);

  const onToggle = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const viewportRef = useCallback((el: HTMLDivElement | null) => {
    if (el) setViewport(el.clientHeight);
  }, []);

  if (!root) {
    // Not JSON (e.g. _cat plain text) — show raw, bounded.
    return (
      <pre className="json-raw" style={{ maxHeight: height }}>
        {text.length > 200_000 ? `${text.slice(0, 200_000)}\n… (${formatBytes(text.length)} total)` : text}
      </pre>
    );
  }

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  const visible = rows.slice(first, last);

  return (
    <div className="json-tree">
      <div className="json-tree-meta hint">
        {formatBytes(text.length)} · {rows.length.toLocaleString()} visible nodes
      </div>
      <div
        className="json-tree-viewport"
        style={{ height: Math.min(height, rows.length * ROW_HEIGHT + 8) }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        ref={viewportRef}
      >
        <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
          {visible.map((row, i) => (
            <TreeRow
              key={row.id}
              row={row}
              text={text}
              top={(first + i) * ROW_HEIGHT}
              onToggle={onToggle}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TreeRow({
  row,
  text,
  top,
  onToggle,
}: {
  row: Row;
  text: string;
  top: number;
  onToggle: (id: number) => void;
}) {
  const { span, depth, expandable } = row;
  const style: CSSProperties = {
    position: 'absolute',
    top,
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    paddingLeft: 8 + depth * 18,
  };

  let valueNode: React.ReactNode;
  if (expandable) {
    valueNode = <span className="jt-preview">{previewSpan(text, span)}</span>;
  } else {
    const v = parsePrimitive(text, span);
    const cls =
      span.kind === 'string'
        ? 'jt-string'
        : span.kind === 'number'
          ? 'jt-number'
          : 'jt-keyword';
    valueNode = <span className={cls}>{span.kind === 'string' ? JSON.stringify(v) : String(v)}</span>;
  }

  return (
    <div className="jt-row" style={style}>
      {expandable ? (
        <button
          className="jt-caret"
          onClick={() => onToggle(row.id)}
          aria-label={row.expanded ? 'Collapse' : 'Expand'}
        >
          {row.expanded ? '▾' : '▸'}
        </button>
      ) : (
        <span className="jt-caret-placeholder" />
      )}
      {span.key !== undefined ? (
        <span className="jt-key">{span.key}: </span>
      ) : depth > 0 ? (
        <span className="jt-index">{span.index}: </span>
      ) : null}
      {valueNode}
    </div>
  );
}
