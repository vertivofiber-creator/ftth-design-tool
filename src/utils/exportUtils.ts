import { jsPDF } from 'jspdf';
import { FiberConnection, FtthNode, FtthProject } from '../types/ftth';
import { FIBER_PORT_COLORS, getPortWorldPosition } from '../data/componentCatalog';
import {
  auditAllOnus,
  calculateAllPortOpticalLevels,
  computeConnectionSchematicLengthM,
  isCustomerOnu,
} from './opticalCalculator';

export interface PdfPrintOptions {
  pageSize: 'a4' | 'a3' | 'letter';
  orientation: 'landscape' | 'portrait';
  includeLegend: boolean;
  includeTitleBlock: boolean;
  includeOpticalTable: boolean;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportProjectJson(project: FtthProject) {
  const json = JSON.stringify(project, null, 2);
  const safeName = project.settings.projectCode || 'ftth-project';
  downloadBlob(new Blob([json], { type: 'application/json' }), `${safeName}.fibercad.json`);
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hexToRgb(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!hex) return fallback;
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean;
  if (full.length !== 6) return fallback;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return fallback;
  return [r, g, b];
}

function isVeryLightRgb([r, g, b]: [number, number, number]): boolean {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.78;
}

function isVeryLightHex(hex: string | undefined): boolean {
  if (!hex) return false;
  return isVeryLightRgb(hexToRgb(hex, [100, 116, 139]));
}

function getReadableLightTextRgb(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  const rgb = hexToRgb(hex, fallback);
  if (isVeryLightRgb(rgb)) return [51, 65, 85];
  // Slightly darken bright yellow/green for crisp print legibility on white
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  if (lum > 0.65) {
    return [Math.round(rgb[0] * 0.72), Math.round(rgb[1] * 0.72), Math.round(rgb[2] * 0.72)];
  }
  return rgb;
}

function getColorLabel(hex: string | undefined): string {
  if (!hex) return 'Default';
  const match = FIBER_PORT_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
  return match ? `${match.name} (${hex.toUpperCase()})` : hex.toUpperCase();
}

function buildConnectionPathD(conn: FiberConnection, nodesById: Map<string, FtthNode>): string {
  const src = nodesById.get(conn.sourceNodeId);
  const dst = nodesById.get(conn.targetNodeId);
  if (!src || !dst) return '';
  const p1 = getPortWorldPosition(src, conn.sourcePortId);
  const p2 = getPortWorldPosition(dst, conn.targetPortId);

  if (conn.waypoints.length > 0) {
    const pts = [p1, ...conn.waypoints, p2];
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }

  if (conn.routingStyle === 'straight') {
    return `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  if (conn.routingStyle === 'curved') {
    const dx = Math.max(40, Math.abs(p2.x - p1.x) * 0.45);
    return `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} C ${(p1.x + dx).toFixed(1)} ${p1.y.toFixed(1)}, ${(p2.x - dx).toFixed(1)} ${p2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  const midX = (p1.x + p2.x) / 2;
  return `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${midX.toFixed(1)} ${p1.y.toFixed(1)} L ${midX.toFixed(1)} ${p2.y.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
}

export function generateStandaloneSvgString(project: FtthProject, lightSheet = true): string {
  const visibleLayers = new Set(project.layers.filter((l) => l.visible).map((l) => l.id));
  const nodes = project.nodes.filter((n) => visibleLayers.has(n.layerId));
  const nodesById = new Map(project.nodes.map((n) => [n.id, n]));
  const connections = project.connections.filter((c) => visibleLayers.has(c.layerId));
  const portLevels = calculateAllPortOpticalLevels(project.nodes, project.connections, project.settings);
  const onuAudits = auditAllOnus(project.nodes, project.connections, project.settings);
  const onuAuditById = new Map(onuAudits.map((a) => [a.targetNodeId, a]));

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - 90);
    minY = Math.min(minY, n.y - 40);
    maxX = Math.max(maxX, n.x + n.width + 110);
    maxY = Math.max(maxY, n.y + n.height + 70);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1200;
    maxY = 750;
  }
  const contentW = Math.max(960, maxX - minX);
  const contentH = Math.max(600, maxY - minY + 140); // Extra bottom area for title block & legend

  const bg = lightSheet ? '#FFFFFF' : '#0B0F17';
  const fg = lightSheet ? '#0F172A' : '#F8FAFC';
  const borderCol = lightSheet ? '#CBD5E1' : '#334155';
  const mutedCol = lightSheet ? '#475569' : '#94A3B8';

  const linesSvg = connections
    .map((c) => {
      const d = buildConnectionPathD(c, nodesById);
      const src = nodesById.get(c.sourceNodeId);
      const dst = nodesById.get(c.targetNodeId);
      if (!src || !dst || !d) return '';
      const p1 = getPortWorldPosition(src, c.sourcePortId);
      const p2 = getPortWorldPosition(dst, c.targetPortId);
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2 - 6;
      const len = c.autoCalculateLength
        ? computeConnectionSchematicLengthM(c, nodesById, project.settings.metersPerPixel)
        : c.lengthMeters;
      return `
        ${
          lightSheet && isVeryLightHex(c.color)
            ? `<path d="${d}" fill="none" stroke="#64748B" stroke-width="4" ${
                c.routeType === 'underground' ? 'stroke-dasharray="8,4"' : ''
              } />`
            : ''
        }
        <path d="${d}" fill="none" stroke="${escapeXml(c.color)}" stroke-width="2.4" ${
        c.routeType === 'underground' ? 'stroke-dasharray="8,4"' : ''
      } />
        <text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" font-family="monospace" font-size="10" fill="${mutedCol}" text-anchor="middle">${escapeXml(
        `${c.cableId} (${c.coreCapacity}F · ${len}m)`
      )}</text>
      `;
    })
    .join('\n');

  const nodesSvg = nodes
    .map((n) => {
      const isSplitter = n.type.startsWith('splitter_') || n.type === 'fbt_splitter';
      const isRatioCoupler = n.type === 'ratio_coupler';
      const isOptCoupler = n.type === 'optical_coupler';
      const in1Col = n.inputPorts[0]?.color || '#10B981';
      const out1Col = n.outputPorts[0]?.color || '#EF4444';
      const out2Col = n.outputPorts[1]?.color || '#3B82F6';
      const svgLine = (x1: number, y1: number, x2: number, y2: number, col: string, w: number) => `
        ${lightSheet && isVeryLightHex(col) ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#475569" stroke-width="${w + 1.4}" />` : ''}
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${escapeXml(col)}" stroke-width="${w}" />
      `;

      let body = '';
      if (isRatioCoupler) {
        const jx = n.x + n.width * 0.36;
        const jy = n.y + n.height * 0.5;
        body = `
          <polygon points="${n.x + n.width * 0.1},${n.y + n.height * 0.22} ${n.x + n.width * 0.88},${n.y + n.height * 0.08} ${n.x + n.width * 0.88},${n.y + n.height * 0.92} ${n.x + n.width * 0.1},${n.y + n.height * 0.78}" fill="${
            lightSheet ? '#F8FAFC' : '#111827'
          }" stroke="${borderCol}" stroke-width="2"/>
          ${svgLine(n.x + n.width * 0.1, jy, jx, jy, in1Col, 2.4)}
          ${svgLine(jx, jy, n.x + n.width * 0.88, n.y + n.height * 0.28, out1Col, 2.6)}
          ${svgLine(jx, jy, n.x + n.width * 0.88, n.y + n.height * 0.72, out2Col, 2.2)}
          <circle cx="${jx}" cy="${jy}" r="4" fill="#F59E0B" />
        `;
      } else if (isOptCoupler) {
        body = `
          <rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="5" fill="${
            lightSheet ? '#F8FAFC' : '#111827'
          }" stroke="${borderCol}" stroke-width="2"/>
          ${svgLine(n.x + 6, n.y + n.height * 0.65, n.x + n.width - 6, n.y + n.height * 0.35, out1Col, 2)}
          ${svgLine(n.x + 6, n.y + n.height * 0.35, n.x + n.width - 6, n.y + n.height * 0.65, out2Col, 2)}
          <text x="${n.x + n.width / 2}" y="${n.y + n.height / 2 + 3}" font-family="sans-serif" font-size="9" font-weight="700" fill="${fg}" text-anchor="middle">${escapeXml(n.code)}</text>
        `;
      } else if (isSplitter) {
        body = `
          <polygon points="${n.x},${n.y + n.height / 2} ${n.x + n.width},${n.y} ${n.x + n.width},${n.y + n.height}" fill="${
            lightSheet ? '#FFFBEB' : '#1E293B'
          }" stroke="#F59E0B" stroke-width="2"/>
          <text x="${n.x + n.width * 0.62}" y="${n.y + n.height / 2 + 4}" font-family="sans-serif" font-size="10" font-weight="700" fill="${fg}" text-anchor="middle">${escapeXml(n.code)}</text>
        `;
      } else {
        body = `
          <rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="5" fill="${
            lightSheet ? '#F8FAFC' : '#111827'
          }" stroke="${borderCol}" stroke-width="2"/>
          <text x="${n.x + n.width / 2}" y="${n.y + n.height / 2 + 4}" font-family="sans-serif" font-size="11" font-weight="700" fill="${fg}" text-anchor="middle">${escapeXml(
            n.type === 'text_label' || n.type === 'note_box' ? n.annotationText || n.name : n.code
          )}</text>
        `;
      }

      const inPortsSvg = n.inputPorts
        .map((p, idx) => {
          const py = n.y + ((idx + 1) / (n.inputPorts.length + 1)) * n.height;
          const pLevel = portLevels.get(`${n.id}:${p.id}`);
          const pCol = p.color || '#10B981';
          const levelCol = !pLevel
            ? mutedCol
            : pLevel.status === 'normal'
            ? '#059669'
            : pLevel.status === 'low_margin'
            ? '#D97706'
            : '#DC2626';
          const labelCol = p.color && !(lightSheet && isVeryLightHex(p.color)) ? p.color : mutedCol;
          const dbmStr =
            project.settings.showPortOpticalDbm !== false && pLevel
              ? `${pLevel.powerDbm >= 0 ? '+' : ''}${pLevel.powerDbm.toFixed(1)} dBm`
              : '';
          const portTxt = project.settings.showPortLabels ? p.label : '';
          return `
            <circle cx="${n.x}" cy="${py}" r="4.2" fill="${escapeXml(pCol)}" stroke="${lightSheet ? '#334155' : bg}" stroke-width="1.3" />
            ${
              portTxt || dbmStr
                ? `<text x="${n.x - 7}" y="${py + 3}" font-family="monospace" font-size="8.5" fill="${escapeXml(labelCol)}" text-anchor="end">${escapeXml(
                    portTxt
                  )}${dbmStr ? `<tspan fill="${levelCol}" font-weight="700">${portTxt ? ' ' : ''}${escapeXml(dbmStr)}</tspan>` : ''}</text>`
                : ''
            }
          `;
        })
        .join('');

      const outPortsSvg = n.outputPorts
        .map((p, idx) => {
          const py = n.y + ((idx + 1) / (n.outputPorts.length + 1)) * n.height;
          const pLevel = portLevels.get(`${n.id}:${p.id}`);
          const isConn = connections.some((c) => c.sourceNodeId === n.id && c.sourcePortId === p.id);
          const pCol = p.color || (isConn ? '#0EA5E9' : '#F59E0B');
          const labelCol = p.color && !(lightSheet && isVeryLightHex(p.color)) ? p.color : mutedCol;
          const levelCol = !pLevel
            ? mutedCol
            : pLevel.isSource
            ? '#0284C7'
            : pLevel.status === 'normal'
            ? '#059669'
            : pLevel.status === 'low_margin'
            ? '#D97706'
            : '#DC2626';
          let rightTxt = '';
          if (project.settings.showPortOpticalDbm !== false) {
            if (pLevel) {
              rightTxt = `${pLevel.powerDbm >= 0 ? '+' : ''}${pLevel.powerDbm.toFixed(1)} dBm`;
            } else if ((p.portLossDb ?? 0) > 0) {
              rightTxt = `(-${(p.portLossDb || 0).toFixed(1)} dB)`;
            }
          }
          const portTxt = project.settings.showPortLabels ? p.label : '';
          return `
            <circle cx="${n.x + n.width}" cy="${py}" r="4.2" fill="${escapeXml(pCol)}" stroke="${lightSheet ? '#334155' : bg}" stroke-width="1.3" />
            ${
              portTxt || rightTxt
                ? `<text x="${n.x + n.width + 7}" y="${py + 3}" font-family="monospace" font-size="8.5" fill="${escapeXml(labelCol)}" text-anchor="start">${escapeXml(
                    portTxt
                  )}${rightTxt ? `<tspan fill="${pLevel ? levelCol : mutedCol}" font-weight="${pLevel ? '700' : '500'}">${portTxt ? ' ' : ''}${escapeXml(rightTxt)}</tspan>` : ''}</text>`
                : ''
            }
          `;
        })
        .join('');

      const onuAudit = isCustomerOnu(n.type) ? onuAuditById.get(n.id) : undefined;
      const bottomBadge =
        isRatioCoupler || isOptCoupler
          ? `<rect x="${n.x + n.width / 2 - 42}" y="${n.y + n.height + 31}" width="84" height="15" rx="3" fill="${
              lightSheet ? '#FFFBEB' : '#0F172A'
            }" stroke="#F59E0B" stroke-width="1" />
             <text x="${n.x + n.width / 2}" y="${n.y + n.height + 41.5}" font-family="monospace" font-size="8.5" font-weight="700" fill="#D97706" text-anchor="middle">${escapeXml(
              `RATIO ${n.properties.couplingRatio || '80:20'}`
            )}</text>`
          : onuAudit
          ? `<rect x="${n.x + n.width / 2 - 48}" y="${n.y + n.height + 31}" width="96" height="15" rx="3" fill="${
              lightSheet ? '#F8FAFC' : '#0F172A'
            }" stroke="${
              onuAudit.status === 'normal'
                ? '#10B981'
                : onuAudit.status === 'low_margin'
                ? '#F59E0B'
                : '#EF4444'
            }" stroke-width="1" />
             <text x="${n.x + n.width / 2}" y="${n.y + n.height + 41.5}" font-family="monospace" font-size="8.5" font-weight="700" fill="${
              onuAudit.status === 'normal'
                ? '#059669'
                : onuAudit.status === 'low_margin'
                ? '#D97706'
                : '#DC2626'
            }" text-anchor="middle">${escapeXml(
              onuAudit.receivedPowerDownDbm > -90
                ? `Rx ${onuAudit.receivedPowerDownDbm.toFixed(1)} dBm`
                : 'No OLT Link'
            )}</text>`
          : '';

      const footerLabels =
        n.type === 'text_label' || n.type === 'note_box'
          ? ''
          : `<text x="${n.x + n.width / 2}" y="${n.y + n.height + 14}" font-family="monospace" font-size="10" font-weight="700" fill="${fg}" text-anchor="middle">${escapeXml(
              n.code
            )}</text>
             <text x="${n.x + n.width / 2}" y="${n.y + n.height + 25}" font-family="sans-serif" font-size="8.5" fill="${mutedCol}" text-anchor="middle">${escapeXml(
              n.name
            )}</text>
             ${bottomBadge}`;

      return `
        <g transform="rotate(${n.rotation} ${n.x + n.width / 2} ${n.y + n.height / 2})">
          ${body}
          ${inPortsSvg}
          ${outPortsSvg}
          ${footerLabels}
        </g>
      `;
    })
    .join('\n');

  const tbY = minY + contentH - 110;
  const titleBlock = `
    <rect x="${minX + 12}" y="${tbY}" width="${contentW - 24}" height="96" fill="${
    lightSheet ? '#F8FAFC' : '#111827'
  }" stroke="${borderCol}" stroke-width="1.5" />
    <line x1="${minX + contentW * 0.55}" y1="${tbY}" x2="${minX + contentW * 0.55}" y2="${
    tbY + 96
  }" stroke="${borderCol}" stroke-width="1" />
    <text x="${minX + 26}" y="${tbY + 26}" font-family="sans-serif" font-size="14" font-weight="700" fill="${fg}">LEGEND:  Feeder (#0EA5E9) · Distribution (#A855F7) · Drop (#22C55E) · Underground (Dashed)</text>
    <text x="${minX + 26}" y="${tbY + 52}" font-family="monospace" font-size="11" fill="${mutedCol}">Scale: 1 px = ${
    project.settings.metersPerPixel
  } m  |  Nodes: ${nodes.length}  |  Cables: ${connections.length}</text>
    <text x="${minX + 26}" y="${tbY + 76}" font-family="monospace" font-size="11" fill="${mutedCol}">Client: ${escapeXml(
    project.settings.clientName
  )}  |  Location: ${escapeXml(project.settings.locationName)}</text>
    <text x="${minX + contentW * 0.55 + 16}" y="${tbY + 28}" font-family="sans-serif" font-size="15" font-weight="700" fill="${fg}">${escapeXml(
    project.settings.projectName
  )}</text>
    <text x="${minX + contentW * 0.55 + 16}" y="${tbY + 52}" font-family="monospace" font-size="11" fill="${mutedCol}">Drawing Code: ${escapeXml(
    project.settings.projectCode
  )}</text>
    <text x="${minX + contentW * 0.55 + 16}" y="${tbY + 76}" font-family="monospace" font-size="11" fill="${mutedCol}">Engineer: ${escapeXml(
    project.settings.engineerName
  )}  |  Date: ${new Date().toISOString().slice(0, 10)}</text>
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${contentW}" height="${contentH}" viewBox="${minX} ${minY} ${contentW} ${contentH}">
  <rect x="${minX}" y="${minY}" width="${contentW}" height="${contentH}" fill="${bg}" />
  <rect x="${minX + 6}" y="${minY + 6}" width="${contentW - 12}" height="${contentH - 12}" fill="none" stroke="${borderCol}" stroke-width="2" />
  ${linesSvg}
  ${nodesSvg}
  ${titleBlock}
</svg>`;
}

export function exportSvg(project: FtthProject) {
  const svg = generateStandaloneSvgString(project, true);
  downloadBlob(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
    `${project.settings.projectCode || 'ftth-drawing'}.svg`
  );
}

export async function exportPng(project: FtthProject) {
  const svgStr = generateStandaloneSvgString(project, true);
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          downloadBlob(blob, `${project.settings.projectCode || 'ftth-drawing'}.png`);
        }
        URL.revokeObjectURL(url);
        resolve();
      }, 'image/png');
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export function exportPdf(project: FtthProject, options: PdfPrintOptions) {
  const doc = new jsPDF({
    orientation: options.orientation,
    unit: 'mm',
    format: options.pageSize,
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const titleBlockH = options.includeTitleBlock ? 28 : 0;
  const drawW = pageW - margin * 2;
  const drawH = pageH - margin * 2 - titleBlockH - 4;

  // Outer CAD Sheet Frame
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.5);
  doc.rect(margin, margin, drawW, pageH - margin * 2);

  // Compute bounding box (extra horizontal/bottom margin for port dBm labels & bottom badges)
  const visibleLayers = new Set(project.layers.filter((l) => l.visible).map((l) => l.id));
  const nodes = project.nodes.filter((n) => visibleLayers.has(n.layerId));
  const nodesById = new Map(project.nodes.map((n) => [n.id, n]));
  const connections = project.connections.filter((c) => visibleLayers.has(c.layerId));
  const portLevels = calculateAllPortOpticalLevels(project.nodes, project.connections, project.settings);
  const onuAudits = auditAllOnus(project.nodes, project.connections, project.settings);
  const onuAuditById = new Map(onuAudits.map((a) => [a.targetNodeId, a]));

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - 85);
    minY = Math.min(minY, n.y - 35);
    maxX = Math.max(maxX, n.x + n.width + 105);
    maxY = Math.max(maxY, n.y + n.height + 65);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1000;
    maxY = 600;
  }

  const spanX = Math.max(200, maxX - minX);
  const spanY = Math.max(200, maxY - minY);
  const scale = Math.min((drawW - 12) / spanX, (drawH - 12) / spanY);
  const offsetX = margin + 6 + ((drawW - 12) - spanX * scale) / 2;
  const offsetY = margin + 6 + ((drawH - 12) - spanY * scale) / 2;

  const tx = (x: number) => offsetX + (x - minX) * scale;
  const ty = (y: number) => offsetY + (y - minY) * scale;

  // Draw Fiber Connections
  for (const c of connections) {
    const src = nodesById.get(c.sourceNodeId);
    const dst = nodesById.get(c.targetNodeId);
    if (!src || !dst) continue;
    const p1 = getPortWorldPosition(src, c.sourcePortId);
    const p2 = getPortWorldPosition(dst, c.targetPortId);

    const rgb = hexToRgb(c.color, [14, 165, 233]);
    if (c.routeType === 'underground') {
      doc.setLineDashPattern([2, 1.2], 0);
    } else {
      doc.setLineDashPattern([], 0);
    }

    const drawPdfCablePath = (r: number, g: number, b: number, width: number) => {
      doc.setDrawColor(r, g, b);
      doc.setLineWidth(width);
      if (c.waypoints.length > 0) {
        const pts = [p1, ...c.waypoints, p2];
        for (let i = 1; i < pts.length; i++) {
          doc.line(tx(pts[i - 1].x), ty(pts[i - 1].y), tx(pts[i].x), ty(pts[i].y));
        }
      } else if (c.routingStyle === 'orthogonal') {
        const midX = (p1.x + p2.x) / 2;
        doc.line(tx(p1.x), ty(p1.y), tx(midX), ty(p1.y));
        doc.line(tx(midX), ty(p1.y), tx(midX), ty(p2.y));
        doc.line(tx(midX), ty(p2.y), tx(p2.x), ty(p2.y));
      } else if (c.routingStyle === 'curved') {
        const dx = Math.max(40, Math.abs(p2.x - p1.x) * 0.45);
        const steps = 16;
        let prevX = p1.x;
        let prevY = p1.y;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const mt = 1 - t;
          const cx =
            mt * mt * mt * p1.x +
            3 * mt * mt * t * (p1.x + dx) +
            3 * mt * t * t * (p2.x - dx) +
            t * t * t * p2.x;
          const cy =
            mt * mt * mt * p1.y +
            3 * mt * mt * t * p1.y +
            3 * mt * t * t * p2.y +
            t * t * t * p2.y;
          doc.line(tx(prevX), ty(prevY), tx(cx), ty(cy));
          prevX = cx;
          prevY = cy;
        }
      } else {
        doc.line(tx(p1.x), ty(p1.y), tx(p2.x), ty(p2.y));
      }
    };

    if (isVeryLightRgb(rgb)) {
      drawPdfCablePath(71, 85, 105, 0.9);
    }
    drawPdfCablePath(rgb[0], rgb[1], rgb[2], 0.55);
    doc.setLineDashPattern([], 0);

    if (project.settings.showCableLabels) {
      const len = c.autoCalculateLength
        ? computeConnectionSchematicLengthM(c, nodesById, project.settings.metersPerPixel)
        : c.lengthMeters;
      doc.setFontSize(5.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`${c.cableId} · ${c.coreCapacity}F · ${len}m`, tx((p1.x + p2.x) / 2), ty((p1.y + p2.y) / 2) - 1, {
        align: 'center',
      });
    }
  }

  // Draw Nodes, Colored Ports, Optical dBm Readouts, and Bottom Badges
  for (const n of nodes) {
    const nx = tx(n.x);
    const ny = ty(n.y);
    const nw = n.width * scale;
    const nh = n.height * scale;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.35);

    const drawPdfBranch = (x1: number, y1: number, x2: number, y2: number, hex: string | undefined, fallback: [number, number, number], lw: number) => {
      const rgb = hexToRgb(hex, fallback);
      if (isVeryLightRgb(rgb)) {
        doc.setDrawColor(71, 85, 105);
        doc.setLineWidth(lw + 0.35);
        doc.line(x1, y1, x2, y2);
      }
      doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
      doc.setLineWidth(lw);
      doc.line(x1, y1, x2, y2);
    };

    if (n.type === 'ratio_coupler') {
      // Trapezoid body
      const xL = nx + nw * 0.1;
      const xR = nx + nw * 0.88;
      const yTL = ny + nh * 0.22;
      const yBL = ny + nh * 0.78;
      const yTR = ny + nh * 0.08;
      const yBR = ny + nh * 0.92;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(51, 65, 85);
      doc.triangle(xL, yTL, xR, yTR, xR, yBR, 'F');
      doc.triangle(xL, yTL, xR, yBR, xL, yBL, 'F');
      doc.line(xL, yTL, xR, yTR);
      doc.line(xR, yTR, xR, yBR);
      doc.line(xR, yBR, xL, yBL);
      doc.line(xL, yBL, xL, yTL);

      // Internal colored branches
      const jx = nx + nw * 0.36;
      const jy = ny + nh * 0.5;
      drawPdfBranch(xL, jy, jx, jy, n.inputPorts[0]?.color, [16, 185, 129], 0.5);
      drawPdfBranch(jx, jy, xR, ny + nh * 0.28, n.outputPorts[0]?.color, [239, 68, 68], 0.55);
      drawPdfBranch(jx, jy, xR, ny + nh * 0.72, n.outputPorts[1]?.color, [59, 130, 246], 0.45);

      doc.setFillColor(245, 158, 11);
      doc.circle(jx, jy, Math.max(0.7, nw * 0.045), 'F');
    } else if (n.type === 'optical_coupler') {
      doc.roundedRect(nx, ny, nw, nh, 1.2, 1.2, 'FD');
      drawPdfBranch(nx + nw * 0.1, ny + nh * 0.65, nx + nw * 0.9, ny + nh * 0.35, n.outputPorts[0]?.color, [56, 189, 248], 0.45);
      drawPdfBranch(nx + nw * 0.1, ny + nh * 0.35, nx + nw * 0.9, ny + nh * 0.65, n.outputPorts[1]?.color, [245, 158, 11], 0.45);
      doc.setFontSize(Math.max(5, Math.min(7, nw * 0.28)));
      doc.setTextColor(15, 23, 42);
      doc.text(n.code, nx + nw / 2, ny + nh / 2 + 0.8, { align: 'center' });
    } else if (n.type.startsWith('splitter_') || n.type === 'fbt_splitter') {
      doc.setFillColor(255, 251, 235);
      doc.setDrawColor(217, 119, 6);
      doc.triangle(nx, ny + nh / 2, nx + nw, ny, nx + nw, ny + nh, 'FD');
      doc.setFontSize(Math.max(5, Math.min(7.5, nw * 0.3)));
      doc.setTextColor(15, 23, 42);
      doc.text(n.code, nx + nw * 0.62, ny + nh / 2 + 1, { align: 'center' });
    } else if (n.type === 'text_label' || n.type === 'note_box') {
      doc.setFillColor(n.type === 'note_box' ? 254 : 248, n.type === 'note_box' ? 249 : 250, n.type === 'note_box' ? 231 : 252);
      doc.roundedRect(nx, ny, nw, nh, 1, 1, 'FD');
      doc.setFontSize(5.5);
      doc.setTextColor(15, 23, 42);
      doc.text(n.annotationText || n.name, nx + 2, ny + 4, { maxWidth: Math.max(10, nw - 4) });
    } else {
      doc.roundedRect(nx, ny, nw, nh, 1.2, 1.2, 'FD');
      doc.setFontSize(Math.max(5.5, Math.min(8, nw * 0.35)));
      doc.setTextColor(15, 23, 42);
      doc.text(n.code, nx + nw / 2, ny + nh / 2 + 1, { align: 'center' });
    }

    // Input Ports (dot + color + label + dBm)
    for (const p of n.inputPorts) {
      const pos = getPortWorldPosition(n, p.id);
      const px = tx(pos.x);
      const py = ty(pos.y);
      const [pr, pg, pb] = hexToRgb(p.color, [16, 185, 129]);
      doc.setFillColor(pr, pg, pb);
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.25);
      doc.circle(px, py, Math.max(0.75, Math.min(1.25, scale * 3.5)), 'FD');

      const pLevel = portLevels.get(`${n.id}:${p.id}`);
      const dbmStr =
        project.settings.showPortOpticalDbm !== false && pLevel
          ? `${pLevel.powerDbm >= 0 ? '+' : ''}${pLevel.powerDbm.toFixed(1)} dBm`
          : '';
      const portStr = project.settings.showPortLabels ? p.label : '';
      const txt = `${portStr}${portStr && dbmStr ? ' ' : ''}${dbmStr}`.trim();
      if (txt) {
        doc.setFontSize(4.8);
        if (p.color) {
          const [tr, tg, tb] = getReadableLightTextRgb(p.color, [51, 65, 85]);
          doc.setTextColor(tr, tg, tb);
        } else if (pLevel) {
          const [lr, lg, lb] =
            pLevel.status === 'normal'
              ? [5, 150, 105]
              : pLevel.status === 'low_margin'
              ? [217, 119, 6]
              : [220, 38, 38];
          doc.setTextColor(lr, lg, lb);
        } else {
          doc.setTextColor(71, 85, 105);
        }
        doc.text(txt, px - 1.6, py + 0.7, { align: 'right' });
      }
    }

    // Output Ports (dot + color + label + dBm or loss)
    for (const p of n.outputPorts) {
      const pos = getPortWorldPosition(n, p.id);
      const px = tx(pos.x);
      const py = ty(pos.y);
      const isConn = connections.some((c) => c.sourceNodeId === n.id && c.sourcePortId === p.id);
      const fallbackRgb: [number, number, number] = isConn ? [14, 165, 233] : [245, 158, 11];
      const [pr, pg, pb] = hexToRgb(p.color, fallbackRgb);
      doc.setFillColor(pr, pg, pb);
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.25);
      doc.circle(px, py, Math.max(0.75, Math.min(1.25, scale * 3.5)), 'FD');

      const pLevel = portLevels.get(`${n.id}:${p.id}`);
      let rightStr = '';
      if (project.settings.showPortOpticalDbm !== false) {
        if (pLevel) {
          rightStr = `${pLevel.powerDbm >= 0 ? '+' : ''}${pLevel.powerDbm.toFixed(1)} dBm`;
        } else if ((p.portLossDb ?? 0) > 0) {
          rightStr = `(-${(p.portLossDb || 0).toFixed(1)} dB)`;
        }
      }
      const portStr = project.settings.showPortLabels ? p.label : '';
      const txt = `${portStr}${portStr && rightStr ? ' ' : ''}${rightStr}`.trim();
      if (txt) {
        doc.setFontSize(4.8);
        if (p.color) {
          const [tr, tg, tb] = getReadableLightTextRgb(p.color, [51, 65, 85]);
          doc.setTextColor(tr, tg, tb);
        } else if (pLevel) {
          const [lr, lg, lb] = pLevel.isSource
            ? [2, 132, 199]
            : pLevel.status === 'normal'
            ? [5, 150, 105]
            : pLevel.status === 'low_margin'
            ? [217, 119, 6]
            : [220, 38, 38];
          doc.setTextColor(lr, lg, lb);
        } else {
          doc.setTextColor(71, 85, 105);
        }
        doc.text(txt, px + 1.6, py + 0.7, { align: 'left' });
      }
    }

    // Bottom component labels + Ratio / ONU Rx badges
    if (n.type !== 'text_label' && n.type !== 'note_box') {
      doc.setFontSize(5.5);
      doc.setTextColor(15, 23, 42);
      doc.text(n.code, nx + nw / 2, ny + nh + 2.8, { align: 'center' });
      doc.setFontSize(4.8);
      doc.setTextColor(100, 116, 139);
      doc.text(n.name, nx + nw / 2, ny + nh + 5.2, { align: 'center' });

      if (n.type === 'ratio_coupler' || n.type === 'optical_coupler') {
        const badgeW = 19;
        const badgeH = 3.6;
        const bx = nx + nw / 2 - badgeW / 2;
        const by = ny + nh + 6.3;
        doc.setFillColor(255, 251, 235);
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.25);
        doc.roundedRect(bx, by, badgeW, badgeH, 0.7, 0.7, 'FD');
        doc.setFontSize(4.8);
        doc.setTextColor(180, 83, 9);
        doc.text(`RATIO ${n.properties.couplingRatio || '80:20'}`, nx + nw / 2, by + 2.5, {
          align: 'center',
        });
      } else if (isCustomerOnu(n.type)) {
        const audit = onuAuditById.get(n.id);
        if (audit) {
          const badgeW = 21;
          const badgeH = 3.6;
          const bx = nx + nw / 2 - badgeW / 2;
          const by = ny + nh + 6.3;
          const [sr, sg, sb] =
            audit.status === 'normal'
              ? [16, 185, 129]
              : audit.status === 'low_margin'
              ? [245, 158, 11]
              : [239, 68, 68];
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(sr, sg, sb);
          doc.setLineWidth(0.25);
          doc.roundedRect(bx, by, badgeW, badgeH, 0.7, 0.7, 'FD');
          doc.setFontSize(4.8);
          doc.setTextColor(sr, sg, sb);
          doc.text(
            audit.receivedPowerDownDbm > -90
              ? `Rx ${audit.receivedPowerDownDbm.toFixed(1)} dBm`
              : 'No OLT Link',
            nx + nw / 2,
            by + 2.5,
            { align: 'center' }
          );
        }
      }
    }
  }

  // Legend Overlay
  if (options.includeLegend) {
    const legX = margin + 4;
    const legY = margin + 4;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.rect(legX, legY, 64, 24, 'FD');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text('FIBER LEGEND', legX + 3, legY + 5);
    const items = [
      { label: 'Feeder Cable', rgb: [14, 165, 233] },
      { label: 'Distribution Cable', rgb: [168, 85, 247] },
      { label: 'Drop Cable', rgb: [34, 197, 94] },
    ];
    items.forEach((it, idx) => {
      const y = legY + 10 + idx * 4.8;
      doc.setDrawColor(it.rgb[0], it.rgb[1], it.rgb[2]);
      doc.setLineWidth(0.9);
      doc.line(legX + 3, y - 1, legX + 12, y - 1);
      doc.setFontSize(6.5);
      doc.setTextColor(51, 65, 85);
      doc.text(it.label, legX + 15, y);
    });
  }

  // Title Block
  if (options.includeTitleBlock) {
    const tbY = pageH - margin - titleBlockH;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.4);
    doc.rect(margin, tbY, drawW, titleBlockH, 'FD');
    doc.line(margin + drawW * 0.55, tbY, margin + drawW * 0.55, tbY + titleBlockH);

    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(project.settings.projectName, margin + 4, tbY + 7);
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Client: ${project.settings.clientName}   |   Location: ${project.settings.locationName}`,
      margin + 4,
      tbY + 13
    );
    doc.text(
      `Scale: 1px = ${project.settings.metersPerPixel}m   |   Components: ${nodes.length}   |   Fiber Links: ${connections.length}`,
      margin + 4,
      tbY + 19
    );

    const rx = margin + drawW * 0.55 + 4;
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(`DWG NO: ${project.settings.projectCode}`, rx, tbY + 7);
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(`Engineer: ${project.settings.engineerName}`, rx, tbY + 13);
    doc.text(`Date: ${new Date().toISOString().slice(0, 10)}   |   FiberCAD Studio`, rx, tbY + 19);
  }

  // Optional Optical Budget & Port Configuration Schedule Page
  if (options.includeOpticalTable) {
    const portRows: Array<{
      code: string;
      typeName: string;
      ratio: string;
      portLabel: string;
      dir: string;
      splitPct: string;
      lossOrTx: string;
      colorHex: string;
      liveDbm: string;
    }> = [];

    for (const n of nodes) {
      const ratioStr =
        n.properties.couplingRatio || n.properties.splitterRatio || '-';
      for (const p of n.inputPorts) {
        const lvl = portLevels.get(`${n.id}:${p.id}`);
        portRows.push({
          code: n.code,
          typeName: n.name,
          ratio: ratioStr,
          portLabel: p.label,
          dir: 'IN',
          splitPct: '-',
          lossOrTx:
            p.txPowerDbm !== undefined
              ? `Ref ${p.txPowerDbm.toFixed(1)} dBm`
              : `${(p.portLossDb ?? 0).toFixed(2)} dB`,
          colorHex: p.color || '#10B981',
          liveDbm: lvl ? `${lvl.powerDbm >= 0 ? '+' : ''}${lvl.powerDbm.toFixed(2)} dBm` : '--',
        });
      }
      for (const p of n.outputPorts) {
        const lvl = portLevels.get(`${n.id}:${p.id}`);
        portRows.push({
          code: n.code,
          typeName: n.name,
          ratio: ratioStr,
          portLabel: p.label,
          dir: 'OUT',
          splitPct: p.splitPercent !== undefined ? `${p.splitPercent}%` : '-',
          lossOrTx:
            p.txPowerDbm !== undefined
              ? `Tx ${p.txPowerDbm >= 0 ? '+' : ''}${p.txPowerDbm.toFixed(1)} dBm`
              : `${(p.portLossDb ?? 0).toFixed(2)} dB`,
          colorHex: p.color || '#F59E0B',
          liveDbm: lvl ? `${lvl.powerDbm >= 0 ? '+' : ''}${lvl.powerDbm.toFixed(2)} dBm` : '--',
        });
      }
    }

    if (onuAudits.length > 0 || portRows.length > 0 || connections.length > 0) {
      doc.addPage();
      let y = 16;

      if (onuAudits.length > 0) {
        doc.setFontSize(10.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`${project.settings.projectName} — Optical Power Budget Schedule`, margin, y);
        y += 7;
        const cOnu = [
          margin,
          margin + drawW * 0.17,
          margin + drawW * 0.31,
          margin + drawW * 0.45,
          margin + drawW * 0.59,
          margin + drawW * 0.73,
          margin + drawW * 0.86,
        ];
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text('ONU Code', cOnu[0], y);
        doc.text('OLT', cOnu[1], y);
        doc.text('Down Loss', cOnu[2], y);
        doc.text('Up Loss', cOnu[3], y);
        doc.text('Rx Down', cOnu[4], y);
        doc.text('Margin', cOnu[5], y);
        doc.text('Status', cOnu[6], y);
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.3);
        doc.line(margin, y + 1.8, pageW - margin, y + 1.8);
        y += 5.5;
        doc.setTextColor(15, 23, 42);
        for (const row of onuAudits) {
          if (y > pageH - 16) {
            doc.addPage();
            y = 18;
          }
          doc.text(row.targetCode, cOnu[0], y, { maxWidth: drawW * 0.16 });
          doc.text(row.oltCode || '-', cOnu[1], y, { maxWidth: drawW * 0.13 });
          doc.text(`${row.totalLossDownDb.toFixed(2)} dB`, cOnu[2], y);
          doc.text(`${row.totalLossUpDb.toFixed(2)} dB`, cOnu[3], y);
          doc.text(row.receivedPowerDownDbm > -90 ? `${row.receivedPowerDownDbm.toFixed(2)} dBm` : 'N/A', cOnu[4], y);
          doc.text(row.opticalMarginDownDb > -90 ? `${row.opticalMarginDownDb.toFixed(2)} dB` : 'N/A', cOnu[5], y);
          doc.text(row.status.toUpperCase(), cOnu[6], y);
          y += 5;
        }
        y += 6;
      }

      if (portRows.length > 0) {
        if (y > pageH - 34) {
          doc.addPage();
          y = 18;
        }
        doc.setFontSize(10.5);
        doc.setTextColor(15, 23, 42);
        doc.text('Component Port, Ratio & Fiber Color Configuration Schedule', margin, y);
        y += 7;
        const cPort = [
          margin,
          margin + drawW * 0.24,
          margin + drawW * 0.33,
          margin + drawW * 0.48,
          margin + drawW * 0.54,
          margin + drawW * 0.62,
          margin + drawW * 0.74,
          margin + drawW * 0.89,
        ];
        const drawPortTableHeader = (hy: number) => {
          doc.setFontSize(6.8);
          doc.setTextColor(71, 85, 105);
          doc.text('Component', cPort[0], hy);
          doc.text('Ratio', cPort[1], hy);
          doc.text('Port', cPort[2], hy);
          doc.text('Dir', cPort[3], hy);
          doc.text('Split %', cPort[4], hy);
          doc.text('Loss / Tx', cPort[5], hy);
          doc.text('Fiber Color', cPort[6], hy);
          doc.text('Live dBm', cPort[7], hy);
          doc.setDrawColor(148, 163, 184);
          doc.setLineWidth(0.3);
          doc.line(margin, hy + 1.8, pageW - margin, hy + 1.8);
        };
        drawPortTableHeader(y);
        y += 5.5;
        for (const pr of portRows) {
          if (y > pageH - 16) {
            doc.addPage();
            y = 18;
            drawPortTableHeader(y);
            y += 5.5;
          }
          doc.setFontSize(6.6);
          doc.setTextColor(15, 23, 42);
          doc.text(`${pr.code} (${pr.typeName})`, cPort[0], y, { maxWidth: drawW * 0.23 });
          doc.text(pr.ratio, cPort[1], y);
          doc.text(pr.portLabel, cPort[2], y, { maxWidth: drawW * 0.14 });
          doc.text(pr.dir, cPort[3], y);
          doc.text(pr.splitPct, cPort[4], y);
          doc.text(pr.lossOrTx, cPort[5], y);

          const [cr, cg, cb] = hexToRgb(pr.colorHex, [100, 116, 139]);
          doc.setFillColor(cr, cg, cb);
          doc.setDrawColor(51, 65, 85);
          doc.setLineWidth(0.2);
          doc.rect(cPort[6], y - 2.4, 2.5, 2.5, 'FD');
          doc.setTextColor(15, 23, 42);
          doc.text(getColorLabel(pr.colorHex), cPort[6] + 3.4, y, { maxWidth: drawW * 0.13 });
          doc.text(pr.liveDbm, cPort[7], y);
          y += 5;
        }
        y += 6;
      }

      if (connections.length > 0) {
        if (y > pageH - 34) {
          doc.addPage();
          y = 18;
        }
        doc.setFontSize(10.5);
        doc.setTextColor(15, 23, 42);
        doc.text('Fiber Cable Links & Route Schedule', margin, y);
        y += 7;
        const cCab = [
          margin,
          margin + drawW * 0.16,
          margin + drawW * 0.34,
          margin + drawW * 0.48,
          margin + drawW * 0.58,
          margin + drawW * 0.69,
          margin + drawW * 0.85,
        ];
        doc.setFontSize(6.8);
        doc.setTextColor(71, 85, 105);
        doc.text('Cable ID', cCab[0], y);
        doc.text('From -> To', cCab[1], y);
        doc.text('Route', cCab[2], y);
        doc.text('Cores', cCab[3], y);
        doc.text('Length', cCab[4], y);
        doc.text('Fiber Color', cCab[5], y);
        doc.text('Atten D/U (dB/km)', cCab[6], y);
        doc.setDrawColor(148, 163, 184);
        doc.setLineWidth(0.3);
        doc.line(margin, y + 1.8, pageW - margin, y + 1.8);
        y += 5.5;
        for (const c of connections) {
          if (y > pageH - 16) {
            doc.addPage();
            y = 18;
          }
          const src = nodesById.get(c.sourceNodeId);
          const dst = nodesById.get(c.targetNodeId);
          const len = c.autoCalculateLength
            ? computeConnectionSchematicLengthM(c, nodesById, project.settings.metersPerPixel)
            : c.lengthMeters;
          doc.setFontSize(6.6);
          doc.setTextColor(15, 23, 42);
          doc.text(c.cableId, cCab[0], y, { maxWidth: drawW * 0.15 });
          doc.text(`${src?.code || '?'} -> ${dst?.code || '?'}`, cCab[1], y, { maxWidth: drawW * 0.17 });
          doc.text(`${c.cableType} (${c.routeType})`, cCab[2], y, { maxWidth: drawW * 0.13 });
          doc.text(`${c.coreCapacity}F`, cCab[3], y);
          doc.text(`${len} m`, cCab[4], y);
          const [cr, cg, cb] = hexToRgb(c.color, [14, 165, 233]);
          doc.setFillColor(cr, cg, cb);
          doc.setDrawColor(51, 65, 85);
          doc.setLineWidth(0.2);
          doc.rect(cCab[5], y - 2.4, 2.5, 2.5, 'FD');
          doc.setTextColor(15, 23, 42);
          doc.text(getColorLabel(c.color), cCab[5] + 3.4, y, { maxWidth: drawW * 0.14 });
          doc.text(`${c.attenuationDownDbPerKm.toFixed(2)} / ${c.attenuationUpDbPerKm.toFixed(2)}`, cCab[6], y);
          y += 5;
        }
      }
    }
  }

  doc.save(`${project.settings.projectCode || 'ftth-drawing'}.pdf`);
}

