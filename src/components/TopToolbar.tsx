import React, { useState } from 'react';
import {
  DrawingTool,
  FtthComponentType,
  ProjectSettings,
  WorkspaceMode,
} from '../types/ftth';
import {
  Copy,
  FileDown,
  FolderOpen,
  Grid,
  Magnet,
  Map as MapIcon,
  Network,
  Redo2,
  Ruler,
  Save,
  Settings,
  Sparkles,
  Sun,
  Moon,
  Undo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronDown,
} from 'lucide-react';

interface TopToolbarProps {
  projectName: string;
  workspaceMode: WorkspaceMode;
  settings: ProjectSettings;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  darkMode: boolean;
  onNewBlank: () => void;
  onLoadSample: () => void;
  onOpenProjectsModal: () => void;
  onSaveToServer: () => void;
  onImportProjectFile: (file: File) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onToggleWorkspaceMode: (m: WorkspaceMode) => void;
  onUpdateSettings: (patch: Partial<ProjectSettings>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onToggleDarkMode: () => void;
  onSelectTool: (t: DrawingTool) => void;
  onInsertComponent: (t: FtthComponentType) => void;
  onOpenAutoDesign: () => void;
  onValidateNetwork: () => void;
  onAlign: (m: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onOpenSettingsModal: () => void;
  onExportJson: () => void;
  onOpenPdfModal: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onExportDxf: () => void;
  onExportGeoJson: () => void;
  onExportKml: () => void;
}

type MenuKey =
  | 'file'
  | 'edit'
  | 'view'
  | 'draw'
  | 'insert'
  | 'network'
  | 'tools'
  | 'settings'
  | 'export'
  | null;

export const TopToolbar: React.FC<TopToolbarProps> = ({
  projectName,
  workspaceMode,
  settings,
  zoom,
  canUndo,
  canRedo,
  darkMode,
  onNewBlank,
  onLoadSample,
  onOpenProjectsModal,
  onSaveToServer,
  onImportProjectFile,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onDelete,
  onSelectAll,
  onGroup,
  onUngroup,
  onToggleWorkspaceMode,
  onUpdateSettings,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onToggleDarkMode,
  onSelectTool,
  onInsertComponent,
  onOpenAutoDesign,
  onValidateNetwork,
  onAlign,
  onOpenSettingsModal,
  onExportJson,
  onOpenPdfModal,
  onExportSvg,
  onExportPng,
  onExportDxf,
  onExportGeoJson,
  onExportKml,
}) => {
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);

  const barBg = darkMode
    ? 'bg-[#0F141E] border-slate-800 text-slate-200'
    : 'bg-white border-slate-200 text-slate-800';
  const menuBg = darkMode
    ? 'bg-[#161D2B] border-slate-700 text-slate-200'
    : 'bg-white border-slate-200 text-slate-800';
  const itemHover = darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100';

  const MenuItem = ({
    label,
    shortcut,
    onClick,
  }: {
    label: string;
    shortcut?: string;
    onClick: () => void;
  }) => (
    <button
      onClick={() => {
        onClick();
        setOpenMenu(null);
      }}
      className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left whitespace-nowrap ${itemHover}`}
    >
      <span>{label}</span>
      {shortcut && <span className="ml-6 text-[10px] font-mono text-slate-400">{shortcut}</span>}
    </button>
  );

  const menus: Array<{ key: Exclude<MenuKey, null>; label: string }> = [
    { key: 'file', label: 'File' },
    { key: 'edit', label: 'Edit' },
    { key: 'view', label: 'View' },
    { key: 'draw', label: 'Draw' },
    { key: 'insert', label: 'Insert' },
    { key: 'network', label: 'Network' },
    { key: 'tools', label: 'Tools' },
    { key: 'settings', label: 'Settings' },
    { key: 'export', label: 'Export' },
  ];

  return (
    <header
      className={`shrink-0 border-b select-none z-40 relative ${barBg}`}
      onMouseLeave={() => setOpenMenu(null)}
    >
      {/* Row 1: CAD Menu Bar + Brand + Workspace Switcher */}
      <div className="h-10 px-3 flex items-center justify-between gap-4 border-b border-inherit">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-bold tracking-tight whitespace-nowrap">
              FiberCAD Studio
            </span>
          </div>

          <nav className="flex items-center gap-0.5">
            {menus.map((m) => (
              <div key={m.key} className="relative">
                <button
                  onClick={() => setOpenMenu(openMenu === m.key ? null : m.key)}
                  onMouseEnter={() => {
                    if (openMenu !== null) setOpenMenu(m.key);
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                    openMenu === m.key ? 'bg-sky-600 text-white' : itemHover
                  }`}
                >
                  {m.label}
                </button>

                {openMenu === m.key && (
                  <div
                    className={`absolute left-0 top-full mt-0.5 w-56 rounded-md border shadow-xl py-1 z-50 ${menuBg}`}
                  >
                    {m.key === 'file' && (
                      <>
                        <MenuItem label="New Blank Drawing" onClick={onNewBlank} />
                        <MenuItem label="Load Sample FTTH Network" onClick={onLoadSample} />
                        <div className="my-1 border-t border-slate-700/40" />
                        <MenuItem label="Save Project to Workspace" shortcut="Ctrl+S" onClick={onSaveToServer} />
                        <MenuItem label="Open Saved Projects..." onClick={onOpenProjectsModal} />
                        <label className={`w-full flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer ${itemHover}`}>
                          <span>Import .fibercad.json...</span>
                          <input
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) onImportProjectFile(f);
                              e.target.value = '';
                              setOpenMenu(null);
                            }}
                          />
                        </label>
                      </>
                    )}

