import React, { useMemo, useState } from 'react';
import {
  CableToolConfig,
  CableType,
  CadLayer,
  ComponentCategory,
  DrawingTool,
  FtthComponentType,
  LayerId,
  LineRoutingStyle,
  RouteMethod,
  WorkspaceMode,
} from '../types/ftth';
import {
  CABLE_TYPE_DEFAULTS,
  CATEGORY_LABELS,
  COMPONENT_CATALOG,
} from '../data/componentCatalog';
import { TelecomSymbol } from './TelecomSymbol';
import {
  Cable,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Hand,
  Layers,
  Lock,
  MousePointer2,
  Ruler,
  Search,
  StickyNote,
  Type,
  Unlock,
} from 'lucide-react';

interface LeftToolboxProps {
  activeTool: DrawingTool;
  workspaceMode: WorkspaceMode;
  cableConfig: CableToolConfig;
  layers: CadLayer[];
  darkMode: boolean;
  onSelectTool: (t: DrawingTool) => void;
  onUpdateCableConfig: (patch: Partial<CableToolConfig>) => void;
  onInsertComponent: (type: FtthComponentType) => void;
  onUpdateLayer: (id: LayerId, patch: Partial<CadLayer>) => void;
}

const CATEGORIES: ComponentCategory[] = [
  'olt_co',
  'fiber_cables',
  'passive',
  'distribution',
  'customer',
];

