
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Languages, Check } from 'lucide-react';
import { useI18n, type Locale } from '@/lib/i18n';

interface LanguageDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  setLocale: (locale: Locale) => void;
}

const availableLanguages: { code: Locale; name: string, flag: string }[] = [
    { code: 'en', name: 'English', flag: '🇬🇧'},
    { code: 'ja', name: '日本語', flag: '🇯🇵'},
    { code: 'hi', name: 'हिन्दी', flag: '🇮🇳'},
    { code: 'de', name: 'Deutsch', flag: '🇩🇪'},
    { code: 'ko', name: '한국어', flag: '🇰🇷'},
    { code: 'zh', name: '简体中文', flag: '🇨🇳'},
    { code: 'ru', name: 'Русский', flag: '🇷🇺'},
    { code: 'sv', name: 'Svenska', flag: '🇸🇪'},
    { code: 'pl', name: 'Polski', flag: '🇵🇱'},
    { code: 'fr', name: 'Français', flag: '🇫🇷'},
    { code: 'it', name: 'Italiano', flag: '🇮🇹'}
];

export function LanguageDialog({ isOpen, onOpenChange, setLocale }: LanguageDialogProps) {
  const t = useI18n();
  const [selected, setSelected] = React.useState<Locale>('en');

  const handleSave = () => {
    setLocale(selected);
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages /> {t('settings.language')}
          </DialogTitle>
          <DialogDescription>
            {t('languageDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-2">
            {availableLanguages.map(lang => (
                <Button 
                    key={lang.code}
                    variant={selected === lang.code ? 'secondary' : 'ghost'}
                    className="w-full justify-start gap-2"
                    onClick={() => setSelected(lang.code)}
                >
                    <span className="w-6 text-center">{selected === lang.code ? <Check className="h-4 w-4" /> : null}</span>
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                </Button>
            ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleSave}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
