import type { CdrAnalysisResult, GraphNode } from '../types/cdr';

export type ArrangeMode =
  | 'PEACOCK'
  | 'COMPACT_PEACOCK'
  | 'HIERARCHY'
  | 'ORGANIZATION'
  | 'GROUPED'
  | 'TIMELINE';

export const ARRANGE_OPTIONS: {
  id: ArrangeMode;
  label: string;
  description: string;
}[] = [
  {
    id: 'PEACOCK',
    label: 'Peacock',
    description: 'Sebaran kipas radial lebar dari hub target',
  },
  {
    id: 'COMPACT_PEACOCK',
    label: 'Compact Peacock',
    description: 'Sebaran kipas radial padat untuk jaringan besar',
  },
  {
    id: 'HIERARCHY',
    label: 'Hierarchy',
    description: 'Tingkatan top-down: Target, Kontak, IMEI, LAC/CID',
  },
  {
    id: 'ORGANIZATION',
    label: 'Organization',
    description: 'Bagan struktur cabang Menghubungi & Dihubungi',
  },
  {
    id: 'GROUPED',
    label: 'Grouped',
    description: 'Pengelompokan klaster Nomor HP, IMEI, dan LAC/CID',
  },
  {
    id: 'TIMELINE',
    label: 'Timeline',
    description: 'Urutan kronologis berdasarkan DATE dan TIME',
  },
];

function computePeacockPositions(
  analysis: CdrAnalysisResult,
  compact: boolean
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const centerX = 760;
  const centerY = 500;

  const targetNode = analysis.nodes.find((n) => n.isTarget);
  const targetId = targetNode?.id;
  if (targetNode) {
    positions[targetNode.id] = { x: centerX, y: centerY };
  }

  const nonTargetPhones = analysis.nodes
    .filter((n) => n.type === 'PHONE' && !n.isTarget)
    .sort((a, b) => b.count - a.count);

  const phoneRadius = compact
    ? Math.max(230, Math.min(310, 180 + nonTargetPhones.length * 10))
    : Math.max(330, Math.min(470, 260 + nonTargetPhones.length * 18));

  const phoneAngles = new Map<string, number>();

  nonTargetPhones.forEach((phone, idx) => {
    const angle = (idx / Math.max(1, nonTargetPhones.length)) * Math.PI * 2 - Math.PI / 2;
    phoneAngles.set(phone.id, angle);
    positions[phone.id] = {
      x: Math.round(centerX + Math.cos(angle) * phoneRadius),
      y: Math.round(centerY + Math.sin(angle) * phoneRadius),
    };
  });

  // Kelompokkan node IMEI dan LAC_CID berdasarkan phone hub pemiliknya agar membentuk kipas ekor merak
  const secondaryNodes = analysis.nodes.filter((n) => n.type !== 'PHONE');
  const childrenByHub = new Map<string, GraphNode[]>();

  secondaryNodes.forEach((sec) => {
    const linkedPhoneEdges = analysis.edges
      .filter((e) => e.target === sec.id && e.source.startsWith('PHONE:'))
      .sort((a, b) => b.callCount - a.callCount);

    // Pilih phone non-target jika ada agar tidak menumpuk di tengah, atau target jika hanya milik target
    const nonTargetLink = linkedPhoneEdges.find((e) => e.source !== targetId);
    const hubId = nonTargetLink?.source || linkedPhoneEdges[0]?.source || targetId || 'ORPHAN';
    if (!childrenByHub.has(hubId)) childrenByHub.set(hubId, []);
    childrenByHub.get(hubId)!.push(sec);
  });

  const fanStepRadius = compact ? 150 : 215;
  const fanSpreadAngle = compact ? 0.24 : 0.32;

  childrenByHub.forEach((children, hubId) => {
    if (hubId === targetId || hubId === 'ORPHAN') {
      // Anak langsung milik target diletakkan di busur atas-bawah yang bebas
      const r = compact ? 175 : 235;
      children.forEach((child, idx) => {
        const isImei = child.type === 'IMEI';
        const baseAngle = isImei ? -Math.PI * 0.72 : Math.PI * 0.28;
        const angle = baseAngle + idx * (compact ? 0.34 : 0.44);
        positions[child.id] = {
          x: Math.round(centerX + Math.cos(angle) * r),
          y: Math.round(centerY + Math.sin(angle) * r),
        };
      });
      return;
    }

    const baseAngle = phoneAngles.get(hubId) ?? 0;
    const hubPos = positions[hubId] || { x: centerX, y: centerY };
    const total = children.length;

    children.forEach((child, idx) => {
      const offsetIndex = idx - (total - 1) / 2;
      const angle = baseAngle + offsetIndex * fanSpreadAngle;
      const ring = fanStepRadius + (idx % 2) * (compact ? 70 : 105);
      positions[child.id] = {
        x: Math.round(hubPos.x + Math.cos(angle) * ring),
        y: Math.round(hubPos.y + Math.sin(angle) * ring),
      };
    });
  });

  return positions;
}

