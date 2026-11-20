export type EntityType = 'PHONE' | 'IMEI' | 'LAC_CID';

export type EdgeRelation =
  | 'TARGET_MENGHUBUNGI'
  | 'TARGET_DIHUBUNGI'
  | 'COMMUNICATION'
  | 'USES_IMEI'
  | 'LOCATED_AT';

export interface CdrCallRecord {
  id: string;
  rowNumber: number;
  date: string;
  time: string;
  durationSeconds: number;
  durationDisplay: string;
  aNumber: string;
  aImei: string;
  aImeiType: string;
  aImsi: string;
  aLacCid: string;
  aSitename: string;
  bNumber: string;
  bImei: string;
  bImeiType: string;
  bImsi: string;
  bLacCid: string;
  bSitename: string;
  callType: string;
  // DIRECTION dan C NUMBER sengaja diabaikan sesuai aturan analisa
  aLat: string;
  aLong: string;
  bLat: string;
  bLong: string;
  interactionLabel: 'Target Menghubungi' | 'Target Dihubungi' | 'Komunikasi Lain';
  sourceFile?: string;
}

export interface CoordinatePoint {
  lat: string;
  long: string;
  sitename: string;
}

export interface GraphNode {
  id: string;
  type: EntityType;
  label: string; // A/B NUMBER, A/B IMEI, atau A/B LAC/CID
  subData: string[]; // A/B IMSI, A/B IMEI TYPE, atau A/B SITENAME
  isTarget: boolean;
  count: number;
  asACount: number;
  asBCount: number;
  coordinates: CoordinatePoint[];
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: EdgeRelation;
  label: string;
  callCount: number;
  totalDurationSeconds: number;
  callTypes: string[];
  recordIds: string[];
}

export interface CdrAnalysisSummary {
  targetNumber: string;
  targetFrequency: number;
  targetAsACount: number; // Target menghubungi B NUMBER
  targetAsBCount: number; // Target dihubungi oleh A NUMBER
  totalRecords: number;
  uniquePhones: number;
  uniqueImeis: number;
  uniqueLacCids: number;
  callTypes: string[];
  dateRange: string;
}

export interface CdrAnalysisResult {
  summary: CdrAnalysisSummary;
  nodes: GraphNode[];
  edges: GraphEdge[];
  records: CdrCallRecord[];
}

export interface EntityExtraInfo {
  id: string;
  label: string;
  value: string;
}

export interface EntityCustomization {
  label?: string;
  subData?: string[];
  coordinates?: CoordinatePoint[];
  extraInfo?: EntityExtraInfo[];
  photoDataUrl?: string;
  photoName?: string;
}

export type ArrangeModeType =
  | 'PEACOCK'
  | 'COMPACT_PEACOCK'
  | 'HIERARCHY'
  | 'ORGANIZATION'
  | 'GROUPED'
  | 'TIMELINE';

export interface CanvasViewState {
  zoom: number;
  pan: { x: number; y: number };
  activeArrange: ArrangeModeType;
  visibleTypes: Record<EntityType, boolean>;
  callTypeFilter: string;
  searchTerm: string;
  showDataDrawer: boolean;
  drawerTab: 'CDR' | 'PHONE' | 'IMEI' | 'LAC_CID';
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
}

export interface CanvasProject {
  id: string;
  name: string;
  fileName?: string;
  sourceFiles?: string[];
  analysis: CdrAnalysisResult | null;
  createdAt: string;
  nodePositions: Record<string, { x: number; y: number }>;
  hiddenNodeIds?: string[];
  entityCustomizations?: Record<string, EntityCustomization>;
  viewState?: CanvasViewState;
  linkedPerkaraId?: string;
  linkedItemId?: string;
}

export type AnalisaCategory = 'CDR' | 'TRACE IMEI' | 'CELLDUMP';

export interface PerkaraAnalysisItem {
  id: string;
  jenisAnalisa: AnalisaCategory;
  canvasName: string;
  fileName: string;
  sourceFiles?: string[];
  catatan: string;
  targetNumber: string;
  totalRecords: number;
  totalEntities: number;
  savedAt: string;
  records: CdrCallRecord[];
  nodePositions?: Record<string, { x: number; y: number }>;
  hiddenNodeIds?: string[];
  entityCustomizations?: Record<string, EntityCustomization>;
  viewState?: CanvasViewState;
}

export interface PerkaraFolder {
  id: string;
  nomorPerkara: string;
  judulPerkara: string;
  catatan: string;
  createdAt: string;
  updatedAt: string;
  items: PerkaraAnalysisItem[];
}

export interface PerkaraRecord {
  id: string;
  nomorPerkara: string;
  judulPerkara: string;
  jenisAnalisa: AnalisaCategory;
  catatan: string;
  targetNumber: string;
  fileName: string;
  totalRecords: number;
  totalEntities: number;
  savedAt: string;
  records: CdrCallRecord[];
}
