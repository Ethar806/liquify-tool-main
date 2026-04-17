'use client';

import * as React from 'react';
import { EditorHeader } from './editor-header';
import { ExportDialog } from './export-dialog';
import { Canvas, type Path, type CanvasRef, type ShapeType } from './canvas';
import { type BrushType } from './brush-panel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { QuickAccessToolbar } from './quick-access-toolbar';
import { useToast } from '@/hooks/use-toast';
import { CanvasSizeDialog } from './canvas-size-dialog';
import { CanvasBackgroundDialog } from './canvas-background-dialog';
import { UnitResolutionDialog, Unit } from './unit-resolution-dialog';
import { WindowOpacityDialog } from './window-opacity-dialog';
import { PenMappingDialog } from './pen-mapping-dialog';
import { PenPressureDialog } from './pen-pressure-dialog';
import { MultiTouchDialog } from './multi-touch-dialog';
import { RightSideButtonDialog } from './right-side-button-dialog';
import { WheelDialScrollerDialog } from './wheel-dial-scroller-dialog';
import { LanguageDialog } from './language-dialog';
import { HistoryLimitDialog } from './history-limit-dialog';
import { type Locale } from '@/lib/i18n';


export type Tool =
  | 'brush'
  | 'eraser'
  | 'shape'
  | 'pan'
  | 'select'
  | 'pipette'
  | 'ruler'
  | 'move'
  | 'lasso'
  | 'gradient'
  | 'redo'
  | 'crop'
  | 'transform'
  | 'fill'
  | 'liquify';

export interface LiquifySettings {
  strength: number;
}

export interface Layer {
  id: number;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  lockedAlpha: boolean;
  clippingMask: boolean;
  // This will hold image data for features like cut/paste
  pastedImage: {
    imageData: HTMLCanvasElement;
    width?: number;
    height?: number;
    rotation?: number;
    x: number;
    y: number;
  }[];
  type: 'layer' | 'group';
  layers?: Layer[]; // For groups
  parentId?: number | null;
  expanded?: boolean;
}

export interface Selection {
    x: number;
    y: number;
    width: number;
    height: number;
    points?: {x: number, y: number}[];
}

export interface FloatingSelectionCommit {
  image: HTMLCanvasElement;
  x: number;
  y: number;
}

export interface CanvasFrame {
    width: number;
    height: number;
}

// Helper type for serialization
type PastedImageSerialized = {
  imageDataUri: string;
  x: number;
  y: number;
};
type LayerSerialized = Omit<Layer, 'pastedImage' | 'layers'> & { 
    pastedImage: PastedImageSerialized[];
    layers?: LayerSerialized[];
};

export interface RecentProject {
  name: string;
  data: string;
}

interface CanvasSyncEditorProps {
    setLocale: (locale: Locale) => void;
}

const MAX_RECENT_PROJECTS = 5;

// Helper function to find a layer by ID in a nested structure
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

// Helper to get all layer IDs from a nested structure, including children of groups
const getAllLayerIds = (layers: Layer[]): number[] => {
    let ids: number[] = [];
    for (const layer of layers) {
        ids.push(layer.id);
        if (layer.type === 'group' && layer.layers) {
            ids = ids.concat(getAllLayerIds(layer.layers));
        }
    }
    return ids;
}

const defaultLayers: Layer[] = [
    { id: 2, name: 'Layer 1', visible: true, opacity: 100, locked: false, lockedAlpha: false, clippingMask: false, pastedImage: [], type: 'layer', parentId: null },
    { id: 1, name: 'Background', visible: true, opacity: 100, locked: false, lockedAlpha: false, clippingMask: false, pastedImage: [], type: 'layer', parentId: null },
];

function hexToHsl(hex: string): { h: number, s: number, l: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, l: 0 };

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) { [r, g, b] = [c, x, 0]; }
  else if (h >= 60 && h < 120) { [r, g, b] = [x, c, 0]; }
  else if (h >= 120 && h < 180) { [r, g, b] = [0, c, x]; }
  else if (h >= 180 && h < 240) { [r, g, b] = [0, x, c]; }
  else if (h >= 240 && h < 300) { [r, g, b] = [x, 0, c]; }
  else if (h >= 300 && h < 360) { [r, g, b] = [c, 0, x]; }
  
  const toHex = (c: number) => `0${Math.round((c + m) * 255).toString(16)}`.slice(-2);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}


