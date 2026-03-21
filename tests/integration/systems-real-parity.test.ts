import fs from 'fs';
import path from 'path';
import { SYSTEM_DASHBOARD_DEFINITIONS } from '../../src/modules/system-dashboards/catalog';

const expectedSystemKeys = [
  'accounting',
  'crm',
  'hr',
  'printing',
  'control-center',
  'projects',
  'procurement',
  'inventory',
  'assets',
  'subcontractors',
  'site-ops',
  'documents',
  'analytics',
  'quality',
  'maintenance',
  'contracts',
  'tendering',
  'budgeting',
  'risk',
  'scheduling'
];

function extractQuotedValues(source: string, anchor: string): string[] {
  const start = source.indexOf(anchor);
  if (start === -1) return [];
  const slice = source.slice(start);
  const openingBracket = slice.indexOf('[');
  const closingBracket = slice.indexOf(']');
  if (openingBracket === -1 || closingBracket === -1) return [];
  const block = slice.slice(openingBracket + 1, closingBracket);
  return Array.from(block.matchAll(/'([^']+)'/g)).map((match) => match[1]);
}

describe('Systems real parity', () => {
  const registryPath = path.resolve(__dirname, '../../frontend/js/systems/registry.js');
  const routesPath = path.resolve(__dirname, '../../frontend/js/shell/route-registry.js');
  const registrySource = fs.readFileSync(registryPath, 'utf8');
  const routeSource = fs.readFileSync(routesPath, 'utf8');

  it('marks all backend dashboard definitions as real', () => {
    expect(SYSTEM_DASHBOARD_DEFINITIONS).toHaveLength(20);
    expect(SYSTEM_DASHBOARD_DEFINITIONS.every((definition) => definition.maturity === 'real')).toBe(true);
    expect(SYSTEM_DASHBOARD_DEFINITIONS.map((definition) => definition.key).sort()).toEqual([...expectedSystemKeys].sort());
  });

  it('keeps frontend registry realSystemKeys aligned with backend catalog', () => {
    const realSystemKeys = extractQuotedValues(registrySource, 'const realSystemKeys = new Set(');
    expect(realSystemKeys.sort()).toEqual([...expectedSystemKeys].sort());
  });

  it('registers the operational routes for control center and the remaining systems', () => {
    const expectedRoutes = [
      '/systems/control-center/approvals',
      '/systems/control-center/notifications',
      '/systems/control-center/tasks',
      '/systems/control-center/governance',
      '/systems/contracts/registry',
      '/systems/contracts/milestones',
      '/systems/quality/inspections',
      '/systems/quality/ncr',
      '/systems/quality/incidents',
      '/systems/maintenance/plans',
      '/systems/maintenance/orders',
      '/systems/maintenance/failures',
      '/systems/risk/register',
      '/systems/risk/heatmap',
      '/systems/risk/followup',
      '/systems/scheduling/plans',
      '/systems/scheduling/tasks',
      '/systems/scheduling/critical-path'
    ];

    for (const route of expectedRoutes) {
      expect(routeSource).toContain(route);
    }
  });
});
