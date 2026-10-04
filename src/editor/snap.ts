import {
  HEADING_TOLERANCE_DEG,
  SIGNAL_OFFSET_MM,
  SIGNAL_SNAP_MM,
  SNAP_CONNECT_MM,
  SNAP_PLACE_MM,
  localPorts,
} from "../catalog/lgb";
import {
  allWorldPorts,
  angleDiff,
  distance,
  headingsOpposite,
  poseFromPort,
  radToDeg,
  rotateLocal,
} from "../model/geometry";
import type { LayoutPiece, LocalPort, Placing, PortId, WorldPort } from "../model/types";
import { isTrackPiece } from "../model/types";
import { createPlacedPiece } from "./pieceFactory";
import { piecePaths, worldPath } from "./render";

export interface Connection {
  a: WorldPort;
  b: WorldPort;
}

export function recomputeConnections(pieces: LayoutPiece[]): Connection[] {
  const ports = allWorldPorts(pieces);
  const used = new Set<string>();
  const connections: Connection[] = [];

  const key = (port: WorldPort) => `${port.pieceId}:${port.portId}`;

  for (let i = 0; i < ports.length; i += 1) {
    const a = ports[i];
    if (used.has(key(a))) continue;
    let best: WorldPort | undefined;
    let bestDist = SNAP_CONNECT_MM;
    for (let j = i + 1; j < ports.length; j += 1) {
      const b = ports[j];
      if (a.pieceId === b.pieceId || used.has(key(b))) continue;
      const dist = distance(a, b);
      if (dist <= bestDist && headingsOpposite(a.heading, b.heading, HEADING_TOLERANCE_DEG)) {
        best = b;
        bestDist = dist;
      }
    }
    if (best) {
      used.add(key(a));
      used.add(key(best));
      connections.push({ a, b: best });
    }
  }
  return connections;
}

export function freePorts(pieces: LayoutPiece[], ignorePieceId?: string): WorldPort[] {
  const relevant = ignorePieceId
    ? pieces.filter((piece) => piece.id !== ignorePieceId)
    : pieces;
  const connections = recomputeConnections(relevant);
  const used = new Set<string>();
  for (const conn of connections) {
    used.add(`${conn.a.pieceId}:${conn.a.portId}`);
    used.add(`${conn.b.pieceId}:${conn.b.portId}`);
  }
  return allWorldPorts(relevant).filter(
    (port) => !used.has(`${port.pieceId}:${port.portId}`),
  );
}

export function nearestFreePort(
  pieces: LayoutPiece[],
  worldX: number,
  worldY: number,
  maxDist = SNAP_PLACE_MM,
  ignorePieceId?: string,
): WorldPort | undefined {
  let best: WorldPort | undefined;
  let bestDist = maxDist;
  for (const port of freePorts(pieces, ignorePieceId)) {
    const dist = distance(port, { x: worldX, y: worldY });
    if (dist < bestDist) {
      best = port;
      bestDist = dist;
    }
  }
  return best;
}

export function placingAttachPorts(placing: Placing): LocalPort[] {
  if (placing.type === "signal" || placing.type === "rfid") return [];
  const draft = createPlacedPiece(placing, 0, 0, 0, { preview: true });
  return localPorts(draft);
}

export function attachPortFor(placing: Placing): LocalPort | undefined {
  const ports = placingAttachPorts(placing);
  if (ports.length === 0) return undefined;
  const cycle = placing.snapCycle ?? 0;
  return ports[(((cycle % ports.length) + ports.length) % ports.length)];
}

export function cyclePlacingSnap(placing: Placing, delta: number): Placing {
  const ports = placingAttachPorts(placing);
  if (ports.length <= 1) return placing;
  const cycle = placing.snapCycle ?? 0;
  const next = (((cycle + delta) % ports.length) + ports.length) % ports.length;
  return { ...placing, snapCycle: next };
}

export function attachPortId(placing: Placing): PortId | undefined {
  return attachPortFor(placing)?.portId;
}

export function attachPose(
  attachPort: LocalPort,
  target: WorldPort,
): { x: number; y: number; rotationDeg: number } {
  return poseFromPort(attachPort, target.x, target.y, target.heading);
}

function startPortFor(placing: Placing): LocalPort {
  const draft = createPlacedPiece(placing, 0, 0, 0, { preview: true });
  const ports = localPorts(draft);
  const start = ports.find((port) => port.portId === "a");
  if (!start) throw new Error("Piece is missing a start port");
  return start;
}

export interface TrackHit {
  x: number;
  y: number;
  heading: number;
  dist: number;
  pieceId: string;
  alongMm: number;
  pathIndex: number;
}

export function nearestTrackPoint(
  pieces: LayoutPiece[],
  worldX: number,
  worldY: number,
  maxDist = SIGNAL_SNAP_MM,
  ignorePieceId?: string,
): TrackHit | undefined {
  let best: TrackHit | undefined;
  const cursor = { x: worldX, y: worldY };
  for (const piece of pieces) {
    if (piece.id === ignorePieceId || !isTrackPiece(piece)) continue;
    piecePaths(piece).forEach((local, pathIndex) => {
      const path = worldPath(piece, local);
      let along = 0;
      for (let i = 1; i < path.length; i += 1) {
        const a = path[i - 1];
        const b = path[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const seg = Math.hypot(dx, dy);
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((cursor.x - a.x) * dx + (cursor.y - a.y) * dy) / len2));
        const px = a.x + dx * t;
        const py = a.y + dy * t;
        const dist = Math.hypot(cursor.x - px, cursor.y - py);
        if (dist <= maxDist && (!best || dist < best.dist)) {
          best = {
            x: px,
            y: py,
            heading: radToDeg(Math.atan2(dy, dx)),
            dist,
            pieceId: piece.id,
            alongMm: along + t * seg,
            pathIndex,
          };
        }
        along += seg;
      }
    });
  }
  return best;
}

