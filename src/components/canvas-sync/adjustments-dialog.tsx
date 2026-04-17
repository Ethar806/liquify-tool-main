import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

export type AdjustmentType = 'brightness-contrast' | 'hue-saturation' | null;

interface AdjustmentsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  type: AdjustmentType;
  onApply: (type: AdjustmentType, values: any) => void;
}

export function AdjustmentsDialog({ isOpen, onOpenChange, type, onApply }: AdjustmentsDialogProps) {
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setBrightness(0);
      setContrast(0);
      setHue(0);
      setSaturation(0);
    }
  }, [isOpen, type]);

  const handleApply = () => {
    if (type === 'brightness-contrast') {
      onApply(type, { brightness, contrast });
    } else if (type === 'hue-saturation') {
      onApply(type, { hue, saturation });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {type === 'brightness-contrast' ? 'Brightness / Contrast' : 'Hue / Saturation'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col gap-6 py-4">
          {type === 'brightness-contrast' && (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <Label>Brightness</Label>
                  <span className="text-sm text-muted-foreground">{brightness}</span>
                </div>
                <Slider 
                  min={-100} max={100} step={1} 
                  value={[brightness]} 
                  onValueChange={(val) => setBrightness(val[0])} 
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <Label>Contrast</Label>
                  <span className="text-sm text-muted-foreground">{contrast}</span>
                </div>
                <Slider 
                  min={-100} max={100} step={1} 
                  value={[contrast]} 
                  onValueChange={(val) => setContrast(val[0])} 
                />
              </div>
            </>
          )}

          {type === 'hue-saturation' && (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <Label>Hue</Label>
                  <span className="text-sm text-muted-foreground">{hue}°</span>
                </div>
                <Slider 
                  min={-180} max={180} step={1} 
                  value={[hue]} 
                  onValueChange={(val) => setHue(val[0])} 
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between">
                  <Label>Saturation</Label>
                  <span className="text-sm text-muted-foreground">{saturation}</span>
                </div>
                <Slider 
                  min={-100} max={100} step={1} 
                  value={[saturation]} 
                  onValueChange={(val) => setSaturation(val[0])} 
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleApply}>Apply Filter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