                    {m.key === 'edit' && (
                      <>
                        <MenuItem label="Undo" shortcut="Ctrl+Z" onClick={onUndo} />
                        <MenuItem label="Redo" shortcut="Ctrl+Y" onClick={onRedo} />
                        <div className="my-1 border-t border-slate-700/40" />
                        <MenuItem label="Copy" shortcut="Ctrl+C" onClick={onCopy} />
                        <MenuItem label="Paste" shortcut="Ctrl+V" onClick={onPaste} />
                        <MenuItem label="Select All" shortcut="Ctrl+A" onClick={onSelectAll} />
                        <MenuItem label="Delete Selected" shortcut="Del" onClick={onDelete} />
                        <div className="my-1 border-t border-slate-700/40" />
                        <MenuItem label="Group Objects" onClick={onGroup} />
                        <MenuItem label="Ungroup Objects" onClick={onUngroup} />
                      </>
                    )}

                    {m.key === 'view' && (
                      <>
                        <MenuItem label="Schematic CAD Mode" onClick={() => onToggleWorkspaceMode('schematic')} />
                        <MenuItem label="GIS Map Mode (Leaflet)" onClick={() => onToggleWorkspaceMode('gis')} />
                        <div className="my-1 border-t border-slate-700/40" />
                        <MenuItem
                          label={`${settings.showGrid ? '✓ ' : ''}Show CAD Grid`}
                          onClick={() => onUpdateSettings({ showGrid: !settings.showGrid })}
                        />
                        <MenuItem
                          label={`${settings.snapToGrid ? '✓ ' : ''}Snap to Grid`}
                          onClick={() => onUpdateSettings({ snapToGrid: !settings.snapToGrid })}
                        />
                        <MenuItem
                          label={`${settings.showRulers ? '✓ ' : ''}Show Rulers`}
                          onClick={() => onUpdateSettings({ showRulers: !settings.showRulers })}
                        />
                        <MenuItem
                          label={`${settings.showCableLabels ? '✓ ' : ''}Show Cable Labels`}
                          onClick={() => onUpdateSettings({ showCableLabels: !settings.showCableLabels })}
                        />
                        <MenuItem
                          label={`${settings.showPortLabels ? '✓ ' : ''}Show Port Labels`}
                          onClick={() => onUpdateSettings({ showPortLabels: !settings.showPortLabels })}
                        />
                        <MenuItem
                          label={`${settings.showPortOpticalDbm !== false ? '✓ ' : ''}Show Port Optical dBm`}
                          onClick={() =>
                            onUpdateSettings({
                              showPortOpticalDbm: settings.showPortOpticalDbm === false,
                            })
                          }
                        />
                        <div className="my-1 border-t border-slate-700/40" />
                        <MenuItem label="Zoom In" onClick={onZoomIn} />
                        <MenuItem label="Zoom Out" onClick={onZoomOut} />
                        <MenuItem label="Zoom to Fit" onClick={onZoomFit} />
                        <MenuItem
                          label={darkMode ? 'Switch to Light Drafting' : 'Switch to Dark CAD'}
                          onClick={onToggleDarkMode}
                        />
                      </>
                    )}

