import { FiberConnection, FtthComponentType, FtthNode } from '../types/ftth';
import { CABLE_TYPE_DEFAULTS, createNodeFromCatalog } from '../data/componentCatalog';
import { computeGeoPathLengthMeters } from './opticalCalculator';

function guessTypeFromName(name: string): FtthComponentType {
  const u = name.toUpperCase();
  if (u.includes('OLT')) return 'olt';
  if (u.includes('ODF')) return 'odf';
  if (u.includes('SPL') || u.includes('SPLIT')) return 'splitter_1_8';
  if (u.includes('FAT')) return 'fat';
  if (u.includes('FDB')) return 'fdb';
  if (u.includes('FDT')) return 'fdt';
  if (u.includes('FJC') || u.includes('CLOS')) return 'joint_closure';
  if (u.includes('MH') || u.includes('MANHOLE')) return 'manhole';
  if (u.includes('POLE')) return 'pole';
  if (u.includes('ONT')) return 'ont';
  if (u.includes('ONU')) return 'onu';
  return 'fat';
}

function projectLatLngToCanvas(
  lat: number,
  lng: number,
  originLat: number,
  originLng: number
): { x: number; y: number } {
  const x = 400 + (lng - originLng) * 55000;
  const y = 350 - (lat - originLat) * 55000;
  return { x: Math.round(x), y: Math.round(y) };
}

export function parseGeoJsonToProjectItems(
  jsonText: string,
  originLat: number,
  originLng: number,
  startSeq: number
): { nodes: FtthNode[]; connections: FiberConnection[] } {
  const data = JSON.parse(jsonText);
  const features: Array<{
    geometry?: { type: string; coordinates: unknown };
    properties?: Record<string, unknown>;
  }> = data.type === 'FeatureCollection' ? data.features || [] : [data];

  const nodes: FtthNode[] = [];
  const connections: FiberConnection[] = [];
  let seq = startSeq;

  const pointFeatures = features.filter((f) => f.geometry?.type === 'Point');
  const lineFeatures = features.filter((f) => f.geometry?.type === 'LineString');

  // If origin hasn't been anchored, center on first point
  let refLat = originLat;
  let refLng = originLng;
  if (pointFeatures.length > 0) {
    const coords = pointFeatures[0].geometry!.coordinates as number[];
    refLng = coords[0];
    refLat = coords[1];
  }

  for (const f of pointFeatures) {
    const coords = f.geometry!.coordinates as number[];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    const props = f.properties || {};
    const ftthType = (props.ftthType as FtthComponentType) || guessTypeFromName(String(props.code || props.name || ''));
    const { x, y } = projectLatLngToCanvas(lat, lng, refLat, refLng);
    const node = createNodeFromCatalog(ftthType, x, y, seq++, lat, lng);
    if (props.code) node.code = String(props.code);
    if (props.name) node.name = String(props.name);
    nodes.push(node);
  }

  for (const f of lineFeatures) {
    const rawCoords = f.geometry!.coordinates as number[][];
    if (!Array.isArray(rawCoords) || rawCoords.length < 2) continue;
    const geoPath: Array<[number, number]> = rawCoords.map((c) => [Number(c[1]), Number(c[0])]);
    const props = f.properties || {};
    const first = geoPath[0];
    const last = geoPath[geoPath.length - 1];

    // Match nearest nodes or create junction endpoints
    const findOrMake = (pt: [number, number], label: string) => {
      const existing = nodes.find(
        (n) => Math.hypot(n.lat - pt[0], n.lng - pt[1]) < 0.00015
      );
      if (existing) return existing;
      const { x, y } = projectLatLngToCanvas(pt[0], pt[1], refLat, refLng);
      const n = createNodeFromCatalog('joint_closure', x, y, seq++, pt[0], pt[1]);
      n.code = label;
      nodes.push(n);
      return n;
    };

    const src = findOrMake(first, `FJC-${seq}`);
    const dst = findOrMake(last, `FJC-${seq}`);
    const cableType = (props.cableType as keyof typeof CABLE_TYPE_DEFAULTS) || 'distribution';
    const def = CABLE_TYPE_DEFAULTS[cableType] || CABLE_TYPE_DEFAULTS.distribution;

    connections.push({
      id: `conn-imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cableId: String(props.cableId || `IMP-${seq++}`),
      fiberId: String(props.fiberId || 'F1'),
      sourceNodeId: src.id,
      sourcePortId: src.outputPorts[0]?.id || 'out-1',
      targetNodeId: dst.id,
      targetPortId: dst.inputPorts[0]?.id || 'in-1',
      cableType,
      coreCapacity: Number(props.coreCapacity) || def.cores,
      color: String(props.color || def.color),
      routeType: def.routeType,
      installationMethod: def.install,
      fiberStandard: def.standard,
      routingStyle: 'straight',
      lengthMeters: Number(props.lengthMeters) || computeGeoPathLengthMeters(geoPath),
      autoCalculateLength: false,
      attenuationDownDbPerKm: def.attenDown,
      attenuationUpDbPerKm: def.attenUp,
      spliceCount: 2,
      spliceLossDb: 0.05,
      connectorCount: 1,
      connectorLossDb: 0.35,
      layerId: def.layerId,
      waypoints: [],
      geoPath,
    });
  }

  return { nodes, connections };
}

export function parseKmlToProjectItems(
  kmlText: string,
  originLat: number,
  originLng: number,
  startSeq: number
): { nodes: FtthNode[]; connections: FiberConnection[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'application/xml');
  const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
  const features: Array<{
    type: 'Feature';
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown>;
  }> = [];

  for (const pm of placemarks) {
    const name = pm.getElementsByTagName('name')[0]?.textContent?.trim() || 'Imported';
    const point = pm.getElementsByTagName('Point')[0];
    const line = pm.getElementsByTagName('LineString')[0];

    if (point) {
      const coordText = point.getElementsByTagName('coordinates')[0]?.textContent?.trim() || '';
      const [lng, lat] = coordText.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { name, code: name.split(' ')[0] },
        });
      }
    } else if (line) {
      const coordText = line.getElementsByTagName('coordinates')[0]?.textContent?.trim() || '';
      const coords = coordText
        .split(/\s+/)
        .map((pair) => pair.split(',').map(Number))
        .filter((arr) => arr.length >= 2 && Number.isFinite(arr[0]) && Number.isFinite(arr[1]))
        .map(([lng, lat]) => [lng, lat]);
      if (coords.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { cableId: name },
        });
      }
    }
  }

  return parseGeoJsonToProjectItems(
    JSON.stringify({ type: 'FeatureCollection', features }),
    originLat,
    originLng,
    startSeq
  );
}
