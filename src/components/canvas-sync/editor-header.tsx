
'use client';

import {
  FileDown,
  FilePlus2,
  Github,
  HardDriveDownload,
  Paintbrush,
  User,
  LogOut,
  Settings,
  Undo2,
  Redo2,
  FolderOpen,
  History,
  Save,
  FileUp,
  FileX,
  ClipboardCopy,
  ClipboardPaste,
  Scissors,
  ChevronsRight,
  Trash2,
  Crop,
  PaintBucket,
  Grid3x3,
  Ruler,
  Eye,
  FlipHorizontal,
  FlipVertical,
  Lock,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Maximize,
  LassoSelect,
  RectangleHorizontal,
  FlipHorizontal2,
  MinusSquare,
  Palette,
  SunMoon,
  Scaling,
  Infinity as InfinityIcon,
  Layers,
  Combine,
  Copy,
  Merge,
  RefreshCcw,
  Minus,
  Plus,
  SwatchBook,
  Thermometer,
  Snowflake,
  ArrowRightLeft,
  Moon,
  Sun,
  Droplet,
  Languages,
  MousePointer2,
  Hand,
  Tablet,
  PenTool,
  MousePointer,
  Touchpad,
  Disc,
  Focus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu';
import { Separator } from '../ui/separator';
import React from 'react';
import { useToast } from '@/hooks/use-toast';
import { Logo } from './logo';
import { type RecentProject } from './main-editor';
import { useI18n } from '@/lib/i18n';

interface EditorHeaderProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
  onFill: () => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  showRulers: boolean;
  setShowRulers: (show: boolean) => void;
  lockView: boolean;
  setLockView: (lock: boolean) => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReCenter: () => void;
  onDeselect: () => void;
  onSelectAll: () => void;
  onInvertSelection: () => void;
  isSelectionInverted: boolean;
  onAddLayer: () => void;
  onMergeLayerDown: () => void;
  onDuplicateLayer: () => void;
  onDeleteLayer: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  canCopy: boolean;
  canPaste: boolean;
  recentProjects: RecentProject[];
  onOpenRecent: (projectData: string) => void;
  onOpenCanvasBackgroundDialog: () => void;
  onOpenUnitResolutionDialog: () => void;
  decreaseBrushSize: () => void;
  increaseBrushSize: () => void;
  setDefaultColors: () => void;
  swapColors: () => void;
  resetAllBrushes: () => void;
  adjustColorLightness: (amount: number) => void;
  adjustColorSaturation: (amount: number) => void;
  adjustColorHue: (amount: number) => void;
  onClearHistory: () => void;
  onNewFromHistory: () => void;
  onOpenWindowOpacityDialog: () => void;
  onOpenPenMappingDialog: () => void;
  onOpenPenPressureDialog: () => void;
  onOpenMultiTouchDialog: () => void;
  onOpenRightSideButtonDialog: () => void;
  onOpenWheelDialScrollerDialog: () => void;
  onOpenLanguageDialog: () => void;
  onActivateTransform: () => void;
  onActivateCrop: () => void;
  onOpenHistoryLimitDialog: () => void;
  showTool: boolean;
  showBrushList: boolean;
  showBrushOptions: boolean;
  showColor: boolean;
  showLayers: boolean;
  showView: boolean;
  showPerformance: boolean;
  showConsole: boolean;
  showExportbar: boolean;
  showLine: boolean;
  showSelect: boolean;
  showChannels: boolean;
  activeChannel: 'all' | 'red' | 'green' | 'blue' | 'alpha';
  setActiveChannel: (mode: 'all' | 'red' | 'green' | 'blue' | 'alpha') => void;
  isSimulatingPressure: boolean;
  onToggleSimulatePressure: () => void;
  onTogglePanel: (panel: string) => void;
  onCloseAllPanels: () => void;
  leftHanded: boolean;
  toggleLeftHanded: () => void;
  onOpenBrightnessContrast: () => void;
  onOpenHueSaturation: () => void;
}

