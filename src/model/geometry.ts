import { localPorts } from "../catalog/lgb";
import type { LayoutPiece, LocalPort, Vec2, WorldPort } from "./types";

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function angleDiff(a: number, b: number): number {
  const delta = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return Math.min(delta, 360 - delta);
}

export function headingsOpposite(a: number, b: number, tolerance = 14): boolean {
  return angleDiff(a, b + 180) <= tolerance;
}

export function rotateLocal(x: number, y: number, rotationDeg: number): Vec2 {
  const r = degToRad(rotationDeg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function localToWorld(piece: Pick<LayoutPiece, "x" | "y" | "rotationDeg">, p: Vec2): Vec2 {
  const rotated = rotateLocal(p.x, p.y, piece.rotationDeg);
  return { x: piece.x + rotated.x, y: piece.y + rotated.y };
}

export function worldToLocal(piece: Pick<LayoutPiece, "x" | "y" | "rotationDeg">, p: Vec2): Vec2 {
  const dx = p.x - piece.x;
  const dy = p.y - piece.y;
  const r = degToRad(-piece.rotationDeg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

export function worldPorts(piece: LayoutPiece): WorldPort[] {
  return localPorts(piece).map((port) => {
    const pos = localToWorld(piece, port);
    return {
      pieceId: piece.id,
      portId: port.portId,
      x: pos.x,
      y: pos.y,
      heading: normalizeDeg(port.heading + piece.rotationDeg),
    };
  });
}

export function allWorldPorts(pieces: LayoutPiece[]): WorldPort[] {
  return pieces.flatMap(worldPorts);
}

export function poseFromPort(
  attach: LocalPort,
  worldX: number,
  worldY: number,
  worldHeading: number,
): { x: number; y: number; rotationDeg: number } {
  const rotationDeg = normalizeDeg(worldHeading + 180 - attach.heading);
  const rotated = rotateLocal(attach.x, attach.y, rotationDeg);
  return {
    x: worldX - rotated.x,
    y: worldY - rotated.y,
    rotationDeg,
  };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