function computeHierarchyPositions(analysis: CdrAnalysisResult): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const centerX = 760;
  const colGap = 255;
  const rowGap = 200;

  const targetNodes = analysis.nodes.filter((n) => n.isTarget);
  const contactPhones = analysis.nodes
    .filter((n) => n.type === 'PHONE' && !n.isTarget)
    .sort((a, b) => b.count - a.count);
  const imeiNodes = analysis.nodes
    .filter((n) => n.type === 'IMEI')
    .sort((a, b) => b.count - a.count);
  const lacNodes = analysis.nodes
    .filter((n) => n.type === 'LAC_CID')
    .sort((a, b) => b.count - a.count);

  const placeRow = (nodes: GraphNode[], y: number) => {
    const totalWidth = (nodes.length - 1) * colGap;
    const startX = centerX - totalWidth / 2;
    nodes.forEach((n, idx) => {
      positions[n.id] = {
        x: Math.round(startX + idx * colGap),
        y: Math.round(y),
      };
    });
  };

  placeRow(targetNodes, 120);
  placeRow(contactPhones, 120 + rowGap);
  placeRow(imeiNodes, 120 + rowGap * 2);
  placeRow(lacNodes, 120 + rowGap * 3);

  return positions;
}

function computeOrganizationPositions(analysis: CdrAnalysisResult): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const centerX = 820;
  const topY = 120;

  const targetNode = analysis.nodes.find((n) => n.isTarget);
  if (targetNode) {
    positions[targetNode.id] = { x: centerX, y: topY };
  }

  // Klasifikasikan kontak ke cabang Menghubungi (kiri) vs Dihubungi (kanan)
  const outgoingIds = new Set<string>();
  const incomingIds = new Set<string>();
  analysis.edges.forEach((e) => {
    if (e.relation === 'TARGET_MENGHUBUNGI') outgoingIds.add(e.target);
    if (e.relation === 'TARGET_DIHUBUNGI') incomingIds.add(e.source);
  });

  const nonTargetPhones = analysis.nodes
    .filter((n) => n.type === 'PHONE' && !n.isTarget)
    .sort((a, b) => b.count - a.count);

  const leftBranch: GraphNode[] = [];
  const rightBranch: GraphNode[] = [];

  nonTargetPhones.forEach((p, idx) => {
    if (outgoingIds.has(p.id) && !incomingIds.has(p.id)) {
      leftBranch.push(p);
    } else if (incomingIds.has(p.id) && !outgoingIds.has(p.id)) {
      rightBranch.push(p);
    } else if (idx % 2 === 0) {
      leftBranch.push(p);
    } else {
      rightBranch.push(p);
    }
  });

  const colSpacing = 270;
  const rowSpacing = 145;

  // Petakan anak IMEI & LAC milik setiap nomor (dengan assignment unik agar tidak bertumpuk)
  const assignedSecondary = new Set<string>();
  const getChildrenForPhone = (phoneId: string): GraphNode[] => {
    const linked = analysis.edges
      .filter((e) => e.source === phoneId && (e.relation === 'USES_IMEI' || e.relation === 'LOCATED_AT'))
      .map((e) => analysis.nodes.find((n) => n.id === e.target))
      .filter((n): n is GraphNode => Boolean(n && !assignedSecondary.has(n.id)));
    linked.forEach((n) => assignedSecondary.add(n.id));
    return linked;
  };

  // Cabang tengah: perangkat & lokasi langsung milik Target
  if (targetNode) {
    const targetChildren = getChildrenForPhone(targetNode.id);
    targetChildren.forEach((child, idx) => {
      positions[child.id] = {
        x: centerX,
        y: topY + 150 + idx * 125,
      };
    });
  }

  // Cabang Kiri (Menghubungi)
  leftBranch.forEach((phone, colIdx) => {
    const x = centerX - 300 - colIdx * colSpacing;
    const y = topY + 180;
    positions[phone.id] = { x, y };
    const children = getChildrenForPhone(phone.id);
    children.forEach((child, rowIdx) => {
      positions[child.id] = {
        x,
        y: y + (rowIdx + 1) * rowSpacing,
      };
    });
  });

  // Cabang Kanan (Dihubungi)
  rightBranch.forEach((phone, colIdx) => {
    const x = centerX + 300 + colIdx * colSpacing;
    const y = topY + 180;
    positions[phone.id] = { x, y };
    const children = getChildrenForPhone(phone.id);
    children.forEach((child, rowIdx) => {
      positions[child.id] = {
        x,
        y: y + (rowIdx + 1) * rowSpacing,
      };
    });
  });

  // Sisa node sekunder yang belum terpasang
  const remaining = analysis.nodes.filter((n) => !positions[n.id]);
  remaining.forEach((node, idx) => {
    positions[node.id] = {
      x: centerX - 260 + (idx % 4) * 260,
      y: topY + 560 + Math.floor(idx / 4) * 140,
    };
  });

  return positions;
}

