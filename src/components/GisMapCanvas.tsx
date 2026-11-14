import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
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
import {
  auditAllOnus,
  computeGeoPathLengthMeters,
  isCustomerOnu,
} from '../utils/opticalCalculator';
import {
  fetchStreetRoute,
  GeoSearchResult,
  routeWithLockedAnchors,
  searchLocations,
  simplifyGeoPathForManualEdit,
} from '../utils/gisRouting';
import {
  Download,
  Layers,
  Loader2,
  LocateFixed,
  Lock,
  MapPin,
  Navigation,
  Route,
  Ruler,
  Search,
  Unlock,
  Upload,
  X,
} from 'lucide-react';

interface GisMapCanvasProps {
  nodes: FtthNode[];
  connections: FiberConnection[];
  layers: CadLayer[];
  settings: ProjectSettings;
  activeTool: DrawingTool;
  cableConfig: CableToolConfig;
  selectedNodeIds: string[];
  selectedConnectionId: string | null;
  highlightedPath: OpticalPathResult | null;
  placeComponentType: FtthComponentType | null;
  onClearPlaceComponentType: () => void;
  onSelectNodes: (ids: string[]) => void;
  onSelectConnection: (id: string | null) => void;
  onMoveNodeGeo: (id: string, lat: number, lng: number) => void;
  onPlaceNodeAtGeo: (type: FtthComponentType, lat: number, lng: number) => void;
  onCreateGeoConnection: (
    sourceNodeId: string,
    targetNodeId: string,
    geoPath: Array<[number, number]>,
    lengthMeters: number,
    geoRouteMode: 'auto_street' | 'manual'
  ) => void;
  onUpdateConnection: (id: string, patch: Partial<FiberConnection>) => void;
  onUpdateConnectionsBatch: (
    updates: Array<{ id: string; patch: Partial<FiberConnection> }>
  ) => void;
  onImportGisFile: (file: File) => void;
  onExportGeoJson: () => void;
  onExportKml: () => void;
  onNotify: (msg: string, tone?: 'info' | 'warn' | 'error') => void;
}

const TILE_CONFIGS: Record<
  'osm' | 'satellite' | 'dark',
  { url: string; attr: string; maxNativeZoom: number; maxZoom: number }
> = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '&copy; OpenStreetMap contributors',
    maxNativeZoom: 19,
    maxZoom: 22,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '&copy; Esri World Imagery',
    maxNativeZoom: 17,
    maxZoom: 22,
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '&copy; OpenStreetMap &copy; CARTO',
    maxNativeZoom: 19,
    maxZoom: 22,
  },
};

function getMarkerColor(type: FtthComponentType): string {
  if (type.startsWith('olt') || type === 'gpon_port' || type === 'xgs_pon_port' || type === 'odf') {
    return '#0EA5E9';
  }
  if (
    type.startsWith('splitter') ||
    type === 'fbt_splitter' ||
    type === 'optical_coupler' ||
    type === 'ratio_coupler' ||
    type === 'joint_closure'
  ) {
    return '#F59E0B';
  }
  if (type === 'fat' || type === 'fdb' || type === 'fdt' || type === 'ftb') {
    return '#EC4899';
  }
  if (type === 'onu' || type === 'ont' || type === 'wifi_ont') {
    return '#10B981';
  }
  return '#94A3B8';
}

function insertPointOnNearestSegment(
  path: Array<[number, number]>,
  pt: [number, number],
  lockedIndices: number[] = []
): { path: Array<[number, number]>; lockedIndices: number[]; insertedIdx: number } {
  if (path.length < 2) {
    return { path: [...path, pt], lockedIndices, insertedIdx: path.length };
  }
  let bestIdx = 1;
  let bestDist = Infinity;

  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / lenSq));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    const d = Math.hypot(pt[0] - projX, pt[1] - projY);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i + 1;
    }
  }

  const next = [...path];
  next.splice(bestIdx, 0, pt);
  const nextLocked = lockedIndices.map((idx) => (idx >= bestIdx ? idx + 1 : idx));
  return { path: next, lockedIndices: nextLocked, insertedIdx: bestIdx };
}

