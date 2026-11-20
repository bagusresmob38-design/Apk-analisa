import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Maximize2,
  Phone,
  Radio,
  RotateCcw,
  Save,
  Search,
  Smartphone,
  Table as TableIcon,
  Upload,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownLeft,
  MapPin,
  Crosshair,
  GripHorizontal,
  LayoutGrid,
  Check,
  Trash2,
  Pencil,
  ImagePlus,
  Camera,
  FileText,
  Plus,
  X,
} from 'lucide-react';
import type {
  CanvasProject,
  CanvasViewState,
  CdrAnalysisResult,
  CdrCallRecord,
  CoordinatePoint,
  EntityCustomization,
  EntityExtraInfo,
  EntityType,
  GraphEdge,
  GraphNode,
} from '../types/cdr';
import {
  analyzeCdrRecords,
  formatDuration,
  mergeCdrRecordSets,
  parseExcelBufferToCdrRecords,
} from '../utils/cdrAnalyzer';
import {
  ARRANGE_OPTIONS,
  computeArrangeLayout,
  type ArrangeMode,
} from '../utils/graphLayouts';

async function compressImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 560;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Canvas context tidak tersedia'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  });
}

interface SpiderWebCanvasProps {
  project: CanvasProject;
  onUpdateProject: (updated: CanvasProject) => void;
  onRequestSavePerkara: (project: CanvasProject) => void;
}

const NODE_WIDTH = 224;
const NODE_HEIGHT = 78;
const LAC_NODE_HEIGHT = 96;

