const { prisma } = require('../config/database');

const DATASET_DEFINITIONS = {
  leads: {
    key: 'leads',
    label: 'Leads',
    defaultSortField: 'createdAt',
    fields: [
      { key: 'id', label: 'Lead ID', kind: 'dimension', dataType: 'string' },
      { key: 'firstName', label: 'First Name', kind: 'dimension', dataType: 'string' },
      { key: 'lastName', label: 'Last Name', kind: 'dimension', dataType: 'string' },
      { key: 'fullName', label: 'Full Name', kind: 'dimension', dataType: 'string' },
      { key: 'email', label: 'Email', kind: 'dimension', dataType: 'string' },
      { key: 'phone', label: 'Phone', kind: 'dimension', dataType: 'string' },
      { key: 'company', label: 'Company', kind: 'dimension', dataType: 'string' },
      { key: 'jobTitle', label: 'Job Title', kind: 'dimension', dataType: 'string' },
      { key: 'source', label: 'Source', kind: 'dimension', dataType: 'string' },
      { key: 'status', label: 'Status', kind: 'dimension', dataType: 'string' },
      { key: 'score', label: 'Score', kind: 'measure', dataType: 'number' },
      { key: 'budget', label: 'Budget', kind: 'measure', dataType: 'number' },
      { key: 'conversionProb', label: 'Conversion Probability', kind: 'measure', dataType: 'number' },
      { key: 'productInterest', label: 'Product Interest', kind: 'dimension', dataType: 'string' },
      { key: 'location', label: 'Location', kind: 'dimension', dataType: 'string' },
      { key: 'campaign', label: 'Campaign', kind: 'dimension', dataType: 'string' },
      { key: 'website', label: 'Website', kind: 'dimension', dataType: 'string' },
      { key: 'stage.name', label: 'Pipeline Stage', kind: 'dimension', dataType: 'string' },
      { key: 'assignedTo.fullName', label: 'Assigned To', kind: 'dimension', dataType: 'string' },
      { key: 'createdBy.fullName', label: 'Created By', kind: 'dimension', dataType: 'string' },
      { key: 'createdAt', label: 'Created At', kind: 'dimension', dataType: 'date' },
      { key: 'updatedAt', label: 'Updated At', kind: 'dimension', dataType: 'date' },
      { key: 'wonAt', label: 'Won At', kind: 'dimension', dataType: 'date' },
      { key: 'lostAt', label: 'Lost At', kind: 'dimension', dataType: 'date' },
      { key: 'doNotCall', label: 'Do Not Call', kind: 'dimension', dataType: 'boolean' },
    ],
  },
  tasks: {
    key: 'tasks',
    label: 'Tasks',
    defaultSortField: 'createdAt',
    fields: [
      { key: 'id', label: 'Task ID', kind: 'dimension', dataType: 'string' },
      { key: 'title', label: 'Title', kind: 'dimension', dataType: 'string' },
      { key: 'type', label: 'Type', kind: 'dimension', dataType: 'string' },
      { key: 'status', label: 'Status', kind: 'dimension', dataType: 'string' },
      { key: 'priority', label: 'Priority', kind: 'dimension', dataType: 'string' },
      { key: 'description', label: 'Description', kind: 'dimension', dataType: 'string' },
      { key: 'dueAt', label: 'Due At', kind: 'dimension', dataType: 'date' },
      { key: 'completedAt', label: 'Completed At', kind: 'dimension', dataType: 'date' },
      { key: 'assignee.fullName', label: 'Assignee', kind: 'dimension', dataType: 'string' },
      { key: 'lead.fullName', label: 'Lead', kind: 'dimension', dataType: 'string' },
      { key: 'lead.status', label: 'Lead Status', kind: 'dimension', dataType: 'string' },
      { key: 'lead.source', label: 'Lead Source', kind: 'dimension', dataType: 'string' },
      { key: 'createdAt', label: 'Created At', kind: 'dimension', dataType: 'date' },
      { key: 'updatedAt', label: 'Updated At', kind: 'dimension', dataType: 'date' },
    ],
  },
  call_logs: {
    key: 'call_logs',
    label: 'Call Logs',
    defaultSortField: 'createdAt',
    fields: [
      { key: 'id', label: 'Call Log ID', kind: 'dimension', dataType: 'string' },
      { key: 'disposition', label: 'Disposition', kind: 'dimension', dataType: 'string' },
      { key: 'duration', label: 'Duration (seconds)', kind: 'measure', dataType: 'number' },
      { key: 'notes', label: 'Notes', kind: 'dimension', dataType: 'string' },
      { key: 'callbackDate', label: 'Callback Date', kind: 'dimension', dataType: 'date' },
      { key: 'meetingDate', label: 'Meeting Date', kind: 'dimension', dataType: 'date' },
      { key: 'appointmentDate', label: 'Appointment Date', kind: 'dimension', dataType: 'date' },
      { key: 'callOutcomeReason', label: 'Outcome Reason', kind: 'dimension', dataType: 'string' },
      { key: 'callOutcomeKey', label: 'Outcome Key', kind: 'dimension', dataType: 'string' },
      { key: 'insideOutsideCenter', label: 'Inside/Outside Center', kind: 'dimension', dataType: 'string' },
      { key: 'lead.id', label: 'Lead ID', kind: 'dimension', dataType: 'string' },
      { key: 'lead.fullName', label: 'Lead Name', kind: 'dimension', dataType: 'string' },
      { key: 'lead.status', label: 'Lead Status', kind: 'dimension', dataType: 'string' },
      { key: 'lead.source', label: 'Lead Source', kind: 'dimension', dataType: 'string' },
      { key: 'user.fullName', label: 'Logged By', kind: 'dimension', dataType: 'string' },
      { key: 'createdAt', label: 'Created At', kind: 'dimension', dataType: 'date' },
    ],
  },
  contacts: {
    key: 'contacts',
    label: 'Contacts',
    defaultSortField: 'createdAt',
    fields: [
      { key: 'id', label: 'Contact ID', kind: 'dimension', dataType: 'string' },
      { key: 'firstName', label: 'First Name', kind: 'dimension', dataType: 'string' },
      { key: 'lastName', label: 'Last Name', kind: 'dimension', dataType: 'string' },
      { key: 'fullName', label: 'Full Name', kind: 'dimension', dataType: 'string' },
      { key: 'email', label: 'Email', kind: 'dimension', dataType: 'string' },
      { key: 'phone', label: 'Phone', kind: 'dimension', dataType: 'string' },
      { key: 'mobile', label: 'Mobile', kind: 'dimension', dataType: 'string' },
      { key: 'company', label: 'Company', kind: 'dimension', dataType: 'string' },
      { key: 'jobTitle', label: 'Job Title', kind: 'dimension', dataType: 'string' },
      { key: 'department', label: 'Department', kind: 'dimension', dataType: 'string' },
      { key: 'source', label: 'Source', kind: 'dimension', dataType: 'string' },
      { key: 'lifecycle', label: 'Lifecycle', kind: 'dimension', dataType: 'string' },
      { key: 'type', label: 'Type', kind: 'dimension', dataType: 'string' },
      { key: 'city', label: 'City', kind: 'dimension', dataType: 'string' },
      { key: 'country', label: 'Country', kind: 'dimension', dataType: 'string' },
      { key: 'score', label: 'Score', kind: 'measure', dataType: 'number' },
      { key: 'owner.fullName', label: 'Owner', kind: 'dimension', dataType: 'string' },
      { key: 'createdBy.fullName', label: 'Created By', kind: 'dimension', dataType: 'string' },
      { key: 'lastContactedAt', label: 'Last Contacted At', kind: 'dimension', dataType: 'date' },
      { key: 'createdAt', label: 'Created At', kind: 'dimension', dataType: 'date' },
      { key: 'updatedAt', label: 'Updated At', kind: 'dimension', dataType: 'date' },
      { key: 'doNotEmail', label: 'Do Not Email', kind: 'dimension', dataType: 'boolean' },
      { key: 'doNotCall', label: 'Do Not Call', kind: 'dimension', dataType: 'boolean' },
      { key: 'hasOptedOutEmail', label: 'Has Opted Out Email', kind: 'dimension', dataType: 'boolean' },
    ],
  },
  deals: {
    key: 'deals',
    label: 'Deals',
    defaultSortField: 'createdAt',
    fields: [
      { key: 'id', label: 'Deal ID', kind: 'dimension', dataType: 'string' },
      { key: 'name', label: 'Deal Name', kind: 'dimension', dataType: 'string' },
      { key: 'amount', label: 'Amount', kind: 'measure', dataType: 'number' },
      { key: 'stage', label: 'Stage', kind: 'dimension', dataType: 'string' },
      { key: 'status', label: 'Status', kind: 'dimension', dataType: 'string' },
      { key: 'probability', label: 'Probability', kind: 'measure', dataType: 'number' },
      { key: 'description', label: 'Description', kind: 'dimension', dataType: 'string' },
      { key: 'closeDate', label: 'Close Date', kind: 'dimension', dataType: 'date' },
      { key: 'owner.fullName', label: 'Owner', kind: 'dimension', dataType: 'string' },
      { key: 'contact.id', label: 'Contact ID', kind: 'dimension', dataType: 'string' },
      { key: 'contact.fullName', label: 'Contact Name', kind: 'dimension', dataType: 'string' },
      { key: 'contact.company', label: 'Contact Company', kind: 'dimension', dataType: 'string' },
      { key: 'contact.lifecycle', label: 'Contact Lifecycle', kind: 'dimension', dataType: 'string' },
      { key: 'createdAt', label: 'Created At', kind: 'dimension', dataType: 'date' },
      { key: 'updatedAt', label: 'Updated At', kind: 'dimension', dataType: 'date' },
    ],
  },
};

