/**
 * Minimal Sankey layout for top-N journey paths.
 *
 * Avoids the ~120 KB `@nivo/sankey` dep (we'd eat the weight cost just to render
 * a handful of paths per site). The layout algorithm is intentionally narrow:
 *
 *   1. Collect unique (url, column) node keys — column = position in the path.
 *   2. Stack nodes vertically within each column, ordered by total flow desc.
 *   3. For each input path, emit one link per consecutive (A→B) pair, carrying
 *      the path's sessionCount as link width.
 *   4. Link height is proportional to sessionCount; node height is the sum of
 *      incoming + outgoing flows (normalized so nodes never overflow column
 *      height).
 *
 * Output is SVG-ready: nodes have { x, y, width, height, url, column }; links
 * have { sourceX, sourceY, targetX, targetY, width, sessionCount }.
 */
import type { JourneyPath } from '../../../../../packages/contracts/index';

export interface SankeyNode {
  id: string;            // `${column}::${url}`
  column: number;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  totalFlow: number;
}

export interface SankeyLink {
  sourceId: string;
  targetId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  width: number;
  sessionCount: number;
  color: string;
}

export interface SankeyLayout {
  nodes: SankeyNode[];
  links: SankeyLink[];
  width: number;
  height: number;
  columns: number;
  nodeWidth: number;
  columnGap: number;
}

export interface SankeyOptions {
  width?: number;
  height?: number;
  nodeWidth?: number;
  verticalPadding?: number;
}

// Deterministic accent colors for link bands — keyed by source column so
// reading left-to-right the rainbow gives visual rhythm.
const LINK_COLORS = [
  '#bfdbfe', // sky-200
  '#fde68a', // amber-200
  '#bbf7d0', // emerald-200
  '#fecaca', // rose-200
  '#ddd6fe', // violet-200
  '#fed7aa', // orange-200
  '#a5f3fc', // cyan-200
];

