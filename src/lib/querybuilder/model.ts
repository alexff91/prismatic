/**
 * Visual query builder model.
 *
 * A query is a tree of groups (bool occurrences) and clauses. The model
 * is deliberately small and serializable; `compile.ts` turns it into
 * Query DSL that works on both Elasticsearch and OpenSearch.
 */

export type Occurrence = 'must' | 'should' | 'must_not' | 'filter';

export type ClauseOperator =
  | 'match'
  | 'match_phrase'
  | 'term'
  | 'terms'
  | 'prefix'
  | 'wildcard'
  | 'exists'
  | 'range_gte'
  | 'range_lte'
  | 'range_between'
  | 'query_string';

export interface Clause {
  kind: 'clause';
  id: string;
  field: string;
  operator: ClauseOperator;
  /** Primary value (lower bound for range_between). */
  value: string;
  /** Upper bound for range_between; unused otherwise. */
  value2?: string;
}

export interface Group {
  kind: 'group';
  id: string;
  occurrence: Occurrence;
  children: QueryNode[];
}

export type QueryNode = Clause | Group;

export interface QueryModel {
  root: Group;
  size: number;
  from: number;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  sourceIncludes: string;
}

export const OPERATOR_LABELS: Record<ClauseOperator, string> = {
  match: 'matches (full text)',
  match_phrase: 'matches phrase',
  term: 'equals (exact)',
  terms: 'is one of (comma-sep)',
  prefix: 'starts with',
  wildcard: 'wildcard (* and ?)',
  exists: 'exists',
  range_gte: '≥',
  range_lte: '≤',
  range_between: 'between',
  query_string: 'query string (Lucene)',
};

export const OCCURRENCE_LABELS: Record<Occurrence, string> = {
  must: 'AND (must)',
  filter: 'AND, unscored (filter)',
  should: 'OR (should)',
  must_not: 'NOT (must_not)',
};

let counter = 0;
export function nextId(): string {
  counter += 1;
  return `n${counter}`;
}

export function emptyClause(): Clause {
  return { kind: 'clause', id: nextId(), field: '', operator: 'match', value: '' };
}

export function emptyGroup(occurrence: Occurrence = 'must'): Group {
  return { kind: 'group', id: nextId(), occurrence, children: [emptyClause()] };
}

export function defaultModel(): QueryModel {
  return {
    root: emptyGroup(),
    size: 10,
    from: 0,
    sortField: '',
    sortOrder: 'desc',
    sourceIncludes: '',
  };
}

/** Immutable update helpers. */
export function updateNode(root: Group, id: string, fn: (n: QueryNode) => QueryNode): Group {
  const walk = (node: QueryNode): QueryNode => {
    if (node.id === id) return fn(node);
    if (node.kind === 'group') {
      return { ...node, children: node.children.map(walk) };
    }
    return node;
  };
  return walk(root) as Group;
}

export function removeNode(root: Group, id: string): Group {
  const walk = (group: Group): Group => ({
    ...group,
    children: group.children
      .filter((c) => c.id !== id)
      .map((c) => (c.kind === 'group' ? walk(c) : c)),
  });
  return walk(root);
}

export function addChild(root: Group, groupId: string, child: QueryNode): Group {
  return updateNode(root, groupId, (n) =>
    n.kind === 'group' ? { ...n, children: [...n.children, child] } : n,
  ) as Group;
}
