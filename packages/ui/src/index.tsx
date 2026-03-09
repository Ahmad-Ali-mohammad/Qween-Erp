import type { PropsWithChildren, ReactNode } from 'react';
import type { Locale, SystemDefinition, SystemStatus } from '@erp-qween/domain-types';
import { statusLabel, systemDescription, systemTitle } from '@erp-qween/i18n';

export function StatusBadge({ status, locale }: { status: SystemStatus; locale: Locale }) {
  return <span className={`status-badge status-${status}`}>{statusLabel(status, locale)}</span>;
}

export function SectionCard({
  title,
  eyebrow,
  actions,
  children
}: PropsWithChildren<{ title: string; eyebrow?: string; actions?: ReactNode }>) {
  return (
    <section className="ui-card">
      <div className="ui-card-header">
        <div>
          {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {actions ? <div className="ui-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SystemCard({
  system,
  locale,
  href,
  meta
}: {
  system: SystemDefinition;
  locale: Locale;
  href: string;
  meta?: ReactNode;
}) {
  return (
    <a className="system-card" href={href}>
      <div className="system-card-head">
        <div>
          <p className="ui-eyebrow">{system.group}</p>
          <h3>{systemTitle(system, locale)}</h3>
        </div>
        <StatusBadge status={system.status} locale={locale} />
      </div>
      <p className="ui-muted">{systemDescription(system, locale)}</p>
      {meta ? <div className="system-card-meta">{meta}</div> : null}
    </a>
  );
}

export function AppShell({
  locale,
  title,
  subtitle,
  breadcrumbs,
  actions,
  children
}: PropsWithChildren<{
  locale: Locale;
  title: string;
  subtitle: string;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
}>) {
  return (
    <div className={`ui-root ${locale === 'ar' ? 'rtl' : 'ltr'}`}>
      <header className="ui-hero">
        <div>
          <p className="ui-eyebrow">ERP Qween</p>
          <h1>{title}</h1>
          <p className="ui-muted">{subtitle}</p>
          {breadcrumbs ? <div className="ui-breadcrumbs">{breadcrumbs}</div> : null}
        </div>
        {actions ? <div className="ui-actions">{actions}</div> : null}
      </header>
      <main className="ui-main">{children}</main>
    </div>
  );
}