const SUPPORTED_OPERATORS = new Set([
  'eq', 'neq', 'contains', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null',
]);

function getDatasetDefinition(dataset) {
  return DATASET_DEFINITIONS[dataset] || DATASET_DEFINITIONS.leads;
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeDateOnly(value) {
  const d = toDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeForCompare(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value).trim().toLowerCase();
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function applyTimeGrain(rawValue, timeGrain) {
  if (!timeGrain) return rawValue;
  const d = toDate(rawValue);
  if (!d) return rawValue;
  if (timeGrain === 'day') return d.toISOString().slice(0, 10);
  if (timeGrain === 'week') return isoWeek(d);
  if (timeGrain === 'month') return d.toISOString().slice(0, 7);
  if (timeGrain === 'quarter') {
    const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
    return `${d.getUTCFullYear()}-Q${quarter}`;
  }
  return rawValue;
}

function getPersonFullName(user) {
  if (!user) return null;
  const first = (user.firstName || '').trim();
  const last = (user.lastName || '').trim();
  if (first && last) return `${first} ${last}`;
  return first || last || null;
}

function readNestedValue(obj, path) {
  if (!obj || !path) return null;
  const segments = path.split('.');
  let current = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return null;
    current = current[segment];
  }
  return current ?? null;
}

function getCallReason(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  return metadata.notInterestedReasonLabel
    || metadata.notInterestedReason
    || metadata.reasonLabel
    || metadata.reason
    || null;
}

function getInsideOutsideCenter(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  return metadata.completedServicesLocation || metadata.serviceLocation || null;
}

function getFieldValue(row, fieldKey, dataset) {
  if (!row || !fieldKey) return null;

  if (fieldKey.startsWith('custom.')) {
    const customKey = fieldKey.replace('custom.', '');
    const customData = row.customData && typeof row.customData === 'object' ? row.customData : {};
    return customData[customKey] ?? null;
  }

  if (fieldKey.startsWith('calc.')) {
    return row[fieldKey] ?? null;
  }

  if (fieldKey === 'fullName') {
    const first = row.firstName || '';
    const last = row.lastName || '';
    return `${first} ${last}`.trim() || null;
  }
  if (fieldKey === 'assignedTo.fullName') return getPersonFullName(row.assignedTo);
  if (fieldKey === 'createdBy.fullName') return getPersonFullName(row.createdBy);
  if (fieldKey === 'assignee.fullName') return getPersonFullName(row.assignee);
  if (fieldKey === 'lead.fullName') return getPersonFullName(row.lead);
  if (fieldKey === 'user.fullName') return getPersonFullName(row.user);
  if (fieldKey === 'owner.fullName') return getPersonFullName(row.owner);
  if (fieldKey === 'contact.fullName') return getPersonFullName(row.contact);
  if (fieldKey === 'callOutcomeReason') return getCallReason(row.metadata);
  if (fieldKey === 'callOutcomeKey') return row?.metadata?.dispositionKey || null;
  if (fieldKey === 'insideOutsideCenter') return getInsideOutsideCenter(row.metadata);

  if (dataset === 'tasks' && fieldKey === 'lead.status') {
    return row?.lead?.status || null;
  }
  if (dataset === 'tasks' && fieldKey === 'lead.source') {
    return row?.lead?.source || null;
  }
  if (dataset === 'call_logs' && fieldKey === 'lead.status') {
    return row?.lead?.status || null;
  }
  if (dataset === 'call_logs' && fieldKey === 'lead.source') {
    return row?.lead?.source || null;
  }
  if (dataset === 'deals' && fieldKey === 'contact.company') {
    return row?.contact?.company || null;
  }
  if (dataset === 'deals' && fieldKey === 'contact.lifecycle') {
    return row?.contact?.lifecycle || null;
  }

  if (fieldKey.includes('.')) return readNestedValue(row, fieldKey);
  return row[fieldKey] ?? null;
}

function compareValues(actualValue, operator, rawValue, rawValueTo) {
  if (!SUPPORTED_OPERATORS.has(operator)) return true;
  if (operator === 'is_null') return actualValue === null || actualValue === undefined || actualValue === '';
  if (operator === 'is_not_null') return !(actualValue === null || actualValue === undefined || actualValue === '');

  if (operator === 'contains') {
    const haystack = normalizeForCompare(actualValue);
    const needle = normalizeForCompare(rawValue);
    return haystack.includes(needle);
  }

  if (operator === 'in') {
    const values = Array.isArray(rawValue)
      ? rawValue
      : String(rawValue || '').split(',').map((v) => v.trim()).filter(Boolean);
    const actualNorm = normalizeForCompare(actualValue);
    return values.map(normalizeForCompare).includes(actualNorm);
  }

  if (operator === 'eq' || operator === 'neq') {
    const leftNum = toNumber(actualValue);
    const rightNum = toNumber(rawValue);
    let isEqual;
    if (leftNum !== null && rightNum !== null) {
      isEqual = leftNum === rightNum;
    } else {
      const leftDate = toDate(actualValue);
      const rightDate = toDate(rawValue);
      if (leftDate && rightDate) {
        isEqual = leftDate.getTime() === rightDate.getTime();
      } else {
        isEqual = normalizeForCompare(actualValue) === normalizeForCompare(rawValue);
      }
    }
    return operator === 'eq' ? isEqual : !isEqual;
  }

  if (operator === 'between') {
    const leftNum = toNumber(actualValue);
    const lowNum = toNumber(rawValue);
    const highNum = toNumber(rawValueTo);
    if (leftNum !== null && lowNum !== null && highNum !== null) {
      return leftNum >= lowNum && leftNum <= highNum;
    }
    const leftDate = toDate(actualValue);
    const lowDate = toDate(rawValue);
    const highDate = toDate(rawValueTo);
    if (leftDate && lowDate && highDate) {
      return leftDate >= lowDate && leftDate <= highDate;
    }
    return false;
  }

  const leftNum = toNumber(actualValue);
  const rightNum = toNumber(rawValue);
  if (leftNum !== null && rightNum !== null) {
    if (operator === 'gt') return leftNum > rightNum;
    if (operator === 'gte') return leftNum >= rightNum;
    if (operator === 'lt') return leftNum < rightNum;
    if (operator === 'lte') return leftNum <= rightNum;
  }

  const leftDate = toDate(actualValue);
  const rightDate = toDate(rawValue);
  if (leftDate && rightDate) {
    if (operator === 'gt') return leftDate > rightDate;
    if (operator === 'gte') return leftDate >= rightDate;
    if (operator === 'lt') return leftDate < rightDate;
    if (operator === 'lte') return leftDate <= rightDate;
  }

  const left = normalizeForCompare(actualValue);
  const right = normalizeForCompare(rawValue);
  if (operator === 'gt') return left > right;
  if (operator === 'gte') return left >= right;
  if (operator === 'lt') return left < right;
  if (operator === 'lte') return left <= right;
  return true;
}

function evaluateFormula(formula, context) {
  const expression = String(formula || '');
  const interpolated = expression.replace(/\{([^}]+)\}/g, (_m, key) => {
    const value = context[key.trim()];
    const numeric = toNumber(value);
    return numeric !== null ? String(numeric) : '0';
  });
  if (!/^[0-9+\-*/().\s]+$/.test(interpolated)) {
    throw new Error('Formula can only contain numbers, operators and {field} placeholders.');
  }
  // eslint-disable-next-line no-new-func
  const result = Function(`"use strict"; return (${interpolated});`)();
  const numeric = toNumber(result);
  return numeric === null ? 0 : numeric;
}

