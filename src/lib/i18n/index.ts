import { getCommonTranslations } from './common';
import { getCrmTranslations } from './crm';
import { getFinanceTranslations } from './finance';
import { getProductionTranslations } from './production';
import { getHrTranslations } from './hr';
import { getStockTranslations } from './stock';
import { getProjectsTranslations } from './projects';
import { getChatTranslations } from './chat';
import { getSavTranslations } from './sav';

export type Locale = 'en' | 'fr' | 'ar' | 'darija';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fr: 'Francais',
  ar: 'العربية',
  darija: 'الدارجة',
};

function mergeDomainTranslations(): Record<Locale, Record<string, string>> {
  const domains = [
    getCommonTranslations(),
    getCrmTranslations(),
    getFinanceTranslations(),
    getProductionTranslations(),
    getHrTranslations(),
    getStockTranslations(),
    getProjectsTranslations(),
    getChatTranslations(),
    getSavTranslations(),
  ];

  const locales: Locale[] = ['en', 'fr', 'ar', 'darija'];
  const merged: Record<Locale, Record<string, string>> = {
    en: {},
    fr: {},
    ar: {},
    darija: {},
  };

  for (const domain of domains) {
    for (const locale of locales) {
      Object.assign(merged[locale], domain[locale]);
    }
  }

  return merged;
}

const translations = mergeDomainTranslations();

export function t(key: string, locale: Locale = 'en'): string {
  return translations[locale]?.[key] || translations.en[key] || key;
}

export function getLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  return (localStorage.getItem('locale') as Locale) || 'en';
}

export function setLocale(locale: Locale) {
  localStorage.setItem('locale', locale);
  // Set dir attribute for RTL
  document.documentElement.dir = (locale === 'ar' || locale === 'darija') ? 'rtl' : 'ltr';
  document.documentElement.lang = locale === 'darija' ? 'ar-MA' : locale;
}

export function isRtl(locale: Locale): boolean {
  return locale === 'ar' || locale === 'darija';
}

// Legacy compatibility - getTranslations returns all translations for a locale
export function getTranslations(locale: Locale): Record<string, string> {
  return translations[locale];
}
