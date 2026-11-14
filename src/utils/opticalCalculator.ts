import {
  FiberConnection,
  FtthComponentType,
  FtthNode,
  OpticalHop,
  OpticalLinkStatus,
  OpticalPathResult,
  ProjectSettings,
} from '../types/ftth';
import { getPortWorldPosition } from '../data/componentCatalog';

const OLT_SOURCE_TYPES: FtthComponentType[] = [
  'olt',
  'olt_chassis',
  'olt_line_card',
  'gpon_port',
  'xgs_pon_port',
];

const SPLITTER_TYPES: FtthComponentType[] = [
  'splitter_1_2',
  'splitter_1_4',
  'splitter_1_8',
  'splitter_1_16',
  'splitter_1_32',
  'splitter_1_64',
  'fbt_splitter',
  'optical_coupler',
  'ratio_coupler',
];

export const CUSTOMER_EQUIPMENT_TYPES: FtthComponentType[] = [
  'onu',
  'ont',
  'wifi_ont',
];

export function isOltSource(type: FtthComponentType): boolean {
  return OLT_SOURCE_TYPES.includes(type);
}

export function isSplitterNode(type: FtthComponentType): boolean {
  return SPLITTER_TYPES.includes(type);
}

export function isCustomerOnu(type: FtthComponentType): boolean {
  return CUSTOMER_EQUIPMENT_TYPES.includes(type);
}