function applyCalculatedFields(rows, calculatedFields, scope, dataset) {
  if (!Array.isArray(calculatedFields) || calculatedFields.length === 0) return rows;
  return rows.map((row) => {
    const next = { ...row };
    for (const calc of calculatedFields) {
      const calcScope = calc.scope || 'aggregate';
      if (calcScope !== scope) continue;
      if (!calc.key || !calc.formula) continue;
      const context = {};
      for (const [k, v] of Object.entries(next)) context[k] = v;
      if (dataset && next.__raw) {
        context.__dataset = dataset;
        for (const [k, v] of Object.entries(next.__raw)) context[k] = v;
      }
      try {
        next[`calc.${calc.key}`] = evaluateFormula(calc.formula, context);
      } catch {
        next[`calc.${calc.key}`] = 0;
      }
    }
    return next;
  });
}

function buildMeasureKey(measure, idx) {
  const agg = String(measure.agg || 'count').toLowerCase();
  const field = measure.field ? String(measure.field) : 'all';
  return measure.key || `${agg}:${field}:${idx}`;
}

function buildMeasureLabel(measure) {
  if (measure.label) return measure.label;
  const agg = String(measure.agg || 'count').toUpperCase();
  const field = measure.field ? String(measure.field) : 'records';
  return `${agg} ${field}`;
}

