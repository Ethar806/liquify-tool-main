
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
import { Tablet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface PenPressureDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  pressureCurve: { x: number; y: number }[];
  setPressureCurve: (curve: { x: number; y: number }[]) => void;
}

const PressureCanvas = ({ curve }: { curve: { x: number; y: number }[] }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = React.useState(false);

    const getPressure = React.useCallback((inputPressure: number) => {
        // Find the two points in the curve that the input pressure is between
        let p1 = curve[0], p2 = curve[curve.length - 1];
        for (let i = 0; i < curve.length - 1; i++) {
            if (inputPressure >= curve[i].x && inputPressure <= curve[i+1].x) {
                p1 = curve[i];
                p2 = curve[i+1];
                break;
            }
        }
        // Linear interpolation
        const t = (inputPressure - p1.x) / (p2.x - p1.x);
        return p1.y + t * (p2.y - p1.y);
    }, [curve]);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, []);

    const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
        setIsDrawing(true);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if(!ctx) return;
        
        ctx.beginPath();
        const rect = canvas.getBoundingClientRect();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    };

    const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if(!ctx) return;
        
        const pressure = e.pointerType === 'pen' ? e.pressure : 0.5;
        const adjustedPressure = getPressure(pressure);

        ctx.lineWidth = adjustedPressure * 20;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';
        
        const rect = canvas.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
    };
    
    const stopDrawing = () => {
        setIsDrawing(false);
    };

    return (
        <canvas
            ref={canvasRef}
            width="250"
            height="80"
            className="rounded-md border-2 border-dashed cursor-crosshair touch-none"
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
        />
    )
}

const CurveEditor = ({ curve, setCurve }: { curve: { x: number; y: number }[], setCurve: (curve: { x: number; y: number }[]) => void }) => {
    const S = 250; // size of canvas
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [draggingPoint, setDraggingPoint] = React.useState<number | null>(null);

    const draw = React.useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, S, S);

        // Draw grid
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 10; i++) {
            ctx.beginPath();
            ctx.moveTo(i * S/10, 0);
            ctx.lineTo(i * S/10, S);
            ctx.moveTo(0, i * S/10);
            ctx.lineTo(S, i * S/10);
            ctx.stroke();
        }

        // Draw curve
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(curve[0].x * S, (1 - curve[0].y) * S);
        for (let i = 1; i < curve.length; i++) {
            ctx.lineTo(curve[i].x * S, (1 - curve[i].y) * S);
        }
        ctx.stroke();

        // Draw points
        ctx.fillStyle = '#4f46e5';
        curve.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x * S, (1 - p.y) * S, 5, 0, Math.PI * 2);
            ctx.fill();
        });

    }, [curve]);

    React.useEffect(draw, [draw]);
    
    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / S;
        const y = 1 - (e.clientY - rect.top) / S;

        for (let i = 0; i < curve.length; i++) {
            const p = curve[i];
            const dist = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
            if (dist < 0.05) { // 0.05 is a small radius in normalized coordinates
                setDraggingPoint(i);
                return;
            }
        }
    };
    
    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (draggingPoint === null) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        
        const newX = Math.max(0, Math.min(1, (e.clientX - rect.left) / S));
        const newY = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / S));
        
        const newCurve = [...curve];
        // The first and last points are fixed on x-axis
        if (draggingPoint > 0 && draggingPoint < curve.length - 1) {
            newCurve[draggingPoint].x = newX;
        }
        newCurve[draggingPoint].y = newY;
        
        // Ensure x values are sorted
        newCurve.sort((a,b) => a.x - b.x);
        
        setCurve(newCurve);
    };

    const handlePointerUp = () => {
        setDraggingPoint(null);
    };

    return (
        <canvas
            ref={canvasRef}
            width={S}
            height={S}
            className="rounded-md border bg-background cursor-pointer touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        />
    )

}

export function PenPressureDialog({ isOpen, onOpenChange, pressureCurve, setPressureCurve }: PenPressureDialogProps) {
    const { toast } = useToast();
    const [curve, setCurve] = React.useState(pressureCurve);

    React.useEffect(() => {
        if(isOpen) {
            setCurve(pressureCurve);
        }
    }, [isOpen, pressureCurve]);

    const handleSave = () => {
        setPressureCurve(curve);
        onOpenChange(false);
        toast({ title: "Pen pressure curve updated." });
    }
    
    const handleReset = () => {
        setCurve([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    }
    
    const handleAddPoint = () => {
        const newCurve = [...curve];
        // Add a point in the middle of the longest segment
        let maxDist = 0;
        let insertIndex = 1;
        for (let i = 0; i < newCurve.length - 1; i++) {
            const dist = newCurve[i+1].x - newCurve[i].x;
            if (dist > maxDist) {
                maxDist = dist;
                insertIndex = i + 1;
            }
        }
        const p1 = newCurve[insertIndex - 1];
        const p2 = newCurve[insertIndex];
        const newPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        newCurve.splice(insertIndex, 0, newPoint);
        setCurve(newCurve);
    }
    
    const handleRemovePoint = () => {
        if (curve.length <= 2) return;
        const newCurve = [...curve];
        // Remove the last added point (that is not an endpoint)
        if (newCurve.length > 2) {
             newCurve.splice(newCurve.length - 2, 1);
        }
        setCurve(newCurve);
    }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-fit">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tablet /> Pen Pressure
          </DialogTitle>
          <DialogDescription>
            Customize the pen pressure curve to fine-tune how your stylus pressure affects brush size and opacity.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 grid grid-cols-2 gap-8 items-center">
            <div>
                <CurveEditor curve={curve} setCurve={setCurve} />
                 <div className="flex gap-2 mt-2">
                    <Button variant="outline" size="sm" onClick={handleAddPoint} disabled={curve.length >= 8}>Add Point</Button>
                    <Button variant="outline" size="sm" onClick={handleRemovePoint} disabled={curve.length <= 2}>Remove Point</Button>
                    <Button variant="outline" size="sm" onClick={handleReset}>Reset</Button>
                </div>
            </div>
            <div className='space-y-4'>
                <p className="text-sm text-muted-foreground">Test your pressure settings below.</p>
                <PressureCanvas curve={curve} />
            </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

