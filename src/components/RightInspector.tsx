import React, { useMemo, useState } from 'react';
import {
  CableType,
  CadLayer,
  ComponentProperties,
  FiberConnection,
  FtthNode,
  LayerId,
  LineRoutingStyle,
  OpticalPathResult,
  ProjectSettings,
  RouteMethod,
} from '../types/ftth';
import {
  CABLE_TYPE_DEFAULTS,
  CATALOG_MAP,
  FIBER_PORT_COLORS,
  MANUFACTURER_PROFILES,
  RATIO_COUPLER_PRESETS,
  buildPorts,
  computeCouplerLegLosses,
  computeLossDbFromSplitPercent,
} from '../data/componentCatalog';
import {
  auditAllOnus,
  calculateAllPortOpticalLevels,
  computeConnectionSchematicLengthM,
  countDownstreamCustomers,
  isSplitterNode,
} from '../utils/opticalCalculator';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Lock,
  Minus,
  Plus,
  RotateCw,
  Trash2,
  Unlock,
  Unlink,
  XCircle,
} from 'lucide-react';

interface RightInspectorProps {
  nodes: FtthNode[];
  connections: FiberConnection[];
  layers: CadLayer[];
  settings: ProjectSettings;
  selectedNodeIds: string[];
  selectedConnectionId: string | null;
  selectedOpticalPath: OpticalPathResult | null;
  darkMode: boolean;
  onUpdateNode: (id: string, patch: Partial<FtthNode>, commitHistory?: boolean) => void;
  onUpdateNodeProperties: (
    id: string,
    patch: Partial<ComponentProperties>,
    commitHistory?: boolean
  ) => void;
  onUpdateConnection: (id: string, patch: Partial<FiberConnection>) => void;
  onDeleteSelected: () => void;
  onDeleteConnection: (id: string) => void;
  onRemovePort: (nodeId: string, direction: 'in' | 'out', portId: string) => void;
  onUpdatePortColor: (
    nodeId: string,
    direction: 'in' | 'out',
    portId: string,
    color: string | undefined
  ) => void;
  onAlignNodes: (mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onSelectNode: (id: string) => void;
}

export const RightInspector: React.FC<RightInspectorProps> = ({
  nodes,
  connections,
  layers,
  settings,
  selectedNodeIds,
  selectedConnectionId,
  selectedOpticalPath,
  darkMode,
  onUpdateNode,
  onUpdateNodeProperties,
  onUpdateConnection,
  onDeleteSelected,
  onDeleteConnection,
  onRemovePort,
  onUpdatePortColor,
  onAlignNodes,
  onGroupSelected,
  onUngroupSelected,
  onSelectNode,
}) => {
  const [nodeTab, setNodeTab] = useState<'default' | 'optical' | 'ports' | 'custom'>('default');
  const [newCustomKey, setNewCustomKey] = useState('');
  const [newCustomVal, setNewCustomVal] = useState('');

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selectedNode = selectedNodeIds.length === 1 ? nodesById.get(selectedNodeIds[0]) || null : null;
  const selectedConn = selectedConnectionId
    ? connections.find((c) => c.id === selectedConnectionId) || null
    : null;

  const onuAudits = useMemo(
    () => auditAllOnus(nodes, connections, settings),
    [nodes, connections, settings]
  );

  const portLevels = useMemo(
    () => calculateAllPortOpticalLevels(nodes, connections, settings),
    [nodes, connections, settings]
  );

  const panelBg = darkMode ? 'bg-[#111620] border-slate-800' : 'bg-white border-slate-200';
  const cardBg = darkMode ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-50 border-slate-200';
  const inputCls = `w-full px-2 py-1 rounded border text-xs font-mono-tabular focus:outline-none focus:border-sky-500 ${
    darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
  }`;
  const textMain = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textMuted = darkMode ? 'text-slate-400' : 'text-slate-500';

  const statusBadge = (status: OpticalPathResult['status']) => {
    switch (status) {
      case 'normal':
        return (
          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Normal
          </span>
        );
      case 'low_margin':
        return (
          <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            Low Margin
          </span>
        );
      case 'excessive_loss':
      case 'invalid':
        return (
          <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
            <XCircle className="w-3.5 h-3.5" />
            {status === 'invalid' ? 'Invalid Link' : 'Excessive Loss'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-slate-400 font-medium">
            <Unlink className="w-3.5 h-3.5" />
            Disconnected
          </span>
        );
    }
  };

  // 1. Fiber Connection Properties View
  if (selectedConn) {
    const src = nodesById.get(selectedConn.sourceNodeId);
    const dst = nodesById.get(selectedConn.targetNodeId);
    const computedLen = computeConnectionSchematicLengthM(
      selectedConn,
      nodesById,
      settings.metersPerPixel
    );

    return (
      <aside className={`w-[320px] shrink-0 h-full border-l flex flex-col ${panelBg}`}>
        <div className={`px-3 py-2.5 border-b flex items-center justify-between ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <div>
            <div className={`text-xs font-bold font-mono-tabular ${textMain}`}>
              {selectedConn.cableId}
            </div>
            <div className={`text-[11px] ${textMuted}`}>
              {src?.code || '?'} → {dst?.code || '?'}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                onUpdateConnection(selectedConn.id, { locked: !selectedConn.locked })
              }
              title={selectedConn.locked ? 'Unlock Fiber Cable Route' : 'Lock Fiber Cable Route'}
              className={`p-1.5 rounded ${
                selectedConn.locked
                  ? 'text-amber-400 bg-amber-500/15'
                  : 'text-slate-400 hover:bg-slate-800/40'
              }`}
            >
              {selectedConn.locked ? (
                <Lock className="w-4 h-4" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => onDeleteConnection(selectedConn.id)}
              title="Delete Fiber Cable"
              className="p-1.5 rounded text-rose-400 hover:bg-rose-500/15"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={`block text-[10px] mb-1 ${textMuted}`}>Cable ID</span>
              <input
                type="text"
                value={selectedConn.cableId}
                onChange={(e) => onUpdateConnection(selectedConn.id, { cableId: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={`block text-[10px] mb-1 ${textMuted}`}>Fiber ID / Core</span>
              <input
                type="text"
                value={selectedConn.fiberId}
                onChange={(e) => onUpdateConnection(selectedConn.id, { fiberId: e.target.value })}
                className={inputCls}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={`block text-[10px] mb-1 ${textMuted}`}>Cable Type</span>
              <select
                value={selectedConn.cableType}
                onChange={(e) => {
                  const t = e.target.value as CableType;
                  const def = CABLE_TYPE_DEFAULTS[t];
                  onUpdateConnection(selectedConn.id, {
                    cableType: t,
                    color: def.color,
                    layerId: def.layerId,
                    attenuationDownDbPerKm: def.attenDown,
                    attenuationUpDbPerKm: def.attenUp,
                  });
                }}
                className={inputCls}
              >
                {Object.entries(CABLE_TYPE_DEFAULTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={`block text-[10px] mb-1 ${textMuted}`}>Core Capacity</span>
              <select
                value={selectedConn.coreCapacity}
                onChange={(e) =>
                  onUpdateConnection(selectedConn.id, { coreCapacity: Number(e.target.value) })
                }
                className={inputCls}
              >
                {[1, 2, 4, 6, 12, 24, 48, 96, 144, 288].map((n) => (
                  <option key={n} value={n}>
                    {n} Cores
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={`block text-[10px] mb-1 ${textMuted}`}>Route Type</span>
              <select
                value={selectedConn.routeType}
                onChange={(e) =>
                  onUpdateConnection(selectedConn.id, {
                    routeType: e.target.value as RouteMethod,
                  })
                }
                className={inputCls}
              >
                <option value="underground">Underground</option>
                <option value="aerial">Aerial</option>
                <option value="building">Building</option>
                <option value="duct">Duct / Microduct</option>
              </select>
            </label>

            <label className="block">
              <span className={`block text-[10px] mb-1 ${textMuted}`}>Routing Style</span>
              <select
                value={selectedConn.routingStyle}
                onChange={(e) =>
                  onUpdateConnection(selectedConn.id, {
                    routingStyle: e.target.value as LineRoutingStyle,
                  })
                }
                className={inputCls}
              >
                <option value="orthogonal">Orthogonal</option>
                <option value="straight">Straight</option>
                <option value="curved">Curved</option>
              </select>
            </label>
          </div>

          <div className={`p-2.5 rounded border space-y-2 ${cardBg}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-semibold ${textMain}`}>Length & Attenuation</span>
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedConn.autoCalculateLength}
                  onChange={(e) =>
                    onUpdateConnection(selectedConn.id, {
                      autoCalculateLength: e.target.checked,
                      lengthMeters: e.target.checked ? computedLen : selectedConn.lengthMeters,
                    })
                  }
                />
                <span className={textMuted}>Auto from scale</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={`block text-[10px] mb-1 ${textMuted}`}>Length (m)</span>
                <input
                  type="number"
                  min={1}
                  disabled={selectedConn.autoCalculateLength}
                  value={selectedConn.autoCalculateLength ? computedLen : selectedConn.lengthMeters}
                  onChange={(e) =>
                    onUpdateConnection(selectedConn.id, { lengthMeters: Number(e.target.value) || 1 })
                  }
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className={`block text-[10px] mb-1 ${textMuted}`}>Fiber Standard</span>
                <select
                  value={selectedConn.fiberStandard}
                  onChange={(e) =>
                    onUpdateConnection(selectedConn.id, {
                      fiberStandard: e.target.value as FiberConnection['fiberStandard'],
                    })
                  }
                  className={inputCls}
                >
                  <option value="G.652.D">G.652.D</option>
                  <option value="G.657.A1">G.657.A1</option>
                  <option value="G.657.A2">G.657.A2</option>
                  <option value="G.655">G.655</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={`block text-[10px] mb-1 ${textMuted}`}>Down Atten (dB/km)</span>
                <input
                  type="number"
                  step={0.01}
                  value={selectedConn.attenuationDownDbPerKm}
                  onChange={(e) =>
                    onUpdateConnection(selectedConn.id, {
                      attenuationDownDbPerKm: Number(e.target.value),
                    })
                  }
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className={`block text-[10px] mb-1 ${textMuted}`}>Up Atten (dB/km)</span>
                <input
                  type="number"
                  step={0.01}
                  value={selectedConn.attenuationUpDbPerKm}
                  onChange={(e) =>
                    onUpdateConnection(selectedConn.id, {
                      attenuationUpDbPerKm: Number(e.target.value),
                    })
                  }
                  className={inputCls}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={`block text-[10px] mb-1 ${textMuted}`}>Splices (Count)</span>
                <input
                  type="number"
                  min={0}
                  value={selectedConn.spliceCount}
                  onChange={(e) =>
                    onUpdateConnection(selectedConn.id, { spliceCount: Number(e.target.value) })
                  }
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className={`block text-[10px] mb-1 ${textMuted}`}>Connectors (Count)</span>
                <input
                  type="number"
                  min={0}
                  value={selectedConn.connectorCount}
                  onChange={(e) =>
                    onUpdateConnection(selectedConn.id, { connectorCount: Number(e.target.value) })
                  }
                  className={inputCls}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={`block text-[10px] mb-1 ${textMuted}`}>Color</span>
              <input
                type="color"
                value={selectedConn.color}
                onChange={(e) => onUpdateConnection(selectedConn.id, { color: e.target.value })}
                className="w-full h-7 rounded cursor-pointer bg-transparent"
              />
            </label>
            <label className="block">
              <span className={`block text-[10px] mb-1 ${textMuted}`}>CAD Layer</span>
              <select
                value={selectedConn.layerId}
                onChange={(e) =>
                  onUpdateConnection(selectedConn.id, { layerId: e.target.value as LayerId })
                }
                className={inputCls}
              >
                {layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={`p-2.5 rounded border space-y-2 ${cardBg}`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-semibold ${textMain}`}>GIS Street Route &amp; Lock</span>
              <button
                onClick={() =>
                  onUpdateConnection(selectedConn.id, { locked: !selectedConn.locked })
                }
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                  selectedConn.locked
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {selectedConn.locked ? (
                  <>
                    <Lock className="w-3 h-3" /> Locked
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3" /> Unlocked
                  </>
                )}
              </button>
            </div>
            <label className="block">
              <span className={`block text-[10px] mb-1 ${textMuted}`}>GIS Route Mode</span>
              <select
                disabled={Boolean(selectedConn.locked)}
                value={selectedConn.geoRouteMode || 'auto_street'}
                onChange={(e) =>
                  onUpdateConnection(selectedConn.id, {
                    geoRouteMode: e.target.value as 'auto_street' | 'manual',
                  })
                }
                className={inputCls}
              >
                <option value="auto_street">Auto Street / Road Following</option>
                <option value="manual">Manual Bend Vertices</option>
              </select>
            </label>
            <div className={`text-[10px] ${textMuted}`}>
              {selectedConn.locked
                ? 'Whole cable locked: all bends and endpoints are protected.'
                : 'Lock individual bends below or on the GIS map so moving nodes or unlocked bends never disturbs locked waypoints.'}
            </div>
            {selectedConn.geoPath.length > 2 && (
              <div className="pt-1.5 border-t border-slate-700/40 space-y-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-medium ${textMuted}`}>
                    Individual Bends ({selectedConn.geoPath.length - 2})
                  </span>
                  {(selectedConn.geoLockedVertexIndices?.length || 0) > 0 && (
                    <button
                      type="button"
                      disabled={Boolean(selectedConn.locked)}
                      onClick={() =>
                        onUpdateConnection(selectedConn.id, { geoLockedVertexIndices: [] })
                      }
                      className="text-[10px] text-amber-400 hover:underline disabled:opacity-40"
                    >
                      Unlock all bends
                    </button>
                  )}
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
                  {selectedConn.geoPath.slice(1, -1).map((pt, i) => {
                    const vIdx = i + 1;
                    const lockedList = selectedConn.geoLockedVertexIndices || [];
                    const isVLocked = lockedList.includes(vIdx);
                    return (
                      <div
                        key={vIdx}
                        className={`flex items-center justify-between px-2 py-1 rounded text-[10px] ${
                          darkMode ? 'bg-slate-900/70' : 'bg-slate-100'
                        }`}
                      >
                        <span className="font-mono-tabular">
                          Bend #{vIdx} · {pt[0].toFixed(4)}, {pt[1].toFixed(4)}
                        </span>
                        <button
                          type="button"
                          disabled={Boolean(selectedConn.locked)}
                          onClick={() => {
                            const next = isVLocked
                              ? lockedList.filter((idx) => idx !== vIdx)
                              : [...lockedList, vIdx].sort((a, b) => a - b);
                            onUpdateConnection(selectedConn.id, {
                              geoLockedVertexIndices: next,
                            });
                          }}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded font-medium disabled:opacity-40 ${
                            isVLocked
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {isVLocked ? (
                            <>
                              <Lock className="w-2.5 h-2.5" /> Locked
                            </>
                          ) : (
                            <>
                              <Unlock className="w-2.5 h-2.5" /> Lock
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  // 2. Single Selected Component Properties View
  if (selectedNode) {
    const props = selectedNode.properties;
    const isOlt =
      selectedNode.type === 'olt' ||
      selectedNode.type === 'olt_chassis' ||
      selectedNode.type === 'olt_line_card' ||
      selectedNode.type === 'gpon_port' ||
      selectedNode.type === 'xgs_pon_port';
    const isOnu =
      selectedNode.type === 'onu' || selectedNode.type === 'ont' || selectedNode.type === 'wifi_ont';
    const isSpl = isSplitterNode(selectedNode.type);
    const isCoupler =
      selectedNode.type === 'ratio_coupler' || selectedNode.type === 'optical_coupler';

    const applyCouplerRatio = (ratioStr: string) => {
      const { leg1Pct, leg2Pct, leg1LossDb, leg2LossDb } = computeCouplerLegLosses(ratioStr);
      const normalized = `${leg1Pct}:${leg2Pct}`;
      const nextOut = selectedNode.outputPorts.map((op, idx) => {
        if (idx === 0) {
          return {
            ...op,
            label: `OUT-1 (${leg1Pct}%)`,
            portLossDb: leg1LossDb,
            splitPercent: leg1Pct,
          };
        }
        if (idx === 1) {
          return {
            ...op,
            label: `OUT-2 (${leg2Pct}%)`,
            portLossDb: leg2LossDb,
            splitPercent: leg2Pct,
          };
        }
        return op;
      });
      onUpdateNode(selectedNode.id, {
        properties: {
          ...props,
          couplingRatio: normalized,
          insertionLossDb: 0,
        },
        outputPorts: nextOut,
      });
    };

    const matchingProfiles = MANUFACTURER_PROFILES.filter((p) =>
      p.appliesTo.includes(selectedNode.type)
    );

    const downstreamCount = isSpl
      ? countDownstreamCustomers(selectedNode.id, nodes, connections)
      : 0;

    return (
      <aside className={`w-[320px] shrink-0 h-full border-l flex flex-col ${panelBg}`}>
        {/* Component Header */}
        <div className={`px-3 py-2 border-b flex items-center justify-between gap-2 ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="min-w-0">
            <div className={`text-xs font-bold font-mono-tabular truncate ${textMain}`}>
              {selectedNode.code}
            </div>
            <div className={`text-[11px] truncate ${textMuted}`}>{selectedNode.name}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() =>
                onUpdateNode(selectedNode.id, { rotation: (selectedNode.rotation + 90) % 360 }, true)
              }
              title="Rotate 90°"
              className={`p-1.5 rounded hover:bg-slate-800/50 ${textMuted}`}
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() =>
                onUpdateNode(selectedNode.id, { locked: !selectedNode.locked }, true)
              }
              title={selectedNode.locked ? 'Unlock' : 'Lock'}
              className={`p-1.5 rounded hover:bg-slate-800/50 ${
                selectedNode.locked ? 'text-amber-400' : textMuted
              }`}
            >
              {selectedNode.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onDeleteSelected}
              title="Delete Component"
              className="p-1.5 rounded text-rose-400 hover:bg-rose-500/15"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className={`grid grid-cols-4 border-b text-[11px] font-medium ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          {(
            [
              ['default', 'Config'],
              ['optical', 'Optical'],
              ['ports', 'Ports'],
              ['custom', 'Custom'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setNodeTab(id)}
              className={`py-2 border-b-2 transition-colors ${
                nodeTab === id
                  ? 'border-sky-500 text-sky-500'
                  : `border-transparent ${textMuted}`
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
          {/* TAB 1: DEFAULT & MANUAL CONFIGURATION */}
          {nodeTab === 'default' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={`block text-[10px] mb-1 ${textMuted}`}>Component Code</span>
                  <input
                    type="text"
                    value={selectedNode.code}
                    onChange={(e) => onUpdateNode(selectedNode.id, { code: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className={`block text-[10px] mb-1 ${textMuted}`}>CAD Layer</span>
                  <select
                    value={selectedNode.layerId}
                    onChange={(e) =>
                      onUpdateNode(selectedNode.id, { layerId: e.target.value as LayerId })
                    }
                    className={inputCls}
                  >
                    {layers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {(selectedNode.type === 'text_label' || selectedNode.type === 'note_box') && (
                <label className="block">
                  <span className={`block text-[10px] mb-1 ${textMuted}`}>Annotation Text</span>
                  <textarea
                    rows={3}
                    value={selectedNode.annotationText || ''}
                    onChange={(e) =>
                      onUpdateNode(selectedNode.id, { annotationText: e.target.value })
                    }
                    className={inputCls}
                  />
                </label>
              )}

              {/* Manufacturer Profile Selector */}
              <div className={`p-2.5 rounded border space-y-2 ${cardBg}`}>
                <div className={`text-[11px] font-semibold ${textMain}`}>Manufacturer Settings</div>
                {matchingProfiles.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const prof = matchingProfiles.find((p) => p.id === e.target.value);
                      if (prof) {
                        onUpdateNodeProperties(selectedNode.id, {
                          manufacturer: prof.manufacturer,
                          model: prof.model,
                          ...prof.overrides,
                        });
                      }
                    }}
                    className={inputCls}
                  >
                    <option value="" disabled>
                      Apply Manufacturer Profile...
                    </option>
                    {matchingProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className={`block text-[10px] mb-1 ${textMuted}`}>Manufacturer</span>
                    <input
                      type="text"
                      value={props.manufacturer}
                      onChange={(e) =>
                        onUpdateNodeProperties(selectedNode.id, { manufacturer: e.target.value })
                      }
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className={`block text-[10px] mb-1 ${textMuted}`}>Model</span>
                    <input
                      type="text"
                      value={props.model}
                      onChange={(e) =>
                        onUpdateNodeProperties(selectedNode.id, { model: e.target.value })
                      }
                      className={inputCls}
                    />
                  </label>
                </div>
              </div>

              {/* Technical & Optical Parameters */}
              <div className={`p-2.5 rounded border space-y-2 ${cardBg}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-semibold ${textMain}`}>Technical & Optical</span>
                  <button
                    onClick={() => {
                      const def = CATALOG_MAP[selectedNode.type].defaultProperties;
                      onUpdateNodeProperties(selectedNode.id, { ...def });
                    }}
                    className="text-[10px] text-sky-400 hover:underline"
                  >
                    Reset Default
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className={`block text-[10px] mb-1 ${textMuted}`}>Technology</span>
                    <select
                      value={props.technology}
                      onChange={(e) => {
                        const tech = e.target.value as ComponentProperties['technology'];
                        onUpdateNodeProperties(selectedNode.id, {
                          technology: tech,
                          downstreamWavelengthNm: tech === 'XGS-PON' ? 1577 : 1490,
                          upstreamWavelengthNm: tech === 'XGS-PON' ? 1270 : 1310,
                        });
                      }}
                      className={inputCls}
                    >
                      <option value="GPON">GPON</option>
                      <option value="XGS-PON">XGS-PON</option>
                      <option value="10G-EPON">10G-EPON</option>
                      <option value="P2P">P2P Active</option>
                      <option value="Passive">Passive</option>
                      <option value="Civil">Civil</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className={`block text-[10px] mb-1 ${textMuted}`}>Connector</span>
                    <select
                      value={props.connectorType}
                      onChange={(e) =>
                        onUpdateNodeProperties(selectedNode.id, {
                          connectorType: e.target.value as ComponentProperties['connectorType'],
                        })
                      }
                      className={inputCls}
                    >
                      {['SC/APC', 'SC/UPC', 'LC/APC', 'LC/UPC', 'FC/APC', 'Fusion', 'None'].map(
                        (ct) => (
                          <option key={ct} value={ct}>
                            {ct}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </div>

                {(isOlt || isOnu) && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className={`block text-[10px] mb-1 ${textMuted}`}>
                          {isOlt ? 'Default PON Tx (dBm)' : 'Tx Power (dBm)'}
                        </span>
                        <input
                          type="number"
                          step={0.1}
                          value={props.txPowerDbm ?? (isOlt ? 6.0 : 2.0)}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            onUpdateNodeProperties(selectedNode.id, { txPowerDbm: val });
                          }}
                          className={inputCls}
                        />
                      </label>
                      <label className="block">
                        <span className={`block text-[10px] mb-1 ${textMuted}`}>
                          Rx Sensitivity (dBm)
                        </span>
                        <input
                          type="number"
                          step={0.1}
                          value={props.rxSensitivityDbm ?? (isOlt ? -32.0 : -27.0)}
                          onChange={(e) =>
                            onUpdateNodeProperties(selectedNode.id, {
                              rxSensitivityDbm: Number(e.target.value),
                            })
                          }
                          className={inputCls}
                        />
                      </label>
                    </div>
                    {isOlt && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] ${textMuted}`}>
                            Quick Initial PON dBm (All Ports)
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {[3, 5, 6, 7, 9].map((dbm) => (
                            <button
                              key={dbm}
                              onClick={() => {
                                onUpdateNode(selectedNode.id, {
                                  properties: { ...props, txPowerDbm: dbm },
                                  outputPorts: selectedNode.outputPorts.map((p) => ({
                                    ...p,
                                    txPowerDbm: dbm,
                                  })),
                                });
                              }}
                              className={`py-1 rounded border text-[10px] font-mono-tabular ${
                                (props.txPowerDbm ?? 6) === dbm
                                  ? 'bg-sky-600 border-sky-500 text-white'
                                  : darkMode
                                  ? 'bg-slate-950 border-slate-800 text-slate-300 hover:border-sky-500'
                                  : 'bg-white border-slate-300 text-slate-700 hover:border-sky-500'
                              }`}
                            >
                              +{dbm}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className={`block text-[10px] mb-1 ${textMuted}`}>Down λ (nm)</span>
                        <input
                          type="number"
                          value={props.downstreamWavelengthNm ?? 1490}
                          onChange={(e) =>
                            onUpdateNodeProperties(selectedNode.id, {
                              downstreamWavelengthNm: Number(e.target.value),
                            })
                          }
                          className={inputCls}
                        />
                      </label>
                      <label className="block">
                        <span className={`block text-[10px] mb-1 ${textMuted}`}>Up λ (nm)</span>
                        <input
                          type="number"
                          value={props.upstreamWavelengthNm ?? 1310}
                          onChange={(e) =>
                            onUpdateNodeProperties(selectedNode.id, {
                              upstreamWavelengthNm: Number(e.target.value),
                            })
                          }
                          className={inputCls}
                        />
                      </label>
                    </div>
                  </>
                )}

                {isOlt && (
                  <div className="space-y-2">
                    <label className="block">
                      <span className={`block text-[10px] mb-1 ${textMuted}`}>
                        Configurable PON Ports
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={selectedNode.outputPorts.length}
                        onChange={(e) => {
                          const count = Math.max(1, Math.min(16, Number(e.target.value) || 1));
                          const { outputPorts } = buildPorts(
                            selectedNode.inputPorts.length,
                            count,
                            'IN',
                            'PON',
                            props.connectorType,
                            props.txPowerDbm ?? 6.0
                          );
                          const mergedPorts = outputPorts.map((np, i) => ({
                            ...np,
                            txPowerDbm:
                              selectedNode.outputPorts[i]?.txPowerDbm ??
                              props.txPowerDbm ??
                              6.0,
                          }));
                          onUpdateNode(selectedNode.id, {
                            outputPorts: mergedPorts,
                            height: Math.max(64, count * 18 + 28),
                            properties: { ...props, ponPorts: count },
                          });
                        }}
                        className={inputCls}
                      />
                    </label>

                    <div className="space-y-1">
                      <span className={`block text-[10px] ${textMuted}`}>
                        Per-Port Initial Tx Power (dBm)
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {selectedNode.outputPorts.map((p) => (
                          <div key={p.id} className="flex items-center gap-1">
                            <span className="text-[10px] font-mono-tabular text-sky-400 w-10 shrink-0">
                              {p.label}
                            </span>
                            <input
                              type="number"
                              step={0.5}
                              value={p.txPowerDbm ?? props.txPowerDbm ?? 6.0}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                onUpdateNode(selectedNode.id, {
                                  outputPorts: selectedNode.outputPorts.map((op) =>
                                    op.id === p.id ? { ...op, txPowerDbm: val } : op
                                  ),
                                });
                              }}
                              className={inputCls}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {isCoupler && (() => {
                  const ratioInfo = computeCouplerLegLosses(props.couplingRatio || '80:20');
                  return (
                    <div className={`p-2 rounded border space-y-2 ${darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-semibold ${textMain}`}>
                          Coupling Ratio ({ratioInfo.leg1Pct}:{ratioInfo.leg2Pct})
                        </span>
                        <button
                          onClick={() => applyCouplerRatio(`${ratioInfo.leg2Pct}:${ratioInfo.leg1Pct}`)}
                          title="Swap OUT-1 / OUT-2 Ratio"
                          className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:underline"
                        >
                          <ArrowLeftRight className="w-3 h-3" /> Swap
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-1">
                        {['95:5', '90:10', '85:15', '80:20', '75:25', '70:30', '60:40', '50:50'].map((r) => (
                          <button
                            key={r}
                            onClick={() => applyCouplerRatio(r)}
                            className={`py-1 rounded border text-[10px] font-mono-tabular ${
                              `${ratioInfo.leg1Pct}:${ratioInfo.leg2Pct}` === r
                                ? 'bg-amber-600 border-amber-500 text-white'
                                : darkMode
                                ? 'bg-slate-900 border-slate-800 text-slate-300 hover:border-amber-500'
                                : 'bg-slate-50 border-slate-300 text-slate-700 hover:border-amber-500'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>

                      <label className="block">
                        <span className={`block text-[10px] mb-1 ${textMuted}`}>Preset Ratio</span>
                        <select
                          value={
                            RATIO_COUPLER_PRESETS.includes(`${ratioInfo.leg1Pct}:${ratioInfo.leg2Pct}`)
                              ? `${ratioInfo.leg1Pct}:${ratioInfo.leg2Pct}`
                              : ''
                          }
                          onChange={(e) => {
                            if (e.target.value) applyCouplerRatio(e.target.value);
                          }}
                          className={inputCls}
                        >
                          <option value="" disabled>
                            Custom ({ratioInfo.leg1Pct}:{ratioInfo.leg2Pct})
                          </option>
                          {RATIO_COUPLER_PRESETS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className={`block text-[10px] mb-1 ${textMuted}`}>
                            Leg 1 (OUT-1 %)
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={ratioInfo.leg1Pct}
                            onChange={(e) => {
                              const v1 = Math.max(1, Math.min(99, Math.round(Number(e.target.value) || 1)));
                              applyCouplerRatio(`${v1}:${100 - v1}`);
                            }}
                            className={inputCls}
                          />
                        </label>
                        <label className="block">
                          <span className={`block text-[10px] mb-1 ${textMuted}`}>
                            Leg 2 (OUT-2 %)
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={ratioInfo.leg2Pct}
                            onChange={(e) => {
                              const v2 = Math.max(1, Math.min(99, Math.round(Number(e.target.value) || 1)));
                              applyCouplerRatio(`${100 - v2}:${v2}`);
                            }}
                            className={inputCls}
                          />
                        </label>
                      </div>

                      <div className={`flex items-center justify-between text-[10px] font-mono-tabular pt-0.5 ${textMuted}`}>
                        <span>OUT-1 Loss: <strong className="text-sky-400">{(selectedNode.outputPorts[0]?.portLossDb ?? ratioInfo.leg1LossDb).toFixed(2)} dB</strong></span>
                        <span>OUT-2 Loss: <strong className="text-amber-400">{(selectedNode.outputPorts[1]?.portLossDb ?? ratioInfo.leg2LossDb).toFixed(2)} dB</strong></span>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-3 gap-1.5">
                  <label className="block">
                    <span className={`block text-[10px] mb-1 ${textMuted}`}>Ins. Loss (dB)</span>
                    <input
                      type="number"
                      step={0.05}
                      value={props.insertionLossDb}
                      onChange={(e) =>
                        onUpdateNodeProperties(selectedNode.id, {
                          insertionLossDb: Number(e.target.value),
                        })
                      }
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className={`block text-[10px] mb-1 ${textMuted}`}>Conn. (dB)</span>
                    <input
                      type="number"
                      step={0.05}
                      value={props.connectorLossDb}
                      onChange={(e) =>
                        onUpdateNodeProperties(selectedNode.id, {
                          connectorLossDb: Number(e.target.value),
                        })
                      }
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className={`block text-[10px] mb-1 ${textMuted}`}>Splice (dB)</span>
                    <input
                      type="number"
                      step={0.01}
                      value={props.spliceLossDb}
                      onChange={(e) =>
                        onUpdateNodeProperties(selectedNode.id, {
                          spliceLossDb: Number(e.target.value),
                        })
                      }
                      className={inputCls}
                    />
                  </label>
                </div>

                {isSpl && (
                  <div className="pt-1 flex items-center justify-between text-[11px]">
                    <span className={textMuted}>Connected Customers Downstream:</span>
                    <span className="font-mono-tabular font-bold text-sky-400">
                      {downstreamCount}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: OPTICAL POWER BUDGET */}
          {nodeTab === 'optical' && (
            <div className="space-y-3">
              {selectedOpticalPath ? (
                <>
                  <div className={`p-2.5 rounded border space-y-2 ${cardBg}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-semibold ${textMain}`}>
                        Optical Link Status
                      </span>
                      {statusBadge(selectedOpticalPath.status)}
                    </div>
                    <p className={`text-[11px] ${textMuted}`}>
                      {selectedOpticalPath.statusReason}
                    </p>
                    {selectedOpticalPath.oltCode && (
                      <div className="text-[11px] font-mono-tabular text-sky-400">
                        Path: {selectedOpticalPath.oltCode} → {selectedOpticalPath.targetCode}
                      </div>
                    )}
                  </div>

                  {/* Downstream vs Upstream Comparison */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`p-2 rounded border ${cardBg}`}>
                      <div className={`text-[10px] ${textMuted}`}>
                        Downstream ({selectedOpticalPath.downstreamWavelengthNm}nm)
                      </div>
                      <div className={`mt-1 text-sm font-bold font-mono-tabular ${textMain}`}>
                        {selectedOpticalPath.receivedPowerDownDbm > -90
                          ? `${selectedOpticalPath.receivedPowerDownDbm.toFixed(2)} dBm`
                          : 'N/A'}
                      </div>
                      <div className={`text-[10px] font-mono-tabular ${textMuted}`}>
                        Loss: {selectedOpticalPath.totalLossDownDb.toFixed(2)} dB
                      </div>
                      <div
                        className={`text-[10px] font-mono-tabular font-semibold ${
                          selectedOpticalPath.opticalMarginDownDb >= settings.lowMarginThresholdDb
                            ? 'text-emerald-400'
                            : selectedOpticalPath.opticalMarginDownDb >= 0
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        Margin: {selectedOpticalPath.opticalMarginDownDb.toFixed(2)} dB
                      </div>
                    </div>

                    <div className={`p-2 rounded border ${cardBg}`}>
                      <div className={`text-[10px] ${textMuted}`}>
                        Upstream ({selectedOpticalPath.upstreamWavelengthNm}nm)
                      </div>
                      <div className={`mt-1 text-sm font-bold font-mono-tabular ${textMain}`}>
                        {selectedOpticalPath.receivedPowerUpDbm > -90
                          ? `${selectedOpticalPath.receivedPowerUpDbm.toFixed(2)} dBm`
                          : 'N/A'}
                      </div>
                      <div className={`text-[10px] font-mono-tabular ${textMuted}`}>
                        Loss: {selectedOpticalPath.totalLossUpDb.toFixed(2)} dB
                      </div>
                      <div
                        className={`text-[10px] font-mono-tabular font-semibold ${
                          selectedOpticalPath.opticalMarginUpDb >= settings.lowMarginThresholdDb
                            ? 'text-emerald-400'
                            : selectedOpticalPath.opticalMarginUpDb >= 0
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        Margin: {selectedOpticalPath.opticalMarginUpDb.toFixed(2)} dB
                      </div>
                    </div>
                  </div>

                  {/* Loss Breakdown */}
                  <div className={`p-2.5 rounded border space-y-1.5 ${cardBg}`}>
                    <div className={`text-[11px] font-semibold mb-1 ${textMain}`}>
                      Attenuation Breakdown
                    </div>
                    {[
                      ['Fiber Attenuation (Down)', `${selectedOpticalPath.fiberAttenuationDownDb.toFixed(3)} dB`],
                      ['Fiber Attenuation (Up)', `${selectedOpticalPath.fiberAttenuationUpDb.toFixed(3)} dB`],
                      ['Splitter Insertion Loss', `${selectedOpticalPath.splitterLossDb.toFixed(2)} dB`],
                      ['Connector Losses', `${selectedOpticalPath.connectorLossDb.toFixed(2)} dB`],
                      ['Splice Losses', `${selectedOpticalPath.spliceLossDb.toFixed(2)} dB`],
                      ['Other Passive Loss', `${selectedOpticalPath.otherInsertionLossDb.toFixed(2)} dB`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between text-[11px]">
                        <span className={textMuted}>{k}</span>
                        <span className={`font-mono-tabular ${textMain}`}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Hop-by-Hop Trace */}
                  {selectedOpticalPath.hops.length > 0 && (
                    <div className={`p-2.5 rounded border space-y-1.5 ${cardBg}`}>
                      <div className={`text-[11px] font-semibold ${textMain}`}>
                        Path Hop Schedule
                      </div>
                      {selectedOpticalPath.hops.map((h, i) => (
                        <div
                          key={h.nodeId + i}
                          className={`py-1 border-b last:border-b-0 ${
                            darkMode ? 'border-slate-800' : 'border-slate-200'
                          }`}
                        >
                          <div className="flex justify-between text-[11px]">
                            <span className={`font-mono-tabular font-semibold ${textMain}`}>
                              {h.nodeCode}
                            </span>
                            <span className="font-mono-tabular text-sky-400">
                              Σ {h.cumulativeLossDownDb.toFixed(2)} dB
                            </span>
                          </div>
                          {h.cableId && (
                            <div className={`text-[10px] font-mono-tabular ${textMuted}`}>
                              ↳ {h.cableId} ({h.lengthMeters}m) · Fiber {h.fiberLossDownDb.toFixed(2)} dB
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className={`p-3 rounded border text-[11px] ${cardBg} ${textMuted}`}>
                  Select an ONU, ONT, FAT, or Splitter connected to an OLT to inspect optical power budget.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PORTS & SPLITTER ALLOCATION */}
          {nodeTab === 'ports' && (
            <div className="space-y-3">
              <div className={`p-2.5 rounded border space-y-2 ${cardBg}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] font-semibold ${textMain}`}>
                    Input Ports ({selectedNode.inputPorts.length})
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedNode.inputPorts.length > 0 && (
                      <button
                        onClick={() => {
                          const lastPort =
                            selectedNode.inputPorts[selectedNode.inputPorts.length - 1];
                          if (lastPort) {
                            onRemovePort(selectedNode.id, 'in', lastPort.id);
                          }
                        }}
                        title="Remove Last Input Port"
                        className="inline-flex items-center gap-0.5 text-[10px] text-rose-400 hover:underline"
                      >
                        <Minus className="w-3 h-3" /> Remove IN
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const usedNums = new Set(
                          selectedNode.inputPorts.map((p) => {
                            const m = p.id.match(/^in-(\d+)$/);
                            return m ? Number(m[1]) : 0;
                          })
                        );
                        let nextNum = 1;
                        while (usedNums.has(nextNum)) nextNum += 1;
                        const newPort = {
                          id: `in-${nextNum}`,
                          label: `IN-${nextNum}`,
                          direction: 'in' as const,
                          index: selectedNode.inputPorts.length,
                          connectorType: props.connectorType,
                        };
                        const nextInputs = [...selectedNode.inputPorts, newPort];
                        onUpdateNode(selectedNode.id, {
                          inputPorts: nextInputs,
                          height: Math.max(selectedNode.height, nextInputs.length * 16 + 24),
                        });
                      }}
                      className="inline-flex items-center gap-0.5 text-[10px] text-sky-400 hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add IN
                    </button>
                  </div>
                </div>
                {selectedNode.inputPorts.length === 0 ? (
                  <div className={`py-2 text-center text-[10px] ${textMuted}`}>
                    No input ports. Click + Add IN to add one.
                  </div>
                ) : (
                  selectedNode.inputPorts.map((p) => {
                    const conn = connections.find(
                      (c) => c.targetNodeId === selectedNode.id && c.targetPortId === p.id
                    );
                    const srcNode = conn ? nodesById.get(conn.sourceNodeId) : null;
                    const level = portLevels.get(`${selectedNode.id}:${p.id}`);
                    return (
                      <div
                        key={p.id}
                        className={`p-1.5 rounded border text-[11px] space-y-1.5 ${
                          darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="inline-flex items-center gap-1.5 font-mono-tabular text-emerald-400 font-semibold">
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-white/30 shrink-0"
                              style={{ backgroundColor: p.color || '#10B981' }}
                            />
                            {p.label}
                          </span>
                          <span className={`font-mono-tabular truncate max-w-[90px] ${textMuted}`}>
                            {conn ? `← ${srcNode?.code}` : 'Open'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-mono-tabular font-semibold ${
                                !level
                                  ? textMuted
                                  : level.status === 'normal'
                                  ? 'text-emerald-400'
                                  : level.status === 'low_margin'
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {level
                                ? `${level.powerDbm >= 0 ? '+' : ''}${level.powerDbm.toFixed(2)} dBm`
                                : '--'}
                            </span>
                            {conn && (
                              <button
                                onClick={() => onDeleteConnection(conn.id)}
                                title="Disconnect Input Cable"
                                className="text-amber-400 hover:text-amber-300"
                              >
                                <Unlink className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={() => onRemovePort(selectedNode.id, 'in', p.id)}
                              title={`Remove ${p.label}`}
                              className="text-rose-400 hover:text-rose-300"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <label className="block">
                            <span className={`block text-[9px] mb-0.5 ${textMuted}`}>
                              Port Loss (dB)
                            </span>
                            <input
                              type="number"
                              step={0.1}
                              value={p.portLossDb ?? 0}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                onUpdateNode(selectedNode.id, {
                                  inputPorts: selectedNode.inputPorts.map((ip) =>
                                    ip.id === p.id ? { ...ip, portLossDb: val } : ip
                                  ),
                                });
                              }}
                              className={`w-full px-1.5 py-0.5 rounded border text-[11px] font-mono-tabular ${
                                darkMode
                                  ? 'bg-slate-900 border-slate-700 text-slate-100'
                                  : 'bg-slate-50 border-slate-300 text-slate-900'
                              }`}
                            />
                          </label>
                          <label className="block">
                            <span className={`block text-[9px] mb-0.5 ${textMuted}`}>
                              Ref In (dBm)
                            </span>
                            <input
                              type="number"
                              step={0.5}
                              placeholder="Auto"
                              disabled={Boolean(conn)}
                              value={conn ? level?.powerDbm ?? '' : p.txPowerDbm ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const nextVal = raw === '' ? undefined : Number(raw);
                                onUpdateNode(selectedNode.id, {
                                  inputPorts: selectedNode.inputPorts.map((ip) =>
                                    ip.id === p.id ? { ...ip, txPowerDbm: nextVal } : ip
                                  ),
                                });
                              }}
                              title={
                                conn
                                  ? 'Driven by connected upstream link'
                                  : 'Optional test input dBm when open (shows live dBm on diagram)'
                              }
                              className={`w-full px-1.5 py-0.5 rounded border text-[11px] font-mono-tabular ${
                                darkMode
                                  ? 'bg-slate-900 border-slate-700 text-slate-100 disabled:opacity-60'
                                  : 'bg-slate-50 border-slate-300 text-slate-900 disabled:opacity-60'
                              }`}
                            />
                          </label>
                        </div>

                        <div className="flex items-center justify-between gap-1.5 pt-0.5">
                          <span className={`text-[9px] shrink-0 ${textMuted}`}>Fiber Color</span>
                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            {FIBER_PORT_COLORS.map((c) => (
                              <button
                                key={c.name}
                                type="button"
                                title={c.name}
                                onClick={() => onUpdatePortColor(selectedNode.id, 'in', p.id, c.hex)}
                                className={`w-3.5 h-3.5 rounded-full border transition-transform ${
                                  p.color?.toLowerCase() === c.hex.toLowerCase()
                                    ? 'ring-1 ring-sky-400 scale-110 border-white'
                                    : 'border-slate-600/80 hover:scale-110'
                                }`}
                                style={{ backgroundColor: c.hex }}
                              />
                            ))}
                            <input
                              type="color"
                              value={p.color || '#10B981'}
                              onChange={(e) =>
                                onUpdatePortColor(selectedNode.id, 'in', p.id, e.target.value)
                              }
                              title="Custom Fiber Color"
                              className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className={`p-2.5 rounded border space-y-1.5 ${cardBg}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] font-semibold ${textMain}`}>
                    Output Ports ({selectedNode.outputPorts.length})
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedNode.outputPorts.length > 0 && (
                      <button
                        onClick={() => {
                          const lastPort =
                            selectedNode.outputPorts[selectedNode.outputPorts.length - 1];
                          if (lastPort) {
                            onRemovePort(selectedNode.id, 'out', lastPort.id);
                          }
                        }}
                        title="Remove Last Output Port"
                        className="inline-flex items-center gap-0.5 text-[10px] text-rose-400 hover:underline"
                      >
                        <Minus className="w-3 h-3" /> Remove OUT
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const usedNums = new Set(
                          selectedNode.outputPorts.map((p) => {
                            const m = p.id.match(/^out-(\d+)$/);
                            return m ? Number(m[1]) : 0;
                          })
                        );
                        let nextNum = 1;
                        while (usedNums.has(nextNum)) nextNum += 1;
                        const prefix = isOlt ? 'PON' : 'OUT';
                        const newPort = {
                          id: `out-${nextNum}`,
                          label: `${prefix}-${nextNum}`,
                          direction: 'out' as const,
                          index: selectedNode.outputPorts.length,
                          connectorType: props.connectorType,
                          ...(isOlt ? { txPowerDbm: props.txPowerDbm ?? 6.0 } : {}),
                        };
                        const nextOutputs = [...selectedNode.outputPorts, newPort];
                        onUpdateNode(selectedNode.id, {
                          outputPorts: nextOutputs,
                          height: Math.max(selectedNode.height, nextOutputs.length * 16 + 24),
                        });
                      }}
                      className="inline-flex items-center gap-0.5 text-[10px] text-sky-400 hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add OUT
                    </button>
                  </div>
                </div>
                {selectedNode.outputPorts.length === 0 ? (
                  <div className={`py-2 text-center text-[10px] ${textMuted}`}>
                    No output ports. Click + Add OUT to add one.
                  </div>
                ) : (
                  selectedNode.outputPorts.map((p, idx) => {
                    const conn = connections.find(
                      (c) => c.sourceNodeId === selectedNode.id && c.sourcePortId === p.id
                    );
                    const dstNode = conn ? nodesById.get(conn.targetNodeId) : null;
                    const custCount = conn
                      ? countDownstreamCustomers(selectedNode.id, nodes, connections, p.id)
                      : 0;
                    const level = portLevels.get(`${selectedNode.id}:${p.id}`);
                    return (
                      <div
                        key={p.id}
                        className={`p-1.5 rounded border text-[11px] space-y-1.5 ${
                          darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="inline-flex items-center gap-1.5 font-mono-tabular text-amber-400 font-semibold truncate max-w-[100px]">
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-white/30 shrink-0"
                              style={{ backgroundColor: p.color || (conn ? '#0EA5E9' : '#F59E0B') }}
                            />
                            <span className="truncate">{p.label}</span>
                          </span>
                          <span className={`font-mono-tabular truncate max-w-[80px] ${textMuted}`}>
                            {conn
                              ? `→ ${dstNode?.code}${custCount > 0 ? ` (${custCount})` : ''}`
                              : 'Open'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-mono-tabular font-semibold ${
                                !level
                                  ? textMuted
                                  : level.isSource
                                  ? 'text-sky-400'
                                  : level.status === 'normal'
                                  ? 'text-emerald-400'
                                  : level.status === 'low_margin'
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {level
                                ? `${level.powerDbm >= 0 ? '+' : ''}${level.powerDbm.toFixed(2)} dBm`
                                : '--'}
                            </span>
                            {conn && (
                              <button
                                onClick={() => onDeleteConnection(conn.id)}
                                title="Disconnect Output Cable"
                                className="text-amber-400 hover:text-amber-300"
                              >
                                <Unlink className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={() => onRemovePort(selectedNode.id, 'out', p.id)}
                              title={`Remove ${p.label}`}
                              className="text-rose-400 hover:text-rose-300"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {isOlt ? (
                          <div className="flex items-center justify-between gap-1.5">
                            <span className={`text-[10px] ${textMuted}`}>Initial Tx (dBm)</span>
                            <div className="flex items-center gap-1">
                              {[6, 9].map((preset) => (
                                <button
                                  key={preset}
                                  onClick={() =>
                                    onUpdateNode(selectedNode.id, {
                                      outputPorts: selectedNode.outputPorts.map((op) =>
                                        op.id === p.id ? { ...op, txPowerDbm: preset } : op
                                      ),
                                    })
                                  }
                                  className={`px-1.5 py-0.5 rounded border text-[10px] font-mono-tabular ${
                                    (p.txPowerDbm ?? props.txPowerDbm ?? 6) === preset
                                      ? 'bg-sky-600 border-sky-500 text-white'
                                      : darkMode
                                      ? 'bg-slate-900 border-slate-700 text-slate-300'
                                      : 'bg-slate-50 border-slate-300 text-slate-700'
                                  }`}
                                >
                                  +{preset}
                                </button>
                              ))}
                              <input
                                type="number"
                                step={0.5}
                                value={p.txPowerDbm ?? props.txPowerDbm ?? 6.0}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  onUpdateNode(selectedNode.id, {
                                    outputPorts: selectedNode.outputPorts.map((op) =>
                                      op.id === p.id ? { ...op, txPowerDbm: val } : op
                                    ),
                                  });
                                }}
                                className={`w-16 px-1.5 py-0.5 rounded border text-[11px] font-mono-tabular ${
                                  darkMode
                                    ? 'bg-slate-900 border-slate-700 text-slate-100'
                                    : 'bg-slate-50 border-slate-300 text-slate-900'
                                }`}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-1.5">
                            <label className="block">
                              <span className={`block text-[9px] mb-0.5 ${textMuted}`}>
                                Split (%)
                              </span>
                              <input
                                type="number"
                                min={1}
                                max={100}
                                step={1}
                                placeholder="%"
                                value={p.splitPercent ?? ''}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    onUpdateNode(selectedNode.id, {
                                      outputPorts: selectedNode.outputPorts.map((op) =>
                                        op.id === p.id
                                          ? { ...op, splitPercent: undefined }
                                          : op
                                      ),
                                    });
                                    return;
                                  }
                                  const isTwoPortCoupler =
                                    (isCoupler || selectedNode.type === 'fbt_splitter') &&
                                    selectedNode.outputPorts.length === 2;
                                  const pct = Math.max(
                                    1,
                                    Math.min(isTwoPortCoupler ? 99 : 100, Math.round(Number(raw) || 1))
                                  );
                                  const lossDb = computeLossDbFromSplitPercent(pct);

                                  if (isTwoPortCoupler) {
                                    const otherPct = 100 - pct;
                                    const otherLossDb = computeLossDbFromSplitPercent(otherPct);
                                    const leg1Pct = idx === 0 ? pct : otherPct;
                                    const leg2Pct = idx === 1 ? pct : otherPct;
                                    onUpdateNode(selectedNode.id, {
                                      properties: {
                                        ...props,
                                        couplingRatio: `${leg1Pct}:${leg2Pct}`,
                                        insertionLossDb:
                                          selectedNode.type === 'fbt_splitter'
                                            ? props.insertionLossDb
                                            : 0,
                                      },
                                      outputPorts: selectedNode.outputPorts.map((op, i) =>
                                        i === idx
                                          ? {
                                              ...op,
                                              label: `OUT-${i + 1} (${pct}%)`,
                                              splitPercent: pct,
                                              portLossDb: lossDb,
                                            }
                                          : {
                                              ...op,
                                              label: `OUT-${i + 1} (${otherPct}%)`,
                                              splitPercent: otherPct,
                                              portLossDb: otherLossDb,
                                            }
                                      ),
                                    });
                                  } else {
                                    onUpdateNode(selectedNode.id, {
                                      outputPorts: selectedNode.outputPorts.map((op) =>
                                        op.id === p.id
                                          ? {
                                              ...op,
                                              label: `OUT-${idx + 1} (${pct}%)`,
                                              splitPercent: pct,
                                              portLossDb: lossDb,
                                            }
                                          : op
                                      ),
                                    });
                                  }
                                }}
                                className={`w-full px-1.5 py-0.5 rounded border text-[11px] font-mono-tabular ${
                                  darkMode
                                    ? 'bg-slate-900 border-slate-700 text-slate-100'
                                    : 'bg-slate-50 border-slate-300 text-slate-900'
                                }`}
                              />
                            </label>
                            <label className="block">
                              <span className={`block text-[9px] mb-0.5 ${textMuted}`}>
                                Port Loss (dB)
                              </span>
                              <input
                                type="number"
                                step={0.1}
                                value={p.portLossDb ?? 0}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  onUpdateNode(selectedNode.id, {
                                    outputPorts: selectedNode.outputPorts.map((op) =>
                                      op.id === p.id ? { ...op, portLossDb: val } : op
                                    ),
                                  });
                                }}
                                className={`w-full px-1.5 py-0.5 rounded border text-[11px] font-mono-tabular ${
                                  darkMode
                                    ? 'bg-slate-900 border-slate-700 text-slate-100'
                                    : 'bg-slate-50 border-slate-300 text-slate-900'
                                }`}
                              />
                            </label>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-1.5 pt-0.5">
                          <span className={`text-[9px] shrink-0 ${textMuted}`}>Fiber Color</span>
                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            {FIBER_PORT_COLORS.map((c) => (
                              <button
                                key={c.name}
                                type="button"
                                title={c.name}
                                onClick={() => onUpdatePortColor(selectedNode.id, 'out', p.id, c.hex)}
                                className={`w-3.5 h-3.5 rounded-full border transition-transform ${
                                  p.color?.toLowerCase() === c.hex.toLowerCase()
                                    ? 'ring-1 ring-sky-400 scale-110 border-white'
                                    : 'border-slate-600/80 hover:scale-110'
                                }`}
                                style={{ backgroundColor: c.hex }}
                              />
                            ))}
                            <input
                              type="color"
                              value={p.color || '#EF4444'}
                              onChange={(e) =>
                                onUpdatePortColor(selectedNode.id, 'out', p.id, e.target.value)
                              }
                              title="Custom Fiber Color"
                              className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 4: GEOMETRY, GIS COORDS & CUSTOM FIELDS */}
          {nodeTab === 'custom' && (
            <div className="space-y-3">
              <div className={`p-2.5 rounded border space-y-2 ${cardBg}`}>
                <div className={`text-[11px] font-semibold ${textMain}`}>CAD Geometry</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className={`block text-[10px] mb-1 ${textMuted}`}>X (px)</span>
                    <input
                      type="number"
                      value={Math.round(selectedNode.x)}
                      onChange={(e) => onUpdateNode(selectedNode.id, { x: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className={`block text-[10px] mb-1 ${textMuted}`}>Y (px)</span>
                    <input
                      type="number"
                      value={Math.round(selectedNode.y)}
                      onChange={(e) => onUpdateNode(selectedNode.id, { y: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className={`block text-[10px] mb-1 ${textMuted}`}>Width</span>
                    <input
                      type="number"
                      min={48}
                      value={Math.round(selectedNode.width)}
                      onChange={(e) =>
                        onUpdateNode(selectedNode.id, { width: Math.max(48, Number(e.target.value)) })
                      }
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className={`block text-[10px] mb-1 ${textMuted}`}>Height</span>
                    <input
                      type="number"
                      min={36}
                      value={Math.round(selectedNode.height)}
                      onChange={(e) =>
                        onUpdateNode(selectedNode.id, { height: Math.max(36, Number(e.target.value)) })
                      }
                      className={inputCls}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className={`block text-[10px] mb-1 ${textMuted}`}>Rotation (°)</span>
                  <input
                    type="number"
                    value={selectedNode.rotation}
                    onChange={(e) =>
                      onUpdateNode(selectedNode.id, { rotation: Number(e.target.value) % 360 })
                    }
                    className={inputCls}
                  />
                </label>
              </div>

              <div className={`p-2.5 rounded border space-y-2 ${cardBg}`}>
                <div className={`text-[11px] font-semibold ${textMain}`}>GIS Coordinates</div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className={`block text-[10px] mb-1 ${textMuted}`}>Latitude</span>
                    <input
                      type="number"
                      step={0.0001}
                      value={selectedNode.lat}
                      onChange={(e) => onUpdateNode(selectedNode.id, { lat: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </label>
                  <label className="block">
                    <span className={`block text-[10px] mb-1 ${textMuted}`}>Longitude</span>
                    <input
                      type="number"
                      step={0.0001}
                      value={selectedNode.lng}
                      onChange={(e) => onUpdateNode(selectedNode.id, { lng: Number(e.target.value) })}
                      className={inputCls}
                    />
                  </label>
                </div>
              </div>

              <div className={`p-2.5 rounded border space-y-2 ${cardBg}`}>
                <div className={`text-[11px] font-semibold ${textMain}`}>Custom Settings</div>
                {Object.entries(props.customSettings).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span className={`text-[11px] font-mono-tabular w-24 truncate ${textMuted}`}>
                      {k}
                    </span>
                    <input
                      type="text"
                      value={v}
                      onChange={(e) =>
                        onUpdateNodeProperties(selectedNode.id, {
                          customSettings: { ...props.customSettings, [k]: e.target.value },
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-1 pt-1">
                  <input
                    type="text"
                    placeholder="Key"
                    value={newCustomKey}
                    onChange={(e) => setNewCustomKey(e.target.value)}
                    className={inputCls}
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    value={newCustomVal}
                    onChange={(e) => setNewCustomVal(e.target.value)}
                    className={inputCls}
                  />
                  <button
                    onClick={() => {
                      if (!newCustomKey.trim()) return;
                      onUpdateNodeProperties(selectedNode.id, {
                        customSettings: {
                          ...props.customSettings,
                          [newCustomKey.trim()]: newCustomVal,
                        },
                      });
                      setNewCustomKey('');
                      setNewCustomVal('');
                    }}
                    className="px-2 py-1 rounded bg-sky-600 text-white text-xs"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    );
  }

  // 3. Multi-Selection Tools & Network Optical Audit Overview
  const normalCount = onuAudits.filter((a) => a.status === 'normal').length;
  const warnCount = onuAudits.filter((a) => a.status === 'low_margin').length;
  const failCount = onuAudits.filter(
    (a) => a.status === 'excessive_loss' || a.status === 'disconnected' || a.status === 'invalid'
  ).length;

  return (
    <aside className={`w-[320px] shrink-0 h-full border-l flex flex-col ${panelBg}`}>
      <div className={`px-3 py-2.5 border-b ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className={`text-xs font-semibold ${textMain}`}>
          {selectedNodeIds.length > 1
            ? `${selectedNodeIds.length} Components Selected`
            : 'Optical Network Audit'}
        </div>
        <div className={`text-[11px] ${textMuted}`}>
          {selectedNodeIds.length > 1
            ? 'Alignment, grouping, and batch controls'
            : 'Click any ONU or cable on canvas to inspect'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {selectedNodeIds.length > 1 && (
          <div className={`p-2.5 rounded border space-y-2 ${cardBg}`}>
            <div className={`text-[11px] font-semibold ${textMain}`}>CAD Alignment & Grouping</div>
            <div className="grid grid-cols-3 gap-1">
              {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => onAlignNodes(m)}
                  className={`py-1 px-2 rounded text-[11px] capitalize border ${
                    darkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-200 hover:border-sky-500'
                      : 'bg-white border-slate-200 text-slate-800 hover:border-sky-500'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                onClick={onGroupSelected}
                className="py-1.5 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 text-[11px]"
              >
                Group
              </button>
              <button
                onClick={onUngroupSelected}
                className="py-1.5 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 text-[11px]"
              >
                Ungroup
              </button>
            </div>
            <button
              onClick={onDeleteSelected}
              className="w-full py-1.5 rounded bg-rose-600/20 text-rose-400 border border-rose-500/40 hover:bg-rose-600/30 text-[11px]"
            >
              Delete Selected ({selectedNodeIds.length})
            </button>
          </div>
        )}

        {/* Network Summary KPIs */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className={`p-2 rounded border ${cardBg}`}>
            <div className="text-[10px] text-emerald-400">Nominal</div>
            <div className={`text-base font-bold font-mono-tabular ${textMain}`}>{normalCount}</div>
          </div>
          <div className={`p-2 rounded border ${cardBg}`}>
            <div className="text-[10px] text-amber-400">Low Margin</div>
            <div className={`text-base font-bold font-mono-tabular ${textMain}`}>{warnCount}</div>
          </div>
          <div className={`p-2 rounded border ${cardBg}`}>
            <div className="text-[10px] text-rose-400">Fault / Disc.</div>
            <div className={`text-base font-bold font-mono-tabular ${textMain}`}>{failCount}</div>
          </div>
        </div>

        {/* Live ONU Optical Power Schedule */}
        <div className={`p-2.5 rounded border space-y-1.5 ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-semibold ${textMain}`}>
              Subscriber ONU Optical Budget ({onuAudits.length})
            </span>
          </div>
          {onuAudits.length === 0 ? (
            <div className={`py-4 text-center text-[11px] ${textMuted}`}>
              No ONUs/ONTs placed yet. Drag an ONU from the left library or run Auto Network Design.
            </div>
          ) : (
            <div className="space-y-1">
              {onuAudits.map((res) => (
                <button
                  key={res.targetNodeId}
                  onClick={() => onSelectNode(res.targetNodeId)}
                  className={`w-full text-left px-2 py-1.5 rounded border transition-colors ${
                    darkMode
                      ? 'bg-slate-950/60 border-slate-800 hover:border-sky-500/60'
                      : 'bg-white border-slate-200 hover:border-sky-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-mono-tabular font-semibold ${textMain}`}>
                      {res.targetCode}
                    </span>
                    <span className="text-[10px]">{statusBadge(res.status)}</span>
                  </div>
                  <div className={`mt-0.5 flex justify-between text-[10px] font-mono-tabular ${textMuted}`}>
                    <span>
                      Rx: {res.receivedPowerDownDbm > -90 ? `${res.receivedPowerDownDbm.toFixed(1)} dBm` : '--'}
                    </span>
                    <span>
                      Loss: {res.totalLossDownDb.toFixed(1)} dB · Margin: {res.opticalMarginDownDb > -90 ? `${res.opticalMarginDownDb.toFixed(1)} dB` : '--'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