function aggregateRows(rawRows, config, dataset) {
  const dimensions = Array.isArray(config.dimensions) ? config.dimensions : [];
  const measures = Array.isArray(config.measures) && config.measures.length > 0
    ? config.measures
    : [{ agg: 'count', field: 'id', label: 'Count' }];
  const timeGrain = config.timeGrain || null;

  const groups = new Map();
  const groupKeys = dimensions.length > 0 ? dimensions : ['__all'];

  for (const sourceRow of rawRows) {
    const working = { ...sourceRow, __raw: sourceRow };
    const keyParts = groupKeys.map((dim) => {
      if (dim === '__all') return '__all';
      const rawValue = getFieldValue(sourceRow, dim, dataset);
      const value = applyTimeGrain(rawValue, timeGrain);
      return value === null || value === undefined || value === '' ? '__empty__' : String(value);
    });
    const groupKey = keyParts.join('|');
    if (!groups.has(groupKey)) {
      const seed = { __rows: 0, __sum: {}, __avgCount: {}, __min: {}, __max: {} };
      if (dimensions.length > 0) {
        dimensions.forEach((dim, idx) => {
          const rawValue = getFieldValue(sourceRow, dim, dataset);
          seed[dim] = applyTimeGrain(rawValue, timeGrain);
        });
      }
      groups.set(groupKey, seed);
    }

    const target = groups.get(groupKey);
    target.__rows += 1;

    measures.forEach((measure, index) => {
      const agg = String(measure.agg || 'count').toLowerCase();
      const measureKey = buildMeasureKey(measure, index);
      const value = measure.field ? getFieldValue(sourceRow, measure.field, dataset) : 1;

      if (agg === 'count') {
        target[measureKey] = (target[measureKey] || 0) + 1;
        return;
      }
      if (agg === 'count_distinct') {
        const distinctSetKey = `__distinct_${measureKey}`;
        if (!target[distinctSetKey]) target[distinctSetKey] = new Set();
        target[distinctSetKey].add(value === null || value === undefined ? '__null__' : String(value));
        target[measureKey] = target[distinctSetKey].size;
        return;
      }

      const numeric = toNumber(value);
      if (numeric === null) return;

      if (agg === 'sum') {
        target.__sum[measureKey] = (target.__sum[measureKey] || 0) + numeric;
        target[measureKey] = target.__sum[measureKey];
        return;
      }
      if (agg === 'avg') {
        target.__sum[measureKey] = (target.__sum[measureKey] || 0) + numeric;
        target.__avgCount[measureKey] = (target.__avgCount[measureKey] || 0) + 1;
        target[measureKey] = target.__avgCount[measureKey] > 0
          ? target.__sum[measureKey] / target.__avgCount[measureKey]
          : 0;
        return;
      }
      if (agg === 'min') {
        target.__min[measureKey] = target.__min[measureKey] === undefined
          ? numeric
          : Math.min(target.__min[measureKey], numeric);
        target[measureKey] = target.__min[measureKey];
        return;
      }
      if (agg === 'max') {
        target.__max[measureKey] = target.__max[measureKey] === undefined
          ? numeric
          : Math.max(target.__max[measureKey], numeric);
        target[measureKey] = target.__max[measureKey];
      }
    });
  }

  const rows = Array.from(groups.values()).map((group) => {
    const row = {};
    dimensions.forEach((dim) => {
      row[dim] = group[dim] === '__empty__' ? null : group[dim];
    });
    measures.forEach((measure, idx) => {
      row[buildMeasureKey(measure, idx)] = group[buildMeasureKey(measure, idx)] || 0;
    });
    return row;
  });

  const finalRows = applyCalculatedFields(rows, config.calculatedFields, 'aggregate', dataset);
  return {
    rows: finalRows,
    dimensions,
    measures: measures.map((m, idx) => ({ ...m, key: buildMeasureKey(m, idx), label: buildMeasureLabel(m) })),
  };
}

