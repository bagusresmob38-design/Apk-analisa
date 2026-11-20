import { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type {
  CanvasProject,
  EntityCustomization,
  EntityExtraInfo,
  PerkaraAnalysisItem,
  PerkaraFolder,
  PerkaraRecord,
} from './types/cdr';
import { analyzeCdrRecords, mergeCdrRecordSets } from './utils/cdrAnalyzer';
import { computeArrangeLayout } from './utils/graphLayouts';
import { SpiderWebCanvas } from './components/SpiderWebCanvas';
import { DataPerkaraView } from './components/DataPerkaraView';
import { SavePerkaraModal, type SavePerkaraPayload } from './components/SavePerkaraModal';

const STORAGE_KEY_PERKARA_FOLDERS = 'cdr_web_data_perkara_folders_v2';
const LEGACY_STORAGE_KEY_PERKARA = 'cdr_web_data_perkara_v1';

type ActiveSection = 'DATA_PERKARA' | 'CANVAS';

function formatCurrentTimestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
}

function loadInitialFolders(): PerkaraFolder[] {
  try {
    const savedV2 = localStorage.getItem(STORAGE_KEY_PERKARA_FOLDERS);
    if (savedV2) {
      const parsed = JSON.parse(savedV2) as PerkaraFolder[];
      if (Array.isArray(parsed)) return parsed;
    }

    // Migrasi otomatis data v1 (flat PerkaraRecord[]) menjadi struktur folder
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY_PERKARA);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw) as PerkaraRecord[];
      if (Array.isArray(legacyParsed) && legacyParsed.length > 0) {
        const folderMap = new Map<string, PerkaraFolder>();
        legacyParsed.forEach((rec) => {
          const key = `${rec.nomorPerkara}||${rec.judulPerkara}`;
          const item: PerkaraAnalysisItem = {
            id: `item-${rec.id}`,
            jenisAnalisa: rec.jenisAnalisa,
            canvasName: 'canvas 1',
            fileName: rec.fileName,
            catatan: rec.catatan,
            targetNumber: rec.targetNumber,
            totalRecords: rec.totalRecords,
            totalEntities: rec.totalEntities,
            savedAt: rec.savedAt,
            records: rec.records,
          };
          const existing = folderMap.get(key);
          if (existing) {
            existing.items.push(item);
            existing.updatedAt = rec.savedAt;
          } else {
            folderMap.set(key, {
              id: rec.id,
              nomorPerkara: rec.nomorPerkara,
              judulPerkara: rec.judulPerkara,
              catatan: rec.catatan,
              createdAt: rec.savedAt,
              updatedAt: rec.savedAt,
              items: [item],
            });
          }
        });
        return Array.from(folderMap.values());
      }
    }
  } catch {
    // Abaikan error parsing storage
  }
  return [];
}

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('DATA_PERKARA');
  const [canvases, setCanvases] = useState<CanvasProject[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [nextCanvasNumber, setNextCanvasNumber] = useState<number>(1);

  const [perkaraFolders, setPerkaraFolders] = useState<PerkaraFolder[]>(loadInitialFolders);
  const [savingCanvasProject, setSavingCanvasProject] = useState<CanvasProject | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PERKARA_FOLDERS, JSON.stringify(perkaraFolders));
    } catch {
      // Abaikan quota storage error
    }
  }, [perkaraFolders]);

  useEffect(() => {
    if (!saveNotice) return;
    const timer = window.setTimeout(() => setSaveNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

  const handleCreateProject = (linkedPerkaraId?: string) => {
    const num = nextCanvasNumber;
    const newCanvas: CanvasProject = {
      id: `canvas-${Date.now()}-${num}`,
      name: `canvas ${num}`,
      analysis: null,
      createdAt: new Date().toISOString(),
      nodePositions: {},
      entityCustomizations: {},
      linkedPerkaraId,
    };
    setCanvases((prev) => [...prev, newCanvas]);
    setActiveCanvasId(newCanvas.id);
    setActiveSection('CANVAS');
    setNextCanvasNumber((n) => n + 1);
  };

  const handleUpdateCanvas = (updated: CanvasProject) => {
    setCanvases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleCloseCanvas = (canvasId: string) => {
    setCanvases((prev) => {
      const remaining = prev.filter((c) => c.id !== canvasId);
      if (activeCanvasId === canvasId) {
        if (remaining.length > 0) {
          setActiveCanvasId(remaining[remaining.length - 1].id);
        } else {
          setActiveCanvasId(null);
          setActiveSection('DATA_PERKARA');
        }
      }
      return remaining;
    });
  };

  const handleOpenItemInCanvas = (folder: PerkaraFolder, item: PerkaraAnalysisItem) => {
    const analysis = analyzeCdrRecords(item.records);
    const nodePositions: Record<string, { x: number; y: number }> = {};
    analysis.nodes.forEach((n) => {
      nodePositions[n.id] = item.nodePositions?.[n.id] ?? { x: n.x, y: n.y };
    });

    const num = nextCanvasNumber;
    const newCanvas: CanvasProject = {
      id: `canvas-${Date.now()}-${num}`,
      name: item.canvasName || `canvas ${num}`,
      fileName: item.fileName,
      sourceFiles:
        item.sourceFiles && item.sourceFiles.length > 0
          ? item.sourceFiles
          : item.fileName
            ? [item.fileName]
            : undefined,
      analysis,
      createdAt: new Date().toISOString(),
      nodePositions,
      hiddenNodeIds: item.hiddenNodeIds ?? [],
      entityCustomizations: item.entityCustomizations ?? {},
      viewState: item.viewState,
      linkedPerkaraId: folder.id,
      linkedItemId: item.id,
    };
    setCanvases((prev) => [...prev, newCanvas]);
    setActiveCanvasId(newCanvas.id);
    setActiveSection('CANVAS');
    setNextCanvasNumber((n) => n + 1);
  };

  const handleMergeItemsInCanvas = (folder: PerkaraFolder, items: PerkaraAnalysisItem[]) => {
    if (items.length === 0) return;

    const recordSets = items.map((item) =>
      item.records.map((rec) => ({
        ...rec,
        sourceFile: rec.sourceFile || item.fileName,
      }))
    );

    const mergedRecords = mergeCdrRecordSets(recordSets);
    const analysis = analyzeCdrRecords(mergedRecords);
    const nodePositions = computeArrangeLayout('PEACOCK', analysis);

    // Gabungkan entityCustomizations (informasi tambahan, foto, edit label/subData) dari file-file terpilih
    const mergedCustomizations: Record<string, EntityCustomization> = {};
    items.forEach((item) => {
      if (!item.entityCustomizations) return;
      Object.entries(item.entityCustomizations).forEach(([nodeId, cust]) => {
        const existing = mergedCustomizations[nodeId];
        if (!existing) {
          mergedCustomizations[nodeId] = {
            ...cust,
            subData: cust.subData ? [...cust.subData] : undefined,
            coordinates: cust.coordinates ? [...cust.coordinates] : undefined,
            extraInfo: cust.extraInfo ? [...cust.extraInfo] : undefined,
          };
          return;
        }

        const existingInfo = existing.extraInfo ?? [];
        const incomingInfo = cust.extraInfo ?? [];
        const infoMap = new Map<string, EntityExtraInfo>();
        existingInfo.forEach((info) => infoMap.set(info.id, info));
        incomingInfo.forEach((info) => {
          if (!infoMap.has(info.id)) {
            infoMap.set(info.id, info);
          }
        });

        mergedCustomizations[nodeId] = {
          label: cust.label ?? existing.label,
          subData: cust.subData ?? existing.subData,
          coordinates: cust.coordinates ?? existing.coordinates,
          photoDataUrl: cust.photoDataUrl ?? existing.photoDataUrl,
          photoName: cust.photoName ?? existing.photoName,
          extraInfo: infoMap.size > 0 ? Array.from(infoMap.values()) : undefined,
        };
      });
    });

    const sourceFileSet = new Set<string>();
    items.forEach((item) => {
      if (item.sourceFiles && item.sourceFiles.length > 0) {
        item.sourceFiles.forEach((sf) => sourceFileSet.add(sf));
      } else if (item.fileName) {
        sourceFileSet.add(item.fileName);
      }
    });
    const combinedSourceFiles = Array.from(sourceFileSet);

    const num = nextCanvasNumber;
    const newCanvas: CanvasProject = {
      id: `canvas-${Date.now()}-${num}`,
      name: `canvas ${num}`,
      fileName:
        combinedSourceFiles.length > 1
          ? `${combinedSourceFiles[0]} (+${combinedSourceFiles.length - 1} file)`
          : combinedSourceFiles[0] || `gabungan-${items.length}-file.xlsx`,
      sourceFiles: combinedSourceFiles,
      analysis,
      createdAt: new Date().toISOString(),
      nodePositions,
      hiddenNodeIds: [],
      entityCustomizations: mergedCustomizations,
      linkedPerkaraId: folder.id,
      linkedItemId: undefined,
    };

    setCanvases((prev) => [...prev, newCanvas]);
    setActiveCanvasId(newCanvas.id);
    setActiveSection('CANVAS');
    setNextCanvasNumber((n) => n + 1);
  };

  const handleSavePerkara = (payload: SavePerkaraPayload) => {
    if (!savingCanvasProject || !savingCanvasProject.analysis) return;
    const analysis = savingCanvasProject.analysis;
    const formattedTime = formatCurrentTimestamp();

    const itemId =
      payload.saveAction === 'SAVE' && payload.updateExistingItemId
        ? payload.updateExistingItemId
        : `item-${Date.now()}`;

    const resolvedFileName =
      payload.fileName || savingCanvasProject.fileName || `${savingCanvasProject.name}.xlsx`;

    const resolvedSourceFiles =
      savingCanvasProject.sourceFiles && savingCanvasProject.sourceFiles.length > 0
        ? savingCanvasProject.sourceFiles
        : [resolvedFileName];

    const newItem: PerkaraAnalysisItem = {
      id: itemId,
      jenisAnalisa: payload.jenisAnalisa,
      canvasName: savingCanvasProject.name,
      fileName: resolvedFileName,
      sourceFiles: resolvedSourceFiles,
      catatan: payload.catatan,
      targetNumber: analysis.summary.targetNumber,
      totalRecords: analysis.summary.totalRecords,
      totalEntities: analysis.nodes.length,
      savedAt: formattedTime,
      records: analysis.records,
      nodePositions: savingCanvasProject.nodePositions,
      hiddenNodeIds: savingCanvasProject.hiddenNodeIds,
      entityCustomizations: savingCanvasProject.entityCustomizations,
      viewState: savingCanvasProject.viewState,
    };

    let targetFolderId = payload.targetFolderId;

    if (payload.folderDestination === 'NEW_FOLDER') {
      const newFolderId = `folder-${Date.now()}`;
      targetFolderId = newFolderId;
      const newFolder: PerkaraFolder = {
        id: newFolderId,
        nomorPerkara: payload.nomorPerkara,
        judulPerkara: payload.judulPerkara,
        catatan: payload.catatan,
        createdAt: formattedTime,
        updatedAt: formattedTime,
        items: [newItem],
      };
      setPerkaraFolders((prev) => [newFolder, ...prev]);
    } else if (targetFolderId) {
      setPerkaraFolders((prev) =>
        prev.map((folder) => {
          if (folder.id !== targetFolderId) return folder;
          const exists = folder.items.some((it) => it.id === itemId);
          const updatedItems = exists
            ? folder.items.map((it) => (it.id === itemId ? newItem : it))
            : [newItem, ...folder.items];
          return {
            ...folder,
            updatedAt: formattedTime,
            items: updatedItems,
          };
        })
      );
    }

    // Kaitkan canvas dengan folder, item, fileName, & viewState terbaru
    if (targetFolderId) {
      setCanvases((prev) =>
        prev.map((c) =>
          c.id === savingCanvasProject.id
            ? {
                ...c,
                fileName: resolvedFileName,
                viewState: savingCanvasProject.viewState,
                linkedPerkaraId: targetFolderId,
                linkedItemId: itemId,
              }
            : c
        )
      );
    }

    setSaveNotice(
      payload.saveAction === 'SAVE'
        ? `Berhasil di-SAVE ke ${payload.nomorPerkara} (${resolvedFileName})`
        : `Berhasil di-SAVE AS sebagai file baru "${resolvedFileName}" di ${payload.nomorPerkara}`
    );
    setSavingCanvasProject(null);
  };

  const handleDeleteFolder = (folderId: string) => {
    setPerkaraFolders((prev) => prev.filter((folder) => folder.id !== folderId));
  };

  const handleDeleteItemFromFolder = (folderId: string, itemId: string) => {
    const formattedTime = formatCurrentTimestamp();
    setPerkaraFolders((prev) =>
      prev.map((folder) => {
        if (folder.id !== folderId) return folder;
        return {
          ...folder,
          updatedAt: formattedTime,
          items: folder.items.filter((item) => item.id !== itemId),
        };
      })
    );
  };

  const activeCanvas = canvases.find((c) => c.id === activeCanvasId) || null;

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-8 px-6">
          {/* Brand Zone */}
          <button
            type="button"
            onClick={() => setActiveSection('DATA_PERKARA')}
            className="text-left text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Analisa CDR &amp; Jaringan
          </button>

          {/* Primary Header Tabs: BUAT PROJECT & DATA PERKARA */}
          <nav className="flex items-center gap-6" aria-label="Navigasi Utama">
            <button
              type="button"
              onClick={() => handleCreateProject()}
              className={`inline-flex items-center gap-1.5 border-b-2 py-4 text-xs font-bold tracking-wide transition-colors whitespace-nowrap shrink-0 ${
                activeSection === 'CANVAS'
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-700 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              BUAT PROJECT
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('DATA_PERKARA')}
              className={`inline-flex items-center border-b-2 py-4 text-xs font-bold tracking-wide transition-colors whitespace-nowrap shrink-0 ${
                activeSection === 'DATA_PERKARA'
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-700 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              DATA PERKARA
            </button>
          </nav>

          {/* Right Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => handleCreateProject()}
              className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              + Canvas Baru
            </button>
          </div>
        </div>

        {/* Workspace Canvas Tabs Strip (canvas 1, canvas 2, ...) */}
        {canvases.length > 0 ? (
          <div className="border-t border-slate-100 bg-slate-50/70 px-6">
            <div className="mx-auto flex max-w-[1600px] items-center gap-1.5 overflow-x-auto py-1.5">
              {canvases.map((canvas) => {
                const isSelected = activeSection === 'CANVAS' && activeCanvasId === canvas.id;
                const linkedFolder = canvas.linkedPerkaraId
                  ? perkaraFolders.find((f) => f.id === canvas.linkedPerkaraId)
                  : undefined;

                return (
                  <div
                    key={canvas.id}
                    className={`group inline-flex items-center rounded-lg border text-xs transition-colors shrink-0 ${
                      isSelected
                        ? 'border-blue-600 bg-white font-semibold text-blue-700 shadow-xs'
                        : 'border-slate-200 bg-white/70 font-medium text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCanvasId(canvas.id);
                        setActiveSection('CANVAS');
                      }}
                      className="px-3 py-1.5 whitespace-nowrap"
                    >
                      {canvas.name}
                      {linkedFolder ? (
                        <span className="ml-1.5 font-mono text-[10px] text-amber-700">
                          [{linkedFolder.nomorPerkara}]
                        </span>
                      ) : canvas.analysis ? (
                        <span className="ml-1.5 font-mono text-[10px] text-slate-400">
                          ({canvas.analysis.summary.targetNumber})
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCloseCanvas(canvas.id)}
                      className="mr-1 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={`Tutup ${canvas.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </header>

      {/* Main Content */}
      <main className="relative flex-1 bg-white">
        {saveNotice ? (
          <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-xs font-medium text-slate-800 shadow-lg">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="h-3.5 w-3.5" />
            </span>
            <span>{saveNotice}</span>
            <button
              type="button"
              onClick={() => {
                setActiveSection('DATA_PERKARA');
                setSaveNotice(null);
              }}
              className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
            >
              Lihat Folder
            </button>
            <button
              type="button"
              onClick={() => setSaveNotice(null)}
              className="text-slate-400 hover:text-slate-700"
              aria-label="Tutup notifikasi"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {activeSection === 'CANVAS' && activeCanvas ? (
          <SpiderWebCanvas
            key={activeCanvas.id}
            project={activeCanvas}
            onUpdateProject={handleUpdateCanvas}
            onRequestSavePerkara={(proj) => setSavingCanvasProject(proj)}
          />
        ) : (
          <DataPerkaraView
            folders={perkaraFolders}
            onOpenItemInCanvas={handleOpenItemInCanvas}
            onMergeItemsInCanvas={handleMergeItemsInCanvas}
            onCreateCanvasInFolder={(folder) => handleCreateProject(folder.id)}
            onDeleteFolder={handleDeleteFolder}
            onDeleteItemFromFolder={handleDeleteItemFromFolder}
            onCreateNewProject={() => handleCreateProject()}
          />
        )}
      </main>

      <SavePerkaraModal
        isOpen={Boolean(savingCanvasProject)}
        onClose={() => setSavingCanvasProject(null)}
        defaultTarget={savingCanvasProject?.analysis?.summary.targetNumber ?? ''}
        defaultFileName={savingCanvasProject?.fileName ?? ''}
        existingFolders={perkaraFolders}
        defaultLinkedFolderId={savingCanvasProject?.linkedPerkaraId}
        defaultLinkedItemId={savingCanvasProject?.linkedItemId}
        onSave={handleSavePerkara}
      />
    </div>
  );
}
