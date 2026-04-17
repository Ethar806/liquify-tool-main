
'use client';
import { CanvasSyncEditor } from '@/components/canvas-sync/main-editor';
import { I18nContext, type Locale } from '@/lib/i18n';
import { useState, useEffect } from 'react';

import en from '@/locales/en.json';
import ja from '@/locales/ja.json';
import hi from '@/locales/hi.json';
import de from '@/locales/de.json';
import ko from '@/locales/ko.json';
import zh from '@/locales/zh.json';
import ru from '@/locales/ru.json';
import sv from '@/locales/sv.json';
import pl from '@/locales/pl.json';
import fr from '@/locales/fr.json';
import it from '@/locales/it.json';

const translations: Record<string, any> = {
  en, ja, hi, de, ko, zh, ru, sv, pl, fr, it
};

const I18nProvider = ({ children, locale }: { children: React.ReactNode, locale: Locale }) => {
    const t = (key: string) => {
        const keys = key.split('.');
        let result: any = translations[locale];
        for (const k of keys) {
            result = result?.[k];
            if (result === undefined) {
                // Fallback to English if translation is missing
                let fallbackResult: any = translations['en'];
                for (const fk of keys) {
                    fallbackResult = fallbackResult?.[fk];
                }
                return fallbackResult || key;
            }
        }
        return result || key;
    };
    
    return (
        <I18nContext.Provider value={{ locale, t }}>
            {children}
        </I18nContext.Provider>
    );
};

export default function Home() {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const saved = localStorage.getItem('app_locale') as Locale;
    if (saved && Object.keys(translations).includes(saved)) {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('app_locale', l);
  };

  return (
    <I18nProvider locale={locale}>
      <CanvasSyncEditor setLocale={setLocale} />
    </I18nProvider>
  );
}
