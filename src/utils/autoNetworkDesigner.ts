import {
  AutoDesignConfig,
  FiberConnection,
  FtthComponentType,
  FtthNode,
  ProjectSettings,
} from '../types/ftth';
import { CABLE_TYPE_DEFAULTS, createNodeFromCatalog, buildPorts } from '../data/componentCatalog';

function splitterTypeFromRatio(ratio: AutoDesignConfig['primarySplitterRatio'] | AutoDesignConfig['secondarySplitterRatio']): FtthComponentType {
  switch (ratio) {
    case '1:2':
      return 'splitter_1_2';
    case '1:4':
      return 'splitter_1_4';
    case '1:8':
      return 'splitter_1_8';
    case '1:16':
      return 'splitter_1_16';
    case '1:32':
      return 'splitter_1_32';
    case '1:64':
      return 'splitter_1_64';
  }
}

function makeConn(
  source: FtthNode,
  sourcePortId: string,
  target: FtthNode,
  targetPortId: string,
  cableType: 'feeder' | 'distribution' | 'drop' | 'patch',
  cableId: string,
  fiberId: string,
  coreCapacity: number,
  lengthMeters: number
): FiberConnection {
  const def = CABLE_TYPE_DEFAULTS[cableType];
  return {
    id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    cableId,
    fiberId,
    sourceNodeId: source.id,
    sourcePortId,
    targetNodeId: target.id,
    targetPortId,
    cableType,
    coreCapacity,
    color: def.color,
    routeType: def.routeType,
    installationMethod: def.install,
    fiberStandard: def.standard,
    routingStyle: 'orthogonal',
    lengthMeters,
    autoCalculateLength: false,
    attenuationDownDbPerKm: def.attenDown,
    attenuationUpDbPerKm: def.attenUp,
    spliceCount: cableType === 'patch' ? 0 : 2,
    spliceLossDb: 0.05,
    connectorCount: cableType === 'patch' ? 2 : 1,
    connectorLossDb: 0.35,
    layerId: def.layerId,
    waypoints: [],
    geoPath: [
      [source.lat, source.lng],
      [target.lat, target.lng],
    ],
  };
}

