import { computeGeoPathLengthMeters } from './opticalCalculator';

export interface GeoSearchResult {
  id: string;
  label: string;
  lat: number;
  lng: number;
  category?: string;
}

/**
 * Parses direct "lat, lng" or "lat lng" strings if the user enters coordinates.
 */
export function parseCoordinateQuery(query: string): [number, number] | null {
  const trimmed = query.trim();
  const m = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    return [lat, lng];
  }
  return null;
}

/**
 * Searches OpenStreetMap Nominatim for addresses, streets, cities, or landmarks.
 */
export async function searchLocations(query: string): Promise<GeoSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const coords = parseCoordinateQuery(trimmed);
  if (coords) {
    return [
      {
        id: `coord-${coords[0]}-${coords[1]}`,
        label: `Coordinates: ${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`,
        lat: coords[0],
        lng: coords[1],
        category: 'Coordinates',
      },
    ];
  }

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(
    trimmed
  )}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Location search failed (${res.status})`);
  }
  const data = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    type?: string;
    category?: string;
  }>;

  return data.map((item) => ({
    id: String(item.place_id),
    label: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
    category: item.type || item.category,
  }));
}

/**
 * Routes a list of [lat, lng] points along real roads and streets via OSRM.
 * Anchors exact start and end coordinates so the fiber line still terminates
 * cleanly at component markers even when markers sit off the road centerline.
 */
export async function fetchStreetRoute(
  waypoints: Array<[number, number]>
): Promise<{ geoPath: Array<[number, number]>; lengthMeters: number; routedByStreet: boolean }> {
  if (waypoints.length < 2) {
    return {
      geoPath: waypoints,
      lengthMeters: 0,
      routedByStreet: false,
    };
  }

  const coordStr = waypoints.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const profiles = ['driving', 'foot'];

  for (const profile of profiles) {
    try {
      const url = `https://router.project-osrm.org/route/v1/${profile}/${coordStr}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as {
        code?: string;
        routes?: Array<{
          geometry?: { coordinates?: Array<[number, number]> };
        }>;
      };
      const coords = json.routes?.[0]?.geometry?.coordinates;
      if (json.code === 'Ok' && coords && coords.length >= 2) {
        const mapped: Array<[number, number]> = coords.map(([lng, lat]) => [lat, lng]);
        // Anchor exact component marker endpoints
        const start = waypoints[0];
        const end = waypoints[waypoints.length - 1];
        const path: Array<[number, number]> = [start, ...mapped, end];
        // Deduplicate consecutive identical points
        const deduped: Array<[number, number]> = [];
        for (const pt of path) {
          const prev = deduped[deduped.length - 1];
          if (
            !prev ||
            Math.abs(prev[0] - pt[0]) > 1e-6 ||
            Math.abs(prev[1] - pt[1]) > 1e-6
          ) {
            deduped.push(pt);
          }
        }
        return {
          geoPath: deduped,
          lengthMeters: Math.max(1, computeGeoPathLengthMeters(deduped)),
          routedByStreet: true,
        };
      }
    } catch {
      // Try next profile or fallback
    }
  }

  return {
    geoPath: waypoints,
    lengthMeters: Math.max(1, computeGeoPathLengthMeters(waypoints)),
    routedByStreet: false,
  };
}

function perpendicularDistanceDeg(
  pt: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number]
): number {
  const dx = lineEnd[1] - lineStart[1];
  const dy = lineEnd[0] - lineStart[0];
  if (dx === 0 && dy === 0) {
    return Math.hypot(pt[0] - lineStart[0], pt[1] - lineStart[1]);
  }
  const num = Math.abs(dy * pt[1] - dx * pt[0] + lineEnd[1] * lineStart[0] - lineEnd[0] * lineStart[1]);
  return num / Math.hypot(dx, dy);
}

/**
 * Simplifies dense street geometries into clean editable bend points
 * (~5m default tolerance) while keeping every locked bend intact at its exact coordinates.
 */