export const GisMapCanvas: React.FC<GisMapCanvasProps> = ({
  nodes,
  connections,
  layers,
  settings,
  activeTool,
  cableConfig,
  selectedNodeIds,
  selectedConnectionId,
  highlightedPath,
  placeComponentType,
  onClearPlaceComponentType,
  onSelectNodes,
  onSelectConnection,
  onMoveNodeGeo,
  onPlaceNodeAtGeo,
  onCreateGeoConnection,
  onUpdateConnection,
  onUpdateConnectionsBatch,
  onImportGisFile,
  onExportGeoJson,
  onExportKml,
  onNotify,
}) => {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const featureGroupRef = useRef<L.LayerGroup | null>(null);
  const draftGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [baseMap, setBaseMap] = useState<'osm' | 'satellite' | 'dark'>('osm');
  const [zoomLevel, setZoomLevel] = useState<number>(settings.gisZoom);
  const [cursorLatLng, setCursorLatLng] = useState<[number, number]>(settings.gisCenter);
  const [geoMeasurePts, setGeoMeasurePts] = useState<Array<[number, number]>>([]);
  const [gisRouteMode, setGisRouteMode] = useState<'auto_street' | 'manual'>('auto_street');
  const [routingBusy, setRoutingBusy] = useState(false);
  const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);

  useEffect(() => {
    setSelectedVertexIdx(null);
  }, [selectedConnectionId]);

  // Location Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeoSearchResult[]>([]);
  const [searchPin, setSearchPin] = useState<{ lat: number; lng: number; label: string } | null>(
    null
  );

  const [geoCableDraft, setGeoCableDraft] = useState<{
    sourceNode: FtthNode;
    waypoints: Array<[number, number]>;
  } | null>(null);

  // Refs for latest callbacks & data inside Leaflet event listeners
  const stateRef = useRef({
    nodes,
    connections,
    layers,
    activeTool,
    gisRouteMode,
    placeComponentType,
    geoCableDraft,
    geoMeasurePts,
    onPlaceNodeAtGeo,
    onClearPlaceComponentType,
    onSelectNodes,
    onSelectConnection,
    onMoveNodeGeo,
    onCreateGeoConnection,
    onUpdateConnection,
    onUpdateConnectionsBatch,
    onNotify,
  });
  stateRef.current = {
    nodes,
    connections,
    layers,
    activeTool,
    gisRouteMode,
    placeComponentType,
    geoCableDraft,
    geoMeasurePts,
    onPlaceNodeAtGeo,
    onClearPlaceComponentType,
    onSelectNodes,
    onSelectConnection,
    onMoveNodeGeo,
    onCreateGeoConnection,
    onUpdateConnection,
    onUpdateConnectionsBatch,
    onNotify,
  };

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current, {
      center: settings.gisCenter,
      zoom: settings.gisZoom,
      maxZoom: 22,
      zoomControl: true,
    });

    const cfg = TILE_CONFIGS.osm;
    const tile = L.tileLayer(cfg.url, {
      attribution: cfg.attr,
      maxNativeZoom: cfg.maxNativeZoom,
      maxZoom: cfg.maxZoom,
    }).addTo(map);
    tileLayerRef.current = tile;

    const fg = L.layerGroup().addTo(map);
    const dg = L.layerGroup().addTo(map);
    featureGroupRef.current = fg;
    draftGroupRef.current = dg;

    map.on('mousemove', (ev: L.LeafletMouseEvent) => {
      setCursorLatLng([ev.latlng.lat, ev.latlng.lng]);
    });

    map.on('zoomend', () => {
      setZoomLevel(map.getZoom());
    });

    map.on('click', (ev: L.LeafletMouseEvent) => {
      const s = stateRef.current;
      const pt: [number, number] = [ev.latlng.lat, ev.latlng.lng];

      if (s.placeComponentType) {
        s.onPlaceNodeAtGeo(s.placeComponentType, pt[0], pt[1]);
        s.onClearPlaceComponentType();
        return;
      }

      if (s.activeTool === 'measure') {
        setGeoMeasurePts((prev) => [...prev, pt]);
        return;
      }

      if (s.activeTool === 'cable' && s.geoCableDraft) {
        setGeoCableDraft((prev) =>
          prev ? { ...prev, waypoints: [...prev.waypoints, pt] } : null
        );
        return;
      }

      s.onSelectNodes([]);
      s.onSelectConnection(null);
      setSearchResults([]);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update base map tile layer with maxNativeZoom so high-zoom never shows "Map data not yet available"
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const cfg = TILE_CONFIGS[baseMap];
    tileLayerRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attr,
      maxNativeZoom: cfg.maxNativeZoom,
      maxZoom: cfg.maxZoom,
    }).addTo(map);
  }, [baseMap]);

  // Helper: route a single existing cable along streets while preserving any individually locked bends
  const routeCableAlongStreet = async (conn: FiberConnection) => {
    const layerMap = new Map(layers.map((l) => [l.id, l]));
    if (conn.locked || layerMap.get(conn.layerId)?.locked) {
      onNotify(`${conn.cableId} is fully locked. Unlock it first to re-route.`, 'warn');
      return;
    }
    const src = nodes.find((n) => n.id === conn.sourceNodeId);
    const dst = nodes.find((n) => n.id === conn.targetNodeId);
    if (!src || !dst) return;

    const basePath: Array<[number, number]> =
      conn.geoPath.length >= 2
        ? [
            [src.lat, src.lng],
            ...conn.geoPath.slice(1, -1),
            [dst.lat, dst.lng],
          ]
        : [
            [src.lat, src.lng],
            [dst.lat, dst.lng],
          ];
    const lockedIdx = conn.geoLockedVertexIndices || [];

    setRoutingBusy(true);
    try {
      const res = await routeWithLockedAnchors(basePath, lockedIdx, 'all');
      onUpdateConnection(conn.id, {
        geoPath: res.geoPath,
        geoLockedVertexIndices: res.lockedIndices,
        lengthMeters: res.lengthMeters,
        autoCalculateLength: false,
        geoRouteMode: 'auto_street',
      });
      setSelectedVertexIdx(null);
      onNotify(
        res.routedByStreet
          ? `${conn.cableId} snapped along street (${res.lengthMeters} m)${
              res.lockedIndices.length > 0
                ? ` · ${res.lockedIndices.length} locked bend(s) preserved`
                : ''
            }.`
          : `No street route found nearby — kept direct route (${res.lengthMeters} m).`,
        res.routedByStreet ? 'info' : 'warn'
      );
    } finally {
      setRoutingBusy(false);
    }
  };

  // Helper: batch route all unlocked cables along streets (preserving locked bends inside cables)
  const routeAllUnlockedAlongStreets = async () => {
    const layerMap = new Map(layers.map((l) => [l.id, l]));
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    const candidates = connections.filter(
      (c) =>
        !c.locked &&
        !layerMap.get(c.layerId)?.locked &&
        nodesById.has(c.sourceNodeId) &&
        nodesById.has(c.targetNodeId)
    );
    const lockedCount = connections.length - candidates.length;

    if (candidates.length === 0) {
      onNotify(
        lockedCount > 0
          ? `All ${lockedCount} cable(s) are locked.`
          : 'No fiber cables available to route.',
        'warn'
      );
      return;
    }

    setRoutingBusy(true);
    try {
      const updates: Array<{ id: string; patch: Partial<FiberConnection> }> = [];
      let streetMatched = 0;

      for (const conn of candidates) {
        const src = nodesById.get(conn.sourceNodeId)!;
        const dst = nodesById.get(conn.targetNodeId)!;
        const basePath: Array<[number, number]> =
          conn.geoPath.length >= 2
            ? [
                [src.lat, src.lng],
                ...conn.geoPath.slice(1, -1),
                [dst.lat, dst.lng],
              ]
            : [
                [src.lat, src.lng],
                [dst.lat, dst.lng],
              ];
        const res = await routeWithLockedAnchors(
          basePath,
          conn.geoLockedVertexIndices || [],
          'all'
        );
        if (res.routedByStreet) streetMatched++;
        updates.push({
          id: conn.id,
          patch: {
            geoPath: res.geoPath,
            geoLockedVertexIndices: res.lockedIndices,
            lengthMeters: res.lengthMeters,
            autoCalculateLength: false,
            geoRouteMode: 'auto_street',
          },
        });
      }

      onUpdateConnectionsBatch(updates);
      onNotify(
        `Auto-routed ${streetMatched}/${candidates.length} cable(s) along streets${
          lockedCount > 0 ? ` (${lockedCount} locked preserved)` : ''
        }.`
      );
    } finally {
      setRoutingBusy(false);
    }
  };

  // Render nodes, fiber routes, and manual vertex handles onto Leaflet layer group
  useEffect(() => {
    const fg = featureGroupRef.current;
    if (!fg) return;
    fg.clearLayers();

    const layerMap = new Map(layers.map((l) => [l.id, l]));
    const nodesById = new Map(nodes.map((n) => [n.id, n]));

    // Draw Fiber Routes
    for (const conn of connections) {
      if (layerMap.get(conn.layerId)?.visible === false) continue;
      const src = nodesById.get(conn.sourceNodeId);
      const dst = nodesById.get(conn.targetNodeId);
      if (!src || !dst) continue;

      const basePath: Array<[number, number]> =
        conn.geoPath.length >= 2
          ? conn.geoPath
          : [
              [src.lat, src.lng],
              [dst.lat, dst.lng],
            ];

      const isSelected = selectedConnectionId === conn.id;
      const isHighlighted = highlightedPath?.pathConnectionIds.includes(conn.id);
      const isCableLocked = Boolean(conn.locked || layerMap.get(conn.layerId)?.locked);
      const color = isSelected
        ? '#FFFFFF'
        : isHighlighted
        ? highlightedPath?.status === 'normal'
          ? '#10B981'
          : highlightedPath?.status === 'low_margin'
          ? '#F59E0B'
          : '#EF4444'
        : conn.color;

      // Subtle dark casing under selected white line so it stands out on street/satellite maps
      if (isSelected) {
        L.polyline(basePath, {
          color: isCableLocked ? '#F59E0B' : '#0EA5E9',
          weight: 8,
          opacity: 0.7,
        }).addTo(fg);
      }

      const poly = L.polyline(basePath, {
        color,
        weight: isSelected || isHighlighted ? 4.5 : 3.5,
        dashArray: conn.routeType === 'underground' ? '8, 6' : undefined,
        opacity: 0.94,
      });

      const lockedIdxList = conn.geoLockedVertexIndices || [];
      const lockedSet = new Set(lockedIdxList);

      const geoDist = computeGeoPathLengthMeters(basePath);
      const modeLabel = isCableLocked
        ? 'LOCKED'
        : `${conn.geoRouteMode === 'manual' ? 'Manual' : 'Auto Street'}${
            lockedIdxList.length > 0 ? ` · ${lockedIdxList.length} Locked Bend(s)` : ''
          }`;
      poly.bindTooltip(
        `${conn.cableId} · ${conn.coreCapacity}F · ${geoDist || conn.lengthMeters}m · ${modeLabel}`,
        { sticky: true, className: 'fibercad-tooltip' }
      );

      poly.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        const s = stateRef.current;
        // If already selected, unlocked, and in manual edit mode: clicking line inserts a new bend point!
        if (
          selectedConnectionId === conn.id &&
          !isCableLocked &&
          conn.geoRouteMode === 'manual' &&
          s.activeTool !== 'cable' &&
          s.activeTool !== 'measure'
        ) {
          const inserted = insertPointOnNearestSegment(
            basePath,
            [e.latlng.lat, e.latlng.lng],
            lockedIdxList
          );
          const nextLen = computeGeoPathLengthMeters(inserted.path);
          s.onUpdateConnection(conn.id, {
            geoPath: inserted.path,
            geoLockedVertexIndices: inserted.lockedIndices,
            lengthMeters: nextLen,
            autoCalculateLength: false,
            geoRouteMode: 'manual',
          });
          setSelectedVertexIdx(inserted.insertedIdx);
          return;
        }
        s.onSelectConnection(conn.id);
        s.onSelectNodes([]);
      });

      poly.addTo(fg);

      // Render bend handles when selected (always show locked bends; show all bends in Manual mode)
      if (isSelected) {
        for (let idx = 1; idx < basePath.length - 1; idx++) {
          const isVLocked = isCableLocked || lockedSet.has(idx);
          if (conn.geoRouteMode !== 'manual' && !lockedSet.has(idx)) continue;

          const [vLat, vLng] = basePath[idx];
          const isVSel = selectedVertexIdx === idx;
          const vertexIcon = L.divIcon({
            className: 'fibercad-vertex-handle',
            html: isVLocked
              ? `<div title="Bend #${idx} (LOCKED) · Click to select · Double-click to Unlock" style="width:14px;height:14px;border-radius:3px;background:#F59E0B;border:2px solid ${
                  isVSel ? '#FFFFFF' : '#0F172A'
                };box-shadow:0 1px 5px rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;cursor:pointer;"><span style="width:4px;height:4px;border-radius:50%;background:#0F172A;display:block;"></span></div>`
              : `<div title="Bend #${idx} (Unlocked) · Drag to move · Double-click to Lock · Right-click to remove" style="width:12px;height:12px;border-radius:50%;background:#38BDF8;border:2px solid ${
                  isVSel ? '#FFFFFF' : '#0F172A'
                };box-shadow:0 1px 4px rgba(0,0,0,0.6);cursor:grab;"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });
          const vMarker = L.marker([vLat, vLng], {
            icon: vertexIcon,
            draggable: !isVLocked,
          });
          vMarker.on('click', (ev) => {
            L.DomEvent.stopPropagation(ev);
            setSelectedVertexIdx(idx);
          });
          vMarker.on('dblclick', (ev) => {
            L.DomEvent.stopPropagation(ev);
            if (isCableLocked) return;
            const nextLocked = lockedSet.has(idx)
              ? lockedIdxList.filter((i) => i !== idx)
              : [...lockedIdxList, idx].sort((a, b) => a - b);
            stateRef.current.onUpdateConnection(conn.id, {
              geoLockedVertexIndices: nextLocked,
            });
            setSelectedVertexIdx(idx);
          });
          vMarker.on('dragend', () => {
            if (isVLocked) return;
            const ll = vMarker.getLatLng();
            const updated = [...basePath];
            updated[idx] = [ll.lat, ll.lng];
            const nextLen = computeGeoPathLengthMeters(updated);
            stateRef.current.onUpdateConnection(conn.id, {
              geoPath: updated,
              lengthMeters: nextLen,
              autoCalculateLength: false,
              geoRouteMode: 'manual',
            });
          });
          vMarker.on('contextmenu', (ev) => {
            L.DomEvent.stopPropagation(ev);
            if (isVLocked) {
              stateRef.current.onNotify(
                `Bend #${idx} is locked. Unlock it first before removing.`,
                'warn'
              );
              return;
            }
            if (basePath.length <= 2) return;
            const updated = basePath.filter((_, i) => i !== idx);
            const nextLocked = lockedIdxList
              .filter((i) => i !== idx)
              .map((i) => (i > idx ? i - 1 : i));
            const nextLen = computeGeoPathLengthMeters(updated);
            stateRef.current.onUpdateConnection(conn.id, {
              geoPath: updated,
              geoLockedVertexIndices: nextLocked,
              lengthMeters: nextLen,
              autoCalculateLength: false,
              geoRouteMode: 'manual',
            });
            setSelectedVertexIdx(null);
          });
          vMarker.addTo(fg);
        }
      }
    }

    const onuAudits = new Map(
      auditAllOnus(nodes, connections, settings).map((a) => [a.targetNodeId, a])
    );

    // Draw Node Markers
    for (const node of nodes) {
      if (layerMap.get(node.layerId)?.visible === false) continue;
      if (node.type === 'text_label' || node.type === 'note_box') continue;

      const isSelected = selectedNodeIds.includes(node.id);
      const isOnPath = highlightedPath?.pathNodeIds.includes(node.id);
      const bg = getMarkerColor(node.type);
      const onuAudit = isCustomerOnu(node.type) ? onuAudits.get(node.id) : undefined;
      const rxText =
        onuAudit && onuAudit.receivedPowerDownDbm > -90
          ? ` · ${onuAudit.receivedPowerDownDbm.toFixed(1)} dBm`
          : '';
      const rxColor = !onuAudit
        ? '#F8FAFC'
        : onuAudit.status === 'normal'
        ? '#34D399'
        : onuAudit.status === 'low_margin'
        ? '#FBBF24'
        : '#F87171';

      const icon = L.divIcon({
        className: 'fibercad-gis-marker',
        html: `
          <div style="
            display:inline-flex;align-items:center;gap:4px;
            padding:2px 6px;border-radius:4px;
            background:${isSelected ? '#0EA5E9' : '#0F172A'};
            border:2px solid ${isOnPath ? '#10B981' : isSelected ? '#FFFFFF' : bg};
            color:#F8FAFC;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;
            white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.45);
          ">
            <span style="width:7px;height:7px;border-radius:50%;background:${bg};display:inline-block;"></span>
            <span>${node.code}</span>
            ${rxText ? `<span style="color:${rxColor};">${rxText}</span>` : ''}
          </div>
        `,
        iconSize: [onuAudit ? 120 : 74, 24],
        iconAnchor: [onuAudit ? 60 : 37, 12],
      });

      const isLocked = node.locked || layerMap.get(node.layerId)?.locked;
      const marker = L.marker([node.lat, node.lng], {
        icon,
        draggable: !isLocked && activeTool !== 'cable',
      });

      marker.on('click', async (e) => {
        L.DomEvent.stopPropagation(e);
        const s = stateRef.current;
        if (s.activeTool === 'cable') {
          if (!s.geoCableDraft) {
            if (node.outputPorts.length === 0) {
              s.onNotify(`${node.code} has no output ports.`, 'warn');
              return;
            }
            setGeoCableDraft({ sourceNode: node, waypoints: [[node.lat, node.lng]] });
          } else {
            if (s.geoCableDraft.sourceNode.id === node.id) {
              setGeoCableDraft(null);
              return;
            }
            if (node.inputPorts.length === 0) {
              s.onNotify(`${node.code} has no input ports.`, 'warn');
              return;
            }
            const rawPath: Array<[number, number]> = [
              ...s.geoCableDraft.waypoints,
              [node.lat, node.lng],
            ];
            const sourceId = s.geoCableDraft.sourceNode.id;
            setGeoCableDraft(null);

            if (s.gisRouteMode === 'auto_street') {
              setRoutingBusy(true);
              try {
                const res = await fetchStreetRoute(rawPath);
                s.onCreateGeoConnection(
                  sourceId,
                  node.id,
                  res.geoPath,
                  res.lengthMeters,
                  'auto_street'
                );
                if (!res.routedByStreet) {
                  s.onNotify(
                    'Street router unavailable here — created direct route (switchable to Manual or re-snap anytime).',
                    'warn'
                  );
                }
              } finally {
                setRoutingBusy(false);
              }
            } else {
              const distM = computeGeoPathLengthMeters(rawPath);
              s.onCreateGeoConnection(sourceId, node.id, rawPath, distM, 'manual');
            }
          }
          return;
        }
        s.onSelectNodes([node.id]);
        s.onSelectConnection(null);
      });

      marker.on('dragend', async () => {
        const ll = marker.getLatLng();
        const s = stateRef.current;
        s.onMoveNodeGeo(node.id, ll.lat, ll.lng);

        // Auto-reroute ONLY unlocked segments of auto_street cables attached to this node,
        // keeping every locked bend undisturbed!
        const lMap = new Map(s.layers.map((l) => [l.id, l]));
        const nMap = new Map(s.nodes.map((n) => [n.id, n]));
        const autoAttached = s.connections.filter(
          (c) =>
            (c.sourceNodeId === node.id || c.targetNodeId === node.id) &&
            !c.locked &&
            !lMap.get(c.layerId)?.locked &&
            c.geoRouteMode !== 'manual'
        );
        if (autoAttached.length > 0) {
          const updates: Array<{ id: string; patch: Partial<FiberConnection> }> = [];
          for (const c of autoAttached) {
            const otherId = c.sourceNodeId === node.id ? c.targetNodeId : c.sourceNodeId;
            const other = nMap.get(otherId);
            if (!other) continue;
            const startPt: [number, number] =
              c.sourceNodeId === node.id ? [ll.lat, ll.lng] : [other.lat, other.lng];
            const endPt: [number, number] =
              c.targetNodeId === node.id ? [ll.lat, ll.lng] : [other.lat, other.lng];
            const curPath: Array<[number, number]> =
              c.geoPath.length >= 2
                ? [startPt, ...c.geoPath.slice(1, -1), endPt]
                : [startPt, endPt];
            const scope: 'start' | 'end' = c.sourceNodeId === node.id ? 'start' : 'end';
            const res = await routeWithLockedAnchors(
              curPath,
              c.geoLockedVertexIndices || [],
              scope
            );
            updates.push({
              id: c.id,
              patch: {
                geoPath: res.geoPath,
                geoLockedVertexIndices: res.lockedIndices,
                lengthMeters: res.lengthMeters,
                autoCalculateLength: false,
                geoRouteMode: 'auto_street',
              },
            });
          }
          if (updates.length > 0) {
            s.onUpdateConnectionsBatch(updates);
          }
        }
      });

      marker.addTo(fg);
    }
  }, [nodes, connections, layers, settings, selectedNodeIds, selectedConnectionId, selectedVertexIdx, highlightedPath, activeTool]);

  // Render draft overlays (measurement, active cable route, & search pin)
  useEffect(() => {
    const dg = draftGroupRef.current;
    if (!dg) return;
    dg.clearLayers();

    if (geoCableDraft && geoCableDraft.waypoints.length >= 1) {
      L.polyline(geoCableDraft.waypoints, {
        color: cableConfig.color,
        weight: 3,
        dashArray: '6,4',
      }).addTo(dg);
    }

    if (geoMeasurePts.length >= 1) {
      L.polyline(geoMeasurePts, {
        color: '#F59E0B',
        weight: 3,
        dashArray: '5,4',
      }).addTo(dg);
      geoMeasurePts.forEach((pt) => {
        L.circleMarker(pt, { radius: 4, color: '#F59E0B', fillOpacity: 1 }).addTo(dg);
      });
    }

    if (searchPin) {
      const pinIcon = L.divIcon({
        className: 'fibercad-search-pin',
        html: `<div style="display:flex;flex-direction:column;align-items:center;">
          <div style="width:14px;height:14px;border-radius:50%;background:#0EA5E9;border:3px solid #FFFFFF;box-shadow:0 2px 8px rgba(0,0,0,0.6);"></div>
        </div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([searchPin.lat, searchPin.lng], { icon: pinIcon })
        .bindTooltip(searchPin.label, { direction: 'top', offset: [0, -8] })
        .addTo(dg);
    }
  }, [geoCableDraft, geoMeasurePts, cableConfig.color, searchPin]);

  const measuredGeoMeters = useMemo(() => computeGeoPathLengthMeters(geoMeasurePts), [geoMeasurePts]);

  const selectedConn = useMemo(
    () => connections.find((c) => c.id === selectedConnectionId) || null,
    [connections, selectedConnectionId]
  );

  const selectedConnLocked = useMemo(() => {
    if (!selectedConn) return false;
    const layer = layers.find((l) => l.id === selectedConn.layerId);
    return Boolean(selectedConn.locked || layer?.locked);
  }, [selectedConn, layers]);

  const fitMapToNodes = () => {
    const map = mapRef.current;
    if (!map || nodes.length === 0) return;
    const bounds = L.latLngBounds(nodes.map((n) => [n.lat, n.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.25));
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchLocations(searchQuery);
      setSearchResults(results);
      if (results.length === 0) {
        onNotify('No matching location found. Try a street, city, or "lat, lng".', 'warn');
      } else if (results.length === 1) {
        handleSelectSearchResult(results[0]);
      }
    } catch {
      onNotify('Location search unavailable — you can still enter "lat, lng" coordinates.', 'warn');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSearchResult = (res: GeoSearchResult) => {
    const map = mapRef.current;
    if (map) {
      map.flyTo([res.lat, res.lng], 17, { duration: 0.7 });
    }
    setSearchPin({ lat: res.lat, lng: res.lng, label: res.label });
    setSearchResults([]);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      onNotify('Browser geolocation is unavailable.', 'warn');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        mapRef.current?.flyTo([lat, lng], 17, { duration: 0.7 });
        setSearchPin({ lat, lng, label: 'Current Location' });
      },
      () => {
        onNotify('Unable to access current location. Use location search instead.', 'warn');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const switchSelectedToManual = () => {
    if (!selectedConn || selectedConnLocked) return;
    const src = nodes.find((n) => n.id === selectedConn.sourceNodeId);
    const dst = nodes.find((n) => n.id === selectedConn.targetNodeId);
    const currentPath: Array<[number, number]> =
      selectedConn.geoPath.length >= 2
        ? selectedConn.geoPath
        : src && dst
        ? [
            [src.lat, src.lng],
            [dst.lat, dst.lng],
          ]
        : [];
    const simplified = simplifyGeoPathForManualEdit(
      currentPath,
      5,
      selectedConn.geoLockedVertexIndices || []
    );
    const nextLen = computeGeoPathLengthMeters(simplified.points);
    onUpdateConnection(selectedConn.id, {
      geoPath: simplified.points,
      geoLockedVertexIndices: simplified.lockedIndices,
      lengthMeters: nextLen,
      autoCalculateLength: false,
      geoRouteMode: 'manual',
    });
    setSelectedVertexIdx(null);
    onNotify(
      'Manual bend mode: drag cyan bends, click or double-click any bend to Lock/Unlock individually, click cable to add bend.'
    );
  };

  const selectedConnLockedBends = selectedConn?.geoLockedVertexIndices || [];
  const isSelectedVertexLocked =
    selectedVertexIdx !== null && selectedConnLockedBends.includes(selectedVertexIdx);

  const toggleSelectedVertexLock = () => {
    if (!selectedConn || selectedVertexIdx === null || selectedConnLocked) return;
    const exists = selectedConnLockedBends.includes(selectedVertexIdx);
    const nextLocked = exists
      ? selectedConnLockedBends.filter((i) => i !== selectedVertexIdx)
      : [...selectedConnLockedBends, selectedVertexIdx].sort((a, b) => a - b);
    onUpdateConnection(selectedConn.id, { geoLockedVertexIndices: nextLocked });
  };

  const removeSelectedVertex = () => {
    if (!selectedConn || selectedVertexIdx === null || selectedConnLocked) return;
    if (isSelectedVertexLocked) {
      onNotify(`Bend #${selectedVertexIdx} is locked. Unlock it before removing.`, 'warn');
      return;
    }
    if (selectedConn.geoPath.length <= 2) return;
    const updated = selectedConn.geoPath.filter((_, i) => i !== selectedVertexIdx);
    const nextLocked = selectedConnLockedBends
      .filter((i) => i !== selectedVertexIdx)
      .map((i) => (i > selectedVertexIdx ? i - 1 : i));
    const nextLen = computeGeoPathLengthMeters(updated);
    onUpdateConnection(selectedConn.id, {
      geoPath: updated,
      geoLockedVertexIndices: nextLocked,
      lengthMeters: nextLen,
      autoCalculateLength: false,
      geoRouteMode: 'manual',
    });
    setSelectedVertexIdx(null);
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapDivRef} className="w-full h-full z-0" />

      {/* Top GIS Controls Bar */}
      <div className="absolute top-3 left-14 right-3 z-[500] flex flex-wrap items-start justify-between gap-2 pointer-events-none">
        {/* Left: Location Search + Base Map + Fit */}
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {/* Location Search */}
          <div className="relative">
            <form
              onSubmit={handleSearchSubmit}
              className="flex items-center gap-1 bg-slate-900/94 border border-slate-700 rounded-md px-2 py-1 shadow-lg"
            >
              <Search className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search street, city, or lat, lng..."
                className="w-48 sm:w-56 bg-transparent text-[11px] text-slate-100 placeholder:text-slate-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setSearchPin(null);
                  }}
                  title="Clear search"
                  className="p-0.5 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <button
                type="submit"
                disabled={searching}
                className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-medium disabled:opacity-50"
              >
                {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Go'}
              </button>
              <button
                type="button"
                onClick={handleLocateMe}
                title="Jump to my current location"
                className="p-1 rounded text-slate-300 hover:bg-slate-800 hover:text-sky-400"
              >
                <LocateFixed className="w-3.5 h-3.5" />
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-md bg-slate-900/98 border border-slate-700 shadow-2xl divide-y divide-slate-800 z-[550]">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelectSearchResult(r)}
                    className="w-full text-left px-2.5 py-2 hover:bg-sky-600/25 transition-colors flex items-start gap-2"
                  >
                    <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-[11px] text-slate-100 leading-snug line-clamp-2">
                        {r.label}
                      </div>
                      {r.category && (
                        <div className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">
                          {r.category}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Base Map Switcher */}
          <div className="flex items-center gap-1 bg-slate-900/94 border border-slate-700 rounded-md px-2 py-1 shadow-lg">
            {(['osm', 'satellite', 'dark'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setBaseMap(mode)}
                className={`px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
                  baseMap === mode
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {mode === 'osm' ? 'Street' : mode === 'satellite' ? 'Satellite' : 'Dark'}
              </button>
            ))}
            <button
              onClick={fitMapToNodes}
              className="ml-0.5 px-2 py-1 text-[11px] font-medium rounded bg-slate-800 text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              Fit Route
            </button>
          </div>
        </div>

        {/* Right: Cable Street Auto-Route / Manual Toggle & Import/Export */}
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-1 bg-slate-900/94 border border-slate-700 rounded-md px-2 py-1 shadow-lg">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 px-1">
              Cable Route:
            </span>
            <button
              onClick={() => setGisRouteMode('auto_street')}
              title="Automatically follow roads and streets when drawing fiber routes"
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
                gisRouteMode === 'auto_street'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Navigation className="w-3 h-3" />
              Auto Street
            </button>
            <button
              onClick={() => setGisRouteMode('manual')}
              title="Draw and drag manual street bends freely"
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
                gisRouteMode === 'manual'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Route className="w-3 h-3" />
              Manual
            </button>
            <button
              onClick={routeAllUnlockedAlongStreets}
              disabled={routingBusy}
              title="Auto-snap all unlocked fiber cables to roads & streets"
              className="ml-0.5 flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-slate-800 text-emerald-300 hover:bg-slate-700 whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {routingBusy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Navigation className="w-3 h-3" />
              )}
              Snap All Streets
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900/94 border border-slate-700 rounded-md px-2 py-1 shadow-lg">
            <input
              ref={fileInputRef}
              type="file"
              accept=".geojson,.json,.kml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportGisFile(file);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-slate-800 text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
            <button
              onClick={onExportGeoJson}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-slate-800 text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              GeoJSON
            </button>
            <button
              onClick={onExportKml}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-slate-800 text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              KML
            </button>
          </div>
        </div>
      </div>

      {/* Selected Fiber Cable GIS Control Bar */}
      {selectedConn && activeTool !== 'cable' && activeTool !== 'measure' && !placeComponentType && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[500] flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900/96 border border-slate-700 text-xs text-slate-100 shadow-2xl max-w-[94%]">
          <span className="font-mono-tabular font-bold text-sky-400">{selectedConn.cableId}</span>
          <span className="text-[11px] font-mono-tabular text-slate-300">
            {selectedConn.lengthMeters} m
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
              selectedConnLocked
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : selectedConn.geoRouteMode === 'manual'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            }`}
          >
            {selectedConnLocked
              ? 'Cable Locked'
              : selectedConn.geoRouteMode === 'manual'
              ? 'Manual Bends'
              : 'Auto Street'}
          </span>

          {selectedConnLockedBends.length > 0 && !selectedConnLocked && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/35">
              {selectedConnLockedBends.length} Bend{selectedConnLockedBends.length > 1 ? 's' : ''} Locked
            </span>
          )}

          <div className="h-4 w-px bg-slate-700 mx-0.5" />

          <button
            onClick={() => routeCableAlongStreet(selectedConn)}
            disabled={selectedConnLocked || routingBusy}
            title="Auto-route unlocked segments along roads and streets (keeps locked bends)"
            className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/90 hover:bg-emerald-500 text-white text-[11px] font-medium disabled:opacity-40"
          >
            {routingBusy ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Navigation className="w-3 h-3" />
            )}
            Auto Street
          </button>

          <button
            onClick={switchSelectedToManual}
            disabled={selectedConnLocked}
            title="Edit fiber bends manually (drag cyan bends, click any bend to Lock/Unlock individually, click cable to add bend)"
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium disabled:opacity-40 ${
              selectedConn.geoRouteMode === 'manual'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Route className="w-3 h-3" />
            Manual
          </button>

          {selectedVertexIdx !== null &&
            selectedVertexIdx > 0 &&
            selectedVertexIdx < selectedConn.geoPath.length - 1 &&
            !selectedConnLocked && (
              <>
                <div className="h-4 w-px bg-slate-700 mx-0.5" />
                <span className="text-[11px] font-mono-tabular text-sky-300">
                  Bend #{selectedVertexIdx}
                </span>
                <button
                  onClick={toggleSelectedVertexLock}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ${
                    isSelectedVertexLocked
                      ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                      : 'bg-slate-800 text-amber-300 hover:bg-slate-700'
                  }`}
                >
                  {isSelectedVertexLocked ? (
                    <>
                      <Unlock className="w-3 h-3" /> Unlock Bend
                    </>
                  ) : (
                    <>
                      <Lock className="w-3 h-3" /> Lock Bend
                    </>
                  )}
                </button>
                {!isSelectedVertexLocked && (
                  <button
                    onClick={removeSelectedVertex}
                    className="px-2 py-1 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-[11px] font-medium"
                  >
                    Del Bend
                  </button>
                )}
              </>
            )}

          <div className="h-4 w-px bg-slate-700 mx-0.5" />

          <button
            onClick={() =>
              onUpdateConnection(selectedConn.id, { locked: !selectedConn.locked })
            }
            title={
              selectedConn.locked
                ? 'Unlock entire cable'
                : 'Lock entire cable'
            }
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ${
              selectedConn.locked
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {selectedConn.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {selectedConn.locked ? 'Unlock Cable' : 'Lock All'}
          </button>
        </div>
      )}

      {/* Active GIS Mode Prompt */}
      {placeComponentType && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-2 px-3 py-1.5 rounded bg-sky-950/95 border border-sky-500 text-xs text-sky-100 shadow-lg">
          <MapPin className="w-3.5 h-3.5 text-sky-400" />
          <span>Click anywhere on the street map to place {placeComponentType.replace(/_/g, ' ').toUpperCase()}</span>
          <button
            onClick={onClearPlaceComponentType}
            className="ml-2 px-1.5 py-0.5 rounded bg-sky-800 hover:bg-sky-700 text-[10px]"
          >
            Cancel
          </button>
        </div>
      )}

      {activeTool === 'cable' && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-2 px-3 py-1.5 rounded bg-slate-900/95 border border-sky-500/60 text-xs text-slate-100 shadow-lg">
          <Layers className="w-3.5 h-3.5 text-sky-400" />
          <span>
            {geoCableDraft
              ? `Routing ${cableConfig.cableType} (${
                  gisRouteMode === 'auto_street' ? 'Auto Street' : 'Manual'
                }) from ${geoCableDraft.sourceNode.code} — Click street corners or target component (${computeGeoPathLengthMeters(
                  geoCableDraft.waypoints
                )} m)`
              : `GIS Fiber Route (${
                  gisRouteMode === 'auto_street' ? 'Auto Street' : 'Manual'
                }): Click a source component marker on the map`}
          </span>
          {geoCableDraft && (
            <button
              onClick={() => setGeoCableDraft(null)}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px]"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {activeTool === 'measure' && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-2 px-3 py-1.5 rounded bg-slate-900/95 border border-amber-500/60 text-xs font-mono-tabular text-amber-200 shadow-lg">
          <Ruler className="w-3.5 h-3.5 text-amber-400" />
          <span>
            GIS Distance: {measuredGeoMeters} m ({(measuredGeoMeters / 1000).toFixed(3)} km) · {geoMeasurePts.length} pts
          </span>
          {geoMeasurePts.length > 0 && (
            <button
              onClick={() => setGeoMeasurePts([])}
              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Search Pin Clear Action */}
      {searchPin && (
        <div className="absolute bottom-2 left-48 z-[500] flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900/90 border border-sky-500/40 text-[10px] text-sky-200">
          <MapPin className="w-3 h-3 text-sky-400" />
          <span className="max-w-44 truncate">{searchPin.label}</span>
          <button
            onClick={() => setSearchPin(null)}
            className="text-slate-400 hover:text-white"
            title="Clear search pin"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Zoom & Lat/Lng Readout */}
      <div className="absolute bottom-2 left-3 z-[500] px-2 py-0.5 rounded bg-slate-900/85 border border-slate-700 text-[10px] font-mono-tabular text-slate-300 pointer-events-none">
        Z{zoomLevel} · {cursorLatLng[0].toFixed(5)}°, {cursorLatLng[1].toFixed(5)}°
      </div>
    </div>
  );
};
