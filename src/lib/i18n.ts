
import { createContext, useContext } from 'react';

export type Locale = 'en' | 'ja' | 'hi' | 'de' | 'ko' | 'zh' | 'ru' | 'sv' | 'pl' | 'fr' | 'it';

export const I18nContext = createContext<{ locale: Locale, t: (key: string) => string }>({
    locale: 'en',
    t: (key: string) => key,
});

export const useI18n = () => {
    const context = useContext(I18nContext);
    if (context === undefined) {
        throw new Error('useI18n must be used within an I18nProvider');
    }
    return context.t;
};

// Hook to get the full context if needed (e.g., for the language switcher)
export const useI18nContext = () => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18nContext must be used within an I18nProvider');
  }
  return context;
};