export const LeftToolbox: React.FC<LeftToolboxProps> = ({
  activeTool,
  workspaceMode,
  cableConfig,
  layers,
  darkMode,
  onSelectTool,
  onUpdateCableConfig,
  onInsertComponent,
  onUpdateLayer,
}) => {
  const [tab, setTab] = useState<'library' | 'cable' | 'layers'>('library');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<ComponentCategory, boolean>>({
    olt_co: true,
    fiber_cables: false,
    passive: true,
    distribution: true,
    customer: true,
    annotation: false,
  });

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COMPONENT_CATALOG;
    return COMPONENT_CATALOG.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.shortCode.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [search]);

  const panelBg = darkMode ? 'bg-[#111620] border-slate-800' : 'bg-white border-slate-200';
  const subBg = darkMode ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-50 border-slate-200';
  const textMain = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textMuted = darkMode ? 'text-slate-400' : 'text-slate-500';

  const tools: Array<{ id: DrawingTool; label: string; icon: React.ReactNode }> = [
    { id: 'select', label: 'Select', icon: <MousePointer2 className="w-3.5 h-3.5" /> },
    { id: 'pan', label: 'Pan', icon: <Hand className="w-3.5 h-3.5" /> },
    { id: 'cable', label: 'Fiber', icon: <Cable className="w-3.5 h-3.5" /> },
    { id: 'measure', label: 'Measure', icon: <Ruler className="w-3.5 h-3.5" /> },
    { id: 'text', label: 'Text', icon: <Type className="w-3.5 h-3.5" /> },
    { id: 'note', label: 'Note', icon: <StickyNote className="w-3.5 h-3.5" /> },
  ];

  return (
    <aside className={`w-[272px] shrink-0 h-full border-r flex flex-col select-none ${panelBg}`}>
      {/* Quick Drawing Tools Grid */}
      <div className={`p-2 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className="grid grid-cols-3 gap-1">
          {tools.map((t) => {
            const active = activeTool === t.id;
            const tip =
              t.id === 'pan'
                ? 'Pan Canvas (H, Space+Drag, or Ctrl+Drag)'
                : t.id === 'select'
                ? 'Select / Marquee (V)'
                : t.id === 'cable'
                ? 'Draw Fiber Cable (F)'
                : t.id === 'measure'
                ? 'Measure Distance (M)'
                : t.label;
            return (
              <button
                key={t.id}
                onClick={() => onSelectTool(t.id)}
                title={tip}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-sky-600 text-white'
                    : darkMode
                    ? 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode Tabs */}
      <div className={`grid grid-cols-3 border-b text-[11px] font-medium ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <button
          onClick={() => setTab('library')}
          className={`py-2 text-center border-b-2 transition-colors ${
            tab === 'library'
              ? 'border-sky-500 text-sky-500'
              : `border-transparent ${textMuted} hover:${textMain}`
          }`}
        >
          Symbols
        </button>
        <button
          onClick={() => setTab('cable')}
          className={`py-2 text-center border-b-2 transition-colors ${
            tab === 'cable'
              ? 'border-sky-500 text-sky-500'
              : `border-transparent ${textMuted} hover:${textMain}`
          }`}
        >
          Cable Tool
        </button>
        <button
          onClick={() => setTab('layers')}
          className={`py-2 text-center border-b-2 transition-colors flex items-center justify-center gap-1 ${
            tab === 'layers'
              ? 'border-sky-500 text-sky-500'
              : `border-transparent ${textMuted} hover:${textMain}`
          }`}
        >
          <Layers className="w-3 h-3" />
          Layers
        </button>
      </div>

      {/* Tab 1: Component Library */}
      {tab === 'library' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className={`p-2 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
            <div className="relative">
              <Search className={`w-3.5 h-3.5 absolute left-2.5 top-2 ${textMuted}`} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search OLT, splitter, FAT, ONU..."
                className={`w-full pl-8 pr-2.5 py-1.5 text-xs rounded border focus:outline-none focus:border-sky-500 ${
                  darkMode
                    ? 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500'
                    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                }`}
              />
            </div>
            <p className={`mt-1.5 text-[10px] ${textMuted}`}>
              {workspaceMode === 'gis'
                ? 'Click any symbol below, then click on the map.'
                : 'Drag onto canvas or click symbol to insert.'}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
            {CATEGORIES.map((cat) => {
              const items = filteredCatalog.filter((c) => c.category === cat);
              if (items.length === 0) return null;
              const isOpen = search.trim().length > 0 || expanded[cat];
              return (
                <div key={cat} className={`rounded border ${subBg}`}>
                  <button
                    onClick={() => setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }))}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold ${textMain}`}
                  >
                    <span>{CATEGORY_LABELS[cat]}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-mono-tabular ${textMuted}`}>
                        {items.length}
                      </span>
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="grid grid-cols-2 gap-1 p-1.5 pt-0">
                      {items.map((item) => (
                        <button
                          key={item.type}
                          draggable={workspaceMode === 'schematic'}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/fibercad-type', item.type);
                          }}
                          onClick={() => onInsertComponent(item.type)}
                          title={item.description}
                          className={`flex flex-col items-center justify-center p-1.5 rounded border text-center transition-colors cursor-grab active:cursor-grabbing ${
                            darkMode
                              ? 'bg-slate-950/60 border-slate-800 hover:border-sky-500/60 hover:bg-slate-900'
                              : 'bg-white border-slate-200 hover:border-sky-500 hover:bg-sky-50/40'
                          }`}
                        >
                          <div className="h-8 flex items-center justify-center">
                            <TelecomSymbol
                              type={item.type}
                              width={40}
                              height={30}
                              darkMode={darkMode}
                            />
                          </div>
                          <span className={`mt-1 text-[10px] font-medium leading-tight line-clamp-1 ${textMain}`}>
                            {item.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Fiber Cable Drawing Tool Settings */}
      {tab === 'cable' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
          <div className={`p-2.5 rounded border ${subBg}`}>
            <div className={`font-semibold mb-1 ${textMain}`}>Active Fiber Cable Preset</div>
            <p className={`text-[11px] ${textMuted}`}>
              Applies to newly drawn cables in Schematic and GIS modes.
            </p>
            <button
              onClick={() => onSelectTool('cable')}
              className={`mt-2 w-full py-1.5 px-2.5 rounded text-xs font-medium transition-colors ${
                activeTool === 'cable'
                  ? 'bg-sky-600 text-white'
                  : 'bg-sky-600/20 text-sky-400 border border-sky-500/40 hover:bg-sky-600/30'
              }`}
            >
              {activeTool === 'cable' ? 'Fiber Cable Tool Active' : 'Activate Fiber Cable Tool'}
            </button>
          </div>

          <div className="space-y-2">
            <label className="block">
              <span className={`block text-[11px] mb-1 ${textMuted}`}>Cable Type</span>
              <select
                value={cableConfig.cableType}
                onChange={(e) => {
                  const nextType = e.target.value as CableType;
                  const def = CABLE_TYPE_DEFAULTS[nextType];
                  onUpdateCableConfig({
                    cableType: nextType,
                    color: def.color,
                    coreCapacity: def.cores,
                    routeType: def.routeType,
                    installationMethod: def.install,
                    fiberStandard: def.standard,
                  });
                }}
                className={`w-full px-2 py-1.5 rounded border text-xs ${
                  darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                {Object.entries(CABLE_TYPE_DEFAULTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={`block text-[11px] mb-1 ${textMuted}`}>Core Capacity</span>
                <select
                  value={cableConfig.coreCapacity}
                  onChange={(e) => onUpdateCableConfig({ coreCapacity: Number(e.target.value) })}
                  className={`w-full px-2 py-1.5 rounded border text-xs font-mono-tabular ${
                    darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  {[1, 2, 4, 6, 12, 24, 48, 96, 144, 288].map((n) => (
                    <option key={n} value={n}>
                      {n}F
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className={`block text-[11px] mb-1 ${textMuted}`}>Line Color</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={cableConfig.color}
                    onChange={(e) => onUpdateCableConfig({ color: e.target.value })}
                    className="w-8 h-7 rounded cursor-pointer bg-transparent border-0"
                  />
                  <span className={`text-[11px] font-mono-tabular ${textMain}`}>{cableConfig.color}</span>
                </div>
              </label>
            </div>

            <label className="block">
              <span className={`block text-[11px] mb-1 ${textMuted}`}>Route Type</span>
              <select
                value={cableConfig.routeType}
                onChange={(e) => onUpdateCableConfig({ routeType: e.target.value as RouteMethod })}
                className={`w-full px-2 py-1.5 rounded border text-xs ${
                  darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                <option value="underground">Underground Route</option>
                <option value="aerial">Aerial Route</option>
                <option value="building">Building / Riser Route</option>
                <option value="duct">Microduct / Sub-duct Route</option>
              </select>
            </label>

            <label className="block">
              <span className={`block text-[11px] mb-1 ${textMuted}`}>Line Routing Geometry</span>
              <select
                value={cableConfig.routingStyle}
                onChange={(e) => onUpdateCableConfig({ routingStyle: e.target.value as LineRoutingStyle })}
                className={`w-full px-2 py-1.5 rounded border text-xs ${
                  darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                <option value="orthogonal">Orthogonal (90° CAD)</option>
                <option value="straight">Straight Angled</option>
                <option value="curved">Curved Bezier</option>
              </select>
            </label>

            <label className="block">
              <span className={`block text-[11px] mb-1 ${textMuted}`}>Fiber Standard</span>
              <select
                value={cableConfig.fiberStandard}
                onChange={(e) =>
                  onUpdateCableConfig({
                    fiberStandard: e.target.value as CableToolConfig['fiberStandard'],
                  })
                }
                className={`w-full px-2 py-1.5 rounded border text-xs font-mono-tabular ${
                  darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                <option value="G.652.D">ITU-T G.652.D (Single Mode)</option>
                <option value="G.657.A1">ITU-T G.657.A1 (Bend Insensitive)</option>
                <option value="G.657.A2">ITU-T G.657.A2 (Ultra Bend)</option>
                <option value="G.655">ITU-T G.655 (NZDSF)</option>
              </select>
            </label>

            <label className="block">
              <span className={`block text-[11px] mb-1 ${textMuted}`}>Installation Method</span>
              <input
                type="text"
                value={cableConfig.installationMethod}
                onChange={(e) => onUpdateCableConfig({ installationMethod: e.target.value })}
                className={`w-full px-2 py-1.5 rounded border text-xs ${
                  darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </label>
          </div>
        </div>
      )}

      {/* Tab 3: CAD Layers */}
      {tab === 'layers' && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {layers.map((layer) => (
            <div
              key={layer.id}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded border ${subBg}`}
            >
              <input
                type="color"
                value={layer.color}
                onChange={(e) => onUpdateLayer(layer.id, { color: e.target.value })}
                title="Layer color"
                className="w-4 h-4 rounded border-0 bg-transparent cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={layer.name}
                onChange={(e) => onUpdateLayer(layer.id, { name: e.target.value })}
                className={`flex-1 min-w-0 bg-transparent text-[11px] font-medium focus:outline-none focus:underline ${textMain}`}
              />
              <button
                onClick={() => onUpdateLayer(layer.id, { visible: !layer.visible })}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                className={`p-1 rounded hover:bg-slate-800/40 ${
                  layer.visible ? textMain : 'text-slate-500'
                }`}
              >
                {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => onUpdateLayer(layer.id, { locked: !layer.locked })}
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                className={`p-1 rounded hover:bg-slate-800/40 ${
                  layer.locked ? 'text-amber-400' : textMuted
                }`}
              >
                {layer.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};
