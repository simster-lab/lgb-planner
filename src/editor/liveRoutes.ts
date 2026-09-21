import type { LayoutPiece, PortId, Vec2 } from "../model/types";
import { recomputeConnections } from "./snap";
import { piecePaths, worldPath } from "./render";

export const SECTION_COLOURS = ["#7dffb0", "#7ec8ff", "#ff7a9a", "#c4a0ff"] as const;

export interface LiveSection {
  colour: string;
  paths: Vec2[][];
}

function portKey(pieceId: string, portId: PortId): string {
  return `${pieceId}:${portId}`;
}

function parsePortKey(key: string): { pieceId: string; portId: PortId } {
  const split = key.lastIndexOf(":");
  return { pieceId: key.slice(0, split), portId: key.slice(split + 1) as PortId };
}

function livePortIds(piece: LayoutPiece): PortId[] {
  if (piece.type === "signal") return [];
  if (piece.type === "point") {
    const live = piece.pointState === "diverge" ? "diverge" : "through";
    return ["a", live];
  }
  return ["a", "b"];
}

function addUndirected(adj: Map<string, string[]>, a: string, b: string): void {
  const from = adj.get(a) ?? [];
  const to = adj.get(b) ?? [];
  from.push(b);
  to.push(a);
  adj.set(a, from);
  adj.set(b, to);
}

export function liveSections(pieces: LayoutPiece[]): LiveSection[] {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  const adj = new Map<string, string[]>();

  for (const piece of pieces) {
    const live = livePortIds(piece);
    for (const portId of live) {
      const key = portKey(piece.id, portId);
      if (!adj.has(key)) adj.set(key, []);
    }
    if (piece.type === "point" && live.length === 2) {
      addUndirected(adj, portKey(piece.id, live[0]), portKey(piece.id, live[1]));
    } else if ((piece.type === "straight" || piece.type === "curve") && live.length === 2) {
      addUndirected(adj, portKey(piece.id, "a"), portKey(piece.id, "b"));
    }
  }

  for (const conn of recomputeConnections(pieces)) {
    const pieceA = byId.get(conn.a.pieceId);
    const pieceB = byId.get(conn.b.pieceId);
    if (!pieceA || !pieceB) continue;
    if (!livePortIds(pieceA).includes(conn.a.portId)) continue;
    if (!livePortIds(pieceB).includes(conn.b.portId)) continue;
    addUndirected(adj, portKey(conn.a.pieceId, conn.a.portId), portKey(conn.b.pieceId, conn.b.portId));
  }

  const seen = new Set<string>();
  const sections: LiveSection[] = [];
  const keys = [...adj.keys()];

  for (const start of keys) {
    if (seen.has(start)) continue;
    const stack = [start];
    const component = new Set<string>();
    seen.add(start);
    while (stack.length) {
      const key = stack.pop();
      if (!key) break;
      component.add(key);
      for (const next of adj.get(key) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }

    const portsByPiece = new Map<string, Set<PortId>>();
    for (const key of component) {
      const { pieceId, portId } = parsePortKey(key);
      const set = portsByPiece.get(pieceId) ?? new Set<PortId>();
      set.add(portId);
      portsByPiece.set(pieceId, set);
    }

    const paths: Vec2[][] = [];
    for (const [pieceId, ports] of portsByPiece) {
      const piece = byId.get(pieceId);
      if (!piece || piece.type === "signal") continue;
      const locals = piecePaths(piece);
      if (piece.type === "point") {
        if (ports.has("through") && locals[0]) paths.push(worldPath(piece, locals[0]));
        if (ports.has("diverge") && locals[1]) paths.push(worldPath(piece, locals[1]));
      } else if (locals[0]) {
        paths.push(worldPath(piece, locals[0]));
      }
    }
    if (paths.length === 0) continue;
    sections.push({
      colour: SECTION_COLOURS[sections.length % SECTION_COLOURS.length],
      paths,
    });
  }

  return sections;
}