function sortRows(rows, sortConfig) {
  if (!sortConfig || !sortConfig.field) return rows;
  const direction = String(sortConfig.direction || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  const field = sortConfig.field;
  return [...rows].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    const an = toNumber(av);
    const bn = toNumber(bv);
    if (an !== null && bn !== null) return (an - bn) * direction;
    const ad = toDate(av);
    const bd = toDate(bv);
    if (ad && bd) return (ad.getTime() - bd.getTime()) * direction;
    const left = normalizeForCompare(av);
    const right = normalizeForCompare(bv);
    if (left < right) return -1 * direction;
    if (left > right) return 1 * direction;
    return 0;
  });
}

function buildPivot(rows, options) {
  const rowField = options?.rowField;
  const columnField = options?.columnField;
  const valueField = options?.valueField;
  if (!rowField || !columnField || !valueField) return null;

  const rowMap = new Map();
  const columnSet = new Set();

  for (const row of rows) {
    const r = row[rowField] ?? 'Unknown';
    const c = row[columnField] ?? 'Unknown';
    const val = toNumber(row[valueField]) || 0;
    columnSet.add(c);
    if (!rowMap.has(r)) rowMap.set(r, {});
    rowMap.get(r)[c] = (rowMap.get(r)[c] || 0) + val;
  }

  const columns = Array.from(columnSet).sort();
  const pivotRows = Array.from(rowMap.entries()).map(([rowKey, cells]) => {
    const total = columns.reduce((sum, col) => sum + (toNumber(cells[col]) || 0), 0);
    return { rowKey, cells, total };
  });

  return { rowField, columnField, valueField, columns, rows: pivotRows };
}

