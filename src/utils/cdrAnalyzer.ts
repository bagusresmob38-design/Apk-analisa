import * as XLSX from 'xlsx';
import type {
  CdrAnalysisResult,
  CdrCallRecord,
  CoordinatePoint,
  EdgeRelation,
  GraphEdge,
  GraphNode,
} from '../types/cdr';

const EXPECTED_COLUMN_ORDER = [
  'DATE',
  'TIME',
  'DURATION',
  'A NUMBER',
  'A IMEI',
  'A IMEI TYPE',
  'A IMSI',
  'A LAC/CID',
  'A SITENAME',
  'B NUMBER',
  'B IMEI',
  'B IMEI TYPE',
  'B IMSI',
  'B LAC/CID',
  'B SITENAME',
  'CALLTYPE',
  'DIRECTION', // diabaikan
  'C NUMBER', // diabaikan
  'A LAT',
  'A LONG',
  'B LAT',
  'B LONG',
] as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function cleanCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  const str = String(value).trim();
  if (
    !str ||
    str === ':' ||
    str === '-' ||
    /^[:\-\/\s]+$/.test(str) ||
    str.toUpperCase() === 'NULL' ||
    str.toUpperCase() === 'N/A'
  ) {
    return '';
  }
  return str;
}

function sanitizeEntityField(value: string): string {
  const trimmed = (value || '').trim();
  if (
    !trimmed ||
    trimmed === ':' ||
    trimmed === '-' ||
    /^[:\-\/\s]+$/.test(trimmed) ||
    trimmed.toUpperCase() === 'NULL' ||
    trimmed.toUpperCase() === 'N/A'
  ) {
    return '';
  }
  return trimmed;
}

/**
 * Normalisasi nomor pada kolom A NUMBER dan B NUMBER:
 * 1. Abaikan nilai kosong atau berisikan ":"
 * 2. Hapus prefix (+, 0, 62, 6291, 6295, 9162)
 * 3. Tambahkan prefix 62
 */
export function normalizePhoneWithPrefix62(raw: string): string {
  const sanitized = sanitizeEntityField(raw);
  if (!sanitized || sanitized.includes(':')) return '';

  let cleaned = sanitized.replace(/[\s\-()]/g, '');
  if (!cleaned) return '';

  // Hanya terapkan normalisasi prefix telepon jika diawali '+' atau digit
  if (!/^[+\d]/.test(cleaned)) {
    return cleaned;
  }

  cleaned = cleaned.replace(/^\++/, '');
  let changed = true;
  while (changed && cleaned.length > 0) {
    changed = false;
    if (cleaned.startsWith('6291')) {
      cleaned = cleaned.slice(4);
      changed = true;
    } else if (cleaned.startsWith('6295')) {
      cleaned = cleaned.slice(4);
      changed = true;
    } else if (cleaned.startsWith('9162')) {
      cleaned = cleaned.slice(4);
      changed = true;
    } else if (cleaned.startsWith('62')) {
      cleaned = cleaned.slice(2);
      changed = true;
    } else if (cleaned.startsWith('0')) {
      cleaned = cleaned.slice(1);
      changed = true;
    }
  }

  if (!cleaned) return '';
  return `62${cleaned}`;
}

const MONTH_NAME_MAP: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  MEI: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  AGU: 8,
  SEP: 9,
  OCT: 10,
  OKT: 10,
  NOV: 11,
  DEC: 12,
  DES: 12,
};

function parseDateParts(dateStr: string): { year: number; month: number; day: number } | null {
  const s = (dateStr || '').trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  }

  // DD-MM-YYYY or DD/MM/YYYY or D/M/YY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const p1 = Number(m[1]);
    const p2 = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    // Prioritaskan format Indonesia DD/MM/YYYY kecuali p2 > 12
    if (p2 > 12 && p1 <= 12) {
      return { year, month: p1, day: p2 };
    }
    return { year, month: p2, day: p1 };
  }

  // DD-MMM-YYYY or DD MMM YYYY
  m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,})[-\s/](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const mon = MONTH_NAME_MAP[m[2].slice(0, 3).toUpperCase()];
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    if (mon) return { year, month: mon, day };
  }

  const fallbackMs = Date.parse(s);
  if (!Number.isNaN(fallbackMs)) {
    const d = new Date(fallbackMs);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
  return null;
}

