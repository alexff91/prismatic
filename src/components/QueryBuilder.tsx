import {
  addChild,
  emptyClause,
  emptyGroup,
  OCCURRENCE_LABELS,
  OPERATOR_LABELS,
  removeNode,
  updateNode,
  type Clause,
  type ClauseOperator,
  type Group,
  type Occurrence,
  type QueryModel,
} from '../lib/querybuilder/model';

interface QueryBuilderProps {
  model: QueryModel;
  onChange: (model: QueryModel) => void;
  /** Known field names for datalist suggestions (from the index mapping). */
  fields: string[];
}

export function QueryBuilder({ model, onChange, fields }: QueryBuilderProps) {
  const setRoot = (root: Group) => onChange({ ...model, root });

  return (
    <div className="qb">
      <datalist id="qb-fields">
        {fields.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <GroupEditor group={model.root} root={model.root} setRoot={setRoot} depth={0} />
      <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <label className="hint">size</label>
        <input
          type="number"
          min={0}
          max={10000}
          style={{ width: 80 }}
          value={model.size}
          onChange={(e) => onChange({ ...model, size: Number(e.target.value) })}
        />
        <label className="hint">from</label>
        <input
          type="number"
          min={0}
          style={{ width: 80 }}
          value={model.from}
          onChange={(e) => onChange({ ...model, from: Number(e.target.value) })}
        />
        <label className="hint">sort by</label>
        <input
          list="qb-fields"
          placeholder="(score)"
          style={{ width: 160 }}
          value={model.sortField}
          onChange={(e) => onChange({ ...model, sortField: e.target.value })}
        />
        <select
          value={model.sortOrder}
          onChange={(e) => onChange({ ...model, sortOrder: e.target.value as 'asc' | 'desc' })}
        >
          <option value="desc">desc</option>
          <option value="asc">asc</option>
        </select>
        <label className="hint">_source</label>
        <input
          placeholder="all fields (comma-sep to limit)"
          style={{ width: 220 }}
          value={model.sourceIncludes}
          onChange={(e) => onChange({ ...model, sourceIncludes: e.target.value })}
        />
      </div>
    </div>
  );
}

function GroupEditor({
  group,
  root,
  setRoot,
  depth,
}: {
  group: Group;
  root: Group;
  setRoot: (g: Group) => void;
  depth: number;
}) {
  return (
    <div className="qb-group" style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <select
          value={group.occurrence}
          onChange={(e) =>
            setRoot(
              updateNode(root, group.id, (n) => ({
                ...(n as Group),
                occurrence: e.target.value as Occurrence,
              })),
            )
          }
        >
          {Object.entries(OCCURRENCE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <button
          className="btn small"
          onClick={() => setRoot(addChild(root, group.id, emptyClause()))}
        >
          + condition
        </button>
        <button
          className="btn small"
          onClick={() => setRoot(addChild(root, group.id, emptyGroup('should')))}
        >
          + group
        </button>
        {depth > 0 && (
          <button className="btn small danger" onClick={() => setRoot(removeNode(root, group.id))}>
            ✕
          </button>
        )}
      </div>
      {group.children.map((child) =>
        child.kind === 'group' ? (
          <GroupEditor key={child.id} group={child} root={root} setRoot={setRoot} depth={depth + 1} />
        ) : (
          <ClauseEditor key={child.id} clause={child} root={root} setRoot={setRoot} />
        ),
      )}
    </div>
  );
}

function ClauseEditor({
  clause,
  root,
  setRoot,
}: {
  clause: Clause;
  root: Group;
  setRoot: (g: Group) => void;
}) {
  const update = (patch: Partial<Clause>) =>
    setRoot(updateNode(root, clause.id, (n) => ({ ...(n as Clause), ...patch })));

  const needsValue = clause.operator !== 'exists';
  const isBetween = clause.operator === 'range_between';

  return (
    <div className="row qb-clause" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
      <input
        list="qb-fields"
        placeholder={clause.operator === 'query_string' ? 'default field (optional)' : 'field'}
        style={{ width: 200 }}
        value={clause.field}
        onChange={(e) => update({ field: e.target.value })}
      />
      <select
        value={clause.operator}
        onChange={(e) => update({ operator: e.target.value as ClauseOperator })}
      >
        {Object.entries(OPERATOR_LABELS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      {needsValue && (
        <input
          placeholder={isBetween ? 'from (e.g. now-1h)' : 'value'}
          style={{ width: isBetween ? 160 : 240 }}
          value={clause.value}
          onChange={(e) => update({ value: e.target.value })}
        />
      )}
      {isBetween && (
        <input
          placeholder="to (e.g. now)"
          style={{ width: 160 }}
          value={clause.value2 ?? ''}
          onChange={(e) => update({ value2: e.target.value })}
        />
      )}
      <button className="btn small danger" onClick={() => setRoot(removeNode(root, clause.id))}>
        ✕
      </button>
    </div>
  );
}