export function computeConnectionSchematicLengthM(
  conn: FiberConnection,
  nodesById: Map<string, FtthNode>,
  metersPerPixel: number
): number {
  const src = nodesById.get(conn.sourceNodeId);
  const dst = nodesById.get(conn.targetNodeId);
  if (!src || !dst) return conn.lengthMeters;

  const p1 = getPortWorldPosition(src, conn.sourcePortId);
  const p2 = getPortWorldPosition(dst, conn.targetPortId);
  const pts = [{ x: p1.x, y: p1.y }, ...conn.waypoints, { x: p2.x, y: p2.y }];
  let totalPx = 0;

  if (conn.routingStyle === 'orthogonal' && conn.waypoints.length === 0) {
    totalPx = Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
  } else {
    for (let i = 1; i < pts.length; i++) {
      totalPx += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
  }
  return Math.max(1, Math.round(totalPx * metersPerPixel));
}

export function haversineDistanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function computeGeoPathLengthMeters(path: Array<[number, number]>): number {
  if (path.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineDistanceMeters(path[i - 1], path[i]);
  }
  return Math.round(total);
}

/**
 * Traces the upstream optical path from any target node (typically ONU/ONT) back to an OLT source.
 */
export function calculateOpticalPathForNode(
  targetNodeId: string,
  nodes: FtthNode[],
  connections: FiberConnection[],
  settings: ProjectSettings
): OpticalPathResult {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const target = nodesById.get(targetNodeId);

  const emptyResult = (
    status: OpticalLinkStatus,
    reason: string
  ): OpticalPathResult => ({
    targetNodeId,
    targetCode: target?.code || 'UNKNOWN',
    status,
    statusReason: reason,
    technology: target?.properties.technology || 'GPON',
    downstreamWavelengthNm: target?.properties.downstreamWavelengthNm || 1490,
    upstreamWavelengthNm: target?.properties.upstreamWavelengthNm || 1310,
    oltTxPowerDbm: 0,
    onuRxSensitivityDbm: target?.properties.rxSensitivityDbm ?? -27,
    onuTxPowerDbm: target?.properties.txPowerDbm ?? 2,
    oltRxSensitivityDbm: -28,
    fiberAttenuationDownDb: 0,
    fiberAttenuationUpDb: 0,
    splitterLossDb: 0,
    connectorLossDb: 0,
    spliceLossDb: 0,
    otherInsertionLossDb: 0,
    totalLossDownDb: 0,
    totalLossUpDb: 0,
    receivedPowerDownDbm: -99,
    receivedPowerUpDbm: -99,
    opticalMarginDownDb: -99,
    opticalMarginUpDb: -99,
    hops: [],
    pathNodeIds: target ? [target.id] : [],
    pathConnectionIds: [],
  });

  if (!target) {
    return emptyResult('disconnected', 'Selected component no longer exists.');
  }

  // BFS/DFS upstream via connections targeting current node
  const incomingMap = new Map<string, FiberConnection[]>();
  for (const conn of connections) {
    const arr = incomingMap.get(conn.targetNodeId) || [];
    arr.push(conn);
    incomingMap.set(conn.targetNodeId, arr);
  }

  interface TraceStep {
    nodeId: string;
    viaConn?: FiberConnection;
  }

  const queue: TraceStep[][] = [[{ nodeId: target.id }]];
  const visited = new Set<string>([target.id]);
  let foundChain: TraceStep[] | null = null;
  let cycleDetected = false;

  while (queue.length > 0) {
    const chain = queue.shift()!;
    const head = chain[chain.length - 1];
    const headNode = nodesById.get(head.nodeId);
    if (!headNode) continue;

    if (isOltSource(headNode.type) && chain.length > 1) {
      foundChain = chain;
      break;
    }

    const incoming = incomingMap.get(head.nodeId) || [];
    for (const conn of incoming) {
      if (chain.some((s) => s.nodeId === conn.sourceNodeId)) {
        cycleDetected = true;
        continue;
      }
      if (!visited.has(conn.sourceNodeId)) {
        visited.add(conn.sourceNodeId);
        queue.push([...chain, { nodeId: conn.sourceNodeId, viaConn: conn }]);
      }
    }
  }

  if (!foundChain) {
    if (isOltSource(target.type)) {
      return emptyResult('normal', 'Source OLT node selected.');
    }
    return emptyResult(
      cycleDetected ? 'invalid' : 'disconnected',
      cycleDetected
        ? 'Optical loop/cycle detected in upstream trace.'
        : 'No valid upstream path back to an OLT port.'
    );
  }

  // Reverse chain so it goes OLT -> ... -> Target ONU
  const ordered = [...foundChain].reverse();
  const oltNode = nodesById.get(ordered[0].nodeId)!;
  const firstOutConn = ordered[0].viaConn;
  const oltSourcePort = firstOutConn
    ? oltNode.outputPorts.find((p) => p.id === firstOutConn.sourcePortId)
    : oltNode.outputPorts[0];

  // Check for technology mismatch (e.g. XGS-PON OLT to GPON ONU if both explicitly set)
  let invalidReason = '';
  if (
    isCustomerOnu(target.type) &&
    oltNode.properties.technology !== 'Passive' &&
    target.properties.technology !== 'Passive' &&
    oltNode.properties.technology !== target.properties.technology
  ) {
    invalidReason = `Technology mismatch: ${oltNode.code} (${oltNode.properties.technology}) vs ${target.code} (${target.properties.technology}).`;
  }

  // Also check if any connection has invalid source/target port reference
  for (let i = 0; i < ordered.length - 1; i++) {
    const conn = ordered[i].viaConn;
    if (!conn) continue;
    const srcNode = nodesById.get(conn.sourceNodeId);
    const dstNode = nodesById.get(conn.targetNodeId);
    const srcPortOk = srcNode?.outputPorts.some((p) => p.id === conn.sourcePortId);
    const dstPortOk = dstNode?.inputPorts.some((p) => p.id === conn.targetPortId);
    if (!srcPortOk || !dstPortOk) {
      invalidReason = `Invalid port termination on cable ${conn.cableId}.`;
    }
  }

  const tech = oltNode.properties.technology === 'XGS-PON' ? 'XGS-PON' : 'GPON';
  const downWl = oltNode.properties.downstreamWavelengthNm ?? (tech === 'XGS-PON' ? 1577 : 1490);
  const upWl = oltNode.properties.upstreamWavelengthNm ?? (tech === 'XGS-PON' ? 1270 : 1310);

  const oltTx = oltSourcePort?.txPowerDbm ?? oltNode.properties.txPowerDbm ?? 6.0;
  const oltRxSens = oltNode.properties.rxSensitivityDbm ?? -32.0;
  const onuRxSens = target.properties.rxSensitivityDbm ?? -27.0;
  const onuTx = target.properties.txPowerDbm ?? 2.0;

  let fiberDown = 0;
  let fiberUp = 0;
  let splitterLoss = 0;
  let connectorLoss = 0;
  let spliceLoss = 0;
  let otherLoss = 0;

  const hops: OpticalHop[] = [];
  const pathNodeIds: string[] = [];
  const pathConnectionIds: string[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const step = ordered[i];
    const node = nodesById.get(step.nodeId)!;
    pathNodeIds.push(node.id);

    // Note: ordered[i+1].viaConn is the outgoing cable from ordered[i] to ordered[i+1],
    // Wait: in reverse order, ordered[0] is OLT, ordered[1] came via ordered[0]'s `viaConn`!
    // Let's trace carefully: in BFS chain, chain[0] = target, chain[1] = prev with chain[0].viaConn?
    // No: when pushing [...chain, { nodeId: conn.sourceNodeId, viaConn: conn }],
    // `viaConn` is on the *upstream* step connecting `conn.sourceNodeId -> head.nodeId`.
    // So in `ordered`, `ordered[i].viaConn` is the cable between `ordered[i]` (source) and `ordered[i+1]` (target)!
    const outgoingConn = ordered[i].viaConn;
    if (outgoingConn) {
      pathConnectionIds.push(outgoingConn.id);
    }

    const lenM = outgoingConn
      ? outgoingConn.autoCalculateLength
        ? computeConnectionSchematicLengthM(outgoingConn, nodesById, settings.metersPerPixel)
        : outgoingConn.lengthMeters
      : 0;
    const lenKm = lenM / 1000;

    const cFiberDown = outgoingConn ? lenKm * outgoingConn.attenuationDownDbPerKm : 0;
    const cFiberUp = outgoingConn ? lenKm * outgoingConn.attenuationUpDbPerKm : 0;
    const outPortLoss = outgoingConn
      ? node.outputPorts.find((p) => p.id === outgoingConn.sourcePortId)?.portLossDb || 0
      : 0;
    const prevIncomingConn = i > 0 ? ordered[i - 1].viaConn : undefined;
    const inPortLoss = prevIncomingConn
      ? node.inputPorts.find((p) => p.id === prevIncomingConn.targetPortId)?.portLossDb || 0
      : 0;

    const cConnLoss =
      (node.properties.connectorLossDb || 0) +
      (outgoingConn ? outgoingConn.connectorCount * outgoingConn.connectorLossDb : 0);
    const cSpliceLoss =
      (node.properties.spliceLossDb || 0) +
      (outgoingConn ? outgoingConn.spliceCount * outgoingConn.spliceLossDb : 0);
    const compLoss = (node.properties.insertionLossDb || 0) + outPortLoss + inPortLoss;

    fiberDown += cFiberDown;
    fiberUp += cFiberUp;
    connectorLoss += cConnLoss;
    spliceLoss += cSpliceLoss;

    if (isSplitterNode(node.type)) {
      splitterLoss += compLoss;
    } else {
      otherLoss += compLoss;
    }

    const totalDownSoFar = fiberDown + splitterLoss + otherLoss + connectorLoss + spliceLoss;
    const totalUpSoFar = fiberUp + splitterLoss + otherLoss + connectorLoss + spliceLoss;

    hops.push({
      nodeId: node.id,
      nodeCode: node.code,
      nodeName: node.name,
      nodeType: node.type,
      connectionId: outgoingConn?.id,
      cableId: outgoingConn?.cableId,
      lengthMeters: outgoingConn ? lenM : undefined,
      fiberLossDownDb: Number(cFiberDown.toFixed(3)),
      fiberLossUpDb: Number(cFiberUp.toFixed(3)),
      componentLossDb: Number(compLoss.toFixed(2)),
      connectorLossDb: Number(cConnLoss.toFixed(2)),
      spliceLossDb: Number(cSpliceLoss.toFixed(2)),
      cumulativeLossDownDb: Number(totalDownSoFar.toFixed(2)),
      cumulativeLossUpDb: Number(totalUpSoFar.toFixed(2)),
    });
  }

  const totalLossDown = fiberDown + splitterLoss + otherLoss + connectorLoss + spliceLoss;
  const totalLossUp = fiberUp + splitterLoss + otherLoss + connectorLoss + spliceLoss;

  const rxDown = oltTx - totalLossDown;
  const rxUp = onuTx - totalLossUp;

  const marginDown = rxDown - onuRxSens;
  const marginUp = rxUp - oltRxSens;
  const worstMargin = Math.min(marginDown, marginUp);

  let status: OpticalLinkStatus = 'normal';
  let statusReason = `Link passes optical budget (${worstMargin.toFixed(2)} dB margin).`;

  if (invalidReason) {
    status = 'invalid';
    statusReason = invalidReason;
  } else if (
    totalLossDown > settings.maxBudgetLossDb ||
    totalLossUp > settings.maxBudgetLossDb ||
    worstMargin < 0
  ) {
    status = 'excessive_loss';
    statusReason =
      worstMargin < 0
        ? `Rx power below sensitivity (${worstMargin.toFixed(2)} dB margin deficit).`
        : `Total loss (${Math.max(totalLossDown, totalLossUp).toFixed(2)} dB) exceeds ${settings.maxBudgetLossDb} dB budget.`;
  } else if (worstMargin < settings.lowMarginThresholdDb) {
    status = 'low_margin';
    statusReason = `Low optical margin (${worstMargin.toFixed(2)} dB < ${settings.lowMarginThresholdDb.toFixed(1)} dB threshold).`;
  }

  return {
    targetNodeId,
    targetCode: target.code,
    oltNodeId: oltNode.id,
    oltCode: oltNode.code,
    status,
    statusReason,
    technology: tech,
    downstreamWavelengthNm: downWl,
    upstreamWavelengthNm: upWl,
    oltTxPowerDbm: Number(oltTx.toFixed(2)),
    onuRxSensitivityDbm: Number(onuRxSens.toFixed(2)),
    onuTxPowerDbm: Number(onuTx.toFixed(2)),
    oltRxSensitivityDbm: Number(oltRxSens.toFixed(2)),
    fiberAttenuationDownDb: Number(fiberDown.toFixed(3)),
    fiberAttenuationUpDb: Number(fiberUp.toFixed(3)),
    splitterLossDb: Number(splitterLoss.toFixed(2)),
    connectorLossDb: Number(connectorLoss.toFixed(2)),
    spliceLossDb: Number(spliceLoss.toFixed(2)),
    otherInsertionLossDb: Number(otherLoss.toFixed(2)),
    totalLossDownDb: Number(totalLossDown.toFixed(2)),
    totalLossUpDb: Number(totalLossUp.toFixed(2)),
    receivedPowerDownDbm: Number(rxDown.toFixed(2)),
    receivedPowerUpDbm: Number(rxUp.toFixed(2)),
    opticalMarginDownDb: Number(marginDown.toFixed(2)),
    opticalMarginUpDb: Number(marginUp.toFixed(2)),
    hops,
    pathNodeIds,
    pathConnectionIds,
  };
}

/**
 * Counts downstream connected customer ONUs/ONTs reachable from a given node (e.g. a splitter or port).
 */
export function countDownstreamCustomers(
  startNodeId: string,
  nodes: FtthNode[],
  connections: FiberConnection[],
  specificPortId?: string
): number {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>([startNodeId]);
  const queue: string[] = [];

  for (const c of connections) {
    if (c.sourceNodeId === startNodeId && (!specificPortId || c.sourcePortId === specificPortId)) {
      if (!visited.has(c.targetNodeId)) {
        visited.add(c.targetNodeId);
        queue.push(c.targetNodeId);
      }
    }
  }

  let count = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    const n = nodesById.get(id);
    if (!n) continue;
    if (isCustomerOnu(n.type)) {
      count += 1;
    }
    for (const c of connections) {
      if (c.sourceNodeId === id && !visited.has(c.targetNodeId)) {
        visited.add(c.targetNodeId);
        queue.push(c.targetNodeId);
      }
    }
  }
  return count;
}

