import type { Clause, Group, QueryModel, QueryNode } from './model';

type Dsl = Record<string, unknown>;

/** Coerce numeric-looking strings so term/range queries hit numeric fields. */
function coerce(value: string): string | number | boolean {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed)) && !/^0\d/.test(trimmed)) {
    return Number(trimmed);
  }
  return value;
}

export function compileClause(clause: Clause): Dsl | null {
  const { field, operator, value, value2 } = clause;
  if (operator !== 'query_string' && field.trim() === '') return null;
  if (operator !== 'exists' && operator !== 'query_string' && value.trim() === '') return null;

  switch (operator) {
    case 'match':
      return { match: { [field]: value } };
    case 'match_phrase':
      return { match_phrase: { [field]: value } };
    case 'term':
      return { term: { [field]: coerce(value) } };
    case 'terms':
      return {
        terms: { [field]: value.split(',').map((v) => coerce(v.trim())).filter((v) => v !== '') },
      };
    case 'prefix':
      return { prefix: { [field]: value } };
    case 'wildcard':
      return { wildcard: { [field]: value } };
    case 'exists':
      return { exists: { field } };
    case 'range_gte':
      return { range: { [field]: { gte: coerce(value) } } };
    case 'range_lte':
      return { range: { [field]: { lte: coerce(value) } } };
    case 'range_between':
      return { range: { [field]: { gte: coerce(value), lte: coerce(value2 ?? '') } } };
    case 'query_string':
      return value.trim() === ''
        ? null
        : { query_string: { query: value, ...(field.trim() ? { default_field: field } : {}) } };
  }
}

function compileNode(node: QueryNode): Dsl | null {
  return node.kind === 'clause' ? compileClause(node) : compileGroup(node);
}

export function compileGroup(group: Group): Dsl | null {
  const buckets: Record<string, Dsl[]> = { must: [], should: [], must_not: [], filter: [] };
  for (const child of group.children) {
    const compiled = compileNode(child);
    if (!compiled) continue;
    if (child.kind === 'group') {
      // A nested group carries its own occurrence within this bool.
      buckets[child.occurrence]!.push(compiled);
    } else {
      buckets[group.occurrence]!.push(compiled);
    }
  }
  const bool: Dsl = {};
  for (const [occ, clauses] of Object.entries(buckets)) {
    if (clauses.length > 0) bool[occ] = clauses;
  }
  if (Object.keys(bool).length === 0) return null;
  if ('should' in bool) bool.minimum_should_match = 1;
  return { bool };
}

export interface CompiledSearch {
  body: Dsl;
  bodyText: string;
}

export function compileSearch(model: QueryModel): CompiledSearch {
  const query = compileGroup(model.root) ?? { match_all: {} };
  const body: Dsl = { query, size: model.size, from: model.from };
  if (model.sortField.trim() !== '') {
    body.sort = [{ [model.sortField.trim()]: { order: model.sortOrder } }];
  }
  if (model.sourceIncludes.trim() !== '') {
    body._source = model.sourceIncludes.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return { body, bodyText: JSON.stringify(body, null, 2) };
}