function buildFunnel(rows, options) {
  const stepField = options?.stepField;
  const valueField = options?.valueField;
  if (!stepField || !valueField) return null;
  const ordered = [...rows].sort((a, b) => (toNumber(b[valueField]) || 0) - (toNumber(a[valueField]) || 0));
  const funnelRows = ordered.map((row, index) => {
    const count = toNumber(row[valueField]) || 0;
    const prev = index > 0 ? (toNumber(ordered[index - 1][valueField]) || 0) : count;
    const conversionFromPrev = index === 0 ? 100 : (prev > 0 ? Math.round((count / prev) * 100) : 0);
    return {
      step: row[stepField] || 'Unknown',
      value: count,
      conversionFromPrev,
    };
  });
  return funnelRows;
}

function buildCohort(rawRows, dataset) {
  if (dataset !== 'leads') return null;
  const buckets = new Map();
  for (const row of rawRows) {
    const createdAt = toDate(row.createdAt);
    if (!createdAt) continue;
    const month = createdAt.toISOString().slice(0, 7);
    if (!buckets.has(month)) {
      buckets.set(month, { cohort: month, leads: 0, won: 0, lost: 0 });
    }
    const bucket = buckets.get(month);
    bucket.leads += 1;
    if (row.status === 'WON') bucket.won += 1;
    if (row.status === 'LOST') bucket.lost += 1;
  }
  return Array.from(buckets.values())
    .sort((a, b) => a.cohort.localeCompare(b.cohort))
    .map((bucket) => ({
      ...bucket,
      winRate: bucket.leads > 0 ? Math.round((bucket.won / bucket.leads) * 10000) / 100 : 0,
    }));
}

function buildWhereForDataset(dataset, req, divisionId) {
  const scopedOrg = divisionId && req.isSuperAdmin ? divisionId : { in: req.orgIds };
  if (dataset === 'tasks') {
    if (req.isRestrictedRole) {
      return { assigneeId: req.user.id };
    }
    return {
      OR: [
        { assignee: { organizationId: scopedOrg } },
        { lead: { organizationId: scopedOrg } },
      ],
    };
  }
  if (dataset === 'call_logs') {
    return {
      lead: {
        organizationId: scopedOrg,
        isArchived: false,
        ...(req.isRestrictedRole ? { assignedToId: req.user.id } : {}),
      },
    };
  }
  if (dataset === 'contacts') {
    return {
      organizationId: scopedOrg,
      isArchived: false,
      ...(req.isRestrictedRole ? { ownerId: req.user.id } : {}),
    };
  }
  if (dataset === 'deals') {
    if (req.isRestrictedRole) {
      return {
        organizationId: scopedOrg,
        OR: [
          { ownerId: req.user.id },
          { contact: { ownerId: req.user.id } },
        ],
      };
    }
    return {
      organizationId: scopedOrg,
    };
  }
  return {
    organizationId: scopedOrg,
    isArchived: false,
    ...(req.isRestrictedRole ? { assignedToId: req.user.id } : {}),
  };
}