export function CanvasSyncEditor({ setLocale }: CanvasSyncEditorProps) {
  const [activeTool, setActiveTool] = React.useState<Tool>('brush');
  const [isExportDialogOpen, setIsExportDialogOpen] = React.useState(false);
  const [isCanvasSizeDialogOpen, setIsCanvasSizeDialogOpen] = React.useState(false);
  const [isCanvasBackgroundDialogOpen, setIsCanvasBackgroundDialogOpen] = React.useState(false);
  const [isUnitResolutionDialogOpen, setIsUnitResolutionDialogOpen] = React.useState(false);
  const [isWindowOpacityDialogOpen, setIsWindowOpacityDialogOpen] = React.useState(false);
  const [isPenMappingDialogOpen, setIsPenMappingDialogOpen] = React.useState(false);
  const [isPenPressureDialogOpen, setIsPenPressureDialogOpen] = React.useState(false);
  const [isMultiTouchDialogOpen, setIsMultiTouchDialogOpen] = React.useState(false);
  const [isRightSideButtonDialogOpen, setIsRightSideButtonDialogOpen] = React.useState(false);
  const [isLanguageDialogOpen, setIsLanguageDialogOpen] = React.useState(false);
  const [isWheelDialScrollerDialogOpen, setIsWheelDialScrollerDialogOpen] = React.useState(false);
  const [isHistoryLimitDialogOpen, setIsHistoryLimitDialogOpen] = React.useState(false);
  
  type AdjustmentType = 'brightness' | 'hue' | null;
  const [activeAdjustment, setActiveAdjustment] = React.useState<AdjustmentType>(null);
  const [isAdjustmentsDialogOpen, setIsAdjustmentsDialogOpen] = React.useState(false);

  const [brushSize, setBrushSize] = React.useState(36);
  const [brushColor, setBrushColor] = React.useState('#000000');
  const [secondaryBrushColor, setSecondaryBrushColor] = React.useState('#ffffff');
  const [brushOpacity, setBrushOpacity] = React.useState(100);
  const [brushType, setBrushType] = React.useState<BrushType>('round');
  const [fillTolerance, setFillTolerance] = React.useState(32);
  const [fillContiguous, setFillContiguous] = React.useState(true);

  const [paths, setPaths] = React.useState<Path[]>([]);
  const [isClearAlertOpen, setIsClearAlertOpen] = React.useState(false);
  const [isClearHistoryAlertOpen, setIsClearHistoryAlertOpen] = React.useState(false);
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  
  const [isSimulatingPressure, setIsSimulatingPressure] = React.useState(false);

  const canvasRef = React.useRef<CanvasRef>(null);

  // Clipboard
  const [clipboard, setClipboard] = React.useState<ImageData | null>(null);

  // Recent Projects
  const [recentProjects, setRecentProjects] = React.useState<RecentProject[]>([]);


  // Canvas transform state
  const [transform, setTransform] = React.useState({ x: 0, y: 0, zoom: 1, rotation: 0, flip: { horizontal: false, vertical: false }});

  // Layer state
  const [layers, setLayers] = React.useState<Layer[]>(defaultLayers);
  const [activeLayerId, setActiveLayerId] = React.useState(2);
  const [nextLayerId, setNextLayerId] = React.useState(3);

  const [history, setHistory] = React.useState<{paths: Path[], layers: Layer[], activeLayerId: number}[]>([]);
  const [historyIndex, setHistoryIndex] = React.useState(-1);
  const [historyLimit, setHistoryLimit] = React.useState(50);
  const isUndoRedoAction = React.useRef(false);
  const lastStateRef = React.useRef<{paths: Path[], layers: Layer[], activeLayerId: number}>({ paths: [], layers: defaultLayers, activeLayerId: 2 });

  React.useEffect(() => {
    if (isUndoRedoAction.current) {
        isUndoRedoAction.current = false;
        lastStateRef.current = { paths, layers, activeLayerId };
        return;
    }
    
    if (paths === lastStateRef.current.paths && layers === lastStateRef.current.layers && activeLayerId === lastStateRef.current.activeLayerId) {
        return;
    }

    const newHistory = [...history.slice(0, historyIndex + 1), { paths, layers, activeLayerId }];
    if (newHistory.length > historyLimit) { newHistory.shift(); }
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    lastStateRef.current = { paths, layers, activeLayerId };
  }, [paths, layers, historyIndex, historyLimit, activeLayerId]);
  
  // View options
  const [showGrid, setShowGrid] = React.useState(false);
  const [showRulers, setShowRulers] = React.useState(true);
  const [lockView, setLockView] = React.useState(false);

  // Selection
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [isSelectionInverted, setIsSelectionInverted] = React.useState(false);
  
  // Canvas Frame & Background
  const [canvasFrame, setCanvasFrame] = React.useState<CanvasFrame | null>(null);
  const [canvasBackgroundColor, setCanvasBackgroundColor] = React.useState<string>('#ffffff');

  // Unit & Resolution
  const [unit, setUnit] = React.useState<Unit>('px');
  const [ppi, setPpi] = React.useState<number>(300);
  
  // UI Settings
  const [windowOpacity, setWindowOpacity] = React.useState<number>(100);
  const [leftHanded, setLeftHanded] = React.useState<boolean>(false);
  
  // Pen Settings
  const [pressureCurve, setPressureCurve] = React.useState<{x: number, y: number}[]>([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  const [forceProportions, setForceProportions] = React.useState<boolean>(false);

  // Global Panel Visibility States
  const [showTool, setShowTool] = React.useState(true);
  const [showBrushList, setShowBrushList] = React.useState(true);
  const [showBrushOptions, setShowBrushOptions] = React.useState(true);
  const [showColor, setShowColor] = React.useState(true);
  const [showLayers, setShowLayers] = React.useState(true);
  const [showView, setShowView] = React.useState(true);
  const [showPerformance, setShowPerformance] = React.useState(false);
  const [showConsole, setShowConsole] = React.useState(false);
  const [showExportbar, setShowExportbar] = React.useState(false);
  const [showLine, setShowLine] = React.useState(true);
  const [showSelect, setShowSelect] = React.useState(false);
  const [showChannels, setShowChannels] = React.useState(false);
  const [activeChannel, setActiveChannel] = React.useState<'all' | 'red' | 'green' | 'blue' | 'alpha'>('all');
  const [activeShapeType, setActiveShapeType] = React.useState<ShapeType>('rectangle');
  const [liquifySettings, setLiquifySettings] = React.useState<LiquifySettings>({
    strength: 55,
  });

  const [actionLog, setActionLog] = React.useState<{id: number, message: string, time: string}[]>([]);
  const logIdCounter = React.useRef(0);

  const addLog = React.useCallback((message: string) => {
    const time = new Date().toLocaleTimeString();
    setActionLog(prev => [{ id: logIdCounter.current++, message, time }, ...prev].slice(0, 50));
  }, []);

  const togglePanel = (panel: string) => {
    switch (panel) {
      case 'tool': setShowTool(v => !v); break;
      case 'brushList': setShowBrushList(v => !v); break;
      case 'brushOptions': setShowBrushOptions(v => !v); break;
      case 'color': setShowColor(v => !v); break;
      case 'layers': setShowLayers(v => !v); break;
      case 'view': setShowView(v => !v); break;
      case 'performance': setShowPerformance(v => !v); break;
      case 'console': setShowConsole(v => !v); break;
      case 'exportbar': setShowExportbar(v => !v); break;
      case 'line': setShowLine(v => !v); break;
      case 'select': setShowSelect(v => !v); break;
      case 'channels': setShowChannels(v => !v); break;
    }
  };

  const closeAllPanels = () => {
    setShowTool(false);
    setShowBrushList(false);
    setShowBrushOptions(false);
    setShowColor(false);
    setShowLayers(false);
    setShowView(false);
    setShowPerformance(false);
    setShowConsole(false);
    setShowExportbar(false);
    setShowLine(false);
    setShowSelect(false);
    setShowChannels(false);
  };


  // Load recent projects from localStorage on mount
  React.useEffect(() => {
    try {
      const savedProjects = localStorage.getItem('canvas-sync-recent-projects');
      if (savedProjects) {
        setRecentProjects(JSON.parse(savedProjects));
      }
    } catch (error) {
      console.error("Failed to load recent projects:", error);
    }
  }, []);

  const handleToolSelect = (tool: Tool) => {
    setActiveTool(tool);
    addLog(`Tool changed to ${tool}`);
  };

  const handleUndo = React.useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoAction.current = true;
      const prevIndex = historyIndex - 1;
      const state = history[prevIndex];
      setPaths(state.paths);
      setLayers(state.layers);
      setActiveLayerId(state.activeLayerId);
      setHistoryIndex(prevIndex);
      addLog('Undo performed');
    }
  }, [history, historyIndex, addLog]);

  const handleRedo = React.useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoRedoAction.current = true;
      const nextIndex = historyIndex + 1;
      const state = history[nextIndex];
      setPaths(state.paths);
      setLayers(state.layers);
      setActiveLayerId(state.activeLayerId);
      setHistoryIndex(nextIndex);
      addLog('Redo performed');
    }
  }, [history, historyIndex, addLog]);

  const clearCanvas = () => {
    setPaths([]);
    setHistory([]);
    setHistoryIndex(-1);
    setLayers(defaultLayers);
    setActiveLayerId(2);
    setNextLayerId(3);
    setSelection(null);
    setClipboard(null);
    setTransform({ x: 0, y: 0, zoom: 1, rotation: 0, flip: { horizontal: false, vertical: false }});
    setCanvasFrame(null);
    setCanvasBackgroundColor('#ffffff');
    setIsClearAlertOpen(false);
  }

  const handleNew = () => {
    if (paths.length > 0 || layers.some(l => l.pastedImage.length > 0)) {
      setIsClearAlertOpen(true);
    } else {
      clearCanvas();
    }
  };

  const addProjectToRecent = (name: string, data: string) => {
    const newProject = { name, data };
    const updatedRecent = [newProject, ...recentProjects.filter(p => p.name !== name)].slice(0, MAX_RECENT_PROJECTS);
    setRecentProjects(updatedRecent);
    try {
      localStorage.setItem('canvas-sync-recent-projects', JSON.stringify(updatedRecent));
    } catch (error) {
      console.error("Failed to save recent projects:", error);
    }
  };

  const serializeLayers = (layersToSerialize: Layer[]): LayerSerialized[] => {
    return layersToSerialize.map(layer => {
      const { layers, pastedImage, ...rest } = layer;
      const serializedLayer: LayerSerialized = {
        ...rest,
        pastedImage: pastedImage.map(img => ({
          imageDataUri: img.imageData.toDataURL(),
          x: img.x,
          y: img.y,
        })),
      };
      if (layer.type === 'group' && layer.layers) {
        serializedLayer.layers = serializeLayers(layer.layers);
      }
      return serializedLayer;
    });
  }

  const getProjectData = () => {
     const serializableLayers = serializeLayers(layers);
     const projectState = {
        paths,
        layers: serializableLayers,
        activeLayerId,
        nextLayerId,
        selection,
        transform,
        canvasFrame,
        canvasBackgroundColor,
        unit,
        ppi,
        pressureCurve,
        forceProportions,
     };
     return JSON.stringify(projectState);
  }

  const handleSaveAs = React.useCallback(() => {
    const data = getProjectData();
    const projectName = `project-${new Date().toISOString()}.json`;

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = projectName;
    a.click();
    URL.revokeObjectURL(url);
    addProjectToRecent(projectName, data);
  }, [getProjectData]);

  const handleSave = React.useCallback(() => {
    // For now, save just triggers save as.
    handleSaveAs();
  }, [handleSaveAs]);

  const handleOpen = () => {
    fileInputRef.current?.click();
  };

  const handleImport = () => {
    imageInputRef.current?.click();
  }

  const deserializeLayers = async (layersToDeserialize: LayerSerialized[]): Promise<Layer[]> => {
      return Promise.all(layersToDeserialize.map(async (l): Promise<Layer> => {
        const pastedImagePromises = l.pastedImage.map(img => {
            return new Promise<{ imageData: HTMLCanvasElement; x: number; y: number; }>((resolve, reject) => {
                const image = new Image();
                image.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = image.width;
                    canvas.height = image.height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(image, 0, 0);
                    resolve({ imageData: canvas, x: img.x, y: img.y });
                };
                image.onerror = reject;
                image.src = img.imageDataUri;
            });
        });
        const pastedImages = await Promise.all(pastedImagePromises);
        
        const newLayer: Layer = {
            ...l,
            type: l.type || 'layer',
            pastedImage: pastedImages,
            layers: l.layers ? await deserializeLayers(l.layers) : [],
        };
        return newLayer;
      }));
  }

  const loadProjectData = (projectData: string) => {
      try {
        if (typeof projectData === 'string') {
          const data = JSON.parse(projectData);
          if (data.paths && data.layers) {
            deserializeLayers(data.layers).then(loadedLayers => {
                isUndoRedoAction.current = true; // Prevent history tracking for this load
                setHistory([]);
                setHistoryIndex(-1);
                setPaths(data.paths);
                setLayers(loadedLayers);
                setActiveLayerId(data.activeLayerId || data.layers[data.layers.length-1]?.id || 1);
                setNextLayerId(data.nextLayerId || Math.max(...getAllLayerIds(loadedLayers)) + 1);
                setSelection(data.selection || null);
                setTransform(data.transform || { x: 0, y: 0, zoom: 1, rotation: 0, flip: { horizontal: false, vertical: false }});
                setCanvasFrame(data.canvasFrame || null);
                setCanvasBackgroundColor(data.canvasBackgroundColor || '#ffffff');
                setUnit(data.unit || 'px');
                setPpi(data.ppi || 300);
                setPressureCurve(data.pressureCurve || [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
                setForceProportions(data.forceProportions || false);
                toast({ title: "Project loaded successfully!"})
            });
          } else {
            throw new Error("Invalid project file format");
          }
        }
      } catch (error) {
        console.error("Failed to load project file:", error);
        toast({ variant: 'destructive', title: "Error loading file", description: "The selected file is not a valid project file." });
      }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if(typeof result === 'string') {
          loadProjectData(result);
          addProjectToRecent(file.name, result);
        }
      };
      reader.readAsText(file);
    } else {
        toast({ variant: 'destructive', title: "Invalid file type", description: "Please select a .json project file." });
    }
    // Reset file input
    if (event.target) {
        event.target.value = "";
    }
  };

  const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx?.drawImage(img, 0, 0);

                const newLayerData: Omit<Layer, 'id' | 'parentId' | 'locked' | 'lockedAlpha' | 'clippingMask'> = {
                    name: file.name,
                    visible: true,
                    opacity: 100,
                    pastedImage: [{ imageData: tempCanvas, x: 0, y: 0 }],
                    type: 'layer',
                };
                addLayer(newLayerData);
                toast({ title: "Image imported successfully!" });
            };
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);

    } else {
        toast({ variant: 'destructive', title: "Invalid file type", description: "Please select a .png, .jpeg, or .jpg file." });
    }
    // Reset file input
    if (event.target) {
        event.target.value = "";
    }
  };

    const handleExport = () => {
        if (paths.length === 0 && layers.every(l => l.pastedImage.length === 0)) {
            toast({ title: "Canvas is empty", description: "There's nothing to export." });
            return;
        }
        setIsExportDialogOpen(true);
    };

  const handleClear = (layerId: number) => {
     const activeLayerPaths = paths.filter(p => p.layerId === layerId);
     const activeLayer = findLayer(layers, layerId);
     const activeLayerPasted = activeLayer?.pastedImage ?? [];
     
     if(activeLayerPaths.length > 0 || activeLayerPasted.length > 0) {
        setPaths(prev => prev.filter(p => p.layerId !== layerId));
        
        const clearPastedImages = (layers: Layer[]): Layer[] => {
            return layers.map(l => {
                if (l.id === layerId) {
                    return {...l, pastedImage: []};
                }
                if (l.layers) {
                    return {...l, layers: clearPastedImages(l.layers)}
                }
                return l;
            })
        }
        setLayers(prev => clearPastedImages(prev));
        toast({ title: `Layer '${activeLayer?.name}' cleared`});
     }
  }

  const handleFill = () => {
    if (selection) {
        canvasRef.current?.fillSelection(brushColor);
        toast({ title: 'Selection filled' });
    } else {
        // If no selection, fill the entire layer.
        // We do this by creating a massive rectangle.
        // A better implementation might get the current viewport bounds.
        const fillPath: Path = {
            points: [
                { x: -10000, y: -10000, pressure: 0 },
                { x: 10000, y: 10000, pressure: 0 }
            ],
            tool: 'fill',
            brushType: 'round', // N/A
            color: brushColor,
            strokeWidth: 1, // N/A
            layerId: activeLayerId,
            shape: 'rectangle',
            clipRect: null,
            isSelectionInverted: isSelectionInverted,
        };
        setPaths(prev => [...prev, fillPath]);
        toast({ title: 'Layer filled' });
    }
  };

  // Layer handlers
  const addLayer = (data?: Omit<Layer, 'id' | 'parentId' | 'locked' | 'lockedAlpha' | 'clippingMask'>) => {
    const newId = nextLayerId;
    const newLayer: Layer = {
      id: newId,
      name: `Layer ${newId}`,
      visible: true,
      opacity: 100,
      pastedImage: [],
      type: 'layer',
      locked: false,
      lockedAlpha: false,
      clippingMask: false,
      ...(data || {}),
    };
    
    setLayers(currentLayers => {
        const activeLayer = findLayer(currentLayers, activeLayerId);
        let parentId: number | null = null;

        if (activeLayer) {
            if (activeLayer.type === 'group') {
                parentId = activeLayer.id;
            } else {
                parentId = activeLayer.parentId || null;
            }
        }
        newLayer.parentId = parentId;

        const insertLayer = (layers: Layer[]): Layer[] => {
            if (parentId === null) {
                const activeLayerIndex = layers.findIndex(l => l.id === activeLayerId);
                const newLayers = [...layers];
                newLayers.splice(activeLayerIndex >= 0 ? activeLayerIndex : 0, 0, newLayer);
                return newLayers;
            }
            return layers.map(l => {
                if (l.id === parentId && l.type === 'group') {
                    const activeLayerIndex = l.layers!.findIndex(child => child.id === activeLayerId);
                     const newChildLayers = [...l.layers!];
                     newChildLayers.splice(activeLayerIndex >= 0 ? activeLayerIndex : 0, 0, newLayer);
                    return { ...l, layers: newChildLayers, expanded: true };
                }
                if (l.layers) {
                    return { ...l, layers: insertLayer(l.layers) };
                }
                return l;
            });
        };
        return insertLayer(currentLayers);
    });

    setActiveLayerId(newId);
    setNextLayerId(prev => prev + 1);
  };
  
  const addLayerGroup = () => {
    const newId = nextLayerId;
    const newGroup: Layer = {
      id: newId,
      name: `Group ${newId}`,
      visible: true,
      opacity: 100,
      pastedImage: [],
      type: 'group',
      layers: [],
      expanded: true,
      locked: false,
      lockedAlpha: false,
      clippingMask: false,
    };
    
    setLayers(currentLayers => {
        const activeLayer = findLayer(currentLayers, activeLayerId);
        newGroup.parentId = activeLayer ? (activeLayer.parentId || null) : null;

        const insertGroup = (layers: Layer[]): Layer[] => {
             const activeLayerIndex = layers.findIndex(l => l.id === activeLayerId);
             if (activeLayerIndex !== -1 && layers[activeLayerIndex].parentId === newGroup.parentId) {
                const newLayers = [...layers];
                newLayers.splice(activeLayerIndex, 0, newGroup);
                return newLayers;
             }
             for(const layer of layers) {
                if(layer.type === 'group' && layer.layers) {
                    layer.layers = insertGroup(layer.layers);
                }
             }
             return layers;
        }

        if (activeLayer) {
            return insertGroup(currentLayers);
        } else {
            return [newGroup, ...currentLayers];
        }
    });

    setActiveLayerId(newId);
    setNextLayerId(prev => prev + 1);
  };


  const deleteLayer = (id: number) => {
    let nextActiveId: number | null = null;
    let allIdsToDelete: number[] = [];

    const findAndDelete = (layers: Layer[], targetId: number): Layer[] => {
        const layerToDeleteIndex = layers.findIndex(l => l.id === targetId);
        
        if (layerToDeleteIndex !== -1) {
            const layerToDelete = layers[layerToDeleteIndex];
            allIdsToDelete = getAllLayerIds([layerToDelete]);

            // Determine next active layer
            if (layers.length > 1) {
                 if (layerToDeleteIndex > 0) {
                    nextActiveId = layers[layerToDeleteIndex - 1].id;
                } else {
                    nextActiveId = layers[layerToDeleteIndex + 1].id;
                }
            } else {
                // Deleting the last layer in a group or at root
                const parent = findLayer(layers, layerToDelete.parentId!);
                if (parent) {
                    nextActiveId = parent.id;
                } else if (globals.length > 1) {
                    // This part is tricky, we need to find a sibling in the global context
                    const globalLayers = globals;
                    const topLevelIndex = globalLayers.findIndex(l => l.id === layers.find(l => l.parentId === null)?.id);
                    if (topLevelIndex > 0) nextActiveId = globalLayers[topLevelIndex - 1].id;
                    else if (globalLayers.length > 1) nextActiveId = globalLayers[1].id;
                }
            }
             return layers.filter(l => l.id !== targetId);
        }
        
        return layers.map(l => {
            if (l.type === 'group' && l.layers) {
                return {...l, layers: findAndDelete(l.layers, targetId)};
            }
            return l;
        });
    }

    const globals = layers; // Save a reference to the top-level layers
    const newLayers = findAndDelete(layers, id);
    
    if (allIdsToDelete.length > 0) {
        setLayers(newLayers);
        setPaths(prev => prev.filter(p => !allIdsToDelete.includes(p.layerId)));

        if (allIdsToDelete.includes(activeLayerId)) {
            if(nextActiveId) {
                setActiveLayerId(nextActiveId);
            }
        }
    }
  };

  const duplicateLayer = (id: number) => {
    const layerToDuplicate = findLayer(layers, id);
    if (!layerToDuplicate) return;

    let currentNextId = nextLayerId;
    const newPaths: Path[] = [];
    
    const cloneCanvas = (oldCanvas: HTMLCanvasElement) => {
      const newCanvas = document.createElement('canvas');
      newCanvas.width = oldCanvas.width;
      newCanvas.height = oldCanvas.height;
      const ctx = newCanvas.getContext('2d');
      ctx?.drawImage(oldCanvas, 0, 0);
      return newCanvas;
    };

    const duplicateRecursive = (l: Layer, parentId: number | null): Layer => {
        const newId = currentNextId++;
        
        // Duplicate paths for this layer
        const layerPaths = paths.filter(p => p.layerId === l.id);
        layerPaths.forEach(p => {
            newPaths.push({ ...p, layerId: newId });
        });

        const newLayer: Layer = {
            ...l,
            id: newId,
            name: `${l.name} copy`,
            parentId: parentId,
            pastedImage: l.pastedImage.map(img => ({
                ...img,
                imageData: cloneCanvas(img.imageData)
            })),
        };

        if (l.type === 'group' && l.layers) {
            newLayer.layers = l.layers.map(child => duplicateRecursive(child, newId));
        }

        return newLayer;
    };

    const newLayer = duplicateRecursive(layerToDuplicate, layerToDuplicate.parentId || null);
    
    setNextLayerId(currentNextId);
    setPaths(prev => [...prev, ...newPaths]);

    setLayers(currentLayers => {
        const insertDuplicate = (list: Layer[]): Layer[] => {
            const index = list.findIndex(l => l.id === id);
            if (index !== -1) {
                const newList = [...list];
                newList.splice(index, 0, newLayer); // Insert ABOVE (index 0 is top)
                return newList;
            }
            return list.map(l => {
                if (l.type === 'group' && l.layers) {
                    return { ...l, layers: insertDuplicate(l.layers) };
                }
                return l;
            });
        };
        return insertDuplicate(currentLayers);
    });

    setActiveLayerId(newLayer.id);
    addLog(`Layer '${layerToDuplicate.name}' duplicated`);
  }

  const mergeLayerDown = (id: number) => {
    const layerA = findLayer(layers, id);
    if (!layerA) return;

    const findParentAndIndex = (list: Layer[]): { parent: Layer | null, index: number } | null => {
        const idx = list.findIndex(l => l.id === id);
        if (idx !== -1) {
            return { parent: null, index: idx };
        }
        for (const l of list) {
            if (l.type === 'group' && l.layers) {
                const result = findParentAndIndex(l.layers);
                if (result) {
                    if (result.parent === null) {
                        return { parent: l, index: result.index };
                    }
                    return result;
                }
            }
        }
        return null;
    };

    const result = findParentAndIndex(layers);
    if (!result) return;
    const { parent: parentLayer, index: indexA } = result;
    const siblingList = (parentLayer && parentLayer.type === 'group' && parentLayer.layers) ? parentLayer.layers : layers;

    if (indexA === -1 || indexA >= siblingList.length - 1) {
        toast({ title: "No layer below to merge with." });
        return;
    }

    const layerB = siblingList[indexA + 1];

    const rasterA = canvasRef.current?.getLayerRaster(id);
    if (!rasterA) {
        // If layer is truly empty, we just delete it
        deleteLayer(id);
        addLog(`Layer '${layerA.name}' was empty and has been removed`);
        return;
    }

    const newImageForB = {
        imageData: rasterA.imageData,
        x: rasterA.x,
        y: rasterA.y
    };

    setLayers(currentLayers => {
        const updateLayers = (list: Layer[]): Layer[] => {
            const idx = list.findIndex(l => l.id === id);
            if (idx !== -1) {
                const newList = [...list];
                const targetB = { ...newList[idx + 1] };
                targetB.pastedImage = [...targetB.pastedImage, newImageForB];
                
                newList[idx + 1] = targetB;
                newList.splice(idx, 1);
                return newList;
            }
            return list.map(l => {
                if (l.type === 'group' && l.layers) {
                    return { ...l, layers: updateLayers(l.layers) };
                }
                return l;
            });
        };
        return updateLayers(currentLayers);
    });

    const allIdsInA = getAllLayerIds([layerA]);
    setPaths(prev => prev.filter(p => !allIdsInA.includes(p.layerId)));
    
    setActiveLayerId(layerB.id);
    addLog(`Layer '${layerA.name}' merged down into '${layerB.name}'`);
  }

  const toggleLayerProperty = (id: number, property: keyof Layer) => {
      const toggle = (layers: Layer[]): Layer[] => {
          return layers.map(l => {
              if (l.id === id) {
                  const currentValue = l[property];
                  if(typeof currentValue === 'boolean') {
                    return { ...l, [property]: !currentValue };
                  }
              }
              if (l.type === 'group' && l.layers) {
                  return { ...l, layers: toggle(l.layers) };
              }
              return l;
          });
      };
      setLayers(toggle);
  };


  const setLayerOpacity = (id: number, opacity: number) => {
    const setOpacity = (layers: Layer[]): Layer[] => {
        return layers.map(l => {
            if (l.id === id) {
                return { ...l, opacity };
            }
            if (l.type === 'group' && l.layers) {
                return { ...l, layers: setOpacity(l.layers) };
            }
            return l;
        })
    }
    setLayers(setOpacity);
  }
  
  const renameLayer = (id: number, newName: string) => {
    const rename = (layers: Layer[]): Layer[] => {
      return layers.map(l => {
        if (l.id === id) {
          return { ...l, name: newName };
        }
        if (l.type === 'group' && l.layers) {
          return { ...l, layers: rename(l.layers) };
        }
        return l;
      });
    };
    setLayers(rename);
  };


  // Canvas Transform Handlers
  const handleFlipHorizontal = () => !lockView && setTransform(t => ({...t, flip: {...t.flip, horizontal: !t.flip.horizontal}}));
  const handleFlipVertical = () => !lockView && setTransform(t => ({...t, flip: {...t.flip, vertical: !t.flip.vertical}}));
  const handleRotateLeft = () => !lockView && setTransform(t => ({...t, rotation: t.rotation - 15}));
  const handleRotateRight = () => !lockView && setTransform(t => ({...t, rotation: t.rotation + 15}));
  const handleZoomIn = () => !lockView && setTransform(t => ({...t, zoom: t.zoom * 1.2}));
  const handleZoomOut = () => !lockView && setTransform(t => ({...t, zoom: t.zoom / 1.2}));
  
  const handleDeselect = React.useCallback(() => {
    setSelection(null);
    setIsSelectionInverted(false);
  }, []);

  const handleSelectAll = React.useCallback(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const padding = 20;
    
    const allVisibleLayers = (layers: Layer[]): Layer[] => {
        let visible: Layer[] = [];
        for (const layer of layers) {
            if (layer.visible) {
                visible.push(layer);
                if (layer.type === 'group' && layer.layers) {
                    visible = visible.concat(allVisibleLayers(layer.layers));
                }
            }
        }
        return visible;
    }
    
    const visibleLayers = allVisibleLayers(layers);
    const visibleLayerIds = visibleLayers.map(l => l.id);
    const visiblePaths = paths.filter(p => visibleLayerIds.includes(p.layerId));

    if (visiblePaths.length === 0 && visibleLayers.every(l => l.pastedImage.length === 0)) {
        setSelection({ x: 0, y: 0, width: 500, height: 400 });
        return;
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
        setSelection({ x: 0, y: 0, width: 500, height: 400 });
        return;
    }

    setSelection({
        x: minX - padding,
        y: minY - padding,
        width: (maxX - minX) + padding * 2,
        height: (maxY - minY) + padding * 2,
    });
  }, [layers, paths]);

  const handleSelectCanvasFrame = () => {
    if (!canvasRef.current) return;
    const frameSelection = canvasRef.current.getVisibleFrame();
    if(frameSelection) {
        setSelection(frameSelection);
    }
  }

  const handleInvertSelection = React.useCallback(() => {
      if (selection) {
          setIsSelectionInverted(prev => !prev);
      }
  }, [selection]);
  
  const handleSetCanvasSize = (width: number, height: number) => {
    setCanvasFrame({ width, height });
    setIsCanvasSizeDialogOpen(false);
  }
  
  const handleSetCanvasBackgroundColor = (color: string) => {
    setCanvasBackgroundColor(color);
    setIsCanvasBackgroundDialogOpen(false);
  }

  const handleRevertToInfinite = () => {
    setCanvasFrame(null);
    toast({ title: "Switched to infinite canvas" });
  }

  // Edit Operations
  const handleCopy = React.useCallback(() => {
    if (!selection || !canvasRef.current) return;
    const imageData = canvasRef.current.getSelectionImageData();
    if(imageData) {
        setClipboard(imageData);
        toast({title: "Copied to clipboard"});
    }
  }, [selection]);

  const handleCut = React.useCallback(() => {
    if (!selection || !canvasRef.current) return;
    const imageData = canvasRef.current.getSelectionImageData();
    if (imageData) {
        setClipboard(imageData);
        canvasRef.current.clearSelection();
        toast({title: "Cut to clipboard"});
    }
  }, [selection]);
  
  const handlePaste = React.useCallback(() => {
    if (!clipboard) return;

    // Create a new layer for the pasted content
    const newLayerData: Omit<Layer, 'id' | 'parentId' | 'locked' | 'lockedAlpha' | 'clippingMask'> = {
      name: `Pasted Content ${nextLayerId}`,
      visible: true,
      opacity: 100,
      pastedImage: [{
        imageData: clipboard as any, // This is a bit of a hack
        x: selection?.x ?? 0,
        y: selection?.y ?? 0,
      }],
      type: 'layer',
    };
    
    // Create an Image element to get dimensions
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = clipboard.width;
    tempCanvas.height = clipboard.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx?.putImageData(clipboard, 0, 0);

    newLayerData.pastedImage[0].imageData = tempCanvas;

    addLayer(newLayerData);

    // Create a new selection around the pasted image
    setSelection({
        x: selection?.x ?? 0,
        y: selection?.y ?? 0,
        width: clipboard.width,
        height: clipboard.height,
    });
    setClipboard(null); // Clear clipboard after paste
  }, [clipboard, nextLayerId, selection]);
  
  // Paint menu handlers
  const decreaseBrushSize = () => setBrushSize(s => Math.max(1, s - 2));
  const increaseBrushSize = () => setBrushSize(s => Math.min(500, s + 2));
  const setDefaultColors = () => {
    setBrushColor('#000000');
    setSecondaryBrushColor('#ffffff');
  };
  const swapColors = () => {
    setBrushColor(c => {
        setSecondaryBrushColor(c);
        return secondaryBrushColor;
    });
  };
  const resetAllBrushes = () => {
    setBrushSize(36);
    setBrushColor('#000000');
    setBrushOpacity(100);
    setBrushType('round');
  };

  const adjustColor = (prop: 'h' | 's' | 'l', amount: number) => {
    let hsl = hexToHsl(brushColor);
    if (prop === 'h') {
      hsl.h = ((hsl.h + amount) % 360 + 360) % 360;
    } else {
      hsl[prop] = Math.max(0, Math.min(100, hsl[prop] + amount));
    }
    setBrushColor(hslToHex(hsl.h, hsl.s, hsl.l));
  }
  const adjustColorLightness = (amount: number) => adjustColor('l', amount);
  const adjustColorSaturation = (amount: number) => adjustColor('s', amount);
  const adjustColorHue = (amount: number) => adjustColor('h', amount);

  // History menu handlers
  const handleClearHistory = () => {
    if (history.length > 1) { // If there's more than the initial state
        setIsClearHistoryAlertOpen(true);
    } else {
        toast({title: "History is already clear", description: "There are no redo states to clear."});
    }
  }
  const confirmClearHistory = () => {
    setHistory([]);
    setHistoryIndex(-1);
    toast({title: "History Cleared", description: "The redo history has been cleared."});
    setIsClearHistoryAlertOpen(false);
  }
  const handleNewFromHistory = () => {
    toast({ title: "Creating new project from current state..." });
    handleSaveAs();
  }

  const handleActivateCrop = () => setActiveTool('crop');
  const handleActivateTransform = () => setActiveTool('transform');
  const handleReCenter = () => setTransform(prev => ({ ...prev, x: 0, y: 0 }));
  
  const handleOpenBrightnessContrast = () => {
    setActiveAdjustment('brightness');
    setIsAdjustmentsDialogOpen(true);
  }
  const handleOpenHueSaturation = () => {
    setActiveAdjustment('hue');
    setIsAdjustmentsDialogOpen(true);
  }


  // Effect for handling global keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow shortcuts only when not typing in an input
      if ((e.target as HTMLElement).tagName.toLowerCase() === 'input' || (e.target as HTMLElement).tagName.toLowerCase() === 'textarea') {
        return;
      }
      
      const isCtrlOrMeta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      
      const isUndo = isCtrlOrMeta && !e.shiftKey && key === 'z';
      const isRedo = (isCtrlOrMeta && e.shiftKey && key === 'z') || (isCtrlOrMeta && key === 'y');

      if (isUndo) {
        e.preventDefault();
        handleUndo();
      } else if (isRedo) {
        e.preventDefault();
        handleRedo();
      }

      // Tool shortcuts
      if (key === 'b') { e.preventDefault(); setActiveTool('brush'); }
      if (key === 'm') { e.preventDefault(); setActiveTool('select'); } // M for marquee
      if (key === 'l') { e.preventDefault(); setActiveTool('lasso'); }
      if (key === 'h' || e.code === 'Space') { /* handled in canvas */ }
      if (key === 'u') { e.preventDefault(); setActiveTool('shape'); } 
      if (key === 'i' && !isCtrlOrMeta) { 
        e.preventDefault(); 
        setActiveTool('pipette'); 
      }
      if (key === 'r') { e.preventDefault(); setActiveTool('ruler'); }
      if (key === 'v') { e.preventDefault(); setActiveTool('move'); }
      if (key === 'c' && !isCtrlOrMeta) { e.preventDefault(); setActiveTool('crop'); }
      if (key === 'p' && isCtrlOrMeta) { e.preventDefault(); togglePanel('channels'); }

      // Panel shortcuts
      if (key === 'f2') { e.preventDefault(); togglePanel('tool'); }
      if (key === 'f3') { e.preventDefault(); togglePanel('line'); }
      if (key === 'f4') { e.preventDefault(); togglePanel('brushList'); }
      if (key === 'f5') { e.preventDefault(); togglePanel('brushOptions'); }
      if (key === 'f6') { e.preventDefault(); togglePanel('color'); }
      if (key === 'f7') { e.preventDefault(); togglePanel('layers'); }
      if (key === 'f8') { e.preventDefault(); togglePanel('select'); }
      
      // Brush size
      if (key === '[') decreaseBrushSize();
      if (key === ']') increaseBrushSize();
      
      // Layer shortcuts
      if (isCtrlOrMeta && e.shiftKey && key === 'n') {
        e.preventDefault();
        addLayer();
      }
      if (isCtrlOrMeta && key === 'j') {
        e.preventDefault();
        duplicateLayer(activeLayerId);
      }
      if (isCtrlOrMeta && key === 'e' && !e.shiftKey) {
        e.preventDefault();
        mergeLayerDown(activeLayerId);
      }
      if (isCtrlOrMeta && key === 'n' && !e.shiftKey) {
        e.preventDefault();
        handleNew();
      }
      if (key === 'delete' && selection) {
         e.preventDefault();
         canvasRef.current?.clearSelection();
      }

      // Selection
      if (isCtrlOrMeta && key === 'd') {
        e.preventDefault();
        handleDeselect();
      }

      if (isCtrlOrMeta && key === 'i') {
          e.preventDefault();
          handleInvertSelection();
      }

      if (isCtrlOrMeta && !e.shiftKey && key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }
      
      if (isCtrlOrMeta && e.shiftKey && key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }


      // Edit shortcuts
      if (isCtrlOrMeta && key === 'c') {
          e.preventDefault();
          handleCopy();
      }
      if (isCtrlOrMeta && key === 'x') {
          e.preventDefault();
          handleCut();
      }
      if (isCtrlOrMeta && key === 'v') {
          e.preventDefault();
          handlePaste();
      }
      
      // File
      if (isCtrlOrMeta && key === 's' && !e.shiftKey) {
          e.preventDefault();
          handleSave();
      }
       if (isCtrlOrMeta && e.shiftKey && key === 's') {
          e.preventDefault();
          handleSaveAs();
      }
      if (isCtrlOrMeta && key === 'o') {
          e.preventDefault();
          handleOpen();
      }

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
    }

  }, [
    activeLayerId,
    layers,
    clipboard,
    selection,
    handleDeselect,
    handleSelectAll,
    handleInvertSelection,
    handleCopy,
    handleCut,
    handlePaste,
    handleSave,
    handleSaveAs,
    handleOpen,
    handleUndo,
    handleRedo,
    togglePanel,
  ]);

  const handleMoveContent = (dx: number, dy: number) => {
    setPaths(prev => prev.map(p => {
      if (p.layerId === activeLayerId) {
        return {
          ...p,
          points: p.points.map(pt => ({ ...pt, x: pt.x + dx, y: pt.y + dy }))
        };
      }
      return p;
    }));

    const moveLayerImages = (lst: Layer[]): Layer[] => lst.map(l => {
        const result = { ...l };
        if (l.id === activeLayerId && l.pastedImage) {
            result.pastedImage = l.pastedImage.map(img => ({
                ...img,
                x: img.x + dx,
                y: img.y + dy
            }));
        }
        if (l.layers) result.layers = moveLayerImages(l.layers);
        return result;
    });
    setLayers(prev => moveLayerImages(prev));
    addLog(`Moved layer content by ${Math.round(dx)}, ${Math.round(dy)}`);
  };

  const handleCommitFloatingSelection = React.useCallback((payload: FloatingSelectionCommit) => {
    setLayers(prev => prev.map(l => {
      if (l.id === activeLayerId) {
        return {
          ...l,
          pastedImage: [...l.pastedImage, { imageData: payload.image, x: payload.x, y: payload.y }],
        };
      }
      return l;
    }));
    addLog(`Committed floating selection at ${Math.round(payload.x)}, ${Math.round(payload.y)}`);
  }, [activeLayerId, addLog]);


  return (
    <>
      <div className="flex flex-col h-dvh w-full bg-background text-foreground overflow-hidden" style={{ opacity: windowOpacity / 100 }}>
        <EditorHeader
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onNew={handleNew}
          onOpen={handleOpen}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onExport={handleExport}
          onImport={handleImport}
          onClear={() => handleClear(activeLayerId)}
          onFill={handleFill}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          showRulers={showRulers}
          setShowRulers={setShowRulers}
          lockView={lockView}
          setLockView={setLockView}
          onFlipHorizontal={handleFlipHorizontal}
          onFlipVertical={handleFlipVertical}
          onRotateLeft={handleRotateLeft}
          onRotateRight={handleRotateRight}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onDeselect={handleDeselect}
          onReCenter={handleReCenter}
          onActivateCrop={handleActivateCrop}
          onActivateTransform={handleActivateTransform}
          onOpenBrightnessContrast={handleOpenBrightnessContrast}
          onOpenHueSaturation={handleOpenHueSaturation}
          onSelectAll={handleSelectAll}
          onInvertSelection={handleInvertSelection}
          isSelectionInverted={isSelectionInverted}
          onAddLayer={addLayer}
          onMergeLayerDown={() => mergeLayerDown(activeLayerId)}
          onDuplicateLayer={() => duplicateLayer(activeLayerId)}
          onDeleteLayer={() => deleteLayer(activeLayerId)}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          canCopy={!!selection}
          canPaste={!!clipboard}
          recentProjects={recentProjects}
          onOpenRecent={loadProjectData}
          onOpenCanvasBackgroundDialog={() => setIsCanvasBackgroundDialogOpen(true)}
          onOpenUnitResolutionDialog={() => setIsUnitResolutionDialogOpen(true)}
          decreaseBrushSize={decreaseBrushSize}
          increaseBrushSize={increaseBrushSize}
          setDefaultColors={setDefaultColors}
          swapColors={swapColors}
          resetAllBrushes={resetAllBrushes}
          adjustColorLightness={adjustColorLightness}
          adjustColorSaturation={adjustColorSaturation}
          adjustColorHue={adjustColorHue}
          onClearHistory={handleClearHistory}
          onNewFromHistory={handleNewFromHistory}
          onOpenWindowOpacityDialog={() => setIsWindowOpacityDialogOpen(true)}
          onOpenPenMappingDialog={() => setIsPenMappingDialogOpen(true)}
          onOpenPenPressureDialog={() => setIsPenPressureDialogOpen(true)}
          onOpenMultiTouchDialog={() => setIsMultiTouchDialogOpen(true)}
          onOpenRightSideButtonDialog={() => setIsRightSideButtonDialogOpen(true)}
          onOpenWheelDialScrollerDialog={() => setIsWheelDialScrollerDialogOpen(true)}
          onOpenLanguageDialog={() => setIsLanguageDialogOpen(true)}
          onOpenHistoryLimitDialog={() => setIsHistoryLimitDialogOpen(true)}
          showTool={showTool}
          showBrushList={showBrushList}
          showBrushOptions={showBrushOptions}
          showColor={showColor}
          showLayers={showLayers}
          showView={showView}
          showPerformance={showPerformance}
          showConsole={showConsole}
          showExportbar={showExportbar}
          showLine={showLine}
          showSelect={showSelect}
          showChannels={showChannels}
          activeChannel={activeChannel}
          setActiveChannel={setActiveChannel}
          onTogglePanel={togglePanel}
          onCloseAllPanels={closeAllPanels}
          leftHanded={leftHanded}
          toggleLeftHanded={() => setLeftHanded(v => !v)}
          isSimulatingPressure={isSimulatingPressure}
          onToggleSimulatePressure={() => setIsSimulatingPressure(!isSimulatingPressure)}
        />
        <QuickAccessToolbar
            activeTool={activeTool}
            setActiveTool={handleToolSelect}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            brushColor={brushColor}
            setBrushColor={setBrushColor}
            secondaryBrushColor={secondaryBrushColor}
            setSecondaryBrushColor={setSecondaryBrushColor}
            brushOpacity={brushOpacity}
            setBrushOpacity={setBrushOpacity}
            brushType={brushType}
            setBrushType={setBrushType}
            fillTolerance={fillTolerance}
            setFillTolerance={setFillTolerance}
            fillContiguous={fillContiguous}
            setFillContiguous={setFillContiguous}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < history.length - 1}
            swapColors={swapColors}
            layers={layers}
            activeLayerId={activeLayerId}
            setActiveLayerId={setActiveLayerId}
            addLayer={addLayer}
            addLayerGroup={addLayerGroup}
            deleteLayer={deleteLayer}
            duplicateLayer={duplicateLayer}
            mergeLayerDown={mergeLayerDown}
            toggleLayerProperty={toggleLayerProperty}
            setLayerOpacity={setLayerOpacity}
            renameLayer={renameLayer}
            clearLayer={handleClear}
            showGrid={showGrid}
            setShowGrid={setShowGrid}
            showRulers={showRulers}
            setShowRulers={setShowRulers}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            transform={transform}
            leftHanded={leftHanded}
            showTool={showTool}
            showBrushList={showBrushList}
            showBrushOptions={showBrushOptions}
            showColor={showColor}
            showLayers={showLayers}
            showView={showView}
            showExportbar={showExportbar}
            showLine={showLine}
            showSelect={showSelect}
            showChannels={showChannels}
            activeChannel={activeChannel}
            setActiveChannel={setActiveChannel}
            onSelectAll={handleSelectAll}
            onSelectNone={handleDeselect}
            onSelectInvert={handleInvertSelection}
            addLog={addLog}
            activeShapeType={activeShapeType}
            setActiveShapeType={setActiveShapeType}
            liquifySettings={liquifySettings}
            setLiquifySettings={setLiquifySettings}
        />
        <main className="flex-1 flex items-stretch justify-stretch bg-stone-200 dark:bg-zinc-900 transition-all duration-300 relative">
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <div className="w-full h-full shadow-2xl">
                <Canvas
                    ref={canvasRef}
                    activeTool={activeTool}
                    setActiveTool={setActiveTool}
                    paths={paths}
                    setPaths={setPaths}
                    brushSize={brushSize}
                    brushColor={brushColor}
                    setBrushColor={setBrushColor}
                    brushOpacity={brushOpacity}
                    brushType={brushType}
                    layers={layers}
                    setLayers={setLayers}
                    activeLayerId={activeLayerId}
                    showGrid={showGrid}
                    showRulers={showRulers}
                    lockView={lockView}
                    selection={selection}
                    setSelection={setSelection}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    transform={transform}
                    setTransform={setTransform}
                    onPaste={handlePaste as any}
                    onSelectCanvasFrame={handleSelectCanvasFrame}
                    isSelectionInverted={isSelectionInverted}
                    activeChannel={activeChannel}
                    canvasFrame={canvasFrame}
                    isSimulatingPressure={isSimulatingPressure}
                    activeShapeType={activeShapeType}
                    liquifySettings={liquifySettings}
                    canvasBackgroundColor={canvasBackgroundColor}
                    unit={unit}
                    ppi={ppi}
                    pressureCurve={pressureCurve}
                    forceProportions={forceProportions}
                    fillTolerance={fillTolerance}
                    fillContiguous={fillContiguous}
                    onCommitMove={handleMoveContent}
                    onCommitFloatingSelection={handleCommitFloatingSelection}
                    onCommitTransformRaster={(composite, x, y, capturedLayerIds, originalSel, newSel) => {
                        if (!originalSel) return;
                        
                        // 1. "Erase" the original area from vectors
                        const eraserPaths: Path[] = capturedLayerIds.map(layerId => {
                            const pts = originalSel.points && originalSel.points.length > 2 
                                ? originalSel.points.map(p => ({ ...p, pressure: 0.5 }))
                                : [
                                    { x: originalSel.x, y: originalSel.y, pressure: 0.5 },
                                    { x: originalSel.x + originalSel.width, y: originalSel.y + originalSel.height, pressure: 0.5 }
                                  ];
                            
                            return {
                                points: pts,
                                tool: 'eraser',
                                shape: (originalSel.points && originalSel.points.length > 2) ? 'polygon' : 'rectangle',
                                strokeWidth: 1, // Full fill
                                color: '#000000',
                                brushType: 'round',
                                layerId: layerId,
                                opacity: 100,
                            };
                        });
                        setPaths(prev => [...prev, ...eraserPaths]);

                        // 2. "Erase" the original area from images
                        setLayers(prev => {
                            const eraseFromImages = (lst: Layer[]): Layer[] => lst.map(l => {
                                let result = { ...l };
                                if (capturedLayerIds.includes(l.id) && l.pastedImage.length > 0) {
                                  result.pastedImage = l.pastedImage.map(img => {
                                      // Create a copy and clear the intersection with originalSel
                                      const w = img.width ?? img.imageData.width;
                                      const h = img.height ?? img.imageData.height;
                                      const canvas = document.createElement('canvas');
                                      canvas.width = w; canvas.height = h;
                                      const ctx = canvas.getContext('2d')!;
                                      
                                      ctx.drawImage(img.imageData, 0, 0);
                                      ctx.globalCompositeOperation = 'destination-out';
                                      ctx.save();
                                      ctx.translate(-img.x, -img.y);
                                      ctx.beginPath();
                                      if (originalSel.points && originalSel.points.length > 2) {
                                          ctx.moveTo(originalSel.points[0].x, originalSel.points[0].y);
                                          for (let i = 1; i < originalSel.points.length; i++) {
                                              ctx.lineTo(originalSel.points[i].x, originalSel.points[i].y);
                                          }
                                      } else {
                                          ctx.rect(originalSel.x, originalSel.y, originalSel.width, originalSel.height);
                                      }
                                      ctx.fill();
                                      ctx.restore();

                                      return { ...img, imageData: canvas };
                                  });
                                }
                                if (l.layers) result.layers = eraseFromImages(l.layers);
                                return result;
                            });
                            return eraseFromImages(prev);
                        });

                        // 3. Add the transformed content to the active layer
                        setLayers(prev => {
                            const addImage = (lst: Layer[]): Layer[] => lst.map(l => {
                                if (l.id === activeLayerId) {
                                    return {
                                        ...l,
                                        pastedImage: [
                                            ...l.pastedImage,
                                            { imageData: composite, x, y }
                                        ]
                                    };
                                }
                                if (l.layers) return { ...l, layers: addImage(l.layers) };
                                return l;
                            });
                            return addImage(prev);
                        });
                    }}
                    onPaintBucketFill={(imageData: HTMLCanvasElement, x: number, y: number) => {
                        setLayers(prev => prev.map(l => {
                            if (l.id === activeLayerId) {
                                return {
                                    ...l,
                                    pastedImage: [...l.pastedImage, { imageData, x, y }]
                                };
                            }
                            return l;
                        }));
                    }}
                    onCommitCrop={(cropRect: {x: number, y: number, width: number, height: number}) => {
                        // Translate paths
                        setPaths(prev => prev.map(p => ({
                            ...p,
                            points: p.points.map(pt => ({
                                ...pt,
                                x: pt.x - cropRect.x,
                                y: pt.y - cropRect.y
                            }))
                        })));
                        
                        // Translate pasted layers
                        setLayers(prev => prev.map(l => {
                            if (l.pastedImage && l.pastedImage.length > 0) {
                                return {
                                    ...l,
                                    pastedImage: l.pastedImage.map(img => ({
                                        ...img,
                                        x: img.x - cropRect.x,
                                        y: img.y - cropRect.y
                                    }))
                                };
                            }
                            return l;
                        }));

                        // Resize actual canvas window via canvasFrame
                        setCanvasFrame({
                            width: cropRect.width, 
                            height: cropRect.height 
                        });
                        
                        // Drop selection block and set tool back to normal
                        setSelection(null);
                        setActiveTool('brush');
                    }}
                />
            </div>
          </div>
        </main>
        <ExportDialog 
            isOpen={isExportDialogOpen} 
            onOpenChange={setIsExportDialogOpen}
            paths={paths}
            layers={layers}
            canvasFrame={canvasFrame}
            canvasBackgroundColor={canvasBackgroundColor}
        />
        <CanvasSizeDialog
            isOpen={isCanvasSizeDialogOpen}
            onOpenChange={setIsCanvasSizeDialogOpen}
            onSetSize={handleSetCanvasSize}
            currentSize={canvasFrame}
            unit={unit}
            ppi={ppi}
        />
        <CanvasBackgroundDialog
          isOpen={isCanvasBackgroundDialogOpen}
          onOpenChange={setIsCanvasBackgroundDialogOpen}
          onSetColor={handleSetCanvasBackgroundColor}
          currentColor={canvasBackgroundColor}
        />
        <UnitResolutionDialog
          isOpen={isUnitResolutionDialogOpen}
          onOpenChange={setIsUnitResolutionDialogOpen}
          unit={unit}
          setUnit={setUnit}
          ppi={ppi}
          setPpi={setPpi}
        />
        <WindowOpacityDialog
            isOpen={isWindowOpacityDialogOpen}
            onOpenChange={setIsWindowOpacityDialogOpen}
            opacity={windowOpacity}
            setOpacity={setWindowOpacity}
        />
        <PenMappingDialog 
            isOpen={isPenMappingDialogOpen}
            onOpenChange={setIsPenMappingDialogOpen}
            forceProportions={forceProportions}
            setForceProportions={setForceProportions}
        />
        <PenPressureDialog
            isOpen={isPenPressureDialogOpen}
            onOpenChange={setIsPenPressureDialogOpen}
            pressureCurve={pressureCurve}
            setPressureCurve={setPressureCurve}
        />
        <MultiTouchDialog
            isOpen={isMultiTouchDialogOpen}
            onOpenChange={setIsMultiTouchDialogOpen}
        />
        <RightSideButtonDialog
            isOpen={isRightSideButtonDialogOpen}
            onOpenChange={setIsRightSideButtonDialogOpen}
        />
        <WheelDialScrollerDialog
            isOpen={isWheelDialScrollerDialogOpen}
            onOpenChange={setIsWheelDialScrollerDialogOpen}
        />
        <LanguageDialog
            isOpen={isLanguageDialogOpen}
            onOpenChange={setIsLanguageDialogOpen}
            setLocale={setLocale}
        />
        <HistoryLimitDialog
            isOpen={isHistoryLimitDialogOpen}
            onOpenChange={setIsHistoryLimitDialogOpen}
            limit={historyLimit}
            setLimit={setHistoryLimit}
        />
      </div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".json"
      />
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleImageFileChange}
        className="hidden"
        accept=".png, .jpeg, .jpg"
      />
      <AlertDialog open={isClearAlertOpen} onOpenChange={setIsClearAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new canvas and your current work will be lost. Make sure to save or export it first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={clearCanvas}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={isClearHistoryAlertOpen} onOpenChange={setIsClearHistoryAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Redo History?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will clear all of your redo states and cannot be undone. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClearHistory}>Clear History</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {showPerformance && <PerformanceMonitor pathsCount={paths.length} layersCount={layers.length} />}
      {showConsole && <ConsolePanel logs={actionLog} />}
    </>
  );
}

