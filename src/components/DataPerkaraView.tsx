import React, { useEffect, useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Layers,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { AnalisaCategory, PerkaraAnalysisItem, PerkaraFolder } from '../types/cdr';

interface DataPerkaraViewProps {
  folders: PerkaraFolder[];
  onOpenItemInCanvas: (folder: PerkaraFolder, item: PerkaraAnalysisItem) => void;
  onMergeItemsInCanvas: (folder: PerkaraFolder, items: PerkaraAnalysisItem[]) => void;
  onCreateCanvasInFolder: (folder: PerkaraFolder) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteItemFromFolder: (folderId: string, itemId: string) => void;
  onCreateNewProject: () => void;
}

export const DataPerkaraView: React.FC<DataPerkaraViewProps> = ({
  folders,
  onOpenItemInCanvas,
  onMergeItemsInCanvas,
  onCreateCanvasInFolder,
  onDeleteFolder,
  onDeleteItemFromFolder,
  onCreateNewProject,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | AnalisaCategory>('ALL');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(folders[0]?.id ?? null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const filteredFolders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return folders.filter((folder) => {
      if (categoryFilter !== 'ALL') {
        const hasCat = folder.items.some((item) => item.jenisAnalisa === categoryFilter);
        if (!hasCat) return false;
      }
      if (!q) return true;
      const matchFolder =
        folder.nomorPerkara.toLowerCase().includes(q) ||
        folder.judulPerkara.toLowerCase().includes(q) ||
        folder.catatan.toLowerCase().includes(q);
      const matchItems = folder.items.some(
        (item) =>
          item.fileName.toLowerCase().includes(q) ||
          item.canvasName.toLowerCase().includes(q) ||
          item.jenisAnalisa.toLowerCase().includes(q) ||
          item.catatan.toLowerCase().includes(q)
      );
      return matchFolder || matchItems;
    });
  }, [folders, categoryFilter, searchQuery]);

  const selectedFolder = useMemo(
    () =>
      filteredFolders.find((f) => f.id === selectedFolderId) || filteredFolders[0] || null,
    [filteredFolders, selectedFolderId]
  );

  useEffect(() => {
    setSelectedItemIds([]);
  }, [selectedFolder?.id]);

  const checkedItemsInSelectedFolder = useMemo(() => {
    if (!selectedFolder) return [];
    const idSet = new Set(selectedItemIds);
    return selectedFolder.items.filter((it) => idSet.has(it.id));
  }, [selectedFolder, selectedItemIds]);

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleToggleSelectAll = () => {
    if (!selectedFolder) return;
    if (checkedItemsInSelectedFolder.length === selectedFolder.items.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(selectedFolder.items.map((it) => it.id));
    }
  };

  const totalFilesTersimpan = useMemo(
    () => folders.reduce((sum, folder) => sum + folder.items.length, 0),
    [folders]
  );

  const getFolderCategories = (folder: PerkaraFolder): AnalisaCategory[] => {
    const set = new Set<AnalisaCategory>();
    folder.items.forEach((it) => set.add(it.jenisAnalisa));
    return Array.from(set);
  };

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Data Perkara</h1>
          <p className="mt-1 text-sm text-slate-600">
            Folder arsip perkara untuk menyimpan analisa CDR, Trace IMEI, dan Celldump dalam satu perkara yang sama.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateNewProject}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Buat Project Baru
        </button>
      </div>

      {/* Ringkasan Angka */}
      <div className="grid grid-cols-1 divide-y divide-slate-200 border-b border-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="py-5 sm:pr-6">
          <div className="text-xs font-medium text-slate-500">Total Folder Perkara</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {folders.length}
          </div>
        </div>
        <div className="py-5 sm:px-6">
          <div className="text-xs font-medium text-slate-500">Total File Analisa Tersimpan</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {totalFilesTersimpan}
          </div>
        </div>
        <div className="py-5 sm:pl-6">
          <div className="text-xs font-medium text-slate-500">Kategori Tersedia</div>
          <div className="mt-1 text-sm font-medium text-slate-900">
            CDR · Trace IMEI · Celldump
          </div>
        </div>
      </div>

      {/* Filter dan Pencarian */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {(['ALL', 'CDR', 'TRACE IMEI', 'CELLDUMP'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setCategoryFilter(tab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                categoryFilter === tab
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab === 'ALL' ? 'Semua Kategori' : tab}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari folder perkara, judul, nama file..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      {filteredFolders.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-16 text-center">
          <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-400" />
          <h3 className="mt-3 text-base font-semibold text-slate-900">
            Belum ada Folder Data Perkara yang sesuai
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Klik tab BUAT PROJECT untuk membuka canvas analisa baru, unggah file Excel CDR/Trace IMEI/Celldump, lalu simpan ke folder Data Perkara.
          </p>
          <button
            type="button"
            onClick={onCreateNewProject}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            Buat Project Analisa
          </button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Tabel Folder Perkara (tanpa kolom Target Dominan dan tanpa kolom Record) */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-7">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-4 py-3">Folder Perkara</th>
                    <th className="px-4 py-3">Kategori Analisa</th>
                    <th className="px-4 py-3">Isi Folder</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFolders.map((folder) => {
                    const isSelected = selectedFolder?.id === folder.id;
                    const categories = getFolderCategories(folder);
                    return (
                      <tr
                        key={folder.id}
                        onClick={() => setSelectedFolderId(folder.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-start gap-2.5">
                            {isSelected ? (
                              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                            ) : (
                              <Folder className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            )}
                            <div>
                              <div className="font-mono text-xs font-semibold text-slate-900">
                                {folder.nomorPerkara}
                              </div>
                              <div className="mt-0.5 text-sm font-medium text-slate-800">
                                {folder.judulPerkara}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-500">
                                Diperbarui: {folder.updatedAt}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs font-semibold text-slate-700">
                          {categories.length > 0 ? categories.join(' · ') : '-'}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {folder.items.length} file
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onCreateCanvasInFolder(folder);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-blue-600 hover:text-blue-700"
                              title="Tambah analisa CDR / Trace IMEI / Celldump baru ke folder ini"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Tambah Analisa
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteFolder(folder.id);
                              }}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              aria-label={`Hapus folder perkara ${folder.nomorPerkara}`}
                              title="Hapus folder perkara"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail Isi Folder Perkara Terpilih + Pilih File untuk Digabung dalam 1 Canvas */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5">
            {selectedFolder ? (
              <div>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                      <FolderOpen className="h-4 w-4" />
                      Isi Folder Perkara
                    </div>
                    <h2 className="mt-1 font-mono text-sm font-semibold text-slate-900">
                      {selectedFolder.nomorPerkara}
                    </h2>
                    <p className="mt-0.5 text-base font-semibold text-slate-900">
                      {selectedFolder.judulPerkara}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCreateCanvasInFolder(selectedFolder)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Analisa Baru
                  </button>
                </div>

                {selectedFolder.catatan ? (
                  <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {selectedFolder.catatan}
                  </div>
                ) : null}

                <div className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-700">
                      Daftar File Analisa dalam Folder ({selectedFolder.items.length})
                    </div>
                    {selectedFolder.items.length >= 2 ? (
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        {checkedItemsInSelectedFolder.length === selectedFolder.items.length
                          ? 'Batal Pilih Semua'
                          : 'Pilih Semua File'}
                      </button>
                    ) : null}
                  </div>

                  {/* Bar aksi gabung file dalam folder ke 1 canvas */}
                  {selectedFolder.items.length >= 2 ? (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                      <span className="text-[11px] text-slate-600">
                        {checkedItemsInSelectedFolder.length === 0
                          ? 'Centang minimal 2 file untuk digabungkan ke 1 canvas.'
                          : `${checkedItemsInSelectedFolder.length} file dipilih`}
                      </span>
                      <button
                        type="button"
                        disabled={checkedItemsInSelectedFolder.length < 2}
                        onClick={() =>
                          onMergeItemsInCanvas(selectedFolder, checkedItemsInSelectedFolder)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <Layers className="h-3.5 w-3.5" />
                        Gabungkan ke 1 Canvas ({checkedItemsInSelectedFolder.length})
                      </button>
                    </div>
                  ) : null}

                  {selectedFolder.items.length === 0 ? (
                    <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                      Folder ini belum memiliki file analisa. Klik tombol Analisa Baru untuk menambahkan CDR, Trace IMEI, atau Celldump.
                    </div>
                  ) : (
                    <div className="mt-2.5 max-h-[460px] space-y-2.5 overflow-y-auto pr-1">
                      {selectedFolder.items.map((item) => {
                        const customs = Object.values(item.entityCustomizations ?? {});
                        const photoCount = customs.filter((c) => Boolean(c.photoDataUrl)).length;
                        const infoCount = customs.filter(
                          (c) => (c.extraInfo?.length ?? 0) > 0
                        ).length;
                        const isChecked = selectedItemIds.includes(item.id);

                        return (
                          <div
                            key={item.id}
                            className={`rounded-xl border p-3.5 transition-colors ${
                              isChecked
                                ? 'border-blue-600 bg-blue-50/30'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2.5 min-w-0">
                                {selectedFolder.items.length >= 2 ? (
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleItemSelection(item.id)}
                                    aria-label={`Pilih file ${item.fileName} untuk digabungkan`}
                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 cursor-pointer shrink-0"
                                  />
                                ) : null}
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                                      {item.jenisAnalisa}
                                    </span>
                                    <span className="font-mono text-[11px] text-slate-500">
                                      {item.savedAt}
                                    </span>
                                  </div>
                                  <div className="mt-1.5 truncate text-sm font-semibold text-slate-900">
                                    {item.fileName}
                                  </div>
                                  <div className="mt-0.5 text-xs text-slate-500">
                                    Canvas: {item.canvasName}
                                    {item.catatan ? ` · ${item.catatan}` : ''}
                                  </div>

                                  {photoCount > 0 || infoCount > 0 ? (
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                                      {photoCount > 0 ? (
                                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
                                          <ImageIcon className="h-3 w-3" />
                                          {photoCount} Entity Berfoto
                                        </span>
                                      ) : null}
                                      {infoCount > 0 ? (
                                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                                          <Info className="h-3 w-3" />
                                          {infoCount} Entity Berinfo
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => onOpenItemInCanvas(selectedFolder, item)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                                >
                                  <FolderOpen className="h-3.5 w-3.5" />
                                  Buka
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteItemFromFolder(selectedFolder.id, item.id)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                  aria-label={`Hapus file ${item.fileName}`}
                                  title="Hapus file dari folder"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