export function simplifyGeoPathForManualEdit(
  points: Array<[number, number]>,
  toleranceMeters = 5,
  lockedIndices: number[] = []
): { points: Array<[number, number]>; lockedIndices: number[] } {
  if (points.length <= 2) {
    return { points, lockedIndices: [] };
  }

  const validLocked = Array.from(
    new Set(lockedIndices.filter((i) => i > 0 && i < points.length - 1))
  ).sort((a, b) => a - b);

  const simplifySegment = (pts: Array<[number, number]>, tolM: number): Array<[number, number]> => {
    if (pts.length <= 2) return pts;
    const tolDeg = tolM / 111320;
    const rdp = (sub: Array<[number, number]>): Array<[number, number]> => {
      if (sub.length <= 2) return sub;
      let maxDist = 0;
      let index = 0;
      for (let i = 1; i < sub.length - 1; i++) {
        const d = perpendicularDistanceDeg(sub[i], sub[0], sub[sub.length - 1]);
        if (d > maxDist) {
          maxDist = d;
          index = i;
        }
      }
      if (maxDist > tolDeg) {
        const left = rdp(sub.slice(0, index + 1));
        const right = rdp(sub.slice(index));
        return [...left.slice(0, -1), ...right];
      }
      return [sub[0], sub[sub.length - 1]];
    };
    let out = rdp(pts);
    let curTol = tolM;
    while (out.length > 16 && curTol < 80) {
      curTol *= 1.6;
      out = simplifySegment(out, curTol);
    }
    return out;
  };

  if (validLocked.length === 0) {
    if (points.length <= 14) return { points, lockedIndices: [] };
    return { points: simplifySegment(points, toleranceMeters), lockedIndices: [] };
  }

  const anchors = [0, ...validLocked, points.length - 1];
  const result: Array<[number, number]> = [];
  const nextLocked: number[] = [];

  for (let i = 0; i < anchors.length - 1; i++) {
    const startIdx = anchors[i];
    const endIdx = anchors[i + 1];
    const slice = points.slice(startIdx, endIdx + 1);
    const simplified = slice.length > 10 ? simplifySegment(slice, toleranceMeters) : slice;
    if (i === 0) {
      result.push(...simplified);
    } else {
      result.push(...simplified.slice(1));
    }
    if (i < anchors.length - 2) {
      nextLocked.push(result.length - 1);
    }
  }

  return { points: result, lockedIndices: nextLocked };
}

/**
 * Auto-routes unlocked sub-paths along roads and streets while keeping every locked bend
 * completely undisturbed at its exact coordinates.
 */
export async function routeWithLockedAnchors(
  currentPath: Array<[number, number]>,
  lockedIndices: number[] = [],
  scope: 'start' | 'end' | 'all' = 'all'
): Promise<{
  geoPath: Array<[number, number]>;
  lockedIndices: number[];
  lengthMeters: number;
  routedByStreet: boolean;
}> {
  if (currentPath.length < 2) {
    return {
      geoPath: currentPath,
      lockedIndices: [],
      lengthMeters: 0,
      routedByStreet: false,
    };
  }

  const sortedLocked = Array.from(
    new Set(lockedIndices.filter((i) => i > 0 && i < currentPath.length - 1))
  ).sort((a, b) => a - b);

  if (sortedLocked.length === 0) {
    const res = await fetchStreetRoute([currentPath[0], currentPath[currentPath.length - 1]]);
    return {
      geoPath: res.geoPath,
      lockedIndices: [],
      lengthMeters: res.lengthMeters,
      routedByStreet: res.routedByStreet,
    };
  }

  if (scope === 'start') {
    const k0 = sortedLocked[0];
    const sub = await fetchStreetRoute([currentPath[0], currentPath[k0]]);
    const prefix = sub.geoPath.slice(0, -1);
    const nextPath: Array<[number, number]> = [
      ...prefix,
      currentPath[k0],
      ...currentPath.slice(k0 + 1),
    ];
    const shift = prefix.length - k0;
    return {
      geoPath: nextPath,
      lockedIndices: sortedLocked.map((idx) => idx + shift),
      lengthMeters: Math.max(1, computeGeoPathLengthMeters(nextPath)),
      routedByStreet: sub.routedByStreet,
    };
  }

  if (scope === 'end') {
    const kLast = sortedLocked[sortedLocked.length - 1];
    const sub = await fetchStreetRoute([currentPath[kLast], currentPath[currentPath.length - 1]]);
    const nextPath: Array<[number, number]> = [
      ...currentPath.slice(0, kLast + 1),
      ...sub.geoPath.slice(1),
    ];
    return {
      geoPath: nextPath,
      lockedIndices: sortedLocked,
      lengthMeters: Math.max(1, computeGeoPathLengthMeters(nextPath)),
      routedByStreet: sub.routedByStreet,
    };
  }

  // scope === 'all': route each segment between anchors, preserving locked bend coordinates
  const anchors = [0, ...sortedLocked, currentPath.length - 1];
  const stitched: Array<[number, number]> = [];
  const nextLocked: number[] = [];
  let anyStreet = false;

  for (let i = 0; i < anchors.length - 1; i++) {
    const aIdx = anchors[i];
    const bIdx = anchors[i + 1];
    const sub = await fetchStreetRoute([currentPath[aIdx], currentPath[bIdx]]);
    if (sub.routedByStreet) anyStreet = true;
    const segPts = i === 0 ? sub.geoPath : sub.geoPath.slice(1);
    stitched.push(...segPts);
    if (i < anchors.length - 2) {
      // Exact locked bend point sits at stitched.length - 1
      stitched[stitched.length - 1] = currentPath[bIdx];
      nextLocked.push(stitched.length - 1);
    }
  }

  return {
    geoPath: stitched,
    lockedIndices: nextLocked,
    lengthMeters: Math.max(1, computeGeoPathLengthMeters(stitched)),
    routedByStreet: anyStreet,
  };
}

