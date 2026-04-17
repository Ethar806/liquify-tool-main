'use client';


import { useRef, useEffect, useState, useCallback, type Dispatch, type SetStateAction, forwardRef, useImperativeHandle } from 'react';
import type { Tool, Selection, CanvasFrame, FloatingSelectionCommit, LiquifySettings } from './main-editor';
import { cn } from '@/lib/utils';
import type { BrushType } from './brush-panel';
import type { Layer } from './main-editor';
import { Unit } from './unit-resolution-dialog';


interface Point {
  x: number;
  y: number;
  pressure: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const seededNoise = (x: number, y: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

const brushTipCache = new Map<string, HTMLCanvasElement>();

export type ShapeType = 'rectangle' | 'circle' | 'ellipse' | 'line' | 'arrow' | 'triangle' | 'polygon';

export interface Path {
  points: Point[];
  tool: 'brush' | 'eraser' | 'shape' | 'fill';
  strokeWidth: number;
  color: string;
  brushType: BrushType;
  layerId: number;
  shape?: ShapeType;
  opacity?: number;
  clipRect?: { x: number, y: number, width: number, height: number, points?: {x: number, y: number}[] } | null;
  isSelectionInverted?: boolean;
}

interface CanvasTransform {
    x: number;
    y: number;
    zoom: number;
    rotation: number;
    flip: { horizontal: boolean, vertical: boolean };
}

export interface CanvasRef {
    getSelectionImageData: () => ImageData | null;
    getLayerRaster: (layerId: number) => { imageData: HTMLCanvasElement; x: number; y: number } | null;
    clearSelection: () => void;
    fillSelection: (color: string) => void;
    drawPastedImage: (image: HTMLCanvasElement, x: number, y: number) => void;
    getVisibleFrame: () => Selection | null;
}

interface CanvasProps {
  activeTool: Tool;
  setActiveTool: (tool: Tool) => void;
  paths: Path[];
  setPaths: Dispatch<SetStateAction<Path[]>>;
  brushSize: number;
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushOpacity: number;
  brushType: BrushType;
  layers: Layer[];
  setLayers: Dispatch<SetStateAction<Layer[]>>;
  activeLayerId: number;
  showGrid: boolean;
  showRulers: boolean;
  lockView: boolean;
  selection: Selection | null;
  setSelection: Dispatch<SetStateAction<Selection | null>>;
  onUndo: () => void;
  onRedo: () => void;
  transform: CanvasTransform;
  setTransform: Dispatch<SetStateAction<CanvasTransform>>;
  onPaste: (imageData: HTMLCanvasElement) => void;
  onSelectCanvasFrame: () => void;
  isSelectionInverted: boolean;
  activeChannel: 'all' | 'red' | 'green' | 'blue' | 'alpha';
  canvasFrame: CanvasFrame | null;
  canvasBackgroundColor: string;
  unit: Unit;
  ppi: number;
  pressureCurve: { x: number, y: number }[];
  forceProportions: boolean;
  onCommitTransformRaster?: (composite: HTMLCanvasElement, x: number, y: number, capturedLayerIds: number[], originalSel: Selection | null, newSel: Selection | null) => void;
  fillTolerance: number;
  fillContiguous: boolean;
  onPaintBucketFill: (imageData: HTMLCanvasElement, x: number, y: number) => void;
  onCommitCrop: (cropRect: {x: number, y: number, width: number, height: number}) => void;
  isSimulatingPressure: boolean;
  activeShapeType: ShapeType;
  liquifySettings: LiquifySettings;
  onCommitMove?: (dx: number, dy: number) => void;
  onCommitFloatingSelection?: (payload: FloatingSelectionCommit) => void;
}

type InteractionState = 'idle' | 'selecting' | 'selected' | 'dragging' | 'transforming';

interface FloatingSelection {
  image: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
  originalX: number;
  originalY: number;
}

const LIQUIFY_VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    // WebGL texture maps (0,0) bottom-left to (0,1) top-left in Canvas. 
    v_uv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  }
`;

const LIQUIFY_FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;
  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform vec2 u_brushPos;
  uniform vec2 u_moveVec;
  uniform float u_radius;
  uniform float u_strength;

  void main() {
    vec2 pixelPos = v_uv * u_resolution;
    float dist = distance(pixelPos, u_brushPos);
    
    if (dist < u_radius) {
        float influence = 1.0 - (dist / u_radius);
        vec2 offsetPixel = u_moveVec * influence * (u_strength / 100.0);
        vec2 newUV = v_uv - (offsetPixel / u_resolution);
        newUV = clamp(newUV, 0.0, 1.0);
        gl_FragColor = texture2D(u_texture, newUV);
    } else {
        gl_FragColor = texture2D(u_texture, v_uv);
    }
  }
`;

interface LiquifyStrokeSession {
  active: boolean;
  lastPoint: Point | null;
  lastUpdateTime?: number;
  workingData?: {
    originalImage: HTMLCanvasElement;
    image: HTMLCanvasElement;
    x: number;
    y: number;
    rotation?: number;
    gl: WebGLRenderingContext | WebGL2RenderingContext;
    glCanvas: HTMLCanvasElement;
    program: WebGLProgram;
    pingTexture: WebGLTexture;
    pongTexture: WebGLTexture;
    fbo: WebGLFramebuffer;
    quadBuffer: WebGLBuffer;
    width: number;
    height: number;
  }[] | null;
}

export interface TransformSession {
  isActive: boolean;
  action: 'idle' | 'scale' | 'rotate' | 'move';
  grabHandle: 'tl'|'tr'|'bl'|'br'|'t'|'b'|'l'|'r' | 'rot' | 'center' | null;
  startMouse: Point;
  initialRect: { x: number, y: number, width: number, height: number };
  currentRect: { x: number, y: number, width: number, height: number };
  rotation: number;
  initialRotation: number;
}

export interface CropSession {
  isActive: boolean;
  action: 'idle' | 'create' | 'resize' | 'move';
  grabHandle: 'tl'|'tr'|'bl'|'br'|'t'|'b'|'l'|'r' | 'center' | null;
  startMouse: Point;
  initialRect: { x: number, y: number, width: number, height: number };
  currentRect: { x: number, y: number, width: number, height: number };
}

const RULER_BACKGROUND = '#ADFF2F';
const RULER_TEXT_COLOR = '#000000';
const RULER_LINE_COLOR = 'hsl(240 4% 30%)';
const GRID_LINE_COLOR = 'hsl(240 4% 30%)';

const findLayer = (layers: Layer[], id: number): Layer | null => {
    for (const layer of layers) {
        if (layer.id === id) return layer;
        if (layer.type === 'group' && layer.layers) {
            const found = findLayer(layer.layers, id);
            if (found) return found;
        }
    }
    return null;
};

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

const isPointInPolygon = (p: {x: number, y: number}, polygon: {x: number, y: number}[]) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > p.y) !== (yj > p.y))
            && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};


