
'use client';

import { useState, useRef, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Path } from './canvas';
import type { Layer, CanvasFrame } from './main-editor';

interface ExportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  paths: Path[];
  layers: Layer[];
  canvasFrame: CanvasFrame | null;
  canvasBackgroundColor: string;
}
import { cn } from '@/lib/utils';
import { Download } from 'lucide-react';
import type { BrushType } from './brush-panel';

const getEffectiveLayerProps = (layers: Layer[], id: number): { visible: boolean; opacity: number } => {
  let finalProps = { visible: true, opacity: 100 };
  
  const findAndApply = (currentLayers: Layer[], targetId: number, parentProps: {visible: boolean, opacity: number}): boolean => {
    for (const layer of currentLayers) {
      const currentVisible = parentProps.visible && layer.visible;
      const currentOpacity = (parentProps.opacity / 100) * (layer.opacity / 100) * 100;
      
      if (layer.id === targetId) {
        finalProps = { visible: currentVisible, opacity: currentOpacity };
        return true;
      }
      if (layer.type === 'group' && layer.layers) {
        if (findAndApply(layer.layers, targetId, { visible: currentVisible, opacity: currentOpacity })) {
          return true;
        }
      }
    }
    return false;
  };

  findAndApply(layers, id, { visible: true, opacity: 100 });
  return finalProps;
};


