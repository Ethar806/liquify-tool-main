
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
import { Slider } from '@/components/ui/slider';

interface WindowOpacityDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  opacity: number;
  setOpacity: (opacity: number) => void;
}

export function WindowOpacityDialog({
  isOpen,
  onOpenChange,
  opacity,
  setOpacity,
}: WindowOpacityDialogProps) {
  const [currentOpacity, setCurrentOpacity] = React.useState(opacity);

  React.useEffect(() => {
    if(isOpen) {
        setCurrentOpacity(opacity);
    }
  }, [isOpen, opacity]);

  const handleSave = () => {
    setOpacity(currentOpacity);
    onOpenChange(false);
  };
  
  const handleCancel = () => {
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Window Opacity</DialogTitle>
          <DialogDescription>
            Adjust the opacity of the entire application window.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="flex items-center gap-4">
                <Label htmlFor="opacity-slider" className="w-24">Opacity: {currentOpacity}%</Label>
                <Slider
                    id="opacity-slider"
                    value={[currentOpacity]}
                    onValueChange={(v) => setCurrentOpacity(v[0])}
                    min={10}
                    max={100}
                    step={1}
                />
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
