
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
import { MousePointer } from 'lucide-react';

interface RightSideButtonDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function RightSideButtonDialog({ isOpen, onOpenChange }: RightSideButtonDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MousePointer /> Right/Side Button Settings
          </DialogTitle>
          <DialogDescription>
            Customize the actions performed by your stylus's side buttons or your mouse's right-click.
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