export function auditAllOnus(
  nodes: FtthNode[],
  connections: FiberConnection[],
  settings: ProjectSettings
): OpticalPathResult[] {
  return nodes
    .filter((n) => isCustomerOnu(n.type))
    .map((onu) => calculateOpticalPathForNode(onu.id, nodes, connections, settings));
}

export interface PortOpticalLevel {
  nodeId: string;
  portId: string;
  powerDbm: number;
  isSource: boolean;
  status: 'normal' | 'low_margin' | 'excessive_loss';
}

/**
 * Calculates live downstream optical power (dBm) at EVERY input and output port across the diagram.
 */
export function calculateAllPortOpticalLevels(
  nodes: FtthNode[],
  connections: FiberConnection[],
  settings: ProjectSettings
): Map<string, PortOpticalLevel> {
  const result = new Map<string, PortOpticalLevel>();
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const outgoingByNodePort = new Map<string, FiberConnection[]>();

  for (const c of connections) {
    const k = `${c.sourceNodeId}:${c.sourcePortId}`;
    const arr = outgoingByNodePort.get(k) || [];
    arr.push(c);
    outgoingByNodePort.set(k, arr);
  }

  const classifyPower = (dbm: number, rxSens = -27): PortOpticalLevel['status'] => {
    const margin = dbm - rxSens;
    if (margin < 0) return 'excessive_loss';
    if (margin < settings.lowMarginThresholdDb) return 'low_margin';
    return 'normal';
  };

  interface QueueItem {
    nodeId: string;
    portId: string;
    powerDbm: number;
  }

  const queue: QueueItem[] = [];
  const bestVisitCount = new Map<string, number>();

  const connectedTargetPorts = new Set(
    connections.map((c) => `${c.targetNodeId}:${c.targetPortId}`)
  );

  // Seed all OLT source output ports with their configured Tx dBm (default 6.0 dBm)
  // Also seed any open input port that has a manual reference txPowerDbm set
  for (const node of nodes) {
    if (isOltSource(node.type)) {
      for (const outP of node.outputPorts) {
        const tx = outP.txPowerDbm ?? node.properties.txPowerDbm ?? 6.0;
        const key = `${node.id}:${outP.id}`;
        result.set(key, {
          nodeId: node.id,
          portId: outP.id,
          powerDbm: Number(tx.toFixed(2)),
          isSource: true,
          status: 'normal',
        });
        queue.push({ nodeId: node.id, portId: outP.id, powerDbm: tx });
      }
    } else {
      for (const inP of node.inputPorts) {
        const inKey = `${node.id}:${inP.id}`;
        if (!connectedTargetPorts.has(inKey) && inP.txPowerDbm !== undefined) {
          const rxPower = inP.txPowerDbm - (inP.portLossDb || 0);
          result.set(inKey, {
            nodeId: node.id,
            portId: inP.id,
            powerDbm: Number(rxPower.toFixed(2)),
            isSource: true,
            status: classifyPower(rxPower, node.properties.rxSensitivityDbm ?? -27.0),
          });
          const compBaseLoss =
            (node.properties.insertionLossDb || 0) +
            (node.properties.connectorLossDb || 0) +
            (node.properties.spliceLossDb || 0);
          for (const outP of node.outputPorts) {
            const outPower =
              outP.txPowerDbm !== undefined
                ? outP.txPowerDbm
                : rxPower - compBaseLoss - (outP.portLossDb || 0);
            const outKey = `${node.id}:${outP.id}`;
            result.set(outKey, {
              nodeId: node.id,
              portId: outP.id,
              powerDbm: Number(outPower.toFixed(2)),
              isSource: outP.txPowerDbm !== undefined,
              status: classifyPower(outPower, -27.0),
            });
            queue.push({ nodeId: node.id, portId: outP.id, powerDbm: outPower });
          }
        }
      }
    }
  }

  // BFS propagation downstream across all fiber links and passive components
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const outKey = `${curr.nodeId}:${curr.portId}`;
    const outConns = outgoingByNodePort.get(outKey) || [];

    for (const conn of outConns) {
      const dstNode = nodesById.get(conn.targetNodeId);
      if (!dstNode) continue;

      const visits = (bestVisitCount.get(`${dstNode.id}:${conn.targetPortId}`) || 0) + 1;
      if (visits > 4) continue; // Guard against cycles
      bestVisitCount.set(`${dstNode.id}:${conn.targetPortId}`, visits);

      const lenM = conn.autoCalculateLength
        ? computeConnectionSchematicLengthM(conn, nodesById, settings.metersPerPixel)
        : conn.lengthMeters;
      const fiberLoss = (lenM / 1000) * conn.attenuationDownDbPerKm;
      const cableLoss =
        conn.connectorCount * conn.connectorLossDb + conn.spliceCount * conn.spliceLossDb;
      const dstInPort = dstNode.inputPorts.find((p) => p.id === conn.targetPortId);
      const inPortExtraLoss = dstInPort?.portLossDb || 0;

      const arrivedDbm = curr.powerDbm - fiberLoss - cableLoss - inPortExtraLoss;
      const rxSens = dstNode.properties.rxSensitivityDbm ?? -27.0;

      result.set(`${dstNode.id}:${conn.targetPortId}`, {
        nodeId: dstNode.id,
        portId: conn.targetPortId,
        powerDbm: Number(arrivedDbm.toFixed(2)),
        isSource: false,
        status: classifyPower(arrivedDbm, rxSens),
      });

      // Propagate through internal component loss to EVERY output port of dstNode
      const compBaseLoss =
        (dstNode.properties.insertionLossDb || 0) +
        (dstNode.properties.connectorLossDb || 0) +
        (dstNode.properties.spliceLossDb || 0);

      for (const outP of dstNode.outputPorts) {
        const outPower =
          outP.txPowerDbm !== undefined
            ? outP.txPowerDbm
            : arrivedDbm - compBaseLoss - (outP.portLossDb || 0);
        const dstOutKey = `${dstNode.id}:${outP.id}`;
        result.set(dstOutKey, {
          nodeId: dstNode.id,
          portId: outP.id,
          powerDbm: Number(outPower.toFixed(2)),
          isSource: outP.txPowerDbm !== undefined,
          status: classifyPower(outPower, -27.0),
        });
        queue.push({ nodeId: dstNode.id, portId: outP.id, powerDbm: outPower });
      }
    }
  }

  return result;
}