function applyDateWhere(baseWhere, config, dataset) {
  const where = { ...baseWhere };
  const dateFilters = (Array.isArray(config?.filters) ? config.filters : [])
    .filter((f) => f && (
      f.field === 'createdAt'
      || f.field === 'updatedAt'
      || f.field === 'dueAt'
      || f.field === 'closeDate'
      || f.field === 'lastContactedAt'
    ));
  if (dateFilters.length === 0) return where;

  let targetField = dataset === 'tasks' ? 'dueAt' : 'createdAt';
  for (const filter of dateFilters) {
    if (filter.field === 'updatedAt') targetField = 'updatedAt';
    if (filter.field === 'dueAt') targetField = 'dueAt';
    if (filter.field === 'closeDate') targetField = 'closeDate';
    if (filter.field === 'lastContactedAt') targetField = 'lastContactedAt';
  }

  const dateWhere = {};
  for (const filter of dateFilters) {
    const operator = String(filter.operator || 'eq').toLowerCase();
    if (operator === 'gte' || operator === 'gt') {
      const from = toDate(filter.value);
      if (from) dateWhere.gte = from;
    } else if (operator === 'lte' || operator === 'lt') {
      const to = toDate(filter.value);
      if (to) dateWhere.lte = to;
    } else if (operator === 'between') {
      const from = toDate(filter.value);
      const to = toDate(filter.valueTo);
      if (from) dateWhere.gte = from;
      if (to) dateWhere.lte = to;
    } else if (operator === 'eq') {
      const day = sanitizeDateOnly(filter.value);
      if (day) {
        const start = new Date(`${day}T00:00:00.000Z`);
        const end = new Date(`${day}T23:59:59.999Z`);
        dateWhere.gte = start;
        dateWhere.lte = end;
      }
    }
  }

  if (Object.keys(dateWhere).length > 0) where[targetField] = dateWhere;
  return where;
}

