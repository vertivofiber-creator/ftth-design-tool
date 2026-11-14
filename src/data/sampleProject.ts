import { FtthProject } from '../types/ftth';
import {
  CABLE_TYPE_DEFAULTS,
  DEFAULT_LAYERS,
  DEFAULT_PROJECT_SETTINGS,
  createNodeFromCatalog,
} from './componentCatalog';

export function createSampleFtthProject(): FtthProject {
  const [lat, lng] = DEFAULT_PROJECT_SETTINGS.gisCenter;

  const olt = createNodeFromCatalog('olt', 80, 220, 1, lat + 0.001, lng - 0.012);
  olt.code = 'OLT-01';
  olt.properties.model = 'SmartAX MA5800-X7 (GPON C+)';
  olt.properties.txPowerDbm = 6.0;
  olt.outputPorts = olt.outputPorts.map((p, idx) => ({
    ...p,
    txPowerDbm: idx === 1 ? 9.0 : 6.0,
  }));

  const odf = createNodeFromCatalog('odf', 260, 220, 2, lat + 0.001, lng - 0.010);
  odf.code = 'ODF-01';

  const fjc = createNodeFromCatalog('joint_closure', 450, 220, 3, lat + 0.0005, lng - 0.005);
  fjc.code = 'FJC-01';

  const mh = createNodeFromCatalog('manhole', 450, 340, 4, lat - 0.0002, lng - 0.005);
  mh.code = 'MH-01';

  const spl = createNodeFromCatalog('splitter_1_8', 650, 190, 5, lat, lng - 0.001);
  spl.code = 'SPL-01';

  const fat1 = createNodeFromCatalog('fat', 880, 110, 6, lat + 0.0015, lng + 0.003);
  fat1.code = 'FAT-01';

  const fat2 = createNodeFromCatalog('fat', 880, 310, 7, lat - 0.0015, lng + 0.003);
  fat2.code = 'FAT-02';

  const pole = createNodeFromCatalog('pole', 770, 360, 8, lat - 0.0012, lng + 0.001);
  pole.code = 'POLE-14';

  const onu1 = createNodeFromCatalog('wifi_ont', 1120, 60, 9, lat + 0.0022, lng + 0.007);
  onu1.code = 'ONT-101';

  const onu2 = createNodeFromCatalog('ont', 1120, 165, 10, lat + 0.0011, lng + 0.0075);
  onu2.code = 'ONT-102';

  const onu3 = createNodeFromCatalog('onu', 1120, 290, 11, lat - 0.0011, lng + 0.007);
  onu3.code = 'ONU-103';

  const att = createNodeFromCatalog('optical_attenuator', 995, 390, 12, lat - 0.002, lng + 0.005);
  att.code = 'ATT-5DB';
  att.properties.insertionLossDb = 11.5; // Intentionally triggers low-margin demo on ONU-104

  const onu4 = createNodeFromCatalog('onu', 1140, 390, 13, lat - 0.0022, lng + 0.008);
  onu4.code = 'ONU-104';

  const note = createNodeFromCatalog('note_box', 80, 380, 14, lat - 0.002, lng - 0.012);
  note.code = 'NOTE-01';
  note.annotationText =
    'Metro Sector 04 GPON Design\nClick any ONU to trace optical path & dBm margin.';

  const nodes = [olt, odf, fjc, mh, spl, fat1, fat2, pole, onu1, onu2, onu3, att, onu4, note];

  const mk = (
    src: typeof olt,
    sp: string,
    dst: typeof olt,
    dp: string,
    type: 'patch' | 'feeder' | 'distribution' | 'drop',
    cableId: string,
    fiberId: string,
    cores: number,
    lenM: number
  ) => {
    const def = CABLE_TYPE_DEFAULTS[type];
    return {
      id: `conn-${cableId}`,
      cableId,
      fiberId,
      sourceNodeId: src.id,
      sourcePortId: sp,
      targetNodeId: dst.id,
      targetPortId: dp,
      cableType: type,
      coreCapacity: cores,
      color: def.color,
      routeType: def.routeType,
      installationMethod: def.install,
      fiberStandard: def.standard,
      routingStyle: 'orthogonal' as const,
      lengthMeters: lenM,
      autoCalculateLength: false,
      attenuationDownDbPerKm: def.attenDown,
      attenuationUpDbPerKm: def.attenUp,
      spliceCount: type === 'patch' ? 0 : 2,
      spliceLossDb: 0.05,
      connectorCount: type === 'patch' ? 2 : 1,
      connectorLossDb: 0.35,
      layerId: def.layerId,
      waypoints: [],
      geoPath: [
        [src.lat, src.lng] as [number, number],
        [dst.lat, dst.lng] as [number, number],
      ],
    };
  };

  const connections = [
    mk(olt, 'out-1', odf, 'in-1', 'patch', 'PC-01', 'F1', 1, 5),
    mk(odf, 'out-1', fjc, 'in-1', 'feeder', 'FDR-01', 'F1-F48', 48, 2400),
    mk(fjc, 'out-1', spl, 'in-1', 'distribution', 'DST-01', 'F1-F12', 12, 850),
    mk(spl, 'out-1', fat1, 'in-1', 'distribution', 'DST-02', 'F1', 12, 320),
    mk(spl, 'out-2', fat2, 'in-1', 'distribution', 'DST-03', 'F2', 12, 410),
    mk(fat1, 'out-1', onu1, 'in-1', 'drop', 'DRP-101', 'F1', 2, 120),
    mk(fat1, 'out-2', onu2, 'in-1', 'drop', 'DRP-102', 'F1', 2, 165),
    mk(fat2, 'out-1', onu3, 'in-1', 'drop', 'DRP-103', 'F1', 2, 140),
    mk(fat2, 'out-2', att, 'in-1', 'drop', 'DRP-104A', 'F1', 2, 180),
    mk(att, 'out-1', onu4, 'in-1', 'drop', 'DRP-104B', 'F1', 2, 45),
  ];

  return {
    id: 'proj-sample-metro-04',
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    settings: { ...DEFAULT_PROJECT_SETTINGS },
    layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
    nodes,
    connections,
  };
}

export function createBlankFtthProject(): FtthProject {
  return {
    id: `proj-${Date.now()}`,
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    settings: {
      ...DEFAULT_PROJECT_SETTINGS,
      projectName: 'Untitled FTTH Network',
      projectCode: `FTTH-${new Date().getFullYear()}-001`,
    },
    layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
    nodes: [],
    connections: [],
  };
}