export const Canvas = forwardRef<CanvasRef, CanvasProps>(({
  activeTool,
  setActiveTool,
  paths,
  setPaths,
  brushSize,
  brushColor,
  setBrushColor,
  brushOpacity,
  brushType,
  layers,
  setLayers,
  activeLayerId,
  showGrid,
  showRulers,
  lockView,
  selection,
  setSelection,
  onUndo,
  onRedo,
  transform,
  setTransform,
  onPaste,
  onSelectCanvasFrame,
  isSelectionInverted,
  activeChannel,
  canvasFrame,
  canvasBackgroundColor,
  unit,
  ppi,
  pressureCurve,
  forceProportions,
  onCommitTransformRaster,
  fillTolerance,
  fillContiguous,
  onPaintBucketFill,
  onCommitCrop,
  isSimulatingPressure,
  activeShapeType,
  liquifySettings,
  onCommitMove,
  onCommitFloatingSelection,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<Path | null>(null);

  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePosition, setLastMousePosition] = useState({ x: 0, y: 0 });
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isSpacebarDown, setIsSpacebarDown] = useState(false);
  const originalToolRef = useRef<Tool>(activeTool);
  const isSpacebarPanRef = useRef<boolean>(false);

  const [moveSession, setMoveSession] = useState<{ startX: number; startY: number; dx: number; dy: number } | null>(null);
  const [movingSelection, setMovingSelection] = useState<{ startX: number; startY: number; initialSelX: number; initialSelY: number; initialPoints?: {x: number, y: number}[] } | null>(null);

  // draftSelection: only visible while the user is actively dragging to create a new selection
  const [draftSelection, setDraftSelection] = useState<Selection | null>(null);

  // Rasterized snapshot used during transform operations
  const transformRasterRef = useRef<HTMLCanvasElement | null>(null);
  const transformRasterOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const transformCapturedLayerIdsRef = useRef<number[]>([]);

  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  
  const [ruler, setRuler] = useState<{start: Point, end: Point} | null>(null);

  const animationFrameId = useRef<number>();
  const [selectionOffset, setSelectionOffset] = useState(0);
  const layerCanvasPoolRef = useRef<HTMLCanvasElement[]>([]);
  const sceneCacheRef = useRef<HTMLCanvasElement | null>(null);
  const sceneCacheMetaRef = useRef<{ key: string; dirty: boolean }>({ key: '', dirty: true });

  // Cursor preview state
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  // Performance: ref-based current path for lag-free drawing
  const currentPathRef = useRef<Path | null>(null);
  const redrawRequestRef = useRef<number | null>(null);
  const needsRedrawRef = useRef(false);
  
  // Layer caching to avoid redrawing all paths on every frame
  const layerCacheRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const needsCacheRebuildRef = useRef<Set<number>>(new Set());

  // Buffer for currently drawing interactive stroke
  const drawingBufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastDrawnPointIndexRef = useRef<number>(0);
  const lastCarryRef = useRef<number>(0);



  const [transformSession, setTransformSession] = useState<TransformSession | null>(null);
  const [cropSession, setCropSession] = useState<CropSession | null>(null);
  const [interactionState, setInteractionState] = useState<InteractionState>('idle');
  const [floatingSelection, setFloatingSelection] = useState<FloatingSelection | null>(null);
  const liquifyStrokeRef = useRef<LiquifyStrokeSession>({ active: false, lastPoint: null, workingData: null, lastUpdateTime: 0 });

  // Only invalidate the scene cache for structural changes (layer add/delete/visibility/opacity change),
  // NOT for new strokes — those are baked directly into bakedStrokeCanvasRef.
  // We track the layer structure separately to detect true structural changes.
  const prevLayerStructureRef = useRef<string>('');
  const prevPathsLengthRef = useRef<number>(0);

  // Invalidate scene cache if layers structure changes (but NOT when a new stroke is just committed)
  useEffect(() => {
    const layerStructKey = JSON.stringify(layers.map(l => ({ id: l.id, visible: l.visible, opacity: l.opacity, type: l.type })));
    if (layerStructKey !== prevLayerStructureRef.current) {
        prevLayerStructureRef.current = layerStructKey;
        // Full layer structure change - need to rebuild scene cache
        sceneCacheMetaRef.current.dirty = true;
    }
    // paths length change means undo/redo happened - need full rebuild
    if (paths.length < prevPathsLengthRef.current) {
        sceneCacheMetaRef.current.dirty = true;
    }
    prevPathsLengthRef.current = paths.length;
  }, [paths, layers]);

  const getTransformMatrix = useCallback((session: TransformSession) => {
      const { initialRect, currentRect, rotation } = session;
      const matrix = new DOMMatrix();
      if (initialRect.width === 0 || initialRect.height === 0) return matrix;

      const cx = currentRect.x + currentRect.width / 2;
      const cy = currentRect.y + currentRect.height / 2;
      matrix.translateSelf(cx, cy);
      matrix.rotateSelf(rotation * 180 / Math.PI);
      matrix.scaleSelf(currentRect.width / initialRect.width, currentRect.height / initialRect.height);
      const icx = initialRect.x + initialRect.width / 2;
      const icy = initialRect.y + initialRect.height / 2;
      matrix.translateSelf(-icx, -icy);
      return matrix;
  }, []);

  const eraseSelectionFromLayerImages = useCallback((sel: Selection) => {
      setLayers(prev => {
          const clearInTree = (layerList: Layer[]): Layer[] => layerList.map(layer => {
              if (layer.id === activeLayerId && layer.pastedImage?.length) {
                  const cleared = layer.pastedImage.map(img => {
                      const w = img.width ?? img.imageData.width;
                      const h = img.height ?? img.imageData.height;
                      const out = document.createElement('canvas');
                      out.width = w;
                      out.height = h;
                      const outCtx = out.getContext('2d');
                      if (!outCtx) return img;
                      outCtx.drawImage(img.imageData, 0, 0, w, h);
                      outCtx.save();
                      outCtx.globalCompositeOperation = 'destination-out';
                      outCtx.translate(-img.x, -img.y);
                      outCtx.beginPath();
                      if (sel.points && sel.points.length > 2) {
                          outCtx.moveTo(sel.points[0].x, sel.points[0].y);
                          for (let i = 1; i < sel.points.length; i++) outCtx.lineTo(sel.points[i].x, sel.points[i].y);
                          outCtx.closePath();
                      } else {
                          outCtx.rect(sel.x, sel.y, sel.width, sel.height);
                      }
                      outCtx.fill();
                      outCtx.restore();
                      return { ...img, imageData: out };
                  });
                  return { ...layer, pastedImage: cleared };
              }
              if (layer.type === 'group' && layer.layers) return { ...layer, layers: clearInTree(layer.layers) };
              return layer;
          });
          return clearInTree(prev);
      });
  }, [activeLayerId, setLayers]);

  const extractSelectionToFloating = useCallback((sel: Selection) => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = Math.max(1, Math.ceil(sel.width));
      tempCanvas.height = Math.max(1, Math.ceil(sel.height));
      const tempContext = tempCanvas.getContext('2d');
      if (!tempContext) return;

      tempContext.save();
      tempContext.translate(-sel.x, -sel.y);
      if (sel.points && sel.points.length > 2) {
          tempContext.beginPath();
          tempContext.moveTo(sel.points[0].x, sel.points[0].y);
          for (let i = 1; i < sel.points.length; i++) tempContext.lineTo(sel.points[i].x, sel.points[i].y);
          tempContext.closePath();
          tempContext.clip();
      }

      paths.filter(p => p.layerId === activeLayerId).forEach(path => drawPath(tempContext, path));
      const activeLayer = findLayer(layers, activeLayerId);
      activeLayer?.pastedImage.forEach(img => {
          const w = img.width ?? img.imageData.width;
          const h = img.height ?? img.imageData.height;
          const cx = img.x + w / 2;
          const cy = img.y + h / 2;
          tempContext.save();
          tempContext.translate(cx, cy);
          if (img.rotation) tempContext.rotate(img.rotation);
          tempContext.drawImage(img.imageData, -w / 2, -h / 2, w, h);
          tempContext.restore();
      });
      tempContext.restore();

      // Clear selected pixels from base content immediately.
      const eraserPath: Path = {
          points: sel.points && sel.points.length > 2
              ? sel.points.map(p => ({ x: p.x, y: p.y, pressure: 0.5 }))
              : [
                  { x: sel.x, y: sel.y, pressure: 0.5 },
                  { x: sel.x + sel.width, y: sel.y + sel.height, pressure: 0.5 },
              ],
          tool: 'eraser',
          brushType: 'round',
          color: '#000000',
          strokeWidth: 1,
          layerId: activeLayerId,
          shape: sel.points && sel.points.length > 2 ? 'polygon' : 'rectangle',
          opacity: 100,
          clipRect: sel,
          isSelectionInverted,
      };
      setPaths(prev => [...prev, eraserPath]);
      eraseSelectionFromLayerImages(sel);

      setFloatingSelection({
          image: tempCanvas,
          x: sel.x,
          y: sel.y,
          width: sel.width,
          height: sel.height,
          originalX: sel.x,
          originalY: sel.y,
      });
      setSelection({ ...sel });
      setInteractionState('selected');
  }, [activeLayerId, eraseSelectionFromLayerImages, isSelectionInverted, layers, paths, setPaths]);

  useEffect(() => {
     if (activeTool === 'transform' && !transformSession) {
         if (floatingSelection) {
             transformRasterRef.current = floatingSelection.image;
             transformCapturedLayerIdsRef.current = [activeLayerId];
             setTransformSession({
                 isActive: true,
                 action: 'idle',
                 grabHandle: null,
                 startMouse: { x: 0, y: 0, pressure: 0 },
                 initialRect: { x: floatingSelection.x, y: floatingSelection.y, width: floatingSelection.width, height: floatingSelection.height },
                 currentRect: { x: floatingSelection.x, y: floatingSelection.y, width: floatingSelection.width, height: floatingSelection.height },
                 rotation: 0,
                 initialRotation: 0,
             });
             setInteractionState('transforming');
             return;
         }
         // --- Determine bounding region to capture ---
         let bounds: { x: number, y: number, width: number, height: number } | null = null;
         
         if (selection) { 
             bounds = { ...selection }; 
         } else {
            // Compute bounds across ALL visible layers
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const collectBounds = (layerList: Layer[]) => {
                for (const layer of layerList) {
                    if (!layer.visible) continue;
                    paths.filter(p => p.layerId === layer.id).forEach(p => {
                        p.points.forEach(pt => {
                            minX = Math.min(minX, pt.x - p.strokeWidth / 2);
                            minY = Math.min(minY, pt.y - p.strokeWidth / 2);
                            maxX = Math.max(maxX, pt.x + p.strokeWidth / 2);
                            maxY = Math.max(maxY, pt.y + p.strokeWidth / 2);
                        });
                    });
                    layer.pastedImage?.forEach(img => {
                        const w = img.width ?? img.imageData.width;
                        const h = img.height ?? img.imageData.height;
                        minX = Math.min(minX, img.x); minY = Math.min(minY, img.y);
                        maxX = Math.max(maxX, img.x + w); maxY = Math.max(maxY, img.y + h);
                    });
                    if (layer.type === 'group' && layer.layers) collectBounds(layer.layers);
                }
            };
            collectBounds(layers);
            if (minX !== Infinity) {
                const PAD = 4;
                bounds = { x: minX - PAD, y: minY - PAD, width: (maxX - minX) + PAD * 2, height: (maxY - minY) + PAD * 2 };
            }
         }
         
         if (bounds) {
             // --- Rasterize all visible layers into a temp canvas at world coords ---
             const bx = Math.floor(bounds.x);
             const by = Math.floor(bounds.y);
             const bw = Math.ceil(bounds.width);
             const bh = Math.ceil(bounds.height);

             const raster = document.createElement('canvas');
             raster.width = bw;
             raster.height = bh;
             const rCtx = raster.getContext('2d');
             if (rCtx) {
                 rCtx.save();
                 rCtx.translate(-bx, -by);
                 
                 if (selection && selection.points && selection.points.length > 2) {
                     rCtx.beginPath();
                     rCtx.moveTo(selection.points[0].x, selection.points[0].y);
                     for (let i = 1; i < selection.points.length; i++) {
                         rCtx.lineTo(selection.points[i].x, selection.points[i].y);
                     }
                     rCtx.closePath();
                     rCtx.clip();
                 }

                 // Draw all visible layers
                 const renderLayersFlat = (layerList: Layer[]) => {
                     [...layerList].reverse().forEach(layer => {
                         if (!layer.visible) return;
                         const effectiveProps = getEffectiveLayerProps(layers, layer.id);
                         if (!effectiveProps.visible) return;
                         rCtx.save();
                         rCtx.globalAlpha = effectiveProps.opacity / 100;
                         paths.filter(p => p.layerId === layer.id).forEach(p => drawPath(rCtx, p));
                         layer.pastedImage?.forEach(img => {
                             const w = img.width ?? img.imageData.width;
                             const h = img.height ?? img.imageData.height;
                             const cx = img.x + w / 2;
                             const cy = img.y + h / 2;
                             rCtx.save();
                             rCtx.translate(cx, cy);
                             if (img.rotation) rCtx.rotate(img.rotation);
                             rCtx.drawImage(img.imageData, -w/2, -h/2, w, h);
                             rCtx.restore();
                         });
                         if (layer.type === 'group' && layer.layers) renderLayersFlat(layer.layers);
                         rCtx.restore();
                     });
                 };
                 renderLayersFlat(layers);
                 rCtx.restore();
             }
             transformRasterRef.current = raster;
             transformRasterOriginRef.current = { x: bx, y: by };
             // Collect all layer IDs that were captured
             const collectAllIds = (layerList: Layer[]): number[] => {
                 let ids: number[] = [];
                 for (const l of layerList) {
                     if (l.visible) {
                         ids.push(l.id);
                         if (l.type === 'group' && l.layers) ids = ids.concat(collectAllIds(l.layers));
                     }
                 }
                 return ids;
             };
             transformCapturedLayerIdsRef.current = collectAllIds(layers);

             setTransformSession({
                 isActive: true, action: 'idle', grabHandle: null,
                 startMouse: {x:0,y:0,pressure:0},
                 initialRect: { x: bx, y: by, width: bw, height: bh },
                 currentRect: { x: bx, y: by, width: bw, height: bh },
                 rotation: 0,
                 initialRotation: 0
             });
         }
     } else if (activeTool !== 'transform' && transformSession) {
         setTransformSession(null);
         transformRasterRef.current = null;
         setInteractionState(floatingSelection ? 'selected' : 'idle');
     }
  }, [activeTool, transformSession, selection, activeLayerId, paths, layers, floatingSelection]);

    const getAdjustedPressure = useCallback((inputPressure: number) => {
        if (inputPressure <= 0) return 0;
        if (inputPressure >= 1) return 1;
        let p1 = pressureCurve[0], p2 = pressureCurve[pressureCurve.length - 1];
        for (let i = 0; i < pressureCurve.length - 1; i++) {
            if (inputPressure >= pressureCurve[i].x && inputPressure <= pressureCurve[i+1].x) {
                p1 = pressureCurve[i];
                p2 = pressureCurve[i+1];
                break;
            }
        }
        const t = (inputPressure - p1.x) / (p2.x - p1.x);
        return p1.y + t * (p2.y - p1.y);
    }, [pressureCurve]);

    useImperativeHandle(ref, () => ({
        getSelectionImageData: () => {
            const canvas = canvasRef.current;
            const context = contextRef.current;
            if (!canvas || !context) return null;

            const sel = selection || { x: 0, y: 0, width: canvas.width / transform.zoom, height: canvas.height / transform.zoom };

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = sel.width;
            tempCanvas.height = sel.height;
            const tempContext = tempCanvas.getContext('2d');
            if (!tempContext) return null;
            
            tempContext.save();
            tempContext.translate(-sel.x, -sel.y);
            
            if (sel.points && sel.points.length > 0) {
                tempContext.beginPath();
                tempContext.moveTo(sel.points[0].x, sel.points[0].y);
                for (let i = 1; i < sel.points.length; i++) {
                    tempContext.lineTo(sel.points[i].x, sel.points[i].y);
                }
                tempContext.closePath();
                tempContext.clip();
            }

            paths.filter(p => p.layerId === activeLayerId).forEach(path => drawPath(tempContext, path));
            
            const activeLayer = findLayer(layers, activeLayerId);
            activeLayer?.pastedImage.forEach(img => {
                tempContext.drawImage(img.imageData, img.x, img.y);
            });
            tempContext.restore();

            return tempContext.getImageData(0, 0, sel.width, sel.height);
        },
        getLayerRaster: (layerId: number) => {
            const l = findLayer(layers, layerId);
            if (!l) return null;

            const allPaths: Path[] = [];
            const allImages: { imageData: HTMLCanvasElement; x: number; y: number; rotation?: number; width?: number; height?: number }[] = [];

            const collectRecursive = (layer: Layer) => {
                paths.filter(p => p.layerId === layer.id).forEach(p => allPaths.push(p));
                layer.pastedImage?.forEach(img => allImages.push(img));
                if (layer.type === 'group' && layer.layers) {
                    layer.layers.forEach(child => collectRecursive(child));
                }
            };

            collectRecursive(l);

            // Compute bounding box
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            allPaths.forEach(p => {
                p.points.forEach(pt => {
                    const radius = p.strokeWidth / 2;
                    minX = Math.min(minX, pt.x - radius);
                    minY = Math.min(minY, pt.y - radius);
                    maxX = Math.max(maxX, pt.x + radius);
                    maxY = Math.max(maxY, pt.y + radius);
                });
            });

            allImages.forEach(img => {
                const w = img.width ?? img.imageData.width;
                const h = img.height ?? img.imageData.height;
                minX = Math.min(minX, img.x);
                minY = Math.min(minY, img.y);
                maxX = Math.max(maxX, img.x + w);
                maxY = Math.max(maxY, img.y + h);
            });

            if (minX === Infinity) return null;

            const width = Math.ceil(maxX - minX);
            const height = Math.ceil(maxY - minY);
            if (width <= 0 || height <= 0) return null;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) return null;

            tempCtx.save();
            tempCtx.translate(-minX, -minY);
            
            // Note: This draws in a specific order. To be perfectly accurate we'd nestedly draw layers.
            // But since we are flattening, drawing all paths then all images of the collected set is a decent approximation.
            // Better: Re-use drawLayers logic on a temporary context? 
            // Yes, let's use a simplified drawLayers logic here to preserve inter-layer ordering.
            
            const drawRecursive = (layer: Layer, ctx: CanvasRenderingContext2D) => {
                const effectiveProps = getEffectiveLayerProps(layers, layer.id);
                if (!effectiveProps.visible) return;

                ctx.save();
                ctx.globalAlpha = effectiveProps.opacity / 100;

                const layerPaths = paths.filter(p => p.layerId === layer.id);
                layerPaths.forEach(path => drawPath(ctx, path));
                
                layer.pastedImage?.forEach(img => {
                    const w = img.width ?? img.imageData.width;
                    const h = img.height ?? img.imageData.height;
                    const cx = img.x + w / 2;
                    const cy = img.y + h / 2;
                    ctx.save();
                    ctx.translate(cx, cy);
                    if (img.rotation) ctx.rotate(img.rotation);
                    ctx.drawImage(img.imageData, -w/2, -h/2, w, h);
                    ctx.restore();
                });
                
                if (layer.type === 'group' && layer.layers) {
                    // Draw children in reverse (bottom up)
                    [...layer.layers].reverse().forEach(child => drawRecursive(child, ctx));
                }
                ctx.restore();
            };
            
            drawRecursive(l, tempCtx);
            tempCtx.restore();

            return { imageData: tempCanvas, x: minX, y: minY };
        },
        clearSelection: () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const sel = selection || { x: -10000, y: -10000, width: 20000, height: 20000 };

            const rectPath: Path = {
                points: [
                    {x: sel.x, y: sel.y, pressure: 0},
                    {x: sel.x + sel.width, y: sel.y + sel.height, pressure: 0}
                ],
                tool: 'eraser',
                brushType: 'round',
                color: '#000000',
                strokeWidth: 1,
                layerId: activeLayerId,
                shape: 'rectangle',
                opacity: 100,
                clipRect: sel,
                isSelectionInverted: isSelectionInverted,
            };
            setPaths(prev => [...prev, rectPath]);
            setSelection(null);
        },
        fillSelection: (color: string) => {
            if (!selection) return;
            const fillPath: Path = {
                points: [
                    { x: selection.x, y: selection.y, pressure: 0 },
                    { x: selection.x + selection.width, y: selection.y + selection.height, pressure: 0 }
                ],
                tool: 'fill',
                brushType: 'round',
                color: color,
                strokeWidth: 1,
                layerId: activeLayerId,
                shape: 'rectangle',
                opacity: 100,
                clipRect: selection,
                isSelectionInverted: isSelectionInverted,
            };
            setPaths(prev => [...prev, fillPath]);
        },
        drawPastedImage: (image: HTMLCanvasElement, x: number, y: number) => {
            const canvas = canvasRef.current;
            const context = contextRef.current;
            if (!canvas || !context) return;
            context.drawImage(image, x, y);
        },
        getVisibleFrame: () => {
            const canvas = canvasRef.current;
            if (!canvas) return null;
            const rulerSize = showRulers ? 30 : 0;
            const canvasContentWidth = canvas.width - rulerSize;
            const canvasContentHeight = canvas.height - rulerSize;
            
            const viewX = -transform.x / transform.zoom;
            const viewY = -transform.y / transform.zoom;
            
            const viewWidth = canvasContentWidth / transform.zoom;
            const viewHeight = canvasContentHeight / transform.zoom;
            
            return {
                x: viewX,
                y: viewY,
                width: viewWidth,
                height: viewHeight,
            }
        },
    }));

  const getTransformedPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0, pressure: 0.5 };

      const rect = canvas.getBoundingClientRect();
      const rulerSize = showRulers ? 30 : 0;
      
      let screenX = e.clientX - rect.left - rulerSize;
      let screenY = e.clientY - rect.top - rulerSize;
      
      if (forceProportions) {
          const canvasWidth = rect.width - rulerSize;
          const canvasHeight = rect.height - rulerSize;
          const canvasRatio = canvasWidth / canvasHeight;
          const tabletRatio = 4 / 3;

          if (canvasRatio > tabletRatio) {
              const effectiveWidth = canvasHeight * tabletRatio;
              const xOffset = (canvasWidth - effectiveWidth) / 2;
              screenX = Math.max(0, screenX - xOffset) / effectiveWidth * canvasWidth;
          } else if (canvasRatio < tabletRatio) {
              const effectiveHeight = canvasWidth / tabletRatio;
              const yOffset = (canvasHeight - effectiveHeight) / 2;
              screenY = Math.max(0, screenY - yOffset) / effectiveHeight * canvasHeight;
          }
      }

      const dpr = window.devicePixelRatio || 1;
      const viewMatrix = new DOMMatrix();
      
      // Screen space translate by pan offset
      viewMatrix.translateSelf(transform.x, transform.y);
      
      // Pivot for flip/rotation is the center of the drawing area in screen pixels
      const centerX = (rect.width - rulerSize) / 2;
      const centerY = (rect.height - rulerSize) / 2;
      
      viewMatrix.translateSelf(centerX, centerY);
      viewMatrix.rotateSelf(transform.rotation);
      viewMatrix.scaleSelf(transform.flip.horizontal ? -1 : 1, transform.flip.vertical ? -1 : 1);
      viewMatrix.translateSelf(-centerX, -centerY);
      
      // Zoom
      viewMatrix.scaleSelf(transform.zoom, transform.zoom);
      
      const invertedMatrix = viewMatrix.inverse();
      const transformedPoint = new DOMPoint(screenX, screenY).matrixTransform(invertedMatrix);
      
      let pressure = e.pointerType === 'pen' ? e.pressure : 0.5;

      if (isSimulatingPressure && e.pointerType === 'mouse') {
          // Create a dynamic pressure value using a sine wave based on time
          // Oscillates between 0.2 and 1.0 to show clear variation
          const time = performance.now() / 200; 
          pressure = 0.6 + Math.sin(time) * 0.4;
      }

      return {
        x: transformedPoint.x,
        y: transformedPoint.y,
        pressure: getAdjustedPressure(pressure),
      };
    },
    [transform, showRulers, getAdjustedPressure, forceProportions]
  );
  
  const getScreenPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0, pressure: 0.5 };
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      return { x, y, pressure: 0.5 };
  }

  type BrushProfile = {
    size: number;
    flow: number;
    opacity: number;
    spacing: number; // ratio of brush size
    hardness: number;
    angle: number;
    texture: 'none' | 'grain' | 'soft-bleed' | 'rough';
    tip: 'round' | 'airbrush';
  };

  const getBrushProfile = (path: Path): BrushProfile => {
    const baseOpacity = ((path.opacity ?? 100) / 100);
    const size = Math.max(1, path.strokeWidth);
    switch (path.brushType) {
      case 'ink':
        return { size, flow: 1, opacity: Math.min(1, baseOpacity), spacing: 0.12, hardness: 0.98, angle: 0, texture: 'none', tip: 'round' };
      case 'pencil':
        return { size: size * 0.9, flow: 0.2, opacity: Math.min(0.9, baseOpacity), spacing: 0.09, hardness: 0.45, angle: 0, texture: 'grain', tip: 'round' };
      case 'airbrush':
        return { size: size * 2.5, flow: 0.8, opacity: Math.min(0.85, baseOpacity), spacing: 0.035, hardness: 0.0, angle: 0, texture: 'none', tip: 'airbrush' };
      case 'round':
      default:
        return { size, flow: 0.95, opacity: Math.min(1, baseOpacity), spacing: 0.1, hardness: 0.92, angle: 0, texture: 'none', tip: 'round' };
    }
  };

  const stampBrush = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    direction: number,
    color: string,
    profile: BrushProfile,
    isEraser: boolean
  ) => {
    const baseAlpha = profile.opacity * profile.flow;
    ctx.save();
    ctx.globalAlpha = Math.max(0.02, baseAlpha);
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
    }

    const drawSoftCircle = (radius: number, hardness: number) => {
      // CACHE BRUSH TIP
      const key = `${Math.round(radius * 10)}|${hardness.toFixed(2)}|${color}|${isEraser}`;
      if (!brushTipCache.has(key)) {
          const canvas = document.createElement('canvas');
          let r = Math.max(1, radius);
          canvas.width = r * 2;
          canvas.height = r * 2;
          const bCtx = canvas.getContext('2d');
          if (bCtx) {
              const g = bCtx.createRadialGradient(r, r, r * hardness, r, r, r);
              if (isEraser) {
                g.addColorStop(0, `rgba(0,0,0,1)`);
                g.addColorStop(1, `rgba(0,0,0,0)`);
              } else {
                g.addColorStop(0, color);
                g.addColorStop(1, 'rgba(0,0,0,0)');
              }
              bCtx.fillStyle = g;
              bCtx.beginPath();
              bCtx.arc(r, r, r, 0, Math.PI * 2);
              bCtx.fill();
          }
          brushTipCache.set(key, canvas);
      }
      ctx.drawImage(brushTipCache.get(key)!, x - radius, y - radius);
    };

    if (profile.tip === 'round') {
      drawSoftCircle(size / 2, profile.hardness);
    } else if (profile.tip === 'airbrush') {
      // Particle-based airbrush simulation for true buildup effect without relying solely on simple opacity layer
      const radius = size / 2;
      const drops = Math.max(8, Math.floor(size * 1.5));
      
      for (let i = 0; i < drops; i++) {
        const angle = Math.random() * Math.PI * 2;
        // u*v gives a strong center-biased distribution
        const dist = (Math.random() * Math.random()) * radius;
        const px = x + Math.cos(angle) * dist;
        const py = y + Math.sin(angle) * dist;
        
        // Droplets get smaller further out
        const dropSize = Math.max(0.5, (Math.random() * 2 + (size * 0.015)) * (1 - (dist / radius) * 0.5));
        
        ctx.save();
        // Vary opacity per droplet
        ctx.globalAlpha = Math.max(0.02, Math.random() * (isEraser ? 1.0 : ctx.globalAlpha));
        ctx.beginPath();
        ctx.arc(px, py, dropSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (!isEraser && profile.texture === 'grain') {
      const dots = Math.max(4, Math.floor(size * 0.6));
      ctx.globalAlpha *= 0.4;
      for (let i = 0; i < dots; i++) {
        const a = seededNoise(x + i * 31, y + i * 47) * Math.PI * 2;
        const r = seededNoise(x + i * 13, y + i * 19) * (size * 0.45);
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.35, size * 0.03), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (!isEraser && profile.texture === 'soft-bleed') {
      ctx.globalAlpha *= 0.35;
      drawSoftCircle(size * 0.65, 0.15);
    }
    if (!isEraser && profile.texture === 'rough') {
      ctx.globalAlpha *= 0.25;
      for (let i = 0; i < 5; i++) {
        const ox = (seededNoise(x + i * 7, y) - 0.5) * size * 0.25;
        const oy = (seededNoise(x, y + i * 11) - 0.5) * size * 0.25;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, Math.max(0.5, size * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };


  const drawPath = (context: CanvasRenderingContext2D, path: Path, fromIndex: number = 0, initialCarry: number = 0): number => {
    const effectiveProps = getEffectiveLayerProps(layers, path.layerId);
    if (!effectiveProps.visible || path.points.length < 1) return 0;

    context.save();

    if (path.clipRect) {
        context.beginPath();
        if (path.clipRect.points && path.clipRect.points.length > 0) {
            context.moveTo(path.clipRect.points[0].x, path.clipRect.points[0].y);
            for (let i = 1; i < path.clipRect.points.length; i++) {
                context.lineTo(path.clipRect.points[i].x, path.clipRect.points[i].y);
            }
            context.closePath();
        } else {
            context.rect(path.clipRect.x, path.clipRect.y, path.clipRect.width, path.clipRect.height);
        }
        
        if (path.isSelectionInverted) {
            const WORLD_SIZE = 1e5;
            context.rect(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 2, WORLD_SIZE * 2);
            context.clip('evenodd');
        } else {
            context.clip();
        }
    }

    const isPixelRemoval = path.tool === 'eraser';

    if (isPixelRemoval) {
        context.globalCompositeOperation = 'destination-out';
        context.strokeStyle = '#000000';
    } else {
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = path.color;
    }
    
    context.lineCap = 'round';
    context.lineJoin = 'round';

    const layerAlpha = (effectiveProps.opacity ?? 100) / 100;
    const pathAlpha = (path.opacity ?? 100) / 100;

    if (isPixelRemoval) {
        context.globalAlpha = pathAlpha;
    } else {
        context.globalAlpha = layerAlpha * pathAlpha;
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

    if (isPixelRemoval && path.shape === 'rectangle' && path.points.length >= 2) {
        const start = path.points[0];
        const end = path.points[path.points.length - 1];
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);
        context.fillStyle = '#000000';
        context.fillRect(x, y, w, h);
        context.restore();
        return;
    }

    if (isPixelRemoval && path.shape === 'polygon' && path.points.length > 2) {
        context.beginPath();
        context.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
            context.lineTo(path.points[i].x, path.points[i].y);
        }
        context.closePath();
        context.fillStyle = '#000000';
        context.fill();
        context.restore();
        return;
    }

    if (path.tool === 'shape') {
        const start = path.points[0];
        const end = path.points[path.points.length - 1];
        const rectWidth = end.x - start.x;
        const rectHeight = end.y - start.y;

        context.strokeStyle = isPixelRemoval ? '#000000' : path.color;
        context.fillStyle = isPixelRemoval ? '#000000' : path.color;
        context.lineWidth = path.strokeWidth;

        if (path.shape === 'rectangle' || !path.shape) {
            if (isPixelRemoval) {
                context.fillRect(start.x, start.y, rectWidth, rectHeight);
            } else {
                context.strokeRect(start.x, start.y, rectWidth, rectHeight);
            }
        } else if (path.shape === 'circle') {
            const cx = (start.x + end.x) / 2;
            const cy = (start.y + end.y) / 2;
            const radius = Math.min(Math.abs(rectWidth), Math.abs(rectHeight)) / 2;
            context.beginPath();
            context.arc(cx, cy, radius, 0, Math.PI * 2);
            isPixelRemoval ? context.fill() : context.stroke();
        } else if (path.shape === 'ellipse') {
            const cx = (start.x + end.x) / 2;
            const cy = (start.y + end.y) / 2;
            const rx = Math.abs(rectWidth) / 2;
            const ry = Math.abs(rectHeight) / 2;
            context.beginPath();
            context.ellipse(cx, cy, rx || 1, ry || 1, 0, 0, Math.PI * 2);
            isPixelRemoval ? context.fill() : context.stroke();
        } else if (path.shape === 'line') {
            context.beginPath();
            context.moveTo(start.x, start.y);
            context.lineTo(end.x, end.y);
            context.stroke();
        } else if (path.shape === 'arrow') {
            context.beginPath();
            context.moveTo(start.x, start.y);
            context.lineTo(end.x, end.y);
            context.stroke();
            // Arrowhead
            const angle = Math.atan2(end.y - start.y, end.x - start.x);
            const headLen = Math.max(12, path.strokeWidth * 3);
            context.beginPath();
            context.moveTo(end.x, end.y);
            context.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
            context.moveTo(end.x, end.y);
            context.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
            context.stroke();
        } else if (path.shape === 'triangle') {
            const cx = (start.x + end.x) / 2;
            context.beginPath();
            context.moveTo(cx, start.y);
            context.lineTo(end.x, end.y);
            context.lineTo(start.x, end.y);
            context.closePath();
            isPixelRemoval ? context.fill() : context.stroke();
        } else if (path.shape === 'polygon' && path.points.length > 2) {
            context.beginPath();
            context.moveTo(path.points[0].x, path.points[0].y);
            for (let i = 1; i < path.points.length; i++) {
                context.lineTo(path.points[i].x, path.points[i].y);
            }
            context.closePath();
            isPixelRemoval ? context.fill() : context.stroke();
        }

        context.restore();
        return;
    }
    
    const profile = getBrushProfile(path);
    const points = path.points;
    if (points.length === 0) {
      context.restore();
      return;
    }

    const stampSegment = (from: Point, to: Point, carry: number) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      const direction = Math.atan2(dy, dx);
      const step = Math.max(0.6, profile.size * profile.spacing);
      if (dist === 0) {
        const pressure = from.pressure || 0.5;
        const stampSize = Math.max(0.8, profile.size * pressure);
        stampBrush(context, from.x, from.y, stampSize, direction, path.color, profile, isPixelRemoval);
        return carry;
      }

      let d = carry;
      while (d <= dist) {
        const t = d / dist;
        const x = from.x + dx * t;
        const y = from.y + dy * t;
        const pressure = (from.pressure || 0.5) * (1 - t) + (to.pressure || 0.5) * t;
        let stampSize = Math.max(0.8, profile.size * pressure);
        stampBrush(context, x, y, stampSize, direction, path.color, profile, isPixelRemoval);
        d += step;
      }
      return d - dist;
    };

    let carry = initialCarry;
    if (points.length === 1 && fromIndex === 0) {
      const p = points[0];
      const stampSize = Math.max(0.8, profile.size * (p.pressure || 0.5));
      stampBrush(context, p.x, p.y, stampSize, 0, path.color, profile, isPixelRemoval);
    } else {
      const startIndex = Math.max(1, fromIndex);
      for (let i = startIndex; i < points.length; i++) {
        carry = stampSegment(points[i - 1], points[i], carry);
      }
    }
    context.globalCompositeOperation = 'source-over';
    context.restore();
    return carry;
  };

  const applyLiquifyStroke = (point: Point, prevPoint: Point | null) => {
    if (!prevPoint) return;
    const moveX = point.x - prevPoint.x;
    const moveY = point.y - prevPoint.y;
    
    const strokeSession = liquifyStrokeRef.current;
    
    // 3. USE WORKING BUFFER: Init on first move if not already
    if (!strokeSession.workingData) {
        const activeLayer = findLayer(layers, activeLayerId);
        if (!activeLayer || !activeLayer.pastedImage || activeLayer.pastedImage.length === 0) return;
        
        const newWorkingData = activeLayer.pastedImage.map(img => {
            const w = img.imageData.width;
            const h = img.imageData.height;

            const targetCopy = document.createElement('canvas');
            targetCopy.width = w;
            targetCopy.height = h;
            targetCopy.getContext('2d')?.drawImage(img.imageData, 0, 0);

            const glCanvas = document.createElement('canvas');
            glCanvas.width = w;
            glCanvas.height = h;
            const gl = (glCanvas.getContext('webgl2', { premultipliedAlpha: true }) || 
                        glCanvas.getContext('webgl', { premultipliedAlpha: true })) as WebGLRenderingContext;
            
            const compileShader = (type: number, source: string) => {
                const shader = gl.createShader(type);
                if (!shader) return null;
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
                    gl.deleteShader(shader);
                    return null;
                }
                return shader;
            };

            const program = gl.createProgram()!;
            const vs = compileShader(gl.VERTEX_SHADER, LIQUIFY_VERTEX_SHADER)!;
            const fs = compileShader(gl.FRAGMENT_SHADER, LIQUIFY_FRAGMENT_SHADER)!;
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);
            
            const quadBuffer = gl.createBuffer()!;
            gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                -1.0, -1.0,   1.0, -1.0,   -1.0,  1.0,
                -1.0,  1.0,   1.0, -1.0,    1.0,  1.0
            ]), gl.STATIC_DRAW);

            const createTexture = (data: HTMLCanvasElement | null) => {
                const tex = gl.createTexture()!;
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                if (data) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
                } else {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                }
                return tex;
            };

            const pingTexture = createTexture(img.imageData);
            const pongTexture = createTexture(null);
            const fbo = gl.createFramebuffer()!;

            return {
                originalImage: img.imageData,
                image: targetCopy,
                x: img.x,
                y: img.y,
                rotation: img.rotation,
                gl, glCanvas, program,
                pingTexture, pongTexture, fbo,
                quadBuffer, width: w, height: h
            };
        });
        
        strokeSession.workingData = newWorkingData;

        // Perform single React update to hook our mutable clones in place of history canvas
        setLayers(prev => prev.map(l => {
            if (l.id === activeLayerId) {
                return {
                    ...l,
                    pastedImage: l.pastedImage.map(img => {
                        const wd = newWorkingData.find(w => w.originalImage === img.imageData);
                        return wd ? { ...img, imageData: wd.image } : img;
                    })
                };
            }
            return l;
        }));
    }

    let modified = false;

    // 4. AVOID FULL IMAGE REMAPPING
    // 8. MEMORY MANAGEMENT (No React setLayers loop here)
    strokeSession.workingData.forEach(item => {
        if (item.rotation && Math.abs(item.rotation) > 1e-3) return;
        
        const { gl, glCanvas, program, fbo, quadBuffer, width, height } = item;
        const localX = point.x - item.x;
        const localY = point.y - item.y;
        
        // Skip if outside brush radius bounding box
        if (localX < -brushSize || localY < -brushSize || localX > width + brushSize || localY > height + brushSize) return;

        // Render Ping -> Pong
        gl.useProgram(program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, item.pongTexture, 0);
        gl.viewport(0, 0, width, height);

        const uLocRes = gl.getUniformLocation(program, 'u_resolution');
        const uLocBrush = gl.getUniformLocation(program, 'u_brushPos');
        const uLocMove = gl.getUniformLocation(program, 'u_moveVec');
        const uLocRad = gl.getUniformLocation(program, 'u_radius');
        const uLocStr = gl.getUniformLocation(program, 'u_strength');
        
        gl.uniform2f(uLocRes, width, height);
        gl.uniform2f(uLocBrush, localX, localY);
        gl.uniform2f(uLocMove, moveX, moveY);
        gl.uniform1f(uLocRad, Math.max(2, brushSize / 2));
        gl.uniform1f(uLocStr, liquifySettings.strength);

        const aLocPos = gl.getAttribLocation(program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.enableVertexAttribArray(aLocPos);
        gl.vertexAttribPointer(aLocPos, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, item.pingTexture);
        const uLocTex = gl.getUniformLocation(program, 'u_texture');
        gl.uniform1i(uLocTex, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Render Pong -> Canvas display
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.bindTexture(gl.TEXTURE_2D, item.pongTexture);
        gl.uniform2f(uLocMove, 0.0, 0.0); // Zero movement for flush
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Swap ping and pong textures for next frame
        const temp = item.pingTexture;
        item.pingTexture = item.pongTexture;
        item.pongTexture = temp;

        // Composite WebGL output to the active layer DOM canvas element
        const tCtx = item.image.getContext('2d');
        if (tCtx) {
            tCtx.clearRect(0, 0, width, height);
            tCtx.drawImage(glCanvas, 0, 0);
        }
        modified = true;
    });

    if (modified) {
        // Render immediately without triggering heavy React cycle 
        needsRedrawRef.current = true;
    }
  };

  const ensureLiquifyRasterTarget = useCallback(() => {
    const activeLayer = findLayer(layers, activeLayerId);
    if (!activeLayer) return;

    const layerPaths = paths.filter(p => p.layerId === activeLayerId);

    // Compute the maximum required canvas span
    let fullFrame = { x: 0, y: 0, w: 0, h: 0 };
    if (canvasFrame) {
        fullFrame = { x: 0, y: 0, w: canvasFrame.width, h: canvasFrame.height };
    } else {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        layerPaths.forEach(p => {
          p.points.forEach(pt => {
            const r = p.strokeWidth / 2 + 2;
            minX = Math.min(minX, pt.x - r);
            minY = Math.min(minY, pt.y - r);
            maxX = Math.max(maxX, pt.x + r);
            maxY = Math.max(maxY, pt.y + r);
          });
        });
        activeLayer.pastedImage.forEach(img => {
            const w = img.width ?? img.imageData.width;
            const h = img.height ?? img.imageData.height;
            minX = Math.min(minX, img.x);
            minY = Math.min(minY, img.y);
            maxX = Math.max(maxX, img.x + w);
            maxY = Math.max(maxY, img.y + h);
        });

        if (!isFinite(minX)) return;
        
        // Pad heavily to guarantee the user can drag pixels effectively anywhere out of bounds
        fullFrame = { 
            x: minX - 1000, 
            y: minY - 1000, 
            w: (maxX - minX) + 2000, 
            h: (maxY - minY) + 2000 
        };
    }

    // Skip if it's already a perfectly matching single master canvas that won't clip
    if (activeLayer.pastedImage.length === 1 && layerPaths.length === 0) {
        const img = activeLayer.pastedImage[0];
        if (img.x <= fullFrame.x && img.y <= fullFrame.y && 
            img.x + img.imageData.width >= fullFrame.x + fullFrame.w &&
            img.y + img.imageData.height >= fullFrame.y + fullFrame.h) {
            return;
        }
    }

    const raster = document.createElement('canvas');
    raster.width = fullFrame.w;
    raster.height = fullFrame.h;
    const rCtx = raster.getContext('2d');
    if (!rCtx) return;
    
    rCtx.save();
    rCtx.translate(-fullFrame.x, -fullFrame.y);

    activeLayer.pastedImage.forEach(img => {
        const w = img.width ?? img.imageData.width;
        const h = img.height ?? img.imageData.height;
        rCtx.save();
        rCtx.translate(img.x + w/2, img.y + h/2);
        if (img.rotation) rCtx.rotate(img.rotation);
        rCtx.drawImage(img.imageData, -w/2, -h/2, w, h);
        rCtx.restore();
    });

    layerPaths.forEach(p => drawPath(rCtx, p));
    rCtx.restore();

    if (layerPaths.length > 0) {
        setPaths(prev => prev.filter(p => p.layerId !== activeLayerId));
    }

    setLayers(prev => {
      const update = (lst: Layer[]): Layer[] => lst.map(layer => {
        if (layer.id === activeLayerId) {
          return { ...layer, pastedImage: [{ imageData: raster, x: fullFrame.x, y: fullFrame.y }] };
        }
        if (layer.type === 'group' && layer.layers) return { ...layer, layers: update(layer.layers) };
        return layer;
      });
      return update(prev);
    });
  }, [activeLayerId, layers, paths, setLayers, setPaths, canvasFrame]);

  const drawSelection = (context: CanvasRenderingContext2D) => {
    const activeSel = draftSelection || selection;
    if (!activeSel) return;
    context.save();
    
    let x = floatingSelection && !draftSelection ? floatingSelection.x : activeSel.x;
    let y = floatingSelection && !draftSelection ? floatingSelection.y : activeSel.y;
    let w = floatingSelection && !draftSelection ? floatingSelection.width : activeSel.width;
    let h = floatingSelection && !draftSelection ? floatingSelection.height : activeSel.height;
    let points = activeSel.points;

    if (!draftSelection && activeTool === 'transform' && transformSession) {
        const matrix = getTransformMatrix(transformSession);
        if (points && points.length > 2) {
            points = points.map(p => {
                const pt = new DOMPoint(p.x, p.y).matrixTransform(matrix);
                return { x: pt.x, y: pt.y };
            });
        } else {
            x = transformSession.currentRect.x;
            y = transformSession.currentRect.y;
            w = transformSession.currentRect.width;
            h = transformSession.currentRect.height;
        }
    }

    const dash = 5 / transform.zoom;
    context.setLineDash([dash, dash]);
    context.lineWidth = 1.5 / transform.zoom;
    context.lineDashOffset = -selectionOffset;

    if (points && points.length > 2) {
        // Draw freeform polygon for lasso
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            context.lineTo(points[i].x, points[i].y);
        }
        
        if (draftSelection) {
            // While drawing: Bold path for what's drawn so far
            context.save();
            context.setLineDash([]);
            context.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            context.lineWidth = 2 / transform.zoom;
            context.stroke();
            context.strokeStyle = 'white';
            context.lineWidth = 1 / transform.zoom;
            context.stroke();
            context.restore();

            // Dash line back to origin to show closure
            context.beginPath();
            context.moveTo(points[points.length-1].x, points[points.length-1].y);
            context.lineTo(points[0].x, points[0].y);
            context.setLineDash([dash, dash]);
            context.strokeStyle = 'rgba(0,0,0,0.5)';
            context.stroke();
        } else {
            context.closePath();
            
            // Subtle fill for committed lasso
            context.fillStyle = 'rgba(0, 120, 255, 0.07)';
            context.fill();

            context.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            context.stroke();
            
            context.lineDashOffset = dash - selectionOffset;
            context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            context.stroke();
        }
    } else {
        // Subtle fill for committed rectangular selection
        if (!draftSelection) {
            context.fillStyle = 'rgba(0, 120, 255, 0.07)';
            context.fillRect(x, y, w, h);
        }
        context.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        context.strokeRect(x, y, w, h);
        context.lineDashOffset = dash - selectionOffset;
        context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        context.strokeRect(x, y, w, h);
    }
    context.restore();
  }

  const drawTransformBox = (context: CanvasRenderingContext2D, session: TransformSession) => {
      context.save();
      const { currentRect: r, rotation, initialRect } = session;
      const cx = r.x + r.width/2;
      const cy = r.y + r.height/2;

      // Draw the rasterized preview of what's being transformed
      if (transformRasterRef.current) {
          const raster = transformRasterRef.current;
          const matrix = getTransformMatrix(session);
          context.save();
          context.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
          context.drawImage(raster, initialRect.x, initialRect.y, initialRect.width, initialRect.height);
          context.restore();
      }

      context.strokeStyle = '#0066ff';
      context.lineWidth = 1.5 / transform.zoom;
      context.strokeRect(r.x, r.y, r.width, r.height);
      
      const hs = 8 / transform.zoom; // handle size
      const handles = [
          {x: r.x, y: r.y}, {x: r.x+r.width/2, y: r.y}, {x: r.x+r.width, y: r.y},
          {x: r.x, y: r.y+r.height/2}, {x: r.x+r.width, y: r.y+r.height/2},
          {x: r.x, y: r.y+r.height}, {x: r.x+r.width/2, y: r.y+r.height}, {x: r.x+r.width, y: r.y+r.height}
      ];
      context.fillStyle = '#ffffff';
      handles.forEach(p => {
          context.fillRect(p.x - hs/2, p.y - hs/2, hs, hs);
          context.strokeRect(p.x - hs/2, p.y - hs/2, hs, hs);
      });
      // rotation handle
      context.beginPath();
      context.moveTo(cx, r.y);
      context.lineTo(cx, r.y - 30/transform.zoom);
      context.stroke();
      context.beginPath();
      context.fillStyle = '#0066ff';
      context.arc(cx, r.y - 30/transform.zoom, hs/2, 0, Math.PI*2);
      context.fill();
      context.stroke();

      context.restore();
  }

  const drawCropOverlay = (context: CanvasRenderingContext2D, session: CropSession) => {
      context.save();
      const { currentRect: r } = session;
      
      context.fillStyle = 'rgba(0,0,0,0.6)';
      context.beginPath();
      context.rect((-transform.x - 5000) / transform.zoom, (-transform.y - 5000) / transform.zoom, 10000 / transform.zoom, 10000 / transform.zoom);
      context.rect(r.x, r.y, r.width, r.height);
      context.fill('evenodd');

      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.5 / transform.zoom;
      context.setLineDash([4/transform.zoom, 4/transform.zoom]);
      context.strokeRect(r.x, r.y, r.width, r.height);
      context.setLineDash([]);
      
      if (session.isActive) {
          const hs = 8 / transform.zoom;
          const handles = [
              {x: r.x, y: r.y}, {x: r.x+r.width/2, y: r.y}, {x: r.x+r.width, y: r.y},
              {x: r.x, y: r.y+r.height/2}, {x: r.x+r.width, y: r.y+r.height/2},
              {x: r.x, y: r.y+r.height}, {x: r.x+r.width/2, y: r.y+r.height}, {x: r.x+r.width, y: r.y+r.height}
          ];
          context.fillStyle = '#ffffff';
          context.strokeStyle = '#000000';
          handles.forEach(p => {
              context.fillRect(p.x - hs/2, p.y - hs/2, hs, hs);
              context.strokeRect(p.x - hs/2, p.y - hs/2, hs, hs);
          });
      }
      context.restore();
  }

  const drawGrid = (context: CanvasRenderingContext2D, width: number, height: number) => {
    context.save();
    context.strokeStyle = GRID_LINE_COLOR;
    context.lineWidth = 0.5 / transform.zoom;
    const gridSize = 50;

    const viewX = -transform.x / transform.zoom;
    const viewY = -transform.y / transform.zoom;
    const viewWidth = width / transform.zoom;
    const viewHeight = height / transform.zoom;
    
    const startX = Math.floor(viewX / gridSize) * gridSize;
    const startY = Math.floor(viewY / gridSize) * gridSize;

    for (let x = startX; x < viewX + viewWidth; x += gridSize) {
        context.beginPath();
        context.moveTo(x, startY);
        context.lineTo(x, viewY + viewHeight);
        context.stroke();
    }
    for (let y = startY; y < viewY + viewHeight; y += gridSize) {
        context.beginPath();
        context.moveTo(startX, y);
        context.lineTo(viewX + viewWidth, y);
        context.stroke();
    }
    context.restore();
  }

    const drawRulers = useCallback((context: CanvasRenderingContext2D, width: number, height: number) => {
        const rulerSize = 30;
        context.save();
        
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        context.fillStyle = RULER_BACKGROUND;
        context.fillRect(0, 0, width, rulerSize);
        context.fillRect(0, 0, rulerSize, height);
        
        context.strokeStyle = RULER_LINE_COLOR;
        context.fillStyle = RULER_TEXT_COLOR;
        context.font = '10px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        const conversionFactor = {
            px: 1,
            in: ppi,
            mm: ppi / 25.4,
            cm: ppi / 2.54,
        }[unit];

        const { x: panX, y: panY, zoom } = transform;
        
        const targetGapScreen = 100;
        const targetGapWorld = targetGapScreen / zoom;
        const targetGapUnits = targetGapWorld / conversionFactor;

        let exponent = Math.floor(Math.log10(targetGapUnits));
        let fraction = targetGapUnits / Math.pow(10, exponent);
        
        let niceFraction;
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 3.5) niceFraction = 2;
        else if (fraction < 7.5) niceFraction = 5;
        else { niceFraction = 1; exponent += 1; }
        
        let majorMarkUnits = niceFraction * Math.pow(10, exponent);
        let minorDivisions = 10;
        
        if (unit === 'in' && targetGapUnits <= 2) {
            const denom = Math.pow(2, Math.round(Math.log2(1 / targetGapUnits)));
            majorMarkUnits = 1 / denom;
            if (majorMarkUnits >= 1) majorMarkUnits = Math.round(majorMarkUnits);
            minorDivisions = 8;
        }
        
        const majorMark = majorMarkUnits * conversionFactor;
        
        let minorMark = majorMark / minorDivisions;
        let activeDivisions = minorDivisions;
        
        if (minorMark * zoom < 5) {
            activeDivisions = unit === 'in' ? 4 : 5;
            minorMark = majorMark / activeDivisions;
        }
        if (minorMark * zoom < 5) {
            activeDivisions = unit === 'in' ? 2 : 2;
            minorMark = majorMark / activeDivisions;
        }
        if (minorMark * zoom < 5) {
            activeDivisions = 1;
            minorMark = majorMark;
        }

        const formatLabel = (val: number) => {
            const v = val / conversionFactor;
            return (Math.round(v * 1000) / 1000).toString();
        };

        const xStartMarkIndex = Math.floor(-panX / zoom / minorMark);
        const xEndMarkIndex = Math.ceil((-panX + width) / zoom / minorMark);

        for (let i = xStartMarkIndex; i <= xEndMarkIndex; i++) {
            const val = i * minorMark;
            const screenX = val * zoom + panX + rulerSize;
            if (screenX < rulerSize) continue;
            
            const isMajor = i % activeDivisions === 0;
            const isHalfMark = activeDivisions % 2 === 0 && i % (activeDivisions / 2) === 0;

            const markHeight = isMajor ? 10 : isHalfMark ? 7 : 5;
            context.beginPath();
            context.moveTo(screenX, rulerSize);
            context.lineTo(screenX, rulerSize - markHeight);
            context.stroke();

            if (isMajor) {
                context.fillText(formatLabel(val), screenX, rulerSize - 15);
            }
        }
        
        const yStartMarkIndex = Math.floor(-panY / zoom / minorMark);
        const yEndMarkIndex = Math.ceil((-panY + height) / zoom / minorMark);

        for (let i = yStartMarkIndex; i <= yEndMarkIndex; i++) {
            const val = i * minorMark;
            const screenY = val * zoom + panY + rulerSize;
            if (screenY < rulerSize) continue;

            const isMajor = i % activeDivisions === 0;
            const isHalfMark = activeDivisions % 2 === 0 && i % (activeDivisions / 2) === 0;

            const markWidth = isMajor ? 10 : isHalfMark ? 7 : 5;
            context.beginPath();
            context.moveTo(rulerSize, screenY);
            context.lineTo(rulerSize - markWidth, screenY);
            context.stroke();

            if (isMajor) {
                context.save();
                context.translate(rulerSize - 15, screenY);
                context.rotate(-Math.PI / 2);
                context.fillText(formatLabel(val), 0, 0);
                context.restore();
            }
        }

        context.restore();
    }, [transform, unit, ppi]);

    const drawRulerTool = (context: CanvasRenderingContext2D) => {
        if (!ruler) return;
        context.save();
        context.beginPath();
        context.moveTo(ruler.start.x, ruler.start.y);
        context.lineTo(ruler.end.x, ruler.end.y);
        context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        context.lineWidth = 2 / transform.zoom;
        context.setLineDash([6, 3]);
        context.stroke();
        context.setLineDash([]);
        
        context.fillStyle = 'rgba(255, 255, 255, 0.8)';
        context.beginPath();
        context.arc(ruler.start.x, ruler.start.y, 4 / transform.zoom, 0, 2* Math.PI);
        context.fill();
        context.stroke();
        
        context.beginPath();
        context.arc(ruler.end.x, ruler.end.y, 4 / transform.zoom, 0, 2* Math.PI);
        context.fill();
        context.stroke();


        const dx = ruler.end.x - ruler.start.x;
        const dy = ruler.end.y - ruler.start.y;
        const distance = Math.sqrt(dx*dx + dy*dy);
        
        const text = `${distance.toFixed(1)} px`;
        const midX = (ruler.start.x + ruler.end.x) / 2;
        const midY = (ruler.start.y + ruler.end.y) / 2;

        context.font = `${14 / transform.zoom}px sans-serif`;
        const textMetrics = context.measureText(text);
        const textWidth = textMetrics.width;
        const textHeight = 14 / transform.zoom;

        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(midX - textWidth/2 - 4/transform.zoom, midY - textHeight - 4/transform.zoom, textWidth + 8/transform.zoom, textHeight + 8/transform.zoom);
        
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, midX, midY - textHeight/2 + 2/transform.zoom);

        context.restore();
    }
    
    const drawCanvasFrame = (context: CanvasRenderingContext2D) => {
        if (!canvasFrame) return;
    }


  const applyTransform = useCallback((context: CanvasRenderingContext2D, includeRulerOffset = true) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const dpr = window.devicePixelRatio || 1;
        const rulerSize = showRulers && includeRulerOffset ? 30 : 0;
        
        // Use setTransform to avoid stacking from DRP or previous calls
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.translate(rulerSize, rulerSize);

        // Pan offset
        context.translate(transform.x, transform.y);
        
        // Pivot point (center of the visible drawing area in screen pixels)
        const centerX = (canvas.width / dpr - rulerSize) / 2;
        const centerY = (canvas.height / dpr - rulerSize) / 2;
        
        context.translate(centerX, centerY);
        context.rotate(transform.rotation * Math.PI / 180);
        context.scale(transform.flip.horizontal ? -1 : 1, transform.flip.vertical ? -1 : 1);
        context.translate(-centerX, -centerY);
        
        // Zoom
        context.scale(transform.zoom, transform.zoom);
  }, [transform, showRulers]);
    
  const drawLayers = (
    context: CanvasRenderingContext2D,
    layersToDraw: Layer[],
    layerCanvasPool: HTMLCanvasElement[] = [],
    depth: number = 0,
    includeLiveCurrentPath: boolean = true
  ) => {
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

      // While a transform raster exists, hide all captured layers — the raster is drawn
      // by drawTransformBox and represents the current visual state.
      if (transformRasterRef.current && transformCapturedLayerIdsRef.current.includes(layer.id)) {
          return;
      }

      const layerPaths = paths.filter(p => p.layerId === layer.id);
      const liveCurrentPath = includeLiveCurrentPath ? (currentPathRef.current || currentPath) : null;
      const isCurrentLayer = (liveCurrentPath && liveCurrentPath.layerId === layer.id);
      const hasEraser = layerPaths.some(p => p.tool === 'eraser') || (isCurrentLayer && liveCurrentPath?.tool === 'eraser');
      const isTransformLayer = (activeTool === 'transform' && transformSession && layer.id === activeLayerId);

      if (!hasEraser) {
          context.save();
          context.globalAlpha = effectiveProps.opacity / 100;
          
          if (isTransformLayer && transformSession) {
             const m = getTransformMatrix(transformSession);
             context.transform(m.a, m.b, m.c, m.d, m.e, m.f);
          }

          layerPaths.forEach(path => drawPath(context, path));
          if (isCurrentLayer && liveCurrentPath) {
              drawPath(context, liveCurrentPath);
          }
          
          if (layer.pastedImage) {
            layer.pastedImage.forEach(img => {
                context.save();
                const w = img.width ?? img.imageData.width;
                const h = img.height ?? img.imageData.height;
                const cx = img.x + w / 2;
                const cy = img.y + h / 2;
                context.translate(cx, cy);
                if (img.rotation) context.rotate(img.rotation);
                context.drawImage(img.imageData, -w/2, -h/2, w, h);
                context.restore();
            });
          }

          if (layer.type === 'group' && layer.layers) {
              drawLayers(context, layer.layers, layerCanvasPool, depth + 1, includeLiveCurrentPath);
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

          if (isTransformLayer && transformSession) {
             const m = getTransformMatrix(transformSession);
             offCtx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
          }

          layerPaths.forEach(path => drawPath(offCtx, path));
          if (isCurrentLayer && liveCurrentPath) {
              drawPath(offCtx, liveCurrentPath);
          }
          
          if (layer.pastedImage) {
            layer.pastedImage.forEach(img => {
                offCtx.save();
                const w = img.width ?? img.imageData.width;
                const h = img.height ?? img.imageData.height;
                const cx = img.x + w / 2;
                const cy = img.y + h / 2;
                offCtx.translate(cx, cy);
                if (img.rotation) offCtx.rotate(img.rotation);
                offCtx.drawImage(img.imageData, -w/2, -h/2, w, h);
                offCtx.restore();
            });
          }

          if (layer.type === 'group' && layer.layers) {
              drawLayers(offCtx, layer.layers, layerCanvasPool, depth + 1, includeLiveCurrentPath);
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


  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    contextRef.current = context;

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    
    // Explicitly reset any dangling transform state just in case
    context.resetTransform();
    
    const cacheEligible =
      !transformSession &&
      !cropSession &&
      !moveSession &&
      !transformRasterRef.current &&
      activeTool !== 'transform';

    let usedSceneCache = false;
    if (cacheEligible) {
      if (!sceneCacheRef.current) {
        sceneCacheRef.current = document.createElement('canvas');
        sceneCacheMetaRef.current.dirty = true;
      }
      const sceneCache = sceneCacheRef.current;
      if (sceneCache.width !== canvas.width || sceneCache.height !== canvas.height) {
        sceneCache.width = canvas.width;
        sceneCache.height = canvas.height;
        sceneCacheMetaRef.current.dirty = true;
      }
      const cacheKey = [
        canvas.width,
        canvas.height,
        transform.x,
        transform.y,
        transform.zoom,
        transform.rotation,
        transform.flip.horizontal ? 1 : 0,
        transform.flip.vertical ? 1 : 0,
        showRulers ? 1 : 0,
      ].join('|');

      if (sceneCacheMetaRef.current.dirty || sceneCacheMetaRef.current.key !== cacheKey) {
        const sceneCtx = sceneCache.getContext('2d');
        if (sceneCtx) {
          sceneCtx.save();
          sceneCtx.setTransform(1, 0, 0, 1, 0, 0);
          sceneCtx.clearRect(0, 0, sceneCache.width, sceneCache.height);
          sceneCtx.restore();
          sceneCtx.save();
          applyTransform(sceneCtx);
          // Draw all visible layers and paths
          drawLayers(sceneCtx, layers, layerCanvasPoolRef.current, 0, false);
          sceneCtx.restore();
          sceneCacheMetaRef.current = { key: cacheKey, dirty: false };
        }
      }
      context.drawImage(sceneCache, 0, 0);
      usedSceneCache = true;
    }

    context.save();
    applyTransform(context);
    
    if (!usedSceneCache) {
      drawLayers(context, layers, layerCanvasPoolRef.current);
    } else {
      const liveCurrentPath = currentPathRef.current || currentPath;
      if (liveCurrentPath && drawingBufferCanvasRef.current && isDrawing) {
        // Drawing in progress: composite the drawing buffer (O(1) GPU blit)
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(drawingBufferCanvasRef.current, 0, 0);
        context.restore();
      } else if (liveCurrentPath) {
        drawPath(context, liveCurrentPath);
      }
    }

    if (floatingSelection && !(activeTool === 'transform' && transformSession)) {
      context.save();
      context.globalAlpha = 0.88;
      context.drawImage(floatingSelection.image, floatingSelection.x, floatingSelection.y, floatingSelection.width, floatingSelection.height);
      context.restore();
    }

    if (selection) {
      drawSelection(context);
    }
    if (activeTool === 'transform' && transformSession) {
      drawTransformBox(context, transformSession);
    }
    if (ruler) {
      drawRulerTool(context);
    }
    if (activeTool === 'crop' && cropSession) {
      drawCropOverlay(context, cropSession);
    }
    const dpr = window.devicePixelRatio || 1;
    if (showGrid) {
      drawGrid(context, canvas.width / dpr, canvas.height / dpr);
    }
    if (showRulers) {
      drawRulers(context, canvas.width / dpr, canvas.height / dpr);
    }
    
    context.restore(); // Restore the save() from line 2116 that wrapped applyTransform()

    // --- Channel Post-processing ---
    if (activeChannel !== 'all') {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            const a = data[i+3];
            let val = 0;
            if (activeChannel === 'red') val = r;
            else if (activeChannel === 'green') val = g;
            else if (activeChannel === 'blue') val = b;
            else if (activeChannel === 'alpha') val = a;
            
            data[i] = val;
            data[i+1] = val;
            data[i+2] = val;
            data[i+3] = 255; // Render as opaque grayscale for intensity visualization
        }
        context.putImageData(imageData, 0, 0);
    }

    if (context) {
        context.globalCompositeOperation = 'source-over';
    }
  }, [paths, currentPath, transform, selection, draftSelection, layers, showGrid, showRulers, drawRulers, ruler, isSelectionInverted, canvasFrame, canvasBackgroundColor, selectionOffset, applyTransform, activeChannel, transformSession, cropSession, moveSession, activeTool]);

  // Schedule a redraw on the next animation frame (coalesce multiple calls)
  const scheduleRedraw = useCallback(() => {
      needsRedrawRef.current = true;
      if (redrawRequestRef.current === null) {
          redrawRequestRef.current = requestAnimationFrame(() => {
              redrawRequestRef.current = null;
              if (needsRedrawRef.current) {
                  needsRedrawRef.current = false;
                  redrawCanvas();
              }
          });
      }
  }, [redrawCanvas]);

    useEffect(() => {
        let running = true;
        let lastTick = 0;
        const animate = (now: number) => {
            if (!running) return;
            // Throttle to ~12fps for marching ants (every ~80ms)
            if (now - lastTick > 80) {
                lastTick = now;
                setSelectionOffset(offset => (offset + 1) % 8);
            }
            animationFrameId.current = requestAnimationFrame(animate);
        };

        if (selection) {
            animationFrameId.current = requestAnimationFrame(animate);
        } else {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        }

        return () => {
            running = false;
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [selection]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if(container) {
          const dpr = window.devicePixelRatio || 1;
          canvas.width = canvas.clientWidth * dpr;
          canvas.height = canvas.clientHeight * dpr;
          sceneCacheMetaRef.current.dirty = true;
          redrawCanvas();
      }
    };

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    if(canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    
    return () => {
      if (canvas.parentElement) {
        resizeObserver.unobserve(canvas.parentElement);
      }
    };
  }, [redrawCanvas, showRulers]);


  useEffect(() => {
    scheduleRedraw();
  }, [scheduleRedraw]);

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const activeLayer = findLayer(layers, activeLayerId);
    if (activeLayer?.type === 'group') {
        return;
    }
    setIsDrawing(true);
    const point = getTransformedPoint(e);
    const isPixelRemoval = activeTool === 'eraser';
    
    const newPath = {
      points: [point],
      tool: isPixelRemoval ? 'eraser' : 'brush' as any,
      strokeWidth: brushSize,
      color: isPixelRemoval ? '#000000' : brushColor,
      brushType: isPixelRemoval ? 'round' : brushType,
      layerId: activeLayerId,
      opacity: brushOpacity,
      clipRect: selection ? { ...selection } : null,
      isSelectionInverted: isSelectionInverted,
    };
    setCurrentPath(newPath);
    currentPathRef.current = newPath;
    lastDrawSampleTimeRef.current = performance.now();

    // Initialize or resize the dedicated drawing buffer
    const canvas = canvasRef.current;
    if (canvas) {
        if (!drawingBufferCanvasRef.current) {
            drawingBufferCanvasRef.current = document.createElement('canvas');
        }
        const buffer = drawingBufferCanvasRef.current;
        if (buffer.width !== canvas.width || buffer.height !== canvas.height) {
            buffer.width = canvas.width;
            buffer.height = canvas.height;
        }
        const bufferCtx = buffer.getContext('2d');
        if (bufferCtx) {
            bufferCtx.setTransform(1, 0, 0, 1, 0, 0);
            bufferCtx.clearRect(0, 0, buffer.width, buffer.height);
            // Do NOT seed with the scene cache here.
            // redrawCanvas composites: sceneCache (bottom) + drawingBuffer (top).
            // If we also blit sceneCache into the buffer, everything gets drawn twice while drawing.
            // The buffer holds only the current stroke delta.
            bufferCtx.save();
            applyTransform(bufferCtx, true);
            lastCarryRef.current = drawPath(bufferCtx, newPath as any, 0, 0);
            bufferCtx.restore();
            lastDrawnPointIndexRef.current = 0;
        }
    }
  };

  const continueDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentPathRef.current) return;
    e.preventDefault();
    const point = getTransformedPoint(e);
    const points = currentPathRef.current.points;
    const last = points[points.length - 1];
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    const dist = Math.hypot(dx, dy);
    const minDist = Math.max(0.8, brushSize * 0.03);
    if (dist < minDist) return;

    const now = performance.now();
    const dt = Math.max(1, now - (lastDrawSampleTimeRef.current || now - 16));
    lastDrawSampleTimeRef.current = now;
    const speed = dist / dt;
    const speedFactor = clamp01(1.05 - speed * 0.65); // faster => thinner
    const pressureBlend = e.pointerType === 'pen'
      ? clamp01(point.pressure * 0.65 + speedFactor * 0.35)
      : clamp01(point.pressure * 0.3 + speedFactor * 0.7);
    const sampledPoint = { ...point, pressure: pressureBlend };

    // Mutate the ref directly for zero-lag point accumulation
    currentPathRef.current.points.push(sampledPoint);

    const bufferCtx = drawingBufferCanvasRef.current?.getContext('2d');
    if (bufferCtx) {
       bufferCtx.save();
       applyTransform(bufferCtx, true);
       const carryOut = drawPath(
           bufferCtx, 
           currentPathRef.current as any, 
           lastDrawnPointIndexRef.current, 
           lastCarryRef.current
       );
       lastCarryRef.current = carryOut;
       lastDrawnPointIndexRef.current = currentPathRef.current.points.length - 1;
       bufferCtx.restore();
    }

    // Immediately schedule a redraw
    scheduleRedraw();
  };

  const finishDrawing = () => {
    const pathToCommit = currentPathRef.current;
    if (pathToCommit && pathToCommit.points.length > 0) {
      // Blit the buffer (already contains the fully drawn stroke) onto the persistent scene cache
      // This avoids a full scene rebuild and locks the stroke in place instantly.
      if (sceneCacheRef.current && drawingBufferCanvasRef.current) {
        const scCtx = sceneCacheRef.current.getContext('2d');
        if (scCtx) {
          scCtx.drawImage(drawingBufferCanvasRef.current, 0, 0);
        }
      }

      // Commit to paths for undo/history/resize ONLY (do NOT trigger scene cache rebuild here)
      prevPathsLengthRef.current = paths.length + 1; // prevent undo detection false-positive
      setPaths((prev) => [...prev, pathToCommit]);
    }
    currentPathRef.current = null;
    setCurrentPath(null);
    setIsDrawing(false);
    scheduleRedraw();
  };

  const lastMousePositionRef = useRef<{x: number, y: number} | null>(null);
  const lastDrawSampleTimeRef = useRef<number>(0);

  const startPanning = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (lockView) return;
    setIsPanning(true);
    lastMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const continuePanning = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPanning || lockView || !lastMousePositionRef.current) return;
    const dx = e.clientX - lastMousePositionRef.current.x;
    const dy = e.clientY - lastMousePositionRef.current.y;
    setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const finishPanning = () => {
    setIsPanning(false);
    if (!isSpacebarDown && isSpacebarPanRef.current) {
        setActiveTool(originalToolRef.current);
        isSpacebarPanRef.current = false;
    }
  };

  const startShapeOrSelect = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const activeLayer = findLayer(layers, activeLayerId);
    if (activeTool === 'shape' && activeLayer?.type === 'group') return;

    const point = getTransformedPoint(e);

    if (activeTool === 'select' || activeTool === 'lasso') {
      setInteractionState('selecting');
      // If there is an existing selection and we click INSIDE it, start moving it
      const isInsideRect = selection && point.x >= selection.x && point.x <= selection.x + selection.width &&
                          point.y >= selection.y && point.y <= selection.y + selection.height;
      
      const isInsidePolygon = (selection && selection.points) ? isPointInPolygon(point, selection.points) : isInsideRect;

      if (isInsidePolygon) {
        if (floatingSelection) {
          setIsDrawing(true);
          setInteractionState('dragging');
          setMoveSession({ startX: point.x, startY: point.y, dx: 0, dy: 0 });
          return;
        }
        setMovingSelection({ startX: point.x, startY: point.y, initialSelX: selection!.x, initialSelY: selection!.y, initialPoints: selection!.points });
        setIsDrawing(true);
        setStartPoint(point);
        return;
      }
      
      // Otherwise start a fresh drag
      setSelection(null);
      setDraftSelection({ x: point.x, y: point.y, width: 0, height: 0, points: activeTool === 'lasso' ? [point] : undefined });
      setIsDrawing(true);
      setStartPoint(point);
      return;
    }

    if (activeTool === 'shape') {
        setCurrentPath({
            points: [point, point],
            tool: 'shape',
            shape: activeShapeType || 'rectangle',
            strokeWidth: brushSize,
            color: brushColor,
            brushType: 'round',
            layerId: activeLayerId,
            opacity: 100,
            clipRect: selection ? { ...selection } : null,
            isSelectionInverted: isSelectionInverted,
        });
    }
  }

  const continueShapeOrSelect = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const endPoint = getTransformedPoint(e);

      if (movingSelection && selection) {
          const dx = endPoint.x - movingSelection.startX;
          const dy = endPoint.y - movingSelection.startY;
          setSelection({ 
              ...selection, 
              x: movingSelection.initialSelX + dx, 
              y: movingSelection.initialSelY + dy,
              points: movingSelection.initialPoints?.map(p => ({ x: p.x + dx, y: p.y + dy }))
          });
          return;
      }

      if (!isDrawing || !startPoint) return;

      if (activeTool === 'select') {
          const newSel = {
              x: Math.min(startPoint.x, endPoint.x),
              y: Math.min(startPoint.y, endPoint.y),
              width: Math.abs(startPoint.x - endPoint.x),
              height: Math.abs(startPoint.y - endPoint.y)
          };
          setDraftSelection(newSel);
      } else if (activeTool === 'lasso' && draftSelection?.points) {
          const lastPoint = draftSelection.points[draftSelection.points.length - 1];
          const dist = Math.hypot(endPoint.x - lastPoint.x, endPoint.y - lastPoint.y);
          if (dist > 3 / transform.zoom) {
              const newPoints = [...draftSelection.points, endPoint];
              const minX = Math.min(...newPoints.map(p => p.x));
              const minY = Math.min(...newPoints.map(p => p.y));
              const maxX = Math.max(...newPoints.map(p => p.x));
              const maxY = Math.max(...newPoints.map(p => p.y));
              setDraftSelection({
                  x: minX,
                  y: minY,
                  width: maxX - minX,
                  height: maxY - minY,
                  points: newPoints
              });
          }
      } else if (activeTool === 'shape' && currentPath) {
          setCurrentPath({
              ...currentPath,
              points: [startPoint, endPoint]
          });
      }
  }

  const finishShapeOrSelect = () => {
      if (movingSelection) {
          setMovingSelection(null);
      }
      
      if (draftSelection && activeTool === 'lasso') {
          setSelection(draftSelection);
          extractSelectionToFloating(draftSelection);
          setDraftSelection(null);
      }

      if (activeTool === 'select') {
          if (draftSelection && (draftSelection.width > 2 || draftSelection.height > 2)) {
              // Commit draft to real selection
              setSelection(draftSelection);
              extractSelectionToFloating(draftSelection);
          } else {
              // Tiny drag = click outside = deselect
              setSelection(null);
              setFloatingSelection(null);
              setInteractionState('idle');
          }
          setDraftSelection(null);
          setIsDrawing(false);
          setStartPoint(null);
          return;
      }
      
      if (activeTool === 'shape' && currentPath) {
          setPaths(prev => [...prev, currentPath]);
          setCurrentPath(null);
      }
      setIsDrawing(false);
      setStartPoint(null);
  }


  const usePipette = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempContext = tempCanvas.getContext('2d', { willReadFrequently: true });
    if(!tempContext) return;

    applyTransform(tempContext, true);
    drawLayers(tempContext, layers, layerCanvasPoolRef.current);

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const screenX = (e.clientX - rect.left) * dpr;
    const screenY = (e.clientY - rect.top) * dpr;

    const pixel = tempContext.getImageData(screenX, screenY, 1, 1).data;
    
    const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
    const hexColor = `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`;

    setBrushColor(hexColor);
    setActiveTool('brush');
  }

  const performFloodFill = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempContext = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempContext) return;
    drawLayers(tempContext, layers, layerCanvasPoolRef.current);

    const point = getTransformedPoint(e);
    const startX = Math.floor(point.x);
    const startY = Math.floor(point.y);

    if (startX < 0 || startY < 0 || startX >= tempCanvas.width || startY >= tempCanvas.height) return;

    const imageData = tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = new Uint32Array(imageData.data.buffer);
    
    const targetIdx = startY * tempCanvas.width + startX;
    const targetColor = data[targetIdx];
    
    const rMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(brushColor);
    if (!rMatch) return;
    const fillR = parseInt(rMatch[1], 16);
    const fillG = parseInt(rMatch[2], 16);
    const fillB = parseInt(rMatch[3], 16);
    const fillA = Math.round((brushOpacity / 100) * 255);
    const fillColor32 = (fillA << 24) | (fillB << 16) | (fillG << 8) | fillR;

    const extractComponents = (c: number) => ({
       r: c & 0xFF,
       g: (c >> 8) & 0xFF,
       b: (c >> 16) & 0xFF,
       a: (c >> 24) & 0xFF
    });

    const targetC = extractComponents(targetColor);
    
    const colorMatch = (c: number) => {
        const testC = extractComponents(c);
        const dr = testC.r - targetC.r;
        const dg = testC.g - targetC.g;
        const db = testC.b - targetC.b;
        const da = testC.a - targetC.a;
        return (dr*dr + dg*dg + db*db + da*da) <= fillTolerance * fillTolerance;
    };

    if (colorMatch(fillColor32) && brushOpacity === 100) return;

    const w = tempCanvas.width;
    const h = tempCanvas.height;
    const mask = new Uint8Array(w * h);

    // Apply selection mask if it exists
    let selectionMask: Uint8Array | null = null;
    if (selection) {
        selectionMask = new Uint8Array(w * h);
        const mCanvas = document.createElement('canvas');
        mCanvas.width = w;
        mCanvas.height = h;
        const mCtx = mCanvas.getContext('2d');
        if (mCtx) {
            mCtx.fillStyle = 'black';
            mCtx.beginPath();
            if (selection.points && selection.points.length > 0) {
                mCtx.moveTo(selection.points[0].x, selection.points[0].y);
                for (let i = 1; i < selection.points.length; i++) {
                    mCtx.lineTo(selection.points[i].x, selection.points[i].y);
                }
                mCtx.closePath();
            } else {
                mCtx.rect(selection.x, selection.y, selection.width, selection.height);
            }
            mCtx.fill();
            const mData = mCtx.getImageData(0, 0, w, h).data;
            for (let i = 0; i < mData.length; i += 4) {
                if (mData[i+3] > 128) {
                    selectionMask[i / 4] = 1;
                }
            }
        }
    }
    
    let minX = w, minY = h, maxX = 0, maxY = 0;

    const isInsideMask = (x: number, y: number) => {
        if (!selectionMask) return true;
        return selectionMask[y * w + x] === 1;
    };

    if (!fillContiguous) {
        for (let i = 0; i < data.length; i++) {
            const x = i % w;
            const y = Math.floor(i / w);
            if (colorMatch(data[i]) && isInsideMask(x, y)) {
               mask[i] = 1;
               if (x < minX) minX = x;
               if (x > maxX) maxX = x;
               if (y < minY) minY = y;
               if (y > maxY) maxY = y;
            }
        }
    } else {
        const stack = [startX, startY];
        while (stack.length > 0) {
            let y = stack.pop()!;
            let x = stack.pop()!;
            
            let i = y * w + x;
            while (y >= 0 && colorMatch(data[i]) && mask[i] === 0 && isInsideMask(x, y)) {
                y--;
                i -= w;
            }
            y++;
            i += w;
            
            let spanLeft = false;
            let spanRight = false;
            
            while (y < h && colorMatch(data[i]) && mask[i] === 0 && isInsideMask(x, y)) {
               mask[i] = 1;
               if (x < minX) minX = x;
               if (x > maxX) maxX = x;
               if (y < minY) minY = y;
               if (y > maxY) maxY = y;

               if (x > 0) {
                  if (colorMatch(data[i - 1]) && mask[i - 1] === 0) {
                      if (!spanLeft) {
                          stack.push(x - 1, y);
                          spanLeft = true;
                      }
                  } else {
                      spanLeft = false;
                  }
               }
               if (x < w - 1) {
                  if (colorMatch(data[i + 1]) && mask[i + 1] === 0) {
                      if (!spanRight) {
                          stack.push(x + 1, y);
                          spanRight = true;
                      }
                  } else {
                      spanRight = false;
                  }
               }
               y++;
               i += w;
            }
        }
    }

    if (maxX < minX || maxY < minY) return;

    const outW = maxX - minX + 1;
    const outH = maxY - minY + 1;
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = outW;
    outputCanvas.height = outH;
    const outCtx = outputCanvas.getContext('2d');
    if (!outCtx) return;

    const outImageData = outCtx.createImageData(outW, outH);
    const outData32 = new Uint32Array(outImageData.data.buffer);
    
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (mask[y * w + x] === 1) {
                outData32[(y - minY) * outW + (x - minX)] = fillColor32;
            }
        }
    }
    outCtx.putImageData(outImageData, 0, 0);

    onPaintBucketFill(outputCanvas, minX, minY);
  }

  const startRuler = (e: React.PointerEvent<HTMLCanvasElement>) => {
      setIsDrawing(true);
      const point = getTransformedPoint(e);
      setRuler({start: point, end: point});
  }

  const continueRuler = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !ruler) return;
      const point = getTransformedPoint(e);
      setRuler(prev => prev ? {...prev, end: point} : null);
  }

  const finishRuler = () => {
      setIsDrawing(false);
      setTimeout(() => {
        setRuler(null);
      }, 1500);
  }

  const startMoving = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!floatingSelection) return;
      setIsDrawing(true);
      setInteractionState('dragging');
      const point = getTransformedPoint(e);
      setMoveSession({ startX: point.x, startY: point.y, dx: 0, dy: 0 });
  }

  const continueMoving = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !moveSession) return;
      const point = getTransformedPoint(e);
      const dx = point.x - moveSession.startX;
      const dy = point.y - moveSession.startY;
      setMoveSession(prev => prev ? { ...prev, dx, dy } : prev);
      setFloatingSelection(current => current ? { ...current, x: current.originalX + dx, y: current.originalY + dy } : current);
      if (selection) {
          setSelection(prev => prev ? { ...prev, x: prev.x + dx - moveSession.dx, y: prev.y + dy - moveSession.dy } : prev);
      }
  }

  const finishTransform = () => {
      if (!isDrawing) return;
      if (transformSession && transformRasterRef.current) {
          const { currentRect: r, rotation, initialRect } = transformSession;

          // Build the final committed canvas: draw the raster with the
          // live transform applied, at world-space 1:1 scale.
          const outW = Math.ceil(Math.abs(r.width) + Math.abs(r.height) * Math.abs(Math.sin(rotation)) * 2);
          const outH = Math.ceil(Math.abs(r.height) + Math.abs(r.width) * Math.abs(Math.sin(rotation)) * 2);
          const safeDim = Math.max(outW, outH, 1);
          const out = document.createElement('canvas');
          out.width = safeDim;
          out.height = safeDim;
          const outCtx = out.getContext('2d')!;

          const cx = safeDim / 2;
          const cy = safeDim / 2;

          outCtx.save();
          if (selection && selection.points && selection.points.length > 2) {
              const matrix = getTransformMatrix(transformSession);
              // Calculate relative matrix for the output canvas
              const relMatrix = new DOMMatrix();
              relMatrix.translateSelf(cx, cy);
              relMatrix.rotateSelf(rotation * 180 / Math.PI);
              const scaleX = initialRect.width !== 0 ? r.width / initialRect.width : 1;
              const scaleY = initialRect.height !== 0 ? r.height / initialRect.height : 1;
              relMatrix.scaleSelf(scaleX, scaleY);
              const icx = initialRect.x + initialRect.width / 2;
              const icy = initialRect.y + initialRect.height / 2;
              relMatrix.translateSelf(-icx, -icy);

              outCtx.beginPath();
              const p0 = new DOMPoint(selection.points[0].x, selection.points[0].y).matrixTransform(relMatrix);
              outCtx.moveTo(p0.x, p0.y);
              for (let i = 1; i < selection.points.length; i++) {
                  const pi = new DOMPoint(selection.points[i].x, selection.points[i].y).matrixTransform(relMatrix);
                  outCtx.lineTo(pi.x, pi.y);
              }
              outCtx.closePath();
              outCtx.clip();
          }

          outCtx.translate(cx, cy);
          outCtx.rotate(rotation);
          // Scale from initial to current size
          const scaleX = initialRect.width !== 0 ? r.width / initialRect.width : 1;
          const scaleY = initialRect.height !== 0 ? r.height / initialRect.height : 1;
          outCtx.scale(scaleX, scaleY);
          outCtx.drawImage(
              transformRasterRef.current,
              -transformRasterRef.current.width / 2,
              -transformRasterRef.current.height / 2
          );
          outCtx.restore();

          // Destination top-left in world coords
          const destX = Math.round(r.x + r.width / 2 - safeDim / 2);
          const destY = Math.round(r.y + r.height / 2 - safeDim / 2);

          // Calculate new selection points for persistence
          let newSelection = null;
          if (selection) {
              if (selection.points && selection.points.length > 2) {
                  const matrix = getTransformMatrix(transformSession);
                  const newPoints = selection.points.map(p => {
                      const pt = new DOMPoint(p.x, p.y).matrixTransform(matrix);
                      return { x: pt.x, y: pt.y };
                  });
                  const minX = Math.min(...newPoints.map(p => p.x));
                  const minY = Math.min(...newPoints.map(p => p.y));
                  const maxX = Math.max(...newPoints.map(p => p.x));
                  const maxY = Math.max(...newPoints.map(p => p.y));
                  newSelection = { x: minX, y: minY, width: maxX - minX, height: maxY - minY, points: newPoints };
              } else {
                  newSelection = { ...transformSession.currentRect };
              }
          }

          onCommitTransformRaster?.(
              out,
              destX,
              destY,
              transformCapturedLayerIdsRef.current,
              selection,
              newSelection
          );
          setSelection(newSelection);
      }
      transformRasterRef.current = null;
      setTransformSession(null);
      setIsDrawing(false);
  }

  const finishMoving = () => {
      if (moveSession) {
          setFloatingSelection(current => current ? { ...current, originalX: current.x, originalY: current.y } : current);
      }
      setMoveSession(null);
      setIsDrawing(false);
      setInteractionState(floatingSelection ? 'selected' : 'idle');
  }

  const commitFloatingSelection = useCallback(() => {
      if (!floatingSelection) return;
      onCommitFloatingSelection?.({
          image: floatingSelection.image,
          x: floatingSelection.x,
          y: floatingSelection.y,
      });
      setSelection(null);
      setFloatingSelection(null);
      setTransformSession(null);
      setInteractionState('idle');
  }, [floatingSelection, onCommitFloatingSelection]);

  const cancelFloatingSelection = useCallback(() => {
      if (!floatingSelection) return;
      onCommitFloatingSelection?.({
          image: floatingSelection.image,
          x: floatingSelection.originalX,
          y: floatingSelection.originalY,
      });
      setSelection(null);
      setFloatingSelection(null);
      setTransformSession(null);
      setInteractionState('idle');
  }, [floatingSelection, onCommitFloatingSelection]);

  const duplicateFloatingSelection = useCallback(() => {
      if (!floatingSelection) return;
      onCommitFloatingSelection?.({
          image: floatingSelection.image,
          x: floatingSelection.x + 12,
          y: floatingSelection.y + 12,
      });
  }, [floatingSelection, onCommitFloatingSelection]);

  const deleteFloatingSelection = useCallback(() => {
      setSelection(null);
      setFloatingSelection(null);
      setTransformSession(null);
      setInteractionState('idle');
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    
    if (e.button !== 0 && e.button !== 1) return;
    
    if ((activeTool === 'pan' || e.button === 1 || isSpacebarDown) && !lockView) {
      startPanning(e);
    } else if (activeTool === 'move') {
      startMoving(e);
    } else if (activeTool === 'brush' || activeTool === 'eraser') {
      startDrawing(e);
    } else if (activeTool === 'select' || activeTool === 'lasso' || activeTool === 'shape') {
      startShapeOrSelect(e);
    } else if (activeTool === 'fill') {
      performFloodFill(e);
    } else if (activeTool === 'pipette') {
      usePipette(e);
    } else if (activeTool === 'ruler') {
      startRuler(e);
    } else if (activeTool === 'liquify') {
      ensureLiquifyRasterTarget();
      const point = getTransformedPoint(e);
      liquifyStrokeRef.current = { active: true, lastPoint: point, workingData: null, lastUpdateTime: performance.now() };
      setIsDrawing(true);
    } else if (activeTool === 'crop') {
        const point = getTransformedPoint(e);
        if (cropSession) {
            const { currentRect: r } = cropSession;
            const hs = 15 / transform.zoom;
            const checkHit = (hx: number, hy: number) => Math.abs(point.x - hx) < hs && Math.abs(point.y - hy) < hs;
            let hit: any = null;
            if (checkHit(r.x, r.y)) hit = 'tl';
            else if (checkHit(r.x+r.width, r.y)) hit = 'tr';
            else if (checkHit(r.x, r.y+r.height)) hit = 'bl';
            else if (checkHit(r.x+r.width, r.y+r.height)) hit = 'br';
            else if (checkHit(r.x+r.width/2, r.y)) hit = 't';
            else if (checkHit(r.x+r.width/2, r.y+r.height)) hit = 'b';
            else if (checkHit(r.x, r.y+r.height/2)) hit = 'l';
            else if (checkHit(r.x+r.width, r.y+r.height/2)) hit = 'r';
            
            if (hit) {
                setCropSession(prev => prev ? {...prev, action: 'resize', grabHandle: hit, startMouse: point, initialRect: {...prev.currentRect}} : null);
                setIsDrawing(true);
                return;
            }
            if (point.x > r.x && point.x < r.x + r.width && point.y > r.y && point.y < r.y + r.height) {
                setCropSession(prev => prev ? {...prev, action: 'move', grabHandle: 'center', startMouse: point, initialRect: {...prev.currentRect}} : null);
                setIsDrawing(true);
                return;
            }
        }
        setCropSession({ isActive: true, action: 'create', grabHandle: null, startMouse: point, initialRect: {x: point.x, y: point.y, width: 0, height: 0}, currentRect: {x: point.x, y: point.y, width: 0, height: 0} });
        setIsDrawing(true);
    } else if (activeTool === 'transform' && transformSession) {
        const point = getTransformedPoint(e);
        const { currentRect: r } = transformSession;
        const cx = r.x + r.width/2;
        const cy = r.y + r.height/2;

        const rotDist = Math.hypot(point.x - cx, point.y - (r.y - 30/transform.zoom));
        if (rotDist < 15/transform.zoom) {
            setTransformSession(prev => prev ? {...prev, action: 'rotate', grabHandle: 'rot', startMouse: point, initialRotation: prev.rotation} : null);
            setIsDrawing(true);
            return;
        }

        const hs = 15 / transform.zoom;
        const checkHit = (hx: number, hy: number) => Math.abs(point.x - hx) < hs && Math.abs(point.y - hy) < hs;
        let hit: any = null;
        if (checkHit(r.x, r.y)) hit = 'tl';
        else if (checkHit(r.x+r.width, r.y)) hit = 'tr';
        else if (checkHit(r.x, r.y+r.height)) hit = 'bl';
        else if (checkHit(r.x+r.width, r.y+r.height)) hit = 'br';
        else if (checkHit(r.x+r.width/2, r.y)) hit = 't';
        else if (checkHit(r.x+r.width/2, r.y+r.height)) hit = 'b';
        else if (checkHit(r.x, r.y+r.height/2)) hit = 'l';
        else if (checkHit(r.x+r.width, r.y+r.height/2)) hit = 'r';
        
        if (hit) {
            setTransformSession(prev => prev ? {...prev, action: 'scale', grabHandle: hit, startMouse: point, initialRect: {...prev.currentRect}} : null);
            setIsDrawing(true);
            return;
        }

        if (point.x > r.x && point.x < r.x + r.width && point.y > r.y && point.y < r.y + r.height) {
            setTransformSession(prev => prev ? {...prev, action: 'move', grabHandle: 'center', startMouse: point, initialRect: {...prev.currentRect}} : null);
            setIsDrawing(true);
            return;
        }

        setTransformSession(prev => prev ? {...prev, action: 'rotate', grabHandle: 'rot', startMouse: point, initialRotation: prev.rotation} : null);
        setIsDrawing(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    
    if (isPanning) {
      continuePanning(e);
    } else if (isDrawing && moveSession) {
      continueMoving(e);
    } else if (isDrawing && (activeTool === 'brush' || activeTool === 'eraser')) {
      continueDrawing(e);
    } else if (isDrawing && (activeTool === 'select' || activeTool === 'lasso' || activeTool === 'shape')) {
        continueShapeOrSelect(e);
    } else if (isDrawing && activeTool === 'liquify' && liquifyStrokeRef.current.active) {
        const point = getTransformedPoint(e);
        const strokeSession = liquifyStrokeRef.current;
        const prev = strokeSession.lastPoint;
        
        // 5. MOUSE EVENT THROTTLING
        const now = performance.now();
        if (strokeSession.lastUpdateTime && (now - strokeSession.lastUpdateTime < 16)) {
            return;
        }

        // 6. IGNORE MICRO MOVEMENTS
        if (prev) {
            const dx = point.x - prev.x;
            const dy = point.y - prev.y;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        }

        const dist = prev ? Math.hypot(point.x - prev.x, point.y - prev.y) : 0;
        if (dist > Math.max(0.8, brushSize * 0.05)) {
          applyLiquifyStroke(point, prev);
          strokeSession.lastPoint = point;
          strokeSession.lastUpdateTime = now;
        }
    } else if (isDrawing && activeTool === 'ruler') {
        continueRuler(e);
    } else if (isDrawing && activeTool === 'transform' && transformSession) {
        const point = getTransformedPoint(e);
        const dx = point.x - transformSession.startMouse.x;
        const dy = point.y - transformSession.startMouse.y;
        
        setTransformSession(prev => {
            if (!prev) return prev;
            if (prev.action === 'move') {
                return { ...prev, currentRect: { ...prev.initialRect, x: prev.initialRect.x + dx, y: prev.initialRect.y + dy } };
            } else if (prev.action === 'scale') {
                let { x, y, width, height } = prev.initialRect;
                if (prev.grabHandle?.includes('l')) { x += dx; width -= dx; }
                if (prev.grabHandle?.includes('r')) { width += dx; }
                if (prev.grabHandle?.includes('t')) { y += dy; height -= dy; }
                if (prev.grabHandle?.includes('b')) { height += dy; }

                if (e.shiftKey) { 
                    const aspect = prev.initialRect.width / prev.initialRect.height;
                    // Proportional scaling mapped intuitively to grab point
                    if (Math.abs(width) > Math.abs(height * aspect)) { height = width / aspect; } 
                    else { width = height * aspect; }
                }
                return { ...prev, currentRect: { x, y, width, height } };
            } else if (prev.action === 'rotate') {
                const cx = prev.currentRect.x + prev.currentRect.width/2;
                const cy = prev.currentRect.y + prev.currentRect.height/2;
                const startAngle = Math.atan2(prev.startMouse.y - cy, prev.startMouse.x - cx);
                const curAngle = Math.atan2(point.y - cy, point.x - cx);
                let diff = curAngle - startAngle;
                let newRot = prev.initialRotation + diff;
                if (e.shiftKey) {
                    const snap = 15 * Math.PI / 180;
                    newRot = Math.round(newRot / snap) * snap;
                }
                return { ...prev, rotation: newRot };
            }
            return prev;
        });
    } else if (isDrawing && activeTool === 'crop' && cropSession) {
        const point = getTransformedPoint(e);
        const dx = point.x - cropSession.startMouse.x;
        const dy = point.y - cropSession.startMouse.y;
        
        setCropSession(prev => {
            if (!prev) return prev;
            if (prev.action === 'create') {
                const width = point.x - prev.startMouse.x;
                const height = point.y - prev.startMouse.y;
                return { ...prev, currentRect: { ...prev.initialRect, width, height } };
            } else if (prev.action === 'move') {
                return { ...prev, currentRect: { ...prev.initialRect, x: prev.initialRect.x + dx, y: prev.initialRect.y + dy } };
            } else if (prev.action === 'resize') {
                let { x, y, width, height } = prev.initialRect;
                if (prev.grabHandle?.includes('l')) { x += dx; width -= dx; }
                if (prev.grabHandle?.includes('r')) { width += dx; }
                if (prev.grabHandle?.includes('t')) { y += dy; height -= dy; }
                if (prev.grabHandle?.includes('b')) { height += dy; }

                if (e.shiftKey) { 
                    const aspect = prev.initialRect.width / prev.initialRect.height;
                    if (Math.abs(width) > Math.abs(height * aspect)) { height = width / aspect; } 
                    else { width = height * aspect; }
                }
                return { ...prev, currentRect: { x, y, width, height } };
            }
            return prev;
        });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (isPanning) finishPanning();
    if (isDrawing && moveSession) finishMoving();
    if (isDrawing && (activeTool === 'brush' || activeTool === 'eraser')) finishDrawing();
    if (isDrawing && (activeTool === 'select' || activeTool === 'lasso' || activeTool === 'shape')) finishShapeOrSelect();
    if (isDrawing && activeTool === 'ruler') finishRuler();
    if (isDrawing && activeTool === 'liquify') {
      const session = liquifyStrokeRef.current;
      if (session.workingData) {
          session.workingData.forEach(item => {
              const { gl, program, pingTexture, pongTexture, fbo, quadBuffer } = item as any;
              if (gl) {
                  gl.deleteTexture(pingTexture);
                  gl.deleteTexture(pongTexture);
                  gl.deleteBuffer(quadBuffer);
                  gl.deleteFramebuffer(fbo);
                  gl.deleteProgram(program);
                  const ext = gl.getExtension('WEBGL_lose_context');
                  if (ext) ext.loseContext();
              }
          });
      }
      liquifyStrokeRef.current = { active: false, lastPoint: null, workingData: null, lastUpdateTime: 0 };
      setIsDrawing(false);
      // Force a reference update for undo/redo if mutations occurred
      setLayers(prev => [...prev]);
    }
    if (isDrawing && activeTool === 'transform') {
       if (transformSession && floatingSelection) {
          setFloatingSelection({
            ...floatingSelection,
            x: transformSession.currentRect.x,
            y: transformSession.currentRect.y,
            width: transformSession.currentRect.width,
            height: transformSession.currentRect.height,
            originalX: transformSession.currentRect.x,
            originalY: transformSession.currentRect.y,
          });
          if (selection) {
            setSelection({ ...selection, x: transformSession.currentRect.x, y: transformSession.currentRect.y, width: transformSession.currentRect.width, height: transformSession.currentRect.height });
          }
       }
       setTransformSession(prev => prev ? {...prev, action: 'idle', grabHandle: null, initialRect: {...prev.currentRect}, initialRotation: prev.rotation} : null);
       setIsDrawing(false);
       setInteractionState(floatingSelection ? 'selected' : 'idle');
    }
    if (isDrawing && activeTool === 'crop') {
        // Normalize rect (handle negative width/height from 'create')
        setCropSession(prev => {
            if (!prev) return prev;
            let { x, y, width, height } = prev.currentRect;
            if (width < 0) { x += width; width = Math.abs(width); }
            if (height < 0) { y += height; height = Math.abs(height); }
            return {...prev, action: 'idle', grabHandle: null, initialRect: {x, y, width, height}, currentRect: {x, y, width, height}};
        });
        setIsDrawing(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (lockView) return;
    e.preventDefault();
    const rulerSize = showRulers ? 30 : 0;
    
    if (e.ctrlKey) {
        const zoomFactor = 1.1;
        const newZoom = e.deltaY < 0 ? transform.zoom * zoomFactor : transform.zoom / zoomFactor;
        const mouseX = e.nativeEvent.offsetX - rulerSize;
        const mouseY = e.nativeEvent.offsetY - rulerSize;
        const worldX = (mouseX - transform.x) / transform.zoom;
        const worldY = (mouseY - transform.y) / transform.zoom;
        const newX = mouseX - worldX * newZoom;
        const newY = mouseY - worldY * newZoom;
        setTransform(prev => ({ ...prev, x: newX, y: newY, zoom: newZoom }));
    } else {
        const dx = e.deltaX * -1;
        const dy = e.deltaY * -1;
        setTransform(prev => ({...prev, x: prev.x + dx, y: prev.y + dy}));
    }
  };
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName.toLowerCase() === 'input' || (e.target as HTMLElement).tagName.toLowerCase() === 'textarea') {
        return;
      }
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
      const isRedo = ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y');

      if (isUndo) {
        e.preventDefault();
        onUndo();
      } else if (isRedo) {
        e.preventDefault();
        onRedo();
      }

      if (e.code === 'Escape' && floatingSelection) {
        e.preventDefault();
        cancelFloatingSelection();
        return;
      }

      if (e.code === 'Space' && !isSpacebarDown && !isDrawing && !lockView) {
        e.preventDefault();
        setIsSpacebarDown(true);
        if (activeTool !== 'pan') {
           originalToolRef.current = activeTool;
           isSpacebarPanRef.current = true;
           setActiveTool('pan');
        }
      }

      // Crop confirm / cancel
      if (activeTool === 'crop' && cropSession && cropSession.isActive) {
          if (e.code === 'Enter') {
              onCommitCrop(cropSession.currentRect);
              setCropSession(null);
          } else if (e.code === 'Escape') {
              setCropSession(null);
          }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
            e.preventDefault();
            setIsSpacebarDown(false);
            if (!isPanning && isSpacebarPanRef.current) {
              setActiveTool(originalToolRef.current);
              isSpacebarPanRef.current = false;
            }
        }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onUndo, onRedo, activeTool, setActiveTool, isPanning, isDrawing, isSpacebarDown, lockView, floatingSelection, cancelFloatingSelection, cropSession, onCommitCrop]);




  return (
    <div className={cn("w-full h-full relative overflow-hidden", showRulers && "pl-[30px] pt-[30px]")}>
        <canvas
        ref={canvasRef}
        style={{ backgroundColor: canvasBackgroundColor }}
        className={cn(
            'w-full h-full rounded-lg shadow-inner touch-none',
            { 'cursor-grab': (activeTool === 'pan' || isSpacebarDown) && !lockView },
            { 'active:cursor-grabbing': (activeTool === 'pan' || isSpacebarDown) && isPanning && !lockView },
            { 'cursor-crosshair': ['select', 'shape', 'ruler', 'lasso'].includes(activeTool) },
            { 'cursor-none': ['brush', 'eraser', 'liquify'].includes(activeTool) },
            { 'cursor-eyedropper': activeTool === 'pipette' },
            { 'cursor-default': lockView }
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
        onPointerEnter={() => setIsHovering(true)}
        onPointerLeave={() => {
            setIsHovering(false);
            if (isDrawing && (activeTool === 'brush' || activeTool === 'eraser')) finishDrawing();
            if (isPanning) finishPanning();
            if (isDrawing && (activeTool === 'select' || activeTool === 'lasso' || activeTool === 'shape')) finishShapeOrSelect();
            if (isDrawing && activeTool === 'ruler') finishRuler();
            if (isDrawing && activeTool === 'liquify') {
              liquifyStrokeRef.current = { active: false, lastPoint: null };
              setIsDrawing(false);
            }
        }}
        onWheel={handleWheel}
        aria-label="Main drawing canvas"
        />
        <div className="absolute inset-0 pointer-events-none z-30">
            {isHovering && ['eraser', 'brush', 'lasso'].includes(activeTool) && (
                <div
                    className={cn(
                        "absolute border border-white mix-blend-difference",
                        activeTool === 'brush' && (brushType === 'flat' || brushType === 'calligraphy') ? "rounded-sm" : "rounded-full"
                    )}
                    style={{
                        width: (activeTool === 'lasso' ? 4 : brushSize) * transform.zoom,
                        height: (activeTool === 'lasso' ? 4 : brushSize) * transform.zoom,
                        left: mousePos.x + (showRulers ? 30 : 0),
                        top: mousePos.y + (showRulers ? 30 : 0),
                        transform: `translate(-50%, -50%) ${
                            activeTool === 'brush' && brushType === 'calligraphy' ? 'rotate(45deg)' :
                            activeTool === 'brush' && brushType === 'flat' ? 'rotate(15deg)' : ''
                        }`,
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                    }}
                >
                    {activeTool === 'lasso' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-1/2 h-[1px] bg-white"></div>
                            <div className="h-1/2 w-[1px] bg-white absolute"></div>
                        </div>
                    )}
                </div>
            )}
            {isHovering && activeTool === 'liquify' && (
                <div
                    className="absolute rounded-full"
                    style={{
                        width: brushSize * transform.zoom,
                        height: brushSize * transform.zoom,
                        left: mousePos.x + (showRulers ? 30 : 0),
                        top: mousePos.y + (showRulers ? 30 : 0),
                        transform: 'translate(-50%, -50%)',
                        border: '1px solid rgba(255,255,255,0.92)',
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.55)',
                    }}
                />
            )}
        </div>
        {floatingSelection && (
            <div
                className="absolute z-20 flex gap-1 rounded-md border bg-background/95 p-1 shadow-lg"
                style={{
                    left: (showRulers ? 30 : 0) + transform.x + (floatingSelection.x + floatingSelection.width / 2) * transform.zoom,
                    top: (showRulers ? 30 : 0) + transform.y + (floatingSelection.y - 40) * transform.zoom,
                    transform: 'translate(-50%, -100%)',
                }}
            >
                <button className="px-2 py-1 text-xs border rounded" onClick={() => setActiveTool('move')}>Move</button>
                <button className="px-2 py-1 text-xs border rounded" onClick={() => setActiveTool('transform')}>Free Transform</button>
                <button className="px-2 py-1 text-xs border rounded" onClick={duplicateFloatingSelection}>Duplicate</button>
                <button className="px-2 py-1 text-xs border rounded" onClick={deleteFloatingSelection}>Delete</button>
                <button className="px-2 py-1 text-xs border rounded" onClick={commitFloatingSelection}>Confirm</button>
                <button className="px-2 py-1 text-xs border rounded" onClick={cancelFloatingSelection}>Cancel (ESC)</button>
            </div>
        )}
    </div>
  );
});

Canvas.displayName = 'Canvas';