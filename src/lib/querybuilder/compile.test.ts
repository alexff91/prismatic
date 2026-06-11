import { describe, expect, it } from 'vitest';
import { compileClause, compileGroup, compileSearch } from './compile';
import { defaultModel, emptyGroup, type Clause, type Group } from './model';

function clause(partial: Partial<Clause>): Clause {
  return { kind: 'clause', id: 'c', field: '', operator: 'match', value: '', ...partial };
}

describe('compileClause', () => {
  it('compiles match / term / phrase', () => {
    expect(compileClause(clause({ field: 'msg', operator: 'match', value: 'error' }))).toEqual({
      match: { msg: 'error' },
    });
    expect(compileClause(clause({ field: 'level', operator: 'term', value: 'warn' }))).toEqual({
      term: { level: 'warn' },
    });
    expect(
      compileClause(clause({ field: 'msg', operator: 'match_phrase', value: 'disk full' })),
    ).toEqual({ match_phrase: { msg: 'disk full' } });
  });

  it('coerces numerics and booleans for exact operators', () => {
    expect(compileClause(clause({ field: 'code', operator: 'term', value: '503' }))).toEqual({
      term: { code: 503 },
    });
    expect(compileClause(clause({ field: 'ok', operator: 'term', value: 'false' }))).toEqual({
      term: { ok: false },
    });
    // Leading-zero ids must stay strings.
    expect(compileClause(clause({ field: 'id', operator: 'term', value: '007' }))).toEqual({
      term: { id: '007' },
    });
  });

  it('compiles terms lists and ranges', () => {
    expect(
      compileClause(clause({ field: 'status', operator: 'terms', value: '200, 301,404' })),
    ).toEqual({ terms: { status: [200, 301, 404] } });
    expect(
      compileClause(
        clause({ field: 'ts', operator: 'range_between', value: 'now-1h', value2: 'now' }),
      ),
    ).toEqual({ range: { ts: { gte: 'now-1h', lte: 'now' } } });
  });

  it('compiles exists and query_string', () => {
    expect(compileClause(clause({ field: 'trace.id', operator: 'exists' }))).toEqual({
      exists: { field: 'trace.id' },
    });
    expect(
      compileClause(clause({ field: '', operator: 'query_string', value: 'a AND b' })),
    ).toEqual({ query_string: { query: 'a AND b' } });
  });

  it('returns null for incomplete clauses', () => {
    expect(compileClause(clause({ field: '', operator: 'match', value: 'x' }))).toBeNull();
    expect(compileClause(clause({ field: 'f', operator: 'match', value: '' }))).toBeNull();
  });
});

describe('compileGroup', () => {
  it('buckets clauses under the group occurrence', () => {
    const g: Group = {
      ...emptyGroup('filter'),
      children: [
        clause({ id: 'a', field: 'level', operator: 'term', value: 'error' }),
        clause({ id: 'b', field: 'svc', operator: 'term', value: 'api' }),
      ],
    };
    expect(compileGroup(g)).toEqual({
      bool: { filter: [{ term: { level: 'error' } }, { term: { svc: 'api' } }] },
    });
  });

  it('adds minimum_should_match for OR groups', () => {
    const g: Group = {
      ...emptyGroup('should'),
      children: [
        clause({ id: 'a', field: 'a', operator: 'term', value: '1' }),
        clause({ id: 'b', field: 'b', operator: 'term', value: '2' }),
      ],
    };
    const dsl = compileGroup(g) as { bool: Record<string, unknown> };
    expect(dsl.bool.minimum_should_match).toBe(1);
  });

  it('nests groups with their own occurrence', () => {
    const inner: Group = {
      ...emptyGroup('must_not'),
      children: [clause({ id: 'x', field: 'env', operator: 'term', value: 'dev' })],
    };
    const outer: Group = {
      ...emptyGroup('must'),
      children: [clause({ id: 'a', field: 'msg', operator: 'match', value: 'timeout' }), inner],
    };
    expect(compileGroup(outer)).toEqual({
      bool: {
        must: [{ match: { msg: 'timeout' } }],
        must_not: [{ bool: { must_not: [{ term: { env: 'dev' } }] } }],
      },
    });
  });

  it('returns null when nothing compiled', () => {
    expect(compileGroup(emptyGroup())).toBeNull();
  });
});

describe('compileSearch', () => {
  it('falls back to match_all and applies size/from/sort/_source', () => {
    const model = {
      ...defaultModel(),
      size: 25,
      from: 50,
      sortField: '@timestamp',
      sortOrder: 'desc' as const,
      sourceIncludes: 'msg, level',
    };
    expect(compileSearch(model).body).toEqual({
      query: { match_all: {} },
      size: 25,
      from: 50,
      sort: [{ '@timestamp': { order: 'desc' } }],
      _source: ['msg', 'level'],
    });
  });
});
