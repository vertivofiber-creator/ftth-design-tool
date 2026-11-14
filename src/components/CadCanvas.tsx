import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CableToolConfig,
  CadLayer,
  DrawingTool,
  FiberConnection,
  FtthComponentType,
  FtthNode,
  OpticalPathResult,
  ProjectSettings,
} from '../types/ftth';
import { getPortWorldPosition } from '../data/componentCatalog';
import {
  auditAllOnus,
  calculateAllPortOpticalLevels,
  computeConnectionSchematicLengthM,
  isCustomerOnu,
} from '../utils/opticalCalculator';
import { TelecomSymbol } from './TelecomSymbol';
import { Lock } from 'lucide-react';

interface CadCanvasProps {
  nodes: FtthNode[];
  connections: FiberConnection[];
  layers: CadLayer[];
  settings: ProjectSettings;
  activeTool: DrawingTool;
  cableConfig: CableToolConfig;
  selectedNodeIds: string[];
  selectedConnectionId: string | null;
  highlightedPath: OpticalPathResult | null;
  zoom: number;
  pan: { x: number; y: number };
  darkMode: boolean;
  onZoomChange: (z: number) => void;
  onPanChange: (p: { x: number; y: number }) => void;
  onCursorCoords: (pt: { x: number; y: number }) => void;
  onSelectNodes: (ids: string[]) => void;
  onSelectConnection: (id: string | null) => void;
  onMoveNodes: (updates: Array<{ id: string; x: number; y: number }>, commitHistory: boolean) => void;
  onResizeNode: (id: string, width: number, height: number, commitHistory: boolean) => void;
  onRotateNode: (id: string, rotation: number, commitHistory: boolean) => void;
  onDropComponent: (type: FtthComponentType, x: number, y: number) => void;
  onCreateConnection: (
    sourceNodeId: string,
    sourcePortId: string,
    targetNodeId: string,
    targetPortId: string,
    waypoints: Array<{ x: number; y: number }>
  ) => void;
  onPlaceAnnotation: (type: 'text_label' | 'note_box', x: number, y: number) => void;
  onNotify: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
}

interface PortRef {
  nodeId: string;
  portId: string;
  direction: 'in' | 'out' | 'bi';
  x: number;
  y: number;
}