export function poseBesideTrack(
  worldX: number,
  worldY: number,
  pieces: LayoutPiece[],
  ignorePieceId?: string,
): { x: number; y: number; rotationDeg: number } | undefined {
  const hit = nearestTrackPoint(pieces, worldX, worldY, SIGNAL_SNAP_MM, ignorePieceId);
  if (!hit) return undefined;
  const tangent = (hit.heading * Math.PI) / 180;
  const perpX = -Math.sin(tangent);
  const perpY = Math.cos(tangent);
  // Prefer the side that is above the track (smaller Y); if that is a tie, use the right (larger X).
  const useOpposite = perpY > 0.001 || (Math.abs(perpY) <= 0.001 && perpX < 0);
  const side = useOpposite ? -1 : 1;
  return {
    x: hit.x + side * SIGNAL_OFFSET_MM * perpX,
    y: hit.y + side * SIGNAL_OFFSET_MM * perpY,
    rotationDeg: 0,
  };
}

function poseWithPortAt(
  attach: LocalPort,
  worldX: number,
  worldY: number,
  rotationDeg: number,
): { x: number; y: number; rotationDeg: number } {
  const rotated = rotateLocal(attach.x, attach.y, rotationDeg);
  return { x: worldX - rotated.x, y: worldY - rotated.y, rotationDeg };
}

export function ghostAt(
  placing: Placing,
  pieces: LayoutPiece[],
  worldX: number,
  worldY: number,
): LayoutPiece {
  if (placing.type === "rfid") {
    const hit = nearestTrackPoint(pieces, worldX, worldY);
    if (hit) {
      return {
        ...createPlacedPiece(placing, hit.x, hit.y, hit.heading, { preview: true }),
        hostPieceId: hit.pieceId,
        alongMm: hit.alongMm,
        hostPath: hit.pathIndex,
      };
    }
    return createPlacedPiece(placing, worldX, worldY, 0, { preview: true });
  }

  if (placing.type === "signal") {
    const pose = poseBesideTrack(worldX, worldY, pieces);
    if (pose) {
      return createPlacedPiece(placing, pose.x, pose.y, pose.rotationDeg, { preview: true });
    }
    return createPlacedPiece(placing, worldX, worldY, 0, { preview: true });
  }

  const attach = attachPortFor(placing) ?? startPortFor(placing);
  const target = nearestFreePort(pieces, worldX, worldY);
  if (target) {
    if (attach.portId === "a") {
      const fitted = tryFitStraight(placing, pieces, target);
      if (fitted) return fitted;
    }
    const pose = attachPose(attach, target);
    return createPlacedPiece(placing, pose.x, pose.y, pose.rotationDeg, {
      preview: true,
    });
  }
  const pose = poseWithPortAt(attach, worldX, worldY, placing.rotationDeg ?? 0);
  return createPlacedPiece(placing, pose.x, pose.y, pose.rotationDeg, { preview: true });
}

export function tryFitStraight(
  placing: Placing,
  pieces: LayoutPiece[],
  startTarget: WorldPort,
): LayoutPiece | undefined {
  if (placing.type !== "straight") return undefined;
  const others = freePorts(pieces).filter(
    (port) =>
      !(port.pieceId === startTarget.pieceId && port.portId === startTarget.portId),
  );

  let best: { port: WorldPort; length: number; heading: number } | undefined;
  for (const port of others) {
    const dx = port.x - startTarget.x;
    const dy = port.y - startTarget.y;
    const length = Math.hypot(dx, dy);
    if (length < 20 || length > 4000) continue;
    const heading = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (
      angleDiff(startTarget.heading, heading) <= HEADING_TOLERANCE_DEG &&
      headingsOpposite(port.heading, heading, HEADING_TOLERANCE_DEG)
    ) {
      if (!best || length < best.length) {
        best = { port, length, heading };
      }
    }
  }
  if (!best) return undefined;
  return createPlacedPiece(
    { ...placing, lengthMm: Math.round(best.length * 10) / 10 },
    startTarget.x,
    startTarget.y,
    best.heading,
    { preview: true },
  );
}

export function snapMovedPiece(piece: LayoutPiece, others: LayoutPiece[]): LayoutPiece {
  if (piece.type === "rfid") {
    const hit = nearestTrackPoint(others, piece.x, piece.y, SIGNAL_SNAP_MM, piece.id);
    if (!hit) return piece;
    return {
      ...piece,
      hostPieceId: hit.pieceId,
      alongMm: hit.alongMm,
      hostPath: hit.pathIndex,
      x: hit.x,
      y: hit.y,
      rotationDeg: hit.heading,
    };
  }
  if (piece.type === "signal") {
    const pose = poseBesideTrack(piece.x, piece.y, others, piece.id);
    return pose ? { ...piece, ...pose } : piece;
  }
  const movedPorts = allWorldPorts([piece]);
  let best:
    | { piecePort: WorldPort; target: WorldPort; dist: number }
    | undefined;

  for (const piecePort of movedPorts) {
    const target = nearestFreePort(others, piecePort.x, piecePort.y, SNAP_PLACE_MM);
    if (!target) continue;
    const dist = distance(piecePort, target);
    if (!best || dist < best.dist) {
      best = { piecePort, target, dist };
    }
  }
  if (!best) return piece;

  const local = localPorts(piece).find((port) => port.portId === best.piecePort.portId);
  if (!local) return piece;
  const pose = poseFromPort(local, best.target.x, best.target.y, best.target.heading);
  return { ...piece, ...pose };
}