export const SpiderWebCanvas: React.FC<SpiderWebCanvasProps> = ({
  project,
  onUpdateProject,
  onRequestSavePerkara,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadModeRef = useRef<'REPLACE' | 'APPEND'>('REPLACE');
  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Canvas view state (infinite pan & zoom), dipulihkan dari project.viewState jika ada
  const [zoom, setZoom] = useState(() => project.viewState?.zoom ?? 0.88);
  const [pan, setPan] = useState(() => project.viewState?.pan ?? { x: 40, y: 20 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });

  // Multi-touch 2-finger pinch-to-zoom tracking
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
    zoom: number;
    panX: number;
    panY: number;
  } | null>(null);
  const pinchUsedRef = useRef(false);

  // Node dragging state (smooth local preview + commit on pointerup)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const draggingNodeIdRef = useRef<string | null>(null);
  const [liveDragPos, setLiveDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragNodeStartRef = useRef({ mouseX: 0, mouseY: 0, nodeX: 0, nodeY: 0, moved: false });
  const liveDragPosRef = useRef<{ id: string; x: number; y: number } | null>(null);

  // Filters & selection
  const [visibleTypes, setVisibleTypes] = useState<Record<EntityType, boolean>>(
    () =>
      project.viewState?.visibleTypes ?? {
        PHONE: true,
        IMEI: true,
        LAC_CID: true,
      }
  );
  const [callTypeFilter, setCallTypeFilter] = useState<string>(
    () => project.viewState?.callTypeFilter ?? 'ALL'
  );
  const [searchTerm, setSearchTerm] = useState(() => project.viewState?.searchTerm ?? '');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    () => project.viewState?.selectedNodeId ?? null
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(
    () => project.viewState?.selectedEdgeId ?? null
  );

  // Entity editing, extra info & photo state
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [isEditingEntity, setIsEditingEntity] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editSubData, setEditSubData] = useState<string[]>([]);
  const [newSubDataItem, setNewSubDataItem] = useState('');
  const [editCoordinates, setEditCoordinates] = useState<CoordinatePoint[]>([]);
  const [newInfoLabel, setNewInfoLabel] = useState('');
  const [newInfoValue, setNewInfoValue] = useState('');
  const [editingInfoId, setEditingInfoId] = useState<string | null>(null);
  const [editingInfoLabel, setEditingInfoLabel] = useState('');
  const [editingInfoValue, setEditingInfoValue] = useState('');
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Bottom data drawer
  const [showDataDrawer, setShowDataDrawer] = useState(
    () => project.viewState?.showDataDrawer ?? false
  );
  const [drawerTab, setDrawerTab] = useState<'CDR' | 'PHONE' | 'IMEI' | 'LAC_CID'>(
    () => project.viewState?.drawerTab ?? 'CDR'
  );

  // Arrange menu (i2 Analyst's Notebook style)
  const [activeArrange, setActiveArrange] = useState<ArrangeMode>(
    () => project.viewState?.activeArrange ?? 'PEACOCK'
  );
  const [isArrangeMenuOpen, setIsArrangeMenuOpen] = useState(false);
  const arrangeMenuRef = useRef<HTMLDivElement | null>(null);

  const projectRef = useRef(project);
  projectRef.current = project;
  const onUpdateProjectRef = useRef(onUpdateProject);
  onUpdateProjectRef.current = onUpdateProject;

  const getCurrentViewState = (): CanvasViewState => ({
    zoom,
    pan,
    activeArrange,
    visibleTypes,
    callTypeFilter,
    searchTerm,
    showDataDrawer,
    drawerTab,
    selectedNodeId,
    selectedEdgeId,
  });

  // Sinkronisasi viewState ke project (debounced ringan agar perpindahan tab atau simpan selalu identik)
  useEffect(() => {
    const nextView: CanvasViewState = {
      zoom,
      pan,
      activeArrange,
      visibleTypes,
      callTypeFilter,
      searchTerm,
      showDataDrawer,
      drawerTab,
      selectedNodeId,
      selectedEdgeId,
    };
    const timer = window.setTimeout(() => {
      const prevView = projectRef.current.viewState;
      if (JSON.stringify(prevView) !== JSON.stringify(nextView)) {
        onUpdateProjectRef.current({
          ...projectRef.current,
          viewState: nextView,
        });
      }
    }, 140);
    return () => window.clearTimeout(timer);
  }, [
    zoom,
    pan,
    activeArrange,
    visibleTypes,
    callTypeFilter,
    searchTerm,
    showDataDrawer,
    drawerTab,
    selectedNodeId,
    selectedEdgeId,
  ]);

  useEffect(() => {
    if (!isArrangeMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (arrangeMenuRef.current && !arrangeMenuRef.current.contains(e.target as Node)) {
        setIsArrangeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isArrangeMenuOpen]);

  const analysis: CdrAnalysisResult | null = project.analysis;

  const processExcelFiles = async (files: File[], mode: 'REPLACE' | 'APPEND') => {
    if (files.length === 0) return;
    setIsLoadingFile(true);
    setUploadError(null);
    try {
      const parsedSets = await Promise.all(
        files.map(async (f) => {
          const buffer = await f.arrayBuffer();
          return parseExcelBufferToCdrRecords(buffer, f.name);
        })
      );

      const newNames = files.map((f) => f.name);

      if (mode === 'APPEND' && analysis) {
        const mergedRecords = mergeCdrRecordSets([analysis.records, ...parsedSets]);
        const result = analyzeCdrRecords(mergedRecords);
        const nextPositions = computeArrangeLayout(activeArrange, result);
        const existingFiles =
          project.sourceFiles && project.sourceFiles.length > 0
            ? project.sourceFiles
            : project.fileName
              ? [project.fileName]
              : [];
        const combinedFiles = [...existingFiles, ...newNames];

        onUpdateProject({
          ...project,
          fileName: combinedFiles.join(' + '),
          sourceFiles: combinedFiles,
          analysis: result,
          nodePositions: nextPositions,
        });
        fitPositionsToViewport(nextPositions);
      } else {
        const mergedRecords = mergeCdrRecordSets(parsedSets);
        const result = analyzeCdrRecords(mergedRecords);
        const initialPositions = computeArrangeLayout('PEACOCK', result);
        onUpdateProject({
          ...project,
          fileName: newNames.join(' + '),
          sourceFiles: newNames,
          analysis: result,
          nodePositions: initialPositions,
          hiddenNodeIds: [],
          entityCustomizations: {},
        });
        setActiveArrange('PEACOCK');
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setIsEditingEntity(false);
        setCallTypeFilter('ALL');
        setSearchTerm('');
        fitPositionsToViewport(initialPositions);
      }
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Gagal membaca file Excel. Pastikan format kolom sesuai.'
      );
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    if (fileList.length > 0) {
      void processExcelFiles(fileList, uploadModeRef.current);
    }
    e.target.value = '';
  };

  const fitPositionsToViewport = (positions: Record<string, { x: number; y: number }>) => {
    const coords = Object.values(positions);
    if (coords.length === 0) {
      setZoom(0.86);
      setPan({ x: 40, y: 20 });
      return;
    }

    const xs = coords.map((p) => p.x);
    const ys = coords.map((p) => p.y);
    const minX = Math.min(...xs) - 140;
    const maxX = Math.max(...xs) + 140;
    const minY = Math.min(...ys) - 110;
    const maxY = Math.max(...ys) + 110;

    const rect = svgContainerRef.current?.getBoundingClientRect();
    const viewW = rect?.width && rect.width > 100 ? rect.width : 1100;
    const viewH = rect?.height && rect.height > 100 ? rect.height : 650;

    const graphW = Math.max(300, maxX - minX);
    const graphH = Math.max(250, maxY - minY);
    const nextZoom = Math.min(1.0, Math.max(0.25, Math.min(viewW / graphW, viewH / graphH) * 0.88));
    const roundedZoom = Number(nextZoom.toFixed(2));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(roundedZoom);
    setPan({
      x: Math.round(viewW / 2 - centerX * roundedZoom),
      y: Math.round(viewH / 2 - centerY * roundedZoom),
    });
  };

  const handleSelectArrange = (mode: ArrangeMode) => {
    if (!analysis) return;
    const newPositions = computeArrangeLayout(mode, analysis);
    onUpdateProject({
      ...project,
      nodePositions: newPositions,
    });
    setActiveArrange(mode);
    setIsArrangeMenuOpen(false);
    fitPositionsToViewport(newPositions);
  };

  const handleResetLayout = () => {
    if (!analysis) return;
    const resetPos = computeArrangeLayout(activeArrange, analysis);
    onUpdateProject({
      ...project,
      nodePositions: resetPos,
    });
    fitPositionsToViewport(resetPos);
  };

  const handleCenterTarget = () => {
    if (!analysis || !svgContainerRef.current) return;
    const targetNodeId = `PHONE:${analysis.summary.targetNumber}`;
    const saved = project.nodePositions[targetNodeId];
    const baseNode = analysis.nodes.find((n) => n.id === targetNodeId);
    const tx = saved?.x ?? baseNode?.x ?? 760;
    const ty = saved?.y ?? baseNode?.y ?? 500;
    const rect = svgContainerRef.current.getBoundingClientRect();
    setPan({
      x: Math.round(rect.width / 2 - tx * zoom),
      y: Math.round(rect.height / 2 - ty * zoom),
    });
  };

  const handleExportCsv = () => {
    if (!analysis) return;
    const headers = [
      'DATE',
      'TIME',
      'DURATION_SEC',
      'INTERAKSI_TARGET',
      'A_NUMBER',
      'A_IMEI',
      'A_IMEI_TYPE',
      'A_IMSI',
      'A_LAC_CID',
      'A_SITENAME',
      'B_NUMBER',
      'B_IMEI',
      'B_IMEI_TYPE',
      'B_IMSI',
      'B_LAC_CID',
      'B_SITENAME',
      'CALLTYPE',
      'A_LAT',
      'A_LONG',
      'B_LAT',
      'B_LONG',
    ];
    const rows = analysis.records.map((r) => [
      r.date,
      r.time,
      r.durationSeconds,
      r.interactionLabel,
      r.aNumber,
      r.aImei,
      r.aImeiType,
      r.aImsi,
      r.aLacCid,
      r.aSitename,
      r.bNumber,
      r.bImei,
      r.bImeiType,
      r.bImsi,
      r.bLacCid,
      r.bSitename,
      r.callType,
      r.aLat,
      r.aLong,
      r.bLat,
      r.bLong,
    ]);
    const csvContent =
      [headers, ...rows]
        .map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${project.name.replace(/\s+/g, '_')}_hasil_analisa.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filtered nodes and edges
  const { positionedNodes, visibleEdges } = useMemo(() => {
    if (!analysis) {
      return {
        positionedNodes: [] as GraphNode[],
        visibleEdges: [] as GraphEdge[],
      };
    }

    const q = searchTerm.trim().toLowerCase();

    const customizations = project.entityCustomizations ?? {};

    const nodesWithPos = analysis.nodes.map((node) => {
      const custom = customizations[node.id];
      const pos =
        liveDragPos && liveDragPos.id === node.id
          ? { x: liveDragPos.x, y: liveDragPos.y }
          : project.nodePositions[node.id] ?? { x: node.x, y: node.y };

      return {
        ...node,
        label: custom?.label !== undefined ? custom.label : node.label,
        subData: custom?.subData !== undefined ? custom.subData : node.subData,
        coordinates:
          custom?.coordinates !== undefined ? custom.coordinates : node.coordinates,
        x: pos.x,
        y: pos.y,
      };
    });

    // Jika filter CALLTYPE aktif, cari record & node yang relevan
    let allowedNodeIdsByCallType: Set<string> | null = null;
    if (callTypeFilter !== 'ALL') {
      allowedNodeIdsByCallType = new Set<string>();
      analysis.records
        .filter((r) => r.callType === callTypeFilter)
        .forEach((r) => {
          if (r.aNumber) allowedNodeIdsByCallType!.add(`PHONE:${r.aNumber}`);
          if (r.bNumber) allowedNodeIdsByCallType!.add(`PHONE:${r.bNumber}`);
          if (r.aImei) allowedNodeIdsByCallType!.add(`IMEI:${r.aImei}`);
          if (r.bImei) allowedNodeIdsByCallType!.add(`IMEI:${r.bImei}`);
          if (r.aLacCid) allowedNodeIdsByCallType!.add(`LAC:${r.aLacCid}`);
          if (r.bLacCid) allowedNodeIdsByCallType!.add(`LAC:${r.bLacCid}`);
        });
    }

    const hiddenSet = new Set(project.hiddenNodeIds ?? []);

    const filteredNodes = nodesWithPos.filter((n) => {
      if (hiddenSet.has(n.id)) return false;
      if (!visibleTypes[n.type]) return false;
      if (allowedNodeIdsByCallType && !allowedNodeIdsByCallType.has(n.id)) return false;
      if (!q) return true;
      const custom = customizations[n.id];
      const inLabel = n.label.toLowerCase().includes(q);
      const inSub = n.subData.some((s) => s.toLowerCase().includes(q));
      const inExtraInfo = (custom?.extraInfo ?? []).some(
        (info) =>
          info.label.toLowerCase().includes(q) || info.value.toLowerCase().includes(q)
      );
      return inLabel || inSub || inExtraInfo || n.isTarget;
    });

    const nodeIdSet = new Set(filteredNodes.map((n) => n.id));

    const filteredEdges = analysis.edges.filter((e) => {
      if (!nodeIdSet.has(e.source) || !nodeIdSet.has(e.target)) return false;
      if (
        callTypeFilter !== 'ALL' &&
        (e.relation === 'TARGET_MENGHUBUNGI' ||
          e.relation === 'TARGET_DIHUBUNGI' ||
          e.relation === 'COMMUNICATION')
      ) {
        return e.callTypes.includes(callTypeFilter);
      }
      return true;
    });

    return {
      positionedNodes: filteredNodes,
      visibleEdges: filteredEdges,
    };
  }, [
    analysis,
    project.nodePositions,
    project.hiddenNodeIds,
    project.entityCustomizations,
    liveDragPos,
    visibleTypes,
    callTypeFilter,
    searchTerm,
  ]);

  const nodeById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    positionedNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [positionedNodes]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodeById.get(selectedNodeId) || null : null),
    [selectedNodeId, nodeById]
  );

  const selectedRawNode = useMemo(
    () =>
      selectedNodeId && analysis
        ? analysis.nodes.find((n) => n.id === selectedNodeId) || null
        : null,
    [selectedNodeId, analysis]
  );

  const selectedNodeCustom: EntityCustomization | undefined = selectedNodeId
    ? project.entityCustomizations?.[selectedNodeId]
    : undefined;

  useEffect(() => {
    setIsEditingEntity(false);
    setNewSubDataItem('');
    setNewInfoLabel('');
    setNewInfoValue('');
    setEditingInfoId(null);
  }, [selectedNodeId]);

  const selectedEdge = useMemo(
    () => (selectedEdgeId ? visibleEdges.find((e) => e.id === selectedEdgeId) || null : null),
    [selectedEdgeId, visibleEdges]
  );

  const selectedRelatedRecords = useMemo<CdrCallRecord[]>(() => {
    if (!analysis) return [];
    if (selectedEdge) {
      const idSet = new Set(selectedEdge.recordIds);
      return analysis.records.filter((r) => idSet.has(r.id));
    }
    const targetNode = selectedRawNode || selectedNode;
    if (targetNode) {
      if (targetNode.type === 'PHONE') {
        return analysis.records.filter(
          (r) => r.aNumber === targetNode.label || r.bNumber === targetNode.label
        );
      }
      if (targetNode.type === 'IMEI') {
        return analysis.records.filter(
          (r) => r.aImei === targetNode.label || r.bImei === targetNode.label
        );
      }
      if (targetNode.type === 'LAC_CID') {
        return analysis.records.filter(
          (r) => r.aLacCid === targetNode.label || r.bLacCid === targetNode.label
        );
      }
    }
    return [];
  }, [analysis, selectedNode, selectedRawNode, selectedEdge]);

  const updateNodeCustomization = (
    nodeId: string,
    updater: (prev: EntityCustomization) => EntityCustomization
  ) => {
    const prevAll = project.entityCustomizations ?? {};
    const prevNodeCustom = prevAll[nodeId] ?? {};
    const nextNodeCustom = updater(prevNodeCustom);
    onUpdateProject({
      ...project,
      entityCustomizations: {
        ...prevAll,
        [nodeId]: nextNodeCustom,
      },
    });
  };

  const handleStartEditEntity = () => {
    if (!selectedNode) return;
    setEditLabel(selectedNode.label);
    setEditSubData([...selectedNode.subData]);
    setEditCoordinates(selectedNode.coordinates.map((c) => ({ ...c })));
    setNewSubDataItem('');
    setIsEditingEntity(true);
  };

  const handleSaveEditEntity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNode) return;
    const trimmedLabel = editLabel.trim();
    if (!trimmedLabel) return;
    const cleanedSubData = editSubData.map((s) => s.trim()).filter(Boolean);
    const cleanedCoords = editCoordinates
      .map((c) => ({
        lat: c.lat.trim(),
        long: c.long.trim(),
        sitename: c.sitename.trim() || trimmedLabel,
      }))
      .filter((c) => c.lat || c.long);

    updateNodeCustomization(selectedNode.id, (prev) => ({
      ...prev,
      label: trimmedLabel,
      subData: cleanedSubData,
      coordinates: selectedNode.type === 'LAC_CID' ? cleanedCoords : prev.coordinates,
    }));
    setIsEditingEntity(false);
  };

  const handleResetEntityData = () => {
    if (!selectedNode) return;
    updateNodeCustomization(selectedNode.id, (prev) => {
      const next: EntityCustomization = { ...prev };
      delete next.label;
      delete next.subData;
      delete next.coordinates;
      return next;
    });
    setIsEditingEntity(false);
  };

  const handleAddExtraInfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNode) return;
    const val = newInfoValue.trim();
    if (!val) return;
    const lbl = newInfoLabel.trim() || 'Informasi';
    const item: EntityExtraInfo = {
      id: `info-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: lbl,
      value: val,
    };
    updateNodeCustomization(selectedNode.id, (prev) => ({
      ...prev,
      extraInfo: [...(prev.extraInfo ?? []), item],
    }));
    setNewInfoLabel('');
    setNewInfoValue('');
  };

  const handleSaveEditedInfo = (infoId: string) => {
    if (!selectedNode) return;
    const val = editingInfoValue.trim();
    if (!val) return;
    const lbl = editingInfoLabel.trim() || 'Informasi';
    updateNodeCustomization(selectedNode.id, (prev) => ({
      ...prev,
      extraInfo: (prev.extraInfo ?? []).map((it) =>
        it.id === infoId ? { ...it, label: lbl, value: val } : it
      ),
    }));
    setEditingInfoId(null);
  };

  const handleDeleteExtraInfo = (infoId: string) => {
    if (!selectedNode) return;
    updateNodeCustomization(selectedNode.id, (prev) => ({
      ...prev,
      extraInfo: (prev.extraInfo ?? []).filter((it) => it.id !== infoId),
    }));
  };

  const handleEntityPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedNode) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      updateNodeCustomization(selectedNode.id, (prev) => ({
        ...prev,
        photoDataUrl: dataUrl,
        photoName: file.name,
      }));
    } catch {
      setUploadError('Gagal memproses file foto/gambar entity.');
    }
  };

  const handleRemoveEntityPhoto = () => {
    if (!selectedNode) return;
    updateNodeCustomization(selectedNode.id, (prev) => {
      const next: EntityCustomization = { ...prev };
      delete next.photoDataUrl;
      delete next.photoName;
      return next;
    });
  };

  const handleDeleteNode = (nodeId: string) => {
    const currentHidden = project.hiddenNodeIds ?? [];
    if (currentHidden.includes(nodeId)) return;
    onUpdateProject({
      ...project,
      hiddenNodeIds: [...currentHidden, nodeId],
    });
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
    if (selectedEdge && (selectedEdge.source === nodeId || selectedEdge.target === nodeId)) {
      setSelectedEdgeId(null);
    }
  };

  const handleRestoreAllNodes = () => {
    onUpdateProject({
      ...project,
      hiddenNodeIds: [],
    });
  };

  // Non-passive wheel listener: mendukung scroll zoom & trackpad 2-finger pinch (ctrlKey) tanpa zoom halaman browser
  useEffect(() => {
    const el = svgContainerRef.current;
    if (!el || !analysis) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const currZoom = zoomRef.current;
      const currPan = panRef.current;
      const intensity = e.ctrlKey ? 0.012 : 0.0018;
      const factor = Math.exp(-e.deltaY * intensity);
      const nextZoom = Math.min(3.0, Math.max(0.15, Number((currZoom * factor).toFixed(3))));
      const scaleRatio = nextZoom / currZoom;

      setPan({
        x: Math.round(mouseX - (mouseX - currPan.x) * scaleRatio),
        y: Math.round(mouseY - (mouseY - currPan.y) * scaleRatio),
      });
      setZoom(nextZoom);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [analysis]);

  // Direct Pointer Events with setPointerCapture + 2-finger pinch-to-zoom + tap-canvas-to-close
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingNodeIdRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2 && svgContainerRef.current) {
      // Mulai gestur cubit 2 jari (pinch-to-zoom)
      isPanningRef.current = false;
      setIsPanning(false);
      pinchUsedRef.current = true;
      panStartRef.current.moved = true;

      const pts = Array.from(activePointersRef.current.values());
      const rect = svgContainerRef.current.getBoundingClientRect();
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top;

      pinchStateRef.current = {
        dist: Math.max(1, dist),
        midX,
        midY,
        zoom: zoomRef.current,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
      return;
    }

    if (activePointersRef.current.size === 1) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Abaikan jika browser tidak mengizinkan capture
      }
      pinchUsedRef.current = false;
      isPanningRef.current = true;
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
        moved: false,
      };
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch-to-zoom 2 jari
    if (
      activePointersRef.current.size === 2 &&
      pinchStateRef.current &&
      svgContainerRef.current
    ) {
      const pts = Array.from(activePointersRef.current.values());
      const rect = svgContainerRef.current.getBoundingClientRect();
      const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const newMidX = (pts[0].x + pts[1].x) / 2 - rect.left;
      const newMidY = (pts[0].y + pts[1].y) / 2 - rect.top;

      const ps = pinchStateRef.current;
      const scaleFactor = newDist / ps.dist;
      const nextZoom = Math.min(3.0, Math.max(0.15, Number((ps.zoom * scaleFactor).toFixed(3))));

      const worldX = (ps.midX - ps.panX) / ps.zoom;
      const worldY = (ps.midY - ps.panY) / ps.zoom;

      setZoom(nextZoom);
      setPan({
        x: Math.round(newMidX - worldX * nextZoom),
        y: Math.round(newMidY - worldY * nextZoom),
      });
      return;
    }

    if (!isPanningRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    if (Math.hypot(dx, dy) > 4) {
      panStartRef.current.moved = true;
    }
    setPan({
      x: panStartRef.current.panX + dx,
      y: panStartRef.current.panY + dy,
    });
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Abaikan jika sudah dilepas
      }
    }

    if (activePointersRef.current.size < 2) {
      pinchStateRef.current = null;
    }

    if (activePointersRef.current.size === 0) {
      const wasClick = !panStartRef.current.moved && !pinchUsedRef.current;
      isPanningRef.current = false;
      setIsPanning(false);
      pinchUsedRef.current = false;

      // Klik pada area canvas menutup kolom informasi entity/relasi yang sedang terbuka
      if (wasClick) {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
    }
  };

  const handleNodePointerDown = (e: React.PointerEvent<HTMLDivElement>, node: GraphNode) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    if (e.pointerType !== 'mouse') {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointersRef.current.size >= 2 && svgContainerRef.current) {
        // Jari ke-2 menyentuh saat jari ke-1 di atas entity: beralih ke mode cubit 2 jari
        draggingNodeIdRef.current = null;
        liveDragPosRef.current = null;
        setDraggingNodeId(null);
        setLiveDragPos(null);
        isPanningRef.current = false;
        setIsPanning(false);
        pinchUsedRef.current = true;

        const pts = Array.from(activePointersRef.current.values());
        const rect = svgContainerRef.current.getBoundingClientRect();
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
        const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
        pinchStateRef.current = {
          dist: Math.max(1, dist),
          midX,
          midY,
          zoom: zoomRef.current,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
        return;
      }
    }

    e.stopPropagation();
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Abaikan jika browser tidak mendukung capture
    }
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    draggingNodeIdRef.current = node.id;
    setDraggingNodeId(node.id);
    const initialPos = { id: node.id, x: node.x, y: node.y };
    liveDragPosRef.current = initialPos;
    setLiveDragPos(initialPos);
    dragNodeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: node.x,
      nodeY: node.y,
      moved: false,
    };
  };

  const handleNodePointerMove = (e: React.PointerEvent<HTMLDivElement>, nodeId: string) => {
    if (e.pointerType !== 'mouse' && activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointersRef.current.size === 2 && pinchStateRef.current && svgContainerRef.current) {
        handleCanvasPointerMove(e);
        return;
      }
    }

    if (draggingNodeIdRef.current !== nodeId) return;
    e.stopPropagation();
    const rawDx = e.clientX - dragNodeStartRef.current.mouseX;
    const rawDy = e.clientY - dragNodeStartRef.current.mouseY;
    if (Math.abs(rawDx) > 2 || Math.abs(rawDy) > 2) {
      dragNodeStartRef.current.moved = true;
    }
    const nextPos = {
      id: nodeId,
      x: Math.round(dragNodeStartRef.current.nodeX + rawDx / zoom),
      y: Math.round(dragNodeStartRef.current.nodeY + rawDy / zoom),
    };
    liveDragPosRef.current = nextPos;
    setLiveDragPos(nextPos);
  };

  const handleNodePointerUp = (e: React.PointerEvent<HTMLDivElement>, nodeId: string) => {
    if (e.pointerType !== 'mouse') {
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size < 2) {
        pinchStateRef.current = null;
      }
    }

    if (draggingNodeIdRef.current !== nodeId) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Abaikan jika sudah dilepas
      }
    }
    const committed = liveDragPosRef.current;
    if (committed && dragNodeStartRef.current.moved) {
      onUpdateProject({
        ...project,
        nodePositions: {
          ...project.nodePositions,
          [committed.id]: { x: committed.x, y: committed.y },
        },
      });
    }
    liveDragPosRef.current = null;
    draggingNodeIdRef.current = null;
    setLiveDragPos(null);
    setDraggingNodeId(null);
  };

  // Detect bidirectional pairs so edges curve cleanly apart
  const bidirectionalPairs = useMemo(() => {
    const set = new Set<string>();
    const pairCounts = new Map<string, number>();
    visibleEdges.forEach((edge) => {
      const pairKey = [edge.source, edge.target].sort().join('||');
      pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
    });
    pairCounts.forEach((count, key) => {
      if (count > 1) set.add(key);
    });
    return set;
  }, [visibleEdges]);

  const toggleEntityType = (type: EntityType) => {
    setVisibleTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  return (
    <div className="flex h-[calc(100vh-108px)] min-h-[640px] flex-col bg-white">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.csv"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Canvas Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {!analysis ? (
            <button
              type="button"
              onClick={() => {
                uploadModeRef.current = 'REPLACE';
                fileInputRef.current?.click();
              }}
              disabled={isLoadingFile}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              {isLoadingFile ? 'Memproses Excel...' : 'Upload File Excel'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  uploadModeRef.current = 'APPEND';
                  fileInputRef.current?.click();
                }}
                disabled={isLoadingFile}
                title="Tambahkan dan gabungkan 1 atau lebih file Excel ke canvas ini"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                {isLoadingFile ? 'Menggabungkan...' : 'Tambah File Excel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  uploadModeRef.current = 'REPLACE';
                  fileInputRef.current?.click();
                }}
                disabled={isLoadingFile}
                title="Ganti seluruh data canvas dengan file Excel baru"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" />
                Ganti File
              </button>
            </>
          )}

          {analysis ? (
            <>
              <div className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />

              {/* ARRANGE Dropdown (i2 Analyst's Notebook style) */}
              <div ref={arrangeMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsArrangeMenuOpen((open) => !open)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:border-blue-600 hover:bg-blue-50/40 whitespace-nowrap shrink-0"
                >
                  <LayoutGrid className="h-3.5 w-3.5 text-blue-700" />
                  <span>ARRANGE</span>
                  <span className="text-slate-400">·</span>
                  <span className="font-medium text-blue-700">
                    {ARRANGE_OPTIONS.find((opt) => opt.id === activeArrange)?.label}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                </button>

                {isArrangeMenuOpen ? (
                  <div className="absolute left-0 top-full z-40 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    <div className="border-b border-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
                      Pilih Tata Letak Jaringan
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {ARRANGE_OPTIONS.map((option) => {
                        const isActive = activeArrange === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => handleSelectArrange(option.id)}
                            className={`flex w-full items-start justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                              isActive
                                ? 'bg-blue-50 text-blue-800'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div>
                              <div className="text-xs font-semibold">{option.label}</div>
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {option.description}
                              </div>
                            </div>
                            {isActive ? (
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-700" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
              {/* Filter Entity */}
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => toggleEntityType('PHONE')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    visibleTypes.PHONE
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <Phone className="h-3 w-3 text-blue-700" />
                  Nomor HP
                </button>
                <button
                  type="button"
                  onClick={() => toggleEntityType('IMEI')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    visibleTypes.IMEI
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <Smartphone className="h-3 w-3 text-teal-700" />
                  IMEI
                </button>
                <button
                  type="button"
                  onClick={() => toggleEntityType('LAC_CID')}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    visibleTypes.LAC_CID
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <Radio className="h-3 w-3 text-indigo-700" />
                  LAC/CID
                </button>
              </div>

              {/* Filter Calltype */}
              <select
                aria-label="Filter Call Type"
                value={callTypeFilter}
                onChange={(e) => setCallTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-600 focus:outline-none"
              >
                <option value="ALL">Semua Calltype</option>
                {analysis.summary.callTypes.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>

              {/* Pencarian Entity */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari Nomor, IMEI, IMSI, BTS..."
                  className="w-48 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </>
          ) : null}
        </div>

        {analysis ? (
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.15, Number((z - 0.12).toFixed(2))))}
                className="p-1.5 text-slate-600 hover:bg-slate-50"
                title="Perkecil"
                aria-label="Perkecil"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="border-x border-slate-200 px-2 font-mono text-[11px] text-slate-600 tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3.0, Number((z + 0.12).toFixed(2))))}
                className="p-1.5 text-slate-600 hover:bg-slate-50"
                title="Perbesar"
                aria-label="Perbesar"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCenterTarget}
                className="border-l border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                title="Fokus ke Target"
                aria-label="Fokus ke Target"
              >
                <Crosshair className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleResetLayout}
                className="border-l border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                title="Tata ulang jaring laba-laba"
                aria-label="Tata ulang jaring"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>

            {(project.hiddenNodeIds?.length ?? 0) > 0 ? (
              <button
                type="button"
                onClick={handleRestoreAllNodes}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 whitespace-nowrap shrink-0"
                title="Pulihkan entity yang dihapus dari canvas"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Pulihkan Entity ({project.hiddenNodeIds?.length})
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setShowDataDrawer((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <TableIcon className="h-3.5 w-3.5" />
              Tabel Data
              {showDataDrawer ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Ekspor CSV
            </button>

            <button
              type="button"
              onClick={() =>
                onRequestSavePerkara({
                  ...project,
                  viewState: getCurrentViewState(),
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-700 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 whitespace-nowrap shrink-0"
            >
              <Save className="h-3.5 w-3.5" />
              Simpan (SAVE / SAVE AS)
            </button>
          </div>
        ) : null}
      </div>

      {/* Error banner */}
      {uploadError ? (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2.5 text-xs font-medium text-red-700">
          Kesalahan Upload: {uploadError}
        </div>
      ) : null}

      {/* Main Content Area */}
      {!analysis ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const droppedFiles = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
            if (droppedFiles.length > 0) void processExcelFiles(droppedFiles, 'REPLACE');
          }}
          className="flex flex-1 items-center justify-center bg-white p-8"
        >
          <div
            className={`w-full max-w-3xl rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              isDragOver ? 'border-blue-600 bg-blue-50/40' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-blue-700">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">
              {project.name} — Unggah Data Excel CDR / Trace IMEI / Celldump
            </h2>
            <p className="mx-auto mt-1.5 max-w-xl text-sm text-slate-600">
              Tarik dan lepaskan 1 atau beberapa file <span className="font-mono text-xs">.xlsx / .xls / .csv</span> sekaligus di sini, atau klik tombol Upload File Excel untuk menggabungkan dan membentuk visualisasi jaring laba-laba.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  uploadModeRef.current = 'REPLACE';
                  fileInputRef.current?.click();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-800"
              >
                <Upload className="h-4 w-4" />
                Upload File Excel
              </button>
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6 text-left">
              <div className="text-xs font-semibold text-slate-800">
                Struktur Urutan Kolom Excel yang Didukung (22 Kolom)
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-slate-600 sm:grid-cols-4">
                <span>1. DATE</span>
                <span>2. TIME</span>
                <span>3. DURATION</span>
                <span>4. A NUMBER</span>
                <span>5. A IMEI</span>
                <span>6. A IMEI TYPE</span>
                <span>7. A IMSI</span>
                <span>8. A LAC/CID</span>
                <span>9. A SITENAME</span>
                <span>10. B NUMBER</span>
                <span>11. B IMEI</span>
                <span>12. B IMEI TYPE</span>
                <span>13. B IMSI</span>
                <span>14. B LAC/CID</span>
                <span>15. B SITENAME</span>
                <span>16. CALLTYPE</span>
                <span className="text-slate-400 line-through">17. DIRECTION (diabaikan)</span>
                <span className="text-slate-400 line-through">18. C NUMBER (diabaikan)</span>
                <span>19. A LAT</span>
                <span>20. A LONG</span>
                <span>21. B LAT</span>
                <span>22. B LONG</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative flex flex-1 overflow-hidden">
          {/* Interactive Infinite Spider-Web Viewport */}
          <div
            ref={svgContainerRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            className={`relative flex-1 overflow-hidden bg-white select-none ${
              isPanning ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            style={{
              touchAction: 'none',
              backgroundImage: 'radial-gradient(#cbd5e1 1.1px, transparent 1.1px)',
              backgroundPosition: `${pan.x}px ${pan.y}px`,
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            }}
          >
            {/* Transformed Unbounded Graph Layer (Infinite Canvas) */}
            <div
              className="absolute inset-0 origin-top-left overflow-visible"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              {/* Jalur Swimlane khusus mode Timeline */}
              {activeArrange === 'TIMELINE' ? (
                <div className="pointer-events-none absolute left-0 top-0 overflow-visible">
                  {[
                    { y: 140, label: 'Target Utama' },
                    { y: 310, label: 'Nomor Handphone (Kronologis)' },
                    { y: 480, label: 'Entity IMEI (Kronologis)' },
                    { y: 660, label: 'Entity LAC/CID (Kronologis)' },
                  ].map((lane) => (
                    <div
                      key={lane.label}
                      style={{ top: `${lane.y - 54}px`, left: '20px' }}
                      className="absolute whitespace-nowrap border-b border-dashed border-slate-200 pb-1 text-[11px] font-semibold text-slate-400"
                    >
                      {lane.label}
                    </div>
                  ))}
                </div>
              ) : null}

              {/* SVG Edges Layer (unbounded overflow-visible) */}
              <svg
                width="100%"
                height="100%"
                className="pointer-events-none absolute inset-0 z-0 overflow-visible"
              >
                <defs>
                  <marker
                    id="arrow-menghubungi"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#1d4ed8" />
                  </marker>
                  <marker
                    id="arrow-dihubungi"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#d97706" />
                  </marker>
                  <marker
                    id="arrow-comm"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
                  </marker>
                </defs>

                {visibleEdges.map((edge) => {
                  const src = nodeById.get(edge.source);
                  const dst = nodeById.get(edge.target);
                  if (!src || !dst) return null;

                  const x1 = src.x;
                  const y1 = src.y;
                  const x2 = dst.x;
                  const y2 = dst.y;

                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const dist = Math.hypot(dx, dy) || 1;
                  const ux = dx / dist;
                  const uy = dy / dist;

                  // Trim start & end so arrows stop cleanly outside card boundaries
                  const startPad = 48;
                  const endPad = 56;
                  const sx = x1 + ux * Math.min(startPad, dist * 0.3);
                  const sy = y1 + uy * Math.min(startPad, dist * 0.3);
                  const ex = x2 - ux * Math.min(endPad, dist * 0.3);
                  const ey = y2 - uy * Math.min(endPad, dist * 0.3);

                  const pairKey = [edge.source, edge.target].sort().join('||');
                  const isBidirectional = bidirectionalPairs.has(pairKey);

                  // Curve offset for bidirectional links
                  const nx = -uy;
                  const ny = ux;
                  const curveSign = edge.source < edge.target ? 1 : -1;
                  const curveAmount = isBidirectional ? 38 * curveSign : 0;
                  const cx = (sx + ex) / 2 + nx * curveAmount;
                  const cy = (sy + ey) / 2 + ny * curveAmount;

                  const pathD = isBidirectional
                    ? `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`
                    : `M ${sx} ${sy} L ${ex} ${ey}`;

                  const labelX = isBidirectional ? (sx + 2 * cx + ex) / 4 : (sx + ex) / 2;
                  const labelY = isBidirectional ? (sy + 2 * cy + ey) / 4 : (sy + ey) / 2;

                  const isSelected = selectedEdgeId === edge.id;
                  const isNodeHighlighted =
                    selectedNodeId === edge.source || selectedNodeId === edge.target;

                  let stroke = '#94a3b8';
                  let strokeDasharray: string | undefined = undefined;
                  let markerEnd: string | undefined = undefined;
                  let strokeWidth = isSelected ? 2.6 : 1.7;

                  if (edge.relation === 'TARGET_MENGHUBUNGI') {
                    stroke = '#1d4ed8';
                    markerEnd = 'url(#arrow-menghubungi)';
                    strokeWidth = isSelected ? 3 : 2.1;
                  } else if (edge.relation === 'TARGET_DIHUBUNGI') {
                    stroke = '#d97706';
                    markerEnd = 'url(#arrow-dihubungi)';
                    strokeWidth = isSelected ? 3 : 2.1;
                  } else if (edge.relation === 'COMMUNICATION') {
                    stroke = '#64748b';
                    markerEnd = 'url(#arrow-comm)';
                  } else if (edge.relation === 'USES_IMEI') {
                    stroke = '#0d9488';
                    strokeDasharray = '6 4';
                    strokeWidth = isSelected ? 2.4 : 1.5;
                  } else if (edge.relation === 'LOCATED_AT') {
                    stroke = '#4f46e5';
                    strokeDasharray = '2 4';
                    strokeWidth = isSelected ? 2.4 : 1.5;
                  }

                  const dimmed =
                    (selectedNodeId && !isNodeHighlighted && !isSelected) ||
                    (selectedEdgeId && !isSelected);

                  return (
                    <g
                      key={edge.id}
                      onPointerDown={(ev) => ev.stopPropagation()}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setSelectedEdgeId(edge.id);
                        setSelectedNodeId(null);
                      }}
                      className="pointer-events-auto cursor-pointer"
                      style={{ opacity: dimmed ? 0.22 : 1 }}
                    >
                      {/* Invisible wider hit area */}
                      <path d={pathD} fill="none" stroke="transparent" strokeWidth={14} />
                      <path
                        d={pathD}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDasharray}
                        markerEnd={markerEnd}
                      />
                      <g transform={`translate(${labelX}, ${labelY})`}>
                        <rect
                          x={-52}
                          y={-10}
                          width={104}
                          height={20}
                          rx={5}
                          fill="#ffffff"
                          stroke={isSelected ? stroke : '#e2e8f0'}
                          strokeWidth={1}
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={10}
                          fontWeight={600}
                          fill={
                            edge.relation === 'TARGET_MENGHUBUNGI'
                              ? '#1d4ed8'
                              : edge.relation === 'TARGET_DIHUBUNGI'
                                ? '#b45309'
                                : edge.relation === 'USES_IMEI'
                                  ? '#0f766e'
                                  : edge.relation === 'LOCATED_AT'
                                    ? '#4338ca'
                                    : '#475569'
                          }
                        >
                          {edge.label}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </svg>

              {/* HTML Entity Nodes Layer */}
              {positionedNodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isConnectedToSelected =
                  selectedNodeId &&
                  visibleEdges.some(
                    (e) =>
                      (e.source === selectedNodeId && e.target === node.id) ||
                      (e.target === selectedNodeId && e.source === node.id)
                  );
                const dimmed =
                  selectedNodeId && !isSelected && !isConnectedToSelected;

                let typeLabel = 'Nomor Handphone';
                let subLabelPrefix = 'IMSI';
                let borderAccent = 'border-slate-200';
                let headerBg = 'bg-slate-50';
                let iconEl = <Phone className="h-3.5 w-3.5 text-blue-700" />;

                if (node.type === 'PHONE' && node.isTarget) {
                  typeLabel = 'Target Utama';
                  subLabelPrefix = 'IMSI';
                  borderAccent = 'border-blue-600 ring-2 ring-blue-100';
                  headerBg = 'bg-blue-50';
                  iconEl = <Phone className="h-3.5 w-3.5 text-blue-700" />;
                } else if (node.type === 'IMEI') {
                  typeLabel = 'Entity IMEI';
                  subLabelPrefix = 'Tipe';
                  borderAccent = 'border-teal-200';
                  headerBg = 'bg-teal-50/60';
                  iconEl = <Smartphone className="h-3.5 w-3.5 text-teal-700" />;
                } else if (node.type === 'LAC_CID') {
                  typeLabel = 'Entity LAC/CID';
                  subLabelPrefix = 'Sitename';
                  borderAccent = 'border-indigo-200';
                  headerBg = 'bg-indigo-50/60';
                  iconEl = <Radio className="h-3.5 w-3.5 text-indigo-700" />;
                }

                const primarySub =
                  node.subData.length > 0
                    ? node.subData.length === 1
                      ? node.subData[0]
                      : `${node.subData[0]} (+${node.subData.length - 1})`
                    : 'Tidak tersedia';

                const primaryCoord =
                  node.type === 'LAC_CID' && node.coordinates.length > 0
                    ? node.coordinates[0]
                    : null;

                const cardHeight = node.type === 'LAC_CID' ? LAC_NODE_HEIGHT : NODE_HEIGHT;
                const isDraggingThis = draggingNodeId === node.id;

                const nodeCustom = project.entityCustomizations?.[node.id];
                const hasPhoto = Boolean(nodeCustom?.photoDataUrl);
                const extraInfoList = nodeCustom?.extraInfo ?? [];
                const hasInfo = extraInfoList.length > 0;
                const isEdited = Boolean(
                  nodeCustom?.label !== undefined ||
                    nodeCustom?.subData !== undefined ||
                    nodeCustom?.coordinates !== undefined
                );

                return (
                  <div
                    key={node.id}
                    onPointerDown={(e) => handleNodePointerDown(e, node)}
                    onPointerMove={(e) => handleNodePointerMove(e, node.id)}
                    onPointerUp={(e) => handleNodePointerUp(e, node.id)}
                    onPointerCancel={(e) => handleNodePointerUp(e, node.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                      setSelectedEdgeId(null);
                    }}
                    style={{
                      touchAction: 'none',
                      left: `${node.x - NODE_WIDTH / 2}px`,
                      top: `${node.y - cardHeight / 2}px`,
                      width: `${NODE_WIDTH}px`,
                      opacity: dimmed ? 0.35 : 1,
                    }}
                    className={`pointer-events-auto absolute z-10 overflow-hidden rounded-xl border bg-white shadow-xs transition-shadow hover:shadow-md ${
                      isDraggingThis ? 'z-20 cursor-grabbing shadow-lg' : 'cursor-grab'
                    } ${
                      isSelected
                        ? 'border-blue-700 ring-2 ring-blue-200 shadow-md'
                        : borderAccent
                    }`}
                  >
                    <div
                      className={`flex items-center justify-between border-b border-slate-100 px-3 py-1.5 ${headerBg}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {iconEl}
                        <span className="truncate text-[11px] font-semibold text-slate-700">
                          {typeLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {hasPhoto ? (
                          <span
                            title="Entity memiliki foto/gambar"
                            className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-100 text-emerald-700"
                          >
                            <Camera className="h-2.5 w-2.5" />
                          </span>
                        ) : null}
                        {hasInfo ? (
                          <span
                            title={`Entity memiliki ${extraInfoList.length} informasi tambahan`}
                            className="inline-flex h-4 items-center gap-0.5 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-800"
                          >
                            <FileText className="h-2.5 w-2.5" />
                            {extraInfoList.length}
                          </span>
                        ) : null}
                        {isEdited ? (
                          <span
                            title="Data entity telah diubah oleh user"
                            className="inline-flex h-4 w-4 items-center justify-center rounded bg-blue-100 text-blue-700"
                          >
                            <Pencil className="h-2.5 w-2.5" />
                          </span>
                        ) : null}
                        <span className="font-mono text-[10px] font-medium text-slate-500 tabular-nums">
                          {node.count}x
                        </span>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNode(node.id);
                          }}
                          title="Hapus entity dari canvas"
                          aria-label={`Hapus entity ${node.label}`}
                          className="rounded p-0.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <GripHorizontal className="h-3 w-3 text-slate-400" />
                      </div>
                    </div>

                    <div className="px-3 py-2">
                      <div className="flex items-start gap-2.5">
                        {hasPhoto ? (
                          <img
                            src={nodeCustom?.photoDataUrl}
                            alt={`Foto ${node.label}`}
                            className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover"
                          />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div
                            className="truncate font-mono text-xs font-bold text-slate-900 tabular-nums"
                            title={node.label}
                          >
                            {node.label}
                          </div>
                          <div
                            className="mt-0.5 truncate text-[11px] text-slate-500"
                            title={node.subData.join(', ')}
                          >
                            <span className="font-medium text-slate-600">{subLabelPrefix}:</span>{' '}
                            <span className="font-mono text-[10px]">{primarySub}</span>
                          </div>
                          {node.type === 'LAC_CID' ? (
                            <div
                              className="mt-0.5 truncate font-mono text-[10px] text-indigo-700 tabular-nums"
                              title={
                                node.coordinates.length > 0
                                  ? node.coordinates
                                      .map((c) => `LAT ${c.lat}, LONG ${c.long}`)
                                      .join(' | ')
                                  : 'Koordinat tidak tersedia'
                              }
                            >
                              {primaryCoord
                                ? `LAT: ${primaryCoord.lat} · LONG: ${primaryCoord.long}${
                                    node.coordinates.length > 1
                                      ? ` (+${node.coordinates.length - 1})`
                                      : ''
                                  }`
                                : 'LAT: - · LONG: -'}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {hasInfo ? (
                        <div
                          className="mt-1.5 flex items-center gap-1 border-t border-amber-100 bg-amber-50/70 -mx-3 -mb-2 px-3 py-1 text-[10px] text-amber-900"
                          title={extraInfoList
                            .map((i) => `${i.label}: ${i.value}`)
                            .join(' | ')}
                        >
                          <FileText className="h-2.5 w-2.5 shrink-0 text-amber-700" />
                          <span className="truncate font-medium">
                            {extraInfoList[0].label}: {extraInfoList[0].value}
                            {extraInfoList.length > 1
                              ? ` (+${extraInfoList.length - 1} info)`
                              : ''}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom-Left Legend */}
            <div className="pointer-events-none absolute bottom-4 left-4 z-30 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white/95 px-4 py-2 text-[11px] text-slate-700 shadow-xs backdrop-blur-xs">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 bg-blue-700" />
                <span className="font-medium">Target Menghubungi (A → B)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 bg-amber-600" />
                <span className="font-medium">Target Dihubungi (A → Target)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-teal-600" />
                <span className="font-medium">Kepemilikan IMEI</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-5 border-t-2 border-dotted border-indigo-600" />
                <span className="font-medium">Lokasi LAC/CID</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-100 text-emerald-700">
                  <Camera className="h-2.5 w-2.5" />
                </span>
                <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-amber-100 text-amber-800">
                  <FileText className="h-2.5 w-2.5" />
                </span>
                <span className="font-medium">Penanda Foto / Info Tambahan</span>
              </div>
            </div>
          </div>

          {/* Right Inspector Panel (hanya tampil saat Entity atau Relasi dipilih) */}
          {selectedNode || selectedEdge ? (
            <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-5 lg:w-96">
              {selectedNode ? (
              <div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleEntityPhotoSelected}
                  className="hidden"
                />

                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-xs font-semibold text-slate-500">
                    {selectedNode.type === 'PHONE'
                      ? selectedNode.isTarget
                        ? 'Entity Nomor Target Dominan'
                        : 'Entity Nomor Handphone'
                      : selectedNode.type === 'IMEI'
                        ? 'Entity IMEI Perangkat'
                        : 'Entity LAC/CID & BTS'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteNode(selectedNode.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      title="Hapus entity ini dari canvas"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedNodeId(null)}
                      className="text-xs font-medium text-slate-400 hover:text-slate-700"
                    >
                      Tutup
                    </button>
                  </div>
                </div>

                {/* Foto / Gambar Entity */}
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <Camera className="h-3.5 w-3.5 text-emerald-700" />
                      Foto / Gambar Entity
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-blue-600 hover:text-blue-700"
                      >
                        <ImagePlus className="h-3 w-3" />
                        {selectedNodeCustom?.photoDataUrl ? 'Ganti' : 'Unggah Foto'}
                      </button>
                      {selectedNodeCustom?.photoDataUrl ? (
                        <button
                          type="button"
                          onClick={handleRemoveEntityPhoto}
                          className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Hapus foto entity"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {selectedNodeCustom?.photoDataUrl ? (
                    <div className="mt-2.5">
                      <button
                        type="button"
                        onClick={() => setPreviewPhotoUrl(selectedNodeCustom.photoDataUrl || null)}
                        className="block w-full overflow-hidden rounded-lg border border-slate-200 bg-white"
                        title="Klik untuk perbesar foto"
                      >
                        <img
                          src={selectedNodeCustom.photoDataUrl}
                          alt={`Foto ${selectedNode.label}`}
                          className="h-36 w-full object-cover"
                        />
                      </button>
                      {selectedNodeCustom.photoName ? (
                        <div className="mt-1 truncate text-[10px] text-slate-500">
                          {selectedNodeCustom.photoName}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Belum ada foto. Unggah foto terduga, perangkat, atau lokasi BTS.
                    </p>
                  )}
                </div>

                {/* Data Utama & Sub-Data (dengan Mode Edit) */}
                {isEditingEntity ? (
                  <form
                    onSubmit={handleSaveEditEntity}
                    className="mt-3 space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-800">
                        Edit Data &amp; Sub-Data Entity
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditingEntity(false)}
                        className="text-xs text-slate-500 hover:text-slate-800"
                      >
                        Batal
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-700">
                        Data Utama Entity
                      </label>
                      <input
                        type="text"
                        required
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-700">
                        {selectedNode.type === 'PHONE'
                          ? 'Sub-Data (IMSI)'
                          : selectedNode.type === 'IMEI'
                            ? 'Sub-Data (IMEI Type)'
                            : 'Sub-Data (Sitename BTS)'}
                      </label>
                      <div className="mt-1 space-y-1.5">
                        {editSubData.map((sub, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={sub}
                              onChange={(e) => {
                                const next = [...editSubData];
                                next[idx] = e.target.value;
                                setEditSubData(next);
                              }}
                              className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setEditSubData((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Hapus baris sub-data"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newSubDataItem}
                          onChange={(e) => setNewSubDataItem(e.target.value)}
                          placeholder="Tambah sub-data baru..."
                          className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const v = newSubDataItem.trim();
                            if (!v) return;
                            setEditSubData((prev) => [...prev, v]);
                            setNewSubDataItem('');
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Plus className="h-3 w-3" />
                          Tambah
                        </button>
                      </div>
                    </div>

                    {selectedNode.type === 'LAC_CID' ? (
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] font-medium text-slate-700">
                            Koordinat BTS (LAT / LONG)
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setEditCoordinates((prev) => [
                                ...prev,
                                { lat: '', long: '', sitename: editLabel.trim() || '' },
                              ])
                            }
                            className="text-[11px] font-medium text-blue-700 hover:underline"
                          >
                            + Koordinat
                          </button>
                        </div>
                        <div className="mt-1 space-y-1.5">
                          {editCoordinates.map((pt, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="LAT"
                                value={pt.lat}
                                onChange={(e) => {
                                  const next = [...editCoordinates];
                                  next[idx] = { ...next[idx], lat: e.target.value };
                                  setEditCoordinates(next);
                                }}
                                className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-[11px]"
                              />
                              <input
                                type="text"
                                placeholder="LONG"
                                value={pt.long}
                                onChange={(e) => {
                                  const next = [...editCoordinates];
                                  next[idx] = { ...next[idx], long: e.target.value };
                                  setEditCoordinates(next);
                                }}
                                className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-[11px]"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setEditCoordinates((prev) =>
                                    prev.filter((_, i) => i !== idx)
                                  )
                                }
                                className="rounded p-1 text-slate-400 hover:text-red-600"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between pt-1">
                      {selectedNodeCustom?.label !== undefined ||
                      selectedNodeCustom?.subData !== undefined ||
                      selectedNodeCustom?.coordinates !== undefined ? (
                        <button
                          type="button"
                          onClick={handleResetEntityData}
                          className="text-[11px] font-medium text-amber-700 hover:underline"
                        >
                          Reset Data Asli
                        </button>
                      ) : (
                        <span />
                      )}
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Simpan Perubahan
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-mono text-base font-bold text-slate-900 break-all tabular-nums">
                        {selectedNode.label}
                      </div>
                      <button
                        type="button"
                        onClick={handleStartEditEntity}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-blue-600 hover:text-blue-700 shrink-0"
                        title="Edit data utama dan sub-data entity"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit Data
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub-data sesuai jenis Entity */}
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-700">
                      {selectedNode.type === 'PHONE'
                        ? 'Sub-Data IMSI Terkait'
                        : selectedNode.type === 'IMEI'
                          ? 'Sub-Data IMEI Type'
                          : 'Sub-Data Sitename BTS'}
                    </div>
                    {selectedNode.subData.length > 0 ? (
                      <ul className="mt-1.5 space-y-1">
                        {selectedNode.subData.map((sub, idx) => (
                          <li
                            key={`${sub}-${idx}`}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-800"
                          >
                            {sub}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">Tidak ada sub-data tercatat.</p>
                    )}
                  </div>

                  {/* Informasi Tambahan oleh User */}
                  <div className="border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <FileText className="h-3.5 w-3.5 text-amber-700" />
                      Informasi Tambahan ({selectedNodeCustom?.extraInfo?.length ?? 0})
                    </div>

                    {(selectedNodeCustom?.extraInfo?.length ?? 0) > 0 ? (
                      <div className="mt-2 space-y-1.5">
                        {selectedNodeCustom!.extraInfo!.map((info) =>
                          editingInfoId === info.id ? (
                            <div
                              key={info.id}
                              className="space-y-1.5 rounded-lg border border-blue-200 bg-blue-50/40 p-2"
                            >
                              <input
                                type="text"
                                value={editingInfoLabel}
                                onChange={(e) => setEditingInfoLabel(e.target.value)}
                                placeholder="Label informasi"
                                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium"
                              />
                              <textarea
                                rows={2}
                                value={editingInfoValue}
                                onChange={(e) => setEditingInfoValue(e.target.value)}
                                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                              />
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setEditingInfoId(null)}
                                  className="px-2 py-1 text-[11px] text-slate-500"
                                >
                                  Batal
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditedInfo(info.id)}
                                  className="rounded bg-blue-700 px-2.5 py-1 text-[11px] font-semibold text-white"
                                >
                                  Simpan
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              key={info.id}
                              className="rounded-lg border border-amber-200/70 bg-amber-50/40 px-2.5 py-2 text-xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-[11px] font-semibold text-amber-900">
                                    {info.label}
                                  </div>
                                  <div className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-800">
                                    {info.value}
                                  </div>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingInfoId(info.id);
                                      setEditingInfoLabel(info.label);
                                      setEditingInfoValue(info.value);
                                    }}
                                    className="rounded p-1 text-slate-400 hover:bg-white hover:text-blue-700"
                                    title="Edit informasi"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteExtraInfo(info.id)}
                                    className="rounded p-1 text-slate-400 hover:bg-white hover:text-red-600"
                                    title="Hapus informasi"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    ) : null}

                    <form onSubmit={handleAddExtraInfo} className="mt-2 space-y-1.5">
                      <input
                        type="text"
                        value={newInfoLabel}
                        onChange={(e) => setNewInfoLabel(e.target.value)}
                        placeholder="Judul info (misal: Nama, Alamat, NIK)"
                        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                      />
                      <textarea
                        rows={2}
                        value={newInfoValue}
                        onChange={(e) => setNewInfoValue(e.target.value)}
                        placeholder="Tambahkan keterangan atau informasi terkait entity ini..."
                        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!newInfoValue.trim()}
                        className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Tambah Informasi Entity
                      </button>
                    </form>
                  </div>

                  {selectedNode.type === 'PHONE' ? (
                    <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                      <div className="rounded-lg border border-slate-200 p-2.5">
                        <div className="text-[11px] text-slate-500">Total</div>
                        <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                          {selectedNode.count}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-2.5">
                        <div className="text-[11px] text-slate-500">Sebagai A</div>
                        <div className="font-mono text-sm font-bold text-blue-700 tabular-nums">
                          {selectedNode.asACount}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-2.5">
                        <div className="text-[11px] text-slate-500">Sebagai B</div>
                        <div className="font-mono text-sm font-bold text-amber-700 tabular-nums">
                          {selectedNode.asBCount}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {selectedNode.type === 'LAC_CID' && selectedNode.coordinates.length > 0 ? (
                    <div className="border-t border-slate-100 pt-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <MapPin className="h-3.5 w-3.5 text-indigo-600" />
                        Koordinat BTS (LAT / LONG)
                      </div>
                      <div className="mt-1.5 space-y-1.5">
                        {selectedNode.coordinates.map((pt, idx) => (
                          <div
                            key={`${pt.lat}-${pt.long}-${idx}`}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs"
                          >
                            <div className="font-medium text-slate-800">{pt.sitename}</div>
                            <div className="mt-0.5 font-mono text-[11px] text-slate-600 tabular-nums">
                              Lat: {pt.lat} · Long: {pt.long}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Catatan Panggilan Terkait */}
                  <div className="border-t border-slate-100 pt-3">
                    <div className="text-xs font-semibold text-slate-700">
                      Riwayat Aktivitas ({selectedRelatedRecords.length} baris)
                    </div>
                    <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                      {selectedRelatedRecords.map((rec) => (
                        <div
                          key={rec.id}
                          className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span className="font-mono tabular-nums">
                              {rec.date} {rec.time}
                            </span>
                            <span className="font-semibold text-slate-700">
                              {rec.callType} · {formatDuration(rec.durationSeconds)}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 font-medium">
                            {rec.interactionLabel === 'Target Menghubungi' ? (
                              <ArrowUpRight className="h-3.5 w-3.5 text-blue-700" />
                            ) : (
                              <ArrowDownLeft className="h-3.5 w-3.5 text-amber-600" />
                            )}
                            <span
                              className={
                                rec.interactionLabel === 'Target Menghubungi'
                                  ? 'text-blue-700'
                                  : rec.interactionLabel === 'Target Dihubungi'
                                    ? 'text-amber-700'
                                    : 'text-slate-700'
                              }
                            >
                              {rec.interactionLabel}
                            </span>
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-slate-700">
                            {rec.aNumber} → {rec.bNumber}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : selectedEdge ? (
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-xs font-semibold text-slate-500">Detail Relasi Jaringan</span>
                  <button
                    type="button"
                    onClick={() => setSelectedEdgeId(null)}
                    className="text-xs font-medium text-slate-400 hover:text-slate-700"
                  >
                    Tutup
                  </button>
                </div>

                <div className="mt-3 text-sm font-bold text-slate-900">{selectedEdge.label}</div>
                <div className="mt-1 font-mono text-xs text-slate-600">
                  {selectedEdge.source.replace(/^(PHONE|IMEI|LAC):/, '')} →{' '}
                  {selectedEdge.target.replace(/^(PHONE|IMEI|LAC):/, '')}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <div className="text-[11px] text-slate-500">Frekuensi</div>
                    <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                      {selectedEdge.callCount}x
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <div className="text-[11px] text-slate-500">Total Durasi</div>
                    <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                      {formatDuration(selectedEdge.totalDurationSeconds)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3">
                  <div className="text-xs font-semibold text-slate-700">
                    Catatan Komunikasi Terkait ({selectedRelatedRecords.length})
                  </div>
                  <div className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1">
                    {selectedRelatedRecords.map((rec) => (
                      <div
                        key={rec.id}
                        className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between font-mono text-[11px] text-slate-500 tabular-nums">
                          <span>
                            {rec.date} {rec.time}
                          </span>
                          <span>{formatDuration(rec.durationSeconds)}</span>
                        </div>
                        <div className="mt-1 font-medium text-slate-800">
                          {rec.callType} · {rec.interactionLabel}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-600">
                          A BTS: {rec.aSitename || rec.aLacCid || '-'}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          B BTS: {rec.bSitename || rec.bLacCid || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            </aside>
          ) : null}
        </div>
      )}

      {/* Collapsible Bottom Data Drawer */}
      {analysis && showDataDrawer ? (
        <div className="h-72 shrink-0 border-t border-slate-200 bg-white flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-2">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'CDR', label: `Log CDR (${analysis.records.length})` },
                  {
                    id: 'PHONE',
                    label: `Entity Nomor HP (${analysis.summary.uniquePhones})`,
                  },
                  { id: 'IMEI', label: `Entity IMEI (${analysis.summary.uniqueImeis})` },
                  {
                    id: 'LAC_CID',
                    label: `Entity LAC/CID (${analysis.summary.uniqueLacCids})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDrawerTab(tab.id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    drawerTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowDataDrawer(false)}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              <Maximize2 className="h-3 w-3" />
              Sembunyikan Tabel
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            {drawerTab === 'CDR' ? (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2">DATE</th>
                    <th className="px-3 py-2">TIME</th>
                    <th className="px-3 py-2">DURATION</th>
                    <th className="px-3 py-2">HASIL ANALISA</th>
                    <th className="px-3 py-2">A NUMBER</th>
                    <th className="px-3 py-2">A IMSI</th>
                    <th className="px-3 py-2">A IMEI (TYPE)</th>
                    <th className="px-3 py-2">A LAC/CID (SITENAME)</th>
                    <th className="px-3 py-2">B NUMBER</th>
                    <th className="px-3 py-2">B IMSI</th>
                    <th className="px-3 py-2">B IMEI (TYPE)</th>
                    <th className="px-3 py-2">B LAC/CID (SITENAME)</th>
                    <th className="px-3 py-2">CALLTYPE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analysis.records.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">
                        {r.date}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">
                        {r.time}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">
                        {formatDuration(r.durationSeconds)}
                      </td>
                      <td
                        className={`px-3 py-2 font-semibold whitespace-nowrap ${
                          r.interactionLabel === 'Target Menghubungi'
                            ? 'text-blue-700'
                            : r.interactionLabel === 'Target Dihubungi'
                              ? 'text-amber-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {r.interactionLabel}
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {r.aNumber}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {r.aImsi || '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono text-slate-800">{r.aImei || '-'}</span>
                        {r.aImeiType ? (
                          <span className="ml-1 text-slate-500">({r.aImeiType})</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono text-slate-800">{r.aLacCid || '-'}</span>
                        {r.aSitename ? (
                          <span className="ml-1 text-slate-500">({r.aSitename})</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {r.bNumber}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {r.bImsi || '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono text-slate-800">{r.bImei || '-'}</span>
                        {r.bImeiType ? (
                          <span className="ml-1 text-slate-500">({r.bImeiType})</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono text-slate-800">{r.bLacCid || '-'}</span>
                        {r.bSitename ? (
                          <span className="ml-1 text-slate-500">({r.bSitename})</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">
                        {r.callType}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-2">Nilai Utama Entity</th>
                    <th className="px-4 py-2">
                      {drawerTab === 'PHONE'
                        ? 'Sub-Data (A/B IMSI)'
                        : drawerTab === 'IMEI'
                          ? 'Sub-Data (A/B IMEI TYPE)'
                          : 'Sub-Data (A/B SITENAME)'}
                    </th>
                    {drawerTab === 'LAC_CID' ? (
                      <th className="px-4 py-2">Sub-Data (A/B LAT &amp; A/B LONG)</th>
                    ) : null}
                    <th className="px-4 py-2 text-right">Frekuensi</th>
                    <th className="px-4 py-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analysis.nodes
                    .filter((n) => n.type === drawerTab)
                    .map((n) => {
                      const custom = project.entityCustomizations?.[n.id];
                      return {
                        ...n,
                        label: custom?.label !== undefined ? custom.label : n.label,
                        subData: custom?.subData !== undefined ? custom.subData : n.subData,
                        coordinates:
                          custom?.coordinates !== undefined ? custom.coordinates : n.coordinates,
                      };
                    })
                    .sort((a, b) => b.count - a.count)
                    .map((n) => (
                      <tr key={n.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono font-semibold text-slate-900 tabular-nums">
                          {n.label}
                          {n.isTarget ? (
                            <span className="ml-2 font-sans text-[11px] font-bold text-blue-700">
                              [TARGET UTAMA]
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 font-mono text-slate-600">
                          {n.subData.length > 0 ? n.subData.join(', ') : '-'}
                        </td>
                        {drawerTab === 'LAC_CID' ? (
                          <td className="px-4 py-2 font-mono text-indigo-700 tabular-nums">
                            {n.coordinates.length > 0
                              ? n.coordinates.map((c) => `${c.lat}, ${c.long}`).join(' · ')
                              : '-'}
                          </td>
                        ) : null}
                        <td className="px-4 py-2 text-right font-mono tabular-nums">{n.count}x</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedNodeId(n.id);
                              setSelectedEdgeId(null);
                            }}
                            className="text-xs font-medium text-blue-700 hover:underline"
                          >
                            Fokus di Canvas
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      {/* Modal Preview Foto Entity */}
      {previewPhotoUrl ? (
        <div
          onClick={() => setPreviewPhotoUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-6 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[85vh] max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setPreviewPhotoUrl(null)}
              className="absolute right-3 top-3 rounded-lg bg-white/90 p-1.5 text-slate-700 shadow-xs hover:bg-white"
              aria-label="Tutup preview foto"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={previewPhotoUrl}
              alt="Preview Foto Entity"
              className="max-h-[78vh] w-auto rounded-lg object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};