async function fetchDatasetRows(dataset, req, config = {}, divisionId) {
  const limit = Math.min(Math.max(Number(config.rawLimit || 2000), 100), 5000);
  const baseWhere = buildWhereForDataset(dataset, req, divisionId);
  const where = applyDateWhere(baseWhere, config, dataset);
  const orderByField = ['createdAt', 'updatedAt', 'dueAt', 'closeDate', 'lastContactedAt'].includes(config?.rawSort?.field)
    ? config.rawSort.field
    : getDatasetDefinition(dataset).defaultSortField;
  const orderByDirection = String(config?.rawSort?.direction || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const orderBy = { [orderByField]: orderByDirection };

  if (dataset === 'tasks') {
    return prisma.task.findMany({
      where,
      orderBy,
      take: limit,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        description: true,
        dueAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        assignee: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, firstName: true, lastName: true, status: true, source: true } },
      },
    });
  }

  if (dataset === 'call_logs') {
    if (config?.mode === 'latest') {
      return prisma.callLog.findMany({
        where,
        orderBy: [{ leadId: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
        distinct: ['leadId'],
        take: limit,
        select: {
          id: true,
          disposition: true,
          notes: true,
          duration: true,
          callbackDate: true,
          meetingDate: true,
          appointmentDate: true,
          metadata: true,
          createdAt: true,
          lead: { select: { id: true, firstName: true, lastName: true, status: true, source: true } },
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    }

    return prisma.callLog.findMany({
      where,
      orderBy,
      take: limit,
      select: {
        id: true,
        disposition: true,
        notes: true,
        duration: true,
        callbackDate: true,
        meetingDate: true,
        appointmentDate: true,
        metadata: true,
        createdAt: true,
        lead: { select: { id: true, firstName: true, lastName: true, status: true, source: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  if (dataset === 'contacts') {
    return prisma.contact.findMany({
      where,
      orderBy,
      take: limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        mobile: true,
        company: true,
        jobTitle: true,
        department: true,
        source: true,
        lifecycle: true,
        type: true,
        city: true,
        country: true,
        score: true,
        customData: true,
        doNotEmail: true,
        doNotCall: true,
        hasOptedOutEmail: true,
        lastContactedAt: true,
        createdAt: true,
        updatedAt: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  if (dataset === 'deals') {
    return prisma.deal.findMany({
      where,
      orderBy,
      take: limit,
      select: {
        id: true,
        name: true,
        amount: true,
        stage: true,
        probability: true,
        closeDate: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            lifecycle: true,
          },
        },
      },
    });
  }

  return prisma.lead.findMany({
    where,
    orderBy,
    take: limit,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      company: true,
      jobTitle: true,
      source: true,
      status: true,
      score: true,
      budget: true,
      conversionProb: true,
      productInterest: true,
      location: true,
      campaign: true,
      website: true,
      customData: true,
      doNotCall: true,
      createdAt: true,
      updatedAt: true,
      wonAt: true,
      lostAt: true,
      stage: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

function applyFilters(rows, filters, dataset) {
  if (!Array.isArray(filters) || filters.length === 0) return rows;
  return rows.filter((row) => {
    for (const filter of filters) {
      if (!filter || !filter.field) continue;
      const operator = String(filter.operator || 'eq').toLowerCase();
      const fieldValue = getFieldValue(row, filter.field, dataset);
      if (!compareValues(fieldValue, operator, filter.value, filter.valueTo)) {
        return false;
      }
    }
    return true;
  });
}

function buildColumns(config, aggregation, catalog) {
  const dimensions = aggregation.dimensions || [];
  const measures = aggregation.measures || [];
  const byKey = new Map(catalog.map((f) => [f.key, f]));

  const columns = [];
  dimensions.forEach((dim) => {
    const meta = byKey.get(dim);
    columns.push({
      key: dim,
      label: meta?.label || dim,
      kind: 'dimension',
      dataType: meta?.dataType || 'string',
    });
  });

  measures.forEach((measure) => {
    columns.push({
      key: measure.key,
      label: measure.label,
      kind: 'measure',
      dataType: 'number',
    });
  });

  const calcFields = Array.isArray(config.calculatedFields) ? config.calculatedFields : [];
  calcFields.forEach((calc) => {
    const scope = calc.scope || 'aggregate';
    if (scope !== 'aggregate') return;
    if (!calc.key) return;
    columns.push({
      key: `calc.${calc.key}`,
      label: calc.label || calc.key,
      kind: 'measure',
      dataType: 'number',
    });
  });

  return columns;
}

async function getFieldCatalog(req, dataset, divisionId) {
  const definition = getDatasetDefinition(dataset);
  const fields = [...definition.fields];

  if (dataset === 'leads') {
    const customFields = await prisma.customField.findMany({
      where: {
        organizationId: { in: req.orgIds },
        ...(divisionId
          ? { OR: [{ divisionId: null }, { divisionId }] }
          : {}),
      },
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
      select: {
        id: true,
        name: true,
        label: true,
        type: true,
        divisionId: true,
      },
    });
    const dedup = new Set();
    for (const field of customFields) {
      const key = `custom.${field.name}`;
      if (dedup.has(key)) continue;
      dedup.add(key);
      fields.push({
        key,
        label: `${field.label || field.name} (Custom)`,
        kind: 'dimension',
        dataType: field.type === 'NUMBER' || field.type === 'CURRENCY' ? 'number' : (field.type === 'BOOLEAN' ? 'boolean' : 'string'),
        source: 'custom_field',
      });
    }
  }

  return fields;
}

async function runReportPreview(req, payload = {}) {
  const dataset = payload.dataset || 'leads';
  const config = payload.config && typeof payload.config === 'object' ? payload.config : {};
  const divisionId = payload.divisionId || null;
  const catalog = await getFieldCatalog(req, dataset, divisionId);

  const rawRows = await fetchDatasetRows(dataset, req, config, divisionId);
  const rowsWithRowCalcs = applyCalculatedFields(rawRows, config.calculatedFields, 'row', dataset);
  const filteredRows = applyFilters(rowsWithRowCalcs, config.filters, dataset);
  const aggregation = aggregateRows(filteredRows, config, dataset);

  let rows = aggregation.rows;
  rows = sortRows(rows, config.sort);
  const pageLimit = Math.min(Math.max(Number(config.limit || 200), 1), 1000);
  const pagedRows = rows.slice(0, pageLimit);
  const columns = buildColumns(config, aggregation, catalog);

  const visualization = config.visualization || 'table';
  const pivot = visualization === 'pivot' ? buildPivot(rows, config.options) : null;
  const funnel = visualization === 'funnel' ? buildFunnel(rows, config.options) : null;
  const cohort = visualization === 'cohort' ? buildCohort(filteredRows, dataset) : null;

  return {
    dataset,
    visualization,
    columns,
    rows: pagedRows,
    meta: {
      totalRows: rows.length,
      returnedRows: pagedRows.length,
      rawRows: rawRows.length,
      filteredRows: filteredRows.length,
      generatedAt: new Date().toISOString(),
      mode: config.mode || 'any',
    },
    blocks: {
      pivot,
      funnel,
      cohort,
    },
    catalog,
  };
}

module.exports = {
  DATASET_DEFINITIONS,
  getFieldCatalog,
  runReportPreview,
};