                    {m.key === 'draw' && (
                      <>
                        <MenuItem label="Select / Marquee" shortcut="V" onClick={() => onSelectTool('select')} />
                        <MenuItem label="Pan Canvas" shortcut="H" onClick={() => onSelectTool('pan')} />
                        <MenuItem label="Draw Fiber Cable" shortcut="F" onClick={() => onSelectTool('cable')} />
                        <MenuItem label="Measure Distance" shortcut="M" onClick={() => onSelectTool('measure')} />
                        <MenuItem label="Place Text Label" onClick={() => onSelectTool('text')} />
                        <MenuItem label="Place Engineering Note" onClick={() => onSelectTool('note')} />
                      </>
                    )}

                    {m.key === 'insert' && (
                      <>
                        <MenuItem label="OLT (GPON / XGS-PON)" onClick={() => onInsertComponent('olt')} />
                        <MenuItem label="ODF (Distribution Frame)" onClick={() => onInsertComponent('odf')} />
                        <MenuItem label="Fiber Joint Closure" onClick={() => onInsertComponent('joint_closure')} />
                        <MenuItem label="PLC Splitter 1:8" onClick={() => onInsertComponent('splitter_1_8')} />
                        <MenuItem label="PLC Splitter 1:16" onClick={() => onInsertComponent('splitter_1_16')} />
                        <MenuItem label="PLC Splitter 1:32" onClick={() => onInsertComponent('splitter_1_32')} />
                        <MenuItem label="Ratio Coupler (80:20 / 90:10)" onClick={() => onInsertComponent('ratio_coupler')} />
                        <MenuItem label="FAT (Access Terminal)" onClick={() => onInsertComponent('fat')} />
                        <MenuItem label="FDT (Street Cabinet)" onClick={() => onInsertComponent('fdt')} />
                        <MenuItem label="Wi-Fi ONT / ONU" onClick={() => onInsertComponent('wifi_ont')} />
                      </>
                    )}

                    {m.key === 'network' && (
                      <>
                        <MenuItem label="Auto FTTH Network Designer..." onClick={onOpenAutoDesign} />
                        <MenuItem label="Validate All Optical Links" onClick={onValidateNetwork} />
                      </>
                    )}

                    {m.key === 'tools' && (
                      <>
                        <MenuItem label="Align Left" onClick={() => onAlign('left')} />
                        <MenuItem label="Align Center" onClick={() => onAlign('center')} />
                        <MenuItem label="Align Right" onClick={() => onAlign('right')} />
                        <MenuItem label="Align Top" onClick={() => onAlign('top')} />
                        <MenuItem label="Align Middle" onClick={() => onAlign('middle')} />
                        <MenuItem label="Align Bottom" onClick={() => onAlign('bottom')} />
                      </>
                    )}

                    {m.key === 'settings' && (
                      <>
                        <MenuItem label="Project, Scale & Optical Settings..." onClick={onOpenSettingsModal} />
                      </>
                    )}