function PerformanceMonitor({ pathsCount, layersCount }: { pathsCount: number, layersCount: number }) {
    const [fps, setFps] = React.useState(0);
    const lastTime = React.useRef(performance.now());
    const frames = React.useRef(0);

    React.useEffect(() => {
        let animationId: number;
        const update = () => {
            frames.current++;
            const now = performance.now();
            if (now >= lastTime.current + 1000) {
                setFps(Math.round((frames.current * 1000) / (now - lastTime.current)));
                lastTime.current = now;
                frames.current = 0;
            }
            animationId = requestAnimationFrame(update);
        };
        animationId = requestAnimationFrame(update);
        return () => cancelAnimationFrame(animationId);
    }, []);

    return (
        <div className="fixed bottom-4 right-4 bg-black/80 text-green-400 p-2 rounded-md text-xs font-mono z-50 pointer-events-none border border-green-900 shadow-lg">
            <div>FPS: {fps}</div>
            <div>PATHS: {pathsCount}</div>
            <div>LAYERS: {layersCount}</div>
        </div>
    );
}

function ConsolePanel({ logs }: { logs: { id: number, message: string, time: string }[] }) {
    return (
        <div className="fixed bottom-4 left-4 w-64 h-48 bg-zinc-950/90 text-zinc-300 p-2 rounded-md text-xs font-mono z-50 border border-zinc-800 shadow-xl flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-1 mb-1 text-zinc-500 uppercase tracking-tighter text-[10px]">
                <span>Console Log</span>
                <span>Active</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
                {logs.length === 0 && <div className="text-zinc-600 italic">No activity recorded...</div>}
                {logs.map(log => (
                    <div key={log.id} className="flex gap-2 leading-tight border-b border-zinc-900/50 pb-0.5">
                        <span className="text-zinc-500 shrink-0">[{log.time}]</span>
                        <span className="break-all">{log.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
