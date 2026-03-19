import { getSystemByKey } from '@erp-qween/app-config';
import type { Locale, SystemDefinition, SystemStatus } from '@erp-qween/domain-types';

export function pickLocalized(locale: Locale, ar: string, en: string) {
  return locale === 'ar' ? ar : en;
}

export function systemTitle(system: SystemDefinition, locale: Locale) {
  return pickLocalized(locale, system.titleAr, system.titleEn);
}

export function systemDescription(system: SystemDefinition, locale: Locale) {
  return pickLocalized(locale, system.descriptionAr, system.descriptionEn);
}

export function getSystemTitleByKey(key: string, locale: Locale) {
  const system = getSystemByKey(key);
  return system ? systemTitle(system, locale) : key;
}

export function statusLabel(status: SystemStatus, locale: Locale) {
  if (status === 'implemented') {
    return locale === 'ar' ? 'منفذ' : 'Implemented';
  }

  if (status === 'foundation') {
    return locale === 'ar' ? 'أساس جاهز' : 'Foundation';
  }

  return locale === 'ar' ? 'مخطط' : 'Planned';
}
