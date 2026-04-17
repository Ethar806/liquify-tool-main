
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
import { RgbaStringColorPicker } from 'react-colorful';

interface CanvasBackgroundDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSetColor: (color: string) => void;
  currentColor: string;
}

export function CanvasBackgroundDialog({ isOpen, onOpenChange, onSetColor, currentColor }: CanvasBackgroundDialogProps) {
  const [color, setColor] = React.useState(currentColor);
  
  React.useEffect(() => {
    if (isOpen) {
      setColor(currentColor);
    }
  }, [isOpen, currentColor]);

  const handleSave = () => {
    onSetColor(color);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-auto max-w-min">
        <DialogHeader>
          <DialogTitle>Set Canvas Background</DialogTitle>
          <DialogDescription>
            Pick a color for the canvas background.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 flex justify-center saturation-picker">
          <RgbaStringColorPicker color={color} onChange={setColor} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
