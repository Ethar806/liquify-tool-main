
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
import { cn } from '@/lib/utils';
import { Check, Minus, Plus } from 'lucide-react';

export type Unit = 'px' | 'in' | 'mm' | 'cm';

interface UnitResolutionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  unit: Unit;
  setUnit: (unit: Unit) => void;
  ppi: number;
  setPpi: (ppi: number) => void;
}

const units: { id: Unit; name: string }[] = [
  { id: 'px', name: 'Pixels' },
  { id: 'in', name: 'Inches' },
  { id: 'mm', name: 'Millimeters' },
  { id: 'cm', name: 'Centimeters' },
];

export function UnitResolutionDialog({ 
  isOpen, 
  onOpenChange, 
  unit, 
  setUnit,
  ppi,
  setPpi,
}: UnitResolutionDialogProps) {

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Unit & Resolution</DialogTitle>
          <DialogDescription>
            Set the measurement unit for rulers and the resolution for the canvas.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            {units.map((u) => (
              <Button
                key={u.id}
                variant={unit === u.id ? 'default' : 'outline'}
                className="w-full justify-start"
                onClick={() => setUnit(u.id)}
              >
                {unit === u.id && <Check className="mr-2 h-4 w-4" />}
                <span>{u.name}</span>
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-4 pt-4">
            <Label>Resolution (PPI)</Label>
            <div className='flex items-center gap-2'>
              <Button variant="outline" size="icon" onClick={() => setPpi(Math.max(1, ppi-1))}><Minus/></Button>
              <span className='font-semibold text-lg w-12 text-center'>{ppi}</span>
              <Button variant="outline" size="icon" onClick={() => setPpi(ppi+1)}><Plus/></Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