export function exportDxf(project: FtthProject) {
  const lines: string[] = [];
  const add = (code: number, val: string | number) => {
    lines.push(String(code), String(val));
  };

  // Header
  add(0, 'SECTION');
  add(2, 'HEADER');
  add(9, '$ACADVER');
  add(1, 'AC1009');
  add(0, 'ENDSEC');

  // Tables (Layers)
  add(0, 'SECTION');
  add(2, 'TABLES');
  add(0, 'TABLE');
  add(2, 'LAYER');
  add(70, project.layers.length);
  project.layers.forEach((layer, i) => {
    add(0, 'LAYER');
    add(2, layer.id.toUpperCase());
    add(70, layer.locked ? 4 : 0);
    add(62, (i % 7) + 1);
    add(6, 'CONTINUOUS');
  });
  add(0, 'ENDTAB');
  add(0, 'ENDSEC');

  // Entities
  add(0, 'SECTION');
  add(2, 'ENTITIES');

  const nodesById = new Map(project.nodes.map((n) => [n.id, n]));
  const flipY = (y: number) => 1000 - y;

  for (const n of project.nodes) {
    const layer = n.layerId.toUpperCase();
    const x1 = n.x;
    const x2 = n.x + n.width;
    const y1 = flipY(n.y);
    const y2 = flipY(n.y + n.height);

    // Draw bounding rectangle as 4 LINE entities
    const edges: Array<[number, number, number, number]> = [
      [x1, y1, x2, y1],
      [x2, y1, x2, y2],
      [x2, y2, x1, y2],
      [x1, y2, x1, y1],
    ];
    for (const [ax, ay, bx, by] of edges) {
      add(0, 'LINE');
      add(8, layer);
      add(10, ax.toFixed(2));
      add(20, ay.toFixed(2));
      add(11, bx.toFixed(2));
      add(21, by.toFixed(2));
    }

    // Label TEXT
    add(0, 'TEXT');
    add(8, 'LABELS');
    add(10, (n.x + 4).toFixed(2));
    add(20, flipY(n.y + n.height / 2).toFixed(2));
    add(40, 10);
    add(1, n.code);
  }

  for (const c of project.connections) {
    const src = nodesById.get(c.sourceNodeId);
    const dst = nodesById.get(c.targetNodeId);
    if (!src || !dst) continue;
    const p1 = getPortWorldPosition(src, c.sourcePortId);
    const p2 = getPortWorldPosition(dst, c.targetPortId);
    const pts =
      c.waypoints.length > 0
        ? [p1, ...c.waypoints, p2]
        : c.routingStyle === 'orthogonal'
        ? [p1, { x: (p1.x + p2.x) / 2, y: p1.y }, { x: (p1.x + p2.x) / 2, y: p2.y }, p2]
        : [p1, p2];

    for (let i = 1; i < pts.length; i++) {
      add(0, 'LINE');
      add(8, c.layerId.toUpperCase());
      add(10, pts[i - 1].x.toFixed(2));
      add(20, flipY(pts[i - 1].y).toFixed(2));
      add(11, pts[i].x.toFixed(2));
      add(21, flipY(pts[i].y).toFixed(2));
    }

    add(0, 'TEXT');
    add(8, 'LABELS');
    add(10, ((p1.x + p2.x) / 2).toFixed(2));
    add(20, flipY((p1.y + p2.y) / 2 - 6).toFixed(2));
    add(40, 8);
    add(1, `${c.cableId} (${c.coreCapacity}F)`);
  }

  add(0, 'ENDSEC');
  add(0, 'EOF');

  downloadBlob(
    new Blob([lines.join('\n')], { type: 'application/dxf' }),
    `${project.settings.projectCode || 'ftth-drawing'}.dxf`
  );
}

