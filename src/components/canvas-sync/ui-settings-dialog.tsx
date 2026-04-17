
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
import { RgbaStringColorPicker } from 'react-colorful';

interface UISettingsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  accentColor: string;
  setAccentColor: (color: string) => void;
}

export function UISettingsDialog({
  isOpen,
  onOpenChange,
  accentColor,
  setAccentColor,
}: UISettingsDialogProps) {
  const [color, setColor] = React.useState(accentColor);

  React.useEffect(() => {
    setColor(accentColor);
  }, [accentColor]);

  const handleSave = () => {
    setAccentColor(color);
    onOpenChange(false);
  };
  
  const handleCancel = () => {
    setColor(accentColor);
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>User Interface Settings</DialogTitle>
          <DialogDescription>
            Customize the look and feel of the application.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Accent Color</Label>
             <div className="py-4 flex justify-center saturation-picker">
                <RgbaStringColorPicker color={color} onChange={setColor} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