export function EditorHeader({ 
    onUndo, onRedo, canUndo, canRedo, 
    onNew, onOpen, onSave, onSaveAs, onExport, onImport, onClear, onFill,
    showGrid, setShowGrid, showRulers, setShowRulers,
    lockView, setLockView,
    onFlipHorizontal, onFlipVertical, onRotateLeft, onRotateRight,
    onZoomIn, onZoomOut, onReCenter, onDeselect, onSelectAll,
    onInvertSelection, isSelectionInverted,
    onAddLayer, onMergeLayerDown, onDuplicateLayer, onDeleteLayer,
    onCopy, onCut, onPaste, canCopy, canPaste,
    recentProjects, onOpenRecent,
    onOpenCanvasBackgroundDialog,
    onOpenUnitResolutionDialog,
    decreaseBrushSize,
    increaseBrushSize,
    setDefaultColors,
    swapColors,
    resetAllBrushes,
    adjustColorLightness,
    adjustColorSaturation,
    adjustColorHue,
    onClearHistory,
    onNewFromHistory,
    onOpenWindowOpacityDialog,
    onOpenPenMappingDialog,
    onOpenPenPressureDialog,
    onOpenMultiTouchDialog, onOpenRightSideButtonDialog, onOpenWheelDialScrollerDialog,
    onOpenLanguageDialog, onActivateTransform, onActivateCrop,
    onOpenHistoryLimitDialog,
    showTool, showBrushList, showBrushOptions, showColor, showLayers, showView, showPerformance,
    showConsole, showExportbar,    showLine,
    showSelect,
    showChannels,
    activeChannel,
    setActiveChannel,
    onTogglePanel,
 onCloseAllPanels,
    leftHanded,
    toggleLeftHanded,
    onOpenBrightnessContrast,
    onOpenHueSaturation,
    isSimulatingPressure,
    onToggleSimulatePressure,
}: EditorHeaderProps) {
  const [autoSave, setAutoSave] = React.useState(true);
  const [fullScreen, setFullScreen] = React.useState(false);


  const { toast } = useToast();
  const t = useI18n();

  const notImplemented = () => {
    toast({
      title: t('notImplemented.title'),
      description: t('notImplemented.description'),
    });
  };
  
  const showToastForPanel = (panelName: string, tip: string) => {
    toast({
        title: `${panelName} Panel`,
        description: tip,
    });
  }

  const handleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setFullScreen(true)).catch(notImplemented);
    } else {
      document.exitFullscreen().then(() => setFullScreen(false));
    }
  };
  
  const handleOpenMostRecent = () => {
      if (recentProjects.length > 0) {
          onOpenRecent(recentProjects[0].data);
      } else {
          toast({
              title: t('noRecentProjects.title'),
              description: t('noRecentProjects.description'),
          });
      }
  }

  React.useEffect(() => {
    const onFullScreenChange = () => {
      setFullScreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullScreenChange);
  }, []);

  return (
    <header className="flex h-14 items-center border-b bg-card px-4 shrink-0">
      <div className="flex items-center gap-2 mr-4">
        <Logo />
      </div>
      <div className={`flex items-center gap-1 ${leftHanded ? 'ml-auto' : ''}`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {t('menu.file')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onClick={onNew}>
                <FilePlus2 className="mr-2" />
                <span>{t('file.new')}</span>
                <DropdownMenuShortcut>Ctrl+N</DropdownMenuShortcut>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={onOpen}>
                <FolderOpen className="mr-2" />
                <span>{t('file.open')}</span>
                <DropdownMenuShortcut>Ctrl+O</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <History className="mr-2" />
                  <span>{t('file.openRecent')}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {recentProjects.length > 0 ? (
                    recentProjects.map((project, index) => (
                      <DropdownMenuItem key={index} onClick={() => onOpenRecent(project.data)}>
                        {project.name}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem disabled>{t('file.noRecentProjects')}</DropdownMenuItem>
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={onSave}>
                <Save className="mr-2" />
                <span>{t('file.save')}</span>
                <DropdownMenuShortcut>Ctrl+S</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSaveAs}>
                <HardDriveDownload className="mr-2" />
                <span>{t('file.saveAs')}</span>
                <DropdownMenuShortcut>Shift+Ctrl+S</DropdownMenuShortcut>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={onImport}>
                <FileUp className="mr-2" />
                <span>{t('file.import')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExport}>
                <FileDown className="mr-2" />
                <span>{t('file.exportAsPng')}</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={handleOpenMostRecent}>
                {t('file.openMostRecent')}
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onNew}>
                <FileX className="mr-2" />
                <span>{t('file.close')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {t('menu.edit')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onClick={onUndo} disabled={!canUndo}>
                <Undo2 className="mr-2" />
                <span>{t('edit.undo')}</span>
                <DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRedo} disabled={!canRedo}>
                <Redo2 className="mr-2" />
                <span>{t('edit.redo')}</span>
                <DropdownMenuShortcut>Shift+Ctrl+Z</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onCut} disabled={!canCopy}>
                <Scissors className="mr-2" />
                <span>{t('edit.cut')}</span>
                <DropdownMenuShortcut>Ctrl+X</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopy} disabled={!canCopy}>
                <ClipboardCopy className="mr-2" />
                <span>{t('edit.copy')}</span>
                <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onPaste} disabled={!canPaste}>
                <ClipboardPaste className="mr-2" />
                <span>{t('edit.paste')}</span>
                <DropdownMenuShortcut>Ctrl+V</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
               <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ChevronsRight className="mr-2" />
                  <span>{t('edit.adjust')}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={onOpenBrightnessContrast}>{t('edit.brightnessContrast')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={onOpenHueSaturation}>{t('edit.hueSaturation')}</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
               <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ChevronsRight className="mr-2" />
                  <span>{t('edit.transform')}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={onActivateTransform}>{t('edit.scale')}</DropdownMenuItem>
                  <DropdownMenuItem onClick={onActivateTransform}>{t('edit.rotate')}</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
               <DropdownMenuItem onClick={onFill}>
                <PaintBucket className="mr-2" />
                <span>{t('edit.fill')}</span>
                <DropdownMenuShortcut>Insert</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onClear}>
                <Trash2 className="mr-2" />
                <span>{t('edit.clear')}</span>
                <DropdownMenuShortcut>Delete</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onActivateCrop}>
                <Crop className="mr-2" />
                <span>{t('edit.crop')}</span>
                <DropdownMenuShortcut>Ctrl+Delete</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {t('menu.view')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuCheckboxItem checked={showGrid} onCheckedChange={setShowGrid}>
                 <Grid3x3 className="mr-2" />
                <span>{t('view.showGrid')}</span>
                <DropdownMenuShortcut>Ctrl+G</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showRulers} onCheckedChange={setShowRulers}>
                <Ruler className="mr-2" />
                <span>{t('view.showRulers')}</span>
                <DropdownMenuShortcut>Ctrl+R</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showChannels} onCheckedChange={() => onTogglePanel('channels')}>
                <Eye className="mr-2" />
                <span>{t('view.showChannel')}</span>
                <DropdownMenuShortcut>Ctrl+P</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onFlipHorizontal}>
                <FlipHorizontal className="mr-2" />
                <span>{t('view.flipHorizontal')}</span>
                <DropdownMenuShortcut>F</DropdownMenuShortcut>
              </DropdownMenuItem>
               <DropdownMenuItem onClick={onFlipVertical}>
                <FlipVertical className="mr-2" />
                <span>{t('view.flipVertical')}</span>
                <DropdownMenuShortcut>Shift+F</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuCheckboxItem checked={lockView} onCheckedChange={setLockView}>
                <Lock className="mr-2" />
                <span>{t('view.lockView')}</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onZoomIn}>
                <ZoomIn className="mr-2" />
                <span>{t('view.zoomIn')}</span>
                <DropdownMenuShortcut>Ctrl+=</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onZoomOut}>
                <ZoomOut className="mr-2" />
                <span>{t('view.zoomOut')}</span>
                <DropdownMenuShortcut>Ctrl+-</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onReCenter}>
                <Focus className="mr-2" />
                <span>{t('view.recenter')}</span>
                <DropdownMenuShortcut>Ctrl+0</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRotateLeft}>
                <RotateCcw className="mr-2" />
                <span>{t('view.rotateLeft')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRotateRight}>
                <RotateCw className="mr-2" />
                <span>{t('view.rotateRight')}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={fullScreen} onCheckedChange={handleFullScreen}>
                <Maximize className="mr-2" />
                <span>{t('view.fullScreen')}</span>
                <DropdownMenuShortcut>F11</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {t('menu.select')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onClick={onSelectAll}>
                <RectangleHorizontal className="mr-2" />
                <span>{t('select.selectAllRect')}</span>
                <DropdownMenuShortcut>Ctrl+A</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSelectAll}>
                <LassoSelect className="mr-2" />
                <span>{t('select.selectAllLasso')}</span>
                <DropdownMenuShortcut>Shift+Ctrl+A</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={isSelectionInverted} onCheckedChange={() => onInvertSelection()}>
                <FlipHorizontal2 className="mr-2" />
                <span>{t('select.invertSelection')}</span>
                <DropdownMenuShortcut>Ctrl+I</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDeselect}>
                <MinusSquare className="mr-2" />
                <span>{t('select.deselect')}</span>
                <DropdownMenuShortcut>Ctrl+D</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {t('menu.canvas')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onClick={onOpenCanvasBackgroundDialog}>
                <Palette className="mr-2" />
                <span>{t('canvas.background')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenUnitResolutionDialog}>
                <Scaling className="mr-2" />
                <span>{t('canvas.unitResolution')}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onClear}>
                <Trash2 className="mr-2" />
                <span>{t('canvas.clearCanvas')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {t('menu.layer')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuItem onClick={onAddLayer}>
                    <Layers className="mr-2" />
                    <span>{t('layer.newLayer')}</span>
                    <DropdownMenuShortcut>Shift+Ctrl+N</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMergeLayerDown}>
                    <Combine className="mr-2" />
                    <span>{t('layer.mergeDown')}</span>
                    <DropdownMenuShortcut>Ctrl+E</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicateLayer}>
                    <Copy className="mr-2" />
                    <span>{t('layer.duplicate')}</span>
                    <DropdownMenuShortcut>Ctrl+J</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDeleteLayer}>
                    <Trash2 className="mr-2" />
                    <span>{t('layer.delete')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onClear}>
                    <Trash2 className="mr-2" />
                    <span>{t('layer.clear')}</span>
                    <DropdownMenuShortcut>Ctrl+K</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={notImplemented}>
                    <Layers className="mr-2" />
                    <span>{t('layer.selectAll')}</span>
                    <DropdownMenuShortcut>Ctrl+Alt+A</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={notImplemented}>
                    <Merge className="mr-2" />
                    <span>{t('layer.mergeAll')}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {t('menu.paint')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onClick={resetAllBrushes}>
                <RefreshCcw className="mr-2" />
                <span>{t('paint.resetAllBrushes')}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={decreaseBrushSize}>
                <Minus className="mr-2" />
                <span>{t('paint.smallerBrush')}</span>
                <DropdownMenuShortcut>[</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={increaseBrushSize}>
                <Plus className="mr-2" />
                <span>{t('paint.biggerBrush')}</span>
                <DropdownMenuShortcut>]</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={setDefaultColors}>
                <SwatchBook className="mr-2" />
                <span>{t('paint.defaultColors')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={swapColors}>
                <ArrowRightLeft className="mr-2" />
                <span>{t('paint.swapColors')}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => adjustColorHue(-15)}>
                <Snowflake className="mr-2" />
                <span>{t('paint.cooler')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => adjustColorHue(15)}>
                <Thermometer className="mr-2" />
                <span>{t('paint.warmer')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {t('menu.history')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onClick={onNewFromHistory}>
                {t('history.newFromHistory')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onClearHistory}>
                {t('history.clearHistory')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenHistoryLimitDialog}>
                {t('history.setHistoryLimit')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {t('menu.panel')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>{t('panel.showHide')}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={showConsole} onCheckedChange={() => onTogglePanel('console')}>
                {t('panel.showConsole')}
                <DropdownMenuShortcut>Ctrl+`</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showTool} onCheckedChange={() => onTogglePanel('tool')}>
                {t('panel.showTool')}
                <DropdownMenuShortcut>F2</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showLine} onCheckedChange={() => onTogglePanel('line')}>
                {t('panel.showLine')}
                <DropdownMenuShortcut>F3</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showBrushList} onCheckedChange={() => onTogglePanel('brushList')}>
                {t('panel.showBrushList')}
                <DropdownMenuShortcut>F4</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showBrushOptions} onCheckedChange={() => onTogglePanel('brushOptions')}>
                {t('panel.showBrushOptions')}
                <DropdownMenuShortcut>F5</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showColor} onCheckedChange={() => onTogglePanel('color')}>
                {t('panel.showColor')}
                <DropdownMenuShortcut>F6</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showLayers} onCheckedChange={() => onTogglePanel('layers')}>
                {t('panel.showLayers')}
                <DropdownMenuShortcut>F7</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showSelect} onCheckedChange={() => onTogglePanel('select')}>
                {t('panel.showSelect')}
              </DropdownMenuCheckboxItem>
               <DropdownMenuCheckboxItem checked={showView} onCheckedChange={() => onTogglePanel('view')}>
                {t('panel.showView')}
              </DropdownMenuCheckboxItem>
               <DropdownMenuCheckboxItem checked={showExportbar} onCheckedChange={() => onTogglePanel('exportbar')}>
                {t('panel.showExportbar')}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showPerformance} onCheckedChange={() => onTogglePanel('performance')}>
                {t('panel.showPerformance')}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onCloseAllPanels}>{t('panel.closeAll')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {t('menu.settings')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem onClick={onOpenWindowOpacityDialog}>
                <Eye className="mr-2" />
                <span>{t('settings.windowOpacity')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenPenMappingDialog}>
                <PenTool className="mr-2" />
                <span>{t('settings.penMapping')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenPenPressureDialog}>
                <Tablet className="mr-2" />
                <span>{t('settings.penPressure')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenMultiTouchDialog}>
                <Touchpad className="mr-2" />
                <span>{t('settings.multiTouch')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenRightSideButtonDialog}>
                <MousePointer className="mr-2" />
                <span>{t('settings.rightSideButton')}</span>
              </DropdownMenuItem>
               <DropdownMenuItem onClick={onOpenWheelDialScrollerDialog}>
                <Disc className="mr-2" />
                <span>{t('settings.wheelDialScroller')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenLanguageDialog}>
                <Languages className="mr-2" />
                <span>{t('settings.language')}</span>
                <DropdownMenuShortcut>🇬🇧</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={leftHanded} onCheckedChange={toggleLeftHanded}>
                <FlipHorizontal className="mr-2" />
                <span>{t('settings.flipToolbar')}</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={isSimulatingPressure} onCheckedChange={onToggleSimulatePressure}>
                <MousePointer2 className="mr-2" />
                <span>{t('settings.simulatePressure')}</span>
                <DropdownMenuShortcut>Ctrl+M</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      <div className={`flex items-center gap-4 ${leftHanded ? 'ml-4' : 'ml-auto'}`}>
        <Button variant="ghost" size="icon" onClick={handleFullScreen} aria-label={t('view.toggleFullScreen')}>
          <Maximize />
        </Button>
      </div>
    </header>
  );
}