export function generateAutoFtthNetwork(
  config: AutoDesignConfig,
  settings: ProjectSettings
): { nodes: FtthNode[]; connections: FiberConnection[] } {
  const nodes: FtthNode[] = [];
  const connections: FiberConnection[] = [];
  const [baseLat, baseLng] = settings.gisCenter;

  let seq = 1;
  const nextSeq = () => seq++;

  const customersTotal = Math.max(1, Math.min(128, config.totalCustomers));
  const oltCount = Math.max(1, Math.min(4, config.oltCount));
  const ponPortsPerOlt = Math.max(1, Math.min(16, config.ponPortCount));
  const distPointsTarget = Math.max(1, Math.min(32, config.distributionPointsCount));

  const primaryType = splitterTypeFromRatio(config.primarySplitterRatio);
  const secondaryType = splitterTypeFromRatio(config.secondarySplitterRatio);
  const isXgs = config.technology === 'XGS-PON';

  const olts: FtthNode[] = [];
  const odfs: FtthNode[] = [];

  // Place OLTs & ODFs on left column
  for (let o = 0; o < oltCount; o++) {
    const oy = 140 + o * 560;
    const olt = createNodeFromCatalog('olt', 80, oy, nextSeq(), baseLat + o * 0.004, baseLng - 0.015);
    olt.code = `OLT-${String(o + 1).padStart(2, '0')}`;
    olt.properties.technology = config.technology;
    olt.properties.ponPorts = ponPortsPerOlt;
    olt.properties.downstreamWavelengthNm = isXgs ? 1577 : 1490;
    olt.properties.upstreamWavelengthNm = isXgs ? 1270 : 1310;
    olt.properties.txPowerDbm = 6.0;
    olt.properties.rxSensitivityDbm = isXgs ? -29.0 : -32.0;
    const ports = buildPorts(0, ponPortsPerOlt, 'IN', 'PON', 'SC/UPC', 6.0);
    olt.outputPorts = ports.outputPorts;
    olt.height = Math.max(84, ponPortsPerOlt * 18 + 30);
    olts.push(olt);
    nodes.push(olt);

    const odf = createNodeFromCatalog('odf', 280, oy, nextSeq(), baseLat + o * 0.004, baseLng - 0.013);
    odf.code = `ODF-${String(o + 1).padStart(2, '0')}`;
    const odfPorts = buildPorts(ponPortsPerOlt, ponPortsPerOlt, 'IN', 'OUT', 'SC/APC');
    odf.inputPorts = odfPorts.inputPorts;
    odf.outputPorts = odfPorts.outputPorts;
    odf.height = Math.max(76, ponPortsPerOlt * 18 + 24);
    odfs.push(odf);
    nodes.push(odf);

    const patchPorts = Math.min(ponPortsPerOlt, distPointsTarget);
    for (let p = 0; p < patchPorts; p++) {
      connections.push(
        makeConn(
          olt,
          olt.outputPorts[p].id,
          odf,
          odf.inputPorts[p].id,
          'patch',
          `PC-${o + 1}-${p + 1}`,
          `F${p + 1}`,
          1,
          5
        )
      );
    }
  }

  // Build distribution topology based on architecture
  const customersPerDist = Math.ceil(customersTotal / distPointsTarget);
  let createdCustomers = 0;
  let globalPonCursor = 0;

  if (config.architecture === 'cascaded') {
    // OLT -> ODF -> Feeder -> Joint Closure / FDT -> Primary Splitter -> Distribution -> Secondary Splitter -> FAT -> Drop -> ONU
    const primarySplitCount = Math.max(1, Math.ceil(distPointsTarget / 4));
    for (let pIdx = 0; pIdx < primarySplitCount; pIdx++) {
      const oltIdx = pIdx % oltCount;
      const odf = odfs[oltIdx];
      const odfOutIdx = globalPonCursor % odf.outputPorts.length;
      globalPonCursor++;

      const baseY = 120 + pIdx * 420;
      const fjc = createNodeFromCatalog(
        'joint_closure',
        480,
        baseY,
        nextSeq(),
        baseLat + pIdx * 0.002,
        baseLng - 0.006
      );
      fjc.code = `FJC-${String(pIdx + 1).padStart(2, '0')}`;
      nodes.push(fjc);

      if (config.includeCivilMarkers) {
        const mh = createNodeFromCatalog(
          'manhole',
          380,
          baseY + 90,
          nextSeq(),
          baseLat + pIdx * 0.002 - 0.0005,
          baseLng - 0.009
        );
        mh.code = `MH-${String(pIdx + 1).padStart(2, '0')}`;
        nodes.push(mh);
      }

      connections.push(
        makeConn(
          odf,
          odf.outputPorts[odfOutIdx].id,
          fjc,
          fjc.inputPorts[0].id,
          'feeder',
          `FDR-${String(pIdx + 1).padStart(2, '0')}`,
          `Core-1..${config.feederCableCapacity}`,
          config.feederCableCapacity,
          config.avgFeederLengthM
        )
      );

      const pSpl = createNodeFromCatalog(
        primaryType,
        670,
        baseY,
        nextSeq(),
        baseLat + pIdx * 0.002,
        baseLng - 0.002
      );
      pSpl.code = `SPL1-${String(pIdx + 1).padStart(2, '0')}`;
      nodes.push(pSpl);

      connections.push(
        makeConn(
          fjc,
          fjc.outputPorts[0].id,
          pSpl,
          pSpl.inputPorts[0].id,
          'feeder',
          `FDR-SPL-${pIdx + 1}`,
          `F1`,
          12,
          50
        )
      );

      const branchCount = Math.min(pSpl.outputPorts.length, 4);
      for (let b = 0; b < branchCount && createdCustomers < customersTotal; b++) {
        const branchY = baseY - 120 + b * 145;
        const sSpl = createNodeFromCatalog(
          secondaryType,
          880,
          branchY,
          nextSeq(),
          baseLat + pIdx * 0.002 + b * 0.001,
          baseLng + 0.003
        );
        sSpl.code = `SPL2-${pIdx + 1}.${b + 1}`;
        nodes.push(sSpl);

        connections.push(
          makeConn(
            pSpl,
            pSpl.outputPorts[b].id,
            sSpl,
            sSpl.inputPorts[0].id,
            'distribution',
            `DST-${pIdx + 1}-${b + 1}`,
            `F${b + 1}`,
            config.distributionCableCapacity,
            config.avgDistributionLengthM
          )
        );

        const fat = createNodeFromCatalog(
          'fat',
          1070,
          branchY,
          nextSeq(),
          baseLat + pIdx * 0.002 + b * 0.001,
          baseLng + 0.006
        );
        fat.code = `FAT-${pIdx + 1}.${b + 1}`;
        nodes.push(fat);

        connections.push(
          makeConn(
            sSpl,
            sSpl.outputPorts[0].id,
            fat,
            fat.inputPorts[0].id,
            'distribution',
            `DST-FAT-${pIdx + 1}.${b + 1}`,
            `F1..${customersPerDist}`,
            12,
            25
          )
        );

        const onuSlots = Math.min(
          fat.outputPorts.length,
          customersPerDist,
          customersTotal - createdCustomers
        );
        for (let c = 0; c < onuSlots; c++) {
          createdCustomers++;
          const onuY = branchY - ((onuSlots - 1) * 44) / 2 + c * 68;
          const onu = createNodeFromCatalog(
            'wifi_ont',
            1280,
            onuY,
            nextSeq(),
            baseLat + pIdx * 0.002 + b * 0.001 + (c - 1) * 0.0003,
            baseLng + 0.009 + c * 0.0004
          );
          onu.code = `ONT-${String(createdCustomers).padStart(3, '0')}`;
          onu.properties.technology = config.technology;
          nodes.push(onu);

          connections.push(
            makeConn(
              fat,
              fat.outputPorts[c].id,
              onu,
              onu.inputPorts[0].id,
              'drop',
              `DRP-${String(createdCustomers).padStart(3, '0')}`,
              `F1`,
              2,
              config.avgDropLengthM
            )
          );
        }
      }
    }
  } else {
    // Centralized / Distributed / Single-stage splitting
    const fdt =
      config.architecture === 'centralized'
        ? createNodeFromCatalog('fdt', 490, 260, nextSeq(), baseLat, baseLng - 0.006)
        : createNodeFromCatalog('joint_closure', 490, 260, nextSeq(), baseLat, baseLng - 0.006);
    fdt.code = config.architecture === 'centralized' ? 'FDT-01' : 'FJC-01';
    nodes.push(fdt);

    // Connect ODF-01 to FDT/FJC
    const odf0 = odfs[0];
    connections.push(
      makeConn(
        odf0,
        odf0.outputPorts[0].id,
        fdt,
        fdt.inputPorts[0].id,
        'feeder',
        'FDR-01',
        `Core-1..${config.feederCableCapacity}`,
        config.feederCableCapacity,
        config.avgFeederLengthM
      )
    );

    if (config.includeCivilMarkers) {
      const cab = createNodeFromCatalog('cabinet', 490, 410, nextSeq(), baseLat - 0.001, baseLng - 0.006);
      cab.code = 'CAB-01';
      nodes.push(cab);
    }

    const splitterCount = Math.max(1, Math.min(fdt.outputPorts.length, distPointsTarget));
    for (let s = 0; s < splitterCount && createdCustomers < customersTotal; s++) {
      const sy = 100 + s * 240;
      const spl = createNodeFromCatalog(
        primaryType,
        710,
        sy,
        nextSeq(),
        baseLat + (s - splitterCount / 2) * 0.0015,
        baseLng
      );
      spl.code = `SPL-${String(s + 1).padStart(2, '0')}`;
      nodes.push(spl);

      const fdtOutPort = fdt.outputPorts[s % fdt.outputPorts.length];
      connections.push(
        makeConn(
          fdt,
          fdtOutPort.id,
          spl,
          spl.inputPorts[0].id,
          config.architecture === 'distributed' ? 'distribution' : 'feeder',
          `DST-${String(s + 1).padStart(2, '0')}`,
          `F${s + 1}`,
          config.distributionCableCapacity,
          config.architecture === 'centralized' ? 40 : config.avgDistributionLengthM
        )
      );

      if (config.architecture === 'single_stage') {
        // Connect splitter outputs directly to ONUs
        const maxOutputs = Math.min(spl.outputPorts.length, customersTotal - createdCustomers);
        for (let o = 0; o < maxOutputs; o++) {
          createdCustomers++;
          const oy = sy - ((maxOutputs - 1) * 40) / 2 + o * 72;
          const onu = createNodeFromCatalog(
            'ont',
            1020,
            oy,
            nextSeq(),
            baseLat + (s - splitterCount / 2) * 0.0015 + o * 0.0003,
            baseLng + 0.006
          );
          onu.code = `ONT-${String(createdCustomers).padStart(3, '0')}`;
          onu.properties.technology = config.technology;
          nodes.push(onu);

          connections.push(
            makeConn(
              spl,
              spl.outputPorts[o].id,
              onu,
              onu.inputPorts[0].id,
              'drop',
              `DRP-${String(createdCustomers).padStart(3, '0')}`,
              `F1`,
              2,
              config.avgDropLengthM
            )
          );
        }
      } else {
        // Place FAT per splitter branch
        const fat = createNodeFromCatalog(
          'fat',
          940,
          sy,
          nextSeq(),
          baseLat + (s - splitterCount / 2) * 0.0015,
          baseLng + 0.004
        );
        fat.code = `FAT-${String(s + 1).padStart(2, '0')}`;
        nodes.push(fat);

        connections.push(
          makeConn(
            spl,
            spl.outputPorts[0].id,
            fat,
            fat.inputPorts[0].id,
            'distribution',
            `DST-FAT-${s + 1}`,
            `F1..${customersPerDist}`,
            config.distributionCableCapacity,
            config.architecture === 'centralized' ? config.avgDistributionLengthM : 45
          )
        );

        const maxOnu = Math.min(
          fat.outputPorts.length,
          customersPerDist,
          customersTotal - createdCustomers
        );
        for (let c = 0; c < maxOnu; c++) {
          createdCustomers++;
          const oy = sy - ((maxOnu - 1) * 42) / 2 + c * 74;
          const onu = createNodeFromCatalog(
            'onu',
            1180,
            oy,
            nextSeq(),
            baseLat + (s - splitterCount / 2) * 0.0015 + (c - 1) * 0.0003,
            baseLng + 0.008 + c * 0.0003
          );
          onu.code = `ONU-${String(createdCustomers).padStart(3, '0')}`;
          onu.properties.technology = config.technology;
          nodes.push(onu);

          connections.push(
            makeConn(
              fat,
              fat.outputPorts[c].id,
              onu,
              onu.inputPorts[0].id,
              'drop',
              `DRP-${String(createdCustomers).padStart(3, '0')}`,
              `F1`,
              2,
              config.avgDropLengthM
            )
          );
        }
      }
    }
  }

  return { nodes, connections };
}
