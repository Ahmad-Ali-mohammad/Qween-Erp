import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getJson, postJson } from '@erp-qween/api-client';
import { SYSTEM_APPS } from '@erp-qween/app-config';
import { clearSession, getLocale, readSession, saveSession, setLocale } from '@erp-qween/auth-client';
import type { AppSession, Locale, SystemDefinition } from '@erp-qween/domain-types';
import { pickLocalized } from '@erp-qween/i18n';
import { AppShell, SectionCard, StatusBadge, SystemCard } from '@erp-qween/ui';

type CentralHealth = {
  environment: string;
  timezone: string;
  baseCurrency: string;
  systems: Array<{ key: string; distAvailable: boolean; status: string }>;
};

type CentralException = {
  id: string;
  title: string;
  detail: string;
  severity: string;
  systemKey?: string;
};

type SystemCardRow = SystemDefinition & {
  accessible?: boolean;
  distAvailable?: boolean;
};

function summarizeByStatus(systems: SystemCardRow[]) {
  return {
    total: systems.length,
    implemented: systems.filter((system) => system.status === 'implemented').length,
    foundation: systems.filter((system) => system.status === 'foundation').length,
    planned: systems.filter((system) => system.status === 'planned').length
  };
}

export default function App() {
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [session, setSessionState] = useState<AppSession | null>(readSession());
  const [systems, setSystems] = useState<SystemCardRow[]>(SYSTEM_APPS);
  const [health, setHealth] = useState<CentralHealth | null>(null);
  const [exceptions, setExceptions] = useState<CentralException[]>([]);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  useEffect(() => {
    void getJson<SystemCardRow[]>('/central/apps')
      .then((result) => setSystems(result.data))
      .catch(() => setSystems(SYSTEM_APPS));

    void getJson<CentralHealth>('/central/health')
      .then((result) => setHealth(result.data))
      .catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    if (!session?.token) {
      setExceptions([]);
      return;
    }

    void getJson<CentralException[]>('/central/exceptions')
      .then((result) => setExceptions(result.data))
      .catch(() => setExceptions([]));
  }, [session?.token]);

  const groupedSystems = useMemo(() => {
    return ['core', 'operations', 'support', 'advanced'].map((group) => ({
      group,
      items: systems.filter((system) => system.group === group)
    }));
  }, [systems]);

  const summary = summarizeByStatus(systems);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await postJson<AppSession>('/auth/login', { username, password });
      saveSession(result.data);
      setSessionState(result.data);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : pickLocalized(locale, 'فشل تسجيل الدخول', 'Login failed'));
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    clearSession();
    setSessionState(null);
  }

  function handleLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    setLocaleState(nextLocale);
  }

  if (!session?.token) {
    return (
      <AppShell
        locale={locale}
        title={pickLocalized(locale, 'بوابة ERP Qween المركزية', 'ERP Qween Control Center')}
        subtitle={pickLocalized(locale, 'بوابة موحدة للدخول إلى الأنظمة المنفصلة مع جلسة موحدة', 'Unified portal for the modular apps with a shared session')}
        actions={
          <div className="ui-actions">
            <button type="button" className="ui-link" onClick={() => handleLocale(locale === 'ar' ? 'en' : 'ar')}>
              {locale === 'ar' ? 'English' : 'العربية'}
            </button>
          </div>
        }
      >
        <SectionCard title={pickLocalized(locale, 'تسجيل الدخول', 'Sign In')} eyebrow="Control Center">
          <form className="ui-form" onSubmit={handleLogin}>
            <label>
              <span>{pickLocalized(locale, 'اسم المستخدم', 'Username')}</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label>
              <span>{pickLocalized(locale, 'كلمة المرور', 'Password')}</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error ? <div className="ui-list-item"><strong>{error}</strong></div> : null}
            <button className="ui-button" type="submit" disabled={isLoading}>
              {isLoading ? '...' : pickLocalized(locale, 'دخول', 'Sign In')}
            </button>
          </form>
        </SectionCard>

        <SectionCard title={pickLocalized(locale, 'كتالوج الأنظمة', 'System Catalog')} eyebrow="Apps">
          <div className="ui-grid">
            {systems.map((system) => (
              <SystemCard key={system.key} system={system} locale={locale} href={system.routeBase} />
            ))}
          </div>
        </SectionCard>
      </AppShell>
    );
  }

  return (
    <AppShell
      locale={locale}
      title={pickLocalized(locale, 'لوحة النظام المركزي', 'Control Center Dashboard')}
      subtitle={pickLocalized(locale, 'إدارة الوصول والصحة والانتقال بين الأنظمة المستقلة', 'Manage access, health, and navigation across the modular systems')}
      actions={
        <div className="ui-actions">
          <button type="button" className="ui-link" onClick={() => handleLocale(locale === 'ar' ? 'en' : 'ar')}>
            {locale === 'ar' ? 'English' : 'العربية'}
          </button>
          <button type="button" className="ui-button" onClick={handleLogout}>
            {pickLocalized(locale, 'تسجيل الخروج', 'Logout')}
          </button>
        </div>
      }
      breadcrumbs={
        <span className="ui-muted">
          {pickLocalized(locale, 'المستخدم الحالي', 'Current User')}: {session.user?.fullName || session.user?.username || 'System User'}
        </span>
      }
    >
      <div className="ui-grid">
        <div className="ui-kpi">
          <span>{pickLocalized(locale, 'إجمالي الأنظمة', 'Total Systems')}</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="ui-kpi">
          <span>{pickLocalized(locale, 'منفذ', 'Implemented')}</span>
          <strong>{summary.implemented}</strong>
        </div>
        <div className="ui-kpi">
          <span>{pickLocalized(locale, 'أساس جاهز', 'Foundation')}</span>
          <strong>{summary.foundation}</strong>
        </div>
        <div className="ui-kpi">
          <span>{pickLocalized(locale, 'مخطط', 'Planned')}</span>
          <strong>{summary.planned}</strong>
        </div>
      </div>

      <SectionCard title={pickLocalized(locale, 'صحة المنصة', 'Platform Health')} eyebrow="Health">
        <div className="ui-list">
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'البيئة', 'Environment')}</strong>
            <span>{health?.environment || 'n/a'}</span>
          </div>
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'المنطقة الزمنية', 'Timezone')}</strong>
            <span>{health?.timezone || 'n/a'}</span>
          </div>
          <div className="ui-list-item">
            <strong>{pickLocalized(locale, 'العملة الأساسية', 'Base Currency')}</strong>
            <span>{health?.baseCurrency || 'n/a'}</span>
          </div>
        </div>
      </SectionCard>

      {groupedSystems.map((group) => (
        <SectionCard
          key={group.group}
          title={pickLocalized(
            locale,
            group.group === 'core'
              ? 'الأنظمة الأساسية'
              : group.group === 'operations'
                ? 'أنظمة التشغيل'
                : group.group === 'support'
                  ? 'الأنظمة المساندة'
                  : 'الأنظمة المتقدمة',
            group.group === 'core'
              ? 'Core Systems'
              : group.group === 'operations'
                ? 'Operational Systems'
                : group.group === 'support'
                  ? 'Supporting Systems'
                  : 'Advanced Systems'
          )}
          eyebrow="Navigation"
        >
          <div className="ui-grid">
            {group.items.map((system) => (
              <SystemCard
                key={system.key}
                system={system}
                locale={locale}
                href={system.routeBase}
                meta={
                  <>
                    <span className="ui-muted">{system.apiBase}</span>
                    {typeof system.distAvailable === 'boolean' ? (
                      <StatusBadge status={system.distAvailable ? 'implemented' : 'foundation'} locale={locale} />
                    ) : null}
                  </>
                }
              />
            ))}
          </div>
        </SectionCard>
      ))}

      <SectionCard title={pickLocalized(locale, 'الاستثناءات الحالية', 'Current Exceptions')} eyebrow="Exceptions">
        <div className="ui-list">
          {exceptions.length ? (
            exceptions.map((row) => (
              <div key={row.id} className="ui-list-item">
                <div>
                  <strong>{row.title}</strong>
                  <p className="ui-muted">{row.detail}</p>
                </div>
                <span>{row.systemKey || row.severity}</span>
              </div>
            ))
          ) : (
            <div className="ui-list-item">
              <strong>{pickLocalized(locale, 'لا توجد استثناءات حالياً', 'No active exceptions')}</strong>
              <span>OK</span>
            </div>
          )}
        </div>
      </SectionCard>
    </AppShell>
  );
}
