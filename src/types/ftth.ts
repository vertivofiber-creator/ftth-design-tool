export type ComponentCategory =
  | 'olt_co'
  | 'fiber_cables'
  | 'passive'
  | 'distribution'
  | 'customer'
  | 'annotation';

export type FtthComponentType =
  // OLT & Central Office
  | 'olt'
  | 'olt_chassis'
  | 'olt_line_card'
  | 'gpon_port'
  | 'xgs_pon_port'
  | 'odf'
  | 'patch_panel'
  | 'patch_cord'
  // Fiber Cables (placeable segments / cable reels / route markers)
  | 'feeder_cable'
  | 'distribution_cable'
  | 'drop_cable'
  | 'indoor_cable'
  | 'outdoor_cable'
  | 'underground_cable'
  | 'aerial_cable'
  | 'microduct_cable'
  // Passive Components
  | 'splitter_1_2'
  | 'splitter_1_4'
  | 'splitter_1_8'
  | 'splitter_1_16'
  | 'splitter_1_32'
  | 'splitter_1_64'
  | 'fbt_splitter'
  | 'optical_coupler'
  | 'ratio_coupler'
  | 'optical_attenuator'
  | 'joint_closure'
  | 'fiber_splice'
  // Distribution Equipment
  | 'fat'
  | 'fdb'
  | 'fdt'
  | 'ftb'
  | 'fiber_termination_box'
  | 'pole'
  | 'manhole'
  | 'handhole'
  | 'cabinet'
  // Customer Equipment
  | 'onu'
  | 'ont'
  | 'wifi_ont'
  | 'customer_termination_box'
  | 'rosette_box'
  // Annotations
  | 'text_label'
  | 'note_box';

export type PortDirection = 'in' | 'out' | 'bi';

export interface ComponentPort {
  id: string;
  label: string;
  direction: PortDirection;
  index: number;
  connectorType?: string;
  txPowerDbm?: number; // Initial optical transmit power for OLT/source PON ports or open reference input (e.g. 6 dBm, 9 dBm)
  portLossDb?: number; // Optional per-port insertion/attenuation override (dB)
  splitPercent?: number; // Optional power split percentage for asymmetric couplers/splitters (e.g. 80, 20)
  color?: string; // Optional fiber pigtail / port color hex (e.g. #EF4444 Red, #3B82F6 Blue)
}

export type PonTechnology = 'GPON' | 'XGS-PON' | '10G-EPON' | 'P2P' | 'Passive' | 'Civil';

export interface ComponentProperties {
  manufacturer: string;
  model: string;
  technology: PonTechnology;
  ponPorts?: number;
  downstreamWavelengthNm?: number;
  upstreamWavelengthNm?: number;
  txPowerDbm?: number;
  rxSensitivityDbm?: number;
  overloadDbm?: number;
  insertionLossDb: number;
  connectorLossDb: number;
  spliceLossDb: number;
  connectorType: 'SC/APC' | 'SC/UPC' | 'LC/APC' | 'LC/UPC' | 'FC/APC' | 'Fusion' | 'None';
  splitterRatio?: string;
  splitterType?: 'PLC' | 'FBT';
  coreCapacity?: number;
  fiberStandard?: 'G.652.D' | 'G.657.A1' | 'G.657.A2' | 'G.655';
  attenuationDbPerKm?: number;
  couplingRatio?: string;
  notes?: string;
  customSettings: Record<string, string>;
}

export interface FtthNode {
  id: string;
  type: FtthComponentType;
  category: ComponentCategory;
  name: string;
  code: string; // e.g., OLT-01, SPL-04, FAT-12, ONT-088
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  layerId: LayerId;
  locked: boolean;
  groupId?: string;
  lat: number;
  lng: number;
  inputPorts: ComponentPort[];
  outputPorts: ComponentPort[];
  properties: ComponentProperties;
  annotationText?: string;
}

export type CableType =
  | 'feeder'
  | 'distribution'
  | 'drop'
  | 'patch'
  | 'indoor'
  | 'outdoor'
  | 'underground'
  | 'aerial'
  | 'microduct';

export type RouteMethod = 'underground' | 'aerial' | 'building' | 'duct';
export type LineRoutingStyle = 'orthogonal' | 'straight' | 'curved';