export const CadCanvas: React.FC<CadCanvasProps> = ({
  nodes,
  connections,
  layers,
  settings,
  activeTool,
  cableConfig,
  selectedNodeIds,
  selectedConnectionId,
  highlightedPath,
  zoom,
  pan,
  darkMode,
  onZoomChange,
  onPanChange,
  onCursorCoords,
  onSelectNodes,
  onSelectConnection,
  onMoveNodes,
  onResizeNode,
  onRotateNode,
  onDropComponent,
  onCreateConnection,
  onPlaceAnnotation,
  onNotify,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const [mouseWorld, setMouseWorld] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredPort, setHoveredPort] = useState<PortRef | null>(null);

  // Active interactions
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);

  const [dragState, setDragState] = useState<{
    startWorldX: number;
    startWorldY: number;
    origins: Array<{ id: string; x: number; y: number }>;
  } | null>(null);

  const [resizeState, setResizeState] = useState<{
    nodeId: string;
    startWorldX: number;
    startWorldY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const [rotateState, setRotateState] = useState<{
    nodeId: string;
    centerX: number;
    centerY: number;
  } | null>(null);

  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    currX: number;
    currY: number;
  } | null>(null);

  // Cable drawing state
  const [cableDraft, setCableDraft] = useState<{
    source: PortRef;
    waypoints: Array<{ x: number; y: number }>;
  } | null>(null);

  // Measurement tool state
  const [measurePoints, setMeasurePoints] = useState<Array<{ x: number; y: number }>>([]);

  const layerMap = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);
  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const portLevels = useMemo(
    () => calculateAllPortOpticalLevels(nodes, connections, settings),
    [nodes, connections, settings]
  );
  const onuAuditById = useMemo(() => {
    const map = new Map<string, OpticalPathResult>();
    for (const res of auditAllOnus(nodes, connections, settings)) {
      map.set(res.targetNodeId, res);
    }
    return map;
  }, [nodes, connections, settings]);

  const visibleNodes = useMemo(
    () => nodes.filter((n) => layerMap.get(n.layerId)?.visible !== false),
    [nodes, layerMap]
  );

  const visibleConnections = useMemo(
    () => connections.filter((c) => layerMap.get(c.layerId)?.visible !== false),
    [connections, layerMap]
  );

  const snapVal = useCallback(
    (v: number) => {
      if (!settings.snapToGrid) return Math.round(v);
      const g = Math.max(5, settings.gridSizePx);
      return Math.round(v / g) * g;
    },
    [settings.snapToGrid, settings.gridSizePx]
  );

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const rulerOffset = settings.showRulers ? 24 : 0;
      const sx = clientX - rect.left - rulerOffset;
      const sy = clientY - rect.top - rulerOffset;
      return {
        x: (sx - pan.x) / zoom,
        y: (sy - pan.y) / zoom,
      };
    },
    [pan, zoom, settings.showRulers]
  );

  // Spacebar / Control pan shortcut & Escape cancellation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.ctrlKey) {
        setCtrlPressed(true);
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.code === 'Space') {
        setSpacePressed(true);
      } else if (e.key === 'Escape') {
        setCableDraft(null);
        setMeasurePoints([]);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || !e.ctrlKey) {
        setCtrlPressed(false);
      }
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };
    const onBlur = () => {
      setCtrlPressed(false);
      setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Mouse wheel zoom toward cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rulerOffset = settings.showRulers ? 24 : 0;
    const sx = e.clientX - rect.left - rulerOffset;
    const sy = e.clientY - rect.top - rulerOffset;

    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextZoom = Math.min(4, Math.max(0.15, Number((zoom * factor).toFixed(3))));
    const worldX = (sx - pan.x) / zoom;
    const worldY = (sy - pan.y) / zoom;
    onPanChange({
      x: sx - worldX * nextZoom,
      y: sy - worldY * nextZoom,
    });
    onZoomChange(nextZoom);
  };

  // Find nearest port within snap radius
  const findPortNear = useCallback(
    (wx: number, wy: number, radiusPx = 14): PortRef | null => {
      let best: PortRef | null = null;
      let bestDist = radiusPx / zoom;
      for (const n of visibleNodes) {
        for (const p of [...n.inputPorts, ...n.outputPorts]) {
          const pos = getPortWorldPosition(n, p.id);
          const d = Math.hypot(pos.x - wx, pos.y - wy);
          if (d <= bestDist) {
            bestDist = d;
            best = { nodeId: n.id, portId: p.id, direction: p.direction, x: pos.x, y: pos.y };
          }
        }
      }
      return best;
    },
    [visibleNodes, zoom]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    const world = screenToWorld(e.clientX, e.clientY);

    // Middle mouse, Spacebar, Control key, or Pan tool
    if (e.button === 1 || spacePressed || ctrlPressed || e.ctrlKey || activeTool === 'pan') {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { clientX: e.clientX, clientY: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }

    if (e.button !== 0) return;

    // Measurement tool
    if (activeTool === 'measure') {
      const pt = { x: snapVal(world.x), y: snapVal(world.y) };
      setMeasurePoints((prev) => [...prev, pt]);
      return;
    }

    // Text / Note placement
    if (activeTool === 'text' || activeTool === 'note') {
      onPlaceAnnotation(activeTool === 'text' ? 'text_label' : 'note_box', snapVal(world.x), snapVal(world.y));
      return;
    }

    // Cable tool click
    if (activeTool === 'cable') {
      const port = findPortNear(world.x, world.y, 18);
      if (port) {
        if (!cableDraft) {
          if (port.direction === 'in') {
            onNotify('Start fiber cable from an Output / PON port.', 'warn');
            return;
          }
          setCableDraft({ source: port, waypoints: [] });
          return;
        } else {
          if (port.nodeId === cableDraft.source.nodeId) {
            onNotify('Cannot connect a component back to itself.', 'error');
            return;
          }
          if (port.direction === 'out') {
            onNotify('Target must be an Input port (IN).', 'warn');
            return;
          }
          onCreateConnection(
            cableDraft.source.nodeId,
            cableDraft.source.portId,
            port.nodeId,
            port.portId,
            cableDraft.waypoints
          );
          setCableDraft(null);
          return;
        }
      } else if (cableDraft) {
        // Add bend waypoint
        setCableDraft((prev) =>
          prev
            ? { ...prev, waypoints: [...prev.waypoints, { x: snapVal(world.x), y: snapVal(world.y) }] }
            : null
        );
        return;
      }
    }

    // Check if clicked on empty canvas -> start marquee selection
    onSelectConnection(null);
    if (!e.shiftKey) {
      onSelectNodes([]);
    }
    setMarquee({ startX: world.x, startY: world.y, currX: world.x, currY: world.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const world = screenToWorld(e.clientX, e.clientY);
    setMouseWorld(world);
    onCursorCoords({ x: Math.round(world.x), y: Math.round(world.y) });

    if (isPanning && panStartRef.current) {
      onPanChange({
        x: panStartRef.current.panX + (e.clientX - panStartRef.current.clientX),
        y: panStartRef.current.panY + (e.clientY - panStartRef.current.clientY),
      });
      return;
    }

    if (dragState) {
      const dx = world.x - dragState.startWorldX;
      const dy = world.y - dragState.startWorldY;
      const updates = dragState.origins.map((o) => ({
        id: o.id,
        x: snapVal(o.x + dx),
        y: snapVal(o.y + dy),
      }));
      onMoveNodes(updates, false);
      return;
    }

    if (resizeState) {
      const dx = world.x - resizeState.startWorldX;
      const dy = world.y - resizeState.startWorldY;
      onResizeNode(
        resizeState.nodeId,
        Math.max(52, Math.round(resizeState.origW + dx)),
        Math.max(40, Math.round(resizeState.origH + dy)),
        false
      );
      return;
    }

    if (rotateState) {
      const angle =
        (Math.atan2(world.y - rotateState.centerY, world.x - rotateState.centerX) * 180) / Math.PI + 90;
      const snapped = e.shiftKey ? Math.round(angle / 15) * 15 : Math.round(angle);
      onRotateNode(rotateState.nodeId, ((snapped % 360) + 360) % 360, false);
      return;
    }

    if (marquee) {
      setMarquee((prev) => (prev ? { ...prev, currX: world.x, currY: world.y } : null));
      return;
    }

    // Hover port detection
    if (settings.snapToPorts || activeTool === 'cable') {
      setHoveredPort(findPortNear(world.x, world.y, 16));
    } else {
      setHoveredPort(null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }
    if (dragState) {
      const world = screenToWorld(e.clientX, e.clientY);
      const dx = world.x - dragState.startWorldX;
      const dy = world.y - dragState.startWorldY;
      const updates = dragState.origins.map((o) => ({
        id: o.id,
        x: snapVal(o.x + dx),
        y: snapVal(o.y + dy),
      }));
      onMoveNodes(updates, true);
      setDragState(null);
    }
    if (resizeState) {
      const node = nodesById.get(resizeState.nodeId);
      if (node) {
        onResizeNode(node.id, node.width, node.height, true);
      }
      setResizeState(null);
    }
    if (rotateState) {
      const node = nodesById.get(rotateState.nodeId);
      if (node) {
        onRotateNode(node.id, node.rotation, true);
      }
      setRotateState(null);
    }
    if (marquee) {
      const minX = Math.min(marquee.startX, marquee.currX);
      const maxX = Math.max(marquee.startX, marquee.currX);
      const minY = Math.min(marquee.startY, marquee.currY);
      const maxY = Math.max(marquee.startY, marquee.currY);
      if (maxX - minX > 6 || maxY - minY > 6) {
        const hitIds = visibleNodes
          .filter(
            (n) => n.x + n.width >= minX && n.x <= maxX && n.y + n.height >= minY && n.y <= maxY
          )
          .map((n) => n.id);
        onSelectNodes(hitIds);
      }
      setMarquee(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/fibercad-type') as FtthComponentType;
    if (!type) return;
    const world = screenToWorld(e.clientX, e.clientY);
    onDropComponent(type, snapVal(world.x - 45), snapVal(world.y - 35));
  };

  // Start drag or select node
  const handleNodeMouseDown = (e: React.MouseEvent, node: FtthNode) => {
    if (activeTool === 'pan' || spacePressed || ctrlPressed || e.ctrlKey || e.button === 1) return;
    if (activeTool === 'cable') return; // let port click handle cable
    e.stopPropagation();

    const layerLocked = layerMap.get(node.layerId)?.locked;
    if (node.locked || layerLocked) {
      onSelectNodes([node.id]);
      onSelectConnection(null);
      return;
    }

    let nextSelection = selectedNodeIds;
    if (e.shiftKey) {
      nextSelection = selectedNodeIds.includes(node.id)
        ? selectedNodeIds.filter((id) => id !== node.id)
        : [...selectedNodeIds, node.id];
    } else if (!selectedNodeIds.includes(node.id)) {
      // If node belongs to a group, select whole group
      if (node.groupId) {
        nextSelection = nodes.filter((n) => n.groupId === node.groupId).map((n) => n.id);
      } else {
        nextSelection = [node.id];
      }
    }

    onSelectNodes(nextSelection);
    onSelectConnection(null);

    const world = screenToWorld(e.clientX, e.clientY);
    const origins = nodes
      .filter((n) => nextSelection.includes(n.id) && !n.locked && !layerMap.get(n.layerId)?.locked)
      .map((n) => ({ id: n.id, x: n.x, y: n.y }));

    if (origins.length > 0) {
      setDragState({ startWorldX: world.x, startWorldY: world.y, origins });
    }
  };

  // Dragging directly from an output port starts a fiber cable even in Select mode
  const handlePortMouseDown = (e: React.MouseEvent, port: PortRef) => {
    if (e.button !== 0 || activeTool === 'pan' || spacePressed || ctrlPressed || e.ctrlKey) return;
    e.stopPropagation();
    if (!cableDraft) {
      if (port.direction === 'in') {
        onNotify('Start connection from an Output / PON port.', 'warn');
        return;
      }
      setCableDraft({ source: port, waypoints: [] });
    } else {
      if (port.nodeId === cableDraft.source.nodeId) {
        setCableDraft(null);
        return;
      }
      if (port.direction === 'out') {
        onNotify('Connect to an Input port (left side).', 'warn');
        return;
      }
      onCreateConnection(
        cableDraft.source.nodeId,
        cableDraft.source.portId,
        port.nodeId,
        port.portId,
        cableDraft.waypoints
      );
      setCableDraft(null);
    }
  };

  const buildPathD = (conn: FiberConnection) => {
    const src = nodesById.get(conn.sourceNodeId);
    const dst = nodesById.get(conn.targetNodeId);
    if (!src || !dst) return { d: '', mid: { x: 0, y: 0 }, angle: 0 };

    const p1 = getPortWorldPosition(src, conn.sourcePortId);
    const p2 = getPortWorldPosition(dst, conn.targetPortId);

    if (conn.waypoints.length > 0) {
      const pts = [p1, ...conn.waypoints, p2];
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const midIdx = Math.floor(pts.length / 2);
      const a = pts[midIdx - 1];
      const b = pts[midIdx];
      return {
        d,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      };
    }

    if (conn.routingStyle === 'straight') {
      return {
        d: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`,
        mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        angle: (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI,
      };
    }

    if (conn.routingStyle === 'curved') {
      const dx = Math.max(45, Math.abs(p2.x - p1.x) * 0.45);
      const d = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
      return {
        d,
        mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        angle: (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI,
      };
    }

    // Orthogonal Manhattan routing
    const midX = p1.x <= p2.x ? (p1.x + p2.x) / 2 : p1.x + 30;
    const d =
      p1.x <= p2.x
        ? `M ${p1.x} ${p1.y} L ${midX} ${p1.y} L ${midX} ${p2.y} L ${p2.x} ${p2.y}`
        : `M ${p1.x} ${p1.y} L ${p1.x + 28} ${p1.y} L ${p1.x + 28} ${(p1.y + p2.y) / 2} L ${p2.x - 28} ${
            (p1.y + p2.y) / 2
          } L ${p2.x - 28} ${p2.y} L ${p2.x} ${p2.y}`;
    return {
      d,
      mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
      angle: 0,
    };
  };

  // Measurement calculation
  const measureDistanceM = useMemo(() => {
    if (measurePoints.length === 0) return 0;
    const pts = [...measurePoints, { x: snapVal(mouseWorld.x), y: snapVal(mouseWorld.y) }];
    let px = 0;
    for (let i = 1; i < pts.length; i++) {
      px += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return Math.round(px * settings.metersPerPixel * 10) / 10;
  }, [measurePoints, mouseWorld, settings.metersPerPixel, snapVal]);

  const highlightStatusColor = useMemo(() => {
    if (!highlightedPath) return null;
    switch (highlightedPath.status) {
      case 'normal':
        return '#10B981';
      case 'low_margin':
        return '#F59E0B';
      case 'excessive_loss':
      case 'invalid':
        return '#EF4444';
      default:
        return '#94A3B8';
    }
  }, [highlightedPath]);

  const rulerTicksX = useMemo(() => {
    const ticks: Array<{ screen: number; label: string }> = [];
    const stepWorld = zoom < 0.4 ? 200 : zoom < 0.8 ? 100 : 50;
    const startWorld = Math.floor(-pan.x / zoom / stepWorld) * stepWorld;
    for (let w = startWorld; w < startWorld + 2600 / zoom; w += stepWorld) {
      const s = w * zoom + pan.x;
      if (s >= 0 && s <= 2400) {
        ticks.push({ screen: s, label: `${Math.round(w * settings.metersPerPixel)}m` });
      }
    }
    return ticks;
  }, [pan.x, zoom, settings.metersPerPixel]);

  const rulerTicksY = useMemo(() => {
    const ticks: Array<{ screen: number; label: string }> = [];
    const stepWorld = zoom < 0.4 ? 200 : zoom < 0.8 ? 100 : 50;
    const startWorld = Math.floor(-pan.y / zoom / stepWorld) * stepWorld;
    for (let w = startWorld; w < startWorld + 1800 / zoom; w += stepWorld) {
      const s = w * zoom + pan.y;
      if (s >= 0 && s <= 1600) {
        ticks.push({ screen: s, label: `${Math.round(w * settings.metersPerPixel)}m` });
      }
    }
    return ticks;
  }, [pan.y, zoom, settings.metersPerPixel]);

  const singleSelectedNode =
    selectedNodeIds.length === 1 ? nodesById.get(selectedNodeIds[0]) || null : null;

  const gridScaled = settings.gridSizePx * zoom;
  const panModeActive = isPanning || spacePressed || ctrlPressed || activeTool === 'pan';
  const cursorClass = isPanning
    ? 'cursor-grabbing'
    : panModeActive
    ? 'cursor-grab'
    : activeTool === 'cable' || activeTool === 'measure'
    ? 'cursor-crosshair'
    : 'cursor-default';

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onDoubleClick={() => {
        if (activeTool === 'measure') setMeasurePoints([]);
      }}
      className={`relative w-full h-full overflow-hidden select-none ${cursorClass} ${
        darkMode ? 'bg-[#0B0F17]' : 'bg-[#F8FAFC]'
      }`}
    >
      {/* CAD Grid Background */}
      {settings.showGrid && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            left: settings.showRulers ? 24 : 0,
            top: settings.showRulers ? 24 : 0,
            backgroundImage: darkMode
              ? `linear-gradient(to right, rgba(148,163,184,0.07) 1px, transparent 1px),
                 linear-gradient(to bottom, rgba(148,163,184,0.07) 1px, transparent 1px)`
              : `linear-gradient(to right, rgba(15,23,42,0.07) 1px, transparent 1px),
                 linear-gradient(to bottom, rgba(15,23,42,0.07) 1px, transparent 1px)`,
            backgroundSize: `${gridScaled}px ${gridScaled}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />
      )}

      {/* Top & Left Rulers */}
      {settings.showRulers && (
        <>
          <div
            className={`absolute top-0 left-6 right-0 h-6 z-20 border-b overflow-hidden pointer-events-none ${
              darkMode ? 'bg-slate-900/95 border-slate-800 text-slate-400' : 'bg-white/95 border-slate-200 text-slate-500'
            }`}
          >
            {rulerTicksX.map((t, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 border-l border-slate-600/40 pl-1 text-[9px] font-mono-tabular leading-6"
                style={{ left: t.screen }}
              >
                {t.label}
              </div>
            ))}
          </div>
          <div
            className={`absolute top-6 left-0 bottom-0 w-6 z-20 border-r overflow-hidden pointer-events-none ${
              darkMode ? 'bg-slate-900/95 border-slate-800 text-slate-400' : 'bg-white/95 border-slate-200 text-slate-500'
            }`}
          >
            {rulerTicksY.map((t, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-slate-600/40 pt-0.5 text-[8px] font-mono-tabular text-center"
                style={{ top: t.screen }}
              >
                {t.label}
              </div>
            ))}
          </div>
          <div
            className={`absolute top-0 left-0 w-6 h-6 z-30 border-r border-b flex items-center justify-center text-[8px] font-mono ${
              darkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
            }`}
          >
            m
          </div>
        </>
      )}

      {/* World Viewport Layer */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          left: settings.showRulers ? 24 : 0,
          top: settings.showRulers ? 24 : 0,
        }}
      >
        <svg className="w-full h-full overflow-visible">
          <defs>
            <marker id="fiber-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38BDF8" />
            </marker>
          </defs>

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Origin crosshair */}
            <line x1="-18" y1="0" x2="18" y2="0" stroke="rgba(148,163,184,0.25)" strokeWidth={1 / zoom} />
            <line x1="0" y1="-18" x2="0" y2="18" stroke="rgba(148,163,184,0.25)" strokeWidth={1 / zoom} />

            {/* Fiber Connections */}
            {visibleConnections.map((conn) => {
              const { d, mid, angle } = buildPathD(conn);
              if (!d) return null;
              const isSelected = selectedConnectionId === conn.id;
              const isOnPath = highlightedPath?.pathConnectionIds.includes(conn.id);
              const strokeCol = isSelected
                ? '#F8FAFC'
                : isOnPath && highlightStatusColor
                ? highlightStatusColor
                : conn.color;
              const lenM = conn.autoCalculateLength
                ? computeConnectionSchematicLengthM(conn, nodesById, settings.metersPerPixel)
                : conn.lengthMeters;

              return (
                <g
                  key={conn.id}
                  onMouseDown={(e) => {
                    if (e.button === 1 || spacePressed || ctrlPressed || e.ctrlKey || activeTool === 'pan') {
                      return;
                    }
                    e.stopPropagation();
                    onSelectConnection(conn.id);
                    onSelectNodes([]);
                  }}
                  className={panModeActive ? '[cursor:inherit] group' : 'cursor-pointer group'}
                >
                  {/* Wide hit target */}
                  <path d={d} fill="none" stroke="transparent" strokeWidth={14 / zoom} />
                  {isOnPath && highlightStatusColor && (
                    <path
                      d={d}
                      fill="none"
                      stroke={highlightStatusColor}
                      strokeWidth={7}
                      strokeOpacity={0.28}
                    />
                  )}
                  <path
                    d={d}
                    fill="none"
                    stroke={strokeCol}
                    strokeWidth={isSelected ? 3.5 : isOnPath ? 3.2 : 2.3}
                    strokeDasharray={
                      conn.routeType === 'underground'
                        ? '8,4'
                        : conn.routeType === 'duct'
                        ? '10,3,3,3'
                        : undefined
                    }
                    markerMid={settings.showFiberArrows ? 'url(#fiber-arrow)' : undefined}
                  />
                  {/* Direction arrow at midpoint */}
                  {settings.showFiberArrows && (
                    <g transform={`translate(${mid.x}, ${mid.y}) rotate(${angle})`}>
                      <polygon points="-4,-3.5 5,0 -4,3.5" fill={strokeCol} />
                    </g>
                  )}
                  {/* Cable ID / Core / Length Label */}
                  {settings.showCableLabels && (
                    <g transform={`translate(${mid.x}, ${mid.y - 12})`}>
                      <rect
                        x="-48"
                        y="-9"
                        width="96"
                        height="16"
                        rx="3"
                        fill={darkMode ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.92)'}
                        stroke={isSelected ? '#38BDF8' : darkMode ? '#334155' : '#CBD5E1'}
                        strokeWidth="0.8"
                      />
                      <text
                        x="0"
                        y="2"
                        textAnchor="middle"
                        fontSize="9"
                        className="font-mono-tabular"
                        fill={darkMode ? '#E2E8F0' : '#0F172A'}
                      >
                        {`${conn.cableId} · ${conn.coreCapacity}F · ${lenM}m`}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Live Rubber-Band Fiber Cable Draft */}
            {cableDraft && (
              <g pointerEvents="none">
                <polyline
                  points={[
                    `${cableDraft.source.x},${cableDraft.source.y}`,
                    ...cableDraft.waypoints.map((w) => `${w.x},${w.y}`),
                    `${hoveredPort ? hoveredPort.x : mouseWorld.x},${hoveredPort ? hoveredPort.y : mouseWorld.y}`,
                  ].join(' ')}
                  fill="none"
                  stroke={cableConfig.color}
                  strokeWidth={2.5}
                  strokeDasharray="6,4"
                />
                {cableDraft.waypoints.map((w, i) => (
                  <circle key={i} cx={w.x} cy={w.y} r={3.5} fill={cableConfig.color} />
                ))}
              </g>
            )}

            {/* FTTH Components */}
            {visibleNodes.map((node) => {
              const isSelected = selectedNodeIds.includes(node.id);
              const isOnPath = highlightedPath?.pathNodeIds.includes(node.id);
              const isLocked = node.locked || layerMap.get(node.layerId)?.locked;
              const onuAudit = isCustomerOnu(node.type) ? onuAuditById.get(node.id) : undefined;

              return (
                <g
                  key={node.id}
                  onMouseDown={(e) => handleNodeMouseDown(e, node)}
                  transform={`translate(${node.x}, ${node.y}) rotate(${node.rotation} ${node.width / 2} ${node.height / 2})`}
                  className={panModeActive ? '[cursor:inherit]' : 'cursor-move'}
                >
                  {/* Optical Path Glow Ring */}
                  {isOnPath && highlightStatusColor && (
                    <rect
                      x={-5}
                      y={-5}
                      width={node.width + 10}
                      height={node.height + 10}
                      rx={7}
                      fill="none"
                      stroke={highlightStatusColor}
                      strokeWidth={2.5}
                      strokeDasharray="4,2"
                    />
                  )}

                  {/* Selection Box */}
                  {isSelected && (
                    <rect
                      x={-4}
                      y={-4}
                      width={node.width + 8}
                      height={node.height + 8}
                      rx={6}
                      fill="rgba(56,189,248,0.06)"
                      stroke="#38BDF8"
                      strokeWidth={1.6}
                    />
                  )}

                  {/* Annotation Text / Note custom rendering vs Telecom Symbol */}
                  {node.type === 'text_label' ? (
                    <g>
                      <rect
                        x={0}
                        y={0}
                        width={node.width}
                        height={node.height}
                        rx={3}
                        fill={darkMode ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.8)'}
                        stroke={isSelected ? '#38BDF8' : 'rgba(148,163,184,0.35)'}
                        strokeDasharray="3,3"
                      />
                      <text
                        x={8}
                        y={node.height / 2 + 4}
                        fontSize={12}
                        fontWeight={600}
                        fill={darkMode ? '#F1F5F9' : '#0F172A'}
                      >
                        {node.annotationText || node.name}
                      </text>
                    </g>
                  ) : node.type === 'note_box' ? (
                    <foreignObject x={0} y={0} width={node.width} height={node.height}>
                      <div
                        className={`w-full h-full p-2 rounded border text-[10px] leading-snug overflow-hidden whitespace-pre-wrap ${
                          darkMode
                            ? 'bg-amber-950/35 border-amber-500/40 text-amber-100'
                            : 'bg-amber-50 border-amber-300 text-amber-950'
                        }`}
                      >
                        {node.annotationText || node.properties.notes || 'Engineering Note'}
                      </div>
                    </foreignObject>
                  ) : (
                    <TelecomSymbol
                      type={node.type}
                      width={node.width}
                      height={node.height}
                      isSelected={isSelected}
                      isHighlighted={isOnPath}
                      darkMode={darkMode}
                      code={node.code}
                      couplingRatio={node.properties.couplingRatio}
                      inColor={node.inputPorts[0]?.color}
                      out1Color={node.outputPorts[0]?.color}
                      out2Color={node.outputPorts[1]?.color}
                    />
                  )}

                  {/* Code, Name & ONU Rx Optical Power Readout below component */}
                  {node.type !== 'text_label' && node.type !== 'note_box' && (
                    <g pointerEvents="none">
                      <text
                        x={node.width / 2}
                        y={node.height + 13}
                        textAnchor="middle"
                        fontSize={10.5}
                        fontWeight={700}
                        className="font-mono-tabular"
                        fill={darkMode ? '#F8FAFC' : '#0F172A'}
                      >
                        {node.code}
                      </text>
                      <text
                        x={node.width / 2}
                        y={node.height + 24}
                        textAnchor="middle"
                        fontSize={8.5}
                        fill={darkMode ? '#94A3B8' : '#64748B'}
                      >
                        {node.name}
                      </text>
                      {(node.type === 'ratio_coupler' || node.type === 'optical_coupler') && (
                        <g transform={`translate(${node.width / 2}, ${node.height + 36})`}>
                          <rect
                            x={-42}
                            y={-9}
                            width={84}
                            height={15}
                            rx={3}
                            fill={
                              darkMode ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)'
                            }
                            stroke="#F59E0B"
                            strokeWidth={1}
                          />
                          <text
                            x={0}
                            y={1.5}
                            textAnchor="middle"
                            fontSize={8.5}
                            fontWeight={700}
                            className="font-mono-tabular"
                            fill="#F59E0B"
                          >
                            {`RATIO ${node.properties.couplingRatio || '80:20'}`}
                          </text>
                        </g>
                      )}
                      {onuAudit && (
                        <g transform={`translate(${node.width / 2}, ${node.height + 36})`}>
                          <rect
                            x={-48}
                            y={-9}
                            width={96}
                            height={15}
                            rx={3}
                            fill={
                              darkMode ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)'
                            }
                            stroke={
                              onuAudit.status === 'normal'
                                ? '#10B981'
                                : onuAudit.status === 'low_margin'
                                ? '#F59E0B'
                                : '#EF4444'
                            }
                            strokeWidth={1}
                          />
                          <text
                            x={0}
                            y={1.5}
                            textAnchor="middle"
                            fontSize={8.5}
                            fontWeight={700}
                            className="font-mono-tabular"
                            fill={
                              onuAudit.status === 'normal'
                                ? '#10B981'
                                : onuAudit.status === 'low_margin'
                                ? '#F59E0B'
                                : '#EF4444'
                            }
                          >
                            {onuAudit.receivedPowerDownDbm > -90
                              ? `Rx ${onuAudit.receivedPowerDownDbm.toFixed(1)} dBm`
                              : 'No OLT Link'}
                          </text>
                        </g>
                      )}
                    </g>
                  )}

                  {/* Lock Indicator */}
                  {isLocked && (
                    <foreignObject x={node.width - 14} y={-8} width={16} height={16}>
                      <div className="w-4 h-4 rounded bg-amber-500/90 text-slate-950 flex items-center justify-center">
                        <Lock className="w-2.5 h-2.5" />
                      </div>
                    </foreignObject>
                  )}

                  {/* Input Ports (Left Side) */}
                  {node.inputPorts.map((p, idx) => {
                    const py = ((idx + 1) / (node.inputPorts.length + 1)) * node.height;
                    const isHovered =
                      hoveredPort?.nodeId === node.id && hoveredPort?.portId === p.id;
                    const pLevel = portLevels.get(`${node.id}:${p.id}`);
                    const levelColor = !pLevel
                      ? '#94A3B8'
                      : pLevel.status === 'normal'
                      ? '#10B981'
                      : pLevel.status === 'low_margin'
                      ? '#F59E0B'
                      : '#EF4444';
                    return (
                      <g
                        key={p.id}
                        onMouseDown={(e) =>
                          handlePortMouseDown(e, {
                            nodeId: node.id,
                            portId: p.id,
                            direction: 'in',
                            x: node.x,
                            y: node.y + py,
                          })
                        }
                        className={panModeActive ? '[cursor:inherit]' : 'cursor-crosshair'}
                      >
                        <circle
                          cx={0}
                          cy={py}
                          r={isHovered ? 6 : 4.5}
                          fill={isHovered ? '#38BDF8' : p.color || '#10B981'}
                          stroke={darkMode ? '#0B0F17' : '#FFFFFF'}
                          strokeWidth={1.5}
                        />
                        {(settings.showPortLabels || (settings.showPortOpticalDbm !== false && pLevel)) && (
                          <text
                            x={-7}
                            y={py + 3}
                            textAnchor="end"
                            fontSize={8}
                            className="font-mono-tabular"
                            fill={p.color || (darkMode ? '#94A3B8' : '#475569')}
                          >
                            {settings.showPortLabels ? p.label : ''}
                            {settings.showPortOpticalDbm !== false && pLevel && (
                              <tspan fill={levelColor} fontWeight={600}>
                                {`${settings.showPortLabels ? ' ' : ''}${
                                  pLevel.powerDbm >= 0 ? `+${pLevel.powerDbm.toFixed(1)}` : pLevel.powerDbm.toFixed(1)
                                } dBm`}
                              </tspan>
                            )}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Output Ports (Right Side) */}
                  {node.outputPorts.map((p, idx) => {
                    const py = ((idx + 1) / (node.outputPorts.length + 1)) * node.height;
                    const isHovered =
                      hoveredPort?.nodeId === node.id && hoveredPort?.portId === p.id;
                    const isConnected = connections.some(
                      (c) => c.sourceNodeId === node.id && c.sourcePortId === p.id
                    );
                    const pLevel = portLevels.get(`${node.id}:${p.id}`);
                    const levelColor = !pLevel
                      ? '#94A3B8'
                      : pLevel.isSource
                      ? '#38BDF8'
                      : pLevel.status === 'normal'
                      ? '#10B981'
                      : pLevel.status === 'low_margin'
                      ? '#F59E0B'
                      : '#EF4444';
                    return (
                      <g
                        key={p.id}
                        onMouseDown={(e) =>
                          handlePortMouseDown(e, {
                            nodeId: node.id,
                            portId: p.id,
                            direction: 'out',
                            x: node.x + node.width,
                            y: node.y + py,
                          })
                        }
                        className={panModeActive ? '[cursor:inherit]' : 'cursor-crosshair'}
                      >
                        <circle
                          cx={node.width}
                          cy={py}
                          r={isHovered ? 6 : 4.5}
                          fill={
                            isHovered
                              ? '#38BDF8'
                              : p.color
                              ? p.color
                              : isConnected
                              ? '#0EA5E9'
                              : '#F59E0B'
                          }
                          stroke={darkMode ? '#0B0F17' : '#FFFFFF'}
                          strokeWidth={1.5}
                        />
                        {(settings.showPortLabels ||
                          (settings.showPortOpticalDbm !== false && (pLevel || (p.portLossDb ?? 0) > 0))) && (
                          <text
                            x={node.width + 7}
                            y={py + 3}
                            textAnchor="start"
                            fontSize={8}
                            className="font-mono-tabular"
                            fill={p.color || (darkMode ? '#94A3B8' : '#475569')}
                          >
                            {settings.showPortLabels ? p.label : ''}
                            {settings.showPortOpticalDbm !== false && pLevel ? (
                              <tspan fill={levelColor} fontWeight={600}>
                                {`${settings.showPortLabels ? ' ' : ''}${
                                  pLevel.powerDbm >= 0 ? `+${pLevel.powerDbm.toFixed(1)}` : pLevel.powerDbm.toFixed(1)
                                } dBm`}
                              </tspan>
                            ) : settings.showPortOpticalDbm !== false && (p.portLossDb ?? 0) > 0 ? (
                              <tspan fill={darkMode ? '#94A3B8' : '#64748B'} fontWeight={500}>
                                {`${settings.showPortLabels ? ' ' : ''}(-${(p.portLossDb || 0).toFixed(1)} dB)`}
                              </tspan>
                            ) : null}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Resize & Rotate Handles for Single Selected Unlocked Node */}
            {singleSelectedNode &&
              !singleSelectedNode.locked &&
              !layerMap.get(singleSelectedNode.layerId)?.locked && (
                <g>
                  {/* Bottom-Right Resize Handle */}
                  <rect
                    x={singleSelectedNode.x + singleSelectedNode.width - 4}
                    y={singleSelectedNode.y + singleSelectedNode.height - 4}
                    width={9}
                    height={9}
                    fill="#38BDF8"
                    stroke="#0F172A"
                    strokeWidth={1.2}
                    className={panModeActive ? '[cursor:inherit]' : 'cursor-nwse-resize'}
                    onMouseDown={(e) => {
                      if (e.button === 1 || spacePressed || ctrlPressed || e.ctrlKey || activeTool === 'pan') {
                        return;
                      }
                      e.stopPropagation();
                      const world = screenToWorld(e.clientX, e.clientY);
                      setResizeState({
                        nodeId: singleSelectedNode.id,
                        startWorldX: world.x,
                        startWorldY: world.y,
                        origW: singleSelectedNode.width,
                        origH: singleSelectedNode.height,
                      });
                    }}
                  />
                  {/* Top-Center Rotate Handle */}
                  <line
                    x1={singleSelectedNode.x + singleSelectedNode.width / 2}
                    y1={singleSelectedNode.y - 4}
                    x2={singleSelectedNode.x + singleSelectedNode.width / 2}
                    y2={singleSelectedNode.y - 20}
                    stroke="#38BDF8"
                    strokeWidth={1.4}
                  />
                  <circle
                    cx={singleSelectedNode.x + singleSelectedNode.width / 2}
                    cy={singleSelectedNode.y - 22}
                    r={5}
                    fill="#38BDF8"
                    stroke="#0F172A"
                    strokeWidth={1.2}
                    className={panModeActive ? '[cursor:inherit]' : 'cursor-grab'}
                    onMouseDown={(e) => {
                      if (e.button === 1 || spacePressed || ctrlPressed || e.ctrlKey || activeTool === 'pan') {
                        return;
                      }
                      e.stopPropagation();
                      setRotateState({
                        nodeId: singleSelectedNode.id,
                        centerX: singleSelectedNode.x + singleSelectedNode.width / 2,
                        centerY: singleSelectedNode.y + singleSelectedNode.height / 2,
                      });
                    }}
                  />
                </g>
              )}

            {/* Marquee Multi-Select Box */}
            {marquee && (
              <rect
                x={Math.min(marquee.startX, marquee.currX)}
                y={Math.min(marquee.startY, marquee.currY)}
                width={Math.abs(marquee.currX - marquee.startX)}
                height={Math.abs(marquee.currY - marquee.startY)}
                fill="rgba(56,189,248,0.12)"
                stroke="#38BDF8"
                strokeWidth={1.2 / zoom}
                strokeDasharray="4,3"
                pointerEvents="none"
              />
            )}

            {/* Distance Measurement Tool Overlay */}
            {activeTool === 'measure' && measurePoints.length > 0 && (
              <g pointerEvents="none">
                <polyline
                  points={[
                    ...measurePoints.map((p) => `${p.x},${p.y}`),
                    `${snapVal(mouseWorld.x)},${snapVal(mouseWorld.y)}`,
                  ].join(' ')}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth={2 / zoom}
                  strokeDasharray="5,4"
                />
                {measurePoints.map((p, idx) => (
                  <circle key={idx} cx={p.x} cy={p.y} r={4 / zoom} fill="#F59E0B" />
                ))}
              </g>
            )}
          </g>
        </svg>
      </div>

      {/* Floating Tool Guidance HUD */}
      {activeTool === 'cable' && (
        <div className="absolute top-9 left-9 z-30 px-3 py-1.5 rounded border border-sky-500/40 bg-slate-900/90 text-xs text-slate-200 pointer-events-none">
          {cableDraft
            ? `Drawing ${cableConfig.cableType} (${cableConfig.coreCapacity}F) from ${cableDraft.source.portId.toUpperCase()} — Click canvas for bends or click Input port to finish (Esc to cancel)`
            : 'Fiber Cable Tool: Click any Output/PON port to begin routing'}
        </div>
      )}

      {activeTool === 'measure' && (
        <div className="absolute top-9 left-9 z-30 px-3 py-1.5 rounded border border-amber-500/40 bg-slate-900/90 text-xs font-mono-tabular text-amber-200 pointer-events-none">
          {measurePoints.length === 0
            ? 'Measure Tool: Click start point on canvas'
            : `Distance: ${measureDistanceM.toFixed(1)} m (${measurePoints.length} pts) · Double-click or Esc to reset`}
        </div>
      )}
    </div>
  );
};
