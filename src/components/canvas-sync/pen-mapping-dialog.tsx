
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tablet } from 'lucide-react';

interface PenMappingDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  forceProportions: boolean;
  setForceProportions: (force: boolean) => void;
}

const MappingPreview = ({ forceProportions }: { forceProportions: boolean }) => {
    return (
        <div className="flex flex-col items-center gap-4 p-4 rounded-lg bg-muted border">
            <div className="grid grid-cols-2 gap-8 w-full text-center">
                <div>
                    <h4 className="font-semibold mb-2">Tablet Input</h4>
                    <div className="w-full aspect-[4/3] bg-primary/20 rounded-md border-2 border-dashed border-primary/50 flex items-center justify-center">
                        <p className="text-sm text-primary">Drawing Area</p>
                    </div>
                </div>
                 <div>
                    <h4 className="font-semibold mb-2">Screen Output</h4>
                    <div className="w-full aspect-video bg-secondary/20 rounded-md border-2 border-dashed border-secondary/50 flex items-center justify-center">
                       <p className="text-sm text-secondary-foreground">Canvas Area</p>
                    </div>
                </div>
            </div>
            <div className="w-full text-sm text-center text-muted-foreground p-2 rounded-md bg-background/50">
                <p>If your tablet and screen have different aspect ratios, a circle might appear as an oval.</p>
                <p className="font-semibold mt-1">
                    {forceProportions ? "Correction is ON: Proportions will be preserved." : "Correction is OFF: Drawing may appear distorted."}
                </p>
            </div>
        </div>
    )
}

export function PenMappingDialog({ isOpen, onOpenChange, forceProportions, setForceProportions }: PenMappingDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tablet /> Pen Mapping
          </DialogTitle>
          <DialogDescription>
            Configure how your pen tablet area maps to the screen to ensure accurate proportions.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
            <MappingPreview forceProportions={forceProportions} />
             <div className="flex items-center justify-between p-4 rounded-lg border">
                <Label htmlFor="force-proportions" className="font-medium">Force Proportions</Label>
                <Switch
                    id="force-proportions"
                    checked={forceProportions}
                    onCheckedChange={setForceProportions}
                />
            </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
