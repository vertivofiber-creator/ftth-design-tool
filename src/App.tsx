import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AutoDesignConfig,
  CableToolConfig,
  CadLayer,
  ComponentProperties,
  DrawingTool,
  FiberConnection,
  FtthComponentType,
  FtthNode,
  FtthProject,
  LayerId,
  ProjectSettings,
  WorkspaceMode,
} from './types/ftth';
import {
  CABLE_TYPE_DEFAULTS,
  CATALOG_MAP,
  DEFAULT_CABLE_TOOL,
  createNodeFromCatalog,
} from './data/componentCatalog';
import { createBlankFtthProject, createSampleFtthProject } from './data/sampleProject';
import {
  auditAllOnus,
  calculateOpticalPathForNode,
  computeConnectionSchematicLengthM,
  computeGeoPathLengthMeters,
} from './utils/opticalCalculator';
import { generateAutoFtthNetwork } from './utils/autoNetworkDesigner';
import {
  PdfPrintOptions,
  exportDxf,
  exportGeoJson,
  exportKml,
  exportPdf,
  exportPng,
  exportProjectJson,
  exportSvg,
} from './utils/exportUtils';
import { parseGeoJsonToProjectItems, parseKmlToProjectItems } from './utils/gisImportUtils';
import { TopToolbar } from './components/TopToolbar';
import { LeftToolbox } from './components/LeftToolbox';
import { CadCanvas } from './components/CadCanvas';
import { GisMapCanvas } from './components/GisMapCanvas';
import { RightInspector } from './components/RightInspector';
import { BottomStatusBar } from './components/BottomStatusBar';
import {
  AutoDesignModal,
  PdfExportModal,
  ProjectSettingsModal,
  SavedProjectsModal,
} from './components/Modals';

const LOCAL_AUTOSAVE_KEY = 'fibercad_autosave_v2';

function loadInitialProject(): FtthProject {
  try {
    const raw = localStorage.getItem(LOCAL_AUTOSAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FtthProject;
      if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.connections)) {
        return parsed;
      }
    }
  } catch {
    // Fallback to sample project
  }
  return createSampleFtthProject();
}