export function ExportDialog({ isOpen, onOpenChange, paths, layers, canvasFrame, canvasBackgroundColor }: ExportDialogProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [renderInfo, setRenderInfo] = useState({ scale: 1, offsetX: 0, offsetY: 0, contentWidth: 0, contentHeight: 0 });
  
  const getVisibleLayers = useCallback((layers: Layer[]): Layer[] => {
      let visible: Layer[] = [];
      for(const layer of layers) {
        const props = getEffectiveLayerProps(layers, layer.id);
        if (props.visible) {
            visible.push(layer);
            if (layer.type === 'group' && layer.layers) {
                visible = visible.concat(getVisibleLayers(layer.layers));
            }
        }
      }
      return visible;
  }, []);

  const getContentBounds = useCallback(() => {
    if (canvasFrame) {
        return {
            x: -canvasFrame.width / 2,
            y: -canvasFrame.height / 2,
            width: canvasFrame.width,
            height: canvasFrame.height,
        }
    }
      
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const padding = 20;
    
    const visibleLayers = getVisibleLayers(layers);
    const visibleLayerIds = visibleLayers.map(l => l.id);
    const visiblePaths = paths.filter(p => visibleLayerIds.includes(p.layerId));

    if (visiblePaths.length === 0 && visibleLayers.every(l => l.pastedImage.length === 0)) {
        return { x: 0, y: 0, width: 500, height: 400 };
    }

    visiblePaths.forEach(path => {
        path.points.forEach(point => {
            const strokeWidth = path.strokeWidth / 2;
            minX = Math.min(minX, point.x - strokeWidth);
            minY = Math.min(minY, point.y - strokeWidth);
            maxX = Math.max(maxX, point.x + strokeWidth);
            maxY = Math.max(maxY, point.y + strokeWidth);
        });
    });

    visibleLayers.forEach(layer => {
        (layer.pastedImage || []).forEach(img => {
            minX = Math.min(minX, img.x);
            minY = Math.min(minY, img.y);
            maxX = Math.max(maxX, img.x + img.imageData.width);
            maxY = Math.max(maxY, img.y + img.imageData.height);
        });
    });
    
    if (!isFinite(minX)) {
        return { x: 0, y: 0, width: 500, height: 400 };
    }

    return {
        x: minX - padding,
        y: minY - padding,
        width: (maxX - minX) + padding * 2,
        height: (maxY - minY) + padding * 2,
    }
  }, [paths, layers, canvasFrame, getVisibleLayers]);
  
  const drawPath = (context: CanvasRenderingContext2D, path: Path, applyOpacity = true) => {
    const effectiveProps = getEffectiveLayerProps(layers, path.layerId);
    if (!effectiveProps.visible || path.points.length < 1) return;

    context.save();
    
    const isPixelRemoval = path.tool === 'eraser';
    
    // ALWAYS set globalCompositeOperation inside the loop for every stroke
    context.globalCompositeOperation = isPixelRemoval ? 'destination-out' : 'source-over';
    
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (isPixelRemoval) {
        context.globalAlpha = (path.opacity ?? 100) / 100;
        context.strokeStyle = '#000000';
    } else {
        if (applyOpacity) {
          context.globalAlpha = effectiveProps.opacity / 100;
        }
        context.strokeStyle = path.color;
    }

    if (path.tool === 'fill' && path.shape === 'rectangle') {
        const start = path.points[0];
        const end = path.points[path.points.length - 1];
        const rectWidth = end.x - start.x;
        const rectHeight = end.y - start.y;
        context.fillStyle = isPixelRemoval ? '#000000' : path.color;
        context.fillRect(start.x, start.y, rectWidth, rectHeight);
        context.restore();
        return;
    }

    if (path.tool === 'shape' && path.shape === 'rectangle') {
      const start = path.points[0];
      const end = path.points[path.points.length - 1];
      context.strokeStyle = isPixelRemoval ? '#000000' : path.color;
      context.lineWidth = path.strokeWidth;
      context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
      context.restore();
      return;
    }
    
    if (!isPixelRemoval) {
        switch (path.brushType) {
            case 'ink':
                context.globalAlpha *= 0.9;
                break;
            case 'pencil':
                context.globalAlpha *= 0.7;
                break;
            case 'marker':
                context.globalAlpha *= 0.5;
                context.lineCap = 'square';
                break;
            case 'calligraphy':
                context.globalAlpha *= 0.9;
                context.lineCap = 'butt';
                context.lineJoin = 'miter';
                break;
        }
    }
    
    if (path.brushType === 'airbrush') {
        path.points.forEach(p => {
            context.beginPath();
            const pressure = p.pressure > 0 ? p.pressure : 0.5;
            const currentBrushSize = path.strokeWidth * pressure;
            
            if (isPixelRemoval) {
                context.fillStyle = '#000000';
            } else {
                 const baseColorHex = path.color.substring(0,7);
                 const gradient = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, currentBrushSize / 2);
                 gradient.addColorStop(0, `${baseColorHex}80`);
                 gradient.addColorStop(1, `${baseColorHex}00`);
                 context.fillStyle = gradient;
            }

            context.arc(p.x, p.y, currentBrushSize / 2, 0, 2 * Math.PI);
            context.fill();
        });
        context.restore();
        return;
    }

    if (path.points.length < 2) {
        const p = path.points[0];
        const pressure = p.pressure > 0 ? p.pressure : 0.5;
        const radius = (path.strokeWidth * pressure) / 2;
        context.beginPath();
        context.fillStyle = isPixelRemoval ? '#000000' : path.color;
        context.arc(p.x, p.y, radius, 0, 2 * Math.PI);
        context.fill();
    } else {
        let prevMidPoint = { x: path.points[0].x, y: path.points[0].y };
        
        for (let i = 1; i < path.points.length; i++) {
            const p1 = path.points[i-1];
            const p2 = path.points[i];
            const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            
            context.beginPath();
            context.moveTo(prevMidPoint.x, prevMidPoint.y);
            context.quadraticCurveTo(p1.x, p1.y, midPoint.x, midPoint.y);
            context.lineWidth = path.strokeWidth * (p1.pressure || 0.5);
            context.stroke();
            
            prevMidPoint = midPoint;
        }
        
        const lastPoint = path.points[path.points.length - 1];
        context.beginPath();
        context.moveTo(prevMidPoint.x, prevMidPoint.y);
        context.lineTo(lastPoint.x, lastPoint.y);
        context.lineWidth = path.strokeWidth * (lastPoint.pressure || 0.5);
        context.stroke();
    }
    context.restore();
  };
  
  const drawLayersForExport = (context: CanvasRenderingContext2D, layersToDraw: Layer[], layerCanvasPool: HTMLCanvasElement[] = [], depth: number = 0) => {
    const getLayerCanvas = () => {
        while (layerCanvasPool.length <= depth) {
            layerCanvasPool.push(document.createElement('canvas'));
        }
        const canvas = layerCanvasPool[depth];
        if (canvas.width !== context.canvas.width || canvas.height !== context.canvas.height) {
            canvas.width = context.canvas.width;
            canvas.height = context.canvas.height;
        }
        return canvas;
    };

    layersToDraw.slice().reverse().forEach(layer => {
      const effectiveProps = getEffectiveLayerProps(layers, layer.id);
      if (!effectiveProps.visible) return;

      const layerPaths = paths.filter(p => p.layerId === layer.id);
      const hasEraser = layerPaths.some(p => p.tool === 'eraser');

      if (!hasEraser) {
          context.save();
          context.globalAlpha = effectiveProps.opacity / 100;
          
          layerPaths.forEach(path => drawPath(context, path, false));
          
          if (layer.pastedImage) {
            layer.pastedImage.forEach(img => {
                context.drawImage(img.imageData, img.x, img.y);
            });
          }

          if (layer.type === 'group' && layer.layers) {
              drawLayersForExport(context, layer.layers, layerCanvasPool, depth + 1);
          }
          
          context.restore();
      } else {
          const offCanvas = getLayerCanvas();
          const offCtx = offCanvas.getContext('2d');
          if (!offCtx) return;

          offCtx.save();
          offCtx.setTransform(1, 0, 0, 1, 0, 0);
          offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
          offCtx.restore();

          offCtx.save();
          offCtx.setTransform(context.getTransform());

          layerPaths.forEach(path => drawPath(offCtx, path, false));
          
          if (layer.pastedImage) {
            layer.pastedImage.forEach(img => offCtx.drawImage(img.imageData, img.x, img.y));
          }

          if (layer.type === 'group' && layer.layers) {
              drawLayersForExport(offCtx, layer.layers, layerCanvasPool, depth + 1);
          }

          offCtx.restore();

          context.save();
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.globalAlpha = effectiveProps.opacity / 100;
          context.drawImage(offCanvas, 0, 0);
          context.restore();
      }
    });
  }


  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    
    const bounds = getContentBounds();
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    const scale = Math.min(containerWidth / bounds.width, containerHeight / bounds.height, 1);
    const contentWidth = bounds.width * scale;
    const contentHeight = bounds.height * scale;
    const offsetX = (containerWidth - contentWidth) / 2;
    const offsetY = (containerHeight - contentHeight) / 2;

    setRenderInfo({ scale, offsetX, offsetY, contentWidth, contentHeight });

    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerWidth * dpr;
    canvas.height = containerHeight * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;
    context.scale(dpr, dpr);

    context.clearRect(0, 0, containerWidth, containerHeight);
    
    context.save();
    
    context.translate(offsetX, offsetY);
    context.scale(scale, scale);
    context.translate(-bounds.x, -bounds.y);

    context.fillStyle = canvasBackgroundColor;
    context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    
    drawLayersForExport(context, layers);
    
    context.restore();

  }, [getContentBounds, layers, paths, canvasBackgroundColor]);

  useEffect(() => {
    if(isOpen) {
        const timer = setTimeout(() => {
            drawPreview();
        }, 100);

        const resizeObserver = new ResizeObserver(drawPreview);

        const currentContainer = containerRef.current
        if(currentContainer) {
          resizeObserver.observe(currentContainer);
        }
        
        return () => {
          clearTimeout(timer);
          if (currentContainer) {
            resizeObserver.unobserve(currentContainer);
          }
        };
    }
  }, [isOpen, drawPreview]);

    const handleExport = async (format: 'png' | 'jpeg') => {
        const contentBounds = getContentBounds();
    
        if (contentBounds.width <= 0 || contentBounds.height <= 0) {
            toast({ variant: 'destructive', title: "Export failed", description: "The canvas is empty." });
            return;
        }
    
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.round(contentBounds.width);
        tempCanvas.height = Math.round(contentBounds.height);
        const tempCtx = tempCanvas.getContext('2d');
        
        if (!tempCtx) {
            toast({ variant: 'destructive', title: "Export failed", description: "Could not create an image canvas." });
            return;
        }
        
        tempCtx.translate(-contentBounds.x, -contentBounds.y);
    
        tempCtx.fillStyle = canvasBackgroundColor;
        tempCtx.fillRect(contentBounds.x, contentBounds.y, contentBounds.width, contentBounds.height);
    
        drawLayersForExport(tempCtx, layers);
    
        try {
            const extension = format === 'jpeg' ? 'jpg' : 'png';
            const fileName = `export-${new Date().toISOString().split('T')[0]}.${extension}`;
            const url = tempCanvas.toDataURL(`image/${format}`, format === 'jpeg' ? 0.9 : 1.0);
            const res = await fetch(url);
            const blob = await res.blob();
            
            if ((window as any).showSaveFilePicker) {
                const handle = await (window as any).showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: `${format.toUpperCase()} Image`,
                        accept: { [`image/${format}`]: [`.${extension}`] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                toast({ title: "Image exported successfully!" });
            } else {
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
                toast({ title: "Image exported successfully!" });
            }
            onOpenChange(false);
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                 toast({ variant: 'destructive', title: "Export failed", description: e.message });
            }
        }
      };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Export Canvas</DialogTitle>
        </DialogHeader>
        <div ref={containerRef} className="flex-1 overflow-hidden bg-muted/50 rounded-md flex items-center justify-center p-4">
            <canvas
                ref={canvasRef}
                className={cn('shadow-lg max-w-full max-h-full')}
                style={{ backgroundColor: canvasBackgroundColor }}
            />
        </div>
        <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => handleExport('jpeg')} variant="secondary">
                <Download className="mr-2 h-4 w-4" />
                Export JPG
            </Button>
            <Button onClick={() => handleExport('png')}>
                <Download className="mr-2 h-4 w-4" />
                Export PNG
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