export function exportGeoJson(project: FtthProject) {
  const nodesById = new Map(project.nodes.map((n) => [n.id, n]));
  const features: unknown[] = [];

  for (const n of project.nodes) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [n.lng, n.lat],
      },
      properties: {
        id: n.id,
        ftthType: n.type,
        code: n.code,
        name: n.name,
        layer: n.layerId,
        technology: n.properties.technology,
        insertionLossDb: n.properties.insertionLossDb,
      },
    });
  }

  for (const c of project.connections) {
    const src = nodesById.get(c.sourceNodeId);
    const dst = nodesById.get(c.targetNodeId);
    if (!src || !dst) continue;
    const coords =
      c.geoPath.length >= 2
        ? c.geoPath.map(([lat, lng]) => [lng, lat])
        : [
            [src.lng, src.lat],
            [dst.lng, dst.lat],
          ];
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coords,
      },
      properties: {
        id: c.id,
        cableId: c.cableId,
        cableType: c.cableType,
        coreCapacity: c.coreCapacity,
        routeType: c.routeType,
        lengthMeters: c.lengthMeters,
        color: c.color,
      },
    });
  }

  const fc = {
    type: 'FeatureCollection',
    name: project.settings.projectName,
    features,
  };
  downloadBlob(
    new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' }),
    `${project.settings.projectCode || 'ftth-gis'}.geojson`
  );
}