                    {m.key === 'export' && (
                      <>
                        <MenuItem label="PDF Print Layout (with Title Block)..." onClick={onOpenPdfModal} />
                        <MenuItem label="Native Project (.fibercad.json)" onClick={onExportJson} />
                        <MenuItem label="Vector Schematic (.svg)" onClick={onExportSvg} />
                        <MenuItem label="High-Res Image (.png)" onClick={onExportPng} />
                        <MenuItem label="AutoCAD Drawing (.dxf)" onClick={onExportDxf} />
                        <div className="my-1 border-t border-slate-700/40" />
                        <MenuItem label="GeoJSON (.geojson)" onClick={onExportGeoJson} />
                        <MenuItem label="Google Earth KML (.kml)" onClick={onExportKml} />
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Workspace Mode Segmented Switch & Primary Export */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden lg:inline text-xs font-mono-tabular text-slate-400 truncate max-w-[180px]">
            {projectName}
          </span>

          <div className={`flex items-center p-0.5 rounded-md border ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-100 border-slate-300'}`}>
            <button
              onClick={() => onToggleWorkspaceMode('schematic')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                workspaceMode === 'schematic'
                  ? 'bg-sky-600 text-white'
                  : darkMode
                  ? 'text-slate-300 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              Schematic CAD
            </button>
            <button
              onClick={() => onToggleWorkspaceMode('gis')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                workspaceMode === 'gis'
                  ? 'bg-sky-600 text-white'
                  : darkMode
                  ? 'text-slate-300 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              GIS Map
            </button>
          </div>

          <button
            onClick={onOpenAutoDesign}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Auto Design
          </button>
        </div>
      </div>

      {/* Row 2: Compact Engineering Action Strip */}
      <div className="h-9 px-3 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1">
          <button
            onClick={onSaveToServer}
            title="Save Project"
            className={`flex items-center gap-1 px-2 py-1 rounded whitespace-nowrap ${itemHover}`}
          >
            <Save className="w-3.5 h-3.5 text-sky-400" />
            <span>Save</span>
          </button>
          <button
            onClick={onOpenProjectsModal}
            title="Open Saved Projects"
            className={`flex items-center gap-1 px-2 py-1 rounded whitespace-nowrap ${itemHover}`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Open</span>
          </button>
          <div className="w-px h-4 bg-slate-700/40 mx-1" />
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={`p-1.5 rounded ${canUndo ? itemHover : 'opacity-35 cursor-not-allowed'}`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className={`p-1.5 rounded ${canRedo ? itemHover : 'opacity-35 cursor-not-allowed'}`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onCopy} title="Copy" className={`p-1.5 rounded ${itemHover}`}>
            <Copy className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-slate-700/40 mx-1" />
          <button
            onClick={() => onUpdateSettings({ showGrid: !settings.showGrid })}
            title="Toggle Grid"
            className={`flex items-center gap-1 px-2 py-1 rounded whitespace-nowrap ${
              settings.showGrid ? 'bg-sky-600/20 text-sky-400' : itemHover
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Grid</span>
          </button>
          <button
            onClick={() => onUpdateSettings({ snapToGrid: !settings.snapToGrid })}
            title="Toggle Snap"
            className={`flex items-center gap-1 px-2 py-1 rounded whitespace-nowrap ${
              settings.snapToGrid ? 'bg-sky-600/20 text-sky-400' : itemHover
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>Snap</span>
          </button>
          <button
            onClick={() => onUpdateSettings({ showRulers: !settings.showRulers })}
            title="Toggle Rulers"
            className={`flex items-center gap-1 px-2 py-1 rounded whitespace-nowrap ${
              settings.showRulers ? 'bg-sky-600/20 text-sky-400' : itemHover
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Rulers</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={onZoomOut} title="Zoom Out" className={`p-1.5 rounded ${itemHover}`}>
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="w-12 text-center font-mono-tabular text-[11px]">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={onZoomIn} title="Zoom In" className={`p-1.5 rounded ${itemHover}`}>
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button onClick={onZoomFit} title="Zoom to Fit" className={`p-1.5 rounded ${itemHover}`}>
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-slate-700/40 mx-1" />
          <button
            onClick={onOpenSettingsModal}
            title="Project & Scale Settings"
            className={`p-1.5 rounded ${itemHover}`}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleDarkMode}
            title="Toggle Light / Dark Drafting Theme"
            className={`p-1.5 rounded ${itemHover}`}
          >
            {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onOpenPdfModal}
            className={`flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-medium whitespace-nowrap ${
              darkMode
                ? 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
                : 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800'
            }`}
          >
            <FileDown className="w-3.5 h-3.5 text-sky-400" />
            <span>Export PDF</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        </div>
      </div>
    </header>
  );
};
