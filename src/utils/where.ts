import { and, not, or } from '@prisma/orm-postgres/orm-client';

/**
 * Interprets a Prisma-style filter object (the old `Prisma.*WhereInput`
 * vocabulary) against a Prisma 8 model accessor. Used by query call sites
 * that pass filters as data (inline literals or dynamically built specs):
 * `.where((r) => qw(r, spec))`.
 */
export type WhereSpec = Record<string, any>;

const OP_KEYS = new Set([
  'equals', 'not', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte',
  'contains', 'startsWith', 'endsWith', 'mode', 'is', 'isNot'
]);

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => '\\' + c);
}

function alwaysTrue(row: any): any {
  return row.id.isNotNull();
}

export function qw(row: any, spec: WhereSpec | null | undefined): any {
  if (!spec || (typeof spec === 'object' && !Array.isArray(spec) && Object.keys(spec).length === 0)) {
    return alwaysTrue(row);
  }
  const conds: any[] = [];
  for (const [key, value] of Object.entries(spec)) {
    if (value === undefined) continue;
    if (key === 'OR') {
      if (Array.isArray(value) && value.length > 0) conds.push(or(...value.map((s: any) => qw(row, s))));
      continue;
    }
    if (key === 'AND') {
      if (Array.isArray(value) && value.length > 0) conds.push(and(...value.map((s: any) => qw(row, s))));
      continue;
    }
    if (key === 'NOT') {
      conds.push(not(qw(row, value)));
      continue;
    }
    const field = row[key];
    if (field === undefined || field === null) {
      throw new Error(`qw: unknown field "${key}"`);
    }
    conds.push(fieldCond(field, value));
  }
  if (conds.length === 0) return alwaysTrue(row);
  if (conds.length === 1) return conds[0];
  return and(...conds);
}

function fieldCond(field: any, value: any): any {
  if (value === null) return field.isNull();
  if (value instanceof Date) return field.eq(value);
  if (Array.isArray(value)) return field.in(value);
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.some((k) => OP_KEYS.has(k))) {
      // A plain object without operator keys: a to-one relation filter spec.
      return qw(field, value);
    }
    const insensitive = value.mode === 'insensitive';
    const conds: any[] = [];
    for (const [op, v] of Object.entries(value)) {
      if (v === undefined || op === 'mode') continue;
      switch (op) {
        case 'equals':
          conds.push(v === null ? field.isNull() : field.eq(v));
          break;
        case 'not':
          if (v === null) conds.push(field.isNotNull());
          else if (typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) conds.push(not(fieldCond(field, v)));
          else conds.push(field.neq(v));
          break;
        case 'in':
          conds.push(field.in(v));
          break;
        case 'notIn':
          conds.push(not(field.in(v)));
          break;
        case 'lt':
          conds.push(field.lt(v));
          break;
        case 'lte':
          conds.push(field.lte(v));
          break;
        case 'gt':
          conds.push(field.gt(v));
          break;
        case 'gte':
          conds.push(field.gte(v));
          break;
        case 'contains': {
          const like = `%${escapeLike(String(v))}%`;
          conds.push(insensitive ? field.ilike(like) : field.like(like));
          break;
        }
        case 'startsWith': {
          const like = `${escapeLike(String(v))}%`;
          conds.push(insensitive ? field.ilike(like) : field.like(like));
          break;
        }
        case 'endsWith': {
          const like = `%${escapeLike(String(v))}`;
          conds.push(insensitive ? field.ilike(like) : field.like(like));
          break;
        }
        case 'is':
          conds.push(relationCond(field, v));
          break;
        case 'isNot':
          conds.push(not(relationCond(field, v)));
          break;
        default:
          throw new Error(`qw: unsupported filter operator "${op}"`);
      }
    }
    if (conds.length === 0) return alwaysTrue(field);
    if (conds.length === 1) return conds[0];
    return and(...conds);
  }
  return field.eq(value);
}

function relationCond(relation: any, value: any): any {
  if (value === null) return relation.none();
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 1 && value.not === null) {
    return relation.some();
  }
  return qw(relation, value);
}
