'use client';

import { useState, useEffect, useCallback } from 'react';
import { type Locale, t as translate, getLocale, setLocale as setLocaleStore } from '@/lib/i18n';

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const stored = getLocale();
    setLocaleState(stored);
    document.documentElement.dir = stored === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = stored;
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    setLocaleStore(newLocale);
  }, []);

  const t = useCallback((key: string) => translate(key, locale), [locale]);

  return { locale, setLocale, t };
}