function computeGroupedPositions(analysis: CdrAnalysisResult): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};

  const phones = analysis.nodes
    .filter((n) => n.type === 'PHONE')
    .sort((a, b) => {
      if (a.isTarget) return -1;
      if (b.isTarget) return 1;
      return b.count - a.count;
    });
  const imeis = analysis.nodes.filter((n) => n.type === 'IMEI').sort((a, b) => b.count - a.count);
  const lacs = analysis.nodes.filter((n) => n.type === 'LAC_CID').sort((a, b) => b.count - a.count);

  const placeGrid = (
    nodes: GraphNode[],
    originX: number,
    originY: number,
    cols: number,
    cellW: number,
    cellH: number
  ) => {
    nodes.forEach((n, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      positions[n.id] = {
        x: originX + col * cellW,
        y: originY + row * cellH,
      };
    });
  };

  const phoneCols = Math.max(2, Math.ceil(Math.sqrt(phones.length)));
  placeGrid(phones, 160, 150, phoneCols, 255, 130);

  const imeiOriginX = 160 + phoneCols * 255 + 140;
  const imeiCols = Math.max(2, Math.ceil(Math.sqrt(imeis.length)));
  placeGrid(imeis, imeiOriginX, 150, imeiCols, 255, 130);

  const phoneRows = Math.max(1, Math.ceil(phones.length / phoneCols));
  const imeiRows = Math.max(1, Math.ceil(imeis.length / imeiCols));
  const lacOriginY = 150 + Math.max(phoneRows, imeiRows) * 130 + 130;
  const lacCols = Math.max(3, Math.ceil(lacs.length / 2));
  placeGrid(lacs, 160, lacOriginY, lacCols, 260, 145);

  return positions;
}

function computeTimelinePositions(analysis: CdrAnalysisResult): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};

  // Catat indeks kronologis kemunculan pertama setiap entity dari analysis.records (yang sudah terurut DATE & TIME)
  const firstSeenIndex = new Map<string, number>();
  const registerSeen = (id: string, idx: number) => {
    if (!firstSeenIndex.has(id)) {
      firstSeenIndex.set(id, idx);
    }
  };

  analysis.records.forEach((rec, idx) => {
    if (rec.aNumber) registerSeen(`PHONE:${rec.aNumber}`, idx);
    if (rec.bNumber) registerSeen(`PHONE:${rec.bNumber}`, idx);
    if (rec.aImei) registerSeen(`IMEI:${rec.aImei}`, idx);
    if (rec.bImei) registerSeen(`IMEI:${rec.bImei}`, idx);
    if (rec.aLacCid) registerSeen(`LAC:${rec.aLacCid}`, idx);
    if (rec.bLacCid) registerSeen(`LAC:${rec.bLacCid}`, idx);
  });

  const sortByTimeline = (nodes: GraphNode[]) =>
    [...nodes].sort(
      (a, b) => (firstSeenIndex.get(a.id) ?? 99999) - (firstSeenIndex.get(b.id) ?? 99999)
    );

  const targetNode = analysis.nodes.find((n) => n.isTarget);
  const phones = sortByTimeline(analysis.nodes.filter((n) => n.type === 'PHONE' && !n.isTarget));
  const imeis = sortByTimeline(analysis.nodes.filter((n) => n.type === 'IMEI'));
  const lacs = sortByTimeline(analysis.nodes.filter((n) => n.type === 'LAC_CID'));

  const startX = 220;
  const stepX = 265;

  if (targetNode) {
    positions[targetNode.id] = { x: startX, y: 140 };
  }

  phones.forEach((n, idx) => {
    positions[n.id] = {
      x: startX + idx * stepX,
      y: 310,
    };
  });

  imeis.forEach((n, idx) => {
    positions[n.id] = {
      x: startX + idx * stepX,
      y: 480,
    };
  });

  lacs.forEach((n, idx) => {
    positions[n.id] = {
      x: startX + idx * stepX,
      y: 660,
    };
  });

  return positions;
}

export function computeArrangeLayout(
  mode: ArrangeMode,
  analysis: CdrAnalysisResult
): Record<string, { x: number; y: number }> {
  switch (mode) {
    case 'PEACOCK':
      return computePeacockPositions(analysis, false);
    case 'COMPACT_PEACOCK':
      return computePeacockPositions(analysis, true);
    case 'HIERARCHY':
      return computeHierarchyPositions(analysis);
    case 'ORGANIZATION':
      return computeOrganizationPositions(analysis);
    case 'GROUPED':
      return computeGroupedPositions(analysis);
    case 'TIMELINE':
      return computeTimelinePositions(analysis);
    default:
      return computePeacockPositions(analysis, false);
  }
}
