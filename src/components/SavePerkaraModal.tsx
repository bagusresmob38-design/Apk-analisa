import React, { useEffect, useState } from 'react';
import { CopyPlus, Folder, FolderPlus, Save, X } from 'lucide-react';
import type { AnalisaCategory, PerkaraFolder } from '../types/cdr';

export interface SavePerkaraPayload {
  saveAction: 'SAVE' | 'SAVE_AS';
  folderDestination: 'NEW_FOLDER' | 'EXISTING_FOLDER';
  targetFolderId?: string;
  updateExistingItemId?: string;
  fileName: string;
  nomorPerkara: string;
  judulPerkara: string;
  jenisAnalisa: AnalisaCategory;
  catatan: string;
}

interface SavePerkaraModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTarget: string;
  defaultFileName: string;
  existingFolders: PerkaraFolder[];
  defaultLinkedFolderId?: string;
  defaultLinkedItemId?: string;
  onSave: (payload: SavePerkaraPayload) => void;
}

export const SavePerkaraModal: React.FC<SavePerkaraModalProps> = ({
  isOpen,
  onClose,
  defaultTarget,
  defaultFileName,
  existingFolders,
  defaultLinkedFolderId,
  defaultLinkedItemId,
  onSave,
}) => {
  const linkedFolder = defaultLinkedFolderId
    ? existingFolders.find((f) => f.id === defaultLinkedFolderId)
    : undefined;
  const linkedItem =
    linkedFolder && defaultLinkedItemId
      ? linkedFolder.items.find((it) => it.id === defaultLinkedItemId)
      : undefined;
  const canSaveInPlace = Boolean(linkedFolder && linkedItem);

  const [saveAction, setSaveAction] = useState<'SAVE' | 'SAVE_AS'>('SAVE');
  const [folderDestination, setFolderDestination] = useState<'NEW_FOLDER' | 'EXISTING_FOLDER'>(
    'NEW_FOLDER'
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [fileName, setFileName] = useState('');
  const [nomorPerkara, setNomorPerkara] = useState('');
  const [judulPerkara, setJudulPerkara] = useState('');
  const [jenisAnalisa, setJenisAnalisa] = useState<AnalisaCategory>('CDR');
  const [catatan, setCatatan] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const currentLinkedFolder = defaultLinkedFolderId
      ? existingFolders.find((f) => f.id === defaultLinkedFolderId)
      : undefined;
    const currentLinkedItem =
      currentLinkedFolder && defaultLinkedItemId
        ? currentLinkedFolder.items.find((it) => it.id === defaultLinkedItemId)
        : undefined;

    setSaveAction('SAVE');

    if (currentLinkedFolder) {
      setFolderDestination('EXISTING_FOLDER');
      setSelectedFolderId(currentLinkedFolder.id);
    } else {
      setFolderDestination('NEW_FOLDER');
      setSelectedFolderId(existingFolders[0]?.id ?? '');
    }

    if (currentLinkedItem) {
      setFileName(currentLinkedItem.fileName || defaultFileName || 'Analisa_CDR.xlsx');
      setJenisAnalisa(currentLinkedItem.jenisAnalisa);
      setCatatan(currentLinkedItem.catatan);
    } else {
      setFileName(defaultFileName || 'Analisa_CDR.xlsx');
      setJenisAnalisa('CDR');
      setCatatan('');
    }

    setNomorPerkara(`LP/B/${Math.floor(100 + Math.random() * 899)}/XI/2026`);
    setJudulPerkara(
      defaultTarget ? `Analisa Target ${defaultTarget}` : 'Analisa Data Perkara Baru'
    );
  }, [
    isOpen,
    defaultTarget,
    defaultFileName,
    defaultLinkedFolderId,
    defaultLinkedItemId,
    existingFolders,
  ]);

  if (!isOpen) return null;

  const handleSelectAction = (nextAction: 'SAVE' | 'SAVE_AS') => {
    setSaveAction(nextAction);
    if (nextAction === 'SAVE') {
      if (linkedFolder && linkedItem) {
        setFolderDestination('EXISTING_FOLDER');
        setSelectedFolderId(linkedFolder.id);
        setFileName(linkedItem.fileName || defaultFileName || 'Analisa_CDR.xlsx');
      }
    } else {
      const baseName = linkedItem?.fileName || defaultFileName || 'Analisa_CDR.xlsx';
      if (canSaveInPlace && !baseName.startsWith('Salinan - ')) {
        setFileName(`Salinan - ${baseName}`);
      }
    }
  };

  const selectedFolder = existingFolders.find((f) => f.id === selectedFolderId) || null;
  const isDirectSaveUpdate = saveAction === 'SAVE' && canSaveInPlace;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedFileName = fileName.trim() || defaultFileName || 'Analisa_CDR.xlsx';

    if (isDirectSaveUpdate && linkedFolder && linkedItem) {
      onSave({
        saveAction: 'SAVE',
        folderDestination: 'EXISTING_FOLDER',
        targetFolderId: linkedFolder.id,
        updateExistingItemId: linkedItem.id,
        fileName: cleanedFileName,
        nomorPerkara: linkedFolder.nomorPerkara,
        judulPerkara: linkedFolder.judulPerkara,
        jenisAnalisa,
        catatan: catatan.trim(),
      });
      onClose();
      return;
    }

    if (folderDestination === 'NEW_FOLDER') {
      if (!nomorPerkara.trim() || !judulPerkara.trim()) return;
      onSave({
        saveAction,
        folderDestination: 'NEW_FOLDER',
        fileName: cleanedFileName,
        nomorPerkara: nomorPerkara.trim(),
        judulPerkara: judulPerkara.trim(),
        jenisAnalisa,
        catatan: catatan.trim(),
      });
    } else {
      if (!selectedFolder) return;
      onSave({
        saveAction,
        folderDestination: 'EXISTING_FOLDER',
        targetFolderId: selectedFolder.id,
        updateExistingItemId: undefined,
        fileName: cleanedFileName,
        nomorPerkara: selectedFolder.nomorPerkara,
        judulPerkara: selectedFolder.judulPerkara,
        jenisAnalisa,
        catatan: catatan.trim(),
      });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-perkara-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="save-perkara-title" className="text-base font-semibold text-slate-900">
              Simpan Data Analisa Perkara
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Target: <span className="font-mono">{defaultTarget || '-'}</span>
              {canSaveInPlace && linkedFolder ? (
                <>
                  {' '}
                  · Terkait Folder: <span className="font-mono">{linkedFolder.nomorPerkara}</span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {/* Pilihan Eksplisit: SAVE vs SAVE AS */}
          <div>
            <span className="block text-xs font-medium text-slate-700">Metode Penyimpanan</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectAction('SAVE')}
                className={`flex flex-col items-start rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  saveAction === 'SAVE'
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <Save className="h-3.5 w-3.5" />
                  SAVE
                </div>
                <span className="mt-0.5 text-[11px] text-slate-500">
                  {canSaveInPlace
                    ? 'Perbarui data yang sedang dibuka'
                    : 'Simpan hasil analisa ini'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAction('SAVE_AS')}
                className={`flex flex-col items-start rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  saveAction === 'SAVE_AS'
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <CopyPlus className="h-3.5 w-3.5" />
                  SAVE AS
                </div>
                <span className="mt-0.5 text-[11px] text-slate-500">
                  Simpan sebagai salinan / file baru
                </span>
              </button>
            </div>
          </div>

          {/* Nama File / Analisa */}
          <div>
            <label htmlFor="nama-file-analisa" className="block text-xs font-medium text-slate-700">
              Nama File / Label Analisa
            </label>
            <input
              id="nama-file-analisa"
              type="text"
              required
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Contoh: cdr_target_utama.xlsx"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          {/* Tujuan Folder (otomatis terikat saat SAVE item yang sudah ada, atau bebas pilih saat SAVE AS / file baru) */}
          {isDirectSaveUpdate && linkedFolder && linkedItem ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3.5 py-2.5 text-xs text-slate-700">
              <div className="font-semibold text-blue-800">
                Memperbarui File di Folder Perkara:
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-slate-900">
                {linkedFolder.nomorPerkara} — {linkedFolder.judulPerkara}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Semua tata letak, zoom, filter, edit data, informasi tambahan, dan foto pada canvas akan ikut tersimpan utuh.
              </div>
            </div>
          ) : (
            <>
              {existingFolders.length > 0 ? (
                <div>
                  <span className="block text-xs font-medium text-slate-700">
                    Tujuan Folder Perkara
                  </span>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFolderDestination('EXISTING_FOLDER')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        folderDestination === 'EXISTING_FOLDER'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Folder className="h-3.5 w-3.5" />
                      Folder Perkara Sama
                    </button>
                    <button
                      type="button"
                      onClick={() => setFolderDestination('NEW_FOLDER')}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        folderDestination === 'NEW_FOLDER'
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                      Buat Folder Baru
                    </button>
                  </div>
                </div>
              ) : null}

              {folderDestination === 'EXISTING_FOLDER' && existingFolders.length > 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                  <label
                    htmlFor="select-existing-folder"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Pilih Folder Perkara
                  </label>
                  <select
                    id="select-existing-folder"
                    value={selectedFolderId}
                    onChange={(e) => setSelectedFolderId(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    {existingFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.nomorPerkara} — {folder.judulPerkara} ({folder.items.length} file)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="nomor-perkara"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Nomor Perkara / Laporan
                    </label>
                    <input
                      id="nomor-perkara"
                      type="text"
                      required
                      value={nomorPerkara}
                      onChange={(e) => setNomorPerkara(e.target.value)}
                      placeholder="Contoh: LP/B/104/XI/2026"
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="judul-perkara"
                      className="block text-xs font-medium text-slate-700"
                    >
                      Judul / Nama Folder Perkara
                    </label>
                    <input
                      id="judul-perkara"
                      type="text"
                      required
                      value={judulPerkara}
                      onChange={(e) => setJudulPerkara(e.target.value)}
                      placeholder="Contoh: Kasus Penipuan"
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          <div>
            <span className="block text-xs font-medium text-slate-700">Kategori Analisa</span>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {(['CDR', 'TRACE IMEI', 'CELLDUMP'] as AnalisaCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setJenisAnalisa(cat)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    jenisAnalisa === cat
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="catatan-perkara" className="block text-xs font-medium text-slate-700">
              Catatan Analis (Opsional)
            </label>
            <textarea
              id="catatan-perkara"
              rows={2}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Ringkasan temuan IMEI, pergerakan BTS, atau keterangan file..."
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              {saveAction === 'SAVE' ? (
                <>
                  <Save className="h-3.5 w-3.5" />
                  SAVE
                </>
              ) : (
                <>
                  <CopyPlus className="h-3.5 w-3.5" />
                  SAVE AS
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
