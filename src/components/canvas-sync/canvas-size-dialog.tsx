
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CanvasFrame } from './main-editor';
import { Unit } from './unit-resolution-dialog';
import { Checkbox } from '@/components/ui/checkbox';

export type CanvasAnchor = 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export const pxToUnit = (px: number, unit: Unit, ppi: number): number => {
    if (unit === 'px') return Math.round(px);
    if (unit === 'in') return +(px / ppi).toFixed(3);
    if (unit === 'cm') return +((px / ppi) * 2.54).toFixed(3);
    if (unit === 'mm') return +((px / ppi) * 25.4).toFixed(3);
    return px;
}

export const unitToPx = (val: number, unit: Unit, ppi: number): number => {
    if (unit === 'px') return Math.round(val);
    if (unit === 'in') return Math.round(val * ppi);
    if (unit === 'cm') return Math.round((val / 2.54) * ppi);
    if (unit === 'mm') return Math.round((val / 25.4) * ppi);
    return Math.round(val);
}

interface CanvasSizeDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSetSize: (width: number, height: number, anchor: CanvasAnchor, resample: boolean) => void;
  currentSize: CanvasFrame | null;
  unit: Unit;
  ppi: number;
}

const presets = [
    { name: 'Square (1:1)', width: 1080, height: 1080 },
    { name: 'Landscape (16:9)', width: 1920, height: 1080 },
    { name: 'Portrait (4:5)', width: 1080, height: 1350 },
    { name: 'A4 Paper', width: 2480, height: 3508 },
];

export function CanvasSizeDialog({ isOpen, onOpenChange, onSetSize, currentSize, unit, ppi }: CanvasSizeDialogProps) {
  const [widthStr, setWidthStr] = React.useState('');
  const [heightStr, setHeightStr] = React.useState('');
  const [anchor, setAnchor] = React.useState<CanvasAnchor>('center');
  const [resample, setResample] = React.useState(false);
  
  React.useEffect(() => {
    if (isOpen) {
        const wPx = currentSize?.width || 1920;
        const hPx = currentSize?.height || 1080;
        setWidthStr(pxToUnit(wPx, unit, ppi).toString());
        setHeightStr(pxToUnit(hPx, unit, ppi).toString());
        setAnchor('center');
        setResample(false);
    }
  }, [isOpen, currentSize, unit, ppi]);

  const handleSetSize = () => {
    const w = parseFloat(widthStr);
    const h = parseFloat(heightStr);
    if (isNaN(w) || isNaN(h)) return;
    
    onSetSize(unitToPx(w, unit, ppi), unitToPx(h, unit, ppi), anchor, resample);
  };

  const handlePreset = (p: {width: number, height: number}) => {
    setWidthStr(pxToUnit(p.width, unit, ppi).toString());
    setHeightStr(pxToUnit(p.height, unit, ppi).toString());
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Canvas Frame Size</DialogTitle>
          <DialogDescription>
            Define a specific frame for your canvas. This will be used for exporting.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="width" className="text-right">
                Width ({unit})
                </Label>
                <Input
                id="width"
                type="number"
                value={widthStr}
                onChange={(e) => setWidthStr(e.target.value)}
                className="col-span-3"
                />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="height" className="text-right">
                Height ({unit})
                </Label>
                <Input
                id="height"
                type="number"
                value={heightStr}
                onChange={(e) => setHeightStr(e.target.value)}
                className="col-span-3"
                />
            </div>
            
            <div className="flex items-center space-x-2 my-2 border-y py-4">
               <Checkbox id="resample" checked={resample} onCheckedChange={(checked) => setResample(checked === true)} />
               <Label htmlFor="resample" className="cursor-pointer">Resample Image</Label>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
                {presets.map(p => (
                    <Button key={p.name} variant="outline" size="sm" onClick={() => handlePreset(p)}>
                        {p.name}
                    </Button>
                ))}
            </div>
            
            { !resample && (
            <div className="flex flex-col gap-2 border-t pt-4 mt-2">
                <Label>Anchor</Label>
                <div className="grid grid-cols-3 gap-1 w-32 mr-auto py-2">
                    {(['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'] as CanvasAnchor[]).map(a => (
                        <button
                            key={a}
                            title={a.replace('-', ' ')}
                            className={`w-10 h-10 rounded-sm border transition-colors ${anchor === a ? 'bg-primary border-primary' : 'bg-muted border-input hover:bg-muted/80'}`}
                            onClick={() => setAnchor(a)}
                        />
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">Select where existing content should remain pinned when resizing.</p>
            </div>
            )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSetSize}>Set Size</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