export const buildSankeyLayout = (
  paths: JourneyPath[],
  options: SankeyOptions = {},
): SankeyLayout => {
  const width = options.width ?? 880;
  const height = options.height ?? 420;
  const nodeWidth = options.nodeWidth ?? 14;
  const verticalPadding = options.verticalPadding ?? 6;

  if (paths.length === 0) {
    return { nodes: [], links: [], width, height, columns: 0, nodeWidth, columnGap: 0 };
  }

  // ── 1. Determine column count (max path depth) ─────────────────────────
  const columns = paths.reduce((max, p) => Math.max(max, p.steps.length), 0);
  if (columns === 0) {
    return { nodes: [], links: [], width, height, columns: 0, nodeWidth, columnGap: 0 };
  }
  const columnGap = columns > 1 ? (width - nodeWidth * columns) / (columns - 1) : 0;

  // ── 2. Tally node flow per (column, url) and link flow per pair ──────
  type NodeAccum = { column: number; url: string; inFlow: number; outFlow: number };
  type LinkAccum = { sourceId: string; targetId: string; sessionCount: number };

  const nodeMap = new Map<string, NodeAccum>();
  const linkMap = new Map<string, LinkAccum>();

  const idOf = (col: number, url: string) => `${col}::${url}`;

  for (const path of paths) {
    path.steps.forEach((step, col) => {
      const id = idOf(col, step.url);
      const n = nodeMap.get(id) ?? { column: col, url: step.url, inFlow: 0, outFlow: 0 };
      if (col > 0) n.inFlow += path.sessionCount;
      if (col < path.steps.length - 1) n.outFlow += path.sessionCount;
      nodeMap.set(id, n);
    });

    for (let i = 0; i < path.steps.length - 1; i++) {
      const sourceId = idOf(i, path.steps[i].url);
      const targetId = idOf(i + 1, path.steps[i + 1].url);
      const key = `${sourceId}=>${targetId}`;
      const existing = linkMap.get(key);
      if (existing) {
        existing.sessionCount += path.sessionCount;
      } else {
        linkMap.set(key, { sourceId, targetId, sessionCount: path.sessionCount });
      }
    }
  }

  // ── 3. Group nodes by column and compute vertical layout ───────────────
  const byColumn: NodeAccum[][] = Array.from({ length: columns }, () => []);
  for (const node of nodeMap.values()) {
    byColumn[node.column].push(node);
  }

  // Sort each column by total flow desc so the fattest bands ride the top.
  byColumn.forEach((col) => {
    col.sort((a, b) => (b.inFlow + b.outFlow) - (a.inFlow + a.outFlow));
  });

  // Reserve vertical space for inter-node padding.
  const availableColumnHeight = (col: NodeAccum[]) =>
    height - verticalPadding * Math.max(0, col.length - 1);

  const nodes: SankeyNode[] = [];
  const nodePositions = new Map<string, { top: number; height: number; x: number }>();

  byColumn.forEach((col, columnIdx) => {
    const x = columnIdx * (nodeWidth + columnGap);
    const totalFlow = col.reduce((sum, n) => sum + Math.max(n.inFlow, n.outFlow), 0);
    const scale = totalFlow > 0 ? availableColumnHeight(col) / totalFlow : 0;

    let cursor = 0;
    col.forEach((n) => {
      const flow = Math.max(n.inFlow, n.outFlow);
      const h = Math.max(6, flow * scale);
      const id = idOf(columnIdx, n.url);
      nodePositions.set(id, { top: cursor, height: h, x });
      nodes.push({
        id,
        column: columnIdx,
        url: n.url,
        x,
        y: cursor,
        width: nodeWidth,
        height: h,
        totalFlow: flow,
      });
      cursor += h + verticalPadding;
    });
  });

  // ── 4. Build links: track cumulative band offset inside each node so
  //     multiple incoming/outgoing links stack rather than overlap.
  const outOffset = new Map<string, number>();
  const inOffset = new Map<string, number>();

  const sortedLinks = [...linkMap.values()].sort((a, b) => b.sessionCount - a.sessionCount);

  const links: SankeyLink[] = [];
  for (const link of sortedLinks) {
    const src = nodePositions.get(link.sourceId);
    const tgt = nodePositions.get(link.targetId);
    if (!src || !tgt) continue;

    const srcColumn = nodes.find((n) => n.id === link.sourceId)?.column ?? 0;
    const totalOutSource = Math.max(
      1,
      [...linkMap.values()].filter((l) => l.sourceId === link.sourceId).reduce((s, l) => s + l.sessionCount, 0),
    );
    const totalInTarget = Math.max(
      1,
      [...linkMap.values()].filter((l) => l.targetId === link.targetId).reduce((s, l) => s + l.sessionCount, 0),
    );

    const sourceHeightRatio = src.height / totalOutSource;
    const targetHeightRatio = tgt.height / totalInTarget;
    const sourceBandHeight = link.sessionCount * sourceHeightRatio;
    const targetBandHeight = link.sessionCount * targetHeightRatio;

    const sourceOffset = outOffset.get(link.sourceId) ?? 0;
    const targetOffset = inOffset.get(link.targetId) ?? 0;

    const sourceY = src.top + sourceOffset + sourceBandHeight / 2;
    const targetY = tgt.top + targetOffset + targetBandHeight / 2;

    outOffset.set(link.sourceId, sourceOffset + sourceBandHeight);
    inOffset.set(link.targetId, targetOffset + targetBandHeight);

    links.push({
      sourceId: link.sourceId,
      targetId: link.targetId,
      sourceX: src.x + nodeWidth,
      sourceY,
      targetX: tgt.x,
      targetY,
      width: Math.max(1, Math.min(sourceBandHeight, targetBandHeight)),
      sessionCount: link.sessionCount,
      color: LINK_COLORS[srcColumn % LINK_COLORS.length],
    });
  }

  return { nodes, links, width, height, columns, nodeWidth, columnGap };
};

/**
 * Builds an SVG cubic Bézier path string for a Sankey link band.
 * Anchors on the midpoint between source and target columns for smooth S-curves.
 */
export const linkPath = (link: SankeyLink): string => {
  const midX = (link.sourceX + link.targetX) / 2;
  return `M ${link.sourceX},${link.sourceY} C ${midX},${link.sourceY} ${midX},${link.targetY} ${link.targetX},${link.targetY}`;
};
