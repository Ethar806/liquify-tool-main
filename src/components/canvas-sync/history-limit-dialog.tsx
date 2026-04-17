
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

interface HistoryLimitDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  limit: number;
  setLimit: (limit: number) => void;
}

export function HistoryLimitDialog({
  isOpen,
  onOpenChange,
  limit,
  setLimit,
}: HistoryLimitDialogProps) {
  const [currentLimit, setCurrentLimit] = React.useState(limit);
  const t = useI18n();

  React.useEffect(() => {
    if (isOpen) {
      setCurrentLimit(limit);
    }
  }, [isOpen, limit]);

  const handleSave = () => {
    setLimit(currentLimit);
    onOpenChange(false);
  };
  
  const handleCancel = () => {
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('history.setHistoryLimit')}</DialogTitle>
          <DialogDescription>
            Specify the maximum number of undo steps to keep in memory.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="history-limit" className="text-right">Limit</Label>
                <Input
                    id="history-limit"
                    type="number"
                    value={currentLimit}
                    onChange={(e) => setCurrentLimit(Math.max(1, parseInt(e.target.value) || 1))}
                    className="col-span-3"
                    min={1}
                    max={1000}
                />
            </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>{t('common.cancel')}</Button>
          <Button onClick={handleSave}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