export default function App() {
  const [project, setProject] = useState<FtthProject>(loadInitialProject);
  const [history, setHistory] = useState<FtthProject[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('schematic');
  const [activeTool, setActiveTool] = useState<DrawingTool>('select');
  const [cableConfig, setCableConfig] = useState<CableToolConfig>(DEFAULT_CABLE_TOOL);
  const [darkMode, setDarkMode] = useState(true);

  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<FtthNode[]>([]);
  const [gisPlaceType, setGisPlaceType] = useState<FtthComponentType | null>(null);

  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [cursorCoords, setCursorCoords] = useState({ x: 0, y: 0 });

  // Modals
  const [autoDesignOpen, setAutoDesignOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [projectsModalOpen, setProjectsModalOpen] = useState(false);
  const [savedList, setSavedList] = useState<
    Array<{ id: string; name: string; code: string; updatedAt: string; nodeCount: number }>
  >([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Toast notification
  const [toast, setToast] = useState<{ msg: string; tone: 'info' | 'warn' | 'error' } | null>(null);
  const notify = useCallback((msg: string, tone: 'info' | 'warn' | 'error' = 'info') => {
    setToast({ msg, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Toggle dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  // Autosave to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_AUTOSAVE_KEY, JSON.stringify(project));
    } catch {
      // Ignore quota errors
    }
  }, [project]);

  // Initialize history stack on first mount
  useEffect(() => {
    setHistory([project]);
    setHistoryIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitProject = useCallback(
    (updater: (prev: FtthProject) => FtthProject, pushHistory = true) => {
      setProject((prev) => {
        const next = {
          ...updater(prev),
          updatedAt: new Date().toISOString(),
        };
        if (pushHistory) {
          setHistory((h) => [...h.slice(0, historyIndex + 1), next].slice(-50));
          setHistoryIndex((idx) => Math.min(49, idx + 1));
        }
        return next;
      });
    },
    [historyIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const nextIdx = historyIndex - 1;
    setHistoryIndex(nextIdx);
    setProject(history[nextIdx]);
    setSelectedNodeIds([]);
    setSelectedConnectionId(null);
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIdx = historyIndex + 1;
    setHistoryIndex(nextIdx);
    setProject(history[nextIdx]);
    setSelectedNodeIds([]);
    setSelectedConnectionId(null);
  }, [history, historyIndex]);

  // Optical path calculation for single selected node
  const highlightedPath = useMemo(() => {
    if (selectedNodeIds.length !== 1) return null;
    return calculateOpticalPathForNode(
      selectedNodeIds[0],
      project.nodes,
      project.connections,
      project.settings
    );
  }, [selectedNodeIds, project.nodes, project.connections, project.settings]);

  // Insert component (click or drop)
  const insertComponentAt = useCallback(
    (type: FtthComponentType, x: number, y: number, lat?: number, lng?: number) => {
      const [baseLat, baseLng] = project.settings.gisCenter;
      const nodeLat = lat ?? baseLat + (300 - y) / 55000;
      const nodeLng = lng ?? baseLng + (x - 400) / 55000;
      const node = createNodeFromCatalog(
        type,
        x,
        y,
        project.nodes.length + 1,
        nodeLat,
        nodeLng
      );
      commitProject((prev) => ({
        ...prev,
        nodes: [...prev.nodes, node],
      }));
      setSelectedNodeIds([node.id]);
      setSelectedConnectionId(null);
      return node;
    },
    [project.nodes.length, project.settings.gisCenter, commitProject]
  );

  const handleToolboxInsert = (type: FtthComponentType) => {
    if (workspaceMode === 'gis') {
      setGisPlaceType(type);
      notify(`Click on the map to place ${type.replace(/_/g, ' ').toUpperCase()}.`);
      return;
    }
    const offset = (project.nodes.length % 6) * 28;
    const centerX = Math.round((420 - pan.x) / zoom + offset);
    const centerY = Math.round((240 - pan.y) / zoom + offset);
    insertComponentAt(type, centerX, centerY);
  };

  const handleCreateConnection = useCallback(
    (
      sourceNodeId: string,
      sourcePortId: string,
      targetNodeId: string,
      targetPortId: string,
      waypoints: Array<{ x: number; y: number }>,
      overrideGeoPath?: Array<[number, number]>,
      overrideLenM?: number,
      geoRouteMode?: 'auto_street' | 'manual'
    ) => {
      const src = project.nodes.find((n) => n.id === sourceNodeId);
      const dst = project.nodes.find((n) => n.id === targetNodeId);
      if (!src || !dst) return;

      const srcPortObj = src.outputPorts.find((p) => p.id === sourcePortId);
      const dstPortObj = dst.inputPorts.find((p) => p.id === targetPortId);
      const def = CABLE_TYPE_DEFAULTS[cableConfig.cableType];
      const seq = project.connections.length + 1;
      const cableId = `${cableConfig.cableType.slice(0, 3).toUpperCase()}-${String(seq).padStart(2, '0')}`;

      const nodesMap = new Map(project.nodes.map((n) => [n.id, n]));
      const draftConn: FiberConnection = {
        id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        cableId,
        fiberId: `F1${cableConfig.coreCapacity > 1 ? `-F${cableConfig.coreCapacity}` : ''}`,
        sourceNodeId,
        sourcePortId,
        targetNodeId,
        targetPortId,
        cableType: cableConfig.cableType,
        coreCapacity: cableConfig.coreCapacity,
        color: srcPortObj?.color || dstPortObj?.color || cableConfig.color,
        routeType: cableConfig.routeType,
        installationMethod: cableConfig.installationMethod,
        fiberStandard: cableConfig.fiberStandard,
        routingStyle: cableConfig.routingStyle,
        lengthMeters: overrideLenM ?? 100,
        autoCalculateLength: overrideLenM === undefined,
        attenuationDownDbPerKm: def.attenDown,
        attenuationUpDbPerKm: def.attenUp,
        spliceCount: cableConfig.cableType === 'patch' ? 0 : 2,
        spliceLossDb: 0.05,
        connectorCount: 1,
        connectorLossDb: 0.35,
        layerId: def.layerId,
        waypoints,
        geoPath: overrideGeoPath ?? [
          [src.lat, src.lng],
          [dst.lat, dst.lng],
        ],
        geoRouteMode: geoRouteMode ?? 'auto_street',
      };

      if (draftConn.autoCalculateLength) {
        draftConn.lengthMeters = computeConnectionSchematicLengthM(
          draftConn,
          nodesMap,
          project.settings.metersPerPixel
        );
      }

      commitProject((prev) => ({
        ...prev,
        connections: [...prev.connections, draftConn],
      }));
      setSelectedConnectionId(draftConn.id);
      setSelectedNodeIds([]);
    },
    [project.nodes, project.connections.length, project.settings.metersPerPixel, cableConfig, commitProject]
  );

  // Move / Resize / Rotate
  const handleMoveNodes = useCallback(
    (updates: Array<{ id: string; x: number; y: number }>, commitHistoryFlag: boolean) => {
      const map = new Map(updates.map((u) => [u.id, u]));
      commitProject(
        (prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => {
            const u = map.get(n.id);
            return u ? { ...n, x: u.x, y: u.y } : n;
          }),
        }),
        commitHistoryFlag
      );
    },
    [commitProject]
  );

  const handleResizeNode = useCallback(
    (id: string, width: number, height: number, commitHistoryFlag: boolean) => {
      commitProject(
        (prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === id ? { ...n, width, height } : n)),
        }),
        commitHistoryFlag
      );
    },
    [commitProject]
  );

  const handleRotateNode = useCallback(
    (id: string, rotation: number, commitHistoryFlag: boolean) => {
      commitProject(
        (prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === id ? { ...n, rotation } : n)),
        }),
        commitHistoryFlag
      );
    },
    [commitProject]
  );

  // Copy / Paste / Delete / SelectAll / Group / Align
  const handleCopy = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    const copied = project.nodes.filter((n) => selectedNodeIds.includes(n.id));
    setClipboard(copied);
    notify(`Copied ${copied.length} component(s).`);
  }, [selectedNodeIds, project.nodes, notify]);

  const handlePaste = useCallback(() => {
    if (clipboard.length === 0) return;
    const pasted = clipboard.map((n, idx) => ({
      ...n,
      id: `node-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      code: `${n.code}-CPY`,
      x: n.x + 40,
      y: n.y + 40,
      lat: n.lat + 0.0002,
      lng: n.lng + 0.0002,
    }));
    commitProject((prev) => ({
      ...prev,
      nodes: [...prev.nodes, ...pasted],
    }));
    setSelectedNodeIds(pasted.map((p) => p.id));
  }, [clipboard, commitProject]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedConnectionId) {
      commitProject((prev) => ({
        ...prev,
        connections: prev.connections.filter((c) => c.id !== selectedConnectionId),
      }));
      setSelectedConnectionId(null);
      return;
    }
    if (selectedNodeIds.length === 0) return;
    const delSet = new Set(selectedNodeIds);
    commitProject((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => !delSet.has(n.id)),
      connections: prev.connections.filter(
        (c) => !delSet.has(c.sourceNodeId) && !delSet.has(c.targetNodeId)
      ),
    }));
    setSelectedNodeIds([]);
  }, [selectedConnectionId, selectedNodeIds, commitProject]);

  const handleAlignNodes = useCallback(
    (mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
      if (selectedNodeIds.length < 2) {
        notify('Select 2 or more components to align.', 'warn');
        return;
      }
      const sel = project.nodes.filter((n) => selectedNodeIds.includes(n.id));
      const minX = Math.min(...sel.map((n) => n.x));
      const maxX = Math.max(...sel.map((n) => n.x + n.width));
      const minY = Math.min(...sel.map((n) => n.y));
      const maxY = Math.max(...sel.map((n) => n.y + n.height));
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      commitProject((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => {
          if (!selectedNodeIds.includes(n.id)) return n;
          if (mode === 'left') return { ...n, x: minX };
          if (mode === 'center') return { ...n, x: Math.round(midX - n.width / 2) };
          if (mode === 'right') return { ...n, x: maxX - n.width };
          if (mode === 'top') return { ...n, y: minY };
          if (mode === 'middle') return { ...n, y: Math.round(midY - n.height / 2) };
          return { ...n, y: maxY - n.height };
        }),
      }));
    },
    [selectedNodeIds, project.nodes, commitProject, notify]
  );

  const handleGroupSelected = useCallback(() => {
    if (selectedNodeIds.length < 2) return;
    const gid = `grp-${Date.now()}`;
    commitProject((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        selectedNodeIds.includes(n.id) ? { ...n, groupId: gid } : n
      ),
    }));
    notify(`Grouped ${selectedNodeIds.length} components.`);
  }, [selectedNodeIds, commitProject, notify]);

  const handleUngroupSelected = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    commitProject((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        selectedNodeIds.includes(n.id) ? { ...n, groupId: undefined } : n
      ),
    }));
    notify('Ungrouped selected components.');
  }, [selectedNodeIds, commitProject, notify]);

  // Backend Save & Open
  const handleSaveToServer = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      if (!res.ok) throw new Error('Save failed');
      notify(`Saved "${project.settings.projectName}" to workspace.`);
    } catch {
      // Fallback still persists in localStorage
      notify('Saved locally (browser storage).', 'warn');
    }
  }, [project, notify]);

  const fetchSavedProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const list = await res.json();
        setSavedList(list);
      }
    } catch {
      setSavedList([]);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const handleLoadProjectById = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Failed to open');
      const loaded = (await res.json()) as FtthProject;
      setProject(loaded);
      setHistory([loaded]);
      setHistoryIndex(0);
      setSelectedNodeIds([]);
      setSelectedConnectionId(null);
      notify(`Opened "${loaded.settings.projectName}".`);
    } catch {
      notify('Could not open project.', 'error');
    }
  };

  const handleDeleteProjectById = async (id: string) => {
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      setSavedList((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // ignore
    }
  };

  // Zoom to fit all nodes
  const handleZoomFit = useCallback(() => {
    if (project.nodes.length === 0) {
      setZoom(1);
      setPan({ x: 40, y: 40 });
      return;
    }
    const minX = Math.min(...project.nodes.map((n) => n.x));
    const minY = Math.min(...project.nodes.map((n) => n.y));
    const maxX = Math.max(...project.nodes.map((n) => n.x + n.width));
    const maxY = Math.max(...project.nodes.map((n) => n.y + n.height));
    const w = Math.max(300, maxX - minX + 120);
    const h = Math.max(250, maxY - minY + 120);
    const viewportW = Math.max(400, window.innerWidth - 610);
    const viewportH = Math.max(300, window.innerHeight - 130);
    const nextZ = Math.min(1.5, Math.max(0.25, Math.min(viewportW / w, viewportH / h)));
    setZoom(Number(nextZ.toFixed(2)));
    setPan({
      x: Math.round((viewportW - (maxX - minX) * nextZ) / 2 - minX * nextZ),
      y: Math.round((viewportH - (maxY - minY) * nextZ) / 2 - minY * nextZ),
    });
  }, [project.nodes]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopy();
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePaste();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveToServer();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedNodeIds(project.nodes.map((n) => n.id));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      } else if (e.key.toLowerCase() === 'v') {
        setActiveTool('select');
      } else if (e.key.toLowerCase() === 'h') {
        setActiveTool('pan');
      } else if (e.key.toLowerCase() === 'f') {
        setActiveTool('cable');
      } else if (e.key.toLowerCase() === 'm') {
        setActiveTool('measure');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    handleUndo,
    handleRedo,
    handleCopy,
    handlePaste,
    handleSaveToServer,
    handleDeleteSelected,
    project.nodes,
  ]);

  const handleAutoGenerate = (cfg: AutoDesignConfig, replaceExisting: boolean) => {
    const generated = generateAutoFtthNetwork(cfg, project.settings);
    commitProject((prev) => ({
      ...prev,
      nodes: replaceExisting ? generated.nodes : [...prev.nodes, ...generated.nodes],
      connections: replaceExisting
        ? generated.connections
        : [...prev.connections, ...generated.connections],
    }));
    setSelectedNodeIds([]);
    setSelectedConnectionId(null);
    notify(
      `Generated ${cfg.architecture.replace('_', ' ')} FTTH topology (${generated.nodes.length} components, ${generated.connections.length} fiber links).`
    );
  };

  const handleValidateNetwork = () => {
    const audits = auditAllOnus(project.nodes, project.connections, project.settings);
    if (audits.length === 0) {
      notify('No ONUs/ONTs found to validate.', 'warn');
      return;
    }
    const ok = audits.filter((a) => a.status === 'normal').length;
    const warn = audits.filter((a) => a.status === 'low_margin').length;
    const bad = audits.length - ok - warn;
    notify(
      `Optical Validation: ${ok} Nominal · ${warn} Low Margin · ${bad} Fault/Disconnected`,
      bad > 0 ? 'error' : warn > 0 ? 'warn' : 'info'
    );
  };

  const handleImportProjectFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as FtthProject;
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.connections)) {
        throw new Error('Invalid project file');
      }
      setProject(parsed);
      setHistory([parsed]);
      setHistoryIndex(0);
      notify(`Loaded "${parsed.settings?.projectName || file.name}".`);
    } catch {
      notify('Invalid .fibercad.json project file.', 'error');
    }
  };

  const handleImportGisFile = async (file: File) => {
    try {
      const text = await file.text();
      const [lat, lng] = project.settings.gisCenter;
      const imported = file.name.toLowerCase().endsWith('.kml')
        ? parseKmlToProjectItems(text, lat, lng, project.nodes.length + 1)
        : parseGeoJsonToProjectItems(text, lat, lng, project.nodes.length + 1);
      commitProject((prev) => ({
        ...prev,
        nodes: [...prev.nodes, ...imported.nodes],
        connections: [...prev.connections, ...imported.connections],
      }));
      notify(
        `Imported ${imported.nodes.length} GIS nodes and ${imported.connections.length} fiber routes.`
      );
    } catch {
      notify('Failed to parse GIS file (GeoJSON or KML expected).', 'error');
    }
  };

  const selectedNodes = useMemo(
    () => project.nodes.filter((n) => selectedNodeIds.includes(n.id)),
    [project.nodes, selectedNodeIds]
  );

  const selectedConnection = useMemo(
    () => project.connections.find((c) => c.id === selectedConnectionId) || null,
    [project.connections, selectedConnectionId]
  );

  return (
    <div
      className={`h-screen w-screen flex flex-col overflow-hidden ${
        darkMode ? 'bg-[#0B0F17] text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      <TopToolbar
        projectName={project.settings.projectName}
        workspaceMode={workspaceMode}
        settings={project.settings}
        zoom={zoom}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        darkMode={darkMode}
        onNewBlank={() => {
          const blank = createBlankFtthProject();
          setProject(blank);
          setHistory([blank]);
          setHistoryIndex(0);
          setSelectedNodeIds([]);
          setSelectedConnectionId(null);
          notify('Created blank FTTH drawing.');
        }}
        onLoadSample={() => {
          const sample = createSampleFtthProject();
          setProject(sample);
          setHistory([sample]);
          setHistoryIndex(0);
          setSelectedNodeIds([]);
          setSelectedConnectionId(null);
          notify('Loaded Metro FTTH Sector 04 sample network.');
        }}
        onOpenProjectsModal={() => {
          setProjectsModalOpen(true);
          fetchSavedProjects();
        }}
        onSaveToServer={handleSaveToServer}
        onImportProjectFile={handleImportProjectFile}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDelete={handleDeleteSelected}
        onSelectAll={() => setSelectedNodeIds(project.nodes.map((n) => n.id))}
        onGroup={handleGroupSelected}
        onUngroup={handleUngroupSelected}
        onToggleWorkspaceMode={(m) => {
          setWorkspaceMode(m);
          setGisPlaceType(null);
        }}
        onUpdateSettings={(patch: Partial<ProjectSettings>) =>
          commitProject((prev) => ({
            ...prev,
            settings: { ...prev.settings, ...patch },
          }))
        }
        onZoomIn={() => setZoom((z) => Math.min(4, Number((z * 1.15).toFixed(2))))}
        onZoomOut={() => setZoom((z) => Math.max(0.15, Number((z / 1.15).toFixed(2))))}
        onZoomFit={handleZoomFit}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        onSelectTool={setActiveTool}
        onInsertComponent={handleToolboxInsert}
        onOpenAutoDesign={() => setAutoDesignOpen(true)}
        onValidateNetwork={handleValidateNetwork}
        onAlign={handleAlignNodes}
        onOpenSettingsModal={() => setSettingsModalOpen(true)}
        onExportJson={() => exportProjectJson(project)}
        onOpenPdfModal={() => setPdfModalOpen(true)}
        onExportSvg={() => exportSvg(project)}
        onExportPng={() => exportPng(project)}
        onExportDxf={() => exportDxf(project)}
        onExportGeoJson={() => exportGeoJson(project)}
        onExportKml={() => exportKml(project)}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <LeftToolbox
          activeTool={activeTool}
          workspaceMode={workspaceMode}
          cableConfig={cableConfig}
          layers={project.layers}
          darkMode={darkMode}
          onSelectTool={setActiveTool}
          onUpdateCableConfig={(patch) => setCableConfig((prev) => ({ ...prev, ...patch }))}
          onInsertComponent={handleToolboxInsert}
          onUpdateLayer={(id: LayerId, patch: Partial<CadLayer>) =>
            commitProject((prev) => ({
              ...prev,
              layers: prev.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
            }))
          }
        />

        <main className="flex-1 min-w-0 h-full relative">
          {workspaceMode === 'schematic' ? (
            <CadCanvas
              nodes={project.nodes}
              connections={project.connections}
              layers={project.layers}
              settings={project.settings}
              activeTool={activeTool}
              cableConfig={cableConfig}
              selectedNodeIds={selectedNodeIds}
              selectedConnectionId={selectedConnectionId}
              highlightedPath={highlightedPath}
              zoom={zoom}
              pan={pan}
              darkMode={darkMode}
              onZoomChange={setZoom}
              onPanChange={setPan}
              onCursorCoords={setCursorCoords}
              onSelectNodes={setSelectedNodeIds}
              onSelectConnection={setSelectedConnectionId}
              onMoveNodes={handleMoveNodes}
              onResizeNode={handleResizeNode}
              onRotateNode={handleRotateNode}
              onDropComponent={(type, x, y) => insertComponentAt(type, x, y)}
              onCreateConnection={(sn, sp, tn, tp, wp) =>
                handleCreateConnection(sn, sp, tn, tp, wp)
              }
              onPlaceAnnotation={(type, x, y) => {
                insertComponentAt(type, x, y);
                setActiveTool('select');
              }}
              onNotify={notify}
            />
          ) : (
            <GisMapCanvas
              nodes={project.nodes}
              connections={project.connections}
              layers={project.layers}
              settings={project.settings}
              activeTool={activeTool}
              cableConfig={cableConfig}
              selectedNodeIds={selectedNodeIds}
              selectedConnectionId={selectedConnectionId}
              highlightedPath={highlightedPath}
              placeComponentType={gisPlaceType}
              onClearPlaceComponentType={() => setGisPlaceType(null)}
              onSelectNodes={setSelectedNodeIds}
              onSelectConnection={setSelectedConnectionId}
              onMoveNodeGeo={(id, lat, lng) => {
                commitProject((prev) => ({
                  ...prev,
                  nodes: prev.nodes.map((n) => (n.id === id ? { ...n, lat, lng } : n)),
                  connections: prev.connections.map((c) => {
                    if (c.locked) return c;
                    if (c.sourceNodeId !== id && c.targetNodeId !== id) return c;
                    const path = [...c.geoPath];
                    if (path.length >= 2) {
                      if (c.sourceNodeId === id) path[0] = [lat, lng];
                      if (c.targetNodeId === id) path[path.length - 1] = [lat, lng];
                      return {
                        ...c,
                        geoPath: path,
                        lengthMeters: computeGeoPathLengthMeters(path),
                        autoCalculateLength: false,
                      };
                    }
                    return c;
                  }),
                }));
              }}
              onPlaceNodeAtGeo={(type, lat, lng) => {
                const [baseLat, baseLng] = project.settings.gisCenter;
                const x = Math.round(400 + (lng - baseLng) * 55000);
                const y = Math.round(350 - (lat - baseLat) * 55000);
                insertComponentAt(type, x, y, lat, lng);
              }}
              onCreateGeoConnection={(srcId, dstId, geoPath, lengthM, geoRouteMode) => {
                const src = project.nodes.find((n) => n.id === srcId);
                const dst = project.nodes.find((n) => n.id === dstId);
                if (!src || !dst) return;
                const srcPort = src.outputPorts[0]?.id || 'out-1';
                const dstPort = dst.inputPorts[0]?.id || 'in-1';
                handleCreateConnection(
                  srcId,
                  srcPort,
                  dstId,
                  dstPort,
                  [],
                  geoPath,
                  lengthM,
                  geoRouteMode
                );
              }}
              onUpdateConnection={(id, patch) =>
                commitProject((prev) => ({
                  ...prev,
                  connections: prev.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)),
                }))
              }
              onUpdateConnectionsBatch={(updates) => {
                const map = new Map(updates.map((u) => [u.id, u.patch]));
                commitProject((prev) => ({
                  ...prev,
                  connections: prev.connections.map((c) => {
                    const patch = map.get(c.id);
                    return patch ? { ...c, ...patch } : c;
                  }),
                }));
              }}
              onImportGisFile={handleImportGisFile}
              onExportGeoJson={() => exportGeoJson(project)}
              onExportKml={() => exportKml(project)}
              onNotify={notify}
            />
          )}

          {/* Toast Notification */}
          {toast && (
            <div
              className={`absolute bottom-4 right-4 z-[600] px-3.5 py-2 rounded-md border text-xs shadow-xl ${
                toast.tone === 'error'
                  ? 'bg-rose-950/95 border-rose-500 text-rose-100'
                  : toast.tone === 'warn'
                  ? 'bg-amber-950/95 border-amber-500 text-amber-100'
                  : 'bg-slate-900/95 border-sky-500/60 text-slate-100'
              }`}
            >
              {toast.msg}
            </div>
          )}
        </main>

        <RightInspector
          nodes={project.nodes}
          connections={project.connections}
          layers={project.layers}
          settings={project.settings}
          selectedNodeIds={selectedNodeIds}
          selectedConnectionId={selectedConnectionId}
          selectedOpticalPath={highlightedPath}
          darkMode={darkMode}
          onUpdateNode={(id, patch, commitHistoryFlag = true) =>
            commitProject(
              (prev) => ({
                ...prev,
                nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
              }),
              commitHistoryFlag
            )
          }
          onUpdateNodeProperties={(id, patch: Partial<ComponentProperties>, commitHistoryFlag = true) =>
            commitProject(
              (prev) => ({
                ...prev,
                nodes: prev.nodes.map((n) =>
                  n.id === id ? { ...n, properties: { ...n.properties, ...patch } } : n
                ),
              }),
              commitHistoryFlag
            )
          }
          onUpdateConnection={(id, patch) =>
            commitProject((prev) => ({
              ...prev,
              connections: prev.connections.map((c) => (c.id === id ? { ...c, ...patch } : c)),
            }))
          }
          onDeleteSelected={handleDeleteSelected}
          onDeleteConnection={(id) => {
            commitProject((prev) => ({
              ...prev,
              connections: prev.connections.filter((c) => c.id !== id),
            }));
            if (selectedConnectionId === id) setSelectedConnectionId(null);
          }}
          onRemovePort={(nodeId, direction, portId) => {
            commitProject((prev) => ({
              ...prev,
              nodes: prev.nodes.map((n) => {
                if (n.id !== nodeId) return n;
                const nextIn =
                  direction === 'in'
                    ? n.inputPorts.filter((p) => p.id !== portId)
                    : n.inputPorts;
                const nextOut =
                  direction === 'out'
                    ? n.outputPorts.filter((p) => p.id !== portId)
                    : n.outputPorts;
                const defaultH = CATALOG_MAP[n.type]?.defaultHeight ?? 58;
                const neededH = Math.max(nextIn.length, nextOut.length) * 16 + 24;
                return {
                  ...n,
                  inputPorts: nextIn,
                  outputPorts: nextOut,
                  height: Math.max(defaultH, neededH),
                };
              }),
              connections: prev.connections.filter((c) =>
                direction === 'in'
                  ? !(c.targetNodeId === nodeId && c.targetPortId === portId)
                  : !(c.sourceNodeId === nodeId && c.sourcePortId === portId)
              ),
            }));
          }}
          onUpdatePortColor={(nodeId, direction, portId, color) => {
            commitProject((prev) => ({
              ...prev,
              nodes: prev.nodes.map((n) => {
                if (n.id !== nodeId) return n;
                return {
                  ...n,
                  inputPorts:
                    direction === 'in'
                      ? n.inputPorts.map((p) => (p.id === portId ? { ...p, color } : p))
                      : n.inputPorts,
                  outputPorts:
                    direction === 'out'
                      ? n.outputPorts.map((p) => (p.id === portId ? { ...p, color } : p))
                      : n.outputPorts,
                };
              }),
              connections: color
                ? prev.connections.map((c) => {
                    const match =
                      direction === 'in'
                        ? c.targetNodeId === nodeId && c.targetPortId === portId
                        : c.sourceNodeId === nodeId && c.sourcePortId === portId;
                    return match ? { ...c, color } : c;
                  })
                : prev.connections,
            }));
          }}
          onAlignNodes={handleAlignNodes}
          onGroupSelected={handleGroupSelected}
          onUngroupSelected={handleUngroupSelected}
          onSelectNode={(id) => {
            setSelectedNodeIds([id]);
            setSelectedConnectionId(null);
          }}
        />
      </div>

      <BottomStatusBar
        cursorCoords={cursorCoords}
        settings={project.settings}
        zoom={zoom}
        workspaceMode={workspaceMode}
        selectedNodes={selectedNodes}
        selectedConnection={selectedConnection}
        highlightedPath={highlightedPath}
        darkMode={darkMode}
      />

      {/* Modals */}
      <AutoDesignModal
        open={autoDesignOpen}
        darkMode={darkMode}
        onClose={() => setAutoDesignOpen(false)}
        onGenerate={handleAutoGenerate}
      />
      <PdfExportModal
        open={pdfModalOpen}
        darkMode={darkMode}
        onClose={() => setPdfModalOpen(false)}
        onExportPdf={(opts: PdfPrintOptions) => exportPdf(project, opts)}
        onExportSvg={() => exportSvg(project)}
        onExportPng={() => exportPng(project)}
        onExportDxf={() => exportDxf(project)}
      />
      <ProjectSettingsModal
        open={settingsModalOpen}
        darkMode={darkMode}
        settings={project.settings}
        onClose={() => setSettingsModalOpen(false)}
        onSave={(patch) =>
          commitProject((prev) => ({
            ...prev,
            settings: { ...prev.settings, ...patch },
          }))
        }
      />
      <SavedProjectsModal
        open={projectsModalOpen}
        darkMode={darkMode}
        projects={savedList}
        loading={loadingProjects}
        onClose={() => setProjectsModalOpen(false)}
        onLoadProject={handleLoadProjectById}
        onDeleteProject={handleDeleteProjectById}
      />
    </div>
  );
}