export function exportKml(project: FtthProject) {
  const nodesById = new Map(project.nodes.map((n) => [n.id, n]));
  const placemarks: string[] = [];

  for (const n of project.nodes) {
    placemarks.push(`
    <Placemark>
      <name>${escapeXml(n.code)} (${escapeXml(n.name)})</name>
      <description>${escapeXml(`Type: ${n.type}, Tech: ${n.properties.technology}`)}</description>
      <Point>
        <coordinates>${n.lng},${n.lat},0</coordinates>
      </Point>
    </Placemark>`);
  }

  for (const c of project.connections) {
    const src = nodesById.get(c.sourceNodeId);
    const dst = nodesById.get(c.targetNodeId);
    if (!src || !dst) continue;
    const path =
      c.geoPath.length >= 2
        ? c.geoPath
        : [
            [src.lat, src.lng],
            [dst.lat, dst.lng],
          ];
    const coordStr = path.map(([lat, lng]) => `${lng},${lat},0`).join(' ');
    placemarks.push(`
    <Placemark>
      <name>${escapeXml(c.cableId)} (${c.coreCapacity}F)</name>
      <description>${escapeXml(`${c.cableType} · ${c.routeType} · ${c.lengthMeters}m`)}</description>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${coordStr}</coordinates>
      </LineString>
    </Placemark>`);
  }

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(project.settings.projectName)}</name>
    ${placemarks.join('\n')}
  </Document>
</kml>`;

  downloadBlob(
    new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }),
    `${project.settings.projectCode || 'ftth-gis'}.kml`
  );
}
