import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

const systems = [
  ['accounting', '/systems/accounting', 'المحاسبة', 'Accounting'],
  ['crm', '/systems/crm', 'إدارة العملاء والعقود التجارية', 'CRM'],
  ['hr', '/systems/hr', 'الموارد البشرية', 'HR'],
  ['projects', '/systems/projects', 'المشاريع', 'Projects'],
  ['procurement', '/systems/procurement', 'المشتريات', 'Procurement'],
  ['inventory', '/systems/inventory', 'المخزون', 'Inventory'],
  ['equipment', '/systems/equipment', 'المعدات والأصول', 'Equipment & Assets'],
  ['subcontractors', '/systems/subcontractors', 'مقاولو الباطن', 'Subcontractors'],
  ['site-ops', '/systems/site-ops', 'التشغيل الميداني', 'Site Operations'],
  ['documents', '/systems/documents', 'إدارة المستندات', 'Document Management'],
  ['bi', '/systems/bi', 'التقارير وذكاء الأعمال', 'Reporting & BI'],
  ['quality-safety', '/systems/quality-safety', 'الجودة والسلامة', 'Quality & Safety'],
  ['maintenance', '/systems/maintenance', 'الصيانة المتقدمة', 'Advanced Maintenance'],
  ['contracts', '/systems/contracts', 'إدارة العقود المتقدمة', 'Advanced Contracts'],
  ['tenders', '/systems/tenders', 'العطاءات والمناقصات', 'Tendering & Bidding'],
  ['budgets', '/systems/budgets', 'الموازنات والتخطيط المالي', 'Budgeting & Financial Planning'],
  ['risks', '/systems/risks', 'إدارة المخاطر', 'Risk Management'],
  ['scheduling', '/systems/scheduling', 'الجدولة المتقدمة', 'Advanced Scheduling'],
  ['printing', '/systems/printing', 'الطباعة والتصدير', 'Printing & Exports']
];

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

for (const [key, routeBase, titleAr, titleEn] of systems) {
  const appDir = path.join(rootDir, 'apps', key);

  writeFile(
    path.join(appDir, 'package.json'),
    JSON.stringify(
      {
        name: `@erp-qween/${key}`,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'tsc -b && vite build',
          preview: 'vite preview'
        },
        dependencies: {
          '@erp-qween/api-client': '0.1.0',
          '@erp-qween/app-config': '0.1.0',
          '@erp-qween/auth-client': '0.1.0',
          '@erp-qween/domain-types': '0.1.0',
          '@erp-qween/i18n': '0.1.0',
          '@erp-qween/ui': '0.1.0',
          react: '^18.3.1',
          'react-dom': '^18.3.1'
        },
        devDependencies: {
          '@types/react': '^18.3.18',
          '@types/react-dom': '^18.3.5',
          '@vitejs/plugin-react-swc': '^3.8.0',
          typescript: '^5.7.3',
          vite: '^6.2.0'
        }
      },
      null,
      2
    )
  );

  writeFile(
    path.join(appDir, 'index.html'),
    `<!doctype html>
<html lang="ar">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${titleEn}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
  );

  writeFile(
    path.join(appDir, 'tsconfig.json'),
    `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": "."
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
`
  );

  writeFile(
    path.join(appDir, 'tsconfig.node.json'),
    `{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
`
  );

  writeFile(
    path.join(appDir, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  base: '${routeBase}/',
  plugins: [react()]
});
`
  );

  writeFile(path.join(appDir, 'src', 'vite-env.d.ts'), '/// <reference types="vite/client" />\n');

  writeFile(
    path.join(appDir, 'src', 'system.ts'),
    `export const systemKey = '${key}' as const;
`
  );

  writeFile(
    path.join(appDir, 'src', 'main.tsx'),
    `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@erp-qween/ui/styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`
  );

  writeFile(
    path.join(appDir, 'src', 'App.tsx'),
    `import { useMemo, useState } from 'react';
import { getSystemByKey } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, setLocale } from '@erp-qween/auth-client';
import type { Locale } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard, StatusBadge } from '@erp-qween/ui';
import { systemKey } from './system';

export default function App() {
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState(readSession());
  const system = useMemo(() => getSystemByKey(systemKey), []);

  if (!system) {
    return null;
  }

  const title = locale === 'ar' ? system.titleAr : system.titleEn;
  const subtitle = locale === 'ar' ? system.descriptionAr : system.descriptionEn;

  function toggleLocale() {
    const nextLocale = locale === 'ar' ? 'en' : 'ar';
    setLocale(nextLocale);
    setLocaleState(nextLocale);
  }

  function logout() {
    clearSession();
    setSessionState(null);
  }

  return (
    <AppShell
      locale={locale}
      title={title}
      subtitle={subtitle}
      breadcrumbs={<span className="ui-muted">{system.routeBase}</span>}
      actions={
        <div className="ui-actions">
          <a className="ui-link" href="/portal">
            {pickLocalized(locale, 'العودة إلى البوابة', 'Back to Portal')}
          </a>
          <button type="button" className="ui-link" onClick={toggleLocale}>
            {locale === 'ar' ? 'English' : 'العربية'}
          </button>
          {session?.token ? (
            <button type="button" className="ui-button" onClick={logout}>
              {pickLocalized(locale, 'تسجيل الخروج', 'Logout')}
            </button>
          ) : null}
        </div>
      }
    >
      <SectionCard title={pickLocalized(locale, 'حالة التطبيق', 'Application Status')} eyebrow="Workspace App">
        <div className="ui-list">
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'حالة النظام', 'System Status')}</strong>
            <StatusBadge status={system.status} locale={locale} />
          </div>
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'مسار الواجهة', 'Frontend Route')}</strong>
            <span>{system.routeBase}</span>
          </div>
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'قاعدة API', 'API Base')}</strong>
            <span>{system.apiBase}</span>
          </div>
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'المجموعة', 'Group')}</strong>
            <span>{system.group}</span>
          </div>
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'الجلسة الحالية', 'Current Session')}</strong>
            <span>{session?.user?.fullName || session?.user?.username || pickLocalized(locale, 'غير مسجل', 'Not signed in')}</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={pickLocalized(locale, 'الخطوة التالية', 'Next Step')} eyebrow="Cutover">
        <div className="ui-list">
          <div className="ui-list-item">
            <div>
              <strong>{pickLocalized(locale, 'نقل الواجهات التشغيلية', 'Migrate Operational Features')}</strong>
              <p className="ui-muted">
                {pickLocalized(
                  locale,
                  'هذا التطبيق جاهز كنقطة دخول مستقلة. الخطوة التالية هي نقل مكونات وشاشات النظام من apps/control-center أو apps/web إليه تدريجياً.',
                  'This workspace app is ready as an independent entry point. The next step is moving the system features from apps/control-center or apps/web into this app gradually.'
                )}
              </p>
            </div>
            <a className="ui-link" href={system.apiBase}>
              API
            </a>
          </div>
        </div>
      </SectionCard>
    </AppShell>
  );
}
`
  );
}

console.log(`Generated ${systems.length} system apps.`);
