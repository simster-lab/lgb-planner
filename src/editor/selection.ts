import { degToRad, normalizeDeg } from "../model/geometry";
import { newPieceId, type LayoutPiece, type Vec2 } from "../model/types";
import { pieceBounds } from "./render";

export function selectionCenter(pieces: LayoutPiece[]): Vec2 {
  if (pieces.length === 0) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const piece of pieces) {
    const bounds = pieceBounds(piece);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export function rotatePieces(pieces: LayoutPiece[], degrees: number, origin?: Vec2): LayoutPiece[] {
  if (pieces.length === 0 || degrees === 0) return pieces;
  const center = origin ?? selectionCenter(pieces);
  const rad = degToRad(degrees);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return pieces.map((piece) => {
    const dx = piece.x - center.x;
    const dy = piece.y - center.y;
    return {
      ...piece,
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
      rotationDeg: normalizeDeg(piece.rotationDeg + degrees),
    };
  });
}

export function snapshotPieces(pieces: LayoutPiece[]): LayoutPiece[] {
  return pieces.map((piece) => ({
    ...piece,
    mqtt: piece.mqtt ? { ...piece.mqtt } : undefined,
  }));
}

export function clonePieces(
  pieces: LayoutPiece[],
  offset: Vec2 = { x: 0, y: 0 },
): LayoutPiece[] {
  const idMap = new Map<string, string>();
  const copies = snapshotPieces(pieces).map((piece) => {
    const id = newPieceId();
    idMap.set(piece.id, id);
    return {
      ...piece,
      id,
      x: piece.x + offset.x,
      y: piece.y + offset.y,
    };
  });
  return copies.map((piece) => {
    if (piece.type !== "rfid" || !piece.hostPieceId) return piece;
    const remapped = idMap.get(piece.hostPieceId);
    if (remapped) return { ...piece, hostPieceId: remapped };
    return { ...piece, hostPieceId: undefined };
  });
}

export function piecesRelativeToCenter(pieces: LayoutPiece[]): LayoutPiece[] {
  const copies = clonePieces(pieces);
  const center = selectionCenter(copies);
  return copies.map((piece) => ({
    ...piece,
    x: piece.x - center.x,
    y: piece.y - center.y,
  }));
}

export function piecesAt(pieces: LayoutPiece[], origin: Vec2): LayoutPiece[] {
  return pieces.map((piece) => ({
    ...piece,
    x: piece.x + origin.x,
    y: piece.y + origin.y,
  }));
}
