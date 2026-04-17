
'use client';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Brush, Pencil, Pen, Mic, Bot, Gem, Paintbrush, SprayCan } from 'lucide-react';

export type BrushType =
  | 'round'
  | 'pencil'
  | 'ink'
  | 'airbrush';

const brushes: { name: BrushType; icon: React.ElementType; label: string }[] = [
  { name: 'ink', icon: Pen, label: 'Ink' },
  { name: 'pencil', icon: Pencil, label: 'Pencil' },
  { name: 'round', icon: Brush, label: 'Round brush' },
  { name: 'airbrush', icon: SprayCan, label: 'Air brush' },
];

interface BrushPanelProps {
  activeBrush: BrushType;
  onSelectBrush: (brush: BrushType) => void;
}

export function BrushPanel({ activeBrush, onSelectBrush }: BrushPanelProps) {
  return (
    <div>
        <h3 className="text-sm font-medium p-2">Brush</h3>
        <ScrollArea className="h-72">
            <div className="p-1">
            {brushes.map((brush) => (
                <Button
                key={brush.name}
                variant="ghost"
                className={cn(
                    'w-full justify-start',
                    activeBrush === brush.name && 'bg-accent'
                )}
                onClick={() => onSelectBrush(brush.name)}
                >
                <brush.icon className="mr-2 h-4 w-4" />
                <span>{brush.label}</span>
                </Button>
            ))}
            </div>
        </ScrollArea>
    </div>
  );
}
