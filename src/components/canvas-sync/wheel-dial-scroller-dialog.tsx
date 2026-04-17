
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
import { Disc } from 'lucide-react';

interface WheelDialScrollerDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function WheelDialScrollerDialog({ isOpen, onOpenChange }: WheelDialScrollerDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Disc /> Wheel/Dial Scroller
          </DialogTitle>
          <DialogDescription>
            Customize actions for your mouse wheel or physical dial, such as zooming, rotating, or changing brush size.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 text-center text-sm text-muted-foreground">
            <p>This feature is coming soon!</p>
            <p className="text-xs mt-2">Full customization requires advanced browser APIs that are currently under development.</p>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
