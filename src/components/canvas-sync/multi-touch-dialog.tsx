
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
import { Touchpad } from 'lucide-react';

interface MultiTouchDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function MultiTouchDialog({ isOpen, onOpenChange }: MultiTouchDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Touchpad /> Multi-touch Gestures
          </DialogTitle>
          <DialogDescription>
            Configure settings for multi-touch gestures like pinch-to-zoom and two-finger pan/rotate.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 text-center text-sm text-muted-foreground">
            <p>This feature is coming soon!</p>
            <p className="text-xs mt-2">Deeper support for touch gestures requires advanced browser APIs that are currently under development.</p>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