function parseTimeParts(timeStr: string): { hour: number; minute: number; second: number } {
  const s = (timeStr || '').trim().toUpperCase();
  if (!s) return { hour: 0, minute: 0, second: 0 };

  const isPM = s.includes('PM');
  const isAM = s.includes('AM');
  const cleanTime = s.replace(/\s*(AM|PM)\s*$/, '');
  const m = cleanTime.match(/^(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?$/);
  if (!m) return { hour: 0, minute: 0, second: 0 };

  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = m[3] ? Number(m[3]) : 0;

  if (isPM && hour < 12) hour += 12;
  if (isAM && hour === 12) hour = 0;

  return { hour, minute, second };
}

function getDateTimeSortValue(dateStr: string, timeStr: string): number | null {
  const dp = parseDateParts(dateStr);
  if (!dp) return null;
  const tp = parseTimeParts(timeStr);
  return Date.UTC(dp.year, dp.month - 1, dp.day, tp.hour, tp.minute, tp.second);
}

function sortRecordsByDateAndTime(records: CdrCallRecord[]): CdrCallRecord[] {
  return [...records].sort((a, b) => {
    const ta = getDateTimeSortValue(a.date, a.time);
    const tb = getDateTimeSortValue(b.date, b.time);
    if (ta !== null && tb !== null && ta !== tb) {
      return ta - tb;
    }
    if (ta !== null && tb === null) return -1;
    if (ta === null && tb !== null) return 1;

    const dateCmp = (a.date || '').localeCompare(b.date || '');
    if (dateCmp !== 0) return dateCmp;
    const timeCmp = (a.time || '').localeCompare(b.time || '');
    if (timeCmp !== 0) return timeCmp;
    return a.rowNumber - b.rowNumber;
  });
}

function parseDurationSeconds(raw: string): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  // Format HH:MM:SS atau MM:SS
  const parts = trimmed.split(':').map((p) => Number(p));
  if (parts.every((n) => !Number.isNaN(n))) {
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  const num = Number(trimmed);
  return Number.isNaN(num) ? 0 : Math.round(num);
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 dtk';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}j ${mins}m ${secs}d`;
  if (mins > 0) return `${mins}m ${secs}d`;
  return `${secs} dtk`;
}

export function parseExcelBufferToCdrRecords(
  buffer: ArrayBuffer,
  sourceFileName?: string
): CdrCallRecord[] {
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('File Excel tidak memiliki sheet yang terbaca.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });

  if (rows.length <= 1) {
    throw new Error('Sheet Excel kosong atau hanya berisi judul kolom pada baris 1.');
  }

  // ROW 1 selalu memuat judul kolom — data selalu dimulai dari ROW 2 (rows.slice(1))
  const firstRow = rows[0] || [];
  const normalizedHeaders = firstRow.map((h) => normalizeHeader(h).replace(/_/g, ' '));

  const headerIndexMap: Record<string, number> = {};
  normalizedHeaders.forEach((h, idx) => {
    if (h) headerIndexMap[h] = idx;
  });

  const getColIndex = (colName: (typeof EXPECTED_COLUMN_ORDER)[number], fallbackIdx: number): number => {
    if (colName in headerIndexMap) {
      return headerIndexMap[colName];
    }
    return fallbackIdx;
  };

  const batchToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const dataRows = rows.slice(1);
  const parsed: CdrCallRecord[] = [];

  dataRows.forEach((row, i) => {
    if (!Array.isArray(row)) return;
    const isEmptyRow = row.every((cell) => cleanCell(cell) === '');
    if (isEmptyRow) return;

    const getVal = (colName: (typeof EXPECTED_COLUMN_ORDER)[number], fallbackIdx: number) => {
      const idx = getColIndex(colName, fallbackIdx);
      return cleanCell(row[idx]);
    };

    const date = getVal('DATE', 0);
    const time = getVal('TIME', 1);
    const durationRaw = getVal('DURATION', 2);
    const aNumber = normalizePhoneWithPrefix62(getVal('A NUMBER', 3));
    const aImei = sanitizeEntityField(getVal('A IMEI', 4));
    const aImeiType = getVal('A IMEI TYPE', 5);
    const aImsi = getVal('A IMSI', 6);
    const aLacCid = sanitizeEntityField(getVal('A LAC/CID', 7));
    const aSitename = getVal('A SITENAME', 8);
    const bNumber = normalizePhoneWithPrefix62(getVal('B NUMBER', 9));
    const bImei = sanitizeEntityField(getVal('B IMEI', 10));
    const bImeiType = getVal('B IMEI TYPE', 11);
    const bImsi = getVal('B IMSI', 12);
    const bLacCid = sanitizeEntityField(getVal('B LAC/CID', 13));
    const bSitename = getVal('B SITENAME', 14);
    const callType = getVal('CALLTYPE', 15) || 'VOICE';
    // Kolom index 16 (DIRECTION) dan index 17 (C NUMBER) diabaikan sesuai ketentuan
    const aLat = getVal('A LAT', 18);
    const aLong = getVal('A LONG', 19);
    const bLat = getVal('B LAT', 20);
    const bLong = getVal('B LONG', 21);

    if (!aNumber && !bNumber) return;

    const durationSeconds = parseDurationSeconds(durationRaw);

    parsed.push({
      id: `rec-${batchToken}-${i + 1}`,
      rowNumber: i + 2,
      date,
      time,
      durationSeconds,
      durationDisplay: durationRaw || formatDuration(durationSeconds),
      aNumber,
      aImei,
      aImeiType,
      aImsi,
      aLacCid,
      aSitename,
      bNumber,
      bImei,
      bImeiType,
      bImsi,
      bLacCid,
      bSitename,
      callType,
      aLat,
      aLong,
      bLat,
      bLong,
      interactionLabel: 'Komunikasi Lain',
      sourceFile: sourceFileName,
    });
  });

  if (parsed.length === 0) {
    throw new Error('Tidak ditemukan baris data CDR yang valid pada file Excel (mulai baris 2).');
  }

  return sortRecordsByDateAndTime(parsed);
}

export function mergeCdrRecordSets(recordSets: CdrCallRecord[][]): CdrCallRecord[] {
  const seenIds = new Set<string>();
  const merged: CdrCallRecord[] = [];
  let dupCounter = 1;

  for (const records of recordSets) {
    for (const rec of records) {
      let uniqueId = rec.id;
      while (!uniqueId || seenIds.has(uniqueId)) {
        uniqueId = `${rec.id || 'rec'}-m${dupCounter++}`;
      }
      seenIds.add(uniqueId);
      merged.push({
        ...rec,
        id: uniqueId,
      });
    }
  }

  return sortRecordsByDateAndTime(merged);
}

export function analyzeCdrRecords(inputRecords: CdrCallRecord[]): CdrAnalysisResult {
  if (inputRecords.length === 0) {
    throw new Error('Data CDR kosong, tidak dapat dianalisa.');
  }

  // Sanitasi field entity + normalisasi prefix A/B NUMBER (+, 0, 62, 6291, 6295, 9162 -> 62)
  // lalu urutkan data berdasarkan DATE dan TIME
  const sanitizedRecords: CdrCallRecord[] = sortRecordsByDateAndTime(
    inputRecords.map((r) => ({
      ...r,
      aNumber: normalizePhoneWithPrefix62(r.aNumber),
      aImei: sanitizeEntityField(r.aImei).includes(':') ? '' : sanitizeEntityField(r.aImei),
      aImeiType: sanitizeEntityField(r.aImeiType),
      aImsi: sanitizeEntityField(r.aImsi),
      aLacCid: sanitizeEntityField(r.aLacCid).includes(':') ? '' : sanitizeEntityField(r.aLacCid),
      aSitename: sanitizeEntityField(r.aSitename),
      bNumber: normalizePhoneWithPrefix62(r.bNumber),
      bImei: sanitizeEntityField(r.bImei).includes(':') ? '' : sanitizeEntityField(r.bImei),
      bImeiType: sanitizeEntityField(r.bImeiType),
      bImsi: sanitizeEntityField(r.bImsi),
      bLacCid: sanitizeEntityField(r.bLacCid).includes(':') ? '' : sanitizeEntityField(r.bLacCid),
      bSitename: sanitizeEntityField(r.bSitename),
      aLat: sanitizeEntityField(r.aLat),
      aLong: sanitizeEntityField(r.aLong),
      bLat: sanitizeEntityField(r.bLat),
      bLong: sanitizeEntityField(r.bLong),
    }))
  );

  // 1. Tentukan Nomor Target (nomor handphone terbanyak/paling dominan pada A NUMBER & B NUMBER)
  const phoneFreq = new Map<string, number>();
  for (const r of sanitizedRecords) {
    if (r.aNumber) phoneFreq.set(r.aNumber, (phoneFreq.get(r.aNumber) || 0) + 1);
    if (r.bNumber) phoneFreq.set(r.bNumber, (phoneFreq.get(r.bNumber) || 0) + 1);
  }

  let targetNumber = '';
  let targetFrequency = 0;
  for (const [num, count] of phoneFreq.entries()) {
    if (count > targetFrequency) {
      targetFrequency = count;
      targetNumber = num;
    }
  }

  // 2. Klasifikasi arah interaksi berdasarkan posisi Target (A NUMBER vs B NUMBER)
  let targetAsACount = 0;
  let targetAsBCount = 0;

  const analyzedRecords: CdrCallRecord[] = sanitizedRecords.map((rec) => {
    let interactionLabel: CdrCallRecord['interactionLabel'] = 'Komunikasi Lain';
    if (rec.aNumber === targetNumber) {
      interactionLabel = 'Target Menghubungi';
      targetAsACount += 1;
    } else if (rec.bNumber === targetNumber) {
      interactionLabel = 'Target Dihubungi';
      targetAsBCount += 1;
    }
    return {
      ...rec,
      interactionLabel,
    };
  });

  // 3. Bangun Entity Maps: Nomor Handphone (sub: IMSI), IMEI (sub: IMEI TYPE), LAC/CID (sub: SITENAME)
  const phoneMap = new Map<
    string,
    {
      imsis: Set<string>;
      count: number;
      asACount: number;
      asBCount: number;
    }
  >();

  const imeiMap = new Map<
    string,
    {
      types: Set<string>;
      count: number;
    }
  >();

  const lacMap = new Map<
    string,
    {
      sitenames: Set<string>;
      coords: Map<string, CoordinatePoint>;
      count: number;
    }
  >();

  // Edge accumulators
  const commEdgeMap = new Map<
    string,
    {
      source: string;
      target: string;
      relation: EdgeRelation;
      callCount: number;
      totalDurationSeconds: number;
      callTypes: Set<string>;
      recordIds: string[];
    }
  >();

  const phoneImeiEdgeMap = new Map<
    string,
    { source: string; target: string; count: number; recordIds: string[] }
  >();

  const phoneLacEdgeMap = new Map<
    string,
    { source: string; target: string; count: number; recordIds: string[] }
  >();

  const allCallTypes = new Set<string>();
  const allDates: string[] = [];

  const ensurePhone = (num: string) => {
    if (!phoneMap.has(num)) {
      phoneMap.set(num, { imsis: new Set(), count: 0, asACount: 0, asBCount: 0 });
    }
    return phoneMap.get(num)!;
  };

  const ensureImei = (imei: string) => {
    if (!imeiMap.has(imei)) {
      imeiMap.set(imei, { types: new Set(), count: 0 });
    }
    return imeiMap.get(imei)!;
  };

  const ensureLac = (lac: string) => {
    if (!lacMap.has(lac)) {
      lacMap.set(lac, { sitenames: new Set(), coords: new Map(), count: 0 });
    }
    return lacMap.get(lac)!;
  };

  for (const rec of analyzedRecords) {
    if (rec.callType) allCallTypes.add(rec.callType);
    if (rec.date) allDates.push(rec.date);

    // Kepemilikan A NUMBER -> A IMEI, A IMEI TYPE, A IMSI, A LAC/CID, A SITENAME, A LAT, A LONG
    if (rec.aNumber) {
      const pA = ensurePhone(rec.aNumber);
      pA.count += 1;
      pA.asACount += 1;
      if (rec.aImsi) pA.imsis.add(rec.aImsi);

      if (rec.aImei) {
        const imeiObj = ensureImei(rec.aImei);
        imeiObj.count += 1;
        if (rec.aImeiType) imeiObj.types.add(rec.aImeiType);

        const edgeKey = `PHONE:${rec.aNumber}->IMEI:${rec.aImei}`;
        if (!phoneImeiEdgeMap.has(edgeKey)) {
          phoneImeiEdgeMap.set(edgeKey, {
            source: `PHONE:${rec.aNumber}`,
            target: `IMEI:${rec.aImei}`,
            count: 0,
            recordIds: [],
          });
        }
        const pe = phoneImeiEdgeMap.get(edgeKey)!;
        pe.count += 1;
        pe.recordIds.push(rec.id);
      }

      if (rec.aLacCid) {
        const lacObj = ensureLac(rec.aLacCid);
        lacObj.count += 1;
        if (rec.aSitename) lacObj.sitenames.add(rec.aSitename);
        if (rec.aLat || rec.aLong) {
          const latVal = rec.aLat || '-';
          const longVal = rec.aLong || '-';
          const cKey = `${latVal},${longVal}`;
          if (!lacObj.coords.has(cKey)) {
            lacObj.coords.set(cKey, {
              lat: latVal,
              long: longVal,
              sitename: rec.aSitename || rec.aLacCid,
            });
          }
        }

        const edgeKey = `PHONE:${rec.aNumber}->LAC:${rec.aLacCid}`;
        if (!phoneLacEdgeMap.has(edgeKey)) {
          phoneLacEdgeMap.set(edgeKey, {
            source: `PHONE:${rec.aNumber}`,
            target: `LAC:${rec.aLacCid}`,
            count: 0,
            recordIds: [],
          });
        }
        const pl = phoneLacEdgeMap.get(edgeKey)!;
        pl.count += 1;
        pl.recordIds.push(rec.id);
      }
    }

    // Kepemilikan B NUMBER -> B IMEI, B IMEI TYPE, B IMSI, B LAC/CID, B SITENAME, B LAT, B LONG
    if (rec.bNumber) {
      const pB = ensurePhone(rec.bNumber);
      pB.count += 1;
      pB.asBCount += 1;
      if (rec.bImsi) pB.imsis.add(rec.bImsi);

      if (rec.bImei) {
        const imeiObj = ensureImei(rec.bImei);
        imeiObj.count += 1;
        if (rec.bImeiType) imeiObj.types.add(rec.bImeiType);

        const edgeKey = `PHONE:${rec.bNumber}->IMEI:${rec.bImei}`;
        if (!phoneImeiEdgeMap.has(edgeKey)) {
          phoneImeiEdgeMap.set(edgeKey, {
            source: `PHONE:${rec.bNumber}`,
            target: `IMEI:${rec.bImei}`,
            count: 0,
            recordIds: [],
          });
        }
        const pe = phoneImeiEdgeMap.get(edgeKey)!;
        pe.count += 1;
        pe.recordIds.push(rec.id);
      }

      if (rec.bLacCid) {
        const lacObj = ensureLac(rec.bLacCid);
        lacObj.count += 1;
        if (rec.bSitename) lacObj.sitenames.add(rec.bSitename);
        if (rec.bLat || rec.bLong) {
          const latVal = rec.bLat || '-';
          const longVal = rec.bLong || '-';
          const cKey = `${latVal},${longVal}`;
          if (!lacObj.coords.has(cKey)) {
            lacObj.coords.set(cKey, {
              lat: latVal,
              long: longVal,
              sitename: rec.bSitename || rec.bLacCid,
            });
          }
        }

        const edgeKey = `PHONE:${rec.bNumber}->LAC:${rec.bLacCid}`;
        if (!phoneLacEdgeMap.has(edgeKey)) {
          phoneLacEdgeMap.set(edgeKey, {
            source: `PHONE:${rec.bNumber}`,
            target: `LAC:${rec.bLacCid}`,
            count: 0,
            recordIds: [],
          });
        }
        const pl = phoneLacEdgeMap.get(edgeKey)!;
        pl.count += 1;
        pl.recordIds.push(rec.id);
      }
    }

    // Relasi komunikasi antar A NUMBER dan B NUMBER
    if (rec.aNumber && rec.bNumber && rec.aNumber !== rec.bNumber) {
      let relation: EdgeRelation = 'COMMUNICATION';
      if (rec.aNumber === targetNumber) relation = 'TARGET_MENGHUBUNGI';
      else if (rec.bNumber === targetNumber) relation = 'TARGET_DIHUBUNGI';

      const sourceId = `PHONE:${rec.aNumber}`;
      const targetId = `PHONE:${rec.bNumber}`;
      const key = `${sourceId}=>${targetId}:${relation}`;

      if (!commEdgeMap.has(key)) {
        commEdgeMap.set(key, {
          source: sourceId,
          target: targetId,
          relation,
          callCount: 0,
          totalDurationSeconds: 0,
          callTypes: new Set(),
          recordIds: [],
        });
      }
      const edgeAcc = commEdgeMap.get(key)!;
      edgeAcc.callCount += 1;
      edgeAcc.totalDurationSeconds += rec.durationSeconds;
      if (rec.callType) edgeAcc.callTypes.add(rec.callType);
      edgeAcc.recordIds.push(rec.id);
    }
  }

  // 4. Susun Nodes dan Hitung Tata Letak Jaring Laba-Laba (Radial Spider-Web)
  const nodes: GraphNode[] = [];
  const centerX = 760;
  const centerY = 500;

  const phoneEntries = Array.from(phoneMap.entries()).sort((a, b) => {
    if (a[0] === targetNumber) return -1;
    if (b[0] === targetNumber) return 1;
    return b[1].count - a[1].count;
  });

  const contactAngles = new Map<string, number>();
  const nonTargetPhones = phoneEntries.filter(([num]) => num !== targetNumber);
  const phoneRingRadius = Math.max(250, Math.min(340, 190 + nonTargetPhones.length * 14));

  phoneEntries.forEach(([num, info]) => {
    const isTarget = num === targetNumber;
    let x = centerX;
    let y = centerY;

    if (!isTarget) {
      const idx = nonTargetPhones.findIndex(([n]) => n === num);
      const angle = (idx / Math.max(1, nonTargetPhones.length)) * Math.PI * 2 - Math.PI / 2;
      contactAngles.set(`PHONE:${num}`, angle);
      x = Math.round(centerX + Math.cos(angle) * phoneRingRadius);
      y = Math.round(centerY + Math.sin(angle) * phoneRingRadius);
    }

    nodes.push({
      id: `PHONE:${num}`,
      type: 'PHONE',
      label: num,
      subData: Array.from(info.imsis),
      isTarget,
      count: info.count,
      asACount: info.asACount,
      asBCount: info.asBCount,
      coordinates: [],
      x,
      y,
    });
  });

  // Posisikan IMEI di ring luar terdekat dengan Nomor Handphone pemiliknya
  const imeiEntries = Array.from(imeiMap.entries());
  const imeiRadius = phoneRingRadius + 185;
  imeiEntries.forEach(([imei, info], idx) => {
    const connectedPhones = Array.from(phoneImeiEdgeMap.values())
      .filter((e) => e.target === `IMEI:${imei}`)
      .map((e) => e.source);

    let angle = (idx / Math.max(1, imeiEntries.length)) * Math.PI * 2 - Math.PI / 3;
    let baseRadius = imeiRadius;

    // Jika terhubung langsung dengan Target dan bukan kontak lain, posisikan lebih dekat di inner-upper arc
    const onlyTarget =
      connectedPhones.length === 1 && connectedPhones[0] === `PHONE:${targetNumber}`;
    if (onlyTarget) {
      const targetImeiIdx = imeiEntries
        .filter(([im]) => {
          const edgesForIm = Array.from(phoneImeiEdgeMap.values()).filter(
            (e) => e.target === `IMEI:${im}`
          );
          return edgesForIm.length === 1 && edgesForIm[0].source === `PHONE:${targetNumber}`;
        })
        .findIndex(([im]) => im === imei);
      const spread = -Math.PI * 0.72 + targetImeiIdx * 0.42;
      angle = spread;
      baseRadius = 175;
    } else if (connectedPhones.length > 0) {
      const firstNonTarget = connectedPhones.find((p) => p !== `PHONE:${targetNumber}`);
      if (firstNonTarget && contactAngles.has(firstNonTarget)) {
        angle = contactAngles.get(firstNonTarget)! - 0.16 + (idx % 3) * 0.08;
      }
    }

    nodes.push({
      id: `IMEI:${imei}`,
      type: 'IMEI',
      label: imei,
      subData: Array.from(info.types),
      isTarget: false,
      count: info.count,
      asACount: 0,
      asBCount: 0,
      coordinates: [],
      x: Math.round(centerX + Math.cos(angle) * baseRadius),
      y: Math.round(centerY + Math.sin(angle) * baseRadius),
    });
  });

  // Posisikan LAC/CID di ring luar sektor Nomor Handphone terkait
  const lacEntries = Array.from(lacMap.entries());
  const lacRadius = phoneRingRadius + 245;
  lacEntries.forEach(([lac, info], idx) => {
    const connectedPhones = Array.from(phoneLacEdgeMap.values())
      .filter((e) => e.target === `LAC:${lac}`)
      .map((e) => e.source);

    let angle = (idx / Math.max(1, lacEntries.length)) * Math.PI * 2 + Math.PI / 6;
    let baseRadius = lacRadius;

    const onlyTarget =
      connectedPhones.length === 1 && connectedPhones[0] === `PHONE:${targetNumber}`;
    if (onlyTarget) {
      const targetLacList = lacEntries.filter(([l]) => {
        const edgesForLac = Array.from(phoneLacEdgeMap.values()).filter(
          (e) => e.target === `LAC:${l}`
        );
        return edgesForLac.length === 1 && edgesForLac[0].source === `PHONE:${targetNumber}`;
      });
      const targetLacIdx = targetLacList.findIndex(([l]) => l === lac);
      angle = Math.PI * 0.25 + targetLacIdx * 0.36;
      baseRadius = 185;
    } else if (connectedPhones.length > 0) {
      const firstNonTarget = connectedPhones.find((p) => p !== `PHONE:${targetNumber}`);
      if (firstNonTarget && contactAngles.has(firstNonTarget)) {
        angle = contactAngles.get(firstNonTarget)! + 0.16 + (idx % 3) * 0.07;
      }
    }

    nodes.push({
      id: `LAC:${lac}`,
      type: 'LAC_CID',
      label: lac,
      subData: Array.from(info.sitenames),
      isTarget: false,
      count: info.count,
      asACount: 0,
      asBCount: 0,
      coordinates: Array.from(info.coords.values()),
      x: Math.round(centerX + Math.cos(angle) * baseRadius),
      y: Math.round(centerY + Math.sin(angle) * baseRadius),
    });
  });

  // 5. Bangun Edges
  const edges: GraphEdge[] = [];

  for (const [key, e] of commEdgeMap.entries()) {
    const labelPrefix =
      e.relation === 'TARGET_MENGHUBUNGI'
        ? 'Menghubungi'
        : e.relation === 'TARGET_DIHUBUNGI'
          ? 'Dihubungi'
          : 'Komunikasi';
    edges.push({
      id: key,
      source: e.source,
      target: e.target,
      relation: e.relation,
      label: `${labelPrefix} (${e.callCount}x)`,
      callCount: e.callCount,
      totalDurationSeconds: e.totalDurationSeconds,
      callTypes: Array.from(e.callTypes),
      recordIds: e.recordIds,
    });
  }

  for (const [key, e] of phoneImeiEdgeMap.entries()) {
    edges.push({
      id: key,
      source: e.source,
      target: e.target,
      relation: 'USES_IMEI',
      label: `IMEI (${e.count}x)`,
      callCount: e.count,
      totalDurationSeconds: 0,
      callTypes: [],
      recordIds: e.recordIds,
    });
  }

  for (const [key, e] of phoneLacEdgeMap.entries()) {
    edges.push({
      id: key,
      source: e.source,
      target: e.target,
      relation: 'LOCATED_AT',
      label: `BTS (${e.count}x)`,
      callCount: e.count,
      totalDurationSeconds: 0,
      callTypes: [],
      recordIds: e.recordIds,
    });
  }

  const sortedDates = [...allDates].filter(Boolean).sort();
  const dateRange =
    sortedDates.length > 0
      ? sortedDates[0] === sortedDates[sortedDates.length - 1]
        ? sortedDates[0]
        : `${sortedDates[0]} – ${sortedDates[sortedDates.length - 1]}`
      : '-';

  return {
    summary: {
      targetNumber,
      targetFrequency,
      targetAsACount,
      targetAsBCount,
      totalRecords: analyzedRecords.length,
      uniquePhones: phoneMap.size,
      uniqueImeis: imeiMap.size,
      uniqueLacCids: lacMap.size,
      callTypes: Array.from(allCallTypes),
      dateRange,
    },
    nodes,
    edges,
    records: analyzedRecords,
  };
}