export interface FiberConnection {
  id: string;
  cableId: string;
  fiberId: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  cableType: CableType;
  coreCapacity: number;
  color: string;
  routeType: RouteMethod;
  installationMethod: string;
  fiberStandard: 'G.652.D' | 'G.657.A1' | 'G.657.A2' | 'G.655';
  routingStyle: LineRoutingStyle;
  lengthMeters: number;
  autoCalculateLength: boolean;
  attenuationDownDbPerKm: number; // 1490nm / 1577nm
  attenuationUpDbPerKm: number; // 1310nm / 1270nm
  spliceCount: number;
  spliceLossDb: number;
  connectorCount: number;
  connectorLossDb: number;
  layerId: LayerId;
  waypoints: Array<{ x: number; y: number }>;
  geoPath: Array<[number, number]>;
  geoRouteMode?: 'auto_street' | 'manual';
  geoLockedVertexIndices?: number[];
  locked?: boolean;
  labelOffset?: { x: number; y: number };
}

export type LayerId =
  | 'olt'
  | 'feeder'
  | 'distribution'
  | 'drop'
  | 'splitter'
  | 'fat_fdb'
  | 'customer'
  | 'civil'
  | 'labels'
  | 'notes';

export interface CadLayer {
  id: LayerId;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string;
}

export type DrawingTool =
  | 'select'
  | 'pan'
  | 'cable'
  | 'measure'
  | 'text'
  | 'note';

export type WorkspaceMode = 'schematic' | 'gis';

export type OpticalLinkStatus =
  | 'normal'
  | 'low_margin'
  | 'excessive_loss'
  | 'disconnected'
  | 'invalid';

export interface OpticalHop {
  nodeId: string;
  nodeCode: string;
  nodeName: string;
  nodeType: FtthComponentType;
  connectionId?: string;
  cableId?: string;
  lengthMeters?: number;
  fiberLossDownDb: number;
  fiberLossUpDb: number;
  componentLossDb: number;
  connectorLossDb: number;
  spliceLossDb: number;
  cumulativeLossDownDb: number;
  cumulativeLossUpDb: number;
}

export interface OpticalPathResult {
  targetNodeId: string;
  targetCode: string;
  oltNodeId?: string;
  oltCode?: string;
  status: OpticalLinkStatus;
  statusReason: string;
  technology: PonTechnology;
  downstreamWavelengthNm: number;
  upstreamWavelengthNm: number;
  oltTxPowerDbm: number;
  onuRxSensitivityDbm: number;
  onuTxPowerDbm: number;
  oltRxSensitivityDbm: number;
  fiberAttenuationDownDb: number;
  fiberAttenuationUpDb: number;
  splitterLossDb: number;
  connectorLossDb: number;
  spliceLossDb: number;
  otherInsertionLossDb: number;
  totalLossDownDb: number;
  totalLossUpDb: number;
  receivedPowerDownDbm: number;
  receivedPowerUpDbm: number;
  opticalMarginDownDb: number;
  opticalMarginUpDb: number;
  hops: OpticalHop[];
  pathNodeIds: string[];
  pathConnectionIds: string[];
}

export interface ProjectSettings {
  projectName: string;
  projectCode: string;
  engineerName: string;
  clientName: string;
  locationName: string;
  metersPerPixel: number; // Schematic scale, e.g., 1 px = 0.5 m
  gridSizePx: number;
  snapToGrid: boolean;
  snapToPorts: boolean;
  showGrid: boolean;
  showRulers: boolean;
  showPortLabels: boolean;
  showPortOpticalDbm: boolean;
  showFiberArrows: boolean;
  showCableLabels: boolean;
  lowMarginThresholdDb: number; // e.g., 3.0 dB
  maxBudgetLossDb: number; // e.g., 28.0 dB (Class B+)
  gisCenter: [number, number];
  gisZoom: number;
}

export interface CableToolConfig {
  cableType: CableType;
  coreCapacity: number;
  color: string;
  routeType: RouteMethod;
  installationMethod: string;
  fiberStandard: 'G.652.D' | 'G.657.A1' | 'G.657.A2' | 'G.655';
  routingStyle: LineRoutingStyle;
}

export interface FtthProject {
  id: string;
  version: string;
  updatedAt: string;
  settings: ProjectSettings;
  layers: CadLayer[];
  nodes: FtthNode[];
  connections: FiberConnection[];
}

export interface AutoDesignConfig {
  architecture: 'centralized' | 'distributed' | 'cascaded' | 'single_stage';
  totalCustomers: number;
  oltCount: number;
  ponPortCount: number;
  primarySplitterRatio: '1:2' | '1:4' | '1:8' | '1:16' | '1:32' | '1:64';
  secondarySplitterRatio: '1:4' | '1:8' | '1:16';
  feederCableCapacity: number;
  distributionCableCapacity: number;
  distributionPointsCount: number;
  technology: 'GPON' | 'XGS-PON';
  avgFeederLengthM: number;
  avgDistributionLengthM: number;
  avgDropLengthM: number;
  includeCivilMarkers: boolean;
}
